# Monitor SDK 集成手册（业务方版）
## 手册说明
本文档面向前端业务方开发人员，提供 **Monitor SDK（含五大采集器）** 的完整集成流程，覆盖「环境准备→SDK引入→框架适配→功能验证→问题排查」，适配 Vue 3/React 18 主流框架，确保30分钟内完成基础集成。


## 一、前置准备
### 1.1 环境要求
| 类别                | 要求说明                                                                 |
|---------------------|--------------------------------------------------------------------------|
| 浏览器兼容性        | 支持 Chrome 60+、Firefox 63+、Edge 79+、Safari 13.1+（**不支持 IE**）    |
| 项目类型            | 单页应用（SPA，如 Vue/React 项目）优先；多页应用（MPA）需额外处理路由监听 |
| 打包工具            | 支持 Vite、Webpack 5+、Create React App 5+（需兼容 ESModule）             |
| 网络权限            | 需允许向 `reportUrl`（后端上报接口）发送跨域请求（需后端配置 CORS）       |

### 1.2 依赖清单
| 依赖名称       | 版本要求       | 用途                          | 安装命令                          |
|----------------|----------------|-------------------------------|-----------------------------------|
| `web-vitals`   | ≥3.0.0         | 性能采集器（performance.js）核心 | `npm i web-vitals@latest --save`  |
| 无其他强制依赖 | -              | 其他采集器无额外依赖          | -                                 |

### 1.3 SDK 目录结构确认
集成前需确保 SDK 目录完整（由监控团队提供），结构如下（不可缺失核心文件）：
```
monitor/                  # SDK 根目录（放入业务项目 src/ 下，如 src/monitor/）
├── core/                 # 核心引擎（采集器依赖）
│   ├── index.ts          # SDK 入口（暴露 initMonitorSDK/MonitorSDK）
│   ├── config.js         # 配置管理（开关/采样率）
│   └── worker/           # Web Worker（日志处理/上报）
│       ├── worker.js     # Worker 主逻辑
│       └── message.js    # 通信协议
├── collector/            # 五大采集器（核心功能）
│   ├── base.js           # 采集基类
│   ├── behavior.js       # 行为采集器（点击/滚动/路由）
│   ├── error.js          # 错误采集器（JS/框架/Promise）
│   ├── exposure.js       # 曝光采集器（DOM 元素曝光）
│   ├── performance.js    # 性能采集器（Web Vitals/传统指标）
│   └── resource.js       # 资源采集器（加载错误/耗时）
├── reporter/             # 上报模块（日志兜底）
│   └── storage.js        # IndexedDB 存储（离线日志）
├── utils/                # 工具函数
│   ├── dom.js            # DOM 操作（元素信息/UUID）
│   ├── privacy.js        # 隐私脱敏（手机号/身份证）
│   └── sdk-version.js    # SDK 版本（日志公共字段）
└── types/                # TypeScript 类型（可选，强类型项目用）
    └── index.ts          # 日志类型定义（如 BehaviorLog/ErrorLog）
```


## 二、核心集成流程（通用步骤）
### 2.1 引入 SDK 到业务项目
1. 将上述 `monitor/` 目录复制到业务项目的 `src/` 目录下（如 `src/monitor/`）；
2. 在项目入口文件（Vue 是 `src/main.js`，React 是 `src/index.ts`）中引入 SDK 核心接口。


### 2.2 SDK 初始化（关键步骤）
SDK 需在项目挂载前初始化，确保采集不遗漏。以下是**通用初始化代码**，需根据业务配置修改参数：

```javascript
// 项目入口文件（如 src/main.js/Vue 项目）
import { createApp } from 'vue';
import App from './App.vue';
import router from './router'; // 项目路由实例（SPA 需引入）

// 1. 引入 SDK 核心接口
import { initMonitorSDK, MonitorSDK } from './monitor/core/index';

// 2. 初始化 SDK（必传 appId 和 reportUrl，其他参数可选）
initMonitorSDK({
  // 必传参数（从监控平台获取）
  appId: 'your-app-id-2024', // 应用唯一标识（如“vue-demo-app”）
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

// 3. 项目正常挂载（Vue 示例，React 见 2.3 节）
const app = createApp(App);
app.use(router).mount('#app');

// 4. 窗口卸载时销毁 SDK（避免内存泄漏）
window.addEventListener('beforeunload', () => {
  MonitorSDK.destroyMonitorSDK();
});
```


### 2.3 框架适配（Vue 3 / React 18）
#### 2.3.1 Vue 3 项目适配
需补充「路由监听」和「框架错误捕获」，确保路由行为和 Vue 错误能被采集：

1. **路由适配**（修改 `src/router/index.ts`）：
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

2. **Vue 错误捕获**（修改 `src/main.js`）：
```javascript
// 在 SDK 初始化后、app.mount 前添加
const app = createApp(App);
// 注入 Vue 错误处理（交给 error.js 采集）
app.config.errorHandler = (err, instance, info) => {
  window.monitorReportVueError?.(err, instance, info);
};
app.use(router).mount('#app');
```


#### 2.3.2 React 18 项目适配
需补充「路由监听 Hook」和「错误边界」，确保路由行为和 React 错误能被采集：

1. **路由监听 Hook**（新建 `src/hooks/useMonitorRoute.js`）：
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

2. **错误边界**（新建 `src/components/ErrorBoundary.jsx`）：
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

3. **项目入口集成**（修改 `src/index.ts`）：
```javascript
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { useMonitorRoute } from './hooks/useMonitorRoute';
// 引入 SDK
import { initMonitorSDK, MonitorSDK } from './monitor/core/index';

// 1. 初始化 SDK（同 2.2 节配置）
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


## 三、五大采集器使用指南
### 3.1 行为采集器（behavior.js）
#### 功能说明
自动采集 **点击行为、页面滚动、SPA 路由切换**，无需额外代码；支持自定义业务行为埋点。

#### 自动采集内容
| 行为类型       | 采集字段                                                                 | 触发时机                          |
|----------------|--------------------------------------------------------------------------|-----------------------------------|
| 点击行为       | 目标元素文本/class/标签名、点击坐标（x/y）                                 | 页面任意元素点击（事件委托）      |
| 滚动行为       | 滚动百分比（0%~100%）                                                    | 滚动事件（200ms 防抖）            |
| 路由切换行为   | 来源路由、目标路由、停留时长（ms）                                        | 路由变化时（hash/history/框架）  |

#### 自定义行为埋点（业务方调用）
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


### 3.2 错误采集器（error.js）
#### 功能说明
自动采集 **JS 运行时错误、Promise 未捕获错误、Vue/React 框架错误**；支持自定义错误上报。

#### 自动采集内容
| 错误类型       | 采集字段                                                                 | 触发时机                          |
|----------------|--------------------------------------------------------------------------|-----------------------------------|
| JS 错误        | 错误信息、错误栈、错误文件/行号/列号                                      | `window.onerror` 触发             |
| Promise 错误   | 错误信息、错误栈                                                         | `window.onunhandledrejection` 触发 |
| Vue 错误       | 错误信息、错误栈、组件实例、错误类型（如“render error”）                   | `app.config.errorHandler` 触发    |
| React 错误     | 错误信息、错误栈、组件栈                                                 | 错误边界 `componentDidCatch` 触发  |

#### 自定义错误上报（业务方调用）
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


### 3.3 曝光采集器（exposure.js）
#### 功能说明
自动采集 **DOM 元素曝光**（默认规则：可见比例≥50% + 停留≥100ms），支持动态 DOM（如列表渲染）。

#### 业务方需做的操作
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


### 3.4 性能采集器（performance.js）
#### 功能说明
自动采集 **Web Vitals 核心指标、传统性能指标、SPA 路由性能**，需安装 `web-vitals` 依赖。

#### 依赖安装（必做）
```bash
# 安装最新版 web-vitals
npm install web-vitals@latest --save
# 或 yarn 安装
yarn add web-vitals@latest
```

#### 自动采集内容
| 性能指标类型   | 具体指标                                                                 | 采集时机                          |
|----------------|--------------------------------------------------------------------------|-----------------------------------|
| Web Vitals     | LCP（最大内容绘制）、CLS（累积布局偏移）、INP（交互下一步延迟）            | 指标计算完成后（如页面加载完成）  |
| 传统指标       | FP（首次绘制）、FCP（首次内容绘制）、TTFB（首字节时间）                    | 页面 `load` 事件后                |
| SPA 路由性能   | 路由切换耗时（路由开始→渲染完成）、来源/目标路由                           | 路由切换结束时                    |

#### 配置调整（可选）
修改性能指标采样率（减少生产环境上报量）：
```javascript
// 初始化 SDK 时设置采样率为 50%（仅50%用户的性能数据上报）
initMonitorSDK({
  sampleRate: 50, // 性能/行为/错误等所有日志共用此采样率
  needCollect: { performance: true }
});
```


### 3.5 资源采集器（resource.js）
#### 功能说明
自动采集 **资源加载错误、资源加载耗时、资源大小**，无需业务方额外操作。

#### 自动采集内容
| 资源类型       | 采集字段                                                                 | 触发时机                          |
|----------------|--------------------------------------------------------------------------|-----------------------------------|
| 图片/脚本/CSS  | 加载错误（如404）、资源URL、加载耗时（ms）、资源大小（KB）、状态码          | 资源加载完成/失败时               |
| Fetch/XHR 请求 | 接口URL、加载耗时、状态码、响应大小                                       | 请求完成时                        |

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


## 四、集成验证与问题排查
### 4.1 集成验证（确认功能生效）
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


### 4.2 常见问题排查
| 问题现象                | 可能原因                                                                 | 解决方案                                                                 |
|-------------------------|--------------------------------------------------------------------------|--------------------------------------------------------------------------|
| SDK 初始化失败          | 1. Worker 路径错误；2. 缺少 appId/reportUrl；3. 浏览器不支持 Worker       | 1. 检查 `worker.js` 路径是否符合打包规则；2. 补充必传参数；3. 更换现代浏览器 |
| 路由行为未采集          | 未注入 `monitorSpaRouteStart`/`monitorSpaRouteEnd` 事件                  | 重新配置框架路由适配（见 2.3 节）                                       |
| 曝光元素未采集          | 1. 未加 `data-monitor-exposure` 属性；2. 可见比例/停留时间未达阈值       | 1. 给元素加属性；2. 调整 `EXPOSURE_CONFIG` 阈值                         |
| 性能指标无数据          | 1. 未安装 `web-vitals`；2. 采样率设为0；3. 页面未加载完成               | 1. 执行 `npm i web-vitals`；2. 设 `sampleRate: 100`；3. 等待页面加载完成 |
| 日志未上报              | 1. 网络离线（日志已落盘）；2. 后端接口返回错误；3. 采样率过低             | 1. 联网后自动补发；2. 检查接口返回状态；3. 测试环境设 `sampleRate: 100`   |


## 五、附录：SDK 对外接口说明
| 接口名称                | 用途                                                                 | 调用示例                                                                 |
|-------------------------|----------------------------------------------------------------------|--------------------------------------------------------------------------|
| `initMonitorSDK(config)` | 初始化 SDK（必调用）                                                 | `initMonitorSDK({ appId: 'xxx', reportUrl: 'xxx' })`                     |
| `MonitorSDK.toggleCollector(type, isEnable)` | 动态开关采集器 | `MonitorSDK.toggleCollector('exposure', false)`（关闭曝光采集）           |
| `MonitorSDK.reportCustomBehavior(type, data)` | 自定义行为埋点 | `MonitorSDK.reportCustomBehavior('submit_order', { orderId: '123' })`    |
| `MonitorSDK.reportCustomError(data)` | 自定义错误上报 | `MonitorSDK.reportCustomError({ errorType: 'api_error', message: 'xxx' })`|
| `MonitorSDK.destroyMonitorSDK()` | 销毁 SDK（页面卸载时调用） | `window.addEventListener('beforeunload', () => MonitorSDK.destroyMonitorSDK())` |


手册至此结束，若集成中遇到文档未覆盖的问题，可联系监控团队提供 `Console` 日志和 `Network` 请求截图，协助排查。