(function () {
  "use strict";

  var LS_CLOUD_TOKEN = "growthCloudToken";
  var API_PLANTS = "/api/plants";
  var API_PLANT_DETAILS = "/api/plant-details";

  var state = {
    areas: [],
    entries: [],
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

  function cloudHeaders(jsonBody) {
    var headers = { Accept: "application/json" };
    if (jsonBody) headers["Content-Type"] = "application/json";
    var token = localStorage.getItem(LS_CLOUD_TOKEN);
    if (token) headers["x-growth-token"] = token;
    return headers;
  }

  function readEmbeddedPlants() {
    var dataEl = $("plants-embed");
    if (!dataEl || !dataEl.textContent.trim()) return null;
    try {
      return JSON.parse(dataEl.textContent.trim());
    } catch (e) {
      return null;
    }
  }

  function readEmbeddedPlantDetails() {
    var dataEl = $("plant-details-embed");
    if (!dataEl || !dataEl.textContent.trim()) return null;
    try {
      return JSON.parse(dataEl.textContent.trim());
    } catch (e) {
      return null;
    }
  }

  function normalizePlantName(name) {
    return typeof name === "string" ? name.trim() : "";
  }

  function loadJson(pathname) {
    return fetch(pathname, { cache: "no-store", headers: { Accept: "application/json" } }).then(function (res) {
      if (!res.ok) throw new Error("bad status");
      return res.json();
    });
  }

  function loadPlantsData() {
    return loadJson(API_PLANTS)
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
    var wanted = String(areaId || "").trim();
    if (!wanted) return null;
    for (var i = 0; i < state.areas.length; i++) {
      var area = state.areas[i];
      if (area && area.id === wanted) return area;
    }
    return null;
  }

  function areaPlants(areaId) {
    var area = findAreaById(areaId);
    if (!area || !Array.isArray(area.plants)) return [];
    var seen = {};
    var list = [];
    for (var i = 0; i < area.plants.length; i++) {
      var plantName = normalizePlantName(area.plants[i]);
      if (!plantName || seen[plantName]) continue;
      seen[plantName] = true;
      list.push(plantName);
    }
    return list;
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
    if (!el.cloudStatus) return;
    var hasToken = !!localStorage.getItem(LS_CLOUD_TOKEN);
    el.cloudStatus.textContent = hasToken
      ? "編集トークンを保存済みです。"
      : "編集トークンを入力すると本番データへ保存できます。";
  }

  function selectedAreaId() {
    return el.area ? String(el.area.value || "").trim() : "";
  }

  function selectedPlantName() {
    return el.plant ? normalizePlantName(el.plant.value) : "";
  }

  function buildQuery(pathname, areaId, plantName, timeline) {
    var params = [];
    if (timeline) params.push("view=timeline");
    if (plantName) params.push("plant=" + encodeURIComponent(plantName));
    if (areaId) params.push("area=" + encodeURIComponent(areaId));
    return pathname + (params.length ? "?" + params.join("&") : "");
  }

  function syncLinks(areaId, plantName) {
    var detailHref = plantName ? buildQuery("./plant.html", areaId, plantName, false) : "./plant.html";
    var timelineHref = plantName ? buildQuery("./index.html", areaId, plantName, true) : "./index.html?view=timeline";
    var recordHref = plantName ? buildQuery("./growth-edit.html", areaId, plantName, false) : "./growth-edit.html";

    if (el.detailBreadcrumbLink) el.detailBreadcrumbLink.href = detailHref;
    if (el.detailLink) el.detailLink.href = detailHref;
    if (el.leadDetailLink) el.leadDetailLink.href = detailHref;
    if (el.openDetail) el.openDetail.href = detailHref;
    if (el.timelineLink) el.timelineLink.href = timelineHref;
    if (el.openTimeline) el.openTimeline.href = timelineHref;
    if (el.recordLink) el.recordLink.href = recordHref;
  }

  function syncFormFromSelection() {
    var areaId = selectedAreaId();
    var plantName = selectedPlantName();
    var area = findAreaById(areaId);
    var entry = findEntry(areaId, plantName);

    if (el.pageTitle) {
      el.pageTitle.textContent = plantName ? plantName + "の詳細を編集" : "植栽詳細を編集";
    }
    if (el.breadcrumbCurrent) {
      el.breadcrumbCurrent.textContent = plantName ? plantName + "の詳細を編集" : "植栽詳細を編集";
    }
    if (el.detailBreadcrumbLink) {
      el.detailBreadcrumbLink.textContent = plantName ? plantName + "の詳細" : "植栽詳細";
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
    document.title = (plantName ? plantName + "の詳細を編集" : "植栽詳細を編集") + " — 植栽メモ";
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
    syncFormFromSelection();
    updateQuery(selectedAreaId(), selectedPlantName());
  }

  function onPlantChange() {
    syncFormFromSelection();
    updateQuery(selectedAreaId(), selectedPlantName());
  }

  function onSaveToken() {
    if (!el.tokenInput) return;
    var token = String(el.tokenInput.value || "").trim();
    if (token) localStorage.setItem(LS_CLOUD_TOKEN, token);
    else localStorage.removeItem(LS_CLOUD_TOKEN);
    setCloudStatus();
    showToast(token ? "編集トークンを保存しました。" : "編集トークンを削除しました。", false);
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
          var prefix = res.status === 401 ? "保存に失敗しました。編集トークンを確認してください。" : "保存に失敗しました。";
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
        showToast("植栽詳細を保存しました。", false);
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
    el.detailBreadcrumbLink = $("plant-edit-detail-breadcrumb-link");
    el.breadcrumbCurrent = $("plant-edit-breadcrumb-current");
    el.detailLink = $("plant-edit-detail-link");
    el.leadDetailLink = $("plant-edit-lead-detail-link");
    el.recordLink = $("plant-edit-record-link");
    el.timelineLink = $("plant-edit-timeline-link");
    el.openDetail = $("plant-edit-open-detail");
    el.openTimeline = $("plant-edit-open-timeline");

    if (!el.form || !el.area || !el.plant) return;

    if (el.tokenInput) {
      el.tokenInput.value = localStorage.getItem(LS_CLOUD_TOKEN) || "";
    }
    setCloudStatus();

    if (el.tokenSave) el.tokenSave.addEventListener("click", onSaveToken);
    el.area.addEventListener("change", onAreaChange);
    el.plant.addEventListener("change", onPlantChange);
    el.form.addEventListener("submit", onSubmit);

    var params = new URLSearchParams(window.location.search);
    var requestedAreaId = String(params.get("area") || "").trim();
    var requestedPlantName = params.get("plant") || "";
    try {
      requestedPlantName = decodeURIComponent(requestedPlantName).trim();
    } catch (e) {
      requestedPlantName = requestedPlantName.trim();
    }

    Promise.all([loadPlantsData(), loadPlantDetailsMerged()])
      .then(function (results) {
        state.areas = results[0] && Array.isArray(results[0].areas) ? results[0].areas : [];
        state.entries = Array.isArray(results[1]) ? results[1] : [];
        if (!state.areas.length) throw new Error("植栽一覧を読み込めませんでした。");
        setAreaOptions(requestedAreaId);
        setPlantOptions(requestedPlantName);
        syncFormFromSelection();
        updateQuery(selectedAreaId(), selectedPlantName());
      })
      .catch(function (err) {
        showToast(err && err.message ? err.message : "初期化に失敗しました。", true);
      });
  }

  init();
})();