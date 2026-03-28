"use strict";

/**
 * 本番（デプロイ先）の公開 GET API から植栽マスタと成長記録を取り込み、
 * data/plants.json と data/growth-snapshot.json と data/area-growth-snapshot.json を更新します（トークン不要）。
 *
 *   npm run sync:prod -- https://your-planting.vercel.app
 *
 * 環境変数 PLANTING_BASE_URL または GROWTH_SNAPSHOT_URL にベース URL を入れて
 * npm run sync:prod だけでも可。
 *
 * オプション:
 *   --plants-only … data/plants.json のみ（あわせて HTML 内 plants-embed も更新）
 *   --growth-only … data/growth-snapshot.json と data/area-growth-snapshot.json のみ
 *   --no-images … 成長記録 JSON のみ（写真は data/growth-images / data/area-growth-images に落とさない）
 */

var fs = require("fs");
var path = require("path");
var undici = require("undici");

/** 企業プロキシ等で証明書エラーになるときのみ 1（README 参照。画像取得と同じフラグ） */
var insecureTls = process.env.PLANTING_SYNC_INSECURE_TLS === "1";
var insecureDispatcher = insecureTls
  ? new undici.Agent({ connect: { rejectUnauthorized: false } })
  : null;

function syncFetch(url) {
  if (insecureDispatcher) {
    return undici.fetch(url, { dispatcher: insecureDispatcher });
  }
  return fetch(url);
}

var args = process.argv.slice(2);
var growthOnlyFlag = args.indexOf("--growth-only") >= 0;
var plantsOnlyFlag = args.indexOf("--plants-only") >= 0;
var noImagesFlag = args.indexOf("--no-images") >= 0;
var urlArgs = args.filter(function (a) {
  return (
    a !== "--growth-only" &&
    a !== "--plants-only" &&
    a !== "--no-images"
  );
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
var areaGrowthPath = path.join(root, "data", "area-growth-snapshot.json");
var downloadImages = require("./download-growth-snapshot-images.cjs")
  .downloadSnapshotImages;
var downloadAreaImages = require("./download-area-growth-snapshot-images.cjs")
  .downloadSnapshotImages;

function syncPlants() {
  var url = base + "/api/plants";
  return syncFetch(url)
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
      require("./update-plants-embed.cjs").run();
    });
}

function syncGrowth() {
  var url = base + "/api/growth";
  return syncFetch(url)
    .then(function (res) {
      if (!res.ok) {
        throw new Error("GET /api/growth HTTP " + res.status);
      }
      return res.json();
    })
    .then(function (data) {
      var records = data && Array.isArray(data.records) ? data.records : [];
      var cleaned = records.map(function (r) {
        var c = Object.assign({}, r);
        delete c.localSnapshotImage;
        if (c.images && Array.isArray(c.images)) {
          c.images = c.images.map(function (im) {
            var x = Object.assign({}, im);
            delete x.localSnapshotImage;
            return x;
          });
        }
        return c;
      });
      var writePayload = function (finalRecords) {
        var payload = {
          version: 2,
          source: "snapshot",
          exportedAt: new Date().toISOString(),
          records: finalRecords,
        };
        fs.writeFileSync(growthPath, JSON.stringify(payload, null, 2), "utf8");
        console.log("書き出しました: " + growthPath);
        console.log("記録件数: " + finalRecords.length);
      };
      if (noImagesFlag) {
        writePayload(cleaned);
        require("./write-growth-snapshot-boot.cjs").run();
        return;
      }
      console.log("写真を data/growth-images に取得中…");
      return downloadImages(base, cleaned).then(function (withImages) {
        writePayload(withImages);
        require("./write-growth-snapshot-boot.cjs").run();
      });
    });
}

function syncAreaGrowth() {
  var url = base + "/api/area-growth";
  return syncFetch(url)
    .then(function (res) {
      if (!res.ok) {
        throw new Error("GET /api/area-growth HTTP " + res.status);
      }
      return res.json();
    })
    .then(function (data) {
      var records = data && Array.isArray(data.records) ? data.records : [];
      var cleaned = records.map(function (r) {
        var c = Object.assign({}, r);
        delete c.localSnapshotImage;
        if (c.images && Array.isArray(c.images)) {
          c.images = c.images.map(function (im) {
            var x = Object.assign({}, im);
            delete x.localSnapshotImage;
            return x;
          });
        }
        return c;
      });
      var writePayload = function (finalRecords) {
        var payload = {
          version: 2,
          exportedAt: new Date().toISOString(),
          source: url,
          records: finalRecords,
        };
        fs.writeFileSync(areaGrowthPath, JSON.stringify(payload, null, 2), "utf8");
        console.log("書き出しました: " + areaGrowthPath);
        console.log("エリア記録件数: " + finalRecords.length);
      };
      if (noImagesFlag) {
        writePayload(cleaned);
        require("./write-area-growth-snapshot-boot.cjs").run();
        return;
      }
      console.log("エリア写真を data/area-growth-images に取得中…");
      return downloadAreaImages(base, cleaned).then(function (withImages) {
        writePayload(withImages);
        require("./write-area-growth-snapshot-boot.cjs").run();
      });
    });
}
var chain = Promise.resolve();
if (doPlants) {
  chain = chain.then(function () {
    return syncPlants();
  });
}
if (doGrowth) {
  chain = chain
    .then(function () {
      return syncGrowth();
    })
    .then(function () {
      return syncAreaGrowth();
    });
}

chain
  .then(function () {
    console.log(
      "\n次: git add data/plants.json data/growth-snapshot.json data/growth-snapshot.boot.js data/growth-images data/area-growth-snapshot.json data/area-growth-snapshot.boot.js data/area-growth-images index.html growth-edit.html plants.html plant.html area.html areas.html && git commit && git push"
    );
    console.log(
      "（plants を同期した場合は plants-embed 入り HTML も add してください。片方だけのときは不要なファイルを外す）"
    );
  })
  .catch(function (err) {
    var msg = err.message || String(err);
    var c = err.cause;
    if (c && c.code === "SELF_SIGNED_CERT_IN_CHAIN") {
      console.error(
        "TLS 証明書エラー（社内プロキシなどで証明書が差し替わっていることがあります）。\n" +
          (c.message || msg) +
          "\n\n同期のみ、検証をスキップする例（PowerShell）:\n" +
          "  $env:PLANTING_SYNC_INSECURE_TLS='1'; npm run sync:prod -- " +
          base +
          "\n\n※ 普段のブラウザ運用ではこの変数を使わないでください。"
      );
    } else {
      console.error(msg);
      if (c && (c.message || c.code)) {
        console.error("原因: " + (c.message || c.code));
      }
    }
    process.exit(1);
  });
