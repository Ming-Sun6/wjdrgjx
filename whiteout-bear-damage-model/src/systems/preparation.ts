import type { BaseTroopGroupInput } from "../domain/baseDamage";
import type { BattlePreparationConfig, MarchCapacityResult, PreparedBattleModifiers } from "../domain/preparation";
import type { HeadFormation } from "../domain/battleDamage";
import type { Skill, SkillEffect } from "../domain/skill";
import type { TroopType } from "../domain/troop";
import { allocateTroopsByRatio } from "../optimizer/troop-ratio/allocateTroopsByRatio";
import { BEAR_SLAYER_CAPACITY_PER_LEVEL, EXCLUSIVE_WEAPON_RATES, HUNTER_HEART_RATES, PET_BUFF_RATES, PET_CAPACITY_PER_LEVEL, TOWN_BUFF_RATES, lookupLevel } from "../game-data/systems/progression";
import { getHeadHeroById } from "../game-data/heroes/headHeroQueries";

export function calculateMarchCapacity(config: BattlePreparationConfig): MarchCapacityResult {
  if(!Number.isSafeInteger(config.baseMarchCapacity)||config.baseMarchCapacity<0) throw new Error("基础出征容量必须是非负整数。");
  if(config.capacityMode==="useFinalTroops") return {baseMarchCapacity:config.baseMarchCapacity,expertFixedCapacity:0,petFixedCapacity:0,otherFixedCapacity:0,fixedAdjustedCapacity:config.baseMarchCapacity,townMarchCapacityRate:0,rawFinalMarchCapacity:config.baseMarchCapacity,finalMarchCapacity:config.baseMarchCapacity};
  const other=config.otherFixedCapacity??0;
  if(!Number.isSafeInteger(other)||other<0) throw new Error("其他固定容量必须是非负整数。");
  const expert=bounded(config.expert.bearSlayerLevel,0,10,"巨熊克星")*BEAR_SLAYER_CAPACITY_PER_LEVEL;
  const pet=bounded(config.pet.capacityLevel,0,10,"宠物容量")*PET_CAPACITY_PER_LEVEL;
  const fixed=config.baseMarchCapacity+expert+pet+other;
  if(!Number.isSafeInteger(fixed)) throw new Error("固定容量合计必须是安全整数。");
  const town=TOWN_BUFF_RATES[config.town.marchCapacity];
  const raw=fixed*(1+town);
  if(!Number.isFinite(raw)||raw>Number.MAX_SAFE_INTEGER) throw new Error("最终出征容量超出安全整数范围。");
  return {baseMarchCapacity:config.baseMarchCapacity,expertFixedCapacity:expert,petFixedCapacity:pet,otherFixedCapacity:other,fixedAdjustedCapacity:fixed,townMarchCapacityRate:town,rawFinalMarchCapacity:raw,finalMarchCapacity:Math.floor(raw)};
}

export function prepareBattleModifiers(troops:readonly BaseTroopGroupInput[], formation:HeadFormation, config:BattlePreparationConfig):PreparedBattleModifiers {
  const capacity=calculateMarchCapacity(config);
  const sourceCounts={shield:0,lancer:0,marksman:0};
  for(const troop of troops) sourceCounts[troop.troopType]+=troop.troopCount;
  const total=sourceCounts.shield+sourceCounts.lancer+sourceCounts.marksman;
  const ratios=total===0?{shield:0,lancer:0,marksman:100}:{shield:sourceCounts.shield/total*100,lancer:sourceCounts.lancer/total*100,marksman:sourceCounts.marksman/total*100};
  const troopCounts=config.capacityMode==="useFinalTroops"
    ? sourceCounts
    : allocateTroopsByRatio(capacity.finalMarchCapacity,ratios);
  const effects:SkillEffect[]=[];
  add(effects,"buffAttack",TOWN_BUFF_RATES[config.town.attack]+lookupLevel(PET_BUFF_RATES,config.pet.attackLevel,"宠物攻击")+(config.additionalDamageBuffs?.attackRate??0));
  add(effects,"buffPenetration",TOWN_BUFF_RATES[config.town.penetration]+lookupLevel(PET_BUFF_RATES,config.pet.penetrationLevel,"宠物穿透")+(config.additionalDamageBuffs?.penetrationRate??0));
  add(effects,"buffDefenseReduction",TOWN_BUFF_RATES[config.town.defenseReduction]+lookupLevel(PET_BUFF_RATES,config.pet.defenseReductionLevel,"宠物减防")+(config.additionalDamageBuffs?.defenseReductionRate??0));
  add(effects,"expertBearDamage",lookupLevel(HUNTER_HEART_RATES,config.expert.hunterHeartLevel,"猎手之心"));
  for(const field of ["shieldHeroId","lancerHeroId","marksmanHeroId"] as const){const id=formation[field];if(!id)continue;const hero=getHeadHeroById(id);const level=config.exclusiveWeapons?.levelsByHeroId[id]??0;const rate=lookupLevel(EXCLUSIVE_WEAPON_RATES,level,"英雄专武");if(hero?.exclusiveWeaponBuffType==="attack")add(effects,"buffAttack",rate);if(hero?.exclusiveWeaponBuffType==="penetration")add(effects,"buffPenetration",rate)}
  return {capacity,troopCounts,skills:effects.length?[{id:"system.battle-preparation",name:"专家与Buff",status:"supported",trigger:{type:"always"},effects}]:[]};
}
function add(e:SkillEffect[],type:SkillEffect["type"],value:number){if(value!==0)e.push({type,value,targetTroop:"all",status:"supported"})}
function bounded(v:number,min:number,max:number,label:string){if(!Number.isSafeInteger(v)||v<min||v>max)throw new Error(`${label}等级必须为${min}～${max}。`);return v}
