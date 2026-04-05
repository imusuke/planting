(function () {
  "use strict";

  var LS_CLOUD_TOKEN = "growthCloudToken";
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

  function cloudHeaders(jsonBody) {
    var headers = { Accept: "application/json" };
    if (jsonBody) headers["Content-Type"] = "application/json";
    var token = localStorage.getItem(LS_CLOUD_TOKEN);
    if (token) headers["x-growth-token"] = token;
    return headers;
  }

  function readEmbeddedPlants() {
    var embed = document.getElementById("plants-embed");
    if (!embed || !embed.textContent.trim()) return null;
    try {
      return JSON.parse(embed.textContent.trim());
    } catch (err) {
      return null;
    }
  }

  function readWindowSnapshotRecords(key) {
    var data = window[key];
    return data && Array.isArray(data.records) ? data.records : [];
  }

  function loadPlantsData() {
    return fetch(API_PLANTS, { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("api");
        return res.json();
      })
      .then(function (data) {
        if (!data || !Array.isArray(data.areas)) throw new Error("shape");
        return data;
      })
      .catch(function () {
        return fetch("data/plants.json", { cache: "no-store" }).then(function (res) {
          if (!res.ok) throw new Error("file");
          return res.json();
        });
      })
      .catch(function () {
        var embedded = readEmbeddedPlants();
        if (embedded && Array.isArray(embedded.areas)) return embedded;
        throw new Error("no plants");
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
  }

  function growthImageSrcFromSlot(slot) {
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
      state.photoQueue.push({ kind: "new", file: file, memo: "" });
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

  function apiErrorMessage(res, fallbackPrefix) {
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

    if (el.detailBreadcrumbLink) el.detailBreadcrumbLink.href = viewHref;
    if (el.viewLink) el.viewLink.href = viewHref;
    if (el.recordLink) el.recordLink.href = recordHref;
    if (el.growthLink) el.growthLink.href = recordHref;
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
      if (crumbEl) crumbEl.textContent = state.editRecord ? "エリア記録を編集" : "エリアを編集";
      if (titleEl) {
        titleEl.textContent =
          area.label + (state.editRecord ? "の記録を編集" : "の説明・メモを編集");
      }
      if (contextEl) {
        contextEl.hidden = false;
        contextEl.textContent = state.editRecord
          ? "このエリアの過去記録と写真コメントを編集します。"
          : "このエリアの説明、メモ、写真付き記録をまとめて更新できます。";
      }
      document.title =
        area.label +
        (state.editRecord ? "の記録を編集" : "の説明・メモを編集") +
        " | 植栽メモ";
      return;
    }

    if (crumbEl) crumbEl.textContent = "エリアを編集";
    if (titleEl) titleEl.textContent = "エリアの説明・メモを編集";
    if (contextEl) {
      contextEl.hidden = true;
      contextEl.textContent = "";
    }
    document.title = "植栽メモ | エリアの説明・メモを編集";
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

  function renderAreaGrowthFeed(areaId) {
    if (!el.records) return;
    el.records.innerHTML = "";

    if (!areaId) {
      var choose = document.createElement("p");
      choose.className = "growth-hint";
      choose.textContent = "先にエリアを選ぶと、過去のエリア記録をここから編集できます。";
      el.records.appendChild(choose);
      return;
    }

    var items = state.areaGrowthRecords
      .filter(function (record) {
        return String((record && record.areaId) || "").trim() === String(areaId).trim();
      })
      .sort(compareRecordsNewest);

    if (!items.length) {
      var empty = document.createElement("p");
      empty.className = "growth-hint";
      empty.textContent = "このエリアの記録はまだありません。上のフォームから追加できます。";
      el.records.appendChild(empty);
      return;
    }

    items.forEach(function (record) {
      var card = document.createElement("article");
      card.className = "growth-card";

      var images = normalizeRecordImages(record);
      var firstSrc = images.length ? growthImageSrcFromSlot(images[0]) : "";
      if (firstSrc) {
        var imgWrap = document.createElement("div");
        imgWrap.className = "growth-card-img-wrap";
        var img = document.createElement("img");
        img.src = firstSrc;
        img.alt = (areaLabelById(areaId) || "エリア") + "の記録写真";
        img.loading = "lazy";
        img.decoding = "async";
        img.referrerPolicy = "no-referrer";
        imgWrap.appendChild(img);
        if (images.length > 1) {
          var count = document.createElement("span");
          count.className = "growth-card-img-count";
          count.textContent = images.length + "枚";
          imgWrap.appendChild(count);
        }
        card.appendChild(imgWrap);
      }

      var body = document.createElement("div");
      body.className = "growth-card-body";

      var meta = document.createElement("p");
      meta.className = "growth-card-meta";
      meta.textContent = recordDateLabel(record);
      body.appendChild(meta);

      var title = document.createElement("h3");
      title.className = "growth-card-title";
      title.textContent = "写真" + images.length + "枚・コメント" + countCommentedPhotos(record) + "件";
      body.appendChild(title);

      if (record.note) {
        var note = document.createElement("p");
        note.className = "growth-card-note";
        note.textContent = String(record.note).trim();
        body.appendChild(note);
      }

      var photoCommentPreview = images
        .map(function (img) {
          return String((img && img.memo) || "").trim();
        })
        .filter(Boolean)
        .slice(0, 2);
      if (photoCommentPreview.length) {
        var preview = document.createElement("p");
        preview.className = "growth-card-note";
        preview.textContent = photoCommentPreview.join(" / ");
        body.appendChild(preview);
      }

      card.appendChild(body);

      var actions = document.createElement("div");
      actions.className = "growth-card-actions";
      var editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "growth-edit";
      editBtn.textContent = "この記録を編集";
      editBtn.addEventListener("click", function () {
        startEdit(record);
      });
      actions.appendChild(editBtn);
      card.appendChild(actions);

      el.records.appendChild(card);
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
    syncEditFormUI();
    var areaId = preserveAreaId || currentAreaId();
    if (el.area && areaId) el.area.value = areaId;
    applyFormForArea(areaId);
    syncAreaEditContext(areaId);
    renderAreaGrowthFeed(areaId);
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
    applyFormForArea(areaId);
    syncAreaEditContext(areaId);
    renderAreaGrowthFeed(areaId);
  }

  function onDeleteRecord() {
    if (!state.editRecord || !state.editRecord.id) return;
    if (!window.confirm("このエリア記録を削除しますか？")) return;
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
          return apiErrorMessage(res, "記録の削除に失敗しました").then(function (msg) {
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
        clearEditMode(areaId);
        showToast("記録を削除しました");
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
          return apiErrorMessage(res, "エリア詳細の保存に失敗しました").then(function (msg) {
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
          new Error("写真も記録メモも空です。消したい場合は『この記録を削除』を使ってください。")
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
          return payload;
        });
      }

      if (state.photoQueue.length) {
        payload.imageMemos = imageMemosPayload();
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
      .then(function () {
        return Promise.all([loadAreaDetailsMerged(), loadAreaGrowthRecords()]);
      })
      .then(function (results) {
        state.entries = results[0] || [];
        state.areaGrowthRecords = results[1] || [];
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
    el.photoCamera = $("area-edit-photo-camera");
    el.photoLibrary = $("area-edit-photo-library");
    el.photoClear = $("area-edit-photo-clear");
    el.photoQueueEl = $("area-edit-photo-queue");
    el.photoQueueEmpty = $("area-edit-photo-queue-empty");
    el.save = $("area-edit-save");
    el.detailBreadcrumbLink = $("area-edit-detail-breadcrumb-link");
    el.recordLink = $("area-edit-record-link");
    el.viewLink = $("area-edit-view-link");
    el.growthLink = $("area-edit-growth-link");

    if (el.cloudToken) {
      el.cloudToken.value = localStorage.getItem(LS_CLOUD_TOKEN) || "";
    }
    if (el.cloudTokenSave) {
      el.cloudTokenSave.addEventListener("click", function () {
        var value = el.cloudToken ? el.cloudToken.value.trim() : "";
        if (value) localStorage.setItem(LS_CLOUD_TOKEN, value);
        else localStorage.removeItem(LS_CLOUD_TOKEN);
        showToast("トークンを保存しました。");
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
