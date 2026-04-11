const { put, del, get } = require("@vercel/blob");
const { waitUntil } = require("@vercel/functions");
const { kv } = require("@vercel/kv");
const getRawBody = require("raw-body");
const { generateGrowthPhotoComment } = require("../lib/growth-photo-ai");
const archiveRecords = require("../lib/archive-records");
const changeLog = require("../lib/change-log");

const KV_KEY = "planting_growth_records_v1";
const KV_PLANTS = "planting_plants_catalog_v1";
const archiveRecordInList = archiveRecords.archiveRecordInList;
const filterActiveRecords = archiveRecords.filterActiveRecords;
const findActiveRecordIndex = archiveRecords.findActiveRecordIndex;
const findRecordIndex = archiveRecords.findRecordIndex;
const isArchivedRecord = archiveRecords.isArchivedRecord;

/** @type {{ areas: Array<{ id: string, label: string, plants: string[] }> }} */
const defaultCatalog = require("../data/plants.json");

/**
 * `private` by default (works with all Blob stores; images use `/api/growth-image`).
 * Set `BLOB_PUT_ACCESS=public` for direct public URLs (no pathname proxy).
 */
function blobPutAccess() {
  return process.env.BLOB_PUT_ACCESS === "public" ? "public" : "private";
}

function assertAuth(req) {
  var need = process.env.GROWTH_UPLOAD_TOKEN;
  if (!need) return true;
  return req.headers["x-growth-token"] === need;
}

async function readRecords() {
  try {
    var raw = await kv.get(KV_KEY);
    if (raw == null || raw === "") return [];
    var data = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.error("KV read error", e);
    return null;
  }
}

async function writeRecords(records) {
  await kv.set(KV_KEY, JSON.stringify(records));
}

async function readCatalogKv() {
  try {
    var raw = await kv.get(KV_PLANTS);
    if (raw == null || raw === "") return null;
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch (e) {
    console.error("KV plants read (growth)", e);
    return null;
  }
}

async function writeCatalogKv(data) {
  await kv.set(KV_PLANTS, JSON.stringify(data));
}

/** plants.js GET と同じ補完（KV 単体に無い既定エリアを含める） */
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

/**
 * 記録に含まれる植栽名のうち、当該エリアのマスタに無いものを KV のカタログへ追記する。
 * 失敗しても成長記録の保存は成功扱い（ログのみ）。
 */
async function appendRecordPlantsToCatalog(areaId, plantNames) {
  if (!areaId || typeof areaId !== "string" || !areaId.trim()) return;
  if (!Array.isArray(plantNames) || !plantNames.length) return;

  var fromKv = await readCatalogKv();
  var hasKv = !!(fromKv && Array.isArray(fromKv.areas) && fromKv.areas.length);
  var areas;
  if (hasKv) {
    areas = JSON.parse(JSON.stringify(fromKv.areas));
  } else {
    areas = JSON.parse(JSON.stringify(defaultCatalog.areas));
  }
  areas = mergeMissingAreasFromDefault(areas, defaultCatalog.areas);

  var idx = areas.findIndex(function (a) {
    return a && a.id === areaId;
  });
  if (idx < 0) {
    console.warn("appendRecordPlantsToCatalog: area not in catalog", areaId);
    return;
  }

  var list = Array.isArray(areas[idx].plants) ? areas[idx].plants.slice() : [];
  var seen = {};
  for (var s = 0; s < list.length; s++) {
    seen[list[s]] = true;
  }

  var changed = false;
  for (var p = 0; p < plantNames.length; p++) {
    var n = typeof plantNames[p] === "string" ? plantNames[p].trim() : "";
    if (!n) continue;
    if (seen[n]) continue;
    seen[n] = true;
    list.push(n);
    changed = true;
  }

  if (!changed) return;

  areas[idx] = Object.assign({}, areas[idx], { plants: list });
  await writeCatalogKv({ areas: areas });
}

function jsonError(res, status, code, err) {
  var detail =
    err && err.message
      ? String(err.message)
      : err
        ? String(err)
        : "";
  console.error(code, detail || err);
  return res.status(status).json({ error: code, detail: detail });
}

function isParsedJsonObject(body) {
  return (
    body != null &&
    typeof body === "object" &&
    !Buffer.isBuffer(body) &&
    !Array.isArray(body) &&
    typeof body.pipe !== "function"
  );
}

function normalizeRecordImages(record) {
  if (!record) return [];
  if (record.images && Array.isArray(record.images) && record.images.length) {
    return record.images.map(function (im) {
      return {
        imageUrl: im && im.imageUrl ? im.imageUrl : null,
        imagePathname: im && im.imagePathname ? im.imagePathname : null,
        memo: im && typeof im.memo === "string" ? im.memo : "",
      };
    });
  }
  if (record.imageUrl || record.imagePathname) {
    return [
      {
        imageUrl: record.imageUrl || null,
        imagePathname: record.imagePathname || null,
        memo: "",
      },
    ];
  }
  return [];
}

function applyImageMemos(images, memos) {
  if (!Array.isArray(images) || !images.length) return images || [];
  if (!Array.isArray(memos) || !memos.length) return images;
  return images.map(function (img, i) {
    if (memos[i] === undefined) return img;
    var o = Object.assign({}, img);
    o.memo = String(memos[i] != null ? memos[i] : "").slice(0, 5000);
    return o;
  });
}

async function deleteAllRecordImages(record, token) {
  if (!token || !record) return;
  var list = normalizeRecordImages(record);
  for (var d = 0; d < list.length; d++) {
    if (list[d].imageUrl) {
      try {
        await del(list[d].imageUrl, { token: token });
      } catch (e) {
        console.error("blob del", e);
      }
    }
  }
}

function guessBlobAccessFromUrl(url) {
  var u = String(url || "");
  if (u.indexOf(".public.blob.vercel-storage.com") !== -1) return "public";
  return "private";
}

async function readSourceImageBuffer(src, token) {
  var pathname = src && src.imagePathname ? String(src.imagePathname).trim() : "";
  var url = src && src.imageUrl ? String(src.imageUrl).trim() : "";
  var target = pathname || url;
  if (!target) {
    throw new Error("missing_source_image");
  }
  var access = pathname ? "private" : guessBlobAccessFromUrl(url);
  var got = await get(target, {
    access: access,
    token: token,
    useCache: false,
  });
  if (!got || got.statusCode !== 200 || !got.stream) {
    throw new Error("source_image_not_found");
  }
  var ab = await new Response(got.stream).arrayBuffer();
  var buf = Buffer.from(ab);
  if (!buf.length) {
    throw new Error("source_image_empty");
  }
  return buf;
}

function normalizeAiCommentTargets(value, imageCount) {
  if (!Array.isArray(value) || !value.length) return [];
  var seen = {};
  var out = [];
  for (var i = 0; i < value.length; i++) {
    var n = parseInt(String(value[i]), 10);
    if (isNaN(n) || n < 0 || n >= imageCount || seen[n]) continue;
    seen[n] = true;
    out.push(n);
  }
  return out;
}

function normalizeStoredAiTargets(value) {
  if (!Array.isArray(value) || !value.length) return [];
  var seen = {};
  var out = [];
  for (var i = 0; i < value.length; i++) {
    var n = parseInt(String(value[i]), 10);
    if (isNaN(n) || n < 0 || seen[n]) continue;
    seen[n] = true;
    out.push(n);
  }
  return out;
}

function createAiCommentJobId() {
  return "gcj_" + Date.now() + "_" + Math.random().toString(36).slice(2, 10);
}

function readAiCommentJob(record) {
  var raw = record && record.aiCommentJob && typeof record.aiCommentJob === "object" ? record.aiCommentJob : null;
  if (!raw) return null;
  return {
    id: raw.id ? String(raw.id) : "",
    source: raw.source ? String(raw.source) : "",
    status: raw.status ? String(raw.status) : "",
    targets: normalizeStoredAiTargets(raw.targets),
    requestedAt: raw.requestedAt ? String(raw.requestedAt) : "",
    startedAt: raw.startedAt ? String(raw.startedAt) : "",
    finishedAt: raw.finishedAt ? String(raw.finishedAt) : "",
    updatedAt: raw.updatedAt ? String(raw.updatedAt) : "",
    detail: raw.detail ? String(raw.detail) : "",
    updatedCount: typeof raw.updatedCount === "number" ? raw.updatedCount : 0,
    failedCount: typeof raw.failedCount === "number" ? raw.failedCount : 0,
  };
}

function buildAiCommentJob(status, targets, options) {
  var opts = options || {};
  var current = opts.current || null;
  var now = opts.now || new Date().toISOString();
  var detail = opts.detail;
  if (detail == null && current && current.detail) detail = current.detail;
  var updatedCount =
    typeof opts.updatedCount === "number"
      ? opts.updatedCount
      : current && typeof current.updatedCount === "number"
        ? current.updatedCount
        : 0;
  var failedCount =
    typeof opts.failedCount === "number"
      ? opts.failedCount
      : current && typeof current.failedCount === "number"
        ? current.failedCount
        : 0;
  var requestedAt = opts.requestedAt || (current && current.requestedAt) || now;
  var startedAt =
    opts.startedAt !== undefined
      ? opts.startedAt
      : status === "running"
        ? (current && current.startedAt) || now
        : current && current.startedAt
          ? current.startedAt
          : "";
  var finishedAt =
    opts.finishedAt !== undefined
      ? opts.finishedAt
      : status === "done" || status === "failed"
        ? now
        : "";
  var job = {
    id: opts.id || (current && current.id) || createAiCommentJobId(),
    source: opts.source || (current && current.source) || "save",
    status: String(status || ""),
    targets:
      Array.isArray(targets) && targets.length
        ? normalizeStoredAiTargets(targets)
        : current && Array.isArray(current.targets)
          ? normalizeStoredAiTargets(current.targets)
          : [],
    requestedAt: String(requestedAt),
    updatedAt: now,
    detail: detail ? String(detail) : "",
    updatedCount: updatedCount,
    failedCount: failedCount,
  };
  if (startedAt) job.startedAt = String(startedAt);
  if (finishedAt) job.finishedAt = String(finishedAt);
  return job;
}

function setAiCommentJobOnRecord(record, status, targets, options) {
  var next = Object.assign({}, record);
  next.aiCommentJob = buildAiCommentJob(status, targets, Object.assign({}, options, {
    current: readAiCommentJob(record),
  }));
  return next;
}

function updateAiCommentJobOnRecords(records, recordId, status, targets, options) {
  var idx = findActiveRecordIndex(records, recordId);
  if (idx < 0) return { missing: true, idx: -1, record: null, job: null };
  var current = records[idx];
  var currentJob = readAiCommentJob(current);
  var wantedJobId = options && options.id ? String(options.id) : "";
  if (wantedJobId && currentJob && currentJob.id && currentJob.id !== wantedJobId) {
    return {
      missing: false,
      replaced: true,
      idx: idx,
      record: current,
      job: currentJob,
    };
  }
  var next = setAiCommentJobOnRecord(current, status, targets, options);
  records[idx] = next;
  return {
    missing: false,
    replaced: false,
    idx: idx,
    record: next,
    job: readAiCommentJob(next),
  };
}

async function queueGrowthAiCommentJob(recordId, targets, source, detail) {
  var records = await readRecords();
  if (records === null) {
    throw new Error("kv_unavailable");
  }
  var nextJobId = createAiCommentJobId();
  var queued = updateAiCommentJobOnRecords(records, recordId, "queued", targets, {
    id: nextJobId,
    source: source || "manual",
    detail: detail || "",
    updatedCount: 0,
    failedCount: 0,
  });
  if (queued.missing) return null;
  await writeRecords(records);
  return {
    record: queued.record,
    job: queued.job,
  };
}

function recordPlantsOverlap(record, candidate) {
  var left = record && Array.isArray(record.plants) ? record.plants : [];
  var right = candidate && Array.isArray(candidate.plants) ? candidate.plants : [];
  if (!left.length || !right.length) return true;
  var seen = {};
  for (var i = 0; i < left.length; i++) {
    if (!left[i]) continue;
    seen[String(left[i])] = true;
  }
  for (var j = 0; j < right.length; j++) {
    if (!right[j]) continue;
    if (seen[String(right[j])]) return true;
  }
  return false;
}

function findPreviousComparableRecord(records, record) {
  if (!Array.isArray(records) || !record) return null;
  var currentStamp = String(record.recordedAt || record.createdAt || "");
  var candidates = records.filter(function (item) {
    if (!item || item.id === record.id) return false;
    if (isArchivedRecord(item)) return false;
    if (String(item.areaId || "") !== String(record.areaId || "")) return false;
    if (!recordPlantsOverlap(record, item)) return false;
    if (!normalizeRecordImages(item).length) return false;
    var itemStamp = String(item.recordedAt || item.createdAt || "");
    if (currentStamp && itemStamp && itemStamp >= currentStamp) return false;
    return true;
  });

  candidates.sort(function (a, b) {
    return String(b.recordedAt || b.createdAt || "").localeCompare(
      String(a.recordedAt || a.createdAt || "")
    );
  });
  return candidates[0] || null;
}

function pickComparisonImage(images, slotIndex) {
  if (!Array.isArray(images) || !images.length) return null;
  return images[slotIndex] || images[0] || null;
}

function buildAiContextFromRecord(record, slotIndex, currentMemo, photoCount, previousRecord, previousMemo) {
  return {
    recordedDate: record && record.recordedAt ? String(record.recordedAt).slice(0, 10) : "",
    areaId: record && record.areaId ? String(record.areaId) : "",
    areaLabel: record && record.areaLabel ? String(record.areaLabel) : "",
    plantNames: record && Array.isArray(record.plants) ? record.plants.slice() : [],
    note: record && record.note ? String(record.note) : "",
    currentPhotoMemo: currentMemo ? String(currentMemo) : "",
    previousRecordedDate:
      previousRecord && previousRecord.recordedAt
        ? String(previousRecord.recordedAt).slice(0, 10)
        : "",
    previousNote: previousRecord && previousRecord.note ? String(previousRecord.note) : "",
    previousPhotoMemo: previousMemo ? String(previousMemo) : "",
    photoIndex: slotIndex + 1,
    photoCount: photoCount,
    mode: "edit",
  };
}

async function refreshGrowthPhotoCommentsInBackground(record, targetIndexes) {
  if (!record || !record.id) return { ok: false, skipped: "missing_record" };
  var options = arguments.length > 2 && arguments[2] ? arguments[2] : {};
  var jobId = options.id ? String(options.id) : "";
  var jobSource = options.source ? String(options.source) : "save";
  var expectedRevision = !jobId ? record.updatedAt || record.createdAt || "" : "";

  async function markFailed(skipCode, detailText, failedCount) {
    if (jobId) {
      var recordsFail = await readRecords();
      if (recordsFail !== null) {
        var failedUpdate = updateAiCommentJobOnRecords(recordsFail, record.id, "failed", targetIndexes, {
          id: jobId,
          source: jobSource,
          detail: detailText || skipCode,
          updatedCount: 0,
          failedCount: typeof failedCount === "number" ? failedCount : 0,
        });
        if (!failedUpdate.missing && !failedUpdate.replaced) {
          await writeRecords(recordsFail);
        }
      }
    }
    return {
      ok: false,
      skipped: skipCode,
      detail: detailText || "",
    };
  }

  if (!process.env.GEMINI_API_KEY) {
    return markFailed("gemini_unavailable", "Gemini APIの設定が見つかりません。");
  }

  if (jobId) {
    var recordsStart = await readRecords();
    if (recordsStart === null) {
      throw new Error("kv_unavailable");
    }
    var running = updateAiCommentJobOnRecords(recordsStart, record.id, "running", targetIndexes, {
      id: jobId,
      source: jobSource,
      detail: "",
      updatedCount: 0,
      failedCount: 0,
    });
    if (running.missing) {
      return { ok: false, skipped: "record_deleted" };
    }
    if (running.replaced) {
      return { ok: false, skipped: "job_replaced" };
    }
    await writeRecords(recordsStart);
    record = running.record;
  }

  var images = normalizeRecordImages(record);
  var targets = normalizeAiCommentTargets(targetIndexes, images.length);
  if (!targets.length) {
    return markFailed("no_targets", "対象の写真が見つかりません。");
  }

  var token = process.env.BLOB_READ_WRITE_TOKEN;
  var generated = {};
  var failed = {};
  var recordsForComparison = await readRecords();
  if (recordsForComparison === null) recordsForComparison = [];
  var previousRecord = findPreviousComparableRecord(recordsForComparison, record);
  var previousImages = previousRecord ? normalizeRecordImages(previousRecord) : [];

  for (var i = 0; i < targets.length; i++) {
    var slotIndex = targets[i];
    var slot = images[slotIndex];
    if (!slot) continue;
    try {
      var buf = await readSourceImageBuffer(slot, token);
      var previousSlot = pickComparisonImage(previousImages, slotIndex);
      var referenceImages = [];
      if (previousSlot) {
        try {
          var previousBuf = await readSourceImageBuffer(previousSlot, token);
          referenceImages.push({
            label: "比較用の前回写真",
            imageBase64: previousBuf.toString("base64"),
            imageMimeType: "image/jpeg",
          });
        } catch (comparisonErr) {
          console.error(
            "refreshGrowthPhotoCommentsInBackground:comparison",
            record.id,
            slotIndex,
            comparisonErr && comparisonErr.message ? comparisonErr.message : comparisonErr
          );
        }
      }
      var result = await generateGrowthPhotoComment({
        imageBase64: buf.toString("base64"),
        imageMimeType: "image/jpeg",
        referenceImages: referenceImages,
        context: buildAiContextFromRecord(
          record,
          slotIndex,
          slot.memo || "",
          images.length,
          previousRecord,
          previousSlot && previousSlot.memo ? previousSlot.memo : ""
        ),
        timeoutMs: 30000,
      });
      generated[slotIndex] = result.comment;
    } catch (err) {
      var detail = err && err.message ? String(err.message) : "ai_comment_failed";
      failed[slotIndex] = detail;
      console.error("refreshGrowthPhotoCommentsInBackground:slot", record.id, slotIndex, detail);
    }
  }

  var keys = Object.keys(generated);
  if (!keys.length) {
    var firstFailedKey = Object.keys(failed)[0];
    var failedDetail = firstFailedKey ? String(failed[firstFailedKey] || "") : "AIコメントを生成できませんでした。";
    var emptyResult = await markFailed("no_results", failedDetail, Object.keys(failed).length || targets.length);
    emptyResult.failed = Object.keys(failed).length;
    emptyResult.errors = failed;
    return emptyResult;
  }

  var records = await readRecords();
  if (records === null) {
    throw new Error("kv_unavailable");
  }

  var idx = findActiveRecordIndex(records, record.id);
  if (idx < 0) return { ok: false, skipped: "record_deleted" };

  var latest = records[idx];
  var latestJob = readAiCommentJob(latest);
  if (jobId && latestJob && latestJob.id && latestJob.id !== jobId) {
    return { ok: false, skipped: "job_replaced" };
  }
  var latestRevision = latest.updatedAt || latest.createdAt || "";
  if (!jobId && expectedRevision && latestRevision !== expectedRevision) {
    return { ok: false, skipped: "record_changed" };
  }

  var latestImages = normalizeRecordImages(latest);
  for (var k = 0; k < keys.length; k++) {
    var key = Number(keys[k]);
    if (!latestImages[key]) continue;
    latestImages[key] = Object.assign({}, latestImages[key], {
      memo: generated[key],
    });
  }

  latest.images = latestImages;
  latest.imageUrl = latestImages[0] ? latestImages[0].imageUrl : null;
  latest.imagePathname = latestImages[0] ? latestImages[0].imagePathname : null;
  latest.updatedAt = new Date().toISOString();
  latest.aiCommentJob = buildAiCommentJob("done", targets, {
    current: latestJob,
    id: jobId || (latestJob && latestJob.id) || createAiCommentJobId(),
    source: jobSource,
    detail:
      Object.keys(failed).length && Object.keys(failed)[0]
        ? String(failed[Object.keys(failed)[0]] || "")
        : "",
    updatedCount: keys.length,
    failedCount: Object.keys(failed).length,
  });
  records[idx] = latest;
  await writeRecords(records);
  return {
    ok: true,
    updated: keys.length,
    failed: Object.keys(failed).length,
    errors: failed,
    record: latest,
  };
}

async function readJsonBody(req) {
  if (Buffer.isBuffer(req.body)) {
    try {
      return JSON.parse(req.body.toString("utf8"));
    } catch (e) {
      return null;
    }
  }
  if (isParsedJsonObject(req.body)) {
    return req.body;
  }
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch (e) {
      /* fall through: try raw stream (some hosts leave body unparsed) */
    }
  }
  try {
    var buf = await getRawBody(req, {
      limit: "32mb",
    });
    return JSON.parse(buf.toString("utf8"));
  } catch (e) {
    console.error("readJsonBody", e);
    return null;
  }
}

async function handler(req, res) {
  if (req.method === "GET") {
    var records = await readRecords();
    if (records === null) {
      return res.status(503).json({ error: "kv_unavailable" });
    }
    return res.status(200).json({ records: filterActiveRecords(records) });
  }

  if (!assertAuth(req)) {
    return res.status(401).json({ error: "unauthorized" });
  }

  if (req.method === "POST") {
    try {
    var body = await readJsonBody(req);
    if (!body || !body.id) {
      return res.status(400).json({ error: "missing_id" });
    }

    var records = await readRecords();
    if (records === null) {
      return res.status(503).json({ error: "kv_unavailable" });
    }

    var idx0 = findActiveRecordIndex(records, body.id);
    if (idx0 < 0) idx0 = findRecordIndex(records, body.id);
    var existing = idx0 >= 0 ? records[idx0] : null;
    var token = process.env.BLOB_READ_WRITE_TOKEN;

    var imagesOut = null;

    if (body.imagesBase64 !== undefined && body.imagesBase64 !== null) {
      if (!token) {
        return res.status(503).json({ error: "blob_unavailable" });
      }
      var arr = Array.isArray(body.imagesBase64) ? body.imagesBase64 : [];
      if (arr.length > 20) {
        return res.status(400).json({ error: "too_many_images" });
      }
      await deleteAllRecordImages(existing, token);
      imagesOut = [];
      var access = blobPutAccess();
      var memosUpload = Array.isArray(body.imageMemos) ? body.imageMemos : [];
      for (var ii = 0; ii < arr.length; ii++) {
        var b64 = arr[ii];
        if (typeof b64 !== "string" || !b64.length) {
          return res.status(400).json({ error: "invalid_image_data" });
        }
        try {
          var bufM = Buffer.from(b64, "base64");
          if (!bufM.length) {
            return res.status(400).json({ error: "invalid_image_data" });
          }
          var blobPath = "growth/" + body.id + "/" + ii + ".jpg";
          var up = await put(blobPath, bufM, {
            access: access,
            token: token,
            contentType: "image/jpeg",
            addRandomSuffix: false,
            allowOverwrite: true,
          });
          var memoOne =
            memosUpload[ii] != null
              ? String(memosUpload[ii]).slice(0, 5000)
              : "";
          imagesOut.push({
            imageUrl: up.url,
            imagePathname: access === "private" ? up.pathname : null,
            memo: memoOne,
          });
        } catch (blobErr) {
          return jsonError(res, 502, "blob_put_failed", blobErr);
        }
      }
    } else if (body.imageBase64) {
      if (!token) {
        return res.status(503).json({ error: "blob_unavailable" });
      }
      await deleteAllRecordImages(existing, token);
      try {
        var buf1 = Buffer.from(body.imageBase64, "base64");
        if (!buf1.length) {
          return res.status(400).json({ error: "invalid_image_data" });
        }
        var access1 = blobPutAccess();
        var uploaded1 = await put("growth/" + body.id + "/0.jpg", buf1, {
          access: access1,
          token: token,
          contentType: body.imageMime || "image/jpeg",
          addRandomSuffix: false,
          allowOverwrite: true,
        });
        var memosLegacy = Array.isArray(body.imageMemos) ? body.imageMemos : [];
        var memo0 =
          memosLegacy[0] != null ? String(memosLegacy[0]).slice(0, 5000) : "";
        imagesOut = [
          {
            imageUrl: uploaded1.url,
            imagePathname: access1 === "private" ? uploaded1.pathname : null,
            memo: memo0,
          },
        ];
      } catch (blobErr2) {
        return jsonError(res, 502, "blob_put_failed", blobErr2);
      }
    } else if (Array.isArray(body.sourceImages)) {
      if (!token) {
        return res.status(503).json({ error: "blob_unavailable" });
      }
      var srcArr = body.sourceImages.slice();
      if (srcArr.length > 20) {
        return res.status(400).json({ error: "too_many_images" });
      }
      await deleteAllRecordImages(existing, token);
      imagesOut = [];
      var memosSrc = Array.isArray(body.imageMemos) ? body.imageMemos : [];
      for (var si = 0; si < srcArr.length; si++) {
        try {
          var srcBuf = await readSourceImageBuffer(srcArr[si], token);
          var blobPath2 = "growth/" + body.id + "/" + si + ".jpg";
          var up2 = await put(blobPath2, srcBuf, {
            access: blobPutAccess(),
            token: token,
            contentType: "image/jpeg",
            addRandomSuffix: false,
            allowOverwrite: true,
          });
          var memoTwo =
            memosSrc[si] != null
              ? String(memosSrc[si]).slice(0, 5000)
              : "";
          imagesOut.push({
            imageUrl: up2.url,
            imagePathname: blobPutAccess() === "private" ? up2.pathname : null,
            memo: memoTwo,
          });
        } catch (srcErr) {
          return jsonError(res, 502, "source_copy_failed", srcErr);
        }
      }
    }

    var createdAtStored =
      existing && existing.createdAt
        ? existing.createdAt
        : body.createdAt || new Date().toISOString();

    var finalImages;
    if (imagesOut !== null) {
      finalImages = imagesOut;
    } else {
      finalImages = existing
        ? normalizeRecordImages(existing).map(function (x) {
            return {
              imageUrl: x.imageUrl,
              imagePathname: x.imagePathname,
              memo: typeof x.memo === "string" ? x.memo : "",
            };
          })
        : [];
    }

    finalImages = applyImageMemos(finalImages, body.imageMemos);

    var record = {
      id: body.id,
      recordedAt: body.recordedAt,
      areaId: body.areaId,
      areaLabel: body.areaLabel,
      plants: Array.isArray(body.plants) ? body.plants : [],
      note: body.note || "",
      images: finalImages,
      imageUrl: finalImages[0] ? finalImages[0].imageUrl : null,
      imagePathname: finalImages[0] ? finalImages[0].imagePathname : null,
      createdAt: createdAtStored,
    };
    delete record.archivedAt;
    delete record.archivedReason;
    if (existing) {
      record.updatedAt = new Date().toISOString();
    }

    var aiCommentTargets = normalizeAiCommentTargets(body.aiCommentTargets, finalImages.length);
    var aiCommentsQueued = aiCommentTargets.length > 0 && !!process.env.GEMINI_API_KEY;
    if (aiCommentTargets.length) {
      record = setAiCommentJobOnRecord(record, aiCommentsQueued ? "queued" : "failed", aiCommentTargets, {
        source: "save",
        detail: aiCommentsQueued ? "" : "Gemini APIの設定が見つかりません。",
        updatedCount: 0,
        failedCount: aiCommentsQueued ? 0 : aiCommentTargets.length,
      });
    } else {
      delete record.aiCommentJob;
    }

    var idx = idx0 >= 0 ? idx0 : findRecordIndex(records, record.id);
    if (idx >= 0) {
      records[idx] = record;
    } else {
      records.push(record);
    }
    records.sort(function (a, b) {
      return (b.recordedAt || "").localeCompare(a.recordedAt || "");
    });
    try {
      await writeRecords(records);
    } catch (kvErr) {
      return jsonError(res, 503, "kv_write_failed", kvErr);
    }

    try {
      await appendRecordPlantsToCatalog(record.areaId, record.plants);
    } catch (catErr) {
      console.error("appendRecordPlantsToCatalog", catErr);
    }

    await changeLog.appendChangeLogSafe({
      action: existing ? "growth_record_updated" : "growth_record_created",
      targetType: "growth_record",
      targetId: record.id,
      areaId: record.areaId,
      areaLabel: record.areaLabel,
      plantNames: Array.isArray(record.plants) ? record.plants : [],
      detail: existing ? "植栽記録を更新" : "植栽記録を追加",
      meta: {
        imageCount: finalImages.length,
        aiQueued: aiCommentsQueued,
      },
    });

    if (aiCommentsQueued) {
      waitUntil(
        refreshGrowthPhotoCommentsInBackground(record, aiCommentTargets, {
          id: record.aiCommentJob && record.aiCommentJob.id ? record.aiCommentJob.id : "",
          source: "save",
        }).catch(function (err) {
          console.error("refreshGrowthPhotoCommentsInBackground", err);
        })
      );
    }

    return res.status(200).json({
      ok: true,
      record: record,
      aiCommentsQueued: aiCommentsQueued,
      aiCommentTargetCount: aiCommentTargets.length,
    });
    } catch (unexpected) {
      return jsonError(res, 500, "internal_error", unexpected);
    }
  }

  if (req.method === "DELETE") {
    var id = req.query && req.query.id;
    if (!id) {
      return res.status(400).json({ error: "missing_id" });
    }
    var list = await readRecords();
    if (list === null) {
      return res.status(503).json({ error: "kv_unavailable" });
    }
    var foundIdx = findActiveRecordIndex(list, id);
    var found = foundIdx >= 0 ? list[foundIdx] : null;
    if (!found) {
      return res.status(404).json({ error: "not_found" });
    }
    var slotRaw = req.query && req.query.slot;
    var hasSlot = slotRaw !== undefined && slotRaw !== null && String(slotRaw).trim() !== "";
    if (!hasSlot) {
      var archived = archiveRecordInList(list, id, { reason: "user_archive" });
      if (!archived.ok) {
        return res.status(404).json({ error: archived.error || "not_found" });
      }
      await writeRecords(archived.records);
      await changeLog.appendChangeLogSafe({
        action: "growth_record_archived",
        targetType: "growth_record",
        targetId: found.id,
        areaId: found.areaId,
        areaLabel: found.areaLabel,
        plantNames: Array.isArray(found.plants) ? found.plants : [],
        detail: "植栽記録をアーカイブ",
      });
      return res.status(200).json({ ok: true, archived: true, record: archived.record });
    }

    var slot = parseInt(String(slotRaw), 10);
    var images = normalizeRecordImages(found);
    if (isNaN(slot) || slot < 0 || slot >= images.length) {
      return res.status(400).json({ error: "invalid_slot" });
    }

    var tokenDel = process.env.BLOB_READ_WRITE_TOKEN;
    var target = images[slot];
    if (tokenDel && target && target.imageUrl) {
      try {
        await del(target.imageUrl, { token: tokenDel });
      } catch (e) {
        console.error("growth blob del one", e);
      }
    }

    var keep = [];
    for (var si = 0; si < images.length; si++) {
      if (si === slot) continue;
      keep.push(images[si]);
    }

    var noteText = String(found.note || "");
    if (!keep.length && !noteText.trim()) {
      var nextDel = list.filter(function (r) {
        return r.id !== id;
      });
      await writeRecords(nextDel);
      await changeLog.appendChangeLogSafe({
        action: "growth_record_deleted_after_photo_removal",
        targetType: "growth_record",
        targetId: found.id,
        areaId: found.areaId,
        areaLabel: found.areaLabel,
        plantNames: Array.isArray(found.plants) ? found.plants : [],
        detail: "最後の写真削除により植栽記録を削除",
      });
      return res.status(200).json({ ok: true, deleted: true });
    }

    found.images = keep;
    found.imageUrl = keep[0] ? keep[0].imageUrl : null;
    found.imagePathname = keep[0] ? keep[0].imagePathname : null;
    found.updatedAt = new Date().toISOString();
    list[foundIdx] = found;
    await writeRecords(list);
    await changeLog.appendChangeLogSafe({
      action: "growth_record_photo_removed",
      targetType: "growth_record",
      targetId: found.id,
      areaId: found.areaId,
      areaLabel: found.areaLabel,
      plantNames: Array.isArray(found.plants) ? found.plants : [],
      detail: "植栽記録の写真を削除",
      meta: {
        removedSlot: slot,
        remainingImageCount: keep.length,
      },
    });
    return res.status(200).json({ ok: true, record: found });
  }

  res.setHeader("Allow", "GET, POST, DELETE");
  return res.status(405).json({ error: "method_not_allowed" });
}

module.exports = handler;
module.exports.assertAuth = assertAuth;
module.exports.normalizeAiCommentTargets = normalizeAiCommentTargets;
module.exports.readJsonBody = readJsonBody;
module.exports.readRecords = readRecords;
module.exports.readAiCommentJob = readAiCommentJob;
module.exports.queueGrowthAiCommentJob = queueGrowthAiCommentJob;
module.exports.refreshGrowthPhotoCommentsInBackground = refreshGrowthPhotoCommentsInBackground;
