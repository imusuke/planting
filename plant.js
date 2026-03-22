(function () {
  "use strict";

  var root = document.getElementById("plant-detail-root");
  var titleEl = document.getElementById("plant-detail-title");
  var areaLineEl = document.getElementById("plant-detail-area-line");
  var crumbEl = document.getElementById("plant-detail-breadcrumb-current");
  if (!root || !titleEl) return;

  function readEmbeddedPlants() {
    var el = document.getElementById("plants-embed");
    if (!el || !el.textContent.trim()) return null;
    try {
      return JSON.parse(el.textContent.trim());
    } catch (e) {
      return null;
    }
  }

  function normalizePlantName(p) {
    return typeof p === "string" ? p.trim() : "";
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

  function loadJson(path) {
    return fetch(path, { cache: "no-store" }).then(function (res) {
      if (!res.ok) throw new Error("bad status");
      return res.json();
    });
  }

  function loadPlantsData() {
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
  }

  function loadDetailsData() {
    return loadJson("data/plant-details.json")
      .then(function (data) {
        return data && Array.isArray(data.entries) ? data.entries : [];
      })
      .catch(function () {
        return [];
      });
  }

  function clearRoot() {
    root.innerHTML = "";
  }

  function renderError(message) {
    document.title = "植栽の詳細 — 植栽メモ";
    clearRoot();
    var p = document.createElement("p");
    p.className = "plant-detail-error";
    p.textContent = message;
    root.appendChild(p);
    titleEl.textContent = "植栽の詳細";
    if (crumbEl) crumbEl.textContent = "エラー";
    if (areaLineEl) {
      areaLineEl.hidden = true;
      areaLineEl.textContent = "";
    }
  }

  function renderBody(container, text) {
    if (!text || !String(text).trim()) return;
    var parts = String(text).split(/\n\n+/);
    for (var i = 0; i < parts.length; i++) {
      var chunk = parts[i].trim();
      if (!chunk) continue;
      var p = document.createElement("p");
      p.className = "plant-detail-body-p";
      p.textContent = chunk;
      container.appendChild(p);
    }
  }

  function renderPage(area, plantName, entry) {
    clearRoot();
    document.title = plantName + " — 植栽メモ";
    titleEl.textContent = plantName;
    if (crumbEl) crumbEl.textContent = plantName;
    if (areaLineEl) {
      areaLineEl.hidden = false;
      areaLineEl.textContent = "エリア: " + (area.label || area.id);
    }

    if (entry && entry.summary) {
      var sum = document.createElement("p");
      sum.className = "plant-detail-summary";
      sum.textContent = entry.summary;
      root.appendChild(sum);
    }

    var bodyWrap = document.createElement("div");
    bodyWrap.className = "plant-detail-body";
    if (entry && entry.body) {
      renderBody(bodyWrap, entry.body);
    }
    if (!bodyWrap.childElementCount) {
      var hint = document.createElement("p");
      hint.className = "plant-detail-placeholder";
      hint.textContent =
        "この植栽の解説や手入れメモは、まだ登録されていません。リポジトリの data/plant-details.json に、areaId・name・summary・body を追加して編集してください。段落は空行で区切ります。";
      bodyWrap.appendChild(hint);
    }
    root.appendChild(bodyWrap);

    var actions = document.createElement("p");
    actions.className = "plant-detail-actions";
    var aRecord = document.createElement("a");
    aRecord.className = "plant-detail-cta";
    aRecord.href =
      "./growth-edit.html?area=" +
      encodeURIComponent(area.id) +
      "&plant=" +
      encodeURIComponent(plantName);
    aRecord.textContent = "この植栽で成長記録を追加・編集";
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

  if (!areaId || !plantName) {
    renderError(
      "URL にエリアと植栽名が必要です。例: plant.html?area=entrance&plant=" +
        encodeURIComponent("ノリウツギ")
    );
    return;
  }

  Promise.all([loadPlantsData(), loadDetailsData()])
    .then(function (results) {
      var plantsData = results[0];
      var entries = results[1];
      var area = (plantsData.areas || []).find(function (a) {
        return a && a.id === areaId;
      });
      if (!area) {
        renderError("指定されたエリアが見つかりません。");
        return;
      }
      if (!areaHasPlant(area, plantName)) {
        renderError("このエリアのマスタに「" + plantName + "」は登録されていません。");
        return;
      }
      var entry = findDetailEntry(entries, areaId, plantName);
      renderPage(area, plantName, entry);
    })
    .catch(function () {
      renderError("データを読み込めませんでした。data/plants.json またはネットワークを確認してください。");
    });
})();
