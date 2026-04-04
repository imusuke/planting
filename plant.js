(function () {
  "use strict";

  var API_GROWTH_IMAGE = "/api/growth-image";
  var API_GROWTH = "/api/growth";
  var API_PLANT_DETAILS = "/api/plant-details";
  var GROWTH_SNAPSHOT_JSON = "./data/growth-snapshot.json";

  var root = document.getElementById("plant-detail-root");
  var titleEl = document.getElementById("plant-detail-title");
  var areaLineEl = document.getElementById("plant-detail-area-line");
  var crumbEl = document.getElementById("plant-detail-breadcrumb-current");
  var detailEditLinkEl = document.getElementById("plant-detail-edit-link");
  var recordEditLinkEl = document.getElementById("plant-detail-record-edit-link");
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

  function bindLightboxImage(img, configOrFactory) {
    if (!window.PlantingPhotoLightbox || typeof window.PlantingPhotoLightbox.bindImage !== "function") {
      return;
    }
    window.PlantingPhotoLightbox.bindImage(img, configOrFactory);
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

  function readWindowSnapshotRecords(key) {
    var data = window[key];
    return data && Array.isArray(data.records) ? data.records : [];
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
          memo: String(im.memo || "").trim(),
        };
      });
    }
    if (r.localSnapshotImage || r.imagePathname || r.imageUrl) {
      return [
        {
          imageUrl: r.imageUrl || null,
          imagePathname: r.imagePathname || null,
          localSnapshotImage: r.localSnapshotImage || null,
          memo: "",
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
            return readWindowSnapshotRecords("__PLANTING_GROWTH_SNAPSHOT__");
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

  function collectRecordsForPlant(records, plantName, areaId) {
    var rows = [];
    if (!Array.isArray(records)) return rows;
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (!recordHasPlantInArea(r, plantName, areaId)) continue;
      rows.push(r);
    }
    rows.sort(function (a, b) {
      var ad = String((a && (a.recordedAt || a.createdAt)) || "");
      var bd = String((b && (b.recordedAt || b.createdAt)) || "");
      return bd.localeCompare(ad);
    });
    return rows;
  }

  function loadDetailsData() {
    function pickEntries(fromNet, fromEmb) {
      var a = Array.isArray(fromNet) ? fromNet : [];
      var b = Array.isArray(fromEmb) ? fromEmb : [];
      if (b.length > a.length) return b;
      return a.length ? a : b;
    }
    return loadJson(API_PLANT_DETAILS)
      .then(function (data) {
        if (!data || !Array.isArray(data.entries)) throw new Error("shape");
        return data.entries;
      })
      .catch(function () {
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
      });
  }

  function buildQuery(pathname, params) {
    var pairs = [];
    if (params && params.id) pairs.push("id=" + encodeURIComponent(params.id));
    if (params && params.area) pairs.push("area=" + encodeURIComponent(params.area));
    if (params && params.plant) pairs.push("plant=" + encodeURIComponent(params.plant));
    return pathname + (pairs.length ? "?" + pairs.join("&") : "");
  }

  function formatDateLabel(value) {
    var text = String(value || "").trim();
    if (!text) return "日付未設定";
    return text.slice(0, 10) || text;
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

  function clearRoot() {
    root.innerHTML = "";
  }

  function renderError(message) {
    document.title = "植栽 — 植栽メモ";
    clearRoot();
    var p = document.createElement("p");
    p.className = "plant-detail-error";
    p.textContent = message;
    root.appendChild(p);
    titleEl.textContent = "植栽";
    if (crumbEl) crumbEl.textContent = "エラー";
    if (areaLineEl) {
      areaLineEl.hidden = true;
      areaLineEl.textContent = "";
    }
  }

  function renderDetailSection(entry) {
    var section = document.createElement("section");
    section.className = "plant-detail-section";

    var h = document.createElement("h2");
    h.className = "plant-detail-section-heading";
    h.textContent = "詳しいメモ";
    section.appendChild(h);

    var bodyWrap = document.createElement("div");
    bodyWrap.className = "plant-detail-body";
    if (entry && entry.body) {
      renderBody(bodyWrap, entry.body);
    }
    if (!bodyWrap.childElementCount) {
      var hint = document.createElement("p");
      hint.className = "plant-detail-placeholder";
      hint.textContent =
        "この植栽の解説や手入れメモは、まだ登録されていません。植栽の説明を編集から追加できます。";
      bodyWrap.appendChild(hint);
    }
    section.appendChild(bodyWrap);

    return section;
  }

  function renderTimelineSection(area, plantName, records) {
    var section = document.createElement("section");
    section.className = "plant-detail-section plant-timeline";

    var h = document.createElement("h2");
    h.className = "plant-detail-section-heading";
    h.textContent = "記録の時系列";
    section.appendChild(h);

    var items = collectRecordsForPlant(records, plantName, area.id);
    if (!items.length) {
      var empty = document.createElement("p");
      empty.className = "plant-detail-placeholder";
      empty.textContent =
        "この植栽の記録はまだありません。記録を追加すると、ここに時系列で並びます。";
      section.appendChild(empty);
      return section;
    }

    var list = document.createElement("div");
    list.className = "plant-timeline-list";

    for (var i = 0; i < items.length; i++) {
      var record = items[i];
      var card = document.createElement("article");
      card.className = "plant-timeline-entry";

      var head = document.createElement("div");
      head.className = "plant-timeline-entry-head";
      var dateEl = document.createElement("h3");
      dateEl.className = "plant-timeline-entry-date";
      dateEl.textContent = formatDateLabel(record.recordedAt);
      head.appendChild(dateEl);

      var companionPlants = [];
      if (Array.isArray(record.plants)) {
        for (var pi = 0; pi < record.plants.length; pi++) {
          var companion = normalizePlantName(record.plants[pi]);
          if (!companion || companion === plantName) continue;
          companionPlants.push(companion);
        }
      }
      if (companionPlants.length) {
        var meta = document.createElement("p");
        meta.className = "plant-timeline-entry-meta";
        meta.textContent = "同じ記録に含まれる植栽: " + companionPlants.join(" / ");
        head.appendChild(meta);
      }
      card.appendChild(head);

      var note = String((record && record.note) || "").trim();
      if (note) {
        var noteEl = document.createElement("p");
        noteEl.className = "plant-timeline-entry-note";
        noteEl.textContent = note;
        card.appendChild(noteEl);
      }

      var slots = growthImageSlots(record);
      if (slots.length) {
        var grid = document.createElement("div");
        grid.className = "plant-timeline-media-grid";
        var galleryNodes = [];
        var galleryCaptions = [];
        for (var si = 0; si < slots.length; si++) {
          (function (slot) {
            var src = growthImageSrcFromSlot(slot);
            if (!src) return;
            var fig = document.createElement("figure");
            fig.className = "plant-timeline-photo";
            var img = document.createElement("img");
            img.className = "plant-timeline-photo-img";
            img.src = src;
            img.alt = plantName + "の記録写真";
            img.loading = "lazy";
            img.decoding = "async";
            img.referrerPolicy = "no-referrer";
            img.addEventListener("error", function onPlantPhotoErr() {
              img.removeEventListener("error", onPlantPhotoErr);
              if (img.dataset.plantPhotoFb === "1") return;
              if (!slot || !slot.localSnapshotImage) return;
              var fb = slot.imageUrl || "";
              if (!fb && slot.imagePathname) {
                fb = API_GROWTH_IMAGE + "?pathname=" + encodeURIComponent(slot.imagePathname);
              }
              if (fb) {
                img.dataset.plantPhotoFb = "1";
                img.src = fb;
              }
            });
            fig.appendChild(img);
            var captionText = formatDateLabel(record.recordedAt);
            if (slot.memo) {
              captionText += " — " + slot.memo;
            }
            if (slot.memo) {
              var cap = document.createElement("figcaption");
              cap.className = "plant-timeline-photo-caption";
              cap.textContent = slot.memo;
              fig.appendChild(cap);
            }
            var galleryIndex = galleryNodes.length;
            galleryNodes.push(img);
            galleryCaptions.push(captionText);
            bindLightboxImage(img, function () {
              return {
                items: galleryNodes.map(function (node, idx) {
                  return {
                    src: node.currentSrc || node.src || "",
                    alt: node.alt || "",
                    caption: galleryCaptions[idx] || "",
                  };
                }),
                index: galleryIndex,
              };
            });
            grid.appendChild(fig);
          })(slots[si]);
        }
        if (grid.childElementCount) {
          card.appendChild(grid);
        }
      }

      if (!note && !slots.length) {
        var emptyState = document.createElement("p");
        emptyState.className = "plant-timeline-entry-empty";
        emptyState.textContent = "この記録には写真やコメントがありません。";
        card.appendChild(emptyState);
      }

      var actions = document.createElement("p");
      actions.className = "plant-timeline-entry-actions";
      var editLink = document.createElement("a");
      editLink.className = "plant-detail-link";
      editLink.href = buildQuery("./growth-edit.html", {
        id: record.id || "",
        area: area.id,
        plant: plantName,
      });
      editLink.textContent = "この記録を編集";
      actions.appendChild(editLink);
      card.appendChild(actions);

      list.appendChild(card);
    }

    section.appendChild(list);
    return section;
  }

  function renderPage(area, plantName, entry, options) {
    options = options || {};
    clearRoot();

    if (options.warnMultipleAreaMatch) {
      var wMulti = document.createElement("p");
      wMulti.className = "plant-detail-warning";
      wMulti.setAttribute("role", "status");
      wMulti.textContent =
        "同じ植栽名が複数エリアにあります。このページはそのうちの1つを表示しています。エリアを確実に指定するには、植栽一覧からエリア付きで開いてください。";
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

    if (detailEditLinkEl) {
      detailEditLinkEl.href = buildQuery("./plant-edit.html", {
        area: area.id,
        plant: plantName,
      });
      detailEditLinkEl.textContent = "この植栽の説明を編集";
    }
    if (recordEditLinkEl) {
      recordEditLinkEl.href = buildQuery("./growth-edit.html", {
        area: area.id,
        plant: plantName,
      });
      recordEditLinkEl.textContent = "この植栽の記録を追加・編集";
    }

    if (areaLineEl) {
      areaLineEl.hidden = false;
      areaLineEl.innerHTML = "";
      var areaLink = document.createElement("a");
      areaLink.href = "./area.html?area=" + encodeURIComponent(area.id);
      areaLink.className = "plant-detail-area-link";
      areaLink.textContent = "エリア: " + (area.label || area.id);
      areaLink.setAttribute("title", "このエリアのページへ");
      areaLineEl.appendChild(areaLink);
    }

    if (entry && entry.summary) {
      var sum = document.createElement("p");
      sum.className = "plant-detail-summary";
      sum.textContent = entry.summary;
      root.appendChild(sum);
    }

    root.appendChild(renderDetailSection(entry));
    root.appendChild(renderTimelineSection(area, plantName, options.growthRecords || []));

    var actions = document.createElement("p");
    actions.className = "plant-detail-actions";

    var aDetail = document.createElement("a");
    aDetail.className = "plant-detail-cta";
    aDetail.href = buildQuery("./plant-edit.html", {
      area: area.id,
      plant: plantName,
    });
    aDetail.textContent = "この植栽の説明を編集";
    actions.appendChild(aDetail);

    var aRecord = document.createElement("a");
    aRecord.className = "plant-detail-cta";
    aRecord.href = buildQuery("./growth-edit.html", {
      area: area.id,
      plant: plantName,
    });
    aRecord.textContent = "この植栽の記録を追加・編集";
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
