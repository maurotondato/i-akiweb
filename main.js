(function () {
  "use strict";
  /* ===========================================================
     Iñaki Etchegaray — motor de interacción
     M-DATOS · IIFE, sin módulos (funciona también en file://)
     =========================================================== */

  var hasGSAP = !!(window.gsap && window.ScrollTrigger);
  if (hasGSAP) gsap.registerPlugin(ScrollTrigger);
  var reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var fine = matchMedia("(hover: hover) and (pointer: fine)").matches;

  function safe(fn, name) {
    try { fn(); } catch (e) { console.warn("[init:" + name + "]", e); }
  }
  function escHTML(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  /* ---------------- SPLASH ---------------- */
  function initSplash() {
    var splash = document.querySelector("[data-splash]");
    var done = function () { document.documentElement.classList.add("is-ready"); };
    if (!splash) { done(); return; }
    var hide = function () { splash.classList.add("is-out"); done(); };
    if (document.readyState === "complete") setTimeout(hide, 650);
    else window.addEventListener("load", function () { setTimeout(hide, 500); });
    setTimeout(hide, 4000);
  }

  /* ---------------- SPLIT TEXT ---------------- */
  function wrapChars(text, cls) {
    return text.split(/(\s+)/).map(function (word) {
      if (/^\s*$/.test(word)) return word;
      var inner = "";
      for (var i = 0; i < word.length; i++) {
        inner += '<span class="' + cls + '" aria-hidden="true">' + escHTML(word[i]) + "</span>";
      }
      return '<span class="split-unit" aria-hidden="true">' + inner + "</span>";
    }).join("");
  }
  function wrapWords(text, cls) {
    return text.split(/(\s+)/).map(function (w) {
      return /^\s*$/.test(w) ? w : '<span class="' + cls + '" aria-hidden="true">' + escHTML(w) + "</span>";
    }).join("");
  }
  function splitEl(el, mode) {
    var cls = mode === "chars" ? "split-char" : "split-word";
    var wrap = mode === "chars" ? wrapChars : wrapWords;
    el.setAttribute("aria-label", el.textContent.trim().replace(/\s+/g, " "));
    el.innerHTML = Array.prototype.map.call(el.childNodes, function (n) {
      if (n.nodeType === 3) return wrap(n.textContent, cls);
      if (n.nodeName === "BR") return "<br>";
      if (n.nodeType === 1) {
        var t = n.tagName.toLowerCase();
        return "<" + t + ">" + wrap(n.textContent, cls) + "</" + t + ">";
      }
      return "";
    }).join("");
    return el.querySelectorAll("." + cls);
  }
  function initSplitText() {
    if (!hasGSAP) return;
    document.querySelectorAll("[data-split]").forEach(function (el) {
      var mode = el.dataset.split === "chars" ? "chars" : "words";
      var parts = splitEl(el, mode);
      if (!parts.length) return;
      var hero = el.classList.contains("hero-title") || el.classList.contains("hero-sub");
      gsap.set(parts, { yPercent: 108, opacity: 0 });
      var v = {
        yPercent: 0, opacity: 1,
        duration: mode === "chars" ? 1.05 : 0.9,
        stagger: mode === "chars" ? 0.021 : 0.045,
        ease: "expo.out"
      };
      if (hero) {
        v.delay = el.classList.contains("hero-title") ? 0.8 : 1.1;
        gsap.to(parts, v);
      } else {
        v.scrollTrigger = { trigger: el, start: "top 88%", once: true };
        gsap.to(parts, v);
      }
    });
  }

  /* ---------------- HERO: caminante sobre el sendero ----------------
     El punto recorre la cresta de la cordillera una vez, al cargar.
     Es la metáfora de la marca: el ascenso, no la cima. */
  function initWalker() {
    var trail = document.querySelector("[data-trail]");
    var walker = document.querySelector("[data-walker]");
    if (!trail || !walker || !hasGSAP || reduced) return;
    var len = trail.getTotalLength();
    var o = { t: 0 };
    gsap.to(o, {
      t: 1, duration: 2.8, delay: 0.9, ease: "power1.inOut",
      onUpdate: function () {
        var p = trail.getPointAtLength(o.t * len);
        walker.setAttribute("cx", p.x);
        walker.setAttribute("cy", p.y);
      }
    });
  }

  /* ---------------- REVEAL ---------------- */
  function initReveal() {
    var els = document.querySelectorAll(".reveal");
    if (!els.length) return;
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); }
      });
    }, { threshold: 0.05, rootMargin: "0px 0px -6% 0px" });
    els.forEach(function (el) { io.observe(el); });
    setTimeout(function () {
      document.querySelectorAll(".reveal:not(.is-in)").forEach(function (el) { el.classList.add("is-in"); });
    }, 6000);
  }

  /* ---------------- CONTADORES ---------------- */
  function initCountUp() {
    document.querySelectorAll("[data-count-to]").forEach(function (el) {
      var target = parseFloat(el.dataset.countTo), done = false;
      function run() {
        if (done) return; done = true;
        if (hasGSAP) {
          var o = { v: 0 };
          gsap.to(o, { v: target, duration: 1.5, ease: "power2.out",
            onUpdate: function () { el.textContent = Math.round(o.v); } });
        } else el.textContent = target;
      }
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting) { io.unobserve(e.target); run(); } });
      }, { threshold: 0.05 });
      io.observe(el);
      setTimeout(run, 6000);
    });
  }

  /* ---------------- MARQUEE ---------------- */
  function initMarquee() {
    if (!hasGSAP) return;
    document.querySelectorAll("[data-marquee]").forEach(function (track) {
      if (track.dataset.bound) return;
      track.dataset.bound = "1";
      var clone = track.cloneNode(true);
      clone.removeAttribute("data-marquee");
      track.parentNode.appendChild(clone);
      var d = track.scrollWidth;
      if (!d) return;
      gsap.to([track, clone], {
        x: -d, duration: d / 58, ease: "none", repeat: -1,
        modifiers: { x: gsap.utils.unitize(function (x) { return parseFloat(x) % d; }) }
      });
    });
  }

  /* ---------------- NAV, PROGRESO Y WHATSAPP ---------------- */
  function initChrome() {
    var nav = document.querySelector("[data-nav]");
    var bar = document.querySelector("[data-progress]");
    var wa = document.querySelector("[data-wa]");
    var t = false;
    function up() {
      if (t) return; t = true;
      requestAnimationFrame(function () {
        var y = window.scrollY || window.pageYOffset;
        if (nav) nav.classList.toggle("is-solid", y > 48);
        if (wa) wa.classList.toggle("is-in", y > window.innerHeight * 0.55);
        if (bar) {
          var max = document.documentElement.scrollHeight - window.innerHeight;
          bar.style.transform = "scaleX(" + (max > 0 ? Math.min(y / max, 1) : 0).toFixed(4) + ")";
        }
        t = false;
      });
    }
    window.addEventListener("scroll", up, { passive: true });
    window.addEventListener("resize", up, { passive: true });
    up();
  }

  /* ---------------- PARALLAX ---------------- */
  function initParallax() {
    if (!hasGSAP || reduced) return;
    document.querySelectorAll("[data-parallax]").forEach(function (el) {
      var d = parseFloat(el.dataset.parallax || "0.12");
      gsap.to(el, { yPercent: d * 40, ease: "none",
        scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: 0.6 } });
    });
    var img = document.querySelector("[data-parallax-img]");
    if (img) {
      gsap.fromTo(img, { yPercent: -6 }, { yPercent: 6, ease: "none",
        scrollTrigger: { trigger: ".case", start: "top bottom", end: "bottom top", scrub: 0.8 } });
    }
  }

  /* ---------------- MÉTODO CIMA ----------------
     La sección se pinnea y los cuatro planos pasan de a uno.
     El sendero avanza de campamento en campamento. Al mostrar
     un paso por vez entra completo en cualquier pantalla. */
  function initCima() {
    var sec = document.querySelector("[data-cima]");
    var trail = document.querySelector("[data-cima-trail]");
    if (!sec || !trail) return;

    var planos = Array.prototype.slice.call(sec.querySelectorAll(".plano"));
    var camps = Array.prototype.slice.call(sec.querySelectorAll(".camp"));
    var dots = Array.prototype.slice.call(sec.querySelectorAll(".cima-dots li"));
    var len = trail.getTotalLength();
    trail.style.strokeDasharray = len;
    trail.style.strokeDashoffset = len;

    function render(p) {
      trail.style.strokeDashoffset = (len * (1 - p)).toFixed(2);
      /* 4 tramos: cada plano ocupa un cuarto del recorrido */
      var idx = Math.min(3, Math.floor(p * 4 + 0.0001));
      if (p >= 0.999) idx = 3;
      planos.forEach(function (el, i) { el.classList.toggle("is-on", i === idx); });
      dots.forEach(function (el, i) { el.classList.toggle("is-on", i <= idx); });
      camps.forEach(function (el, i) {
        el.classList.toggle("is-on", i <= idx || (i === 4 && p > 0.985));
      });
    }

    if (!hasGSAP || reduced) {
      render(1);
      planos.forEach(function (el, i) { el.classList.toggle("is-on", i === 0); });
      /* sin GSAP: los planos se recorren con los puntos */
      dots.forEach(function (d, i) {
        d.style.cursor = "pointer";
        d.addEventListener("click", function () {
          planos.forEach(function (el, j) { el.classList.toggle("is-on", j === i); });
          dots.forEach(function (el, j) { el.classList.toggle("is-on", j <= i); });
        });
      });
      return;
    }

    render(0);
    ScrollTrigger.create({
      trigger: sec,
      start: "top top",
      end: "+=" + (window.innerHeight * 3.2),
      pin: ".cima-pin",
      scrub: 0.6,
      anticipatePin: 1,
      invalidateOnRefresh: true,
      onUpdate: function (self) { render(self.progress); },
      onRefresh: function (self) { render(self.progress); }
    });
  }

  /* ---------------- GALERÍA HORIZONTAL ----------------
     El alto del pin lo fija la propia sección, así no queda
     media foto tapada al terminar el recorrido. */
  function initShowcase() {
    if (!hasGSAP) return;
    var sec = document.querySelector(".showcase");
    var track = document.querySelector("[data-showcase]");
    var vp = document.querySelector(".showcase-viewport");
    if (!sec || !track || !vp) return;

    function setup() {
      ScrollTrigger.getAll().forEach(function (s) {
        if (s.vars && s.vars.id === "showcase-pin") s.kill();
      });
      gsap.set(track, { x: 0 });
      if (window.innerWidth < 1024) return;

      var distance = track.scrollWidth - vp.clientWidth;
      if (distance <= 0) return;

      gsap.to(track, {
        x: function () { return -distance; },
        ease: "none",
        scrollTrigger: {
          id: "showcase-pin",
          trigger: sec,
          start: "center center",
          end: function () { return "+=" + distance; },
          pin: true,
          scrub: 0.6,
          invalidateOnRefresh: true,
          anticipatePin: 1
        }
      });
    }

    setup();
    var to;
    window.addEventListener("resize", function () {
      clearTimeout(to);
      to = setTimeout(function () { setup(); ScrollTrigger.refresh(); }, 260);
    });
  }

  /* ---------------- PROGRAMAS: brillo que sigue al mouse ---------------- */
  function initProgGlow() {
    if (!fine) return;
    document.querySelectorAll("[data-prog]").forEach(function (card) {
      card.addEventListener("pointermove", function (e) {
        var r = card.getBoundingClientRect();
        card.style.setProperty("--mx", ((e.clientX - r.left) / r.width * 100).toFixed(1) + "%");
        card.style.setProperty("--my", ((e.clientY - r.top) / r.height * 100).toFixed(1) + "%");
      });
    });
  }

  /* ---------------- BOTONES MAGNÉTICOS ---------------- */
  function initMagnetic() {
    if (!fine) return;
    document.querySelectorAll("[data-magnetic]").forEach(function (el) {
      if (el.classList.contains("has-magnetic")) return;
      var s = parseFloat(el.dataset.magneticStrength || "0.3");
      var inner = document.createElement("span");
      inner.className = "magnetic-inner";
      while (el.firstChild) inner.appendChild(el.firstChild);
      el.appendChild(inner);
      el.classList.add("has-magnetic");
      var tx = 0, ty = 0, cx = 0, cy = 0, raf = null;
      function loop() {
        cx += (tx - cx) * 0.2; cy += (ty - cy) * 0.2;
        inner.style.transform = "translate3d(" + cx.toFixed(2) + "px," + cy.toFixed(2) + "px,0)";
        raf = (Math.abs(tx - cx) > 0.1 || Math.abs(ty - cy) > 0.1) ? requestAnimationFrame(loop) : null;
      }
      el.addEventListener("mousemove", function (e) {
        var r = el.getBoundingClientRect();
        tx = ((e.clientX - r.left) - r.width / 2) * s;
        ty = ((e.clientY - r.top) - r.height / 2) * s;
        if (!raf) raf = requestAnimationFrame(loop);
      });
      el.addEventListener("mouseleave", function () { tx = 0; ty = 0; if (!raf) raf = requestAnimationFrame(loop); });
    });
  }

  /* ---------------- ANCLAS ---------------- */
  function initAnchors() {
    document.querySelectorAll('a[href^="#"]').forEach(function (a) {
      a.addEventListener("click", function (e) {
        var id = a.getAttribute("href");
        if (!id || id === "#") return;
        var t = document.querySelector(id);
        if (!t) return;
        e.preventDefault();
        window.scrollTo({ top: t.getBoundingClientRect().top + window.pageYOffset - 70,
          behavior: reduced ? "auto" : "smooth" });
      });
    });
  }

  function boot() {
    safe(initSplash, "splash");
    safe(initChrome, "chrome");
    safe(initReveal, "reveal");
    safe(initSplitText, "split");
    safe(initWalker, "walker");
    safe(initCountUp, "countup");
    safe(initMarquee, "marquee");
    safe(initMagnetic, "magnetic");
    safe(initProgGlow, "progGlow");
    safe(initParallax, "parallax");
    safe(initCima, "cima");
    safe(initShowcase, "showcase");
    safe(initAnchors, "anchors");
    if (hasGSAP) window.addEventListener("load", function () { ScrollTrigger.refresh(); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
