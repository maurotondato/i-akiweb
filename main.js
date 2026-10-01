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

  /* El hero es la escena CIMA (cima.js, WebGL2). Si el dispositivo no
     la soporta cae al macizo 2D, que dice lo mismo con canvas plano. */
  function initHero() {
    var cv = document.querySelector("[data-neuro]");
    if (!cv) return;
    /* Si la escena 3D se repliega en marcha —GPU que no da, contexto
       perdido— avisa por aca y el macizo 2D toma el relevo. */
    var fell = false;
    window.CIMA_fallback = function () {
      if (fell) return;
      fell = true;
      /* Un canvas que ya entrego un contexto WebGL no devuelve nunca
         uno 2d: hay que reponer el elemento antes del relevo. */
      var old = document.querySelector("[data-neuro]");
      if (old && old.parentNode) old.parentNode.replaceChild(old.cloneNode(false), old);
      safe(initMassif, "massif");
    };
    if (window.CIMA_mount && window.CIMA_mount(cv)) return;
    initMassif();
  }

  /* ---------------- FALLBACK: el macizo que se construye ----------------
     La red de nodos no se leía como montaña: demasiado fina, sin masa.
     Acá la montaña está hecha de bloques que crecen desde el suelo,
     columna por columna. Cada bloque que aparece es un paso: se ve el
     ascenso, no sólo el resultado. Un punto de cumbre va trepando por
     lo más alto a medida que el macizo sube.
     Nunca se derrumba: una vez armado se TRANSFORMA en una cumbre más
     alta, y después en otra, en bucle. La cima no se alcanza —cada vez
     que llegás, hay una más arriba para construir. */
  function initMassif() {
    var cv = document.querySelector("[data-neuro]");
    var shape = document.querySelector("[data-shape]");
    var hero = document.querySelector(".hero");
    if (!cv || !hero) return;
    var ctx = cv.getContext("2d");
    if (!ctx) return;

    var small = window.innerWidth < 760;
    var COLS = small ? 21 : 34;
    var ROWS = small ? 10 : 13;
    var GAP = 3;

    /* Un pico: caída casi recta, apenas cóncava, como una ladera real */
    function peak(x, c, w, h, p) {
      var d = 1 - Math.abs((x - c) / w);
      return d <= 0 ? 0 : h * Math.pow(d, p);
    }
    function build(fn) {
      var a = [];
      for (var i = 0; i < COLS; i++) a.push(Math.max(0.06, fn(i / (COLS - 1))));
      return a;
    }

    /* El perfil del isotipo es uno de los estados: en algún momento del
       ciclo el macizo ES la montaña de la marca. */
    function brandProfile() {
      if (!shape) return null;
      var bb, total;
      try { bb = shape.getBBox(); total = shape.getTotalLength(); } catch (e) { return null; }
      if (!total || !bb.width || !bb.height) return null;
      var i, sky = [];
      for (i = 0; i < COLS; i++) sky[i] = Infinity;
      for (var k = 0; k <= 1400; k++) {
        var sp = shape.getPointAtLength(total * k / 1400);
        var b = Math.round((sp.x - bb.x) / bb.width * (COLS - 1));
        if (b < 0) b = 0; else if (b > COLS - 1) b = COLS - 1;
        if (sp.y < sky[b]) sky[b] = sp.y;
      }
      for (i = 0; i < COLS; i++) {
        if (isFinite(sky[i])) continue;
        var a = i - 1, c = i + 1;
        while (a >= 0 && !isFinite(sky[a])) a--;
        while (c < COLS && !isFinite(sky[c])) c++;
        sky[i] = a >= 0 && c < COLS ? (sky[a] + sky[c]) / 2 : (a >= 0 ? sky[a] : sky[c]);
      }
      var prof = sky.map(function (y) { return (1 - (y - bb.y) / bb.height) * 0.96; });
      /* El contorno del logo trae dientes de un píxel que a la escala de
         los bloques leen como ruido: dos pasadas de suavizado y las
         laderas quedan limpias. */
      for (var pass = 0; pass < 1; pass++) {
        var sm = prof.slice();
        for (i = 1; i < COLS - 1; i++) sm[i] = (prof[i - 1] + prof[i] * 2 + prof[i + 1]) / 4;
        prof = sm;
      }
      return prof.map(function (v) { return Math.max(0.06, v); });
    }

    /* Cumbres angostas a propósito: con laderas anchas el ápice cae
       menos de un bloque por columna y la cima se amesetaba. */
    var profiles = [
      build(function (x) { return Math.max(peak(x, 0.36, 0.26, 0.6, 1.35), peak(x, 0.64, 0.17, 0.4, 1.35)); }),
      brandProfile() || build(function (x) { return Math.max(peak(x, 0.4, 0.26, 0.82, 1.3), peak(x, 0.7, 0.19, 0.6, 1.3)); }),
      build(function (x) {
        return Math.max(peak(x, 0.47, 0.27, 1, 1.3), peak(x, 0.74, 0.19, 0.66, 1.3),
          peak(x, 0.18, 0.15, 0.4, 1.4));
      })
    ];

    var W = 0, H = 0, BASEY = 0, BW = 0, BH = 0, OX = 0;
    function measure() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var r = hero.getBoundingClientRect();
      W = Math.max(320, Math.round(r.width));
      H = Math.max(360, Math.round(r.height));
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      var nw = W < 760;
      /* En desktop el macizo vive a la derecha, detrás de la figura. En
         celular se agranda y sangra por los costados, así las cumbres
         asoman por encima de la foto en vez de quedar tapadas. */
      /* En celular la silueta entra ENTERA y se apoya por encima de la
         figura: sangrada por los costados sólo se veía una tajada de
         ladera y las terrazas leían como edificios. Con las dos faldas
         bajando hasta el horizonte, se lee montaña de una. */
      var mw = W * (nw ? 1.05 : 0.86);
      var mh = H * (nw ? 0.25 : 0.58);
      OX = nw ? -W * 0.025 : W * 0.16;
      BASEY = H * (nw ? 0.735 : 0.93);
      BW = mw / COLS;
      BH = mh / ROWS;
    }

    var mx = -9999;
    if (fine) {
      hero.addEventListener("pointermove", function (e) {
        mx = e.clientX - hero.getBoundingClientRect().left;
      });
      hero.addEventListener("pointerleave", function () { mx = -9999; });
    }

    function clampf(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
    function stag(g, o, spread) { return clampf((g - o * spread) / (1 - spread)); }
    function easeOut(x) { return 1 - Math.pow(1 - x, 3); }
    function easeInOut(x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }

    var GROW = 3.4, HOLD = 1.9, MORPH = 2.4;
    var SEG = MORPH + HOLD, LOOP = profiles.length * SEG;
    var h = new Array(COLS);

    function heights(time) {
      var c;
      if (time < GROW) {
        var g = time / GROW;
        for (c = 0; c < COLS; c++) {
          h[c] = profiles[0][c] * easeOut(stag(g, c / (COLS - 1), 0.62));
        }
        return;
      }
      var tt = time - GROW;
      if (tt < HOLD) {
        for (c = 0; c < COLS; c++) h[c] = profiles[0][c];
        return;
      }
      var u = (tt - HOLD) % LOOP;
      var seg = Math.floor(u / SEG);
      var k = (u - seg * SEG) / MORPH;
      var from = profiles[seg % profiles.length];
      var to = profiles[(seg + 1) % profiles.length];
      for (c = 0; c < COLS; c++) {
        var m = k >= 1 ? 1 : easeInOut(stag(k, c / (COLS - 1), 0.35));
        h[c] = from[c] + (to[c] - from[c]) * m;
      }
    }

    function rect(x, y, w, hh, rad) {
      if (ctx.roundRect) ctx.roundRect(x, y, w, hh, rad);
      else ctx.rect(x, y, w, hh);
    }
    /* Más alto, más nítido: abajo el macizo se pierde en la bruma */
    function rowStyle(r, a) {
      var alt = ROWS > 1 ? r / (ROWS - 1) : 1;
      var cr = Math.round(14 + 55 * alt);
      var cg = Math.round(59 + 115 * alt);
      var cb = Math.round(102 + 127 * alt);
      return "rgba(" + cr + "," + cg + "," + cb + "," + ((0.14 + 0.44 * alt) * a).toFixed(3) + ")";
    }

    var lastY = window.scrollY || 0, shake = 0;

    function draw(time, frozen) {
      heights(frozen ? GROW : time);

      var yNow = window.scrollY || 0;
      shake += ((frozen ? 0 : Math.min(Math.abs(yNow - lastY), 70) / 70) - shake) * 0.12;
      lastY = yNow;

      ctx.clearRect(0, 0, W, H);

      /* Suelo: sin horizonte la silueta flota y deja de leerse montaña */
      var hg = ctx.createLinearGradient(0, 0, W, 0);
      hg.addColorStop(0, "rgba(30,137,196,0)");
      hg.addColorStop(0.45, "rgba(30,137,196,.34)");
      hg.addColorStop(1, "rgba(30,137,196,0)");
      ctx.strokeStyle = hg;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(0, BASEY);
      ctx.lineTo(W, BASEY);
      ctx.stroke();

      /* Altura efectiva de cada columna, con el relieve del puntero */
      var c, hv = [];
      for (c = 0; c < COLS; c++) {
        var v = h[c] * ROWS;
        if (mx > -9000) {
          var dx = Math.abs(OX + (c + 0.5) * BW - mx);
          if (dx < BW * 5) v += (1 - dx / (BW * 5)) * 1.15;
        }
        if (shake > 0.02) v += Math.sin(time * 5 + c * 0.55) * shake * 0.5;
        hv.push(v);
      }

      /* Una pasada por fila: 15 rellenos en vez de cientos */
      var rad = Math.min(2.5, BW * 0.16);
      for (var r = 0; r < ROWS; r++) {
        var any = false;
        ctx.beginPath();
        for (c = 0; c < COLS; c++) {
          if (hv[c] < r + 1) continue;
          rect(OX + c * BW + GAP / 2, BASEY - (r + 1) * BH + GAP / 2,
            BW - GAP, BH - GAP, rad);
          any = true;
        }
        if (!any) continue;
        ctx.fillStyle = rowStyle(r, 1);
        ctx.fill();
      }

      /* El bloque que está llegando: entra achicado y aterriza */
      for (c = 0; c < COLS; c++) {
        var full = Math.floor(hv[c]);
        var frac = hv[c] - full;
        if (frac < 0.04 || full >= ROWS) continue;
        var ins = (1 - frac) * BW * 0.2;
        ctx.beginPath();
        rect(OX + c * BW + GAP / 2 + ins, BASEY - (full + 1) * BH + GAP / 2 + (1 - frac) * BH * 0.5,
          BW - GAP - ins * 2, BH - GAP, rad);
        ctx.fillStyle = rowStyle(full, frac);
        ctx.fill();
      }

      /* Canto superior: el escalonado se lee como peldaños */
      ctx.lineWidth = 1.6;
      ctx.lineCap = "round";
      for (c = 0; c < COLS; c++) {
        if (hv[c] < 0.3) continue;
        var top = BASEY - Math.min(hv[c], ROWS) * BH;
        ctx.strokeStyle = "rgba(69,174,229," + (0.34 + 0.38 * Math.min(1, hv[c] / ROWS)).toFixed(3) + ")";
        ctx.beginPath();
        ctx.moveTo(OX + c * BW + GAP / 2, top);
        ctx.lineTo(OX + (c + 1) * BW - GAP / 2, top);
        ctx.stroke();
      }

      /* El punto de cumbre trepa con el macizo */
      var best = 0;
      for (c = 1; c < COLS; c++) if (hv[c] > hv[best]) best = c;
      if (hv[best] > 0.6) {
        var px = OX + (best + 0.5) * BW;
        var py = BASEY - Math.min(hv[best], ROWS) * BH - 7;
        var pulse = 1 + Math.sin(time * 2.2) * 0.14;
        ctx.fillStyle = "rgba(69,174,229,.16)";
        ctx.beginPath();
        ctx.arc(px, py, 11 * pulse, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(30,137,196,.9)";
        ctx.beginPath();
        ctx.arc(px, py, 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    measure();
    if (reduced) { draw(0, true); return; }

    var running = true;
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (es) { running = es[0].isIntersecting; },
        { threshold: 0 }).observe(hero);
    }
    var t0 = performance.now();
    (function frame(now) {
      if (running) draw((now - t0) / 1000, false);
      requestAnimationFrame(frame);
    })(t0);

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
      /* Lo que entra junto se escalona. En celular, donde las grillas
         se apilan, cada tarjeta gana su propio momento en vez de que
         aparezcan las tres de golpe. */
      var batch = [];
      es.forEach(function (e) { if (e.isIntersecting) batch.push(e.target); });
      if (!batch.length) return;
      batch.sort(function (a, b) {
        return a.compareDocumentPosition(b) & 4 ? -1 : 1;
      });
      batch.forEach(function (el, i) {
        el.style.transitionDelay = Math.min(i * 0.085, 0.42) + "s";
        el.classList.add("is-in");
        io.unobserve(el);
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
      var tl = gsap.to([track, clone], {
        x: -d, duration: d / 58, ease: "none", repeat: -1,
        modifiers: { x: gsap.utils.unitize(function (x) { return parseFloat(x) % d; }) }
      });
      if (reduced) return;
      /* La pasarela acelera con el scroll: en celular, donde no hay
         hover, es parte de lo que mantiene la página viva. */
      var vel = 0;
      ScrollTrigger.create({
        trigger: document.body, start: "top top", end: "bottom bottom",
        onUpdate: function (self) { vel = self.getVelocity(); }
      });
      gsap.ticker.add(function () {
        var want = 1 + Math.min(Math.abs(vel) / 1400, 2.4);
        tl.timeScale(tl.timeScale() + (want - tl.timeScale()) * 0.07);
        vel *= 0.92;
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
    /* Las fotos enmarcadas se mueven más lento que su marco: da
       profundidad sin que nada se despegue del recorte. */
    document.querySelectorAll("[data-para-img]").forEach(function (img) {
      var frame = img.closest("figure") || img.parentNode;
      gsap.fromTo(img, { yPercent: -7 }, {
        yPercent: 7, ease: "none",
        scrollTrigger: { trigger: frame, start: "top bottom", end: "bottom top", scrub: 0.8 }
      });
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

    var BASE = 150, TOP = 14;

    function render(p) {
      var y = BASE - (BASE - TOP) * p;
      if (rise) rise.setAttribute("y", y.toFixed(1));
      if (level) { level.setAttribute("y1", y.toFixed(1)); level.setAttribute("y2", y.toFixed(1)); }
      if (tag) {
        tag.setAttribute("y", Math.max(TOP + 10, y - 6).toFixed(1));
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
    safe(initHero, "hero");
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
