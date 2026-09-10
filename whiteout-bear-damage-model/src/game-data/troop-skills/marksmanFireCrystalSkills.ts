import type { SupportedTroopSkillDefinition, TroopSkillId } from "../../domain/troopSkill";
import type { SkillEffectData, SkillTrigger } from "../../domain/skill";

const SOURCE="用户最新统一规则（2026-09-08）";
const triggerAlways={type:"always"} as const;
const extraZones=[] as const;

export const marksmanFireCrystalSkills={
  "troop-skill.marksman.remote-strike": supported("troop-skill.marksman.remote-strike","远程打击","已确认：对盾兵目标伤害+10%，属于skill.troopVsTroopDamage。","已确认",triggerAlways,[effect("effect.marksman.remote-strike", "troopVsTroopDamage",.10,triggerAlways,{targetEnemyTroop:"shield",conditions:[{type:"enemyTroopType",troopType:"shield"}]})]),
  "troop-skill.marksman.crystal-powder-l1": supported("troop-skill.marksman.crystal-powder-l1","燃晶火药 Lv.1","FC3：20%概率造成50%extraDamage。","FC3",prob(.20),[extraEffect("effect.marksman.crystal-powder-l1",.5,prob(.20))]),
  "troop-skill.marksman.crystal-powder": supported("troop-skill.marksman.crystal-powder","燃晶火药 Lv.2","FC5：30%概率造成50%extraDamage。","FC5",prob(.30),[extraEffect("effect.marksman.crystal-powder-l2",.5,prob(.30))]),
  "troop-skill.marksman.flame-impact-l1": supported("troop-skill.marksman.flame-impact-l1","火焰冲击 Lv.1","FC8：普通攻击+4%；燃晶火药触发时额外+25%。普通攻击部分归入normalAttackDamageIncrease。","FC8",triggerAlways,[effect("effect.marksman.flame-impact-l1.normal","normalAttackDamageIncrease",.04,triggerAlways)]),
  "troop-skill.marksman.flame-impact": supported("troop-skill.marksman.flame-impact","火焰冲击 Lv.2","FC10：普通攻击+6%；燃晶火药触发时额外+37.5%。普通攻击部分归入normalAttackDamageIncrease。","FC10",triggerAlways,[effect("effect.marksman.flame-impact-l2.normal","normalAttackDamageIncrease",.06,triggerAlways)]),
  "troop-skill.marksman.blazing-star": supported("troop-skill.marksman.blazing-star","炽火燧星（射T12技能） L24","L24：round1-5为0，round6-10射手基础增伤+12%；不是战斗叠层。","L24",triggerAlways,[{...effect("effect.marksman.blazing-star","baseDamageIncrease",.12,triggerAlways),activeRounds:[6,7,8,9,10]}]),
} as const satisfies Record<TroopSkillId,SupportedTroopSkillDefinition>;

function supported(id:TroopSkillId,name:string,rawDescription:string,level:string,trigger:SkillTrigger,effects:readonly SkillEffectData[]):SupportedTroopSkillDefinition{return{id,name,troopType:"marksman",level,status:"supported",effects,trigger,rawDescription,notes:[rawDescription],source:SOURCE,sourceKind:"fireCrystalSkill"}}
function effect(id:string,type:NonNullable<SkillEffectData["type"]>,value:number,trigger:SkillTrigger,extra:Partial<SkillEffectData>={}):SkillEffectData{return{id,status:"supported",type,value,targetTroop:"marksman",trigger,rawDescription:"用户最新统一规则",...extra}}
function extraEffect(id:string,value:number,trigger:SkillTrigger):SkillEffectData{return{...effect(id,"extraDamage",value,trigger),basis:"postMultiplierDamage",damageCategory:"extra",applicableMultiplierZones:extraZones}}
function prob(value:number){return{type:"probability" as const,probability:value,triggerPhase:"beforeAttack" as const,frequency:"oncePerRound" as const}}
