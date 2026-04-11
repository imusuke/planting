const changeLog = require("../lib/change-log");

function assertAuth(req) {
  var need = process.env.GROWTH_UPLOAD_TOKEN;
  if (!need) return true;
  return req.headers["x-growth-token"] === need;
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "method_not_allowed" });
  }

  if (!assertAuth(req)) {
    return res.status(401).json({ error: "unauthorized" });
  }

  var limit = req.query && req.query.limit != null ? req.query.limit : 20;
  var items = await changeLog.readChangeLog(limit);
  if (items === null) {
    return res.status(503).json({ error: "kv_unavailable" });
  }
  return res.status(200).json({
    items: items,
    source: "kv",
  });
};
