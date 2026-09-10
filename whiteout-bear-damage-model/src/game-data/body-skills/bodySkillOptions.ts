import type { AggregatedBodyEffect, BodySkillOption, BodySkillOptionId } from "../../domain/bodySkillOption";
import type { BodyHeroId, SupportedHeroDefinition } from "../../domain/hero";
import type { Skill } from "../../domain/skill";
import { getHeroById, getSupportedBodyHeroes } from "../heroes/bodyHeroQueries";

interface OptionSeed {
  readonly id: BodySkillOptionId;
  readonly label: string;
  readonly representativeHeroId: BodyHeroId | null;
  readonly notes?: readonly string[];
}

const seeds: readonly OptionSeed[] = [
  { id: "body-skill.attack-25", label: "全军攻击 +25%", representativeHeroId: "hero.body.shuyun" },
  { id: "body-skill.penetration-25", label: "全军穿透 +25%", representativeHeroId: "hero.body.jiexi" },
  { id: "body-skill.defense-reduction-25", label: "敌军防御 -25%", representativeHeroId: "hero.body.hengdelike" },
  { id: "body-skill.damage-20", label: "全军伤害 +20%", representativeHeroId: "hero.body.suoniya" },
  { id: "body-skill.vulnerable-25", label: "易伤 +25%", representativeHeroId: "hero.body.gewen" },
  { id: "body-skill.probability-penetration-50", label: "40%概率全军穿透 +50%", representativeHeroId: "hero.body.alongsuo" },
  { id: "body-skill.probability-vulnerable-50", label: "50%概率易伤 +50%", representativeHeroId: "hero.body.miya" },
  { id: "body-skill.greg-damage-40", label: "20%概率增伤 +40%（持续3回合）", representativeHeroId: "hero.body.geleige" },
  { id: "body-skill.normal-attack-30", label: "普攻伤害 +30%", representativeHeroId: "hero.body.lingnai" },
] as const;

export const bodySkillOptions: readonly BodySkillOption[] = Object.freeze(
  seeds.map(createOption),
);

const byId = new Map(bodySkillOptions.map((option) => [option.id, option]));
const byHeroId = new Map<BodyHeroId, BodySkillOption>();
for (const option of bodySkillOptions) {
  for (const heroId of option.sourceHeroIds) byHeroId.set(heroId, option);
}

export function getAllBodySkillOptions(): readonly BodySkillOption[] {
  return bodySkillOptions;
}

export function getBodySkillOptionById(id: BodySkillOptionId): BodySkillOption | undefined {
  return byId.get(id);
}

export function getBodySkillOptionForHeroId(id: BodyHeroId): BodySkillOption | undefined {
  return byHeroId.get(id);
}

export function resolveBodySkillOptionHeroIds(ids: readonly BodySkillOptionId[]): readonly BodyHeroId[] {
  return ids.flatMap((id) => {
    const option = getBodySkillOptionById(id);
    if (option === undefined) throw new Error(`不存在车身技能选项：${id}。`);
    return option.representativeHeroId === null ? [] : [option.representativeHeroId];
  });
}

/** sourceHeroes 只做资料追溯；完全相同的正式技能语义自动归入同一选项。 */
function createOption(seed: OptionSeed): BodySkillOption {
  if (seed.representativeHeroId === null) {
    return {
      ...seed,
      sourceHeroIds: [],
      sourceHeroNames: [],
      skill: null,
      outgoingDamageApplicable: false,
      notes: seed.notes ?? [],
    };
  }
  const representative = requireSupportedHero(seed.representativeHeroId);
  const signature = skillCombatSignature(representative.bodySkill);
  const sources = getSupportedBodyHeroes().filter(
    (hero) => skillCombatSignature(hero.bodySkill) === signature,
  );
  return {
    ...seed,
    sourceHeroIds: sources.map((hero) => hero.id),
    sourceHeroNames: sources.map((hero) => hero.name),
    skill: representative.bodySkill,
    outgoingDamageApplicable: true,
    notes: seed.notes ?? representative.notes,
  };
}

function requireSupportedHero(id: BodyHeroId): SupportedHeroDefinition {
  const hero = getHeroById(id);
  if (hero === undefined || hero.status !== "supported") {
    throw new Error(`车身技能选项的代表英雄不可用：${id}。`);
  }
  return hero;
}

export function skillCombatSignature(skill: Skill): string {
  return JSON.stringify({
    trigger: skill.trigger,
    lifecycle: skill.lifecycle ?? null,
    effects: skill.effects.map(({ rawDescription: _raw, status: _status, ...effect }) => effect),
  });
}

export function bodyEffectSignature(options: readonly BodySkillOption[]): string {
  return options
    .filter((option) => option.skill !== null)
    .map((option) => skillCombatSignature(option.skill!))
    .sort()
    .join("|");
}

export function aggregateBodyEffect(options: readonly BodySkillOption[]): AggregatedBodyEffect {
  const optionCounts: Record<string, number> = {};
  for (const option of options) optionCounts[option.id] = (optionCounts[option.id] ?? 0) + 1;
  return {
    options,
    optionCounts,
    skills: options.flatMap((option) => option.skill === null ? [] : [option.skill]),
    representativeHeroIds: options.flatMap((option) =>
      option.representativeHeroId === null ? [] : [option.representativeHeroId],
    ),
    signature: bodyEffectSignature(options),
  };
}
