# 完整阵容优化器

optimizeFullBattleSetup() 在精确模式下组合比例、可重复车身、三个车头槽与显式配置，所有候选统一调用十回合期望伤害入口。默认评分为 expectedTenRoundTotalDamage，不复制基础公式。

专家、城镇、宠物、专武、兵种/火晶等级和最终出征容量作为固定输入。比例分配以 finalMarchCapacity 为总量并使用 largest remainder。RULE_UNKNOWN、DATA_SOURCE_UNCERTAIN 和 notApplicable 不产生评分收益。

该历史高维 API 仍保留给显式车头/火晶维度测试。v0.1 普通 UI 的“车身+比例”入口已改用 `optimizeBattleSetup()`：九个BodySkillOption、每种最多两份，并为每个BodyEffect直接求0.01% exact比例，不再走本模块的完整笛卡尔积。详见 `body-skill-options-v0.1.md`。

兵种与火晶技能正常由等级自动解锁。旧的显式 fireCrystal configuration 仍用于兼容及合成测试，与自动来源相同的技能会按 sourceRecordId 去重。
