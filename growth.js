(function () {
  "use strict";

  var PAGE =
    (document.documentElement.getAttribute("data-growth-page") ||
      document.body.getAttribute("data-growth-page") ||
      "edit").toLowerCase();
  var IS_VIEW = PAGE === "view";
  var common = window.PlantingEditCommon || {};
  var sanitizeAiPlainText =
    common.sanitizeAiPlainText ||
    function (value) {
      return String(value || "").trim();
    };
  var buildAiCommentJobStatusMessage =
    common.buildAiCommentJobStatusMessage ||
    function (job, options) {
      var opts = options || {};
      if (!job) return opts.pendingMessage || "AIコメントを更新しています。保存後は画面を離れても大丈夫です。";
      if (job.status === "queued") {
        return opts.queuedMessage || "AIコメントを更新予約しました。保存後は画面を離れても大丈夫です。";
      }
      if (job.status === "running") {
        return opts.runningMessage || "AIコメントを更新しています。保存後は画面を離れても大丈夫です。";
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
        return opts.doneMessage || "AIコメントを反映しました。必要なら微調整して保存してください。";
      }
      if (job.status === "failed") {
        return job.detail
          ? "AIコメントの更新に失敗しました。（" + job.detail + "）"
          : "AIコメントの更新に失敗しました。";
      }
      return opts.pendingMessage || "AIコメントを更新しています。保存後は画面を離れても大丈夫です。";
    };
  var buildPhotoAiActionLabel =
    common.buildPhotoAiActionLabel ||
    function (options) {
      var opts = options || {};
      if (opts.isBusy) return opts.busyLabel || "AIコメント更新中…";
      if (opts.hasTarget === false) return opts.unavailableLabel || "AIでコメント追加";
      return opts.hasMemo ? opts.refreshLabel || "AIでコメント再生成" : opts.addLabel || "AIでコメント追加";
    };
  var buildPhotoAiRequestStatus =
    common.buildPhotoAiRequestStatus ||
    function (options) {
      var opts = options || {};
      var prefix = opts.withUserInstruction ? "入力内容を踏まえながら、" : "";
      return prefix + "この1枚の写真" + (opts.hasMemo ? "の" : "に") + "AIコメントを" + (opts.hasMemo ? "更新" : "追加") + "しています。";
    };
  var buildPhotoAiResultMessage =
    common.buildPhotoAiResultMessage ||
    function (options) {
      var opts = options || {};
      return "AIコメントを" + (opts.hasMemo ? "更新" : "追加") + "しました。" + (opts.suffix || "");
    };
  var buildPhotoAiDeferredMessage =
    common.buildPhotoAiDeferredMessage ||
    function (detail, options) {
      var opts = options || {};
      var base = opts.baseMessage || "AIコメントはまだ反映されていません。少ししてから開き直してください。";
      return detail ? base + "（" + detail + "）" : base;
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

  var LS_CLOUD_TOKEN = "growthCloudToken";
  var LS_THUMB_SIZE = "growthThumbSize";
  var LS_FEED_SORT = "growthFeedSort";
  var API_GROWTH = "/api/growth";
  var API_CHANGE_LOG = "/api/change-log";
  var API_GROWTH_AI_REFRESH = "/api/growth-ai-refresh";
  var API_GROWTH_COMMENT = "/api/growth-photo-comment";
  var API_GROWTH_IMAGE = "/api/growth-image";
  /** 閲覧ページ: API 失敗時に試すリポジトリ内スナップショット（npm run sync:prod で更新） */
  var GROWTH_SNAPSHOT_JSON = "./data/growth-snapshot.json";
  var API_PLANTS = "/api/plants";
  var MAX_IMAGE_WIDTH = 1024;
  var JPEG_QUALITY = 0.76;
  var MIN_JPEG_QUALITY = 0.45;
  var MAX_BYTES_PER_IMAGE = 280 * 1024;
  var MAX_TOTAL_UPLOAD_BYTES = 3800 * 1024;
  var MAX_GROWTH_PHOTOS = 12;

  var state = {
    areas: [],
    /** Snapshot for rename detection when saving the catalog */
    plantsBaseline: [],
    /** "kv" | "file" | "embed" */
    plantsSource: "file",
    /** @type {null | { id: string, createdAt: string|null, plants: string[] }} */
    editRecord: null,
    /** 閲覧ページ: 最後に取得した記録（表示切替のみで再取得しない） */
    lastGrowthRecords: [],
    /** 閲覧ページ: "grid" | "timeline" */
    viewLayout: "grid",
    /** URL の plant をタイムライン用セレクトに適用するまでの一時値 */
    pendingTimelinePlant: null,
    /** 閲覧ページ: "newest" | "oldest" — 記録一覧・植栽別タイムラインの並び */
    feedSortOrder: "newest",
    /** 編集フォーム: { kind: "saved", slot } | { kind: "new", file } */
    photoQueue: [],
    /** 写真キューをユーザーが変更したか（保存時に imagesBase64 を送るか） */
    photosTouched: false,
    /** 写真メモの AI 生成が進行中か */
    photoAiBusy: false,
    pendingEditPhotoIndex: null,
  };

  var el = {
    form: null,
    date: null,
    area: null,
    plantChecks: null,
    customPlant: null,
    submitNext: null,
    photoCamera: null,
    photoLibrary: null,
    photoStatus: null,
    photoClear: null,
    photoAiGenerate: null,
    photoAiStatus: null,
    bulkMissingCommentsAiBtn: null,
    bulkMissingCommentsAiStatus: null,
    photoQueueEl: null,
    photoQueueEmpty: null,
    submit: null,
    toast: null,
    filterArea: null,
    filterPlant: null,
    filterCommentState: null,
    feed: null,
    exportBtn: null,
    cloudToken: null,
    cloudTokenSave: null,
    cloudStatus: null,
    changeLogStatus: null,
    changeLogList: null,
    changeLogReload: null,
    viewStatus: null,
    newHeading: null,
    editBanner: null,
    editCancel: null,
    plantsCatalogSource: null,
    plantsCatalogEditor: null,
    plantsCatalogReload: null,
    plantsCatalogAddArea: null,
    plantsCatalogSave: null,
    plantsRecordRenameArea: null,
    plantsRecordRenameFrom: null,
    plantsRecordRenameTo: null,
    deleteRecordBtn: null,
    thumbSize: null,
    growthTabBtnRecord: null,
    growthTabBtnAreas: null,
    growthTabBtnPlants: null,
    growthTabPanelRecord: null,
    growthTabPanelMaster: null,
    sequenceGuide: null,
    sequenceArea: null,
    sequencePlants: null,
    sequenceClear: null,
    viewModeGridRadio: null,
    viewModeTimelineRadio: null,
    plantTimeline: null,
    feedSort: null,
  };

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
      el.toast.classList.remove("is-visible");
    }, 4200);
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

  function currentCloudToken() {
    if (common.getCloudToken) {
      return common.getCloudToken({
        inputEl: !IS_VIEW ? el.cloudToken : null,
        storageKey: LS_CLOUD_TOKEN,
      });
    }
    var typed = !IS_VIEW && el.cloudToken && typeof el.cloudToken.value === "string" ? el.cloudToken.value.trim() : "";
    if (typed) return typed;
    try {
      return localStorage.getItem(LS_CLOUD_TOKEN) || "";
    } catch (eToken) {
      return "";
    }
  }

  function cloudHeaders(jsonBody) {
    var h = { Accept: "application/json" };
    if (jsonBody) h["Content-Type"] = "application/json";
    var t = currentCloudToken();
    if (t) h["x-growth-token"] = t;
    return h;
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
          memo: typeof im.memo === "string" ? im.memo : "",
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
      } catch (e1) {
        return p;
      }
    }
    if (slot.imagePathname) {
      return API_GROWTH_IMAGE + "?pathname=" + encodeURIComponent(slot.imagePathname);
    }
    return slot.imageUrl || null;
  }

  function growthImageSrc(r) {
    var slots = growthImageSlots(r);
    return slots.length ? growthImageSrcFromSlot(slots[0]) : null;
  }

  /** 同一記録日でも安定して並ぶよう createdAt・id でタイブレーク */
  function compareGrowthRecordsForSort(a, b, newestFirst) {
    var da = a.recordedAt || "";
    var db = b.recordedAt || "";
    var ca = a.createdAt || "";
    var cb = b.createdAt || "";
    var ia = String(a.id || "");
    var ib = String(b.id || "");
    if (newestFirst) {
      var c = db.localeCompare(da);
      if (c !== 0) return c;
      c = cb.localeCompare(ca);
      if (c !== 0) return c;
      return ib.localeCompare(ia);
    }
    var c2 = da.localeCompare(db);
    if (c2 !== 0) return c2;
    c2 = ca.localeCompare(cb);
    if (c2 !== 0) return c2;
    return ia.localeCompare(ib);
  }

  function sortFilteredGrowthRecords(filtered) {
    var newest = state.feedSortOrder !== "oldest";
    filtered.sort(function (a, b) {
      return compareGrowthRecordsForSort(a, b, newest);
    });
  }

  function growthZoomCaptionForRecord(r) {
    if (!r) return "";
    var parts = [];
    parts.push((r.recordedAt || "").slice(0, 10));
    if (r.plants && r.plants.length) parts.push(r.plants.join("、"));
    var areaText = r.areaLabel ? String(r.areaLabel).trim() : "";
    if (!areaText && r.areaId && state.areas && state.areas.length) {
      var aid = String(r.areaId).trim();
      for (var ai = 0; ai < state.areas.length; ai++) {
        var ar = state.areas[ai];
        if (ar && ar.id === aid) {
          areaText = (ar.label && String(ar.label).trim()) || aid;
          break;
        }
      }
      if (!areaText && aid) areaText = aid;
    }
    if (areaText) parts.push("エリア: " + areaText);
    var noteText = typeof r.note === "string" ? r.note.trim() : "";
    if (noteText) parts.push("メモ: " + noteText);
    return parts.filter(Boolean).join(" · ");
  }

  /** ライトボックス用：各写真スロットごとのキャプション（写真単位メモを付与） */
  function growthZoomCaptionsForRecordImages(r) {
    var base = growthZoomCaptionForRecord(r);
    var slots = growthImageSlots(r);
    var out = [];
    for (var si = 0; si < slots.length; si++) {
      var u = growthImageSrcFromSlot(slots[si]);
      if (!u) continue;
      var m = sanitizeAiPlainText(slots[si] && slots[si].memo);
      if (m) {
        out.push(base + (base ? " · " : "") + "写真メモ: " + m);
      } else {
        out.push(base);
      }
    }
    return out;
  }

  function countGrowthRecordImages(r) {
    var slots = growthImageSlots(r);
    var n = 0;
    for (var ci = 0; ci < slots.length; ci++) {
      if (growthImageSrcFromSlot(slots[ci])) n++;
    }
    return n;
  }

  function growthRecordPhotoCommentStats(r) {
    var slots = growthImageSlots(r);
    var total = 0;
    var filled = 0;
    for (var i = 0; i < slots.length; i++) {
      if (!growthImageSrcFromSlot(slots[i])) continue;
      total += 1;
      var memo = slots[i] && slots[i].memo != null ? String(slots[i].memo).trim() : "";
      if (memo) filled += 1;
    }
    return {
      total: total,
      filled: filled,
      missing: total - filled,
    };
  }

  function flattenGrowthRecordsForLightbox(records) {
    var urls = [];
    var captions = [];
    var refs = [];
    for (var ri = 0; ri < records.length; ri++) {
      var rec = records[ri];
      var capLine = growthZoomCaptionForRecord(rec);
      var slots = growthImageSlots(rec);
      for (var si = 0; si < slots.length; si++) {
        var u = growthImageSrcFromSlot(slots[si]);
        if (u) {
          urls.push(u);
          refs.push({
            recordId: rec && rec.id != null ? String(rec.id) : "",
            imageIndex: si,
          });
          var pm = sanitizeAiPlainText(slots[si] && slots[si].memo);
          if (pm) {
            captions.push(capLine + (capLine ? " · " : "") + "写真メモ: " + pm);
          } else {
            captions.push(capLine);
          }
        }
      }
    }
    return { urls: urls, captions: captions, refs: refs };
  }

  function lightboxFlatIndexForRecordImage(sortedRecords, recordId, imgIndexInRecord) {
    var rid = recordId != null ? String(recordId) : "";
    var flat = 0;
    for (var i = 0; i < sortedRecords.length; i++) {
      var r = sortedRecords[i];
      if (String(r.id || "") === rid) {
        var nimg = countGrowthRecordImages(r);
        var clamped = imgIndexInRecord;
        if (clamped < 0) clamped = 0;
        if (nimg && clamped >= nimg) clamped = nimg - 1;
        return flat + clamped;
      }
      flat += countGrowthRecordImages(r);
    }
    return -1;
  }

  function getGrowthViewRecordsForLightbox() {
    if (!IS_VIEW || !el.filterArea) return null;
    var records = state.lastGrowthRecords || [];
    var fa = el.filterArea.value || "";
    var fp = el.filterPlant ? el.filterPlant.value || "" : "";
    var filtered;
    if (state.viewLayout === "timeline") {
      if (!fp) return [];
      filtered = records.filter(function (r) {
        if (fa && r.areaId !== fa) return false;
        return r.plants && r.plants.indexOf(fp) !== -1;
      });
    } else {
      filtered = records.filter(function (r) {
        if (fa && r.areaId !== fa) return false;
        if (fp && (!r.plants || r.plants.indexOf(fp) === -1)) return false;
        return true;
      });
    }
    var sorted = filtered.slice();
    sortFilteredGrowthRecords(sorted);
    return sorted;
  }

  function lightboxFilterPlantChoiceCount() {
    if (!el.filterPlant) return 0;
    var opts = el.filterPlant.querySelectorAll("option");
    var n = 0;
    for (var oi = 0; oi < opts.length; oi++) {
      if (opts[oi].value) n++;
    }
    return n;
  }

  function lightboxTimelineAdjacentPlant(delta) {
    if (!el.filterPlant) return null;
    var opts = el.filterPlant.querySelectorAll("option");
    var vals = [];
    for (var i = 0; i < opts.length; i++) {
      if (opts[i].value) vals.push(opts[i].value);
    }
    var cur = el.filterPlant.value;
    var ix = -1;
    for (var j = 0; j < vals.length; j++) {
      if (vals[j] === cur) {
        ix = j;
        break;
      }
    }
    if (ix < 0) return null;
    var ni = ix + delta;
    if (ni < 0 || ni >= vals.length) return null;
    return vals[ni];
  }

  var growthPhotoLightboxEls = null;
  /** サムネイルのクリックがそのまま shell に届き、開いた直後に閉じるのを防ぐ */
  var growthLightboxOpenedAt = 0;
  var growthLightboxAiBusy = false;
  var growthLightboxTimelineOpen = false;
  var growthLightboxTimelinePlant = "";
  var growthLightboxGallery = {
    urls: [],
    index: 0,
    captionBase: "",
    captions: null,
    refs: null,
    timelineCrossPlant: false,
    anchorRecordId: "",
  };

  function growthLightboxRefreshAreaSelect(pack) {
    if (!pack || !pack.areaRow || !pack.areaSelect) return;
    if (!IS_VIEW || !el.filterArea || !state.areas || !state.areas.length) {
      pack.areaRow.hidden = true;
      return;
    }
    pack.areaRow.hidden = false;
    var sel = pack.areaSelect;
    var keep = el.filterArea.value || "";
    sel.innerHTML = "";
    var o0 = document.createElement("option");
    o0.value = "";
    o0.textContent = "（すべて）";
    sel.appendChild(o0);
    state.areas.forEach(function (a) {
      if (!a || !a.id) return;
      var o = document.createElement("option");
      o.value = a.id;
      o.textContent = a.label || a.id;
      sel.appendChild(o);
    });
    sel.value = keep;
    if (sel.value !== keep && keep) sel.value = "";
  }

  function growthLightboxApplyAreaFilterAndRebuild(pack, newAreaValue) {
    if (!IS_VIEW || !el.filterArea || !pack || !pack.areaSelect) return;
    var prevArea = el.filterArea.value || "";
    var prevPlant = el.filterPlant ? el.filterPlant.value || "" : "";
    var prevUrls = growthLightboxGallery.urls.slice();
    var prevIdx = growthLightboxGallery.index;
    var prevCaptions = growthLightboxGallery.captions ? growthLightboxGallery.captions.slice() : null;
    var prevRefs = growthLightboxGallery.refs ? growthLightboxGallery.refs.slice() : null;
    var prevTcp = growthLightboxGallery.timelineCrossPlant;

    el.filterArea.value = newAreaValue || "";
    if (state.viewLayout === "grid" && el.filterPlant) el.filterPlant.value = "";
    updateFilterPlantOptions();
    if (state.viewLayout === "timeline") {
      renderPlantTimeline(state.lastGrowthRecords);
    } else {
      renderViewMain(state.lastGrowthRecords);
    }
    pack.areaSelect.value = el.filterArea.value;

    var sorted = getGrowthViewRecordsForLightbox();
    var flat = sorted && sorted.length ? flattenGrowthRecordsForLightbox(sorted) : { urls: [], captions: [], refs: [] };
    if (!flat.urls.length) {
      el.filterArea.value = prevArea;
      if (el.filterPlant) el.filterPlant.value = prevPlant;
      updateFilterPlantOptions();
      if (state.viewLayout === "timeline") {
        renderPlantTimeline(state.lastGrowthRecords);
      } else {
        renderViewMain(state.lastGrowthRecords);
      }
      pack.areaSelect.value = prevArea;
      growthLightboxGallery.urls = prevUrls;
      growthLightboxGallery.captions = prevCaptions;
      growthLightboxGallery.refs = prevRefs;
      growthLightboxGallery.index = prevIdx;
      growthLightboxGallery.timelineCrossPlant = prevTcp;
      pack.showAt(pack, prevIdx);
      showToast("このエリアに写真のある記録はありません。", true);
      return;
    }

    var curUrl = prevUrls.length && prevIdx >= 0 && prevIdx < prevUrls.length ? prevUrls[prevIdx] : "";
    var newIdx = curUrl ? flat.urls.indexOf(curUrl) : -1;
    if (newIdx < 0 && growthLightboxGallery.anchorRecordId) {
      newIdx = lightboxFlatIndexForRecordImage(sorted, growthLightboxGallery.anchorRecordId, 0);
    }
    if (newIdx < 0) newIdx = 0;

    growthLightboxGallery.urls = flat.urls;
    growthLightboxGallery.captions = flat.captions;
    growthLightboxGallery.refs = flat.refs || null;
    growthLightboxGallery.timelineCrossPlant =
      state.viewLayout === "timeline" &&
      el.filterPlant &&
      el.filterPlant.value &&
      lightboxFilterPlantChoiceCount() > 1;
    pack.showAt(pack, newIdx);
  }

  function growthLightboxSyncCaption(pack) {
    var g = growthLightboxGallery;
    var capEl = pack && pack.caption;
    if (!capEl) return;
    var base = "";
    if (g.captions && g.captions.length === g.urls.length && g.index >= 0 && g.index < g.captions.length) {
      base = g.captions[g.index] || "";
    } else {
      base = g.captionBase || "";
    }
    if (g.urls.length > 1) {
      capEl.textContent = base + (base ? " · " : "") + (g.index + 1) + " / " + g.urls.length;
      capEl.hidden = false;
    } else if (base) {
      capEl.textContent = base;
      capEl.hidden = false;
    } else {
      capEl.textContent = "";
      capEl.hidden = true;
    }
  }

  function growthLightboxUpdateChrome(pack) {
    if (!pack) return;
    var g = growthLightboxGallery;
    var canNav = g.urls.length > 1 || g.timelineCrossPlant;
    pack.prevBtn.hidden = !canNav;
    pack.nextBtn.hidden = !canNav;
    if (pack.cornerNav) {
      pack.cornerNav.hidden = false;
      if (pack.cornerPrev) pack.cornerPrev.disabled = !canNav;
      if (pack.cornerNext) pack.cornerNext.disabled = !canNav;
    }
    growthLightboxSyncCaption(pack);
    growthLightboxSyncEditLink(pack);
    growthLightboxSyncAiButton(pack);
    growthLightboxSyncTimelineButton(pack);
  }

  function growthLightboxCanNavigate() {
    var g = growthLightboxGallery;
    return g.urls.length > 1 || g.timelineCrossPlant;
  }

  function growthLightboxCurrentRef() {
    var refs = growthLightboxGallery.refs;
    var idx = growthLightboxGallery.index;
    if (!refs || !refs.length || idx < 0 || idx >= refs.length) return null;
    return refs[idx] || null;
  }

  function growthLightboxCurrentEditHref() {
    var ref = growthLightboxCurrentRef();
    if (!ref || !ref.recordId) return "./growth-edit.html";
    var href = "./growth-edit.html?id=" + encodeURIComponent(ref.recordId);
    if (ref.imageIndex != null && !isNaN(ref.imageIndex)) {
      href += "&photo=" + encodeURIComponent(String(ref.imageIndex));
    }
    return href;
  }

  function growthLightboxSyncEditLink(pack) {
    var editLink = pack && pack.editLink;
    if (!editLink) return;
    var ref = growthLightboxCurrentRef();
    if (!ref || !ref.recordId) {
      editLink.hidden = true;
      editLink.removeAttribute("href");
      return;
    }
    editLink.hidden = false;
    editLink.href = growthLightboxCurrentEditHref();
  }

  function growthRecordPlantNames(record) {
    var out = [];
    var seen = {};
    (record && Array.isArray(record.plants) ? record.plants : []).forEach(function (plantName) {
      var name =
        typeof plantName === "string"
          ? normalizeLooseString(plantName)
          : normalizeLooseString(String(plantName || ""));
      if (!name || seen[name]) return;
      seen[name] = true;
      out.push(name);
    });
    return out;
  }

  function growthRecordIndexById(recordId) {
    var rid = recordId != null ? String(recordId) : "";
    if (!rid) return -1;
    for (var i = 0; i < state.lastGrowthRecords.length; i++) {
      var rec = state.lastGrowthRecords[i];
      if (rec && String(rec.id || "") === rid) return i;
    }
    return -1;
  }

  function growthRecordById(recordId) {
    var idx = growthRecordIndexById(recordId);
    return idx >= 0 ? state.lastGrowthRecords[idx] : null;
  }

  function replaceGrowthRecordInState(nextRecord) {
    if (!nextRecord || nextRecord.id == null) return false;
    var idx = growthRecordIndexById(nextRecord.id);
    if (idx < 0) return false;
    state.lastGrowthRecords[idx] = nextRecord;
    return true;
  }

  function rerenderCurrentGrowthView() {
    if (!IS_VIEW) return;
    if (state.viewLayout === "timeline") {
      renderPlantTimeline(state.lastGrowthRecords);
      return;
    }
    renderViewMain(state.lastGrowthRecords);
  }

  function fetchGrowthRecordById(recordId) {
    return fetch(API_GROWTH, { headers: cloudHeaders(false) })
      .then(function (res) {
        if (!res.ok) {
          return apiErrorMessage(res, "AIコメントの更新結果を確認できませんでした").then(function (msg) {
            throw new Error(msg);
          });
        }
        return res.json();
      })
      .then(function (data) {
        var records = data && Array.isArray(data.records) ? data.records : [];
        var rid = recordId != null ? String(recordId) : "";
        for (var i = 0; i < records.length; i++) {
          var rec = records[i];
          if (rec && String(rec.id || "") === rid) return rec;
        }
        return null;
      });
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

  function recordMatchesCommentFilter(record, mode) {
    var wanted = String(mode || "").trim();
    if (!wanted) return true;
    var slots = growthImageSlots(record);
    var job = readRecordAiCommentJob(record);
    if (wanted === "missing_photo_memo") {
      if (!slots.length) return false;
      for (var i = 0; i < slots.length; i++) {
        var memo = slots[i] && slots[i].memo != null ? String(slots[i].memo).trim() : "";
        if (!memo) return true;
      }
      return false;
    }
    if (wanted === "ai_running") {
      return !!job && (job.status === "queued" || job.status === "running");
    }
    if (wanted === "ai_failed") {
      return !!job && job.status === "failed";
    }
    return true;
  }

  function growthAiJobResult(record, jobId) {
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

  function growthAiJobStatusMessage(job, options) {
    return buildAiCommentJobStatusMessage(job, options || { doneMessage: "AIコメントを反映しました。必要なら微調整して保存してください。" });
  }

  function setBulkMissingCommentsAiStatus(message, isError) {
    if (!el.bulkMissingCommentsAiStatus) return;
    el.bulkMissingCommentsAiStatus.textContent = message || "";
    el.bulkMissingCommentsAiStatus.className =
      "growth-hint growth-status" + (isError ? " growth-status--error" : "");
  }

  function getFilteredEditRecords(records) {
    var list = Array.isArray(records) ? records.slice() : [];
    var fa = el.filterArea ? el.filterArea.value : "";
    var fp = el.filterPlant ? el.filterPlant.value : "";
    var fc = el.filterCommentState ? el.filterCommentState.value : "";
    return list.filter(function (r) {
      if (fa && r.areaId !== fa) return false;
      if (fp && (!r.plants || r.plants.indexOf(fp) === -1)) return false;
      if (fc && !recordMatchesCommentFilter(r, fc)) return false;
      return true;
    });
  }

  function collectVisibleMissingCommentTargets(records) {
    var visibleRecords = Array.isArray(records) ? records.slice() : getFilteredEditRecords(state.lastGrowthRecords);
    return visibleRecords.reduce(function (out, record) {
      var job = readRecordAiCommentJob(record);
      if (job && (job.status === "queued" || job.status === "running")) return out;
      var targets = [];
      growthImageSlots(record).forEach(function (slot, idx) {
        var memo = slot && slot.memo != null ? String(slot.memo).trim() : "";
        if (!memo) targets.push(idx);
      });
      if (targets.length) {
        out.push({
          id: String(record.id || ""),
          record: record,
          targets: targets,
        });
      }
      return out;
    }, []);
  }

  function syncBulkMissingCommentsAiButton(records) {
    if (!el.bulkMissingCommentsAiBtn) return;
    var targets = collectVisibleMissingCommentTargets(records);
    el.bulkMissingCommentsAiBtn.disabled = state.photoAiBusy || !targets.length;
    el.bulkMissingCommentsAiBtn.textContent = targets.length
      ? "表示中の未入力コメントにAIコメントを追加（" + targets.length + "件）"
      : "表示中の未入力コメントにAIコメントを追加";
    if (!targets.length && el.bulkMissingCommentsAiStatus && !el.bulkMissingCommentsAiStatus.textContent) {
      setBulkMissingCommentsAiStatus("未入力コメントのある記録を絞り込むと、ここからまとめて追加できます。", false);
    }
  }

  function runBulkMissingCommentsAiRefresh() {
    if (!el.bulkMissingCommentsAiBtn) return;
    var storedToken = currentCloudToken();
    if (!storedToken) {
      setBulkMissingCommentsAiStatus("アップロード用トークンを入力してから実行してください。", true);
      if (el.cloudToken && typeof el.cloudToken.focus === "function") el.cloudToken.focus();
      showToast("アップロード用トークンを保存するとAIコメントを追加できます。", true);
      return;
    }

    var queue = collectVisibleMissingCommentTargets();
    if (!queue.length) {
      setBulkMissingCommentsAiStatus("表示中の記録に、未入力の写真コメントはありません。", false);
      showToast("未入力コメントのある記録はありません。");
      syncBulkMissingCommentsAiButton();
      return;
    }

    var completed = 0;
    var updated = 0;
    var failed = 0;
    var firstError = "";
    el.bulkMissingCommentsAiBtn.disabled = true;
    setBulkMissingCommentsAiStatus(
      queue.length + "件の記録について、未入力コメントへAIコメントを追加しています…",
      false
    );

    function runNext() {
      if (!queue.length) return Promise.resolve();
      var entry = queue.shift();
      var baseRecord = growthRecordById(entry.id) || entry.record;
      var pendingLabel =
        (baseRecord && Array.isArray(baseRecord.plants) && baseRecord.plants.length
          ? baseRecord.plants.join("、")
          : "この記録") + " の未入力コメントを追加しています…";
      setBulkMissingCommentsAiStatus(
        pendingLabel + " (" + (completed + 1) + "/" + (completed + queue.length + 1) + ")",
        false
      );

      return fetch(API_GROWTH_AI_REFRESH, {
        method: "POST",
        cache: "no-store",
        keepalive: true,
        headers: cloudHeaders(true),
        body: JSON.stringify({
          id: entry.id,
          targets: entry.targets.slice(),
        }),
      })
        .then(function (res) {
          if (res.status === 401) {
            throw new Error("トークンが違います。サイト管理者が設定した文字列と同じか確認してください。");
          }
          if (!res.ok) {
            return apiErrorMessage(res, "AIコメントの追加に失敗しました").then(function (msg) {
              throw new Error(msg);
            });
          }
          return res.json();
        })
        .then(function (data) {
          var latestRecord =
            data && (data.record || data.latestRecord) ? data.record || data.latestRecord : null;
          var latestJob = readRecordAiCommentJob(latestRecord);
          var jobId = latestJob && latestJob.id ? latestJob.id : "";
          if (latestRecord) {
            replaceGrowthRecordInState(latestRecord);
          }
          if (data && data.updated) {
            updated += 1;
            completed += 1;
            return;
          }
          if (!baseRecord) {
            completed += 1;
            if (data && data.detail) {
              failed += 1;
              if (!firstError) firstError = String(data.detail);
            }
            return;
          }
          return pollGrowthRecordUntilUpdated(baseRecord, entry.targets, Date.now() + 12000, jobId)
            .then(function (polledRecord) {
              if (polledRecord) {
                replaceGrowthRecordInState(polledRecord);
                var result = buildGrowthAiRefreshResult(polledRecord, jobId, data && data.detail ? String(data.detail) : "");
                if (result.updated || (result.job && result.job.status === "done" && !result.failed)) {
                  updated += 1;
                } else if (result.failed || (result.job && result.job.status === "failed")) {
                  failed += 1;
                  if (!firstError) firstError = result.detail || (result.job && result.job.detail) || "";
                }
              } else {
                failed += 1;
                if (!firstError && data && data.detail) firstError = String(data.detail);
              }
              completed += 1;
            })
            .catch(function (err) {
              failed += 1;
              completed += 1;
              if (!firstError) firstError = err && err.message ? String(err.message) : "AIコメントの追加に失敗しました。";
            });
        })
        .catch(function (err) {
          failed += 1;
          completed += 1;
          if (!firstError) firstError = err && err.message ? String(err.message) : "AIコメントの追加に失敗しました。";
        })
        .then(function () {
          renderFeed(state.lastGrowthRecords);
          return runNext();
        });
    }

    runNext()
      .then(function () {
        if (el.feed) {
          return refreshFeed().catch(function () {});
        }
      })
      .finally(function () {
        syncBulkMissingCommentsAiButton();
        if (updated && !failed) {
          var successMessage = updated + "件の記録にAIコメントを追加しました。";
          setBulkMissingCommentsAiStatus(successMessage, false);
          showToast(successMessage);
          return;
        }
        if (updated) {
          var mixedMessage =
            updated +
            "件の記録にAIコメントを追加しました。失敗: " +
            failed +
            "件" +
            (firstError ? "（" + firstError + "）" : "");
          setBulkMissingCommentsAiStatus(mixedMessage, true);
          showToast(mixedMessage, true);
          return;
        }
        var failedMessage = firstError || "AIコメントの追加に失敗しました。";
        setBulkMissingCommentsAiStatus(failedMessage, true);
        showToast(failedMessage, true);
      });
  }

  function buildGrowthAiRefreshResult(record, jobId, fallbackDetail) {
    var jobResult = growthAiJobResult(record, jobId);
    if (jobResult) {
      return {
        updated: jobResult.updated,
        failed: jobResult.failed,
        detail: jobResult.detail || "",
        latestRecord: record || null,
        job: jobResult.job,
      };
    }
    return {
      updated: false,
      failed: false,
      detail: fallbackDetail ? String(fallbackDetail) : "",
      latestRecord: record || null,
      job: null,
    };
  }

  function growthRecordChangedForTargets(baseRecord, latestRecord, targetIndexes, jobId) {
    if (!latestRecord) return false;
    var jobResult = growthAiJobResult(latestRecord, jobId);
    if (jobResult && isTerminalAiCommentJob(jobResult.job)) return true;
    var baseRevision = String((baseRecord && (baseRecord.updatedAt || baseRecord.createdAt)) || "");
    var latestRevision = String(latestRecord.updatedAt || latestRecord.createdAt || "");
    if (baseRevision && latestRevision && latestRevision !== baseRevision) return true;

    var baseSlots = growthImageSlots(baseRecord);
    var latestSlots = growthImageSlots(latestRecord);
    for (var i = 0; i < targetIndexes.length; i++) {
      var idx = targetIndexes[i];
      var beforeMemo =
        baseSlots[idx] && baseSlots[idx].memo != null ? String(baseSlots[idx].memo).trim() : "";
      var afterMemo =
        latestSlots[idx] && latestSlots[idx].memo != null ? String(latestSlots[idx].memo).trim() : "";
      if (beforeMemo !== afterMemo) return true;
    }
    return false;
  }

  function pollGrowthRecordUntilUpdated(baseRecord, targetIndexes, deadlineAt, jobId) {
    return fetchGrowthRecordById(baseRecord.id)
      .then(function (latestRecord) {
        if (latestRecord && growthRecordChangedForTargets(baseRecord, latestRecord, targetIndexes, jobId)) {
          return latestRecord;
        }
        if (Date.now() >= deadlineAt) {
          return latestRecord || null;
        }
        return new Promise(function (resolve) {
          setTimeout(resolve, 1800);
        }).then(function () {
          return pollGrowthRecordUntilUpdated(baseRecord, targetIndexes, deadlineAt, jobId);
        });
      })
      .catch(function (err) {
        if (Date.now() >= deadlineAt) throw err;
        return new Promise(function (resolve) {
          setTimeout(resolve, 1800);
        }).then(function () {
          return pollGrowthRecordUntilUpdated(baseRecord, targetIndexes, deadlineAt, jobId);
        });
      });
  }

  function growthLightboxCurrentRecord() {
    var ref = growthLightboxCurrentRef();
    if (!ref || !ref.recordId) return null;
    return growthRecordById(ref.recordId);
  }

  function growthLightboxCurrentMemo() {
    var ref = growthLightboxCurrentRef();
    var record = growthLightboxCurrentRecord();
    if (!ref || !record) return "";
    var idx = typeof ref.imageIndex === "number" ? ref.imageIndex : parseInt(String(ref.imageIndex), 10);
    if (!isFinite(idx) || idx < 0) return "";
    var slots = growthImageSlots(record);
    return sanitizeAiPlainText(slots[idx] && slots[idx].memo);
  }

  function growthLightboxCurrentPlantNames() {
    return growthRecordPlantNames(growthLightboxCurrentRecord());
  }

  function growthLightboxSelectedTimelinePlant() {
    var plantNames = growthLightboxCurrentPlantNames();
    if (!plantNames.length) {
      growthLightboxTimelinePlant = "";
      return "";
    }
    if (plantNames.indexOf(growthLightboxTimelinePlant) === -1) {
      growthLightboxTimelinePlant = plantNames[0];
    }
    return growthLightboxTimelinePlant;
  }

  function growthLightboxAiButtonLabel() {
    return buildPhotoAiActionLabel({ hasMemo: !!growthLightboxCurrentMemo() });
  }

  function growthLightboxTimelineButtonLabel() {
    var plantNames = growthLightboxCurrentPlantNames();
    if (!plantNames.length) return "植栽を時系列で見る";
    if (plantNames.length === 1) return plantNames[0] + "を時系列で見る";
    return "植栽を時系列で見る";
  }

  function promptGrowthLightboxAiUserInstruction() {
    return promptPhotoAiInstruction();
  }

  function growthTimelinePreviewImageIndex(record, preferredIndex) {
    var slots = growthImageSlots(record);
    if (!slots.length) return -1;
    var want =
      typeof preferredIndex === "number" ? preferredIndex : parseInt(String(preferredIndex || ""), 10);
    if (isFinite(want) && want >= 0 && want < slots.length && growthImageSrcFromSlot(slots[want])) {
      return want;
    }
    for (var i = 0; i < slots.length; i++) {
      if (growthImageSrcFromSlot(slots[i])) return i;
    }
    return -1;
  }

  function growthTimelineItemsForPlant(plantName, areaId, preferredIndex) {
    var wantedPlant = normalizeLooseString(plantName);
    var wantedArea = normalizeLooseString(areaId);
    if (!wantedPlant) return [];
    var items = [];
    (state.lastGrowthRecords || []).forEach(function (record) {
      if (!record) return;
      var matchesPlant = false;
      (record.plants || []).forEach(function (rawPlant) {
        var currentPlant =
          typeof rawPlant === "string"
            ? normalizeLooseString(rawPlant)
            : normalizeLooseString(String(rawPlant || ""));
        if (currentPlant && currentPlant === wantedPlant) matchesPlant = true;
      });
      if (!matchesPlant) return;
      var recordArea =
        resolveGrowthRecordAreaIdForPlant(record, wantedPlant) || resolveGrowthRecordAreaId(record);
      if (wantedArea && recordArea !== wantedArea) return;
      var imageIndex = growthTimelinePreviewImageIndex(record, preferredIndex);
      if (imageIndex < 0) return;
      var slot = growthImageSlots(record)[imageIndex];
      var src = growthImageSrcFromSlot(slot);
      if (!src) return;
      items.push({
        record: record,
        imageIndex: imageIndex,
        src: src,
        memo: sanitizeAiPlainText(slot && slot.memo),
      });
    });
    items.sort(function (a, b) {
      return compareGrowthRecordsForSort(a.record, b.record, false);
    });
    return items;
  }

  function renderGrowthLightboxTimelinePanel(pack) {
    var panel = pack && pack.timelinePanel;
    if (!panel) return;
    if (!growthLightboxTimelineOpen) {
      panel.hidden = true;
      panel.innerHTML = "";
      return;
    }

    var ref = growthLightboxCurrentRef();
    var record = growthLightboxCurrentRecord();
    var plantNames = growthLightboxCurrentPlantNames();
    var selectedPlant = growthLightboxSelectedTimelinePlant();
    if (!ref || !record || !plantNames.length || !selectedPlant) {
      panel.hidden = true;
      panel.innerHTML = "";
      return;
    }

    panel.hidden = false;
    panel.innerHTML = "";

    var preferredIndex =
      typeof ref.imageIndex === "number" ? ref.imageIndex : parseInt(String(ref.imageIndex || ""), 10);
    if (!isFinite(preferredIndex) || preferredIndex < 0) preferredIndex = 0;

    var areaId =
      resolveGrowthRecordAreaIdForPlant(record, selectedPlant) || resolveGrowthRecordAreaId(record);
    var area = findAreaById(areaId);
    var items = growthTimelineItemsForPlant(selectedPlant, areaId, preferredIndex);

    var head = document.createElement("div");
    head.className = "growth-photo-lightbox-timeline-head";

    var titleWrap = document.createElement("div");
    titleWrap.className = "growth-photo-lightbox-timeline-title-wrap";
    var title = document.createElement("h3");
    title.className = "growth-photo-lightbox-timeline-title";
    title.textContent = selectedPlant + "の時系列写真";
    titleWrap.appendChild(title);

    var lead = document.createElement("p");
    lead.className = "growth-photo-lightbox-timeline-lead";
    lead.textContent = area
      ? "同じエリアの「" + selectedPlant + "」が写っている記録を古い順に並べています。"
      : "「" + selectedPlant + "」が写っている記録を古い順に並べています。";
    titleWrap.appendChild(lead);
    head.appendChild(titleWrap);

    var closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "growth-photo-lightbox-timeline-close";
    closeBtn.textContent = "閉じる";
    closeBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      growthLightboxTimelineOpen = false;
      growthLightboxSyncTimelineButton(pack);
    });
    head.appendChild(closeBtn);
    panel.appendChild(head);

    if (plantNames.length > 1) {
      var tabs = document.createElement("div");
      tabs.className = "growth-photo-lightbox-timeline-plants";
      plantNames.forEach(function (plantName) {
        var chip = document.createElement("button");
        chip.type = "button";
        chip.className =
          "growth-photo-lightbox-timeline-chip" +
          (plantName === selectedPlant ? " is-active" : "");
        chip.textContent = plantName;
        chip.setAttribute("aria-pressed", plantName === selectedPlant ? "true" : "false");
        chip.addEventListener("click", function (e) {
          e.stopPropagation();
          growthLightboxTimelinePlant = plantName;
          renderGrowthLightboxTimelinePanel(pack);
        });
        tabs.appendChild(chip);
      });
      panel.appendChild(tabs);
    }

    if (!items.length) {
      var empty = document.createElement("p");
      empty.className = "growth-photo-lightbox-timeline-empty";
      empty.textContent = "この植栽の時系列写真はまだありません。";
      panel.appendChild(empty);
      return;
    }

    var list = document.createElement("ol");
    list.className = "growth-photo-lightbox-timeline-list";
    items.forEach(function (item) {
      var li = document.createElement("li");
      li.className = "growth-photo-lightbox-timeline-item";

      var article = document.createElement("article");
      article.className = "growth-photo-lightbox-timeline-card";

      var thumbWrap = document.createElement("div");
      thumbWrap.className = "growth-photo-lightbox-timeline-thumb-wrap";
      var img = document.createElement("img");
      img.className = "growth-photo-lightbox-timeline-thumb";
      img.loading = "lazy";
      img.referrerPolicy = "no-referrer";
      img.alt = selectedPlant + " " + (item.record.recordedAt || "").slice(0, 10);
      img.src = item.src;
      thumbWrap.appendChild(img);

      var isCurrent =
        String(item.record.id || "") === String(ref.recordId || "") &&
        Number(item.imageIndex) === Number(preferredIndex);
      if (isCurrent) {
        var badge = document.createElement("span");
        badge.className = "growth-photo-lightbox-timeline-current";
        badge.textContent = "表示中";
        thumbWrap.appendChild(badge);
      }
      article.appendChild(thumbWrap);

      var meta = document.createElement("div");
      meta.className = "growth-photo-lightbox-timeline-meta";
      var date = document.createElement("time");
      date.className = "growth-photo-lightbox-timeline-date";
      date.setAttribute("datetime", item.record.recordedAt || "");
      date.textContent = (item.record.recordedAt || "").slice(0, 10);
      meta.appendChild(date);

      if (item.memo) {
        var memo = document.createElement("p");
        memo.className = "growth-photo-lightbox-timeline-memo";
        memo.textContent = item.memo;
        meta.appendChild(memo);
      }

      article.appendChild(meta);
      li.appendChild(article);
      list.appendChild(li);
    });
    panel.appendChild(list);
  }

  function growthLightboxSyncAiButton(pack) {
    var aiButton = pack && pack.aiButton;
    if (!aiButton) return;
    var ref = growthLightboxCurrentRef();
    if (!IS_VIEW || !ref || !ref.recordId) {
      aiButton.hidden = true;
      aiButton.disabled = true;
      aiButton.textContent = buildPhotoAiActionLabel({ hasTarget: false });
      return;
    }
    aiButton.hidden = false;
    aiButton.disabled = !!growthLightboxAiBusy;
    aiButton.textContent = growthLightboxAiBusy
      ? buildPhotoAiActionLabel({ isBusy: true })
      : growthLightboxAiButtonLabel();
  }

  function growthLightboxSyncTimelineButton(pack) {
    var timelineButton = pack && pack.timelineButton;
    if (!timelineButton) return;
    var hasPlants = !!growthLightboxCurrentPlantNames().length;
    if (!IS_VIEW || !hasPlants) {
      growthLightboxTimelineOpen = false;
      growthLightboxTimelinePlant = "";
      timelineButton.hidden = true;
      timelineButton.disabled = true;
      timelineButton.textContent = "植栽を時系列で見る";
      if (pack.timelinePanel) {
        pack.timelinePanel.hidden = true;
        pack.timelinePanel.innerHTML = "";
      }
      return;
    }
    timelineButton.hidden = false;
    timelineButton.disabled = false;
    timelineButton.textContent = growthLightboxTimelineOpen
      ? "時系列を閉じる"
      : growthLightboxTimelineButtonLabel();
    renderGrowthLightboxTimelinePanel(pack);
  }

  function toggleGrowthLightboxTimeline(pack) {
    if (!pack || !growthLightboxCurrentPlantNames().length) return;
    if (!growthLightboxTimelineOpen) {
      growthLightboxSelectedTimelinePlant();
    }
    growthLightboxTimelineOpen = !growthLightboxTimelineOpen;
    growthLightboxSyncTimelineButton(pack);
  }

  function rebuildGrowthLightboxFromCurrentView(pack, preferredRef) {
    if (!IS_VIEW || !pack) return false;
    var sorted = getGrowthViewRecordsForLightbox();
    var flat = sorted && sorted.length ? flattenGrowthRecordsForLightbox(sorted) : { urls: [], captions: [], refs: [] };
    if (!flat.urls.length) return false;

    var currentUrl =
      growthLightboxGallery.urls &&
      growthLightboxGallery.index >= 0 &&
      growthLightboxGallery.index < growthLightboxGallery.urls.length
        ? growthLightboxGallery.urls[growthLightboxGallery.index]
        : "";
    var targetRecordId =
      preferredRef && preferredRef.recordId != null
        ? String(preferredRef.recordId)
        : String(growthLightboxGallery.anchorRecordId || "");
    var targetImageIndex =
      preferredRef && preferredRef.imageIndex != null
        ? Number(preferredRef.imageIndex)
        : growthLightboxCurrentRef() && growthLightboxCurrentRef().imageIndex != null
          ? Number(growthLightboxCurrentRef().imageIndex)
          : 0;
    var nextIndex = -1;

    if (flat.refs && flat.refs.length && targetRecordId) {
      for (var i = 0; i < flat.refs.length; i++) {
        var ref = flat.refs[i];
        if (!ref) continue;
        if (String(ref.recordId || "") === targetRecordId && Number(ref.imageIndex) === targetImageIndex) {
          nextIndex = i;
          break;
        }
      }
    }
    if (nextIndex < 0 && currentUrl) {
      nextIndex = flat.urls.indexOf(currentUrl);
    }
    if (nextIndex < 0) nextIndex = 0;

    growthLightboxGallery.urls = flat.urls;
    growthLightboxGallery.captions = flat.captions;
    growthLightboxGallery.refs = flat.refs || null;
    growthLightboxGallery.captionBase = "";
    growthLightboxGallery.timelineCrossPlant =
      state.viewLayout === "timeline" &&
      el.filterPlant &&
      el.filterPlant.value &&
      lightboxFilterPlantChoiceCount() > 1;
    if (targetRecordId) {
      growthLightboxGallery.anchorRecordId = targetRecordId;
    }
    pack.showAt(pack, nextIndex);
    growthLightboxRefreshAreaSelect(pack);
    return true;
  }

  function applyLightboxLatestRecord(pack, preferredRef, latestRecord) {
    if (!latestRecord) return;
    replaceGrowthRecordInState(latestRecord);
    rerenderCurrentGrowthView();
    rebuildGrowthLightboxFromCurrentView(pack, preferredRef);
  }

  function runGrowthLightboxAiRefresh(pack) {
    if (growthLightboxAiBusy) return;
    var ref = growthLightboxCurrentRef();
    if (!ref || !ref.recordId) return;

    var storedToken = currentCloudToken();
    if (!storedToken) {
      showToast("アップロード用トークンを保存するとAIコメントを追加できます。", true);
      return;
    }

    var targetIndex =
      typeof ref.imageIndex === "number" ? ref.imageIndex : parseInt(String(ref.imageIndex), 10);
    if (!isFinite(targetIndex) || targetIndex < 0) targetIndex = 0;

    var baseRecord = growthRecordById(ref.recordId);
    var targets = [targetIndex];
    var userInstruction = promptGrowthLightboxAiUserInstruction();
    if (userInstruction === null) return;
    growthLightboxAiBusy = true;
    growthLightboxSyncAiButton(pack);
    showToast(buildPhotoAiRequestStatus({ hasMemo: true, withUserInstruction: !!userInstruction }));

    fetch(API_GROWTH_AI_REFRESH, {
      method: "POST",
      cache: "no-store",
      keepalive: true,
      headers: cloudHeaders(true),
      body: JSON.stringify({
        id: ref.recordId,
        targets: targets,
        userInstruction: userInstruction,
      }),
    })
      .then(function (res) {
        if (res.status === 401) {
          throw new Error("トークンが違います。サイト管理者が設定した文字列と同じか確認してください。");
        }
        if (!res.ok) {
          return apiErrorMessage(res, "AIコメントの更新に失敗しました").then(function (msg) {
            throw new Error(msg);
          });
        }
        return res.json();
      })
      .then(function (data) {
        var latestRecord =
          data && (data.record || data.latestRecord) ? data.record || data.latestRecord : null;
        var latestJob = readRecordAiCommentJob(latestRecord);
        var jobId = latestJob && latestJob.id ? latestJob.id : "";
        if (latestRecord) {
          applyLightboxLatestRecord(pack, ref, latestRecord);
        }
        if (data && data.updated) {
          return buildGrowthAiRefreshResult(latestRecord, jobId, "");
        }
        if (!baseRecord) {
          return buildGrowthAiRefreshResult(
            latestRecord,
            jobId,
            data && data.detail ? String(data.detail) : ""
          );
        }
        return pollGrowthRecordUntilUpdated(baseRecord, targets, Date.now() + 12000, jobId).then(function (polledRecord) {
          if (polledRecord && growthRecordChangedForTargets(baseRecord, polledRecord, targets, jobId)) {
            applyLightboxLatestRecord(pack, ref, polledRecord);
            return buildGrowthAiRefreshResult(
              polledRecord,
              jobId,
              data && data.detail ? String(data.detail) : ""
            );
          }
          if (polledRecord) {
            applyLightboxLatestRecord(pack, ref, polledRecord);
          }
          return buildGrowthAiRefreshResult(
            polledRecord || latestRecord,
            jobId,
            data && data.detail ? String(data.detail) : ""
          );
        });
      })
      .then(function (result) {
        if (result && result.updated) {
          showToast("AIコメントを更新しました。");
          return;
        }
        if (result && result.job) {
          showToast(growthAiJobStatusMessage(result.job, { doneMessage: "AIコメントを更新しました。" }), !!result.failed);
          return;
        }
        var detail = result && result.detail ? String(result.detail) : "";
        var message = buildPhotoAiDeferredMessage(detail, {
          baseMessage: "AIコメントはまだ反映されていません。少ししてから開き直してください。",
        });
        showToast(message, true);
      })
      .catch(function (err) {
        showToast(err && err.message ? err.message : "AIコメントの更新に失敗しました。", true);
      })
      .finally(function () {
        growthLightboxAiBusy = false;
        growthLightboxSyncAiButton(pack);
      });
  }

  function lightboxTryGoNextPlant(pack) {
    if (!IS_VIEW || state.viewLayout !== "timeline" || !el.filterPlant) return false;
    var nextP = lightboxTimelineAdjacentPlant(1);
    if (!nextP) return false;
    el.filterPlant.value = nextP;
    renderPlantTimeline(state.lastGrowthRecords);
    var sorted = getGrowthViewRecordsForLightbox();
    if (!sorted || !sorted.length) return false;
    var flat = flattenGrowthRecordsForLightbox(sorted);
    if (!flat.urls.length) return false;
    growthLightboxGallery.urls = flat.urls;
    growthLightboxGallery.captions = flat.captions;
    growthLightboxGallery.refs = flat.refs || null;
    growthLightboxGallery.timelineCrossPlant = lightboxFilterPlantChoiceCount() > 1;
    growthLightboxGallery.captionBase = "";
    growthLightboxGallery.index = 0;
    pack.img.src = flat.urls[0];
    growthLightboxUpdateChrome(pack);
    return true;
  }

  function lightboxTryGoPrevPlant(pack) {
    if (!IS_VIEW || state.viewLayout !== "timeline" || !el.filterPlant) return false;
    var prevP = lightboxTimelineAdjacentPlant(-1);
    if (!prevP) return false;
    el.filterPlant.value = prevP;
    renderPlantTimeline(state.lastGrowthRecords);
    var sorted = getGrowthViewRecordsForLightbox();
    if (!sorted || !sorted.length) return false;
    var flat = flattenGrowthRecordsForLightbox(sorted);
    if (!flat.urls.length) return false;
    growthLightboxGallery.urls = flat.urls;
    growthLightboxGallery.captions = flat.captions;
    growthLightboxGallery.refs = flat.refs || null;
    growthLightboxGallery.timelineCrossPlant = lightboxFilterPlantChoiceCount() > 1;
    growthLightboxGallery.captionBase = "";
    growthLightboxGallery.index = flat.urls.length - 1;
    pack.img.src = flat.urls[growthLightboxGallery.index];
    growthLightboxUpdateChrome(pack);
    return true;
  }

  function ensureGrowthPhotoLightbox() {
    if (growthPhotoLightboxEls) return growthPhotoLightboxEls;
    var dlg = document.createElement("dialog");
    dlg.id = "growth-photo-lightbox";
    dlg.className = "growth-photo-lightbox";
    dlg.setAttribute("aria-modal", "true");
    dlg.setAttribute("aria-label", "写真の拡大表示");
    dlg.tabIndex = -1;

    var shell = document.createElement("div");
    shell.className = "growth-photo-lightbox-shell";

    var inner = document.createElement("div");
    inner.className = "growth-photo-lightbox-inner";

    var closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "growth-photo-lightbox-close";
    closeBtn.setAttribute("aria-label", "閉じる");
    closeBtn.textContent = "閉じる";

    var prevBtn = document.createElement("button");
    prevBtn.type = "button";
    prevBtn.className = "growth-photo-lightbox-nav growth-photo-lightbox-prev";
    prevBtn.setAttribute("aria-label", "前の写真");
    prevBtn.textContent = "‹";
    prevBtn.hidden = true;

    var nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.className = "growth-photo-lightbox-nav growth-photo-lightbox-next";
    nextBtn.setAttribute("aria-label", "次の写真");
    nextBtn.textContent = "›";
    nextBtn.hidden = true;

    var mediaFrame = document.createElement("div");
    mediaFrame.className = "growth-photo-lightbox-media-frame";

    var bigImg = document.createElement("img");
    bigImg.className = "growth-photo-lightbox-img";
    bigImg.alt = "";
    mediaFrame.appendChild(prevBtn);
    mediaFrame.appendChild(nextBtn);
    mediaFrame.appendChild(bigImg);

    var areaRow = document.createElement("div");
    areaRow.className = "growth-photo-lightbox-area-row";
    areaRow.hidden = true;
    var areaLbl = document.createElement("span");
    areaLbl.className = "growth-photo-lightbox-area-label";
    areaLbl.textContent = "エリア";
    var areaSelect = document.createElement("select");
    areaSelect.className = "growth-photo-lightbox-area-select";
    areaSelect.setAttribute("aria-label", "スライドの対象エリア");
    areaRow.appendChild(areaLbl);
    areaRow.appendChild(areaSelect);

    var cap = document.createElement("p");
    cap.className = "growth-photo-lightbox-caption";

    var timelineButton = document.createElement("button");
    timelineButton.type = "button";
    timelineButton.className = "growth-photo-lightbox-timeline-btn";
    timelineButton.setAttribute("aria-label", "この写真の植栽を時系列で見る");
    timelineButton.textContent = "植栽を時系列で見る";
    timelineButton.hidden = true;

    var timelinePanel = document.createElement("section");
    timelinePanel.className = "growth-photo-lightbox-timeline-panel";
    timelinePanel.hidden = true;

    var aiButton = document.createElement("button");
    aiButton.type = "button";
    aiButton.className = "growth-photo-lightbox-ai-btn";
    aiButton.setAttribute("aria-label", "AIでコメントを追加または再生成");
    aiButton.textContent = buildPhotoAiActionLabel({ hasTarget: false });
    aiButton.hidden = true;

    var editLink = document.createElement("a");
    editLink.className = "growth-photo-lightbox-edit-link";
    editLink.textContent = "この写真を編集";
    editLink.hidden = true;
    editLink.addEventListener("click", function (e) {
      e.stopPropagation();
    });

    inner.appendChild(closeBtn);
    inner.appendChild(mediaFrame);
    inner.appendChild(areaRow);
    inner.appendChild(cap);
    inner.appendChild(timelinePanel);

    if (!areaSelect.dataset.lbAreaBound) {
      areaSelect.dataset.lbAreaBound = "1";
      areaSelect.addEventListener("click", function (e) {
        e.stopPropagation();
      });
      areaSelect.addEventListener("change", function () {
        var pk = growthPhotoLightboxEls;
        if (!pk) return;
        growthLightboxApplyAreaFilterAndRebuild(pk, areaSelect.value || "");
      });
    }
    shell.appendChild(inner);

    var cornerNav = document.createElement("div");
    cornerNav.className = "growth-photo-lightbox-corner-nav";
    cornerNav.setAttribute("role", "group");
    cornerNav.setAttribute("aria-label", "写真を前後に送る");
    var cornerInner = document.createElement("div");
    cornerInner.className = "growth-photo-lightbox-corner-inner";
    var cornerPrev = document.createElement("button");
    cornerPrev.type = "button";
    cornerPrev.className = "growth-photo-lightbox-corner-btn growth-photo-lightbox-corner-prev";
    cornerPrev.setAttribute("aria-label", "前の写真");
    cornerPrev.textContent = "前へ";
    var cornerNext = document.createElement("button");
    cornerNext.type = "button";
    cornerNext.className = "growth-photo-lightbox-corner-btn growth-photo-lightbox-corner-next";
    cornerNext.setAttribute("aria-label", "次の写真");
    cornerNext.textContent = "次へ";
    cornerInner.appendChild(timelineButton);
    cornerInner.appendChild(aiButton);
    cornerInner.appendChild(editLink);
    cornerInner.appendChild(cornerPrev);
    cornerInner.appendChild(cornerNext);
    cornerNav.appendChild(cornerInner);
    cornerInner.addEventListener("click", function (e) {
      e.stopPropagation();
    });
    inner.appendChild(cornerNav);
    dlg.appendChild(shell);
    document.body.appendChild(dlg);

    function showAt(pack, idx) {
      var g = growthLightboxGallery;
      if (!g.urls.length) return;
      var tc = g.timelineCrossPlant && IS_VIEW && state.viewLayout === "timeline";
      if (idx >= 0 && idx < g.urls.length) {
        g.index = idx;
        pack.img.src = g.urls[idx];
        growthLightboxUpdateChrome(pack);
        return;
      }
      if (idx < 0) {
        if (tc && lightboxTryGoPrevPlant(pack)) return;
        g.index = g.urls.length - 1;
        pack.img.src = g.urls[g.index];
        growthLightboxUpdateChrome(pack);
        return;
      }
      if (tc && lightboxTryGoNextPlant(pack)) return;
      g.index = 0;
      pack.img.src = g.urls[g.index];
      growthLightboxUpdateChrome(pack);
    }

    shell.addEventListener("click", function () {
      if (Date.now() - growthLightboxOpenedAt < 400) return;
      if (typeof dlg.close === "function") dlg.close();
    });
    inner.addEventListener("click", function (e) {
      e.stopPropagation();
    });
    closeBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      if (typeof dlg.close === "function") dlg.close();
    });
    prevBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      showAt(growthPhotoLightboxEls, growthLightboxGallery.index - 1);
    });
    nextBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      showAt(growthPhotoLightboxEls, growthLightboxGallery.index + 1);
    });
    cornerPrev.addEventListener("click", function (e) {
      e.stopPropagation();
      showAt(growthPhotoLightboxEls, growthLightboxGallery.index - 1);
    });
    timelineButton.addEventListener("click", function (e) {
      e.stopPropagation();
      toggleGrowthLightboxTimeline(growthPhotoLightboxEls);
    });
    aiButton.addEventListener("click", function (e) {
      e.stopPropagation();
      runGrowthLightboxAiRefresh(growthPhotoLightboxEls);
    });
    cornerNext.addEventListener("click", function (e) {
      e.stopPropagation();
      showAt(growthPhotoLightboxEls, growthLightboxGallery.index + 1);
    });

    dlg.addEventListener("keydown", function (e) {
      if (!growthPhotoLightboxEls || !growthLightboxCanNavigate()) return;
      if (e.target && e.target.closest && e.target.closest("input, textarea, select")) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        showAt(growthPhotoLightboxEls, growthLightboxGallery.index - 1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        showAt(growthPhotoLightboxEls, growthLightboxGallery.index + 1);
      }
    });
    dlg.addEventListener("close", function () {
      growthLightboxTimelineOpen = false;
      growthLightboxTimelinePlant = "";
      growthLightboxSyncTimelineButton(growthPhotoLightboxEls);
    });

    /**
     * ライトボックスの左右スワイプ。
     * iOS 等では Pointer だけでは pointercancel になりがちなので Touch を併用し、
     * pointer はマウス／ペンのみ（タッチは touch* でのみ扱い二重発火を防ぐ）。
     */
    var lbSwipePtrId = null;
    var lbSwipeTouchId = null;
    var lbSwipeStartX = 0;
    var lbSwipeStartY = 0;
    var LB_SWIPE_MIN = 32;
    function lbSwipeTargetOk(target) {
      if (!target || !target.closest) return false;
      if (target.closest("button")) return false;
      if (target.closest(".growth-photo-lightbox-area-row")) return false;
      if (target.closest(".growth-photo-lightbox-corner-nav")) return false;
      return !!target.closest(".growth-photo-lightbox-inner");
    }
    function lbApplySwipeEnd(clientX, clientY) {
      if (!growthLightboxCanNavigate()) return;
      var dx = clientX - lbSwipeStartX;
      var dy = clientY - lbSwipeStartY;
      if (Math.abs(dx) < LB_SWIPE_MIN) return;
      if (Math.abs(dx) < Math.abs(dy) * 1.05) return;
      var pk = growthPhotoLightboxEls;
      if (!pk) return;
      if (dx > 0) {
        showAt(pk, growthLightboxGallery.index - 1);
      } else {
        showAt(pk, growthLightboxGallery.index + 1);
      }
    }
    function lbFindTouch(touchList, id) {
      for (var fi = 0; fi < touchList.length; fi++) {
        if (touchList[fi].identifier === id) return touchList[fi];
      }
      return null;
    }
    dlg.addEventListener(
      "touchstart",
      function (e) {
        if (!growthLightboxCanNavigate()) return;
        if (!lbSwipeTargetOk(e.target)) return;
        if (e.touches.length !== 1) {
          lbSwipeTouchId = null;
          return;
        }
        var t0 = e.touches[0];
        lbSwipeTouchId = t0.identifier;
        lbSwipeStartX = t0.clientX;
        lbSwipeStartY = t0.clientY;
      },
      { passive: true, capture: true }
    );
    dlg.addEventListener(
      "touchmove",
      function (e) {
        if (lbSwipeTouchId === null) return;
        var tm =
          lbFindTouch(e.changedTouches, lbSwipeTouchId) ||
          lbFindTouch(e.touches, lbSwipeTouchId);
        if (!tm) return;
        var mdx = tm.clientX - lbSwipeStartX;
        var mdy = tm.clientY - lbSwipeStartY;
        if (Math.abs(mdx) > 14 && Math.abs(mdx) > Math.abs(mdy) * 1.02) {
          e.preventDefault();
        }
      },
      { passive: false, capture: true }
    );
    dlg.addEventListener(
      "touchend",
      function (e) {
        if (lbSwipeTouchId === null) return;
        var te = lbFindTouch(e.changedTouches, lbSwipeTouchId);
        if (!te) return;
        lbSwipeTouchId = null;
        lbApplySwipeEnd(te.clientX, te.clientY);
      },
      { passive: true, capture: true }
    );
    dlg.addEventListener(
      "touchcancel",
      function () {
        lbSwipeTouchId = null;
      },
      { passive: true, capture: true }
    );
    dlg.addEventListener(
      "pointerdown",
      function (e) {
        if (!growthLightboxCanNavigate()) return;
        if (e.pointerType === "touch") return;
        if (lbSwipePtrId !== null) return;
        if (e.pointerType === "mouse" && e.button !== 0) return;
        if (!lbSwipeTargetOk(e.target)) return;
        lbSwipePtrId = e.pointerId;
        lbSwipeStartX = e.clientX;
        lbSwipeStartY = e.clientY;
        try {
          inner.setPointerCapture(e.pointerId);
        } catch (eCap) {}
      },
      true
    );
    dlg.addEventListener(
      "pointerup",
      function (e) {
        if (e.pointerType === "touch") return;
        if (lbSwipePtrId === null || e.pointerId !== lbSwipePtrId) return;
        try {
          inner.releasePointerCapture(e.pointerId);
        } catch (eRel) {}
        lbSwipePtrId = null;
        lbApplySwipeEnd(e.clientX, e.clientY);
      },
      true
    );
    dlg.addEventListener(
      "pointercancel",
      function (e) {
        if (e.pointerType === "touch") return;
        if (e.pointerId !== lbSwipePtrId) return;
        try {
          inner.releasePointerCapture(e.pointerId);
        } catch (eRel2) {}
        lbSwipePtrId = null;
      },
      true
    );
    dlg.addEventListener(
      "lostpointercapture",
      function (e) {
        if (e.pointerType === "touch") return;
        if (e.pointerId === lbSwipePtrId) lbSwipePtrId = null;
      },
      true
    );

    growthPhotoLightboxEls = {
      dialog: dlg,
      img: bigImg,
      caption: cap,
      timelineButton: timelineButton,
      timelinePanel: timelinePanel,
      aiButton: aiButton,
      editLink: editLink,
      prevBtn: prevBtn,
      nextBtn: nextBtn,
      cornerNav: cornerNav,
      cornerPrev: cornerPrev,
      cornerNext: cornerNext,
      areaRow: areaRow,
      areaSelect: areaSelect,
      showAt: showAt,
      syncCaption: function (pack) {
        growthLightboxSyncCaption(pack);
      },
    };
    return growthPhotoLightboxEls;
  }

  function openGrowthViewLightbox(r, imgIndexInRecord, galleryUrls, zoomCaption) {
    var perCaps = growthZoomCaptionsForRecordImages(r);
    var perRefs = galleryUrls.map(function (_url, index) {
      return {
        recordId: r && r.id != null ? String(r.id) : "",
        imageIndex: index,
      };
    });
    var anchorOpt = { anchorRecordId: r.id, refs: perRefs };
    if (perCaps.length === galleryUrls.length) {
      anchorOpt.captions = perCaps;
    }
    if (!IS_VIEW) {
      openGrowthPhotoLightbox(galleryUrls, imgIndexInRecord, zoomCaption, anchorOpt);
      return;
    }
    var sorted = getGrowthViewRecordsForLightbox();
    if (!sorted || !sorted.length) {
      openGrowthPhotoLightbox(galleryUrls, imgIndexInRecord, zoomCaption, anchorOpt);
      return;
    }
    var flat = flattenGrowthRecordsForLightbox(sorted);
    if (!flat.urls.length) {
      openGrowthPhotoLightbox(galleryUrls, imgIndexInRecord, zoomCaption, anchorOpt);
      return;
    }
    var start = lightboxFlatIndexForRecordImage(sorted, r.id, imgIndexInRecord);
    if (start < 0) {
      openGrowthPhotoLightbox(galleryUrls, imgIndexInRecord, zoomCaption, anchorOpt);
      return;
    }
    var tcp =
      state.viewLayout === "timeline" &&
      el.filterPlant &&
      el.filterPlant.value &&
      lightboxFilterPlantChoiceCount() > 1;
    openGrowthPhotoLightbox(flat.urls, start, zoomCaption, {
      captions: flat.captions,
      refs: flat.refs,
      timelineCrossPlant: tcp,
      anchorRecordId: r.id,
    });
  }

  function openGrowthPhotoLightbox(urlsOrOne, startIndex, caption, options) {
    options = options || {};
    var urls = Array.isArray(urlsOrOne)
      ? urlsOrOne.filter(Boolean)
      : urlsOrOne
        ? [urlsOrOne]
        : [];
    if (!urls.length) return;
    var idx =
      typeof startIndex === "number" && startIndex >= 0 && startIndex < urls.length
        ? startIndex
        : 0;
    growthLightboxGallery.urls = urls;
    growthLightboxGallery.index = idx;
    growthLightboxGallery.captionBase = caption || "";
    var oc = options.captions;
    if (oc && oc.length === urls.length) {
      growthLightboxGallery.captions = oc;
    } else {
      growthLightboxGallery.captions = null;
    }
    var refs = options.refs;
    if (refs && refs.length === urls.length) {
      growthLightboxGallery.refs = refs;
    } else {
      growthLightboxGallery.refs = null;
    }
    growthLightboxGallery.timelineCrossPlant = !!options.timelineCrossPlant;
    growthLightboxGallery.anchorRecordId =
      options.anchorRecordId != null ? String(options.anchorRecordId) : "";
    growthLightboxTimelineOpen = false;
    growthLightboxTimelinePlant = "";

    var pack = ensureGrowthPhotoLightbox();
    pack.img.referrerPolicy = "no-referrer";
    pack.showAt(pack, idx);
    growthLightboxRefreshAreaSelect(pack);
    var d = pack.dialog;
    function doOpen() {
      if (typeof d.showModal === "function") {
        try {
          d.showModal();
          growthLightboxOpenedAt = Date.now();
        } catch (e1) {
          d.setAttribute("open", "");
        }
      } else {
        d.setAttribute("open", "");
      }
      if (typeof d.focus === "function") {
        try {
          d.focus();
        } catch (e2) {}
      }
    }
    setTimeout(doOpen, 0);
  }

  function apiErrorMessage(res, fallbackPrefix) {
    if (common.apiErrorMessage) {
      return common.apiErrorMessage(res, fallbackPrefix);
    }
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

  function formatChangeLogTime(value) {
    if (!value) return "";
    try {
      return new Intl.DateTimeFormat("ja-JP", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(value));
    } catch (err) {
      return String(value);
    }
  }

  function describeChangeLogEntry(item) {
    if (!item) return "";
    var areaLabel = item.areaLabel ? String(item.areaLabel) : item.areaId ? String(item.areaId) : "";
    var plantLabel = item.plantName ? String(item.plantName) : "";
    var plantList = Array.isArray(item.plantNames) ? item.plantNames.filter(Boolean) : [];
    switch (item.action) {
      case "catalog_saved":
        return "エリア・植栽マスタを保存";
      case "plant_detail_saved":
        return plantLabel ? plantLabel + " の詳細を保存" : "植栽の詳細を保存";
      case "area_detail_saved":
        return areaLabel ? areaLabel + " の概要を保存" : "エリアの概要を保存";
      case "growth_record_created":
        return "植栽記録を追加";
      case "growth_record_updated":
        return "植栽記録を更新";
      case "growth_record_archived":
        return "植栽記録をアーカイブ";
      case "growth_record_photo_removed":
        return "植栽記録の写真を削除";
      case "growth_record_deleted_after_photo_removal":
        return "最後の写真削除により植栽記録を削除";
      case "area_growth_created":
        return "エリア記録を追加";
      case "area_growth_updated":
        return "エリア記録を更新";
      case "area_growth_archived":
        return "エリア記録をアーカイブ";
      case "area_growth_photo_removed":
        return "エリア記録の写真を削除";
      case "area_growth_deleted_after_photo_removal":
        return "最後の写真削除によりエリア記録を削除";
      default:
        return item.detail ? String(item.detail) : "更新履歴";
    }
  }

  function renderChangeLogItems(items) {
    if (!el.changeLogList) return;
    el.changeLogList.innerHTML = "";
    if (!items || !items.length) {
      el.changeLogList.appendChild(
        createTextElement("p", "growth-hint", "まだ更新履歴はありません。")
      );
      return;
    }
    items.forEach(function (item) {
      var card = document.createElement("article");
      card.className = "growth-change-log-item";
      var header = document.createElement("div");
      header.className = "growth-change-log-item-header";
      header.appendChild(
        createTextElement("strong", "growth-change-log-item-title", describeChangeLogEntry(item))
      );
      header.appendChild(
        createTextElement("span", "growth-change-log-item-time", formatChangeLogTime(item.createdAt))
      );
      card.appendChild(header);

      var metaParts = [];
      if (item.areaLabel) metaParts.push(String(item.areaLabel));
      else if (item.areaId) metaParts.push(String(item.areaId));
      if (item.plantName) metaParts.push(String(item.plantName));
      else if (Array.isArray(item.plantNames) && item.plantNames.length) metaParts.push(item.plantNames.join("、"));
      if (metaParts.length) {
        card.appendChild(createTextElement("p", "growth-change-log-item-meta", metaParts.join(" / ")));
      }
      if (item.detail) {
        card.appendChild(createTextElement("p", "growth-change-log-item-detail", String(item.detail)));
      }
      el.changeLogList.appendChild(card);
    });
  }

  function loadChangeLog() {
    if (!el.changeLogList || !el.changeLogStatus) return Promise.resolve();
    var storedToken = currentCloudToken();
    if (!storedToken) {
      el.changeLogStatus.textContent = "アップロード用トークンを保存すると更新履歴を読み込めます。";
      renderChangeLogItems([]);
      return Promise.resolve();
    }
    el.changeLogStatus.textContent = "更新履歴を読み込んでいます…";
    return fetch(API_CHANGE_LOG + "?limit=12", {
      headers: cloudHeaders(false),
      cache: "no-store",
    })
      .then(function (res) {
        if (!res.ok) {
          return apiErrorMessage(res, "更新履歴の読み込みに失敗しました").then(function (msg) {
            throw new Error(msg);
          });
        }
        return res.json();
      })
      .then(function (data) {
        var items = data && Array.isArray(data.items) ? data.items : [];
        renderChangeLogItems(items);
        el.changeLogStatus.textContent = items.length
          ? "最近 " + items.length + " 件の更新を表示しています。"
          : "更新履歴はまだありません。";
      })
      .catch(function (err) {
        el.changeLogStatus.textContent = err && err.message ? err.message : "更新履歴の読み込みに失敗しました。";
      });
  }

  function updateCloudStatus(text) {
    if (el.viewStatus) el.viewStatus.textContent = text || "";
    if (el.cloudStatus) el.cloudStatus.textContent = text || "";
  }

  function setPhotoAiStatus(text, isError) {
    if (!el.photoAiStatus) return;
    el.photoAiStatus.textContent = text || "";
    el.photoAiStatus.hidden = !text;
    el.photoAiStatus.classList.toggle("growth-photo-ai-status--error", !!(text && isError));
  }

  function countQueuedPhotoAiTargets() {
    var count = 0;
    state.photoQueue.forEach(function (item) {
      if (!item) return;
      if (item.aiState === "pending" || item.aiState === "refresh_pending") count += 1;
    });
    return count;
  }

  function updateQueuedPhotoAiStatus() {
    if (!state.photoQueue.length) {
      setPhotoAiStatus("", false);
      return;
    }
    var hasPending = false;
    var hasRefresh = false;
    state.photoQueue.forEach(function (item) {
      if (!item) return;
      if (item.aiState === "pending") hasPending = true;
      if (item.aiState === "refresh_pending") hasRefresh = true;
    });
    if (!hasPending && !hasRefresh) return;
    if (hasPending && hasRefresh) {
      setPhotoAiStatus(
        "保存するとサーバー側でAIコメントを追加・更新します。保存後は画面を離れても大丈夫です。",
        false
      );
      return;
    }
    if (hasRefresh) {
      setPhotoAiStatus(
        "保存するとサーバー側でAIコメントを再生成します。保存後は画面を離れても大丈夫です。",
        false
      );
      return;
    }
    setPhotoAiStatus(
      "保存するとサーバー側でAIコメントを追加します。保存後は画面を離れても大丈夫です。",
      false
    );
  }

  function syncPhotoAiButtonState() {
    if (!el.photoAiGenerate) return;
    el.photoAiGenerate.disabled = state.photoAiBusy || state.photoQueue.length === 0;
  }

  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return "id-" + Date.now() + "-" + Math.random().toString(16).slice(2);
  }

  function growthIsImageBitmap(x) {
    return typeof ImageBitmap !== "undefined" && x instanceof ImageBitmap;
  }

  /**
   * Image 要素は HEIC 等で decode できない環境がある。createImageBitmap を次に試す。
   */
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
        reject(new Error("__growth_img_decode__"));
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
      if (e && e.message === "__growth_img_decode__") {
        return tryLoadImageViaBitmap(file);
      }
      throw e;
    });
  }

  function loadImageFileFromBlob(blob) {
    return tryLoadImageViaObjectUrl(blob).catch(function (e) {
      if (e && e.message === "__growth_img_decode__") {
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

    var canvas = document.createElement("canvas");
    var closeSource = function () {
      if (growthIsImageBitmap(imgOrBitmap) && typeof imgOrBitmap.close === "function") {
        try {
          imgOrBitmap.close();
        } catch (c2) {}
      }
    };
    var toJpegBlob = function (quality) {
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
          quality
        );
      });
    };

    var scale = w > MAX_IMAGE_WIDTH ? MAX_IMAGE_WIDTH / w : 1;
    var quality = JPEG_QUALITY;

    var encodeStep = function () {
      var cw = Math.max(1, Math.round(w * scale));
      var ch = Math.max(1, Math.round(h * scale));
      canvas.width = cw;
      canvas.height = ch;
      var ctx = canvas.getContext("2d");
      ctx.drawImage(imgOrBitmap, 0, 0, cw, ch);
      return toJpegBlob(quality).then(function (blob) {
        if (blob.size <= MAX_BYTES_PER_IMAGE || (scale <= 0.35 && quality <= MIN_JPEG_QUALITY)) {
          return blob;
        }
        if (quality > MIN_JPEG_QUALITY) {
          quality = Math.max(MIN_JPEG_QUALITY, quality - 0.08);
        } else {
          scale = scale * 0.86;
        }
        return encodeStep();
      });
    };

    return encodeStep().finally(function () {
      closeSource();
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

  function getSelectedPlants() {
    var names = [];
    if (el.plantChecks) {
      var boxes = el.plantChecks.querySelectorAll('input[type="checkbox"]:checked');
      for (var i = 0; i < boxes.length; i++) {
        names.push(boxes[i].value);
      }
    }
    var extra = el.customPlant && el.customPlant.value.trim();
    if (extra) {
      extra.split(/[、,]/).forEach(function (part) {
        var t = part.trim();
        if (t && names.indexOf(t) === -1) names.push(t);
      });
    }
    return names;
  }

  function applyPlantsToForm(plantNames, areaId) {
    if (!el.plantChecks || !el.customPlant) return;
    var area = state.areas.find(function (a) {
      return a.id === areaId;
    });
    var known = area && area.plants ? area.plants : [];
    var extras = [];
    for (var i = 0; i < plantNames.length; i++) {
      if (known.indexOf(plantNames[i]) === -1) extras.push(plantNames[i]);
    }
    var boxes = el.plantChecks.querySelectorAll('input[type="checkbox"]');
    for (var j = 0; j < boxes.length; j++) {
      boxes[j].checked = plantNames.indexOf(boxes[j].value) !== -1;
    }
    el.customPlant.value = extras.join("、");
    renderSequentialComposerGuide();
  }

  function setComposerPlantSelection(plantNames) {
    applyPlantsToForm(Array.isArray(plantNames) ? plantNames : [], el.area ? el.area.value : "");
  }

  function selectSequentialPlant(plantName) {
    if (!el.area) return;
    setComposerPlantSelection(plantName ? [plantName] : []);
    renderSequentialComposerGuide();
    showToast("「" + plantName + "」を選びました。写真を追加して保存できます。");
  }

  function clearComposerPlantSelection() {
    setComposerPlantSelection([]);
    renderSequentialComposerGuide();
  }

  function renderSequentialComposerGuide() {
    if (!el.sequenceGuide || !el.sequencePlants || !el.area) return;
    var areaId = String(el.area.value || "").trim();
    var area = findAreaById(areaId);
    var editing = !!state.editRecord;
    if (editing || !area || !Array.isArray(area.plants) || !area.plants.length) {
      el.sequenceGuide.hidden = true;
      el.sequencePlants.innerHTML = "";
      if (el.sequenceArea) el.sequenceArea.textContent = "";
      if (el.sequenceClear) el.sequenceClear.disabled = true;
      return;
    }

    el.sequenceGuide.hidden = false;
    if (el.sequenceArea) {
      el.sequenceArea.textContent =
        "「" + area.label + "」の植栽を続けて記録できます。次の植栽は下のボタンから選べます。";
    }

    var selectedPlants = getSelectedPlants();
    var customPlant = el.customPlant ? String(el.customPlant.value || "").trim() : "";
    var activePlant = !customPlant && selectedPlants.length === 1 ? selectedPlants[0] : "";
    el.sequencePlants.innerHTML = "";
    area.plants.forEach(function (plantName) {
      var button = document.createElement("button");
      button.type = "button";
      button.className =
        "growth-sequence-plant" + (activePlant === plantName ? " is-active" : "");
      button.textContent = plantName;
      button.setAttribute("aria-pressed", activePlant === plantName ? "true" : "false");
      button.addEventListener("click", function () {
        selectSequentialPlant(plantName);
      });
      el.sequencePlants.appendChild(button);
    });

    if (el.sequenceClear) {
      el.sequenceClear.disabled = !selectedPlants.length && !customPlant;
    }
  }

  function growthFileLooksLikeImage(f) {
    if (!f) return false;
    var t = f.type || "";
    if (t.indexOf("image/") === 0) return true;
    var name = (f.name || "").toLowerCase();
    return /\.(jpe?g|png|gif|webp|heic|heif|bmp|avif|tiff?)$/i.test(name);
  }

  function revokePhotoQueuePreview(item) {
    if (!item || item.kind !== "new") return;
    var url = typeof item.previewUrl === "string" ? item.previewUrl : "";
    if (url.indexOf("blob:") !== 0) {
      item.previewUrl = "";
      return;
    }
    try {
      URL.revokeObjectURL(url);
    } catch (previewErr) {}
    item.previewUrl = "";
  }

  function revokePhotoQueuePreviews(items) {
    if (!Array.isArray(items)) return;
    items.forEach(function (item) {
      revokePhotoQueuePreview(item);
    });
  }

  function ensurePhotoQueuePreviewUrl(item) {
    if (!item || item.kind !== "new" || !item.file) return "";
    if (typeof item.previewUrl === "string" && item.previewUrl) {
      return item.previewUrl;
    }
    try {
      item.previewUrl = URL.createObjectURL(item.file);
    } catch (previewErr) {
      item.previewUrl = "";
    }
    return item.previewUrl || "";
  }

  function photoQueuePreviewSrc(item) {
    if (!item) return "";
    if (item.kind === "new" && item.file) {
      return ensurePhotoQueuePreviewUrl(item);
    }
    if (item.kind !== "saved" || !item.slot) return "";
    var src = growthImageSrcFromSlot(item.slot);
    if (src) return src;
    if (item.slot.localSnapshotImage) return String(item.slot.localSnapshotImage);
    if (item.slot.imageUrl) return String(item.slot.imageUrl);
    if (item.slot.imagePathname) {
      return API_GROWTH_IMAGE + "?pathname=" + encodeURIComponent(item.slot.imagePathname);
    }
    return "";
  }

  function buildPhotoQueuePreviewCaption(item, idx) {
    var memo = item && item.memo != null ? String(item.memo).trim() : "";
    return memo || ("写真" + (idx + 1));
  }

  function buildPhotoQueuePreviewConfig(currentIndex) {
    var items = [];
    var startIndex = 0;
    state.photoQueue.forEach(function (queueItem, queueIndex) {
      var src = photoQueuePreviewSrc(queueItem);
      if (!src) return;
      if (queueIndex === currentIndex) startIndex = items.length;
      items.push({
        src: src,
        alt: "植栽写真" + (queueIndex + 1),
        caption: buildPhotoQueuePreviewCaption(queueItem, queueIndex),
        meta: {
          queueIndex: queueIndex,
        },
      });
    });
    return {
      items: items,
      index: startIndex,
    };
  }

  function resolvePhotoQueuePreviewTarget(lightboxItem) {
    var meta = lightboxItem && lightboxItem.meta && typeof lightboxItem.meta === "object" ? lightboxItem.meta : null;
    var idx =
      meta && typeof meta.queueIndex === "number"
        ? meta.queueIndex
        : parseInt(String(meta && meta.queueIndex != null ? meta.queueIndex : ""), 10);
    if (!isFinite(idx) || idx < 0 || idx >= state.photoQueue.length) return null;
    return {
      index: idx,
      item: state.photoQueue[idx],
    };
  }

  function photoQueuePreviewAiActionLabel(lightboxItem) {
    var target = resolvePhotoQueuePreviewTarget(lightboxItem);
    var memo = target && target.item && target.item.memo != null ? String(target.item.memo).trim() : "";
    return buildPhotoAiActionLabel({
      isBusy: state.photoAiBusy,
      hasTarget: !!(target && target.item),
      hasMemo: !!memo,
    });
  }

  function runPhotoQueuePreviewAiRefresh(ctx) {
    if (state.photoAiBusy) return;
    var target = resolvePhotoQueuePreviewTarget(ctx && ctx.item);
    if (!target || !target.item) {
      showToast("AIコメントを追加できる写真が見つかりません。", true);
      return;
    }

    var storedToken = currentCloudToken();
    if (!storedToken) {
      setPhotoAiStatus("アップロード用トークンを入力してから実行してください。", true);
      showToast("アップロード用トークンを保存するとAIコメントを追加できます。", true);
      if (el.cloudToken && typeof el.cloudToken.focus === "function") el.cloudToken.focus();
      return;
    }

    var userInstruction = promptGrowthLightboxAiUserInstruction();
    if (userInstruction === null) return;

    var hadMemo = target.item.memo != null && String(target.item.memo).trim();
    target.item.aiState = "loading";
    state.photoAiBusy = true;
    syncPhotoAiButtonState();
    renderPhotoQueueUi();
    if (ctx && typeof ctx.sync === "function") ctx.sync();

    setPhotoAiStatus(
      buildPhotoAiRequestStatus({
        hasMemo: !!hadMemo,
        withUserInstruction: !!userInstruction,
      }),
      false
    );

    requestPhotoAiComment(target.item, target.index, userInstruction)
      .then(function (comment) {
        if (!photoQueueContainsItem(target.item)) return;
        target.item.memo = comment;
        target.item.aiState = "done";
        target.item.aiGenerated = true;
        if (ctx && ctx.item) {
          ctx.item.caption = buildPhotoQueuePreviewCaption(target.item, target.index);
        }
        renderPhotoQueueUi();
        if (ctx && typeof ctx.sync === "function") ctx.sync();
        setPhotoAiStatus(
          buildPhotoAiResultMessage({
            hasMemo: !!hadMemo,
            suffix: "必要に応じて書き直して保存してください。",
          }),
          false
        );
        showToast(buildPhotoAiResultMessage({ hasMemo: !!hadMemo }));
      })
      .catch(function (err) {
        if (photoQueueContainsItem(target.item) && target.item.aiState === "loading") {
          target.item.aiState = "error";
        }
        renderPhotoQueueUi();
        if (ctx && typeof ctx.sync === "function") ctx.sync();
        var message = err && err.message ? String(err.message) : "AIコメントの生成に失敗しました。";
        setPhotoAiStatus(message, true);
        showToast(message, true);
      })
      .finally(function () {
        state.photoAiBusy = false;
        syncPhotoAiButtonState();
        renderPhotoQueueUi();
        if (ctx && typeof ctx.sync === "function") ctx.sync();
      });
  }

  function appendFilesToPhotoQueue(fileList) {
    if (!fileList || !fileList.length) return;
    var n = 0;
    for (var i = 0; i < fileList.length; i++) {
      if (state.photoQueue.length >= MAX_GROWTH_PHOTOS) break;
      var f = fileList[i];
      if (!growthFileLooksLikeImage(f)) continue;
      state.photoQueue.push({
        kind: "new",
        file: f,
        memo: "",
        aiState: "pending",
        previewUrl: "",
      });
      state.photosTouched = true;
      n++;
    }
    if (n < fileList.length) {
      showToast("写真は最大 " + MAX_GROWTH_PHOTOS + " 枚までです。", true);
    }
    renderPhotoQueueUi();
  }

  function removePhotoQueueIndex(idx) {
    if (idx < 0 || idx >= state.photoQueue.length) return;
    revokePhotoQueuePreview(state.photoQueue[idx]);
    state.photoQueue.splice(idx, 1);
    state.photosTouched = true;
    renderPhotoQueueUi();
  }

  function renderPhotoQueueUi() {
    if (!el.photoQueueEl) return;
    el.photoQueueEl.innerHTML = "";
    if (el.photoQueueEmpty) {
      el.photoQueueEmpty.hidden = state.photoQueue.length > 0;
    }
    if (!state.photoAiBusy && state.photoQueue.length === 0) {
      setPhotoAiStatus("", false);
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
        var previewUrl = ensurePhotoQueuePreviewUrl(item);
        if (previewUrl) thumb.src = previewUrl;
        else thumb.removeAttribute("src");
      } else if (item.kind === "saved" && item.slot) {
        var ssrc = growthImageSrcFromSlot(item.slot);
        if (ssrc) thumb.src = ssrc;
        thumb.addEventListener("error", function onThumbErr() {
          thumb.removeEventListener("error", onThumbErr);
          if (thumb.dataset.growthThumbFb === "1") return;
          var sl = item.slot;
          if (!sl || !sl.localSnapshotImage) return;
          var fb = sl.imageUrl || "";
          if (!fb && sl.imagePathname) {
            fb = API_GROWTH_IMAGE + "?pathname=" + encodeURIComponent(sl.imagePathname);
          }
          if (fb) {
            thumb.dataset.growthThumbFb = "1";
            thumb.src = fb;
          }
        });
      }
      if (thumb.getAttribute("src") && window.PlantingPhotoLightbox && typeof window.PlantingPhotoLightbox.bindImage === "function") {
        window.PlantingPhotoLightbox.bindImage(thumb, function () {
          var preview = buildPhotoQueuePreviewConfig(idx);
          return {
            items: preview.items,
            index: preview.index,
            actions: [
              {
                className: "site-photo-lightbox-action-ai",
                ariaLabel: "AIでコメントを追加または更新",
                label: function (ctx) {
                  return photoQueuePreviewAiActionLabel(ctx && ctx.item);
                },
                disabled: function () {
                  return !!state.photoAiBusy;
                },
                onClick: function (ctx) {
                  runPhotoQueuePreviewAiRefresh(ctx);
                },
              },
            ],
          };
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
      memoTa.dataset.photoIndex = String(idx);
      memoTa.setAttribute("aria-label", "写真" + (idx + 1) + "枚目のメモ");
      memoTa.rows = 2;
      memoTa.placeholder = "この写真用のメモ（任意）";
      memoTa.value = item.memo != null ? item.memo : "";
      memoTa.addEventListener("input", function () {
        item.memo = memoTa.value;
        if (item.kind === "new" && item.memo && (item.aiState === "pending" || item.aiState === "loading")) {
          item.aiState = "manual";
        }
        if (item.memo && item.aiState !== "loading") {
          item.aiState = "refresh_pending";
          setPhotoAiStatus("写真メモの変更を受けて、AIコメントを更新します…", false);
          schedulePhotoAiRefresh(900);
        } else if (!item.memo && item.aiState !== "loading") {
          item.aiState = "pending";
          schedulePhotoAiRefresh(600);
        }
      });
      row.appendChild(thumbWrap);
      row.appendChild(memoTa);
      tile.appendChild(row);
      el.photoQueueEl.appendChild(tile);
    });

    if (el.photoStatus) {
      var newCount = 0;
      state.photoQueue.forEach(function (it) {
        if (it.kind === "new") newCount++;
      });
      if (newCount) {
        el.photoStatus.textContent =
          "新規に追加予定: " + newCount + " 枚（アルバム・カメラからさらに追加できます）";
        el.photoStatus.hidden = false;
      } else {
        el.photoStatus.textContent = "";
        el.photoStatus.hidden = true;
      }
    }
    updateQueuedPhotoAiStatus();
    syncPhotoAiButtonState();
  }

  function focusEditPhotoIndex(index) {
    if (index == null || isNaN(index) || index < 0 || !el.photoQueueEl) return false;
    var target = el.photoQueueEl.querySelector(
      'textarea.growth-photo-memo[data-photo-index="' + index + '"]'
    );
    if (!target) return false;
    requestAnimationFrame(function () {
      try {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
      } catch (eScroll) {}
      try {
        target.focus({ preventScroll: true });
      } catch (eFocus) {
        target.focus();
      }
    });
    return true;
  }

  function resetPhotoQueueFromRecord(r) {
    revokePhotoQueuePreviews(state.photoQueue);
    state.photoQueue = growthImageSlots(r).map(function (slot) {
      var m = typeof slot.memo === "string" ? slot.memo : "";
      return { kind: "saved", slot: slot, memo: m, aiState: "idle" };
    });
    state.photosTouched = false;
    renderPhotoQueueUi();
  }

  function clearPhotoQueueCompletely() {
    revokePhotoQueuePreviews(state.photoQueue);
    state.photoQueue = [];
    state.photosTouched = true;
    renderPhotoQueueUi();
  }

  function updatePhotoStatusFromInputs() {
    renderPhotoQueueUi();
  }

  function clearPhotoInputs() {
    if (el.photoCamera) el.photoCamera.value = "";
    if (el.photoLibrary) el.photoLibrary.value = "";
    renderPhotoQueueUi();
    return;
    setPhotoAiStatus(
      "保存するとサーバー側でAIコメントを再生成します。保存後は画面を離れても大丈夫です。",
      false
    );
    showToast("保存後にバックグラウンドで再生成するよう予約しました。");
    renderPhotoQueueUi();
  }

  function buildPhotoQueueItemBase64(item) {
    if (!item) return Promise.resolve(null);
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
  }

  function getGrowthEditAreaContext() {
    if (!el.area) return null;
    var areaId = el.area.value || "";
    for (var i = 0; i < state.areas.length; i++) {
      var area = state.areas[i];
      if (area && area.id === areaId) return area;
    }
    return null;
  }

  function getGrowthEditNoteValue() {
    if (!el.form || !el.form.elements) return "";
    var noteField = el.form.elements.note;
    if (!noteField || typeof noteField.value !== "string") return "";
    return noteField.value.trim();
  }

  function buildPhotoAiContext(photoIndex, item, userInstruction) {
    var area = getGrowthEditAreaContext();
    return {
      recordedDate: el.date && el.date.value ? el.date.value : "",
      areaId: area && area.id ? area.id : "",
      areaLabel: area ? area.label || area.id || "" : "",
      plantNames: getSelectedPlants(),
      note: getGrowthEditNoteValue(),
      currentPhotoMemo: item && item.memo != null ? String(item.memo).trim() : "",
      userInstruction: userInstruction != null ? String(userInstruction).trim().slice(0, 400) : "",
      photoIndex: photoIndex + 1,
      photoCount: state.photoQueue.length,
      mode: state.editRecord ? "edit" : "new",
    };
  }

  function requestPhotoAiComment(item, idx, userInstruction) {
    return buildPhotoQueueItemBase64(item).then(function (imageBase64) {
      if (!imageBase64) {
        throw new Error("写真データを読み込めませんでした。");
      }
      return fetch(API_GROWTH_COMMENT, {
        method: "POST",
        headers: cloudHeaders(true),
        body: JSON.stringify({
          imageBase64: imageBase64,
          imageMimeType: "image/jpeg",
          context: buildPhotoAiContext(idx, item, userInstruction),
        }),
      });
    }).then(function (res) {
      if (res.status === 401) {
        throw new Error("トークンが違います。サイト管理者が設定した文字列と同じか確認してください。");
      }
      if (!res.ok) {
        return apiErrorMessage(res, "AIコメントの生成に失敗しました").then(function (msg) {
          throw new Error(msg);
        });
      }
      return res.json();
    }).then(function (data) {
      var comment = data && data.comment != null ? String(data.comment).trim() : "";
      if (!comment) {
        throw new Error("AIコメントが空でした。時間をおいてもう一度試してください。");
      }
      return comment;
    });
  }

  function photoQueueContainsItem(item) {
    return !!item && state.photoQueue.indexOf(item) !== -1;
  }

  function collectPendingPhotoAiTargets() {
    var targets = [];
    state.photoQueue.forEach(function (item, idx) {
      if (!item) return;
      if (item.aiState === "refresh_pending") {
        targets.push(idx);
        return;
      }
      if (item.aiState === "pending") targets.push(idx);
    });
    return targets;
  }

  function schedulePhotoAiRefresh(delayMs) {
    clearTimeout(schedulePhotoAiRefresh._t);
    schedulePhotoAiRefresh._t = setTimeout(function () {
      updateQueuedPhotoAiStatus();
    }, typeof delayMs === "number" ? delayMs : 900);
  }

  function markPhotosForAiRefreshFromNoteChange() {
    var changed = false;
    state.photoQueue.forEach(function (item) {
      if (!item) return;
      var memo = item.memo != null ? String(item.memo).trim() : "";
      if (item.aiState !== "loading") {
        item.aiState = memo ? "refresh_pending" : "pending";
        item.aiGenerated = false;
        changed = true;
      }
    });
    if (changed) {
      setPhotoAiStatus(
        "保存するとサーバー側でAIコメントを更新します。保存後は画面を離れても大丈夫です。",
        false
      );
      schedulePhotoAiRefresh(900);
    }
  }

  function generateAiCommentsForPendingPhotos() {
    if (state.photoAiBusy) return;

    var targets = collectPendingPhotoAiTargets();
    if (!targets.length) return;

    state.photoAiBusy = true;

    var successCount = 0;
    var failedCount = 0;
    var firstError = "";

    function runNext(pos) {
      if (pos >= targets.length) return Promise.resolve();
      var idx = targets[pos];
      var item = state.photoQueue[idx];
      if (!item || (item.aiState !== "pending" && item.aiState !== "refresh_pending")) {
        return runNext(pos + 1);
      }
      var requestSeed = item.memo != null ? String(item.memo) : "";
      item.aiState = "loading";
      setPhotoAiStatus(
        "AIが写真コメントを自動生成しています（" + (pos + 1) + "/" + targets.length + "）",
        false
      );
      renderPhotoQueueUi();
      return requestPhotoAiComment(item, idx)
        .then(function (comment) {
          if (!photoQueueContainsItem(item)) return;
          var currentMemoRaw = item.memo != null ? String(item.memo) : "";
          if (currentMemoRaw !== requestSeed) {
            item.aiState = currentMemoRaw.trim() ? "refresh_pending" : "pending";
            schedulePhotoAiRefresh(900);
            renderPhotoQueueUi();
            return;
          }
          item.memo = comment;
          item.aiState = "done";
          item.aiGenerated = true;
          successCount += 1;
          renderPhotoQueueUi();
        })
        .catch(function (err) {
          if (photoQueueContainsItem(item) && item.aiState === "loading") {
            item.aiState = "error";
          }
          failedCount += 1;
          if (!firstError) {
            firstError = err && err.message ? String(err.message) : "AIコメントの自動生成に失敗しました。";
          }
          console.error("photo ai comment", err);
        })
        .then(function () {
          return runNext(pos + 1);
        });
    }

    runNext(0).finally(function () {
      state.photoAiBusy = false;
      renderPhotoQueueUi();
      if (successCount && !failedCount) {
        setPhotoAiStatus(
          successCount + "枚の写真にAIコメント案を自動で追加しました。必要に応じて書き直してください。",
          false
        );
      } else if (successCount) {
        var mixedMessage =
          successCount +
          "枚にAIコメント案を自動で追加しました。失敗: " +
          failedCount +
          "枚" +
          (firstError ? "（" + firstError + "）" : "");
        setPhotoAiStatus(mixedMessage, true);
        showToast(mixedMessage, true);
      } else if (failedCount) {
        var failedMessage = firstError || "AIコメントの自動生成に失敗しました。";
        setPhotoAiStatus(failedMessage, true);
        showToast(failedMessage, true);
      }
      if (collectPendingPhotoAiTargets().length) {
        generateAiCommentsForPendingPhotos();
      }
    });
  }

  function generateAiCommentsForEmptyPhotosLegacy() {
    if (state.photoAiBusy) return;

    var targets = [];
    state.photoQueue.forEach(function (item, idx) {
      var memo = item && item.memo != null ? String(item.memo).trim() : "";
      if (!memo) targets.push(idx);
    });

    if (!targets.length) {
      setPhotoAiStatus(
        "未入力の写真メモはありません。必要ならメモ欄を空にしてからもう一度実行してください。",
        false
      );
      showToast("未入力の写真メモはありません。");
      return;
    }

    state.photoAiBusy = true;
    syncPhotoAiButtonState();

    var successCount = 0;
    var failedCount = 0;
    var firstError = "";

    function runNext(pos) {
      if (pos >= targets.length) return Promise.resolve();
      var idx = targets[pos];
      setPhotoAiStatus(
        "AIが写真コメントを作成しています（" + (pos + 1) + "/" + targets.length + "）",
        false
      );
      return requestPhotoAiComment(state.photoQueue[idx], idx)
        .then(function (comment) {
          var item = state.photoQueue[idx];
          if (item) item.memo = comment;
          successCount += 1;
          renderPhotoQueueUi();
        })
        .catch(function (err) {
          failedCount += 1;
          if (!firstError) {
            firstError = err && err.message ? String(err.message) : "AIコメントの生成に失敗しました。";
          }
          console.error("photo ai comment", err);
        })
        .then(function () {
          return runNext(pos + 1);
        });
    }

    runNext(0).finally(function () {
      state.photoAiBusy = false;
      renderPhotoQueueUi();
      if (successCount && !failedCount) {
        setPhotoAiStatus(successCount + "枚の写真にAIコメント案を入れました。", false);
        showToast(successCount + "枚の写真にAIコメント案を入れました。");
        return;
      }
      if (successCount) {
        var mixedMessage =
          successCount +
          "枚にAIコメント案を入れました。失敗: " +
          failedCount +
          "枚" +
          (firstError ? "（" + firstError + "）" : "");
        setPhotoAiStatus(mixedMessage, true);
        showToast(mixedMessage, true);
        return;
      }
      var failedMessage = firstError || "AIコメントの生成に失敗しました。";
      setPhotoAiStatus(failedMessage, true);
      showToast(failedMessage, true);
    });
  }

  function generateAiCommentsForEmptyPhotos() {
    if (state.photoAiBusy) return;
    if (!state.photoQueue.length) {
      setPhotoAiStatus("写真がありません。先に写真を追加してください。", true);
      showToast("写真がありません。", true);
      return;
    }

    var changed = false;
    state.photoQueue.forEach(function (item) {
      if (!item || item.aiState === "loading") return;
      var memo = item.memo != null ? String(item.memo).trim() : "";
      item.aiState = memo ? "refresh_pending" : "pending";
      changed = true;
    });

    if (!changed) return;

    setPhotoAiStatus("バックグラウンドでAIコメントを再生成します…", false);
    showToast("バックグラウンドで再生成を開始しました。");
    showToast("保存後にバックグラウンドで再生成するよう予約しました。");
    renderPhotoQueueUi();
  }

  function runAiRefreshAfterSaveByPolling(record, targetIndexes) {
    if (!record || !record.id || !targetIndexes || !targetIndexes.length) {
      return Promise.resolve({ record: record || null });
    }

    var job = readRecordAiCommentJob(record);
    var jobId = job && job.id ? job.id : "";
    var deadline = Date.now() + 35000;

    function fetchLatestRecord() {
      return fetch(API_GROWTH, { headers: cloudHeaders(false) })
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
          return records.find(function (item) {
            return item && item.id === record.id;
          }) || null;
        });
    }

    function pollUntilUpdated() {
      return fetchLatestRecord()
        .then(function (latest) {
          if (latest && growthRecordChangedForTargets(record, latest, targetIndexes, jobId)) {
            var immediate = buildGrowthAiRefreshResult(latest, jobId, "");
            startEdit(latest);
            if (immediate && immediate.job) {
              setPhotoAiStatus(
                growthAiJobStatusMessage(immediate.job),
                immediate.failed
              );
            } else {
              setPhotoAiStatus("AIコメントを反映しました。必要なら微調整して保存してください。", false);
            }
            return Object.assign({ record: latest }, immediate || {});
          }
          if (Date.now() >= deadline) {
            if (latest) startEdit(latest);
            var timeoutJob = latest ? readRecordAiCommentJob(latest) : null;
            if (timeoutJob) {
              setPhotoAiStatus(growthAiJobStatusMessage(timeoutJob), timeoutJob.status === "failed");
            } else {
              setPhotoAiStatus(
                "AIコメントの更新は継続中の可能性があります。少ししてからもう一度開くと確認しやすいです。",
                false
              );
            }
            return Object.assign(
              { record: latest || record, timedOut: true },
              buildGrowthAiRefreshResult(latest || record, jobId, "")
            );
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

    startEdit(record);
    setPhotoAiStatus(growthAiJobStatusMessage(job), false);
    return pollUntilUpdated();
  }

  function onPhotoInputChange(source) {
    if (source === "camera") {
      if (el.photoCamera && el.photoCamera.files && el.photoCamera.files[0]) {
        appendFilesToPhotoQueue(el.photoCamera.files);
      }
      if (el.photoCamera) el.photoCamera.value = "";
    } else if (source === "library") {
      if (el.photoLibrary && el.photoLibrary.files && el.photoLibrary.files.length) {
        appendFilesToPhotoQueue(el.photoLibrary.files);
      }
      if (el.photoLibrary) el.photoLibrary.value = "";
    }
  }

  function syncEditFormUI() {
    var editing = !!state.editRecord;
    if (el.newHeading) {
      el.newHeading.textContent = editing ? "記録を編集" : "新しい記録を追加";
    }
    if (el.submit) {
      el.submit.textContent = editing ? "更新して保存" : "保存";
    }
    if (el.submitNext) {
      el.submitNext.hidden = editing;
      el.submitNext.disabled = editing;
    }
    if (el.editBanner) el.editBanner.hidden = !editing;
    if (el.editCancel) el.editCancel.hidden = !editing;
    if (el.deleteRecordBtn) el.deleteRecordBtn.hidden = !editing;
    renderSequentialComposerGuide();
  }

  function syncEditPageContext(record) {
    if (IS_VIEW) return;

    var crumbEl = $("growth-edit-breadcrumb-current");
    var titleEl = $("growth-edit-page-title");
    var contextEl = $("growth-edit-context-line");
    if (!crumbEl && !titleEl && !contextEl) return;

    var params = new URLSearchParams(window.location.search);
    var areaId = record && record.areaId ? String(record.areaId).trim() : String(params.get("area") || "").trim();
    var plantName = "";
    if (record && Array.isArray(record.plants) && record.plants.length) {
      plantName = String(record.plants[0] || "").trim();
    }
    if (!plantName) {
      plantName = String(params.get("plant") || "").trim();
      try {
        plantName = decodeURIComponent(plantName).trim();
      } catch (e2) {
        plantName = plantName.trim();
      }
    }

    var area = findAreaById(areaId);

    if (record) {
      if (crumbEl) crumbEl.textContent = "\u8a18\u9332\u3092\u7de8\u96c6";
      if (titleEl) {
        titleEl.textContent = plantName
          ? plantName + "\u306e\u8a18\u9332\u3092\u7de8\u96c6"
          : "\u8a18\u9332\u3092\u7de8\u96c6";
      }
      if (contextEl) {
        contextEl.hidden = false;
        contextEl.textContent = area
          ? area.label + "\u306e\u8a18\u9332\u3092\u7de8\u96c6\u3057\u307e\u3059\u3002"
          : "\u9078\u3093\u3060\u8a18\u9332\u3092\u7de8\u96c6\u3057\u307e\u3059\u3002";
      }
      return;
    }

    if (plantName) {
      if (crumbEl) crumbEl.textContent = "\u690d\u683d\u6642\u7cfb\u5217\u306e\u7de8\u96c6";
      if (titleEl) titleEl.textContent = plantName + "\u306e\u8a18\u9332\u3092\u8ffd\u52a0\u30fb\u7de8\u96c6";
      if (contextEl) {
        contextEl.hidden = false;
        contextEl.textContent = area
          ? area.label + "\u306e\u300c" + plantName + "\u300d\u3092\u5bfe\u8c61\u306b\u3001\u690d\u683d\u6642\u7cfb\u5217\u3078\u8a18\u9332\u3092\u8ffd\u52a0\u3057\u307e\u3059\u3002"
          : "\u300c" + plantName + "\u300d\u306e\u690d\u683d\u6642\u7cfb\u5217\u3078\u8a18\u9332\u3092\u8ffd\u52a0\u3057\u307e\u3059\u3002";
      }
      return;
    }

    if (area) {
      if (crumbEl) crumbEl.textContent = "\u30a8\u30ea\u30a2\u6642\u7cfb\u5217\u306e\u7de8\u96c6";
      if (titleEl) titleEl.textContent = area.label + "\u306e\u8a18\u9332\u3092\u8ffd\u52a0\u30fb\u7de8\u96c6";
      if (contextEl) {
        contextEl.hidden = false;
        contextEl.textContent =
          "\u3053\u306e\u30a8\u30ea\u30a2\u306b\u7d10\u3065\u304f\u690d\u683d\u8a18\u9332\u3092\u8ffd\u52a0\u30fb\u7de8\u96c6\u3057\u307e\u3059\u3002";
      }
      return;
    }

    if (crumbEl) crumbEl.textContent = "\u8a18\u9332\u306e\u8ffd\u52a0\u30fb\u7de8\u96c6";
    if (titleEl) titleEl.textContent = "\u8a18\u9332\u306e\u8ffd\u52a0\u30fb\u7de8\u96c6";
    if (contextEl) {
      contextEl.hidden = true;
      contextEl.textContent = "";
    }
  }

  function clearEditMode() {
    state.editRecord = null;
    revokePhotoQueuePreviews(state.photoQueue);
    state.photoQueue = [];
    state.photosTouched = false;
    syncEditUrlParam("");
    syncEditFormUI();
    syncEditPageContext();
    if (!el.form || !el.area) return;
    el.form.reset();
    if (el.date) el.date.value = todayInputValue();
    renderPlantChecks(el.area.value);
    clearComposerPlantSelection();
    clearPhotoInputs();
    renderPhotoQueueUi();
  }

  function prepareNextRecordInSameArea(areaId, dateVal) {
    state.editRecord = null;
    revokePhotoQueuePreviews(state.photoQueue);
    state.photoQueue = [];
    state.photosTouched = false;
    state.pendingEditPhotoIndex = null;
    syncEditUrlParam("");
    syncEditFormUI();
    syncEditPageContext();
    if (!el.form || !el.area) return;
    el.form.reset();
    if (areaId) {
      el.area.value = areaId;
    }
    if (el.date) el.date.value = dateVal || todayInputValue();
    renderPlantChecks(el.area.value);
    clearComposerPlantSelection();
    clearPhotoInputs();
    renderPhotoQueueUi();
    requestAnimationFrame(function () {
      var section = document.getElementById("edit-record-section");
      if (section) section.scrollIntoView({ behavior: "smooth", block: "start" });
      var firstPlant = el.sequencePlants ? el.sequencePlants.querySelector("button") : null;
      if (firstPlant) firstPlant.focus();
    });
  }

  function startEdit(r) {
    state.editRecord = {
      id: r.id,
      createdAt: r.createdAt || null,
      plants: Array.isArray(r.plants) ? r.plants.slice() : [],
      imageUrl: r.imageUrl || null,
      imagePathname: r.imagePathname || null,
      localSnapshotImage: r.localSnapshotImage || null,
      images: r.images ? JSON.parse(JSON.stringify(r.images)) : null,
    };
    syncEditUrlParam(r.id);
    if (el._setGrowthEditTab) el._setGrowthEditTab("record");
    if (el.area) el.area.value = r.areaId || el.area.value || "";
    renderPlantChecks(el.area.value);
    applyPlantsToForm(state.editRecord.plants, el.area.value);
    var di = (r.recordedAt || "").slice(0, 10);
    if (el.date) el.date.value = di || todayInputValue();
    var note = el.form.querySelector('[name="note"]');
    if (note) note.value = r.note || "";
    clearPhotoInputs();
    resetPhotoQueueFromRecord(r);
    syncEditFormUI();
    syncEditPageContext(r);
    requestAnimationFrame(function () {
      var t = document.getElementById("edit-record-section");
      if (t) t.scrollIntoView({ behavior: "smooth", block: "start" });
      if (state.pendingEditPhotoIndex != null) {
        focusEditPhotoIndex(state.pendingEditPhotoIndex);
        state.pendingEditPhotoIndex = null;
      }
    });
  }

  function syncEditUrlParam(id) {
    if (IS_VIEW) return;
    try {
      var u = new URL(window.location.href);
      if (id) u.searchParams.set("id", String(id));
      else u.searchParams.delete("id");
      history.replaceState(null, "", u.pathname + u.search + u.hash);
    } catch (eUrl) {}
  }

  function renderPlantChecks(areaId) {
    if (!el.plantChecks) return;
    el.plantChecks.innerHTML = "";
    var area = state.areas.find(function (a) {
      return a.id === areaId;
    });
    if (!area || !area.plants || area.plants.length === 0) {
      var p = document.createElement("p");
      p.className = "plant-checks-empty";
      p.textContent = "登録された植栽がありません。下の「その他」に名前を入力してください。";
      el.plantChecks.appendChild(p);
      return;
    }
    area.plants.forEach(function (name) {
      var lab = document.createElement("label");
      lab.className = "row";
      var inp = document.createElement("input");
      inp.type = "checkbox";
      inp.value = name;
      lab.appendChild(inp);
      lab.appendChild(document.createTextNode(name));
      el.plantChecks.appendChild(lab);
    });
  }

  function readEmbeddedPlants() {
    var node = document.getElementById("plants-embed");
    if (!node || !node.textContent.trim()) {
      return null;
    }
    try {
      return JSON.parse(node.textContent.trim());
    } catch (e) {
      return null;
    }
  }

  function loadPlantsData() {
    return fetch(API_PLANTS, { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("api plants");
        return res.json();
      })
      .then(function (data) {
        if (!data || !Array.isArray(data.areas)) throw new Error("bad api shape");
        return { areas: data.areas, source: data.source === "kv" ? "kv" : "file" };
      })
      .catch(function () {
        return fetch("data/plants.json", { cache: "no-store" })
          .then(function (res) {
            if (!res.ok) throw new Error("bad status");
            return res.json();
          })
          .then(function (data) {
            return { areas: data.areas || [], source: "file" };
          });
      })
      .catch(function () {
        var embedded = readEmbeddedPlants();
        if (embedded && embedded.areas) {
          return { areas: embedded.areas, source: "embed" };
        }
        throw new Error("plants.json を読めず、埋め込みデータも使えません");
      });
  }

  function computePlantRenames(beforeAreas, afterAreas) {
    var byId = {};
    beforeAreas.forEach(function (a) {
      byId[a.id] = a;
    });
    var renames = [];
    afterAreas.forEach(function (after) {
      var orig =
        after._originalId != null && String(after._originalId).trim() !== ""
          ? String(after._originalId).trim()
          : after.id;
      var before = byId[orig];
      if (!before) return;
      var op = before.plants || [];
      var np = after.plants || [];
      var n = Math.min(op.length, np.length);
      for (var i = 0; i < n; i++) {
        if (op[i] !== np[i]) {
          renames.push({ areaId: after.id, from: op[i], to: np[i] });
        }
      }
    });
    return renames;
  }

  var AREA_ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

  function validateCollectedCatalog(collected) {
    if (!collected.length) {
      return "エリアを1つ以上登録してください。";
    }
    var seen = {};
    for (var i = 0; i < collected.length; i++) {
      var a = collected[i];
      if (!a.id) {
        return "エリアIDが空のブロックがあります。";
      }
      if (!AREA_ID_RE.test(a.id)) {
        return "エリアIDは英小文字・数字・ハイフンのみ（例: north-garden）: " + a.id;
      }
      if (!a.label) {
        return "表示名が空のエリアがあります（ID: " + a.id + "）。";
      }
      if (seen[a.id]) {
        return "同じエリアIDが重複しています: " + a.id;
      }
      seen[a.id] = true;
    }
    return null;
  }

  function buildAreaIdMigrations(collected) {
    var out = [];
    var fromSeen = {};
    for (var i = 0; i < collected.length; i++) {
      var a = collected[i];
      var o = a._originalId != null ? String(a._originalId).trim() : "";
      if (o && o !== a.id) {
        if (fromSeen[o]) {
          return { error: "同じ旧エリアIDからの変更が複数あります: " + o };
        }
        fromSeen[o] = true;
        out.push({ from: o, to: a.id });
      }
    }
    return { migrations: out };
  }

  function makeCatalogAreaBlock(area, originalAreaId) {
    var block = document.createElement("div");
    block.className = "plants-catalog-area-block";
    block.dataset.originalAreaId = originalAreaId != null && originalAreaId !== "" ? originalAreaId : "";

    var meta = document.createElement("div");
    meta.className = "plants-catalog-area-meta";

    var idLab = document.createElement("label");
    idLab.className = "plants-catalog-area-field";
    var idCap = document.createElement("span");
    idCap.textContent = "エリアID";
    var idInput = document.createElement("input");
    idInput.type = "text";
    idInput.className = "plants-catalog-area-id-input";
    idInput.value = area.id || "";
    idInput.autocomplete = "off";
    idInput.placeholder = "例: north-garden";
    idLab.appendChild(idCap);
    idLab.appendChild(idInput);

    var labelLab = document.createElement("label");
    labelLab.className = "plants-catalog-area-field";
    var labelCap = document.createElement("span");
    labelCap.textContent = "表示名";
    var labelInput = document.createElement("input");
    labelInput.type = "text";
    labelInput.className = "plants-catalog-area-label-input";
    labelInput.value = area.label || "";
    labelInput.autocomplete = "off";
    labelInput.placeholder = "例: 北側花壇";
    labelLab.appendChild(labelCap);
    labelLab.appendChild(labelInput);

    meta.appendChild(idLab);
    meta.appendChild(labelLab);

    var rmArea = document.createElement("button");
    rmArea.type = "button";
    rmArea.className = "growth-secondary plants-catalog-remove-area";
    rmArea.textContent = "このエリアを削除";
    rmArea.addEventListener("click", function () {
      if (!el.plantsCatalogEditor) return;
      var blocks = el.plantsCatalogEditor.querySelectorAll(".plants-catalog-area-block");
      if (blocks.length <= 1) {
        showToast("エリアは最低1つ必要です。", true);
        return;
      }
      var label = labelInput && String(labelInput.value || "").trim();
      var areaName = label || (idInput && String(idInput.value || "").trim()) || "このエリア";
      if (
        !confirmIrreversibleAction({
          warning: "この変更を保存すると元に戻せません。",
          subject: "「" + areaName + "」",
          action: "と、その下の植栽行を削除します。",
          detail: "まだ保存前なので、この画面を閉じるまでは保存されません。",
          question: "本当に削除しますか？",
        })
      ) {
        return;
      }
      block.remove();
    });

    meta.appendChild(rmArea);
    block.appendChild(meta);

    var plantsWrap = document.createElement("div");
    plantsWrap.className = "plants-catalog-area-plants-wrap";

    var list = document.createElement("div");
    list.className = "plants-catalog-name-rows";
    var plants = area.plants || [];
    if (plants.length === 0) {
      list.appendChild(makePlantCatalogRow(""));
    } else {
      plants.forEach(function (name) {
        list.appendChild(makePlantCatalogRow(name));
      });
    }
    plantsWrap.appendChild(list);
    var addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "growth-secondary plants-catalog-add";
    addBtn.textContent = "植栽の行を追加";
    addBtn.addEventListener("click", function () {
      list.appendChild(makePlantCatalogRow(""));
    });
    plantsWrap.appendChild(addBtn);
    block.appendChild(plantsWrap);
    return block;
  }

  function makePlantCatalogRow(initial) {
    var row = document.createElement("div");
    row.className = "plants-catalog-row";
    var inp = document.createElement("input");
    inp.type = "text";
    inp.className = "plants-catalog-name-input";
    inp.value = initial || "";
    inp.autocomplete = "off";
    row.appendChild(inp);
    var rm = document.createElement("button");
    rm.type = "button";
    rm.className = "growth-secondary plants-catalog-remove";
    rm.textContent = "削除";
    rm.addEventListener("click", function () {
      var parent = row.parentElement;
      var plantName = String(inp.value || "").trim();
      if (
        !confirmIrreversibleAction({
          warning: "この変更を保存すると元に戻せません。",
          subject: plantName ? "植栽「" + plantName + "」" : "この植栽行",
          action: "を削除します。",
          detail: "まだ保存前なので、この画面を閉じるまでは保存されません。",
          question: "本当に削除しますか？",
        })
      ) {
        return;
      }
      if (parent && parent.childElementCount <= 1) {
        inp.value = "";
        return;
      }
      row.remove();
    });
    row.appendChild(rm);
    return row;
  }

  function renderPlantsCatalogEditor() {
    if (!el.plantsCatalogEditor) return;
    el.plantsCatalogEditor.innerHTML = "";
    el.plantsCatalogEditor.hidden = false;
    state.areas.forEach(function (area) {
      el.plantsCatalogEditor.appendChild(
        makeCatalogAreaBlock(
          { id: area.id, label: area.label, plants: area.plants || [] },
          area.id
        )
      );
    });
  }

  function collectPlantsCatalogFromEditor() {
    var out = [];
    if (!el.plantsCatalogEditor) return out;
    var blocks = el.plantsCatalogEditor.querySelectorAll(".plants-catalog-area-block");
    for (var i = 0; i < blocks.length; i++) {
      var block = blocks[i];
      var idInput = block.querySelector(".plants-catalog-area-id-input");
      var labelInput = block.querySelector(".plants-catalog-area-label-input");
      var id = idInput ? idInput.value.trim() : "";
      var label = labelInput ? labelInput.value.trim() : "";
      var original = (block.dataset.originalAreaId || "").trim();
      var inputs = block.querySelectorAll(".plants-catalog-name-input");
      var plants = [];
      for (var j = 0; j < inputs.length; j++) {
        var t = inputs[j].value.trim();
        if (t) plants.push(t);
      }
      out.push({
        id: id,
        label: label,
        plants: plants,
        _originalId: original,
      });
    }
    return out;
  }

  function updatePlantsCatalogSourceLabel() {
    if (!el.plantsCatalogSource) return;
    if (state.plantsSource === "kv") {
      el.plantsCatalogSource.textContent =
        "現在の表示: サーバーに保存した植栽名リスト（Web で編集した内容）";
    } else if (state.plantsSource === "embed") {
      el.plantsCatalogSource.textContent = "現在の表示: ページ内の埋め込みデータ（オフライン用）";
    } else {
      el.plantsCatalogSource.textContent =
        "現在の表示: サイトに同梱の既定リスト（サーバーへの上書きがまだないときは data/plants.json と同じ内容です）";
    }
  }

  function savePlantsCatalog() {
    if (!el.plantsCatalogSave) return;
    var collected = collectPlantsCatalogFromEditor();
    var verr = validateCollectedCatalog(collected);
    if (verr) {
      showToast(verr, true);
      return;
    }
    var migPack = buildAreaIdMigrations(collected);
    if (migPack.error) {
      showToast(migPack.error, true);
      return;
    }
    var areaIdMigrations = migPack.migrations;
    var renames = computePlantRenames(state.plantsBaseline, collected);
    if (el.plantsRecordRenameArea && el.plantsRecordRenameFrom && el.plantsRecordRenameTo) {
      var aid = el.plantsRecordRenameArea.value.trim();
      var fr = el.plantsRecordRenameFrom.value.trim();
      var to = el.plantsRecordRenameTo.value.trim();
      if (aid && fr && to && fr !== to) {
        renames.push({ areaId: aid, from: fr, to: to });
      }
    }
    var payloadAreas = collected.map(function (a) {
      return { id: a.id, label: a.label, plants: a.plants };
    });
    el.plantsCatalogSave.disabled = true;
    fetch(API_PLANTS, {
      method: "PUT",
      headers: cloudHeaders(true),
      body: JSON.stringify({
        areas: payloadAreas,
        renames: renames,
        areaIdMigrations: areaIdMigrations,
      }),
    })
      .then(function (res) {
        if (res.status === 401) {
          throw new Error("トークンが必要です。下の欄に正しい文字列を入れて保存してください。");
        }
        if (!res.ok) {
          return apiErrorMessage(res, "マスタの保存に失敗しました").then(function (msg) {
            throw new Error(msg);
          });
        }
        return res.json();
      })
      .then(function (saveResult) {
        var stored = collected.map(function (a) {
          return { id: a.id, label: a.label, plants: a.plants };
        });
        var prevArea = el.area ? el.area.value : "";
        if (areaIdMigrations.length && el.area) {
          var mmap = {};
          areaIdMigrations.forEach(function (m) {
            mmap[m.from] = m.to;
          });
          var steps = 0;
          var cur = prevArea;
          while (mmap[cur] && steps < 50) {
            cur = mmap[cur];
            steps++;
          }
          prevArea = cur;
        }
        state.areas = stored;
        state.plantsBaseline = JSON.parse(JSON.stringify(stored));
        state.plantsSource = "kv";
        populateAreaSelects();
        if (el.area && state.areas.length) {
          var hasPrev = state.areas.some(function (a) {
            return a.id === prevArea;
          });
          el.area.value = hasPrev ? prevArea : state.areas[0].id;
        }
        renderPlantsCatalogEditor();
        renderPlantChecks(el.area.value);
        updateFilterPlantOptions();
        updatePlantsCatalogSourceLabel();
        loadChangeLog().catch(function () {});
        if (state.editRecord && state.editRecord.plants) {
          applyPlantsToForm(state.editRecord.plants, el.area.value);
        }
        if (el.plantsRecordRenameFrom) el.plantsRecordRenameFrom.value = "";
        if (el.plantsRecordRenameTo) el.plantsRecordRenameTo.value = "";
        var toastParts = [];
        if (areaIdMigrations.length) {
          toastParts.push("記録のエリアIDを更新");
        }
        if (renames.length) {
          toastParts.push("記録内の植栽名を置換");
        }
        showToast(
          toastParts.length ? "保存しました（" + toastParts.join("・") + "）" : "保存しました"
        );
        if (el.feed) return refreshFeed();
      })
      .catch(function (err) {
        showToast(err && err.message ? err.message : "保存に失敗しました", true);
      })
      .finally(function () {
        el.plantsCatalogSave.disabled = false;
      });
  }

  function reloadPlantsCatalogUi() {
    loadPlantsData()
      .then(function (pack) {
        state.areas = pack.areas || [];
        state.plantsSource = pack.source;
        state.plantsBaseline = JSON.parse(JSON.stringify(state.areas));
        populateAreaSelects();
        renderPlantChecks(el.area.value);
        updateFilterPlantOptions();
        renderPlantsCatalogEditor();
        updatePlantsCatalogSourceLabel();
        loadChangeLog().catch(function () {});
        if (state.editRecord && state.editRecord.plants) {
          applyPlantsToForm(state.editRecord.plants, el.area.value);
        }
        showToast("植栽リストを再読み込みしました");
        if (el.feed) return refreshFeed();
      })
      .catch(function (err) {
        showToast(err && err.message ? err.message : "読み込みに失敗しました", true);
      });
  }

  function populateRecordRenameAreaSelect() {
    if (!el.plantsRecordRenameArea) return;
    var keep = el.plantsRecordRenameArea.value;
    el.plantsRecordRenameArea.innerHTML = '<option value="">（指定しない）</option>';
    state.areas.forEach(function (a) {
      var opt = document.createElement("option");
      opt.value = a.id;
      opt.textContent = a.label;
      el.plantsRecordRenameArea.appendChild(opt);
    });
    if (keep) el.plantsRecordRenameArea.value = keep;
  }

  function populateAreaSelects() {
    if (el.area) {
      var keepArea = el.area.value;
      el.area.innerHTML = "";
      state.areas.forEach(function (a) {
        var opt = document.createElement("option");
        opt.value = a.id;
        opt.textContent = a.label;
        el.area.appendChild(opt);
      });
      if (keepArea) el.area.value = keepArea;
      if (!el.area.value && state.areas.length) el.area.value = state.areas[0].id;
    }
    if (el.filterArea) {
      var keep = el.filterArea.value;
      el.filterArea.innerHTML = '<option value="">（すべて）</option>';
      state.areas.forEach(function (a) {
        var opt = document.createElement("option");
        opt.value = a.id;
        opt.textContent = a.label;
        el.filterArea.appendChild(opt);
      });
      if (keep) el.filterArea.value = keep;
    }
    populateRecordRenameAreaSelect();
    updateFilterPlantOptions();
    renderSequentialComposerGuide();
  }

  function allPlantNames() {
    var set = {};
    state.areas.forEach(function (a) {
      (a.plants || []).forEach(function (p) {
        set[p] = true;
      });
    });
    return Object.keys(set).sort();
  }

  function applyQueryPrefill() {
    var params = new URLSearchParams(window.location.search);
    if (!params.get("area") && !params.get("plant")) {
      return;
    }

    var areaId = params.get("area");
    var plantName = params.get("plant");
    if (plantName) {
      try {
        plantName = decodeURIComponent(plantName);
      } catch (e) {
        /* keep raw */
      }
    }

    if (!areaId && plantName) {
      for (var i = 0; i < state.areas.length; i++) {
        var ar = state.areas[i];
        if (ar.plants && ar.plants.indexOf(plantName) !== -1) {
          areaId = ar.id;
          break;
        }
      }
    }

    var applied = false;

    if (areaId) {
      var exists = state.areas.some(function (a) {
        return a.id === areaId;
      });
      if (exists) {
        el.area.value = areaId;
        renderPlantChecks(areaId);
        updateFilterPlantOptions();
        applied = true;
      }
    }

    if (plantName && el.plantChecks) {
      var boxes = el.plantChecks.querySelectorAll('input[type="checkbox"]');
      var found = false;
      for (var j = 0; j < boxes.length; j++) {
        if (boxes[j].value === plantName) {
          boxes[j].checked = true;
          found = true;
        }
      }
      if (!found && el.customPlant) {
        el.customPlant.value = plantName;
        applied = true;
      } else if (found) {
        applied = true;
      }
    }

    if (applied) {
      requestAnimationFrame(function () {
        var target = document.getElementById("edit-record-section");
        if (target) {
          target.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
    }
  }

  function applyViewQueryFilters() {
    if (!IS_VIEW || !el.filterArea) return false;
    var params = new URLSearchParams(window.location.search);
    if (redirectLegacyGrowthView(params)) return true;

    var areaId = params.get("area");
    var plantName = params.get("plant");
    if (plantName) {
      try {
        plantName = decodeURIComponent(plantName);
      } catch (e) {}
    }

    if (
      areaId &&
      state.areas.some(function (a) {
        return a.id === areaId;
      })
    ) {
      el.filterArea.value = areaId;
    } else {
      el.filterArea.value = "";
    }

    updateFilterPlantOptions();

    if (el.filterPlant) {
      if (plantName) {
        var opts = el.filterPlant.querySelectorAll("option");
        var matched = false;
        for (var i = 0; i < opts.length; i++) {
          if (opts[i].value === plantName) {
            el.filterPlant.value = plantName;
            matched = true;
            break;
          }
        }
        if (!matched) el.filterPlant.value = "";
      } else {
        el.filterPlant.value = "";
      }
    }

    return false;
  }

  /**
   * 閲覧ページ: 現在の location.search から表示モード・絞り込みを同期（戻る／進む・ボタン用）。
   * view パラメータが無い・grid のときは記録一覧表示にする。
   */
  function applyGrowthViewFromLocationSearch() {
    if (!IS_VIEW || !el.filterArea) return false;
    state.viewLayout = "grid";
    if (applyViewQueryFilters()) return true;
    syncViewModeUi();
    renderViewMain(state.lastGrowthRecords);
    applyThumbFeedClass();
    return false;
  }

  function goGrowthViewGridInPlace() {
    if (!IS_VIEW) return;
    try {
      var u = new URL(window.location.href);
      u.searchParams.delete("view");
      u.searchParams.delete("plant");
      history.replaceState(null, "", u.pathname + u.search + u.hash);
    } catch (eU) {}
    applyGrowthViewFromLocationSearch();
    requestAnimationFrame(function () {
      if (el.feed) el.feed.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function fetchRecordByIdAndEdit(id) {
    return fetch(API_GROWTH, { headers: cloudHeaders(false) })
      .then(function (res) {
        if (!res.ok) throw new Error("一覧の取得に失敗しました");
        return res.json();
      })
      .then(function (data) {
        var list = data.records || [];
        if (!IS_VIEW) {
          state.lastGrowthRecords = list;
          if (el.feed) renderFeed(list);
        }
        var r = list.find(function (x) {
          return x.id === id;
        });
        if (!r) {
          showToast("該当する記録が見つかりません。", true);
          return;
        }
        startEdit(r);
      })
      .catch(function (err) {
        showToast(err && err.message ? err.message : "読み込みに失敗しました", true);
      });
  }

  function updateFilterPlantOptions() {
    if (!el.filterPlant) return;
    var prev = el.filterPlant.value;
    var list = [];
    var emptyLabel = "（すべて）";
    var areaId = el.filterArea ? el.filterArea.value : "";
    var timeline = IS_VIEW && state.viewLayout === "timeline";

    if (timeline) {
      emptyLabel = "（植栽を選ぶ）";
    }

    if (areaId) {
      var ar = state.areas.find(function (x) {
        return x.id === areaId;
      });
      var catalog = ar && ar.plants ? ar.plants.slice() : [];
      if (timeline) {
        var m = {};
        catalog.forEach(function (p) {
          m[p] = true;
        });
        (state.lastGrowthRecords || []).forEach(function (r) {
          if (r.areaId !== areaId) return;
          (r.plants || []).forEach(function (p) {
            var t = typeof p === "string" ? p.trim() : "";
            if (t) m[t] = true;
          });
        });
        list = Object.keys(m).sort(function (a, b) {
          return a.localeCompare(b, "ja");
        });
      } else {
        list = catalog;
      }
    } else if (timeline) {
      list = mergedPlantNameList(state.lastGrowthRecords);
    } else {
      list = allPlantNames();
    }

    el.filterPlant.innerHTML = "";
    var opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = emptyLabel;
    el.filterPlant.appendChild(opt0);

    list.forEach(function (p) {
      var opt = document.createElement("option");
      opt.value = p;
      opt.textContent = p;
      el.filterPlant.appendChild(opt);
    });
    if (prev && list.indexOf(prev) !== -1) {
      el.filterPlant.value = prev;
    } else {
      el.filterPlant.value = "";
    }
  }

  function normalizeLooseString(s) {
    return String(s || "")
      .replace(/\u3000/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  /** areaId が無い旧データは areaLabel（またはラベルと同じ文字列の id）から補完 */
  function resolveGrowthRecordAreaId(r) {
    var aid = (r.areaId && String(r.areaId).trim()) || "";
    if (aid) return aid;
    var label = normalizeLooseString(r.areaLabel);
    if (!label || !state.areas || !state.areas.length) return "";
    for (var i = 0; i < state.areas.length; i++) {
      var a = state.areas[i];
      if (!a) continue;
      var idPart = (a.id && String(a.id).trim()) || "";
      var lab = normalizeLooseString(a.label);
      if (lab && lab === label) return idPart;
      if (idPart && idPart === label) return idPart;
    }
    return "";
  }

  /** 記録のエリアが取れないとき、植栽マスタ上の所属エリアから推定 */
  function resolveGrowthRecordAreaIdForPlant(r, plantName) {
    var fromRecord = resolveGrowthRecordAreaId(r);
    if (fromRecord) return fromRecord;
    var pn = normalizeLooseString(plantName);
    if (!pn || !state.areas || !state.areas.length) return "";
    for (var j = 0; j < state.areas.length; j++) {
      var ar = state.areas[j];
      if (!ar || !Array.isArray(ar.plants)) continue;
      for (var k = 0; k < ar.plants.length; k++) {
        var p = ar.plants[k];
        var pt = normalizeLooseString(typeof p === "string" ? p : String(p));
        if (pt && pt === pn) return (ar.id && String(ar.id).trim()) || "";
      }
    }
    return "";
  }

  function plantPageHref(areaId, plantName) {
    var name = normalizeLooseString(plantName);
    if (!name) return "./plant.html";
    if (areaId) {
      return (
        "./plant.html?area=" +
        encodeURIComponent(areaId) +
        "&plant=" +
        encodeURIComponent(name)
      );
    }
    return "./plant.html?plant=" + encodeURIComponent(name);
  }

  function plantDetailHref(areaId, plantName) {
    return plantPageHref(areaId, plantName);
  }

  /** 旧URL互換として、植栽へのリンク先を返す。 */
  function growthTimelineBrowseHref(plantName, areaId) {
    return plantPageHref(areaId, plantName);
  }

  function areaTimelineHref(areaId) {
    var aid = normalizeLooseString(areaId);
    return aid ? "./area.html?area=" + encodeURIComponent(aid) : "./areas.html";
  }

  function redirectLegacyGrowthView(params) {
    if (!IS_VIEW || !params || params.get("view") !== "timeline") return false;
    var areaId = normalizeLooseString(params.get("area"));
    var plantName = params.get("plant") || "";
    try {
      plantName = decodeURIComponent(plantName);
    } catch (e) {}
    plantName = normalizeLooseString(plantName);
    var nextHref = "";
    if (plantName) nextHref = plantPageHref(areaId, plantName);
    else if (areaId) nextHref = areaTimelineHref(areaId);
    else nextHref = "./plants.html";
    try {
      window.location.replace(nextHref);
    } catch (eNav) {
      window.location.href = nextHref;
    }
    return true;
  }

  function createGrowthCardArticle(r, opts) {
    var inTimeline = opts && opts.inTimeline;
    var suppressBrowseActions = opts && opts.suppressBrowseActions;
    var uniformThumb = opts && opts.uniformThumb;
    var card = document.createElement("article");
    card.className = "growth-card" + (inTimeline ? " growth-card--in-timeline" : "");

    var imgWrap = document.createElement("div");
    imgWrap.className = "growth-card-img-wrap";

    var zoomCaption = growthZoomCaptionForRecord(r);

    var slots = growthImageSlots(r);
    var galleryUrls = [];
    for (var si = 0; si < slots.length; si++) {
      var u0 = growthImageSrcFromSlot(slots[si]);
      if (u0) galleryUrls.push(u0);
    }

    function bindGrowthThumb(imgEl, slot, imgIndex) {
      imgEl.alt = "";
      imgEl.loading = "lazy";
      imgEl.referrerPolicy = "no-referrer";
      imgEl.classList.add("growth-card-img--zoomable");
      imgEl.setAttribute("role", "button");
      imgEl.setAttribute("tabindex", "0");
      imgEl.setAttribute(
        "aria-label",
        galleryUrls.length > 1 ? "写真を拡大表示（" + (imgIndex + 1) + "枚目）" : "写真を拡大表示"
      );
      imgEl.addEventListener("error", function onGrowthImgErr() {
        imgEl.removeEventListener("error", onGrowthImgErr);
        if (imgEl.dataset.growthImgFallback === "1") return;
        if (!slot || !slot.localSnapshotImage) return;
        var fb = slot.imageUrl || "";
        if (!fb && slot.imagePathname) {
          fb = API_GROWTH_IMAGE + "?pathname=" + encodeURIComponent(slot.imagePathname);
        }
        if (fb) {
          imgEl.dataset.growthImgFallback = "1";
          imgEl.src = fb;
        }
      });
      imgEl.addEventListener("click", function (e) {
        e.preventDefault();
        openGrowthViewLightbox(r, imgIndex, galleryUrls, zoomCaption);
      });
      imgEl.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openGrowthViewLightbox(r, imgIndex, galleryUrls, zoomCaption);
        }
      });
    }

    if (galleryUrls.length === 1 || (uniformThumb && galleryUrls.length > 1)) {
      var imgOne = document.createElement("img");
      imgOne.src = galleryUrls[0];
      bindGrowthThumb(imgOne, slots[0], 0);
      imgWrap.appendChild(imgOne);
      if (uniformThumb && galleryUrls.length > 1) {
        var countBadge = document.createElement("span");
        countBadge.className = "growth-card-img-count";
        countBadge.textContent = galleryUrls.length + "枚";
        imgWrap.appendChild(countBadge);
      }
    } else if (galleryUrls.length > 1) {
      imgWrap.classList.add("growth-card-img-wrap--grid");
      var grid = document.createElement("div");
      grid.className = "growth-card-img-grid";
      var urlIdx = 0;
      for (var gi = 0; gi < slots.length; gi++) {
        var srcG = growthImageSrcFromSlot(slots[gi]);
        if (!srcG) continue;
        var imG = document.createElement("img");
        imG.src = srcG;
        bindGrowthThumb(imG, slots[gi], urlIdx);
        urlIdx++;
        grid.appendChild(imG);
      }
      imgWrap.appendChild(grid);
    } else {
      imgWrap.classList.add("growth-card-img-wrap--empty");
      imgWrap.textContent = "写真なし";
    }
    card.appendChild(imgWrap);

    var body = document.createElement("div");
    body.className = "growth-card-body";

    var meta = document.createElement("p");
    meta.className = "growth-card-meta";
    meta.textContent = (r.recordedAt || "").slice(0, 10);
    body.appendChild(meta);

    var title = document.createElement("h3");
    title.className = "growth-card-title";
    if (r.plants && r.plants.length) {
      var firstPlant = true;
      r.plants.forEach(function (pn) {
        var name = typeof pn === "string" ? pn.trim() : String(pn || "").trim();
        if (!name) return;
        if (!firstPlant) {
          title.appendChild(document.createTextNode("、"));
        }
        firstPlant = false;
        var aid = resolveGrowthRecordAreaIdForPlant(r, name);
        var a = document.createElement("a");
        a.className = "growth-card-plant-link";
        a.href = plantPageHref(aid, name);
        a.textContent = name;
        a.setAttribute("title", name + "を見る");
        title.appendChild(a);
      });
      if (!title.childNodes.length) {
        title.textContent = "—";
      }
    } else {
      title.textContent = "—";
    }
    body.appendChild(title);

    var areaRow = document.createElement("p");
    areaRow.className = "growth-card-area";
    var areaIcon = document.createElement("span");
    areaIcon.className = "growth-card-area-icon";
    areaIcon.setAttribute("aria-hidden", "true");
    areaIcon.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" focusable="false"><path d="M12 21s-7-4.35-7-11a7 7 0 1 1 14 0c0 6.65-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>';
    var cardAreaId = resolveGrowthRecordAreaId(r);
    var areaLabel = cardAreaId
      ? document.createElement("a")
      : document.createElement("span");
    areaLabel.className = "growth-card-area-label";
    areaLabel.textContent = r.areaLabel || "—";
    if (cardAreaId) {
      areaLabel.href = "./area.html?area=" + encodeURIComponent(cardAreaId);
      areaLabel.setAttribute("title", (r.areaLabel || "このエリア") + "を見る");
    }
    areaRow.appendChild(areaIcon);
    areaRow.appendChild(areaLabel);
    body.appendChild(areaRow);

    if (r.note) {
      var note = document.createElement("p");
      note.className = "growth-card-note";
      note.textContent = r.note;
      body.appendChild(note);
    }

    if (!IS_VIEW) {
      var commentStats = growthRecordPhotoCommentStats(r);
      if (commentStats.total > 0) {
        var commentStatus = document.createElement("p");
        commentStatus.className = "growth-card-comment-status";
        commentStatus.textContent =
          commentStats.missing > 0
            ? "写真コメント: " +
              commentStats.filled +
              " / " +
              commentStats.total +
              " 入力済み（未入力 " +
              commentStats.missing +
              " 件）"
            : "写真コメント: " + commentStats.total + " / " + commentStats.total + " 入力済み";
        body.appendChild(commentStatus);
      }
    }

    card.appendChild(body);

    var actions = document.createElement("div");
    actions.className = "growth-card-actions";
    var plantNames = [];
    var plantSeen = {};
    (r.plants || []).forEach(function (p) {
      var plantName = typeof p === "string" ? p.trim() : String(p || "").trim();
      if (!plantName || plantSeen[plantName]) return;
      plantSeen[plantName] = true;
      plantNames.push(plantName);
    });
    if (IS_VIEW) {
      if (!inTimeline && !suppressBrowseActions) {
        for (var tli = 0; tli < plantNames.length; tli++) {
          var tln = plantNames[tli];
          var tlLink = document.createElement("a");
          tlLink.className = "growth-card-timeline-link";
          tlLink.href = growthTimelineBrowseHref(tln, r.areaId);
          tlLink.setAttribute("data-growth-timeline-plant", tln);
          if (r.areaId) tlLink.setAttribute("data-growth-timeline-area", String(r.areaId));
          tlLink.setAttribute("aria-label", tln + "を見る");
          tlLink.textContent =
            plantNames.length === 1 ? "植栽を見る" : "植栽（" + tln + "）";
          actions.appendChild(tlLink);
        }
        if (cardAreaId) {
          var areaLink = document.createElement("a");
          areaLink.className = "growth-card-view-link";
          areaLink.href = "./area.html?area=" + encodeURIComponent(cardAreaId);
          areaLink.setAttribute(
            "aria-label",
            (r.areaLabel || "このエリア") + "を見る"
          );
          areaLink.textContent = "エリアを見る";
          actions.appendChild(areaLink);
        }
        for (var dli = 0; dli < plantNames.length; dli++) {
          var detailName = plantNames[dli];
          var detailLink = document.createElement("a");
          detailLink.className = "growth-card-view-link";
          detailLink.href = plantDetailHref(r.areaId, detailName);
          detailLink.setAttribute("aria-label", detailName + "の植栽を見る");
          detailLink.textContent =
            plantNames.length === 1 ? "植栽を見る" : "植栽（" + detailName + "）";
          actions.appendChild(detailLink);
        }
      }
    } else {
      var editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "growth-edit";
      editBtn.textContent = "この記録を編集";
      editBtn.addEventListener("click", function () {
        startEdit(r);
      });
      actions.appendChild(editBtn);
    }
    if (actions.childNodes.length) card.appendChild(actions);

    return card;
  }

  function collectAllPlantsFromRecords(records) {
    var set = {};
    (records || []).forEach(function (r) {
      (r.plants || []).forEach(function (p) {
        var t = typeof p === "string" ? p.trim() : "";
        if (t) set[t] = true;
      });
    });
    return Object.keys(set);
  }

  function mergedPlantNameList(records) {
    var m = {};
    allPlantNames().forEach(function (p) {
      m[p] = true;
    });
    collectAllPlantsFromRecords(records).forEach(function (p) {
      m[p] = true;
    });
    return Object.keys(m).sort(function (a, b) {
      return a.localeCompare(b, "ja");
    });
  }

  function applyPendingTimelinePlant() {
    if (!state.pendingTimelinePlant || !el.filterPlant) return;
    var want = state.pendingTimelinePlant;
    var opts = el.filterPlant.querySelectorAll("option");
    for (var i = 0; i < opts.length; i++) {
      if (opts[i].value === want) {
        el.filterPlant.value = want;
        break;
      }
    }
    state.pendingTimelinePlant = null;
  }

  function syncViewBreadcrumb(items) {
    if (!IS_VIEW) return;
    var breadcrumbEl = $("growth-breadcrumb");
    if (!breadcrumbEl) return;
    breadcrumbEl.innerHTML = "";
    (items || []).forEach(function (item, index) {
      var li = document.createElement("li");
      var isCurrent = !!item.current || index === items.length - 1;
      if (item.href && !isCurrent) {
        var a = document.createElement("a");
        a.href = item.href;
        a.textContent = item.label;
        li.appendChild(a);
      } else {
        li.textContent = item.label;
        if (isCurrent) li.setAttribute("aria-current", "page");
      }
      breadcrumbEl.appendChild(li);
    });
  }

  function syncViewModeUi() {
    if (!IS_VIEW) return;
    state.viewLayout = "grid";
    if (el.feed) el.feed.hidden = false;
    if (el.plantTimeline) el.plantTimeline.hidden = true;
    var lead = $("growth-timeline-lead");
    if (lead) lead.hidden = true;
  }

  function findAreaById(areaId) {
    var wanted = areaId ? String(areaId).trim() : "";
    if (!wanted || !Array.isArray(state.areas)) return null;
    for (var i = 0; i < state.areas.length; i++) {
      if (state.areas[i] && state.areas[i].id === wanted) return state.areas[i];
    }
    return null;
  }

  function ensureViewContextActions() {
    var actionsEl = $("growth-context-actions");
    if (!actionsEl) {
      var leadEl = $("growth-home-lead");
      if (!leadEl || !leadEl.parentNode) {
        return {
          actionsEl: null,
          primaryEl: null,
          secondaryEl: null,
          tertiaryEl: null,
        };
      }
      actionsEl = document.createElement("p");
      actionsEl.id = "growth-context-actions";
      actionsEl.className = "plant-detail-actions home-context-actions";
      actionsEl.hidden = true;

      var primaryEl = document.createElement("a");
      primaryEl.id = "growth-context-primary";
      primaryEl.className = "plant-detail-cta";
      primaryEl.href = "./plants.html";
      actionsEl.appendChild(primaryEl);

      var secondaryEl = document.createElement("a");
      secondaryEl.id = "growth-context-secondary";
      secondaryEl.className = "plant-detail-cta";
      secondaryEl.href = "./growth-edit.html#plants";
      actionsEl.appendChild(secondaryEl);

      var tertiaryEl = document.createElement("a");
      tertiaryEl.id = "growth-context-tertiary";
      tertiaryEl.className = "plant-detail-cta";
      tertiaryEl.href = "./plant-edit.html";
      tertiaryEl.hidden = true;
      actionsEl.appendChild(tertiaryEl);

      if (leadEl.nextSibling) leadEl.parentNode.insertBefore(actionsEl, leadEl.nextSibling);
      else leadEl.parentNode.appendChild(actionsEl);
    }

    return {
      actionsEl: actionsEl,
      primaryEl: $("growth-context-primary"),
      secondaryEl: $("growth-context-secondary"),
      tertiaryEl: $("growth-context-tertiary"),
    };
  }

  function syncViewHomeContext() {
    if (!IS_VIEW) return;

    var titleEl = $("growth-home-title");
    var leadEl = $("growth-home-lead");
    var currentActionsEl = $("growth-context-actions");
    if (!titleEl && !leadEl && !currentActionsEl) return;

    var areaId = el.filterArea ? String(el.filterArea.value || "").trim() : "";
    var area = findAreaById(areaId);
    var quickEl = document.querySelector(".home-quick");

    if (currentActionsEl) currentActionsEl.hidden = true;
    var currentTertiaryEl = $("growth-context-tertiary");
    if (currentTertiaryEl) currentTertiaryEl.hidden = true;
    syncViewBreadcrumb([{ label: "植栽メモ", current: true }]);

    if (area) {
      var areaLinks = ensureViewContextActions();
      var areaActionsEl = areaLinks.actionsEl;
      var areaPrimaryEl = areaLinks.primaryEl;
      var areaSecondaryEl = areaLinks.secondaryEl;
      var areaTertiaryEl = areaLinks.tertiaryEl;
      if (quickEl) quickEl.hidden = true;
      if (areaActionsEl) areaActionsEl.hidden = false;
      syncViewBreadcrumb([
        { label: "植栽メモ", href: "./index.html" },
        { label: "エリア一覧", href: "./areas.html" },
        { label: area.label + "の記録一覧", current: true },
      ]);
      if (titleEl) titleEl.textContent = area.label + "の記録一覧";
      if (leadEl) {
        setLeadTextKeepingButton(
          leadEl,
          "「" + area.label + "」の記録を一覧で見ています。必要に応じて、そのエリアの概要や写真も確認できます。"
        );
      }
      if (areaPrimaryEl) {
        areaPrimaryEl.href = "./area.html?area=" + encodeURIComponent(area.id);
        areaPrimaryEl.textContent = "このエリアを見る";
      }
      if (areaSecondaryEl) {
        areaSecondaryEl.href = "./area-edit.html?area=" + encodeURIComponent(area.id);
        areaSecondaryEl.textContent = "このエリアの説明と活動報告を編集";
      }
      if (areaTertiaryEl) {
        areaTertiaryEl.hidden = false;
        areaTertiaryEl.href = "./growth-edit.html?area=" + encodeURIComponent(area.id);
        areaTertiaryEl.textContent = "このエリアの活動報告を追加・編集";
      }
      document.title = "植栽メモ — " + area.label + "の記録一覧";
      return;
    }

    if (quickEl) quickEl.hidden = false;
    if (currentActionsEl && currentActionsEl.parentNode) {
      currentActionsEl.parentNode.removeChild(currentActionsEl);
    }
    if (titleEl) titleEl.textContent = "植栽メモ";
    if (leadEl) {
      setLeadTextKeepingButton(
        leadEl,
        "まずはエリアや植栽から見て、必要に応じて活動報告や一覧を直せる入口です。"
      );
    }
    document.title = "植栽メモ";
  }

  function setLeadTextKeepingButton(node, text) {
    if (!node) return;
    var btn = node.querySelector("button");
    node.textContent = text;
    if (btn) {
      node.appendChild(document.createTextNode(" "));
      node.appendChild(btn);
    }
  }

  function renderPlantTimeline(records) {
    if (!el.plantTimeline) return;
    el.plantTimeline.innerHTML = "";
    syncViewHomeContext();

    var plant = el.filterPlant ? el.filterPlant.value : "";
    var fa = el.filterArea ? el.filterArea.value : "";

    if (!plant) {
      var hint = document.createElement("p");
      hint.className = "growth-hint";
      hint.textContent =
        "表示する植栽を選ぶと、その植栽が含まれる記録を一覧にします。記録日の並びは「並び順」で新しい順／古い順を選べます。エリアの絞り込みも使えます。";
      el.plantTimeline.appendChild(hint);
      return;
    }

    var filtered = (records || []).filter(function (r) {
      if (fa && r.areaId !== fa) return false;
      if (!r.plants || r.plants.indexOf(plant) === -1) return false;
      return true;
    });

    sortFilteredGrowthRecords(filtered);

    if (filtered.length === 0) {
      var empty = document.createElement("p");
      empty.className = "growth-hint";
      empty.textContent = "この条件の記録がありません。";
      el.plantTimeline.appendChild(empty);
      return;
    }

    var ul = document.createElement("ol");
    ul.className = "growth-plant-timeline-list";
    filtered.forEach(function (r) {
      var li = document.createElement("li");
      li.className = "growth-plant-timeline-item";
      var dateEl = document.createElement("time");
      dateEl.className = "growth-plant-timeline-date";
      dateEl.setAttribute("datetime", r.recordedAt || "");
      dateEl.textContent = (r.recordedAt || "").slice(0, 10);
      var inner = document.createElement("div");
      inner.className = "growth-plant-timeline-card-wrap";
      inner.appendChild(createGrowthCardArticle(r, { inTimeline: true }));
      li.appendChild(dateEl);
      li.appendChild(inner);
      ul.appendChild(li);
    });
    el.plantTimeline.appendChild(ul);
  }

  function renderViewMain(records) {
    if (!IS_VIEW) return;
    state.lastGrowthRecords = records || [];
    state.viewLayout = "grid";
    updateFilterPlantOptions();
    syncViewModeUi();
    syncViewHomeContext();
    if (el.plantTimeline) el.plantTimeline.innerHTML = "";
    renderFeed(state.lastGrowthRecords);
  }

  function renderFeed(records) {
    if (!el.feed) return;
    var sourceRecords = Array.isArray(records) ? records : [];
    if (!IS_VIEW) {
      state.lastGrowthRecords = sourceRecords.slice();
    }

    var filtered = getFilteredEditRecords(sourceRecords);

    sortFilteredGrowthRecords(filtered);

    el.feed.innerHTML = "";
    syncBulkMissingCommentsAiButton(filtered);

    if (filtered.length === 0) {
      var empty = document.createElement("p");
      empty.className = "growth-hint";
      empty.textContent =
        el.filterCommentState && el.filterCommentState.value
          ? "この条件に合う記録はありません。"
          : "該当する記録がありません。";
      el.feed.appendChild(empty);
      return;
    }

    filtered.forEach(function (r) {
      el.feed.appendChild(
        createGrowthCardArticle(r, {
          suppressBrowseActions: true,
          uniformThumb: true,
        })
      );
    });
  }

  function loadGrowthSnapshot() {
    if (!IS_VIEW) return Promise.resolve(null);

    function snapshotFromBoot() {
      var b = window.__PLANTING_GROWTH_SNAPSHOT__;
      if (b && Array.isArray(b.records)) {
        return b;
      }
      return null;
    }

    if (location.protocol === "file:") {
      var fromFile = snapshotFromBoot();
      if (fromFile) {
        return Promise.resolve(fromFile);
      }
      return fetch(GROWTH_SNAPSHOT_JSON, { cache: "no-store" })
        .then(function (res) {
          if (!res.ok) return null;
          return res.json();
        })
        .then(function (data) {
          if (!data || !Array.isArray(data.records)) return null;
          return data;
        })
        .catch(function () {
          return null;
        });
    }

    return fetch(GROWTH_SNAPSHOT_JSON, { cache: "no-store" })
      .then(function (res) {
        if (res.ok) return res.json();
        return null;
      })
      .then(function (data) {
        if (data && Array.isArray(data.records)) return data;
        return snapshotFromBoot();
      })
      .catch(function () {
        return snapshotFromBoot();
      });
  }

  function tryRenderViewFromSnapshot(apiFailMessage) {
    return loadGrowthSnapshot().then(function (snap) {
      if (snap && snap.records && snap.records.length) {
        updateCloudStatus(
          apiFailMessage +
            " 代わりに data/growth-snapshot.json（file:// では growth-snapshot.boot.js）を表示しています。写真は data/growth-images または URL から読み込みます。更新は npm run sync:prod（README 参照）。"
        );
        renderViewMain(snap.records);
      } else {
        updateCloudStatus(apiFailMessage);
        renderViewMain([]);
      }
    });
  }

  function refreshFeed() {
    updateCloudStatus("一覧を取得中…");
    return fetch(API_GROWTH, { headers: cloudHeaders(false) })
      .then(function (res) {
        if (res.status === 404) {
          if (IS_VIEW) {
            return tryRenderViewFromSnapshot(
              "サーバーに接続できません。インターネット上のサイトのURLで開いているか確認してください。"
            );
          }
          updateCloudStatus(
            "サーバーに接続できません。インターネット上のサイトのURLで開いているか確認してください。"
          );
          if (el.feed) renderFeed([]);
          return null;
        }
        if (!res.ok) {
          if (IS_VIEW) {
            return tryRenderViewFromSnapshot(
              "一覧の取得に失敗しました（" + res.status + "）。"
            );
          }
          updateCloudStatus("一覧の取得に失敗しました（" + res.status + "）。");
          if (el.feed) renderFeed([]);
          return null;
        }
        return res.json();
      })
      .then(function (data) {
        if (data === null || data === undefined) return;
        if (IS_VIEW) {
          updateCloudStatus(
            "記録と写真を表示できています。追加・編集・削除は「活動報告・一覧の修正」から行ってください。"
          );
        } else {
          updateCloudStatus(
            "記録と写真を表示できています。新規の投稿・編集・削除や植栽名のサーバー保存には、サイトでトークンが設定されている場合のみ、下の欄への入力が必要です。"
          );
        }
        if (IS_VIEW) renderViewMain(data.records || []);
        else if (el.feed) renderFeed(data.records || []);
      })
      .catch(function () {
        if (IS_VIEW) {
          return tryRenderViewFromSnapshot("ネットワークエラーで一覧を取得できませんでした。");
        }
        updateCloudStatus("ネットワークエラーで一覧を取得できませんでした。");
        if (el.feed) renderFeed([]);
      });
  }

  function dataUrlToBase64Part(dataUrl) {
    var comma = dataUrl.indexOf(",");
    return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  }

  function buildImagesBase64Payload() {
    var q = state.photoQueue;
    if (!q.length) return Promise.resolve([]);
    return Promise.all(
      q.map(function (item) {
        return buildPhotoQueueItemBase64(item);
      })
    ).then(function (parts) {
      var nonNull = parts.filter(Boolean);
      var totalBytes = 0;
      for (var i = 0; i < nonNull.length; i++) {
        var b64 = nonNull[i];
        totalBytes += Math.floor((b64.length * 3) / 4);
      }
      if (totalBytes > MAX_TOTAL_UPLOAD_BYTES) {
        throw new Error(
          "写真の合計サイズが大きすぎます。枚数を減らすか、画像を小さくして再試行してください。"
        );
      }
      return nonNull;
    });
  }

  function onSubmit(e) {
    e.preventDefault();
    var submitter = e && e.submitter ? e.submitter : null;
    var editing = state.editRecord;
    var wasEdit = !!editing;
    var continueInSameArea = !wasEdit && submitter && submitter.id === "growth-submit-next";
    var areaId = el.area.value;
    var area = state.areas.find(function (a) {
      return a.id === areaId;
    });
    var plants = getSelectedPlants();
    if (plants.length === 0) {
      showToast("植栽を1つ以上選ぶか、「その他」に名前を入力してください", true);
      return;
    }

    var note = el.form.querySelector('[name="note"]');
    var noteVal = note ? note.value.trim() : "";

    var dateInput = el.form.querySelector('[name="date"]');
    var dateVal = dateInput ? dateInput.value : "";
    if (!dateVal) {
      showToast("日付を入力してください", true);
      return;
    }

    el.submit.disabled = true;
    if (el.submitNext) el.submitNext.disabled = true;

    var id = editing ? editing.id : uuid();
    var recordedAt = dateVal + "T12:00:00.000Z";
    var createdAt =
      editing && editing.createdAt ? editing.createdAt : new Date().toISOString();

    var basePayload = {
      id: id,
      recordedAt: recordedAt,
      areaId: areaId,
      areaLabel: area ? area.label : areaId,
      plants: plants,
      note: noteVal,
      createdAt: createdAt,
    };

    function imageMemosPayload() {
      return state.photoQueue.map(function (it) {
        return it.memo != null ? String(it.memo) : "";
      });
    }

    var aiCommentTargets = collectPendingPhotoAiTargets();

    var attachImagesPromise;
    if (!wasEdit && state.photoQueue.length > 0) {
      attachImagesPromise = buildImagesBase64Payload().then(function (arr) {
        var payload = Object.assign({}, basePayload);
        payload.imagesBase64 = arr;
        payload.imageMemos = imageMemosPayload();
        return payload;
      });
    } else if (wasEdit && state.photosTouched) {
      attachImagesPromise = buildImagesBase64Payload().then(function (arr) {
        var payload = Object.assign({}, basePayload);
        payload.imagesBase64 = arr;
        payload.imageMemos = imageMemosPayload();
        return payload;
      });
    } else {
      var baseOnly = Object.assign({}, basePayload);
      if (state.photoQueue.length > 0) {
        baseOnly.imageMemos = imageMemosPayload();
      }
      attachImagesPromise = Promise.resolve(baseOnly);
    }

    attachImagesPromise
      .then(function (payload) {
        if (aiCommentTargets.length) {
          payload.aiCommentTargets = aiCommentTargets.slice();
        }
        return fetch(API_GROWTH, {
          method: "POST",
          headers: cloudHeaders(true),
          body: JSON.stringify(payload),
        }).then(function (res) {
          if (res.status === 401) {
            throw new Error("トークンが違います。サイト管理者が設定した文字列と同じか確認してください。");
          }
          if (res.status === 413) {
            throw new Error(
              "送るデータが大きすぎて拒否されました。写真を別の画像に変えるか、スマホのカメラ設定で解像度を下げてから試してください。"
            );
          }
          if (res.status === 503) {
            return apiErrorMessage(
              res,
              "サーバー側のデータ保存先に問題があるか、設定が足りない可能性があります"
            ).then(function (msg) {
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
      })
      .then(function (saveResult) {
        var saveMessage = wasEdit ? "更新しました" : "保存しました";
        if (continueInSameArea) {
          saveMessage += " 同じエリアで続けて投稿できます。";
        }
        var saveJob = saveResult && saveResult.record ? readRecordAiCommentJob(saveResult.record) : null;
        if (saveResult && saveResult.aiCommentsQueued) {
          saveMessage += " AIコメントはサーバー側でバックグラウンド更新中です。保存後は画面を離れても大丈夫です。";
        } else if (saveJob && saveJob.status === "failed" && saveJob.detail) {
          saveMessage += " " + growthAiJobStatusMessage(saveJob);
        } else if (saveResult && saveResult.aiCommentTargetCount) {
          saveMessage += " AIコメントの更新予約は作成しましたが、サーバー側で開始できませんでした。";
        }
        showToast(saveMessage);
        loadChangeLog().catch(function () {});
        var loadPackPromise = loadPlantsData().catch(function () {
          return null;
        });
        if (saveResult && saveResult.record && aiCommentTargets.length) {
          return runAiRefreshAfterSaveByPolling(saveResult.record, aiCommentTargets)
            .catch(function (err) {
              showToast(err && err.message ? err.message : "AIコメントの更新に失敗しました", true);
              return {};
            })
            .then(function (refreshResult) {
              return loadPackPromise.then(function (pack) {
                return { pack: pack, refreshResult: refreshResult || null };
              });
            });
        }
        return loadPackPromise.then(function (pack) {
          return { pack: pack, refreshResult: null };
        });
      })
      .then(function (result) {
        var pack = result && result.pack ? result.pack : null;
        if (pack) {
          state.areas = pack.areas || [];
          state.plantsBaseline = JSON.parse(JSON.stringify(state.areas));
          state.plantsSource = pack.source;
        }
        populateAreaSelects();
        renderPlantsCatalogEditor();
        updatePlantsCatalogSourceLabel();
        if (continueInSameArea) {
          prepareNextRecordInSameArea(areaId, dateVal);
        } else if (result && result.refreshResult && result.refreshResult.record) {
          startEdit(result.refreshResult.record);
        } else {
          clearEditMode();
          if (dateInput) dateInput.value = todayInputValue();
          renderPlantChecks(el.area.value);
          updateFilterPlantOptions();
        }
        if (el.feed) return refreshFeed();
      })
      .catch(function (err) {
        showToast(err && err.message ? err.message : "保存に失敗しました", true);
      })
      .finally(function () {
        el.submit.disabled = false;
        if (el.submitNext) el.submitNext.disabled = false;
      });
  }

  function todayInputValue() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + m + "-" + day;
  }

  function onExport() {
    fetch(API_GROWTH, { headers: cloudHeaders(false) })
      .then(function (res) {
        if (!res.ok) throw new Error("取得に失敗しました");
        return res.json();
      })
      .then(function (data) {
        var json = JSON.stringify(
          {
            version: 2,
            source: "vercel",
            exportedAt: new Date().toISOString(),
            records: data.records || [],
          },
          null,
          2
        );
        var blob = new Blob([json], { type: "application/json" });
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "planting-growth-backup.json";
        a.click();
        URL.revokeObjectURL(a.href);
        showToast("エクスポートしました（画像はリンクのまま含まれます）");
      })
      .catch(function (err) {
        showToast(err && err.message ? err.message : "エクスポートに失敗しました", true);
      });
  }

  function onCloudTokenSave() {
    if (!el.cloudToken) return;
    var v = el.cloudToken.value.trim();
    if (common.saveCloudToken) common.saveCloudToken(v, LS_CLOUD_TOKEN);
    else if (v) localStorage.setItem(LS_CLOUD_TOKEN, v);
    else localStorage.removeItem(LS_CLOUD_TOKEN);
    showToast(v ? "アップロード用トークンを保存しました。" : "アップロード用トークンを削除しました。");
    loadChangeLog().catch(function () {});
    if (el.feed) refreshFeed();
  }

  function onDeleteRecord() {
    if (!state.editRecord || !el.deleteRecordBtn) return;
    if (
      !confirmIrreversibleAction({
        subject: "この記録",
        action: "をアーカイブします。",
        detail: "サーバー上には残したまま、一覧から非表示にします。",
        question: "本当にアーカイブしますか？",
      })
    ) {
      return;
    }
    var id = state.editRecord.id;
    el.deleteRecordBtn.disabled = true;
    fetch(API_GROWTH + "?id=" + encodeURIComponent(id), {
      method: "DELETE",
      headers: cloudHeaders(false),
    })
      .then(function (res) {
        if (res.status === 401) {
          throw new Error("トークンが必要です。上の欄に正しい文字列を入れて保存してください。");
        }
        if (!res.ok) throw new Error("アーカイブに失敗しました");
        showToast("アーカイブしました");
        loadChangeLog().catch(function () {});
        clearEditMode();
        if (el.date) el.date.value = todayInputValue();
        populateAreaSelects();
        renderPlantChecks(el.area ? el.area.value : "");
        updateFilterPlantOptions();
        if (el.feed) return refreshFeed();
      })
      .catch(function (err) {
        showToast(err && err.message ? err.message : "アーカイブに失敗しました", true);
      })
      .finally(function () {
        el.deleteRecordBtn.disabled = false;
      });
  }

  function applyThumbFeedClass() {
    var v = localStorage.getItem(LS_THUMB_SIZE) || "sm";
    if (v !== "md" && v !== "lg") v = "sm";
    if (el.feed) {
      el.feed.classList.remove(
        "growth-feed--thumb-sm",
        "growth-feed--thumb-md",
        "growth-feed--thumb-lg"
      );
      el.feed.classList.add("growth-feed--thumb-" + v);
    }
    if (el.plantTimeline) {
      el.plantTimeline.classList.remove(
        "growth-feed--thumb-sm",
        "growth-feed--thumb-md",
        "growth-feed--thumb-lg"
      );
      el.plantTimeline.classList.add("growth-feed--thumb-" + v);
    }
    if (el.thumbSize && el.thumbSize.value !== v) el.thumbSize.value = v;
  }

  function simplifyViewHomeLayout() {
    if (!IS_VIEW) return;
    var main = document.querySelector("main.growth-panel");
    if (!main) return;

    var header = main.querySelector("header.page-header");
    var quick = main.querySelector(".home-quick");
    if (header && !quick) {
      quick = document.createElement("section");
      quick.className = "growth-section home-quick";
      quick.setAttribute("aria-labelledby", "home-quick-heading");
      quick.innerHTML =
        '<h2 id="home-quick-heading">やりたいことから選ぶ</h2>' +
        '<div class="home-quick-grid">' +
        '<a class="card growthlog" href="./areas.html"><span class="card-label">閲覧</span><h2>エリアから見る</h2><p>各エリアの説明と活動報告を見ます。</p><span class="open">開く</span></a>' +
        '<a class="card growthlog" href="./plants.html"><span class="card-label">閲覧</span><h2>植栽から見る</h2><p>植栽名とエリアの対応から探します。</p><span class="open">開く</span></a>' +
        '<a class="card growthlog" href="./growth-edit.html"><span class="card-label">活動報告</span><h2>活動報告を書く・直す</h2><p>今日の投稿や過去の写真コメントを編集します。</p><span class="open">開く</span></a>' +
        '<a class="card growthlog" href="./growth-edit.html#areas"><span class="card-label">一覧修正</span><h2>エリア一覧を直す</h2><p>エリア名やエリアIDを整理します。</p><span class="open">開く</span></a>' +
        '<a class="card growthlog" href="./growth-edit.html#plants"><span class="card-label">一覧修正</span><h2>植栽一覧を直す</h2><p>植栽名の表記や並びを直します。</p><span class="open">開く</span></a>' +
        '<a class="card growthlog" href="./sitemap.html"><span class="card-label">案内</span><h2>ページの役割を確認する</h2><p>どこで何をするかを一覧で確認します。</p><span class="open">開く</span></a>' +
        "</div>";
      if (header.nextSibling) main.insertBefore(quick, header.nextSibling);
      else main.appendChild(quick);
    }

    var listSection = main.querySelector('section[aria-labelledby="list-heading"]');
    if (listSection) {
      var mode = listSection.querySelector(".growth-view-mode");
      var filters = listSection.querySelector(".growth-filters");
      if (mode && filters && !mode.closest("details.home-advanced-controls")) {
        var details = document.createElement("details");
        details.className = "home-advanced-controls";
        var summary = document.createElement("summary");
        summary.textContent = "表示設定・絞り込み";
        details.appendChild(summary);
        listSection.insertBefore(details, mode);
        details.appendChild(mode);
        details.appendChild(filters);
      }
    }
  }

  function initViewPage() {
    simplifyViewHomeLayout();
    el.toast = $("growth-toast");
    el.filterArea = $("filter-area");
    el.filterPlant = $("filter-plant");
    el.filterCommentState = $("filter-comment-state");
    el.feed = $("growth-feed");
    el.exportBtn = $("export-btn");
    el.viewStatus = $("growth-view-status");
    el.thumbSize = $("growth-thumb-size");
    el.feedSort = $("growth-feed-sort");
    el.viewModeGridRadio = $("growth-view-mode-grid");
    el.viewModeTimelineRadio = $("growth-view-mode-timeline");
    el.plantTimeline = $("growth-plant-timeline");

    if (!el.feed) return;

    var urlParams = new URLSearchParams(window.location.search);
    if (redirectLegacyGrowthView(urlParams)) return;
    state.viewLayout = "grid";

    if (el.thumbSize) {
      var saved = localStorage.getItem(LS_THUMB_SIZE) || "sm";
      if (saved === "sm" || saved === "md" || saved === "lg") {
        el.thumbSize.value = saved;
      }
      el.thumbSize.addEventListener("change", function () {
        localStorage.setItem(LS_THUMB_SIZE, el.thumbSize.value);
        applyThumbFeedClass();
      });
    }
    var sortSaved = "newest";
    try {
      var ssv = localStorage.getItem(LS_FEED_SORT);
      if (ssv === "newest" || ssv === "oldest") sortSaved = ssv;
    } catch (eSort) {}
    state.feedSortOrder = sortSaved;
    if (el.feedSort) {
      el.feedSort.value = sortSaved;
      el.feedSort.addEventListener("change", function () {
        state.feedSortOrder = el.feedSort.value === "oldest" ? "oldest" : "newest";
        try {
          localStorage.setItem(LS_FEED_SORT, state.feedSortOrder);
        } catch (eSort2) {}
        renderViewMain(state.lastGrowthRecords);
      });
    }
    applyThumbFeedClass();
    syncViewModeUi();

    loadPlantsData()
      .then(function (pack) {
        state.areas = pack.areas || [];
        populateAreaSelects();
        if (applyViewQueryFilters()) return;
        syncViewHomeContext();
        return refreshFeed();
      })
      .catch(function (err) {
        showToast(err && err.message ? err.message : "初期化に失敗しました", true);
      });

    if (el.filterArea) {
      el.filterArea.addEventListener("change", function () {
        if (el.filterPlant) el.filterPlant.value = "";
        updateFilterPlantOptions();
        refreshFeed();
      });
    }

    if (el.filterPlant) {
      el.filterPlant.addEventListener("change", function () {
        refreshFeed();
      });
    }
    if (el.filterCommentState) {
      el.filterCommentState.addEventListener("change", function () {
        refreshFeed();
      });
    }

    window.addEventListener("popstate", function () {
      if (!IS_VIEW || !el.filterArea) return;
      applyGrowthViewFromLocationSearch();
    });

    if (el.exportBtn) el.exportBtn.addEventListener("click", onExport);
  }

  function initGrowthEditTabs() {
    var main = document.querySelector("main.growth-panel");
    if (
      !main ||
      !el.growthTabBtnRecord ||
      !el.growthTabBtnAreas ||
      !el.growthTabBtnPlants ||
      !el.growthTabPanelRecord ||
      !el.growthTabPanelMaster
    ) {
      return;
    }

    function setTab(tab) {
      var isRecord = tab === "record";
      var isAreas = tab === "areas";
      var isPlants = tab === "plants";
      var isMaster = isAreas || isPlants;

      if (isMaster) {
        main.dataset.growthEditTab = tab;
      } else {
        delete main.dataset.growthEditTab;
      }

      el.growthTabPanelRecord.hidden = !isRecord;
      el.growthTabPanelMaster.hidden = !isMaster;

      el.growthTabBtnRecord.setAttribute("aria-selected", isRecord ? "true" : "false");
      el.growthTabBtnRecord.tabIndex = isRecord ? 0 : -1;

      el.growthTabBtnAreas.setAttribute("aria-selected", isAreas ? "true" : "false");
      el.growthTabBtnAreas.tabIndex = isAreas ? 0 : -1;

      el.growthTabBtnPlants.setAttribute("aria-selected", isPlants ? "true" : "false");
      el.growthTabBtnPlants.tabIndex = isPlants ? 0 : -1;

      if (isMaster) {
        el.growthTabPanelMaster.setAttribute(
          "aria-labelledby",
          isPlants ? "growth-tab-btn-plants" : "growth-tab-btn-areas"
        );
      }

      try {
        var path = window.location.pathname + window.location.search;
        if (isMaster) {
          history.replaceState(null, "", path + "#" + tab);
        } else {
          history.replaceState(null, "", path);
        }
      } catch (e2) {}
    }

    el.growthTabBtnRecord.addEventListener("click", function () {
      setTab("record");
    });
    el.growthTabBtnAreas.addEventListener("click", function () {
      setTab("areas");
    });
    el.growthTabBtnPlants.addEventListener("click", function () {
      setTab("plants");
    });

    window.addEventListener("hashchange", function () {
      var h = (window.location.hash || "").replace(/^#/, "");
      if (h === "areas" || h === "plants") setTab(h);
      else if (h === "record") setTab("record");
    });

    el._setGrowthEditTab = setTab;

    var h0 = (window.location.hash || "").replace(/^#/, "");
    if (h0 === "areas" || h0 === "plants") {
      setTab(h0);
    } else {
      setTab("record");
    }
  }

  function initEditPage() {
    el.form = $("growth-form");
    el.date = $("field-date");
    el.area = $("field-area");
    el.plantChecks = $("plant-checks");
    el.customPlant = $("field-custom-plant");
    el.submitNext = $("growth-submit-next");
    el.photoCamera = $("field-photo-camera");
    el.photoLibrary = $("field-photo-library");
    el.photoStatus = $("field-photo-status");
    el.photoClear = $("photo-clear");
    el.photoAiGenerate = $("photo-ai-generate");
    el.photoAiStatus = $("photo-ai-status");
    el.bulkMissingCommentsAiBtn = $("bulk-missing-comments-ai");
    el.bulkMissingCommentsAiStatus = $("bulk-missing-comments-ai-status");
    el.photoQueueEl = $("growth-photo-queue");
    el.photoQueueEmpty = $("growth-photo-queue-empty");
    el.submit = $("growth-submit");
    el.toast = $("growth-toast");
    el.filterArea = $("filter-area");
    el.filterPlant = $("filter-plant");
    el.filterCommentState = $("filter-comment-state");
    el.feed = $("growth-feed");
    el.exportBtn = $("export-btn");
    el.cloudToken = $("cloud-token");
    el.cloudTokenSave = $("cloud-token-save");
    el.cloudStatus = $("cloud-status");
    el.changeLogStatus = $("change-log-status");
    el.changeLogList = $("change-log-list");
    el.changeLogReload = $("change-log-reload");
    el.newHeading = $("new-heading");
    el.editBanner = $("growth-edit-banner");
    el.editCancel = $("growth-edit-cancel");
    el.plantsCatalogSource = $("plants-catalog-source");
    el.plantsCatalogEditor = $("plants-catalog-editor");
    el.plantsCatalogReload = $("plants-catalog-reload");
    el.plantsCatalogAddArea = $("plants-catalog-add-area");
    el.plantsCatalogSave = $("plants-catalog-save");
    el.plantsRecordRenameArea = $("plants-record-rename-area");
    el.plantsRecordRenameFrom = $("plants-record-rename-from");
    el.plantsRecordRenameTo = $("plants-record-rename-to");
    el.deleteRecordBtn = $("growth-delete-record");
    el.growthTabBtnRecord = $("growth-tab-btn-record");
    el.growthTabBtnAreas = $("growth-tab-btn-areas");
    el.growthTabBtnPlants = $("growth-tab-btn-plants");
    el.growthTabPanelRecord = $("growth-tab-panel-record");
    el.growthTabPanelMaster = $("growth-tab-panel-master");
    el.sequenceGuide = $("growth-sequence-guide");
    el.sequenceArea = $("growth-sequence-area");
    el.sequencePlants = $("growth-sequence-plants");
    el.sequenceClear = $("growth-sequence-clear");

    if (!el.form || !el.area) return;

    initGrowthEditTabs();

    syncEditFormUI();
    if (el.editCancel) {
      el.editCancel.addEventListener("click", function () {
        if (!state.editRecord) return;
        if (!confirm("編集をやめて入力内容を破棄しますか？")) return;
        clearEditMode();
        showToast("編集を取り消しました");
      });
    }

    if (common.applyStoredCloudToken) common.applyStoredCloudToken(el.cloudToken, LS_CLOUD_TOKEN);
    else {
      var tokenStored = currentCloudToken();
      if (el.cloudToken && tokenStored) el.cloudToken.value = tokenStored;
    }

    if (el.cloudTokenSave) el.cloudTokenSave.addEventListener("click", onCloudTokenSave);

    if (el.plantsCatalogReload) {
      el.plantsCatalogReload.addEventListener("click", reloadPlantsCatalogUi);
    }
    if (el.changeLogReload) {
      el.changeLogReload.addEventListener("click", function () {
        loadChangeLog().catch(function () {});
      });
    }
    if (el.bulkMissingCommentsAiBtn) {
      el.bulkMissingCommentsAiBtn.addEventListener("click", function () {
        runBulkMissingCommentsAiRefresh();
      });
    }
    if (el.plantsCatalogAddArea && el.plantsCatalogEditor) {
      el.plantsCatalogAddArea.addEventListener("click", function () {
        el.plantsCatalogEditor.appendChild(
          makeCatalogAreaBlock({ id: "", label: "", plants: [] }, "")
        );
      });
    }
    if (el.plantsCatalogSave) {
      el.plantsCatalogSave.addEventListener("click", savePlantsCatalog);
    }

    if (el.deleteRecordBtn) {
      el.deleteRecordBtn.addEventListener("click", onDeleteRecord);
    }

    loadPlantsData()
      .then(function (pack) {
        state.areas = pack.areas || [];
        state.plantsSource = pack.source;
        state.plantsBaseline = JSON.parse(JSON.stringify(state.areas));
        populateAreaSelects();
        renderPlantsCatalogEditor();
        updatePlantsCatalogSourceLabel();
        syncEditPageContext();
        var q = new URLSearchParams(window.location.search);
        var idParam = q.get("id");
        var photoParam = q.get("photo");
        if (photoParam != null && photoParam !== "") {
          var parsedPhotoIndex = parseInt(String(photoParam), 10);
          state.pendingEditPhotoIndex = isNaN(parsedPhotoIndex) || parsedPhotoIndex < 0 ? null : parsedPhotoIndex;
        } else {
          state.pendingEditPhotoIndex = null;
        }
        if (idParam) {
          if (el._setGrowthEditTab) el._setGrowthEditTab("record");
          return fetchRecordByIdAndEdit(idParam);
        }
        if (q.get("area") || q.get("plant")) {
          if (el._setGrowthEditTab) el._setGrowthEditTab("record");
          applyQueryPrefill();
        }
        if (!el.plantChecks || el.plantChecks.childElementCount === 0) {
          renderPlantChecks(el.area.value);
          updateFilterPlantOptions();
        }
        renderSequentialComposerGuide();
        syncBulkMissingCommentsAiButton();
        if (el.date) el.date.value = todayInputValue();
        loadChangeLog().catch(function () {});
        if (el.feed) refreshFeed();
      })
      .catch(function (err) {
        showToast(err && err.message ? err.message : "初期化に失敗しました", true);
      });

    el.area.addEventListener("change", function () {
      renderPlantChecks(el.area.value);
      if (state.editRecord && state.editRecord.plants) {
        applyPlantsToForm(state.editRecord.plants, el.area.value);
      }
      updateFilterPlantOptions();
      syncEditPageContext(state.editRecord);
      renderSequentialComposerGuide();
    });

    if (el.plantChecks) {
      el.plantChecks.addEventListener("change", function () {
        renderSequentialComposerGuide();
      });
    }

    if (el.customPlant) {
      el.customPlant.addEventListener("input", function () {
        renderSequentialComposerGuide();
      });
    }

    if (el.sequenceClear) {
      el.sequenceClear.addEventListener("click", function () {
        clearComposerPlantSelection();
      });
    }

    if (el.filterArea) {
      el.filterArea.addEventListener("change", function () {
        if (el.filterPlant) el.filterPlant.value = "";
        updateFilterPlantOptions();
        refreshFeed();
      });
    }

    if (el.filterPlant) {
      el.filterPlant.addEventListener("change", function () {
        refreshFeed();
      });
    }

    if (el.filterCommentState) {
      el.filterCommentState.addEventListener("change", function () {
        refreshFeed();
      });
    }

    el.form.addEventListener("submit", onSubmit);

    if (el.photoCamera) {
      el.photoCamera.addEventListener("change", function () {
        onPhotoInputChange("camera");
      });
    }
    if (el.photoLibrary) {
      el.photoLibrary.addEventListener("change", function () {
        onPhotoInputChange("library");
      });
    }

    if (el.photoClear) {
      el.photoClear.addEventListener("click", function () {
        clearPhotoQueueCompletely();
        clearPhotoInputs();
      });
    }

    if (el.photoAiGenerate) {
      el.photoAiGenerate.addEventListener("click", function () {
        generateAiCommentsForEmptyPhotos();
      });
    }

    if (el.form && el.form.elements && el.form.elements.note) {
      el.form.elements.note.addEventListener("input", function () {
        markPhotosForAiRefreshFromNoteChange();
      });
    }

    renderPhotoQueueUi();

    if (el.exportBtn) el.exportBtn.addEventListener("click", onExport);
  }

  function init() {
    if (IS_VIEW) {
      initViewPage();
      return;
    }
    initEditPage();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
