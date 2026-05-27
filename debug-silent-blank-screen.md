# Debug Session: silent-blank-screen

Status: [OPEN]

## Symptom
网页打开白屏，但浏览器控制台没有明显错误。

## Hypotheses
1. 生产 HTML/JS/CSS 资源被 EdgeOne 缓存为旧版本，当前浏览器加载的是旧 bundle，控制台可能没有新错误但页面仍不可见。
2. React 已经挂载，但 CSS 或布局层导致内容透明、被覆盖、位于视口外或与背景同色，因此控制台无异常。
3. 首屏等待 API 或图片资源导致主要可见内容迟迟不出现；请求失败被前端吞掉，仅显示空白区域。
4. 根级错误兜底只捕获同步初始化异常，React 组件树异步/渲染阶段异常被 React 处理后仍可能卸载 root，而没有自定义 Error Boundary 显示可见错误页。
5. EdgeOne 部署环境返回的 HTML 完整但 module script/CSS 实际加载失败或 MIME/路径异常，浏览器可能在 Network 中失败而 Console 不明显。

## Evidence Log
- `npx tsc -p tsconfig.app.json --noEmit` 通过，说明当前源码层面没有未导入符号这类 TypeScript 可见错误。
- `index.html` 当前 `#root` 是空节点：如果 JS bundle 没有执行、被缓存/拦截、MIME 错误或早期加载失败，页面会天然表现为无报错白屏。
- `src/main.tsx` 只有入口同步 `try/catch`，不能覆盖 React 组件渲染阶段的异常；这类异常可能让组件树卸载，但不会触发当前 `renderFallback`。
- `vite.config.ts` 当前生产构建启用了 `treeshake.moduleSideEffects: false`，这是高风险配置，可能错误移除依赖包或样式相关的副作用模块，属于“无明显控制台错误但页面异常”的可疑点。

## Root Cause
待确认。当前最可操作的证据指向两个防护缺口：`#root` 没有静态兜底内容，以及 React 组件树没有 Error Boundary。无论实际根因是 JS 加载失败、缓存旧包、还是渲染阶段异常，这两个缺口都会让用户看到白屏。

## Fix
- `index.html` 的 `#root` 内加入静态可见加载兜底。即使 JS 未执行、资源被缓存/拦截或 module script 加载失败，用户也不会看到纯白屏。
- `src/main.tsx` 增加 `RootErrorBoundary`，覆盖 React 组件渲染阶段异常；发生错误时复用 `renderFallback` 显示可见错误页。
- `vite.config.ts` 将高风险 `treeshake.moduleSideEffects: false` 改为 `treeshake: true`，避免错误删除依赖或样式副作用模块。
- `src/test/app-copy.test.ts` 增加回归检查：静态加载兜底、Error Boundary、禁用高风险 tree-shaking 配置。

## Verification
- `npx tsc -p tsconfig.app.json --noEmit` 通过。
- `npm test` 通过：2 个测试文件，41 个测试。
- `npm run lint` 通过。
- `npm run build` 通过，生产构建成功。
