"use strict";

/**
 * 成長記録スナップショット用に、本番と同じく閲覧可能な URL から写真を取得して
 * data/area-growth-images/{記録id}.jpg に保存し、各レコードに localSnapshotImage を付けます。
 *
 * private Blob 付きの記録は /api/growth-image?pathname=… 経由で取得します（GET・トークン不要）。
 */

var fs = require("fs");
var path = require("path");
var http = require("http");
var https = require("https");

var REL_PREFIX = "./data/area-growth-images/";
/** 企業プロキシ等で証明書エラーになるときのみ 1（開発・同期専用。普段は使わないでください） */
var insecureTls = process.env.PLANTING_SYNC_INSECURE_TLS === "1";

function httpGetBuffer(urlString, redirectsLeft) {
  if (redirectsLeft == null) redirectsLeft = 5;
  return new Promise(function (resolve, reject) {
    var u;
    try {
      u = new URL(urlString);
    } catch (e) {
      reject(new Error("bad url"));
      return;
    }
    var lib = u.protocol === "https:" ? https : http;
    var opt = {
      hostname: u.hostname,
      port: u.port || (u.protocol === "https:" ? 443 : 80),
      path: u.pathname + u.search,
      method: "GET",
      headers: {
        Accept: "image/*,*/*",
        "User-Agent": "planting-sync/1",
      },
    };
    if (u.protocol === "https:" && insecureTls) {
      opt.rejectUnauthorized = false;
    }
    var req = lib.request(
      opt,
      function (res) {
        if (
          (res.statusCode === 301 || res.statusCode === 302) &&
          res.headers.location &&
          redirectsLeft > 0
        ) {
          var next = res.headers.location;
          if (next.indexOf("http") !== 0) {
            next = new URL(next, urlString).href;
          }
          res.resume();
          httpGetBuffer(next, redirectsLeft - 1).then(resolve).catch(reject);
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error("HTTP " + res.statusCode));
          return;
        }
        var chunks = [];
        res.on("data", function (c) {
          chunks.push(c);
        });
        res.on("end", function () {
          resolve(Buffer.concat(chunks));
        });
        res.on("error", reject);
      }
    );
    req.on("error", reject);
    req.end();
  });
}

function imageUrlForSlot(baseUrl, slot) {
  if (!slot || typeof slot !== "object") return null;
  if (slot.imagePathname && String(slot.imagePathname).trim()) {
    return (
      baseUrl.replace(/\/+$/, "") +
      "/api/growth-image?pathname=" +
      encodeURIComponent(slot.imagePathname)
    );
  }
  if (slot.imageUrl && String(slot.imageUrl).trim()) {
    return String(slot.imageUrl).trim();
  }
  return null;
}

function imageUrlForRecord(baseUrl, rec) {
  return imageUrlForSlot(baseUrl, rec);
}

function safeImageFileName(id) {
  if (!id || typeof id !== "string") return null;
  var t = id.trim();
  if (/^[a-f0-9-]{36}$/i.test(t)) return t + ".jpg";
  var s = t.replace(/[^a-zA-Z0-9_.-]/g, "_");
  if (!s || s.length > 128) return null;
  return s + ".jpg";
}

function safeImageFileNameIndexed(id, index) {
  var base = safeImageFileName(id);
  if (!base) return null;
  var dot = base.lastIndexOf(".");
  var stem = dot >= 0 ? base.slice(0, dot) : base;
  var ext = dot >= 0 ? base.slice(dot) : ".jpg";
  return stem + "-" + index + ext;
}

function snapshotSlotsForRecord(rec) {
  if (rec.images && Array.isArray(rec.images) && rec.images.length) {
    return rec.images.slice();
  }
  if (rec.imagePathname || rec.imageUrl) {
    return [
      {
        imagePathname: rec.imagePathname,
        imageUrl: rec.imageUrl,
      },
    ];
  }
  return [];
}

/**
 * @param {string} baseUrl 本番ベース URL（例 https://xxx.vercel.app）
 * @param {object[]} records API 形の記録配列（localSnapshotImage は無視して上書き）
 * @returns {Promise<object[]>}
 */
function downloadSnapshotImages(baseUrl, records) {
  var root = path.join(__dirname, "..");
  var imgDir = path.join(root, "data", "area-growth-images");
  if (!fs.existsSync(imgDir)) {
    fs.mkdirSync(imgDir, { recursive: true });
  }

  var existing = fs.existsSync(imgDir) ? fs.readdirSync(imgDir) : [];
  for (var e = 0; e < existing.length; e++) {
    var fn = existing[e];
    if (fn === ".gitkeep") continue;
    if (/\.jpe?g$/i.test(fn)) {
      try {
        fs.unlinkSync(path.join(imgDir, fn));
      } catch (err) {
        console.warn("削除スキップ: " + fn, err.message);
      }
    }
  }

  var base = baseUrl.replace(/\/+$/, "");
  var out = [];
  var i = 0;

  function next() {
    if (i >= records.length) return Promise.resolve();
    var rec = records[i];
    i++;
    var id = rec.id;
    var copy = Object.assign({}, rec);
    delete copy.localSnapshotImage;

    var slots = snapshotSlotsForRecord(rec);
    if (!slots.length) {
      out.push(copy);
      return next();
    }

    var newImages = [];
    var si = 0;

    function afterSlots() {
      if (newImages.length) {
        copy.images = newImages;
        if (newImages[0] && newImages[0].localSnapshotImage) {
          copy.localSnapshotImage = newImages[0].localSnapshotImage;
        }
      }
      out.push(copy);
      return next();
    }

    function nextSlot() {
      if (si >= slots.length) {
        return Promise.resolve().then(afterSlots);
      }
      var slot = Object.assign({}, slots[si]);
      var idx = si;
      si++;
      var src = imageUrlForSlot(base, slot);
      var fileName = safeImageFileNameIndexed(id, idx);
      if (!src || !fileName) {
        newImages.push(slot);
        return nextSlot();
      }

      return httpGetBuffer(src)
        .then(function (buf) {
          if (!buf || buf.length < 100) {
            throw new Error("empty or tiny body");
          }
          var dest = path.join(imgDir, fileName);
          fs.writeFileSync(dest, buf);
          slot.localSnapshotImage = REL_PREFIX + fileName;
          console.log("画像: " + fileName + " (" + buf.length + " bytes)");
          newImages.push(slot);
          return nextSlot();
        })
        .catch(function (err) {
          console.warn("画像スキップ " + id + "[" + idx + "]: " + (err.message || err));
          newImages.push(slot);
          return nextSlot();
        });
    }

    return nextSlot();
  }

  return next().then(function () {
    return out;
  });
}

module.exports = { downloadSnapshotImages, REL_PREFIX };

if (require.main === module) {
  var args = process.argv.slice(2).filter(function (a) {
    return a !== "--no-images";
  });
  var base = (
    process.env.PLANTING_BASE_URL ||
    process.env.GROWTH_SNAPSHOT_URL ||
    args[0] ||
    ""
  ).replace(/\/+$/, "");
  if (!base) {
    console.error(
      "使い方: node scripts/download-growth-snapshot-images.cjs https://your-site.vercel.app\n" +
        "（既存の data/area-growth-snapshot.json の各記録について画像を取り込み、JSON を更新します）"
    );
    process.exit(1);
  }
  var areaGrowthPath = path.join(__dirname, "..", "data", "area-growth-snapshot.json");
  var raw = JSON.parse(fs.readFileSync(areaGrowthPath, "utf8"));
  var records = raw.records || [];
  downloadSnapshotImages(base, records).then(function (updated) {
    raw.records = updated;
    raw.exportedAt = new Date().toISOString();
    fs.writeFileSync(areaGrowthPath, JSON.stringify(raw, null, 2), "utf8");
    console.log("更新しました: " + areaGrowthPath);
    require("./write-area-growth-snapshot-boot.cjs").run();
  });
}
