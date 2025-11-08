import {ExposureLog} from "../types";
/**
 * DOM操作工具函数
 */
export const  DomUtils = {
    /**
     * 获取元素信息（用于曝光日志）
     */
    getElementInfo(el: HTMLElement): ExposureLog['elementInfo'] {
        return {
            tagName: el.tagName,
            class: el.className || '',
            text: el.textContent.trim() || '',
            id: el.id || undefined,
            dataset: el.dataset || {},
            rect: el.getBoundingClientRect()
        }
    },
    /**
     * 判断元素是否在视口内（可见比例）
     */
    getElementVisiblePercent(el: HTMLElement): number {
        const rect = el.getBoundingClientRect();
        const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
        // 元素完全在是口外
        if(rect.right < 0 ||
            rect.bottom < 0 ||
            rect.left > viewportWidth ||
            rect.top > viewportHeight
        ) {
            return 0;
        }

        // 计算元素与视口重叠区域
        const overLapLeft = Math.max(0, rect.left);
        const overLapTop = Math.max(0, rect.top);
        const overLapRight = Math.min(rect.right, viewportWidth);
        const overLapBottom = Math.min(rect.bottom, viewportHeight);

        // 计算可见比例 重叠面积/元素总面积
        const elementArea = rect.width * rect.height;
        const overlapArea = (overLapRight - overLapLeft) * (overLapBottom - overLapTop);
        return elementArea === 0 ? 0 : Math.round((overlapArea / elementArea) * 100);
    },

    /**
     * 生成唯一DOM标识（用于曝光去重）
     */
    generateDomId(el: HTMLElement): string {
        if (el.id) return `id:${el.id}`;
        // 无ID时用"标签+class+位置"生成临时标识
        const tag = el.tagName;
        // @ts-ignore
        const cls = el.classList.replace(/\s+/g, '-');
        const rect = el.getBoundingClientRect();
        return `${tag}-${cls}-x:${Math.round(rect.left)}-y:${Math.round(rect.top)}`;
    }
}


/**
 * 3. 生成日志唯一ID（UUID v4 简化版）
 */
export function generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}