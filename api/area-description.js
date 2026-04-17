const getRawBody = require("raw-body");
const archiveRecords = require("../lib/archive-records");
const areaGrowthApi = require("./area-growth");
const areaDescriptionAi = require("../lib/area-description-ai");
const areaDetailsData = require("../data/area-details.json");
const plantsCatalog = require("../data/plants.json");

const filterActiveRecords = archiveRecords.filterActiveRecords;

function assertAuth(req) {
  var need = process.env.GROWTH_UPLOAD_TOKEN;
  if (!need) return true;
  return req.headers["x-growth-token"] === need;
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
      /* fall through */
    }
  }
  try {
    var buf = await getRawBody(req, { limit: "4mb" });
    return JSON.parse(buf.toString("utf8"));
  } catch (e) {
    return null;
  }
}

function findAreaLabel(areaId) {
  var areas = plantsCatalog && Array.isArray(plantsCatalog.areas) ? plantsCatalog.areas : [];
  for (var i = 0; i < areas.length; i++) {
    if (areas[i] && String(areas[i].id || "").trim() === areaId) {
      return String(areas[i].label || areaId);
    }
  }
  return areaId;
}

function findAreaDetailEntry(areaId) {
  var entries = areaDetailsData && Array.isArray(areaDetailsData.entries) ? areaDetailsData.entries : [];
  for (var i = 0; i < entries.length; i++) {
    if (entries[i] && String(entries[i].areaId || "").trim() === areaId) {
      return entries[i];
    }
  }
  return null;
}

function compareRecordAsc(left, right) {
  var a = String((left && (left.recordedAt || left.createdAt)) || "");
  var b = String((right && (right.recordedAt || right.createdAt)) || "");
  if (a !== b) return a.localeCompare(b);
  return String((left && left.id) || "").localeCompare(String((right && right.id) || ""));
}

function buildTimelineRecords(records) {
  return records
    .map(function (record) {
      var images = areaGrowthApi.normalizeRecordImages(record);
      if (!images.length) return null;
      return {
        record: record,
        primaryImage: images[0],
        recordedDate: String(record.recordedAt || record.createdAt || "").slice(0, 10),
        note: record && record.note ? String(record.note) : "",
        photoCount: images.length,
        photoMemos: images
          .map(function (image) {
            return image && image.memo ? String(image.memo).trim() : "";
          })
          .filter(Boolean)
          .slice(0, 3),
      };
    })
    .filter(Boolean)
    .sort(function (a, b) {
      return compareRecordAsc(a.record, b.record);
    });
}

async function buildImageEntries(timelineRecords, token) {
  var selected = areaDescriptionAi.pickEvenlySpacedItems(
    timelineRecords,
    areaDescriptionAi.MAX_TIMELINE_IMAGES
  );
  var imageEntries = [];

  for (var i = 0; i < selected.length; i++) {
    try {
      var buf = await areaGrowthApi.readSourceImageBuffer(selected[i].primaryImage, token);
      imageEntries.push({
        label:
          (selected[i].recordedDate || "日付不明") +
          " のエリア写真" +
          (selected[i].photoCount > 1 ? "（" + String(selected[i].photoCount) + "枚中の代表）" : ""),
        imageBase64: buf.toString("base64"),
        imageMimeType: "image/jpeg",
      });
    } catch (err) {
      console.error(
        "area-description:image_read",
        selected[i].record && selected[i].record.id ? selected[i].record.id : "unknown",
        err && err.message ? err.message : err
      );
    }
  }

  return imageEntries;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }

  if (!assertAuth(req)) {
    return res.status(401).json({ error: "unauthorized" });
  }
  if (!process.env.GEMINI_API_KEY) {
    return res.status(503).json({ error: "gemini_unavailable", detail: "GEMINI_API_KEY が未設定です。" });
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(503).json({ error: "blob_unavailable", detail: "BLOB_READ_WRITE_TOKEN が未設定です。" });
  }

  var body = await readJsonBody(req);
  if (!body || typeof body.areaId !== "string" || !body.areaId.trim()) {
    return res.status(400).json({ error: "missing_area_id" });
  }

  var areaId = body.areaId.trim();
  var areaLabel = findAreaLabel(areaId);
  var allRecords = await areaGrowthApi.readRecords();
  if (allRecords === null) {
    return res.status(503).json({ error: "kv_unavailable" });
  }

  var records = filterActiveRecords(allRecords).filter(function (record) {
    return String((record && record.areaId) || "").trim() === areaId;
  });
  var timelineRecords = buildTimelineRecords(records);
  if (!timelineRecords.length) {
    return res.status(400).json({
      error: "no_area_photos",
      detail: "このエリアには説明生成に使える写真付き記録がまだありません。",
    });
  }

  var imageEntries = await buildImageEntries(timelineRecords, process.env.BLOB_READ_WRITE_TOKEN);
  if (!imageEntries.length) {
    return res.status(502).json({
      error: "image_read_failed",
      detail: "エリア写真を読み出せなかったため、説明を生成できませんでした。",
    });
  }

  var detailEntry = findAreaDetailEntry(areaId);

  try {
    var result = await areaDescriptionAi.generateAreaDescription({
      areaId: areaId,
      areaLabel: areaLabel,
      currentSummary: body.currentSummary || (detailEntry && detailEntry.summary) || "",
      currentBody: body.currentBody || (detailEntry && detailEntry.body) || "",
      firstRecordedDate: timelineRecords[0] ? timelineRecords[0].recordedDate : "",
      lastRecordedDate: timelineRecords[timelineRecords.length - 1]
        ? timelineRecords[timelineRecords.length - 1].recordedDate
        : "",
      timelineRecords: timelineRecords.map(function (item) {
        return {
          recordedDate: item.recordedDate,
          note: item.note,
          photoCount: item.photoCount,
          photoMemos: item.photoMemos,
        };
      }),
      imageEntries: imageEntries,
    });

    return res.status(200).json({
      ok: true,
      model: result.model,
      areaId: areaId,
      areaLabel: areaLabel,
      summary: result.summary,
      body: result.body,
      recordCount: timelineRecords.length,
      imageCount: imageEntries.length,
    });
  } catch (err) {
    return res.status(502).json({
      error: "area_description_failed",
      detail: err && err.message ? String(err.message) : "AIがエリア説明を生成できませんでした。",
    });
  }
};
