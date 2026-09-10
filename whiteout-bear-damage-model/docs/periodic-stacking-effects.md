# 周期、叠层与固定回合效果

引擎保留 everyNRounds、duration、refresh/replace/stack、maxStacks、decayRate、maxApplications 和 activeRounds/valueByRound 的通用表达。

当前确认的真实规则不通过英雄名称硬编码：

- 赫克托雷霆出击用 valueByRound 表示 round1 数值及每回合×0.85，直至round10；它是普通增伤，不是 extraDamage/extraAttack。
- 炽火燧星（射T12技能）不是战斗叠层。配置 L0–24 后，仅 round6–10 使用固定 0.005×L。
- 烈辉战阵（矛T12技能）只在 round1–5 使用固定 0.01×L。
- 布拉德利循环已知回合5、6、9、10，但效果和值未知，仍 pending。
- 车头韦恩已确认为 round4 首次、每4回合一次；10回合内 round4/8 造成100% extraDamage。车身韦恩的独立数据不随本条车头规则改变。

通用叠层框架继续为未来数据保留，但不会把未确认的真实技能强制套入某种叠层语义。
