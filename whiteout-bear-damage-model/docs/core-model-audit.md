# Stage 24 最终计算核心审计

## 结论

核心审计共登记 43 组不变量。2026-09-08 最新统一规则已将旧的按 `n` 选择根号分支改为 `sqrt(min(N,5000))`；`k`、兵种系数、等级常数、减防规则和十回合环境保持不变。

自动化清单位于 `src/audit/coreAuditManifest.ts`，集中回归位于 `src/audit/coreModelAudit.test.ts`；专项机制继续由原测试文件保护。

## 43 项检查矩阵

| # | 检查 | 结果 |
|---:|---|---|
| 1 | 统一基础公式与 `k=0.0075577` | 通过 |
| 2 | N 的 5000 根号上限、n 不截断 | 通过 |
| 3 | shield/lancer/marksman 系数 1/3/4 | 通过 |
| 4 | T1～T12 火晶等级目录完整性 | 通过 |
| 5 | 0%、100%、444.35% 转换 | 通过 |
| 6 | `N=整支总兵数`、`n=当前兵种数` | 通过 |
| 7 | 三兵种共享统一 N、分别使用实际 n 后求和 | 通过 |
| 8 | 核心计算无中间取整 | 通过 |
| 9 | 同乘区加算、跨乘区乘算 | 通过 |
| 10 | `defenseReduction=1+sum(r)` | 通过 |
| 11 | 10 回合、敌方全盾、无限血 | 通过 |
| 12 | 无动态技能时 `D10=10×D1` | 通过 |
| 13 | 每回合及最终概率质量守恒 | 通过 |
| 14 | canonical state key 完整区分未来状态 | 通过 |
| 15 | duration 1/2/3 immediate/nextRound | 通过 |
| 16 | interval=3、first=2 命中 2/5/8 | 通过 |
| 17 | 叠层数值与 maxStacks | 通过 |
| 18 | `x_k=x_1×d^(k-1)` 衰减精度 | 通过 |
| 19 | extraDamage 独立伤害组件 | 通过 |
| 20 | extraAttack 独立 AttackEvent（历史/未来扩展，正式熊入口不调用） | 通过 |
| 21 | A→B→C lineage 与循环保护 | 通过 |
| 22 | 全部真实 pending 不计分 | 通过 |
| 23 | unsupported 独立跳过状态 | 通过 |
| 24 | 真实技能支持状态统计 | 通过 |
| 25 | 最多四车身、允许重复、顺序无关 | 通过 |
| 26 | 车头读取全部 supported 远征技能 | 通过 |
| 27 | 车头互斥数据驱动 | 通过 |
| 28 | 火晶 supported/等级/敌方条件边界 | 通过 |
| 29 | 四个优化器小空间手工穷举一致 | 通过 |
| 30 | 默认 exact 无隐式 heuristic | 通过 |
| 31 | topK 稳定确定性排序 | 通过 |
| 32 | largest remainder 整数守恒 | 通过 |
| 33 | 比例 0/100、整数守恒与统一 N 上限 | 通过 |
| 34 | cache enabled/等效禁用数值一致 | 通过 |
| 35 | 兵数/head/fire cache key 不碰撞 | 通过 |
| 36 | Ratio 压力测试 | 通过 |
| 37 | Body 压力测试 | 通过 |
| 38 | Joint 受限精确压力测试 | 通过 |
| 39 | Full setup 四维压力测试 | 通过 |
| 40 | `npm run benchmark` 可重复执行 | 通过 |
| 41 | 小/常规/大数值稳定性 | 通过 |
| 42 | 非法输入明确拒绝 | 通过 |
| 43 | 大笛卡尔积只警告、不降级 | 通过 |

## 关键审计说明

### 总兵数上限、精度与等级数据

第一个根号严格使用 `sqrt(min(N,5000))`，判断依据是整支实际参战总兵数 N；第二个根号始终使用当前兵种实际数量 n。不存在按 n 选择公式或截断 n。伤害、乘区、期望和排序均保留浮点精度；伤害数值不做中间取整。

T12、T12-FC1～T12-FC5 继续是 `status=missing, constant=null`。所有已知等级常数均为正有限数；缺失等级计算会报错。项目不接受外部“等级常数”数值输入，因此不存在静默接受负常数的入口。

### 防御与打熊环境

减防只在已确认的乘区中计算一次：`M_defRed=1+sum(r)`。正式伤害不使用 `1/(1-r)`、`enemyDefense/(1+r)` 或其他未确认绝对防御映射。`enemyBaseDefense` 可保存和展示；存在减防时 `enemyEffectiveDefense` 保持待确认状态，不二次增伤。

### 状态、概率与缓存

`battleStateKey` 保留当前回合、完成状态、ActiveEffect 完整身份、效果、剩余时间、层数和应用次数。只对已生效且纯历史解释的应用回合字段规范化。攻击/联动的 root、parent、depth 属于回合内事件图；会影响后续的持久状态必须先写入 BattleState，才允许跨回合合并。

当前唯一显式跨候选缓存是有界 `BattleEvaluationCache`；概率状态使用 canonical merge。没有另建 battle cache 或 skill cache。审计以共享 evaluator 对比逐候选新 evaluator（等效禁用跨候选复用），分数完全一致；兵数、车头和火晶任一关键输入变化都会产生不同 key。

### 技能安全边界

当前目录共有 82 项技能记录、82 项结构化效果：

- skill：78 supported、4 pending、0 unsupported；
- effect：82 supported、0 pending、0 unsupported；
- `ENGINE_GAP=0`；
- `RULE_UNKNOWN=0`，`DATA_SOURCE_UNCERTAIN=4`。

真实 pending 技能可以查询和报告，但不会进入伤害。审计另外构造 unsupported +10000% synthetic 效果，验证其只进入 unsupported 跳过结果，不会转成可执行 Skill。

### 优化器正确性

四个优化器均用小型空间与直接调用十回合引擎的手工全量枚举比较，top1 完全一致。源码扫描没有发现 random、beam、genetic、hill climbing、sampling、top-N prefilter 或 approximate pruning。在线 topK 和缓存只改变内存/耗时，不跳过候选。

## 输入模型说明

公开的多兵种入口不接受第二个冗余 `totalTroops` 字段，而是直接由各兵种整数兵数求和，因此多兵种总数不可能与明细不一致。单兵种底层入口若出现 `n>N` 会明确拒绝。负兵数、非安全整数、NaN/Infinity 百分比、缺失等级和非法概率同样报错，不会静默修正。
