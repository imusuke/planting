"use strict";

/**
 * data/plants.json の各植栽について、data/plant-details.json に
 * 同じ areaId + name のエントリがあるか検査します。
 * 不足があれば一覧して終了コード 1（CI / デプロイ前の点検用）。
 */

var fs = require("fs");
var path = require("path");

var root = path.join(__dirname, "..");
var plantsPath = path.join(root, "data", "plants.json");
var detailsPath = path.join(root, "data", "plant-details.json");

function run() {
  var plants = JSON.parse(fs.readFileSync(plantsPath, "utf8"));
  var det = JSON.parse(fs.readFileSync(detailsPath, "utf8"));
  var entries = det.entries || [];

  var set = new Set();
  entries.forEach(function (e) {
    if (e && e.areaId && e.name) set.add(e.areaId + "\t" + e.name);
  });

  var missing = [];
  (plants.areas || []).forEach(function (a) {
    if (!a || !a.id) return;
    (a.plants || []).forEach(function (name) {
      var key = a.id + "\t" + name;
      if (!set.has(key)) missing.push({ areaId: a.id, label: a.label || a.id, name: name });
    });
  });

  var extra = [];
  entries.forEach(function (e) {
    if (!e || !e.areaId || !e.name) return;
    var found = false;
    (plants.areas || []).forEach(function (a) {
      if (a.id !== e.areaId) return;
      if ((a.plants || []).indexOf(e.name) !== -1) found = true;
    });
    if (!found) extra.push(e.areaId + " / " + e.name);
  });

  var nCatalog = (plants.areas || []).reduce(function (s, a) {
    return s + (a.plants || []).length;
  }, 0);

  console.log(
    "植栽マスタ: " + nCatalog + " 件 / plant-details entries: " + entries.length
  );

  if (missing.length) {
    console.error("\n【詳細未登録】plants.json にあって plant-details.json に無い組み合わせ:");
    missing.forEach(function (m) {
      console.error("  - " + m.areaId + " (" + m.label + ") … " + m.name);
    });
  }

  if (extra.length) {
    console.error("\n【マスタに無い詳細】plant-details にだけあるエントリ（表記ゆれの可能性）:");
    extra.forEach(function (x) {
      console.error("  - " + x);
    });
  }

  if (missing.length || extra.length) {
    console.error(
      "\n修正後は npm run embed:plants で plant.html の埋め込みを更新してください。"
    );
    process.exit(1);
  }

  console.log("plant-details は植栽マスタと一致しています。");
}

module.exports = { run };

if (require.main === module) {
  run();
}
