# 发布候选检查清单

版本：v0.4

验证日期：2026-09-10
形态：纯前端 React + TypeScript + Vite 静态网站。伤害计算、精确概率状态传播和优化器均在用户浏览器中运行，不需要自建后端服务器。

## 冻结的核心规则

- 单兵种单回合基础伤害：`D0 = 0.0075577 × sqrt(min(N, 5000)) × sqrt(n) × Cd × Ct × (1 + P) × (1 + A)`。
- `N` 是当前整支实际参与计算的总兵数；`n` 是当前兵种兵数。
- `Cd`：盾兵 1、矛兵 3、射手 4；`Ct` 只读取已确认常数，缺失时不可计算，不插值或外推。
- 计算过程保持完整浮点精度；只有最终出征容量按已确认规则 `floor`。
- Battle Report、Buff、Skill、Expert 是相互独立的大乘区。
- `defenseReduction` 当前等效倍率为 `1 + sum(r)`，不使用 `1 / (1-r)`，也不建立未经确认的敌方防御映射。
- 打熊固定 10 回合、敌方全盾、无限生命、不提前结束。

## 2026-09-10 验证结果

- [x] Vitest：42 个测试文件，461/461 通过。
- [x] TypeScript：`tsc --noEmit` 通过。
- [x] Vite production build：114 个模块，构建通过。
- [x] Benchmark：构建和固定样本全部完成，详见 `performance-benchmark.md`。
- [x] Production preview：使用 `npm.cmd run preview -- --host 127.0.0.1 --port 4173` 启动成功。
- [x] 生产首页、主 JS、CSS 和 optimizer worker 均从 `dist/` 正常加载。
- [x] 浏览器控制台无 error；页面 DOM 中无本机绝对路径或 localhost 依赖。
- [x] 桌面视口未出现页面级横向溢出。
- [x] 生产版0.01%比例优化使用可证明的 exact 分支定界，并由1%/0.1% naive Golden Test验证。

## 生产产物

- `dist/index.html`：0.47 kB，gzip 0.35 kB。
- `dist/assets/index-vqM-08zk.js`：416.61 kB，gzip 120.10 kB。
- `dist/assets/index-jN5Pz-jH.css`：6.43 kB，gzip 1.96 kB。
- `dist/assets/optimizer.worker-CLp0U89D.js`：194.33 kB。
- Vite 使用 GitHub Pages 项目基址 `/whiteout-bear-damage-model/`，产物不依赖开发机路径、VS Code 或本机 Node 运行时。

## 当前 Pending

用户可见的 `RULE_UNKNOWN`：0。底层数据仍保留 4 个 `DATA_SOURCE_UNCERTAIN` 车身占位，正常 UI 和优化候选均隐藏：

- 丽娅拉：缺少可用于打熊的完整车身远征技能资料。
- 艾丝蒂拉：缺少可用于打熊的完整车身远征技能资料。
- 埃莉诺：缺少可用于打熊的完整车身远征技能资料。
- 弗洛拉：只知效果与米娅相似，缺少原文、满级数值和完整触发规则。

## 已知限制与风险

- 优化器坚持 exact search；0.01%理论网格有50,015,001点，九类BodySkillOption在每类最多两份时有414个四车身组合。
- 含多个概率技能的默认真实阵容会显著增加每个候选的精确状态传播成本。优化已放入 Web Worker，不会冻结页面主线程，但完成时间可能达到数分钟。
- 正式算法利用凹可分离上界剪枝，不逐点运行约5000万次完整模拟；UI继续在Web Worker中运行。
- 当前没有回归战报数据集，因此“公式与真实战报的系统误差”仍无法量化。
- 95%区间不使用正态近似：状态规模可控时精确保留累计伤害路径；复杂配置超出历史状态上限时，在相同未来 BattleState 内使用确定性相邻分箱后求分位。该回退不影响期望伤害和优化排序。

## 部署前人工检查

- [ ] 提交当前发布候选并打版本标签。
- [ ] 选择静态托管平台并确认其发布目录为 `dist/`。
- [ ] 在目标托管平台测试首页、静态资源、刷新和 HTTPS。
- [ ] 用至少一个移动端窄屏和一个桌面浏览器复核布局。
- [ ] 确认长期运行优化时的用户提示符合部署平台的资源限制。
- [ ] 若使用子路径托管，确认相对资源路径和入口重写策略。

## 常用命令

```powershell
npm.cmd install
npm.cmd run dev
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
npm.cmd run preview
npm.cmd run benchmark
```

生产输出目录：`dist/`。
