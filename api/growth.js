const { put, del } = require("@vercel/blob");
const { kv } = require("@vercel/kv");
const getRawBody = require("raw-body");

const KV_KEY = "planting_growth_records_v1";

/** Private store (Vercel default): `private`. Public store: set env `BLOB_PUT_ACCESS=public`. */
function blobPutAccess() {
  return process.env.BLOB_PUT_ACCESS === "public" ? "public" : "private";
}

function assertAuth(req) {
  var need = process.env.GROWTH_UPLOAD_TOKEN;
  if (!need) return true;
  return req.headers["x-growth-token"] === need;
}

async function readRecords() {
  try {
    var raw = await kv.get(KV_KEY);
    if (raw == null || raw === "") return [];
    var data = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.error("KV read error", e);
    return null;
  }
}

async function writeRecords(records) {
  await kv.set(KV_KEY, JSON.stringify(records));
}

function jsonError(res, status, code, err) {
  var detail =
    err && err.message
      ? String(err.message)
      : err
        ? String(err)
        : "";
  console.error(code, detail || err);
  return res.status(status).json({ error: code, detail: detail });
}

async function readJsonBody(req) {
  if (Buffer.isBuffer(req.body)) {
    try {
      return JSON.parse(req.body.toString("utf8"));
    } catch (e) {
      return null;
    }
  }
  if (req.body != null && typeof req.body === "object") {
    return req.body;
  }
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch (e) {
      return null;
    }
  }
  try {
    var len = req.headers["content-length"];
    var buf = await getRawBody(req, {
      length: len,
      limit: "6mb",
    });
    return JSON.parse(buf.toString("utf8"));
  } catch (e) {
    return null;
  }
}

module.exports = async function handler(req, res) {
  if (!assertAuth(req)) {
    return res.status(401).json({ error: "unauthorized" });
  }

  if (req.method === "GET") {
    var records = await readRecords();
    if (records === null) {
      return res.status(503).json({ error: "kv_unavailable" });
    }
    return res.status(200).json({ records: records });
  }

  if (req.method === "POST") {
    try {
    var body = await readJsonBody(req);
    if (!body || !body.id) {
      return res.status(400).json({ error: "missing_id" });
    }

    var records = await readRecords();
    if (records === null) {
      return res.status(503).json({ error: "kv_unavailable" });
    }

    var idx0 = records.findIndex(function (r) {
      return r.id === body.id;
    });
    var existing = idx0 >= 0 ? records[idx0] : null;
    var imageUrl = existing && existing.imageUrl ? existing.imageUrl : null;
    var imagePathname =
      existing && existing.imagePathname ? existing.imagePathname : null;

    if (body.imageBase64) {
      if (!process.env.BLOB_READ_WRITE_TOKEN) {
        return res.status(503).json({ error: "blob_unavailable" });
      }
      if (imageUrl && process.env.BLOB_READ_WRITE_TOKEN) {
        try {
          await del(imageUrl, { token: process.env.BLOB_READ_WRITE_TOKEN });
        } catch (e) {
          console.error("blob del before replace", e);
        }
      }
      try {
        var buf = Buffer.from(body.imageBase64, "base64");
        if (!buf.length) {
          return res.status(400).json({ error: "invalid_image_data" });
        }
        var access = blobPutAccess();
        var uploaded = await put("growth/" + body.id + ".jpg", buf, {
          access: access,
          token: process.env.BLOB_READ_WRITE_TOKEN,
          contentType: body.imageMime || "image/jpeg",
          addRandomSuffix: false,
        });
        imageUrl = uploaded.url;
        imagePathname = access === "private" ? uploaded.pathname : null;
      } catch (blobErr) {
        return jsonError(res, 502, "blob_put_failed", blobErr);
      }
    }

    var createdAtStored =
      existing && existing.createdAt
        ? existing.createdAt
        : body.createdAt || new Date().toISOString();

    var record = {
      id: body.id,
      recordedAt: body.recordedAt,
      areaId: body.areaId,
      areaLabel: body.areaLabel,
      plants: Array.isArray(body.plants) ? body.plants : [],
      note: body.note || "",
      imageUrl: imageUrl,
      imagePathname: imagePathname,
      createdAt: createdAtStored,
    };
    if (existing) {
      record.updatedAt = new Date().toISOString();
    }

    var idx = records.findIndex(function (r) {
      return r.id === record.id;
    });
    if (idx >= 0) {
      records[idx] = record;
    } else {
      records.push(record);
    }
    records.sort(function (a, b) {
      return (b.recordedAt || "").localeCompare(a.recordedAt || "");
    });
    try {
      await writeRecords(records);
    } catch (kvErr) {
      return jsonError(res, 503, "kv_write_failed", kvErr);
    }
    return res.status(200).json({ ok: true, record: record });
    } catch (unexpected) {
      return jsonError(res, 500, "internal_error", unexpected);
    }
  }

  if (req.method === "DELETE") {
    var id = req.query && req.query.id;
    if (!id) {
      return res.status(400).json({ error: "missing_id" });
    }
    var list = await readRecords();
    if (list === null) {
      return res.status(503).json({ error: "kv_unavailable" });
    }
    var found = list.find(function (r) {
      return r.id === id;
    });
    if (!found) {
      return res.status(404).json({ error: "not_found" });
    }
    if (found.imageUrl && process.env.BLOB_READ_WRITE_TOKEN) {
      try {
        await del(found.imageUrl, { token: process.env.BLOB_READ_WRITE_TOKEN });
      } catch (e) {
        console.error("blob del", e);
      }
    }
    var next = list.filter(function (r) {
      return r.id !== id;
    });
    await writeRecords(next);
    return res.status(200).json({ ok: true });
  }

  res.setHeader("Allow", "GET, POST, DELETE");
  return res.status(405).json({ error: "method_not_allowed" });
};
