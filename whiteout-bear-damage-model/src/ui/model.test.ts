import { describe, expect, it } from "vitest";
import {
  applyOptimizationRow,
  BEAR_PIT_ATTACK_PERCENT,
  bearSlayerLevelOptions,
  bodySkillOptions,
  calculateDisplayedTotalTroops,
  calculateInputTroopTotal,
  calculateUiDamage,
  createDefaultFormState,
  createOptimizationRequest,
  displayPercentToDecimal,
  formatBodySkillOptionLabel,
  formatHeadHeroOptionLabel,
  formatRatioPercent,
  getSelectedHeroSkillDetails,
  headHeroOptions,
  hunterHeartLevelOptions,
  knownTroopLevelOptions,
  petBuffLevelOptions,
  petCapacityLevelOptions,
  runOptimizationCore,
  topKOptions,
  troopSkillLevelOptions,
  visiblePendingSkillDetails,
  type UiOptimizationRow,
} from "./model";

const fastDamage = (form: ReturnType<typeof createDefaultFormState>) =>
  calculateUiDamage(form, { includeDamageInterval: false });

/** 旧真实账号数据只作为回归fixture，不得重新成为普通UI默认值。 */
const createLegacyPlayerFixture = (): ReturnType<typeof createDefaultFormState> => {
  const form = createDefaultFormState();
  return {
    ...form,
    battleReportInputState: { troops: {
      shield: { count: "1824", troopLevelId: "T11-FC10", attackPercent: "1119.9", penetrationPercent: "521.7" },
      lancer: { count: "1823", troopLevelId: "T10-FC7", attackPercent: "867.0", penetrationPercent: "543.2" },
      marksman: { count: "178723", troopLevelId: "T12-FC10", attackPercent: "1765.0", penetrationPercent: "1551.9" },
    }, heroSelections: {
      shield: { profileId: "report-hero.shield.head.heketuo", weaponLevel: "0" },
      lancer: { profileId: "report-hero.lancer.head.miya", weaponLevel: "0" },
      marksman: { profileId: "report-hero.marksman.head.hengdelike", weaponLevel: "0" },
    } },
    bodyHeroIds: [
      "body-skill.probability-penetration-50",
      "body-skill.attack-25",
      "body-skill.defense-reduction-25",
      "body-skill.defense-reduction-25",
    ],
    headHeroIds: {
      shield: "hero.head.heketuo",
      lancer: "hero.head.miya",
      marksman: "hero.head.hengdelike",
    },
    preparation: {
      ...form.preparation,
      hunterHeartLevel: "10",
      bearSlayerLevel: "10",
      pet: { attackLevel: "9", penetrationLevel: "9", defenseReductionLevel: "10", capacityLevel: "10" },
      rallyWeaponBuff: { attackPercent: "22.5", penetrationPercent: "0" },
      marksmanBlazingStarLevel: "1",
    },
  };
};

describe("Stage 25 UI adapter",()=>{
  it("计算基础兵种数据",()=>expect(fastDamage(createLegacyPlayerFixture()).expectedTotalDamage).toBeGreaterThan(0));
  it("把444.35%解释为4.4435",()=>expect(displayPercentToDecimal("444.35")).toBeCloseTo(4.4435,12));
  it("普通网页默认使用全中性配置",()=>{
    const form=createDefaultFormState();
    expect(calculateDisplayedTotalTroops(form)).toBe(0);
    expect(form.inputMode).toBe("battleReport");
    expect(form.battleReportInputState.troops).toEqual({
      shield:{count:"0",troopLevelId:"T1",attackPercent:"0",penetrationPercent:"0"},
      lancer:{count:"0",troopLevelId:"T1",attackPercent:"0",penetrationPercent:"0"},
      marksman:{count:"0",troopLevelId:"T1",attackPercent:"0",penetrationPercent:"0"},
    });
    expect(form.rallyInputState).toEqual({generalAttackPercent:"0",generalPenetrationPercent:"0",troops:form.battleReportInputState.troops});
    expect(form.preparation).toMatchObject({
      hunterHeartLevel:"0",bearSlayerLevel:"0",
      town:{attack:"none",penetration:"none",defenseReduction:"none",marchCapacity:"none"},
      pet:{attackLevel:"0",penetrationLevel:"0",defenseReductionLevel:"0",capacityLevel:"0"},
      rallyWeaponBuff:{attackPercent:"0",penetrationPercent:"0"},marksmanBlazingStarLevel:"0",lancerT12SkillLevel:"0",
    });
    expect(form.preparation).not.toHaveProperty("baseMarchCapacity");
    expect(calculateInputTroopTotal(form)).toBe(0);
    expect(form.headHeroIds).toEqual({shield:"",lancer:"",marksman:""});
    expect(form.bodyHeroIds).toEqual(["","","",""]);
    expect(form.ratioStepPercent).toBe("0.01");
  });
  it("旧真实账号fixture仍使用最终227370兵力并把熊坑25%加入基础攻击",()=>{
    const result=fastDamage(createLegacyPlayerFixture());
    expect(result.totalTroopCount).toBe(227370);
    expect(result.result.preparation?.troopCounts).toEqual({shield:2274,lancer:2273,marksman:222823});
    expect(result.baseDamageByTroop.marksman).toBeCloseTo(5253635.131778705,8);
    expect(result.expectedTotalDamage).toBeCloseTo(1359965545.2079272,4);
  });
  it("supported车身进入计算",()=>expect(fastDamage(createLegacyPlayerFixture()).appliedSkills.length).toBeGreaterThan(0));
  it("拒绝负数兵量",()=>{const f=createDefaultFormState();const bad={...f,battleReportInputState:{troops:{...f.battleReportInputState.troops,shield:{...f.battleReportInputState.troops.shield,count:"-1"}}}};expect(()=>calculateUiDamage(bad)).toThrow(/非负整数/)});
  it("拒绝空百分比",()=>{const f=createDefaultFormState();const bad={...f,battleReportInputState:{troops:{...f.battleReportInputState.troops,shield:{...f.battleReportInputState.troops.shield,attackPercent:""}}}};expect(()=>calculateUiDamage(bad)).toThrow(/不能为空/)});
  it("普通UI输入模型不再保存防御和生命字段",()=>{
    const troops=createDefaultFormState().battleReportInputState.troops;
    expect(Object.values(troops).every((troop)=>!("defensePercent" in troop)&&!("healthPercent" in troop))).toBe(true);
  });
  it("三兵种任一原始兵数变化都会自动更新基础容量",()=>{
    const form=createLegacyPlayerFixture();
    for(const troopType of ["shield","lancer","marksman"] as const){
      const changed={...form,battleReportInputState:{troops:{...form.battleReportInputState.troops,[troopType]:{...form.battleReportInputState.troops[troopType],count:String(Number(form.battleReportInputState.troops[troopType].count)+1)}}}};
      expect(calculateInputTroopTotal(changed)).toBe(182371);
    }
  });
  it("优化方案只按比例写回原始总兵数，避免把扩容结果再次作为基础容量",()=>{
    const form=createLegacyPlayerFixture();
    const row={rank:1,expectedTenRoundDamage:1,improvementRatio:0,troopCounts:{shield:2274,lancer:4547,marksman:220549},ratios:{shield:1,lancer:2,marksman:97},bodyHeroIds:[],bodyHeroNames:[],headFormation:{},headHeroNames:[],fireCrystalSkillIds:[],fireCrystalNames:[]} satisfies UiOptimizationRow;
    const applied=applyOptimizationRow(form,row);
    expect(calculateInputTroopTotal(applied)).toBe(182370);
    expect(applied.battleReportInputState.troops).toMatchObject({shield:{count:"1824"},lancer:{count:"3647"},marksman:{count:"176899"}});
    expect(fastDamage(applied).totalTroopCount).toBe(227370);
  });
  it("兵种等级UI严格包含最终口径且保留T10-FC6至FC10",()=>{
    const ids=knownTroopLevelOptions.map(level=>level.id);
    expect(ids).toEqual([
      "T1","T2","T3","T4","T5","T6","T7","T8","T9","T10",
      "T10-FC1","T10-FC2","T10-FC3","T10-FC4","T10-FC5","T10-FC6","T10-FC7","T10-FC8","T10-FC9","T10-FC10",
      "T11-FC5","T11-FC6","T11-FC7","T11-FC8","T11-FC9","T11-FC10","T12-FC10",
    ]);
    expect(knownTroopLevelOptions.every(level=>level.constant!==null)).toBe(true);
  });
  it("普通车身UI只展示九类技能效果，不按英雄展开",()=>{
    expect(bodySkillOptions.map(option=>option.label)).toEqual([
      "全军攻击 +25%","全军穿透 +25%","敌军防御 -25%","全军伤害 +20%","易伤 +25%",
      "40%概率全军穿透 +50%","50%概率易伤 +50%","20%概率增伤 +40%（持续3回合）","普攻伤害 +30%",
    ]);
  });
  it("尼莫出现在盾兵车头选项且三个远征技能可计算，探险技能仍隔离",()=>{
    const nimo=headHeroOptions.find((hero)=>hero.id==="hero.head.nimo")!;
    expect(nimo.troopType).toBe("shield");
    expect(nimo.headSkills.map((definition)=>definition.name)).toEqual(["战前宣言","剑术指导","精湛剑术"]);
    expect(formatHeadHeroOptionLabel(nimo)).toBe("尼莫（S1）");
    const form=createLegacyPlayerFixture();
    const selected={...form,headHeroIds:{...form.headHeroIds,shield:nimo.id}};
    const details=getSelectedHeroSkillDetails(selected);
    expect(details.some((detail)=>detail.sourceSummary?.includes("尼莫")&&detail.skillName==="战前宣言"&&detail.summary.includes("穿透 +25%"))).toBe(true);
    expect(details.some((detail)=>detail.sourceSummary?.includes("尼莫")&&detail.skillName==="剑术指导"&&detail.summary.includes("攻击 +25%"))).toBe(true);
    expect(details.some((detail)=>detail.sourceSummary?.includes("尼莫")&&detail.skillName==="精湛剑术"&&detail.summary.includes("伤害 +30%")&&detail.summary.includes("5、6、9、10"))).toBe(true);
    expect(nimo.explorationSkills?.map((skill)=>skill.name)).toEqual(["三断斩","剑气","孤傲"]);
  });
  it("历史英雄专武类型数据仍保留但不驱动当前UI输入",()=>{
    const nimo=headHeroOptions.find((hero)=>hero.id==="hero.head.nimo")!;
    expect(nimo.exclusiveWeaponBuffType).toBe("attack");
  });
  it("容量配置进入UI计算并保持兵种和等于finalMarchCapacity",()=>{
    const f=createLegacyPlayerFixture();
    const configured={...f,preparation:{...f.preparation,bearSlayerLevel:"10",town:{...f.preparation.town,marchCapacity:"small" as const}}};
    const result=fastDamage(configured);
    expect(result.totalTroopCount).toBe(250107);
    expect(Object.values(result.result.preparation!.troopCounts).reduce((sum,count)=>sum+count,0)).toBe(250107);
  });
  it("所有有限整数等级选项完整且无越界值",()=>{
    const values=(options:readonly {value:string}[])=>options.map((option)=>Number(option.value));
    expect(values(hunterHeartLevelOptions)).toEqual(Array.from({length:12},(_,index)=>index));
    expect(values(bearSlayerLevelOptions)).toEqual(Array.from({length:11},(_,index)=>index));
    expect(values(petBuffLevelOptions)).toEqual(Array.from({length:11},(_,index)=>index));
    expect(values(petCapacityLevelOptions)).toEqual(Array.from({length:11},(_,index)=>index));
    expect(values(troopSkillLevelOptions)).toEqual(Array.from({length:25},(_,index)=>index));
    expect(values(topKOptions)).toEqual(Array.from({length:100},(_,index)=>index+1));
  });
  it("英雄选项直接显示数据层数值且不暴露内部状态或确认计数",()=>{
    const attack=bodySkillOptions.find((option)=>option.id==="body-skill.attack-25")!;
    const hendrick=bodySkillOptions.find((option)=>option.id==="body-skill.defense-reduction-25")!;
    expect(formatBodySkillOptionLabel(attack)).toBe("全军攻击 +25%");
    expect(formatBodySkillOptionLabel(hendrick)).toBe("敌军防御 -25%");
    for(const item of [...bodySkillOptions,...headHeroOptions]){
      const label="representativeHeroId" in item?formatBodySkillOptionLabel(item):formatHeadHeroOptionLabel(item);
      expect(label).not.toMatch(/supported|pending|已确认\/|待确认$/);
    }
  });
  it("格温规则补全后用户可见待确认清单归零",()=>{
    expect(visiblePendingSkillDetails).toHaveLength(0);
    const gwen=headHeroOptions.find((hero)=>hero.id==="hero.head.gewen")!;
    expect(formatHeadHeroOptionLabel(gwen)).not.toContain("有待确认技能");
  });
  it("重复车身技能按语义合并而不是按heroId逐条显示",()=>{
    const form=createLegacyPlayerFixture();
    const details=getSelectedHeroSkillDetails({...form,headHeroIds:{shield:"",lancer:"",marksman:""}});
    const defense=details.filter((detail)=>detail.status==="applied"&&detail.skillName==="敌军防御 -25%");
    expect(defense).toHaveLength(1);
    expect(defense[0]).toMatchObject({sourceSummary:"亨德里克",totalSummary:"减防 +50%"});
  });
  it("比例统一显示到0.01%",()=>{
    expect(formatRatioPercent(7)).toBe("7.00%");
    expect(formatRatioPercent(33.333333)).toBe("33.33%");
  });

  it("战报攻击只与熊坑25个百分点在基础A中加算",()=>{
    const form=createDefaultFormState();
    const report={...form,battleReportInputState:{troops:{
      ...form.battleReportInputState.troops,
      shield:{...form.battleReportInputState.troops.shield,attackPercent:"500",penetrationPercent:"0"},
    }}};
    const result=fastDamage(report);
    expect(BEAR_PIT_ATTACK_PERCENT).toBe(25);
    expect(result.percentageNormalization.shield.attack).toEqual({displayPercent:525,decimal:5.25,multiplier:6.25});
  });

  it("战报英雄与实际车头静态差值进入基础A/P且优化请求复用同一配置", () => {
    const form=createDefaultFormState();
    const configured={
      ...form,
      battleReportInputState:{
        ...form.battleReportInputState,
        troops:{
          ...form.battleReportInputState.troops,
          marksman:{...form.battleReportInputState.troops.marksman,count:"5000",attackPercent:"1000",penetrationPercent:"500"},
        },
        heroSelections:{
          ...form.battleReportInputState.heroSelections!,
          marksman:{profileId:"report-hero.marksman.head.buladeli",weaponLevel:"7"},
        },
      },
      headHeroIds:{...form.headHeroIds,marksman:"hero.head.bulanqi"},
      headHeroWeaponLevels:{...form.headHeroWeaponLevels,marksman:"10"},
      ratioStepPercent:"100",
    };
    const result=fastDamage(configured);
    expect(result.percentageNormalization.marksman.attack.displayPercent).toBeCloseTo(1485.36,12);
    expect(result.percentageNormalization.marksman.penetration.displayPercent).toBeCloseTo(665.15,12);
    const request=createOptimizationRequest(configured,"ratio");
    if(request.kind!=="ratio") throw new Error("应为比例优化请求");
    expect(request.input.battleReportHeroAdjustment?.reportHeroes.marksman).toEqual({profileId:"report-hero.marksman.head.buladeli",weaponLevel:7});
    expect(request.input.battleReportHeroAdjustment?.actualWeaponLevels.marksman).toBe(10);
  });

  it("集结基础A/P按部队属性、兵种属性和熊坑攻击加算",()=>{
    const form=createDefaultFormState();
    const rally={...form,inputMode:"rally" as const,rallyInputState:{
      ...form.rallyInputState,
      generalAttackPercent:"192.3",
      generalPenetrationPercent:"37.1",
      troops:{...form.rallyInputState.troops,shield:{...form.rallyInputState.troops.shield,count:"1",attackPercent:"357.8",penetrationPercent:"214.8"}},
    }};
    const result=fastDamage(rally);
    expect(result.percentageNormalization.shield.attack.displayPercent).toBeCloseTo(575.1,12);
    expect(result.percentageNormalization.shield.attack.decimal).toBeCloseTo(5.751,12);
    expect(result.percentageNormalization.shield.attack.multiplier).toBeCloseTo(6.751,12);
    expect(result.percentageNormalization.shield.penetration.displayPercent).toBeCloseTo(251.9,12);
    expect(result.percentageNormalization.shield.penetration.multiplier).toBeCloseTo(3.519,12);
    const request=createOptimizationRequest({...rally,ratioStepPercent:"100"},"ratio");
    if(request.kind!=="ratio") throw new Error("应为比例优化请求");
    expect(request.input.battleReportHeroAdjustment).toBeUndefined();
  });

  it("集结专武输入进入Buff小区且不改变基础A/P或Skill小区",()=>{
    const form=createDefaultFormState();
    const rally={...form,inputMode:"rally" as const,rallyInputState:{
      ...form.rallyInputState,
      generalAttackPercent:"192.3",
      generalPenetrationPercent:"37.1",
      troops:{...form.rallyInputState.troops,
        shield:{...form.rallyInputState.troops.shield,count:"100",attackPercent:"357.8",penetrationPercent:"214.8"},
        lancer:{...form.rallyInputState.troops.lancer,count:"100"},
        marksman:{...form.rallyInputState.troops.marksman,count:"100"},
      },
    },preparation:{
      ...form.preparation,
      pet:{...form.preparation.pet,attackLevel:"5",penetrationLevel:"5"},
      rallyWeaponBuff:{attackPercent:"10",penetrationPercent:"20"},
    }};
    const result=fastDamage(rally);
    const multipliers=result.result.expectedDamageByRound[0]!.expectedMultipliersByTroop.shield!.byEffectType;
    expect(result.percentageNormalization.shield.attack.displayPercent).toBeCloseTo(575.1,12);
    expect(result.percentageNormalization.shield.penetration.displayPercent).toBeCloseTo(251.9,12);
    expect(multipliers.buffAttack).toBeCloseTo(1.15,12);
    expect(multipliers.buffPenetration).toBeCloseTo(1.25,12);
    expect(multipliers.attack).toBe(1);
    expect(multipliers.penetration).toBe(1);
  });

  it("正式计算与优化器共享相同的集结专武Buff输入",()=>{
    const form=createDefaultFormState();
    const configured={
      ...form,
      ratioStepPercent:"100",
      topK:"3",
      battleReportInputState:{troops:{
        shield:{...form.battleReportInputState.troops.shield,count:"0"},
        lancer:{...form.battleReportInputState.troops.lancer,count:"0"},
        marksman:{...form.battleReportInputState.troops.marksman,count:"5000"},
      }},
      preparation:{...form.preparation,rallyWeaponBuff:{attackPercent:"10",penetrationPercent:"20"}},
    };
    const damage=fastDamage(configured);
    const request=createOptimizationRequest(configured,"ratio");
    if(request.kind!=="ratio") throw new Error("应生成比例优化请求");
    expect(request.input.preparation?.additionalDamageBuffs).toEqual({attackRate:.1,penetrationRate:.2});
    const optimized=runOptimizationCore(request);
    if(optimized.kind!=="ratio") throw new Error("应返回比例优化结果");
    expect(optimized.result.results[0]?.troopCounts).toEqual({shield:0,lancer:0,marksman:5000});
    expect(optimized.result.results[0]?.score).toBeCloseTo(damage.expectedTotalDamage,8);
  });

  it("集结模式直接使用最终130310兵数并忽略全部容量扩展历史状态",()=>{
    const form=createDefaultFormState();
    const rally={...form,inputMode:"rally" as const,rallyInputState:{...form.rallyInputState,troops:{
      shield:{...form.rallyInputState.troops.shield,count:"10"},
      lancer:{...form.rallyInputState.troops.lancer,count:"300"},
      marksman:{...form.rallyInputState.troops.marksman,count:"130000"},
    }},preparation:{...form.preparation,bearSlayerLevel:"10",town:{...form.preparation.town,marchCapacity:"large" as const},pet:{...form.preparation.pet,capacityLevel:"10"}}};
    const result=fastDamage(rally);
    expect(result.totalTroopCount).toBe(130310);
    expect(result.result.preparation?.troopCounts).toEqual({shield:10,lancer:300,marksman:130000});
    expect(result.result.preparation?.capacity).toMatchObject({expertFixedCapacity:0,petFixedCapacity:0,townMarchCapacityRate:0,finalMarchCapacity:130310});
  });

  it("两种输入模式在同一表单状态中独立保存",()=>{
    const form=createDefaultFormState();
    const changedReport={...form,battleReportInputState:{troops:{...form.battleReportInputState.troops,shield:{...form.battleReportInputState.troops.shield,count:"777"}}}};
    const changedBoth={...changedReport,rallyInputState:{...changedReport.rallyInputState,generalAttackPercent:"333",troops:{...changedReport.rallyInputState.troops,shield:{...changedReport.rallyInputState.troops.shield,count:"888"}}}};
    expect(changedBoth.battleReportInputState.troops.shield.count).toBe("777");
    expect(changedBoth.rallyInputState.troops.shield.count).toBe("888");
    expect(changedBoth.rallyInputState.generalAttackPercent).toBe("333");
  });

  it("集结模式优化继续按期望伤害评分且固定使用最终兵数",()=>{
    const form=createDefaultFormState();
    const rally={...form,inputMode:"rally" as const,ratioStepPercent:"100",topK:"3",rallyInputState:{...form.rallyInputState,troops:{
      shield:{...form.rallyInputState.troops.shield,count:"10"},
      lancer:{...form.rallyInputState.troops.lancer,count:"300"},
      marksman:{...form.rallyInputState.troops.marksman,count:"130000"},
    }}};
    const request=createOptimizationRequest(rally,"ratio");
    expect(request.kind).toBe("ratio");
    if(request.kind!=="ratio") throw new Error("expected ratio request");
    expect(request.input.totalTroopCount).toBe(130310);
    expect(request.input.preparation?.capacityMode).toBe("useFinalTroops");
    const result=runOptimizationCore(request);
    if(result.kind!=="ratio") throw new Error("expected ratio result");
    expect(result.result.scoreMetric).toBe("expectedTenRoundTotalDamage");
    expect(result.result.results.every((candidate)=>Object.values(candidate.troopCounts).reduce((sum,count)=>sum+count,0)===130310)).toBe(true);
  });

  it("优化候选不计算分布，排名完成后可只为第1名生成95%区间",()=>{
    const original=createDefaultFormState();
    const deterministic={
      ...original,
      ratioStepPercent:"100",
      topK:"1",
      bodyHeroIds:["body-skill.attack-25"],
      headHeroIds:{shield:"",lancer:"",marksman:""},
      battleReportInputState:{troops:Object.fromEntries((["shield","lancer","marksman"] as const).map((type)=>[
        type,
        {...original.battleReportInputState.troops[type],count:"1000",troopLevelId:"T1"},
      ])) as typeof original.battleReportInputState.troops},
      preparation:{
        ...original.preparation,
        marksmanBlazingStarLevel:"0",
        lancerT12SkillLevel:"0",
        rallyWeaponBuff:{attackPercent:"0",penetrationPercent:"0"},
      },
    };
    const request=createOptimizationRequest(deterministic,"ratio");
    const rankedOnly=runOptimizationCore(request);
    expect(rankedOnly.topDamageInterval).toBeUndefined();
    const withTopInterval=runOptimizationCore(request,{includeTopDamageInterval:true});
    expect(withTopInterval.topDamageInterval).toBeDefined();
    expect(withTopInterval.topDamageInterval?.lower95).toBeCloseTo(withTopInterval.result.results[0]!.score,8);
    expect(withTopInterval.topDamageInterval?.upper95).toBeCloseTo(withTopInterval.result.results[0]!.score,8);
  });
});
