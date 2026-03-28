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

  function makeNode(label, href, kind, note) {
    var node = document.createElement("div");
    node.className = "sitemap-node";
    node.appendChild(makeTitle(label, href, kind));
    if (note) node.appendChild(makeNote(note));
    return node;
  }

  function makeLeaf(label, href, kind, note) {
    var li = document.createElement("li");
    li.appendChild(makeNode(label, href, kind, note));
    return li;
  }

  function appendChildren(parentLi, children) {
    if (!children || !children.length) return;
    var ul = document.createElement("ul");
    ul.className = "sitemap-tree";
    for (var i = 0; i < children.length; i++) {
      ul.appendChild(children[i]);
    }
    parentLi.appendChild(ul);
  }

  function buildPlantBranch(area, plantName) {
    var plantLi = makeLeaf(plantName, null, "plant", "この植栽の閲覧と編集の入口です。");

    var timelineHref =
      "./index.html?view=timeline&area=" +
      encodeURIComponent(area.id) +
      "&plant=" +
      encodeURIComponent(plantName);
    var timelineEditHref =
      "./growth-edit.html?area=" +
      encodeURIComponent(area.id) +
      "&plant=" +
      encodeURIComponent(plantName);
    var detailHref =
      "./plant.html?area=" + encodeURIComponent(area.id) + "&plant=" + encodeURIComponent(plantName);
    var detailEditHref =
      "./plant-edit.html?area=" +
      encodeURIComponent(area.id) +
      "&plant=" +
      encodeURIComponent(plantName);

    var timelineLi = makeLeaf("植栽時系列", timelineHref, "timeline", "この植栽の写真と記録を時系列で見ます。");
    var timelineChildren = [
      makeLeaf("植栽時系列編集", timelineEditHref, "edit", "この植栽の記録や写真を追加・編集します。"),
    ];

    var detailLi = makeLeaf("植栽詳細", detailHref, "detail", "この植栽の説明や概要を確認します。");
    appendChildren(detailLi, [
      makeLeaf("植栽詳細編集", detailEditHref, "edit", "この植栽詳細の説明を編集します。"),
    ]);
    timelineChildren.push(detailLi);
    appendChildren(timelineLi, timelineChildren);
    appendChildren(plantLi, [timelineLi]);

    return plantLi;
  }

  function buildAreaBranch(area) {
    var label = area.label || area.id;
    var areaHref = "./area.html?area=" + encodeURIComponent(area.id);
    var areaEditHref = "./area-edit.html?area=" + encodeURIComponent(area.id);
    var areaLi = makeLeaf(label, areaHref, "area", "ID: " + String(area.id || ""));

    var children = [
      (function () {
        var timelineLi = makeLeaf("エリア時系列", areaHref, "timeline", "このエリアの写真や記録を時系列で見ます。");
        appendChildren(timelineLi, [
          makeLeaf("エリア時系列編集", areaEditHref, "edit", "このエリアの写真やメモを編集します。"),
        ]);
        return timelineLi;
      })(),
    ];

    var plants = Array.isArray(area.plants) ? area.plants : [];
    if (!plants.length) {
      children.push(makeLeaf("植栽はまだありません", null, "empty", "このエリアには植栽が登録されていません。"));
    } else {
      for (var i = 0; i < plants.length; i++) {
        children.push(buildPlantBranch(area, plants[i]));
      }
    }

    appendChildren(areaLi, children);
    return areaLi;
  }

  function renderAreas(data) {
    target.innerHTML = "";

    var areas = data && Array.isArray(data.areas) ? data.areas : [];
    if (!areas.length) {
      status.textContent = "エリアがまだ登録されていません。";
      target.appendChild(makeNote("data/plants.json または埋め込みデータからエリア一覧を読み込めませんでした。"));
      return;
    }

    var totalPlants = 0;
    for (var i = 0; i < areas.length; i++) {
      totalPlants += Array.isArray(areas[i].plants) ? areas[i].plants.length : 0;
    }
    status.textContent = areas.length + " エリア / " + totalPlants + " 植栽";

    var list = document.createElement("ul");
    list.className = "sitemap-tree sitemap-tree--root";

    for (var j = 0; j < areas.length; j++) {
      list.appendChild(buildAreaBranch(areas[j]));
    }

    target.appendChild(list);
  }

  loadPlantsData()
    .then(renderAreas)
    .catch(function () {
      target.innerHTML = "";
      status.textContent = "エリア構成の読み込みに失敗しました。";
      target.appendChild(
        makeNote("data/plants.json または埋め込みデータを読み込めると、エリアごとのツリーを表示できます。")
      );
    });
})();