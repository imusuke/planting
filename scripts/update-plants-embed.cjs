"use strict";

/**
 * data/plants.json の内容で、index.html / growth-edit.html / plants.html 内の
 * <script id="plants-embed"> を置き換えます。
 * file:// や plants.json 取得失敗時のフォールバックと中身を揃えるため、
 * sync:prod のあと自動実行されます。
 */

var fs = require("fs");
var path = require("path");

var root = path.join(__dirname, "..");
var plantsPath = path.join(root, "data", "plants.json");
var htmlFiles = [
  "index.html",
  "growth-edit.html",
  "plants.html",
  "plant.html",
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
}

module.exports = { run };

if (require.main === module) {
  run();
}
