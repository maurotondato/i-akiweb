(function () {
  "use strict";
  /* ===========================================================
     Iñaki Etchegaray — motor de interacción
     M-DATOS · patrón IIFE, sin módulos (funciona en file://)
     =========================================================== */

  var hasGSAP = !!(window.gsap && window.ScrollTrigger);
  if (hasGSAP) gsap.registerPlugin(ScrollTrigger);

  var reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var fine = matchMedia("(hover: hover) and (pointer: fine)").matches;

  /* Cada init va aislado: si uno falla, el resto sigue vivo. */
  function safe(fn, name) {
    try { fn(); } catch (err) { console.warn("[init:" + name + "]", err); }
  }

  function escHTML(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  /* ---------------- SPLASH ---------------- */
  function initSplash() {
    var splash = document.querySelector("[data-splash]");
    if (!splash) return;
    var hide = function () {
      splash.classList.add("is-out");
      document.documentElement.classList.add("is-ready");
    };
    if (document.readyState === "complete") setTimeout(hide, 650);
    else window.addEventListener("load", function () { setTimeout(hide, 500); });
    setTimeout(hide, 4000);
  }

  /* ---------------- SPLIT TEXT ----------------
     Itera childNodes para no aplastar <em> ni <br>. */
  function wrapChars(text, cls) {
    var out = "";
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      out += ch === " " ? " " : '<span class="' + cls + '" aria-hidden="true">' + escHTML(ch) + "</span>";
    }
    return out;
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
    var html = Array.prototype.map.call(el.childNodes, function (node) {
      if (node.nodeType === 3) return wrap(node.textContent, cls);
      if (node.nodeName === "BR") return "<br>";
      if (node.nodeType === 1) {
        var tag = node.tagName.toLowerCase();
        return "<" + tag + ">" + wrap(node.textContent, cls) + "</" + tag + ">";
      }
      return "";
    }).join("");
    el.innerHTML = html;
    return el.querySelectorAll("." + cls);
  }

  function initSplitText() {
    var targets = document.querySelectorAll("[data-split]");
    if (!hasGSAP) return; /* sin GSAP el texto queda legible tal cual */
    targets.forEach(function (el) {
      var mode = el.dataset.split === "chars" ? "chars" : "words";
      var parts = splitEl(el, mode);
      if (!parts.length) return;

      var isHero = el.classList.contains("hero-title") || el.classList.contains("hero-sub");
      gsap.set(parts, { yPercent: 108, opacity: 0 });

      var tween = {
        yPercent: 0,
        opacity: 1,
        duration: mode === "chars" ? 1.05 : 0.9,
        stagger: mode === "chars" ? 0.021 : 0.045,
        ease: "expo.out"
      };

      if (isHero) {
        tween.delay = el.classList.contains("hero-title") ? 0.75 : 1.05;
        gsap.to(parts, tween);
      } else {
        tween.scrollTrigger = { trigger: el, start: "top 88%", once: true };
        gsap.to(parts, tween);
      }
    });
  }

  /* ---------------- ENTRADA DEL HERO ---------------- */
  function initHeroIntro() {
    if (!hasGSAP) return;
    var tl = gsap.timeline({ delay: 0.55 });
    tl.from(".hero-kicker", { y: 18, opacity: 0, duration: 0.8, ease: "expo.out" })
      .from(".hero-actions", { y: 22, opacity: 0, duration: 0.85, ease: "expo.out" }, 1.25)
      .from(".hero-shot", { y: 48, opacity: 0, scale: 1.04, duration: 1.3, ease: "expo.out" }, 0.75)
      .from(".hero-chip", { y: 26, opacity: 0, duration: 0.9, ease: "expo.out" }, 1.5)
      .from(".hero-foot", { opacity: 0, duration: 0.9, ease: "power2.out" }, 1.7);
  }

  /* ---------------- CANVAS: CURVAS DE NIVEL ---------------- */
  function topoCanvas(cv, opts) {
    var ctx = cv.getContext("2d");
    if (!ctx) return;
    var o = opts || {};
    var stroke = o.stroke || "23,99,224";
    var w = 0, h = 0, raf = null, t = 0;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);

    function size() {
      var r = cv.getBoundingClientRect();
      if (!r.width || !r.height) return;
      w = r.width; h = r.height;
      cv.width = Math.floor(w * dpr);
      cv.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function frame() {
      ctx.clearRect(0, 0, w, h);
      var lines = 18;
      for (var i = 0; i < lines; i++) {
        var p = i / (lines - 1);
        ctx.beginPath();
        ctx.strokeStyle = "rgba(" + stroke + "," + (0.04 + p * 0.17).toFixed(3) + ")";
        ctx.lineWidth = 1;
        for (var x = -20; x <= w + 20; x += 8) {
          var nx = x / (w || 1);
          var peak = Math.exp(-Math.pow((nx - 0.63) * 2.5, 2)) * h * 0.44;
          var wave = Math.sin(nx * 5.4 + t * 0.00038 + i * 0.42) * (6 + i * 1.5);
          var y = h * 0.94 - peak * (0.28 + p * 0.8) - i * (h * 0.032) + wave;
          if (x === -20) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      t += 16;
      raf = requestAnimationFrame(frame);
    }

    size();
    frame();
    window.addEventListener("resize", size, { passive: true });
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) { cancelAnimationFrame(raf); raf = null; }
      else if (!raf) raf = requestAnimationFrame(frame);
    });
  }

  function initTopo() {
    var hero = document.querySelector("[data-topo]");
    if (hero) topoCanvas(hero, { stroke: "23,99,224" });
    var final = document.querySelector("[data-topo-final]");
    if (final) topoCanvas(final, { stroke: "127,182,255" });
  }

  /* ---------------- CURSOR ---------------- */
  function initCursor() {
    var root = document.querySelector("[data-cursor-root]");
    if (!root || !fine) return;
    document.documentElement.classList.add("has-cursor");
    var ring = root.querySelector(".cursor-ring");
    var dot = root.querySelector(".cursor-dot");
    var tx = 0, ty = 0, rx = 0, ry = 0, first = false;

    window.addEventListener("mousemove", function (e) {
      tx = e.clientX; ty = e.clientY;
      if (dot) dot.style.transform = "translate3d(" + tx + "px," + ty + "px,0)";
      if (!first) {
        first = true; rx = tx; ry = ty;
        if (ring) ring.style.transform = "translate3d(" + rx + "px," + ry + "px,0)";
        root.classList.add("is-ready");
      }
    }, { passive: true });

    (function loop() {
      rx += (tx - rx) * 0.18; ry += (ty - ry) * 0.18;
      if (ring) ring.style.transform = "translate3d(" + rx.toFixed(2) + "px," + ry.toFixed(2) + "px,0)";
      requestAnimationFrame(loop);
    })();

    var HOVER = "a[href], button, .shot, .voice, .prog";
    document.addEventListener("mouseover", function (e) {
      if (e.target.closest && e.target.closest(HOVER)) root.classList.add("is-interactive");
    });
    document.addEventListener("mouseout", function (e) {
      if (e.target.closest && e.target.closest(HOVER)) root.classList.remove("is-interactive");
    });
  }

  /* ---------------- BOTONES MAGNÉTICOS ---------------- */
  function initMagnetic() {
    if (!fine) return;
    document.querySelectorAll("[data-magnetic]").forEach(function (el) {
      if (el.classList.contains("has-magnetic")) return;
      var strength = parseFloat(el.dataset.magneticStrength || "0.3");
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
        tx = ((e.clientX - r.left) - r.width / 2) * strength;
        ty = ((e.clientY - r.top) - r.height / 2) * strength;
        if (!raf) raf = requestAnimationFrame(loop);
      });
      el.addEventListener("mouseleave", function () {
        tx = 0; ty = 0; if (!raf) raf = requestAnimationFrame(loop);
      });
    });
  }

  /* ---------------- TILT 3D ---------------- */
  function initTilt() {
    if (!fine) return;
    document.querySelectorAll("[data-tilt]").forEach(function (el) {
      var inner = el.querySelector(".ph") || el;
      el.addEventListener("pointermove", function (e) {
        var r = el.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width - 0.5;
        var py = (e.clientY - r.top) / r.height - 0.5;
        inner.style.transform =
          "perspective(1000px) rotateY(" + (px * 8).toFixed(2) + "deg) rotateX(" +
          (-py * 8).toFixed(2) + "deg) translateY(-6px) scale(1.012)";
      });
      el.addEventListener("pointerleave", function () { inner.style.transform = ""; });
    });
  }

  /* ---------------- REVEAL ---------------- */
  function initReveal() {
    var els = document.querySelectorAll(".reveal");
    if (!els.length) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); }
      });
    }, { threshold: 0.05, rootMargin: "0px 0px -6% 0px" });
    els.forEach(function (el) { io.observe(el); });

    /* Red de seguridad: nada puede quedar invisible para siempre. */
    setTimeout(function () {
      document.querySelectorAll(".reveal:not(.is-in)").forEach(function (el) {
        el.classList.add("is-in");
      });
    }, 6000);
  }

  /* ---------------- CONTADORES ---------------- */
  function initCountUp() {
    document.querySelectorAll("[data-count-to]").forEach(function (el) {
      var target = parseFloat(el.dataset.countTo);
      var done = false;
      function run() {
        if (done) return;
        done = true;
        if (hasGSAP) {
          var obj = { v: 0 };
          gsap.to(obj, {
            v: target, duration: 1.5, ease: "power2.out",
            onUpdate: function () { el.textContent = Math.round(obj.v); }
          });
        } else {
          el.textContent = target;
        }
      }
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (!e.isIntersecting) return;
          io.unobserve(e.target);
          run();
        });
      }, { threshold: 0.05 });
      io.observe(el);
      /* Red de seguridad: el número nunca queda en 0. */
      setTimeout(run, 6000);
    });
  }

  /* ---------------- MARQUEE ---------------- */
  function initMarquee() {
    if (!hasGSAP) return;
    document.querySelectorAll("[data-marquee]").forEach(function (track) {
      if (track.dataset.marqueeBound) return;
      track.dataset.marqueeBound = "1";
      var clone = track.cloneNode(true);
      clone.removeAttribute("data-marquee");
      clone.removeAttribute("data-marquee-bound");
      track.parentNode.appendChild(clone);
      var distance = track.scrollWidth;
      if (!distance) return;
      gsap.to([track, clone], {
        x: -distance, duration: distance / 58, ease: "none", repeat: -1,
        modifiers: { x: gsap.utils.unitize(function (x) { return parseFloat(x) % distance; }) }
      });
    });
  }

  /* ---------------- NAV + BARRA DE PROGRESO ---------------- */
  function initChrome() {
    var nav = document.querySelector("[data-nav]");
    var bar = document.querySelector("[data-progress]");
    var ticking = false;
    function update() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        var y = window.scrollY || window.pageYOffset;
        if (nav) nav.classList.toggle("is-solid", y > 48);
        if (bar) {
          var max = document.documentElement.scrollHeight - window.innerHeight;
          bar.style.transform = "scaleX(" + (max > 0 ? Math.min(y / max, 1) : 0).toFixed(4) + ")";
        }
        ticking = false;
      });
    }
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update, { passive: true });
    update();
  }

  /* ---------------- PARALLAX ---------------- */
  function initParallax() {
    if (!hasGSAP || reduced) return;

    document.querySelectorAll("[data-parallax]").forEach(function (el) {
      var depth = parseFloat(el.dataset.parallax || "0.12");
      gsap.to(el, {
        yPercent: depth * 42,
        ease: "none",
        scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: 0.6 }
      });
    });

    var img = document.querySelector("[data-parallax-img]");
    if (img) {
      gsap.fromTo(img, { yPercent: -7 }, {
        yPercent: 7, ease: "none",
        scrollTrigger: { trigger: ".case", start: "top bottom", end: "bottom top", scrub: 0.8 }
      });
    }
  }

  /* ---------------- MÉTODO CIMA ----------------
     El sendero se dibuja con el scroll y cada nodo
     enciende su bloque de texto. Es la pieza central:
     explica el método mostrándolo, no contándolo. */
  function initCima() {
    var stage = document.querySelector("[data-cima-stage]");
    var ridge = document.querySelector("[data-ridge]");
    if (!stage || !ridge) return;

    var nodes = Array.prototype.slice.call(document.querySelectorAll(".node"));
    var steps = Array.prototype.slice.call(document.querySelectorAll(".step"));
    var summit = document.querySelector("[data-summit]");
    var caption = document.querySelector("[data-summit-caption]");
    var len = ridge.getTotalLength();

    ridge.style.strokeDasharray = len;
    ridge.style.strokeDashoffset = len;

    function paint(p) {
      ridge.style.strokeDashoffset = (len * (1 - p)).toFixed(2);
      nodes.forEach(function (n, i) { n.classList.toggle("is-on", p >= i * 0.235 + 0.015); });
      steps.forEach(function (s, i) { s.classList.toggle("is-on", p >= i * 0.235 + 0.015); });
      if (summit) summit.classList.toggle("is-on", p > 0.96);
      if (caption) caption.classList.toggle("is-on", p > 0.96);
    }

    if (!hasGSAP) { paint(1); return; }

    ScrollTrigger.create({
      trigger: stage,
      start: "top 62%",
      end: "bottom 78%",
      scrub: 0.65,
      onUpdate: function (self) { paint(self.progress); },
      onRefresh: function (self) { paint(self.progress); }
    });
  }

  /* ---------------- GALERÍA PINNEADA ---------------- */
  function initShowcase() {
    if (!hasGSAP) return;
    var sec = document.querySelector(".showcase");
    var track = document.querySelector("[data-showcase]");
    if (!sec || !track) return;

    function setup() {
      ScrollTrigger.getAll().forEach(function (s) {
        if (s.vars && s.vars.id === "showcase-pin") s.kill();
      });
      var isDesktop = window.innerWidth >= 1024;
      sec.classList.toggle("is-pinned", isDesktop);
      if (!isDesktop) { gsap.set(track, { x: 0 }); return; }

      var distance = track.scrollWidth - window.innerWidth + 80;
      if (distance <= 0) return;

      gsap.to(track, {
        x: function () { return -distance; },
        ease: "none",
        scrollTrigger: {
          id: "showcase-pin",
          trigger: sec,
          start: "top top+=68",
          end: function () { return "+=" + (distance + window.innerHeight * 0.45); },
          pin: true,
          scrub: 0.65,
          invalidateOnRefresh: true,
          anticipatePin: 1
        }
      });
    }

    setup();
    var to;
    window.addEventListener("resize", function () {
      clearTimeout(to);
      to = setTimeout(function () { ScrollTrigger.refresh(); setup(); }, 260);
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
        var y = t.getBoundingClientRect().top + window.pageYOffset - 76;
        window.scrollTo({ top: y, behavior: reduced ? "auto" : "smooth" });
      });
    });
  }

  /* ---------------- ARRANQUE ---------------- */
  function boot() {
    safe(initSplash, "splash");
    safe(initTopo, "topo");
    safe(initCursor, "cursor");
    safe(initChrome, "chrome");
    safe(initReveal, "reveal");
    safe(initSplitText, "split");
    safe(initHeroIntro, "heroIntro");
    safe(initMagnetic, "magnetic");
    safe(initTilt, "tilt");
    safe(initCountUp, "countup");
    safe(initMarquee, "marquee");
    safe(initParallax, "parallax");
    safe(initCima, "cima");
    safe(initShowcase, "showcase");
    safe(initAnchors, "anchors");

    if (hasGSAP) {
      window.addEventListener("load", function () { ScrollTrigger.refresh(); });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
