const getRawBody = require("raw-body");
const { generateGrowthPhotoComment } = require("../lib/growth-photo-ai");

function assertAuth(req) {
  var need = process.env.GROWTH_UPLOAD_TOKEN;
  if (!need) return true;
  return req.headers["x-growth-token"] === need;
}

function isParsedJsonObject(body) {
  return (
    body != null &&
    typeof body === "object" &&
    !Buffer.isBuffer(body) &&
    !Array.isArray(body) &&
    typeof body.pipe !== "function"
  );
}

async function readJsonBody(req) {
  if (Buffer.isBuffer(req.body)) {
    try {
      return JSON.parse(req.body.toString("utf8"));
    } catch (e) {
      return null;
    }
  }
  if (isParsedJsonObject(req.body)) {
    return req.body;
  }
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch (e) {
      /* fall through */
    }
  }
  try {
    var buf = await getRawBody(req, {
      limit: "8mb",
    });
    return JSON.parse(buf.toString("utf8"));
  } catch (e) {
    console.error("readJsonBody", e);
    return null;
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }

  if (!assertAuth(req)) {
    return res.status(401).json({ error: "unauthorized" });
  }

  var body = await readJsonBody(req);
  if (!body || typeof body.imageBase64 !== "string" || !body.imageBase64.trim()) {
    return res.status(400).json({ error: "missing_image_base64" });
  }

  var imageBase64 = body.imageBase64.trim();
  if (Buffer.byteLength(imageBase64, "utf8") > 2_400_000) {
    return res.status(400).json({ error: "image_too_large" });
  }

  try {
    var result = await generateGrowthPhotoComment({
      imageBase64: imageBase64,
      imageMimeType:
        typeof body.imageMimeType === "string" && body.imageMimeType.trim()
          ? body.imageMimeType.trim()
          : "image/jpeg",
      context: body.context || {},
      referenceImages: Array.isArray(body.referenceImages) ? body.referenceImages : [],
    });

    return res.status(200).json(result);
  } catch (err) {
    var status = err && err.status ? err.status : 500;
    var code = err && err.code ? err.code : "internal_error";
    var detail =
      err && err.message ? String(err.message) : "AIコメントの生成に失敗しました。";
    console.error(code, detail);
    return res.status(status).json({ error: code, detail: detail });
  }
};
