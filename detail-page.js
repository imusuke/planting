(function () {
  "use strict";

  var common = window.PlantingEditCommon || {};

  function createMessage(className, text) {
    var p = document.createElement("p");
    if (className) p.className = className;
    p.textContent = text || "";
    return p;
  }

  function createPlaceholder(text, className, tagName) {
    var el = document.createElement(tagName || "p");
    if (className) el.className = className;
    el.textContent = text || "";
    return el;
  }

  function sanitizeAiPlainText(value, options) {
    if (common.sanitizeAiPlainText) {
      return common.sanitizeAiPlainText(value, options);
    }
    return String(value || "").trim();
  }

  function createLink(href, text, className, title) {
    var a = document.createElement("a");
    if (className) a.className = className;
    if (href) a.href = href;
    if (title) a.setAttribute("title", title);
    a.textContent = text || "";
    return a;
  }

  function createImageFigure(options) {
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
  }

  function createSection(options) {
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
  }

  function clearRoot(root) {
    if (root) root.innerHTML = "";
  }

  function renderBody(container, text, paragraphClass) {
    if (!container) return 0;
    var raw = String(text || "");
    if (!raw.trim()) return 0;
    var count = 0;
    raw.split(/\n\n+/).forEach(function (part) {
      var chunk = sanitizeAiPlainText(part);
      if (!chunk) return;
      container.appendChild(createMessage(paragraphClass || "detail-page-body-p", chunk));
      count += 1;
    });
    return count;
  }

  function formatDateLabel(value) {
    var text = String(value || "").trim();
    if (!text) return "日付未設定";
    return text.slice(0, 10) || text;
  }

  function buildQuery(pathname, params) {
    var search = new URLSearchParams();
    if (params && typeof params === "object") {
      Object.keys(params).forEach(function (key) {
        var value = params[key];
        if (value == null) return;
        var text = String(value);
        if (!text) return;
        search.set(key, text);
      });
    }
    var query = search.toString();
    return pathname + (query ? "?" + query : "");
  }

  function bindLightboxImage(img, configOrFactory) {
    if (!window.PlantingPhotoLightbox || typeof window.PlantingPhotoLightbox.bindImage !== "function") {
      return false;
    }
    window.PlantingPhotoLightbox.bindImage(img, configOrFactory);
    return true;
  }

  function bindLightboxGalleryImage(img, galleryNodes, galleryCaptions, galleryIndex) {
    if (!img) return false;
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
  }

  function attachSnapshotFallback(img, slot, apiPath, datasetKey) {
    if (!img) return;
    img.addEventListener("error", function onSnapshotFallback() {
      img.removeEventListener("error", onSnapshotFallback);
      var key = datasetKey || "snapshotFallback";
      if (img.dataset[key] === "1") return;
      if (!slot || !slot.localSnapshotImage) return;
      var fallbackSrc = slot.imageUrl || "";
      if (!fallbackSrc && slot.imagePathname && apiPath) {
        fallbackSrc = apiPath + "?pathname=" + encodeURIComponent(slot.imagePathname);
      }
      if (!fallbackSrc) return;
      img.dataset[key] = "1";
      img.src = fallbackSrc;
    });
  }

  function createGalleryFigure(options) {
    var opts = options || {};
    var figureParts = createImageFigure({
      figureClass: opts.figureClass,
      imageClass: opts.imageClass,
      src: opts.src,
      alt: opts.alt,
      loading: opts.loading,
      decoding: opts.decoding,
      referrerPolicy: opts.referrerPolicy,
    });
    var figure = figureParts.figure;
    var img = figureParts.img;
    if (opts.slot) {
      attachSnapshotFallback(img, opts.slot, opts.apiPath, opts.datasetKey);
    }
    if (opts.captionText) {
      figure.appendChild(createPlaceholder(opts.captionText, opts.captionClass || "detail-page-photo-date", "figcaption"));
    }
    if (Array.isArray(opts.actions)) {
      opts.actions.forEach(function (action) {
        if (action) figure.appendChild(action);
      });
    }
    return {
      figure: figure,
      img: img,
      captionText: opts.captionText || "",
    };
  }

  function appendGalleryFigure(target, galleryNodes, galleryCaptions, options) {
    var parts = createGalleryFigure(options);
    if (!parts || !parts.figure || !parts.img) return null;
    var nodes = Array.isArray(galleryNodes) ? galleryNodes : [];
    var captions = Array.isArray(galleryCaptions) ? galleryCaptions : [];
    var galleryIndex = nodes.length;
    nodes.push(parts.img);
    captions.push(options && options.galleryCaptionText ? options.galleryCaptionText : parts.captionText || "");
    bindLightboxGalleryImage(parts.img, nodes, captions, galleryIndex);
    if (target) target.appendChild(parts.figure);
    return parts;
  }

  function readEmbeddedJson(scriptId) {
    return common.readEmbeddedJson ? common.readEmbeddedJson(scriptId) : null;
  }

  function loadJson(path) {
    return common.loadJson
      ? common.loadJson(path)
      : fetch(path, { cache: "no-store" }).then(function (res) {
          if (!res.ok) throw new Error("bad status");
          return res.json();
        });
  }

  function loadSnapshotRecords(path) {
    return loadJson(path).then(function (data) {
      return data && Array.isArray(data.records) ? data.records : [];
    });
  }

  function normalizePlantName(value) {
    return common.normalizeName ? common.normalizeName(value) : typeof value === "string" ? value.trim() : "";
  }

  function loadPlantsData() {
    if (common.loadPlantsData) {
      return common.loadPlantsData({
        apiPath: "/api/plants",
        fallbackPath: "data/plants.json",
        embedId: "plants-embed",
        apiSource: "api",
        fileSource: "file",
        embedSource: "embed",
      });
    }

    return loadJson("/api/plants")
      .then(function (data) {
        if (!data || !Array.isArray(data.areas)) throw new Error("shape");
        return data;
      })
      .catch(function () {
        return loadJson("data/plants.json");
      })
      .catch(function () {
        var embedded = readEmbeddedJson("plants-embed");
        if (embedded && Array.isArray(embedded.areas)) return embedded;
        throw new Error("no plants");
      });
  }

  function loadRecordList(apiPath, snapshotPath, windowKey) {
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
            return windowKey ? readWindowSnapshotRecords(windowKey) : [];
          })
          .catch(function () {
            return [];
          });
      });
  }

  function readWindowSnapshotRecords(key) {
    var data = window[key];
    return data && Array.isArray(data.records) ? data.records : [];
  }

  function growthImageSlots(record) {
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
  }

  function growthImageSrcFromSlot(slot, apiPath) {
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
    if (slot.imagePathname && apiPath) {
      return apiPath + "?pathname=" + encodeURIComponent(slot.imagePathname);
    }
    return slot.imageUrl || null;
  }

  window.PlantingDetailPage = Object.freeze({
    appendGalleryFigure: appendGalleryFigure,
    bindLightboxImage: bindLightboxImage,
    bindLightboxGalleryImage: bindLightboxGalleryImage,
    buildQuery: buildQuery,
    clearRoot: clearRoot,
    createGalleryFigure: createGalleryFigure,
    createImageFigure: createImageFigure,
    createLink: createLink,
    createMessage: createMessage,
    createPlaceholder: createPlaceholder,
    createSection: createSection,
    formatDateLabel: formatDateLabel,
    attachSnapshotFallback: attachSnapshotFallback,
    growthImageSlots: growthImageSlots,
    growthImageSrcFromSlot: growthImageSrcFromSlot,
    loadJson: loadJson,
    loadPlantsData: loadPlantsData,
    loadRecordList: loadRecordList,
    loadSnapshotRecords: loadSnapshotRecords,
    normalizePlantName: normalizePlantName,
    readEmbeddedJson: readEmbeddedJson,
    readWindowSnapshotRecords: readWindowSnapshotRecords,
    renderBody: renderBody,
    sanitizeAiPlainText: sanitizeAiPlainText,
  });
})();
