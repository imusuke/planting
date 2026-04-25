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

  function getCloudToken(options) {
    var opts = options || {};
    var inputEl = opts.inputEl || null;
    var typed = inputEl && typeof inputEl.value === "string" ? inputEl.value.trim() : "";
    if (typed) return typed;
    try {
      return localStorage.getItem(opts.storageKey || CLOUD_TOKEN_KEY) || "";
    } catch (err) {
      return "";
    }
  }

  function promptPhotoAiInstruction(options) {
    var opts = options || {};
    if (typeof window === "undefined" || typeof window.prompt !== "function") {
      return typeof opts.defaultValue === "string" ? opts.defaultValue : "";
    }
    var raw = window.prompt(
      opts.message ||
        "この1枚の写真について、AIコメントで触れてほしい点があれば入力してください。空欄のままでも実行できます。",
      typeof opts.defaultValue === "string" ? opts.defaultValue : ""
    );
    if (raw == null) return null;
    var maxLength = typeof opts.maxLength === "number" && opts.maxLength > 0 ? opts.maxLength : 400;
    return String(raw).trim().slice(0, maxLength);
  }

  function buildPhotoAiActionLabel(options) {
    var opts = options || {};
    if (opts.isBusy) return opts.busyLabel || "AIコメント更新中…";
    if (opts.hasTarget === false) return opts.unavailableLabel || "AIでコメント追加";
    return opts.hasMemo ? opts.refreshLabel || "AIでコメント再生成" : opts.addLabel || "AIでコメント追加";
  }

  function buildPhotoAiRequestStatus(options) {
    var opts = options || {};
    var subject = typeof opts.subject === "string" && opts.subject.trim() ? opts.subject.trim() : "この1枚の写真";
    var noun = typeof opts.noun === "string" && opts.noun.trim() ? opts.noun.trim() : "AIコメント";
    var prefix = opts.withUserInstruction ? opts.userInstructionPrefix || "入力内容を踏まえながら、" : "";
    var particle = opts.hasMemo ? "の" : "に";
    var action = opts.hasMemo ? opts.refreshVerb || "更新" : opts.addVerb || "追加";
    var suffix = typeof opts.suffix === "string" ? opts.suffix : "しています。";
    return prefix + subject + particle + noun + "を" + action + suffix;
  }

  function buildPhotoAiResultMessage(options) {
    var opts = options || {};
    var noun = typeof opts.noun === "string" && opts.noun.trim() ? opts.noun.trim() : "AIコメント";
    var suffix = typeof opts.suffix === "string" ? opts.suffix : "";
    return noun + "を" + (opts.hasMemo ? "更新" : "追加") + "しました。" + suffix;
  }

  function buildPhotoAiDeferredMessage(detail, options) {
    var opts = options || {};
    var base =
      opts.baseMessage || "AIコメントはまだ反映されていません。少ししてから開き直してください。";
    var text = typeof detail === "string" ? detail.trim() : "";
    return text ? base + "（" + text + "）" : base;
  }

  function normalizeName(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function stripEmbeddedImageMarkup(value) {
    return String(value || "")
      .replace(/\r\n/g, "\n")
      .replace(/```[^\n]*\n?/g, "")
      .replace(/```/g, "")
      .replace(/<\/?image\b[^>]*>/gi, " ")
      .replace(/<img\b[^>]*>/gi, " ")
      .replace(/!\[[^\]]*]\((?:[^()\\]|\\.)*\)/g, " ")
      .replace(/!\[[^\]]*]/g, " ")
      .replace(/\[([^\]]+)]\((?:[^()\\]|\\.)*\)/g, "$1")
      .replace(/`([^`]*)`/g, "$1")
      .replace(/data:image\/[A-Za-z0-9.+-]+;base64,[A-Za-z0-9+/=\s]+/gi, " ")
      .replace(/https?:\/\/\S+\.(?:png|jpe?g|gif|webp|svg)(?:\?\S*)?/gi, " ");
  }

  function sanitizeAiPlainText(value, options) {
    var opts = options || {};
    var text = stripEmbeddedImageMarkup(value)
      .replace(/\u3000/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .trim();

    if (!text) return "";

    if (opts.preserveParagraphs) {
      text = text
        .split(/\n{2,}/)
        .map(function (part) {
          return part
            .split(/\n+/)
            .map(function (line) {
              return line.trim();
            })
            .filter(Boolean)
            .join(" ");
        })
        .filter(Boolean)
        .join("\n\n");
    } else {
      text = text.replace(/\n+/g, " ");
    }

    return text.replace(/\s{2,}/g, " ").trim();
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

  function normalizeAiCommentJobTargets(value) {
    var out = [];
    var seen = {};
    if (!Array.isArray(value)) return out;
    for (var i = 0; i < value.length; i++) {
      var n = parseInt(String(value[i]), 10);
      if (isNaN(n) || n < 0 || seen[n]) continue;
      seen[n] = true;
      out.push(n);
    }
    return out;
  }

  function readAiCommentJob(record) {
    var raw = record && record.aiCommentJob && typeof record.aiCommentJob === "object" ? record.aiCommentJob : null;
    if (!raw) return null;
    return {
      id: raw.id ? String(raw.id) : "",
      source: raw.source ? String(raw.source) : "",
      status: raw.status ? String(raw.status) : "",
      targets: normalizeAiCommentJobTargets(raw.targets),
      requestedAt: raw.requestedAt ? String(raw.requestedAt) : "",
      startedAt: raw.startedAt ? String(raw.startedAt) : "",
      finishedAt: raw.finishedAt ? String(raw.finishedAt) : "",
      updatedAt: raw.updatedAt ? String(raw.updatedAt) : "",
      detail: raw.detail ? String(raw.detail) : "",
      updatedCount: typeof raw.updatedCount === "number" ? raw.updatedCount : 0,
      failedCount: typeof raw.failedCount === "number" ? raw.failedCount : 0,
    };
  }

  function isAiCommentJobTerminal(job) {
    return !!job && (job.status === "done" || job.status === "failed");
  }

  function buildAiCommentJobStatusMessage(job, options) {
    var opts = options || {};
    if (!job) {
      return opts.pendingMessage || "AIコメントを更新しています。保存後は画面を離れても大丈夫です。";
    }
    if (job.status === "queued") {
      return opts.queuedMessage || "AIコメントを更新予約しました。保存後は画面を離れても大丈夫です。";
    }
    if (job.status === "running") {
      return opts.runningMessage || "AIコメントを更新しています。保存後は画面を離れても大丈夫です。";
    }
    if (job.status === "done") {
      if (job.failedCount && job.updatedCount) {
        if (job.detail) {
          return (
            (opts.partialFailureWithDetailPrefix ||
              "AIコメントを反映しました。一部の写真は更新できませんでした。") +
            "（" +
            job.detail +
            "）"
          );
        }
        return (
          opts.partialFailureMessage || "AIコメントを反映しました。一部の写真は更新できませんでした。"
        );
      }
      if ((opts.detailPassThroughPattern || /自然な補助コメント/).test(String(job.detail || ""))) {
        return String(job.detail || "");
      }
      return opts.doneMessage || "AIコメントを反映しました。必要なら確認して保存してください。";
    }
    if (job.status === "failed") {
      return job.detail
        ? (opts.failedWithDetailPrefix || "AIコメントの更新に失敗しました。") + "（" + job.detail + "）"
        : opts.failedMessage || "AIコメントの更新に失敗しました。";
    }
    return opts.pendingMessage || "AIコメントを更新しています。保存後は画面を離れても大丈夫です。";
  }

  function humanizeApiErrorCode(code) {
    var normalized = typeof code === "string" ? code.trim() : "";
    if (!normalized) return "";
    var map = {
      unauthorized: "トークンが違います。アップロード用トークンを確認してください。",
      kv_unavailable: "サーバー側の保存先に接続できませんでした。",
      kv_write_failed: "サーバー側の保存先への書き込みに失敗しました。",
      blob_unavailable: "画像保存の設定が見つかりません。",
      blob_put_failed: "写真の保存に失敗しました。",
      source_copy_failed: "既存写真のコピーに失敗しました。",
      source_image_not_found: "元の写真が見つかりませんでした。",
      source_image_empty: "元の写真を読み込めませんでした。",
      missing_id: "対象の記録が見つかりませんでした。",
      missing_targets: "更新対象の写真が見つかりませんでした。",
      not_found: "対象のデータが見つかりませんでした。",
      refresh_failed: "AIコメントの更新に失敗しました。",
      internal_error: "サーバー側で予期しないエラーが起きました。",
      method_not_allowed: "この操作は現在の画面からは実行できません。",
      too_many_images: "写真の枚数が上限を超えています。",
      invalid_image_data: "写真データを読み取れませんでした。",
      invalid_slot: "対象の写真が見つかりませんでした。",
      missing_area_id: "エリアが選ばれていません。",
      missing_images_and_note: "写真か記録メモを入力してください。",
      gemini_unavailable: "Gemini API の設定が見つかりません。",
      no_targets: "対象の写真が見つかりませんでした。",
      no_results: "AIコメントを生成できませんでした。",
      record_deleted: "対象の記録が見つかりませんでした。",
      record_changed: "記録が更新されていたため、AIコメントは反映しませんでした。",
      job_replaced: "新しいAI更新が始まったため、前の処理結果は反映しませんでした。",
    };
    return map[normalized] || normalized;
  }

  function apiErrorMessage(res, fallbackPrefix) {
    return res.text().then(function (text) {
      var detail = "";
      try {
        var json = JSON.parse(text);
        if (json && json.detail) detail = String(json.detail);
        else if (json && json.error) detail = humanizeApiErrorCode(json.error);
      } catch (err) {
        detail = text ? String(text).trim() : "";
      }
      var base = fallbackPrefix + "（" + res.status + "）";
      return detail ? base + " " + detail : base;
    });
  }

  function formatChangeLogTime(value) {
    if (!value) return "";
    try {
      return new Intl.DateTimeFormat("ja-JP", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(value));
    } catch (err) {
      return String(value);
    }
  }

  function describeChangeLogEntry(item) {
    if (!item) return "";
    var areaLabel = item.areaLabel ? String(item.areaLabel) : item.areaId ? String(item.areaId) : "";
    var plantLabel = item.plantName ? String(item.plantName) : "";
    switch (item.action) {
      case "catalog_saved":
        return "エリア・植栽マスタを保存";
      case "plant_detail_saved":
        return plantLabel ? plantLabel + " の説明を保存" : "植栽の説明を保存";
      case "area_detail_saved":
        return areaLabel ? areaLabel + " の説明を保存" : "エリアの説明を保存";
      case "growth_record_created":
        return "植栽の記録を追加";
      case "growth_record_updated":
        return "植栽の記録を更新";
      case "growth_record_archived":
        return "植栽の記録をアーカイブ";
      case "growth_record_photo_removed":
        return "植栽の記録の写真を削除";
      case "growth_record_deleted_after_photo_removal":
        return "植栽の記録を削除";
      case "area_growth_created":
        return "エリア記録を追加";
      case "area_growth_updated":
        return "エリア記録を更新";
      case "area_growth_archived":
        return "エリア記録をアーカイブ";
      case "area_growth_photo_removed":
        return "エリア記録の写真を削除";
      case "area_growth_deleted_after_photo_removal":
        return "エリア記録を削除";
      default:
        return "更新";
    }
  }

  function renderChangeLogItems(listEl, items, emptyText) {
    if (!listEl) return;
    listEl.innerHTML = "";
    if (!items || !items.length) {
      if (emptyText) {
        listEl.appendChild(createTextElement("p", "growth-hint", emptyText));
      }
      return;
    }
    items.forEach(function (item) {
      var card = document.createElement("article");
      card.className = "growth-change-log-item";

      var header = document.createElement("div");
      header.className = "growth-change-log-item-header";
      header.appendChild(
        createTextElement("strong", "growth-change-log-item-title", describeChangeLogEntry(item))
      );
      header.appendChild(
        createTextElement("span", "growth-change-log-item-time", formatChangeLogTime(item.createdAt))
      );
      card.appendChild(header);

      var metaParts = [];
      if (item.areaLabel) metaParts.push(String(item.areaLabel));
      else if (item.areaId) metaParts.push(String(item.areaId));
      if (item.plantName) metaParts.push(String(item.plantName));
      else if (Array.isArray(item.plantNames) && item.plantNames.length) {
        metaParts.push(item.plantNames.join("、"));
      }
      if (metaParts.length) {
        card.appendChild(createTextElement("p", "growth-change-log-item-meta", metaParts.join(" / ")));
      }
      if (item.detail) {
        card.appendChild(createTextElement("p", "growth-change-log-item-detail", String(item.detail)));
      }
      listEl.appendChild(card);
    });
  }

  function loadChangeLog(options) {
    var opts = options || {};
    var listEl = opts.listEl || null;
    var statusEl = opts.statusEl || null;
    if (!listEl || !statusEl) return Promise.resolve([]);

    var storageKey = opts.storageKey || CLOUD_TOKEN_KEY;
    var token = localStorage.getItem(storageKey);
    if (!token) {
      statusEl.textContent =
        opts.noTokenMessage || "アップロード用トークンを保存すると更新履歴を読み込めます。";
      renderChangeLogItems(listEl, [], opts.noTokenEmptyText || "");
      return Promise.resolve([]);
    }

    var limit = parseInt(String(opts.limit || 20), 10);
    if (isNaN(limit) || limit < 1) limit = 20;
    statusEl.textContent = opts.loadingMessage || "更新履歴を読み込んでいます…";

    return fetch((opts.apiPath || "/api/change-log") + "?limit=" + encodeURIComponent(limit), {
      headers: buildCloudHeaders(false, storageKey),
      cache: "no-store",
    })
      .then(function (res) {
        if (!res.ok) {
          return apiErrorMessage(res, opts.failurePrefix || "更新履歴の読み込みに失敗しました").then(function (message) {
            throw new Error(message);
          });
        }
        return res.json();
      })
      .then(function (data) {
        var items = data && Array.isArray(data.items) ? data.items.slice() : [];
        if (typeof opts.filter === "function") {
          items = items.filter(opts.filter);
        }
        renderChangeLogItems(listEl, items, opts.emptyMessage || "更新履歴はまだありません。");
        statusEl.textContent =
          typeof opts.successMessage === "function"
            ? opts.successMessage(items)
            : items.length
              ? "最近 " + items.length + " 件の更新を表示しています。"
              : opts.emptyMessage || "更新履歴はまだありません。";
        return items;
      })
      .catch(function (err) {
        statusEl.textContent =
          err && err.message ? err.message : opts.failurePrefix || "更新履歴の読み込みに失敗しました。";
        renderChangeLogItems(listEl, [], "");
        return [];
      });
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
    apiErrorMessage: apiErrorMessage,
    buildAiCommentJobStatusMessage: buildAiCommentJobStatusMessage,
    buildCloudHeaders: buildCloudHeaders,
    buildPhotoAiActionLabel: buildPhotoAiActionLabel,
    buildPhotoAiDeferredMessage: buildPhotoAiDeferredMessage,
    buildPhotoAiRequestStatus: buildPhotoAiRequestStatus,
    buildPhotoAiResultMessage: buildPhotoAiResultMessage,
    createButtonElement: createButtonElement,
    confirmIrreversibleAction: confirmIrreversibleAction,
    createGrowthCardImageWrap: createGrowthCardImageWrap,
    createGrowthCardScaffold: createGrowthCardScaffold,
    createLinkElement: createLinkElement,
    createTextElement: createTextElement,
    describeChangeLogEntry: describeChangeLogEntry,
    findAreaById: findAreaById,
    formatChangeLogTime: formatChangeLogTime,
    getCloudToken: getCloudToken,
    imageSrcFromSlot: imageSrcFromSlot,
    isAiCommentJobTerminal: isAiCommentJobTerminal,
    listAreaPlants: listAreaPlants,
    loadChangeLog: loadChangeLog,
    loadJson: loadJson,
    loadPlantsData: loadPlantsData,
    normalizeName: normalizeName,
    readAiCommentJob: readAiCommentJob,
    normalizeImageSlots: normalizeImageSlots,
    promptPhotoAiInstruction: promptPhotoAiInstruction,
    readEmbeddedJson: readEmbeddedJson,
    renderChangeLogItems: renderChangeLogItems,
    saveCloudToken: saveCloudToken,
    sanitizeAiPlainText: sanitizeAiPlainText,
    setCloudStatus: setCloudStatus,
    uniqueTrimmedStrings: uniqueTrimmedStrings,
  };
})();
