(function () {
  "use strict";

  var API_PLANTS = "/api/plants";
  var API_GROWTH = "/api/growth";
  var API_AREA_GROWTH = "/api/area-growth";
  var API_AREA_DETAILS = "/api/area-details";
  var API_GROWTH_IMAGE = "/api/growth-image";
  var PLANTS_JSON = "data/plants.json";
  var AREA_DETAILS_JSON = "data/area-details.json";
  var GROWTH_SNAPSHOT_JSON = "data/growth-snapshot.json";
  var AREA_GROWTH_SNAPSHOT_JSON = "data/area-growth-snapshot.json";

  var root = document.getElementById("area-list");
  if (!root) return;

  function loadJson(path) {
    return fetch(path, { cache: "no-store" }).then(function (res) {
      if (!res.ok) throw new Error("bad status");
      return res.json();
    });
  }

  function readEmbeddedJson(id) {
    var el = document.getElementById(id);
    if (!el || !el.textContent || !el.textContent.trim()) return null;
    try {
      return JSON.parse(el.textContent.trim());
    } catch (e) {
      return null;
    }
  }

  function hardcodedFallback() {
    return {
      areas: [
        { id: "entrance", label: "entrance", plants: [] },
        { id: "parking", label: "parking", plants: [] },
        { id: "deck", label: "deck", plants: [] },
        { id: "corner", label: "corner", plants: [] },
        { id: "indoor", label: "indoor", plants: [] },
        { id: "yatsu-hatake", label: "yatsu-hatake", plants: [] },
      ],
    };
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

  function growthImageSrcFromSlot(slot) {
    if (!slot || typeof slot !== "object") return "";
    if (slot.localSnapshotImage) return slot.localSnapshotImage;
    if (slot.imagePathname) {
      return API_GROWTH_IMAGE + "?pathname=" + encodeURIComponent(slot.imagePathname);
    }
    if (slot.imageUrl) return slot.imageUrl;
    return "";
  }

  function normalizeStaticImageSlot(im) {
    if (!im || typeof im !== "object") return null;
    return {
      imageUrl: im.imageUrl || im.url || null,
      imagePathname: im.imagePathname || null,
      localSnapshotImage: im.localSnapshotImage || im.localPath || null,
    };
  }

  function compareRecordsNewest(a, b) {
    var aTime = Date.parse((a && (a.recordedAt || a.createdAt)) || "") || 0;
    var bTime = Date.parse((b && (b.recordedAt || b.createdAt)) || "") || 0;
    if (aTime !== bTime) return bTime - aTime;
    return String((b && b.id) || "").localeCompare(String((a && a.id) || ""));
  }

  function buildLatestAreaPhotoMap(records) {
    var map = Object.create(null);
    if (!Array.isArray(records) || !records.length) return map;

    records.slice().sort(compareRecordsNewest).forEach(function (record) {
      var areaId = String((record && record.areaId) || "").trim();
      if (!areaId || map[areaId]) return;
      var slot = growthImageSlots(record)[0];
      var src = growthImageSrcFromSlot(slot);
      if (!src) return;
      map[areaId] = { src: src };
    });

    return map;
  }

  function buildStaticAreaPhotoMap(entries) {
    var map = Object.create(null);
    if (!Array.isArray(entries) || !entries.length) return map;

    entries.forEach(function (entry) {
      var areaId = String((entry && entry.areaId) || "").trim();
      if (!areaId || map[areaId]) return;
      var images = Array.isArray(entry.images) ? entry.images : [];
      for (var i = 0; i < images.length; i++) {
        var slot = normalizeStaticImageSlot(images[i]);
        var src = growthImageSrcFromSlot(slot);
        if (!src) continue;
        map[areaId] = { src: src };
        break;
      }
    });

    return map;
  }

  function createThumb(area, photo) {
    if (!photo || !photo.src) return null;

    var wrap = document.createElement("span");
    wrap.className = "area-list-card-thumb";

    var img = document.createElement("img");
    img.className = "area-list-card-thumb-img";
    img.src = photo.src;
    img.alt = (area.label || area.id) + " の代表写真";
    img.loading = "lazy";
    img.decoding = "async";
    img.referrerPolicy = "no-referrer";
    img.addEventListener("error", function () {
      wrap.remove();
    });

    wrap.appendChild(img);
    return wrap;
  }

  function renderAreas(data, areaPhotoMap) {
    root.innerHTML = "";
    var areas = data && Array.isArray(data.areas) ? data.areas : [];
    if (!areas.length) {
      var p = document.createElement("p");
      p.className = "plant-load-error";
      p.textContent = "エリアが見つかりませんでした。";
      root.appendChild(p);
      return;
    }

    areas.forEach(function (area) {
      if (!area || !area.id) return;
      var card = document.createElement("a");
      card.className = "card growthlog area-list-card";
      card.href = "./area.html?area=" + encodeURIComponent(area.id);

      var photo = areaPhotoMap[String(area.id || "").trim()];
      var thumb = createThumb(area, photo);
      if (thumb) card.appendChild(thumb);

      var label = document.createElement("span");
      label.className = "card-label";
      label.textContent = "Area";
      card.appendChild(label);

      var title = document.createElement("h2");
      title.textContent = area.label || area.id;
      card.appendChild(title);

      var count = Array.isArray(area.plants) ? area.plants.length : 0;
      var desc = document.createElement("p");
      desc.textContent = "植栽数: " + count + " / エリア時系列を開く";
      card.appendChild(desc);

      var open = document.createElement("span");
      open.className = "open";
      open.textContent = "Open";
      card.appendChild(open);

      root.appendChild(card);
    });
  }

  function loadPlantsData() {
    return loadJson(API_PLANTS)
      .then(function (data) {
        if (!data || !Array.isArray(data.areas)) throw new Error("bad shape");
        return { areas: data.areas };
      })
      .catch(function () {
        return loadJson(PLANTS_JSON).then(function (data) {
          if (!data || !Array.isArray(data.areas)) throw new Error("bad shape");
          return data;
        });
      })
      .catch(function () {
        var embedded = readEmbeddedJson("plants-embed");
        if (embedded && Array.isArray(embedded.areas)) return embedded;
        return hardcodedFallback();
      });
  }

  function loadGrowthRecords() {
    return loadJson(API_GROWTH)
      .then(function (data) {
        if (data && Array.isArray(data.records)) return data.records;
        if (Array.isArray(data)) return data;
        throw new Error("bad shape");
      })
      .catch(function () {
        return loadJson(GROWTH_SNAPSHOT_JSON).then(function (data) {
          if (data && Array.isArray(data.records)) return data.records;
          throw new Error("bad snapshot");
        });
      })
      .catch(function () {
        var snap = window.__PLANTING_GROWTH_SNAPSHOT__;
        if (snap && Array.isArray(snap.records)) return snap.records;
        return [];
      });
  }

  function loadAreaGrowthRecords() {
    return loadJson(API_AREA_GROWTH)
      .then(function (data) {
        if (data && Array.isArray(data.records)) return data.records;
        if (Array.isArray(data)) return data;
        throw new Error("bad shape");
      })
      .catch(function () {
        return loadJson(AREA_GROWTH_SNAPSHOT_JSON).then(function (data) {
          if (data && Array.isArray(data.records)) return data.records;
          throw new Error("bad snapshot");
        });
      })
      .catch(function () {
        var snap = window.__PLANTING_AREA_GROWTH_SNAPSHOT__;
        if (snap && Array.isArray(snap.records)) return snap.records;
        var embedded = readEmbeddedJson("area-growth-embed");
        if (embedded && Array.isArray(embedded.records)) return embedded.records;
        return [];
      });
  }

  function loadAreaDetailEntries() {
    return loadJson(API_AREA_DETAILS)
      .then(function (data) {
        if (data && Array.isArray(data.entries)) return data.entries;
        throw new Error("bad shape");
      })
      .catch(function () {
        return loadJson(AREA_DETAILS_JSON).then(function (data) {
          if (data && Array.isArray(data.entries)) return data.entries;
          throw new Error("bad shape");
        });
      })
      .catch(function () {
        var embedded = readEmbeddedJson("area-details-embed");
        if (embedded && Array.isArray(embedded.entries)) return embedded.entries;
        return [];
      });
  }

  Promise.all([
    loadPlantsData(),
    loadGrowthRecords(),
    loadAreaGrowthRecords(),
    loadAreaDetailEntries(),
  ])
    .then(function (results) {
      var plantsData = results[0];
      var growthRecords = results[1];
      var areaGrowthRecords = results[2];
      var areaDetailEntries = results[3];
      var areaPhotoMap = Object.assign(
        Object.create(null),
        buildStaticAreaPhotoMap(areaDetailEntries),
        buildLatestAreaPhotoMap(growthRecords),
        buildLatestAreaPhotoMap(areaGrowthRecords)
      );
      renderAreas(plantsData, areaPhotoMap);
    })
    .catch(function () {
      root.innerHTML = "";
      var p = document.createElement("p");
      p.className = "plant-load-error";
      p.textContent = "エリア一覧の読み込みに失敗しました。";
      root.appendChild(p);
    });
})();