(function () {
  "use strict";

  var CLOUD_TOKEN_KEY = "growthCloudToken";

  function readEmbeddedJson(id) {
    var node = document.getElementById(id);
    if (!node || !node.textContent.trim()) return null;
    try {
      return JSON.parse(node.textContent.trim());
    } catch (err) {
      return null;
    }
  }

  function loadJson(pathname) {
    return fetch(pathname, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    }).then(function (res) {
      if (!res.ok) throw new Error("bad status");
      return res.json();
    });
  }

  function buildCloudHeaders(jsonBody, storageKey) {
    var headers = { Accept: "application/json" };
    if (jsonBody) headers["Content-Type"] = "application/json";
    var token = localStorage.getItem(storageKey || CLOUD_TOKEN_KEY);
    if (token) headers["x-growth-token"] = token;
    return headers;
  }

  function applyStoredCloudToken(inputEl, storageKey) {
    if (!inputEl) return "";
    var token = localStorage.getItem(storageKey || CLOUD_TOKEN_KEY) || "";
    inputEl.value = token;
    return token;
  }

  function saveCloudToken(value, storageKey) {
    var nextValue = typeof value === "string" ? value.trim() : "";
    var key = storageKey || CLOUD_TOKEN_KEY;
    if (nextValue) localStorage.setItem(key, nextValue);
    else localStorage.removeItem(key);
    return nextValue;
  }

  function setCloudStatus(statusEl, options) {
    if (!statusEl) return;
    var opts = options || {};
    var storageKey = opts.storageKey || CLOUD_TOKEN_KEY;
    var savedMessage = opts.savedMessage || "アップロード用トークンを保存済みです。";
    var emptyMessage = opts.emptyMessage || "アップロード用トークンを入力すると本番データへ保存できます。";
    statusEl.textContent = localStorage.getItem(storageKey) ? savedMessage : emptyMessage;
  }

  function normalizeName(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function uniqueTrimmedStrings(values) {
    var out = [];
    var seen = {};
    if (!Array.isArray(values)) return out;
    for (var i = 0; i < values.length; i++) {
      var text = typeof values[i] === "string" ? values[i].trim() : String(values[i] || "").trim();
      if (!text || seen[text]) continue;
      seen[text] = true;
      out.push(text);
    }
    return out;
  }

  function normalizeImageSlots(record) {
    if (!record) return [];
    if (Array.isArray(record.images) && record.images.length) {
      return record.images.map(function (img) {
        return {
          imageUrl: img && img.imageUrl ? img.imageUrl : null,
          imagePathname: img && img.imagePathname ? img.imagePathname : null,
          localSnapshotImage: img && img.localSnapshotImage ? img.localSnapshotImage : null,
          memo: img && typeof img.memo === "string" ? img.memo : "",
        };
      });
    }
    if (record.imageUrl || record.imagePathname || record.localSnapshotImage) {
      return [
        {
          imageUrl: record.imageUrl || null,
          imagePathname: record.imagePathname || null,
          localSnapshotImage: record.localSnapshotImage || null,
          memo: "",
        },
      ];
    }
    return [];
  }

  function imageSrcFromSlot(slot, apiPath) {
    if (!slot) return null;
    if (slot.localSnapshotImage) {
      var p = String(slot.localSnapshotImage).trim();
      if (/^https?:\/\//i.test(p)) return p;
      try {
        return new URL(p, window.location.href).href;
      } catch (e0) {
        return p;
      }
    }
    if (slot.imagePathname && apiPath) {
      return apiPath + "?pathname=" + encodeURIComponent(slot.imagePathname);
    }
    return slot.imageUrl || null;
  }

  function createTextElement(tagName, className, text) {
    var node = document.createElement(tagName);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function createLinkElement(className, href, text, attrs) {
    var node = document.createElement("a");
    if (className) node.className = className;
    if (href) node.href = href;
    if (text != null) node.textContent = text;
    if (attrs && typeof attrs === "object") {
      Object.keys(attrs).forEach(function (key) {
        var value = attrs[key];
        if (value == null) return;
        node.setAttribute(key, String(value));
      });
    }
    return node;
  }

  function createButtonElement(className, text, onClick, attrs) {
    var node = document.createElement("button");
    node.type = "button";
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    if (attrs && typeof attrs === "object") {
      Object.keys(attrs).forEach(function (key) {
        var value = attrs[key];
        if (value == null) return;
        node.setAttribute(key, String(value));
      });
    }
    if (typeof onClick === "function") {
      node.addEventListener("click", onClick);
    }
    return node;
  }

  function confirmIrreversibleAction(options) {
    var opts = options || {};
    var lines = [];
    var warning = typeof opts.warning === "string" && opts.warning.trim()
      ? opts.warning.trim()
      : "この操作は元に戻せません。";
    var subject = typeof opts.subject === "string" ? opts.subject.trim() : "";
    var action = typeof opts.action === "string" && opts.action.trim()
      ? opts.action.trim()
      : "削除します。";
    var detail = typeof opts.detail === "string" ? opts.detail.trim() : "";
    var question = typeof opts.question === "string" && opts.question.trim()
      ? opts.question.trim()
      : "本当に削除しますか？";

    lines.push(warning);
    if (subject) {
      lines.push(subject + action);
    } else {
      lines.push(action);
    }
    if (detail) lines.push(detail);
    lines.push(question);
    return window.confirm(lines.join("\n"));
  }

  function createGrowthCardScaffold(options) {
    var opts = options || {};
    var card = document.createElement("article");
    card.className = "growth-card" + (opts.cardClassName ? " " + opts.cardClassName : "");
    var body = document.createElement("div");
    body.className = opts.bodyClassName || "growth-card-body";
    var actions = document.createElement("div");
    actions.className = opts.actionsClassName || "growth-card-actions";
    return {
      card: card,
      body: body,
      actions: actions,
      finalize: function () {
        if (!body.parentNode) card.appendChild(body);
        if (actions.childNodes.length && !actions.parentNode) card.appendChild(actions);
        return card;
      },
    };
  }

  function createGrowthCardImageWrap(options) {
    var opts = options || {};
    var wrap = document.createElement("div");
    wrap.className = opts.wrapClassName || "growth-card-img-wrap";
    if (opts.wrapOnly) {
      return { wrap: wrap, img: null };
    }
    if (!opts.src) {
      wrap.className += " growth-card-img-wrap--empty";
      wrap.textContent = opts.emptyText || "写真なし";
      return { wrap: wrap, img: null };
    }
    var img = document.createElement("img");
    img.src = opts.src;
    img.alt = opts.alt || "";
    img.loading = opts.loading || "lazy";
    img.decoding = opts.decoding || "async";
    img.referrerPolicy = opts.referrerPolicy || "no-referrer";
    if (opts.imageClassName) img.className = opts.imageClassName;
    wrap.appendChild(img);
    if (opts.badgeText) {
      wrap.appendChild(createTextElement("span", "growth-card-img-count", opts.badgeText));
    }
    return { wrap: wrap, img: img };
  }

  function findAreaById(areas, areaId) {
    var wanted = normalizeName(areaId);
    if (!wanted || !Array.isArray(areas)) return null;
    for (var i = 0; i < areas.length; i++) {
      var area = areas[i];
      if (area && area.id === wanted) return area;
    }
    return null;
  }

  function listAreaPlants(areas, areaId) {
    var area = findAreaById(areas, areaId);
    if (!area || !Array.isArray(area.plants)) return [];
    var seen = {};
    var list = [];
    for (var i = 0; i < area.plants.length; i++) {
      var plantName = normalizeName(area.plants[i]);
      if (!plantName || seen[plantName]) continue;
      seen[plantName] = true;
      list.push(plantName);
    }
    return list;
  }

  function loadPlantsData(options) {
    var opts = options || {};
    var apiPath = opts.apiPath || "/api/plants";
    var fallbackPath = opts.fallbackPath || "data/plants.json";
    var embedId = opts.embedId || "plants-embed";
    var apiSource = opts.apiSource || "api";
    var fileSource = opts.fileSource || "file";
    var embedSource = opts.embedSource || "embed";

    return loadJson(apiPath)
      .then(function (data) {
        if (!data || !Array.isArray(data.areas)) throw new Error("shape");
        if (!data.source) data.source = apiSource;
        return data;
      })
      .catch(function () {
        return loadJson(fallbackPath).then(function (data) {
          if (data && !data.source) data.source = fileSource;
          return data;
        });
      })
      .catch(function () {
        var embedded = readEmbeddedJson(embedId);
        if (embedded && Array.isArray(embedded.areas)) {
          if (!embedded.source) embedded.source = embedSource;
          return embedded;
        }
        throw new Error("no plants");
      });
  }

  window.PlantingEditCommon = {
    CLOUD_TOKEN_KEY: CLOUD_TOKEN_KEY,
    applyStoredCloudToken: applyStoredCloudToken,
    buildCloudHeaders: buildCloudHeaders,
    createButtonElement: createButtonElement,
    confirmIrreversibleAction: confirmIrreversibleAction,
    createGrowthCardImageWrap: createGrowthCardImageWrap,
    createGrowthCardScaffold: createGrowthCardScaffold,
    createLinkElement: createLinkElement,
    createTextElement: createTextElement,
    findAreaById: findAreaById,
    imageSrcFromSlot: imageSrcFromSlot,
    listAreaPlants: listAreaPlants,
    loadJson: loadJson,
    loadPlantsData: loadPlantsData,
    normalizeName: normalizeName,
    normalizeImageSlots: normalizeImageSlots,
    readEmbeddedJson: readEmbeddedJson,
    saveCloudToken: saveCloudToken,
    setCloudStatus: setCloudStatus,
    uniqueTrimmedStrings: uniqueTrimmedStrings,
  };
})();
