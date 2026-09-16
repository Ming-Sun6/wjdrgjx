(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root && typeof root === 'object') {
    root.adminDashboardLayout = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function splitKpisForDashboard(summary) {
    var data = summary || {};
    return {
      hero: [
        { key: 'pv', label: 'PV\uff08\u9875\u9762\u8bbf\u95ee\u91cf\uff09', value: Number(data.pv || 0), tone: 'hero-primary' },
        { key: 'uv', label: 'UV\uff08\u72ec\u7acb\u8bbf\u5ba2\uff09', value: Number(data.uv || 0), tone: 'hero-secondary' }
      ],
      support: [
        { key: 'newUsers', label: '\u65b0\u589e\u7528\u6237', value: Number(data.newUsers || 0) },
        { key: 'activeUsers', label: '\u6d3b\u8dc3\u7528\u6237', value: Number(data.activeUsers || 0) },
        { key: 'posts', label: '\u53d1\u5e16\u6570', value: Number(data.posts || 0) },
        { key: 'comments', label: '\u8bc4\u8bba\u6570', value: Number(data.comments || 0) },
        { key: 'pendingReview', label: '\u5f85\u5ba1\u6838\u5185\u5bb9', value: Number(data.pendingReview || 0) },
        { key: 'punishments', label: '\u5904\u7f5a\u4e2d\u8d26\u53f7', value: Number(data.punishments || 0) }
      ]
    };
  }

  function buildTrendPanelMeta() {
    return {
      primary: {
        key: 'traffic',
        title: '\u6d41\u91cf\u8d8b\u52bf',
        subtitle: 'PV / UV'
      },
      secondary: [
        {
          key: 'users',
          title: '\u7528\u6237\u589e\u957f',
          subtitle: '\u65b0\u589e\u7528\u6237'
        },
        {
          key: 'content',
          title: '\u5185\u5bb9\u589e\u957f',
          subtitle: '\u53d1\u5e16\u4e0e\u8bc4\u8bba'
        }
      ]
    };
  }

  function buildRankingPanelMeta() {
    return {
      rankings: [
        { key: 'top-pages', title: '\u70ed\u95e8\u9875\u9762', subtitle: '\u9875\u9762\u8bbf\u95ee\u91cf\u6392\u884c' },
        { key: 'top-functions', title: '\u70ed\u95e8\u529f\u80fd\u9875', subtitle: '\u529f\u80fd\u9875\u9762\u8bbf\u95ee\u6392\u884c' },
        { key: 'top-apis', title: '\u70ed\u95e8\u63a5\u53e3', subtitle: '\u63a5\u53e3\u8c03\u7528\u6392\u884c' }
      ],
      status: {
        key: 'ops-status',
        title: '\u8fd0\u8425\u72b6\u6001',
        subtitle: '\u5f53\u524d\u961f\u5217\u4e0e\u8fd0\u884c\u63d0\u793a'
      }
    };
  }

  function buildCommandDeckMeta() {
    return {
      kicker: '\u540e\u53f0\u5927\u5c4f',
      title: '\u8fd0\u8425\u603b\u89c8',
      emptySummary: '\u5f53\u524d\u6682\u65e0\u663e\u8457\u5f02\u5e38',
      supportGroups: [
        {
          key: 'user-activity',
          title: '\u7528\u6237\u6d3b\u8dc3',
          keys: ['newUsers', 'activeUsers']
        },
        {
          key: 'content-activity',
          title: '\u5185\u5bb9\u6d3b\u8dc3',
          keys: ['posts', 'comments']
        },
        {
          key: 'governance-pressure',
          title: '\u6cbb\u7406\u538b\u529b',
          keys: ['pendingReview', 'punishments']
        }
      ],
      actions: [
        { key: 'review', label: '\u67e5\u770b\u5f85\u5ba1\u6838', target: 'reviewPanelViolation' },
        { key: 'blackroom', label: '\u67e5\u770b\u5904\u7f5a\u540d\u5355', target: 'blackroomPanelViolation' },
        { key: 'refresh', label: '\u5237\u65b0\u5927\u5c4f', action: 'refresh' }
      ]
    };
  }

  return {
    splitKpisForDashboard: splitKpisForDashboard,
    buildTrendPanelMeta: buildTrendPanelMeta,
    buildRankingPanelMeta: buildRankingPanelMeta,
    buildCommandDeckMeta: buildCommandDeckMeta
  };
});
