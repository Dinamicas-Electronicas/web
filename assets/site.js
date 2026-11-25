(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var layers = Array.prototype.slice.call(document.querySelectorAll("[data-scroll-speed]"));
  var media = Array.prototype.slice.call(document.querySelectorAll("[data-parallax]"));
  var progressBar = document.querySelector("[data-scroll-progress]");
  var ticking = false;

  function clamp(value, min, max) {
    return value < min ? min : value > max ? max : value;
  }

  function update() {
    var y = window.scrollY || window.pageYOffset || 0;

    if (!reduceMotion) {
      layers.forEach(function (layer) {
        var speed = parseFloat(layer.getAttribute("data-scroll-speed")) || 0;
        layer.style.transform = "translate3d(0, " + (y * speed).toFixed(1) + "px, 0)";
      });

      media.forEach(function (item) {
        var rect = item.getBoundingClientRect();
        var viewport = window.innerHeight || 0;
        if (rect.bottom < -240 || rect.top > viewport + 240) return;
        var speed = parseFloat(item.getAttribute("data-parallax")) || 0;
        var center = rect.top + rect.height / 2 - viewport / 2;
        var offset = clamp((-center / viewport) * speed * 160, -48, 48);
        item.style.setProperty("--parallax", offset.toFixed(1) + "px");
      });
    }

    if (progressBar) {
      var total = document.documentElement.scrollHeight - window.innerHeight;
      progressBar.style.transform = "scaleX(" + (total > 0 ? clamp(y / total, 0, 1) : 0) + ")";
    }

    ticking = false;
  }

  function requestUpdate() {
    if (!ticking) {
      ticking = true;
      window.requestAnimationFrame(update);
    }
  }

  window.addEventListener("scroll", requestUpdate, { passive: true });
  window.addEventListener("resize", requestUpdate);
  update();

  var revealItems = Array.prototype.slice.call(document.querySelectorAll(".reveal"));
  if (revealItems.length) {
    if ("IntersectionObserver" in window && !reduceMotion) {
      var observer = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              entry.target.classList.add("is-visible");
              observer.unobserve(entry.target);
            }
          });
        },
        { rootMargin: "0px 0px -10% 0px", threshold: 0.12 }
      );
      revealItems.forEach(function (item) {
        observer.observe(item);
      });
    } else {
      revealItems.forEach(function (item) {
        item.classList.add("is-visible");
      });
    }
  }
})();
