# 真实技能十回合接入

正式入口 calculateTenRoundExpectedDamage() 收集 supported 车身、车头、自动兵种/火晶、专家与 Buff 技能，然后统一交给 SkillResolver、概率状态传播和逐回合伤害引擎。

自动技能按兵种 tier 与 FC 等级解锁；旧的显式 fireCrystal.skillIds 仅作兼容入口，和自动来源相同的记录会去重。pending 不计分并返回原因，DATA_SOURCE_UNCERTAIN 不进入正常候选。

评分为10回合总期望伤害。基础公式仍只计算单回合、单兵种基础伤害；概率层不复制 k、`sqrt(min(N,5000))` 总兵数上限、Cd 或 Ct 逻辑。

当前 catalog：82技能记录（78 supported、4 pending），82效果记录（82 supported、0 pending）。尼莫、弗林特、格温与v0.4车头的已确认远征技能均已进入正式目录；具体清单见 pending-skill-audit.md。
