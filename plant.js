(function () {
  "use strict";

  var API_GROWTH_IMAGE = "/api/growth-image";
  var API_GROWTH = "/api/growth";
  var GROWTH_SNAPSHOT_JSON = "./data/growth-snapshot.json";

  var root = document.getElementById("plant-detail-root");
  var titleEl = document.getElementById("plant-detail-title");
  var areaLineEl = document.getElementById("plant-detail-area-line");
  var crumbEl = document.getElementById("plant-detail-breadcrumb-current");
  if (!root || !titleEl) return;

  function readEmbeddedPlants() {
    var el = document.getElementById("plants-embed");
    if (!el || !el.textContent.trim()) return null;
    try {
      return JSON.parse(el.textContent.trim());
    } catch (e) {
      return null;
    }
  }

  function readEmbeddedPlantDetails() {
    var el = document.getElementById("plant-details-embed");
    if (!el || !el.textContent.trim()) return null;
    try {
      return JSON.parse(el.textContent.trim());
    } catch (e) {
      return null;
    }
  }

  function normalizePlantName(p) {
    return typeof p === "string" ? p.trim() : "";
  }

  function areaHasPlant(area, plantName) {
    if (!area || !Array.isArray(area.plants)) return false;
    for (var i = 0; i < area.plants.length; i++) {
      if (normalizePlantName(area.plants[i]) === plantName) return true;
    }
    return false;
  }

  function findDetailEntry(entries, areaId, plantName) {
    if (!Array.isArray(entries)) return null;
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      if (!e) continue;
      if (e.areaId === areaId && normalizePlantName(e.name) === plantName) {
        return e;
      }
    }
    return null;
  }

  function loadJson(path) {
    return fetch(path, { cache: "no-store" }).then(function (res) {
      if (!res.ok) throw new Error("bad status");
      return res.json();
    });
  }

  function loadPlantsData() {
    return loadJson("/api/plants")
      .then(function (data) {
        if (!data || !Array.isArray(data.areas)) throw new Error("shape");
        return data;
      })
      .catch(function () {
        return loadJson("data/plants.json");
      })
      .catch(function () {
        var embedded = readEmbeddedPlants();
        if (embedded && Array.isArray(embedded.areas)) return embedded;
        throw new Error("no plants");
      });
  }

  function growthImageSlots(r) {
    if (!r) return [];
    if (r.images && Array.isArray(r.images) && r.images.length) {
      return r.images.map(function (im) {
        if (!im || typeof im !== "object") return {};
        return {
          imageUrl: im.imageUrl || null,
          imagePathname: im.imagePathname || null,
          localSnapshotImage: im.localSnapshotImage || null,
        };
      });
    }
    if (r.localSnapshotImage || r.imagePathname || r.imageUrl) {
      return [
        {
          imageUrl: r.imageUrl || null,
          imagePathname: r.imagePathname || null,
          localSnapshotImage: r.localSnapshotImage || null,
        },
      ];
    }
    return [];
  }

  function growthImageSrcFromSlot(slot) {
    if (!slot) return null;
    if (slot.localSnapshotImage) {
      var p = String(slot.localSnapshotImage).trim();
      if (/^https?:\/\//i.test(p)) {
        return p;
      }
      try {
        return new URL(p, window.location.href).href;
      } catch (e0) {
        return p;
      }
    }
    if (slot.imagePathname) {
      return API_GROWTH_IMAGE + "?pathname=" + encodeURIComponent(slot.imagePathname);
    }
    return slot.imageUrl || null;
  }

  function loadGrowthRecordsList() {
    return fetch(API_GROWTH, {
      headers: { Accept: "application/json" },
    })
      .then(function (res) {
        if (!res.ok) throw new Error("growth bad");
        return res.json();
      })
      .then(function (data) {
        return Array.isArray(data.records) ? data.records : [];
      })
      .catch(function () {
        return fetch(GROWTH_SNAPSHOT_JSON, { cache: "no-store" })
          .then(function (res) {
            if (!res.ok) return null;
            return res.json();
          })
          .then(function (data) {
            return data && Array.isArray(data.records) ? data.records : [];
          })
          .catch(function () {
            return [];
          });
      });
  }

  function recordHasPlantInArea(r, plantName, areaId) {
    if (!r || !Array.isArray(r.plants)) return false;
    var has = false;
    for (var i = 0; i < r.plants.length; i++) {
      if (normalizePlantName(r.plants[i]) === plantName) {
        has = true;
        break;
      }
    }
    if (!has) return false;
    if (!areaId) return true;
    return String(r.areaId || "").trim() === String(areaId).trim();
  }

  function collectPhotosForPlant(records, plantName, areaId) {
    var rows = [];
    if (!Array.isArray(records)) return rows;
    for (var ri = 0; ri < records.length; ri++) {
      var r = records[ri];
      if (!recordHasPlantInArea(r, plantName, areaId)) continue;
      var slots = growthImageSlots(r);
      for (var si = 0; si < slots.length; si++) {
        var url = growthImageSrcFromSlot(slots[si]);
        if (!url) continue;
        rows.push({
          recordedAt: r.recordedAt || "",
          url: url,
          slot: slots[si],
        });
      }
    }
    rows.sort(function (a, b) {
      return (b.recordedAt || "").localeCompare(a.recordedAt || "");
    });
    var seen = {};
    var out = [];
    for (var j = 0; j < rows.length; j++) {
      var u = rows[j].url;
      if (seen[u]) continue;
      seen[u] = true;
      out.push(rows[j]);
    }
    return out;
  }

  function renderGrowthPhotosSection(plantName, areaId, records) {
    var section = document.createElement("section");
    section.className = "plant-detail-photos";
    var h = document.createElement("h2");
    h.className = "plant-detail-photos-heading";
    h.textContent = "成長記録の写真";
    section.appendChild(h);

    var items = collectPhotosForPlant(records, plantName, areaId);
    if (items.length === 0) {
      var empty = document.createElement("p");
      empty.className = "plant-detail-photos-empty";
      empty.textContent =
        "この植栽・エリアの記録写真はまだありません。成長記録に写真を追加すると、ここに表示されます。";
      section.appendChild(empty);
      return section;
    }

    var grid = document.createElement("div");
    grid.className = "plant-detail-photos-grid";
    for (var k = 0; k < items.length; k++) {
      (function (it) {
        var fig = document.createElement("figure");
        fig.className = "plant-detail-photo-figure";
        var img = document.createElement("img");
        img.className = "plant-detail-photo-img";
        img.src = it.url;
        img.alt = plantName + "の記録写真";
        img.loading = "lazy";
        img.decoding = "async";
        img.referrerPolicy = "no-referrer";
        img.addEventListener("error", function onPlantPhotoErr() {
          img.removeEventListener("error", onPlantPhotoErr);
          if (img.dataset.plantPhotoFb === "1") return;
          var sl = it.slot;
          if (!sl || !sl.localSnapshotImage) return;
          var fb = sl.imageUrl || "";
          if (!fb && sl.imagePathname) {
            fb = API_GROWTH_IMAGE + "?pathname=" + encodeURIComponent(sl.imagePathname);
          }
          if (fb) {
            img.dataset.plantPhotoFb = "1";
            img.src = fb;
          }
        });
        fig.appendChild(img);
        var cap = document.createElement("figcaption");
        cap.className = "plant-detail-photo-date";
        cap.textContent = (it.recordedAt || "").slice(0, 10) || "—";
        fig.appendChild(cap);
        grid.appendChild(fig);
      })(items[k]);
    }
    section.appendChild(grid);

    var more = document.createElement("p");
    more.className = "plant-detail-photos-more";
    var a = document.createElement("a");
    a.href =
      "./index.html?view=timeline&plant=" +
      encodeURIComponent(plantName) +
      "&area=" +
      encodeURIComponent(areaId);
    a.className = "plant-detail-link";
    a.textContent = "成長記録で植栽別・時系列を開く";
    more.appendChild(a);
    section.appendChild(more);

    return section;
  }

  function loadDetailsData() {
    function pickEntries(fromNet, fromEmb) {
      var a = Array.isArray(fromNet) ? fromNet : [];
      var b = Array.isArray(fromEmb) ? fromEmb : [];
      if (b.length > a.length) return b;
      return a.length ? a : b;
    }
    return loadJson("data/plant-details.json")
      .then(function (data) {
        var fromNet = data && Array.isArray(data.entries) ? data.entries : [];
        var emb = readEmbeddedPlantDetails();
        var fromEmb = emb && Array.isArray(emb.entries) ? emb.entries : [];
        return pickEntries(fromNet, fromEmb);
      })
      .catch(function () {
        var embedded = readEmbeddedPlantDetails();
        if (embedded && Array.isArray(embedded.entries)) {
          return embedded.entries;
        }
        return [];
      });
  }

  function clearRoot() {
    root.innerHTML = "";
  }

  function renderError(message) {
    document.title = "植栽の詳細 — 植栽メモ";
    clearRoot();
    var p = document.createElement("p");
    p.className = "plant-detail-error";
    p.textContent = message;
    root.appendChild(p);
    titleEl.textContent = "植栽の詳細";
    if (crumbEl) crumbEl.textContent = "エラー";
    if (areaLineEl) {
      areaLineEl.hidden = true;
      areaLineEl.textContent = "";
    }
  }

  function renderBody(container, text) {
    if (!text || !String(text).trim()) return;
    var parts = String(text).split(/\n\n+/);
    for (var i = 0; i < parts.length; i++) {
      var chunk = parts[i].trim();
      if (!chunk) continue;
      var p = document.createElement("p");
      p.className = "plant-detail-body-p";
      p.textContent = chunk;
      container.appendChild(p);
    }
  }

  function renderPage(area, plantName, entry, options) {
    options = options || {};
    clearRoot();
    if (options.warnMultipleAreaMatch) {
      var wMulti = document.createElement("p");
      wMulti.className = "plant-detail-warning";
      wMulti.setAttribute("role", "status");
      wMulti.textContent =
        "同じ植栽名が複数エリアにあります。このページはそのうちの1つを表示しています。エリアを確実に指定するには、成長記録にエリアが紐づいている状態にするか、植栽一覧の「詳細」から開いてください。";
      root.appendChild(wMulti);
    }
    if (options.warnNotInMaster) {
      var warn = document.createElement("p");
      warn.className = "plant-detail-warning";
      warn.setAttribute("role", "status");
      warn.textContent =
        "植栽一覧のマスタに「" +
        plantName +
        "」が見つかりませんでした（表記の違い、または一覧へ未反映の可能性があります）。成長記録の名前と植栽一覧を照合してください。";
      root.appendChild(warn);
    }
    document.title = plantName + " — 植栽メモ";
    titleEl.textContent = plantName;
    if (crumbEl) crumbEl.textContent = plantName;
    if (areaLineEl) {
      areaLineEl.hidden = false;
      areaLineEl.textContent = "エリア: " + (area.label || area.id);
    }

    if (entry && entry.summary) {
      var sum = document.createElement("p");
      sum.className = "plant-detail-summary";
      sum.textContent = entry.summary;
      root.appendChild(sum);
    }

    root.appendChild(
      renderGrowthPhotosSection(plantName, area.id, options.growthRecords || [])
    );

    var bodyWrap = document.createElement("div");
    bodyWrap.className = "plant-detail-body";
    if (entry && entry.body) {
      renderBody(bodyWrap, entry.body);
    }
    if (!bodyWrap.childElementCount) {
      var hint = document.createElement("p");
      hint.className = "plant-detail-placeholder";
      hint.textContent =
        "この植栽の解説や手入れメモは、まだ登録されていません。リポジトリの data/plant-details.json に、areaId・name・summary・body を追加して編集してください。段落は空行で区切ります。";
      bodyWrap.appendChild(hint);
    }
    root.appendChild(bodyWrap);

    var actions = document.createElement("p");
    actions.className = "plant-detail-actions";
    var aRecord = document.createElement("a");
    aRecord.className = "plant-detail-cta";
    aRecord.href =
      "./growth-edit.html?area=" +
      encodeURIComponent(area.id) +
      "&plant=" +
      encodeURIComponent(plantName);
    aRecord.textContent = "この植栽で成長記録を追加・編集";
    actions.appendChild(aRecord);
    root.appendChild(actions);
  }

  var params = new URLSearchParams(window.location.search);
  var areaId = (params.get("area") || "").trim();
  var plantName = params.get("plant") || "";
  try {
    plantName = decodeURIComponent(plantName).trim();
  } catch (e2) {
    plantName = plantName.trim();
  }

  if (!plantName) {
    renderError(
      "URL に植栽名が必要です。例: plant.html?area=entrance&plant=" +
        encodeURIComponent("ノリウツギ") +
        " （エリア省略時は名前が一覧に1件だけのときに自動で特定します）"
    );
    return;
  }

  Promise.all([loadPlantsData(), loadDetailsData(), loadGrowthRecordsList()])
    .then(function (results) {
      var plantsData = results[0];
      var entries = results[1];
      var growthRecords = results[2] || [];
      var areas = plantsData.areas || [];
      var area;
      var warnMulti = false;
      var resolvedAreaId;

      if (areaId) {
        area = areas.find(function (a) {
          return a && a.id === areaId;
        });
        if (!area) {
          renderError("指定されたエリアが見つかりません。");
          return;
        }
        resolvedAreaId = areaId;
      } else {
        var matches = areas.filter(function (a) {
          return a && areaHasPlant(a, plantName);
        });
        if (matches.length === 0) {
          renderError(
            "植栽「" +
              plantName +
              "」が一覧のどのエリアにも見つかりません。URL に area=（エリアid）を付けるか、表記を植栽一覧とそろえてください。"
          );
          return;
        }
        area = matches[0];
        resolvedAreaId = area.id;
        warnMulti = matches.length > 1;
      }

      var inMaster = areaHasPlant(area, plantName);
      var entry = findDetailEntry(entries, resolvedAreaId, plantName);
      renderPage(area, plantName, entry, {
        warnNotInMaster: !!areaId && !inMaster,
        warnMultipleAreaMatch: warnMulti,
        growthRecords: growthRecords,
      });
    })
    .catch(function () {
      renderError("データを読み込めませんでした。data/plants.json またはネットワークを確認してください。");
    });
})();
