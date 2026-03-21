(function () {
  "use strict";

  document.body.addEventListener("click", function (e) {
    var a = e.target.closest("a.hub-link--needs-config");
    if (!a) return;
    e.preventDefault();
    var dlg = document.getElementById("hub-link-setup-dialog");
    if (dlg && typeof dlg.showModal === "function") dlg.showModal();
  });

  var links = document.querySelectorAll("a[data-hub-link]");
  if (!links.length) return;

  var fallback = (links[0].getAttribute("data-hub-fallback") || "").trim();
  var isLocal =
    location.hostname === "localhost" ||
    location.hostname === "127.0.0.1" ||
    location.protocol === "file:";

  function applyHref(url) {
    var u = (url || "").trim();
    links.forEach(function (a) {
      a.classList.remove("hub-link--needs-config");
      a.removeAttribute("aria-disabled");
      if (u) {
        a.href = u;
        return;
      }
      if (isLocal && fallback) {
        a.href = fallback;
        return;
      }
      a.href = "#";
      a.classList.add("hub-link--needs-config");
      a.setAttribute("aria-disabled", "true");
    });
  }

  var w =
    typeof window.__PLANTING_HUB_URL__ === "string"
      ? window.__PLANTING_HUB_URL__.trim()
      : "";
  if (w) {
    applyHref(w);
    return;
  }

  fetch("data/hub-link.json", { cache: "no-store" })
    .then(function (r) {
      return r.ok ? r.json() : {};
    })
    .then(function (cfg) {
      var u = cfg && cfg.linkCollectionUrl;
      u = typeof u === "string" ? u.trim() : "";
      if (u) applyHref(u);
      else applyHref("");
    })
    .catch(function () {
      applyHref("");
    });
})();
