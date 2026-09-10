import {
  optimizeBattleSetup,
  optimizeBodyHeroes,
  optimizeFullBattleSetup,
  optimizeTroopRatio,
} from "../dist-core/damage-model.js";

const troopSettings = {
  shield: {
    troopLevelId: "T10",
    stats: { attackPercent: 400, penetrationPercent: 100 },
  },
  lancer: {
    troopLevelId: "T10",
    stats: { attackPercent: 400, penetrationPercent: 100 },
  },
  marksman: {
    troopLevelId: "T10",
    stats: { attackPercent: 400, penetrationPercent: 100 },
  },
};

const troops = [
  { troopType: "shield", troopLevelId: "T10", troopCount: 10_000, stats: troopSettings.shield.stats },
  { troopType: "lancer", troopLevelId: "T10", troopCount: 20_000, stats: troopSettings.lancer.stats },
  { troopType: "marksman", troopLevelId: "T10", troopCount: 30_000, stats: troopSettings.marksman.stats },
];

const body = optimizeBodyHeroes(
  { troops },
  { bodyCount: 4 },
);
const ratio = optimizeTroopRatio({
  totalTroopCount: 60_000,
  troopSettings,
  bodyHeroIds: ["hero.body.shuyun"],
});

// 正式0.01% exact联合基准，按9个技能选项、每类最多2份。
const joint = optimizeBattleSetup(
  { totalTroopCount: 60_000, troopSettings },
  {},
);

// 第二十三步全维度基准：66个比例 × 1个车身 × 3个盾头 × 6个火晶配置。
// 当前真实head/fire技能均为pending，因此它们会被报告但不会改变正式评分。
const full = optimizeFullBattleSetup(
  { totalTroopCount: 60_000, troopSettings },
  {
    ratio: { mode: "optimize", stepPercent: 10 },
    body: {
      mode: "optimize",
      bodyCount: 4,
      candidateHeroIds: ["hero.body.shuyun"],
    },
    head: {
      shield: {
        mode: "optimize",
        candidateHeroIds: ["hero.head.heketuo"],
        includeEmpty: true,
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
);

console.log(JSON.stringify({
  body: {
    candidateHeroCount: body.candidateHeroCount,
    combinationCount: body.combinationCount,
    effectSignatureCount: body.effectSignatureCount,
    fastScoreCount: body.fastScoreCount,
    detailedSimulationCount: body.detailedSimulationCount,
    formalSimulationCount: body.formalSimulationCount,
    profiling: body.profiling,
    stats: body.stats,
  },
  ratio: {
    evaluatedRatioCount: ratio.evaluatedRatioCount,
    stats: ratio.stats,
  },
  joint: {
    ratioCandidateCount: joint.ratioCandidateCount,
    bodyCombinationCount: joint.bodyCombinationCount,
    cartesianCandidateCount: joint.cartesianCandidateCount,
    bodyEffectCount: joint.bodyEffectCount,
    ratioSolverCallCount: joint.ratioSolverCallCount,
    ratioSolverElapsedMs: joint.ratioSolverElapsedMs,
    averageRatioSolverMs: joint.ratioSolverCallCount === 0 ? 0 : joint.ratioSolverElapsedMs / joint.ratioSolverCallCount,
    detailedSimulationCount: joint.detailedSimulationCount,
    formalSimulationCount: joint.formalSimulationCount,
    profiling: joint.profiling,
    stats: joint.stats,
  },
  full: {
    ratioCandidateCount: full.ratioCandidateCount,
    bodyCombinationCount: full.bodyCombinationCount,
    headCombinationCount: full.headCombinationCount,
    fireCrystalConfigurationCount: full.fireCrystalConfigurationCount,
    cartesianCandidateCount: full.cartesianCandidateCount,
    evaluatedCandidateCount: full.evaluatedCandidateCount,
    performanceWarning: full.performanceWarning,
    stats: full.stats,
  },
  theoreticalRatioAndAllBodies: 50_015_001 * 414,
}, null, 2));
