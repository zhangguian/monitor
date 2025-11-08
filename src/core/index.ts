import  {MonitorConfig} from "../types";
import {BehaviorCollector} from "../collector/behavior";
import {ErrorCollector} from "../collector/error";
import {ExposureCollector} from "../collector/exposure";
import {PerformanceCollector} from "../collector/performance";
import {ResourceCollector} from "../collector/resource";
import {ConfigManager} from "./config";
import {buildWorkerRequest, WorkerRequestType} from "./worker/message";
import {getSdkVersion} from "../utils/sdk-version";
import {storage} from "../reporter/storage";

let worker:Worker | null = null;
let collectors: {
    behavior: BehaviorCollector | null,
    error: ErrorCollector | null,
    exposure: ExposureCollector| null,
    performance: PerformanceCollector| null,
    resource: ResourceCollector| null,
} = {
    behavior: null,
    error: null,
    exposure: null,
    performance: null,
    resource: null,
};

/**
 * SDK 初始化函数（业务方调用此函数启动监控）
 * @param config 初始化配置（appId/reportUrl 必传）
 */

export const initMonitorSDK = (config: MonitorConfig) => {

    try {
        if (!config.appId || !config.reportUrl) {
            throw new Error('SDK 初始化失败：appId 和 reportUrl 为必传参数');
        }

        ConfigManager.init({
            ...config ,
        });

        //创建 Web Worker 实例（日志处理/上报，避免阻塞主线程）
        createWorker();

        // 实例化采集器
        initCollectors();
        console.log(`[MonitorSDK] 初始化成功（SDK 版本：${getSdkVersion()}）`);
    } catch (e) {
        console.error(`[MonitorSDK] 初始化失败：${e}`);
        // 初始化失败，销毁资源
        destroyMonitorSDK();
    }
};

/**
 * 创建 Web Worker 实例（处理日志的核心线程）
 */

const createWorker = () => {
    try {
        // 注意：Worker 路径需符合项目打包规则（如 Vite 用 import.meta.url，Webpack 需用绝对路径）
        import('./worker/worker.ts').then((workerModule:{ default: typeof Worker }) => {
            const newWorker = new workerModule.default();
            worker = newWorker; // 赋值给全局 worker 变量
            if (worker) {
                worker?.addEventListener('message', (event) => {
                    const {type, data} = event.data;
                    switch (type) {
                        case 'READY':
                            console.log('[MonitorSDK] Worker 线程就绪');
                            // Worker 就绪后，同步初始化配置到 Worker
                            worker?.postMessage(buildWorkerRequest(WorkerRequestType.INIT, {
                                config: ConfigManager.getConfig(),
                                sdkVersion: getSdkVersion()
                            }));
                            break;
                        case 'ERROR':
                            console.error('[MonitorSDK] Worker 错误：', data.error);
                            break;
                        default:
                            // 其他消息（如队列长度更新，可按需处理）
                            break;
                    }
                })
                // Worker 错误监听
                worker?.addEventListener('error', (err) => {
                    console.error('[MonitorSDK] Worker 线程错误：', err);
                    // Worker 崩溃时尝试重启（可选，增强可靠性）
                    setTimeout(createWorker, 3000);
                });
            }
        });

    } catch (e) {
        console.error(`[MonitorSDK] 创建 Worker 失败：${e}`);
    }
}
/**
 * 实例化五大采集器（根据配置开关决定是否启用）
 */

const initCollectors = () => {
    const needCollect = ConfigManager.getConfig('needCollect');

    // 1. 行为采集器
    if (needCollect.behavior) {
        collectors.behavior = new BehaviorCollector(worker!);
    }

    // 2. 错误采集器
    if(needCollect.error) {
        collectors.error = new ErrorCollector(worker!);
    }

    // 3. 曝光采集器
    if(needCollect.exposure) {
        collectors.exposure = new ExposureCollector(worker!);
    }

    // 4. 性能采集器
    if(needCollect.performance) {
        collectors.performance = new PerformanceCollector(worker!);
    }
    // 5. 资源采集器（resource.js）
    if (needCollect.resource) {
        collectors.resource = new ResourceCollector(worker!);
    }
}

/**
 * 销毁 SDK（项目卸载时调用，避免内存泄漏）
 */

export const destroyMonitorSDK = () => {
    // 销毁所有采集器（移除事件监听）
    Object.values(collectors).forEach((collector:any) => {
        collector?.destroy();
    });
    // 终止 Worker 线程
    if (worker) {
        worker.terminate();
        worker = null;
    }
    // 清空 IndexedDB 存储（可选，根据业务需求）
    storage.clearQueue();
    console.log('[MonitorSDK] 已销毁');
};

/**
 * 暴露 SDK 接口（供业务方调用，如自定义埋点、动态开关）
 */
export const MonitorSDK = {
    // 动态开关采集器（如生产环境临时关闭曝光采集）
    toggleCollector: (collectorType: keyof typeof collectors, isEnable: boolean) => {
        const collector = collectors[collectorType];
        if (collector) {
            ConfigManager.updateConfig({
                needCollect: {   [collectorType]: isEnable,
                    error: ConfigManager.getConfig('needCollect').error ?? true,
                    behavior: ConfigManager.getConfig('needCollect').behavior ?? true,
                    exposure: ConfigManager.getConfig('needCollect').exposure ?? true,
                    performance: ConfigManager.getConfig('needCollect').performance ?? true,
                    resource: ConfigManager.getConfig('needCollect').resource ?? true,
                    }
            });
            // 若关闭，触发销毁；若开启，重新实例化（需扩展采集器支持重启）
            if (!isEnable) {
                collector.destroy();
                collectors[collectorType] = null;
            } else if (!collectors[collectorType]) {
                collectors[collectorType] = new(
                    {
                        behavior: BehaviorCollector,
                        error: ErrorCollector,
                        exposure: ExposureCollector,
                        performance: PerformanceCollector,
                        resource: ResourceCollector
                    }[collectorType]! as any
                )(worker!);
            }
        }
    },
    // // 自定义埋点接口（如业务方手动上报行为）
    // reportCustomBehavior: (behaviorType, customData) => {
    //     collectors.behavior?.reportCustomBehavior(behaviorType, customData);
    // },
    // // 自定义错误上报接口（如业务方手动上报已知错误）
    // reportCustomError: (errorData) => {
    //     collectors.error?.reportCustomError(errorData);
    // }
};