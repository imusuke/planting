(function () {
  "use strict";

  var LS_CLOUD_TOKEN = "growthCloudToken";
  var API_AREA_DETAILS = "/api/area-details";
  var API_GROWTH_IMAGE = "/api/growth-image";
  var API_PLANTS = "/api/plants";
  var MAX_IMAGE_WIDTH = 1024;
  var JPEG_QUALITY = 0.76;
  var MAX_AREA_PHOTOS = 12;

  var state = {
    areas: [],
    entries: [],
    photoQueue: [],
    photosTouched: false,
  };

  var el = {};

  function $(id) {
    return document.getElementById(id);
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
    var h = { Accept: "application/json" };
    if (jsonBody) h["Content-Type"] = "application/json";
    var t = localStorage.getItem(LS_CLOUD_TOKEN);
    if (t) h["x-growth-token"] = t;
    return h;
  }

  function readEmbeddedPlants() {
    var e = document.getElementById("plants-embed");
    if (!e || !e.textContent.trim()) return null;
    try {
      return JSON.parse(e.textContent.trim());
    } catch (e0) {
      return null;
    }
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
        return fetch("data/plants.json", { cache: "no-store" })
          .then(function (res) {
            if (!res.ok) throw new Error("file");
            return res.json();
          });
      })
      .catch(function () {
        var emb = readEmbeddedPlants();
        if (emb && Array.isArray(emb.areas)) return emb;
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
    return tryLoadImageViaObjectUrl(file).catch(function (e) {
      if (e && e.message === "__img_decode__") {
        return tryLoadImageViaBitmap(file);
      }
      throw e;
    });
  }

  function loadImageFileFromBlob(blob) {
    return tryLoadImageViaObjectUrl(blob).catch(function (e) {
      if (e && e.message === "__img_decode__") {
        return tryLoadImageViaBitmap(blob);
      }
      throw e;
    });
  }

  function imageToJpegBlob(imgOrBitmap) {
    var w = growthIsImageBitmap(imgOrBitmap)
      ? imgOrBitmap.width
      : imgOrBitmap.naturalWidth;
    var h = growthIsImageBitmap(imgOrBitmap)
      ? imgOrBitmap.height
      : imgOrBitmap.naturalHeight;
    if (!w || !h) {
      if (growthIsImageBitmap(imgOrBitmap) && typeof imgOrBitmap.close === "function") {
        try {
          imgOrBitmap.close();
        } catch (c1) {}
      }
      throw new Error("画像サイズが無効です");
    }
    var scale = w > MAX_IMAGE_WIDTH ? MAX_IMAGE_WIDTH / w : 1;
    var cw = Math.round(w * scale);
    var ch = Math.round(h * scale);
    var canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    var ctx = canvas.getContext("2d");
    ctx.drawImage(imgOrBitmap, 0, 0, cw, ch);
    if (growthIsImageBitmap(imgOrBitmap) && typeof imgOrBitmap.close === "function") {
      try {
        imgOrBitmap.close();
      } catch (c2) {}
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

  function slotFromAreaImage(im) {
    if (!im || typeof im !== "object") return {};
    return {
      imageUrl: im.imageUrl || null,
      imagePathname: im.imagePathname || null,
      localSnapshotImage: im.localSnapshotImage || null,
    };
  }

  function resetPhotoQueueFromEntry(entry) {
    state.photoQueue = [];
    var imgs = entry && Array.isArray(entry.images) ? entry.images : [];
    for (var i = 0; i < imgs.length; i++) {
      var im = imgs[i];
      var cap = typeof im.caption === "string" ? im.caption : "";
      state.photoQueue.push({
        kind: "saved",
        slot: slotFromAreaImage(im),
        memo: cap,
      });
    }
    state.photosTouched = false;
    renderPhotoQueueUi();
  }

  function removePhotoQueueIndex(idx) {
    state.photoQueue.splice(idx, 1);
    state.photosTouched = true;
    renderPhotoQueueUi();
  }

  function fileLooksLikeImage(f) {
    if (!f) return false;
    var t = f.type || "";
    if (t.indexOf("image/") === 0) return true;
    var name = (f.name || "").toLowerCase();
    return /\.(jpe?g|png|gif|webp|heic|heif|bmp|avif|tiff?)$/i.test(name);
  }

  function appendFilesToQueue(fileList) {
    if (!fileList || !fileList.length) return;
    var n = 0;
    for (var i = 0; i < fileList.length; i++) {
      if (state.photoQueue.length >= MAX_AREA_PHOTOS) break;
      var f = fileList[i];
      if (!fileLooksLikeImage(f)) continue;
      state.photoQueue.push({ kind: "new", file: f, memo: "" });
      state.photosTouched = true;
      n++;
    }
    if (n < fileList.length) {
      showToast("写真は最大 " + MAX_AREA_PHOTOS + " 枚までです。", true);
    }
    renderPhotoQueueUi();
  }

  function renderPhotoQueueUi() {
    if (!el.photoQueueEl) return;
    var oldImgs = el.photoQueueEl.querySelectorAll("img.growth-photo-queue-thumb");
    for (var oi = 0; oi < oldImgs.length; oi++) {
      var ou = oldImgs[oi].src || "";
      if (ou.indexOf("blob:") === 0) {
        try {
          URL.revokeObjectURL(ou);
        } catch (revErr) {}
      }
    }
    el.photoQueueEl.innerHTML = "";
    if (el.photoQueueEmpty) {
      el.photoQueueEmpty.hidden = state.photoQueue.length > 0;
    }
    if (el.photoClear) {
      el.photoClear.hidden = state.photoQueue.length === 0;
    }

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
      if (item.kind === "new" && item.file) {
        try {
          thumb.src = URL.createObjectURL(item.file);
        } catch (e1) {
          thumb.removeAttribute("src");
        }
      } else if (item.kind === "saved" && item.slot) {
        var ssrc = growthImageSrcFromSlot(item.slot);
        if (ssrc) thumb.src = ssrc;
        thumb.addEventListener("error", function onThumbErr() {
          thumb.removeEventListener("error", onThumbErr);
          if (thumb.dataset.thumbFb === "1") return;
          var sl = item.slot;
          if (!sl || !sl.localSnapshotImage) return;
          var fb = sl.imageUrl || "";
          if (!fb && sl.imagePathname) {
            fb = API_GROWTH_IMAGE + "?pathname=" + encodeURIComponent(sl.imagePathname);
          }
          if (fb) {
            thumb.dataset.thumbFb = "1";
            thumb.src = fb;
          }
        });
      }
      var rm = document.createElement("button");
      rm.type = "button";
      rm.className = "growth-photo-queue-remove";
      rm.setAttribute("aria-label", "この写真を一覧から外す");
      rm.textContent = "削除";
      rm.addEventListener("click", function () {
        var at = state.photoQueue.indexOf(item);
        if (at !== -1) removePhotoQueueIndex(at);
      });
      thumbWrap.appendChild(thumb);
      thumbWrap.appendChild(rm);
      var memoTa = document.createElement("textarea");
      memoTa.className = "growth-photo-memo";
      memoTa.setAttribute("aria-label", "写真" + (idx + 1) + "枚目のキャプション");
      memoTa.rows = 2;
      memoTa.placeholder = "キャプション（任意）";
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

  function buildImagesBase64Payload() {
    var q = state.photoQueue;
    if (!q.length) return Promise.resolve([]);
    return Promise.all(
      q.map(function (item) {
        if (item.kind === "new") {
          return loadImageFile(item.file)
            .then(imageToJpegBlob)
            .then(blobToDataURL)
            .then(dataUrlToBase64Part);
        }
        var url = growthImageSrcFromSlot(item.slot);
        if (!url) return Promise.resolve(null);
        return fetch(url, { cache: "no-store" })
          .then(function (res) {
            if (!res.ok) throw new Error("既存写真の読み込みに失敗しました");
            return res.blob();
          })
          .then(loadImageFileFromBlob)
          .then(imageToJpegBlob)
          .then(blobToDataURL)
          .then(dataUrlToBase64Part);
      })
    ).then(function (parts) {
      return parts.filter(Boolean);
    });
  }

  function imageMemosPayload() {
    return state.photoQueue.map(function (it) {
      return it.memo != null ? String(it.memo) : "";
    });
  }

  function hasNewFiles() {
    for (var i = 0; i < state.photoQueue.length; i++) {
      if (state.photoQueue[i].kind === "new") return true;
    }
    return false;
  }

  function apiErrorMessage(res, fallbackPrefix) {
    return res.text().then(function (text) {
      var detail = "";
      try {
        var j = JSON.parse(text);
        if (j && j.detail) detail = j.detail;
        else if (j && j.error) detail = j.error;
      } catch (e) {}
      var base = fallbackPrefix + "（" + res.status + "）";
      return detail ? base + " — " + detail : base;
    });
  }

  function applyFormForArea(areaId) {
    var entry = null;
    for (var i = 0; i < state.entries.length; i++) {
      if (state.entries[i].areaId === areaId) {
        entry = state.entries[i];
        break;
      }
    }
    if (!entry) {
      entry = { areaId: areaId, summary: "", body: "", images: [] };
    }
    if (el.summary) el.summary.value = entry.summary || "";
    if (el.body) el.body.value = entry.body || "";
    resetPhotoQueueFromEntry(entry);
  }

  function onAreaChange() {
    var id = el.area && el.area.value;
    if (!id) return;
    applyFormForArea(id);
  }

  function onSubmit(e) {
    e.preventDefault();
    var areaId = el.area && el.area.value;
    if (!areaId) {
      showToast("エリアを選んでください", true);
      return;
    }
    if (!el.save) return;
    el.save.disabled = true;

    var summary = el.summary ? el.summary.value.trim() : "";
    var body = el.body ? el.body.value.trim() : "";

    var payload = {
      areaId: areaId,
      summary: summary,
      body: body,
    };

    var doPost = function (extra) {
      var p = Object.assign({}, payload, extra || {});
      return fetch(API_AREA_DETAILS, {
        method: "POST",
        headers: cloudHeaders(true),
        body: JSON.stringify(p),
      }).then(function (res) {
        if (res.status === 401) {
          throw new Error("トークンが違います。成長記録と同じアップロード用トークンを入力してください。");
        }
        if (res.status === 503) {
          return apiErrorMessage(res, "サーバー側の設定").then(function (msg) {
            throw new Error(msg);
          });
        }
        if (res.status === 502) {
          return apiErrorMessage(res, "写真の保存に失敗しました").then(function (msg) {
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
    };

    var chain;
    if (state.photosTouched || hasNewFiles()) {
      chain = buildImagesBase64Payload().then(function (arr) {
        return doPost({
          imagesBase64: arr,
          imageCaptions: imageMemosPayload(),
        });
      });
    } else {
      chain = doPost({
        imageCaptions: imageMemosPayload(),
      });
    }

    chain
      .then(function () {
        showToast("保存しました");
        return loadAreaDetailsMerged();
      })
      .then(function (entries) {
        state.entries = entries;
        applyFormForArea(areaId);
      })
      .catch(function (err) {
        showToast(err && err.message ? err.message : String(err), true);
      })
      .finally(function () {
        el.save.disabled = false;
      });
  }

  function populateAreaSelect() {
    if (!el.area) return;
    el.area.innerHTML = "";
    state.areas.forEach(function (a) {
      if (!a || !a.id) return;
      var opt = document.createElement("option");
      opt.value = a.id;
      opt.textContent = a.label || a.id;
      el.area.appendChild(opt);
    });
  }

  function init() {
    el.toast = $("area-edit-toast");
    el.cloudStatus = $("area-edit-cloud-status");
    el.cloudToken = $("area-edit-cloud-token");
    el.cloudTokenSave = $("area-edit-cloud-token-save");
    el.form = $("area-edit-form");
    el.area = $("area-edit-area");
    el.summary = $("area-edit-summary");
    el.body = $("area-edit-body");
    el.photoLibrary = $("area-edit-photo-library");
    el.photoClear = $("area-edit-photo-clear");
    el.photoQueueEl = $("area-edit-photo-queue");
    el.photoQueueEmpty = $("area-edit-photo-queue-empty");
    el.save = $("area-edit-save");

    if (el.cloudToken) {
      el.cloudToken.value = localStorage.getItem(LS_CLOUD_TOKEN) || "";
    }
    if (el.cloudTokenSave) {
      el.cloudTokenSave.addEventListener("click", function () {
        var v = el.cloudToken ? el.cloudToken.value.trim() : "";
        if (v) localStorage.setItem(LS_CLOUD_TOKEN, v);
        else localStorage.removeItem(LS_CLOUD_TOKEN);
        showToast("トークンを保存しました");
      });
    }
    if (el.cloudStatus) {
      el.cloudStatus.textContent =
        window.location.protocol === "file:"
          ? "file:// で開いていると API に接続できません。http(s) で開いてください。"
          : "GET /api/area-details でエリア情報を読み込みます。";
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
        state.photoQueue = [];
        state.photosTouched = true;
        renderPhotoQueueUi();
      });
    }
    if (el.area) {
      el.area.addEventListener("change", onAreaChange);
    }
    if (el.form) {
      el.form.addEventListener("submit", onSubmit);
    }

    Promise.all([loadPlantsData(), loadAreaDetailsMerged()])
      .then(function (results) {
        state.areas = results[0].areas || [];
        state.entries = results[1] || [];
        populateAreaSelect();
        var params = new URLSearchParams(window.location.search);
        var want = (params.get("area") || "").trim();
        if (want && el.area) {
          var found = false;
          for (var i = 0; i < el.area.options.length; i++) {
            if (el.area.options[i].value === want) {
              found = true;
              break;
            }
          }
          el.area.value = found ? want : el.area.options[0] ? el.area.options[0].value : "";
        }
        if (el.area && el.area.value) {
          applyFormForArea(el.area.value);
        }
      })
      .catch(function () {
        showToast("データを読み込めませんでした", true);
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
