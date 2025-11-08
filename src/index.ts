// src/index.js（SDK 主入口）
// 导出核心初始化函数和工具类
export { initMonitorSDK, MonitorSDK, destroyMonitorSDK } from './core/index';
// 导出类型（TypeScript 项目使用）
export * from './types/index';
// 导出自定义埋点类型（可选，方便用户类型提示）
export type { BehaviorLog, ErrorLog, ExposureLog, PerformanceLog, ResourceLog } from './types/index';