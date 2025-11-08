/**
 * 隐私脱敏工具函数
 */
export const PrivacyUtils = {
    /** 手机号脱敏：138****5678 */
    maskPhone(phone: string): string {
        if (!phone) return '';
        return phone.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2');
    },

    /** 身份证号脱敏：110101********1234 */
    maskIdCard(idCard: string): string {
        if (!idCard) return '';
        return idCard.replace(/^(\d{6})\d{8}(\d{4})$/, '$1********$2');
    },

    /** IP地址脱敏：192.168.***.*** */
    maskIp(ip: string): string {
        if (!ip) return '';
        return ip.replace(/^(\d+\.\d+)\.\d+\.\d+$/, '$1.***.***');
    },

    /** 日志脱敏：自动识别敏感字段并脱敏 */
    maskLog(log: Record<string, any>): Record<string, any> {
        const maskedLog = { ...log };
        // 脱敏常见敏感字段
        if (maskedLog.phone) maskedLog.phone = this.maskPhone(maskedLog.phone);
        if (maskedLog.idCard) maskedLog.idCard = this.maskIdCard(maskedLog.idCard);
        if (maskedLog.ip) maskedLog.ip = this.maskIp(maskedLog.ip);
        return maskedLog;
    }
};