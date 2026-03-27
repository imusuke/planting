(function () {
  "use strict";

  var LS_CLOUD_TOKEN = "growthCloudToken";
  var tbody = document.getElementById("plant-table-body");
  if (!tbody) return;

  var latestAreas = [];

  function readToken() {
    try {
      return localStorage.getItem(LS_CLOUD_TOKEN) || "";
    } catch (e) {
      return "";
    }
  }

  function cloudHeaders() {
    var h = { Accept: "application/json", "Content-Type": "application/json" };
    var t = readToken();
    if (t) h["x-growth-token"] = t;
    return h;
  }

  function ensureToken() {
    var token = readToken();
    if (token) return token;
    var entered = window.prompt("削除にはトークンが必要です。トークンを入力してください。", "");
    if (!entered) return "";
    token = String(entered).trim();
    if (!token) return "";
    try {
      localStorage.setItem(LS_CLOUD_TOKEN, token);
    } catch (e) {}
    return token;
  }

  function saveAreasCatalog(areas) {
    return fetch("/api/plants", {
      method: "PUT",
      headers: cloudHeaders(),
      body: JSON.stringify({
        areas: areas,
        renames: [],
        areaIdMigrations: [],
      }),
    }).then(function (res) {
      if (res.status === 401) {
        throw new Error("トークンが無効です。再入力してください。");
      }
      if (!res.ok) {
        return res
          .json()
          .catch(function () {
            return {};
          })
          .then(function (j) {
            throw new Error(j.error || ("保存に失敗しました (HTTP " + res.status + ")"));
          });
      }
      return res.json();
    });
  }

  function removePlantFromArea(areaId, plantName, buttonEl) {
    if (!areaId || !plantName) return;
    if (!window.confirm("「" + plantName + "」を一覧から削除しますか？")) return;
    if (!ensureToken()) return;

    if (buttonEl) buttonEl.disabled = true;
    var nextAreas = (latestAreas || []).map(function (a) {
      if (!a || a.id !== areaId) return a;
      return Object.assign({}, a, {
        plants: (a.plants || []).filter(function (p) {
          return p !== plantName;
        }),
      });
    });

    saveAreasCatalog(nextAreas)
      .then(function () {
        latestAreas = nextAreas;
        renderTable({ areas: nextAreas });
      })
      .catch(function (err) {
        window.alert(err && err.message ? err.message : "削除に失敗しました。");
      })
      .finally(function () {
        if (buttonEl) buttonEl.disabled = false;
      });
  }

  function renderTable(data) {
    tbody.innerHTML = "";
    var areas = data.areas || [];
    areas.forEach(function (area) {
      var tr = document.createElement("tr");
      var tdArea = document.createElement("td");
      var areaPage = document.createElement("a");
      areaPage.href = "area.html?area=" + encodeURIComponent(area.id);
      areaPage.className = "plant-area-link";
      areaPage.textContent = area.label;
      tdArea.appendChild(areaPage);

      var tdPlants = document.createElement("td");
      tdPlants.className = "plant-table-plants";

      if (!area.plants || area.plants.length === 0) {
        var empty = document.createElement("span");
        empty.className = "plant-empty";
        empty.textContent = "（未登録）";
        tdPlants.appendChild(empty);
      } else {
        area.plants.forEach(function (p, i) {
          if (i > 0) {
            var sep = document.createElement("span");
            sep.className = "plant-sep";
            sep.textContent = " ・ ";
            tdPlants.appendChild(sep);
          }

          var group = document.createElement("span");
          group.className = "plant-table-name-group";

          var a = document.createElement("a");
          a.className = "plant-record-link";
          a.href =
            "growth-edit.html?area=" +
            encodeURIComponent(area.id) +
            "&plant=" +
            encodeURIComponent(p);
          a.textContent = p;
          group.appendChild(a);

          var wrapDetail = document.createElement("span");
          wrapDetail.className = "plant-table-detail-wrap";
          wrapDetail.appendChild(document.createTextNode(" "));

          var d = document.createElement("a");
          d.className = "plant-detail-link";
          d.href =
            "plant.html?area=" +
            encodeURIComponent(area.id) +
            "&plant=" +
            encodeURIComponent(p);
          d.textContent = "詳細";
          wrapDetail.appendChild(d);

          wrapDetail.appendChild(document.createTextNode(" "));
          var del = document.createElement("button");
          del.type = "button";
          del.className = "plant-delete-btn";
          del.textContent = "削除";
          del.addEventListener("click", function () {
            removePlantFromArea(area.id, p, del);
          });
          wrapDetail.appendChild(del);

          group.appendChild(wrapDetail);
          tdPlants.appendChild(group);
        });
      }

      tr.appendChild(tdArea);
      tr.appendChild(tdPlants);
      tbody.appendChild(tr);
    });
  }

  function readEmbeddedPlants() {
    var el = document.getElementById("plants-embed");
    if (!el || !el.textContent.trim()) return null;
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
      return fetch("data/plants.json", { cache: "no-store" }).then(function (res) {
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
      latestAreas = Array.isArray(data.areas) ? data.areas.slice() : [];
      renderTable(data);
    })
    .catch(function () {
      tbody.innerHTML = "";
      var tr = document.createElement("tr");
      var td = document.createElement("td");
      td.colSpan = 2;
      td.className = "plant-load-error";
      td.textContent = "一覧データを読み込めませんでした。";
      tr.appendChild(td);
      tbody.appendChild(tr);
    });
})();
