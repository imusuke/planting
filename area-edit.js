(function () {
  "use strict";

  var common = window.PlantingEditCommon || {};
  var LS_CLOUD_TOKEN = common.CLOUD_TOKEN_KEY || "growthCloudToken";
  var API_CHANGE_LOG = "/api/change-log";
  var API_AREA_DESCRIPTION = "/api/area-description";
  var API_AREA_DETAILS = "/api/area-details";
  var API_AREA_GROWTH = "/api/area-growth";
  var API_GROWTH_IMAGE = "/api/growth-image";
  var API_PLANTS = "/api/plants";
  var AREA_GROWTH_SNAPSHOT_JSON = "./data/area-growth-snapshot.json";
  var MAX_IMAGE_WIDTH = 1024;
  var JPEG_QUALITY = 0.76;
  var MAX_AREA_PHOTOS = 12;

  var state = {
    areas: [],
    entries: [],
    areaGrowthRecords: [],
    photoQueue: [],
    photosTouched: false,
    editRecord: null,
    descriptionAiBusy: false,
    photoAiBusy: false,
  };

  var el = {};

  function $(id) {
    return document.getElementById(id);
  }

  function todayInputValue() {
    return new Date().toISOString().slice(0, 10);
  }

  function showToast(message, isError) {
    if (!el.toast) return;
    el.toast.textContent = message;
    el.toast.className =
      "growth-toast is-visible " + (isError ? "growth-toast--err" : "growth-toast--ok");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () {
      el.toast.className = "growth-toast";
    }, 4200);
  }

  function createTextElement(tagName, className, text) {
    return common.createTextElement
      ? common.createTextElement(tagName, className, text)
      : (function () {
          var node = document.createElement(tagName);
          if (className) node.className = className;
          if (text != null) node.textContent = text;
          return node;
        })();
  }

  function createButtonElement(className, text, onClick, attrs) {
    return common.createButtonElement
      ? common.createButtonElement(className, text, onClick, attrs)
      : (function () {
          var node = document.createElement("button");
          node.type = "button";
          if (className) node.className = className;
          if (text != null) node.textContent = text;
          if (attrs && typeof attrs === "object") {
            Object.keys(attrs).forEach(function (key) {
              var value = attrs[key];
              if (value == null) return;
              node.setAttribute(key, String(value));
            });
          }
          if (typeof onClick === "function") {
            node.addEventListener("click", onClick);
          }
          return node;
        })();
  }

  function createGrowthCardScaffold(options) {
    return common.createGrowthCardScaffold
      ? common.createGrowthCardScaffold(options)
      : (function () {
          var opts = options || {};
          var card = document.createElement("article");
          card.className = "growth-card" + (opts.cardClassName ? " " + opts.cardClassName : "");
          var body = document.createElement("div");
          body.className = opts.bodyClassName || "growth-card-body";
          var actions = document.createElement("div");
          actions.className = opts.actionsClassName || "growth-card-actions";
          return {
            card: card,
            body: body,
            actions: actions,
            finalize: function () {
              if (!body.parentNode) card.appendChild(body);
              if (actions.childNodes.length && !actions.parentNode) card.appendChild(actions);
              return card;
            },
          };
        })();
  }

  function createGrowthCardImageWrap(options) {
    return common.createGrowthCardImageWrap
      ? common.createGrowthCardImageWrap(options)
      : (function () {
          var opts = options || {};
          var wrap = document.createElement("div");
          wrap.className = opts.wrapClassName || "growth-card-img-wrap";
          if (opts.wrapOnly) {
            return { wrap: wrap, img: null };
          }
          if (!opts.src) {
            wrap.className += " growth-card-img-wrap--empty";
            wrap.textContent = opts.emptyText || "写真なし";
            return { wrap: wrap, img: null };
          }
          var img = document.createElement("img");
          img.src = opts.src;
          img.alt = opts.alt || "";
          img.loading = opts.loading || "lazy";
          img.decoding = opts.decoding || "async";
          img.referrerPolicy = opts.referrerPolicy || "no-referrer";
          if (opts.imageClassName) img.className = opts.imageClassName;
          wrap.appendChild(img);
          if (opts.badgeText) {
            wrap.appendChild(createTextElement("span", "growth-card-img-count", opts.badgeText));
          }
          return { wrap: wrap, img: img };
        })();
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

  function setPhotoAiStatus(message, isError) {
    if (!el.photoAiStatus) return;
    if (!message) {
      el.photoAiStatus.hidden = true;
      el.photoAiStatus.textContent = "";
      el.photoAiStatus.className = "growth-hint growth-photo-ai-status";
      return;
    }
    el.photoAiStatus.hidden = false;
    el.photoAiStatus.textContent = message;
    el.photoAiStatus.className =
      "growth-hint growth-photo-ai-status" + (isError ? " growth-photo-ai-status--error" : "");
  }

  function setDescriptionAiStatus(message, isError) {
    if (!el.descriptionAiStatus) return;
    if (!message) {
      el.descriptionAiStatus.hidden = true;
      el.descriptionAiStatus.textContent = "";
      el.descriptionAiStatus.className = "growth-hint growth-photo-ai-status";
      return;
    }
    el.descriptionAiStatus.hidden = false;
    el.descriptionAiStatus.textContent = message;
    el.descriptionAiStatus.className =
      "growth-hint growth-photo-ai-status" + (isError ? " growth-photo-ai-status--error" : "");
  }

  function readRecordAiCommentJob(record) {
    if (common.readAiCommentJob) return common.readAiCommentJob(record);
    var raw = record && record.aiCommentJob && typeof record.aiCommentJob === "object" ? record.aiCommentJob : null;
    if (!raw) return null;
    return {
      id: raw.id ? String(raw.id) : "",
      status: raw.status ? String(raw.status) : "",
      detail: raw.detail ? String(raw.detail) : "",
      updatedCount: typeof raw.updatedCount === "number" ? raw.updatedCount : 0,
      failedCount: typeof raw.failedCount === "number" ? raw.failedCount : 0,
    };
  }

  function isTerminalAiCommentJob(job) {
    return common.isAiCommentJobTerminal
      ? common.isAiCommentJobTerminal(job)
      : !!job && (job.status === "done" || job.status === "failed");
  }

  function areaAiJobResult(record, jobId) {
    var job = readRecordAiCommentJob(record);
    if (!job) return null;
    if (jobId && job.id && String(job.id) !== String(jobId)) return null;
    return {
      job: job,
      updated: job.status === "done" && job.updatedCount > 0,
      failed: job.status === "failed",
      detail: job.detail ? String(job.detail) : "",
    };
  }

  function areaAiJobStatusMessage(job) {
    if (!job) {
      return "AIコメントを更新しています。保存後は画面を離れても大丈夫です。";
    }
    if (job.status === "queued") {
      return "AIコメントを更新予約しました。保存後は画面を離れても大丈夫です。";
    }
    if (job.status === "running") {
      return "AIコメントを更新しています。保存後は画面を離れても大丈夫です。";
    }
    if (job.status === "done") {
      if (job.failedCount && job.updatedCount) {
        return job.detail
          ? "AIコメントを反映しました。一部の写真は更新できませんでした。（" + job.detail + "）"
          : "AIコメントを反映しました。一部の写真は更新できませんでした。";
      }
      if (job.detail && /自然な補助コメント/.test(job.detail)) {
        return job.detail;
      }
      return "AIコメントを反映しました。必要なら確認して保存してください。";
    }
    if (job.status === "failed") {
      return job.detail
        ? "AIコメントの更新に失敗しました。（" + job.detail + "）"
        : "AIコメントの更新に失敗しました。";
    }
    return "AIコメントを更新しています。保存後は画面を離れても大丈夫です。";
  }

  function buildAreaAiRefreshResult(record, jobId, fallbackDetail) {
    var jobResult = areaAiJobResult(record, jobId);
    if (jobResult) {
      return {
        updated: jobResult.updated,
        failed: jobResult.failed,
        detail: jobResult.detail || "",
        record: record || null,
        job: jobResult.job,
      };
    }
    return {
      updated: false,
      failed: false,
      detail: fallbackDetail ? String(fallbackDetail) : "",
      record: record || null,
      job: null,
    };
  }

  function syncPhotoAiButtonState() {
    if (!el.photoAiGenerate) return;
    el.photoAiGenerate.disabled = state.photoAiBusy || state.photoQueue.length === 0;
  }

  function areaHasSavedPhotoHistory(areaId) {
    var wanted = areaId ? String(areaId).trim() : "";
    if (!wanted) return false;
    return state.areaGrowthRecords.some(function (record) {
      return (
        String((record && record.areaId) || "").trim() === wanted &&
        normalizeRecordImages(record).length > 0
      );
    });
  }

  function syncDescriptionAiButtonState() {
    if (!el.descriptionAiGenerate) return;
    el.descriptionAiGenerate.disabled =
      state.descriptionAiBusy || !currentAreaId() || !areaHasSavedPhotoHistory(currentAreaId());
  }

  function cloudHeaders(jsonBody) {
    return common.buildCloudHeaders
      ? common.buildCloudHeaders(jsonBody, LS_CLOUD_TOKEN)
      : { Accept: "application/json" };
  }

  function readWindowSnapshotRecords(key) {
    var data = window[key];
    return data && Array.isArray(data.records) ? data.records : [];
  }

  function loadPlantsData() {
    return common.loadPlantsData
      ? common.loadPlantsData({
          apiPath: API_PLANTS,
          fallbackPath: "data/plants.json",
          embedId: "plants-embed",
        })
      : fetch(API_PLANTS, { cache: "no-store" }).then(function (res) {
          if (!res.ok) throw new Error("api");
          return res.json();
        });
  }

  function loadAreaDetailsMerged() {
    return fetch(API_AREA_DETAILS, {
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
        return fetch("data/area-details.json", { cache: "no-store" })
          .then(function (res) {
            if (!res.ok) throw new Error("file");
            return res.json();
          })
          .then(function (data) {
            return data && Array.isArray(data.entries) ? data.entries : [];
          });
      });
  }

  function loadAreaGrowthRecords() {
    return fetch(API_AREA_GROWTH, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    })
      .then(function (res) {
        if (!res.ok) throw new Error("api");
        return res.json();
      })
      .then(function (data) {
        return data && Array.isArray(data.records) ? data.records : [];
      })
      .catch(function () {
        return fetch(AREA_GROWTH_SNAPSHOT_JSON, { cache: "no-store" })
          .then(function (res) {
            if (!res.ok) throw new Error("file");
            return res.json();
          })
          .then(function (data) {
            return data && Array.isArray(data.records) ? data.records : [];
          });
      })
      .catch(function () {
        return readWindowSnapshotRecords("__PLANTING_AREA_GROWTH_SNAPSHOT__");
      })
      .catch(function () {
        return [];
      });
  }

  function normalizeRecordImages(record) {
    return common.normalizeImageSlots
      ? common.normalizeImageSlots(record)
      : (function () {
          if (!record) return [];
          if (Array.isArray(record.images) && record.images.length) {
            return record.images.map(function (img) {
              return {
                imageUrl: img && img.imageUrl ? img.imageUrl : null,
                imagePathname: img && img.imagePathname ? img.imagePathname : null,
                localSnapshotImage: img && img.localSnapshotImage ? img.localSnapshotImage : null,
                memo: img && typeof img.memo === "string" ? img.memo : "",
              };
            });
          }
          if (record.imageUrl || record.imagePathname || record.localSnapshotImage) {
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
        })();
  }

  function growthImageSrcFromSlot(slot) {
    return common.imageSrcFromSlot
      ? common.imageSrcFromSlot(slot, API_GROWTH_IMAGE)
      : (function () {
          if (!slot) return null;
          if (slot.localSnapshotImage) {
            var p = String(slot.localSnapshotImage).trim();
            if (/^https?:\/\//i.test(p)) return p;
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
        })();
  }

  function growthIsImageBitmap(x) {
    return typeof ImageBitmap !== "undefined" && x instanceof ImageBitmap;
  }

  function tryLoadImageViaObjectUrl(fileOrBlob) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(fileOrBlob);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error("__img_decode__"));
      };
      img.src = url;
    });
  }

  function tryLoadImageViaBitmap(fileOrBlob) {
    if (typeof createImageBitmap !== "function") {
      return Promise.reject(new Error("画像を読み込めませんでした"));
    }
    return createImageBitmap(fileOrBlob).catch(function () {
      return Promise.reject(new Error("画像を読み込めませんでした"));
    });
  }

  function loadImageFile(file) {
    return tryLoadImageViaObjectUrl(file).catch(function (err) {
      if (err && err.message === "__img_decode__") {
        return tryLoadImageViaBitmap(file);
      }
      throw err;
    });
  }

  function loadImageFileFromBlob(blob) {
    return tryLoadImageViaObjectUrl(blob).catch(function (err) {
      if (err && err.message === "__img_decode__") {
        return tryLoadImageViaBitmap(blob);
      }
      throw err;
    });
  }

  function imageToJpegBlob(imgOrBitmap) {
    var width = growthIsImageBitmap(imgOrBitmap)
      ? imgOrBitmap.width
      : imgOrBitmap.naturalWidth;
    var height = growthIsImageBitmap(imgOrBitmap)
      ? imgOrBitmap.height
      : imgOrBitmap.naturalHeight;
    if (!width || !height) {
      if (growthIsImageBitmap(imgOrBitmap) && typeof imgOrBitmap.close === "function") {
        try {
          imgOrBitmap.close();
        } catch (err0) {}
      }
      throw new Error("画像サイズが無効です");
    }
    var scale = width > MAX_IMAGE_WIDTH ? MAX_IMAGE_WIDTH / width : 1;
    var canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    var ctx = canvas.getContext("2d");
    ctx.drawImage(imgOrBitmap, 0, 0, canvas.width, canvas.height);
    if (growthIsImageBitmap(imgOrBitmap) && typeof imgOrBitmap.close === "function") {
      try {
        imgOrBitmap.close();
      } catch (err1) {}
    }
    return new Promise(function (resolve, reject) {
      canvas.toBlob(
        function (blob) {
          if (!blob) {
            reject(new Error("画像の変換に失敗しました"));
            return;
          }
          resolve(blob);
        },
        "image/jpeg",
        JPEG_QUALITY
      );
    });
  }

  function blobToDataURL(blob) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () {
        resolve(fr.result);
      };
      fr.onerror = function () {
        reject(fr.error);
      };
      fr.readAsDataURL(blob);
    });
  }

  function dataUrlToBase64Part(dataUrl) {
    var comma = dataUrl.indexOf(",");
    return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  }

  function clearPhotoInputs() {
    if (el.photoCamera) el.photoCamera.value = "";
    if (el.photoLibrary) el.photoLibrary.value = "";
  }

  function renderPhotoQueueUi() {
    if (!el.photoQueueEl) return;

    var oldImgs = el.photoQueueEl.querySelectorAll("img.growth-photo-queue-thumb");
    for (var oi = 0; oi < oldImgs.length; oi++) {
      var oldUrl = oldImgs[oi].src || "";
      if (oldUrl.indexOf("blob:") === 0) {
        try {
          URL.revokeObjectURL(oldUrl);
        } catch (err) {}
      }
    }

    el.photoQueueEl.innerHTML = "";
    if (el.photoQueueEmpty) el.photoQueueEmpty.hidden = state.photoQueue.length > 0;
    if (el.photoClear) el.photoClear.hidden = state.photoQueue.length === 0;

    state.photoQueue.forEach(function (item, idx) {
      var tile = document.createElement("div");
      tile.className = "growth-photo-queue-item";

      var row = document.createElement("div");
      row.className = "growth-photo-queue-item-row";

      var thumbWrap = document.createElement("div");
      thumbWrap.className = "growth-photo-queue-thumb-wrap";

      var thumb = document.createElement("img");
      thumb.className = "growth-photo-queue-thumb";
      thumb.alt = "";
      thumb.loading = "lazy";
      thumb.decoding = "async";
      thumb.referrerPolicy = "no-referrer";
      if (item.kind === "new" && item.file) {
        try {
          thumb.src = URL.createObjectURL(item.file);
        } catch (err0) {
          thumb.removeAttribute("src");
        }
      } else if (item.slot) {
        var src = growthImageSrcFromSlot(item.slot);
        if (src) thumb.src = src;
      }

      var removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "growth-photo-queue-remove";
      removeBtn.setAttribute("aria-label", "この写真を削除");
      removeBtn.textContent = "削除";
      removeBtn.addEventListener("click", function () {
        var at = state.photoQueue.indexOf(item);
        if (at !== -1) removePhotoQueueIndex(at);
      });

      thumbWrap.appendChild(thumb);
      thumbWrap.appendChild(removeBtn);

      var memoTa = document.createElement("textarea");
      memoTa.className = "growth-photo-memo";
      memoTa.setAttribute("aria-label", "写真" + (idx + 1) + "枚目のコメント");
      memoTa.rows = 3;
      memoTa.placeholder = "この写真用のコメント";
      memoTa.value = item.memo != null ? item.memo : "";
      memoTa.addEventListener("input", function () {
        item.memo = memoTa.value;
      });

      row.appendChild(thumbWrap);
      row.appendChild(memoTa);
      tile.appendChild(row);
      el.photoQueueEl.appendChild(tile);
    });
    syncPhotoAiButtonState();
  }

  function resetPhotoQueue() {
    state.photoQueue = [];
    state.photosTouched = false;
    clearPhotoInputs();
    renderPhotoQueueUi();
  }

  function resetPhotoQueueFromRecord(record) {
    state.photoQueue = normalizeRecordImages(record).map(function (slot) {
      return {
        kind: "saved",
        slot: slot,
        memo: typeof slot.memo === "string" ? slot.memo : "",
        aiState: "idle",
      };
    });
    state.photosTouched = false;
    clearPhotoInputs();
    renderPhotoQueueUi();
  }

  function clearPhotoQueueCompletely() {
    state.photoQueue = [];
    state.photosTouched = true;
    clearPhotoInputs();
    renderPhotoQueueUi();
  }

  function removePhotoQueueIndex(idx) {
    if (idx < 0 || idx >= state.photoQueue.length) return;
    state.photoQueue.splice(idx, 1);
    state.photosTouched = true;
    renderPhotoQueueUi();
  }

  function fileLooksLikeImage(file) {
    if (!file) return false;
    var type = file.type || "";
    if (type.indexOf("image/") === 0) return true;
    var name = (file.name || "").toLowerCase();
    return /\.(jpe?g|png|gif|webp|heic|heif|bmp|avif|tiff?)$/i.test(name);
  }

  function appendFilesToQueue(fileList) {
    if (!fileList || !fileList.length) return;
    var appended = 0;
    for (var i = 0; i < fileList.length; i++) {
      if (state.photoQueue.length >= MAX_AREA_PHOTOS) break;
      var file = fileList[i];
      if (!fileLooksLikeImage(file)) continue;
      state.photoQueue.push({ kind: "new", file: file, memo: "", aiState: "idle" });
      state.photosTouched = true;
      appended += 1;
    }
    if (appended < fileList.length) {
      showToast("写真は最大 " + MAX_AREA_PHOTOS + " 枚までです。", true);
    }
    renderPhotoQueueUi();
  }

  function buildPhotoQueueItemBase64(item) {
    if (!item) return Promise.resolve(null);
    if (item.kind === "new" && item.file) {
      return loadImageFile(item.file)
        .then(imageToJpegBlob)
        .then(blobToDataURL)
        .then(dataUrlToBase64Part);
    }
    var src = growthImageSrcFromSlot(item.slot);
    if (!src) return Promise.resolve(null);
    return fetch(src, { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("既存写真の読み込みに失敗しました");
        return res.blob();
      })
      .then(loadImageFileFromBlob)
      .then(imageToJpegBlob)
      .then(blobToDataURL)
      .then(dataUrlToBase64Part);
  }

  function buildImagesBase64Payload() {
    if (!state.photoQueue.length) return Promise.resolve([]);
    return Promise.all(
      state.photoQueue.map(function (item) {
        return buildPhotoQueueItemBase64(item);
      })
    ).then(function (items) {
      return items.filter(Boolean);
    });
  }

  function imageMemosPayload() {
    return state.photoQueue.map(function (item) {
      return item.memo != null ? String(item.memo) : "";
    });
  }

  function matchesAreaChangeLogEntry(item) {
    if (!item) return false;
    var areaId = currentAreaId();
    if (!areaId) return false;
    if (String(item.areaId || "").trim() === areaId) return true;
    return String(item.targetType || "").trim() === "area_detail" && String(item.targetId || "").trim() === areaId;
  }

  function refreshChangeLog() {
    if (!el.changeLogStatus || !el.changeLogList) return Promise.resolve([]);
    var areaId = currentAreaId();
    if (!areaId) {
      el.changeLogStatus.textContent = "エリアを選ぶと最近の更新を表示します。";
      if (common.renderChangeLogItems) common.renderChangeLogItems(el.changeLogList, [], "");
      else el.changeLogList.innerHTML = "";
      return Promise.resolve([]);
    }
    if (!common.loadChangeLog) {
      el.changeLogStatus.textContent = "更新履歴を読み込めません。";
      return Promise.resolve([]);
    }
    return common.loadChangeLog({
      apiPath: API_CHANGE_LOG,
      storageKey: LS_CLOUD_TOKEN,
      limit: 40,
      statusEl: el.changeLogStatus,
      listEl: el.changeLogList,
      filter: matchesAreaChangeLogEntry,
      noTokenMessage: "アップロード用トークンを保存すると、このエリアに関する更新を読み込めます。",
      emptyMessage: "このエリアに関する更新はまだありません。",
      successMessage: function (items) {
        return items.length
          ? "このエリアに関する最近 " + items.length + " 件の更新です。"
          : "このエリアに関する更新はまだありません。";
      },
    });
  }

  function apiErrorMessage(res, fallbackPrefix) {
    if (common.apiErrorMessage) {
      return common.apiErrorMessage(res, fallbackPrefix);
    }
    return res.text().then(function (text) {
      var detail = "";
      try {
        var json = JSON.parse(text);
        if (json && json.detail) detail = json.detail;
        else if (json && json.error) detail = json.error;
      } catch (err) {}
      var base = fallbackPrefix + "（" + res.status + "）";
      return detail ? base + " " + detail : base;
    });
  }

  function compareRecordsNewest(a, b) {
    var da = String((a && (a.recordedAt || a.createdAt)) || "");
    var db = String((b && (b.recordedAt || b.createdAt)) || "");
    if (db !== da) return db.localeCompare(da);
    return String((b && b.createdAt) || "").localeCompare(String((a && a.createdAt) || ""));
  }

  function findAreaEntry(areaId) {
    for (var i = 0; i < state.entries.length; i++) {
      if (state.entries[i] && state.entries[i].areaId === areaId) return state.entries[i];
    }
    return null;
  }

  function areaLabelById(areaId) {
    for (var i = 0; i < state.areas.length; i++) {
      var area = state.areas[i];
      if (area && area.id === areaId) return area.label || areaId;
    }
    return areaId;
  }

  function currentAreaId() {
    return el.area && el.area.value ? String(el.area.value).trim() : "";
  }

  function generateAreaDescriptionDraft() {
    var areaId = currentAreaId();
    if (!areaId) {
      setDescriptionAiStatus("先にエリアを選んでください。", true);
      showToast("先にエリアを選んでください。", true);
      return;
    }
    if (!areaHasSavedPhotoHistory(areaId)) {
      setDescriptionAiStatus("このエリアには、説明生成に使える保存済み写真がまだありません。", true);
      showToast("このエリアには、説明生成に使える保存済み写真がまだありません。", true);
      return;
    }

    state.descriptionAiBusy = true;
    syncDescriptionAiButtonState();
    setDescriptionAiStatus("エリア写真の流れをもとに、AIが概要と本文の案を作成しています。", false);

    fetch(API_AREA_DESCRIPTION, {
      method: "POST",
      headers: cloudHeaders(true),
      body: JSON.stringify({
        areaId: areaId,
        currentSummary: el.summary ? el.summary.value.trim() : "",
        currentBody: el.body ? el.body.value.trim() : "",
      }),
    })
      .then(function (res) {
        if (res.status === 401) {
          throw new Error("トークンが違います。");
        }
        if (!res.ok) {
          return apiErrorMessage(res, "エリア説明の生成に失敗しました").then(function (message) {
            throw new Error(message);
          });
        }
        return res.json();
      })
      .then(function (data) {
        if (!data || typeof data.summary !== "string" || typeof data.body !== "string") {
          throw new Error("AIがエリア説明を正しく返せませんでした。");
        }
        if (el.summary) el.summary.value = data.summary;
        if (el.body) el.body.value = data.body;
        setDescriptionAiStatus(
          "AIでエリア説明の案を作成しました。必要なら整えてから保存してください。",
          false
        );
        showToast("AIでエリア説明の案を作成しました。");
      })
      .catch(function (err) {
        var message = err && err.message ? err.message : String(err);
        setDescriptionAiStatus(message, true);
        showToast(message, true);
      })
      .finally(function () {
        state.descriptionAiBusy = false;
        syncDescriptionAiButtonState();
      });
  }

  function applyFormForArea(areaId) {
    var entry = findAreaEntry(areaId) || { areaId: areaId, summary: "", body: "" };
    if (el.summary) el.summary.value = entry.summary || "";
    if (el.body) el.body.value = entry.body || "";
    if (!state.editRecord) {
      if (el.recordNote) el.recordNote.value = "";
      if (el.recordDate) el.recordDate.value = todayInputValue();
      resetPhotoQueue();
    }
  }

  function syncAreaEditLinks(areaId) {
    var wanted = areaId ? String(areaId).trim() : "";
    var viewHref = wanted ? "./area.html?area=" + encodeURIComponent(wanted) : "./area.html";
    var recordHref = wanted
      ? "./growth-edit.html?area=" + encodeURIComponent(wanted)
      : "./growth-edit.html";
    var recordText = wanted ? "このエリアの記録を追加・編集" : "記録の追加・編集";

    if (el.detailBreadcrumbLink) el.detailBreadcrumbLink.href = viewHref;
    if (el.detailLink) el.detailLink.href = viewHref;
    if (el.viewLink) el.viewLink.href = viewHref;
    if (el.recordLink) {
      el.recordLink.href = recordHref;
      el.recordLink.textContent = recordText;
    }
    if (el.growthLink) {
      el.growthLink.href = recordHref;
      el.growthLink.textContent = recordText;
    }
  }

  function syncEditFormUI() {
    var editing = !!state.editRecord;
    if (el.formHeading) {
      el.formHeading.textContent = editing ? "エリア記録を編集" : "エリア記録を追加";
    }
    if (el.save) {
      el.save.textContent = editing ? "更新して保存" : "保存する";
    }
    if (el.editBanner) el.editBanner.hidden = !editing;
    if (el.editCancel) el.editCancel.hidden = !editing;
    if (el.deleteRecord) el.deleteRecord.hidden = !editing;
  }

  function syncAreaEditContext(areaId) {
    var crumbEl = $("area-edit-breadcrumb-current");
    var titleEl = $("area-edit-page-title");
    var contextEl = $("area-edit-context-line");
    var wanted = areaId ? String(areaId).trim() : "";
    var area = null;

    if (wanted) {
      for (var i = 0; i < state.areas.length; i++) {
        if (state.areas[i] && state.areas[i].id === wanted) {
          area = state.areas[i];
          break;
        }
      }
    }

    syncAreaEditLinks(area ? area.id : wanted);

    if (area) {
      if (el.detailBreadcrumbLink) el.detailBreadcrumbLink.textContent = area.label || area.id;
      if (crumbEl) crumbEl.textContent = state.editRecord ? "エリア記録を編集" : "エリアの概要・記録を編集";
      if (titleEl) {
        titleEl.textContent =
          area.label + (state.editRecord ? "の記録を編集" : "の概要・記録を編集");
      }
      if (contextEl) {
        contextEl.hidden = false;
        contextEl.textContent = state.editRecord
          ? "このエリアの過去記録、写真コメント、概要メモを編集します。"
          : "このエリアの記録メモ、概要、本文、写真をまとめて追加・更新できます。";
      }
      document.title =
        "植栽メモ — " +
        area.label +
        (state.editRecord ? "の記録を編集" : "の概要・記録を編集");
      return;
    }

    if (el.detailBreadcrumbLink) el.detailBreadcrumbLink.textContent = "エリア";
    if (crumbEl) crumbEl.textContent = "エリアの概要・記録を編集";
    if (titleEl) titleEl.textContent = "エリアの概要・記録を編集";
    if (contextEl) {
      contextEl.hidden = true;
      contextEl.textContent = "";
    }
    document.title = "植栽メモ — エリアの概要・記録を編集";
  }

  function recordDateLabel(record) {
    return String((record && record.recordedAt) || "").slice(0, 10) || "日付なし";
  }

  function countCommentedPhotos(record) {
    var images = normalizeRecordImages(record);
    var count = 0;
    for (var i = 0; i < images.length; i++) {
      if (String(images[i].memo || "").trim()) count += 1;
    }
    return count;
  }

  function collectPendingAreaAiTargets() {
    var targets = [];
    state.photoQueue.forEach(function (item, idx) {
      if (!item) return;
      if (item.aiState === "pending" || item.aiState === "refresh_pending") {
        targets.push(idx);
      }
    });
    return targets;
  }

  function generateAiCommentsForAreaPhotos() {
    if (state.photoAiBusy) return;
    if (!state.photoQueue.length) {
      setPhotoAiStatus("写真がありません。先に写真を追加してください。", true);
      showToast("写真がありません。", true);
      return;
    }

    state.photoQueue.forEach(function (item) {
      if (!item) return;
      var memo = item.memo != null ? String(item.memo).trim() : "";
      item.aiState = memo ? "refresh_pending" : "pending";
    });
    setPhotoAiStatus(
      "保存するとサーバー側でAIコメントを追加・更新します。保存後は画面を離れても大丈夫です。",
      false
    );
    showToast("保存後にバックグラウンドでAIコメントを追加するよう予約しました。");
    renderPhotoQueueUi();
  }

  function runAreaAiRefreshAfterSaveByPolling(record, targetIndexes) {
    if (!record || !record.id || !targetIndexes || !targetIndexes.length) {
      return Promise.resolve({ record: record || null });
    }

    var job = readRecordAiCommentJob(record);
    var jobId = job && job.id ? job.id : "";
    var deadline = Date.now() + 35000;

    function fetchLatestRecord() {
      return fetch(API_AREA_GROWTH, {
        headers: cloudHeaders(false),
        cache: "no-store",
      })
        .then(function (res) {
          if (!res.ok) {
            return apiErrorMessage(res, "AIコメントの反映確認に失敗しました").then(function (msg) {
              throw new Error(msg);
            });
          }
          return res.json();
        })
        .then(function (data) {
          var records = data && Array.isArray(data.records) ? data.records : [];
          return (
            records.find(function (item) {
              return item && item.id === record.id;
            }) || null
          );
        });
    }

    function pollUntilUpdated() {
      return fetchLatestRecord()
        .then(function (latest) {
          var latestResult = buildAreaAiRefreshResult(latest, jobId, "");
          if (latest && latestResult.job && isTerminalAiCommentJob(latestResult.job)) {
            startEdit(latest);
            setPhotoAiStatus(areaAiJobStatusMessage(latestResult.job), latestResult.failed);
            return latestResult;
          }
          if (Date.now() >= deadline) {
            if (latest) startEdit(latest);
            if (latestResult.job) {
              setPhotoAiStatus(areaAiJobStatusMessage(latestResult.job), latestResult.failed);
            } else {
              setPhotoAiStatus(
                "AIコメントの更新は予約済みですが、反映確認に時間がかかっています。少ししてからもう一度開いてください。",
                false
              );
            }
            return Object.assign({ timedOut: true }, buildAreaAiRefreshResult(latest || record, jobId, ""));
          }
          return new Promise(function (resolve) {
            setTimeout(resolve, 2000);
          }).then(pollUntilUpdated);
        })
        .catch(function (err) {
          if (Date.now() >= deadline) {
            throw err;
          }
          return new Promise(function (resolve) {
            setTimeout(resolve, 2000);
          }).then(pollUntilUpdated);
        });
    }

    state.photoAiBusy = true;
    syncPhotoAiButtonState();
    startEdit(record);
    setPhotoAiStatus(areaAiJobStatusMessage(job), false);
    return pollUntilUpdated().finally(function () {
      state.photoAiBusy = false;
      syncPhotoAiButtonState();
    });
  }

  function renderAreaGrowthFeed(areaId) {
    if (!el.records) return;
    el.records.innerHTML = "";

    if (!areaId) {
      var choose = createTextElement(
        "p",
        "growth-hint",
        "先にエリアを選ぶと、過去のエリア記録をここから編集できます。"
      );
      el.records.appendChild(choose);
      return;
    }

    var items = state.areaGrowthRecords
      .filter(function (record) {
        return String((record && record.areaId) || "").trim() === String(areaId).trim();
      })
      .sort(compareRecordsNewest);

    if (!items.length) {
      var empty = createTextElement(
        "p",
        "growth-hint",
        "このエリアの記録はまだありません。上のフォームから追加できます。"
      );
      el.records.appendChild(empty);
      return;
    }

    items.forEach(function (record) {
      var cardParts = createGrowthCardScaffold();
      var card = cardParts.card;
      var body = cardParts.body;
      var actions = cardParts.actions;

      var images = normalizeRecordImages(record);
      var firstSrc = images.length ? growthImageSrcFromSlot(images[0]) : "";
      if (firstSrc) {
        var imageParts = createGrowthCardImageWrap({
          src: firstSrc,
          alt: (areaLabelById(areaId) || "エリア") + "の記録写真",
          badgeText: images.length > 1 ? images.length + "枚" : "",
        });
        card.appendChild(imageParts.wrap);
      }

      var meta = createTextElement("p", "growth-card-meta", recordDateLabel(record));
      body.appendChild(meta);

      var title = document.createElement("h3");
      title.className = "growth-card-title";
      title.textContent = "写真" + images.length + "枚・コメント" + countCommentedPhotos(record) + "件";
      body.appendChild(title);

      if (record.note) {
        var note = createTextElement("p", "growth-card-note", String(record.note).trim());
        body.appendChild(note);
      }

      var photoCommentPreview = images
        .map(function (img) {
          return String((img && img.memo) || "").trim();
        })
        .filter(Boolean)
        .slice(0, 2);
      if (photoCommentPreview.length) {
        var preview = createTextElement("p", "growth-card-note", photoCommentPreview.join(" / "));
        body.appendChild(preview);
      }

      card.appendChild(body);

      var editBtn = createButtonElement("growth-edit", "この記録を編集", function () {
        startEdit(record);
      });
      actions.appendChild(editBtn);
      el.records.appendChild(cardParts.finalize());
    });
  }

  function populateAreaSelect() {
    if (!el.area) return;
    el.area.innerHTML = "";
    state.areas.forEach(function (area) {
      if (!area || !area.id) return;
      var opt = document.createElement("option");
      opt.value = area.id;
      opt.textContent = area.label || area.id;
      el.area.appendChild(opt);
    });
  }

  function clearEditMode(preserveAreaId) {
    state.editRecord = null;
    state.descriptionAiBusy = false;
    state.photoAiBusy = false;
    syncEditFormUI();
    setDescriptionAiStatus("", false);
    setPhotoAiStatus("", false);
    var areaId = preserveAreaId || currentAreaId();
    if (el.area && areaId) el.area.value = areaId;
    applyFormForArea(areaId);
    syncAreaEditContext(areaId);
    renderAreaGrowthFeed(areaId);
    syncDescriptionAiButtonState();
  }

  function startEdit(record) {
    if (!record) return;
    var areaId = String(record.areaId || currentAreaId() || "").trim();
    state.editRecord = {
      id: String(record.id || "").trim(),
      areaId: areaId,
      createdAt: record.createdAt || null,
    };
    if (el.area) el.area.value = areaId;
    applyFormForArea(areaId);
    if (el.recordDate) el.recordDate.value = recordDateLabel(record);
    if (el.recordNote) el.recordNote.value = record.note || "";
    resetPhotoQueueFromRecord(record);
    syncEditFormUI();
    syncAreaEditContext(areaId);
    renderAreaGrowthFeed(areaId);
    syncDescriptionAiButtonState();
    requestAnimationFrame(function () {
      if (el.form && typeof el.form.scrollIntoView === "function") {
        el.form.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  }

  function onAreaChange() {
    var areaId = currentAreaId();
    state.editRecord = null;
    syncEditFormUI();
    setDescriptionAiStatus("", false);
    applyFormForArea(areaId);
    syncAreaEditContext(areaId);
    renderAreaGrowthFeed(areaId);
    syncDescriptionAiButtonState();
    refreshChangeLog().catch(function () {});
  }

  function onDeleteRecord() {
    if (!state.editRecord || !state.editRecord.id) return;
    if (
      !confirmIrreversibleAction({
        subject: "このエリア記録",
        action: "をアーカイブします。",
        detail: "サーバー上には残したまま、一覧から非表示にします。",
        question: "本当にアーカイブしますか？",
      })
    ) {
      return;
    }
    var areaId = state.editRecord.areaId || currentAreaId();
    if (el.deleteRecord) el.deleteRecord.disabled = true;

    fetch(API_AREA_GROWTH + "?id=" + encodeURIComponent(state.editRecord.id), {
      method: "DELETE",
      headers: cloudHeaders(false),
    })
      .then(function (res) {
        if (res.status === 401) {
          throw new Error("トークンが違います。");
        }
        if (!res.ok) {
          return apiErrorMessage(res, "記録のアーカイブに失敗しました").then(function (msg) {
            throw new Error(msg);
          });
        }
      })
      .then(function () {
        return Promise.all([loadAreaDetailsMerged(), loadAreaGrowthRecords()]);
      })
      .then(function (results) {
        state.entries = results[0] || [];
        state.areaGrowthRecords = results[1] || [];
        refreshChangeLog().catch(function () {});
        clearEditMode(areaId);
        showToast("記録をアーカイブしました");
      })
      .catch(function (err) {
        showToast(err && err.message ? err.message : String(err), true);
      })
      .finally(function () {
        if (el.deleteRecord) el.deleteRecord.disabled = false;
      });
  }

  function onSubmit(e) {
    e.preventDefault();

    var areaId = currentAreaId();
    if (!areaId) {
      showToast("エリアを選んでください。", true);
      return;
    }
    if (!el.save) return;
    el.save.disabled = true;

    var editing = state.editRecord;
    var summary = el.summary ? el.summary.value.trim() : "";
    var body = el.body ? el.body.value.trim() : "";
    var recordedAt = el.recordDate ? String(el.recordDate.value || "").trim() : "";
    var recordNote = el.recordNote ? el.recordNote.value.trim() : "";
    var areaLabel = areaLabelById(areaId);

    var detailPayload = {
      areaId: areaId,
      summary: summary,
      body: body,
    };
    var aiCommentTargets = collectPendingAreaAiTargets();

    function postAreaDetails() {
      return fetch(API_AREA_DETAILS, {
        method: "POST",
        headers: cloudHeaders(true),
        body: JSON.stringify(detailPayload),
      }).then(function (res) {
        if (res.status === 401) {
          throw new Error("トークンが違います。");
        }
        if (res.status === 503) {
          return apiErrorMessage(res, "エリアの概要の保存に失敗しました").then(function (msg) {
            throw new Error(msg);
          });
        }
        if (!res.ok) {
          return apiErrorMessage(res, "保存に失敗しました").then(function (msg) {
            throw new Error(msg);
          });
        }
        return res.json();
      });
    }

    function buildAreaGrowthPayload() {
      if (!recordedAt) {
        return Promise.reject(new Error("記録日を入力してください。"));
      }
      if (!editing && !state.photoQueue.length && !recordNote) {
        return Promise.resolve(null);
      }
      if (editing && !state.photoQueue.length && !recordNote) {
        return Promise.reject(
          new Error("写真も記録メモも空です。消したい場合は『この記録をアーカイブ』を使ってください。")
        );
      }

      var payload = {
        areaId: areaId,
        areaLabel: areaLabel,
        recordedAt: recordedAt,
        note: recordNote,
      };
      if (editing && editing.id) payload.id = editing.id;

      if (state.photosTouched) {
        return buildImagesBase64Payload().then(function (imagesBase64) {
          payload.imagesBase64 = imagesBase64;
          payload.imageMemos = imageMemosPayload();
          if (aiCommentTargets.length) {
            payload.aiCommentTargets = aiCommentTargets.slice();
          }
          return payload;
        });
      }

      if (state.photoQueue.length) {
        payload.imageMemos = imageMemosPayload();
      }
      if (aiCommentTargets.length) {
        payload.aiCommentTargets = aiCommentTargets.slice();
      }
      return Promise.resolve(payload);
    }

    function postAreaGrowth(payload) {
      if (!payload) return Promise.resolve(null);
      return fetch(API_AREA_GROWTH, {
        method: "POST",
        headers: cloudHeaders(true),
        body: JSON.stringify(payload),
      }).then(function (res) {
        if (res.status === 401) {
          throw new Error("トークンが違います。");
        }
        if (res.status === 503 || res.status === 502) {
          return apiErrorMessage(res, "エリア記録の保存に失敗しました").then(function (msg) {
            throw new Error(msg);
          });
        }
        if (!res.ok) {
          return apiErrorMessage(res, "エリア記録の保存に失敗しました").then(function (msg) {
            throw new Error(msg);
          });
        }
        return res.json();
      });
    }

    postAreaDetails()
      .then(buildAreaGrowthPayload)
      .then(postAreaGrowth)
      .then(function (saveResult) {
        if (saveResult && saveResult.record && aiCommentTargets.length) {
          return runAreaAiRefreshAfterSaveByPolling(saveResult.record, aiCommentTargets)
            .catch(function (err) {
              showToast(err && err.message ? err.message : "AIコメントの更新に失敗しました", true);
              return {};
            })
            .then(function (refreshResult) {
              return refreshResult && refreshResult.record ? refreshResult.record : saveResult.record;
            });
        }
        return saveResult && saveResult.record ? saveResult.record : null;
      })
      .then(function () {
        return Promise.all([loadAreaDetailsMerged(), loadAreaGrowthRecords()]);
      })
      .then(function (results) {
        state.entries = results[0] || [];
        state.areaGrowthRecords = results[1] || [];
        refreshChangeLog().catch(function () {});
        clearEditMode(areaId);
        showToast(editing ? "更新しました。" : "保存しました。");
      })
      .catch(function (err) {
        showToast(err && err.message ? err.message : String(err), true);
      })
      .finally(function () {
        el.save.disabled = false;
      });
  }

  function init() {
    el.toast = $("area-edit-toast");
    el.cloudStatus = $("area-edit-cloud-status");
    el.cloudToken = $("area-edit-cloud-token");
    el.cloudTokenSave = $("area-edit-cloud-token-save");
    el.changeLogStatus = $("area-edit-change-log-status");
    el.changeLogList = $("area-edit-change-log-list");
    el.changeLogReload = $("area-edit-change-log-reload");
    el.form = $("area-edit-form");
    el.formHeading = $("area-edit-form-heading");
    el.editBanner = $("area-edit-banner");
    el.editCancel = $("area-edit-cancel");
    el.deleteRecord = $("area-edit-delete-record");
    el.records = $("area-edit-records");
    el.area = $("area-edit-area");
    el.recordDate = $("area-edit-record-date");
    el.recordNote = $("area-edit-record-note");
    el.summary = $("area-edit-summary");
    el.body = $("area-edit-body");
    el.descriptionAiGenerate = $("area-description-ai-generate");
    el.descriptionAiStatus = $("area-description-ai-status");
    el.photoCamera = $("area-edit-photo-camera");
    el.photoLibrary = $("area-edit-photo-library");
    el.photoAiGenerate = $("area-photo-ai-generate");
    el.photoAiStatus = $("area-photo-ai-status");
    el.photoClear = $("area-edit-photo-clear");
    el.photoQueueEl = $("area-edit-photo-queue");
    el.photoQueueEmpty = $("area-edit-photo-queue-empty");
    el.save = $("area-edit-save");
    el.detailBreadcrumbLink = $("area-edit-detail-breadcrumb-link");
    el.detailLink = $("area-edit-detail-link");
    el.recordLink = $("area-edit-record-link");
    el.viewLink = $("area-edit-view-link");
    el.growthLink = $("area-edit-growth-link");

    if (common.applyStoredCloudToken) common.applyStoredCloudToken(el.cloudToken, LS_CLOUD_TOKEN);
    else if (el.cloudToken) el.cloudToken.value = localStorage.getItem(LS_CLOUD_TOKEN) || "";
    if (el.cloudTokenSave) {
      el.cloudTokenSave.addEventListener("click", function () {
        var value = el.cloudToken ? el.cloudToken.value.trim() : "";
        if (common.saveCloudToken) common.saveCloudToken(value, LS_CLOUD_TOKEN);
        else if (value) localStorage.setItem(LS_CLOUD_TOKEN, value);
        else localStorage.removeItem(LS_CLOUD_TOKEN);
        refreshChangeLog().catch(function () {});
        showToast(value ? "アップロード用トークンを保存しました。" : "アップロード用トークンを削除しました。");
      });
    }
    if (el.changeLogReload) {
      el.changeLogReload.addEventListener("click", function () {
        refreshChangeLog().catch(function () {});
      });
    }
    if (el.cloudStatus) {
      el.cloudStatus.textContent =
        window.location.protocol === "file:"
          ? "file:// では API に直接保存できません。http(s) で開くと保存できます。"
          : "GET /api/area-details と /api/area-growth からデータを読み込みます。";
    }

    if (el.photoCamera) {
      el.photoCamera.addEventListener("change", function () {
        if (el.photoCamera.files && el.photoCamera.files.length) {
          appendFilesToQueue(el.photoCamera.files);
        }
        el.photoCamera.value = "";
      });
    }
    if (el.photoLibrary) {
      el.photoLibrary.addEventListener("change", function () {
        if (el.photoLibrary.files && el.photoLibrary.files.length) {
          appendFilesToQueue(el.photoLibrary.files);
        }
        el.photoLibrary.value = "";
      });
    }
    if (el.photoClear) {
      el.photoClear.addEventListener("click", function () {
        clearPhotoQueueCompletely();
      });
    }
    if (el.photoAiGenerate) {
      el.photoAiGenerate.addEventListener("click", function () {
        generateAiCommentsForAreaPhotos();
      });
    }
    if (el.descriptionAiGenerate) {
      el.descriptionAiGenerate.addEventListener("click", function () {
        generateAreaDescriptionDraft();
      });
    }
    if (el.area) {
      el.area.addEventListener("change", onAreaChange);
    }
    if (el.editCancel) {
      el.editCancel.addEventListener("click", function () {
        clearEditMode(currentAreaId());
      });
    }
    if (el.deleteRecord) {
      el.deleteRecord.addEventListener("click", onDeleteRecord);
    }
    if (el.form) {
      el.form.addEventListener("submit", onSubmit);
    }
    if (el.recordDate && !el.recordDate.value) {
      el.recordDate.value = todayInputValue();
    }

    Promise.all([loadPlantsData(), loadAreaDetailsMerged(), loadAreaGrowthRecords()])
      .then(function (results) {
        state.areas = results[0].areas || [];
        state.entries = results[1] || [];
        state.areaGrowthRecords = results[2] || [];
        populateAreaSelect();

        var params = new URLSearchParams(window.location.search);
        var wanted = (params.get("area") || "").trim();
        if (wanted && el.area) {
          var found = false;
          for (var i = 0; i < el.area.options.length; i++) {
            if (el.area.options[i].value === wanted) {
              found = true;
              break;
            }
          }
          el.area.value = found ? wanted : el.area.options[0] ? el.area.options[0].value : "";
        }

        var areaId = currentAreaId();
        applyFormForArea(areaId);
        syncEditFormUI();
        syncAreaEditContext(areaId || wanted);
        renderAreaGrowthFeed(areaId || wanted);
        syncDescriptionAiButtonState();
        syncPhotoAiButtonState();
        refreshChangeLog().catch(function () {});
      })
      .catch(function () {
        showToast("データを読み込めませんでした。", true);
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
