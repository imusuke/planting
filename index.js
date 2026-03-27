(function () {
  "use strict";

  var API_PLANTS = "/api/plants";
  var API_GROWTH = "/api/growth";
  var API_GROWTH_IMAGE = "/api/growth-image";
  var PLANTS_JSON = "data/plants.json";
  var GROWTH_SNAPSHOT_JSON = "data/growth-snapshot.json";

  var tbody = document.getElementById("plant-table-body");
  if (!tbody) return;

  function loadJson(path) {
    return fetch(path, { cache: "no-store" }).then(function (res) {
      if (!res.ok) throw new Error("bad status");
      return res.json();
    });
  }

  function readEmbeddedPlants() {
    var el = document.getElementById("plants-embed");
    if (!el || !el.textContent || !el.textContent.trim()) {
      return null;
    }
    try {
      return JSON.parse(el.textContent.trim());
    } catch (e) {
      return null;
    }
  }

  function normalizePlantName(name) {
    return String(name || "").trim();
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

  function compareGrowthRecords(a, b) {
    var aTime = Date.parse((a && (a.recordedAt || a.createdAt)) || "") || 0;
    var bTime = Date.parse((b && (b.recordedAt || b.createdAt)) || "") || 0;
    if (aTime !== bTime) return bTime - aTime;
    return String((b && b.id) || "").localeCompare(String((a && a.id) || ""));
  }

  function buildLatestPlantPhotoMap(records) {
    var map = Object.create(null);
    if (!Array.isArray(records) || !records.length) return map;

    records.slice().sort(compareGrowthRecords).forEach(function (record) {
      var areaId = String((record && record.areaId) || "").trim();
      var slot = growthImageSlots(record)[0];
      var src = growthImageSrcFromSlot(slot);
      if (!src) return;

      var plants = Array.isArray(record.plants) ? record.plants : [];
      plants.forEach(function (plantName) {
        var normalized = normalizePlantName(plantName);
        if (!normalized) return;
        var key = areaId + "::" + normalized;
        if (!map[key]) {
          map[key] = {
            src: src,
            alt: normalized + " の最新写真",
          };
        }
      });
    });

    return map;
  }

  function createEmptyRow(message, className) {
    var tr = document.createElement("tr");
    var td = document.createElement("td");
    td.colSpan = 2;
    td.className = className;
    td.textContent = message;
    tr.appendChild(td);
    return tr;
  }

  function renderTable(data, photoMap) {
    tbody.innerHTML = "";

    var areas = data && Array.isArray(data.areas) ? data.areas : [];
    if (!areas.length) {
      tbody.appendChild(createEmptyRow("植栽一覧がまだありません。", "plant-load-error"));
      return;
    }

    areas.forEach(function (area) {
      var tr = document.createElement("tr");

      var tdArea = document.createElement("td");
      var areaPage = document.createElement("a");
      areaPage.href = "area.html?area=" + encodeURIComponent(area.id);
      areaPage.className = "plant-area-link";
      areaPage.textContent = area.label;
      areaPage.setAttribute("title", area.label + " のエリア詳細を開く");
      tdArea.appendChild(areaPage);

      var tdPlants = document.createElement("td");
      tdPlants.className = "plant-table-plants";

      if (!Array.isArray(area.plants) || area.plants.length === 0) {
        var empty = document.createElement("span");
        empty.className = "plant-empty";
        empty.textContent = "植栽なし";
        tdPlants.appendChild(empty);
      } else {
        area.plants.forEach(function (plantName, index) {
          if (index > 0) {
            var sep = document.createElement("span");
            sep.className = "plant-sep";
            sep.textContent = "、";
            tdPlants.appendChild(sep);
          }

          var group = document.createElement("span");
          group.className = "plant-table-name-group";

          var link = document.createElement("a");
          link.className = "plant-record-link plant-record-link--with-thumb";
          link.href =
            "index.html?view=timeline&area=" +
            encodeURIComponent(area.id) +
            "&plant=" +
            encodeURIComponent(plantName);
          link.setAttribute("title", plantName + " の成長記録（時系列）を開く");

          var name = document.createElement("span");
          name.className = "plant-record-name";
          name.textContent = plantName;
          link.appendChild(name);

          var photo = photoMap[String(area.id || "").trim() + "::" + normalizePlantName(plantName)];
          if (photo && photo.src) {
            var thumb = document.createElement("span");
            thumb.className = "plant-record-thumb";

            var img = document.createElement("img");
            img.className = "plant-record-thumb-img";
            img.src = photo.src;
            img.alt = photo.alt;
            img.loading = "lazy";
            img.decoding = "async";
            img.referrerPolicy = "no-referrer";
            img.addEventListener("error", function () {
              thumb.remove();
            });

            thumb.appendChild(img);
            link.appendChild(thumb);
          }

          group.appendChild(link);
          tdPlants.appendChild(group);
        });
      }

      tr.appendChild(tdArea);
      tr.appendChild(tdPlants);
      tbody.appendChild(tr);
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
        var embedded = readEmbeddedPlants();
        if (embedded && Array.isArray(embedded.areas)) return embedded;
        throw new Error("no plant data");
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

  Promise.all([loadPlantsData(), loadGrowthRecords()])
    .then(function (results) {
      var plantsData = results[0];
      var growthRecords = results[1];
      renderTable(plantsData, buildLatestPlantPhotoMap(growthRecords));
    })
    .catch(function () {
      tbody.innerHTML = "";
      tbody.appendChild(
        createEmptyRow(
          "植栽一覧の読み込みに失敗しました。data/plants.json と埋め込みデータを確認してください。",
          "plant-load-error"
        )
      );
    });
})();
