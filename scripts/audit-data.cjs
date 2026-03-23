"use strict";

/**
 * 植栽マスタ・plant-details・plant.html 埋め込み・成長記録の植栽名の整合を点検する。
 *   node scripts/audit-data.cjs
 */

var fs = require("fs");
var path = require("path");
var util = require("util");

var root = path.join(__dirname, "..");
var plantsPath = path.join(root, "data", "plants.json");
var detailsPath = path.join(root, "data", "plant-details.json");
var plantHtmlPath = path.join(root, "plant.html");
var snapPath = path.join(root, "data", "growth-snapshot.json");

var plants = JSON.parse(fs.readFileSync(plantsPath, "utf8"));
var det = JSON.parse(fs.readFileSync(detailsPath, "utf8"));
var html = fs.readFileSync(plantHtmlPath, "utf8");

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

var startMark = 'id="plant-details-embed">';
var start = html.indexOf(startMark);
var end = html.indexOf("</script>", start);
var emb = null;
if (start >= 0 && end > start) {
  var jsonStr = html.slice(start + startMark.length, end).trim();
  try {
    emb = JSON.parse(jsonStr);
  } catch (err) {
    issues.push("plant.html plant-details-embed JSON parse error: " + err.message);
  }
} else {
  issues.push("plant.html: plant-details-embed script block not found");
}

if (emb && Array.isArray(emb.entries)) {
  if (emb.entries.length !== (det.entries || []).length) {
    issues.push(
      "embed entry count " +
        emb.entries.length +
        " != plant-details.json " +
        (det.entries || []).length
    );
  }
  var fset = {};
  (det.entries || []).forEach(function (e) {
    if (e && e.areaId && e.name) fset[key(e)] = true;
  });
  var eset = {};
  emb.entries.forEach(function (e) {
    if (e && e.areaId && e.name) eset[key(e)] = true;
  });
  Object.keys(fset).forEach(function (k) {
    if (!eset[k]) issues.push("embed missing: " + k.replace(/\t/g, " / "));
  });
  Object.keys(eset).forEach(function (k) {
    if (!fset[k]) issues.push("embed has extra: " + k.replace(/\t/g, " / "));
  });
}

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

var plantsPayload = { areas: plants.areas };
["index.html", "growth-edit.html", "plants.html", "plant.html"].forEach(function (f) {
  var fp = path.join(root, f);
  if (!fs.existsSync(fp)) {
    issues.push("missing file: " + f);
    return;
  }
  var h = fs.readFileSync(fp, "utf8");
  var re = /id="plants-embed">([\s\S]*?)<\/script>/;
  var mm = h.match(re);
  if (!mm) {
    issues.push(f + ": plants-embed ブロックなし");
    return;
  }
  var pe;
  try {
    pe = JSON.parse(mm[1].trim());
  } catch (e2) {
    issues.push(f + ": plants-embed JSON 解析失敗 — " + e2.message);
    return;
  }
  if (!util.isDeepStrictEqual(pe, plantsPayload)) {
    issues.push(f + ": plants-embed が data/plants.json と一致しません（npm run embed:plants を実行）");
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
  "点検 OK: 植栽マスタと plant-details は整合、詳細の空欄なし、plant.html の plant-details 埋め込み一致、各 HTML の plants-embed が plants.json と一致、成長記録の植栽名はマスタ外なし。"
);
