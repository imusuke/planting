(function () {
  "use strict";

  var common = window.PlantingEditCommon || {};
  var LS_CLOUD_TOKEN = common.CLOUD_TOKEN_KEY || "growthCloudToken";
  var API_CHANGE_LOG = "/api/change-log";
  var API_PLANTS = "/api/plants";
  var API_PLANT_DETAILS = "/api/plant-details";
  var API_PLANT_DESCRIPTION = "/api/plant-description";
  var API_GROWTH = "/api/growth";
  var GROWTH_SNAPSHOT_JSON = "./data/growth-snapshot.json";

  var state = {
    areas: [],
    entries: [],
    growthRecords: [],
    descriptionAiBusy: false,
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
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(function () {
      el.toast.className = "growth-toast";
    }, 4200);
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

  function cloudHeaders(jsonBody) {
    return common.buildCloudHeaders
      ? common.buildCloudHeaders(jsonBody, LS_CLOUD_TOKEN)
      : { Accept: "application/json" };
  }

  function readEmbeddedPlantDetails() {
    return common.readEmbeddedJson ? common.readEmbeddedJson("plant-details-embed") : null;
  }

  function normalizePlantName(name) {
    return common.normalizeName ? common.normalizeName(name) : typeof name === "string" ? name.trim() : "";
  }

  function loadJson(pathname) {
    return common.loadJson
      ? common.loadJson(pathname)
      : fetch(pathname, { cache: "no-store", headers: { Accept: "application/json" } }).then(function (res) {
          if (!res.ok) throw new Error("bad status");
          return res.json();
        });
  }

  function loadPlantsData() {
    return common.loadPlantsData
      ? common.loadPlantsData({
          apiPath: API_PLANTS,
          fallbackPath: "data/plants.json",
          embedId: "plants-embed",
        })
      : loadJson(API_PLANTS);
  }

  function readWindowSnapshotRecords(key) {
    var data = window[key];
    return data && Array.isArray(data.records) ? data.records : [];
  }

  function loadGrowthRecords() {
    return loadJson(API_GROWTH)
      .then(function (data) {
        return data && Array.isArray(data.records) ? data.records : [];
      })
      .catch(function () {
        return loadJson(GROWTH_SNAPSHOT_JSON).then(function (data) {
          return data && Array.isArray(data.records) ? data.records : [];
        });
      })
      .catch(function () {
        return readWindowSnapshotRecords("__PLANTING_GROWTH_SNAPSHOT__");
      })
      .catch(function () {
        return [];
      });
  }

  function loadPlantDetailsMerged() {
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
            var embedded = readEmbeddedPlantDetails();
            var fromEmb = embedded && Array.isArray(embedded.entries) ? embedded.entries : [];
            return pickEntries(fromNet, fromEmb);
          })
          .catch(function () {
            var embedded = readEmbeddedPlantDetails();
            if (embedded && Array.isArray(embedded.entries)) return embedded.entries;
            return [];
          });
      });
  }

  function findAreaById(areaId) {
    return common.findAreaById ? common.findAreaById(state.areas, areaId) : null;
  }

  function areaPlants(areaId) {
    return common.listAreaPlants ? common.listAreaPlants(state.areas, areaId) : [];
  }

  function findEntry(areaId, plantName) {
    var wantedArea = String(areaId || "").trim();
    var wantedPlant = normalizePlantName(plantName);
    if (!wantedArea || !wantedPlant) return null;
    for (var i = 0; i < state.entries.length; i++) {
      var entry = state.entries[i];
      if (!entry) continue;
      if (String(entry.areaId || "").trim() !== wantedArea) continue;
      if (normalizePlantName(entry.name) !== wantedPlant) continue;
      return entry;
    }
    return null;
  }

  function upsertLocalEntry(entry) {
    if (!entry) return;
    var areaId = String(entry.areaId || "").trim();
    var plantName = normalizePlantName(entry.name);
    if (!areaId || !plantName) return;
    for (var i = 0; i < state.entries.length; i++) {
      var current = state.entries[i];
      if (!current) continue;
      if (String(current.areaId || "").trim() === areaId && normalizePlantName(current.name) === plantName) {
        state.entries[i] = entry;
        return;
      }
    }
    state.entries.push(entry);
  }

  function normalizeRecordImages(record) {
    return common.normalizeImageSlots
      ? common.normalizeImageSlots(record)
      : (function () {
          if (!record) return [];
          if (Array.isArray(record.images) && record.images.length) {
            return record.images
              .map(function (img) {
                return {
                  imageUrl: img && img.imageUrl ? img.imageUrl : null,
                  imagePathname: img && img.imagePathname ? img.imagePathname : null,
                  localSnapshotImage: img && img.localSnapshotImage ? img.localSnapshotImage : null,
                  memo: img && typeof img.memo === "string" ? img.memo : "",
                };
              })
              .filter(Boolean);
          }
          if (record.imageUrl || record.imagePathname || record.localSnapshotImage) {
            return [
              {
                imageUrl: record.imageUrl || null,
                imagePathname: record.imagePathname || null,
                localSnapshotImage: record.localSnapshotImage || null,
                memo: typeof record.memo === "string" ? record.memo : "",
              },
            ];
          }
          return [];
        })();
  }

  function recordHasPlant(record, plantName) {
    var wanted = normalizePlantName(plantName);
    if (!wanted || !record || !Array.isArray(record.plants)) return false;
    return record.plants.some(function (name) {
      return normalizePlantName(name) === wanted;
    });
  }

  function plantHasSavedPhotoHistory(areaId, plantName) {
    var wantedArea = String(areaId || "").trim();
    var wantedPlant = normalizePlantName(plantName);
    if (!wantedArea || !wantedPlant) return false;
    return state.growthRecords.some(function (record) {
      return (
        String((record && record.areaId) || "").trim() === wantedArea &&
        recordHasPlant(record, wantedPlant) &&
        normalizeRecordImages(record).length > 0
      );
    });
  }

  function syncDescriptionAiButtonState() {
    if (!el.descriptionAiGenerate) return;
    el.descriptionAiGenerate.disabled =
      state.descriptionAiBusy || !plantHasSavedPhotoHistory(selectedAreaId(), selectedPlantName());
  }

  function setAreaOptions(selectedAreaId) {
    if (!el.area) return;
    el.area.innerHTML = "";
    state.areas.forEach(function (area) {
      if (!area || !area.id) return;
      var option = document.createElement("option");
      option.value = area.id;
      option.textContent = area.label || area.id;
      el.area.appendChild(option);
    });
    if (!el.area.options.length) return;
    var desired = findAreaById(selectedAreaId) ? selectedAreaId : el.area.options[0].value;
    el.area.value = desired;
  }

  function setPlantOptions(selectedPlantName) {
    if (!el.plant) return;
    var plants = areaPlants(el.area ? el.area.value : "");
    var wanted = normalizePlantName(selectedPlantName);
    if (wanted && plants.indexOf(wanted) === -1) {
      plants.unshift(wanted);
    }
    el.plant.innerHTML = "";
    plants.forEach(function (plantName) {
      var option = document.createElement("option");
      option.value = plantName;
      option.textContent = plantName;
      el.plant.appendChild(option);
    });
    if (!el.plant.options.length) {
      var empty = document.createElement("option");
      empty.value = "";
      empty.textContent = "植栽を選択してください";
      el.plant.appendChild(empty);
    }
    if (wanted) {
      el.plant.value = wanted;
    }
    if (!el.plant.value && el.plant.options.length) {
      el.plant.value = el.plant.options[0].value;
    }
  }

  function setCloudStatus() {
    if (common.setCloudStatus) {
      common.setCloudStatus(el.cloudStatus, { storageKey: LS_CLOUD_TOKEN });
      return;
    }
    if (!el.cloudStatus) return;
    var hasToken = !!localStorage.getItem(LS_CLOUD_TOKEN);
    el.cloudStatus.textContent = hasToken
      ? "アップロード用トークンを保存済みです。"
      : "アップロード用トークンを入力すると本番データへ保存できます。";
  }

  function matchesPlantChangeLogEntry(item) {
    if (!item) return false;
    var areaId = selectedAreaId();
    var plantName = selectedPlantName();
    if (!areaId || !plantName) return false;
    if (String(item.areaId || "").trim() !== areaId) return false;
    if (normalizePlantName(item.plantName) === plantName) return true;
    if (!Array.isArray(item.plantNames)) return false;
    for (var i = 0; i < item.plantNames.length; i++) {
      if (normalizePlantName(item.plantNames[i]) === plantName) return true;
    }
    return false;
  }

  function refreshChangeLog() {
    if (!el.changeLogStatus || !el.changeLogList) return Promise.resolve([]);
    var areaId = selectedAreaId();
    var plantName = selectedPlantName();
    if (!areaId || !plantName) {
      el.changeLogStatus.textContent = "エリアと植栽を選ぶと最近の更新を表示します。";
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
      filter: matchesPlantChangeLogEntry,
      noTokenMessage: "アップロード用トークンを保存すると、この植栽に関する更新を読み込めます。",
      emptyMessage: "この植栽に関する更新はまだありません。",
      successMessage: function (items) {
        return items.length
          ? "この植栽に関する最近 " + items.length + " 件の更新です。"
          : "この植栽に関する更新はまだありません。";
      },
    });
  }

  function selectedAreaId() {
    return el.area ? String(el.area.value || "").trim() : "";
  }

  function selectedPlantName() {
    return el.plant ? normalizePlantName(el.plant.value) : "";
  }

  function buildQuery(pathname, areaId, plantName) {
    var params = [];
    if (plantName) params.push("plant=" + encodeURIComponent(plantName));
    if (areaId) params.push("area=" + encodeURIComponent(areaId));
    return pathname + (params.length ? "?" + params.join("&") : "");
  }

  function syncLinks(areaId, plantName) {
    var detailHref = plantName ? buildQuery("./plant.html", areaId, plantName) : "./plant.html";
    var recordHref = plantName ? buildQuery("./growth-edit.html", areaId, plantName) : "./growth-edit.html";

    if (el.detailBreadcrumbLink) el.detailBreadcrumbLink.href = detailHref;
    if (el.detailLink) el.detailLink.href = detailHref;
    if (el.guideRecordLink) el.guideRecordLink.href = recordHref;
  }

  function syncFormFromSelection() {
    var areaId = selectedAreaId();
    var plantName = selectedPlantName();
    var area = findAreaById(areaId);
    var entry = findEntry(areaId, plantName);

    if (el.pageTitle) {
      el.pageTitle.textContent = plantName ? plantName + "の説明を編集" : "植栽の説明を編集";
    }
    if (el.breadcrumbCurrent) {
      el.breadcrumbCurrent.textContent = plantName ? plantName + "の説明を編集" : "植栽の説明を編集";
    }
    if (el.detailBreadcrumbLink) {
      el.detailBreadcrumbLink.textContent = plantName ? plantName : "植栽";
    }
    if (el.contextLine) {
      if (area && plantName) {
        el.contextLine.hidden = false;
        el.contextLine.textContent = "エリア: " + (area.label || area.id) + " / 植栽: " + plantName;
      } else if (area) {
        el.contextLine.hidden = false;
        el.contextLine.textContent = "エリア: " + (area.label || area.id);
      } else {
        el.contextLine.hidden = true;
        el.contextLine.textContent = "";
      }
    }
    if (el.summary) el.summary.value = entry && entry.summary ? String(entry.summary) : "";
    if (el.body) el.body.value = entry && entry.body ? String(entry.body) : "";
    syncLinks(areaId, plantName);
    document.title = "植栽メモ — " + (plantName ? plantName + "の説明を編集" : "植栽の説明を編集");
    syncDescriptionAiButtonState();
  }

  function updateQuery(areaId, plantName) {
    try {
      var url = new URL(window.location.href);
      if (areaId) url.searchParams.set("area", areaId);
      else url.searchParams.delete("area");
      if (plantName) url.searchParams.set("plant", plantName);
      else url.searchParams.delete("plant");
      history.replaceState(null, "", url.pathname + url.search + url.hash);
    } catch (e) {}
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
      } catch (e) {}
      var base = fallbackPrefix + "（HTTP " + res.status + "）";
      return detail ? base + " " + detail : base;
    });
  }

  function onAreaChange() {
    var currentPlant = selectedPlantName();
    var plants = areaPlants(selectedAreaId());
    setPlantOptions(plants.indexOf(currentPlant) !== -1 ? currentPlant : "");
    setDescriptionAiStatus("", false);
    syncFormFromSelection();
    updateQuery(selectedAreaId(), selectedPlantName());
    refreshChangeLog().catch(function () {});
  }

  function onPlantChange() {
    setDescriptionAiStatus("", false);
    syncFormFromSelection();
    updateQuery(selectedAreaId(), selectedPlantName());
    refreshChangeLog().catch(function () {});
  }

  function generatePlantDescriptionDraft() {
    var areaId = selectedAreaId();
    var plantName = selectedPlantName();
    if (!areaId || !plantName) {
      setDescriptionAiStatus("先にエリアと植栽を選んでください。", true);
      showToast("先にエリアと植栽を選んでください。", true);
      return;
    }
    if (!plantHasSavedPhotoHistory(areaId, plantName)) {
      setDescriptionAiStatus("この植栽には、説明生成に使える保存済み写真がまだありません。", true);
      showToast("この植栽には、説明生成に使える保存済み写真がまだありません。", true);
      return;
    }

    state.descriptionAiBusy = true;
    syncDescriptionAiButtonState();
    setDescriptionAiStatus("植栽写真の流れをもとに、AIが概要と本文の案を作成しています。", false);

    fetch(API_PLANT_DESCRIPTION, {
      method: "POST",
      headers: cloudHeaders(true),
      body: JSON.stringify({
        areaId: areaId,
        name: plantName,
        currentSummary: el.summary ? el.summary.value.trim() : "",
        currentBody: el.body ? el.body.value.trim() : "",
      }),
    })
      .then(function (res) {
        if (res.status === 401) {
          throw new Error("トークンが違います。");
        }
        if (!res.ok) {
          return apiErrorMessage(res, "植栽説明の生成に失敗しました").then(function (message) {
            throw new Error(message);
          });
        }
        return res.json();
      })
      .then(function (data) {
        if (!data || typeof data.summary !== "string" || typeof data.body !== "string") {
          throw new Error("AIが植栽説明を正しく返せませんでした。");
        }
        if (el.summary) el.summary.value = data.summary;
        if (el.body) el.body.value = data.body;
        setDescriptionAiStatus(
          "AIで植栽説明の案を作成しました。必要なら整えてから保存してください。",
          false
        );
        showToast("AIで植栽説明の案を作成しました。");
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

  function onSaveToken() {
    if (!el.tokenInput) return;
    var token = String(el.tokenInput.value || "").trim();
    if (common.saveCloudToken) common.saveCloudToken(token, LS_CLOUD_TOKEN);
    else if (token) localStorage.setItem(LS_CLOUD_TOKEN, token);
    else localStorage.removeItem(LS_CLOUD_TOKEN);
    setCloudStatus();
    refreshChangeLog().catch(function () {});
    showToast(token ? "アップロード用トークンを保存しました。" : "アップロード用トークンを削除しました。", false);
  }

  function onSubmit(event) {
    event.preventDefault();
    var areaId = selectedAreaId();
    var plantName = selectedPlantName();
    if (!areaId || !plantName) {
      showToast("エリアと植栽を選択してください。", true);
      return;
    }

    var payload = {
      areaId: areaId,
      name: plantName,
      summary: el.summary ? el.summary.value : "",
      body: el.body ? el.body.value : "",
    };

    fetch(API_PLANT_DETAILS, {
      method: "POST",
      headers: cloudHeaders(true),
      body: JSON.stringify(payload),
    })
      .then(function (res) {
        if (!res.ok) {
          var prefix = res.status === 401 ? "保存に失敗しました。アップロード用トークンを確認してください。" : "保存に失敗しました。";
          return apiErrorMessage(res, prefix).then(function (message) {
            throw new Error(message);
          });
        }
        return res.json();
      })
      .then(function (data) {
        upsertLocalEntry(data && data.entry ? data.entry : payload);
        syncFormFromSelection();
        updateQuery(areaId, plantName);
        refreshChangeLog().catch(function () {});
        showToast("植栽の詳細を保存しました。", false);
      })
      .catch(function (err) {
        showToast(err && err.message ? err.message : "保存に失敗しました。", true);
      });
  }

  function init() {
    el.toast = $("plant-edit-toast");
    el.pageTitle = $("plant-edit-page-title");
    el.contextLine = $("plant-edit-context-line");
    el.cloudStatus = $("plant-edit-cloud-status");
    el.tokenInput = $("plant-edit-cloud-token");
    el.tokenSave = $("plant-edit-cloud-token-save");
    el.form = $("plant-edit-form");
    el.area = $("plant-edit-area");
    el.plant = $("plant-edit-plant");
    el.summary = $("plant-edit-summary");
    el.body = $("plant-edit-body");
    el.descriptionAiGenerate = $("plant-description-ai-generate");
    el.descriptionAiStatus = $("plant-description-ai-status");
    el.detailBreadcrumbLink = $("plant-edit-detail-breadcrumb-link");
    el.breadcrumbCurrent = $("plant-edit-breadcrumb-current");
    el.detailLink = $("plant-edit-detail-link");
    el.guideRecordLink = $("plant-edit-guide-record-link");
    el.changeLogStatus = $("plant-edit-change-log-status");
    el.changeLogList = $("plant-edit-change-log-list");
    el.changeLogReload = $("plant-edit-change-log-reload");

    if (!el.form || !el.area || !el.plant) return;

    if (common.applyStoredCloudToken) common.applyStoredCloudToken(el.tokenInput, LS_CLOUD_TOKEN);
    else if (el.tokenInput) el.tokenInput.value = localStorage.getItem(LS_CLOUD_TOKEN) || "";
    setCloudStatus();

    if (el.tokenSave) el.tokenSave.addEventListener("click", onSaveToken);
    el.area.addEventListener("change", onAreaChange);
    el.plant.addEventListener("change", onPlantChange);
    el.form.addEventListener("submit", onSubmit);
    if (el.descriptionAiGenerate) {
      el.descriptionAiGenerate.addEventListener("click", function () {
        generatePlantDescriptionDraft();
      });
    }
    if (el.changeLogReload) {
      el.changeLogReload.addEventListener("click", function () {
        refreshChangeLog().catch(function () {});
      });
    }

    var params = new URLSearchParams(window.location.search);
    var requestedAreaId = String(params.get("area") || "").trim();
    var requestedPlantName = params.get("plant") || "";
    try {
      requestedPlantName = decodeURIComponent(requestedPlantName).trim();
    } catch (e) {
      requestedPlantName = requestedPlantName.trim();
    }

    Promise.all([loadPlantsData(), loadPlantDetailsMerged(), loadGrowthRecords()])
      .then(function (results) {
        state.areas = results[0] && Array.isArray(results[0].areas) ? results[0].areas : [];
        state.entries = Array.isArray(results[1]) ? results[1] : [];
        state.growthRecords = Array.isArray(results[2]) ? results[2] : [];
        if (!state.areas.length) throw new Error("植栽一覧を読み込めませんでした。");
        setAreaOptions(requestedAreaId);
        setPlantOptions(requestedPlantName);
        setDescriptionAiStatus("", false);
        syncFormFromSelection();
        updateQuery(selectedAreaId(), selectedPlantName());
        refreshChangeLog().catch(function () {});
      })
      .catch(function (err) {
        showToast(err && err.message ? err.message : "初期化に失敗しました。", true);
      });
  }

  init();
})();
