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
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

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

  /* ---------------- HERO: red de nodos que construye la montaña ----------------
     Los nodos nacen dispersos (ruido, cabeza desordenada), se enlazan
     como una red neuronal y se van ordenando hasta dibujar la silueta
     del isotipo. Después se desarma y vuelve a empezar: la mentalidad
     no se alcanza, se construye todos los días. */
  function initNeuro() {
    var cv = document.querySelector("[data-neuro]");
    var shape = document.querySelector("[data-shape]");
    var hero = document.querySelector(".hero");
    if (!cv || !shape || !hero) return;
    var ctx = cv.getContext("2d");
    if (!ctx) return;

    var N = window.innerWidth < 760 ? 84 : 132;
    var bb = shape.getBBox();
    var total = shape.getTotalLength();
    if (!total || !bb.width || !bb.height) return;

    /* Muestreo uniforme de la silueta, normalizado a su propia caja. */
    var nodes = [];
    for (var i = 0; i < N; i++) {
      var o = i / (N - 1);
      var p = shape.getPointAtLength(total * o);
      nodes.push({
        nx: (p.x - bb.x) / bb.width,
        ny: (p.y - bb.y) / bb.height,
        /* punto de partida disperso, en la mitad inferior del hero */
        sx: Math.random(),
        sy: 0.26 + Math.random() * 0.68,
        o: o,
        ph: Math.random() * Math.PI * 2,
        sp: 0.25 + Math.random() * 0.5,
        amp: 10 + Math.random() * 26,
        tx: 0, ty: 0, x: 0, y: 0, t: 0
      });
    }

    var W = 0, H = 0, LINK = 0;
    function measure() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var r = hero.getBoundingClientRect();
      W = Math.max(320, Math.round(r.width));
      H = Math.max(360, Math.round(r.height));
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      LINK = Math.max(68, W * 0.072);

      /* La silueta se estira en alto para que deje de parecer una
         cordillera plana. En desktop vive a la derecha, detrás de la
         figura; en celular se agranda y sangra por los dos costados,
         así las cumbres asoman por encima de la foto en vez de quedar
         tapadas por ella. */
      var narrow = W < 760;
      var mw = W * (narrow ? 2.0 : 0.86);
      var mh = mw * (bb.height / bb.width) * (narrow ? 1.5 : 1.26);
      var ox = narrow ? (W - mw) / 2 : (W - mw) * 0.92;
      var oy = (narrow ? H * 0.9 : H * 0.99) - mh;
      for (var k = 0; k < nodes.length; k++) {
        var n = nodes[k];
        n.tx = ox + n.nx * mw;
        n.ty = oy + n.ny * mh;
        n.x = n.sx * W;
        n.y = n.sy * H;
      }
    }

    /* Puntero: la red se aparta, da señal de vida. */
    var mx = -9999, my = -9999;
    if (fine) {
      hero.addEventListener("pointermove", function (e) {
        var r = hero.getBoundingClientRect();
        mx = e.clientX - r.left; my = e.clientY - r.top;
      });
      hero.addEventListener("pointerleave", function () { mx = -9999; my = -9999; });
    }

    function stag(g, order, spread) {
      return clamp01((g - order * spread) / (1 - spread));
    }
    function easeOut(x) { return 1 - Math.pow(1 - x, 3); }
    function easeIn(x) { return x * x * x; }

    /* Ciclo: armado · sostener · desarmado · respiro */
    var A = 3.6, HOLD = 2.6, D = 2.8, REST = 1.0, CYCLE = A + HOLD + D + REST;

    function state(tc) {
      if (tc < A) return { g: tc / A, mode: 1 };
      if (tc < A + HOLD) return { g: 1, mode: 2 };
      if (tc < A + HOLD + D) return { g: (tc - A - HOLD) / D, mode: 3 };
      return { g: 1, mode: 4 };
    }

    function draw(time, frozen) {
      var st = frozen ? { g: 1, mode: 2 } : state(time % CYCLE);
      var sum = 0, k, n;

      for (k = 0; k < nodes.length; k++) {
        n = nodes[k];
        if (st.mode === 1) n.t = easeOut(stag(st.g, n.o, 0.6));
        else if (st.mode === 2) n.t = 1;
        else if (st.mode === 3) n.t = 1 - easeIn(stag(st.g, 1 - n.o, 0.6));
        else n.t = 0;
        sum += n.t;

        var wob = frozen ? 0 : 1;
        var dx = Math.sin(time * n.sp + n.ph) * n.amp * (1 - n.t * 0.93) * wob;
        var dy = Math.cos(time * n.sp * 0.82 + n.ph) * n.amp * 0.72 * (1 - n.t * 0.93) * wob;
        var x = n.x + (n.tx - n.x) * n.t + dx;
        var y = n.y + (n.ty - n.y) * n.t + dy;

        /* repulsión suave del puntero */
        var rx = x - mx, ry = y - my;
        var rd = Math.sqrt(rx * rx + ry * ry);
        if (rd < 130 && rd > 0.01) {
          var f = (1 - rd / 130) * 38;
          x += (rx / rd) * f; y += (ry / rd) * f;
        }
        n.px = x; n.py = y;
      }

      var ta = sum / nodes.length;
      ctx.clearRect(0, 0, W, H);

      /* Macizo apenas insinuado cuando la silueta ya está armada */
      if (ta > 0.62) {
        ctx.beginPath();
        ctx.moveTo(nodes[0].px, nodes[0].py);
        for (k = 1; k < nodes.length; k++) ctx.lineTo(nodes[k].px, nodes[k].py);
        ctx.closePath();
        ctx.fillStyle = "rgba(69,174,229," + ((ta - 0.62) * 0.1).toFixed(3) + ")";
        ctx.fill();
      }

      /* Enlaces de la red */
      ctx.lineWidth = 1;
      for (k = 0; k < nodes.length; k++) {
        var a = nodes[k];
        for (var j = k + 1; j < nodes.length; j++) {
          var b = nodes[j];
          var ddx = a.px - b.px, ddy = a.py - b.py;
          var d2 = ddx * ddx + ddy * ddy;
          if (d2 > LINK * LINK) continue;
          var d = Math.sqrt(d2);
          var al = (1 - d / LINK) * (0.05 + 0.16 * ta);
          if (al < 0.006) continue;
          ctx.strokeStyle = "rgba(3,29,64," + al.toFixed(3) + ")";
          ctx.beginPath();
          ctx.moveTo(a.px, a.py);
          ctx.lineTo(b.px, b.py);
          ctx.stroke();
        }
      }

      /* Cresta: se va trazando a medida que cada nodo encuentra su lugar */
      ctx.lineWidth = 2;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      for (k = 0; k < nodes.length - 1; k++) {
        var p1 = nodes[k], p2 = nodes[k + 1];
        var tm = Math.min(p1.t, p2.t);
        if (tm <= 0.4) continue;
        ctx.strokeStyle = "rgba(30,137,196," + (((tm - 0.4) / 0.6) * 0.5).toFixed(3) + ")";
        ctx.beginPath();
        ctx.moveTo(p1.px, p1.py);
        ctx.lineTo(p2.px, p2.py);
        ctx.stroke();
      }

      /* Nodos */
      for (k = 0; k < nodes.length; k++) {
        n = nodes[k];
        ctx.fillStyle = "rgba(69,174,229," + (0.2 + 0.45 * n.t).toFixed(3) + ")";
        ctx.beginPath();
        ctx.arc(n.px, n.py, 1.5 + 1.7 * n.t, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    measure();

    if (reduced) { draw(0, true); return; }

    var running = true;
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (es) {
        running = es[0].isIntersecting;
      }, { threshold: 0 }).observe(hero);
    }
    var t0 = performance.now();
    function frame(now) {
      if (running) draw((now - t0) / 1000, false);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    var to;
    window.addEventListener("resize", function () {
      clearTimeout(to);
      to = setTimeout(measure, 180);
    }, { passive: true });
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
  }

  /* ---------------- MÉTODO CIMA ----------------
     La sección se pinnea. El scroll hace subir la cota: la montaña
     se va llenando desde la base y el índice C·I·M·A — visible desde
     el primer instante — marca en qué tramo del ascenso estás. */
  function initCima() {
    var sec = document.querySelector("[data-cima]");
    if (!sec) return;
    var rise = sec.querySelector("[data-rise]");
    var level = sec.querySelector("[data-level]");
    var tag = sec.querySelector("[data-level-tag]");
    var peak = sec.querySelector("[data-peak]");
    var planos = Array.prototype.slice.call(sec.querySelectorAll(".plano"));
    var steps = Array.prototype.slice.call(sec.querySelectorAll(".cima-index li"));
    if (!planos.length) return;

    var BASE = 156, TOP = 12;

    function render(p) {
      var y = BASE - (BASE - TOP) * p;
      if (rise) rise.setAttribute("y", y.toFixed(1));
      if (level) { level.setAttribute("y1", y.toFixed(1)); level.setAttribute("y2", y.toFixed(1)); }
      if (tag) {
        tag.setAttribute("y", Math.max(TOP + 11, y - 7).toFixed(1));
        tag.textContent = (p * 100 < 10 ? "0" : "") + Math.round(p * 100) + "%";
      }
      if (peak) peak.classList.toggle("is-on", p > 0.96);

      var idx = Math.min(3, Math.floor(p * 4 + 0.0001));
      planos.forEach(function (el, i) { el.classList.toggle("is-on", i === idx); });
      steps.forEach(function (el, i) {
        el.classList.toggle("is-on", i === idx);
        el.classList.toggle("is-done", i < idx);
      });
    }

    /* Sin GSAP o con movimiento reducido: el índice funciona como pestañas. */
    if (!hasGSAP || reduced) {
      render(0.12);
      steps.forEach(function (el, i) {
        el.style.cursor = "pointer";
        el.setAttribute("aria-hidden", "false");
        el.addEventListener("click", function () { render((i + 0.5) / 4); });
      });
      return;
    }

    render(0);
    ScrollTrigger.create({
      trigger: sec,
      start: "top top",
      end: function () { return "+=" + window.innerHeight * 3.4; },
      pin: ".cima-pin",
      scrub: 0.6,
      anticipatePin: 1,
      invalidateOnRefresh: true,
      onUpdate: function (self) { render(self.progress); },
      onRefresh: function (self) { render(self.progress); }
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
    safe(initNeuro, "neuro");
    safe(initCountUp, "countup");
    safe(initMarquee, "marquee");
    safe(initMagnetic, "magnetic");
    safe(initProgGlow, "progGlow");
    safe(initParallax, "parallax");
    safe(initCima, "cima");
    safe(initAnchors, "anchors");
    if (hasGSAP) window.addEventListener("load", function () { ScrollTrigger.refresh(); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
