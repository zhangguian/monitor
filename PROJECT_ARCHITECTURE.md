# Monitor SDK 项目架构文档

## 1. 项目概述

Monitor SDK 是一个高性能前端监控解决方案，专为单页应用（SPA）设计，提供五大核心采集能力：用户行为采集、错误采集、元素曝光采集、性能采集和资源采集。采用 Web Worker 架构设计，确保监控逻辑不阻塞主线程，同时具备离线存储和自动重试机制，保证数据可靠性。

### 1.1 核心价值

- **全面监控**：覆盖用户行为、错误、曝光、性能、资源五大维度
- **高性能**：Web Worker 架构，不阻塞主线程
- **高可靠**：离线存储 + 自动重试，确保数据不丢失
- **易集成**：支持 Vue 3/React 18，30分钟内完成基础集成
- **可扩展**：模块化设计，支持按需开启采集器

### 1.2 技术栈

| 技术/工具       | 版本要求       | 用途                          |
|----------------|----------------|-------------------------------|
| TypeScript     | ≥5.9.3         | 类型安全的开发语言            |
| Rollup         | ≥4.52.5        | 打包工具，支持多种模块格式    |
| Web Worker     | 现代浏览器支持  | 日志处理和上报的独立线程      |
| IndexedDB      | 现代浏览器支持  | 离线日志存储                  |
| web-vitals     | ≥3.0.0         | 性能指标采集核心依赖          |

## 2. 系统架构

### 2.1 架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                        浏览器主线程                              │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                   SDK 核心入口 (core/index.ts)              │ │
│  ├─────────────────────────────────────────────────────────────┤ │
│  │  ┌─────────────────────────┐  ┌─────────────────────────┐  │ │
│  │  │  业务方调用接口          │  │  业务方调用接口          │  │ │
│  │  │  MonitorSDK.            │  │  MonitorSDK.            │  │ │
│  │  │  reportCustomBehavior() │  │  reportCustomError()    │  │ │
│  │  └─────────────────────────┘  └─────────────────────────┘  │ │
│  └─────────────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                   配置管理 (core/config.ts)                │ │
│  └─────────────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                    五大采集器 (collector/)                 │ │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ │ │
│  │  │ behavior│ │  error  │ │exposure │ │performance│ │resource│ │ │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘ │ │
│  └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
               │ 消息通信 (Worker 通信协议)
┌─────────────────────────────────────────────────────────────────┐
│                        Web Worker 线程                           │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                  Worker 主逻辑 (core/worker/worker.ts)      │ │
│  ├─────────────────────────────────────────────────────────────┤ │
│  │                  日志处理核心                                │ │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ │ │
│  │  │日志采样 │ │日志脱敏 │ │日志去重 │ │批量上报 │ │离线存储 │ │ │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘ │ │
│  └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
               │ 上报请求 (sendBeacon/fetch+keepalive)
┌─────────────────────────────────────────────────────────────────┐
│                        监控后端服务                              │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 核心组件

#### 2.2.1 SDK 核心入口 (core/index.ts)

- 负责 SDK 初始化、销毁和对外接口暴露
- 管理 Web Worker 生命周期
- 实例化和管理五大采集器
- 提供动态开关采集器等对外接口

#### 2.2.2 配置管理 (core/config.ts)

- 维护 SDK 配置，支持默认配置和用户配置合并
- 提供配置初始化、获取和更新能力
- 配置项包括：appId、reportUrl、采样率、采集器开关等

#### 2.2.3 五大采集器 (collector/)

| 采集器类型 | 功能说明 | 核心实现文件 |
|------------|----------|--------------|
| 行为采集器 | 采集用户点击、滚动、路由切换等行为；支持自定义行为埋点 | behavior.ts |
| 错误采集器 | 采集 JS 运行时错误、Promise 错误、框架错误；支持自定义错误上报 | error.ts |
| 曝光采集器 | 采集 DOM 元素曝光（可见比例≥50% + 停留≥100ms） | exposure.ts |
| 性能采集器 | 采集 Web Vitals 指标和传统性能指标 | performance.ts |
| 资源采集器 | 采集资源加载错误、耗时和大小 | resource.ts |

所有采集器继承自 `BaseCollector` 基类，共享公共逻辑：
- 采集开关控制
- 日志公共字段生成
- 日志发送到 Worker

#### 自定义埋点支持
- **行为采集器**：提供 `reportCustomBehavior` 方法，支持业务方手动上报特定业务行为
- **错误采集器**：提供 `reportCustomError` 方法，支持业务方手动上报已知业务错误
- 自定义上报数据与自动采集数据使用相同的处理流程，包括采样、脱敏、去重和上报
- 支持 TypeScript 类型安全，提供完整的类型定义

#### 2.2.4 Web Worker (core/worker/)

- **worker.ts**：Worker 主逻辑，处理日志的核心线程
- **message.ts**：Worker 通信协议，定义主线程和 Worker 之间的消息格式
- **test.ts**：Worker 测试文件

Worker 核心功能：
- 日志采样：根据配置的采样率决定是否保留日志
- 日志脱敏：对敏感数据（如手机号、身份证号）进行脱敏处理
- 日志去重：避免重复日志上报
- 批量上报：支持 sendBeacon 和 fetch+keepalive 两种上报方式
- 离线存储：使用 IndexedDB 持久化存储未上报日志
- 自动重试：失败日志带指数退避重试
- 过期清理：定期清理过期日志

#### 2.2.5 上报模块 (reporter/)

- **storage.ts**：提供 IndexedDB 存储能力，用于持久化日志
- 支持日志保存、获取、清理和过期过滤

#### 2.2.6 类型定义 (types/index.ts)

- 定义 SDK 配置类型 `MonitorConfig`
- 定义五种日志类型：`BehaviorLog`、`ErrorLog`、`ExposureLog`、`PerformanceLog`、`ResourceLog`
- 支持自定义行为类型，允许业务方扩展 `BehaviorLog.behaviorType`
- 支持自定义错误类型，允许业务方扩展 `ErrorLog.errorType`
- 定义 Worker 通信协议类型
- 提供完整的 TypeScript 类型支持，包括自定义埋点和错误上报接口

#### 2.2.7 工具函数 (utils/)

- **dom.ts**：DOM 操作工具，如生成 UUID、获取元素信息等
- **privacy.ts**：隐私脱敏工具，如手机号、身份证号脱敏
- **sdk-version.ts**：SDK 版本管理

## 3. 数据流程

### 3.1 初始化流程

1. 业务方调用 `initMonitorSDK` 初始化 SDK
2. ConfigManager 合并默认配置和用户配置
3. 创建 Web Worker 实例
4. Worker 初始化完成后，实例化五大采集器
5. 采集器根据配置开关决定是否启用
6. 开始采集日志

### 3.2 日志采集流程

#### 自动采集流程
1. 采集器监听相应事件（如 click、error、scroll 等）
2. 事件触发时，采集器生成日志数据
3. 调用 `generateBaseLog` 生成日志公共字段
4. 通过 `sendLog` 方法将日志发送到 Worker

#### 自定义埋点流程
1. 业务方调用 `MonitorSDK.reportCustomBehavior()` 或 `MonitorSDK.reportCustomError()`
2. SDK 核心入口将调用转发给对应的采集器
3. 采集器生成日志数据或复用已有处理逻辑
4. 调用 `generateBaseLog` 生成日志公共字段
5. 通过 `sendLog` 方法将日志发送到 Worker

#### 日志处理与上报流程（自动采集和自定义埋点共用）
1. Worker 接收日志，进行采样、脱敏、去重处理
2. 处理后的日志加入内存队列
3. 当队列长度达到阈值或定时触发时，进行批量上报
4. 上报成功的日志从队列中移除，失败的日志持久化到 IndexedDB
5. 下次初始化时，从 IndexedDB 恢复未上报日志

### 3.3 日志上报策略

1. **优先使用 sendBeacon**：页面卸载时更可靠，无阻塞
2. **失败降级为 fetch+keepalive**：支持超时、重试
3. **批量上报**：每批上报 50 条日志，平衡请求次数和单请求大小
4. **指数退避重试**：最大重试次数 3 次，重试间隔 1s、2s、4s
5. **离线存储**：网络异常时，日志持久化到 IndexedDB
6. **自动恢复**：网络恢复后，自动重试上报离线日志

## 4. 扩展性设计

### 4.1 模块化设计

SDK 采用模块化设计，各组件之间低耦合，易于扩展：

- 采集器独立封装，可按需添加新的采集器
- Worker 与主线程通过通信协议交互，支持独立升级
- 配置管理支持动态更新，可从服务端拉取配置

### 4.2 自定义扩展

- **自定义行为埋点**：提供 `reportCustomBehavior` 接口，支持业务方自定义行为上报
- **自定义错误上报**：提供 `reportCustomError` 接口，支持业务方自定义错误上报
- **动态开关采集器**：提供 `toggleCollector` 接口，支持动态开启或关闭采集器

### 4.3 性能优化

- **Web Worker 架构**：日志处理和上报逻辑放在 Worker 线程，不阻塞主线程
- **内存队列 + IndexedDB**：优先内存存储，提升性能，同时确保数据不丢失
- **动态队列阈值**：根据设备内存调整队列阈值，避免低内存设备 OOM
- **事件委托**：行为采集使用事件委托，减少事件监听器数量
- **防抖处理**：滚动事件使用 200ms 防抖，减少采集频率

## 5. 浏览器兼容性

| 浏览器 | 版本要求 |
|--------|----------|
| Chrome | 60+      |
| Firefox | 63+     |
| Edge | 79+      |
| Safari | 13.1+    |
| **不支持 IE** | - |

## 6. 安全设计

### 6.1 数据安全

- **日志脱敏**：对敏感数据（如手机号、身份证号）进行脱敏处理
- **HTTPS 上报**：建议使用 HTTPS 协议上报日志，确保数据传输安全
- **同源策略**：上报请求需遵循浏览器同源策略，或后端配置 CORS

### 6.2 性能安全

- **采样机制**：支持配置采样率，避免大量日志导致性能问题
- **批量上报**：减少请求次数，降低网络开销
- **Worker 隔离**：日志处理逻辑与主线程隔离，避免影响页面性能

### 6.3 存储安全

- **IndexedDB 隔离**：使用独立的 IndexedDB 数据库存储日志，不影响业务数据
- **日志过期清理**：定期清理过期日志，避免存储容量过大

## 7. 监控与调试

### 7.1 控制台日志

SDK 在浏览器控制台输出带有 `[MonitorSDK]` 前缀的日志，方便调试：

- 初始化成功：`[MonitorSDK] 初始化成功（SDK 版本：x.x.x）`
- 行为触发：`[Worker 添加日志成功] UUID: xxx，类型: behavior`
- 上报成功：`[Worker 上报成功] sendBeacon 完成，批次日志数：1`

### 7.2 集成验证

1. **查看浏览器控制台日志**：确认 SDK 初始化成功、行为触发和上报成功
2. **查看 Network 请求**：确认有 POST 请求发送到 `reportUrl`
3. **查看 IndexedDB 存储**：确认离线日志存储和联网后自动上报

### 7.3 常见问题排查

| 问题现象 | 可能原因 | 解决方案 |
|----------|----------|----------|
| SDK 初始化失败 | Worker 路径错误、缺少 appId/reportUrl、浏览器不支持 Worker | 检查 Worker 路径、补充必传参数、更换现代浏览器 |
| 路由行为未采集 | 未注入 `monitorSpaRouteStart`/`monitorSpaRouteEnd` 事件 | 重新配置框架路由适配 |
| 曝光元素未采集 | 未加 `data-monitor-exposure` 属性、可见比例/停留时间未达阈值 | 给元素加属性、调整曝光规则配置 |
| 性能指标无数据 | 未安装 `web-vitals`、采样率设为 0、页面未加载完成 | 执行 `npm i web-vitals`、设 `sampleRate: 100`、等待页面加载完成 |
| 日志未上报 | 网络离线、后端接口返回错误、采样率过低 | 联网后自动补发、检查接口返回状态、测试环境设 `sampleRate: 100` |

## 8. 构建与部署

### 8.1 构建命令

```bash
# 构建 SDK
npm run build

# 构建并监听文件变化
npm run build:watch

# 启动示例应用
npm run start:example
```

### 8.2 构建产物

构建后生成的产物位于 `dist/` 目录，支持多种模块格式：

- `monitor-sdk.cjs.js`：CommonJS 格式，适用于 Node.js 环境
- `monitor-sdk.esm.js`：ES Module 格式，适用于现代浏览器和打包工具
- `monitor-sdk.umd.js`：UMD 格式，适用于直接通过 `<script>` 标签引入
- `types/index.d.ts`：TypeScript 类型定义文件

### 8.3 部署方式

1. **npm 包**：将构建产物发布到 npm，业务方通过 `npm install` 安装
2. **CDN 引入**：将 UMD 格式的文件部署到 CDN，业务方通过 `<script>` 标签引入
3. **源码集成**：将 SDK 源码复制到业务项目中，直接集成

## 9. 版本管理

- SDK 版本号格式：`x.y.z`
- 主版本号 `x`：重大架构变更，可能不兼容旧版本
- 次版本号 `y`：新增功能，兼容旧版本
- 修订号 `z`：bug 修复，兼容旧版本

## 10. 总结

Monitor SDK 是一个功能全面、高性能、高可靠的前端监控解决方案，采用现代化的 Web Worker 架构设计，确保监控逻辑不影响页面性能。通过五大采集器，实现了对用户行为、错误、曝光、性能和资源的全面监控，同时具备离线存储和自动重试机制，保证数据可靠性。

SDK 提供了简洁的 API 和详细的集成文档，支持 Vue 3 和 React 18 等主流框架，方便业务方快速集成。模块化的设计和良好的扩展性，也使得 SDK 能够适应不同业务场景的需求，是前端监控的理想选择。

---

# Monitor SDK 使用教程

## 1. 前置准备

### 1.1 环境要求

| 类别 | 要求说明 |
|------|----------|
| 浏览器兼容性 | 支持 Chrome 60+、Firefox 63+、Edge 79+、Safari 13.1+（**不支持 IE**） |
| 项目类型 | 单页应用（SPA，如 Vue/React 项目）优先；多页应用（MPA）需额外处理路由监听 |
| 打包工具 | 支持 Vite、Webpack 5+、Create React App 5+（需兼容 ESModule） |
| 网络权限 | 需允许向 `reportUrl`（后端上报接口）发送跨域请求（需后端配置 CORS） |

### 1.2 依赖安装

```bash
# 安装 web-vitals（性能采集器核心依赖）
npm install web-vitals@latest --save
```

## 2. SDK 集成

### 2.1 引入 SDK

将 SDK 目录复制到业务项目的 `src/` 目录下，如 `src/monitor/`。

### 2.2 初始化 SDK

在项目入口文件中初始化 SDK，传入必要的配置参数：

```javascript
// 项目入口文件（如 src/main.js/Vue 项目）
import { createApp } from 'vue';
import App from './App.vue';
import router from './router'; // 项目路由实例（SPA 需引入）

// 1. 引入 SDK 核心接口
import { initMonitorSDK, MonitorSDK } from './monitor/core/index';

// 2. 初始化 SDK（必传 appId 和 reportUrl）
initMonitorSDK({
  // 必传参数（从监控平台获取）
  appId: 'your-app-id-2024', // 应用唯一标识
  reportUrl: 'https://monitor.your-company.com/api/log/report', // 后端上报接口
  
  // 可选参数（默认值如下，可按需修改）
  sampleRate: 100, // 日志采样率（测试环境100%，生产环境建议50%）
  maxRetry: 3, // 上报失败重试次数（默认3次）
  logExpireDays: 7, // 日志过期时间（默认7天，过期自动清理）
  
  // 采集器开关（默认全开启，可按需关闭）
  needCollect: {
    behavior: true,  // 开启行为采集（点击/滚动/路由）
    error: true,     // 开启错误采集（JS/框架/Promise）
    exposure: true,  // 开启曝光采集（DOM 元素）
    performance: true, // 开启性能采集（Web Vitals/路由耗时）
    resource: true   // 开启资源采集（加载错误/耗时）
  }
});

// 3. 项目正常挂载（Vue 示例）
const app = createApp(App);
app.use(router).mount('#app');

// 4. 窗口卸载时销毁 SDK（避免内存泄漏）
window.addEventListener('beforeunload', () => {
  MonitorSDK.destroyMonitorSDK();
});
```

## 3. 框架适配

### 3.1 Vue 3 项目适配

#### 3.1.1 路由监听

修改 `src/router/index.ts`，注入路由事件：

```javascript
import { createRouter, createWebHistory } from 'vue-router';
import routes from './routes'; // 项目路由配置

const router = createRouter({
  history: createWebHistory(),
  routes
});

// 关键：注入路由事件（供 behavior/performance 采集器使用）
router.beforeEach((to, from, next) => {
  // 标记路由开始时间（计算停留时长）
  window.monitorSpaRouteStart?.();
  next();
});

router.afterEach((to, from) => {
  // 通知路由结束（上报路由行为和性能）
  window.monitorSpaRouteEnd?.(to.path, from.path);
});

export default router;
```

#### 3.1.2 框架错误捕获

修改 `src/main.js`，添加 Vue 错误处理：

```javascript
// 在 SDK 初始化后、app.mount 前添加
const app = createApp(App);
// 注入 Vue 错误处理（交给 error.js 采集）
app.config.errorHandler = (err, instance, info) => {
  window.monitorReportVueError?.(err, instance, info);
};
app.use(router).mount('#app');
```

### 3.2 React 18 项目适配

#### 3.2.1 路由监听 Hook

新建 `src/hooks/useMonitorRoute.js`：

```javascript
import { useLocation, useEffect, useRef } from 'react-router-dom';

export const useMonitorRoute = () => {
  const location = useLocation();
  const prevPathRef = useRef(location.pathname); // 记录上一个路由

  useEffect(() => {
    const currentPath = location.pathname;
    if (currentPath !== prevPathRef.current) {
      // 标记路由开始时间
      window.monitorSpaRouteStart?.();
      // 延迟通知路由结束（确保组件渲染完成）
      setTimeout(() => {
        window.monitorSpaRouteEnd?.(currentPath, prevPathRef.current);
        prevPathRef.current = currentPath;
      }, 0);
    }
  }, [location.pathname]);
};
```

#### 3.2.2 错误边界

新建 `src/components/ErrorBoundary.jsx`：

```javascript
import { Component } from 'react';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true }; // 渲染错误备用 UI
  }

  componentDidCatch(error, errorInfo) {
    // 交给 error.js 采集 React 错误
    window.monitorReportReactError?.(error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || <div>页面发生错误，请刷新重试</div>;
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
```

#### 3.2.3 项目入口集成

修改 `src/index.ts`：

```javascript
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { useMonitorRoute } from './hooks/useMonitorRoute';
// 引入 SDK
import { initMonitorSDK, MonitorSDK } from './monitor/core/index';

// 1. 初始化 SDK（同 Vue 初始化配置）
initMonitorSDK({
  appId: 'react-demo-app-2024',
  reportUrl: 'https://monitor.your-company.com/api/log/report',
  needCollect: { /* 采集器开关 */ }
});

// 2. 注入路由监听
const AppWithRouteMonitor = () => {
  useMonitorRoute(); // 路由行为采集
  return <App />;
};

// 3. 挂载项目（包裹错误边界）
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <BrowserRouter>
    <ErrorBoundary>
      <AppWithRouteMonitor />
    </ErrorBoundary>
  </BrowserRouter>
);

// 4. 卸载时销毁 SDK
window.addEventListener('beforeunload', () => {
  MonitorSDK.destroyMonitorSDK();
});
```

## 4. 五大采集器使用指南

### 4.1 行为采集器

#### 功能说明

自动采集 **点击行为、页面滚动、SPA 路由切换**，无需额外代码；支持自定义业务行为埋点。

#### 自动采集内容

| 行为类型 | 采集字段 | 触发时机 |
|----------|----------|----------|
| 点击行为 | 目标元素文本/class/标签名、点击坐标（x/y） | 页面任意元素点击（事件委托） |
| 滚动行为 | 滚动百分比（0%~100%） | 滚动事件（200ms 防抖） |
| 路由切换行为 | 来源路由、目标路由、停留时长（ms） | 路由变化时（hash/history/框架） |

#### 自定义行为埋点

上报特定业务行为（如“提交订单”“领取优惠券”），调用 `MonitorSDK.reportCustomBehavior` 接口：

```javascript
// 示例：Vue 组件中提交订单按钮点击
const handleSubmitOrder = (orderId) => {
  // 1. 业务逻辑：调用提交订单接口
  submitOrderApi(orderId).then(() => {
    // 2. 自定义行为埋点（上报订单提交成功）
    MonitorSDK.reportCustomBehavior('submit_order_success', {
      orderId: orderId,       // 订单ID（业务字段）
      goodsId: 'g12345',      // 商品ID（业务字段）
      amount: 199.9,          // 订单金额（业务字段）
      payType: 'alipay'       // 支付方式（业务字段）
    });
  });
};
```

### 4.2 错误采集器

#### 功能说明

自动采集 **JS 运行时错误、Promise 未捕获错误、Vue/React 框架错误**；支持自定义错误上报。

#### 自动采集内容

| 错误类型 | 采集字段 | 触发时机 |
|----------|----------|----------|
| JS 错误 | 错误信息、错误栈、错误文件/行号/列号 | `window.onerror` 触发 |
| Promise 错误 | 错误信息、错误栈 | `window.onunhandledrejection` 触发 |
| Vue 错误 | 错误信息、错误栈、组件实例、错误类型 | `app.config.errorHandler` 触发 |
| React 错误 | 错误信息、错误栈、组件栈 | 错误边界 `componentDidCatch` 触发 |

#### 自定义错误上报

上报已知业务错误（如接口返回的“用户未登录”错误），调用 `MonitorSDK.reportCustomError` 接口：

```javascript
// 示例：React 中接口请求失败上报
const fetchUserInfo = async () => {
  try {
    const res = await fetch('/api/user/info');
    const data = await res.json();
    if (data.code === 401) {
      // 自定义错误：用户未登录
      MonitorSDK.reportCustomError({
        errorType: 'api_auth_error', // 自定义错误类型
        message: '用户未登录，需重新登录',
        apiUrl: '/api/user/info',    // 接口地址
        statusCode: 401,           // 接口状态码
        userId: 'unknown'           // 用户ID（业务字段）
      });
    }
  } catch (err) {
    // 网络错误会被 error.js 自动采集，无需额外上报
  }
};
```

### 4.3 曝光采集器

#### 功能说明

自动采集 **DOM 元素曝光**（默认规则：可见比例≥50% + 停留≥100ms），支持动态 DOM（如列表渲染）。

#### 使用方法

给需要监控曝光的元素添加 `data-monitor-exposure` 属性（必加），可通过 `data-*` 自定义业务字段：

```html
<!-- Vue 模板示例：商品列表项曝光 -->
<template>
  <div class="goods-list">
    <div 
      class="goods-item" 
      v-for="item in goodsList" 
      :key="item.id"
      data-monitor-exposure  <!-- 必加：标记需要曝光的元素 -->
      :data-goods-id="item.id"  <!-- 自定义业务字段：商品ID -->
      :data-goods-category="item.category"  <!-- 自定义业务字段：商品分类 -->
    >
      <img :src="item.img" alt="商品图片">
      <div class="goods-name">{{ item.name }}</div>
    </div>
  </div>
</template>

<!-- React 组件示例：Banner 按钮曝光 -->
function DownloadBanner() {
  return (
    <div class="banner">
      <button 
        class="download-btn"
        data-monitor-exposure  <!-- 必加 -->
        data-btn-type="app_download"  <!-- 自定义业务字段：按钮类型 -->
      >
        立即下载 App
      </button>
    </div>
  );
}
```

#### 配置调整（可选）

修改 `src/monitor/collector/exposure.js` 中的曝光规则：

```javascript
// 曝光规则配置（默认值）
const EXPOSURE_CONFIG = {
  visiblePercent: 50, // 可见比例≥50% 算有效曝光（可改为30/70）
  minStayTime: 100,   // 停留≥100ms 算有效曝光（可改为200）
  observerRootMargin: '0px' // 视口边缘扩展（如改为“0px 0px -50px 0px”避免底部误判）
};
```

### 4.4 性能采集器

#### 功能说明

自动采集 **Web Vitals 核心指标、传统性能指标、SPA 路由性能**，需安装 `web-vitals` 依赖。

#### 依赖安装（必做）

```bash
# 安装最新版 web-vitals
npm install web-vitals@latest --save
```

#### 自动采集内容

| 性能指标类型 | 具体指标 | 采集时机 |
|--------------|----------|----------|
| Web Vitals | LCP（最大内容绘制）、CLS（累积布局偏移）、INP（交互下一步延迟） | 指标计算完成后（如页面加载完成） |
| 传统指标 | FP（首次绘制）、FCP（首次内容绘制）、TTFB（首字节时间） | 页面 `load` 事件后 |
| SPA 路由性能 | 路由切换耗时（路由开始→渲染完成）、来源/目标路由 | 路由切换结束时 |

#### 配置调整（可选）

修改性能指标采样率（减少生产环境上报量）：

```javascript
// 初始化 SDK 时设置采样率为 50%（仅50%用户的性能数据上报）
initMonitorSDK({
  sampleRate: 50, // 性能/行为/错误等所有日志共用此采样率
  needCollect: { performance: true }
});
```

### 4.5 资源采集器

#### 功能说明

自动采集 **资源加载错误、资源加载耗时、资源大小**，无需业务方额外操作。

#### 自动采集内容

| 资源类型 | 采集字段 | 触发时机 |
|----------|----------|----------|
| 图片/脚本/CSS | 加载错误（如404）、资源URL、加载耗时（ms）、资源大小（KB）、状态码 | 资源加载完成/失败时 |
| Fetch/XHR 请求 | 接口URL、加载耗时、状态码、响应大小 | 请求完成时 |

#### 配置调整（可选）

修改资源采集间隔（默认3秒一次，减少高频采集）：

```javascript
// src/monitor/collector/resource.js
export class ResourceCollector extends BaseCollector {
  // 资源采集间隔（默认3000ms，可改为5000）
  private collectInterval = 3000; 
  // ... 其他代码
}
```

## 5. 集成验证与问题排查

### 5.1 集成验证

#### 方法1：查看浏览器控制台日志

打开浏览器 DevTools → Console 面板，筛选 `[MonitorSDK]` 前缀的日志，确认：
- 初始化成功：输出 `[MonitorSDK] 初始化成功（SDK 版本：x.x.x）`；
- 行为触发：点击页面元素，输出 `[Worker 添加日志成功] UUID: xxx，类型: behavior`；
- 上报成功：触发采集后，输出 `[Worker 上报成功] sendBeacon 完成，批次日志数：1`。

#### 方法2：查看 Network 请求

打开 DevTools → Network 面板，筛选 `report`（匹配上报接口 `reportUrl`），确认：
- 有 POST 请求发送到 `reportUrl`；
- 请求体 `FormData` 或 `JSON` 中包含 `events` 数组（即采集的日志）。

#### 方法3：查看 IndexedDB 存储

打开 DevTools → Application → IndexedDB → MonitorSDK_LogDB → LogStore，确认：
- 离线时采集的日志会存储在此处；
- 联网后日志会自动上报并清空。

### 5.2 常见问题排查

| 问题现象 | 可能原因 | 解决方案 |
|----------|----------|----------|
| SDK 初始化失败 | 1. Worker 路径错误；2. 缺少 appId/reportUrl；3. 浏览器不支持 Worker | 1. 检查 `worker.js` 路径是否符合打包规则；2. 补充必传参数；3. 更换现代浏览器 |
| 路由行为未采集 | 未注入 `monitorSpaRouteStart`/`monitorSpaRouteEnd` 事件 | 重新配置框架路由适配 |
| 曝光元素未采集 | 1. 未加 `data-monitor-exposure` 属性；2. 可见比例/停留时间未达阈值 | 1. 给元素加属性；2. 调整 `EXPOSURE_CONFIG` 阈值 |
| 性能指标无数据 | 1. 未安装 `web-vitals`；2. 采样率设为0；3. 页面未加载完成 | 1. 执行 `npm i web-vitals`；2. 设 `sampleRate: 100`；3. 等待页面加载完成 |
| 日志未上报 | 1. 网络离线（日志已落盘）；2. 后端接口返回错误；3. 采样率过低 | 1. 联网后自动补发；2. 检查接口返回状态；3. 测试环境设 `sampleRate: 100` |

## 6. SDK 对外接口说明

| 接口名称 | 用途 | 调用示例 |
|----------|------|----------|
| `initMonitorSDK(config)` | 初始化 SDK（必调用） | `initMonitorSDK({ appId: 'xxx', reportUrl: 'xxx' })` |
| `MonitorSDK.toggleCollector(type, isEnable)` | 动态开关采集器 | `MonitorSDK.toggleCollector('exposure', false)`（关闭曝光采集） |
| `MonitorSDK.reportCustomBehavior(type, data)` | 自定义行为埋点 | `MonitorSDK.reportCustomBehavior('submit_order', { orderId: '123' })` |
| `MonitorSDK.reportCustomError(data)` | 自定义错误上报 | `MonitorSDK.reportCustomError({ errorType: 'api_error', message: 'xxx' })` |
| `MonitorSDK.destroyMonitorSDK()` | 销毁 SDK（页面卸载时调用） | `window.addEventListener('beforeunload', () => MonitorSDK.destroyMonitorSDK())` |

## 7. 最佳实践

### 7.1 生产环境配置

- 采样率：建议生产环境设置为 50% 或更低，减少服务器压力
- 采集器开关：根据业务需求，关闭不必要的采集器
- HTTPS 上报：使用 HTTPS 协议上报日志，确保数据传输安全

### 7.2 性能优化

- 避免在高频事件（如 scroll、resize）中手动调用埋点接口
- 合理设置曝光规则，避免过多无效曝光日志
- 对于大型列表，考虑使用虚拟滚动，减少 DOM 元素数量

### 7.3 数据安全

- 不要在日志中包含敏感数据（如密码、token 等）
- 对于需要上报的敏感数据，确保已进行脱敏处理
- 定期检查上报日志内容，确保数据合规

### 7.4 监控数据分析

- 结合业务场景，设置合理的告警规则
- 定期分析监控数据，发现潜在问题和优化点
- 将监控数据与业务指标结合，评估业务影响

## 8. 示例应用

项目提供了 React 示例应用，位于 `example/` 目录下，用于演示 SDK 的集成和使用：

```bash
# 启动示例应用
npm run start:example
```

示例应用包含：
- SDK 初始化和配置
- 路由监听和错误捕获
- 各种行为触发（点击、滚动、路由切换）
- 元素曝光示例

可以通过示例应用了解 SDK 的完整集成流程和效果。

## 9. 总结

Monitor SDK 是一个功能全面、高性能、高可靠的前端监控解决方案，通过简单的集成步骤，即可实现对用户行为、错误、曝光、性能和资源的全面监控。SDK 采用 Web Worker 架构设计，确保监控逻辑不影响页面性能，同时具备离线存储和自动重试机制，保证数据可靠性。

通过本教程的指导，您可以快速完成 SDK 的集成和配置，并根据业务需求进行自定义扩展。建议在集成后进行充分的验证和测试，确保 SDK 正常工作，并根据生产环境的实际情况调整配置，以达到最佳的监控效果和性能表现。

---

**集成完成后，您可以通过监控平台查看采集到的日志数据，进行数据分析和问题排查，从而提升网站的用户体验和性能表现。**