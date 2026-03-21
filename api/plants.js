const { kv } = require("@vercel/kv");
const getRawBody = require("raw-body");

const KV_PLANTS = "planting_plants_catalog_v1";
const KV_GROWTH = "planting_growth_records_v1";

/** @type {{ areas: Array<{ id: string, label: string, plants: string[] }> }} */
const defaultCatalog = require("../data/plants.json");

function assertAuth(req) {
  var need = process.env.GROWTH_UPLOAD_TOKEN;
  if (!need) return true;
  return req.headers["x-growth-token"] === need;
}

async function readCatalogKv() {
  try {
    var raw = await kv.get(KV_PLANTS);
    if (raw == null || raw === "") return null;
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch (e) {
    console.error("KV plants read", e);
    return null;
  }
}

async function writeCatalogKv(data) {
  await kv.set(KV_PLANTS, JSON.stringify(data));
}

async function readGrowthRecords() {
  try {
    var raw = await kv.get(KV_GROWTH);
    if (raw == null || raw === "") return [];
    var data = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.error("KV growth read", e);
    return null;
  }
}

async function writeGrowthRecords(records) {
  await kv.set(KV_GROWTH, JSON.stringify(records));
}

function validateAreas(areas) {
  if (!Array.isArray(areas)) return "areas_not_array";
  for (var i = 0; i < areas.length; i++) {
    var a = areas[i];
    if (!a || typeof a.id !== "string" || !a.id.trim()) return "bad_area_id";
    if (typeof a.label !== "string" || !a.label.trim()) return "bad_area_label";
    if (!Array.isArray(a.plants)) return "bad_plants_array";
    for (var j = 0; j < a.plants.length; j++) {
      if (typeof a.plants[j] !== "string" || !a.plants[j].trim()) {
        return "bad_plant_name";
      }
    }
  }
  return null;
}

function dedupePlantOrder(arr) {
  var seen = {};
  var out = [];
  for (var i = 0; i < arr.length; i++) {
    var p = arr[i];
    if (seen[p]) continue;
    seen[p] = true;
    out.push(p);
  }
  return out;
}

function applyAreaRenamesToRecord(rec, renames) {
  if (!Array.isArray(rec.plants) || !rec.plants.length) return rec;
  var next = rec.plants.slice();
  for (var i = 0; i < renames.length; i++) {
    var r = renames[i];
    if (!r || rec.areaId !== r.areaId) continue;
    var from = r.from;
    var to = r.to;
    if (!from || from === to) continue;
    next = next.map(function (p) {
      return p === from ? to : p;
    });
  }
  next = dedupePlantOrder(next);
  return Object.assign({}, rec, { plants: next });
}

function validateRenames(renames) {
  if (!Array.isArray(renames)) return "renames_not_array";
  for (var i = 0; i < renames.length; i++) {
    var r = renames[i];
    if (!r || typeof r.areaId !== "string" || !r.areaId.trim()) return "bad_rename_area";
    if (typeof r.from !== "string" || !r.from.trim()) return "bad_rename_from";
    if (typeof r.to !== "string" || !r.to.trim()) return "bad_rename_to";
  }
  return null;
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
      limit: "1mb",
    });
    return JSON.parse(buf.toString("utf8"));
  } catch (e) {
    return null;
  }
}

module.exports = async function handler(req, res) {
  if (req.method === "GET") {
    var fromKv = await readCatalogKv();
    var hasKv = !!(fromKv && Array.isArray(fromKv.areas) && fromKv.areas.length);
    var areas = hasKv ? fromKv.areas : defaultCatalog.areas;
    return res.status(200).json({
      areas: areas,
      source: hasKv ? "kv" : "file",
    });
  }

  if (req.method === "PUT") {
    if (!assertAuth(req)) {
      return res.status(401).json({ error: "unauthorized" });
    }

    var body = await readJsonBody(req);
    if (!body || !Array.isArray(body.areas)) {
      return res.status(400).json({ error: "missing_areas" });
    }

    var verr = validateAreas(body.areas);
    if (verr) {
      return res.status(400).json({ error: verr });
    }

    var renames = body.renames;
    if (renames != null) {
      var rerr = validateRenames(renames);
      if (rerr) {
        return res.status(400).json({ error: rerr });
      }
    } else {
      renames = [];
    }

    if (renames.length) {
      var records = await readGrowthRecords();
      if (records === null) {
        return res.status(503).json({ error: "kv_unavailable" });
      }
      var nextRecords = records.map(function (rec) {
        return applyAreaRenamesToRecord(rec, renames);
      });
      try {
        await writeGrowthRecords(nextRecords);
      } catch (e) {
        console.error("growth write after plant rename", e);
        return res.status(503).json({ error: "kv_write_failed" });
      }
    }

    try {
      await writeCatalogKv({ areas: body.areas });
    } catch (e) {
      console.error("plants kv write", e);
      return res.status(503).json({ error: "kv_write_failed" });
    }

    return res.status(200).json({ ok: true, updatedRecords: renames.length > 0 });
  }

  res.setHeader("Allow", "GET, PUT");
  return res.status(405).json({ error: "method_not_allowed" });
};
