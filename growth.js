(function () {
  "use strict";

  var PAGE =
    (document.documentElement.getAttribute("data-growth-page") ||
      document.body.getAttribute("data-growth-page") ||
      "edit").toLowerCase();
  var IS_VIEW = PAGE === "view";

  var LS_CLOUD_TOKEN = "growthCloudToken";
  var LS_THUMB_SIZE = "growthThumbSize";
  var API_GROWTH = "/api/growth";
  var API_GROWTH_IMAGE = "/api/growth-image";
  var API_PLANTS = "/api/plants";
  var MAX_IMAGE_WIDTH = 1024;
  var JPEG_QUALITY = 0.76;

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
  };

  var el = {
    form: null,
    date: null,
    area: null,
    plantChecks: null,
    customPlant: null,
    photoCamera: null,
    photoLibrary: null,
    photoStatus: null,
    photoClear: null,
    submit: null,
    toast: null,
    filterArea: null,
    filterPlant: null,
    feed: null,
    exportBtn: null,
    cloudToken: null,
    cloudTokenSave: null,
    cloudStatus: null,
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
    viewModeGridRadio: null,
    viewModeTimelineRadio: null,
    plantTimeline: null,
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

  function cloudHeaders(jsonBody) {
    var h = { Accept: "application/json" };
    if (jsonBody) h["Content-Type"] = "application/json";
    var t = localStorage.getItem(LS_CLOUD_TOKEN);
    if (t) h["x-growth-token"] = t;
    return h;
  }

  function growthImageSrc(r) {
    if (r.imagePathname) {
      return API_GROWTH_IMAGE + "?pathname=" + encodeURIComponent(r.imagePathname);
    }
    return r.imageUrl || null;
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

  function updateCloudStatus(text) {
    if (el.viewStatus) el.viewStatus.textContent = text || "";
    if (el.cloudStatus) el.cloudStatus.textContent = text || "";
  }

  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return "id-" + Date.now() + "-" + Math.random().toString(16).slice(2);
  }

  function loadImageFile(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error("画像を読み込めませんでした"));
      };
      img.src = url;
    });
  }

  function imageToJpegBlob(img) {
    var w = img.naturalWidth;
    var h = img.naturalHeight;
    if (!w || !h) throw new Error("画像サイズが無効です");

    var scale = w > MAX_IMAGE_WIDTH ? MAX_IMAGE_WIDTH / w : 1;
    var cw = Math.round(w * scale);
    var ch = Math.round(h * scale);

    var canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    var ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, cw, ch);

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
  }

  function getPhotoFile() {
    if (el.photoCamera && el.photoCamera.files && el.photoCamera.files[0]) {
      return el.photoCamera.files[0];
    }
    if (el.photoLibrary && el.photoLibrary.files && el.photoLibrary.files[0]) {
      return el.photoLibrary.files[0];
    }
    return null;
  }

  function updatePhotoStatusFromInputs() {
    if (!el.photoStatus) return;
    var f = getPhotoFile();
    if (f) {
      el.photoStatus.textContent = "選択中: " + (f.name || "画像");
      el.photoStatus.hidden = false;
    } else {
      el.photoStatus.textContent = "";
      el.photoStatus.hidden = true;
    }
  }

  function clearPhotoInputs() {
    if (el.photoCamera) el.photoCamera.value = "";
    if (el.photoLibrary) el.photoLibrary.value = "";
    updatePhotoStatusFromInputs();
  }

  function onPhotoInputChange(source) {
    if (source === "camera") {
      if (
        el.photoCamera &&
        el.photoCamera.files &&
        el.photoCamera.files[0] &&
        el.photoLibrary
      ) {
        el.photoLibrary.value = "";
      }
    } else if (source === "library") {
      if (
        el.photoLibrary &&
        el.photoLibrary.files &&
        el.photoLibrary.files[0] &&
        el.photoCamera
      ) {
        el.photoCamera.value = "";
      }
    }
    updatePhotoStatusFromInputs();
  }

  function syncEditFormUI() {
    var editing = !!state.editRecord;
    if (el.newHeading) {
      el.newHeading.textContent = editing ? "記録を編集" : "新しい記録を追加";
    }
    if (el.submit) {
      el.submit.textContent = editing ? "更新して保存" : "保存";
    }
    if (el.editBanner) el.editBanner.hidden = !editing;
    if (el.editCancel) el.editCancel.hidden = !editing;
    if (el.deleteRecordBtn) el.deleteRecordBtn.hidden = !editing;
  }

  function clearEditMode() {
    state.editRecord = null;
    syncEditFormUI();
    if (!el.form || !el.area) return;
    el.form.reset();
    if (el.date) el.date.value = todayInputValue();
    renderPlantChecks(el.area.value);
    updatePhotoStatusFromInputs();
  }

  function startEdit(r) {
    state.editRecord = {
      id: r.id,
      createdAt: r.createdAt || null,
      plants: Array.isArray(r.plants) ? r.plants.slice() : [],
    };
    if (el.area) el.area.value = r.areaId || el.area.value || "";
    renderPlantChecks(el.area.value);
    applyPlantsToForm(state.editRecord.plants, el.area.value);
    var di = (r.recordedAt || "").slice(0, 10);
    if (el.date) el.date.value = di || todayInputValue();
    var note = el.form.querySelector('[name="note"]');
    if (note) note.value = r.note || "";
    clearPhotoInputs();
    syncEditFormUI();
    requestAnimationFrame(function () {
      var t = document.getElementById("edit-record-section");
      if (t) t.scrollIntoView({ behavior: "smooth", block: "start" });
    });
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
      if (!window.confirm("このエリアと、その下の植栽行を一覧から外します。よろしいですか？")) return;
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
      .then(function () {
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
      el.area.innerHTML = "";
      state.areas.forEach(function (a) {
        var opt = document.createElement("option");
        opt.value = a.id;
        opt.textContent = a.label;
        el.area.appendChild(opt);
      });
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
    if (!IS_VIEW || !el.filterArea) return;
    var params = new URLSearchParams(window.location.search);
    var view = params.get("view");
    if (view === "timeline") {
      state.viewLayout = "timeline";
      if (el.viewModeTimelineRadio) el.viewModeTimelineRadio.checked = true;
      if (el.viewModeGridRadio) el.viewModeGridRadio.checked = false;
    } else if (view === "grid") {
      state.viewLayout = "grid";
      if (el.viewModeGridRadio) el.viewModeGridRadio.checked = true;
      if (el.viewModeTimelineRadio) el.viewModeTimelineRadio.checked = false;
    }

    var areaId = params.get("area");
    var plantName = params.get("plant");
    if (plantName) {
      try {
        plantName = decodeURIComponent(plantName);
      } catch (e) {}
    }
    if (areaId && state.areas.some(function (a) {
      return a.id === areaId;
    })) {
      el.filterArea.value = areaId;
    }
    updateFilterPlantOptions();
    if (plantName && state.viewLayout === "timeline") {
      state.pendingTimelinePlant = plantName;
    } else if (plantName && el.filterPlant) {
      var opts = el.filterPlant.querySelectorAll("option");
      for (var i = 0; i < opts.length; i++) {
        if (opts[i].value === plantName) {
          el.filterPlant.value = plantName;
          break;
        }
      }
    }
  }

  function fetchRecordByIdAndEdit(id) {
    return fetch(API_GROWTH, { headers: cloudHeaders(false) })
      .then(function (res) {
        if (!res.ok) throw new Error("一覧の取得に失敗しました");
        return res.json();
      })
      .then(function (data) {
        var list = data.records || [];
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

  function createGrowthCardArticle(r, opts) {
    var inTimeline = opts && opts.inTimeline;
    var card = document.createElement("article");
    card.className = "growth-card" + (inTimeline ? " growth-card--in-timeline" : "");

    var imgWrap = document.createElement("div");
    imgWrap.className = "growth-card-img-wrap";

    var imgSrc = growthImageSrc(r);
    if (imgSrc) {
      var img = document.createElement("img");
      img.src = imgSrc;
      img.alt = "";
      img.loading = "lazy";
      img.referrerPolicy = "no-referrer";
      imgWrap.appendChild(img);
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
    title.textContent = r.areaLabel || "";
    body.appendChild(title);

    var pl = document.createElement("p");
    pl.className = "growth-card-plants";
    pl.textContent = r.plants && r.plants.length ? r.plants.join("、") : "—";
    body.appendChild(pl);

    if (r.note) {
      var note = document.createElement("p");
      note.className = "growth-card-note";
      note.textContent = r.note;
      body.appendChild(note);
    }

    card.appendChild(body);

    var actions = document.createElement("div");
    actions.className = "growth-card-actions";
    var editLink = document.createElement("a");
    editLink.className = "growth-edit growth-card-edit-link";
    editLink.href = "./growth-edit.html?id=" + encodeURIComponent(r.id);
    editLink.textContent = "編集する";
    actions.appendChild(editLink);
    card.appendChild(actions);

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

  function syncViewModeUi() {
    if (!IS_VIEW) return;
    var tl = state.viewLayout === "timeline";
    if (el.feed) el.feed.hidden = tl;
    if (el.plantTimeline) el.plantTimeline.hidden = !tl;
    var lead = $("growth-timeline-lead");
    if (lead) lead.hidden = !tl;
  }

  function renderPlantTimeline(records) {
    if (!el.plantTimeline) return;
    el.plantTimeline.innerHTML = "";

    var plant = el.filterPlant ? el.filterPlant.value : "";
    var fa = el.filterArea ? el.filterArea.value : "";

    if (!plant) {
      var hint = document.createElement("p");
      hint.className = "growth-hint";
      hint.textContent = "表示する植栽を選ぶと、その植栽が含まれる記録を記録日の古い順に並べます。エリアを絞り込むこともできます。";
      el.plantTimeline.appendChild(hint);
      return;
    }

    var filtered = (records || []).filter(function (r) {
      if (fa && r.areaId !== fa) return false;
      if (!r.plants || r.plants.indexOf(plant) === -1) return false;
      return true;
    });

    filtered.sort(function (a, b) {
      return (a.recordedAt || "").localeCompare(b.recordedAt || "");
    });

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
    updateFilterPlantOptions();
    applyPendingTimelinePlant();
    syncViewModeUi();
    if (state.viewLayout === "timeline") {
      if (el.feed) el.feed.innerHTML = "";
      renderPlantTimeline(state.lastGrowthRecords);
    } else {
      if (el.plantTimeline) el.plantTimeline.innerHTML = "";
      renderFeed(state.lastGrowthRecords);
    }
  }

  function renderFeed(records) {
    if (!el.feed) return;

    var fa = el.filterArea ? el.filterArea.value : "";
    var fp = el.filterPlant ? el.filterPlant.value : "";

    var filtered = records.filter(function (r) {
      if (fa && r.areaId !== fa) return false;
      if (fp && (!r.plants || r.plants.indexOf(fp) === -1)) return false;
      return true;
    });

    filtered.sort(function (a, b) {
      return (b.recordedAt || "").localeCompare(a.recordedAt || "");
    });

    el.feed.innerHTML = "";

    if (filtered.length === 0) {
      var empty = document.createElement("p");
      empty.className = "growth-hint";
      empty.textContent = "該当する記録がありません。";
      el.feed.appendChild(empty);
      return;
    }

    filtered.forEach(function (r) {
      el.feed.appendChild(createGrowthCardArticle(r));
    });
  }

  function refreshFeed() {
    updateCloudStatus("一覧を取得中…");
    return fetch(API_GROWTH, { headers: cloudHeaders(false) })
      .then(function (res) {
        if (res.status === 404) {
          updateCloudStatus("サーバーに接続できません。インターネット上のサイトのURLで開いているか確認してください。");
          if (IS_VIEW) renderViewMain([]);
          else if (el.feed) renderFeed([]);
          return null;
        }
        if (!res.ok) {
          updateCloudStatus("一覧の取得に失敗しました（" + res.status + "）。");
          if (IS_VIEW) renderViewMain([]);
          else if (el.feed) renderFeed([]);
          return null;
        }
        return res.json();
      })
      .then(function (data) {
        if (!data) return;
        if (IS_VIEW) {
          updateCloudStatus(
            "記録と写真を表示できています。追加・編集・削除は「記録を追加・編集」から行ってください。"
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
        updateCloudStatus("ネットワークエラーで一覧を取得できませんでした。");
        if (IS_VIEW) renderViewMain([]);
        else if (el.feed) renderFeed([]);
      });
  }

  function onSubmit(e) {
    e.preventDefault();
    var editing = state.editRecord;
    var wasEdit = !!editing;
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

    var file = getPhotoFile();
    var promise;
    if (file) {
      promise = loadImageFile(file).then(imageToJpegBlob);
    } else {
      promise = Promise.resolve(null);
    }

    el.submit.disabled = true;

    var id = editing ? editing.id : uuid();
    var recordedAt = dateVal + "T12:00:00.000Z";
    var createdAt =
      editing && editing.createdAt ? editing.createdAt : new Date().toISOString();

    promise
      .then(function (blob) {
        var payload = {
          id: id,
          recordedAt: recordedAt,
          areaId: areaId,
          areaLabel: area ? area.label : areaId,
          plants: plants,
          note: noteVal,
          createdAt: createdAt,
        };
        if (blob) {
          return blobToDataURL(blob).then(function (dataUrl) {
            var comma = dataUrl.indexOf(",");
            payload.imageBase64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
            payload.imageMime = "image/jpeg";
            return payload;
          });
        }
        return payload;
      })
      .then(function (payload) {
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
      .then(function () {
        showToast(wasEdit ? "更新しました" : "保存しました");
        return loadPlantsData().catch(function () {
          return null;
        });
      })
      .then(function (pack) {
        if (pack) {
          state.areas = pack.areas || [];
          state.plantsBaseline = JSON.parse(JSON.stringify(state.areas));
          state.plantsSource = pack.source;
        }
        clearEditMode();
        if (dateInput) dateInput.value = todayInputValue();
        populateAreaSelects();
        renderPlantsCatalogEditor();
        renderPlantChecks(el.area.value);
        updateFilterPlantOptions();
        updatePlantsCatalogSourceLabel();
        if (el.feed) return refreshFeed();
      })
      .catch(function (err) {
        showToast(err && err.message ? err.message : "保存に失敗しました", true);
      })
      .finally(function () {
        el.submit.disabled = false;
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
    if (v) localStorage.setItem(LS_CLOUD_TOKEN, v);
    else localStorage.removeItem(LS_CLOUD_TOKEN);
    showToast("トークンを保存しました");
    if (el.feed) refreshFeed();
  }

  function onDeleteRecord() {
    if (!state.editRecord || !el.deleteRecordBtn) return;
    if (!confirm("この記録を削除しますか？（写真もサーバーから削除されます）")) return;
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
        if (!res.ok) throw new Error("削除に失敗しました");
        showToast("削除しました");
        window.location.href = "./index.html";
      })
      .catch(function (err) {
        showToast(err && err.message ? err.message : "削除に失敗しました", true);
      })
      .finally(function () {
        el.deleteRecordBtn.disabled = false;
      });
  }

  function applyThumbFeedClass() {
    var v = localStorage.getItem(LS_THUMB_SIZE) || "md";
    if (v !== "sm" && v !== "lg") v = "md";
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

  function initViewPage() {
    el.toast = $("growth-toast");
    el.filterArea = $("filter-area");
    el.filterPlant = $("filter-plant");
    el.feed = $("growth-feed");
    el.exportBtn = $("export-btn");
    el.viewStatus = $("growth-view-status");
    el.thumbSize = $("growth-thumb-size");
    el.viewModeGridRadio = $("growth-view-mode-grid");
    el.viewModeTimelineRadio = $("growth-view-mode-timeline");
    el.plantTimeline = $("growth-plant-timeline");

    if (!el.feed) return;

    var urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("view") === "timeline") {
      state.viewLayout = "timeline";
    } else if (urlParams.get("view") === "grid") {
      state.viewLayout = "grid";
    } else {
      try {
        var sv = localStorage.getItem("growthViewLayout");
        state.viewLayout = sv === "timeline" ? "timeline" : "grid";
      } catch (e) {
        state.viewLayout = "grid";
      }
    }

    if (el.viewModeGridRadio && el.viewModeTimelineRadio) {
      el.viewModeGridRadio.checked = state.viewLayout !== "timeline";
      el.viewModeTimelineRadio.checked = state.viewLayout === "timeline";
    }

    function onViewModeChange() {
      state.viewLayout =
        el.viewModeTimelineRadio && el.viewModeTimelineRadio.checked ? "timeline" : "grid";
      try {
        localStorage.setItem("growthViewLayout", state.viewLayout);
      } catch (e2) {}
      renderViewMain(state.lastGrowthRecords);
    }

    if (el.viewModeGridRadio) {
      el.viewModeGridRadio.addEventListener("change", onViewModeChange);
    }
    if (el.viewModeTimelineRadio) {
      el.viewModeTimelineRadio.addEventListener("change", onViewModeChange);
    }

    if (el.thumbSize) {
      var saved = localStorage.getItem(LS_THUMB_SIZE) || "md";
      if (saved === "sm" || saved === "md" || saved === "lg") {
        el.thumbSize.value = saved;
      }
      el.thumbSize.addEventListener("change", function () {
        localStorage.setItem(LS_THUMB_SIZE, el.thumbSize.value);
        applyThumbFeedClass();
      });
    }
    applyThumbFeedClass();
    syncViewModeUi();

    loadPlantsData()
      .then(function (pack) {
        state.areas = pack.areas || [];
        populateAreaSelects();
        applyViewQueryFilters();
        if (el.viewModeGridRadio && el.viewModeTimelineRadio) {
          el.viewModeGridRadio.checked = state.viewLayout !== "timeline";
          el.viewModeTimelineRadio.checked = state.viewLayout === "timeline";
        }
        syncViewModeUi();
        return refreshFeed();
      })
      .catch(function (err) {
        showToast(err && err.message ? err.message : "初期化に失敗しました", true);
      });

    if (el.filterArea) {
      el.filterArea.addEventListener("change", function () {
        if (el.filterPlant && state.viewLayout === "grid") el.filterPlant.value = "";
        updateFilterPlantOptions();
        if (state.viewLayout === "timeline") {
          renderPlantTimeline(state.lastGrowthRecords);
        } else {
          refreshFeed();
        }
      });
    }

    if (el.filterPlant) {
      el.filterPlant.addEventListener("change", function () {
        if (state.viewLayout === "timeline") {
          renderPlantTimeline(state.lastGrowthRecords);
        } else {
          refreshFeed();
        }
      });
    }

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
    el.photoCamera = $("field-photo-camera");
    el.photoLibrary = $("field-photo-library");
    el.photoStatus = $("field-photo-status");
    el.photoClear = $("photo-clear");
    el.submit = $("growth-submit");
    el.toast = $("growth-toast");
    el.filterArea = $("filter-area");
    el.filterPlant = $("filter-plant");
    el.feed = $("growth-feed");
    el.exportBtn = $("export-btn");
    el.cloudToken = $("cloud-token");
    el.cloudTokenSave = $("cloud-token-save");
    el.cloudStatus = $("cloud-status");
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

    var tokenStored = localStorage.getItem(LS_CLOUD_TOKEN);
    if (el.cloudToken && tokenStored) el.cloudToken.value = tokenStored;

    if (el.cloudTokenSave) el.cloudTokenSave.addEventListener("click", onCloudTokenSave);

    if (el.plantsCatalogReload) {
      el.plantsCatalogReload.addEventListener("click", reloadPlantsCatalogUi);
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
        var q = new URLSearchParams(window.location.search);
        var idParam = q.get("id");
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
        if (el.date) el.date.value = todayInputValue();
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
        clearPhotoInputs();
      });
    }

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
