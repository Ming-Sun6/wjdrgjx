(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && typeof root === 'object') root.adminDashboardSignals = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function average(rows, key, limit) {
    var slice = (rows || []).slice(0, Math.max(0, limit || rows.length));
    if (!slice.length) return 0;
    return slice.reduce(function (acc, row) {
      return acc + Number(row[key] || 0);
    }, 0) / slice.length;
  }

  function buildTrafficSignal(trafficRows) {
    var rows = Array.isArray(trafficRows) ? trafficRows : [];
    if (rows.length < 3) return null;
    var current = rows[rows.length - 1];
    var baseline = rows.slice(0, -1);
    var avgPv = average(baseline, 'pv');
    var avgUv = average(baseline, 'uv');
    var currentPv = Number(current.pv || 0);
    var currentUv = Number(current.uv || 0);
    if (avgPv <= 0) return null;

    if (currentPv >= avgPv * 2.5) {
      return {
        level: currentUv > avgUv * 1.4 ? 'watch' : 'high',
        title: '\u6d41\u91cf\u6298\u7ebf\u7a81\u7136\u62ac\u5347',
        summary: currentUv > avgUv * 1.4
          ? '\u6d41\u91cf\u4e0e\u72ec\u7acb\u8bbf\u5ba2\u540c\u6b65\u4e0a\u5347'
          : '\u6d41\u91cf\u4e0a\u5347\u5feb\uff0c\u4f46 UV \u589e\u957f\u76f8\u5bf9\u6709\u9650',
        action: '\u4f18\u5148\u68c0\u67e5\u5f53\u524d\u70ed\u95e8\u9875\u9762\u548c\u5165\u53e3'
      };
    }
    return null;
  }

  function buildReviewSignal(summary) {
    var pendingReview = Number(summary.pendingReview || 0);
    if (pendingReview < 10) return null;
    return {
      level: pendingReview >= 15 ? 'high' : 'watch',
      title: '\u5f85\u5ba1\u6838\u538b\u529b\u5347\u9ad8',
      summary: '\u5f53\u524d\u5f85\u5ba1\u6838\u5185\u5bb9\u660e\u663e\u5806\u79ef',
      action: '\u4f18\u5148\u6253\u5f00\u5ba1\u6838\u961f\u5217'
    };
  }

  function buildPunishmentSignal(summary) {
    var punishments = Number(summary.punishments || 0);
    if (punishments <= 0) return null;
    return {
      level: punishments >= 5 ? 'watch' : 'info',
      title: '\u6cbb\u7406\u72b6\u6001\u6301\u7eed',
      summary: '\u5f53\u524d\u4ecd\u6709\u5904\u7f5a\u4e2d\u8d26\u53f7\u9700\u8981\u8ddf\u8fdb',
      action: '\u8fdb\u5165\u5c0f\u9ed1\u5c4b\u68c0\u67e5\u540e\u7eed\u5904\u7406'
    };
  }

  function buildCommandSummary(signals) {
    if (!signals.length) {
      return {
        tone: 'info',
        summary: '\u5f53\u524d\u6682\u65e0\u663e\u8457\u5f02\u5e38'
      };
    }
    var topSignal = signals.slice().sort(function (a, b) {
      var weight = { high: 3, watch: 2, info: 1 };
      return (weight[b.level] || 0) - (weight[a.level] || 0);
    })[0];
    return {
      tone: topSignal.level,
      summary: topSignal.summary
    };
  }

  function buildDashboardSignals(input) {
    var payload = input || {};
    var summary = payload.summary || {};
    var trends = payload.trends || {};
    var signals = [];

    [buildTrafficSignal(trends.traffic), buildReviewSignal(summary), buildPunishmentSignal(summary)]
      .filter(Boolean)
      .slice(0, 4)
      .forEach(function (signal) {
        signals.push(signal);
      });

    return {
      commandSummary: buildCommandSummary(signals),
      signals: signals
    };
  }

  return {
    buildDashboardSignals: buildDashboardSignals
  };
});
