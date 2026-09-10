# 精确概率引擎

十回合期望通过 WeightedBattleState 精确传播：每个 Bernoulli 事件按 p 与 1-p 分裂，未来演化完全等价的状态用稳定 key 合并，期望伤害按概率加权。不会把持续、刷新、叠层或联动技能粗略替换成 1+p×x。

状态可携带 ActiveEffect、remainingRounds、stackCount、applicationCount 与 extraDamage。概率质量逐回合保持约等于1，仅允许浮点容差；不做十进制定点取整或 Monte Carlo。extraAttack 事件能力仍保留在底层历史框架，但当前正式熊入口不会安排这类事件。

真实规则已接入：格雷格每回合20%并刷新3回合；阿隆索/琳恩每回合40%当回合穿透；米娅每个实例每回合三次独立50%并产生下一回合不叠加易伤；赫克托疾风猛击每回合25%产生+100%D extraDamage；韦恩每个兵种独立25%暴击且只放大普通攻击；维薇卡每个兵种独立20%产生+100% extraDamage；连射、燃晶火药和炎晶战矛使用显式概率事件。

`independentTroopTargets` 会在场景编译时把一个真实技能展开为按兵种独立的 Bernoulli 事件，事件效果只指向对应兵种。期望计算与95%伤害区间使用同一组分支；优化候选只计算期望，排名完成后才为Top结果生成分布。

米娅同源实例使用数据中的 `instanceAggregation` 分组。若有 `m` 个实例，引擎先计算 `P(active)=1-(1-0.5)^(3m)`，再且仅再应用一次 `vulnerable +0.50`。禁止把每个实例的 `0.875×0.50` 期望率线性相加。该规则同时用于正式概率状态传播和优化器 compiled evaluator；其他来源的普通 vulnerable 继续按既有小乘区规则处理，格温 replace 规则不变。

所有具体技能仍来自 catalog。概率引擎不包含英雄名称分支，也不复制基础伤害公式。
