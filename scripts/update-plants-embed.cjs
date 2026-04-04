"use strict";

/**
 * data/plants.json / data/plant-details.json / data/area-details.json の内容で、
 * 各 HTML に埋め込まれた JSON フォールバックをまとめて更新します。
 * file:// や JSON 取得失敗・CDN の古いキャッシュ時も、埋め込みで詳細が表示されます。
 * sync:prod のあと自動実行されます。
 */

var fs = require("fs");
var path = require("path");

var root = path.join(__dirname, "..");
var plantsPath = path.join(root, "data", "plants.json");
var plantDetailsPath = path.join(root, "data", "plant-details.json");
var areaDetailsPath = path.join(root, "data", "area-details.json");
var htmlFiles = fs.readdirSync(root).filter(function (name) {
  return name.slice(-5) === ".html";
});

function replaceJsonScript(html, id, jsonStr) {
  var re = new RegExp(
    '(<script type="application/json" id="' + id + '">\\s*)[\\s\\S]*?(\\s*<\\/script>)'
  );
  if (!re.test(html)) {
    return { changed: false, html: html };
  }
  return {
    changed: true,
    html: html.replace(re, function (_, open, close) {
      return open + jsonStr + close;
    }),
  };
}

function updateEmbedAcrossHtmlFiles(id, jsonStr, label) {
  htmlFiles.forEach(function (f) {
    var fp = path.join(root, f);
    var html = fs.readFileSync(fp, "utf8");
    var result = replaceJsonScript(html, id, jsonStr);
    if (!result.changed) return;
    fs.writeFileSync(fp, result.html, "utf8");
    console.log(label + " 更新: " + f);
  });
}

function run() {
  var raw = fs.readFileSync(plantsPath, "utf8");
  var plants = JSON.parse(raw);
  if (!plants || !Array.isArray(plants.areas)) {
    throw new Error("data/plants.json に areas 配列がありません");
  }
  var payload = { areas: plants.areas };
  var jsonStr = JSON.stringify(payload, null, 2);
  updateEmbedAcrossHtmlFiles("plants-embed", jsonStr, "plants-embed");

  var detailsRaw = fs.readFileSync(plantDetailsPath, "utf8");
  var details = JSON.parse(detailsRaw);
  if (!details || !Array.isArray(details.entries)) {
    throw new Error("data/plant-details.json に entries 配列がありません");
  }
  var detailsJsonStr = JSON.stringify(details, null, 2);
  updateEmbedAcrossHtmlFiles("plant-details-embed", detailsJsonStr, "plant-details-embed");

  var areaRaw = fs.readFileSync(areaDetailsPath, "utf8");
  var areaDet = JSON.parse(areaRaw);
  if (!areaDet || !Array.isArray(areaDet.entries)) {
    throw new Error("data/area-details.json に entries 配列がありません");
  }
  var areaJsonStr = JSON.stringify(areaDet, null, 2);
  updateEmbedAcrossHtmlFiles("area-details-embed", areaJsonStr, "area-details-embed");
}

module.exports = { run };

if (require.main === module) {
  run();
}
