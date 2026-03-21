(function () {
  "use strict";

  document.querySelectorAll("[data-open-dialog]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var id = btn.getAttribute("data-open-dialog");
      var d = id && document.getElementById(id);
      if (d && typeof d.showModal === "function") d.showModal();
    });
  });
})();
