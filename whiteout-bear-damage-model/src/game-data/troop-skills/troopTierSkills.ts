import type { SupportedTroopSkillDefinition } from "../../domain/troopSkill";
const SOURCE="用户最新统一规则（2026-09-08）";
export const troopTierSkills={
  marksmanRapidFire:{id:"troop-skill.marksman.rapid-fire",name:"连射",troopType:"marksman",level:"T7+",status:"supported",sourceKind:"troopTierSkill",source:SOURCE,trigger:{type:"probability",probability:.1,triggerPhase:"beforeAttack",frequency:"oncePerRound"},rawDescription:"T7解锁：10%概率额外攻击一次；额外攻击不触发技能、不计普通攻击次数。",notes:["T7及更高阶段保留。"],effects:[{id:"effect.marksman.rapid-fire",status:"supported",type:"extraAttack",value:1,targetTroop:"marksman",trigger:{type:"probability",probability:.1,triggerPhase:"beforeAttack",frequency:"oncePerRound"},count:1,damageScale:1,triggerPolicy:{beforeAttack:false,onAttack:false,afterAttack:false,canTriggerExtraAttack:false,canTriggerExtraDamage:false},maxAttackDepth:1,rawDescription:"10%概率额外攻击一次，recursion disabled。"}]},
} as const satisfies Record<string,SupportedTroopSkillDefinition>;
