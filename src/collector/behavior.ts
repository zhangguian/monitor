// 防抖函数
import {BaseCollector} from "./base";
import {DomUtils} from "../utils/dom";
import {BehaviorLog} from "../types";

const debounce = (fn: Function, delay: number) => {
    let timer: number | null = null;
    return (...args: any[]) => {
        if (timer) clearTimeout(timer);
        timer = window.setTimeout(() => fn(...args), delay);
    };
};
// 路由状态缓存
let currentRoute = window.location.pathname;
let routeEnterTime = Date.now();

export class BehaviorCollector extends BaseCollector {
    // 滚动防抖延迟（200ms）
    private scrollDebounceDelay = 200;
    // 滚动防抖函数
    private debouncedHandleScroll = debounce(this.handleScroll.bind(this), this.scrollDebounceDelay);

    // 保存 hashchange 事件处理函数的引用（用于正确移除监听器）
    private hashChangeHandler: (event: HashChangeEvent) => void;

    constructor(worker: Worker) {
        super(worker, 'behavior');
        this.hashChangeHandler = this.handleRouteChange.bind(this);
    }


    /**
     * 初始化行为采集
     */
    protected initCollect(): void {
        this.bindClick();
        this.bindScroll();
        this.bindRouteChange();
    }

    /**
     * 绑定点击事件（事件委托）
     */
    private bindClick():void {
        document.addEventListener('click', (event) => {
            const target = event.target as HTMLElement;
            if (!target) return;

            // 获取点击目标信息
            const elementInfo = DomUtils.getElementInfo(target);
            this.sendLog<BehaviorLog>({
                behaviorType: 'click',
                target: elementInfo.text ||  `${elementInfo.tagName}.${elementInfo.class}`,
                position: {
                    x: event.clientX,
                    y: event.clientY
                }
            })
        })
    }

    /**
     * 绑定滚动事件（防抖）
     */

    private bindScroll():void {
        window.addEventListener('scroll', this.debouncedHandleScroll);
    }

    /**
     * 处理滚动事件：上报滚动百分比
     */
    private handleScroll():void {
        const scrollTop = document.documentElement.scrollTop || document.body.scrollTop;
        const scrollHeight = document.documentElement.scrollHeight || document.body.scrollHeight;
        const clientHeight = document.documentElement.clientHeight || window.innerHeight;
        const scrollPercent = Math.round((scrollTop / (scrollHeight - clientHeight)) * 100);
        this.sendLog<BehaviorLog>({
            behaviorType: 'scroll',
            scrollPercent
        });
    }
    /**
     * 绑定 SPA 路由切换（适配 Vue Router / React Router）
     */
    private bindRouteChange(): void {
        // 监听hash路由变化
        window.addEventListener('hashchange', this.hashChangeHandler);
        // 监听 history 路由变化（pushState/replaceState）
        this.overrideHistoryMethods();
        // Vue Router 监听（主动注入）
        if ((window as any).VueRouter && (window as any).$router) {
            const router = (window as any).$router;
            router.afterEach((to: any, from: any) => {
                this.handleFrameworkRouteChange(from.path, to.path);
            });
        }
        // React Router 监听（主动注入）
        if ((window as any).ReactRouterDOM && (window as any).useLocation) {
            // 业务方需通过 window 暴露路由变化回调
            if ((window as any).registerReactRouteChange) {
                (window as any).registerReactRouteChange((location: any) => {
                    const prevRoute = currentRoute;
                    currentRoute = location.pathname;
                    this.handleFrameworkRouteChange(prevRoute, currentRoute);
                });
            }
        }
    }
    /**
     * 重写 history 方法，监听 pushState/replaceState
     */
    private overrideHistoryMethods():void {
        const originalPush = history.pushState;
        const originalReplace = history.replaceState;

        history.pushState = (...args) => {
            const prevRoute = currentRoute;
            originalPush.apply(history,args);
            currentRoute = window.location.pathname;
            this.handleRouteChangeHistory(prevRoute, currentRoute);
        }

        history.replaceState = (...args) => {
            const prevRoute = currentRoute;
            originalReplace.apply(history,args);
            currentRoute = window.location.pathname;
            this.handleRouteChangeHistory(prevRoute, currentRoute);
        }
    }

    /**
     * 处理 hash/history 路由变化
     */
    private handleRouteChange(event: HashChangeEvent):void {
        const from = currentRoute;
        const to = window.location.pathname;
        if (from === to) return;

        this.sendLog<BehaviorLog>({
            behaviorType: 'routeChange',
            routeFrom: from,
            routeTo: to,
            stayTime: Date.now() - routeEnterTime
        });

        currentRoute = to;
        routeEnterTime = Date.now();
    }
    /**
     * 处理 history 路由变化（手动传入路由参数）
     */
    private handleRouteChangeHistory(prevRoute: string, nextRoute: string): void {
        if (prevRoute === nextRoute) return;

        this.sendLog<BehaviorLog>({
            behaviorType: 'routeChange',
            routeFrom: prevRoute,
            routeTo: nextRoute,
            stayTime: Date.now() - routeEnterTime
        });

        currentRoute = nextRoute;
        routeEnterTime = Date.now();
    }


    /**
     * 处理框架路由变化（Vue/React）
     */
    private handleFrameworkRouteChange(from: string, to: string): void {
        if (from === to) return;
        this.sendLog<BehaviorLog>({
            behaviorType: 'routeChange',
            routeFrom: from,
            routeTo: to,
            stayTime: Date.now() - routeEnterTime
        });
        currentRoute = to;
        routeEnterTime = Date.now();
    }
    /**
     * 获取日志类型
     */
    protected getLogType(): 'behavior' {
        return 'behavior';
    }

    /**
     * 销毁采集器
     */
    public destroy(): void {
        document.removeEventListener('click', () => {});
        window.removeEventListener('scroll', this.debouncedHandleScroll);
        window.removeEventListener('hashchange', this.hashChangeHandler);

        // 恢复 history 原始方法（简化，实际需保存原始引用）
        history.pushState = (window as any).originalPushState || history.pushState;
        history.replaceState = (window as any).originalReplaceState || history.replaceState;

        this.needCollect = false;
    }

    /**
     * 自定义行为埋点（供业务方手动调用）
     * @param behaviorType 行为类型（如 "submit_order"、"collect_goods" 等）
     * @param customData 自定义业务数据
     */
    public reportCustomBehavior(behaviorType: string, customData: Record<string, any>): void {
        if (!this.needCollect) return;

        this.sendLog<BehaviorLog>({
            behaviorType: behaviorType as any, // 允许自定义行为类型
            ...customData // 合并自定义业务数据
        });
    }
}