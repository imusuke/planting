const { kv } = require("@vercel/kv");
const getRawBody = require("raw-body");

const KV_KEY = "planting_plant_details_overlay_v1";

/** @type {{ version: number, entries: Array<{ areaId: string, name: string, summary?: string, body?: string }> }} */
const defaultPlantDetails = require("../data/plant-details.json");
/** @type {{ areas: Array<{ id: string, plants?: string[] }> }} */
const defaultCatalog = require("../data/plants.json");

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
    console.error("KV plant-details read", e);
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
    var buf = await getRawBody(req, { limit: "16mb" });
    return JSON.parse(buf.toString("utf8"));
  } catch (e) {
    console.error("readJsonBody plant-details", e);
    return null;
  }
}

function entryKey(areaId, name) {
  return String(areaId || "").trim() + "\t" + String(name || "").trim();
}

function normalizeEntry(entry) {
  if (!entry || typeof entry !== "object") return null;
  var areaId = String(entry.areaId || "").trim();
  var name = String(entry.name || "").trim();
  if (!areaId || !name) return null;
  return {
    areaId: areaId,
    name: name,
    summary: entry.summary != null ? String(entry.summary) : "",
    body: entry.body != null ? String(entry.body) : "",
  };
}

function entryMap(entries) {
  var map = {};
  (entries || []).forEach(function (entry) {
    var normalized = normalizeEntry(entry);
    if (!normalized) return;
    map[entryKey(normalized.areaId, normalized.name)] = normalized;
  });
  return map;
}

function catalogPairs() {
  var pairs = [];
  (defaultCatalog.areas || []).forEach(function (area) {
    if (!area || !area.id || !Array.isArray(area.plants)) return;
    area.plants.forEach(function (plantName) {
      var normalized = String(plantName || "").trim();
      if (!normalized) return;
      pairs.push({ areaId: area.id, name: normalized });
    });
  });
  return pairs;
}

function mergeDetails(base, overlay) {
  var baseMap = entryMap(base.entries);
  var overlayEntries = overlay && Array.isArray(overlay.entries) ? overlay.entries : [];
  var overlayMap = entryMap(overlayEntries);
  var used = {};
  var entries = [];

  catalogPairs().forEach(function (pair) {
    var key = entryKey(pair.areaId, pair.name);
    used[key] = true;
    entries.push(
      Object.assign(
        {
          areaId: pair.areaId,
          name: pair.name,
          summary: "",
          body: "",
        },
        baseMap[key] || {},
        overlayMap[key] || {}
      )
    );
  });

  Object.keys(baseMap).forEach(function (key) {
    if (used[key]) return;
    used[key] = true;
    entries.push(Object.assign({}, baseMap[key], overlayMap[key] || {}));
  });

  Object.keys(overlayMap).forEach(function (key) {
    if (used[key]) return;
    used[key] = true;
    entries.push(Object.assign({}, overlayMap[key]));
  });

  return {
    version: base.version || 1,
    entries: entries,
  };
}

function jsonError(res, status, code, err) {
  var detail = err && err.message ? String(err.message) : err ? String(err) : "";
  console.error(code, detail || err);
  return res.status(status).json({ error: code, detail: detail });
}

module.exports = async function handler(req, res) {
  if (req.method === "GET") {
    var overlay = await readOverlay();
    if (overlay === null) {
      return res.status(503).json({ error: "kv_unavailable" });
    }
    var merged = mergeDetails(defaultPlantDetails, overlay);
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
      if (!body || typeof body.areaId !== "string" || typeof body.name !== "string") {
        return res.status(400).json({ error: "missing_fields" });
      }

      var areaId = body.areaId.trim();
      var name = body.name.trim();
      if (!areaId || !name) {
        return res.status(400).json({ error: "missing_fields" });
      }

      var validAreaIds = {};
      (defaultCatalog.areas || []).forEach(function (area) {
        if (area && area.id) validAreaIds[area.id] = true;
      });
      if (!validAreaIds[areaId]) {
        return res.status(400).json({ error: "unknown_area_id" });
      }

      var overlay0 = await readOverlay();
      if (overlay0 === null) {
        return res.status(503).json({ error: "kv_unavailable" });
      }

      var merged0 = mergeDetails(defaultPlantDetails, overlay0);
      var key = entryKey(areaId, name);
      var mergedEntry = merged0.entries.find(function (entry) {
        return entryKey(entry.areaId, entry.name) === key;
      });

      var nextEntry = Object.assign(
        {
          areaId: areaId,
          name: name,
          summary: "",
          body: "",
        },
        mergedEntry || {}
      );

      if (body.summary !== undefined) {
        nextEntry.summary = String(body.summary != null ? body.summary : "").slice(0, 8000);
      }
      if (body.body !== undefined) {
        nextEntry.body = String(body.body != null ? body.body : "").slice(0, 100000);
      }

      var overlayMap = entryMap(overlay0.entries);
      overlayMap[key] = nextEntry;
      await writeOverlay({
        entries: Object.keys(overlayMap).map(function (mapKey) {
          return overlayMap[mapKey];
        }),
      });

      return res.status(200).json({ ok: true, entry: nextEntry });
    } catch (unexpected) {
      return jsonError(res, 500, "internal_error", unexpected);
    }
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "method_not_allowed" });
};