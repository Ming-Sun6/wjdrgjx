# 无尽冬日打熊伤害模型 v0.4

数据驱动的 10 回合打熊期望伤害计算与阵容优化工具，技术栈为 React、TypeScript、Vite、Vitest。

## 开发

```powershell
npm.cmd install
npm.cmd run dev
```

开发服务器默认位于 `http://localhost:5173/`。

## 验证

```powershell
npm.cmd test
npm.cmd run typecheck
```

## 生产构建

```powershell
npm.cmd run build
```

生产网站输出到 `dist/`。这是纯前端 Vite 网站，伤害计算和优化器均在用户浏览器内运行，不需要自建后端。

## 本地生产预览

先完成生产构建，再运行：

```powershell
npm.cmd run preview
```

预览命令读取 `dist/`，用于核对真实生产资源，而不是启动开发模式。`npm.cmd run build:core` 可单独生成核心 ES 模块到 `dist-core/`；`npm.cmd run benchmark` 会重建核心模块并运行例行优化性能样本。

模型规则见 `docs/`，v0.1 车身技能与 exact 比例算法见 `docs/body-skill-options-v0.1.md`，v0.2 双输入与伤害区间见 `docs/ui-v0.2.md`，车头规则见 `docs/head-hero-system.md`，v0.4 战报英雄静态修正见 `docs/report-hero-system.md`，本轮车头审计见 `docs/v0.4-head-hero-skill-audit.md`，发布前检查见 `docs/RELEASE-CHECKLIST.md`。
