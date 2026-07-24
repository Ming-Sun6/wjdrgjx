(function () {
  "use strict";

  const UNAVAILABLE = "暂无数据";

  function levelUiState(expert) {
    if (!expert || expert.hasExpertLevelData !== true) {
      return { available: false, disabled: true, values: [], placeholder: UNAVAILABLE };
    }
    return {
      available: true,
      disabled: false,
      values: Array.from({ length: 100 }, (_, index) => index + 1),
      placeholder: ""
    };
  }

  function calculatorViewState(expert) {
    const levels = levelUiState(expert);
    return {
      levels,
      expertEffect: levels.available ? "" : UNAVAILABLE,
      totalFavor: levels.available ? "0" : UNAVAILABLE,
      totalMarks: levels.available ? "0" : UNAVAILABLE
    };
  }

  function normalSkills(expert) {
    return (expert?.skills || []).filter(skill => skill.type !== "talent");
  }

  function initialRanges(expert) {
    return {
      expert: expert?.hasExpertLevelData === true ? { from: 1, to: 100 } : null,
      skills: normalSkills(expert).map(skill => {
        const min = skill.levels[0]?.level || 1;
        return { from: min, to: skill.levels[1]?.level || min };
      })
    };
  }

  function expertTotals(expert, from, to) {
    if (!expert || expert.hasExpertLevelData !== true) {
      return { available: false, favor: null, marks: null };
    }
    const rows = expert.levels.filter(row => row.level > from && row.level <= to);
    const favor = rows.reduce((sum, row) => sum + (row.favor || 0), 0);
    const marks = expert.relationMilestones
      .filter(row => row.afterLevel > from && row.afterLevel <= to)
      .reduce((sum, row) => sum + (row.mark || 0), 0);
    return { available: true, favor, marks };
  }

  function skillCost(skill, from, to) {
    const rows = skill.levels.filter(row => row.level > from && row.level <= to);
    return {
      xp: rows.reduce((sum, row) => sum + (row.xp || 0), 0),
      books: rows.reduce((sum, row) => sum + (row.books || 0), 0)
    };
  }

  window.ExpertCalculatorCore = {
    UNAVAILABLE,
    levelUiState,
    calculatorViewState,
    initialRanges,
    expertTotals,
    skillCost
  };
})();
