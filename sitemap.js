(function () {
  "use strict";

  var API_PLANTS = "/api/plants";
  var PLANTS_JSON = "data/plants.json";

  var target = document.getElementById("sitemap-area-tree");
  var status = document.getElementById("sitemap-status");
  if (!target || !status) return;

  function loadJson(path) {
    return fetch(path, { cache: "no-store" }).then(function (res) {
      if (!res.ok) throw new Error("bad status");
      return res.json();
    });
  }

  function readEmbeddedPlants() {
    var el = document.getElementById("plants-embed");
    if (!el || !el.textContent || !el.textContent.trim()) {
      return null;
    }
    try {
      return JSON.parse(el.textContent.trim());
    } catch (e) {
      return null;
    }
  }

  function loadPlantsData() {
    return loadJson(API_PLANTS)
      .then(function (data) {
        if (!data || !Array.isArray(data.areas)) throw new Error("bad shape");
        return { areas: data.areas };
      })
      .catch(function () {
        return loadJson(PLANTS_JSON).then(function (data) {
          if (!data || !Array.isArray(data.areas)) throw new Error("bad shape");
          return data;
        });
      })
      .catch(function () {
        var embedded = readEmbeddedPlants();
        if (embedded && Array.isArray(embedded.areas)) return embedded;
        throw new Error("no plant data");
      });
  }

  function makeChip(label, href) {
    var a = document.createElement("a");
    a.className = "sitemap-link-chip";
    a.href = href;
    a.textContent = label;
    return a;
  }

  function makeTitle(label, href, kind) {
    var wrap = document.createElement("div");
    wrap.className = "sitemap-node-title";

    var title = href ? document.createElement("a") : document.createElement("span");
    if (href) title.href = href;
    title.textContent = label;
    wrap.appendChild(title);

    var badge = document.createElement("span");
    badge.className = "sitemap-node-label";
    badge.textContent = kind;
    wrap.appendChild(badge);

    return wrap;
  }

  function makeNote(text) {
    var p = document.createElement("p");
    p.className = "sitemap-inline-note";
    p.textContent = text;
    return p;
  }

  function renderAreas(data) {
    target.innerHTML = "";

    var areas = data && Array.isArray(data.areas) ? data.areas : [];
    if (!areas.length) {
      status.textContent = "エリアがまだ登録されていません。";
      target.appendChild(makeNote("植栽マスタが空のため、ここにはまだ表示する項目がありません。"));
      return;
    }

    var totalPlants = 0;
    areas.forEach(function (area) {
      totalPlants += Array.isArray(area.plants) ? area.plants.length : 0;
    });
    status.textContent = areas.length + " エリア / " + totalPlants + " 植栽";

    var list = document.createElement("ul");
    list.className = "sitemap-tree sitemap-tree--root";

    areas.forEach(function (area) {
      var areaItem = document.createElement("li");
      var areaNode = document.createElement("div");
      areaNode.className = "sitemap-node sitemap-node--area";
      areaNode.appendChild(
        makeTitle(
          area.label || area.id,
          "./area.html?area=" + encodeURIComponent(area.id),
          "area"
        )
      );
      areaNode.appendChild(makeNote("ID: " + String(area.id || "")));

      var areaLinks = document.createElement("div");
      areaLinks.className = "sitemap-links";
      areaLinks.appendChild(
        makeChip("エリア詳細", "./area.html?area=" + encodeURIComponent(area.id))
      );
      areaLinks.appendChild(makeChip("植栽一覧", "./plants.html"));
      areaNode.appendChild(areaLinks);
      areaItem.appendChild(areaNode);

      var plants = Array.isArray(area.plants) ? area.plants : [];
      if (plants.length) {
        var plantTree = document.createElement("ul");
        plantTree.className = "sitemap-tree";

        plants.forEach(function (plantName) {
          var plantItem = document.createElement("li");
          var plantNode = document.createElement("div");
          plantNode.className = "sitemap-node sitemap-node--plant";
          plantNode.appendChild(makeTitle(plantName, null, "plant"));

          var plantLinks = document.createElement("div");
          plantLinks.className = "sitemap-links";
          plantLinks.appendChild(
            makeChip(
              "成長記録（時系列）",
              "./index.html?view=timeline&area=" +
                encodeURIComponent(area.id) +
                "&plant=" +
                encodeURIComponent(plantName)
            )
          );
          plantLinks.appendChild(
            makeChip(
              "植栽詳細",
              "./plant.html?area=" +
                encodeURIComponent(area.id) +
                "&plant=" +
                encodeURIComponent(plantName)
            )
          );
          plantNode.appendChild(plantLinks);
          plantItem.appendChild(plantNode);
          plantTree.appendChild(plantItem);
        });

        areaItem.appendChild(plantTree);
      } else {
        areaItem.appendChild(makeNote("このエリアにはまだ植栽が登録されていません。"));
      }

      list.appendChild(areaItem);
    });

    target.appendChild(list);
  }

  loadPlantsData()
    .then(renderAreas)
    .catch(function () {
      target.innerHTML = "";
      status.textContent = "植栽マスタの読み込みに失敗しました。";
      target.appendChild(
        makeNote(
          "data/plants.json または埋め込みデータを確認すると、ツリーを表示できます。"
        )
      );
    });
})();
