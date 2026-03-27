"use strict";

/**
 * data/plants.json の内容で、index.html / growth-edit.html / plants.html / plant.html / area.html 内の
 * <script id="plants-embed"> を置き換えます。
 * plant.html には data/plant-details.json から <script id="plant-details-embed"> も同期します。
 * area.html には data/area-details.json から <script id="area-details-embed"> も同期します。
 * file:// や JSON 取得失敗・CDN の古いキャッシュ時も、埋め込みで詳細が表示されます。
 * sync:prod のあと自動実行されます。
 */

var fs = require("fs");
var path = require("path");

var root = path.join(__dirname, "..");
var plantsPath = path.join(root, "data", "plants.json");
var plantDetailsPath = path.join(root, "data", "plant-details.json");
var areaDetailsPath = path.join(root, "data", "area-details.json");
var htmlFiles = [
  "index.html",
  "growth-edit.html",
  "plants.html",
  "plant.html",
  "area.html",
  "area-edit.html",
];

function run() {
  var raw = fs.readFileSync(plantsPath, "utf8");
  var plants = JSON.parse(raw);
  if (!plants || !Array.isArray(plants.areas)) {
    throw new Error("data/plants.json に areas 配列がありません");
  }
  var payload = { areas: plants.areas };
  var jsonStr = JSON.stringify(payload, null, 2);

  htmlFiles.forEach(function (f) {
    var fp = path.join(root, f);
    var html = fs.readFileSync(fp, "utf8");
    var re = /(<script type="application\/json" id="plants-embed">\s*)[\s\S]*?(\s*<\/script>)/;
    if (!re.test(html)) {
      console.warn("plants-embed なし（スキップ）: " + f);
      return;
    }
    html = html.replace(re, function (_, open, close) {
      return open + jsonStr + close;
    });
    fs.writeFileSync(fp, html, "utf8");
    console.log("plants-embed 更新: " + f);
  });

  var detailsRaw = fs.readFileSync(plantDetailsPath, "utf8");
  var details = JSON.parse(detailsRaw);
  if (!details || !Array.isArray(details.entries)) {
    throw new Error("data/plant-details.json に entries 配列がありません");
  }
  var detailsJsonStr = JSON.stringify(details, null, 2);
  var plantHtmlPath = path.join(root, "plant.html");
  var plantHtml = fs.readFileSync(plantHtmlPath, "utf8");
  var reDet =
    /(<script type="application\/json" id="plant-details-embed">\s*)[\s\S]*?(\s*<\/script>)/;
  if (!reDet.test(plantHtml)) {
    throw new Error("plant.html に plant-details-embed がありません（先に空の script を追加してください）");
  }
  plantHtml = plantHtml.replace(reDet, function (_, open, close) {
    return open + detailsJsonStr + close;
  });
  fs.writeFileSync(plantHtmlPath, plantHtml, "utf8");
  console.log("plant-details-embed 更新: plant.html");

  var areaRaw = fs.readFileSync(areaDetailsPath, "utf8");
  var areaDet = JSON.parse(areaRaw);
  if (!areaDet || !Array.isArray(areaDet.entries)) {
    throw new Error("data/area-details.json に entries 配列がありません");
  }
  var areaJsonStr = JSON.stringify(areaDet, null, 2);
  var areaHtmlPath = path.join(root, "area.html");
  var areaHtml = fs.readFileSync(areaHtmlPath, "utf8");
  var reArea = /(<script type="application\/json" id="area-details-embed">\s*)[\s\S]*?(\s*<\/script>)/;
  if (!reArea.test(areaHtml)) {
    throw new Error("area.html に area-details-embed がありません");
  }
  areaHtml = areaHtml.replace(reArea, function (_, open, close) {
    return open + areaJsonStr + close;
  });
  fs.writeFileSync(areaHtmlPath, areaHtml, "utf8");
  console.log("area-details-embed 更新: area.html");
}

module.exports = { run };

if (require.main === module) {
  run();
}
