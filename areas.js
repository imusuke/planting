(function () {
  "use strict";

  var root = document.getElementById("area-list");
  if (!root) return;

  function loadJson(path) {
    return fetch(path, { cache: "no-store" }).then(function (res) {
      if (!res.ok) throw new Error("bad status");
      return res.json();
    });
  }

  function readEmbeddedPlants() {
    var el = document.getElementById("plants-embed");
    if (!el || !el.textContent || !el.textContent.trim()) return null;
    try {
      return JSON.parse(el.textContent.trim());
    } catch (e) {
      return null;
    }
  }

  function renderAreas(data) {
    root.innerHTML = "";
    var areas = data && Array.isArray(data.areas) ? data.areas : [];
    if (!areas.length) {
      var p = document.createElement("p");
      p.className = "plant-load-error";
      p.textContent = "エリアが見つかりませんでした。";
      root.appendChild(p);
      return;
    }

    areas.forEach(function (area) {
      if (!area || !area.id) return;
      var card = document.createElement("a");
      card.className = "card growthlog";
      card.href = "./area.html?area=" + encodeURIComponent(area.id);

      var label = document.createElement("span");
      label.className = "card-label";
      label.textContent = "Area";
      card.appendChild(label);

      var title = document.createElement("h2");
      title.textContent = area.label || area.id;
      card.appendChild(title);

      var count = Array.isArray(area.plants) ? area.plants.length : 0;
      var desc = document.createElement("p");
      desc.textContent = "植栽数: " + count + " / 詳細ページを開く";
      card.appendChild(desc);

      var open = document.createElement("span");
      open.className = "open";
      open.textContent = "Open";
      card.appendChild(open);

      root.appendChild(card);
    });
  }

  loadJson("/api/plants")
    .catch(function () {
      return loadJson("./data/plants.json");
    })
    .catch(function () {
      var embedded = readEmbeddedPlants();
      if (embedded && Array.isArray(embedded.areas)) return embedded;
      throw new Error("no embedded data");
    })
    .then(renderAreas)
    .catch(function () {
      root.innerHTML = "";
      var p = document.createElement("p");
      p.className = "plant-load-error";
      p.textContent = "エリア一覧の読み込みに失敗しました。";
      root.appendChild(p);
    });
})();
