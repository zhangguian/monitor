import type { PerformanceLog } from '../types';
import { BaseCollector } from './base';


export interface NativeMetric {
    id: string;
    name: 'lcp' | 'cls' | 'inp' | 'fcp' | 'ttfb';
    value: number; // 指标值（单位：ms 或无单位，如 CLS）
    delta: number; // 指标变化值
    entries: PerformanceEntry[]; // 原始性能条目
    rating?: 'good' | 'needs-improvement' | 'poor'; // 可选：评级
}
// 阈值定义（与原逻辑保持一致）
export const LCPThresholds = { good: 2500, poor: 4000 };
export const CLSThresholds = { good: 0.1, poor: 0.25 };
export const INPThresholds = { good: 200, poor: 500 };
export const FCPThresholds = { good: 1800, poor: 3000 };
export const TTFBThresholds = { good: 200, poor: 600 };

// 传统性能指标映射
const PERFORMANCE_METRICS = [
    { name: 'fp', label: 'FP', description: '首次绘制' },
    { name: 'fcp', label: 'FCP', description: '首次内容绘制' },
    { name: 'ttfb', label: 'TTFB', description: '首字节时间' }
];

// SPA 路由状态缓存（模块内局部定义，避免依赖其他模块）
let spaRouteStart: number | null = null;
let currentRoute: string = window.location.pathname; // 初始路由
let originalPushState: typeof history.pushState | null = null; // 保存 history 原始方法
let originalReplaceState: typeof history.replaceState | null = null;
let performanceObservers: PerformanceObserver[] = []; // 用于销毁时清理
let inpListeners: (() => void)[] = []; // INP 事件监听的清理函数

export class PerformanceCollector extends BaseCollector {
    // 保存 hashchange 事件处理函数的引用（用于正确移除监听器）
    private hashChangeHandler: (event: HashChangeEvent) => void;

    constructor(worker: Worker) {
        super(worker, 'performance');
        // 保存 history 原始方法（避免重复重写）
        originalPushState = history.pushState;
        originalReplaceState = history.replaceState;
        // 监听 SPA 路由开始事件（业务方注入）
        this.bindSpaRouteStart();
        // 初始化 hashchange 事件处理函数引用
        this.hashChangeHandler = this.handleSpaRouteEnd.bind(this);
    }

    /**
     * 初始化性能采集
     */
    protected initCollect(): void {
        this.collectNativeVitals(); // 采集核心指标（适配最新 API）
        this.collectTraditionalMetrics(); // 采集传统性能指标
        this.collectSpaRoutePerformance(); // 采集 SPA 路由性能
    }

    /**
     * 原生实现 Web Vitals 指标采集
     */

    private collectNativeVitals(): void {
        // 1. LCP（最大内容绘制）
        const lcpObserver = new PerformanceObserver((list) => {
            const entries = list.getEntries() as LargestContentfulPaint[];
            entries.forEach((entry) => {
                this.handleNativeMetric({
                    id: entry.id,
                    name: 'lcp',
                    value: entry.renderTime || entry.loadTime,
                    delta: entry.renderTime || entry.loadTime,
                    entries: [entry],
                }, LCPThresholds);
            });
        });
        lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
        performanceObservers.push(lcpObserver);

        // 2. CLS（累积布局偏移）
        let clsValue = 0;
        let clsEntries: LayoutShift[] = [];
        const clsObserver = new PerformanceObserver((list) => {
            const entries = list.getEntries() as LayoutShift[];
            entries.forEach((entry) => {
                if (!entry.hadRecentInput) { // 排除用户输入后的布局偏移
                    clsValue += entry.value;
                    clsEntries.push(entry);
                }
            });
            this.handleNativeMetric({
                id: 'cls',
                name: 'cls',
                value: clsValue,
                delta: clsValue,
                entries: clsEntries,
            }, CLSThresholds);
        });
        clsObserver.observe({ type: 'layout-shift', buffered: true });
        performanceObservers.push(clsObserver);


        // 3. INP（交互下一步延迟）
        const observeINP = () => {
            let inpEntry: InteractionIdleness | null = null;
            const inpObserver = new PerformanceObserver((list) => {
                const entries = list.getEntries() as InteractionIdleness[];
                entries.forEach((entry) => {
                    if (entry.duration > (inpEntry?.duration || 0)) {
                        inpEntry = entry;
                    }
                });
            });
            inpObserver.observe({ type: 'interaction-idle', buffered: true });
            return () => {
                if (inpEntry) {
                    this.handleNativeMetric({
                        id: inpEntry?.id,
                        name: 'inp',
                        value: inpEntry?.duration,
                        delta: inpEntry?.duration,
                        entries: [inpEntry],
                    }, INPThresholds);
                }
                inpObserver.disconnect();
            };
        };
        // 监听用户交互事件，触发 INP 采集
        const events = ['click', 'keydown', 'tap', 'pointerdown'];
        events.forEach((eventType) => {
            const listener = () => {
                const cleanup = observeINP();
                inpListeners.push(cleanup);
            };
            window.addEventListener(eventType, listener, true);
        });
        // 4. FCP（首次内容绘制）
        const fcpObserver = new PerformanceObserver((list) => {
            const entries = list.getEntries() as FirstContentfulPaint[];
            entries.forEach((entry) => {
                this.handleNativeMetric({
                    id: entry.id,
                    name: 'fcp',
                    value: entry.startTime,
                    delta: entry.startTime,
                    entries: [entry],
                }, FCPThresholds);
            });
        });
        fcpObserver.observe({ type: 'first-contentful-paint', buffered: true });
        performanceObservers.push(fcpObserver);

        // 5. TTFB（首字节时间）
        const ttfbEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
        if (ttfbEntry) {
            this.handleNativeMetric({
                id: 'ttfb',
                name: 'ttfb',
                value: ttfbEntry.responseStart - ttfbEntry.requestStart,
                delta: ttfbEntry.responseStart - ttfbEntry.requestStart,
                entries: [ttfbEntry],
            }, TTFBThresholds);
        }
    }

    /**
     * 处理原生指标（适配原逻辑）
     */

    /**
     * 处理原生指标（适配原逻辑）
     */
    private handleNativeMetric(
        metric: NativeMetric,
        thresholds: { good: number; poor: number }
    ): void {
        if (metric.value === undefined || metric.value === null) {
            console.warn(`[Native Vitals] 指标 ${metric.name} 无有效数据`);
            return;
        }

        let rating: 'good' | 'needs-improvement' | 'poor' = 'good';
        if (metric.name === 'cls') {
            // CLS 是无单位数值，单独判断
            if (metric.value > thresholds.poor) rating = 'poor';
            else if (metric.value > thresholds.good) rating = 'needs-improvement';
        } else {
            // 其他指标（单位：ms）
            if (metric.value > thresholds.poor) rating = 'poor';
            else if (metric.value > thresholds.good) rating = 'needs-improvement';
        }

        this.sendLog<PerformanceLog>({
            performanceType: metric.name,
            value: Math.round(metric.value),
            detail: {
                rating,
                delta: Math.round(metric.delta),
                id: metric.id,
                entries: metric.entries.map((entry) => ({
                    type: entry.entryType,
                    startTime: Math.round(entry.startTime),
                    duration: entry.duration ? Math.round(entry.duration) : undefined,
                })),
            },
        });
    }

    /**
     * 采集传统性能指标（FP、FCP、TTFB）
     * 兼容不支持 Web Vitals 的场景，补充更全面的性能数据
     */
    private collectTraditionalMetrics(): void {
        // 等待页面加载完成后采集（避免指标未生成）
        const collect = () => {
            const performance = window.performance;
            const timing = performance.timing;
            const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;

            // 1. TTFB：首字节时间（请求发出到接收首字节的时间）
            const ttfb = navigation
                ? navigation.responseStart - navigation.requestStart
                : timing.responseStart - timing.requestStart;

            // 2. FP/FCP：通过 performance.getEntriesByType('paint') 获取
            const paintEntries = performance.getEntriesByType('paint') as PerformancePaintTiming[];
            const fp = paintEntries.find((entry) => entry.name === 'first-paint')?.startTime || 0;
            const fcp = paintEntries.find((entry) => entry.name === 'first-contentful-paint')?.startTime || 0;

            // 上报传统指标（仅上报有效数据）
            [
                { type: 'fp' as const, value: Math.round(fp) },
                { type: 'fcp' as const, value: Math.round(fcp) },
                { type: 'ttfb' as const, value: Math.round(ttfb) }
            ].forEach(({ type, value }) => {
                if (value > 0) {
                    this.sendLog<PerformanceLog>({
                        performanceType: type,
                        value,
                        detail: {
                            description: PERFORMANCE_METRICS.find(m => m.name === type)?.description,
                            rating: this.getTraditionalMetricRating(type, value) // 传统指标评级
                        }
                    });
                }
            });
        };

        if (document.readyState === 'complete') {
            collect();
        } else {
            window.addEventListener('load', collect);
        }
    }

    /**
     * 传统性能指标评级（参考行业标准）
     * @param type 指标类型
     * @param value 指标值（ms）
     * @returns 评级结果
     */
    private getTraditionalMetricRating(
        type: 'fp' | 'fcp' | 'ttfb',
        value: number
    ): 'good' | 'needs-improvement' | 'poor' {
        switch (type) {
            case 'ttfb':
                return value < 200 ? 'good' : value < 600 ? 'needs-improvement' : 'poor';
            case 'fp':
            case 'fcp':
                return value < 1800 ? 'good' : value < 3000 ? 'needs-improvement' : 'poor';
            default:
                return 'good';
        }
    }

    /**
     * 绑定 SPA 路由开始事件（业务方通过 window 注入）
     * 用于标记路由切换的开始时间，计算切换耗时
     */
    private bindSpaRouteStart(): void {
        (window as any).monitorSpaRouteStart = () => {
            spaRouteStart = Date.now();
        };
    }

    /**
     * 采集 SPA 路由切换性能（适配 Vue Router/React Router）
     */
    private collectSpaRoutePerformance(): void {
        // 监听 hash 路由变化（# 形式路由）
        window.addEventListener('hashchange', this.hashChangeHandler);
        // 重写 history 方法，监听 pushState/replaceState（/path 形式路由）
        this.overrideHistoryMethods();

        // 框架路由结束事件（业务方注入，精准获取路由切换时机）
        (window as any).monitorSpaRouteEnd = (to: string, from?: string) => {
            this.handleSpaRouteEndHistory(from || currentRoute, to);
        };
    }

    /**
     * 重写 history 方法，监听路由变化（无框架时的降级方案）
     */
    private overrideHistoryMethods(): void {
        if (!originalPushState || !originalReplaceState) return;

        // 重写 pushState
        history.pushState = (...args) => {
            const prevRoute = currentRoute;
            originalPushState?.apply(history, args);
            const newRoute = window.location.pathname;
            this.handleSpaRouteEndHistory(prevRoute, newRoute);
        };

        // 重写 replaceState
        history.replaceState = (...args) => {
            const prevRoute = currentRoute;
            originalReplaceState?.apply(history, args);
            const newRoute = window.location.pathname;
            this.handleSpaRouteEndHistory(prevRoute, newRoute);
        };
    }

    /**
     * 处理 SPA 路由结束，计算切换耗时
     * @param from 来源路由
     * @param to 目标路由
     */
    private handleSpaRouteEnd(event: HashChangeEvent): void {
        const from = currentRoute;
        const to = window.location.pathname;
        if (!spaRouteStart || from === to) return; // 无开始时间或路由未变化，跳过

        const routeDuration = Date.now() - spaRouteStart;
        this.sendLog<PerformanceLog>({
            performanceType: 'spaRoute',
            value: Math.round(routeDuration), // 路由切换耗时（ms）
            detail: {
                routeFrom: from,
                routeTo: to
            }
        });

        // 更新路由状态
        currentRoute = to;
        spaRouteStart = null;
    }

    /**
     * 处理 history 路由变化（手动传入路由参数）
     */
    private handleSpaRouteEndHistory(from: string, to: string): void {
        if (!spaRouteStart || from === to) return;

        const routeDuration = Date.now() - spaRouteStart;
        this.sendLog<PerformanceLog>({
            performanceType: 'spaRoute',
            value: Math.round(routeDuration),
            detail: {
                routeFrom: from,
                routeTo: to
            }
        });

        currentRoute = to;
        spaRouteStart = null;
    }

    /**
     * 获取日志类型（实现基类抽象方法）
     */
    protected getLogType(): 'performance' {
        return 'performance';
    }

    /**
     * 销毁采集器（清理事件监听、恢复原始方法）
     */
    public destroy(): void {

        // 清理 PerformanceObserver
        performanceObservers.forEach((observer) => observer.disconnect());
        performanceObservers = [];
        // 清理 INP 事件监听
        inpListeners.forEach((cleanup) => cleanup());
        inpListeners = [];

        // 2. 清理传统指标采集的 load 事件监听
        window.removeEventListener('load', this.collectTraditionalMetrics);

        // 3. 清理路由相关监听
        window.removeEventListener('hashchange', this.hashChangeHandler);

        // 4. 恢复 history 原始方法
        if (originalPushState) history.pushState = originalPushState;
        if (originalReplaceState) history.replaceState = originalReplaceState;

        // 5. 标记采集器已销毁
        this.needCollect = false;
    }
}


// 补充原生性能条目类型定义（可放在单独的类型文件中）
interface LargestContentfulPaint extends PerformanceEntry {
    renderTime: number;
    loadTime: number;
    id: string;
    size: number;
    element?: Element;
}

interface LayoutShift extends PerformanceEntry {
    value: number;
    hadRecentInput: boolean;
    sources: {
        node: Element | null;
        previousRect: DOMRectReadOnly;
        currentRect: DOMRectReadOnly;
    }[];
}

interface InteractionIdleness extends PerformanceEntry {
    id: string;
    duration: number;
    interactionId: number;
}

interface FirstContentfulPaint extends PerformanceEntry {
    startTime: number;
    id: string;
}