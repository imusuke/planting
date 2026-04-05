const growthApi = require("./growth");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }

  if (!growthApi.assertAuth(req)) {
    return res.status(401).json({ error: "unauthorized" });
  }

  try {
    var body = await growthApi.readJsonBody(req);
    var id = body && body.id ? String(body.id).trim() : "";
    if (!id) {
      return res.status(400).json({ error: "missing_id" });
    }

    var records = await growthApi.readRecords();
    if (records === null) {
      return res.status(503).json({ error: "kv_unavailable" });
    }

    var record = records.find(function (item) {
      return item && item.id === id;
    });
    if (!record) {
      return res.status(404).json({ error: "not_found" });
    }

    var imageCount =
      record && Array.isArray(record.images) ? record.images.length : record && record.imageUrl ? 1 : 0;
    var targets = growthApi.normalizeAiCommentTargets(body.targets, imageCount);
    if (!targets.length) {
      return res.status(400).json({ error: "missing_targets" });
    }

    var refreshResult;
    try {
      refreshResult = await growthApi.refreshGrowthPhotoCommentsInBackground(record, targets);
    } catch (err) {
      var refreshDetail =
        err && err.message ? String(err.message) : "AIコメントの更新に失敗しました。";
      console.error("growth-ai-refresh", refreshDetail, err);

      var latestAfterFailure = await growthApi.readRecords();
      if (latestAfterFailure === null) {
        return res.status(503).json({ error: "kv_unavailable" });
      }
      var latestRecordAfterFailure = latestAfterFailure.find(function (item) {
        return item && item.id === id;
      });

      return res.status(202).json({
        ok: false,
        updated: false,
        error: "refresh_failed",
        detail: refreshDetail,
        result: null,
        record: null,
        latestRecord: latestRecordAfterFailure || null,
      });
    }

    var latestRecords = await growthApi.readRecords();
    if (latestRecords === null) {
      return res.status(503).json({ error: "kv_unavailable" });
    }
    var latestRecord = latestRecords.find(function (item) {
      return item && item.id === id;
    });
    var updated = !!(refreshResult && refreshResult.ok && refreshResult.updated);

    return res.status(updated ? 200 : 202).json({
      ok: updated,
      updated: updated,
      result: refreshResult,
      record: updated ? latestRecord || null : null,
      latestRecord: latestRecord || null,
    });
  } catch (err) {
    var detail = err && err.message ? String(err.message) : "AIコメントの更新に失敗しました。";
    console.error("growth-ai-refresh", detail, err);
    return res.status(500).json({ error: "internal_error", detail: detail });
  }
};
