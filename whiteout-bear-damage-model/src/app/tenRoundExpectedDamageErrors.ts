export class UnknownFireCrystalSkillError extends Error {
  constructor(skillId: string) {
    super(`未知火晶技能：${skillId}。`);
    this.name = "UnknownFireCrystalSkillError";
  }
}

export class DuplicateFireCrystalSkillError extends Error {
  constructor(skillId: string) {
    super(`火晶技能不能重复选择：${skillId}。`);
    this.name = "DuplicateFireCrystalSkillError";
  }
}

export class UnsupportedRealSkillScheduleError extends Error {
  constructor(skillId: string, reason: string) {
    super(`supported技能 ${skillId} 无法安排到十回合模拟：${reason}`);
    this.name = "UnsupportedRealSkillScheduleError";
  }
}
