# 兵种比例优化器

## 计算边界

- 车身组合固定，只优化盾兵、矛兵、射手比例。
- 正式候选评分从 `calculateTenRoundExpectedDamage()` 提取可分离系数，最终 Top K 再调用同一正式入口生成明细；优化器不复制伤害公式。`legacy` 模式保留原全网格单回合评分供回归。
- 每个比例先转换为实际整数兵数，再交给战斗引擎。基础伤害引擎以所有兵种之和作为 N，并统一使用 `sqrt(min(N,5000))`；各兵种的 `sqrt(n)` 不截断。
- 比例数字使用百分数单位，例如 `5` 表示 5%。

## 网格

默认 `stepPercent = 0.01`，理论网格共有 50,015,001 个比例点。比例继续使用整数 tick，不通过浮点数反复累加。正式入口利用 `ΣKi√ni` 的凹可分离结构和严格连续上界做 exact 分支定界，不逐点运行5000万次战斗模拟。连续最优 `Ki² / ΣKi²` 只用于提供 warm seed；最终结果仍由完整分支定界证明。步长必须能够整除 100，确保三个兵种处于同一个对称网格。

实现分为两层：`solveExactRatioFromCoefficients()` 接受 `Ks/Kl/Km` 与容量并执行轻量数值求解；`referenceExactRatioSolver()` 保留未使用 warm/count cache 的参考实现，仅用于测试。可行比例总数按约束缓存，不参与伤害语义。

默认边界为每个兵种 0%～100%。`minimumRatios` 和 `maximumRatios` 只过滤候选，不改变伤害公式。

## 比例转换为整数兵数

`allocateTroopsByRatio()` 使用 largest remainder method：

1. 用精确十进制整数单位计算三个理想配额；
2. 分别取整数下界；
3. 把尚未分配的兵，按小数余数从大到小逐个补齐；
4. 余数相同时固定按盾兵、矛兵、射手顺序补齐。

因此兵数始终为非负整数，且严格满足三兵种之和等于输入总兵数。

## 排序

首先按十回合期望评分降序。评分完全相同时，依次按射手比例、矛兵比例、盾兵比例从高到低排序。该规则仅用于保证结果稳定，不表示游戏机制偏好。

固定的 `headFormation` 与 `fireCrystal` 会随每个比例候选进入同一个十回合引擎。pending效果会出现在跳过报告中。缓存与性能统计见 [ten-round-optimizer-scoring.md](./ten-round-optimizer-scoring.md)。

数学证明、largest-remainder 下的上界和 Golden Test 见 [body-skill-options-v0.1.md](./body-skill-options-v0.1.md)。快速求解器还通过 1,000 组随机系数与容量对照参考求解器；比例、实际整数兵数、伤害及稳定排序全部一致。
