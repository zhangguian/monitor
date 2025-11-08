/**
 * 采集基类：封装公共逻辑，子类仅需实现具体采集逻辑
 */
import {BaseLog, LogType, type MonitorConfig, MonitorLog} from "../types";
import {ConfigManager} from "../core/config";
import {getSdkVersion} from "../utils/sdk-version";
import {buildWorkerRequest, WorkerRequestType} from "../core/worker/message";
import {generateUUID} from "../utils/dom";

export abstract class BaseCollector {
    protected needCollect: boolean = false; // 是否需要采集 (由配置控制)
    protected worker: Worker | null = null; // Worker实例 （从core 传入)

    constructor(worker: Worker, logType: LogType) {
        this.worker = worker;
        // 从配置获取当前模块的采集开关
        this.needCollect = ConfigManager.getConfig('needCollect')[logType];
        // 初始化采集（子类可重写）
        if (this.needCollect) {
            this.initCollect();
        }
    }
    /**
     * 初始化采集（子类必须实现）
     */
    protected abstract initCollect(): void;
    /**
     * 生成日志公共字段（BaseLog）
     */
    protected generateBaseLog(): BaseLog {
        const config = ConfigManager.getConfig() as any ;
        return  {
            uuid: generateUUID(), // 生成唯一标识
            appId: config.appId, // 应用ID
            sdkVersion: getSdkVersion(),
            timestamp: Date.now(), // 时间戳
            pageUrl: window.location.href, // 当前页面URL
            userAgent: navigator.userAgent, // 用户代理字符串
            type: this.getLogType(), // 由子类实现，返回具体日志类型
        }
    }

    /**
     * 获取日志类型（子类必须实现）
     */
    protected abstract getLogType(): LogType;

    /**
     * 发送日志到 Worker（统一通信入口）
     * @param log 具体日志内容（不含公共字段）
     */
    protected sendLog<T extends MonitorLog>(log: Omit<T, keyof BaseLog>): void {
        if (!this.needCollect || !this.worker) return;

        // 合并公共字段与业务字段
        const fullLog = {
            ...this.generateBaseLog(),
            ...log
        } as T;

        // 发送到 Worker
        this.worker.postMessage(buildWorkerRequest(WorkerRequestType.ADD_LOG, {
            log: fullLog
        }));
    }

    /**
     * 销毁采集器（移除事件监听等）
     */
    public abstract destroy(): void;
}