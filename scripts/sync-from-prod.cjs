"use strict";

/**
 * 本番（デプロイ先）の公開 GET API から植栽マスタと成長記録を取り込み、
 * data/plants.json と data/growth-snapshot.json と data/area-growth-snapshot.json を更新します（トークン不要）。
 *
 * ただし公開サイト全体に Basic 認証が掛かっていて API が 401 になる場合、
 * ローカルにある KV / Blob 資格情報（.env.local / .vercel/.env.production.local など）から
 * 直接スナップショットを再生成します。
 *
 *   npm run sync:prod -- https://your-planting.vercel.app
 *
 * 環境変数 PLANTING_BASE_URL または GROWTH_SNAPSHOT_URL にベース URL を入れて
 * npm run sync:prod だけでも可。ベース URL が無くても、KV / Blob 認証情報があれば直接同期します。
 *
 * オプション:
 *   --plants-only … data/plants.json のみ（あわせて HTML 内 plants-embed も更新）
 *   --growth-only … data/growth-snapshot.json と data/area-growth-snapshot.json のみ
 *   --no-images … 成長記録 JSON のみ（写真は data/growth-images / data/area-growth-images に落とさない）
 */

var fs = require("fs");
var path = require("path");
var undici = require("undici");
var kv = require("@vercel/kv").kv;

var KV_GROWTH = "planting_growth_records_v1";
var KV_AREA_GROWTH = "planting_area_growth_records_v1";
var KV_PLANTS = "planting_plants_catalog_v1";
var defaultCatalog = require("../data/plants.json");

/** 企業プロキシ等で証明書エラーになるときのみ 1（README 参照。画像取得と同じフラグ） */
var insecureTls = process.env.PLANTING_SYNC_INSECURE_TLS === "1";
var insecureDispatcher = insecureTls
  ? new undici.Agent({ connect: { rejectUnauthorized: false } })
  : null;

function basicAuthHeaderValue() {
  var user =
    process.env.PLANTING_BASIC_AUTH_USER ||
    process.env.SITE_BASIC_AUTH_USER ||
    process.env.BASIC_AUTH_USER ||
    "";
  var password =
    process.env.PLANTING_BASIC_AUTH_PASSWORD ||
    process.env.SITE_BASIC_AUTH_PASSWORD ||
    process.env.BASIC_AUTH_PASSWORD ||
    "";
  if (!user && !password) return "";
  if (!user || !password) {
    throw new Error(
      "Basic 認証付きサイトを同期する場合は PLANTING_BASIC_AUTH_USER と PLANTING_BASIC_AUTH_PASSWORD を両方設定してください"
    );
  }
  return "Basic " + Buffer.from(user + ":" + password, "utf8").toString("base64");
}

var basicAuthHeader = basicAuthHeaderValue();

function syncFetch(url) {
  var options = {};
  if (basicAuthHeader) {
    options.headers = {
      Authorization: basicAuthHeader,
    };
  }
  if (insecureDispatcher) {
    options.dispatcher = insecureDispatcher;
  }
  return fetch(url, options);
}

function storageReadable() {
  return !!(
    process.env.KV_REST_API_URL &&
    (process.env.KV_REST_API_TOKEN || process.env.KV_REST_API_READ_ONLY_TOKEN)
  );
}

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

function parseKvDoc(raw) {
  if (raw == null || raw === "") return null;
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

function cleanRecords(records) {
  return records.map(function (r) {
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
}

var args = process.argv.slice(2);
var growthOnlyFlag = args.indexOf("--growth-only") >= 0;
var plantsOnlyFlag = args.indexOf("--plants-only") >= 0;
var noImagesFlag = args.indexOf("--no-images") >= 0;
var urlArgs = args.filter(function (a) {
  return a !== "--growth-only" && a !== "--plants-only" && a !== "--no-images";
});

var base = (
  process.env.PLANTING_BASE_URL ||
  process.env.GROWTH_SNAPSHOT_URL ||
  urlArgs[0] ||
  ""
).replace(/\/+$/, "");

if (!base && !storageReadable()) {
  console.error(
    "本番のベース URL を指定してください（末尾の / は不要）。例:\n" +
      "  npm run sync:prod -- https://your-site.vercel.app\n" +
      "  または PLANTING_BASE_URL / GROWTH_SNAPSHOT_URL を設定して npm run sync:prod\n" +
      "\n" +
      "  植栽マスタのみ: npm run sync:plants -- <URL>\n" +
      "  成長記録のみ: npm run sync:growth -- <URL>\n" +
      "\n" +
      "  もしくは .env.local / .vercel/.env.production.local などに KV / Blob 資格情報を用意してください。"
  );
  process.exit(1);
}

var doGrowth = growthOnlyFlag || !plantsOnlyFlag;
var doPlants = plantsOnlyFlag || !growthOnlyFlag;

var root = path.join(__dirname, "..");
var plantsPath = path.join(root, "data", "plants.json");
var growthPath = path.join(root, "data", "growth-snapshot.json");
var areaGrowthPath = path.join(root, "data", "area-growth-snapshot.json");
var downloadImages = require("./download-growth-snapshot-images.cjs").downloadSnapshotImages;
var downloadAreaImages = require("./download-area-growth-snapshot-images.cjs").downloadSnapshotImages;

function writePlantsData(areas, sourceLabel) {
  if (!Array.isArray(areas)) {
    throw new Error(sourceLabel + ": 応答に areas がありません");
  }
  var out = { areas: areas };
  fs.writeFileSync(plantsPath, JSON.stringify(out, null, 2), "utf8");
  console.log("書き出しました: " + plantsPath);
  console.log("エリア数: " + areas.length);
  require("./update-plants-embed.cjs").run();
}

function writeGrowthPayload(finalRecords, sourceLabel) {
  var payload = {
    version: 2,
    source: sourceLabel,
    exportedAt: new Date().toISOString(),
    records: finalRecords,
  };
  fs.writeFileSync(growthPath, JSON.stringify(payload, null, 2), "utf8");
  console.log("書き出しました: " + growthPath);
  console.log("記録件数: " + finalRecords.length);
}

function writeAreaGrowthPayload(finalRecords, sourceLabel) {
  var payload = {
    version: 2,
    source: sourceLabel,
    exportedAt: new Date().toISOString(),
    records: finalRecords,
  };
  fs.writeFileSync(areaGrowthPath, JSON.stringify(payload, null, 2), "utf8");
  console.log("書き出しました: " + areaGrowthPath);
  console.log("エリア記録件数: " + finalRecords.length);
}

function syncPlantsFromStorage() {
  if (!storageReadable()) {
    throw new Error("ローカルの KV 読み取り資格情報がありません");
  }
  return kv.get(KV_PLANTS).then(function (raw) {
    var data = parseKvDoc(raw);
    var areas = data && Array.isArray(data.areas) ? data.areas : defaultCatalog.areas;
    areas = mergeMissingAreasFromDefault(areas, defaultCatalog.areas);
    writePlantsData(areas, "KV");
  });
}

function syncGrowthFromStorage() {
  if (!storageReadable()) {
    throw new Error("ローカルの KV 読み取り資格情報がありません");
  }
  return kv.get(KV_GROWTH).then(function (raw) {
    var records = parseKvDoc(raw);
    if (!Array.isArray(records)) records = [];
    var cleaned = cleanRecords(records);
    if (noImagesFlag) {
      writeGrowthPayload(cleaned, "storage-direct");
      require("./write-growth-snapshot-boot.cjs").run();
      return;
    }
    console.log("写真を data/growth-images に取得中…");
    return downloadImages("", cleaned).then(function (withImages) {
      writeGrowthPayload(withImages, "storage-direct");
      require("./write-growth-snapshot-boot.cjs").run();
    });
  });
}

function syncAreaGrowthFromStorage() {
  if (!storageReadable()) {
    throw new Error("ローカルの KV 読み取り資格情報がありません");
  }
  return kv.get(KV_AREA_GROWTH).then(function (raw) {
    var records = parseKvDoc(raw);
    if (!Array.isArray(records)) records = [];
    var cleaned = cleanRecords(records);
    if (noImagesFlag) {
      writeAreaGrowthPayload(cleaned, "storage-direct");
      require("./write-area-growth-snapshot-boot.cjs").run();
      return;
    }
    console.log("エリア写真を data/area-growth-images に取得中…");
    return downloadAreaImages("", cleaned).then(function (withImages) {
      writeAreaGrowthPayload(withImages, "storage-direct");
      require("./write-area-growth-snapshot-boot.cjs").run();
    });
  });
}

function syncPlants() {
  if (!base) {
    console.warn("ベース URL 未指定のため、植栽マスタは KV から直接同期します。");
    return syncPlantsFromStorage();
  }
  var url = base + "/api/plants";
  return syncFetch(url)
    .then(function (res) {
      if (!res.ok) {
        throw new Error("GET /api/plants HTTP " + res.status);
      }
      return res.json();
    })
    .then(function (data) {
      writePlantsData(data && data.areas, url);
    })
    .catch(function (err) {
      if (storageReadable() && String(err && err.message || "").indexOf("HTTP 401") !== -1) {
        console.warn("GET /api/plants が 401 のため、KV から直接同期します。");
        return syncPlantsFromStorage();
      }
      throw err;
    });
}

function syncGrowth() {
  if (!base) {
    console.warn("ベース URL 未指定のため、成長記録は KV / Blob から直接同期します。");
    return syncGrowthFromStorage();
  }
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
      var cleaned = cleanRecords(records);
      if (noImagesFlag) {
        writeGrowthPayload(cleaned, url);
        require("./write-growth-snapshot-boot.cjs").run();
        return;
      }
      console.log("写真を data/growth-images に取得中…");
      return downloadImages(base, cleaned).then(function (withImages) {
        writeGrowthPayload(withImages, url);
        require("./write-growth-snapshot-boot.cjs").run();
      });
    })
    .catch(function (err) {
      if (storageReadable() && String(err && err.message || "").indexOf("HTTP 401") !== -1) {
        console.warn("GET /api/growth が 401 のため、KV / Blob から直接同期します。");
        return syncGrowthFromStorage();
      }
      throw err;
    });
}

function syncAreaGrowth() {
  if (!base) {
    console.warn("ベース URL 未指定のため、エリア記録は KV / Blob から直接同期します。");
    return syncAreaGrowthFromStorage();
  }
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
      var cleaned = cleanRecords(records);
      if (noImagesFlag) {
        writeAreaGrowthPayload(cleaned, url);
        require("./write-area-growth-snapshot-boot.cjs").run();
        return;
      }
      console.log("エリア写真を data/area-growth-images に取得中…");
      return downloadAreaImages(base, cleaned).then(function (withImages) {
        writeAreaGrowthPayload(withImages, url);
        require("./write-area-growth-snapshot-boot.cjs").run();
      });
    })
    .catch(function (err) {
      if (storageReadable() && String(err && err.message || "").indexOf("HTTP 401") !== -1) {
        console.warn("GET /api/area-growth が 401 のため、KV / Blob から直接同期します。");
        return syncAreaGrowthFromStorage();
      }
      throw err;
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
      "\n次: git add data/plants.json data/growth-snapshot.json data/growth-snapshot.boot.js data/growth-images data/area-growth-snapshot.json data/area-growth-snapshot.boot.js data/area-growth-images index.html growth-edit.html plants.html plant.html plant-detail.html plant-edit.html area.html areas.html area-edit.html && git commit && git push"
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
          (base || "https://…") +
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
