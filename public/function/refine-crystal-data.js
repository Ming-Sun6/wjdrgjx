(function (global) {
  "use strict";

  const MAX_WEEKLY = 100;
  const DAILY_FIRST_DISCOUNT = 0.5;

  /** @type {{from:number,to:number,cost:number,outcomes:[number,number][]}[]} */
  const TIERS = [
    { from: 1, to: 20, cost: 20, outcomes: [[1, 0.65], [2, 0.25], [3, 0.10]] },
    { from: 21, to: 40, cost: 50, outcomes: [[2, 0.85], [3, 0.15]] },
    { from: 41, to: 60, cost: 100, outcomes: [[3, 0.85], [4, 0.125], [5, 0.02], [6, 0.005]] },
    { from: 61, to: 80, cost: 130, outcomes: [[3, 0.75], [4, 0.15], [5, 0.05], [6, 0.03], [7, 0.01], [8, 0.005], [9, 0.005]] },
    {
      from: 81,
      to: 100,
      cost: 160,
      outcomes: [[3, 0.70], [4, 0.12], [5, 0.09], [6, 0.04], [7, 0.015], [8, 0.01], [9, 0.01], [10, 0.005], [11, 0.005], [12, 0.005]]
    }
  ];

  /** 首天集中 + 后 6 天每天 1 次（每日首次消耗 50%） */
  const STRATEGIES = [
    { id: "d14_6", label: "1–20 次（首天14 + 后6天各1）", daily: [14, 1, 1, 1, 1, 1, 1] },
    { id: "d20_6", label: "1–26 次（首天20 + 后6天各1）", daily: [20, 1, 1, 1, 1, 1, 1] },
    { id: "d40_6", label: "1–46 次（首天40 + 后6天各1）", daily: [40, 1, 1, 1, 1, 1, 1] },
    { id: "d60_6", label: "1–66 次（首天60 + 后6天各1）", daily: [60, 1, 1, 1, 1, 1, 1] },
    { id: "d80_6", label: "1–86 次（首天80 + 后6天各1）", daily: [80, 1, 1, 1, 1, 1, 1] },
    { id: "d94_6", label: "1–100 次（首天94 + 后6天各1）", daily: [94, 1, 1, 1, 1, 1, 1] },
    { id: "100_full", label: "每周100次连续拉满（单日）", daily: [100] },
    { id: "daily_1", label: "每天1次（7次）", daily: [1, 1, 1, 1, 1, 1, 1] },
    { id: "daily_even_100", label: "7天均匀100次", daily: [14, 14, 14, 14, 15, 15, 14] }
  ];

  function getTier(n) {
    const idx = Number(n);
    if (!Number.isFinite(idx) || idx < 1) return null;
    for (const tier of TIERS) {
      if (idx >= tier.from && idx <= tier.to) return tier;
    }
    return null;
  }

  function tierLabel(tier) {
    return tier ? `${tier.from}–${tier.to} 次` : "—";
  }

  function tierExpected(tier) {
    return tier.outcomes.reduce((sum, [n, p]) => sum + n * p, 0);
  }

  function expectedYieldAt(n) {
    const tier = getTier(n);
    return tier ? tierExpected(tier) : 0;
  }

  function baseCostAt(n) {
    const tier = getTier(n);
    return tier ? tier.cost : 0;
  }

  /** 每日首次提炼消耗为标价的 50% */
  function costAt(n, isFirstOfDay) {
    const base = baseCostAt(n);
    if (!base) return 0;
    return isFirstOfDay ? base * DAILY_FIRST_DISCOUNT : base;
  }

  function eachRefinementInPattern(dailyCounts, startCount, fn) {
    let idx = Math.max(0, Number(startCount) || 0);
    let day = 0;
    for (const dayCount of dailyCounts) {
      day += 1;
      const count = Math.max(0, Number(dayCount) || 0);
      for (let j = 0; j < count; j += 1) {
        idx += 1;
        if (idx > MAX_WEEKLY) return;
        fn(idx, j === 0, day);
      }
    }
  }

  function rollAt(n, rng, isFirstOfDay) {
    const tier = getTier(n);
    if (!tier) return null;
    const random = typeof rng === "function" ? rng : Math.random;
    let r = random();
    let crystals = tier.outcomes[tier.outcomes.length - 1][0];
    for (const [amount, prob] of tier.outcomes) {
      r -= prob;
      if (r <= 0) {
        crystals = amount;
        break;
      }
    }
    const baseCost = tier.cost;
    const cost = costAt(n, !!isFirstOfDay);
    return {
      count: n,
      crystals,
      cost,
      baseCost,
      discounted: !!isFirstOfDay,
      tier,
      tierText: tierLabel(tier)
    };
  }

  function calcSession(startCount, times, options) {
    const opts = options || {};
    const start = Math.max(0, Math.min(MAX_WEEKLY - 1, Number(startCount) || 0));
    const maxTimes = MAX_WEEKLY - start;
    const count = Math.max(0, Math.min(maxTimes, Number(times) || 0));
    let expectedCrystals = 0;
    let totalCost = 0;
    const byTier = TIERS.map(t => ({
      tier: t,
      label: tierLabel(t),
      times: 0,
      expectedCrystals: 0,
      cost: 0
    }));

    const onlyFirstDiscount = !!opts.onlyFirstDiscount;

    for (let i = 1; i <= count; i += 1) {
      const n = start + i;
      const tier = getTier(n);
      if (!tier) continue;
      const isFirst = i === 1 && onlyFirstDiscount;
      const exp = tierExpected(tier);
      const c = costAt(n, isFirst);
      expectedCrystals += exp;
      totalCost += c;
      const bucket = byTier.find(b => b.tier === tier);
      if (bucket) {
        bucket.times += 1;
        bucket.expectedCrystals += exp;
        bucket.cost += c;
      }
    }

    return {
      startCount: start,
      times: count,
      endCount: start + count,
      expectedCrystals,
      totalCost,
      avgCrystalsPerRefine: count ? expectedCrystals / count : 0,
      byTier: byTier.filter(b => b.times > 0)
    };
  }

  function calcSessionFromDaily(dailyCounts, startCount) {
    const start = Math.max(0, Math.min(MAX_WEEKLY - 1, Number(startCount) || 0));
    let times = 0;
    let expectedCrystals = 0;
    let totalCost = 0;
    const byTier = TIERS.map(t => ({
      tier: t,
      label: tierLabel(t),
      times: 0,
      expectedCrystals: 0,
      cost: 0
    }));

    eachRefinementInPattern(dailyCounts, start, (n, isFirstOfDay) => {
      const tier = getTier(n);
      if (!tier) return;
      times += 1;
      const exp = tierExpected(tier);
      const c = costAt(n, isFirstOfDay);
      expectedCrystals += exp;
      totalCost += c;
      const bucket = byTier.find(b => b.tier === tier);
      if (bucket) {
        bucket.times += 1;
        bucket.expectedCrystals += exp;
        bucket.cost += c;
      }
    });

    return {
      startCount: start,
      times,
      endCount: start + times,
      expectedCrystals,
      totalCost,
      avgCrystalsPerRefine: times ? expectedCrystals / times : 0,
      byTier: byTier.filter(b => b.times > 0)
    };
  }

  function yieldForDailyPattern(dailyCounts, startCount) {
    let sum = 0;
    eachRefinementInPattern(dailyCounts, startCount, (n) => {
      sum += expectedYieldAt(n);
    });
    return sum;
  }

  function costForDailyPattern(dailyCounts, startCount) {
    let sum = 0;
    eachRefinementInPattern(dailyCounts, startCount, (n, isFirstOfDay) => {
      sum += costAt(n, isFirstOfDay);
    });
    return sum;
  }

  function countForDailyPattern(dailyCounts) {
    return dailyCounts.reduce((a, b) => a + Math.max(0, Number(b) || 0), 0);
  }

  function enrichStrategy(strategy) {
    const times = countForDailyPattern(strategy.daily);
    const expectedCrystals = yieldForDailyPattern(strategy.daily, 0);
    const totalCost = costForDailyPattern(strategy.daily, 0);
    return { ...strategy, times, expectedCrystals, totalCost };
  }

  const STRATEGIES_ENRICHED = STRATEGIES.map(enrichStrategy);

  function simulateSession(startCount, times, rng, options) {
    const opts = options || {};
    const start = Math.max(0, Math.min(MAX_WEEKLY - 1, Number(startCount) || 0));
    const maxTimes = MAX_WEEKLY - start;
    const count = Math.max(0, Math.min(maxTimes, Number(times) || 0));
    const onlyFirstDiscount = !!opts.onlyFirstDiscount;
    const rolls = [];
    let totalCrystals = 0;
    let totalCost = 0;
    const distribution = {};

    for (let i = 1; i <= count; i += 1) {
      const n = start + i;
      const hit = rollAt(n, rng, i === 1 && onlyFirstDiscount);
      if (!hit) break;
      rolls.push(hit);
      totalCrystals += hit.crystals;
      totalCost += hit.cost;
      distribution[hit.crystals] = (distribution[hit.crystals] || 0) + 1;
    }

    return {
      startCount: start,
      times: count,
      endCount: start + count,
      totalCrystals,
      totalCost,
      rolls,
      distribution,
      avgCrystalsPerRefine: count ? totalCrystals / count : 0
    };
  }

  function simulateWeek(strategyId, startCount, rng) {
    const strategy = STRATEGIES.find(s => s.id === strategyId) || STRATEGIES[0];
    const rolls = [];
    let totalCrystals = 0;
    let totalCost = 0;
    const distribution = {};
    let endCount = Math.max(0, Number(startCount) || 0);

    eachRefinementInPattern(strategy.daily, startCount, (n, isFirstOfDay, day) => {
      const hit = rollAt(n, rng, isFirstOfDay);
      if (!hit) return;
      hit.day = day;
      hit.note = isFirstOfDay ? "每日首抽半价" : "";
      rolls.push(hit);
      endCount = n;
      totalCrystals += hit.crystals;
      totalCost += hit.cost;
      distribution[hit.crystals] = (distribution[hit.crystals] || 0) + 1;
    });

    return {
      strategy,
      startCount: Math.max(0, Number(startCount) || 0),
      endCount,
      totalCrystals,
      totalCost,
      rolls,
      distribution
    };
  }

  function monteCarloWeeks(strategyId, runs, startCount) {
    const n = Math.max(1, Math.min(100000, Number(runs) || 1000));
    let sumCrystals = 0;
    let sumCost = 0;
    let minCrystals = Infinity;
    let maxCrystals = -Infinity;
    const distSum = {};

    for (let i = 0; i < n; i += 1) {
      const r = simulateWeek(strategyId, startCount, Math.random);
      sumCrystals += r.totalCrystals;
      sumCost += r.totalCost;
      minCrystals = Math.min(minCrystals, r.totalCrystals);
      maxCrystals = Math.max(maxCrystals, r.totalCrystals);
      Object.keys(r.distribution).forEach(k => {
        distSum[k] = (distSum[k] || 0) + r.distribution[k];
      });
    }

    return {
      runs: n,
      avgCrystals: sumCrystals / n,
      avgCost: sumCost / n,
      minCrystals,
      maxCrystals,
      avgDistribution: Object.fromEntries(
        Object.entries(distSum).map(([k, v]) => [k, v / n])
      )
    };
  }

  const api = {
    MAX_WEEKLY,
    DAILY_FIRST_DISCOUNT,
    TIERS,
    STRATEGIES,
    STRATEGIES_ENRICHED,
    getTier,
    tierLabel,
    tierExpected,
    expectedYieldAt,
    baseCostAt,
    costAt,
    calcSession,
    calcSessionFromDaily,
    yieldForDailyPattern,
    costForDailyPattern,
    countForDailyPattern,
    enrichStrategy,
    rollAt,
    simulateSession,
    simulateWeek,
    monteCarloWeeks
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    global.RefineCrystal = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
