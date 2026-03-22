const { put, del } = require("@vercel/blob");
const { kv } = require("@vercel/kv");
const getRawBody = require("raw-body");

const KV_KEY = "planting_growth_records_v1";
const KV_PLANTS = "planting_plants_catalog_v1";

/** @type {{ areas: Array<{ id: string, label: string, plants: string[] }> }} */
const defaultCatalog = require("../data/plants.json");

/**
 * `private` by default (works with all Blob stores; images use `/api/growth-image`).
 * Set `BLOB_PUT_ACCESS=public` for direct public URLs (no pathname proxy).
 */
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

async function readCatalogKv() {
  try {
    var raw = await kv.get(KV_PLANTS);
    if (raw == null || raw === "") return null;
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch (e) {
    console.error("KV plants read (growth)", e);
    return null;
  }
}

async function writeCatalogKv(data) {
  await kv.set(KV_PLANTS, JSON.stringify(data));
}

/** plants.js GET と同じ補完（KV 単体に無い既定エリアを含める） */
function mergeMissingAreasFromDefault(kvAreas, defaultAreas) {
  if (!Array.isArray(kvAreas) || !kvAreas.length) return kvAreas;
  if (!Array.isArray(defaultAreas) || !defaultAreas.length) return kvAreas;
  var have = {};
  for (var i = 0; i < kvAreas.length; i++) {
    var a = kvAreas[i];
    if (a && a.id) have[a.id] = true;
  }
  var out = kvAreas.slice();
  for (var j = 0; j < defaultAreas.length; j++) {
    var d = defaultAreas[j];
    if (!d || !d.id || have[d.id]) continue;
    have[d.id] = true;
    out.push(
      JSON.parse(
        JSON.stringify({
          id: d.id,
          label: d.label,
          plants: Array.isArray(d.plants) ? d.plants.slice() : [],
        })
      )
    );
  }
  return out;
}

/**
 * 記録に含まれる植栽名のうち、当該エリアのマスタに無いものを KV のカタログへ追記する。
 * 失敗しても成長記録の保存は成功扱い（ログのみ）。
 */
async function appendRecordPlantsToCatalog(areaId, plantNames) {
  if (!areaId || typeof areaId !== "string" || !areaId.trim()) return;
  if (!Array.isArray(plantNames) || !plantNames.length) return;

  var fromKv = await readCatalogKv();
  var hasKv = !!(fromKv && Array.isArray(fromKv.areas) && fromKv.areas.length);
  var areas;
  if (hasKv) {
    areas = JSON.parse(JSON.stringify(fromKv.areas));
  } else {
    areas = JSON.parse(JSON.stringify(defaultCatalog.areas));
  }
  areas = mergeMissingAreasFromDefault(areas, defaultCatalog.areas);

  var idx = areas.findIndex(function (a) {
    return a && a.id === areaId;
  });
  if (idx < 0) {
    console.warn("appendRecordPlantsToCatalog: area not in catalog", areaId);
    return;
  }

  var list = Array.isArray(areas[idx].plants) ? areas[idx].plants.slice() : [];
  var seen = {};
  for (var s = 0; s < list.length; s++) {
    seen[list[s]] = true;
  }

  var changed = false;
  for (var p = 0; p < plantNames.length; p++) {
    var n = typeof plantNames[p] === "string" ? plantNames[p].trim() : "";
    if (!n) continue;
    if (seen[n]) continue;
    seen[n] = true;
    list.push(n);
    changed = true;
  }

  if (!changed) return;

  areas[idx] = Object.assign({}, areas[idx], { plants: list });
  await writeCatalogKv({ areas: areas });
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

function isParsedJsonObject(body) {
  return (
    body != null &&
    typeof body === "object" &&
    !Buffer.isBuffer(body) &&
    !Array.isArray(body) &&
    typeof body.pipe !== "function"
  );
}

function normalizeRecordImages(record) {
  if (!record) return [];
  if (record.images && Array.isArray(record.images) && record.images.length) {
    return record.images.map(function (im) {
      return {
        imageUrl: im && im.imageUrl ? im.imageUrl : null,
        imagePathname: im && im.imagePathname ? im.imagePathname : null,
      };
    });
  }
  if (record.imageUrl || record.imagePathname) {
    return [
      {
        imageUrl: record.imageUrl || null,
        imagePathname: record.imagePathname || null,
      },
    ];
  }
  return [];
}

async function deleteAllRecordImages(record, token) {
  if (!token || !record) return;
  var list = normalizeRecordImages(record);
  for (var d = 0; d < list.length; d++) {
    if (list[d].imageUrl) {
      try {
        await del(list[d].imageUrl, { token: token });
      } catch (e) {
        console.error("blob del", e);
      }
    }
  }
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
      /* fall through: try raw stream (some hosts leave body unparsed) */
    }
  }
  try {
    var buf = await getRawBody(req, {
      limit: "32mb",
    });
    return JSON.parse(buf.toString("utf8"));
  } catch (e) {
    console.error("readJsonBody", e);
    return null;
  }
}

module.exports = async function handler(req, res) {
  if (req.method === "GET") {
    var records = await readRecords();
    if (records === null) {
      return res.status(503).json({ error: "kv_unavailable" });
    }
    return res.status(200).json({ records: records });
  }

  if (!assertAuth(req)) {
    return res.status(401).json({ error: "unauthorized" });
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
      var access = blobPutAccess();
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
          var blobPath = "growth/" + body.id + "/" + ii + ".jpg";
          var up = await put(blobPath, bufM, {
            access: access,
            token: token,
            contentType: "image/jpeg",
            addRandomSuffix: false,
            allowOverwrite: true,
          });
          imagesOut.push({
            imageUrl: up.url,
            imagePathname: access === "private" ? up.pathname : null,
          });
        } catch (blobErr) {
          return jsonError(res, 502, "blob_put_failed", blobErr);
        }
      }
    } else if (body.imageBase64) {
      if (!token) {
        return res.status(503).json({ error: "blob_unavailable" });
      }
      await deleteAllRecordImages(existing, token);
      try {
        var buf1 = Buffer.from(body.imageBase64, "base64");
        if (!buf1.length) {
          return res.status(400).json({ error: "invalid_image_data" });
        }
        var access1 = blobPutAccess();
        var uploaded1 = await put("growth/" + body.id + "/0.jpg", buf1, {
          access: access1,
          token: token,
          contentType: body.imageMime || "image/jpeg",
          addRandomSuffix: false,
          allowOverwrite: true,
        });
        imagesOut = [
          {
            imageUrl: uploaded1.url,
            imagePathname: access1 === "private" ? uploaded1.pathname : null,
          },
        ];
      } catch (blobErr2) {
        return jsonError(res, 502, "blob_put_failed", blobErr2);
      }
    }

    var createdAtStored =
      existing && existing.createdAt
        ? existing.createdAt
        : body.createdAt || new Date().toISOString();

    var finalImages;
    if (imagesOut !== null) {
      finalImages = imagesOut;
    } else {
      finalImages = existing
        ? normalizeRecordImages(existing).map(function (x) {
            return { imageUrl: x.imageUrl, imagePathname: x.imagePathname };
          })
        : [];
    }

    var record = {
      id: body.id,
      recordedAt: body.recordedAt,
      areaId: body.areaId,
      areaLabel: body.areaLabel,
      plants: Array.isArray(body.plants) ? body.plants : [],
      note: body.note || "",
      images: finalImages,
      imageUrl: finalImages[0] ? finalImages[0].imageUrl : null,
      imagePathname: finalImages[0] ? finalImages[0].imagePathname : null,
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

    try {
      await appendRecordPlantsToCatalog(record.areaId, record.plants);
    } catch (catErr) {
      console.error("appendRecordPlantsToCatalog", catErr);
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
    await deleteAllRecordImages(found, process.env.BLOB_READ_WRITE_TOKEN);
    var next = list.filter(function (r) {
      return r.id !== id;
    });
    await writeRecords(next);
    return res.status(200).json({ ok: true });
  }

  res.setHeader("Allow", "GET, POST, DELETE");
  return res.status(405).json({ error: "method_not_allowed" });
};
