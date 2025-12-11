
// 框架错误处理缓存（避免重复绑定）
import {BaseCollector} from "./base";
import {BaseLog, ErrorLog} from "../types";

let originalVueErrorHandler: any = null;
let originalReactErrorBoundary: any = null;

export class ErrorCollector extends BaseCollector {

    // 已捕获的错误缓存（避免重复上报）
    private capturedErrors = new Set<string>

    constructor(worker: Worker) {
        super(worker, 'error');
    }
    /**
     * 初始化错误采集
     */
    protected initCollect():void {
        this.bindGlobalError();
        this.bindPromiseError();
        this.bindFrameworkError();
    }

    /**
     * 绑定全局 JS 运行时错误
     */

    private bindGlobalError() {
        window.addEventListener('error', (event: ErrorEvent) => {
            if (event.target instanceof  HTMLElement) return

            const error = event.error as Error;
            this.handleError({
                errorType: 'js',
                message: error.message || event.message,
                stack: error.stack || '',
                filename: event.filename,
                line: event.lineno,
                column: event.colno,
            })
        })
    }
    /**
     * 绑定 Promise 未捕获错误
     */
    private bindPromiseError():void {
        window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
            const reason = event.reason;
            this.handleError({
                errorType: 'promise',
                message: reason instanceof Error ? reason.message : String(reason),
                stack: reason instanceof Error ? reason.stack || '' : ''
            })
            // 阻止默认行为（避免浏览器控制台报错）
            event.preventDefault();
        })
    }

    /**
     * 绑定框架错误（Vue/React）
     */
    private bindFrameworkError():void {
        // Vue 错误监听（Vue 2.x / 3.x 兼容）
        if ((window as any).Vue) {
            const Vue = (window as any).Vue;
            originalVueErrorHandler = Vue.config.errorHandler;
            Vue.config.errorHandler = (err: Error, vm: any, info: string) => {
                this.handleError({
                    errorType: 'vue',
                    message: `${err.message} (${info})`,
                    stack: err.stack || ''
                });
                // 调用原始错误处理函数
                if (originalVueErrorHandler) {
                    originalVueErrorHandler(err, vm, info);
                }
            };
        }
        // React 错误边界（需业务方配合，这里提供注入方式）
        if ((window as any).React) {
            const React = (window as any).React;
            // 业务方需通过 window 暴露错误边界回调
            if ((window as any).registerReactErrorHandler) {
                originalReactErrorBoundary = (window as any).registerReactErrorHandler;
                (window as any).registerReactErrorHandler = (err: Error, errorInfo: any) => {
                    this.handleError({
                        errorType: 'react',
                        message: err.message,
                        stack: err.stack || '',
                        // detail: errorInfo.componentStack || ''
                    });
                    if (originalReactErrorBoundary) {
                        originalReactErrorBoundary(err, errorInfo);
                    }
                };
            }
        }
    }
    /**
     * 错误处理：去重、格式化、上报
     */
    private handleError(errorData: Omit<ErrorLog, keyof BaseLog>): void {
        // 去重：通过 "message+stack" 生成唯一标识
        const errorKey = `${errorData.message}-${errorData.stack?.slice(0, 200) || ''}`;
        if (this.capturedErrors.has(errorKey)) return;
        this.capturedErrors.add(errorKey);

        // 发送到 Worker
        this.sendLog<ErrorLog>(errorData);

        // 定期清理缓存（避免内存溢出）
        setTimeout(() => {
            this.capturedErrors.delete(errorKey);
        }, 5 * 60 * 1000); // 5分钟后移除
    }
    /**
     * 获取日志类型
     */
    protected getLogType(): 'error' {
        return 'error';
    }

    /**
     * 销毁采集器
     */
    public destroy(): void {
        // 移除全局事件监听（无法直接移除匿名函数，建议用命名函数，这里简化）
        window.removeEventListener('error', () => {});
        window.removeEventListener('unhandledrejection', () => {});

        // 恢复框架原始错误处理
        if ((window as any).Vue && originalVueErrorHandler) {
            (window as any).Vue.config.errorHandler = originalVueErrorHandler;
        }
        if ((window as any).registerReactErrorHandler && originalReactErrorBoundary) {
            (window as any).registerReactErrorHandler = originalReactErrorBoundary;
        }

        this.capturedErrors.clear();
        this.needCollect = false;
    }

    /**
     * 自定义错误上报（供业务方手动调用）
     * @param errorData 自定义错误数据
     */
    public reportCustomError(errorData: Omit<ErrorLog, keyof BaseLog>): void {
        if (!this.needCollect) return;
        this.handleError(errorData);
    }
}