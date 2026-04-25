(function () {
  "use strict";

  var API_GROWTH_IMAGE = "/api/growth-image";
  var API_GROWTH = "/api/growth";
  var API_AREA_GROWTH = "/api/area-growth";
  var API_AREA_AI_REFRESH = "/api/area-ai-refresh";
  var LS_CLOUD_TOKEN = "growthCloudToken";
  var GROWTH_SNAPSHOT_JSON = "./data/growth-snapshot.json";
  var AREA_GROWTH_SNAPSHOT_JSON = "./data/area-growth-snapshot.json";
  var common = window.PlantingEditCommon || {};
  var getCloudToken =
    common.getCloudToken ||
    function (options) {
      var opts = options || {};
      try {
        return localStorage.getItem(opts.storageKey || LS_CLOUD_TOKEN) || "";
      } catch (err) {
        return "";
      }
    };
  var buildPhotoAiActionLabel =
    common.buildPhotoAiActionLabel ||
    function (options) {
      var opts = options || {};
      if (opts.isBusy) return "AIコメント更新中…";
      if (opts.hasTarget === false) return opts.unavailableLabel || "AIでコメント追加";
      return opts.hasMemo ? "AIでコメント再生成" : "AIでコメント追加";
    };
  var buildPhotoAiRequestStatus =
    common.buildPhotoAiRequestStatus ||
    function (options) {
      var opts = options || {};
      return (opts.withUserInstruction ? "入力内容を踏まえながら、" : "") + "この1枚の写真" + (opts.hasMemo ? "の" : "に") + "AIコメントを" + (opts.hasMemo ? "更新" : "追加") + "しています。";
    };
  var buildPhotoAiResultMessage =
    common.buildPhotoAiResultMessage ||
    function (options) {
      var opts = options || {};
      return "AIコメントを" + (opts.hasMemo ? "更新" : "追加") + "しました。";
    };
  var promptPhotoAiInstruction =
    common.promptPhotoAiInstruction ||
    function () {
      if (typeof window === "undefined" || typeof window.prompt !== "function") return "";
      var raw = window.prompt(
        "この1枚の写真について、AIコメントで触れてほしい点があれば入力してください。空欄のままでも実行できます。",
        ""
      );
      if (raw == null) return null;
      return String(raw).trim().slice(0, 400);
    };

  var root = document.getElementById("area-detail-root");
  var titleEl = document.getElementById("area-detail-title");
  var crumbEl = document.getElementById("area-detail-breadcrumb-current");
  var growthEditLinkEl = document.getElementById("area-detail-growth-edit-link");
  var detailPage = window.PlantingDetailPage || {};
  var listCommon = window.PlantingListPage || {};
  if (!root || !titleEl) return;
  var sanitizeDetailText =
    detailPage.sanitizeAiPlainText ||
    function (value) {
      return String(value || "").trim();
    };

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
      if (Array.isArray(opts.actions)) {
        opts.actions.forEach(function (action) {
          if (action) figure.appendChild(action);
        });
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

  var loadSnapshotRecords =
    detailPage.loadSnapshotRecords ||
    function (path) {
      return loadJson(path).then(function (data) {
        return data && Array.isArray(data.records) ? data.records : [];
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
          return loadSnapshotRecords(snapshotPath)
            .catch(function () {
              return windowKey ? readSnapshotRecords(windowKey) : [];
            })
            .catch(function () {
              return [];
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

  function readEmbeddedAreaDetails() {
    return readEmbeddedJson("area-details-embed");
  }

  function compareRecordsNewest(a, b) {
    if (listCommon.compareRecordsNewest) return listCommon.compareRecordsNewest(a, b);
    var ax = String((a && (a.recordedAt || a.createdAt)) || "");
    var bx = String((b && (b.recordedAt || b.createdAt)) || "");
    return bx.localeCompare(ax);
  }

  function buildLatestPlantPhotoMap(records) {
    if (listCommon.buildLatestPlantPhotoMap) {
      return listCommon.buildLatestPlantPhotoMap(records, API_GROWTH_IMAGE);
    }
    var map = Object.create(null);
    if (!Array.isArray(records) || !records.length) return map;

    records.slice().sort(compareRecordsNewest).forEach(function (record) {
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
          map[key] = { src: src };
        }
      });
    });

    return map;
  }

  function countPhotoSlots(record) {
    if (listCommon.countPhotoSlots) return listCommon.countPhotoSlots(record, API_GROWTH_IMAGE);
    var slots = growthImageSlots(record);
    var count = 0;
    for (var i = 0; i < slots.length; i++) {
      if (growthImageSrcFromSlot(slots[i])) count += 1;
    }
    return count;
  }

  function buildPlantPhotoCountMap(records) {
    if (listCommon.buildPlantPhotoCountMap) {
      return listCommon.buildPlantPhotoCountMap(records, API_GROWTH_IMAGE);
    }
    var map = Object.create(null);
    if (!Array.isArray(records) || !records.length) return map;

    records.forEach(function (record) {
      var areaId = String((record && record.areaId) || "").trim();
      var slotCount = countPhotoSlots(record);
      if (!areaId || !slotCount) return;

      var plants = Array.isArray(record.plants) ? record.plants : [];
      var seen = Object.create(null);
      plants.forEach(function (plantName) {
        var normalized = normalizePlantName(plantName);
        if (!normalized || seen[normalized]) return;
        seen[normalized] = true;
        var key = areaId + "::" + normalized;
        map[key] = (map[key] || 0) + slotCount;
      });
    });

    return map;
  }

  function photoCountSuffix(count) {
    if (listCommon.photoCountSuffix) return listCommon.photoCountSuffix(count);
    return "（" + String(count || 0) + "枚）";
  }

  function cloudHeadersForAreaWrite() {
    if (common.buildCloudHeaders) return common.buildCloudHeaders(true, LS_CLOUD_TOKEN);
    var h = { Accept: "application/json", "Content-Type": "application/json" };
    var t = getCloudToken({ storageKey: LS_CLOUD_TOKEN });
    if (t) h["x-growth-token"] = t;
    return h;
  }

  function confirmIrreversibleAction(options) {
    if (common.confirmIrreversibleAction) {
      return common.confirmIrreversibleAction(options);
    }
    var opts = options || {};
    var warning =
      typeof opts.warning === "string" && opts.warning.trim()
        ? opts.warning.trim()
        : "この操作は元に戻せません。";
    var subject = typeof opts.subject === "string" ? opts.subject.trim() : "";
    var action =
      typeof opts.action === "string" && opts.action.trim()
        ? opts.action.trim()
        : "削除します。";
    var detail = typeof opts.detail === "string" ? opts.detail.trim() : "";
    var question =
      typeof opts.question === "string" && opts.question.trim()
        ? opts.question.trim()
        : "本当に削除しますか？";
    var lines = [warning];
    lines.push(subject ? subject + action : action);
    if (detail) lines.push(detail);
    lines.push(question);
    return window.confirm(lines.join("\n"));
  }

  function createClientId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return "mv_" + Date.now() + "_" + Math.floor(Math.random() * 1e9);
  }

  function loadAreaGrowthRecordsList() {
    return loadRecordList(
      API_AREA_GROWTH,
      AREA_GROWTH_SNAPSHOT_JSON,
      "__PLANTING_AREA_GROWTH_SNAPSHOT__"
    );
  }

  function loadPlantGrowthRecordsList() {
    return loadRecordList(API_GROWTH, GROWTH_SNAPSHOT_JSON, "__PLANTING_GROWTH_SNAPSHOT__");
  }

  function loadAreaDetailsData() {
    function pickEntries(fromNet, fromEmb) {
      var a = Array.isArray(fromNet) ? fromNet : [];
      var b = Array.isArray(fromEmb) ? fromEmb : [];
      if (b.length > a.length) return b;
      return a.length ? a : b;
    }
    return fetch("/api/area-details", {
      headers: { Accept: "application/json" },
      cache: "no-store",
    })
      .then(function (res) {
        if (!res.ok) throw new Error("api");
        return res.json();
      })
      .then(function (data) {
        if (!data || !Array.isArray(data.entries)) throw new Error("shape");
        return data.entries;
      })
      .catch(function () {
        return loadJson("data/area-details.json")
          .then(function (data) {
            var fromNet = data && Array.isArray(data.entries) ? data.entries : [];
            var emb = readEmbeddedAreaDetails();
            var fromEmb = emb && Array.isArray(emb.entries) ? emb.entries : [];
            return pickEntries(fromNet, fromEmb);
          })
          .catch(function () {
            var embedded = readEmbeddedAreaDetails();
            if (embedded && Array.isArray(embedded.entries)) {
              return embedded.entries;
            }
            return [];
          });
      });
  }

  function findAreaEntry(entries, areaId) {
    if (!Array.isArray(entries)) return null;
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      if (e && e.areaId === areaId) return e;
    }
    return null;
  }

  function normalizeStaticImageSlot(im) {
    if (!im || typeof im !== "object") return null;
    return {
      imageUrl: im.imageUrl || im.url || null,
      imagePathname: im.imagePathname || null,
      localSnapshotImage: im.localSnapshotImage || im.localPath || null,
      caption: String(im.caption || "").trim(),
    };
  }

  function collectPhotosForArea(records, areaId) {
    var rows = [];
    if (!Array.isArray(records) || !areaId) return rows;
    for (var ri = 0; ri < records.length; ri++) {
      var r = records[ri];
      if (!r || String(r.areaId || "").trim() !== String(areaId).trim()) continue;
      var slots = growthImageSlots(r);
      for (var si = 0; si < slots.length; si++) {
        var url = growthImageSrcFromSlot(slots[si]);
        if (!url) continue;
        rows.push({
          recordId: r.id || null,
          slotIndex: si,
          recordedAt: r.recordedAt || "",
          url: url,
          slot: slots[si],
          recordNote: String(r.note || "").trim(),
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

  function buildAreaPhotoCaptionText(item) {
    var line1 = formatDateLabel(item && item.recordedAt);
    var memo = sanitizeDetailText(item && item.slot && item.slot.memo);
    var note = item && item.recordNote ? String(item.recordNote).trim() : "";
    var sub = memo || note || "";
    return sub ? line1 + " - " + sub : line1;
  }

  function bindAreaGalleryLightboxImage(img, galleryNodes, galleryCaptions, galleryIndex) {
    return bindLightboxImage(img, function () {
      return {
        items: (galleryNodes || []).map(function (node, idx) {
          return {
            src: (node && (node.currentSrc || node.src)) || "",
            alt: (node && node.alt) || "",
            caption: (galleryCaptions && galleryCaptions[idx]) || "",
            meta: (node && node._sitePhotoLightboxMeta) || null,
          };
        }),
        index: galleryIndex || 0,
        actions:
          img && typeof img._sitePhotoLightboxActionsFactory === "function"
            ? img._sitePhotoLightboxActionsFactory()
            : [],
      };
    });
  }

  function appendAreaPhotoGalleryFigure(target, galleryNodes, galleryCaptions, options) {
    var opts = options || {};
    var figureParts = createDetailImageFigure(opts);
    var figure = figureParts.figure;
    var img = figureParts.img;
    var captionEl = null;
    if (opts.slot) {
      attachSnapshotFallback(img, opts.slot, opts.apiPath, opts.datasetKey);
    }
    if (opts.captionText) {
      captionEl = createDetailPlaceholder(
        opts.captionText,
        opts.captionClass || "detail-page-photo-date",
        "figcaption"
      );
      figure.appendChild(captionEl);
    }
    if (Array.isArray(opts.actions)) {
      opts.actions.forEach(function (action) {
        if (action) figure.appendChild(action);
      });
    }
    var galleryIndex = Array.isArray(galleryNodes) ? galleryNodes.length : 0;
    var lightboxMeta = opts.lightboxMeta && typeof opts.lightboxMeta === "object" ? opts.lightboxMeta : null;
    if (lightboxMeta) {
      lightboxMeta.galleryCaptions = galleryCaptions;
      lightboxMeta.galleryIndex = galleryIndex;
      lightboxMeta.captionEl = captionEl;
    }
    img._sitePhotoLightboxMeta = lightboxMeta;
    img._sitePhotoLightboxActionsFactory =
      typeof opts.lightboxActionsFactory === "function" ? opts.lightboxActionsFactory : null;
    if (Array.isArray(galleryNodes)) galleryNodes.push(img);
    if (Array.isArray(galleryCaptions)) {
      galleryCaptions.push(opts.galleryCaptionText || opts.captionText || "");
    }
    bindAreaGalleryLightboxImage(img, galleryNodes || [], galleryCaptions || [], galleryIndex);
    if (target) target.appendChild(figure);
    return { figure: figure, img: img, captionEl: captionEl };
  }

  function renderPhotoRecordsSection(areaLabel, areaId, records, options) {
    var opts = options || {};
    var sectionParts = createDetailSection({
      className: "detail-page-photos",
      headingClass: "detail-page-photos-heading",
      headingText: opts.heading || "写真",
    });
    var section = sectionParts.section;

    var items = collectPhotosForArea(records, areaId);
    if (items.length === 0) {
      section.appendChild(createDetailPlaceholder(opts.emptyText || "まだ写真がありません。", "detail-page-photos-empty"));
      return section;
    }

    var grid = document.createElement("div");
    grid.className = "detail-page-photos-grid";
    var galleryNodes = [];
    var galleryCaptions = [];
    var lightboxActionsFactory =
      typeof opts.buildLightboxActions === "function" ? opts.buildLightboxActions : null;
    for (var k = 0; k < items.length; k++) {
      (function (it) {
        var captionText = buildAreaPhotoCaptionText(it);
        var actions = [];

        if (opts.allowImportFromPlant && typeof opts.onImportPhoto === "function") {
          var importBtn = document.createElement("button");
          importBtn.type = "button";
          importBtn.className = "area-photo-import-btn";
          importBtn.textContent = "エリア写真へ移動";
          importBtn.addEventListener("click", function () {
            opts.onImportPhoto(it, importBtn);
          });
          actions.push(importBtn);
        }
        if (opts.allowMoveToPlant && typeof opts.onMovePhoto === "function") {
          var moveBtn = document.createElement("button");
          moveBtn.type = "button";
          moveBtn.className = "area-photo-import-btn area-photo-move-btn";
          moveBtn.textContent = "植栽写真へ移動";
          moveBtn.addEventListener("click", function () {
            opts.onMovePhoto(it, moveBtn);
          });
          actions.push(moveBtn);
        }
        if (opts.allowDeletePhoto && typeof opts.onDeletePhoto === "function") {
          var delBtn = document.createElement("button");
          delBtn.type = "button";
          delBtn.className = "area-photo-import-btn area-photo-delete-btn";
          delBtn.textContent = "削除";
          delBtn.addEventListener("click", function () {
            opts.onDeletePhoto(it, delBtn);
          });
          actions.push(delBtn);
        }
        appendAreaPhotoGalleryFigure(grid, galleryNodes, galleryCaptions, {
          figureClass: "detail-page-photo-figure",
          imageClass: "detail-page-photo-img",
          src: it.url,
          alt: (areaLabel || "エリア") + "の記録写真",
          slot: it.slot,
          apiPath: API_GROWTH_IMAGE,
          datasetKey: "areaPhotoFb",
          captionClass: "detail-page-photo-date",
          captionText: captionText,
          lightboxMeta: {
            source: "area-record",
            recordId: it.recordId ? String(it.recordId) : "",
            slotIndex: it.slotIndex,
            item: it,
          },
          lightboxActionsFactory: lightboxActionsFactory,
          actions: actions,
        });
      })(items[k]);
    }
    section.appendChild(grid);

    var more = document.createElement("p");
    more.className = "detail-page-photos-more";
    var a = createDetailLink(
      opts.ctaHref || "./area-edit.html?area=" + encodeURIComponent(areaId),
      opts.ctaText || "写真を追加する",
      "detail-page-link"
    );
    more.appendChild(a);
    section.appendChild(more);

    return section;
  }

  function renderPhotoSourceSwitch(onSelect) {
    var wrap = document.createElement("div");
    wrap.className = "area-photo-switch";
    var btnArea = document.createElement("button");
    var btnPlant = document.createElement("button");
    btnArea.type = "button";
    btnPlant.type = "button";
    btnArea.className = "area-photo-switch-btn is-active";
    btnPlant.className = "area-photo-switch-btn";
    btnArea.textContent = "エリア写真";
    btnPlant.textContent = "植栽写真";
    btnArea.setAttribute("aria-pressed", "true");
    btnPlant.setAttribute("aria-pressed", "false");

    function select(which) {
      var isArea = which === "area";
      btnArea.className = "area-photo-switch-btn" + (isArea ? " is-active" : "");
      btnPlant.className = "area-photo-switch-btn" + (!isArea ? " is-active" : "");
      btnArea.setAttribute("aria-pressed", isArea ? "true" : "false");
      btnPlant.setAttribute("aria-pressed", !isArea ? "true" : "false");
      onSelect(which);
    }

    btnArea.addEventListener("click", function () {
      select("area");
    });
    btnPlant.addEventListener("click", function () {
      select("plant");
    });
    wrap.appendChild(btnArea);
    wrap.appendChild(btnPlant);
    return wrap;
  }

  function renderError(message) {
    document.title = "庭と植栽の記録 — エリア";
    clearDetailRoot(root);
    root.appendChild(createDetailMessage("detail-page-error", message));
    titleEl.textContent = "エリア";
    if (crumbEl) crumbEl.textContent = "エラー";
  }

  function renderPlantList(area, plantGrowthRecords) {
    var sectionParts = createDetailSection({
      className: "area-detail-plants",
      headingClass: "area-detail-plants-heading",
      headingText: "このエリアの植栽",
    });
    var section = sectionParts.section;
    var ul = document.createElement("ul");
    ul.className = "area-detail-plants-list";
    var plantPhotoMap = buildLatestPlantPhotoMap(plantGrowthRecords || []);
    var plantPhotoCountMap = buildPlantPhotoCountMap(plantGrowthRecords || []);
    var plants = area.plants || [];
    if (plants.length === 0) {
      var li = document.createElement("li");
      li.className = "area-detail-plants-empty";
      li.textContent = "（植栽一覧に未登録）";
      ul.appendChild(li);
    } else {
      plants.forEach(function (pname) {
        var li = document.createElement("li");
        li.className = "area-detail-plants-item";
        var a = document.createElement("a");
        a.href =
          "plant.html?area=" +
          encodeURIComponent(area.id) +
          "&plant=" +
          encodeURIComponent(pname);
        a.className = "plant-record-link plant-record-link--with-thumb";
        a.setAttribute("title", pname + " を見る");

        var name = document.createElement("span");
        name.className = "plant-record-name";
        name.textContent =
          pname +
          photoCountSuffix(
            plantPhotoCountMap[
              String(area.id || "").trim() + "::" + normalizePlantName(pname)
            ] || 0
          );

        var photo =
          plantPhotoMap[String(area.id || "").trim() + "::" + normalizePlantName(pname)];
        if (photo && photo.src) {
          var thumb = document.createElement("span");
          thumb.className = "plant-record-thumb";

          var img = document.createElement("img");
          img.className = "plant-record-thumb-img";
          img.src = photo.src;
          img.alt = pname + " の最新写真";
          img.loading = "lazy";
          img.decoding = "async";
          img.referrerPolicy = "no-referrer";
          img.addEventListener("error", function () {
            thumb.remove();
          });
          bindLightboxImage(img, function () {
            return {
              items: [
                {
                  src: img.currentSrc || img.src || "",
                  alt: img.alt || "",
                  caption: pname + " の写真",
                },
              ],
              index: 0,
            };
          });

          thumb.appendChild(img);
          a.appendChild(thumb);
        }

        a.appendChild(name);

        li.appendChild(a);
        ul.appendChild(li);
      });
    }
    section.appendChild(ul);
    return section;
  }

  function renderPage(area, entry, areaGrowthRecords, plantGrowthRecords) {
    clearDetailRoot(root);
    var label = area.label || area.id;
    document.title = "庭と植栽の記録 — " + label;
    titleEl.textContent = label;
    if (crumbEl) crumbEl.textContent = label;
    var editLink = document.getElementById("area-detail-edit-link");
    if (editLink && area && area.id) {
      editLink.href = "./area-edit.html?area=" + encodeURIComponent(area.id);
      editLink.textContent = "このエリアの説明と記録を編集";
    }
    if (growthEditLinkEl && area && area.id) {
      growthEditLinkEl.href = "./growth-edit.html?area=" + encodeURIComponent(area.id);
      growthEditLinkEl.textContent = "このエリアの植栽ごとの記録を編集";
    }

    if (entry && entry.summary) {
      var sum = document.createElement("p");
      sum.className = "detail-page-summary";
      sum.textContent = sanitizeDetailText(entry.summary);
      root.appendChild(sum);
    }

    var photoStatus = document.createElement("p");
    photoStatus.className = "detail-page-photos-more";
    photoStatus.style.marginTop = "0";
    photoStatus.style.display = "none";
    root.appendChild(photoStatus);

    function setPhotoStatus(msg, isError) {
      if (!msg) {
        photoStatus.style.display = "none";
        photoStatus.textContent = "";
        return;
      }
      photoStatus.style.display = "block";
      photoStatus.textContent = msg;
      photoStatus.style.color = isError ? "#b00020" : "";
    }

    var areaLightboxAiBusy = false;

    function replaceAreaGrowthRecordInList(record) {
      if (!record || !record.id || !Array.isArray(areaGrowthRecords)) return;
      var wanted = String(record.id);
      for (var i = 0; i < areaGrowthRecords.length; i++) {
        if (areaGrowthRecords[i] && String(areaGrowthRecords[i].id || "") === wanted) {
          areaGrowthRecords[i] = record;
          return;
        }
      }
      areaGrowthRecords.unshift(record);
    }

    function resolveAreaLightboxTarget(item) {
      var meta = item && item.meta && typeof item.meta === "object" ? item.meta : null;
      var slotIndex =
        meta && typeof meta.slotIndex === "number"
          ? meta.slotIndex
          : parseInt(String(meta && meta.slotIndex != null ? meta.slotIndex : ""), 10);
      var recordId = meta && meta.recordId ? String(meta.recordId) : "";
      if (!meta || meta.source !== "area-record" || !recordId || !isFinite(slotIndex) || slotIndex < 0) {
        return null;
      }
      return {
        recordId: recordId,
        slotIndex: slotIndex,
        meta: meta,
        sourceItem: meta.item && typeof meta.item === "object" ? meta.item : null,
      };
    }

    function areaLightboxAiActionLabel(item) {
      var target = resolveAreaLightboxTarget(item);
      var memo = sanitizeDetailText(
        target && target.sourceItem && target.sourceItem.slot && target.sourceItem.slot.memo
      );
      return buildPhotoAiActionLabel({
        isBusy: areaLightboxAiBusy,
        hasTarget: !!target,
        hasMemo: !!memo,
      });
    }

    function promptAreaLightboxAiUserInstruction() {
      return promptPhotoAiInstruction();
    }

    function updateAreaLightboxItemAfterAi(lightboxItem, target, latestRecord) {
      if (!lightboxItem || !target || !latestRecord) return;
      var slot = growthImageSlots(latestRecord)[target.slotIndex];
      if (!slot) return;
      var sourceItem = target.sourceItem || {};
      sourceItem.recordedAt = latestRecord.recordedAt || sourceItem.recordedAt || "";
      sourceItem.recordNote = String(latestRecord.note || "").trim();
      sourceItem.slot = slot;
      target.meta.item = sourceItem;
      lightboxItem.caption = buildAreaPhotoCaptionText(sourceItem);
      if (Array.isArray(target.meta.galleryCaptions) && target.meta.galleryIndex >= 0) {
        target.meta.galleryCaptions[target.meta.galleryIndex] = lightboxItem.caption;
      }
      if (target.meta.captionEl) {
        target.meta.captionEl.textContent = lightboxItem.caption;
      }
    }

    function buildAreaLightboxActions() {
      return [
        {
          className: "site-photo-lightbox-action-ai",
          ariaLabel: "AIでコメントを追加または再生成",
          label: function (ctx) {
            return areaLightboxAiActionLabel(ctx && ctx.item);
          },
          hidden: function (ctx) {
            return !resolveAreaLightboxTarget(ctx && ctx.item);
          },
          disabled: function () {
            return !!areaLightboxAiBusy;
          },
          onClick: function (ctx) {
            runAreaLightboxAiRefresh(ctx);
          },
        },
      ];
    }

    function runAreaLightboxAiRefresh(ctx) {
      if (areaLightboxAiBusy) return;
      var item = ctx && ctx.item ? ctx.item : null;
      var target = resolveAreaLightboxTarget(item);
      if (!target) {
        setPhotoStatus("AIコメントを追加できる写真情報が見つかりません。", true);
        return;
      }
      var storedToken = getCloudToken({ storageKey: LS_CLOUD_TOKEN });
      if (!storedToken) {
        setPhotoStatus("アップロード用トークンを保存するとAIコメントを追加できます。", true);
        return;
      }

      var userInstruction = promptAreaLightboxAiUserInstruction();
      if (userInstruction === null) return;
      var hadMemo = !!sanitizeDetailText(target.sourceItem && target.sourceItem.slot && target.sourceItem.slot.memo);
      areaLightboxAiBusy = true;
      if (ctx && typeof ctx.sync === "function") ctx.sync();
      setPhotoStatus(buildPhotoAiRequestStatus({ hasMemo: hadMemo, withUserInstruction: !!userInstruction }), false);

      fetch(API_AREA_AI_REFRESH, {
        method: "POST",
        headers: cloudHeadersForAreaWrite(),
        body: JSON.stringify({
          id: target.recordId,
          targets: [target.slotIndex],
          userInstruction: userInstruction,
        }),
      })
        .then(function (res) {
          return res
            .json()
            .catch(function () {
              return {};
            })
            .then(function (payload) {
              if (res.status === 401) {
                throw new Error("トークンが違います。アップロード用トークンを確認してください。");
              }
              if (!res.ok) {
                throw new Error(
                  (payload && (payload.detail || payload.error)) ||
                    ("AIコメントの更新に失敗しました (" + res.status + ")")
                );
              }
              return payload || {};
            });
        })
        .then(function (payload) {
          var latestRecord = payload.record || payload.latestRecord || null;
          if (latestRecord) {
            replaceAreaGrowthRecordInList(latestRecord);
            updateAreaLightboxItemAfterAi(item, target, latestRecord);
          }
          if (payload.updated) {
            setPhotoStatus(buildPhotoAiResultMessage({ hasMemo: hadMemo }), false);
          } else {
            setPhotoStatus(
              common.buildPhotoAiDeferredMessage
                ? common.buildPhotoAiDeferredMessage(payload.detail || "", {
                    baseMessage: "AIコメントはまだ反映されていません。少ししてから開き直してください。",
                  })
                : payload.detail || "AIコメントはまだ反映されていません。少ししてから開き直してください。",
              true
            );
          }
          if (ctx && typeof ctx.sync === "function") ctx.sync();
        })
        .catch(function (err) {
          setPhotoStatus(err && err.message ? err.message : "AIコメントの更新に失敗しました。", true);
        })
        .finally(function () {
          areaLightboxAiBusy = false;
          if (ctx && typeof ctx.sync === "function") ctx.sync();
        });
    }

    function importPlantPhotoToArea(item, buttonEl) {
      if (!item || !item.slot) {
        setPhotoStatus("取り込み対象の写真情報がありません。", true);
        return;
      }
      var src = {
        imagePathname: item.slot.imagePathname || null,
        imageUrl: item.slot.imageUrl || null,
      };
      if (!src.imagePathname && !src.imageUrl) {
        setPhotoStatus("この写真は取り込みできません。", true);
        return;
      }
      if (buttonEl) buttonEl.disabled = true;
      var createdAreaRecord = null;
      setPhotoStatus("移動中...", false);
      fetch(API_AREA_GROWTH, {
        method: "POST",
        headers: cloudHeadersForAreaWrite(),
        body: JSON.stringify({
          areaId: area.id,
          areaLabel: area.label || area.id,
          recordedAt: (item.recordedAt || "").slice(0, 10),
          note: item.recordNote || "",
          sourceImages: [src],
          imageMemos: [String((item.slot && item.slot.memo) || "")],
        }),
      })
        .then(function (res) {
          if (res.status === 401) {
            throw new Error("トークンが必要です。先に編集ページでトークンを保存してください。");
          }
          if (!res.ok) {
            return res
              .json()
              .catch(function () {
                return {};
              })
              .then(function (j) {
                throw new Error(j.error || ("移動に失敗しました (HTTP " + res.status + ")"));
              });
          }
          return res.json();
        })
        .then(function (payload) {
          createdAreaRecord = payload && payload.record ? payload.record : null;
          return removeMovedPhotoFromPlantRecord(item);
        })
        .then(function () {
          if (createdAreaRecord && Array.isArray(areaGrowthRecords)) {
            areaGrowthRecords.unshift(createdAreaRecord);
          }
          setPhotoStatus("植栽写真をエリア写真へ移動しました。表示反映のため再読み込みします。", false);
          setTimeout(function () {
            window.location.reload();
          }, 250);
        })
        .catch(function (err) {
          setPhotoStatus(err && err.message ? err.message : "移動に失敗しました。", true);
        })
        .finally(function () {
          if (buttonEl) buttonEl.disabled = false;
        });
    }

    function removeMovedPhotoFromPlantRecord(item) {
      var recId = item && item.recordId ? String(item.recordId) : "";
      if (!recId) return Promise.resolve();
      var rec = (plantGrowthRecords || []).find(function (r) {
        return r && String(r.id) === recId;
      });
      if (!rec) return Promise.resolve();
      var imgs = growthImageSlots(rec);
      var keep = [];
      for (var i = 0; i < imgs.length; i++) {
        if (i === item.slotIndex) continue;
        keep.push(imgs[i]);
      }
      var noteText = String(rec.note || "");
      if (!keep.length && !noteText.trim()) {
        return fetch(API_GROWTH + "?id=" + encodeURIComponent(recId), {
          method: "DELETE",
          headers: cloudHeadersForAreaWrite(),
        }).then(function (res) {
          if (!res.ok) {
            throw new Error("移動後の植栽写真削除に失敗しました。");
          }
        });
      }
      var srcImages = keep.map(function (im) {
        return {
          imagePathname: im && im.imagePathname ? im.imagePathname : null,
          imageUrl: im && im.imageUrl ? im.imageUrl : null,
        };
      });
      var memos = keep.map(function (im) {
        return String((im && im.memo) || "");
      });
      return fetch(API_GROWTH, {
        method: "POST",
        headers: cloudHeadersForAreaWrite(),
        body: JSON.stringify({
          id: recId,
          recordedAt: rec.recordedAt || "",
          areaId: rec.areaId || area.id,
          areaLabel: rec.areaLabel || area.label || area.id,
          plants: Array.isArray(rec.plants) ? rec.plants : [],
          note: noteText,
          createdAt: rec.createdAt || new Date().toISOString(),
          sourceImages: srcImages,
          imageMemos: memos,
        }),
      }).then(function (res) {
        if (!res.ok) {
          throw new Error("移動後の植栽写真更新に失敗しました。");
        }
      });
    }

    function chooseTargetPlantName() {
      var plants = Array.isArray(area.plants) ? area.plants.slice() : [];
      if (!plants.length) return null;
      if (plants.length === 1) return plants[0];
      var guide = "移動先の植栽名を入力してください。\n";
      for (var i = 0; i < plants.length; i++) {
        guide += i + 1 + ". " + plants[i] + "\n";
      }
      var ans = window.prompt(guide, plants[0]);
      if (ans == null) return null;
      var t = String(ans).trim();
      if (!t) return null;
      var asNum = parseInt(t, 10);
      if (!isNaN(asNum) && asNum >= 1 && asNum <= plants.length) {
        return plants[asNum - 1];
      }
      return plants.indexOf(t) !== -1 ? t : null;
    }

    function removeMovedPhotoFromAreaRecord(item) {
      var recId = item && item.recordId ? String(item.recordId) : "";
      if (!recId) return Promise.resolve();
      var rec = (areaGrowthRecords || []).find(function (r) {
        return r && String(r.id) === recId;
      });
      if (!rec) return Promise.resolve();
      var imgs = Array.isArray(rec.images) ? rec.images.slice() : [];
      var keep = [];
      for (var i = 0; i < imgs.length; i++) {
        if (i === item.slotIndex) continue;
        keep.push(imgs[i]);
      }
      var noteText = String(rec.note || "");
      if (!keep.length && !noteText.trim()) {
        return fetch(API_AREA_GROWTH + "?id=" + encodeURIComponent(recId), {
          method: "DELETE",
          headers: cloudHeadersForAreaWrite(),
        }).then(function (res) {
          if (!res.ok) {
            throw new Error("移動後の元写真削除に失敗しました。");
          }
        });
      }
      var srcImages = keep.map(function (im) {
        return {
          imagePathname: im && im.imagePathname ? im.imagePathname : null,
          imageUrl: im && im.imageUrl ? im.imageUrl : null,
        };
      });
      var memos = keep.map(function (im) {
        return String((im && im.memo) || "");
      });
      return fetch(API_AREA_GROWTH, {
        method: "POST",
        headers: cloudHeadersForAreaWrite(),
        body: JSON.stringify({
          id: recId,
          areaId: rec.areaId || area.id,
          areaLabel: rec.areaLabel || area.label || area.id,
          recordedAt: (rec.recordedAt || "").slice(0, 10),
          note: noteText,
          sourceImages: srcImages,
          imageMemos: memos,
        }),
      }).then(function (res) {
        if (!res.ok) {
          throw new Error("移動後のエリア記録更新に失敗しました。");
        }
      });
    }

    function moveAreaPhotoToPlant(item, buttonEl) {
      if (!item || !item.slot) {
        setPhotoStatus("移動対象の写真情報がありません。", true);
        return;
      }
      var targetPlant = chooseTargetPlantName();
      if (!targetPlant) {
        setPhotoStatus("移動先の植栽が選択されませんでした。", true);
        return;
      }
      var src = {
        imagePathname: item.slot.imagePathname || null,
        imageUrl: item.slot.imageUrl || null,
      };
      if (!src.imagePathname && !src.imageUrl) {
        setPhotoStatus("この写真は移動できません。", true);
        return;
      }
      if (buttonEl) buttonEl.disabled = true;
      setPhotoStatus("植栽写真へ移動中...", false);
      var day = (item.recordedAt || "").slice(0, 10) || new Date().toISOString().slice(0, 10);
      fetch(API_GROWTH, {
        method: "POST",
        headers: cloudHeadersForAreaWrite(),
        body: JSON.stringify({
          id: createClientId(),
          recordedAt: day + "T12:00:00.000Z",
          areaId: area.id,
          areaLabel: area.label || area.id,
          plants: [targetPlant],
          note: item.recordNote || "",
          createdAt: new Date().toISOString(),
          sourceImages: [src],
          imageMemos: [String((item.slot && item.slot.memo) || "")],
        }),
      })
        .then(function (res) {
          if (res.status === 401) {
            throw new Error("トークンが必要です。先に編集ページでトークンを保存してください。");
          }
          if (!res.ok) {
            return res
              .json()
              .catch(function () {
                return {};
              })
              .then(function (j) {
                throw new Error(j.error || ("移動に失敗しました (HTTP " + res.status + ")"));
              });
          }
          return res.json();
        })
        .then(function () {
          return removeMovedPhotoFromAreaRecord(item);
        })
        .then(function () {
          setPhotoStatus("植栽写真へ移動しました。ページを再読み込みすると反映されます。", false);
        })
        .catch(function (err) {
          setPhotoStatus(err && err.message ? err.message : "移動に失敗しました。", true);
        })
        .finally(function () {
          if (buttonEl) buttonEl.disabled = false;
        });
    }

    function deleteAreaPhoto(item, buttonEl) {
      if (!item || !item.slot || !item.recordId) {
        setPhotoStatus("削除対象の写真情報が見つかりません。", true);
        return;
      }
      if (
        !confirmIrreversibleAction({
          subject: "このエリア写真",
          action: "を削除します。",
          detail: "サーバー上の写真データも削除されます。",
          question: "本当に削除しますか？",
        })
      ) {
        return;
      }
      if (buttonEl) buttonEl.disabled = true;
      setPhotoStatus("削除中...", false);
      fetch(
        API_AREA_GROWTH +
          "?id=" +
          encodeURIComponent(String(item.recordId)) +
          "&slot=" +
          encodeURIComponent(String(item.slotIndex)),
        {
          method: "DELETE",
          headers: cloudHeadersForAreaWrite(),
        }
      )
        .then(function (res) {
          if (res.status === 401) {
            throw new Error("トークンが無効です。ページ上部で再設定してください。");
          }
          if (!res.ok) {
            return res
              .json()
              .catch(function () {
                return {};
              })
              .then(function (j) {
                throw new Error(j.error || ("削除に失敗しました (HTTP " + res.status + ")"));
              });
          }
          return res.json();
        })
        .then(function () {
          setPhotoStatus("エリア写真を削除しました。表示反映のため再読み込みします。", false);
          setTimeout(function () {
            window.location.reload();
          }, 250);
        })
        .catch(function (err) {
          setPhotoStatus(err && err.message ? err.message : "削除に失敗しました。", true);
        })
        .finally(function () {
          if (buttonEl) buttonEl.disabled = false;
        });
    }

    function deletePlantPhoto(item, buttonEl) {
      if (!item || !item.slot || !item.recordId) {
        setPhotoStatus("削除対象の写真情報が見つかりません。", true);
        return;
      }
      if (
        !confirmIrreversibleAction({
          subject: "この植栽写真",
          action: "を削除します。",
          detail: "サーバー上の写真データも削除されます。",
          question: "本当に削除しますか？",
        })
      ) {
        return;
      }
      if (buttonEl) buttonEl.disabled = true;
      setPhotoStatus("削除中...", false);
      fetch(
        API_GROWTH +
          "?id=" +
          encodeURIComponent(String(item.recordId)) +
          "&slot=" +
          encodeURIComponent(String(item.slotIndex)),
        {
          method: "DELETE",
          headers: cloudHeadersForAreaWrite(),
        }
      )
        .then(function (res) {
          if (res.status === 401) {
            throw new Error("トークンが無効です。ページ上部で再設定してください。");
          }
          if (!res.ok) {
            return res
              .json()
              .catch(function () {
                return {};
              })
              .then(function (j) {
                throw new Error(j.error || ("削除に失敗しました (HTTP " + res.status + ")"));
              });
          }
          return res.json();
        })
        .then(function () {
          setPhotoStatus("植栽写真を削除しました。表示反映のため再読み込みします。", false);
          setTimeout(function () {
            window.location.reload();
          }, 250);
        })
        .catch(function (err) {
          setPhotoStatus(err && err.message ? err.message : "削除に失敗しました。", true);
        })
        .finally(function () {
          if (buttonEl) buttonEl.disabled = false;
        });
    }

    var areaPhotoGroup = document.createElement("div");
    areaPhotoGroup.className = "area-photo-group area-photo-group-area";
    areaPhotoGroup.appendChild(
      renderPhotoRecordsSection(label, area.id, areaGrowthRecords || [], {
        heading: "エリア写真の時系列",
        emptyText: "エリア写真の記録はまだありません。「エリアの説明と記録を編集」から追加できます。",
        ctaText: "このエリアの説明と記録を編集",
        ctaHref: "./area-edit.html?area=" + encodeURIComponent(area.id),
        buildLightboxActions: buildAreaLightboxActions,
      })
    );

    var plantPhotoGroup = document.createElement("div");
    plantPhotoGroup.className = "area-photo-group area-photo-group-plant";
    plantPhotoGroup.hidden = true;
    plantPhotoGroup.appendChild(
      renderPhotoRecordsSection(label, area.id, plantGrowthRecords || [], {
        heading: "植栽写真の時系列",
        emptyText: "植栽ごとの写真はまだありません。「植栽の記録と一覧を編集」から追加できます。",
        ctaText: "このエリアの植栽ごとの記録を編集",
        ctaHref: "./growth-edit.html?area=" + encodeURIComponent(area.id),
      })
    );

    root.appendChild(
      renderPhotoSourceSwitch(function (which) {
        var showArea = which !== "plant";
        areaPhotoGroup.hidden = !showArea;
        plantPhotoGroup.hidden = showArea;
      })
    );
    root.appendChild(areaPhotoGroup);
    root.appendChild(plantPhotoGroup);

    var bodyWrap = document.createElement("div");
    bodyWrap.className = "detail-page-body";
    if (entry && entry.body) {
      renderDetailBody(bodyWrap, entry.body, "detail-page-body-p");
    }
    if (!bodyWrap.childElementCount) {
      bodyWrap.appendChild(
        createDetailPlaceholder(
          "このエリアの説明はまだ登録されていません。「このエリアの説明と記録を編集」から追加できます。",
          "detail-page-placeholder"
        )
      );
    }
    root.appendChild(bodyWrap);

    root.appendChild(renderPlantList(area, plantGrowthRecords || []));

    var actions = document.createElement("p");
    actions.className = "detail-page-actions";
    var aRecord = createDetailLink(
      "./area-edit.html?area=" + encodeURIComponent(area.id),
      "このエリアの説明と記録を編集",
      "detail-page-cta"
    );
    actions.appendChild(aRecord);
    root.appendChild(actions);
  }

  var params = new URLSearchParams(window.location.search);
  var areaId = (params.get("area") || "").trim();

  if (!areaId) {
    renderError(
      "URL にエリアIDが必要です。例: area.html?area=entrance （エリア一覧から開けます）"
    );
    return;
  }

  Promise.all([
    loadPlantsData(),
    loadAreaDetailsData(),
    loadAreaGrowthRecordsList(),
    loadPlantGrowthRecordsList(),
  ])
    .then(function (results) {
      var plantsData = results[0];
      var detailEntries = results[1];
      var areaGrowthRecords = results[2] || [];
      var plantGrowthRecords = results[3] || [];
      var areas = plantsData.areas || [];
      var area = areas.find(function (a) {
        return a && a.id === areaId;
      });
      if (!area) {
        renderError("指定されたエリアが見つかりません。");
        return;
      }
      var entry = findAreaEntry(detailEntries, areaId);
      renderPage(area, entry, areaGrowthRecords, plantGrowthRecords);
    })
    .catch(function () {
      renderError("エリアの内容を読み込めませんでした。しばらくしてから開き直してください。");
    });
})();
