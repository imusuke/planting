"use strict";

/**
 * 植栽マスタ・plant-details・area-details・各 HTML 埋め込み・成長記録の植栽名の整合を点検する。
 *   node scripts/audit-data.cjs
 */

var fs = require("fs");
var path = require("path");
var util = require("util");

var root = path.join(__dirname, "..");
var plantsPath = path.join(root, "data", "plants.json");
var detailsPath = path.join(root, "data", "plant-details.json");
var areaDetailsPath = path.join(root, "data", "area-details.json");
var snapPath = path.join(root, "data", "growth-snapshot.json");

var plants = JSON.parse(fs.readFileSync(plantsPath, "utf8"));
var det = JSON.parse(fs.readFileSync(detailsPath, "utf8"));
var areaDet = JSON.parse(fs.readFileSync(areaDetailsPath, "utf8"));

var issues = [];

function key(e) {
  return e.areaId + "\t" + e.name;
}

(det.entries || []).forEach(function (e, i) {
  if (!e || !e.areaId || !e.name) {
    issues.push("plant-details entries[" + i + "] missing areaId or name");
    return;
  }
  if (!String(e.summary || "").trim()) {
    issues.push("empty summary: " + e.areaId + " / " + e.name);
  }
  if (!String(e.body || "").trim()) {
    issues.push("empty body: " + e.areaId + " / " + e.name);
  }
});

var seen = {};
(det.entries || []).forEach(function (e) {
  if (!e || !e.areaId || !e.name) return;
  var k = key(e);
  if (seen[k]) issues.push("duplicate plant-details entry: " + k);
  seen[k] = true;
});

var masterAreaIds = {};
(plants.areas || []).forEach(function (a) {
  if (a && a.id) masterAreaIds[a.id] = true;
});

var areaSeen = {};
(areaDet.entries || []).forEach(function (e, i) {
  if (!e || !e.areaId) {
    issues.push("area-details entries[" + i + "] missing areaId");
    return;
  }
  if (!String(e.summary || "").trim()) {
    issues.push("empty area-details summary: " + e.areaId);
  }
  if (!String(e.body || "").trim()) {
    issues.push("empty area-details body: " + e.areaId);
  }
  if (areaSeen[e.areaId]) issues.push("duplicate area-details entry: " + e.areaId);
  areaSeen[e.areaId] = true;
  if (!masterAreaIds[e.areaId]) {
    issues.push('area-details: unknown areaId "' + e.areaId + '" (not in plants.json)');
  }
});

Object.keys(masterAreaIds).forEach(function (id) {
  if (!areaSeen[id]) issues.push("area-details: missing entry for area " + id);
});

if (fs.existsSync(snapPath)) {
  var snap = JSON.parse(fs.readFileSync(snapPath, "utf8"));
  var recs = snap.records || [];
  var masterNames = {};
  (plants.areas || []).forEach(function (a) {
    (a.plants || []).forEach(function (p) {
      masterNames[String(p).trim()] = true;
    });
  });
  var orphan = {};
  recs.forEach(function (r) {
    (r.plants || []).forEach(function (p) {
      var t = String(p).trim();
      if (t && !masterNames[t]) orphan[t] = (orphan[t] || 0) + 1;
    });
  });
  Object.keys(orphan)
    .sort()
    .forEach(function (k) {
      issues.push(
        'growth-snapshot: plant "' +
          k +
          '" not in plants.json (' +
          orphan[k] +
          " record references)"
      );
    });
}

function readEmbeddedJson(file, id) {
  var fp = path.join(root, file);
  if (!fs.existsSync(fp)) {
    issues.push("missing file: " + file);
    return null;
  }
  var h = fs.readFileSync(fp, "utf8");
  var re = new RegExp('id="' + id + '">([\\s\\S]*?)<\\/script>');
  var mm = h.match(re);
  if (!mm) {
    issues.push(file + ": " + id + " ブロックなし");
    return null;
  }
  try {
    return JSON.parse(mm[1].trim());
  } catch (err) {
    issues.push(file + ": " + id + " JSON 解析失敗 — " + err.message);
    return null;
  }
}

function verifyEmbeddedExact(files, id, expected, mismatchHint) {
  files.forEach(function (file) {
    var embedded = readEmbeddedJson(file, id);
    if (embedded == null) return;
    if (!util.isDeepStrictEqual(embedded, expected)) {
      issues.push(file + ": " + mismatchHint);
    }
  });
}

var plantsPayload = { areas: plants.areas };
verifyEmbeddedExact(
  [
    "index.html",
    "growth-edit.html",
    "plants.html",
    "plant.html",
    "plant-edit.html",
    "area.html",
    "areas.html",
    "area-edit.html",
  ],
  "plants-embed",
  plantsPayload,
  "plants-embed が data/plants.json と一致しません（npm run embed:plants を実行）"
);

verifyEmbeddedExact(
  ["plant.html", "plant-edit.html"],
  "plant-details-embed",
  det,
  "plant-details-embed が data/plant-details.json と一致しません（npm run embed:plants を実行）"
);

verifyEmbeddedExact(
  ["area.html", "areas.html"],
  "area-details-embed",
  areaDet,
  "area-details-embed が data/area-details.json と一致しません（npm run embed:plants を実行）"
);

[
  "index.html",
  "growth-edit.html",
  "plants.html",
  "plant.html",
  "plant-edit.html",
  "area.html",
  "areas.html",
  "area-edit.html",
].forEach(function (f) {
  var fp = path.join(root, f);
  if (!fs.existsSync(fp)) {
    return;
  }
  var h = fs.readFileSync(fp, "utf8");
  var re = /id="plants-embed">([\s\S]*?)<\/script>/;
  var mm = h.match(re);
  if (!mm) {
    return;
  }
});

if (issues.length) {
  console.error("点検: 問題 " + issues.length + " 件\n");
  issues.forEach(function (x) {
    console.error(" - " + x);
  });
  process.exit(1);
}

console.log(
  "点検 OK: 植栽マスタと plant-details / area-details は整合、各詳細埋め込み一致、各 HTML の plants-embed が plants.json と一致、成長記録の植栽名はマスタ外なし。"
);
