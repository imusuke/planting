const { put, del } = require("@vercel/blob");
const { kv } = require("@vercel/kv");
const getRawBody = require("raw-body");

const KV_KEY = "planting_area_growth_records_v1";

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
    console.error("KV area growth read error", e);
    return null;
  }
}

async function writeRecords(records) {
  await kv.set(KV_KEY, JSON.stringify(records));
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
    var len = req.headers["content-length"];
    var buf = await getRawBody(req, {
      length: len,
      limit: "32mb",
    });
    return JSON.parse(buf.toString("utf8"));
  } catch (e) {
    console.error("area-growth readJsonBody", e);
    return null;
  }
}

function createRecordId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "ag_" + Date.now() + "_" + Math.floor(Math.random() * 1e9);
}

function normalizeRecordImages(record) {
  if (!record) return [];
  if (record.images && Array.isArray(record.images) && record.images.length) {
    return record.images.map(function (im) {
      return {
        imageUrl: im && im.imageUrl ? im.imageUrl : null,
        imagePathname: im && im.imagePathname ? im.imagePathname : null,
        memo: im && typeof im.memo === "string" ? im.memo : "",
      };
    });
  }
  if (record.imageUrl || record.imagePathname) {
    return [
      {
        imageUrl: record.imageUrl || null,
        imagePathname: record.imagePathname || null,
        memo: "",
      },
    ];
  }
  return [];
}

async function deleteAllRecordImages(record, token) {
  if (!token || !record) return;
  var list = normalizeRecordImages(record);
  for (var i = 0; i < list.length; i++) {
    if (list[i].imageUrl) {
      try {
        await del(list[i].imageUrl, { token: token });
      } catch (e) {
        console.error("area-growth blob del", e);
      }
    }
  }
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

module.exports = async function handler(req, res) {
  if (req.method === "GET") {
    var recordsGet = await readRecords();
    if (recordsGet === null) {
      return res.status(503).json({ error: "kv_unavailable" });
    }
    return res.status(200).json({ records: recordsGet });
  }

  if (!assertAuth(req)) {
    return res.status(401).json({ error: "unauthorized" });
  }

  if (req.method === "POST") {
    try {
      var body = await readJsonBody(req);
      if (!body || !body.areaId || typeof body.areaId !== "string") {
        return res.status(400).json({ error: "missing_area_id" });
      }

      var records = await readRecords();
      if (records === null) {
        return res.status(503).json({ error: "kv_unavailable" });
      }

      var id = body.id && String(body.id).trim() ? String(body.id).trim() : createRecordId();
      var idx0 = records.findIndex(function (r) {
        return r && r.id === id;
      });
      var existing = idx0 >= 0 ? records[idx0] : null;
      var token = process.env.BLOB_READ_WRITE_TOKEN;
      var imagesOut = null;

      if (body.imagesBase64 !== undefined && body.imagesBase64 !== null) {
        if (!token) {
          return res.status(503).json({ error: "blob_unavailable" });
        }
        var arr = Array.isArray(body.imagesBase64) ? body.imagesBase64 : [];
        if (arr.length > 20) {
          return res.status(400).json({ error: "too_many_images" });
        }
        await deleteAllRecordImages(existing, token);
        imagesOut = [];
        var memosUpload = Array.isArray(body.imageMemos) ? body.imageMemos : [];
        for (var ii = 0; ii < arr.length; ii++) {
          var b64 = arr[ii];
          if (typeof b64 !== "string" || !b64.length) {
            return res.status(400).json({ error: "invalid_image_data" });
          }
          try {
            var bufM = Buffer.from(b64, "base64");
            if (!bufM.length) {
              return res.status(400).json({ error: "invalid_image_data" });
            }
            var blobPath = "area-growth/" + id + "/" + ii + ".jpg";
            var up = await put(blobPath, bufM, {
              access: "private",
              token: token,
              contentType: "image/jpeg",
              addRandomSuffix: false,
              allowOverwrite: true,
            });
            var memoOne =
              memosUpload[ii] != null
                ? String(memosUpload[ii]).slice(0, 5000)
                : "";
            imagesOut.push({
              imageUrl: up.url,
              imagePathname: up.pathname || null,
              memo: memoOne,
            });
          } catch (blobErr) {
            return jsonError(res, 502, "blob_put_failed", blobErr);
          }
        }
      }

      var finalImages =
        imagesOut !== null
          ? imagesOut
          : existing
            ? normalizeRecordImages(existing)
            : [];

      var noteText = String(body.note != null ? body.note : "").slice(0, 20000);
      if (!finalImages.length && !noteText.trim()) {
        return res.status(400).json({ error: "missing_images_and_note" });
      }

      var createdAtStored =
        existing && existing.createdAt
          ? existing.createdAt
          : new Date().toISOString();

      var record = {
        id: id,
        areaId: String(body.areaId || "").trim(),
        areaLabel: String(body.areaLabel || "").trim(),
        recordedAt: String(body.recordedAt || "").trim() || new Date().toISOString().slice(0, 10),
        note: noteText,
        images: finalImages,
        imageUrl: finalImages[0] ? finalImages[0].imageUrl : null,
        imagePathname: finalImages[0] ? finalImages[0].imagePathname : null,
        createdAt: createdAtStored,
      };
      if (existing) {
        record.updatedAt = new Date().toISOString();
      }

      var idx = records.findIndex(function (r) {
        return r && r.id === record.id;
      });
      if (idx >= 0) records[idx] = record;
      else records.push(record);

      records.sort(function (a, b) {
        var da = String((a && a.recordedAt) || "");
        var db = String((b && b.recordedAt) || "");
        if (db !== da) return db.localeCompare(da);
        return String((b && b.createdAt) || "").localeCompare(String((a && a.createdAt) || ""));
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
    var idDel = req.query && req.query.id;
    if (!idDel) return res.status(400).json({ error: "missing_id" });
    var recordsDel = await readRecords();
    if (recordsDel === null) {
      return res.status(503).json({ error: "kv_unavailable" });
    }
    var found = recordsDel.find(function (r) {
      return r && r.id === idDel;
    });
    if (!found) return res.status(404).json({ error: "not_found" });
    await deleteAllRecordImages(found, process.env.BLOB_READ_WRITE_TOKEN);
    var next = recordsDel.filter(function (r) {
      return r && r.id !== idDel;
    });
    await writeRecords(next);
    return res.status(200).json({ ok: true });
  }

  res.setHeader("Allow", "GET, POST, DELETE");
  return res.status(405).json({ error: "method_not_allowed" });
};
