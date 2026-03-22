"use strict";

/**
 * data/growth-snapshot.json から data/growth-snapshot.boot.js を生成します。
 * file:// で index.html を開いたとき、fetch が JSON を読めないブラウザ向けに、
 * 先に実行される script で window.__PLANTING_GROWTH_SNAPSHOT__ を渡します。
 */

var fs = require("fs");
var path = require("path");

var root = path.join(__dirname, "..");
var jsonPath = path.join(root, "data", "growth-snapshot.json");
var bootPath = path.join(root, "data", "growth-snapshot.boot.js");

function run() {
  var raw = fs.readFileSync(jsonPath, "utf8");
  JSON.parse(raw);
  var out =
    "window.__PLANTING_GROWTH_SNAPSHOT__ = " +
    raw.trim() +
    ";\n";
  fs.writeFileSync(bootPath, out, "utf8");
  console.log("書き出しました: " + bootPath);
}

module.exports = { run };

if (require.main === module) {
  run();
}
