import type { ResourceLog } from '../types';
import { BaseCollector } from './base';

// 已采集的资源缓存（避免重复上报）
const collectedResources = new Set<string>();
// 资源类型映射（performance 中的 type 转自定义类型）
const RESOURCE_TYPE_MAP: Record<string, ResourceLog['resourceType']> = {
    'script': 'script',
    'style': 'style',
    'image': 'image',
    'fetch': 'fetch',
    'xmlhttprequest': 'xhr',
    'link': 'style', // link 标签加载的 CSS
    'img': 'image'
};

export class ResourceCollector extends BaseCollector {
    // 资源采集间隔（3s，避免频繁读取 performance）
    private collectInterval = 3000;
    // 采集定时器
    private collectTimer: number | null = null;

    constructor(worker: Worker) {
        super(worker, 'resource');
    }

    /**
     * 初始化资源采集
     */
    protected initCollect(): void {
        this.bindResourceError(); // 监听资源加载错误
        this.startResourceCollectTimer(); // 定时采集资源性能
    }

    /**
     * 绑定资源加载错误事件
     */
    private bindResourceError(): void {
        window.addEventListener('error', (event) => {
            const target = event.target as HTMLElement;
            // 过滤 JS 错误，只处理资源错误
            if (target instanceof HTMLImageElement ||
                target instanceof HTMLScriptElement ||
                target instanceof HTMLLinkElement) {
                this.handleResourceError(target);
            }
        });
    }

    /**
     * 处理资源加载错误
     */
    private handleResourceError(element: HTMLElement): void {
        let url: string = '' ;
        // 类型断言：区分具体元素类型，安全获取 src/href
        if (element instanceof HTMLImageElement || element instanceof HTMLScriptElement) {
            url = element.src;
        } else if (element instanceof HTMLLinkElement) {
            url = element.href;
        }
        if (!url || collectedResources.has(url)) return;
        // 资源类型判断
        let resourceType: ResourceLog['resourceType'] = 'image';
        if (element instanceof HTMLScriptElement) resourceType = 'script';
        if (element instanceof HTMLLinkElement) resourceType = 'style';

        // 上报错误日志
        this.sendLog<ResourceLog>({
            resourceType,
            url: url as string,
            duration: 0,
            status: 404, // 默认404，实际可通过其他方式获取
            size: 0
        });

        collectedResources.add(url);
    }

    /**
     * 启动定时采集资源性能
     */
    private startResourceCollectTimer(): void {
        // 立即采集一次
        this.collectResourcePerformance();
        // 定时采集
        this.collectTimer = window.setInterval(this.collectResourcePerformance.bind(this), this.collectInterval);
    }

    /**
     * 采集资源性能数据（从 performance 中获取）
     */
    private collectResourcePerformance(): void {
        const performance = window.performance;
        const resourceEntries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];

        resourceEntries.forEach((entry: any) => {
            const url = entry.name as string;
            if (collectedResources.has(url)) return;

            // 过滤无效资源（如浏览器内置资源）
            if (url.startsWith('data:') || url.startsWith('blob:')) return;

            // 资源类型映射
            const entryType = entry.initiatorType || entry.resourceType;
            const resourceType = RESOURCE_TYPE_MAP[entryType] || 'image';

            // 计算加载耗时（responseEnd - startTime）
            const duration = Math.round(entry.responseEnd - entry.startTime);
            // 资源大小（decodedBodySize 优先，无则取 transferSize）
            const size = Math.round((entry.decodedBodySize || entry.transferSize) / 1024); // 转 KB

            // 上报资源性能日志
            this.sendLog<ResourceLog>({
                resourceType,
                url: url as string,
                duration,
                status: entry.responseStatus || 200,
                size
            });

            collectedResources.add(url);
        });

        // 页面卸载时清理定时器
        window.addEventListener('beforeunload', () => {
            if (this.collectTimer) clearInterval(this.collectTimer);
        });
    }

    /**
     * 获取日志类型
     */
    protected getLogType(): 'resource' {
        return 'resource';
    }

    /**
     * 销毁采集器
     */
    public destroy(): void {
        window.removeEventListener('error', () => {});
        if (this.collectTimer) clearInterval(this.collectTimer);
        collectedResources.clear();
        this.needCollect = false;
    }
}