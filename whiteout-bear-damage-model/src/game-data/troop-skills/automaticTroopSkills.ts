import type { BaseTroopGroupInput } from "../../domain/baseDamage";
import type { TroopSkillLevelConfig } from "../../domain/preparation";
import type { Skill, SkillEffect } from "../../domain/skill";
import type { TroopLevel } from "../../domain/troop";
import { troopLevels } from "../troops/troopLevels";
import { troopTierSkills } from "./troopTierSkills";

const levelCatalog=troopLevels as Readonly<Record<string,TroopLevel>>;
export function resolveAutomaticTroopSkills(troops:readonly BaseTroopGroupInput[],levels:TroopSkillLevelConfig={}):readonly Skill[]{
  const skills:Skill[]=[];
  const marksman=troops.find(t=>t.troopType==="marksman");
  const lancer=troops.find(t=>t.troopType==="lancer");
  if(marksman){
    const level=levelCatalog[marksman.troopLevelId]!;
    skills.push(always("skill.auto.marksman.remote-strike","远程打击",{type:"troopVsTroopDamage",value:.10,targetTroop:"marksman"},"troop-skill.marksman.remote-strike","fireCrystalSkill"));
    if(level.tier>=7) skills.push(expectedRapidFire());
    const fc=level.fireCrystalLevel??0;
    if(fc>=3){const probability=fc>=5?.30:.20;const linked=fc>=10?.375:fc>=8?.25:0;skills.push(probabilityExtra("skill.auto.marksman.crystal-powder","燃晶火药",probability,"marksman",[.5,...(linked?[linked]:[])],fc>=5?"troop-skill.marksman.crystal-powder":"troop-skill.marksman.crystal-powder-l1"))}
    if(fc>=8)skills.push(always("skill.auto.marksman.flame-impact","火焰冲击",{type:"normalAttackDamageIncrease",value:fc>=10?.06:.04,targetTroop:"marksman"},fc>=10?"troop-skill.marksman.flame-impact":"troop-skill.marksman.flame-impact-l1","fireCrystalSkill"));
    const blazing=levels.marksmanBlazingStarLevel??0;bounded(blazing,0,24,"炽火燧星（射T12技能）");
    if(blazing>0)skills.push(always("skill.auto.marksman.blazing-star",`炽火燧星（射T12技能） L${blazing}`,{type:"baseDamageIncrease",value:.005*blazing,targetTroop:"marksman",activeRounds:[6,7,8,9,10]},"troop-skill.marksman.blazing-star","fireCrystalSkill"));
  }
  if(lancer){
    const level=levelCatalog[lancer.troopLevelId]!;
    const t12=levels.lancerT12SkillLevel??0;bounded(t12,0,24,"烈辉战阵（矛T12技能）");
    if(level.tier>=12&&t12>0)skills.push(always("skill.auto.lancer.t12","烈辉战阵（矛T12技能）",{type:"baseDamageIncrease",value:.01*t12,targetTroop:"lancer",activeRounds:[1,2,3,4,5]}));
    const fc=level.fireCrystalLevel??0;
    if(fc>=3)skills.push(probabilityExtra("skill.auto.lancer.crystal-spear","炎晶战矛",fc>=5?.15:.10,"lancer",[1]));
  }
  return skills;
}
function always(id:string,name:string,effect:SkillEffect,sourceRecordId?:string,sourceKind?:Skill["sourceKind"]):Skill{return{id,name,status:"supported",trigger:{type:"always"},effects:[{...effect,status:"supported"}],...(sourceRecordId?{sourceRecordId}:{}),...(sourceKind?{sourceKind}:{})}}
function probabilityExtra(id:string,name:string,probability:number,target:"lancer"|"marksman",rates:readonly number[],sourceRecordId?:string):Skill{return{id,name,status:"supported",trigger:{type:"probability",probability,triggerPhase:"beforeAttack",frequency:"oncePerRound"},effects:rates.map((value,index)=>({type:"extraDamage",value,targetTroop:target,basis:"postMultiplierDamage",damageCategory:"extra",applicableMultiplierZones:[],status:"supported",rawDescription:index===0?name:`${name}联动`})),...(sourceRecordId?{sourceRecordId,sourceKind:"fireCrystalSkill" as const}:{})}}
function expectedRapidFire():Skill{return{id:"skill.auto.marksman.rapid-fire-expected",name:"连射（期望额外伤害）",status:"supported",trigger:{type:"always"},sourceRecordId:troopTierSkills.marksmanRapidFire.id,sourceKind:"troopTierSkill",rawMechanicType:"extraAttack",bearModelType:"extraDamageExpected",rawDescription:"原始机制为10%概率额外攻击一次；当前正式打熊模型映射为+10%期望extraDamage，不创建AttackEvent。",effects:[{type:"extraDamage",value:.10,targetTroop:"marksman",basis:"postMultiplierDamage",damageCategory:"extra",applicableMultiplierZones:[],status:"supported",rawDescription:"10% × 100% = 10%期望extraDamage。"}]}}
function bounded(value:number,min:number,max:number,label:string){if(!Number.isSafeInteger(value)||value<min||value>max)throw new Error(`${label}等级必须为${min}～${max}。`)}
