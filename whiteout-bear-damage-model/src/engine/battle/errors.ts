import type {
  HeadHeroId,
  HeroCalculationStatus,
  HeroId,
} from "../../domain/hero";
import type { TroopType } from "../../domain/troop";

export class BattleDamageCalculationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "BattleDamageCalculationError";
  }
}

export class TooManyBodyHeroesError extends BattleDamageCalculationError {
  public constructor(count: number) {
    super(`一次最多允许 4 个车身英雄，当前传入 ${count} 个。`);
    this.name = "TooManyBodyHeroesError";
  }
}

export class UnknownBodyHeroError extends BattleDamageCalculationError {
  public readonly heroId: HeroId;

  public constructor(heroId: HeroId) {
    super(`未找到车身英雄配置：${heroId}。`);
    this.name = "UnknownBodyHeroError";
    this.heroId = heroId;
  }
}

export class UnsupportedBodyHeroError extends BattleDamageCalculationError {
  public readonly heroId: HeroId;
  public readonly status: Exclude<HeroCalculationStatus, "supported">;

  public constructor(
    heroId: HeroId,
    status: Exclude<HeroCalculationStatus, "supported">,
    notes: readonly string[],
  ) {
    super(
      `车身英雄 ${heroId} 当前状态为 ${status}，不能参与计算${
        notes.length === 0 ? "" : `：${notes.join("；")}`
      }。`,
    );
    this.name = "UnsupportedBodyHeroError";
    this.heroId = heroId;
    this.status = status;
  }
}

export class UnknownHeadHeroError extends BattleDamageCalculationError {
  public readonly heroId: HeadHeroId;

  public constructor(heroId: HeadHeroId) {
    super(`未找到车头英雄配置：${heroId}。`);
    this.name = "UnknownHeadHeroError";
    this.heroId = heroId;
  }
}

export class UnknownHeadHeroTroopTypeError extends BattleDamageCalculationError {
  public readonly heroId: HeadHeroId;

  public constructor(heroId: HeadHeroId) {
    super(`车头英雄 ${heroId} 的兵种尚未确认，不能放入车头槽。`);
    this.name = "UnknownHeadHeroTroopTypeError";
    this.heroId = heroId;
  }
}

export class IncompatibleHeadHeroSlotError extends BattleDamageCalculationError {
  public readonly heroId: HeadHeroId;
  public readonly heroTroopType: TroopType;
  public readonly slot: TroopType;

  public constructor(
    heroId: HeadHeroId,
    heroTroopType: TroopType,
    slot: TroopType,
  ) {
    super(
      `车头英雄 ${heroId} 属于 ${heroTroopType}，不能放入 ${slot} 车头槽。`,
    );
    this.name = "IncompatibleHeadHeroSlotError";
    this.heroId = heroId;
    this.heroTroopType = heroTroopType;
    this.slot = slot;
  }
}
