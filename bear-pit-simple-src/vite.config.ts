import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// https://vitejs.dev/config/
// viteSingleFile：把 JS/CSS 内联进单个 index.html，可直接双击打开。
export default defineConfig({
  root: 'src',
  plugins: [react(), viteSingleFile()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    // 默认 target 是 Chrome ≥87，会把 ?? / ?. 等 ES2020 语法原样保留，
    // 低版本 Chrome 解析内联 module 脚本时直接 SyntaxError → 白屏。
    // 降到 es2018 让 esbuild 把这些语法降级。
    // 注意：混淆器(javascript-obfuscator)输出本身用了箭头函数/const/可选 catch，
    // 实际最低支持约 Chrome 66；若需更低需另上 @vitejs/plugin-legacy。
    target: 'es2018',
  },
  server: {
    port: 5173,
    open: true,
  },
})
