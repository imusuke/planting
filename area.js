(function () {
  "use strict";

  var API_GROWTH_IMAGE = "/api/growth-image";
  var API_GROWTH = "/api/growth";
  var API_AREA_GROWTH = "/api/area-growth";
  var LS_CLOUD_TOKEN = "growthCloudToken";
  var GROWTH_SNAPSHOT_JSON = "./data/growth-snapshot.json";

  var root = document.getElementById("area-detail-root");
  var titleEl = document.getElementById("area-detail-title");
  var crumbEl = document.getElementById("area-detail-breadcrumb-current");
  var growthEditLinkEl = document.getElementById("area-detail-growth-edit-link");
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

  function cloudHeadersForAreaWrite() {
    var h = { Accept: "application/json", "Content-Type": "application/json" };
    var t = "";
    try {
      t = localStorage.getItem(LS_CLOUD_TOKEN) || "";
    } catch (e) {
      t = "";
    }
    if (t) h["x-growth-token"] = t;
    return h;
  }

  function createClientId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return "mv_" + Date.now() + "_" + Math.floor(Math.random() * 1e9);
  }

  function loadAreaGrowthRecordsList() {
    return fetch(API_AREA_GROWTH, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    })
      .then(function (res) {
        if (!res.ok) throw new Error("area growth bad");
        return res.json();
      })
      .then(function (data) {
        return Array.isArray(data.records) ? data.records : [];
      })
      .catch(function () {
        return [];
      });
  }

  function loadPlantGrowthRecordsList() {
    return fetch(API_GROWTH, {
      headers: { Accept: "application/json" },
      cache: "no-store",
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
          recordId: r.id || null,
          slotIndex: si,
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

  function renderPhotoRecordsSection(areaLabel, areaId, records, options) {
    var opts = options || {};
    var section = document.createElement("section");
    section.className = "plant-detail-photos";
    var h = document.createElement("h2");
    h.className = "plant-detail-photos-heading";
    h.textContent = opts.heading || "写真";
    section.appendChild(h);

    var items = collectPhotosForArea(records, areaId);
    if (items.length === 0) {
      var empty = document.createElement("p");
      empty.className = "plant-detail-photos-empty";
      empty.textContent = opts.emptyText || "まだ写真がありません。";
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

        if (opts.allowImportFromPlant && typeof opts.onImportPhoto === "function") {
          var importBtn = document.createElement("button");
          importBtn.type = "button";
          importBtn.className = "area-photo-import-btn";
          importBtn.textContent = "エリア写真へ移動";
          importBtn.addEventListener("click", function () {
            opts.onImportPhoto(it, importBtn);
          });
          fig.appendChild(importBtn);
        }
        if (opts.allowMoveToPlant && typeof opts.onMovePhoto === "function") {
          var moveBtn = document.createElement("button");
          moveBtn.type = "button";
          moveBtn.className = "area-photo-import-btn area-photo-move-btn";
          moveBtn.textContent = "植栽写真へ移動";
          moveBtn.addEventListener("click", function () {
            opts.onMovePhoto(it, moveBtn);
          });
          fig.appendChild(moveBtn);
        }
        if (opts.allowDeletePhoto && typeof opts.onDeletePhoto === "function") {
          var delBtn = document.createElement("button");
          delBtn.type = "button";
          delBtn.className = "area-photo-import-btn area-photo-delete-btn";
          delBtn.textContent = "削除";
          delBtn.addEventListener("click", function () {
            opts.onDeletePhoto(it, delBtn);
          });
          fig.appendChild(delBtn);
        }
        grid.appendChild(fig);
      })(items[k]);
    }
    section.appendChild(grid);

    var more = document.createElement("p");
    more.className = "plant-detail-photos-more";
    var a = document.createElement("a");
    a.href = opts.ctaHref || "./area-edit.html?area=" + encodeURIComponent(areaId);
    a.className = "plant-detail-link";
    a.textContent = opts.ctaText || "写真を追加する";
    more.appendChild(a);
    section.appendChild(more);

    return section;
  }

  function renderPhotoSourceSwitch(onSelect) {
    var wrap = document.createElement("div");
    wrap.className = "area-photo-switch";
    var btnArea = document.createElement("button");
    var btnPlant = document.createElement("button");
    btnArea.type = "button";
    btnPlant.type = "button";
    btnArea.className = "area-photo-switch-btn is-active";
    btnPlant.className = "area-photo-switch-btn";
    btnArea.textContent = "エリア写真";
    btnPlant.textContent = "植栽写真";
    btnArea.setAttribute("aria-pressed", "true");
    btnPlant.setAttribute("aria-pressed", "false");

    function select(which) {
      var isArea = which === "area";
      btnArea.className = "area-photo-switch-btn" + (isArea ? " is-active" : "");
      btnPlant.className = "area-photo-switch-btn" + (!isArea ? " is-active" : "");
      btnArea.setAttribute("aria-pressed", isArea ? "true" : "false");
      btnPlant.setAttribute("aria-pressed", !isArea ? "true" : "false");
      onSelect(which);
    }

    btnArea.addEventListener("click", function () {
      select("area");
    });
    btnPlant.addEventListener("click", function () {
      select("plant");
    });
    wrap.appendChild(btnArea);
    wrap.appendChild(btnPlant);
    return wrap;
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

  function renderPage(area, entry, areaGrowthRecords, plantGrowthRecords) {
    clearRoot();
    var label = area.label || area.id;
    document.title = label + "（エリア） — 植栽メモ";
    titleEl.textContent = label;
    if (crumbEl) crumbEl.textContent = label;
    var editLink = document.getElementById("area-detail-edit-link");
    if (editLink && area && area.id) {
      editLink.href = "./area-edit.html?area=" + encodeURIComponent(area.id);
      editLink.textContent = "このエリアを編集";
    }
    if (growthEditLinkEl && area && area.id) {
      growthEditLinkEl.href = "./growth-edit.html?area=" + encodeURIComponent(area.id);
      growthEditLinkEl.textContent = "このエリアで植栽記録を追加・編集";
    }

    if (entry && entry.summary) {
      var sum = document.createElement("p");
      sum.className = "plant-detail-summary";
      sum.textContent = entry.summary;
      root.appendChild(sum);
    }

    var photoStatus = document.createElement("p");
    photoStatus.className = "plant-detail-photos-more";
    photoStatus.style.marginTop = "0";
    photoStatus.style.display = "none";
    root.appendChild(photoStatus);

    function setPhotoStatus(msg, isError) {
      if (!msg) {
        photoStatus.style.display = "none";
        photoStatus.textContent = "";
        return;
      }
      photoStatus.style.display = "block";
      photoStatus.textContent = msg;
      photoStatus.style.color = isError ? "#b00020" : "";
    }

    function importPlantPhotoToArea(item, buttonEl) {
      if (!item || !item.slot) {
        setPhotoStatus("取り込み対象の写真情報がありません。", true);
        return;
      }
      var src = {
        imagePathname: item.slot.imagePathname || null,
        imageUrl: item.slot.imageUrl || null,
      };
      if (!src.imagePathname && !src.imageUrl) {
        setPhotoStatus("この写真は取り込みできません。", true);
        return;
      }
      if (buttonEl) buttonEl.disabled = true;
      var createdAreaRecord = null;
      setPhotoStatus("移動中...", false);
      fetch(API_AREA_GROWTH, {
        method: "POST",
        headers: cloudHeadersForAreaWrite(),
        body: JSON.stringify({
          areaId: area.id,
          areaLabel: area.label || area.id,
          recordedAt: (item.recordedAt || "").slice(0, 10),
          note: item.recordNote || "",
          sourceImages: [src],
          imageMemos: [String((item.slot && item.slot.memo) || "")],
        }),
      })
        .then(function (res) {
          if (res.status === 401) {
            throw new Error("トークンが必要です。先に編集ページでトークンを保存してください。");
          }
          if (!res.ok) {
            return res
              .json()
              .catch(function () {
                return {};
              })
              .then(function (j) {
                throw new Error(j.error || ("移動に失敗しました (HTTP " + res.status + ")"));
              });
          }
          return res.json();
        })
        .then(function (payload) {
          createdAreaRecord = payload && payload.record ? payload.record : null;
          return removeMovedPhotoFromPlantRecord(item);
        })
        .then(function () {
          if (createdAreaRecord && Array.isArray(areaGrowthRecords)) {
            areaGrowthRecords.unshift(createdAreaRecord);
          }
          setPhotoStatus("植栽写真をエリア写真へ移動しました。表示反映のため再読み込みします。", false);
          setTimeout(function () {
            window.location.reload();
          }, 250);
        })
        .catch(function (err) {
          setPhotoStatus(err && err.message ? err.message : "移動に失敗しました。", true);
        })
        .finally(function () {
          if (buttonEl) buttonEl.disabled = false;
        });
    }

    function removeMovedPhotoFromPlantRecord(item) {
      var recId = item && item.recordId ? String(item.recordId) : "";
      if (!recId) return Promise.resolve();
      var rec = (plantGrowthRecords || []).find(function (r) {
        return r && String(r.id) === recId;
      });
      if (!rec) return Promise.resolve();
      var imgs = growthImageSlots(rec);
      var keep = [];
      for (var i = 0; i < imgs.length; i++) {
        if (i === item.slotIndex) continue;
        keep.push(imgs[i]);
      }
      var noteText = String(rec.note || "");
      if (!keep.length && !noteText.trim()) {
        return fetch(API_GROWTH + "?id=" + encodeURIComponent(recId), {
          method: "DELETE",
          headers: cloudHeadersForAreaWrite(),
        }).then(function (res) {
          if (!res.ok) {
            throw new Error("移動後の植栽写真削除に失敗しました。");
          }
        });
      }
      var srcImages = keep.map(function (im) {
        return {
          imagePathname: im && im.imagePathname ? im.imagePathname : null,
          imageUrl: im && im.imageUrl ? im.imageUrl : null,
        };
      });
      var memos = keep.map(function (im) {
        return String((im && im.memo) || "");
      });
      return fetch(API_GROWTH, {
        method: "POST",
        headers: cloudHeadersForAreaWrite(),
        body: JSON.stringify({
          id: recId,
          recordedAt: rec.recordedAt || "",
          areaId: rec.areaId || area.id,
          areaLabel: rec.areaLabel || area.label || area.id,
          plants: Array.isArray(rec.plants) ? rec.plants : [],
          note: noteText,
          createdAt: rec.createdAt || new Date().toISOString(),
          sourceImages: srcImages,
          imageMemos: memos,
        }),
      }).then(function (res) {
        if (!res.ok) {
          throw new Error("移動後の植栽写真更新に失敗しました。");
        }
      });
    }

    function chooseTargetPlantName() {
      var plants = Array.isArray(area.plants) ? area.plants.slice() : [];
      if (!plants.length) return null;
      if (plants.length === 1) return plants[0];
      var guide = "移動先の植栽名を入力してください。\n";
      for (var i = 0; i < plants.length; i++) {
        guide += i + 1 + ". " + plants[i] + "\n";
      }
      var ans = window.prompt(guide, plants[0]);
      if (ans == null) return null;
      var t = String(ans).trim();
      if (!t) return null;
      var asNum = parseInt(t, 10);
      if (!isNaN(asNum) && asNum >= 1 && asNum <= plants.length) {
        return plants[asNum - 1];
      }
      return plants.indexOf(t) !== -1 ? t : null;
    }

    function removeMovedPhotoFromAreaRecord(item) {
      var recId = item && item.recordId ? String(item.recordId) : "";
      if (!recId) return Promise.resolve();
      var rec = (areaGrowthRecords || []).find(function (r) {
        return r && String(r.id) === recId;
      });
      if (!rec) return Promise.resolve();
      var imgs = Array.isArray(rec.images) ? rec.images.slice() : [];
      var keep = [];
      for (var i = 0; i < imgs.length; i++) {
        if (i === item.slotIndex) continue;
        keep.push(imgs[i]);
      }
      var noteText = String(rec.note || "");
      if (!keep.length && !noteText.trim()) {
        return fetch(API_AREA_GROWTH + "?id=" + encodeURIComponent(recId), {
          method: "DELETE",
          headers: cloudHeadersForAreaWrite(),
        }).then(function (res) {
          if (!res.ok) {
            throw new Error("移動後の元写真削除に失敗しました。");
          }
        });
      }
      var srcImages = keep.map(function (im) {
        return {
          imagePathname: im && im.imagePathname ? im.imagePathname : null,
          imageUrl: im && im.imageUrl ? im.imageUrl : null,
        };
      });
      var memos = keep.map(function (im) {
        return String((im && im.memo) || "");
      });
      return fetch(API_AREA_GROWTH, {
        method: "POST",
        headers: cloudHeadersForAreaWrite(),
        body: JSON.stringify({
          id: recId,
          areaId: rec.areaId || area.id,
          areaLabel: rec.areaLabel || area.label || area.id,
          recordedAt: (rec.recordedAt || "").slice(0, 10),
          note: noteText,
          sourceImages: srcImages,
          imageMemos: memos,
        }),
      }).then(function (res) {
        if (!res.ok) {
          throw new Error("移動後のエリア記録更新に失敗しました。");
        }
      });
    }

    function moveAreaPhotoToPlant(item, buttonEl) {
      if (!item || !item.slot) {
        setPhotoStatus("移動対象の写真情報がありません。", true);
        return;
      }
      var targetPlant = chooseTargetPlantName();
      if (!targetPlant) {
        setPhotoStatus("移動先の植栽が選択されませんでした。", true);
        return;
      }
      var src = {
        imagePathname: item.slot.imagePathname || null,
        imageUrl: item.slot.imageUrl || null,
      };
      if (!src.imagePathname && !src.imageUrl) {
        setPhotoStatus("この写真は移動できません。", true);
        return;
      }
      if (buttonEl) buttonEl.disabled = true;
      setPhotoStatus("植栽写真へ移動中...", false);
      var day = (item.recordedAt || "").slice(0, 10) || new Date().toISOString().slice(0, 10);
      fetch(API_GROWTH, {
        method: "POST",
        headers: cloudHeadersForAreaWrite(),
        body: JSON.stringify({
          id: createClientId(),
          recordedAt: day + "T12:00:00.000Z",
          areaId: area.id,
          areaLabel: area.label || area.id,
          plants: [targetPlant],
          note: item.recordNote || "",
          createdAt: new Date().toISOString(),
          sourceImages: [src],
          imageMemos: [String((item.slot && item.slot.memo) || "")],
        }),
      })
        .then(function (res) {
          if (res.status === 401) {
            throw new Error("トークンが必要です。先に編集ページでトークンを保存してください。");
          }
          if (!res.ok) {
            return res
              .json()
              .catch(function () {
                return {};
              })
              .then(function (j) {
                throw new Error(j.error || ("移動に失敗しました (HTTP " + res.status + ")"));
              });
          }
          return res.json();
        })
        .then(function () {
          return removeMovedPhotoFromAreaRecord(item);
        })
        .then(function () {
          setPhotoStatus("植栽写真へ移動しました。ページを再読み込みすると反映されます。", false);
        })
        .catch(function (err) {
          setPhotoStatus(err && err.message ? err.message : "移動に失敗しました。", true);
        })
        .finally(function () {
          if (buttonEl) buttonEl.disabled = false;
        });
    }

    function deleteAreaPhoto(item, buttonEl) {
      if (!item || !item.slot || !item.recordId) {
        setPhotoStatus("削除対象の写真情報が見つかりません。", true);
        return;
      }
      if (!window.confirm("このエリア写真を削除しますか？")) {
        return;
      }
      if (buttonEl) buttonEl.disabled = true;
      setPhotoStatus("削除中...", false);
      fetch(
        API_AREA_GROWTH +
          "?id=" +
          encodeURIComponent(String(item.recordId)) +
          "&slot=" +
          encodeURIComponent(String(item.slotIndex)),
        {
          method: "DELETE",
          headers: cloudHeadersForAreaWrite(),
        }
      )
        .then(function (res) {
          if (res.status === 401) {
            throw new Error("トークンが無効です。ページ上部で再設定してください。");
          }
          if (!res.ok) {
            return res
              .json()
              .catch(function () {
                return {};
              })
              .then(function (j) {
                throw new Error(j.error || ("削除に失敗しました (HTTP " + res.status + ")"));
              });
          }
          return res.json();
        })
        .then(function () {
          setPhotoStatus("エリア写真を削除しました。表示反映のため再読み込みします。", false);
          setTimeout(function () {
            window.location.reload();
          }, 250);
        })
        .catch(function (err) {
          setPhotoStatus(err && err.message ? err.message : "削除に失敗しました。", true);
        })
        .finally(function () {
          if (buttonEl) buttonEl.disabled = false;
        });
    }

    function deletePlantPhoto(item, buttonEl) {
      if (!item || !item.slot || !item.recordId) {
        setPhotoStatus("削除対象の写真情報が見つかりません。", true);
        return;
      }
      if (!window.confirm("この植栽写真を削除しますか？")) {
        return;
      }
      if (buttonEl) buttonEl.disabled = true;
      setPhotoStatus("削除中...", false);
      fetch(
        API_GROWTH +
          "?id=" +
          encodeURIComponent(String(item.recordId)) +
          "&slot=" +
          encodeURIComponent(String(item.slotIndex)),
        {
          method: "DELETE",
          headers: cloudHeadersForAreaWrite(),
        }
      )
        .then(function (res) {
          if (res.status === 401) {
            throw new Error("トークンが無効です。ページ上部で再設定してください。");
          }
          if (!res.ok) {
            return res
              .json()
              .catch(function () {
                return {};
              })
              .then(function (j) {
                throw new Error(j.error || ("削除に失敗しました (HTTP " + res.status + ")"));
              });
          }
          return res.json();
        })
        .then(function () {
          setPhotoStatus("植栽写真を削除しました。表示反映のため再読み込みします。", false);
          setTimeout(function () {
            window.location.reload();
          }, 250);
        })
        .catch(function (err) {
          setPhotoStatus(err && err.message ? err.message : "削除に失敗しました。", true);
        })
        .finally(function () {
          if (buttonEl) buttonEl.disabled = false;
        });
    }

    var areaPhotoGroup = document.createElement("div");
    areaPhotoGroup.className = "area-photo-group area-photo-group-area";
    areaPhotoGroup.appendChild(
      renderStaticAreaPhotosSection(label, entry && entry.images ? entry.images : [])
    );
    areaPhotoGroup.appendChild(
      renderPhotoRecordsSection(label, area.id, areaGrowthRecords || [], {
        heading: "エリア写真の時系列",
        emptyText: "エリア写真の記録はまだありません。area-edit から追加できます。",
        ctaText: "エリア写真を追加する",
        ctaHref: "./area-edit.html?area=" + encodeURIComponent(area.id),
        allowMoveToPlant: true,
        onMovePhoto: moveAreaPhotoToPlant,
        allowDeletePhoto: true,
        onDeletePhoto: deleteAreaPhoto,
      })
    );

    var plantPhotoGroup = document.createElement("div");
    plantPhotoGroup.className = "area-photo-group area-photo-group-plant";
    plantPhotoGroup.hidden = true;
    plantPhotoGroup.appendChild(
      renderPhotoRecordsSection(label, area.id, plantGrowthRecords || [], {
        heading: "植栽写真の時系列",
        emptyText: "植栽記録の写真はまだありません。growth-edit から追加できます。",
        ctaText: "植栽写真を追加する",
        ctaHref: "./growth-edit.html?area=" + encodeURIComponent(area.id),
        allowImportFromPlant: true,
        onImportPhoto: importPlantPhotoToArea,
        allowDeletePhoto: true,
        onDeletePhoto: deletePlantPhoto,
      })
    );

    root.appendChild(
      renderPhotoSourceSwitch(function (which) {
        var showArea = which !== "plant";
        areaPhotoGroup.hidden = !showArea;
        plantPhotoGroup.hidden = showArea;
      })
    );
    root.appendChild(areaPhotoGroup);
    root.appendChild(plantPhotoGroup);

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
    aRecord.href = "./area-edit.html?area=" + encodeURIComponent(area.id);
    aRecord.textContent = "このエリアの写真記録を追加する";
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

  Promise.all([
    loadPlantsData(),
    loadAreaDetailsData(),
    loadAreaGrowthRecordsList(),
    loadPlantGrowthRecordsList(),
  ])
    .then(function (results) {
      var plantsData = results[0];
      var detailEntries = results[1];
      var areaGrowthRecords = results[2] || [];
      var plantGrowthRecords = results[3] || [];
      var areas = plantsData.areas || [];
      var area = areas.find(function (a) {
        return a && a.id === areaId;
      });
      if (!area) {
        renderError("指定されたエリアが見つかりません。");
        return;
      }
      var entry = findAreaEntry(detailEntries, areaId);
      renderPage(area, entry, areaGrowthRecords, plantGrowthRecords);
    })
    .catch(function () {
      renderError("データを読み込めませんでした。data/plants.json またはネットワークを確認してください。");
    });
})();
