(function () {
  "use strict";

  var pack = null;
  var gallery = {
    items: [],
    index: 0,
    actions: [],
  };

  function normalizeItems(items) {
    var out = [];
    if (!Array.isArray(items)) return out;
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      if (!item) continue;
      if (typeof item === "string") {
        if (item) out.push({ src: item, alt: "", caption: "" });
        continue;
      }
      var src = String(item.src || "").trim();
      if (!src) continue;
      out.push({
        src: src,
        alt: String(item.alt || "").trim(),
        caption: String(item.caption || "").trim(),
        meta: item.meta && typeof item.meta === "object" ? item.meta : null,
      });
    }
    return out;
  }

  function normalizeActions(actions) {
    return Array.isArray(actions)
      ? actions.filter(function (action) {
          return !!action;
        })
      : [];
  }

  function buildActionContext(sync, close) {
    return {
      item: gallery.items[gallery.index] || null,
      index: gallery.index,
      items: gallery.items,
      sync: sync,
      close: close,
      dialog: pack && pack.dialog ? pack.dialog : null,
    };
  }

  function resolveActionValue(value, actionContext) {
    return typeof value === "function" ? value(actionContext) : value;
  }

  function ensurePack() {
    if (pack) return pack;

    var dialog = document.createElement("dialog");
    dialog.className = "site-photo-lightbox";
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-label", "写真の拡大表示");
    dialog.tabIndex = -1;

    var shell = document.createElement("div");
    shell.className = "site-photo-lightbox-shell";

    var top = document.createElement("div");
    top.className = "site-photo-lightbox-top";

    var closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "site-photo-lightbox-close";
    closeBtn.setAttribute("aria-label", "閉じる");
    closeBtn.textContent = "閉じる";
    top.appendChild(closeBtn);

    var media = document.createElement("div");
    media.className = "site-photo-lightbox-media";

    var img = document.createElement("img");
    img.className = "site-photo-lightbox-img";
    img.alt = "";
    img.referrerPolicy = "no-referrer";
    media.appendChild(img);

    var caption = document.createElement("p");
    caption.className = "site-photo-lightbox-caption";

    var actionsRow = document.createElement("div");
    actionsRow.className = "site-photo-lightbox-actions";
    actionsRow.hidden = true;

    var navRow = document.createElement("div");
    navRow.className = "site-photo-lightbox-nav-row";

    var prevBtn = document.createElement("button");
    prevBtn.type = "button";
    prevBtn.className = "site-photo-lightbox-nav";
    prevBtn.setAttribute("aria-label", "前の写真");
    prevBtn.textContent = "前へ";

    var nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.className = "site-photo-lightbox-nav";
    nextBtn.setAttribute("aria-label", "次の写真");
    nextBtn.textContent = "次へ";

    navRow.appendChild(prevBtn);
    navRow.appendChild(nextBtn);

    shell.appendChild(top);
    shell.appendChild(media);
    shell.appendChild(caption);
    shell.appendChild(actionsRow);
    shell.appendChild(navRow);
    dialog.appendChild(shell);
    document.body.appendChild(dialog);

    function close() {
      if (typeof dialog.close === "function") {
        dialog.close();
      } else {
        dialog.removeAttribute("open");
      }
    }

    function renderActions() {
      actionsRow.innerHTML = "";
      var actions = gallery.actions || [];
      if (!actions.length) {
        actionsRow.hidden = true;
        return;
      }
      var actionContext = buildActionContext(sync, close);
      actions.forEach(function (action) {
        if (!action) return;
        if (resolveActionValue(action.hidden, actionContext)) return;
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className =
          "site-photo-lightbox-action" + (action.className ? " " + String(action.className).trim() : "");
        var label = resolveActionValue(action.label, actionContext);
        btn.textContent = label != null ? String(label) : "";
        var ariaLabel = resolveActionValue(action.ariaLabel, actionContext);
        if (ariaLabel) btn.setAttribute("aria-label", String(ariaLabel));
        btn.disabled = !!resolveActionValue(action.disabled, actionContext);
        btn.addEventListener("click", function (e) {
          e.preventDefault();
          e.stopPropagation();
          if (typeof action.onClick === "function") {
            action.onClick(buildActionContext(sync, close));
          }
        });
        actionsRow.appendChild(btn);
      });
      actionsRow.hidden = actionsRow.childElementCount === 0;
    }

    function sync() {
      var items = gallery.items;
      if (!items.length) return;
      if (gallery.index < 0) gallery.index = items.length - 1;
      if (gallery.index >= items.length) gallery.index = 0;
      var current = items[gallery.index];
      img.src = current.src;
      img.alt = current.alt || "";
      caption.textContent = current.caption || "";
      caption.hidden = !caption.textContent;
      var canNavigate = items.length > 1;
      prevBtn.hidden = !canNavigate;
      nextBtn.hidden = !canNavigate;
      renderActions();
    }

    function showAt(index) {
      gallery.index = typeof index === "number" ? index : 0;
      sync();
    }

    shell.addEventListener("click", function (e) {
      e.stopPropagation();
    });
    dialog.addEventListener("click", function () {
      close();
    });
    closeBtn.addEventListener("click", function () {
      close();
    });
    prevBtn.addEventListener("click", function () {
      showAt(gallery.index - 1);
    });
    nextBtn.addEventListener("click", function () {
      showAt(gallery.index + 1);
    });
    dialog.addEventListener("keydown", function (e) {
      if (!gallery.items.length) return;
      if (e.target && e.target.closest && e.target.closest("input, textarea, select")) return;
      if (e.key === "ArrowLeft" && gallery.items.length > 1) {
        e.preventDefault();
        showAt(gallery.index - 1);
      } else if (e.key === "ArrowRight" && gallery.items.length > 1) {
        e.preventDefault();
        showAt(gallery.index + 1);
      }
    });

    pack = {
      dialog: dialog,
      showAt: showAt,
      sync: sync,
      close: close,
    };
    return pack;
  }

  function open(items, startIndex, options) {
    var normalized = normalizeItems(items);
    if (!normalized.length) return;
    gallery.items = normalized;
    gallery.index = typeof startIndex === "number" ? startIndex : 0;
    gallery.actions = normalizeActions(options && options.actions);
    var box = ensurePack();
    box.showAt(gallery.index);
    if (typeof box.dialog.showModal === "function") {
      try {
        box.dialog.showModal();
      } catch (e) {
        box.dialog.setAttribute("open", "");
      }
    } else {
      box.dialog.setAttribute("open", "");
    }
    if (typeof box.dialog.focus === "function") {
      try {
        box.dialog.focus();
      } catch (e2) {}
    }
  }

  function resolveConfig(img, configOrFactory) {
    var cfg =
      typeof configOrFactory === "function" ? configOrFactory(img) || {} : configOrFactory || {};
    var items = normalizeItems(cfg.items);
    if (!items.length) {
      var fallbackSrc = String(img.currentSrc || img.src || "").trim();
      if (fallbackSrc) {
        items = [
          {
            src: fallbackSrc,
            alt: String(cfg.alt || img.alt || "").trim(),
            caption: String(cfg.caption || "").trim(),
          },
        ];
      }
    }
    return {
      items: items,
      index: typeof cfg.index === "number" ? cfg.index : 0,
      actions: normalizeActions(cfg.actions),
    };
  }

  function bindImage(img, configOrFactory) {
    if (!img || img.dataset.sitePhotoLightboxBound === "1") return;
    img.dataset.sitePhotoLightboxBound = "1";
    img.classList.add("site-photo-lightbox-trigger");
    if (!img.getAttribute("title")) {
      img.setAttribute("title", "クリックで拡大");
    }

    img.addEventListener("click", function (e) {
      var cfg = resolveConfig(img, configOrFactory);
      if (!cfg.items.length) return;
      e.preventDefault();
      e.stopPropagation();
      open(cfg.items, cfg.index, { actions: cfg.actions });
    });

    if (!img.closest("a,button")) {
      if (!img.hasAttribute("tabindex")) img.tabIndex = 0;
      img.addEventListener("keydown", function (e) {
        if (e.key !== "Enter" && e.key !== " ") return;
        var cfg = resolveConfig(img, configOrFactory);
        if (!cfg.items.length) return;
        e.preventDefault();
        open(cfg.items, cfg.index, { actions: cfg.actions });
      });
    }
  }

  window.PlantingPhotoLightbox = {
    open: open,
    bindImage: bindImage,
  };
})();
