# v0.4 战报英雄静态属性修正

## 作用范围

本系统只在“战报模式”启用。战报英雄描述生成原战报时使用的英雄静态攻击与专武穿透；它不会触发任何英雄技能，也不会替代实际车头。实际车头仍由盾、矛、射三个车头槽位决定，并独立提供全部正式远征技能。

正式入口、UI 单次计算和优化器共享 `src/systems/reportHeroAdjustment.ts`，避免各入口重复实现差值公式。数据位于 `src/game-data/heroes/reportHeroProfiles.ts`。

## 计算规则

对每个兵种分别计算：

```text
reportWeaponPen = reportHero.maxWeaponPenetrationPercent * reportWeaponLevel / 10
actualWeaponPen = actualHero.maxWeaponPenetrationPercent * actualWeaponLevel / 10
deltaAttack = actualHero.heroAttackPercent - reportHero.heroAttackPercent
deltaPenetration = actualWeaponPen - reportWeaponPen
correctedAttack = battleReportAttack + deltaAttack + 25
correctedPenetration = battleReportPenetration + deltaPenetration
```

其中 `+25` 是熊坑固定攻击，只加入 Battle Report 基础攻击 `A` 一次。英雄静态攻击差只进入 `A`，专武静态穿透差只进入 `P`；两者都不进入 Skill 或 Buff。页面已有“集结专武攻击/穿透加成”仍属于独立 Buff，与本系统不是同一概念。

集结模式继续使用 `general + troop-specific + 熊坑25%` 的既有输入，不应用战报英雄差值。

## 静态档案

| 档案 | 英雄攻击% | 满级专武穿透% |
|---|---:|---:|
| R | 90.07 | 0 |
| SR | 140.11 | 0 |
| 吉娜（SR） | 110.08 | 0 |
| S1 标准 | 200.16 | 55 |
| 尼莫（S1 特例） | 260.20 | 62.5 |
| S2 | 240.19 | 60 |
| S3 | 290.23 | 70 |
| S4 | 370.29 | 92.5 |
| S5 | 444.35 | 111 |
| S6 | 540.43 | 133.5 |
| S7 | 650.52 | 160.5 |
| S8 | 780.62 | 193 |
| S9 | 940.75 | 232 |
| S10 | 1110.88 | 277.5 |
| S11 | 1281.02 | 320 |
| S12 | 1451.16 | 362.5 |
| S13 | 1621.29 | 405 |
| S14 | 1791.43 | 447.5 |
| S15 | 1961.51 | 490 |
| S16 | 2131.70 | 532.5 |

尼莫特例通过 `SPECIAL_HEAD_HERO_STATIC_OVERRIDES` 配置，不在伤害引擎按英雄名判断。其他 S1（包括津曼）使用 S1 标准档案。

## 下拉规则

- 盾：R、SR、S1、尼莫（S1）、弗林特（S2）、S3、S4、赫克托（S5）、S6～S16。
- 矛：R、SR、S1、S2、米娅（S3）、S4～S16。
- 射：R、SR、吉娜（SR）、津曼（S1）至艾诗琳（S16），全部使用已知英雄名。

R、SR、吉娜没有专武，选择后专武等级固定为0并禁用。橙色档案和实际车头的专武等级均为0～10，默认0。

## 回归基准

- 布拉德利（S7）专武7 → 布兰琪（S10）专武10：`deltaAttack = 460.36`，`deltaPenetration = 165.15`。
- 同英雄、同专武等级：两个差值均为0。
- 吉娜（SR）→ 布拉德利（S7）专武7：`deltaAttack = 540.44`，`deltaPenetration = 112.35`。

