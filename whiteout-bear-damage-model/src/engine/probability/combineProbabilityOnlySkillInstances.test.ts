import { describe, expect, it } from "vitest";
import { getHeadHeroById } from "../../game-data/heroes/headHeroQueries";
import { combineProbabilityOnlySkillInstances } from "./combineProbabilityOnlySkillInstances";

const miaSkill = getHeadHeroById("hero.head.miya")!.headSkills.find(
  (definition) => definition.id === "head-skill.miya.doom-entanglement",
)!.skill!;

describe("多实例probability-only状态合并", () => {
  it("米娅数据显式声明概率叠加且幅度不叠加", () => {
    expect(miaSkill.trigger).toMatchObject({
      type: "probability",
      probability: 0.5,
      attemptsPerRound: 3,
      instanceAggregation: {
        groupId: "bear.miya.next-round-vulnerable-50",
        stackingMode: "probabilityOnly",
        magnitudeStacking: false,
      },
    });
    expect(miaSkill.effects).toEqual([
      expect.objectContaining({ type: "vulnerable", value: 0.5 }),
    ]);
  });

  it("任意实例数量先合并所有失败概率，米娅自身期望易伤倍率不超过1.5", () => {
    for (let instanceCount = 1; instanceCount <= 20; instanceCount += 1) {
      const [combined] = combineProbabilityOnlySkillInstances(
        Array.from({ length: instanceCount }, () => miaSkill),
      );
      expect(combined?.trigger.type).toBe("probability");
      if (combined?.trigger.type !== "probability") continue;
      const attempts = combined.trigger.attemptsPerRound ?? 1;
      const activeProbability = 1 - (1 - combined.trigger.probability) ** attempts;
      expect(activeProbability).toBeCloseTo(1 - 0.5 ** (3 * instanceCount), 12);
      expect(1 + activeProbability * 0.5).toBeLessThanOrEqual(1.5);
    }
  });
});
