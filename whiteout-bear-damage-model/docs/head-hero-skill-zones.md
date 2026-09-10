# 车头英雄技能与乘区审计

审计日期：2026-09-10（v0.4）  
审计对象：当前程序实际加载的车头英雄数据，不以 UI 文案代替代码定义。

## 1. 审计口径

主要代码来源：

- `src/game-data/heroes/headHeroes.ts`：英雄、远征技能、5级数值、触发和目标。
- `src/game-data/heroes/headHeroQueries.ts`：正式车头查询及状态筛选。
- `src/domain/skill.ts`：`Skill`、`SkillEffect`、trigger、生命周期和额外伤害字段。
- `src/engine/skills/resolvers/resolverRegistry.ts`：正式乘区 resolver 注册表。
- `src/engine/skills/aggregateMultipliers.ts`：同小乘区加算、不同小乘区乘算及 `replace`。
- `src/engine/skills/calculateTroopDamageWithMultipliers.ts`：正式打熊普通伤害与额外伤害分支。
- `src/app/calculateTenRoundExpectedDamage.ts`：10回合概率、持续、周期和独立兵种判定接入。

本文中的“有效输出技能”按代码中的 `SupportedHeroSkillDefinition` 计数。一个游戏技能可能被拆成多个运行时记录，例如鲁弗斯“碎甲一击”拆成额外伤害和易伤两条；反过来，一个运行时技能也可能包含多个效果。

`notApplicableToBearOutgoingDamage` 表示技能资料被保留，但不进入我方对熊输出计算；它不是 `pending`。当前所有车头 `headSkills` 均为 `supported`，没有车头 `pending` 或 `unsupported`。

## 2. UI名称与代码字段

| UI/规则名称 | 代码 `EffectType` | 正式处理 |
|---|---|---|
| `skill.attack` | `attack` | 同区加算后乘算 |
| `skill.penetration` | `penetration` | 同区加算后乘算 |
| `skill.defenseReduction` | `defenseReduction` | `1 + sum(r)`；不是 `1/(1-r)` |
| `skill.damageIncrease` | `baseDamageIncrease` | 正式字段；旧 `damageIncrease` 仅为兼容别名 |
| `skill.normalAttackDamage` | `normalAttackDamageIncrease` | 只放大普通伤害分支；旧 `normalAttackDamage` 为兼容别名 |
| `skill.skillDamage` | `skillDamageIncrease` | 只放大额外伤害/技能伤害分支；旧 `skillDamage` 为兼容别名 |
| `skill.troopVsTroopDamage` | `troopVsTroopDamage` | 按敌方兵种取值；熊固定为盾兵 |
| `skill.vulnerable` | `vulnerable` | 普通来源同区加算；`zoneAggregation: "replace"` 时覆盖同回合其他易伤 |
| `skill.extraDamage` | `extraDamage` | 不进入主倍率，作为独立附加伤害段；同回合同兵种的 rate 相加 |
| `skill.shieldDamage` | `shieldDamage` | 数据层限定盾兵；当前正式熊入口会规范化为 `baseDamageIncrease` |
| `skill.lancerDamage` | `lancerDamage` | 数据层限定矛兵；当前正式熊入口会规范化为 `baseDamageIncrease` |
| `skill.marksmanDamage` | `marksmanDamage` | 数据层限定射手；当前正式熊入口会规范化为 `baseDamageIncrease` |
| 暴击 | `critProbability`、`critMultiplier`、`critAppliesTo`，并生成 `normalAttackDamageIncrease` 概率效果 | 没有独立 `crit` 乘区；保留 Bernoulli 分支，只作用普通攻击 |
| `buff.attack` | `buffAttack` | Buff 大乘区，不与 `attack` 加算 |
| `buff.penetration` | `buffPenetration` | Buff 大乘区，不与 `penetration` 加算 |
| `buff.defenseReduction` | `buffDefenseReduction` | Buff 大乘区 |
| `expertBearDamage` | `expertBearDamage` | Expert 独立大乘区 |

车头远征技能不会直接修改 Battle Report 的基础攻击 `A` 或基础穿透 `P`。当前车头技能也没有直接写入 Buff 或 Expert；英雄专武类型是英雄元数据，正式 UI 使用的集结专武 Buff 由独立输入提供。

## 3. 盾兵车头

现有盾兵车头共 3 名：尼莫 S1、弗林特 S2、赫克托 S5。

| 兵种 | 英雄 | 代数 | 技能 | 满级效果 | 打熊有效 | 乘区/类型（UI / 代码） | 作用对象 | 时序/概率 | 额伤/易伤/普攻 | 特殊规则与状态 |
|---|---|---:|---|---|---|---|---|---|---|---|
| 盾 | 赫克托 | S5 | 生存本能 | 当前数据未保存数值；降低我方受到伤害 | 否 | 不适用我方输出 | 我方承伤 | 常驻语义未进入输出引擎 | 否 | `notApplicableToBearOutgoingDamage`；非 pending |
| 盾 | 赫克托 | S5 | 雷霆出击 | round1：盾兵伤害 +200%、射手伤害 +100%；以后每回合为上一回合的 85% | 是 | `skill.damageIncrease` / `baseDamageIncrease` | 盾兵、射手分别取值；矛兵无效果 | round1～10，`valueByRound = first × 0.85^(round-1)` | 非额伤、非易伤、非普攻专属 | 按回合衰减，不按 AttackEvent 衰减；supported |
| 盾 | 赫克托 | S5 | 疾风猛击 | 触发时额外 +100%D，因此总伤害为 2D | 是 | `skill.extraDamage` / `extraDamage` | 全兵种各自伤害 | 每回合判定一次，25% | extraDamage rate 1.00；非 extraAttack | basis 数据为 `postMultiplierDamage`；正式熊分支用共同乘区伤害，不吃 `normalAttackDamageIncrease`；同区加算；supported |
| 盾 | 弗林特 | S2 | 野火燎原 | 盾兵造成伤害 +100% | 是 | `skill.shieldDamage` / `shieldDamage` | 仅盾兵 | round1～10 常驻 | 非额伤、非易伤、非普攻专属 | 当前正式熊入口规范化为 `baseDamageIncrease`；supported |
| 盾 | 弗林特 | S2 | 燃烧意志 | 全军攻击 +25% | 是 | `skill.attack` / `attack` | 全兵种 | round1～10 常驻 | 否 | 与其他 `attack` 加算；与 `buffAttack` 分区乘算；supported |
| 盾 | 弗林特 | S2 | 无尽烈火 | 全军穿透 +25% | 是 | `skill.penetration` / `penetration` | 全兵种 | round1～10 常驻 | 否 | 与其他 `penetration` 加算；与 `buffPenetration` 分区乘算；supported |
| 盾 | 尼莫 | S1 | 战前宣言 | 全军穿透 +25% | 是 | `skill.penetration` / `penetration` | 全兵种 | round1～10 常驻 | 否 | supported |
| 盾 | 尼莫 | S1 | 剑术指导 | 全军攻击 +25% | 是 | `skill.attack` / `attack` | 全兵种 | round1～10 常驻 | 否 | supported |
| 盾 | 尼莫 | S1 | 精湛剑术 | 全军伤害 +30% | 是 | `skill.damageIncrease` / `baseDamageIncrease` | 全兵种 | round5、6、9、10 | 非额伤、非易伤、非普攻专属 | 固定 `activeRounds`；supported |

尼莫的“三断斩、剑气、孤傲”只保存在 `explorationSkills`，明确不是远征技能，不进入本表的打熊远征技能计数。

## 4. 矛兵车头

现有矛兵车头共 1 名：米娅 S3。

| 兵种 | 英雄 | 代数 | 技能 | 满级效果 | 打熊有效 | 乘区/类型（UI / 代码） | 作用对象 | 时序/概率 | 额伤/易伤/普攻 | 特殊规则与状态 |
|---|---|---:|---|---|---|---|---|---|---|---|
| 矛 | 米娅 | S3 | 厄运缠身 | 激活时目标受到伤害 +50% | 是 | `skill.vulnerable` / `vulnerable` | 全兵种对同一目标的后续伤害 | 每回合盾/矛/射三次普通攻击各做一次 50% 判定；本回合触发、下一回合生效，持续1回合 | 易伤；非额伤、非普攻 | 同回合成功只提高“至少一次成功”的概率，幅度不叠加；`instanceAggregation.stackingMode = probabilityOnly`，`refresh`；supported |
| 矛 | 米娅 | S3 | 幸运加护 | 触发时全军伤害 +50% | 是 | `skill.damageIncrease` / `baseDamageIncrease` | 全兵种 | 每回合一次 50% 判定，当回合生效 | 非额伤、非易伤、非普攻专属 | 1回合即时概率效果；supported |
| 矛 | 米娅 | S3 | 秘火解读 | 当前数据只保存“40%概率降低敌方伤害”，未保存降低幅度 | 否 | 不适用我方输出 | 敌方输出 | 概率40%；其他时序未进入输出模型 | 否 | `notApplicableToBearOutgoingDamage`；非 pending |

## 5. 射手车头

现有射手车头共 16 名，S1～S16 每代各一名。

| 兵种 | 英雄 | 代数 | 技能 | 满级效果 | 打熊有效 | 乘区/类型（UI / 代码） | 作用对象 | 时序/概率 | 额伤/易伤/普攻 | 特殊规则与状态 |
|---|---|---:|---|---|---|---|---|---|---|---|
| 射 | 津曼 | S1 | 防御与生命提升 | 全军防御 +10%、生命 +10% | 否 | 不适用我方输出 | 我方生存 | 常驻 | 否 | `notApplicableToBearOutgoingDamage`；非 pending |
| 射 | 津曼 | S1 | 建筑增益 | 当前数据未保存数值；建筑资源/速度 | 否 | 非战斗效果 | 建筑 | 非战斗 | 否 | `notApplicableToBearOutgoingDamage`；非 pending |
| 射 | 津曼 | S1 | 远征穿透 | 全军穿透 +25% | 是 | `skill.penetration` / `penetration` | 全兵种 | round1～10 常驻 | 否 | supported |
| 射 | 阿隆索 | S2 | 穿透提升 | 触发时全军穿透 +50% | 是 | `skill.penetration` / `penetration` | 全兵种 | 每回合一次 40% 判定，当回合生效 | 非额伤、非易伤、非普攻 | supported；保留概率分支 |
| 射 | 阿隆索 | S2 | 降低敌军伤害 | 当前数据未保存降低数值 | 否 | 不适用我方输出 | 敌方输出 | 当前数据未保存完整时序 | 否 | `notApplicableToBearOutgoingDamage`；非 pending |
| 射 | 阿隆索 | S2 | 概率伤害提升 | 触发时当回合全军伤害 +50% | 是 | `skill.damageIncrease` / `baseDamageIncrease` | 全兵种 | 每回合一次50%判定，当回合生效 | 非额伤、非易伤、非普攻专属 | supported；保留概率分支 |
| 射 | 格雷格 | S3 | 全军伤害提升 | 触发时全军伤害 +40% | 是 | `skill.damageIncrease` / `baseDamageIncrease` | 全兵种 | 每回合20%；当回合生效并持续3回合 | 非额伤、非易伤、非普攻 | 重复触发 `refresh duration`，不叠加幅度；supported |
| 射 | 格雷格 | S3 | 敌军伤害降低 | 20%概率使敌军伤害降低50%，持续2回合 | 否 | 不适用我方输出 | 敌方输出 | 概率20%，持续2回合 | 否 | `notApplicableToBearOutgoingDamage`；非 pending |
| 射 | 格雷格 | S3 | 全军生命提升 | 全军生命 +25% | 否 | 不适用我方输出 | 我方生存 | 常驻 | 否 | `notApplicableToBearOutgoingDamage`；非 pending |
| 射 | 琳恩 | S4 | 概率穿透提升 | 触发时全军穿透 +50% | 是 | `skill.penetration` / `penetration` | 全兵种 | 每回合一次 40% 判定，当回合生效 | 非额伤、非易伤、非普攻 | supported；保留概率分支 |
| 射 | 琳恩 | S4 | 降低敌军穿透 | 敌军穿透 -20% | 否 | 不适用我方输出 | 敌方输出 | 常驻语义未进入输出引擎 | 否 | `notApplicableToBearOutgoingDamage`；非 pending |
| 射 | 琳恩 | S4 | 射手攻击叠层 | 每层射手攻击 +5%，最多3层 | 是 | `skill.attack` / `attack` | 仅射手 | 第3次射手普通攻击结算后获首层；round4～6 +5%，round7～9 +10%，round10 +15% | 非额伤、非易伤、非普攻专属；计数来源是普通攻击 | `refreshMode: stack`、`maxStacks: 3`、持续到战斗结束；supported |
| 射 | 格温 | S5 | 易伤 | 目标受到伤害 +25% | 是 | `skill.vulnerable` / `vulnerable` | 全兵种 | round1施加，round2起生效至战斗结束 | 易伤 | lifecycle 为 `nextRound`、duration 9、`refreshMode: replace`；此处 replace 是状态刷新语义，不是同区覆盖；supported |
| 射 | 格温 | S5 | 第6次攻击特殊效果（运行时拆为“特殊伤害”和“round7易伤覆盖”） | 第6次普通攻击 extraDamage +100%；round7易伤强制15% | 是 | `skill.extraDamage` / `extraDamage`；`skill.vulnerable` / `vulnerable` | 盾/矛/射各自普通攻击计数；效果作用全兵种对应攻击 | 各兵种第6次普通攻击在round6；易伤覆盖在round7 | extraDamage rate 1.00；易伤15%；非 extraAttack | round7 `zoneAggregation: replace`，覆盖同回合所有普通易伤，不做15%+其他易伤；下一回合恢复；supported |
| 射 | 格温 | S5 | 第三远征技能 | 当前代码未保存另一条独立游戏技能；上行两条运行时记录来自同一“第6次攻击”机制 | 无法由代码判定 | 未建档 | 未建档 | 未建档 | 未建档 | **技能身份复核项**；现有3条 `headSkills` 不等于3个已命名游戏技能 |
| 射 | 韦恩 | S6 | 周期额外打击 | extraDamage +100% | 是 | `skill.extraDamage` / `extraDamage` | 全兵种 | 每4回合；首次round4，10回合为round4、8 | extraDamage rate 1.00；非 extraAttack | 名称含“打击”，但代码与已确认语义均为额外伤害段；同区加算；supported |
| 射 | 韦恩 | S6 | 兵种目标额外伤害 | 当前数据未保存数值；只对矛/射目标 | 否（熊为盾） | 不适用当前敌方兵种 | 敌方矛/射 | 当前数据未保存完整时序 | 资料描述为额伤但熊目标不满足 | `notApplicableToBearOutgoingDamage`；非 pending |
| 射 | 韦恩 | S6 | 暴击 | 25%概率使本次普通攻击倍率 ×2，即触发时 `normalAttackDamageIncrease +100%` | 是 | 暴击元数据 + `skill.normalAttackDamage` / `normalAttackDamageIncrease` | 盾/矛/射各自普通攻击 | 每回合三个兵种各自独立一次25% Bernoulli | 只作用普通攻击；不作用 extraDamage/skillDamage | `critProbability=.25`、`critMultiplier=2`、`critAppliesTo=normalAttackOnly`；非全局damageIncrease；supported |
| 射 | 布拉德利 | S7 | 兵种克制增伤 | 对盾 +25%，对矛 +30%；打熊取 +25% | 是 | `skill.troopVsTroopDamage` / `troopVsTroopDamage` | 我方全兵种攻击；按敌方兵种取值 | round1～10 常驻 | 非额伤、非易伤、非普攻 | `valueByEnemyTroop`；supported |
| 射 | 布拉德利 | S7 | 三技能循环 | 全军伤害 +30% | 是 | `skill.damageIncrease` / `baseDamageIncrease` | 全兵种 | round5、6、9、10 | 非额伤、非易伤、非普攻 | 固定 `activeRounds`；supported |
| 射 | 布拉德利 | S7 | 全军攻击提升 | 全军攻击 +25% | 是 | `skill.attack` / `attack` | 全兵种 | round1～10 常驻 | 否 | supported |
| 射 | 亨德里克 | S8 | 减防 | 敌方防御 -25%，等效伤害倍率1.25 | 是 | `skill.defenseReduction` / `defenseReduction` | 全兵种攻击同一熊目标 | round1～10 常驻 | 非额伤、非易伤、非普攻 | resolver 为 `1 + sum(r)`；supported |
| 射 | 亨德里克 | S8 | 第二技能 | 当前数据只保存“只影响敌方输出”，没有名称和数值 | 否 | 不适用我方输出 | 敌方输出 | 未保存 | 否 | `notApplicableToBearOutgoingDamage`；非 pending |
| 射 | 亨德里克 | S8 | 第三技能 | extraDamage +40% | 是 | `skill.extraDamage` / `extraDamage` | 全兵种 | round3、6、9 | extraDamage rate 0.40；非 extraAttack | 同区加算；supported |
| 射 | 修拉 | S9 | 我方受到伤害降低 | 当前数据未保存数值 | 否 | 不适用我方输出 | 我方承伤 | 未保存 | 否 | `notApplicableToBearOutgoingDamage`；非 pending |
| 射 | 修拉 | S9 | 射手攻击计数 | 每次触发 extraDamage +100%，并使下一回合易伤 +25% | 是 | `skill.extraDamage` / `extraDamage`；`skill.vulnerable` / `vulnerable` | 额伤仅射手；易伤作用全兵种后续攻击 | 射手每2次普通攻击；额伤round2/4/6/8/10，易伤round3/5/7/9 | extraDamage rate 1.00；易伤25% | nextRound 结果以 `activeRounds` 显式编码；普通易伤与其他普通来源同区加算；supported |
| 射 | 修拉 | S9 | 射手伤害提升 | 射手伤害 +10% | 是 | `skill.marksmanDamage` / `marksmanDamage` | 仅射手 | round1～10 常驻 | 非额伤、非易伤、非普攻专属 | 当前正式熊入口规范化为 `baseDamageIncrease`；supported |
| 射 | 布兰琪 | S10 | 全军穿透 | 全军穿透 +25% | 是 | `skill.penetration` / `penetration` | 全兵种 | round1～10 常驻 | 否 | supported |
| 射 | 布兰琪 | S10 | 额外伤害 | extraDamage +75% | 是 | `skill.extraDamage` / `extraDamage` | 全兵种 | round3、6、9 | extraDamage rate 0.75；非 extraAttack | 同区加算；supported |
| 射 | 布兰琪 | S10 | 第三技能 | 当前数据只保存“只针对矛兵/射手目标”，没有数值 | 否（熊为盾） | 不适用当前敌方兵种 | 敌方矛/射 | 未保存 | 可能为额伤，但当前熊目标不满足 | `notApplicableToBearOutgoingDamage`；非 pending |
| 射 | 鲁弗斯 | S11 | 火焰战团 | 全军攻击 +25% | 是 | `skill.attack` / `attack` | 全兵种 | round1～10 常驻 | 否 | supported |
| 射 | 鲁弗斯 | S11 | 碎甲一击（代码拆为额外伤害与易伤两条） | 每次普通攻击 extraDamage +60%；另施加易伤 +25% | 是 | `skill.extraDamage` / `extraDamage`；`skill.vulnerable` / `vulnerable` | 全兵种 | 额伤每回合生效；易伤每回合施加、下一回合生效，持续1回合 | extraDamage rate 0.60；易伤25% | 易伤 `refresh`，round10施加不影响本场；supported |
| 射 | 鲁弗斯 | S11 | 暴烈震慑 | 降低敌方穿透；当前数据未保存数值 | 否 | 不适用我方输出 | 敌方输出 | 未保存 | 否 | `notApplicableToBearOutgoingDamage`；非 pending |
| 射 | 丽姬娅 | S12 | 敌军防御降低 | 敌方防御 -25%，等效倍率1.25 | 是 | `skill.defenseReduction` / `defenseReduction` | 全兵种攻击同一熊目标 | round1～10 常驻 | 否 | `1 + sum(r)`；supported |
| 射 | 丽姬娅 | S12 | 射手攻击计数·额伤与易伤 | 触发时射手 extraDamage +100%，下一回合易伤 +25% | 是 | `skill.extraDamage` / `extraDamage`；`skill.vulnerable` / `vulnerable` | 额伤仅射手；易伤作用全兵种 | 共享计数器，射手每2次普通攻击；额伤round2/4/6/8/10，易伤round3/5/7/9 | extraDamage rate 1.00；易伤25% | 与第三技能共用 `counter.lijijia.marksman-normal.shared`；supported |
| 射 | 丽姬娅 | S12 | 射手攻击计数·额外伤害 | 触发时射手 extraDamage +100%；敌军伤害降低子效果不计输出 | 是（额伤部分） | `skill.extraDamage` / `extraDamage` | 仅射手 | 与上一技能在round2/4/6/8/10同时触发 | extraDamage rate 1.00；非 extraAttack | 两个额伤同回合 rate 加算为2.00；敌军伤害降低只写在 rawDescription，未拆成独立 notApplicable 记录；supported |
| 射 | 乌尔卡努丝 | S13 | 敌军攻击降低 | 敌军攻击 -20% | 否 | 不适用我方输出 | 敌方输出 | 常驻语义未进入输出引擎 | 否 | `notApplicableToBearOutgoingDamage`；非 pending |
| 射 | 乌尔卡努丝 | S13 | 第6次攻击特殊效果（复用格温构造器） | 第6次普通攻击 extraDamage +100%；round7易伤强制15% | 是 | `skill.extraDamage` / `extraDamage`；`skill.vulnerable` / `vulnerable` | 盾/矛/射各自普通攻击计数 | round6额伤；round7易伤覆盖 | extraDamage rate 1.00；易伤15%；非 extraAttack | 与格温共用 `sixthAttackSpecialSkills()`；round7 `zoneAggregation: replace`；supported |
| 射 | 乌尔卡努丝 | S13 | 三回合爆发 | 敌方盾/矛防御 -60%；射手攻击 +60% | 是（熊为盾） | `skill.defenseReduction` / `defenseReduction`；`skill.attack` / `attack` | 减防用于熊目标；攻击仅射手 | round3、6、9，各持续当前回合 | 非额伤、非易伤、非普攻专属 | 固定 `activeRounds`；supported |
| 射 | 卡拉 | S14 | 敌军穿透降低 | 敌军穿透 -20% | 否 | 不适用我方输出 | 敌方输出 | 常驻语义未进入输出引擎 | 否 | `notApplicableToBearOutgoingDamage`；非 pending |
| 射 | 卡拉 | S14 | 全军普通攻击伤害 | 全军普通攻击伤害 +30% | 是 | `skill.normalAttackDamage` / `normalAttackDamageIncrease` | 全兵种普通伤害 | round1～10 常驻 | 普攻专属；非额伤、非易伤 | 不放大 extraDamage/skillDamage；supported |
| 射 | 卡拉 | S14 | 兵种目标额外伤害 | 当前数据未保存数值；只对矛/射目标 | 否（熊为盾） | 不适用当前敌方兵种 | 敌方矛/射 | 未保存 | 资料描述为额伤但熊目标不满足 | `notApplicableToBearOutgoingDamage`；非 pending |
| 射 | 维薇卡 | S15 | 全军攻击提升 | 全军攻击 +25% | 是 | `skill.attack` / `attack` | 全兵种 | round1～10 常驻 | 否 | supported |
| 射 | 维薇卡 | S15 | 独立概率额外伤害 | 触发时对应兵种 extraDamage +100% | 是 | `skill.extraDamage` / `extraDamage` | 盾、矛、射各自对应攻击 | 每回合三个兵种各做一次独立20%判定 | extraDamage rate 1.00；非 extraAttack | `independentTroopTargets = [shield,lancer,marksman]`；不折成一次全军判定；同区加算；supported |
| 射 | 维薇卡 | S15 | 射手伤害提升 | 射手伤害 +10% | 是 | `skill.marksmanDamage` / `marksmanDamage` | 仅射手 | round1～10 常驻 | 非额伤、非易伤、非普攻专属 | 当前正式熊入口规范化为 `baseDamageIncrease`；supported |
| 射 | 艾诗琳 | S16 | 全军伤害提升 | 全军伤害 +20% | 是 | `skill.damageIncrease` / `baseDamageIncrease` | 全兵种 | round1～10 常驻 | 否 | supported |
| 射 | 艾诗琳 | S16 | 周期射手伤害 | 射手伤害 +150% | 是 | `skill.marksmanDamage` / `marksmanDamage` | 仅射手 | round3、6、9，各持续当前回合 | 非额伤、非易伤、非普攻专属 | 当前正式熊入口规范化为 `baseDamageIncrease`；supported |
| 射 | 艾诗琳 | S16 | 周期射手额外伤害 | 射手 extraDamage +40% | 是 | `skill.extraDamage` / `extraDamage` | 仅射手 | round3、6、9 | extraDamage rate 0.40；非 extraAttack | 同区加算；supported |

## 6. 额外伤害反查

所有下列来源的代码类型都是 `extraDamage`，不是 `extraAttack`，不会新增 AttackEvent。正式熊分支以共同乘区后的伤害为基准，并只额外应用 `skillDamageIncrease`；不应用 `normalAttackDamageIncrease`。同一兵种、同一回合的多个 extraDamage rate 先相加。

| 英雄 | extraDamage rate | 概率/回合 | 目标 | 关键规则 |
|---|---:|---|---|---|
| 赫克托 | 1.00 | 每回合25% | 全兵种 | 触发总伤害2D |
| 格温 | 1.00 | round6 | 全兵种各自第6次普通攻击 | 不产生extraAttack |
| 韦恩 | 1.00 | round4、8 | 全兵种 | 确定性周期 |
| 亨德里克 | 0.40 | round3、6、9 | 全兵种 | 确定性周期 |
| 修拉 | 1.00 | round2、4、6、8、10 | 仅射手 | 射手每2次普通攻击 |
| 布兰琪 | 0.75 | round3、6、9 | 全兵种 | 确定性周期 |
| 鲁弗斯 | 0.60 | 每回合 | 全兵种 | 碎甲一击额伤部分 |
| 丽姬娅 | 1.00 + 1.00 | round2、4、6、8、10 | 仅射手 | 两技能共享计数器，同区合计2.00 |
| 乌尔卡努丝 | 1.00 | round6 | 全兵种各自第6次普通攻击 | 复用格温语义 |
| 维薇卡 | 1.00 | 每回合每兵种各自20% | 对应兵种 | 三个独立 Bernoulli，不合成全军一次 |
| 艾诗琳 | 0.40 | round3、6、9 | 仅射手 | 确定性周期 |

## 7. 易伤反查

| 英雄 | 易伤值 | 激活/持续 | 叠加方式 | override/refresh |
|---|---:|---|---|---|
| 米娅 | +50% | 当回合三次50%判定；下一回合生效1回合 | 同一回合和多个米娅实例只合并激活概率，幅度不叠加 | `probabilityOnly` + `refresh` |
| 格温 | +25% | round1施加，round2起生效，duration 9 | 与普通易伤同区 | lifecycle `refreshMode: replace` 只替换同源状态，不覆盖乘区 |
| 格温 | 强制15% | round7 | 不与任何其他易伤相加 | `zoneAggregation: replace`，覆盖当前回合整个易伤小区 |
| 修拉 | +25% | round2/4/6/8触发，round3/5/7/9生效 | 普通易伤同区加算 | nextRound结果由 `activeRounds` 编码 |
| 鲁弗斯 | +25% | 每回合施加，下一回合生效1回合 | 普通易伤同区加算 | `refresh` |
| 丽姬娅 | +25% | round2/4/6/8触发，round3/5/7/9生效 | 普通易伤同区加算 | nextRound结果由 `activeRounds` 编码 |
| 乌尔卡努丝 | 强制15% | round7 | 不与任何其他易伤相加 | `zoneAggregation: replace`，复用格温规则 |

## 8. 按乘区反查英雄

以下数量按“代码 effect 记录数”统计；括号中是去重英雄数。一个技能含两个目标效果或一个英雄在同区有两个技能时会多于英雄数。

### `skill.attack` / `attack` — 7条（7名）

- 弗林特·燃烧意志
- 尼莫·剑术指导
- 琳恩·射手攻击叠层（仅射手）
- 鲁弗斯·火焰战团
- 乌尔卡努丝·三回合爆发（仅射手，round3/6/9）
- 维薇卡·全军攻击提升
- 布拉德利·全军攻击提升

### `skill.penetration` / `penetration` — 6条（6名）

- 弗林特·无尽烈火
- 尼莫·战前宣言
- 津曼·远征穿透
- 阿隆索·穿透提升（每回合40%）
- 琳恩·概率穿透提升（每回合40%）
- 布兰琪·全军穿透

### `skill.defenseReduction` / `defenseReduction` — 3条（3名）

- 亨德里克·减防 +25%
- 丽姬娅·敌军防御降低 +25%
- 乌尔卡努丝·三回合爆发 +60%（round3/6/9）

### `skill.damageIncrease` / `baseDamageIncrease` — 8条（7名）

- 赫克托·雷霆出击：盾兵、射手各一条逐回合效果
- 尼莫·精湛剑术
- 米娅·幸运加护
- 格雷格·全军伤害提升
- 布拉德利·三技能循环
- 艾诗琳·全军伤害提升
- 阿隆索·概率伤害提升（每回合50%）

### `skill.normalAttackDamage` / `normalAttackDamageIncrease` — 2条（2名）

- 韦恩·暴击（概率触发 +100%，仅普通攻击）
- 卡拉·全军普通攻击伤害 +30%

### `skill.skillDamage` / `skillDamageIncrease` — 0条

当前没有车头技能直接提供该乘区，但所有正式 extraDamage 分支都会读取这个乘区。

### `skill.troopVsTroopDamage` — 1条（1名）

- 布拉德利·兵种克制增伤（熊为盾，+25%）

### `skill.vulnerable` / `vulnerable` — 7条（6名）

- 米娅·厄运缠身
- 格温·易伤
- 格温·round7易伤覆盖
- 修拉·射手攻击计数易伤
- 鲁弗斯·碎甲一击易伤
- 丽姬娅·射手攻击计数易伤
- 乌尔卡努丝·round7易伤覆盖

### `skill.extraDamage` / `extraDamage` — 12条（11名）

- 赫克托、格温、韦恩、修拉、亨德里克、布兰琪、鲁弗斯、乌尔卡努丝、维薇卡、艾诗琳各一条
- 丽姬娅两条（同一共享计数节点各 +100%）

### `skill.shieldDamage` / `shieldDamage` — 1条（1名）

- 弗林特·野火燎原

### `skill.lancerDamage` / `lancerDamage` — 0条

### `skill.marksmanDamage` / `marksmanDamage` — 3条（3名）

- 修拉·射手伤害提升
- 维薇卡·射手伤害提升
- 艾诗琳·周期射手伤害

## 9. 代码现状与分类复核项

### 9.1 兵种专属伤害与全军增伤同区加算（v0.4 已确认）

数据层把弗林特、修拉、维薇卡、艾诗琳分别保存为 `shieldDamage` 或 `marksmanDamage`。但是 `src/engine/skills/calculateTroopDamageWithMultipliers.ts` 的 `normalizeFormalBearEffect()` 会在正式熊计算前把 `shieldDamage`、`lancerDamage`、`marksmanDamage` 全部改为 `baseDamageIncrease`。

目标兵种限制仍由 `resolveSkillEffects()` 保留；命中的兵种专属伤害随后与全军 `baseDamageIncrease` 在正式熊分支中进入同一小乘区加算，而不是相乘。v0.4 已确认这正是目标数学语义：全军增伤20%与射手增伤100%对射手合计为2.20；再与独立的对盾增伤25%相乘得到2.75。

### 9.2 游戏技能与运行时记录并非一一对应

- 阿隆索与布拉德利在 v0.4 已补齐缺失的正式输出技能，分别为每回合50%概率伤害+50%和常驻全军攻击+25%。
- 格温：代码有三条 `headSkills`，但“第6次攻击特殊伤害”和“round7易伤覆盖”是同一特殊机制拆成的两个运行时记录；没有另一条独立、具名的远征技能资料。
- 鲁弗斯：游戏技能“碎甲一击”被拆成额伤与易伤两个运行时记录，代码结构正确表达两种结算，但 `headSkills` 条数不能直接当作游戏技能数。
- 乌尔卡努丝：第二技能同样被拆成额伤与易伤覆盖两个运行时记录。

这些不是当前 `pending`；“pending=0”表示已存在的车头 `headSkills` 全部受支持，但运行时记录条数不能替代对原始三技能名称与原文的资料核对。

### 9.3 部分名称或数值仅为泛化记录

津曼“建筑增益”、亨德里克“第二技能/第三技能”、布兰琪“第三技能”、卡拉“兵种目标额外伤害”等名称或数值未在代码中完整保存。本文原样反映代码，不补猜正式技能名或缺失数值。

### 9.4 extraDamage 的正式熊统一基准

各真实数据的 `extraDamage` 由 helper 写成 `basis: postMultiplierDamage`、`damageCategory: extra`、`applicableMultiplierZones: []`；正式熊入口随后统一按“共同乘区伤害 × extraDamage rate × skillDamageIncrease”结算，而不是逐技能采用一套不同 basis。该行为在 `calculateTroopDamageWithMultipliers.ts` 中是显式设计。若后续实测证明某技能额伤基准不同，需要单独确认并扩展，而不能从技能名称推断。

## 10. 审计摘要

| 项目 | 数量 |
|---|---:|
| 车头英雄 | 20 |
| 盾兵 / 矛兵 / 射手车头 | 3 / 1 / 16 |
| 有效输出技能记录（supported `headSkills`） | 46 |
| 有效输出 effect 记录 | 50 |
| 明确不影响打熊输出的记录 | 16 |
| 车头 pending | 0 |
| 车头 unsupported | 0 |
| 探险技能排除记录 | 3（尼莫） |
| generation 未记录英雄 | 0 |

按 effect 记录统计的乘区来源数：`attack` 7、`penetration` 6、`defenseReduction` 3、`baseDamageIncrease` 8、`normalAttackDamageIncrease` 2、`skillDamageIncrease` 0、`troopVsTroopDamage` 1、`vulnerable` 7、`extraDamage` 12、`shieldDamage` 1、`lancerDamage` 0、`marksmanDamage` 3，共50条。

发现的主要复核风险：

1. 多个明确不适用输出的技能只保存泛化名称或缺少满级数值，暂时不影响伤害，但不利于逐字核对原技能资料。
2. 格温、鲁弗斯、乌尔卡努丝的单个游戏技能会拆为多个运行时记录；`headSkills` 条数不能直接当作游戏技能数。
3. extraDamage 当前采用统一正式熊基准；若个别技能的真实 basis 不同，需要实测或原文进一步确认。

本文已随 v0.4 的车头数据、时序与战报英雄修正同步更新；基础伤害公式没有修改。
