(function () {
  "use strict";

  var API_GROWTH_IMAGE = "/api/growth-image";
  var API_GROWTH = "/api/growth";
  var API_PLANT_DETAILS = "/api/plant-details";
  var GROWTH_SNAPSHOT_JSON = "./data/growth-snapshot.json";

  var root = document.getElementById("plant-page-root");
  var titleEl = document.getElementById("plant-page-title");
  var areaLineEl = document.getElementById("plant-page-area-line");
  var crumbEl = document.getElementById("plant-page-breadcrumb-current");
  var detailEditLinkEl = document.getElementById("plant-page-edit-link");
  var recordEditLinkEl = document.getElementById("plant-page-record-edit-link");
  var detailPage = window.PlantingDetailPage || {};
  if (!root || !titleEl) return;

  var bindLightboxImage =
    detailPage.bindLightboxImage ||
    function (img, configOrFactory) {
      if (!window.PlantingPhotoLightbox || typeof window.PlantingPhotoLightbox.bindImage !== "function") {
        return false;
      }
      window.PlantingPhotoLightbox.bindImage(img, configOrFactory);
      return true;
    };
  var bindLightboxGalleryImage =
    detailPage.bindLightboxGalleryImage ||
    function (img, galleryNodes, galleryCaptions, galleryIndex) {
      return bindLightboxImage(img, function () {
        return {
          items: (galleryNodes || []).map(function (node, idx) {
            return {
              src: (node && (node.currentSrc || node.src)) || "",
              alt: (node && node.alt) || "",
              caption: (galleryCaptions && galleryCaptions[idx]) || "",
            };
          }),
          index: galleryIndex || 0,
        };
      });
    };
  var attachSnapshotFallback =
    detailPage.attachSnapshotFallback ||
    function (img, slot, apiPath, datasetKey) {
      if (!img) return;
      img.addEventListener("error", function onSnapshotFallback() {
        img.removeEventListener("error", onSnapshotFallback);
        var key = datasetKey || "snapshotFallback";
        if (img.dataset[key] === "1") return;
        if (!slot || !slot.localSnapshotImage) return;
        var fb = slot.imageUrl || "";
        if (!fb && slot.imagePathname && apiPath) {
          fb = apiPath + "?pathname=" + encodeURIComponent(slot.imagePathname);
        }
        if (!fb) return;
        img.dataset[key] = "1";
        img.src = fb;
      });
    };

  var buildQuery =
    detailPage.buildQuery ||
    function (pathname, params) {
      var pairs = [];
      if (params && params.id) pairs.push("id=" + encodeURIComponent(params.id));
      if (params && params.area) pairs.push("area=" + encodeURIComponent(params.area));
      if (params && params.plant) pairs.push("plant=" + encodeURIComponent(params.plant));
      return pathname + (pairs.length ? "?" + pairs.join("&") : "");
    };

  var clearDetailRoot =
    detailPage.clearRoot ||
    function (el) {
      if (el) el.innerHTML = "";
    };
  var createDetailLink =
    detailPage.createLink ||
    function (href, text, className, title) {
      var a = document.createElement("a");
      if (className) a.className = className;
      if (href) a.href = href;
      if (title) a.setAttribute("title", title);
      a.textContent = text || "";
      return a;
    };
  var createDetailImageFigure =
    detailPage.createImageFigure ||
    function (options) {
      var opts = options || {};
      var figure = document.createElement("figure");
      if (opts.figureClass) figure.className = opts.figureClass;
      var img = document.createElement("img");
      if (opts.imageClass) img.className = opts.imageClass;
      img.src = opts.src || "";
      img.alt = opts.alt || "";
      img.loading = opts.loading || "lazy";
      img.decoding = opts.decoding || "async";
      img.referrerPolicy = opts.referrerPolicy || "no-referrer";
      figure.appendChild(img);
      return { figure: figure, img: img };
    };

  var createDetailMessage =
    detailPage.createMessage ||
    function (className, text) {
      var p = document.createElement("p");
      if (className) p.className = className;
      p.textContent = text || "";
      return p;
    };
  var createDetailPlaceholder =
    detailPage.createPlaceholder ||
    function (text, className, tagName) {
      var el = document.createElement(tagName || "p");
      if (className) el.className = className;
      el.textContent = text || "";
      return el;
    };
  var createDetailSection =
    detailPage.createSection ||
    function (options) {
      var opts = options || {};
      var section = document.createElement(opts.tagName || "section");
      if (opts.className) section.className = opts.className;
      var heading = null;
      if (opts.headingText) {
        heading = document.createElement(opts.headingTag || "h2");
        if (opts.headingClass) heading.className = opts.headingClass;
        heading.textContent = opts.headingText;
        section.appendChild(heading);
      }
      return { section: section, heading: heading };
    };
  var appendDetailGalleryFigure =
    detailPage.appendGalleryFigure ||
    function (target, galleryNodes, galleryCaptions, options) {
      var opts = options || {};
      var figureParts = createDetailImageFigure(opts);
      var figure = figureParts.figure;
      var img = figureParts.img;
      if (opts.slot) {
        attachSnapshotFallback(img, opts.slot, opts.apiPath, opts.datasetKey);
      }
      if (opts.captionText) {
        figure.appendChild(
          createDetailPlaceholder(opts.captionText, opts.captionClass || "detail-page-photo-date", "figcaption")
        );
      }
      var galleryIndex = Array.isArray(galleryNodes) ? galleryNodes.length : 0;
      if (Array.isArray(galleryNodes)) galleryNodes.push(img);
      if (Array.isArray(galleryCaptions)) {
        galleryCaptions.push(opts.galleryCaptionText || opts.captionText || "");
      }
      bindLightboxGalleryImage(img, galleryNodes || [], galleryCaptions || [], galleryIndex);
      if (target) target.appendChild(figure);
      return { figure: figure, img: img };
    };

  var formatDateLabel =
    detailPage.formatDateLabel ||
    function (value) {
      var text = String(value || "").trim();
      if (!text) return "日付未設定";
      return text.slice(0, 10) || text;
    };

  var renderDetailBody =
    detailPage.renderBody ||
    function (container, text, paragraphClass) {
      if (!text || !String(text).trim()) return 0;
      var parts = String(text).split(/\n\n+/);
      var count = 0;
      for (var i = 0; i < parts.length; i++) {
        var chunk = parts[i].trim();
        if (!chunk) continue;
        container.appendChild(createDetailMessage(paragraphClass || "detail-page-body-p", chunk));
        count += 1;
      }
      return count;
    };

  var readEmbeddedJson =
    detailPage.readEmbeddedJson ||
    function (scriptId) {
      var el = document.getElementById(scriptId);
      if (!el || !String(el.textContent || "").trim()) return null;
      try {
        return JSON.parse(String(el.textContent).trim());
      } catch (e) {
        return null;
      }
    };

  var loadJson =
    detailPage.loadJson ||
    function (path) {
      return fetch(path, { cache: "no-store" }).then(function (res) {
        if (!res.ok) throw new Error("bad status");
        return res.json();
      });
    };

  var readSnapshotRecords =
    detailPage.readWindowSnapshotRecords ||
    function (key) {
      var data = window[key];
      return data && Array.isArray(data.records) ? data.records : [];
    };

  var normalizePlantName =
    detailPage.normalizePlantName ||
    function (value) {
      return typeof value === "string" ? value.trim() : "";
    };

  var loadPlantsData =
    detailPage.loadPlantsData ||
    function () {
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
    };

  var loadRecordList =
    detailPage.loadRecordList ||
    function (apiPath, snapshotPath, windowKey) {
      return fetch(apiPath, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      })
        .then(function (res) {
          if (!res.ok) throw new Error("api bad");
          return res.json();
        })
        .then(function (data) {
          return Array.isArray(data.records) ? data.records : [];
        })
        .catch(function () {
          if (!snapshotPath) return [];
          return fetch(snapshotPath, { cache: "no-store" })
            .then(function (res) {
              if (!res.ok) return null;
              return res.json();
            })
            .then(function (data) {
              return data && Array.isArray(data.records) ? data.records : [];
            })
            .catch(function () {
              return windowKey ? readSnapshotRecords(windowKey) : [];
            });
        });
    };

  var growthImageSlots =
    detailPage.growthImageSlots ||
    function (record) {
      if (!record) return [];
      if (record.images && Array.isArray(record.images) && record.images.length) {
        return record.images.map(function (image) {
          if (!image || typeof image !== "object") return {};
          return {
            imageUrl: image.imageUrl || null,
            imagePathname: image.imagePathname || null,
            localSnapshotImage: image.localSnapshotImage || null,
            memo: String(image.memo || "").trim(),
          };
        });
      }
      if (record.localSnapshotImage || record.imagePathname || record.imageUrl) {
        return [
          {
            imageUrl: record.imageUrl || null,
            imagePathname: record.imagePathname || null,
            localSnapshotImage: record.localSnapshotImage || null,
            memo: "",
          },
        ];
      }
      return [];
    };

  var growthImageSrcFromSlot =
    detailPage.growthImageSrcFromSlot
      ? function (slot) {
          return detailPage.growthImageSrcFromSlot(slot, API_GROWTH_IMAGE);
        }
      : function (slot) {
          if (!slot) return null;
          if (slot.localSnapshotImage) {
            var localPath = String(slot.localSnapshotImage).trim();
            if (/^https?:\/\//i.test(localPath)) {
              return localPath;
            }
            try {
              return new URL(localPath, window.location.href).href;
            } catch (e0) {
              return localPath;
            }
          }
          if (slot.imagePathname) {
            return API_GROWTH_IMAGE + "?pathname=" + encodeURIComponent(slot.imagePathname);
          }
          return slot.imageUrl || null;
        };

  function readEmbeddedPlants() {
    return readEmbeddedJson("plants-embed");
  }

  function readEmbeddedPlantDetails() {
    return readEmbeddedJson("plant-details-embed");
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

  function loadGrowthRecordsList() {
    return loadRecordList(API_GROWTH, GROWTH_SNAPSHOT_JSON, "__PLANTING_GROWTH_SNAPSHOT__");
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

  function renderError(message) {
    document.title = "植栽メモ — 植栽";
    clearDetailRoot(root);
    root.appendChild(createDetailMessage("detail-page-error", message));
    titleEl.textContent = "植栽";
    if (crumbEl) crumbEl.textContent = "エラー";
    if (areaLineEl) {
      areaLineEl.hidden = true;
      areaLineEl.textContent = "";
    }
  }

  function renderDetailSection(entry) {
    var sectionParts = createDetailSection({
      className: "detail-page-section",
      headingClass: "detail-page-section-heading",
      headingText: "詳細メモ",
    });
    var section = sectionParts.section;

    var bodyWrap = document.createElement("div");
    bodyWrap.className = "detail-page-body";
    if (entry && entry.body) {
      renderDetailBody(bodyWrap, entry.body, "detail-page-body-p");
    }
    if (!bodyWrap.childElementCount) {
      bodyWrap.appendChild(
        createDetailPlaceholder(
          "この植栽の詳細メモや手入れメモは、まだ登録されていません。植栽の詳細を編集から追加できます。",
          "detail-page-placeholder"
        )
      );
    }
    section.appendChild(bodyWrap);

    return section;
  }

  function renderTimelineSection(area, plantName, records) {
    var sectionParts = createDetailSection({
      className: "detail-page-section plant-timeline",
      headingClass: "detail-page-section-heading",
      headingText: "記録の時系列",
    });
    var section = sectionParts.section;

    var items = collectRecordsForPlant(records, plantName, area.id);
    if (!items.length) {
      section.appendChild(
        createDetailPlaceholder(
          "この植栽の記録はまだありません。記録を追加すると、ここに時系列で並びます。",
          "detail-page-placeholder"
        )
      );
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
            var captionText = formatDateLabel(record.recordedAt);
            if (slot.memo) {
              captionText += " — " + slot.memo;
            }
            appendDetailGalleryFigure(grid, galleryNodes, galleryCaptions, {
              figureClass: "plant-timeline-photo",
              imageClass: "plant-timeline-photo-img",
              src: src,
              alt: plantName + "の記録写真",
              slot: slot,
              apiPath: API_GROWTH_IMAGE,
              datasetKey: "plantPhotoFb",
              captionClass: "plant-timeline-photo-caption",
              captionText: slot.memo ? slot.memo : "",
              galleryCaptionText: captionText,
            });
          })(slots[si]);
        }
        if (grid.childElementCount) {
          card.appendChild(grid);
        }
      }

      if (!note && !slots.length) {
        card.appendChild(
          createDetailPlaceholder("この記録には写真やコメントがありません。", "plant-timeline-entry-empty")
        );
      }

      var actions = document.createElement("p");
      actions.className = "plant-timeline-entry-actions";
      var editLink = createDetailLink(
        buildQuery("./growth-edit.html", {
          id: record.id || "",
          area: area.id,
          plant: plantName,
        }),
        "この記録を編集",
        "detail-page-link"
      );
      actions.appendChild(editLink);
      card.appendChild(actions);

      list.appendChild(card);
    }

    section.appendChild(list);
    return section;
  }

  function renderPage(area, plantName, entry, options) {
    options = options || {};
    clearDetailRoot(root);

    if (options.warnMultipleAreaMatch) {
      var wMulti = document.createElement("p");
      wMulti.className = "detail-page-warning";
      wMulti.setAttribute("role", "status");
      wMulti.textContent =
        "同じ植栽名が複数エリアにあります。このページはそのうちの1つを表示しています。エリアを確実に指定するには、植栽一覧からエリア付きで開いてください。";
      root.appendChild(wMulti);
    }
    if (options.warnNotInMaster) {
      var warn = document.createElement("p");
      warn.className = "detail-page-warning";
      warn.setAttribute("role", "status");
      warn.textContent =
        "植栽一覧のマスタに「" +
        plantName +
        "」が見つかりませんでした（表記の違い、または一覧へ未反映の可能性があります）。成長記録の名前と植栽一覧を照合してください。";
      root.appendChild(warn);
    }

    document.title = "植栽メモ — " + plantName;
    titleEl.textContent = plantName;
    if (crumbEl) crumbEl.textContent = plantName;

    if (detailEditLinkEl) {
      detailEditLinkEl.href = buildQuery("./plant-edit.html", {
        area: area.id,
        plant: plantName,
      });
      detailEditLinkEl.textContent = "この植栽の詳細を編集";
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
      var areaLink = createDetailLink(
        "./area.html?area=" + encodeURIComponent(area.id),
        "エリア: " + (area.label || area.id),
        "detail-page-subline-link",
        "このエリアを見る"
      );
      areaLineEl.appendChild(areaLink);
    }

    if (entry && entry.summary) {
      var sum = document.createElement("p");
      sum.className = "detail-page-summary";
      sum.textContent = entry.summary;
      root.appendChild(sum);
    }

    root.appendChild(renderDetailSection(entry));
    root.appendChild(renderTimelineSection(area, plantName, options.growthRecords || []));

    var actions = document.createElement("p");
    actions.className = "detail-page-actions";

    var aDetail = createDetailLink(
      buildQuery("./plant-edit.html", {
        area: area.id,
        plant: plantName,
      }),
      "この植栽の詳細を編集",
      "detail-page-cta"
    );
    actions.appendChild(aDetail);

    var aRecord = createDetailLink(
      buildQuery("./growth-edit.html", {
        area: area.id,
        plant: plantName,
      }),
      "この植栽の記録を追加・編集",
      "detail-page-cta"
    );
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
