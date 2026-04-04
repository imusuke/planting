"use strict";

/**
 * 成長記録スナップショット用に、本番と同じく閲覧可能な URL から写真を取得して
 * data/growth-images/{記録id}.jpg に保存し、各レコードに localSnapshotImage を付けます。
 *
 * baseUrl がある場合は /api/growth-image?pathname=… を優先し、
 * 無い場合はローカルの Blob トークンから直接取得します。
 */

var fs = require("fs");
var path = require("path");
var http = require("http");
var https = require("https");
var blob = require("@vercel/blob");

var REL_PREFIX = "./data/growth-images/";
/** 企業プロキシ等で証明書エラーになるときのみ 1（開発・同期専用。普段は使わないでください） */
var insecureTls = process.env.PLANTING_SYNC_INSECURE_TLS === "1";
var basicAuthHeader = basicAuthHeaderValue();
var blobToken = process.env.BLOB_READ_WRITE_TOKEN || "";

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
      "Basic 認証付きサイトの写真同期には PLANTING_BASIC_AUTH_USER と PLANTING_BASIC_AUTH_PASSWORD の両方が必要です"
    );
  }
  return "Basic " + Buffer.from(user + ":" + password, "utf8").toString("base64");
}

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
    if (basicAuthHeader) {
      opt.headers.Authorization = basicAuthHeader;
    }
    if (u.protocol === "https:" && insecureTls) {
      opt.rejectUnauthorized = false;
    }
    var req = lib.request(opt, function (res) {
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
    });
    req.on("error", reject);
    req.end();
  });
}

function bufferFromStream(stream) {
  if (stream && typeof stream.on === "function") {
  return new Promise(function (resolve, reject) {
    var chunks = [];
    stream.on("data", function (chunk) {
      chunks.push(chunk);
    });
    stream.on("end", function () {
      resolve(Buffer.concat(chunks));
    });
    stream.on("error", reject);
  });
  }
  if (stream && typeof stream.getReader === "function") {
    return new Promise(function (resolve, reject) {
      var reader = stream.getReader();
      var chunks = [];
      function pump() {
        reader.read().then(function (result) {
          if (result.done) {
            resolve(Buffer.concat(chunks));
            return;
          }
          chunks.push(Buffer.from(result.value));
          pump();
        }, reject);
      }
      pump();
    });
  }
  if (stream && typeof stream[Symbol.asyncIterator] === "function") {
    return (async function () {
      var chunks = [];
      for await (var chunk of stream) {
        chunks.push(Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    })();
  }
  return Promise.reject(new Error("unsupported stream"));
}

function guessBlobAccessFromUrl(url) {
  var u = String(url || "");
  if (u.indexOf(".public.blob.vercel-storage.com") !== -1) return "public";
  return "private";
}

function blobGetBuffer(target, access) {
  if (!blobToken) {
    return Promise.reject(new Error("blob token is missing"));
  }
  return blob
    .get(target, {
      access: access,
      token: blobToken,
      useCache: false,
    })
    .then(function (got) {
      if (!got || got.statusCode !== 200 || !got.stream) {
        throw new Error("blob HTTP " + (got && got.statusCode ? got.statusCode : "unknown"));
      }
      return bufferFromStream(got.stream);
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

function fetchSlotImageBuffer(baseUrl, slot) {
  if (!slot || typeof slot !== "object") {
    return Promise.reject(new Error("missing slot"));
  }

  if (baseUrl) {
    var src = imageUrlForSlot(baseUrl, slot);
    if (!src) return Promise.reject(new Error("missing source url"));
    return httpGetBuffer(src);
  }

  if (slot.imagePathname && String(slot.imagePathname).trim()) {
    return blobGetBuffer(String(slot.imagePathname).trim(), "private");
  }

  if (slot.imageUrl && String(slot.imageUrl).trim()) {
    var url = String(slot.imageUrl).trim();
    if (blobToken) {
      return blobGetBuffer(url, guessBlobAccessFromUrl(url)).catch(function () {
        return httpGetBuffer(url);
      });
    }
    return httpGetBuffer(url);
  }

  return Promise.reject(new Error("missing source url"));
}

/**
 * @param {string} baseUrl 本番ベース URL（例 https://xxx.vercel.app）
 * @param {object[]} records API 形の記録配列（localSnapshotImage は無視して上書き）
 * @returns {Promise<object[]>}
 */
function downloadSnapshotImages(baseUrl, records) {
  var root = path.join(__dirname, "..");
  var imgDir = path.join(root, "data", "growth-images");
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

  var base = String(baseUrl || "").replace(/\/+$/, "");
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
      var fileName = safeImageFileNameIndexed(id, idx);
      if (!fileName) {
        newImages.push(slot);
        return nextSlot();
      }

      return fetchSlotImageBuffer(base, slot)
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
  var growthPath = path.join(__dirname, "..", "data", "growth-snapshot.json");
  var raw = JSON.parse(fs.readFileSync(growthPath, "utf8"));
  var records = raw.records || [];
  downloadSnapshotImages(base, records).then(function (updated) {
    raw.records = updated;
    raw.exportedAt = new Date().toISOString();
    fs.writeFileSync(growthPath, JSON.stringify(raw, null, 2), "utf8");
    console.log("更新しました: " + growthPath);
    require("./write-growth-snapshot-boot.cjs").run();
  });
}
