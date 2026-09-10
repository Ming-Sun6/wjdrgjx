import {
  optimizeBattleSetup,
  optimizeBodyHeroes,
  optimizeFullBattleSetup,
  optimizeTroopRatio,
} from "../dist-core/damage-model.js";

const troopSettings = {
  shield: {
    troopLevelId: "T10",
    stats: { attackPercent: 444.35, defensePercent: 200, penetrationPercent: 123.45, healthPercent: 200 },
  },
  lancer: {
    troopLevelId: "T11",
    stats: { attackPercent: 420, defensePercent: 210, penetrationPercent: 130, healthPercent: 210 },
  },
  marksman: {
    troopLevelId: "T12-FC6",
    stats: { attackPercent: 480, defensePercent: 190, penetrationPercent: 145, healthPercent: 190 },
  },
};

const troops = [
  { troopType: "shield", troopLevelId: "T10", troopCount: 20_000, stats: troopSettings.shield.stats },
  { troopType: "lancer", troopLevelId: "T11", troopCount: 30_000, stats: troopSettings.lancer.stats },
  { troopType: "marksman", troopLevelId: "T12-FC6", troopCount: 50_003, stats: troopSettings.marksman.stats },
];

function measured(run) {
  const startedAt = performance.now();
  const result = run();
  return { result, wallClockMs: performance.now() - startedAt };
}

const ratio = measured(() => optimizeTroopRatio({
  totalTroopCount: 100_003,
  troopSettings,
  bodyHeroIds: ["hero.body.shuyun"],
}));
console.error(`ratio benchmark: ${ratio.wallClockMs.toFixed(2)} ms`);

// v0.1按9种BodySkillOption搜索，同一种效果自动最多2份。
const body = measured(() => optimizeBodyHeroes({ troops }, { bodyCount: 4 }));
console.error(`body benchmark: ${body.wallClockMs.toFixed(2)} ms`);

// 每个BodyEffect直接求自己的0.01% exact比例，不构造完整笛卡尔积。
const joint = measured(() => optimizeBattleSetup(
  { totalTroopCount: 100_003, troopSettings },
  { ratioStepPercent: 0.01, bodyCount: 4 },
));
console.error(`joint benchmark: ${joint.wallClockMs.toFixed(2)} ms`);

// 10%比例 × 2车身 × 1个可用盾头 × 2个显式兼容配置 = 264。
// 兵种/火晶技能已按等级自动解锁；显式配置仅验证兼容去重路径。
const full = measured(() => optimizeFullBattleSetup(
  { totalTroopCount: 100_003, troopSettings },
  {
    ratio: { mode: "optimize", stepPercent: 10 },
    body: {
      mode: "optimize",
      bodyCount: 1,
      candidateHeroIds: ["hero.body.shuyun", "hero.body.suoniya"],
    },
    head: {
      shield: {
        mode: "optimize",
        candidateHeroIds: ["hero.head.heketuo"],
        includeEmpty: false,
      },
    },
    fireCrystal: {
      mode: "optimize",
      includeEmpty: true,
      allowedConfigurations: [
        { id: "fc.remote-strike", settings: { skillIds: ["troop-skill.marksman.remote-strike"] } },
      ],
    },
  },
));
console.error(`full benchmark: ${full.wallClockMs.toFixed(2)} ms`);

const report = {
  environment: {
    node: process.version,
    platform: process.platform,
    architecture: process.arch,
    note: "elapsedMs只用于开发观察，不参与伤害或排序。",
  },
  ratio: {
    theoreticalRatioCount: ratio.result.theoreticalRatioCount,
    candidateCount: ratio.result.fastScoreCount,
    detailedEvaluationCount: ratio.result.detailedEvaluationCount,
    evaluatedCount: ratio.result.stats.evaluatedCount,
    cacheHits: ratio.result.stats.cacheHits,
    cacheMisses: ratio.result.stats.cacheMisses,
    probabilityStateCount: ratio.result.stats.probabilityStateCount,
    elapsedMs: ratio.result.stats.elapsedMs,
    wallClockMs: ratio.wallClockMs,
  },
  body: {
    bodySkillOptionCount: body.result.bodySkillOptionCount,
    combinationCount: body.result.combinationCount,
    effectSignatureCount: body.result.effectSignatureCount,
    evaluatedEffectSignatureCount: body.result.evaluatedCombinationCount,
    evaluatedCount: body.result.stats.evaluatedCount,
    fastScoreCount: body.result.fastScoreCount,
    detailedSimulationCount: body.result.detailedSimulationCount,
    formalSimulationCount: body.result.formalSimulationCount,
    compiledFastPath: body.result.compiledFastPath,
    profiling: body.result.profiling,
    cacheHits: body.result.stats.cacheHits,
    cacheMisses: body.result.stats.cacheMisses,
    probabilityStateCount: body.result.stats.probabilityStateCount,
    elapsedMs: body.result.stats.elapsedMs,
    wallClockMs: body.wallClockMs,
  },
  joint: {
    ratioCandidateCount: joint.result.ratioCandidateCount,
    bodyCombinationCount: joint.result.bodyCombinationCount,
    cartesianCandidateCount: joint.result.cartesianCandidateCount,
    evaluatedCount: joint.result.stats.evaluatedCount,
    bodyEffectCount: joint.result.bodyEffectCount,
    ratioSolverCallCount: joint.result.ratioSolverCallCount,
    ratioSolverElapsedMs: joint.result.ratioSolverElapsedMs,
    averageRatioSolverMs: joint.result.ratioSolverCallCount === 0
      ? 0
      : joint.result.ratioSolverElapsedMs / joint.result.ratioSolverCallCount,
    detailedSimulationCount: joint.result.detailedSimulationCount,
    formalSimulationCount: joint.result.formalSimulationCount,
    compiledFastPath: joint.result.compiledFastPath,
    profiling: joint.result.profiling,
    cacheHits: joint.result.stats.cacheHits,
    cacheMisses: joint.result.stats.cacheMisses,
    probabilityStateCount: joint.result.stats.probabilityStateCount,
    elapsedMs: joint.result.stats.elapsedMs,
    wallClockMs: joint.wallClockMs,
  },
  full: {
    ratioCandidateCount: full.result.ratioCandidateCount,
    bodyCombinationCount: full.result.bodyCombinationCount,
    headCombinationCount: full.result.headCombinationCount,
    fireCrystalConfigurationCount: full.result.fireCrystalConfigurationCount,
    cartesianCandidateCount: full.result.cartesianCandidateCount,
    evaluatedCount: full.result.stats.evaluatedCount,
    cacheHits: full.result.stats.cacheHits,
    cacheMisses: full.result.stats.cacheMisses,
    probabilityStateCount: full.result.stats.probabilityStateCount,
    elapsedMs: full.result.stats.elapsedMs,
    wallClockMs: full.wallClockMs,
  },
  theoreticalSpaces: {
    ratioAtPointZeroOnePercent: 50_015_001,
    bodyFromOld24SupportedHeroes: 17_550,
    bodyFromNineOptionsMaxTwoCopies: 414,
    ratioAndBodyCartesianSpaceAvoided: 50_015_001 * 414,
  },
};

for (const [name, benchmark] of Object.entries({ ratio: report.ratio, body: report.body, joint: report.joint, full: report.full })) {
  if (!Number.isFinite(benchmark.wallClockMs) || benchmark.wallClockMs < 0) {
    throw new Error(`${name} benchmark did not complete.`);
  }
}

console.log(JSON.stringify(report, null, 2));
