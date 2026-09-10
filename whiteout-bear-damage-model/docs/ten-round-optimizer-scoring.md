# 第二十二步：优化器十回合期望评分

## 默认目标与兼容模式

三个优化器的默认 `scoringMode` 均为 `tenRoundExpected`，排名目标统一为：

```text
expectedTenRoundTotalDamage = E[D1 + D2 + ... + D10]
```

每个候选都调用正式 `calculateTenRoundExpectedDamage()`。概率技能由WeightedBattleState精确传播；不会转写为 `1 + p × value`，也不会在优化器内复制基础公式。

保留 `scoringMode: "legacy"` 用于回归：车身和比例优化器使用原单回合伤害，联合优化器使用既有可注入legacy scorer。默认行为不再使用legacy代理值。

## 三个搜索器

- `optimizeBodyHeroes()`：兵数固定，穷举允许重复、忽略顺序的body组合。固定的headFormation和fireCrystal参与每个候选评分。
- `optimizeTroopRatio()`：body/head/fireCrystal固定；比例由原网格生成器产生，再通过largest-remainder严格转成整数兵数。
- `optimizeBattleSetup()`：直接穷举ratio × body组合笛卡尔积，不先截断某个维度，不采用启发式剪枝。

所有候选仍仅来自supported车身英雄。车头和火晶中的pending/unsupported效果不参与伤害，并在候选的 `skippedPendingSkills` / `unsupportedSkills` 中报告。

## 输出

新增或明确的字段包括：

- `score`、`expectedTenRoundDamage`、`expectedDamageByRound`；
- `singleRoundDamage`及原单回合结果，供兼容和调试；
- `improvementAbsolute`与`improvementRatio`；
- `selectedBodyHeroes`（车身优化）；
- `scoringMode`、`scoreMetric`；
- `stats.candidateCount/evaluatedCount/cacheHits/cacheMisses/probabilityStateCount/elapsedMs`；
- 联合优化额外给出 `ratioCandidateCount/bodyCombinationCount/cartesianCandidateCount`。

基准使用与候选完全相同的评分模式、车头、火晶和战斗上下文。基准为0时 `improvementRatio = null`，不会产生Infinity或NaN。

## 精确性与排序

历史模式使用exact exhaustive；v0.1正式比例入口使用有严格上界证明的exact分支定界。主排序为 `score` 降序；比例并列按射手、矛、盾比例降序，车身按技能选项规范键排序。相同输入结果顺序稳定。

v0.1默认0.01%比例理论网格为50,015,001项；九个BodySkillOption恰选四个、每种最多两份为414项。联合入口为每个BodyEffect直接求比例最优，不构造两维完整笛卡尔积。

## Evaluation Cache

`BattleEvaluationCache` 是单次优化运行内的有界确定性缓存。key包括：

- scoringMode及legacy metric ID；
- 三兵种兵数、等级、攻击、穿透、防御、生命；
- 规范化body英雄ID多重集；
- headFormation；
- fireCrystal技能；
- damageChannel；
- 固定10回合、敌方shield、无限血和enemyBaseDefense上下文。

缓存只复用完全相同的评分输入。body排列因规则无关而规范化；火晶顺序可能涉及联动时序，当前保留原顺序。缓存容量默认10,000，避免三千万级联合搜索无限占用内存。缓存、topK在线保留和概率状态canonical merge都不改变评分或全局最优解。

## 总兵数根号上限与减防

比例候选必须先分配为实际整数兵数，再调用现有伤害引擎。第一个根号使用 `sqrt(min(N,5000))`，其中 N 是三兵种实际整数兵数之和；`sqrt(n)` 不截断。

减防继续严格使用：

```text
M_defRed = 1 + sum(r_i)
```

不使用 `1/(1-r)`，也不推导未知的绝对Defense映射。

## 性能口径

`candidateCount/evaluatedCount`不包含基准；cache hit/miss包含基准调用。`probabilityStateCount`累计实际执行的精确期望评估中合并后的状态数。`elapsedMs`只用于开发观察，不参与排序，候选结果也不嵌入该非确定性计时值。

默认全量搜索规模很大，当前不使用近似。如果真实动态技能让状态空间显著增长，后续只能引入不改变答案的缓存、预计算或并行化。

可通过 `npm run benchmark:optimizers` 重复运行开发基准。旧的Stage 22数据只作历史参考；当前基准见 `performance-benchmark.md`。

## 第二十三步扩展

`optimizeFullBattleSetup()` 在相同的正式十回合期望 evaluator 上增加车头和火晶两个维度。每个维度都可 fixed/optimize；pending/unsupported 只报告、不计分。完整搜索仍为 exact 笛卡尔积，旧三个优化器及其默认评分方式保持兼容。详细约束、计数和缓存规则见 `docs/full-setup-optimizer.md`。

## Stage 24 稳定性结论

四个优化器均已用小型候选空间与手工调用正式十回合引擎的全量枚举核对 top1，并通过重复运行排序、cache 等价和 key 分离测试。性能压力数据改由 `npm run benchmark` 统一生成，见 `docs/performance-benchmark.md`；Stage 22/23 旧基准保留为历史记录。
