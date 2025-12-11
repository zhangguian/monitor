/** 全局配置类型 */
export interface MonitorConfig {
    appId: string; // 应用唯一标识
    reportUrl: string; // 上报接口地址
    sampleRate: number; // 采样率（0-100）
    maxRetry: number; // 上报最大重试次数
    logExpireDays: number; // 日志过期天数
    needCollect: { // 需要采集的模块开关
        error: boolean;
        behavior: boolean;
        exposure: boolean;
        performance: boolean;
        resource: boolean;
    };
}

/** 日志类型枚举 */
export type LogType = 'error' | 'behavior' | 'exposure' | 'performance' | 'resource';

/** 日志基础类型 */
export interface BaseLog {
    uuid: string; // 日志唯一ID
    appId: string; // 应用ID
    sdkVersion: string; // SDK版本
    timestamp: number; // 日志生成时间戳（ms）
    pageUrl: string; // 当前页面URL
    userAgent: string; // 设备UA
    type: LogType; // 日志类型
}


/** 用户行为日志类型 */
export interface BehaviorLog extends BaseLog {
    type: 'behavior';
    behaviorType: 'click' | 'scroll' | 'routeChange' | string; // 行为类型，支持自定义扩展
    target?: string; // 点击目标（如"立即购买按钮"）
    position?: { x: number; y: number }; // 点击位置
    scrollPercent?: number; // 滚动百分比
    routeFrom?: string; // 路由来源
    routeTo?: string; // 路由目标
    stayTime?: number; // 停留时间（ms）
}

/** 曝光日志类型 */
export interface ExposureLog extends BaseLog {
    type: 'exposure';
    elementInfo: { // 曝光元素信息
        tagName: string;
        class: string;
        text: string;
        id?: string;
        [key: string]: any; // 其他自定义属性[可选]
    };
    exposureTime: number; // 曝光时长（ms）
    visiblePercent: number; // 可见比例（0-100）
}
/** 错误日志类型 */
export interface ErrorLog extends BaseLog {
    type: 'error';
    errorType: 'js' | 'promise' | 'vue' | 'react'; // 错误类型
    message: string; // 错误信息
    stack: string; // 错误栈
    filename?: string; // 错误所在文件
    line?: number; // 错误行号
    column?: number; // 错误列号
}


/** 性能日志类型 */
export interface PerformanceLog extends BaseLog {
    type: 'performance';
    performanceType: 'lcp' | 'fid' | 'cls' | 'fp' | 'fcp'| 'ttfb' | 'inp' | 'spaRoute'; // 性能指标类型
    value: number; // 指标值（ms或数值）
    detail?: Record<string, any>; // 详细信息
}

/** 资源日志类型 */
export interface ResourceLog extends BaseLog {
    type: 'resource';
    resourceType: 'script' | 'style' | 'image' | 'fetch' | 'xhr'; // 资源类型
    url: string; // 资源URL
    duration: number; // 加载耗时（ms）
    status?: number; // 资源状态码（如404）
    size?: number; // 资源大小（KB）
}

/** 所有日志类型联合 */
export type MonitorLog = ErrorLog | BehaviorLog | ExposureLog | PerformanceLog | ResourceLog;



/** Worker通信协议类型 */
export namespace WorkerProtocol {
    // 主线程→Worker指令类型
    export type RequestType = 'INIT' | 'ADD_LOG' | 'RETRY_REPORT' | 'CLEAR_EXPIRED';
    // Worker→主线程响应类型
    export type ResponseType = 'QUEUE_UPDATE' | 'REPORT_RESULT' | 'ERROR' | 'READY' | 'INIT_COMPLETE';

    // 主线程请求参数
    export interface Request {
        type: RequestType;
        data?: any;
    }

    // Worker响应参数
    export interface Response {
        type: ResponseType;
        data?: any;
    }
}

