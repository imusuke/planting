(function () {
  "use strict";

  var tbody = document.getElementById("plant-table-body");
  if (!tbody) return;

  function renderTable(data) {
    tbody.innerHTML = "";
    var areas = data.areas || [];
    areas.forEach(function (area) {
      var tr = document.createElement("tr");
      var tdArea = document.createElement("td");
      tdArea.textContent = area.label;

      var tdPlants = document.createElement("td");
      tdPlants.className = "plant-table-plants";

      if (!area.plants || area.plants.length === 0) {
        var empty = document.createElement("span");
        empty.className = "plant-empty";
        empty.textContent = "（未登録）";
        tdPlants.appendChild(empty);
        var dot = document.createTextNode(" · ");
        tdPlants.appendChild(dot);
        var aOnly = document.createElement("a");
        aOnly.className = "plant-record-link";
        aOnly.href = "growth.html?area=" + encodeURIComponent(area.id);
        aOnly.textContent = "このエリアで記録";
        aOnly.setAttribute("title", area.label + "の成長記録を追加");
        tdPlants.appendChild(aOnly);
      } else {
        area.plants.forEach(function (p, i) {
          if (i > 0) {
            var sep = document.createElement("span");
            sep.className = "plant-sep";
            sep.textContent = "、";
            tdPlants.appendChild(sep);
          }
          var a = document.createElement("a");
          a.className = "plant-record-link";
          a.href =
            "growth.html?area=" +
            encodeURIComponent(area.id) +
            "&plant=" +
            encodeURIComponent(p);
          a.textContent = p;
          a.setAttribute("title", p + "の成長記録を追加");
          tdPlants.appendChild(a);
        });
      }

      tr.appendChild(tdArea);
      tr.appendChild(tdPlants);
      tbody.appendChild(tr);
    });
  }

  function readEmbeddedPlants() {
    var el = document.getElementById("plants-embed");
    if (!el || !el.textContent.trim()) {
      return null;
    }
    try {
      return JSON.parse(el.textContent.trim());
    } catch (e) {
      return null;
    }
  }

  fetch("/api/plants", { cache: "no-store" })
    .then(function (res) {
      if (!res.ok) throw new Error("api plants");
      return res.json();
    })
    .then(function (data) {
      if (!data || !Array.isArray(data.areas)) throw new Error("bad shape");
      return { areas: data.areas };
    })
    .catch(function () {
      return fetch("data/plants.json", { cache: "no-store" })
        .then(function (res) {
          if (!res.ok) throw new Error("bad status");
          return res.json();
        });
    })
    .catch(function () {
      var embedded = readEmbeddedPlants();
      if (embedded) return embedded;
      throw new Error("no data");
    })
    .then(function (data) {
      renderTable(data);
    })
    .catch(function () {
      tbody.innerHTML = "";
      var tr = document.createElement("tr");
      var td = document.createElement("td");
      td.colSpan = 2;
      td.className = "plant-load-error";
      td.innerHTML =
        "表を読み込めませんでした。<code>data/plants.json</code> を確認するか、<code>index.html</code> 内の <code>plants-embed</code> を <code>plants.json</code> と同じ内容に更新してください。";
      tr.appendChild(td);
      tbody.appendChild(tr);
    });
})();
