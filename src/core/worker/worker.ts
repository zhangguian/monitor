// 内联 Worker 核心代码（字符串形式，所有依赖已内联，修复 JS 语法错误）
export const monitorWorkerCode = `
/**
 * 1. 内联依赖：类型定义（模拟 TS 接口，适配 ES 环境）
 */
// 日志类型定义
const MonitorLog = {
  type: 'object',
  properties: {
    uuid: 'string',
    type: 'string',
    timestamp: 'number',
    data: 'object',
    pageUrl: 'string',
    userAgent: 'string',
    userId: 'string|undefined',
    deviceInfo: 'object|undefined'
  }
};

// 配置类型定义
const MonitorConfig = {
  type: 'object',
  properties: {
    reportUrl: 'string',
    sampleRate: 'number',
    logExpireDays: 'number',
    maxRetry: 'number',
    batchSize: 'number|undefined'
  }
};

//  Worker 通信协议类型
const WorkerProtocol = {
  Request: {
    type: 'object',
    properties: {
      type: 'string',
      data: 'object|undefined'
    }
  },
  Response: {
    type: 'object',
    properties: {
      type: 'string',
      data: 'object|undefined',
      error: 'object|undefined'
    }
  }
};

/**
 * 2. 内联依赖：常量定义（与主线程保持一致）
 */
// Worker 请求类型
const WorkerRequestType = {
  INIT: 'INIT',
  ADD_LOG: 'ADD_LOG',
  RETRY_REPORT: 'RETRY_REPORT',
  CLEAR_EXPIRED: 'CLEAR_EXPIRED'
};

// Worker 响应类型
const WorkerResponseType = {
  READY: 'READY',
  QUEUE_UPDATE: 'QUEUE_UPDATE',
  REPORT_RESULT: 'REPORT_RESULT',
  ERROR: 'ERROR',
  INIT_COMPLETE: 'INIT_COMPLETE'
};

/**
 * 3. 内联依赖：工具函数（原 import 的工具函数逻辑内联）
 */
// 构建 Worker 响应消息（原 buildWorkerResponse）
function buildWorkerResponse(type, data, error) {
  return {
    type: type,
    data: data || {},
    error: error ? {
      message: error.message,
      stack: error.stack
    } : undefined
  };
}

// 隐私工具类（原 PrivacyUtils.maskLog）
const PrivacyUtils = {
  // 日志脱敏逻辑（保留原逻辑，可根据实际需求调整）
  maskLog(log) {
    const maskedLog = { ...log };
    // 示例：脱敏手机号、身份证号
    if (maskedLog.data) {
      if (maskedLog.data.phone) {
        maskedLog.data.phone = maskedLog.data.phone.replace(/(\\d{3})\\d{4}(\\d{4})/, '$1****$2');
      }
      if (maskedLog.data.idCard) {
        maskedLog.data.idCard = maskedLog.data.idCard.replace(/(\\d{6})\\d{8}(\\d{4})/, '$1********$2');
      }
    }
    // 脱敏请求体中的敏感字段
    if (maskedLog.data?.requestBody) {
      const body = { ...maskedLog.data.requestBody };
      ['password', 'token', 'secret'].forEach(key => {
        if (body[key]) body[key] = '******';
      });
      maskedLog.data.requestBody = body;
    }
    return maskedLog;
  }
};

// 获取 SDK 版本（原 getSdkVersion）
function getSdkVersion() {
  // 可改为硬编码版本号，或从主线程配置中获取
  return '1.0.0';
}

// 存储工具类（原 storage，IndexedDB 操作逻辑内联）
const storage = {
  // 数据库名称和版本
  DB_NAME: 'MonitorLogDB',
  DB_VERSION: 1,
  STORE_NAME: 'logQueue',

  // 打开数据库连接
  async openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

      // 数据库升级/创建
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        // 若存储库不存在则创建
        if (!db.objectStoreNames.contains(this.STORE_NAME)) {
          db.createObjectStore(this.STORE_NAME, { keyPath: 'uuid' }); // 以 uuid 为唯一键
        }
      };

      request.onsuccess = (e) => resolve(e.target.result);
      request.onerror = (e) => reject(new Error(\`IndexedDB 打开失败：\${e.target.error.message}\`));
    });
  },

  // 保存日志队列到 IndexedDB
  async saveQueue(logs) {
    if (!logs.length) return;
    const db = await this.openDB();
    const transaction = db.transaction(this.STORE_NAME, 'readwrite');
    const store = transaction.objectStore(this.STORE_NAME);

    // 批量添加日志（已存在则更新）
    logs.forEach(log => store.put(log));

    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => {
        db.close();
        resolve(true);
      };
      transaction.onerror = (e) => {
        db.close();
        reject(new Error(\`日志保存失败：\${e.target.error.message}\`));
      };
    });
  },

  // 从 IndexedDB 获取日志队列（过滤过期）
  async getQueue(logExpireDays) {
    const expireMs = logExpireDays * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const db = await this.openDB();
    const transaction = db.transaction(this.STORE_NAME, 'readonly');
    const store = transaction.objectStore(this.STORE_NAME);
    const logs = [];

    return new Promise((resolve, reject) => {
      const cursor = store.openCursor();
      cursor.onsuccess = (e) => {
        const cur = e.target.result;
        if (cur) {
          const log = cur.value;
          // 过滤过期日志
          if (now - log.timestamp <= expireMs) {
            logs.push(log);
          } else {
            // 顺便删除过期日志
            cur.delete();
          }
          cur.continue();
        } else {
          db.close();
          resolve(logs);
        }
      };
      cursor.onerror = (e) => {
        db.close();
        reject(new Error(\`日志获取失败：\${e.target.error.message}\`));
      };
    });
  },

  // 清理 IndexedDB 中的过期日志
  async clearExpiredQueue(expireMs) {
    const now = Date.now();
    const db = await this.openDB();
    const transaction = db.transaction(this.STORE_NAME, 'readwrite');
    const store = transaction.objectStore(this.STORE_NAME);
    let deleteCount = 0;

    return new Promise((resolve, reject) => {
      const cursor = store.openCursor();
      cursor.onsuccess = (e) => {
        const cur = e.target.result;
        if (cur) {
          if (now - cur.value.timestamp > expireMs) {
            cur.delete();
            deleteCount++;
          }
          cur.continue();
        } else {
          db.close();
          resolve(deleteCount);
        }
      };
      cursor.onerror = (e) => {
        db.close();
        reject(new Error(\`过期日志清理失败：\${e.target.error.message}\`));
      };
    });
  },

  // 清空 IndexedDB 中的所有日志
  async clearQueue() {
    const db = await this.openDB();
    const transaction = db.transaction(this.STORE_NAME, 'readwrite');
    const store = transaction.objectStore(this.STORE_NAME);
    store.clear();

    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => {
        db.close();
        resolve(true);
      };
      transaction.onerror = (e) => {
        db.close();
        reject(new Error(\`日志清空失败：\${e.target.error.message}\`));
      };
    });
  }
};

/**
 * 4. Worker 核心逻辑（保留原代码完整逻辑，修复 TS 语法错误）
 */
// -------------------------- 全局状态 --------------------------
let logQueue = []; // 内存日志队列（优先内存存储，提升性能）
let appConfig = null; // 应用配置（初始化后赋值）
let isReporting = false; // 上报锁：防止并发上报冲突
let clearExpireTimer = null; // 过期日志清理定时器
const BATCH_SIZE = 50; // 每批上报条数（平衡请求次数和单请求大小）
// 动态队列阈值：根据设备内存调整（低内存设备降低阈值，避免OOM）
// 修复：移除 TS 类型断言 as any，JS 直接访问属性
const DYNAMIC_QUEUE_THRESHOLD = navigator.deviceMemory
    ? (navigator.deviceMemory < 4 ? 500 : 1000)
    : 1000;

// -------------------------- 核心工具函数 --------------------------
/**
 * 日志采样过滤：根据配置的采样率决定是否保留日志
 * @param log 待采样日志
 * @returns 是否保留（true=保留，false=过滤）
 */
const sampleLog = (log) => {
    if (!appConfig) return false;
    const sampleRate = appConfig.sampleRate;
    const isSampled = Math.random() * 100 <= sampleRate;
    if (!isSampled) {
        console.log(\`[Worker 采样过滤] 日志UUID: \${log.uuid}，采样率: \${sampleRate}%\`);
    }
    return isSampled;
};

/**
 * 日志去重：检查内存队列中是否已存在相同UUID的日志
 * @param log 待检查日志
 * @returns 是否重复（true=重复，false=不重复）
 */
const isLogDuplicated = (log) => {
    return logQueue.some(existingLog => existingLog.uuid === log.uuid);
};

/**
 * 内存队列落盘：当队列长度超过动态阈值时，保存到 IndexedDB
 */
const flushQueueToStorage = async () => {
    if (logQueue.length <= DYNAMIC_QUEUE_THRESHOLD) return;
    if (!appConfig) return;

    try {
        // 仅落盘前 N 条（避免单次存储数据过大）
        const logsToSave = logQueue.splice(0, DYNAMIC_QUEUE_THRESHOLD);
        await storage.saveQueue(logsToSave);
        console.log(\`[Worker 队列落盘] 内存队列超阈值（\${DYNAMIC_QUEUE_THRESHOLD}条），落盘\${logsToSave.length}条日志\`);

        // 落盘后清空已保存的日志（保留未落盘部分）
        logQueue = logQueue.splice(DYNAMIC_QUEUE_THRESHOLD);

        // 向主线程同步队列状态
        postMessage(buildWorkerResponse(
            WorkerResponseType.QUEUE_UPDATE,
            {
                queueLength: logQueue.length,
                action: 'flushToStorage',
                flushedCount: logsToSave.length
        }));

    } catch (error) {
        console.error(\`[Worker 队列落盘失败] 错误:\`, error);
        postMessage(buildWorkerResponse(WorkerResponseType.ERROR, {
            message: '内存队列落盘失败',
            error: error.message,
            stack: error.stack
        }));
    }
};

/**
 * 清理过期日志：同时清理内存队列和 IndexedDB 中的过期数据
 */
const cleanupExpiredLogs = async () => {
    if (!appConfig) return;
    const expireMs = appConfig.logExpireDays * 24 * 60 * 60 * 1000;
    const now = Date.now();

    try {
        // 1. 清理内存队列中的过期日志
        const beforeMemoryLength = logQueue.length;
        logQueue = logQueue.filter(log => now - log.timestamp <= expireMs);
        const memoryDeletedCount = beforeMemoryLength - logQueue.length;

        // 2. 清理 IndexedDB 中的过期日志
        const storageDeletedCount = await storage.clearExpiredQueue(expireMs);
        const totalDeletedCount = memoryDeletedCount + storageDeletedCount;
        console.log(\`[Worker 过期清理] 共清理\${totalDeletedCount}条过期日志（内存：\${memoryDeletedCount}条，IndexedDB：\${storageDeletedCount}条）\`);
        // 向主线程同步清理结果
        postMessage(buildWorkerResponse(WorkerResponseType.QUEUE_UPDATE, {
            queueLength: logQueue.length,
            action: 'cleanupExpired',
            expiredDeletedCount: totalDeletedCount
        }));
    } catch (error) {
        console.error(\`[Worker 过期清理失败] 错误:\`, error);
        postMessage(buildWorkerResponse(WorkerResponseType.ERROR, {
            message: '过期日志清理失败',
            error: error.message,
            stack: error.stack
        }));
    }
};

/**
 * 启动过期日志清理定时器：每天执行一次
 */
const startExpireCleanupTimer = () => {
    // 清理已有定时器，避免重复创建
    if (clearExpireTimer) clearInterval(clearExpireTimer);

    // 立即执行一次清理（初始化时触发）
    cleanupExpiredLogs();

    // 后续每天（86400000ms）执行一次
    clearExpireTimer = setInterval(cleanupExpiredLogs, 86400000);
    console.log(\`[Worker 定时任务] 过期日志清理定时器启动，每天执行一次\`);
};

/**
 * 批量上报工具：优先 sendBeacon，失败降级为 fetch+keepalive，带指数退避重试
 * @param batch 单批待上报日志
 * @returns 上报结果（true=成功，false=失败）
 */
const sendBatch = async (batch) => {
    if (!appConfig || !batch.length || !appConfig.reportUrl) return false;

    const logStr = JSON.stringify({ event: batch });
    const blob = new Blob([logStr], { type: 'application/json; charset=utf-8' });

    // 策略1.优先使用sendBeacon（页面卸载时更可靠，无阻塞）
    if (navigator.sendBeacon) {
        const isBeaconSuccess = navigator.sendBeacon(appConfig.reportUrl, blob);
        if(isBeaconSuccess) {
            console.log(\`[Worker 上报成功] sendBeacon 完成，批次日志数：\${batch.length}\`);
            return true;
        }
    }

    // 策略2：降级为 fetch + keepalive（支持超时、重试）
    console.warn(\`[Worker 上报降级] sendBeacon 失败，降级为 fetch 上报\`);
    const maxRetry = appConfig.maxRetry;
    for(let retryCount = 0; retryCount < maxRetry; retryCount++) {
        try {
            const response = await fetch(appConfig.reportUrl, {
                method: "POST",
                headers: {
                    "Content-Type": 'application/json'
                },
                body: logStr,
                keepalive: true,// 页面卸载时保持连接
            });
            if (response.ok) {
                console.log(\`[Worker 上报成功] fetch 完成（重试\${retryCount}次），批次日志数：\${batch.length}\`);
                return true;
            }
            throw new Error(\`HTTP 状态码：\${response.status}，状态文本：\${response.statusText}\`);
        } catch (err) {
            // 最后一次重试失败，返回 false
            if (retryCount === maxRetry - 1) {
                console.error(\`[Worker 上报失败] 批次日志数：\${batch.length}，已重试\${maxRetry}次，错误:\`, err);
                return false;
            }
            // 指数退避：重试间隔 = 1s * 2^重试次数
            const delay = 1000 * Math.pow(2, retryCount);
            console.log(\`[Worker 上报重试] 批次日志数：\${batch.length}，\${delay}ms 后进行第\${retryCount + 1}次重试\`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    return false;
};

/**
 * 重试上报主逻辑：分批处理内存队列，成功则移除，失败则落盘
 */
const retryReport = async () => {
    // 防御：上报中、无配置、无日志，直接返回
    if (isReporting || !appConfig || logQueue.length === 0) {
        console.log(\`[Worker 上报跳过] 无需上报：\${isReporting ? '已在上报中' : appConfig ? '内存队列为空' : '未初始化配置'}\`);
        return;
    }
    isReporting = true; // 上锁：防止并发上报
    const initialQueueLength = logQueue.length; // 上报前队列长度
    let successCount = 0; // 成功上报条数
    let failedCount = 0; // 失败上报条数

    try {
        console.log(\`[Worker 上报启动] 开始批量上报，内存队列共\${initialQueueLength}条日志，每批\${BATCH_SIZE}条\`);
        // 分批处理队列（splice 会修改原数组，需修正索引）
        for (let i = 0; i < logQueue.length; i += BATCH_SIZE) {
            const batch = logQueue.slice(i, i + BATCH_SIZE);
            const isBatchSuccess = await sendBatch(batch);

            if (isBatchSuccess) {
                successCount += batch.length;
                logQueue.splice(i, BATCH_SIZE); // 成功：从内存队列移除
                i -= BATCH_SIZE; // 修正索引：数组长度减少后，回退索引避免跳过批次
            } else {
                failedCount += batch.length;
            }
        }
        // 上报结果统计
        const reportResult = {
            total: initialQueueLength,
            success: successCount,
            failed: failedCount,
            remaining: logQueue.length,
            timestamp: Date.now()
        };
        console.log(\`[Worker 上报完成] 上报结果：\`, reportResult);
        // 向主线程同步上报结果
        postMessage(buildWorkerResponse(WorkerResponseType.REPORT_RESULT, reportResult));

        // 失败日志落盘：未上报成功的日志保存到 IndexedDB
        if (failedCount > 0) {
            console.log(\`[Worker 失败落盘] 有\${failedCount}条日志上报失败，落盘到 IndexedDB\`);
            await storage.saveQueue(logQueue);
        } else {
            // 全部成功：清空 IndexedDB 历史日志（避免冗余）
            await storage.clearQueue();
            console.log(\`[Worker 上报成功] 所有日志上报完成，清空 IndexedDB 历史数据\`);
        }

    } catch (err) {
        // 全局错误捕获：避免上报逻辑崩溃导致 Worker 不可用
        console.error(\`[Worker 上报崩溃] 批量上报主逻辑错误:\`, err);
        postMessage(buildWorkerResponse(WorkerResponseType.ERROR, {
            message: '批量上报逻辑崩溃',
            error: err.message,
            stack: err.stack,
            total: initialQueueLength,
            success: successCount,
            failed: initialQueueLength - successCount
        }));

        // 错误兜底：将当前内存队列落盘，避免数据丢失
        await storage.saveQueue(logQueue);
        console.log(\`[Worker 错误兜底] 上报崩溃后，落盘\${logQueue.length}条日志到 IndexedDB\`);

    } finally {
        isReporting = false; // 解锁：允许下次上报
    }
};

// -------------------------- 主线程消息监听 --------------------------
self.addEventListener('message', async (event) => {
    const { type, data } = event.data;
    try {
        switch (type) {
            // 1. 初始化指令： 加载配置, 恢复历史日志, 定时任务
            case WorkerRequestType.INIT:
                if(!data?.config) {
                    throw new Error('初始化指令缺少配置信息');
                }
                // 初始化配置
                appConfig = data.config;
                // 从 IndexedDB 恢复未上报日志（自动过滤过期）
                const historyLogs = await storage.getQueue(appConfig.logExpireDays);
                logQueue = [...logQueue, ...historyLogs];
                // 启动过期清理定时器
                startExpireCleanupTimer();
                console.log(\`[Worker 初始化完成] 加载配置：\`, appConfig);
                console.log(\`[Worker 初始化完成] 恢复历史日志\${historyLogs.length}条，当前内存队列共\${logQueue.length}条\`);

                // postMessage(buildWorkerResponse(WorkerResponseType.READY, {
                //     sdkVersion: getSdkVersion(),
                //     queueLength: logQueue.length,
                //     dynamicThreshold: DYNAMIC_QUEUE_THRESHOLD
                // }));
                postMessage(buildWorkerResponse(WorkerResponseType.INIT_COMPLETE, {
                    sdkVersion: getSdkVersion(),
                    queueLength: logQueue.length,
                    dynamicThreshold: DYNAMIC_QUEUE_THRESHOLD
                }));
                break;
            // 2. 添加日志指令：预处理、采样、去重、入队
            case WorkerRequestType.ADD_LOG:
                if (!appConfig) {
                    throw new Error('未初始化配置，无法添加日志');
                }
                if (!data?.log) {
                    throw new Error('ADD_LOG 指令缺少日志数据');
                }
                let log = data.log;
                // 预处理：数据脱敏
                log = PrivacyUtils.maskLog(log);
                // 采样：根据配置决定是否丢弃过滤未命中采样的日志
                if (!sampleLog(log)) break;
                // 去重：根据日志唯一标识去重
                if (isLogDuplicated(log)) break;

                // 加入内存队列
                logQueue.push(log);
                console.log(\`[Worker 添加日志成功] UUID: \${log.uuid}，类型: \${log.type}，当前队列长度: \${logQueue.length}\`);

                // 检查是否需要落盘（队列超阈值）
                await flushQueueToStorage();
                // 向主线程同步队列更新
                postMessage(buildWorkerResponse(WorkerResponseType.QUEUE_UPDATE, {
                    queueLength: logQueue.length,
                    addedLog: {
                        uuid: log.uuid,
                        type: log.type,
                        timestamp: log.timestamp
                    }
                }));
                break;
            // 3. 重试上报指令：触发批量上报
            case WorkerRequestType.RETRY_REPORT: {
                await retryReport();
                break;
            }

            // 4. 清理过期日志指令：手动触发一次清理
            case WorkerRequestType.CLEAR_EXPIRED: {
                await cleanupExpiredLogs();
                break;
            }

            // 未知指令：返回错误
            default: {
                throw new Error(\`未知指令类型：\${type}\`);
            }
        }
    } catch (err) {
        // 消息处理错误捕获：避免单条消息处理失败导致 Worker 崩溃
        console.error(\`[Worker 消息处理失败] 指令：\${type}，错误:\`, err);
        postMessage(buildWorkerResponse(WorkerResponseType.ERROR, {
            message: \`处理指令\${type}失败\`,
            error: err.message,
            stack: err.stack,
            commandType: type
        }));
    }
});

// -------------------------- Worker 销毁时清理 --------------------------
self.addEventListener('beforeunload', () => {
    console.log(\`[Worker 销毁] 开始清理资源\`);

    // 1. 清理过期日志定时器
    if (clearExpireTimer) {
        clearInterval(clearExpireTimer);
        console.log(\`[Worker 销毁] 已清理过期日志定时器\`);
    }

    // 2. 销毁前将内存队列落盘（避免数据丢失）
    if (logQueue.length > 0) {
        storage.saveQueue(logQueue).then(() => {
            console.log(\`[Worker 销毁] 落盘\${logQueue.length}条日志到 IndexedDB\`);
        }).catch(err => {
            console.error(\`[Worker 销毁] 落盘日志失败，错误:\`, err);
        });
    }
});

// -------------------------- 初始化就绪通知 --------------------------
// 向主线程发送 Worker 启动就绪通知
postMessage(buildWorkerResponse(WorkerResponseType.READY, {
    message: 'Web Worker 启动成功，等待主线程初始化指令',
    sdkVersion: getSdkVersion()
}));
`;