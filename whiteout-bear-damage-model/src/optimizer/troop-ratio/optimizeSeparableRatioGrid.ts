import type {
  TroopCounts,
  TroopRatioBounds,
  TroopRatios,
} from "../../domain/troopRatioOptimization";
import type { TroopType } from "../../domain/troop";
import { allocateTroopsByRatio } from "./allocateTroopsByRatio";
import {
  InvalidStepPercentError,
  InvalidTroopRatioBoundsError,
  NoFeasibleTroopRatioError,
} from "./errors";
import { decimalUnitsToNumber, toCommonDecimalUnits } from "./decimalUnits";

const TROOP_TYPES: readonly TroopType[] = ["shield", "lancer", "marksman"];
const UPPER_BOUND_EPSILON = 1e-10;
const feasibleRatioCountCache = new Map<string, number>();

export interface SeparableRatioGridInput {
  readonly totalTroopCount: number;
  readonly coefficients: Readonly<Record<TroopType, number>>;
  readonly stepPercent: number;
  readonly topK: number;
  readonly minimumRatios?: TroopRatioBounds;
  readonly maximumRatios?: TroopRatioBounds;
}

export interface SeparableRatioCandidate {
  readonly ratios: TroopRatios;
  readonly troopCounts: TroopCounts;
  readonly score: number;
}

export interface SeparableRatioGridResult {
  readonly results: readonly SeparableRatioCandidate[];
  /** 满足边界的完整合法网格规模；这些点不会被逐一运行战斗模拟。 */
  readonly theoreticalRatioCount: number;
  readonly fastScoreCount: number;
  readonly uniqueTroopCountScoreCount: number;
  readonly exploredRegionCount: number;
  readonly ratioScale: number;
}

interface GridDefinition {
  readonly tickCount: number;
  readonly stepUnits: bigint;
  readonly decimalPlaces: number;
  readonly minimumTicks: Readonly<Record<TroopType, number>>;
  readonly maximumTicks: Readonly<Record<TroopType, number>>;
}

interface SearchRegion {
  readonly shieldLow: number;
  readonly shieldHigh: number;
  readonly lancerLow: number;
  readonly lancerHigh: number;
  readonly upperBound: number;
}

/**
 * 精确搜索百分比网格上的全局 Top K。
 *
 * 伤害目标必须是 Σ Ki√ni。搜索树覆盖每一个合法比例点；节点上界是把
 * largest-remainder 的整数兵数范围放宽为盒约束下的连续凹优化。只有上界
 * 已严格低于当前第 K 名时才剪枝，因此不会牺牲 0.01% 网格最优性。
 */
export function optimizeSeparableRatioGrid(
  input: SeparableRatioGridInput,
): SeparableRatioGridResult {
  return solveExactRatioFromCoefficients(input);
}

/** 正式轻量求解器：连续最优附近预热TopK，再由完整分支上界证明全局exact。 */
export function solveExactRatioFromCoefficients(
  input: SeparableRatioGridInput,
): SeparableRatioGridResult {
  return optimizeSeparableRatioGridInternal(input, true);
}

/** 未预热、未复用网格计数的旧exact路径，仅用于Golden Test参照。 */
export function referenceExactRatioSolver(
  input: SeparableRatioGridInput,
): SeparableRatioGridResult {
  return optimizeSeparableRatioGridInternal(input, false);
}

function optimizeSeparableRatioGridInternal(
  input: SeparableRatioGridInput,
  fast: boolean,
): SeparableRatioGridResult {
  const grid = createGridDefinition(input);
  const theoreticalRatioCount = fast
    ? cachedFeasibleRatioCount(grid)
    : countFeasibleRatios(grid);
  if (theoreticalRatioCount === 0) throw new NoFeasibleTroopRatioError();
  if (TROOP_TYPES.every((troopType) => input.coefficients[troopType] === 0)) {
    const results = zeroScoreTopK(input.totalTroopCount, input.topK, grid);
    return {
      results,
      theoreticalRatioCount,
      fastScoreCount: new Set(results.map((item) => `${item.troopCounts.shield}|${item.troopCounts.lancer}|${item.troopCounts.marksman}`)).size,
      uniqueTroopCountScoreCount: new Set(results.map((item) => `${item.troopCounts.shield}|${item.troopCounts.lancer}|${item.troopCounts.marksman}`)).size,
      exploredRegionCount: 0,
      ratioScale: grid.tickCount,
    };
  }

  const best: SeparableRatioCandidate[] = [];
  const countScoreCache = new Map<string, number>();
  const seenRatioKeys = new Set<string>();
  const heap: SearchRegion[] = [];
  let fastScoreCount = 0;
  let exploredRegionCount = 0;

  if (fast) {
    seedCandidatesNearContinuousOptimum(best, countScoreCache, seenRatioKeys, grid, input);
    fastScoreCount = countScoreCache.size;
  }

  const root = createRegion(
    grid.minimumTicks.shield,
    grid.maximumTicks.shield,
    grid.minimumTicks.lancer,
    grid.maximumTicks.lancer,
    grid,
    input,
  );
  if (root !== null) heapPush(heap, root);

  while (heap.length > 0) {
    const region = heapPop(heap)!;
    exploredRegionCount += 1;
    const threshold = best.length < input.topK
      ? Number.NEGATIVE_INFINITY
      : best[best.length - 1]!.score;
    if (region.upperBound < threshold - scoreTolerance(threshold)) continue;

    if (
      region.shieldLow === region.shieldHigh &&
      region.lancerLow === region.lancerHigh
    ) {
      const marksmanTick = grid.tickCount - region.shieldLow - region.lancerLow;
      if (
        marksmanTick < grid.minimumTicks.marksman ||
        marksmanTick > grid.maximumTicks.marksman
      ) continue;
      const ratioKey = `${region.shieldLow}|${region.lancerLow}`;
      if (seenRatioKeys.has(ratioKey)) continue;
      seenRatioKeys.add(ratioKey);
      const ratios = ticksToRatios(region.shieldLow, region.lancerLow, grid);
      const troopCounts = allocateTroopsByRatio(input.totalTroopCount, ratios);
      const signature = `${troopCounts.shield}|${troopCounts.lancer}|${troopCounts.marksman}`;
      let score = countScoreCache.get(signature);
      if (score === undefined) {
        score = scoreCounts(troopCounts, input.coefficients);
        countScoreCache.set(signature, score);
        fastScoreCount += 1;
      }
      insertCandidate(best, { ratios, troopCounts, score }, input.topK);
      continue;
    }

    const shieldSpan = region.shieldHigh - region.shieldLow;
    const lancerSpan = region.lancerHigh - region.lancerLow;
    if (shieldSpan >= lancerSpan && shieldSpan > 0) {
      const middle = Math.floor((region.shieldLow + region.shieldHigh) / 2);
      pushRegion(heap, createRegion(region.shieldLow, middle, region.lancerLow, region.lancerHigh, grid, input), best, input.topK);
      pushRegion(heap, createRegion(middle + 1, region.shieldHigh, region.lancerLow, region.lancerHigh, grid, input), best, input.topK);
    } else {
      const middle = Math.floor((region.lancerLow + region.lancerHigh) / 2);
      pushRegion(heap, createRegion(region.shieldLow, region.shieldHigh, region.lancerLow, middle, grid, input), best, input.topK);
      pushRegion(heap, createRegion(region.shieldLow, region.shieldHigh, middle + 1, region.lancerHigh, grid, input), best, input.topK);
    }
  }

  return {
    results: best,
    theoreticalRatioCount,
    fastScoreCount,
    uniqueTroopCountScoreCount: countScoreCache.size,
    exploredRegionCount,
    ratioScale: grid.tickCount,
  };
}

function cachedFeasibleRatioCount(grid: GridDefinition): number {
  const key = [
    grid.tickCount,
    ...TROOP_TYPES.flatMap((type) => [grid.minimumTicks[type], grid.maximumTicks[type]]),
  ].join("|");
  const cached = feasibleRatioCountCache.get(key);
  if (cached !== undefined) return cached;
  const count = countFeasibleRatios(grid);
  feasibleRatioCountCache.set(key, count);
  return count;
}

function seedCandidatesNearContinuousOptimum(
  best: SeparableRatioCandidate[],
  countScoreCache: Map<string, number>,
  seenRatioKeys: Set<string>,
  grid: GridDefinition,
  input: SeparableRatioGridInput,
): void {
  const ideal = continuousTickAllocation(grid, input.coefficients);
  const shieldCenter = Math.round(ideal.shield);
  const lancerCenter = Math.round(ideal.lancer);
  const radius = Math.max(2, Math.ceil(Math.sqrt(input.topK)));
  for (let shield = shieldCenter - radius; shield <= shieldCenter + radius; shield += 1) {
    if (shield < grid.minimumTicks.shield || shield > grid.maximumTicks.shield) continue;
    for (let lancer = lancerCenter - radius; lancer <= lancerCenter + radius; lancer += 1) {
      if (lancer < grid.minimumTicks.lancer || lancer > grid.maximumTicks.lancer) continue;
      const marksman = grid.tickCount - shield - lancer;
      if (marksman < grid.minimumTicks.marksman || marksman > grid.maximumTicks.marksman) continue;
      seenRatioKeys.add(`${shield}|${lancer}`);
      const ratios = ticksToRatios(shield, lancer, grid);
      const troopCounts = allocateTroopsByRatio(input.totalTroopCount, ratios);
      const signature = `${troopCounts.shield}|${troopCounts.lancer}|${troopCounts.marksman}`;
      let score = countScoreCache.get(signature);
      if (score === undefined) {
        score = scoreCounts(troopCounts, input.coefficients);
        countScoreCache.set(signature, score);
      }
      insertCandidate(best, { ratios, troopCounts, score }, input.topK);
    }
  }
}

function continuousTickAllocation(
  grid: GridDefinition,
  coefficients: Readonly<Record<TroopType, number>>,
): Record<TroopType, number> {
  const allocation = { ...grid.minimumTicks } as Record<TroopType, number>;
  let remaining = grid.tickCount - TROOP_TYPES.reduce((sum, type) => sum + allocation[type], 0);
  let free = [...TROOP_TYPES];
  while (free.length > 0 && remaining > 1e-12) {
    const weight = free.reduce((sum, type) => sum + coefficients[type] ** 2, 0);
    let capped = false;
    for (const type of free) {
      const share = weight === 0 ? remaining / free.length : remaining * coefficients[type] ** 2 / weight;
      const room = grid.maximumTicks[type] - allocation[type];
      if (share > room + 1e-12) {
        allocation[type] += room;
        remaining -= room;
        free = free.filter((candidate) => candidate !== type);
        capped = true;
        break;
      }
    }
    if (capped) continue;
    for (const type of free) {
      const share = weight === 0 ? remaining / free.length : remaining * coefficients[type] ** 2 / weight;
      allocation[type] += share;
    }
    remaining = 0;
  }
  return allocation;
}

function zeroScoreTopK(
  totalTroopCount: number,
  topK: number,
  grid: GridDefinition,
): readonly SeparableRatioCandidate[] {
  const results: SeparableRatioCandidate[] = [];
  for (let marksman = grid.maximumTicks.marksman; marksman >= grid.minimumTicks.marksman && results.length < topK; marksman -= 1) {
    const lancerHigh = Math.min(grid.maximumTicks.lancer, grid.tickCount - marksman - grid.minimumTicks.shield);
    const lancerLow = Math.max(grid.minimumTicks.lancer, grid.tickCount - marksman - grid.maximumTicks.shield);
    for (let lancer = lancerHigh; lancer >= lancerLow && results.length < topK; lancer -= 1) {
      const shield = grid.tickCount - marksman - lancer;
      const ratios = ticksToRatios(shield, lancer, grid);
      results.push({ ratios, troopCounts: allocateTroopsByRatio(totalTroopCount, ratios), score: 0 });
    }
  }
  return results;
}

function createGridDefinition(input: SeparableRatioGridInput): GridDefinition {
  if (!Number.isFinite(input.stepPercent) || input.stepPercent <= 0 || input.stepPercent > 100) {
    throw new InvalidStepPercentError(input.stepPercent, "必须是大于 0 且不超过 100 的有限数字。");
  }
  if (!Number.isSafeInteger(input.topK) || input.topK <= 0) {
    throw new RangeError(`topK 必须是正安全整数，收到：${input.topK}。`);
  }
  for (const troopType of TROOP_TYPES) {
    const coefficient = input.coefficients[troopType];
    if (!Number.isFinite(coefficient) || coefficient < 0) {
      throw new RangeError(`${troopType} 的可分离系数必须是非负有限数。`);
    }
  }

  const { units, decimalPlaces } = toCommonDecimalUnits([input.stepPercent, 100]);
  const stepUnits = units[0]!;
  const totalUnits = units[1]!;
  if (totalUnits % stepUnits !== 0n) {
    throw new InvalidStepPercentError(input.stepPercent, "步长必须能整除 100。 ");
  }
  const tickCount = Number(totalUnits / stepUnits);
  if (!Number.isSafeInteger(tickCount)) {
    throw new InvalidStepPercentError(input.stepPercent, "比例网格超出安全整数范围。");
  }

  const minimumTicks = resolveTickBounds(input.minimumRatios, 0, tickCount, input.stepPercent, true);
  const maximumTicks = resolveTickBounds(input.maximumRatios, 100, tickCount, input.stepPercent, false);
  for (const troopType of TROOP_TYPES) {
    if (minimumTicks[troopType] > maximumTicks[troopType]) {
      throw new InvalidTroopRatioBoundsError(`${troopType} 的最低比例不能大于最高比例。`);
    }
  }
  return { tickCount, stepUnits, decimalPlaces, minimumTicks, maximumTicks };
}

function resolveTickBounds(
  bounds: TroopRatioBounds | undefined,
  fallback: number,
  tickCount: number,
  stepPercent: number,
  minimum: boolean,
): Record<TroopType, number> {
  const result = {} as Record<TroopType, number>;
  for (const troopType of TROOP_TYPES) {
    const value = bounds?.[troopType] ?? fallback;
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      throw new InvalidTroopRatioBoundsError(`${troopType} 比例必须位于 0%～100%。`);
    }
    const raw = value / stepPercent;
    result[troopType] = Math.max(0, Math.min(tickCount,
      minimum ? Math.ceil(raw - 1e-10) : Math.floor(raw + 1e-10),
    ));
  }
  return result;
}

function countFeasibleRatios(grid: GridDefinition): number {
  let count = 0;
  for (let shield = grid.minimumTicks.shield; shield <= grid.maximumTicks.shield; shield += 1) {
    const lancerLow = Math.max(
      grid.minimumTicks.lancer,
      grid.tickCount - shield - grid.maximumTicks.marksman,
    );
    const lancerHigh = Math.min(
      grid.maximumTicks.lancer,
      grid.tickCount - shield - grid.minimumTicks.marksman,
    );
    if (lancerLow <= lancerHigh) count += lancerHigh - lancerLow + 1;
  }
  return count;
}

function createRegion(
  shieldLow: number,
  shieldHigh: number,
  lancerLow: number,
  lancerHigh: number,
  grid: GridDefinition,
  input: SeparableRatioGridInput,
): SearchRegion | null {
  if (shieldLow > shieldHigh || lancerLow > lancerHigh) return null;
  const requiredSumLow = grid.tickCount - grid.maximumTicks.marksman;
  const requiredSumHigh = grid.tickCount - grid.minimumTicks.marksman;
  if (shieldLow + lancerLow > requiredSumHigh || shieldHigh + lancerHigh < requiredSumLow) return null;

  const marksmanLow = Math.max(grid.minimumTicks.marksman, grid.tickCount - shieldHigh - lancerHigh);
  const marksmanHigh = Math.min(grid.maximumTicks.marksman, grid.tickCount - shieldLow - lancerLow);
  const tickLows = { shield: shieldLow, lancer: lancerLow, marksman: marksmanLow };
  const tickHighs = { shield: shieldHigh, lancer: lancerHigh, marksman: marksmanHigh };
  const countLows = {} as Record<TroopType, number>;
  const countHighs = {} as Record<TroopType, number>;
  for (const troopType of TROOP_TYPES) {
    countLows[troopType] = Math.floor(input.totalTroopCount * tickLows[troopType] / grid.tickCount);
    countHighs[troopType] = Math.ceil(input.totalTroopCount * tickHighs[troopType] / grid.tickCount);
  }
  const upperBound = boxedContinuousUpperBound(
    input.totalTroopCount,
    input.coefficients,
    countLows,
    countHighs,
  );
  return { shieldLow, shieldHigh, lancerLow, lancerHigh, upperBound };
}

function boxedContinuousUpperBound(
  total: number,
  coefficients: Readonly<Record<TroopType, number>>,
  lows: Readonly<Record<TroopType, number>>,
  highs: Readonly<Record<TroopType, number>>,
): number {
  if (
    TROOP_TYPES.reduce((sum, type) => sum + lows[type], 0) > total ||
    TROOP_TYPES.reduce((sum, type) => sum + highs[type], 0) < total
  ) return Number.NEGATIVE_INFINITY;

  // 三个变量只有 low/free/high 三种KKT状态。枚举27种活动集得到严格连续上界，
  // 不采用“只看连续最优附近”的未经证明近似。
  let value = Number.NEGATIVE_INFINITY;
  for (let mask = 0; mask < 27; mask += 1) {
    let encoded = mask;
    const allocation = {} as Record<TroopType, number>;
    const free: TroopType[] = [];
    let fixed = 0;
    for (const type of TROOP_TYPES) {
      const state = encoded % 3;
      encoded = Math.floor(encoded / 3);
      if (state === 0) {
        allocation[type] = lows[type];
        fixed += lows[type];
      } else if (state === 1) {
        free.push(type);
      } else {
        allocation[type] = highs[type];
        fixed += highs[type];
      }
    }
    const remaining = total - fixed;
    if (remaining < -1e-8) continue;
    if (free.length === 0) {
      if (Math.abs(remaining) > 1e-8) continue;
    } else {
      const weight = free.reduce((sum, type) => sum + coefficients[type] ** 2, 0);
      if (weight === 0) {
        let left = remaining;
        for (const type of free) {
          const assigned = Math.min(highs[type], Math.max(lows[type], left));
          allocation[type] = assigned;
          left -= assigned;
        }
        if (Math.abs(left) > 1e-8) continue;
      } else {
        for (const type of free) allocation[type] = remaining * coefficients[type] ** 2 / weight;
      }
    }
    if (TROOP_TYPES.some((type) => allocation[type] < lows[type] - 1e-8 || allocation[type] > highs[type] + 1e-8)) continue;
    value = Math.max(value, TROOP_TYPES.reduce(
      (sum, type) => sum + coefficients[type] * Math.sqrt(Math.max(0, allocation[type])),
      0,
    ));
  }
  return value + Math.max(1, Math.abs(value)) * UPPER_BOUND_EPSILON;
}

function ticksToRatios(shieldTick: number, lancerTick: number, grid: GridDefinition): TroopRatios {
  const marksmanTick = grid.tickCount - shieldTick - lancerTick;
  return {
    shield: decimalUnitsToNumber(BigInt(shieldTick) * grid.stepUnits, grid.decimalPlaces),
    lancer: decimalUnitsToNumber(BigInt(lancerTick) * grid.stepUnits, grid.decimalPlaces),
    marksman: decimalUnitsToNumber(BigInt(marksmanTick) * grid.stepUnits, grid.decimalPlaces),
  };
}

function scoreCounts(counts: TroopCounts, coefficients: Readonly<Record<TroopType, number>>): number {
  return TROOP_TYPES.reduce((sum, type) => sum + coefficients[type] * Math.sqrt(counts[type]), 0);
}

function insertCandidate(candidates: SeparableRatioCandidate[], candidate: SeparableRatioCandidate, topK: number): void {
  let low = 0;
  let high = candidates.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (compareCandidates(candidate, candidates[middle]!) < 0) high = middle;
    else low = middle + 1;
  }
  candidates.splice(low, 0, candidate);
  if (candidates.length > topK) candidates.pop();
}

function compareCandidates(left: SeparableRatioCandidate, right: SeparableRatioCandidate): number {
  const scoreOrder = right.score - left.score;
  if (scoreOrder !== 0) return scoreOrder;
  const marksmanOrder = right.ratios.marksman - left.ratios.marksman;
  if (marksmanOrder !== 0) return marksmanOrder;
  const lancerOrder = right.ratios.lancer - left.ratios.lancer;
  if (lancerOrder !== 0) return lancerOrder;
  return right.ratios.shield - left.ratios.shield;
}

function pushRegion(
  heap: SearchRegion[],
  region: SearchRegion | null,
  best: readonly SeparableRatioCandidate[],
  topK: number,
): void {
  if (region === null || region.upperBound === Number.NEGATIVE_INFINITY) return;
  const threshold = best.length < topK ? Number.NEGATIVE_INFINITY : best[best.length - 1]!.score;
  if (region.upperBound >= threshold - scoreTolerance(threshold)) heapPush(heap, region);
}

function scoreTolerance(score: number): number {
  return Number.isFinite(score) ? Math.max(1, Math.abs(score)) * 1e-12 : 0;
}

function heapPush(heap: SearchRegion[], value: SearchRegion): void {
  heap.push(value);
  let index = heap.length - 1;
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2);
    if (heap[parent]!.upperBound >= value.upperBound) break;
    heap[index] = heap[parent]!;
    index = parent;
  }
  heap[index] = value;
}

function heapPop(heap: SearchRegion[]): SearchRegion | undefined {
  const root = heap[0];
  const last = heap.pop();
  if (root === undefined || last === undefined || heap.length === 0) return root;
  let index = 0;
  while (true) {
    const left = index * 2 + 1;
    const right = left + 1;
    if (left >= heap.length) break;
    const child = right < heap.length && heap[right]!.upperBound > heap[left]!.upperBound ? right : left;
    if (heap[child]!.upperBound <= last.upperBound) break;
    heap[index] = heap[child]!;
    index = child;
  }
  heap[index] = last;
  return root;
}
