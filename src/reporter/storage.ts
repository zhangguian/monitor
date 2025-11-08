import type { MonitorLog } from '../types';

// -------------------------- 数据库配置常量 --------------------------
const DB_CONFIG = {
    dbName: 'MonitorSDK_LogDB', // 数据库名称（唯一标识）
    storeName: 'LogStore', // 存储表名称（日志主表）
    dbVersion: 1, // 数据库版本（升级时递增）
    keyPath: 'uuid' // 主键（日志唯一ID，用于去重）
};


// -------------------------- 核心工具函数 --------------------------
/**
 * 打开数据库连接（封装原生 IndexedDB 异步操作）
 * @returns 数据库实例（IDBDatabase）
 */

const openDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        // 1. 打开数据库
        const request = indexedDB.open(DB_CONFIG.dbName, DB_CONFIG.dbVersion);

        // 2. 数据库升级/初始化（版本变更时触发，首次创建也会触发）
        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            // 若存储表不存在，创建存储表 （主键为UUID, 支持去重
            if(!db.objectStoreNames.contains(DB_CONFIG.storeName)) {
                db.createObjectStore(DB_CONFIG.storeName, { keyPath: DB_CONFIG.keyPath });
                console.log(`[IndexedDB] 初始化存储表：${DB_CONFIG.storeName}`);
            }
        }
        // 3.打开成功
        request.onsuccess = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            console.log(`[IndexedDB] 数据库连接成功：${DB_CONFIG.storeName}`);
            resolve(db);
        }

        // 4.打开失败 （如浏览器不支持、权限不足）
        request.onerror = (event) => {
            const error = (event.target as IDBOpenDBRequest).error;
            console.error(`[IndexedDB] 数据库连接失败：${error}`);
            reject(new Error(`IndexedDB 连接失败：${error?.message}`));
        }
    })
};

// -------------------------- 核心存储方法 --------------------------
/**
 * 1. 保存日志队列到 IndexedDB（自动去重：主键 uuid 重复时覆盖）
 * @param logs 待保存的日志数组（MonitorLog[]）
 * @returns 保存结果（true=成功，false=失败）
 */
// @ts-ignore
export const saveQueue = async (logs: MonitorLog[]): Promise<boolean> => {
    // 参数校验： 日志数据为空直接返回成功
    if(!logs || !logs.length) {
        console.log(`[IndexedDB] 保存日志队列：无数据`);
        return true;
    }

    let db: IDBDatabase | null = null;
    try {
        // 1. 打开数据库连接
        db = await openDB();

        // 2. 开启读写事物 （操作存储表）
        const transaction  = db.transaction(DB_CONFIG.storeName, 'readwrite');
        const store = transaction.objectStore(DB_CONFIG.storeName);

        // 3. 批量保存日志（put：存在则更新，不存在则添加，自动去重）
        logs.forEach(log => store.put(log));

        // 4. 事务回调
        return new Promise((resolve, reject) =>{
            // 4.1 事务成功回调
            transaction.oncomplete = () => {
                console.log(`[IndexedDB] 保存日志队列：成功，共${logs.length}条`);
                resolve(true);
            };

            // 4.2 事务失败回调
            transaction.onerror = (event) => {
                const error = (event.target as IDBTransaction).error;
                console.error(`[IndexedDB] 保存日志队列：失败，${error}`);
               resolve(false);
            }
        });
    }catch (error) {
        console.error(`[IndexedDB] 保存日志队列：异常，${error}`);
        return false;
    } finally {
        // 5. 关闭数据库连接（避免资源泄漏）
        db?.close();
    }
};

/**
 * 2. 从 IndexedDB 读取所有日志（自动过滤过期日志）
 * @param expireMs 过期时间戳（ms）：超过该时间的日志将被过滤
 * @returns 有效日志数组（MonitorLog[]）
 */
export const getQueue = async (expireMs: number) : Promise<MonitorLog[]> => {
    // 参数校验：过期时间戳无效时，直接返回空数组
    if(typeof expireMs !== 'number' || expireMs <=0) {
        console.log(`[IndexedDB] 读取日志队列：无效过期时间，返回空数组`);
        return [];
    }

    let db: IDBDatabase | null = null;
    try {
        // 1.打开数据连接
        db = await openDB();

        // 2.开启只读事物（读取存储表）
        const transaction = db.transaction(DB_CONFIG.storeName, 'readonly');
        const store = transaction.objectStore(DB_CONFIG.storeName);

        // 3.读取所有日志（getAll()无参数时读取全部）
        const request = store.getAll();

        // 4.处理读取结果
        return new Promise((resolve, reject) => {
            // 4.1 读取成功回调
            request.onsuccess = (event) => {
                // 读取原始日志 (无则返回空数据)
                const rawLogs = (event.target as IDBRequest<MonitorLog[]>).result || [];
                // 过滤过期日志 （当前时间 - 日志时间戳 > 过期时长  → 过期）
                const validLogs = rawLogs.filter(log => Date.now() - log.timestamp <= expireMs);
                console.log(`[IndexedDB] 读取日志：原始 ${rawLogs.length} 条，有效 ${validLogs.length} 条（过滤过期 ${rawLogs.length - validLogs.length} 条）`);
                resolve(validLogs);
            };

            // 4.2.读取失败回调

            request.onerror = (event) => {
                const error = (event.target as IDBRequest).error;
                console.error(`[IndexedDB] 读取日志队列：失败，${error}`);
                resolve([]);
            }
        })

    } catch (error) {
        console.error(`[IndexedDB] 读取日志异常：`, error);
        return [];
    }finally {
        // 5. 关闭数据库连接
         db?.close();
    }
};

/**
 * 3. 清空 IndexedDB 中的所有日志
 * @returns 清空结果（true=成功，false=失败）
 */
export const clearQueue = async () : Promise<boolean> => {
    let db: IDBDatabase | null = null;

    try{
        // 1. 打开数据库连接
        db = await openDB();
        // 2. 开启读写事务（清空存储表）
        const transaction = db.transaction(DB_CONFIG.storeName, 'readwrite');
        const store = transaction.objectStore(DB_CONFIG.storeName);
        const request = store.clear();
        return new Promise((resolve) => {
            // 2.1 清空成功回调
            request.onsuccess = () => {
                console.log(`[IndexedDB] 成功清空所有日志`);
                resolve(true);
            };
            // 2.2 清空失败回调
            request.onerror = (event) => {
                const error = (event.target as IDBRequest).error;
                console.error(`[IndexedDB] 清空日志失败：`, error);
                resolve(false);
            };
        });
    } catch (error) {
        console.error(`[IndexedDB] 清空日志异常：`, error);
        return false;
    } finally {
        // 4. 关闭数据库连接
         db?.close();
    }
}

/**
 * 4. 清理 IndexedDB 中的过期日志
 * @param expireMs 过期时间戳（ms）
 * @returns 清理的过期日志数量（number）
 */
export const clearExpiredQueue = async (expireMs: number): Promise<number> => {
    // 参数校验：过期时间戳无效时返回 0
    if (typeof expireMs !== 'number' || expireMs <= 0) {
        console.warn(`[IndexedDB] 清理失败：过期时间戳无效`);
        return 0;
    }

    let db: IDBDatabase | null = null;
    try {
        // 1. 打开数据库连接
        db = await openDB();

        // 2. 开启读写事务（读取+删除操作）
        const transaction = db.transaction(DB_CONFIG.storeName, 'readwrite');
        const store = transaction.objectStore(DB_CONFIG.storeName);
        const request = store.getAll();

        // 3. 处理清理逻辑
        return new Promise((resolve) => {
            request.onsuccess = (event) => {
                const rawLogs = (event.target as IDBRequest<MonitorLog[]>).result || [];
                const now = Date.now();
                let deletedCount = 0;

                // 3.1 遍历日志，删除过期数据
                rawLogs.forEach((log) => {
                    if (now - log.timestamp > expireMs) {
                        store.delete(log.uuid); // 根据主键删除
                        deletedCount++;
                    }
                });

                // 3.2 事务完成后返回删除数量
                transaction.oncomplete = () => {
                    console.log(`[IndexedDB] 清理过期日志：共删除 ${deletedCount} 条`);
                    resolve(deletedCount);
                };

                // 3.3 事务失败返回 0
                transaction.onerror = (event) => {
                    const error = (event.target as IDBTransaction).error;
                    console.error(`[IndexedDB] 清理过期日志失败：`, error);
                    resolve(0);
                };
            };

            // 读取日志失败返回 0
            request.onerror = (event) => {
                const error = (event.target as IDBRequest).error;
                console.error(`[IndexedDB] 读取日志失败（清理场景）：`, error);
                resolve(0);
            };
        });
    } catch (error) {
        console.error(`[IndexedDB] 清理过期日志异常：`, error);
        return 0;
    } finally {
        // 4. 关闭数据库连接
        db?.close();
    }
};

// -------------------------- 模块导出 --------------------------
export const storage = {
    saveQueue,
    getQueue,
    clearQueue,
    clearExpiredQueue
};

// 导出类型（方便其他模块导入）
export type { MonitorLog };