export class SkillEffectResolutionError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "SkillEffectResolutionError";
  }
}

export class UnknownEffectTypeError extends SkillEffectResolutionError {
  public readonly effectType: string;

  public constructor(effectType: string) {
    super(`未知技能效果乘区：${effectType}。`);
    this.name = "UnknownEffectTypeError";
    this.effectType = effectType;
  }
}

export class UnsupportedSkillTriggerError extends SkillEffectResolutionError {
  public readonly triggerType: string;

  public constructor(triggerType: string) {
    super(`技能触发方式 ${triggerType} 已预留，但当前阶段尚未实现。`);
    this.name = "UnsupportedSkillTriggerError";
    this.triggerType = triggerType;
  }
}

export class InvalidSkillEffectError extends SkillEffectResolutionError {
  public constructor(message: string) {
    super(message);
    this.name = "InvalidSkillEffectError";
  }
}

export class UnsupportedSkillLifecycleError extends SkillEffectResolutionError {
  public constructor(skillId: string) {
    super(`技能 ${skillId} 的持续、刷新、叠层或衰减规则仅预留，当前不能作为常驻效果计算。`);
    this.name = "UnsupportedSkillLifecycleError";
  }
}

export class UnsupportedSkillDataStatusError extends SkillEffectResolutionError {
  public constructor(skillId: string, status: string) {
    super(`技能 ${skillId} 的数据状态为 ${status}，不能进入正式伤害计算。`);
    this.name = "UnsupportedSkillDataStatusError";
  }
}

export class UnsupportedSkillEffectDataStatusError extends SkillEffectResolutionError {
  public constructor(skillId: string, effectIndex: number, status: string) {
    super(
      `技能 ${skillId} 的第 ${effectIndex + 1} 个效果状态为 ${status}，不能进入正式伤害计算。`,
    );
    this.name = "UnsupportedSkillEffectDataStatusError";
  }
}
