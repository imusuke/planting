(function () {
  "use strict";

  var API_GROWTH_IMAGE = "/api/growth-image";
  var API_GROWTH = "/api/growth";
  var GROWTH_SNAPSHOT_JSON = "./data/growth-snapshot.json";

  var root = document.getElementById("area-detail-root");
  var titleEl = document.getElementById("area-detail-title");
  var crumbEl = document.getElementById("area-detail-breadcrumb-current");
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

  function readEmbeddedAreaDetails() {
    var el = document.getElementById("area-details-embed");
    if (!el || !el.textContent.trim()) return null;
    try {
      return JSON.parse(el.textContent.trim());
    } catch (e) {
      return null;
    }
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

  function growthImageSlots(r) {
    if (!r) return [];
    if (r.images && Array.isArray(r.images) && r.images.length) {
      return r.images.map(function (im) {
        if (!im || typeof im !== "object") return {};
        return {
          imageUrl: im.imageUrl || null,
          imagePathname: im.imagePathname || null,
          localSnapshotImage: im.localSnapshotImage || null,
          memo: im.memo || "",
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
      } catch (e0) {
        return p;
      }
    }
    if (slot.imagePathname) {
      return API_GROWTH_IMAGE + "?pathname=" + encodeURIComponent(slot.imagePathname);
    }
    return slot.imageUrl || null;
  }

  function loadGrowthRecordsList() {
    return fetch(API_GROWTH, {
      headers: { Accept: "application/json" },
    })
      .then(function (res) {
        if (!res.ok) throw new Error("growth bad");
        return res.json();
      })
      .then(function (data) {
        return Array.isArray(data.records) ? data.records : [];
      })
      .catch(function () {
        return fetch(GROWTH_SNAPSHOT_JSON, { cache: "no-store" })
          .then(function (res) {
            if (!res.ok) return null;
            return res.json();
          })
          .then(function (data) {
            return data && Array.isArray(data.records) ? data.records : [];
          })
          .catch(function () {
            return [];
          });
      });
  }

  function loadAreaDetailsData() {
    function pickEntries(fromNet, fromEmb) {
      var a = Array.isArray(fromNet) ? fromNet : [];
      var b = Array.isArray(fromEmb) ? fromEmb : [];
      if (b.length > a.length) return b;
      return a.length ? a : b;
    }
    return fetch("/api/area-details", {
      headers: { Accept: "application/json" },
      cache: "no-store",
    })
      .then(function (res) {
        if (!res.ok) throw new Error("api");
        return res.json();
      })
      .then(function (data) {
        if (!data || !Array.isArray(data.entries)) throw new Error("shape");
        return data.entries;
      })
      .catch(function () {
        return loadJson("data/area-details.json")
          .then(function (data) {
            var fromNet = data && Array.isArray(data.entries) ? data.entries : [];
            var emb = readEmbeddedAreaDetails();
            var fromEmb = emb && Array.isArray(emb.entries) ? emb.entries : [];
            return pickEntries(fromNet, fromEmb);
          })
          .catch(function () {
            var embedded = readEmbeddedAreaDetails();
            if (embedded && Array.isArray(embedded.entries)) {
              return embedded.entries;
            }
            return [];
          });
      });
  }

  function findAreaEntry(entries, areaId) {
    if (!Array.isArray(entries)) return null;
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      if (e && e.areaId === areaId) return e;
    }
    return null;
  }

  function normalizeStaticImageSlot(im) {
    if (!im || typeof im !== "object") return null;
    return {
      imageUrl: im.imageUrl || im.url || null,
      imagePathname: im.imagePathname || null,
      localSnapshotImage: im.localSnapshotImage || im.localPath || null,
      caption: String(im.caption || "").trim(),
    };
  }

  function collectPhotosForArea(records, areaId) {
    var rows = [];
    if (!Array.isArray(records) || !areaId) return rows;
    for (var ri = 0; ri < records.length; ri++) {
      var r = records[ri];
      if (!r || String(r.areaId || "").trim() !== String(areaId).trim()) continue;
      var slots = growthImageSlots(r);
      for (var si = 0; si < slots.length; si++) {
        var url = growthImageSrcFromSlot(slots[si]);
        if (!url) continue;
        rows.push({
          recordedAt: r.recordedAt || "",
          url: url,
          slot: slots[si],
          recordNote: String(r.note || "").trim(),
        });
      }
    }
    rows.sort(function (a, b) {
      return (b.recordedAt || "").localeCompare(a.recordedAt || "");
    });
    var seen = {};
    var out = [];
    for (var j = 0; j < rows.length; j++) {
      var u = rows[j].url;
      if (seen[u]) continue;
      seen[u] = true;
      out.push(rows[j]);
    }
    return out;
  }

  function renderStaticAreaPhotosSection(areaLabel, images) {
    var section = document.createElement("section");
    section.className = "plant-detail-photos area-detail-static-photos";
    var h = document.createElement("h2");
    h.className = "plant-detail-photos-heading";
    h.textContent = "エリア全体の写真（登録データ）";
    section.appendChild(h);

    var list = [];
    if (Array.isArray(images)) {
      for (var i = 0; i < images.length; i++) {
        var slot = normalizeStaticImageSlot(images[i]);
        if (!slot) continue;
        var url = growthImageSrcFromSlot(slot);
        if (!url) continue;
        list.push({ url: url, caption: slot.caption, slot: slot });
      }
    }

    if (list.length === 0) {
      var empty = document.createElement("p");
      empty.className = "plant-detail-photos-empty";
      empty.textContent =
        "まだ登録がありません。本番では area-edit.html から写真をアップロードできます。リポジトリのみのときは data/area-details.json の images を編集し、npm run embed:plants で埋め込みを更新してください。";
      section.appendChild(empty);
      return section;
    }

    var grid = document.createElement("div");
    grid.className = "plant-detail-photos-grid";
    for (var k = 0; k < list.length; k++) {
      (function (it) {
        var fig = document.createElement("figure");
        fig.className = "plant-detail-photo-figure";
        var img = document.createElement("img");
        img.className = "plant-detail-photo-img";
        img.src = it.url;
        img.alt = (areaLabel || "エリア") + "の全体写真";
        img.loading = "lazy";
        img.decoding = "async";
        img.referrerPolicy = "no-referrer";
        img.addEventListener("error", function onStaticErr() {
          img.removeEventListener("error", onStaticErr);
          if (img.dataset.areaPhotoFb === "1") return;
          var sl = it.slot;
          if (!sl || !sl.localSnapshotImage) return;
          var fb = sl.imageUrl || "";
          if (!fb && sl.imagePathname) {
            fb = API_GROWTH_IMAGE + "?pathname=" + encodeURIComponent(sl.imagePathname);
          }
          if (fb) {
            img.dataset.areaPhotoFb = "1";
            img.src = fb;
          }
        });
        fig.appendChild(img);
        var cap = document.createElement("figcaption");
        cap.className = "plant-detail-photo-date";
        cap.textContent = it.caption || "—";
        fig.appendChild(cap);
        grid.appendChild(fig);
      })(list[k]);
    }
    section.appendChild(grid);
    return section;
  }

  function renderGrowthPhotosSection(areaLabel, areaId, records) {
    var section = document.createElement("section");
    section.className = "plant-detail-photos";
    var h = document.createElement("h2");
    h.className = "plant-detail-photos-heading";
    h.textContent = "このエリアの成長記録の写真";
    section.appendChild(h);

    var items = collectPhotosForArea(records, areaId);
    if (items.length === 0) {
      var empty = document.createElement("p");
      empty.className = "plant-detail-photos-empty";
      empty.textContent =
        "このエリアに紐づく記録写真はまだありません。成長記録でエリアを選んで写真を追加すると、ここに表示されます。";
      section.appendChild(empty);
      return section;
    }

    var grid = document.createElement("div");
    grid.className = "plant-detail-photos-grid";
    for (var k = 0; k < items.length; k++) {
      (function (it) {
        var fig = document.createElement("figure");
        fig.className = "plant-detail-photo-figure";
        var img = document.createElement("img");
        img.className = "plant-detail-photo-img";
        img.src = it.url;
        img.alt = (areaLabel || "エリア") + "の記録写真";
        img.loading = "lazy";
        img.decoding = "async";
        img.referrerPolicy = "no-referrer";
        img.addEventListener("error", function onAreaPhotoErr() {
          img.removeEventListener("error", onAreaPhotoErr);
          if (img.dataset.areaPhotoFb === "1") return;
          var sl = it.slot;
          if (!sl || !sl.localSnapshotImage) return;
          var fb = sl.imageUrl || "";
          if (!fb && sl.imagePathname) {
            fb = API_GROWTH_IMAGE + "?pathname=" + encodeURIComponent(sl.imagePathname);
          }
          if (fb) {
            img.dataset.areaPhotoFb = "1";
            img.src = fb;
          }
        });
        fig.appendChild(img);
        var cap = document.createElement("figcaption");
        cap.className = "plant-detail-photo-date";
        var line1 = (it.recordedAt || "").slice(0, 10) || "—";
        var memo = String((it.slot && it.slot.memo) || "").trim();
        var note = it.recordNote;
        var sub = memo || note || "";
        cap.textContent = sub ? line1 + " — " + sub : line1;
        fig.appendChild(cap);
        grid.appendChild(fig);
      })(items[k]);
    }
    section.appendChild(grid);

    var more = document.createElement("p");
    more.className = "plant-detail-photos-more";
    var a = document.createElement("a");
    a.href = "./index.html?view=timeline&area=" + encodeURIComponent(areaId);
    a.className = "plant-detail-link";
    a.textContent = "成長記録でエリア別・時系列を開く";
    more.appendChild(a);
    section.appendChild(more);

    return section;
  }

  function clearRoot() {
    root.innerHTML = "";
  }

  function renderError(message) {
    document.title = "エリアの詳細 — 植栽メモ";
    clearRoot();
    var p = document.createElement("p");
    p.className = "plant-detail-error";
    p.textContent = message;
    root.appendChild(p);
    titleEl.textContent = "エリアの詳細";
    if (crumbEl) crumbEl.textContent = "エラー";
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

  function renderPlantList(area) {
    var section = document.createElement("section");
    section.className = "area-detail-plants";
    var h = document.createElement("h2");
    h.className = "area-detail-plants-heading";
    h.textContent = "このエリアの植栽";
    section.appendChild(h);
    var ul = document.createElement("ul");
    ul.className = "area-detail-plants-list";
    var plants = area.plants || [];
    if (plants.length === 0) {
      var li = document.createElement("li");
      li.className = "area-detail-plants-empty";
      li.textContent = "（植栽マスタに未登録）";
      ul.appendChild(li);
    } else {
      plants.forEach(function (pname) {
        var li = document.createElement("li");
        var a = document.createElement("a");
        a.href =
          "plant.html?area=" +
          encodeURIComponent(area.id) +
          "&plant=" +
          encodeURIComponent(pname);
        a.textContent = pname;
        a.className = "plant-detail-link";
        li.appendChild(a);
        var span = document.createElement("span");
        span.className = "area-detail-plants-actions";
        span.appendChild(document.createTextNode(" "));
        var g = document.createElement("a");
        g.href =
          "growth-edit.html?area=" +
          encodeURIComponent(area.id) +
          "&plant=" +
          encodeURIComponent(pname);
        g.textContent = "記録";
        g.className = "plant-record-link";
        span.appendChild(g);
        li.appendChild(span);
        ul.appendChild(li);
      });
    }
    section.appendChild(ul);
    return section;
  }

  function renderPage(area, entry, growthRecords) {
    clearRoot();
    var label = area.label || area.id;
    document.title = label + "（エリア） — 植栽メモ";
    titleEl.textContent = label;
    if (crumbEl) crumbEl.textContent = label;
    var editLink = document.getElementById("area-detail-edit-link");
    if (editLink && area && area.id) {
      editLink.href = "./area-edit.html?area=" + encodeURIComponent(area.id);
    }

    if (entry && entry.summary) {
      var sum = document.createElement("p");
      sum.className = "plant-detail-summary";
      sum.textContent = entry.summary;
      root.appendChild(sum);
    }

    root.appendChild(
      renderStaticAreaPhotosSection(label, entry && entry.images ? entry.images : [])
    );
    root.appendChild(renderGrowthPhotosSection(label, area.id, growthRecords || []));

    var bodyWrap = document.createElement("div");
    bodyWrap.className = "plant-detail-body";
    if (entry && entry.body) {
      renderBody(bodyWrap, entry.body);
    }
    if (!bodyWrap.childElementCount) {
      var hint = document.createElement("p");
      hint.className = "plant-detail-placeholder";
      hint.textContent =
        "エリアの説明メモはまだありません。area-edit.html で編集するか、data/area-details.json に summary・body を追加してください。";
      bodyWrap.appendChild(hint);
    }
    root.appendChild(bodyWrap);

    root.appendChild(renderPlantList(area));

    var actions = document.createElement("p");
    actions.className = "plant-detail-actions";
    var aRecord = document.createElement("a");
    aRecord.className = "plant-detail-cta";
    aRecord.href = "./growth-edit.html?area=" + encodeURIComponent(area.id);
    aRecord.textContent = "このエリアで成長記録を追加（植栽は記録画面で選択）";
    actions.appendChild(aRecord);
    root.appendChild(actions);
  }

  var params = new URLSearchParams(window.location.search);
  var areaId = (params.get("area") || "").trim();

  if (!areaId) {
    renderError(
      "URL にエリアIDが必要です。例: area.html?area=entrance （植栽一覧のエリア名から開けます）"
    );
    return;
  }

  Promise.all([loadPlantsData(), loadAreaDetailsData(), loadGrowthRecordsList()])
    .then(function (results) {
      var plantsData = results[0];
      var detailEntries = results[1];
      var growthRecords = results[2] || [];
      var areas = plantsData.areas || [];
      var area = areas.find(function (a) {
        return a && a.id === areaId;
      });
      if (!area) {
        renderError("指定されたエリアが見つかりません。");
        return;
      }
      var entry = findAreaEntry(detailEntries, areaId);
      renderPage(area, entry, growthRecords);
    })
    .catch(function () {
      renderError("データを読み込めませんでした。data/plants.json またはネットワークを確認してください。");
    });
})();
