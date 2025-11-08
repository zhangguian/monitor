import type { WorkerProtocol, MonitorLog, MonitorConfig } from '../../types';

/**
 * 主线程→Worker指令常量
 */
export const WorkerRequestType: Record<WorkerProtocol.RequestType, WorkerProtocol.RequestType> = {
    INIT: 'INIT',
    ADD_LOG: 'ADD_LOG',
    RETRY_REPORT: 'RETRY_REPORT',
    CLEAR_EXPIRED: 'CLEAR_EXPIRED'
};
/**
 * Worker→主线程响应常量
 */
export const WorkerResponseType: Record<WorkerProtocol.ResponseType, WorkerProtocol.ResponseType> = {
    QUEUE_UPDATE: 'QUEUE_UPDATE',
    REPORT_RESULT: 'REPORT_RESULT',
    ERROR: 'ERROR',
    READY: 'READY'
};

/**
 * 构建Worker请求
 */
export const buildWorkerRequest = <T extends WorkerProtocol.RequestType>(
    type: T,
    data?: WorkerProtocol.Request['data']
): WorkerProtocol.Request => {
    return { type, data };
};
/**
 * 构建Worker响应
 */
export const buildWorkerResponse = <T extends WorkerProtocol.ResponseType>(
    type: T,
    data?: WorkerProtocol.Response['data']
): WorkerProtocol.Response => {
    return { type, data };
};
/**
 * INIT指令数据类型
 */
export interface InitRequestData {
    config: MonitorConfig;
    sdkVersion: string;
}


/**
 * ADD_LOG指令数据类型
 */
export interface AddLogRequestData {
    log: MonitorLog;
}
