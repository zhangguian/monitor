import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import babel from '@rollup/plugin-babel';
import terser from '@rollup/plugin-terser';
import webWorkerLoader from 'rollup-plugin-web-worker-loader';
import copy from 'rollup-plugin-copy';
import typescript from '@rollup/plugin-typescript';
import fs from 'fs';
import path from 'path';
const pkgPath = path.resolve(__dirname, 'package.json'); // __dirname 现在可用
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
// 排除外部依赖（不打包进 SDK，让用户自己安装）
const external = [];

// 基础 Babel 配置（共用部分）
const baseBabelOptions = {
    babelrc: true,
    extensions: ['.js', '.ts'],
};

// 1. ESM/CJS 用的 Babel 配置（保留 runtime 模式，优化体积）
const runtimeBabelOptions = {
    ...baseBabelOptions,
    exclude: /node_modules\/(?!@babel\/runtime)/,
    babelHelpers: 'runtime',
};

// 2. UMD 用的 Babel 配置（内联辅助函数，无需外部依赖）
const inlineBabelOptions = {
    ...baseBabelOptions,
    exclude: /node_modules/, // UMD 无需保留 @babel/runtime，直接内联
    babelHelpers: 'inline', // 关键：内联辅助函数
    plugins: [
        // 确保辅助函数正确转换（需安装 @babel/plugin-transform-runtime）
        ['@babel/plugin-transform-runtime', { useESModules: false }]
    ],
};


// 生成输出配置（按格式区分 Babel 配置）
const getOutputConfig = () => {
    // 基础输出配置
    const baseOutput = {
        sourcemap: true,
        name: 'MonitorSDK',
        exports: 'named',
        inlineDynamicImports: true
    };

    return [
        // 1. ESM 格式（用 runtime Babel 配置）
        {
            ...baseOutput,
            file: pkg.module,
            format: 'esm',
            plugins: [],
        },
        // 2. CommonJS 格式（用 runtime Babel 配置）
        {
            ...baseOutput,
            file: pkg.main,
            format: 'cjs',
            plugins: [],
        },
        // 3. UMD 格式（用内联 Babel 配置，自包含辅助函数）
        {
            ...baseOutput,
            file: pkg.browser,
            format: 'umd',
            plugins: [],
        },
        // 4. 压缩版 UMD（同上，添加 terser）
        {
            ...baseOutput,
            file: 'dist/monitor-sdk.umd.min.js',
            format: 'umd',
            sourcemap: false,
            plugins: [terser()], // 启用压缩
        },
    ];
};

export default {
    // 入口文件（src/index.ts）
    input: 'src/index.ts',
    // 多输出格式（适配不同使用场景）
    output: getOutputConfig(),
    // 外部依赖（不打包进 SDK）
    external,
    // 插件配置
    plugins: [
        webWorkerLoader({
            targetPlatform: 'browser', // 目标平台为浏览器
            inline: 'blob', // 强制内联为 Blob URL
            format: 'iife',
            preserveSource: true, // 不保留原始 Worker 源码，避免导出干扰
        }),
        typescript({
            tsconfig: './tsconfig.json', // 指定 TS 配置文件
            tslib: require.resolve('tslib'),
            declaration: true, // 生成类型声明（与 tsconfig 一致）
            declarationDir: './dist/types', // 类型文件输出目录
            include: ['src/**/*'],
        }),
        // 1. 解析 node_modules 依赖（如 web-vitals）
        resolve(),
        // 2. 转译 CommonJS 依赖为 ESM
        commonjs(),
        // 3. 内联 Web Worker（关键！避免单独处理 Worker 文件）

        // 4. Babel 转译（兼容低版本浏览器，如 IE11）
        babel(({ format }) => {
            return format === 'umd' ? inlineBabelOptions : runtimeBabelOptions;
        }),
        // 5. 复制 TypeScript 类型文件到 dist（TS 项目使用）
        copy({
            targets: [
                { src: 'src/types/**/*', dest: 'dist/types' }
            ]
        })
    ]
};