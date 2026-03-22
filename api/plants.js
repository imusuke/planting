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

function isValidAreaId(id) {
  return typeof id === "string" && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(id);
}

function validateUniqueAreaIds(areas) {
  var seen = {};
  for (var i = 0; i < areas.length; i++) {
    var id = areas[i].id;
    if (seen[id]) return "duplicate_area_id";
    seen[id] = true;
  }
  return null;
}

function validateAreas(areas) {
  if (!Array.isArray(areas)) return "areas_not_array";
  if (areas.length === 0) return "areas_empty";
  for (var i = 0; i < areas.length; i++) {
    var a = areas[i];
    if (!a || typeof a.id !== "string" || !a.id.trim()) return "bad_area_id";
    if (!isValidAreaId(a.id.trim())) return "bad_area_id_format";
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

function validateAreaIdMigrations(migrations, areas) {
  if (!Array.isArray(migrations)) return "area_migrations_not_array";
  var toIds = {};
  for (var a = 0; a < areas.length; a++) {
    toIds[areas[a].id] = true;
  }
  var fromSeen = {};
  for (var i = 0; i < migrations.length; i++) {
    var m = migrations[i];
    if (!m || typeof m.from !== "string" || !m.from.trim()) return "bad_migration_from";
    if (typeof m.to !== "string" || !m.to.trim()) return "bad_migration_to";
    var mf = m.from.trim();
    var mt = m.to.trim();
    if (mf === mt) return "bad_migration_same";
    if (!isValidAreaId(mf) || !isValidAreaId(mt)) return "bad_migration_id_format";
    if (fromSeen[mf]) return "duplicate_migration_from";
    fromSeen[mf] = true;
    if (!toIds[mt]) return "migration_target_missing";
  }
  return null;
}

function applyAreaIdMigrations(records, migrations, labelById) {
  var map = {};
  for (var i = 0; i < migrations.length; i++) {
    map[migrations[i].from.trim()] = migrations[i].to.trim();
  }
  function resolve(id) {
    var steps = 0;
    var cur = id;
    while (map[cur] && steps < 100) {
      cur = map[cur];
      steps++;
    }
    return cur;
  }
  return records.map(function (rec) {
    var nid = resolve(rec.areaId);
    if (nid === rec.areaId) return rec;
    var lab = labelById[nid];
    return Object.assign({}, rec, {
      areaId: nid,
      areaLabel: lab != null ? lab : rec.areaLabel,
    });
  });
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

/**
 * KV に保存済みのマスタより後から plants.json に追加したエリアを Web に出すため、
 * 既定リストにあって KV に無い id だけを末尾に追記する（既存 KV の順序・編集は維持）。
 */
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
 * 同一エリア id について、plants.json（既定）にあって KV の配列に無い植栽名だけを末尾に追記する。
 * KV 側の順序・一覧を優先し、git で追加したマスタだけ Web に反映させる（mergeMissingAreasFromDefault と同趣旨）。
 */
function mergeMissingPlantsFromDefault(areas, defaultAreas) {
  if (!Array.isArray(areas) || !areas.length) return areas;
  if (!Array.isArray(defaultAreas) || !defaultAreas.length) return areas;
  var defById = {};
  for (var d = 0; d < defaultAreas.length; d++) {
    var da = defaultAreas[d];
    if (da && da.id) defById[da.id] = da;
  }
  return areas.map(function (a) {
    if (!a || !a.id) return a;
    var def = defById[a.id];
    if (!def || !Array.isArray(def.plants) || !def.plants.length) return a;
    var kvPlants = Array.isArray(a.plants) ? a.plants.slice() : [];
    var seen = {};
    for (var i = 0; i < kvPlants.length; i++) {
      seen[kvPlants[i]] = true;
    }
    var next = kvPlants.slice();
    var appended = false;
    for (var j = 0; j < def.plants.length; j++) {
      var p = def.plants[j];
      if (!p || seen[p]) continue;
      seen[p] = true;
      next.push(p);
      appended = true;
    }
    if (!appended) return a;
    return Object.assign({}, a, { plants: next });
  });
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
    var areas = hasKv
      ? mergeMissingAreasFromDefault(fromKv.areas, defaultCatalog.areas)
      : defaultCatalog.areas;
    if (hasKv) {
      areas = mergeMissingPlantsFromDefault(areas, defaultCatalog.areas);
    }
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

    var uerr = validateUniqueAreaIds(body.areas);
    if (uerr) {
      return res.status(400).json({ error: uerr });
    }

    var areaIdMigrations = body.areaIdMigrations;
    if (areaIdMigrations != null) {
      var merr = validateAreaIdMigrations(areaIdMigrations, body.areas);
      if (merr) {
        return res.status(400).json({ error: merr });
      }
    } else {
      areaIdMigrations = [];
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

    var needGrowthWrite = renames.length > 0 || areaIdMigrations.length > 0;
    if (needGrowthWrite) {
      var records = await readGrowthRecords();
      if (records === null) {
        return res.status(503).json({ error: "kv_unavailable" });
      }
      var labelById = {};
      for (var li = 0; li < body.areas.length; li++) {
        var ar = body.areas[li];
        labelById[ar.id] = ar.label;
      }
      var nextRecords = records;
      if (areaIdMigrations.length) {
        nextRecords = applyAreaIdMigrations(nextRecords, areaIdMigrations, labelById);
      }
      if (renames.length) {
        nextRecords = nextRecords.map(function (rec) {
          return applyAreaRenamesToRecord(rec, renames);
        });
      }
      try {
        await writeGrowthRecords(nextRecords);
      } catch (e) {
        console.error("growth write after catalog save", e);
        return res.status(503).json({ error: "kv_write_failed" });
      }
    }

    try {
      await writeCatalogKv({ areas: body.areas });
    } catch (e) {
      console.error("plants kv write", e);
      return res.status(503).json({ error: "kv_write_failed" });
    }

    return res.status(200).json({
      ok: true,
      updatedRecords: needGrowthWrite,
    });
  }

  res.setHeader("Allow", "GET, PUT");
  return res.status(405).json({ error: "method_not_allowed" });
};
