const { normalizeDashboardQuery } = require('./time');
const { buildRankingResponse, buildSummaryResponse, buildTrendsResponse } = require('./service');

function createDashboardHandlers(deps) {
  const services = deps || {};

  return {
    async summary(req, res) {
      const query = normalizeDashboardQuery(req.query || {});
      const raw = await services.getSummary(query);
      return res.status(200).json({
        ok: true,
        query,
        summary: buildSummaryResponse(raw)
      });
    },

    async trends(req, res) {
      const query = normalizeDashboardQuery(req.query || {});
      const trends = await services.getTrends(query);
      return res.status(200).json({
        ok: true,
        query,
        trends: buildTrendsResponse(trends)
      });
    },

    async rankings(req, res) {
      const query = normalizeDashboardQuery(req.query || {});
      const rankings = await services.getRankings(query);
      return res.status(200).json({
        ok: true,
        query,
        rankings: buildRankingResponse(rankings)
      });
    },

    async realtime(req, res) {
      const query = normalizeDashboardQuery(req.query || {});
      const realtime = await services.getRealtime(query);
      return res.status(200).json({
        ok: true,
        query,
        realtime: realtime || {}
      });
    },

    async trackPageView(req, res) {
      const payload = {
        pagePath: req.body?.pagePath || '',
        pageKey: req.body?.pageKey || '',
        referrer: req.body?.referrer || '',
        visitorId: req.analyticsVisitorId || ''
      };
      const result = await services.trackPageView(payload);
      return res.status(202).json({
        ok: !!result?.ok,
        visitorId: result?.visitorId || payload.visitorId || ''
      });
    }
  };
}

module.exports = {
  createDashboardHandlers
};
