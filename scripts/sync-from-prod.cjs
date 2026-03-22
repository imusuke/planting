"use strict";

/**
 * 本番（デプロイ先）の公開 GET API から植栽マスタと成長記録を取り込み、
 * data/plants.json と data/growth-snapshot.json を更新します（トークン不要）。
 *
 *   npm run sync:prod -- https://your-planting.vercel.app
 *
 * 環境変数 PLANTING_BASE_URL または GROWTH_SNAPSHOT_URL にベース URL を入れて
 * npm run sync:prod だけでも可。
 *
 * オプション:
 *   --plants-only … data/plants.json のみ
 *   --growth-only … data/growth-snapshot.json のみ
 */

var fs = require("fs");
var path = require("path");

var args = process.argv.slice(2);
var growthOnlyFlag = args.indexOf("--growth-only") >= 0;
var plantsOnlyFlag = args.indexOf("--plants-only") >= 0;
var urlArgs = args.filter(function (a) {
  return a !== "--growth-only" && a !== "--plants-only";
});

var base = (
  process.env.PLANTING_BASE_URL ||
  process.env.GROWTH_SNAPSHOT_URL ||
  urlArgs[0] ||
  ""
).replace(/\/+$/, "");

if (!base) {
  console.error(
    "本番のベース URL を指定してください（末尾の / は不要）。例:\n" +
      "  npm run sync:prod -- https://your-site.vercel.app\n" +
      "  または PLANTING_BASE_URL / GROWTH_SNAPSHOT_URL を設定して npm run sync:prod\n" +
      "\n" +
      "  植栽マスタのみ: npm run sync:plants -- <URL>\n" +
      "  成長記録のみ: npm run sync:growth -- <URL>"
  );
  process.exit(1);
}

var doGrowth = growthOnlyFlag || !plantsOnlyFlag;
var doPlants = plantsOnlyFlag || !growthOnlyFlag;

var root = path.join(__dirname, "..");
var plantsPath = path.join(root, "data", "plants.json");
var growthPath = path.join(root, "data", "growth-snapshot.json");

function syncPlants() {
  var url = base + "/api/plants";
  return fetch(url)
    .then(function (res) {
      if (!res.ok) {
        throw new Error("GET /api/plants HTTP " + res.status);
      }
      return res.json();
    })
    .then(function (data) {
      if (!data || !Array.isArray(data.areas)) {
        throw new Error("GET /api/plants: 応答に areas がありません");
      }
      var out = { areas: data.areas };
      fs.writeFileSync(plantsPath, JSON.stringify(out, null, 2), "utf8");
      console.log("書き出しました: " + plantsPath);
      console.log("エリア数: " + data.areas.length);
    });
}

function syncGrowth() {
  var url = base + "/api/growth";
  return fetch(url)
    .then(function (res) {
      if (!res.ok) {
        throw new Error("GET /api/growth HTTP " + res.status);
      }
      return res.json();
    })
    .then(function (data) {
      var records = data && Array.isArray(data.records) ? data.records : [];
      var payload = {
        version: 2,
        source: "snapshot",
        exportedAt: new Date().toISOString(),
        records: records,
      };
      fs.writeFileSync(growthPath, JSON.stringify(payload, null, 2), "utf8");
      console.log("書き出しました: " + growthPath);
      console.log("記録件数: " + records.length);
    });
}

var chain = Promise.resolve();
if (doPlants) {
  chain = chain.then(function () {
    return syncPlants();
  });
}
if (doGrowth) {
  chain = chain.then(function () {
    return syncGrowth();
  });
}

chain
  .then(function () {
    console.log(
      "\n次: git add data/plants.json data/growth-snapshot.json && git commit && git push"
    );
    console.log("（どちらか一方だけ更新した場合は add するファイルを減らしてください）");
  })
  .catch(function (err) {
    console.error(err.message || String(err));
    process.exit(1);
  });
