import { describe, expect, it } from "vitest";
import type { ActiveEffectInput } from "./activeEffects";
import { createActiveEffect, decrementEffectDurations, recordEffectApplication, setEffectStackCount } from "./activeEffects";
import { InvalidBattleStateError } from "./errors";

// 人工构造的状态单元，不对应任何游戏英雄或已确认时序。
const seed: ActiveEffectInput = {
  id: "test-effect-instance",
  sourceSkillId: "test-skill",
  effect: { type: "attack", value: 0.25, targetTroop: "all" },
};

describe("ActiveEffect 状态操作（无伤害结算）", () => {
  it("显式递减持续时间，归零移除，永久效果保留且原快照不变", () => {
    const temporary = createActiveEffect({ ...seed, durationRounds: 3 });
    const permanent = createActiveEffect({ ...seed, id: "permanent" });
    const initial = [temporary, permanent];
    const first = decrementEffectDurations(initial);
    const second = decrementEffectDurations(first);
    const third = decrementEffectDurations(second);
    expect(first[0]?.remainingRounds).toBe(2);
    expect(second[0]?.remainingRounds).toBe(1);
    expect(third).toEqual([permanent]);
    expect(temporary.remainingRounds).toBe(3);
    expect(initial).toHaveLength(2);
  });

  it("已经为零的效果被移除而不会成为负剩余回合", () => {
    const expired = createActiveEffect({ ...seed, remainingRounds: 0 });
    expect(decrementEffectDurations([expired])).toEqual([]);
  });

  it("stackCount 接受到达上限，越界报错，保留旧状态", () => {
    const active = createActiveEffect({ ...seed, maxStacks: 8 });
    const maximum = setEffectStackCount(active, 8);
    expect(maximum.stackCount).toBe(8);
    expect(active.stackCount).toBe(1);
    expect(() => setEffectStackCount(active, 9)).toThrow(InvalidBattleStateError);
    expect(() => createActiveEffect({ ...seed, stackCount: 9, maxStacks: 8 })).toThrow(InvalidBattleStateError);
  });

  it("应用次数逐次记录，到达上限后不猜测覆盖规则", () => {
    const first = createActiveEffect({ ...seed, maxApplications: 2 });
    const second = recordEffectApplication(first);
    const third = recordEffectApplication(second);
    expect([first.applicationCount, second.applicationCount, third.applicationCount]).toEqual([0, 1, 2]);
    expect(() => recordEffectApplication(third)).toThrow(InvalidBattleStateError);
  });

  it("连续衰减由 decayRate 与 applicationCount 表达，记录操作不改变效果值", () => {
    const initial = createActiveEffect({ ...seed, decayRate: 0.85, maxApplications: 10 });
    const afterFirst = recordEffectApplication(initial);
    const afterSecond = recordEffectApplication(afterFirst);
    expect(afterSecond).toMatchObject({ decayRate: 0.85, applicationCount: 2, maxApplications: 10 });
    expect(afterSecond.effect).toEqual(initial.effect);
    expect(afterSecond.stackCount).toBe(1);
  });

  it.each(["refresh", "replace", "stack"] as const)("%s 仅保存策略，不擅自实施重复触发", (refreshMode) => {
    const active = createActiveEffect({ ...seed, durationRounds: 3, refreshMode });
    const after = recordEffectApplication(active);
    expect(after.refreshMode).toBe(refreshMode);
    expect(after.remainingRounds).toBe(3);
    expect(after.stackCount).toBe(1);
  });

  it.each([
    { remainingRounds: -1 }, { durationRounds: 0 }, { maxStacks: 0 },
    { stackCount: 1.5 }, { applicationCount: -1 }, { maxApplications: 0 },
    { decayRate: Number.NaN }, { decayRate: 1.1 }, { decayRate: -0.1 },
    { durationRounds: 2, remainingRounds: 3 },
  ])("非法状态字段明确报错：%j", (invalid) => {
    expect(() => createActiveEffect({ ...seed, ...invalid })).toThrow(InvalidBattleStateError);
  });
});
