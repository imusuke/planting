(function () {
  "use strict";

  var shared = window.PlantingEditCommon || {};

  function normalizeName(value) {
    if (shared.normalizeName) return shared.normalizeName(value);
    return typeof value === "string" ? value.trim() : "";
  }

  function growthImageSlots(record) {
    if (!record || typeof record !== "object") return [];
    if (Array.isArray(record.images) && record.images.length) {
      return record.images.filter(Boolean);
    }

    var single = {
      imageUrl: record.imageUrl || null,
      imagePathname: record.imagePathname || null,
      localSnapshotImage: record.localSnapshotImage || null,
    };
    if (single.imageUrl || single.imagePathname || single.localSnapshotImage) {
      return [single];
    }
    return [];
  }

  function growthImageSrcFromSlot(slot, apiPath) {
    if (!slot || typeof slot !== "object") return "";
    if (slot.localSnapshotImage) return slot.localSnapshotImage;
    if (slot.imagePathname && apiPath) {
      return apiPath + "?pathname=" + encodeURIComponent(slot.imagePathname);
    }
    if (slot.imageUrl) return slot.imageUrl;
    return "";
  }

  function normalizeStaticImageSlot(image) {
    if (!image || typeof image !== "object") return null;
    return {
      imageUrl: image.imageUrl || image.url || null,
      imagePathname: image.imagePathname || null,
      localSnapshotImage: image.localSnapshotImage || image.localPath || null,
    };
  }

  function compareRecordsNewest(a, b) {
    var aTime = Date.parse((a && (a.recordedAt || a.createdAt)) || "") || 0;
    var bTime = Date.parse((b && (b.recordedAt || b.createdAt)) || "") || 0;
    if (aTime !== bTime) return bTime - aTime;
    return String((b && b.id) || "").localeCompare(String((a && a.id) || ""));
  }

  function countPhotoSlots(record, apiPath) {
    var slots = growthImageSlots(record);
    var count = 0;
    for (var i = 0; i < slots.length; i++) {
      if (growthImageSrcFromSlot(slots[i], apiPath)) count += 1;
    }
    return count;
  }

  function buildPlantPhotoCountMap(records, apiPath) {
    var map = Object.create(null);
    if (!Array.isArray(records) || !records.length) return map;

    records.forEach(function (record) {
      var areaId = String((record && record.areaId) || "").trim();
      var slotCount = countPhotoSlots(record, apiPath);
      if (!areaId || !slotCount) return;

      var plants = Array.isArray(record.plants) ? record.plants : [];
      var seen = Object.create(null);
      plants.forEach(function (plantName) {
        var normalized = normalizeName(plantName);
        if (!normalized || seen[normalized]) return;
        seen[normalized] = true;
        var key = areaId + "::" + normalized;
        map[key] = (map[key] || 0) + slotCount;
      });
    });

    return map;
  }

  function buildAreaTimelinePhotoCountMap(records, apiPath) {
    var map = Object.create(null);
    if (!Array.isArray(records)) return map;

    records.forEach(function (record) {
      var areaId = String((record && record.areaId) || "").trim();
      var slotCount = countPhotoSlots(record, apiPath);
      if (!areaId || !slotCount) return;
      map[areaId] = (map[areaId] || 0) + slotCount;
    });

    return map;
  }

  function buildLatestPlantPhotoMap(records, apiPath) {
    var map = Object.create(null);
    if (!Array.isArray(records) || !records.length) return map;

    records.slice().sort(compareRecordsNewest).forEach(function (record) {
      var areaId = String((record && record.areaId) || "").trim();
      var slot = growthImageSlots(record)[0];
      var src = growthImageSrcFromSlot(slot, apiPath);
      if (!src) return;

      var plants = Array.isArray(record.plants) ? record.plants : [];
      plants.forEach(function (plantName) {
        var normalized = normalizeName(plantName);
        if (!normalized) return;
        var key = areaId + "::" + normalized;
        if (!map[key]) map[key] = { src: src };
      });
    });

    return map;
  }

  function buildLatestAreaPhotoMap(records, apiPath) {
    var map = Object.create(null);
    if (!Array.isArray(records) || !records.length) return map;

    records.slice().sort(compareRecordsNewest).forEach(function (record) {
      var areaId = String((record && record.areaId) || "").trim();
      if (!areaId || map[areaId]) return;
      var slot = growthImageSlots(record)[0];
      var src = growthImageSrcFromSlot(slot, apiPath);
      if (!src) return;
      map[areaId] = { src: src };
    });

    return map;
  }

  function buildStaticAreaPhotoMap(entries, apiPath) {
    var map = Object.create(null);
    if (!Array.isArray(entries) || !entries.length) return map;

    entries.forEach(function (entry) {
      var areaId = String((entry && entry.areaId) || "").trim();
      if (!areaId || map[areaId]) return;
      var images = Array.isArray(entry.images) ? entry.images : [];
      for (var i = 0; i < images.length; i++) {
        var slot = normalizeStaticImageSlot(images[i]);
        var src = growthImageSrcFromSlot(slot, apiPath);
        if (!src) continue;
        map[areaId] = { src: src };
        break;
      }
    });

    return map;
  }

  function mergeStaticAreaPhotoMap(entries, map, apiPath) {
    var out = Object.assign(Object.create(null), map || {});
    if (!Array.isArray(entries) || !entries.length) return out;

    entries.forEach(function (entry) {
      var areaId = String((entry && entry.areaId) || "").trim();
      if (!areaId || out[areaId]) return;
      var images = Array.isArray(entry.images) ? entry.images : [];
      for (var i = 0; i < images.length; i++) {
        var slot = normalizeStaticImageSlot(images[i]);
        var src = growthImageSrcFromSlot(slot, apiPath);
        if (!src) continue;
        out[areaId] = { src: src };
        break;
      }
    });

    return out;
  }

  function photoCountSuffix(count) {
    return "（" + String(count || 0) + "枚）";
  }

  window.PlantingListPage = Object.freeze({
    buildAreaTimelinePhotoCountMap: buildAreaTimelinePhotoCountMap,
    buildLatestAreaPhotoMap: buildLatestAreaPhotoMap,
    buildLatestPlantPhotoMap: buildLatestPlantPhotoMap,
    buildPlantPhotoCountMap: buildPlantPhotoCountMap,
    buildStaticAreaPhotoMap: buildStaticAreaPhotoMap,
    compareRecordsNewest: compareRecordsNewest,
    countPhotoSlots: countPhotoSlots,
    growthImageSlots: growthImageSlots,
    growthImageSrcFromSlot: growthImageSrcFromSlot,
    mergeStaticAreaPhotoMap: mergeStaticAreaPhotoMap,
    normalizeName: normalizeName,
    normalizeStaticImageSlot: normalizeStaticImageSlot,
    photoCountSuffix: photoCountSuffix,
  });
})();
