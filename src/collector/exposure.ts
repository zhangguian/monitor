// 曝光配置
import {BaseCollector} from "./base";
import {DomUtils} from "../utils/dom";
import {ExposureLog} from "../types";

const EXPOSURE_CONFIG = {
    visiblePercent: 50, // 可见比例≥50%视为有效曝光
    minStayTime: 100, // 停留≥100ms视为有效曝光
    observerRootMargin: '0px' // 视口边缘扩展（默认无）
};


// 已监控的元素缓存（避免重复绑定）
const observedElements = new Map<string, {
    observer: IntersectionObserver;
    enterTime: number | null;
}>();


export class ExposureCollector extends BaseCollector {
    // 动态DOM 监听 （MutationObserver）
    private domObserver:MutationObserver | null = null;
    // 根元素（默认视口）
    private rootElement: Element | null = null;

    constructor(worker: Worker) {
        super(worker, 'exposure');
        this.rootElement = document.body; // 监听整个页面的 DOM 变化
    }

    /**
     * 初始化曝光采集
     */
    protected  initCollect() {
        this.initDomObserver() // 监听动态DOM新增
        this.observeExistingElements(); // 监听已存在的元素
    }



    /**
     * 初始化 MutationObserver：监听 DOM 新增
     */
    private initDomObserver():void {
        if (!window.MutationObserver) {
            console.warn('[曝光采集] 浏览器不支持 MutationObserver，无法监控动态 DOM');
            return;
        }

        this.domObserver = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                // 处理新增的元素节点
                mutation.addedNodes.forEach((node) => {
                    if (node instanceof HTMLElement) {
                        this.observeElement(node);
                    }
                });
            })
        });
        // 监听根元素的子节点变化（深度监听）
        this.domObserver.observe(this.rootElement!, {
            childList: true,
            subtree: true,
            attributes: false,
            characterData: false
        });
    }


    /**
     * 监听已存在的元素（页面初始化时的元素）
     */
    private observeExistingElements(): void {
        // 示例：监听所有带 data-monitor-exposure 属性的元素（业务方标记需要曝光监控的元素）
        const elements = document.querySelectorAll<HTMLElement>('[data-monitor-exposure]');
        elements.forEach((el) => this.observeElement(el));
    }

    /**
     * 给单个元素绑定曝光监听（IntersectionObserver）
     */
    private observeElement(el: HTMLElement): void {
        if (!window.IntersectionObserver) {
            console.warn('[曝光采集] 浏览器不支持 IntersectionObserver，无法监控曝光');
            return;
        }

        // 生成元素唯一标识（去重）
        const elementId = DomUtils.generateDomId(el);
        if (observedElements.has(elementId)) return;

        // 创建 IntersectionObserver 实例
        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                this.handleIntersection(entry, el, elementId);
            });
        }, {
            root: null, // 视口作为根元素
            rootMargin: EXPOSURE_CONFIG.observerRootMargin,
            threshold: EXPOSURE_CONFIG.visiblePercent / 100 // 可见比例阈值
        });

        // 开始监听元素
        observer.observe(el);
        observedElements.set(elementId, {
            observer,
            enterTime: null // 元素进入视口的时间
        });
    }

    /**
     * 处理元素曝光状态变化
     */
    private handleIntersection(
        entry: IntersectionObserverEntry,
        el: HTMLElement,
        elementId: string
    ): void {
        const cache = observedElements.get(elementId);
        if (!cache) return;

        // 元素进入视口：记录进入时间
        if (entry.isIntersecting) {
            cache.enterTime = Date.now();
        } else {
            // 元素离开视口：判断是否满足有效曝光条件
            if (cache.enterTime) {
                const stayTime = Date.now() - cache.enterTime;
                const visiblePercent = DomUtils.getElementVisiblePercent(el);

                if (stayTime >= EXPOSURE_CONFIG.minStayTime && visiblePercent >= EXPOSURE_CONFIG.visiblePercent) {
                    // 满足有效曝光条件，上报日志
                    this.sendExposureLog(el, visiblePercent, stayTime);
                }

                // 重置进入时间
                cache.enterTime = null;
            }
        }
    }

    /**
     * 发送曝光日志
     */
    private sendExposureLog(el: HTMLElement, visiblePercent: number, stayTime: number): void {
        const elementInfo = DomUtils.getElementInfo(el);
        this.sendLog<ExposureLog>({
            elementInfo,
            exposureTime: stayTime,
            visiblePercent
        });
    }

    /**
     * 获取日志类型
     */
    protected getLogType(): 'exposure' {
        return 'exposure';
    }

    /**
     * 销毁采集器
     */
    public destroy(): void {
        // 停止所有元素的曝光监听
        observedElements.forEach(({ observer }) => {
            observer.disconnect();
        });
        observedElements.clear();

        // 停止 DOM 变化监听
        if (this.domObserver) {
            this.domObserver.disconnect();
            this.domObserver = null;
        }

        this.needCollect = false;
    }
}