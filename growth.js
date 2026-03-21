(function () {
  "use strict";

  var LS_CLOUD_TOKEN = "growthCloudToken";
  var API_GROWTH = "/api/growth";
  var MAX_IMAGE_WIDTH = 1280;
  var JPEG_QUALITY = 0.82;

  var state = {
    areas: [],
  };

  var el = {
    form: null,
    date: null,
    area: null,
    plantChecks: null,
    customPlant: null,
    photo: null,
    photoClear: null,
    submit: null,
    toast: null,
    filterArea: null,
    filterPlant: null,
    feed: null,
    exportBtn: null,
    cloudToken: null,
    cloudTokenSave: null,
    cloudStatus: null,
  };

  function $(id) {
    return document.getElementById(id);
  }

  function showToast(message, isError) {
    if (!el.toast) return;
    el.toast.textContent = message;
    el.toast.className =
      "growth-toast is-visible " + (isError ? "growth-toast--err" : "growth-toast--ok");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () {
      el.toast.classList.remove("is-visible");
    }, 4200);
  }

  function cloudHeaders(jsonBody) {
    var h = { Accept: "application/json" };
    if (jsonBody) h["Content-Type"] = "application/json";
    var t = localStorage.getItem(LS_CLOUD_TOKEN);
    if (t) h["x-growth-token"] = t;
    return h;
  }

  function updateCloudStatus(text) {
    if (el.cloudStatus) el.cloudStatus.textContent = text || "";
  }

  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return "id-" + Date.now() + "-" + Math.random().toString(16).slice(2);
  }

  function loadImageFile(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error("画像を読み込めませんでした"));
      };
      img.src = url;
    });
  }

  function imageToJpegBlob(img) {
    var w = img.naturalWidth;
    var h = img.naturalHeight;
    if (!w || !h) throw new Error("画像サイズが無効です");

    var scale = w > MAX_IMAGE_WIDTH ? MAX_IMAGE_WIDTH / w : 1;
    var cw = Math.round(w * scale);
    var ch = Math.round(h * scale);

    var canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    var ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, cw, ch);

    return new Promise(function (resolve, reject) {
      canvas.toBlob(
        function (blob) {
          if (!blob) {
            reject(new Error("画像の変換に失敗しました"));
            return;
          }
          resolve(blob);
        },
        "image/jpeg",
        JPEG_QUALITY
      );
    });
  }

  function blobToDataURL(blob) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () {
        resolve(fr.result);
      };
      fr.onerror = function () {
        reject(fr.error);
      };
      fr.readAsDataURL(blob);
    });
  }

  function getSelectedPlants() {
    var names = [];
    if (el.plantChecks) {
      var boxes = el.plantChecks.querySelectorAll('input[type="checkbox"]:checked');
      for (var i = 0; i < boxes.length; i++) {
        names.push(boxes[i].value);
      }
    }
    var extra = el.customPlant && el.customPlant.value.trim();
    if (extra) names.push(extra);
    return names;
  }

  function renderPlantChecks(areaId) {
    if (!el.plantChecks) return;
    el.plantChecks.innerHTML = "";
    var area = state.areas.find(function (a) {
      return a.id === areaId;
    });
    if (!area || !area.plants || area.plants.length === 0) {
      var p = document.createElement("p");
      p.className = "plant-checks-empty";
      p.textContent = "登録された植栽がありません。下の「その他」に名前を入力してください。";
      el.plantChecks.appendChild(p);
      return;
    }
    area.plants.forEach(function (name) {
      var lab = document.createElement("label");
      lab.className = "row";
      var inp = document.createElement("input");
      inp.type = "checkbox";
      inp.value = name;
      lab.appendChild(inp);
      lab.appendChild(document.createTextNode(name));
      el.plantChecks.appendChild(lab);
    });
  }

  function readEmbeddedPlants() {
    var node = document.getElementById("plants-embed");
    if (!node || !node.textContent.trim()) {
      return null;
    }
    try {
      return JSON.parse(node.textContent.trim());
    } catch (e) {
      return null;
    }
  }

  function loadPlantsData() {
    return fetch("data/plants.json", { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("bad status");
        return res.json();
      })
      .catch(function () {
        var embedded = readEmbeddedPlants();
        if (embedded && embedded.areas) {
          return embedded;
        }
        throw new Error("plants.json を読めず、埋め込みデータも使えません");
      });
  }

  function populateAreaSelects() {
    if (el.area) {
      el.area.innerHTML = "";
      state.areas.forEach(function (a) {
        var opt = document.createElement("option");
        opt.value = a.id;
        opt.textContent = a.label;
        el.area.appendChild(opt);
      });
    }
    if (el.filterArea) {
      var keep = el.filterArea.value;
      el.filterArea.innerHTML = '<option value="">（すべて）</option>';
      state.areas.forEach(function (a) {
        var opt = document.createElement("option");
        opt.value = a.id;
        opt.textContent = a.label;
        el.filterArea.appendChild(opt);
      });
      if (keep) el.filterArea.value = keep;
    }
    updateFilterPlantOptions();
  }

  function allPlantNames() {
    var set = {};
    state.areas.forEach(function (a) {
      (a.plants || []).forEach(function (p) {
        set[p] = true;
      });
    });
    return Object.keys(set).sort();
  }

  function applyQueryPrefill() {
    var params = new URLSearchParams(window.location.search);
    if (!params.get("area") && !params.get("plant")) {
      return;
    }

    var areaId = params.get("area");
    var plantName = params.get("plant");
    if (plantName) {
      try {
        plantName = decodeURIComponent(plantName);
      } catch (e) {
        /* keep raw */
      }
    }

    if (!areaId && plantName) {
      for (var i = 0; i < state.areas.length; i++) {
        var ar = state.areas[i];
        if (ar.plants && ar.plants.indexOf(plantName) !== -1) {
          areaId = ar.id;
          break;
        }
      }
    }

    var applied = false;

    if (areaId) {
      var exists = state.areas.some(function (a) {
        return a.id === areaId;
      });
      if (exists) {
        el.area.value = areaId;
        renderPlantChecks(areaId);
        updateFilterPlantOptions();
        applied = true;
      }
    }

    if (plantName && el.plantChecks) {
      var boxes = el.plantChecks.querySelectorAll('input[type="checkbox"]');
      var found = false;
      for (var j = 0; j < boxes.length; j++) {
        if (boxes[j].value === plantName) {
          boxes[j].checked = true;
          found = true;
        }
      }
      if (!found && el.customPlant) {
        el.customPlant.value = plantName;
        applied = true;
      } else if (found) {
        applied = true;
      }
    }

    if (applied) {
      requestAnimationFrame(function () {
        var target = document.getElementById("growth-form");
        if (target) {
          target.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
    }
  }

  function updateFilterPlantOptions() {
    if (!el.filterPlant) return;
    var areaId = el.filterArea ? el.filterArea.value : "";
    var prev = el.filterPlant.value;
    el.filterPlant.innerHTML = '<option value="">（すべて）</option>';

    var list = [];
    if (areaId) {
      var ar = state.areas.find(function (x) {
        return x.id === areaId;
      });
      list = ar && ar.plants ? ar.plants.slice() : [];
    } else {
      list = allPlantNames();
    }

    list.forEach(function (p) {
      var opt = document.createElement("option");
      opt.value = p;
      opt.textContent = p;
      el.filterPlant.appendChild(opt);
    });
    if (prev && list.indexOf(prev) !== -1) el.filterPlant.value = prev;
  }

  function renderFeed(records) {
    if (!el.feed) return;

    var fa = el.filterArea ? el.filterArea.value : "";
    var fp = el.filterPlant ? el.filterPlant.value : "";

    var filtered = records.filter(function (r) {
      if (fa && r.areaId !== fa) return false;
      if (fp && (!r.plants || r.plants.indexOf(fp) === -1)) return false;
      return true;
    });

    filtered.sort(function (a, b) {
      return (b.recordedAt || "").localeCompare(a.recordedAt || "");
    });

    el.feed.innerHTML = "";

    if (filtered.length === 0) {
      var empty = document.createElement("p");
      empty.className = "growth-hint";
      empty.textContent = "該当する記録がありません。";
      el.feed.appendChild(empty);
      return;
    }

    filtered.forEach(function (r) {
      var card = document.createElement("article");
      card.className = "growth-card";

      var imgWrap = document.createElement("div");
      imgWrap.className = "growth-card-img-wrap";

      if (r.imageUrl) {
        var img = document.createElement("img");
        img.src = r.imageUrl;
        img.alt = "";
        img.loading = "lazy";
        img.referrerPolicy = "no-referrer";
        imgWrap.appendChild(img);
      } else {
        imgWrap.classList.add("growth-card-img-wrap--empty");
        imgWrap.textContent = "写真なし";
      }
      card.appendChild(imgWrap);

      var body = document.createElement("div");
      body.className = "growth-card-body";

      var meta = document.createElement("p");
      meta.className = "growth-card-meta";
      meta.textContent = (r.recordedAt || "").slice(0, 10);
      body.appendChild(meta);

      var title = document.createElement("h3");
      title.className = "growth-card-title";
      title.textContent = r.areaLabel || "";
      body.appendChild(title);

      var pl = document.createElement("p");
      pl.className = "growth-card-plants";
      pl.textContent = r.plants && r.plants.length ? r.plants.join("、") : "—";
      body.appendChild(pl);

      if (r.note) {
        var note = document.createElement("p");
        note.className = "growth-card-note";
        note.textContent = r.note;
        body.appendChild(note);
      }

      card.appendChild(body);

      var actions = document.createElement("div");
      actions.className = "growth-card-actions";
      var del = document.createElement("button");
      del.type = "button";
      del.className = "growth-danger";
      del.textContent = "この記録を削除";
      del.addEventListener("click", function () {
        if (!confirm("この記録を削除しますか？")) return;
        fetch(API_GROWTH + "?id=" + encodeURIComponent(r.id), {
          method: "DELETE",
          headers: cloudHeaders(false),
        })
          .then(function (res) {
            if (!res.ok) throw new Error("削除に失敗しました");
            showToast("削除しました");
            return refreshFeed();
          })
          .catch(function (err) {
            showToast(err && err.message ? err.message : "削除に失敗しました", true);
          });
      });
      actions.appendChild(del);
      card.appendChild(actions);

      el.feed.appendChild(card);
    });
  }

  function refreshFeed() {
    updateCloudStatus("一覧を取得中…");
    return fetch(API_GROWTH, { headers: cloudHeaders(false) })
      .then(function (res) {
        if (res.status === 401) {
          updateCloudStatus("API がトークンを要求しています。下に正しいトークンを保存してください。");
          renderFeed([]);
          return null;
        }
        if (res.status === 404) {
          updateCloudStatus("/api/growth が見つかりません。Vercel にデプロイされているか確認してください。");
          renderFeed([]);
          return null;
        }
        if (!res.ok) {
          updateCloudStatus("一覧の取得に失敗しました（" + res.status + "）。");
          renderFeed([]);
          return null;
        }
        return res.json();
      })
      .then(function (data) {
        if (!data) return;
        updateCloudStatus("Vercel に接続済み。写真は Blob、記録は KV に保存されます。");
        renderFeed(data.records || []);
      })
      .catch(function () {
        updateCloudStatus("ネットワークエラーで一覧を取得できませんでした。");
        renderFeed([]);
      });
  }

  function onSubmit(e) {
    e.preventDefault();
    var areaId = el.area.value;
    var area = state.areas.find(function (a) {
      return a.id === areaId;
    });
    var plants = getSelectedPlants();
    if (plants.length === 0) {
      showToast("植栽を1つ以上選ぶか、「その他」に名前を入力してください", true);
      return;
    }

    var note = el.form.querySelector('[name="note"]');
    var noteVal = note ? note.value.trim() : "";

    var dateInput = el.form.querySelector('[name="date"]');
    var dateVal = dateInput ? dateInput.value : "";
    if (!dateVal) {
      showToast("日付を入力してください", true);
      return;
    }

    var file = el.photo && el.photo.files && el.photo.files[0];
    var promise;
    if (file) {
      promise = loadImageFile(file).then(imageToJpegBlob);
    } else {
      promise = Promise.resolve(null);
    }

    el.submit.disabled = true;

    var id = uuid();
    var recordedAt = dateVal + "T12:00:00.000Z";
    var createdAt = new Date().toISOString();

    promise
      .then(function (blob) {
        var payload = {
          id: id,
          recordedAt: recordedAt,
          areaId: areaId,
          areaLabel: area ? area.label : areaId,
          plants: plants,
          note: noteVal,
          createdAt: createdAt,
        };
        if (blob) {
          return blobToDataURL(blob).then(function (dataUrl) {
            var comma = dataUrl.indexOf(",");
            payload.imageBase64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
            payload.imageMime = "image/jpeg";
            return payload;
          });
        }
        return payload;
      })
      .then(function (payload) {
        return fetch(API_GROWTH, {
          method: "POST",
          headers: cloudHeaders(true),
          body: JSON.stringify(payload),
        }).then(function (res) {
          if (res.status === 401) {
            throw new Error("トークンが無効です。Vercel の GROWTH_UPLOAD_TOKEN と一致させてください。");
          }
          if (res.status === 503) {
            throw new Error(
              "Vercel Blob または KV（Redis）が未設定の可能性があります。ダッシュボードでストレージを接続してください。"
            );
          }
          if (!res.ok) {
            throw new Error("保存に失敗しました（" + res.status + "）");
          }
          return res.json();
        });
      })
      .then(function () {
        showToast("保存しました");
        el.form.reset();
        if (dateInput) dateInput.value = todayInputValue();
        renderPlantChecks(el.area.value);
        if (el.photo) el.photo.value = "";
        return refreshFeed();
      })
      .catch(function (err) {
        showToast(err && err.message ? err.message : "保存に失敗しました", true);
      })
      .finally(function () {
        el.submit.disabled = false;
      });
  }

  function todayInputValue() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + m + "-" + day;
  }

  function onExport() {
    fetch(API_GROWTH, { headers: cloudHeaders(false) })
      .then(function (res) {
        if (!res.ok) throw new Error("取得に失敗しました");
        return res.json();
      })
      .then(function (data) {
        var json = JSON.stringify(
          {
            version: 2,
            source: "vercel",
            exportedAt: new Date().toISOString(),
            records: data.records || [],
          },
          null,
          2
        );
        var blob = new Blob([json], { type: "application/json" });
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "planting-growth-backup.json";
        a.click();
        URL.revokeObjectURL(a.href);
        showToast("エクスポートしました（画像は URL のまま）");
      })
      .catch(function (err) {
        showToast(err && err.message ? err.message : "エクスポートに失敗しました", true);
      });
  }

  function onCloudTokenSave() {
    if (!el.cloudToken) return;
    var v = el.cloudToken.value.trim();
    if (v) localStorage.setItem(LS_CLOUD_TOKEN, v);
    else localStorage.removeItem(LS_CLOUD_TOKEN);
    showToast("トークンを保存しました");
    refreshFeed();
  }

  function init() {
    el.form = $("growth-form");
    el.date = $("field-date");
    el.area = $("field-area");
    el.plantChecks = $("plant-checks");
    el.customPlant = $("field-custom-plant");
    el.photo = $("field-photo");
    el.photoClear = $("photo-clear");
    el.submit = $("growth-submit");
    el.toast = $("growth-toast");
    el.filterArea = $("filter-area");
    el.filterPlant = $("filter-plant");
    el.feed = $("growth-feed");
    el.exportBtn = $("export-btn");
    el.cloudToken = $("cloud-token");
    el.cloudTokenSave = $("cloud-token-save");
    el.cloudStatus = $("cloud-status");

    if (!el.form || !el.area) return;

    var tokenStored = localStorage.getItem(LS_CLOUD_TOKEN);
    if (el.cloudToken && tokenStored) el.cloudToken.value = tokenStored;

    if (el.cloudTokenSave) el.cloudTokenSave.addEventListener("click", onCloudTokenSave);

    loadPlantsData()
      .then(function (data) {
        state.areas = data.areas || [];
        populateAreaSelects();
        var q = new URLSearchParams(window.location.search);
        if (q.get("area") || q.get("plant")) {
          applyQueryPrefill();
        }
        if (!el.plantChecks || el.plantChecks.childElementCount === 0) {
          renderPlantChecks(el.area.value);
          updateFilterPlantOptions();
        }
        if (el.date) el.date.value = todayInputValue();
        return refreshFeed();
      })
      .catch(function (err) {
        showToast(err && err.message ? err.message : "初期化に失敗しました", true);
      });

    el.area.addEventListener("change", function () {
      renderPlantChecks(el.area.value);
      updateFilterPlantOptions();
    });

    if (el.filterArea) {
      el.filterArea.addEventListener("change", function () {
        if (el.filterPlant) el.filterPlant.value = "";
        updateFilterPlantOptions();
        refreshFeed();
      });
    }

    if (el.filterPlant) {
      el.filterPlant.addEventListener("change", function () {
        refreshFeed();
      });
    }

    el.form.addEventListener("submit", onSubmit);

    if (el.photoClear && el.photo) {
      el.photoClear.addEventListener("click", function () {
        el.photo.value = "";
      });
    }

    if (el.exportBtn) el.exportBtn.addEventListener("click", onExport);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
