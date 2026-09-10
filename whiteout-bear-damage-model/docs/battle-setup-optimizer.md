# 兵种比例与四车身联合优化器

## 搜索空间

联合优化器复用以下现有模块，不包含任何伤害公式：

- `optimizeSeparableRatioGrid()`
- `allocateTroopsByRatio()`
- `combinationsWithReplacementLimited()`
- `calculateTenRoundExpectedDamage()`

默认比例步长 0.01%、车身数量 4、返回前 20 名。车身按九个 `BodySkillOption` 搜索、每种最多两份，共 414 个合法组合。理论比例空间为 50,015,001；联合优化不会建立两者的完整笛卡尔积。

优化开始时只构建一次无车身的正式十回合基线和 `StaticBodyBattleContext`。每个预聚合 `BodyEffect` 被编译为十回合数值向量，再从该静态上下文直接得到 `Ks/Kl/Km`；车身热循环不会重复解析英雄、技能、Buff、兵种常数或概率状态。

联合搜索分两层完成：先为全部 BodyEffect 求 exact Top 1，得到每个车身效果可达到的严格最大值；再以全局第 K 名阈值筛出仍可能进入 Top K 的车身效果，只为这些候选求 exact Top K。低于阈值的车身效果，其第二名及以后不可能超过自身第一名，因此可以严格排除。这是完整精确搜索，不是启发式剪枝。

## 比例和基础兵数因子

比例继续由 `allocateTroopsByRatio()` 使用 largest remainder method 转为整数兵数。实际兵数原样交给伤害引擎；三个兵种共享 `sqrt(min(N,5000))`，并分别使用未截断的 `sqrt(n)`。

## 评分

默认 `scoreMetric = expectedTenRoundTotalDamage`，即精确的十回合总期望伤害。结果同时保留：

- `singleRoundDamage`：既有伤害引擎的单回合伤害；
- `totalDamage` / `score`：当前评分模式的十回合伤害；
- `expectedTenRoundDamage` 与 `expectedDamageByRound`：正式期望评分及逐回合解释；
- `singleRoundResult` 和 `battleTotalResult`：完整解释结构。

当前九类车身技能的概率、周期、持续和覆盖机制由 compiled evaluator 生成与正式概率引擎一致的十回合期望向量。最终 Top K 才生成逐回合、乘区和技能解释。遇到不能安全因子化的外部技能或不能编译的车身语义时，优化器自动退回正式十回合引擎。`BattleSetupScorer` 只保留给 `legacy` 模式；比例生成、车身组合生成和基础伤害公式没有改变。

`improvementOverNoBody` 使用候选方案相同的实际兵种比例，移除四个车身后重新调用伤害引擎作为基准。

性能统计会区分 `fastScoreCount`、`detailedSimulationCount`、`formalSimulationCount` 和 `ratioSolverCallCount`。正式路径通常只有一个无车身基线属于通用十回合状态模拟；候选评分和 Top K 解释由已通过 Golden Test 的编译路径完成。

## 排序

首先按评分降序；并列时依次按射手、矛兵、盾兵比例降序，再按技能选项规范组合键排序。相同技能的来源英雄不再形成不同优化维度。

## 更高层完整优化

本模块继续只负责“比例 × 车身”。第二十三步新增的 `optimizeFullBattleSetup()` 在不改变本 API 的前提下组合比例、车身、车头和火晶四个维度。需要固定 head/fire 并复现本优化器时，可在完整优化器中把对应维度设为 `fixed` 空配置；两者会得到相同评分与排序。详见 `docs/full-setup-optimizer.md`。
