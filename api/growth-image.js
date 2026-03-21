const { get } = require("@vercel/blob");
const { Readable } = require("stream");

function assertImageAuth(req) {
  var need = process.env.GROWTH_UPLOAD_TOKEN;
  if (!need) return true;
  var q = req.query || {};
  if (q.token === need) return true;
  return req.headers["x-growth-token"] === need;
}

/** Only serve paths uploaded by this app (api/growth.js). */
function safeGrowthPathname(p) {
  if (!p || typeof p !== "string" || p.length > 400) return null;
  if (p.indexOf("..") !== -1 || p.charAt(0) === "/") return null;
  if (!/^growth\/[A-Za-z0-9_.-]+\.jpg$/i.test(p)) return null;
  return p;
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).end("Method Not Allowed");
  }

  if (!assertImageAuth(req)) {
    return res.status(401).json({ error: "unauthorized" });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(503).json({ error: "blob_unavailable" });
  }

  var pathname = safeGrowthPathname(
    req.query && (req.query.pathname || req.query.p)
  );
  if (!pathname) {
    return res.status(400).json({ error: "invalid_pathname" });
  }

  try {
    var result = await get(pathname, {
      access: "private",
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    if (!result || result.statusCode !== 200 || !result.stream) {
      return res.status(404).end("Not found");
    }

    res.setHeader("Content-Type", result.blob.contentType || "image/jpeg");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, no-cache");
    if (result.blob.etag) res.setHeader("ETag", result.blob.etag);

    var nodeStream = Readable.fromWeb(result.stream);
    nodeStream.on("error", function (err) {
      console.error("growth-image stream", err);
      if (!res.writableEnded) res.destroy(err);
    });
    return nodeStream.pipe(res);
  } catch (e) {
    console.error("growth-image get", e);
    return res.status(502).json({
      error: "blob_read_failed",
      detail: e && e.message ? String(e.message) : String(e),
    });
  }
};
