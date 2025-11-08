import type { MonitorConfig } from '../types';
import { getSdkVersion } from '../utils/sdk-version';


/**
 * 默认配置
 */
const DEFAULT_CONFIG: MonitorConfig = {
    appId: '',
    reportUrl: '',
    sampleRate: 100,
    maxRetry: 3,
    logExpireDays: 7,
    needCollect: {
        error: true,
        behavior: true,
        exposure: true,
        performance: true,
        resource: true
    }
};
/**
 * 动态配置管理
 */

export const ConfigManager = {
    privateConfig: { ...DEFAULT_CONFIG } as MonitorConfig,
    /**
     * 初始化配置（合并默认配置与用户配置）
     */
    init(config: Partial<MonitorConfig>): void {
        if (!config.appId) throw new Error('请传入必填参数 appId');
        if (!config.reportUrl) throw new Error('请传入必填参数 reportUrl');
        this.privateConfig = { ...this.privateConfig, ...config } as MonitorConfig;
        // 补充SDK版本
        (window as any).MONITOR_SDK_CONFIG = this.privateConfig;
    },
    /**
     * 获取配置
     */
    getConfig<T extends keyof MonitorConfig>(key?: T): T extends undefined ? MonitorConfig : MonitorConfig[T] {
        if (key) return this.privateConfig[key] as any;
        return this.privateConfig as any;
    },

    /**
     * 动态更新配置（如从服务端拉取新采样率）
     */
    updateConfig(config: Partial<MonitorConfig>): void {
        this.privateConfig = { ...this.privateConfig, ...config };
        (window as any).MONITOR_SDK_CONFIG = this.privateConfig;
    }
}