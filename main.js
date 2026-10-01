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

  /* ---------------- HERO: la montaña se construye ----------------
     Antes seguíamos el contorno completo del isotipo, que va y vuelve
     sobre sí mismo: el resultado parecía un gráfico, no una montaña.
     Ahora nos quedamos sólo con el PERFIL SUPERIOR del logo —para cada
     franja vertical, su punto más alto— y además sembramos nodos DENTRO
     del macizo. Con una línea de horizonte abajo, lo que se arma es
     inconfundible: una cumbre apoyada sobre el suelo.
     Los nodos nacen dispersos, se enlazan y se ordenan; después se
     desarman. La mentalidad se construye, no se alcanza. */
  function initNeuro() {
    var cv = document.querySelector("[data-neuro]");
    var shape = document.querySelector("[data-shape]");
    var hero = document.querySelector(".hero");
    if (!cv || !shape || !hero) return;
    var ctx = cv.getContext("2d");
    if (!ctx) return;

    var bb = shape.getBBox();
    var total = shape.getTotalLength();
    if (!total || !bb.width || !bb.height) return;

    var small = window.innerWidth < 760;
    var BINS = small ? 32 : 46;
    var MASS = small ? 48 : 78;

    /* Perfil superior del isotipo */
    var i, sky = [];
    for (i = 0; i < BINS; i++) sky[i] = Infinity;
    for (var k = 0; k <= 1600; k++) {
      var sp = shape.getPointAtLength(total * k / 1600);
      var b = Math.round((sp.x - bb.x) / bb.width * (BINS - 1));
      if (b < 0) b = 0; else if (b > BINS - 1) b = BINS - 1;
      if (sp.y < sky[b]) sky[b] = sp.y;
    }
    for (i = 0; i < BINS; i++) {
      if (isFinite(sky[i])) continue;
      var a = i - 1, c = i + 1;
      while (a >= 0 && !isFinite(sky[a])) a--;
      while (c < BINS && !isFinite(sky[c])) c++;
      sky[i] = a >= 0 && c < BINS ? (sky[a] + sky[c]) / 2 : (a >= 0 ? sky[a] : sky[c]);
    }
    var ridge = sky.map(function (y) { return (y - bb.y) / bb.height; });
    function ridgeAt(nx) {
      var f = nx * (BINS - 1), i0 = Math.floor(f), i1 = Math.min(BINS - 1, i0 + 1);
      return ridge[i0] + (ridge[i1] - ridge[i0]) * (f - i0);
    }

    var nodes = [];
    function add(nx, ny, onRidge) {
      nodes.push({
        nx: nx, ny: ny, crest: onRidge, o: nx,
        sx: Math.random(), sy: 0.18 + Math.random() * 0.76,
        ph: Math.random() * Math.PI * 2, sp: 0.25 + Math.random() * 0.5,
        amp: 10 + Math.random() * 26,
        tx: 0, ty: 0, x: 0, y: 0, t: 0, px: 0, py: 0
      });
    }
    for (i = 0; i < BINS; i++) add(i / (BINS - 1), ridge[i], true);
    var CREST = nodes.length;
    for (i = 0; i < MASS; i++) {
      var nx = 0.02 + Math.random() * 0.96;
      var top = ridgeAt(nx);
      add(nx, top + (1 - top) * Math.pow(Math.random(), 0.72), false);
    }

    var W = 0, H = 0, LINK = 0, BASEY = 0;
    function measure() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var r = hero.getBoundingClientRect();
      W = Math.max(320, Math.round(r.width));
      H = Math.max(360, Math.round(r.height));
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      var nw = W < 760;
      LINK = nw ? 76 : Math.max(78, W * 0.084);
      /* En desktop la cumbre vive a la derecha, detrás de la figura.
         En celular se agranda y sangra por los costados para que las
         cumbres asomen por encima de la foto en vez de quedar tapadas. */
      var mw = W * (nw ? 1.22 : 0.84);
      var mh = H * (nw ? 0.34 : 0.52);
      var ox = nw ? -W * 0.11 : W * 0.17;
      BASEY = H * (nw ? 0.86 : 0.93);
      var oy = BASEY - mh;
      for (var j = 0; j < nodes.length; j++) {
        var n = nodes[j];
        n.tx = ox + n.nx * mw;
        n.ty = oy + n.ny * mh;
        n.x = n.sx * W;
        n.y = n.sy * H;
      }
    }

    var mx = -9999, my = -9999;
    if (fine) {
      hero.addEventListener("pointermove", function (e) {
        var r = hero.getBoundingClientRect();
        mx = e.clientX - r.left; my = e.clientY - r.top;
      });
      hero.addEventListener("pointerleave", function () { mx = -9999; my = -9999; });
    }

    function stag(g, order, spread) { return clamp01((g - order * spread) / (1 - spread)); }
    function easeOut(x) { return 1 - Math.pow(1 - x, 3); }
    function easeIn(x) { return x * x * x; }

    var A = 3.6, HOLD = 2.8, D = 2.8, REST = 1.0, CYCLE = A + HOLD + D + REST;
    function phase(tc) {
      if (tc < A) return { g: tc / A, mode: 1 };
      if (tc < A + HOLD) return { g: 1, mode: 2 };
      if (tc < A + HOLD + D) return { g: (tc - A - HOLD) / D, mode: 3 };
      return { g: 1, mode: 4 };
    }

    /* El scroll sacude la red: en celular, donde no hay puntero, es lo
       que mantiene la animación viva mientras se recorre el hero. */
    var lastY = window.scrollY || 0, shake = 0;

    function draw(time, frozen) {
      var st = frozen ? { g: 1, mode: 2 } : phase(time % CYCLE);
      var sum = 0, j, n;

      var yNow = window.scrollY || 0;
      var dv = Math.min(Math.abs(yNow - lastY), 70);
      lastY = yNow;
      shake += ((frozen ? 0 : dv / 70) - shake) * 0.12;

      for (j = 0; j < nodes.length; j++) {
        n = nodes[j];
        if (st.mode === 1) n.t = easeOut(stag(st.g, n.o, 0.6));
        else if (st.mode === 2) n.t = 1;
        else if (st.mode === 3) n.t = 1 - easeIn(stag(st.g, 1 - n.o, 0.6));
        else n.t = 0;
        sum += n.t;

        var wob = frozen ? 0 : 1;
        var dx = Math.sin(time * n.sp + n.ph) * n.amp * (1 - n.t * 0.93) * wob;
        var dy = Math.cos(time * n.sp * 0.82 + n.ph) * n.amp * 0.72 * (1 - n.t * 0.93) * wob;
        var x = n.x + (n.tx - n.x) * n.t + dx + Math.sin(time * 7 + n.ph) * shake * 6;
        var y = n.y + (n.ty - n.y) * n.t + dy + Math.cos(time * 6 + n.ph) * shake * 5;

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

      /* Horizonte: sin suelo la silueta flota y no se lee como montaña */
      var hg = ctx.createLinearGradient(0, 0, W, 0);
      var ha = 0.08 + ta * 0.34;
      hg.addColorStop(0, "rgba(30,137,196,0)");
      hg.addColorStop(0.45, "rgba(30,137,196," + ha.toFixed(3) + ")");
      hg.addColorStop(1, "rgba(30,137,196,0)");
      ctx.strokeStyle = hg;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(0, BASEY);
      ctx.lineTo(W, BASEY);
      ctx.stroke();

      /* Macizo: sólo cuando la cresta ya está lo bastante armada */
      if (ta > 0.72) {
        ctx.beginPath();
        ctx.moveTo(nodes[0].px, BASEY);
        for (j = 0; j < CREST; j++) ctx.lineTo(nodes[j].px, nodes[j].py);
        ctx.lineTo(nodes[CREST - 1].px, BASEY);
        ctx.closePath();
        ctx.fillStyle = "rgba(69,174,229," + (((ta - 0.72) / 0.28) * 0.16).toFixed(3) + ")";
        ctx.fill();
      }

      /* Enlaces */
      ctx.lineWidth = 1;
      for (j = 0; j < nodes.length; j++) {
        var p1 = nodes[j];
        for (var q = j + 1; q < nodes.length; q++) {
          var p2 = nodes[q];
          var ddx = p1.px - p2.px, ddy = p1.py - p2.py;
          var d2 = ddx * ddx + ddy * ddy;
          if (d2 > LINK * LINK) continue;
          var al = (1 - Math.sqrt(d2) / LINK) * (0.05 + 0.17 * ta);
          if (al < 0.006) continue;
          ctx.strokeStyle = "rgba(3,29,64," + al.toFixed(3) + ")";
          ctx.beginPath();
          ctx.moveTo(p1.px, p1.py);
          ctx.lineTo(p2.px, p2.py);
          ctx.stroke();
        }
      }

      /* Cresta: se traza a medida que cada nodo encuentra su lugar */
      ctx.lineWidth = 2.2;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      for (j = 0; j < CREST - 1; j++) {
        var c1 = nodes[j], c2 = nodes[j + 1];
        var tm = Math.min(c1.t, c2.t);
        if (tm <= 0.4) continue;
        ctx.strokeStyle = "rgba(30,137,196," + (((tm - 0.4) / 0.6) * 0.62).toFixed(3) + ")";
        ctx.beginPath();
        ctx.moveTo(c1.px, c1.py);
        ctx.lineTo(c2.px, c2.py);
        ctx.stroke();
      }

      /* Nodos: la cresta pesa más que el macizo */
      for (j = 0; j < nodes.length; j++) {
        n = nodes[j];
        if (n.crest) {
          ctx.fillStyle = "rgba(69,174,229," + (0.22 + 0.48 * n.t).toFixed(3) + ")";
          ctx.beginPath();
          ctx.arc(n.px, n.py, 1.6 + 1.8 * n.t, 0, Math.PI * 2);
        } else {
          ctx.fillStyle = "rgba(69,174,229," + (0.14 + 0.3 * n.t).toFixed(3) + ")";
          ctx.beginPath();
          ctx.arc(n.px, n.py, 1.1 + 1.2 * n.t, 0, Math.PI * 2);
        }
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
