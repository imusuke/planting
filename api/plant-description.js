const archiveRecords = require("../lib/archive-records");
const growthApi = require("./growth");
const plantDescriptionAi = require("../lib/plant-description-ai");
const plantDetailsData = require("../data/plant-details.json");
const plantsCatalog = require("../data/plants.json");

const filterActiveRecords = archiveRecords.filterActiveRecords;

function normalizePlantName(name) {
  return typeof name === "string" ? name.trim() : "";
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

function findPlantDetailEntry(areaId, plantName) {
  var entries = plantDetailsData && Array.isArray(plantDetailsData.entries) ? plantDetailsData.entries : [];
  var wantedArea = String(areaId || "").trim();
  var wantedPlant = normalizePlantName(plantName);
  for (var i = 0; i < entries.length; i++) {
    if (!entries[i]) continue;
    if (String(entries[i].areaId || "").trim() !== wantedArea) continue;
    if (normalizePlantName(entries[i].name) !== wantedPlant) continue;
    return entries[i];
  }
  return null;
}

function recordHasPlant(record, plantName) {
  var wanted = normalizePlantName(plantName);
  if (!wanted || !record || !Array.isArray(record.plants)) return false;
  return record.plants.some(function (name) {
    return normalizePlantName(name) === wanted;
  });
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
      var images = growthApi.normalizeRecordImages(record);
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
        recordPlants: Array.isArray(record.plants)
          ? record.plants.map(function (name) {
              return normalizePlantName(name);
            }).filter(Boolean)
          : [],
      };
    })
    .filter(Boolean)
    .sort(function (a, b) {
      return compareRecordAsc(a.record, b.record);
    });
}

async function buildImageEntries(timelineRecords, token) {
  var selected = plantDescriptionAi.pickEvenlySpacedItems(
    timelineRecords,
    plantDescriptionAi.MAX_TIMELINE_IMAGES
  );
  var imageEntries = [];

  for (var i = 0; i < selected.length; i++) {
    try {
      var buf = await growthApi.readSourceImageBuffer(selected[i].primaryImage, token);
      imageEntries.push({
        label:
          (selected[i].recordedDate || "日付不明") +
          " の植栽写真" +
          (selected[i].photoCount > 1 ? "（" + String(selected[i].photoCount) + "枚中の代表）" : ""),
        imageBase64: buf.toString("base64"),
        imageMimeType: "image/jpeg",
      });
    } catch (err) {
      console.error(
        "plant-description:image_read",
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

  if (!growthApi.assertAuth(req)) {
    return res.status(401).json({ error: "unauthorized" });
  }
  if (!process.env.GEMINI_API_KEY) {
    return res
      .status(503)
      .json({ error: "gemini_unavailable", detail: "GEMINI_API_KEY が未設定です。" });
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res
      .status(503)
      .json({ error: "blob_unavailable", detail: "BLOB_READ_WRITE_TOKEN が未設定です。" });
  }

  var body = await growthApi.readJsonBody(req);
  if (
    !body ||
    typeof body.areaId !== "string" ||
    !body.areaId.trim() ||
    typeof body.name !== "string" ||
    !body.name.trim()
  ) {
    return res.status(400).json({ error: "missing_plant_context" });
  }

  var areaId = body.areaId.trim();
  var plantName = normalizePlantName(body.name);
  var areaLabel = findAreaLabel(areaId);
  var allRecords = await growthApi.readRecords();
  if (allRecords === null) {
    return res.status(503).json({ error: "kv_unavailable" });
  }

  var records = filterActiveRecords(allRecords).filter(function (record) {
    return (
      String((record && record.areaId) || "").trim() === areaId &&
      recordHasPlant(record, plantName) &&
      growthApi.normalizeRecordImages(record).length > 0
    );
  });
  var timelineRecords = buildTimelineRecords(records);
  if (!timelineRecords.length) {
    return res.status(400).json({
      error: "no_plant_photos",
      detail: "この植栽には、説明生成に使える保存済み写真がまだありません。",
    });
  }

  var imageEntries = await buildImageEntries(timelineRecords, process.env.BLOB_READ_WRITE_TOKEN);
  if (!imageEntries.length) {
    return res.status(502).json({
      error: "image_read_failed",
      detail: "植栽写真を読み出せなかったため、説明を生成できませんでした。",
    });
  }

  var detailEntry = findPlantDetailEntry(areaId, plantName);

  try {
    var result = await plantDescriptionAi.generatePlantDescription({
      areaId: areaId,
      areaLabel: areaLabel,
      plantName: plantName,
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
          recordPlants: item.recordPlants,
        };
      }),
      imageEntries: imageEntries,
    });

    return res.status(200).json({
      ok: true,
      model: result.model,
      areaId: areaId,
      areaLabel: areaLabel,
      name: plantName,
      summary: result.summary,
      body: result.body,
      recordCount: timelineRecords.length,
      imageCount: imageEntries.length,
    });
  } catch (err) {
    return res.status(502).json({
      error: "plant_description_failed",
      detail: err && err.message ? String(err.message) : "AIが植栽説明を生成できませんでした。",
    });
  }
};
