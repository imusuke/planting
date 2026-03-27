const { put, del } = require("@vercel/blob");
const { kv } = require("@vercel/kv");
const getRawBody = require("raw-body");

const KV_KEY = "planting_area_details_overlay_v1";

/** @type {{ version: number, entries: Array<{ areaId: string, summary?: string, body?: string, images?: unknown[] }> }} */
const defaultAreaDetails = require("../data/area-details.json");
/** @type {{ areas: Array<{ id: string }> }} */
const defaultCatalog = require("../data/plants.json");

function blobPutAccess() {
  return process.env.BLOB_PUT_ACCESS === "public" ? "public" : "private";
}

function assertAuth(req) {
  var need = process.env.GROWTH_UPLOAD_TOKEN;
  if (!need) return true;
  return req.headers["x-growth-token"] === need;
}

async function readOverlay() {
  try {
    var raw = await kv.get(KV_KEY);
    if (raw == null || raw === "") return { entries: [] };
    var data = typeof raw === "string" ? JSON.parse(raw) : raw;
    return data && Array.isArray(data.entries) ? data : { entries: [] };
  } catch (e) {
    console.error("KV area-details read", e);
    return null;
  }
}

async function writeOverlay(doc) {
  await kv.set(KV_KEY, JSON.stringify(doc));
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
      limit: "32mb",
    });
    return JSON.parse(buf.toString("utf8"));
  } catch (e) {
    console.error("readJsonBody area-details", e);
    return null;
  }
}

function overlayMap(overlay) {
  var m = {};
  (overlay.entries || []).forEach(function (e) {
    if (e && e.areaId) m[e.areaId] = e;
  });
  return m;
}

/**
 * リポジトリの既定に、KV のエリア単位の上書きを重ねる。
 */
function mergeDetails(base, overlay) {
  var om = overlayMap(overlay);
  var order = [];
  (defaultCatalog.areas || []).forEach(function (a) {
    if (a && a.id) order.push(a.id);
  });
  var entries = [];
  for (var i = 0; i < order.length; i++) {
    var id = order[i];
    var be = (base.entries || []).find(function (x) {
      return x && x.areaId === id;
    });
    if (!be) continue;
    var o = om[id];
    entries.push(o ? Object.assign({}, be, o) : JSON.parse(JSON.stringify(be)));
  }
  return { version: base.version || 1, entries: entries };
}

function normalizeImageSlot(im) {
  if (!im || typeof im !== "object") return null;
  return {
    imageUrl: im.imageUrl || null,
    imagePathname: im.imagePathname || null,
    caption: typeof im.caption === "string" ? im.caption : "",
  };
}

async function deleteAreaImageBlobs(entry, token) {
  if (!token || !entry || !Array.isArray(entry.images)) return;
  for (var i = 0; i < entry.images.length; i++) {
    var im = entry.images[i];
    if (im && im.imageUrl) {
      try {
        await del(im.imageUrl, { token: token });
      } catch (e) {
        console.error("area-details blob del", e);
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
    var overlay = await readOverlay();
    if (overlay === null) {
      return res.status(503).json({ error: "kv_unavailable" });
    }
    var merged = mergeDetails(defaultAreaDetails, overlay);
    return res.status(200).json(
      Object.assign({}, merged, {
        source: overlay.entries && overlay.entries.length ? "kv" : "file",
      })
    );
  }

  if (req.method === "POST") {
    if (!assertAuth(req)) {
      return res.status(401).json({ error: "unauthorized" });
    }

    try {
      var body = await readJsonBody(req);
      if (!body || !body.areaId || typeof body.areaId !== "string") {
        return res.status(400).json({ error: "missing_area_id" });
      }

      var areaId = body.areaId.trim();
      var validIds = {};
      (defaultCatalog.areas || []).forEach(function (a) {
        if (a && a.id) validIds[a.id] = true;
      });
      if (!validIds[areaId]) {
        return res.status(400).json({ error: "unknown_area_id" });
      }

      var overlay0 = await readOverlay();
      if (overlay0 === null) {
        return res.status(503).json({ error: "kv_unavailable" });
      }

      var merged0 = mergeDetails(defaultAreaDetails, overlay0);
      var idx = merged0.entries.findIndex(function (e) {
        return e && e.areaId === areaId;
      });
      if (idx < 0) {
        return res.status(400).json({ error: "area_not_in_catalog" });
      }

      var entry = JSON.parse(JSON.stringify(merged0.entries[idx]));
      var token = process.env.BLOB_READ_WRITE_TOKEN;

      if (body.imagesBase64 !== undefined && body.imagesBase64 !== null) {
        if (!token) {
          return res.status(503).json({ error: "blob_unavailable" });
        }
        await deleteAreaImageBlobs(entry, token);
        var arr = Array.isArray(body.imagesBase64) ? body.imagesBase64 : [];
        if (arr.length > 20) {
          return res.status(400).json({ error: "too_many_images" });
        }
        var access = blobPutAccess();
        var captions = Array.isArray(body.imageCaptions) ? body.imageCaptions : [];
        var imagesOut = [];
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
            var blobPath = "area-details/" + areaId + "/" + ii + ".jpg";
            var up = await put(blobPath, bufM, {
              access: access,
              token: token,
              contentType: "image/jpeg",
              addRandomSuffix: false,
              allowOverwrite: true,
            });
            var cap =
              captions[ii] != null ? String(captions[ii]).slice(0, 5000) : "";
            imagesOut.push({
              imageUrl: up.url,
              imagePathname: access === "private" ? up.pathname : null,
              caption: cap,
            });
          } catch (blobErr) {
            return jsonError(res, 502, "blob_put_failed", blobErr);
          }
        }
        entry.images = imagesOut;
      } else if (Array.isArray(body.imageCaptions) && Array.isArray(entry.images)) {
        var caps = body.imageCaptions;
        entry.images = entry.images.map(function (im, j) {
          var o = normalizeImageSlot(im) || {};
          if (caps[j] !== undefined) {
            o.caption = String(caps[j] != null ? caps[j] : "").slice(0, 5000);
          }
          return o;
        });
      }

      if (body.summary !== undefined) {
        entry.summary = String(body.summary != null ? body.summary : "").slice(0, 8000);
      }
      if (body.body !== undefined) {
        entry.body = String(body.body != null ? body.body : "").slice(0, 100000);
      }

      var om = overlayMap(overlay0);
      om[areaId] = entry;
      var nextEntries = Object.keys(om).map(function (k) {
        return om[k];
      });
      try {
        await writeOverlay({ entries: nextEntries });
      } catch (kvErr) {
        return jsonError(res, 503, "kv_write_failed", kvErr);
      }

      return res.status(200).json({ ok: true, entry: entry });
    } catch (unexpected) {
      return jsonError(res, 500, "internal_error", unexpected);
    }
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "method_not_allowed" });
};
