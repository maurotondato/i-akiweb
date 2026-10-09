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

  /* El hero es la curva de rendimiento (hero.js), en canvas 2D. */
  function initHero() {
    var cv = document.querySelector("[data-curve]");
    if (cv && window.HERO_mount) window.HERO_mount(cv);
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

  /* ---------------- ALTO DEL NAV ----------------
     El hero tiene que reservar exactamente lo que el nav ocupa. Un
     número fijo en el CSS se desactualiza solo: basta con que entre
     la tipografía, cambie el logo o el visitante tenga zoom para que
     el titular se meta debajo. Se mide y se publica como variable. */
  function initNavHeight() {
    var nav = document.querySelector(".nav");
    if (!nav) return;
    function sync() {
      var h = Math.round(nav.getBoundingClientRect().height);
      if (h) document.documentElement.style.setProperty("--nav-h", h + "px");
    }
    sync();
    window.addEventListener("resize", sync, { passive: true });
    window.addEventListener("load", sync);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(sync);
    if (window.ResizeObserver) new ResizeObserver(sync).observe(nav);
  }

  /* ---------------- CONTADORES ---------------- */
  function initCountUp() {
    document.querySelectorAll("[data-count-to]").forEach(function (el) {
      var target = parseFloat(el.dataset.countTo), done = false;
      function run() {
        if (done) return; done = true;
        if (hasGSAP && !reduced) {
          var o = { v: 0 };
          gsap.to(o, { v: target, duration: 1.5, ease: "power2.out",
            onUpdate: function () { el.textContent = Math.round(o.v); } });
        } else el.textContent = target;
      }
      /* El conteo tiene que pasar DELANTE del visitante. Antes había un
         setTimeout(run, 6000) sin condición, así que los números de más
         abajo —los torneos, las medallas— terminaban de contar mientras
         todavía se estaba leyendo el hero, y al llegar ya estaban quietos.
         La red de seguridad queda, pero solo dispara si el número está
         efectivamente en pantalla. */
      function visible() {
        var r = el.getBoundingClientRect();
        return r.top < innerHeight * 0.95 && r.bottom > 0;
      }
      function check() {
        if (done) { off(); return; }
        if (visible()) { run(); off(); }
      }
      function off() {
        removeEventListener("scroll", check);
        removeEventListener("resize", check);
      }
      if (window.IntersectionObserver) {
        var io = new IntersectionObserver(function (es) {
          es.forEach(function (e) {
            if (e.isIntersecting) { io.unobserve(e.target); off(); run(); }
          });
        }, { threshold: 0.05 });
        io.observe(el);
        setTimeout(check, 6000);
      } else {
        addEventListener("scroll", check, { passive: true });
        addEventListener("resize", check);
        check();
      }
    });
  }

  /* ---------------- FORMULARIO -> WHATSAPP ----------------
     No hay backend ni hay por qué tenerlo: el formulario arma el
     mensaje y abre WhatsApp con la consulta ya escrita. Iñaki la
     recibe con contexto —nombre, deporte, perfil y qué le pasa— en
     vez de un "hola" suelto, y la conversación sigue donde él ya
     trabaja. Sin servidor no hay datos de nadie guardados en ningún
     lado, que para una consulta de este tipo es lo correcto.

     El número vive en el href del propio formulario para que no haya
     dos fuentes de verdad. */
  var WA_NUM = "5491159236762";

  function initWaForm() {
    document.querySelectorAll("[data-wa-form]").forEach(function (form) {
      var note = form.querySelector(".cf-note");
      var noteBase = note ? note.textContent : "";

      function fail(field, msg) {
        field.classList.add("is-bad");
        if (note) { note.textContent = msg; note.classList.add("is-bad"); }
        var input = field.querySelector("input, textarea");
        if (input) input.focus();
      }
      function clear() {
        form.querySelectorAll(".is-bad").forEach(function (e) { e.classList.remove("is-bad"); });
        if (note) note.textContent = noteBase;
      }
      form.addEventListener("input", clear);

      form.addEventListener("submit", function (e) {
        e.preventDefault();
        clear();
        var d = new FormData(form);
        var nombre = (d.get("nombre") || "").toString().trim();
        var deporte = (d.get("deporte") || "").toString().trim();
        var perfil = (d.get("perfil") || "").toString().trim();
        var mensaje = (d.get("mensaje") || "").toString().trim();

        var campos = form.querySelectorAll(".cf-field");
        if (!nombre) return fail(campos[0], "Me falta tu nombre para escribirle a Iñaki.");
        if (!deporte) return fail(campos[1], "Contame de qué deporte se trata.");
        if (!mensaje) return fail(form.querySelector("textarea").closest(".cf-field"),
          "Escribí aunque sea una línea sobre tu momento.");

        /* Se arma como lo escribiría una persona, no como un volcado
           de campos: del otro lado se lee un mensaje, no un ticket. */
        var texto =
          "Hola Iñaki, soy " + nombre + ".\n\n" +
          "Vengo del lado de " + deporte + " y la consulta es " +
          (perfil === "Equipo" ? "para un equipo" :
           perfil === "Staff" ? "para un cuerpo técnico" : "para mí") + ".\n\n" +
          mensaje + "\n\n" +
          "(Te escribo desde la web)";

        var url = "https://wa.me/" + WA_NUM + "?text=" + encodeURIComponent(texto);
        var win = window.open(url, "_blank", "noopener");
        if (!win) window.location.href = url;   /* si el navegador bloquea la pestaña */
        if (note) note.textContent = "Listo, abrimos WhatsApp con tu mensaje.";
      });
    });
  }

  /* ---------------- "¿POR QUÉ ELEGIRME?" EN MOBILE ----------------
     En desktop cada tarjeta se presenta al pasarle el mouse. En mobile
     no hay hover, y una animación de ENTRADA tampoco alcanza: el
     observer la dispara apenas la tarjeta asoma un 5%, así que para
     cuando la tenés a la vista ya terminó y no se ve nada moverse.

     Acá el movimiento va atado al scroll: avanza a medida que la
     tarjeta sube por la pantalla y retrocede si volvés para arriba.
     El dedo maneja la animación.

     Va con ScrollTrigger y no con animation-timeline de CSS porque
     Safari de iOS todavía no lo soporta, y el cliente mira la web
     desde un iPhone.

     Si GSAP no está, hay movimiento reducido o estamos en desktop, no
     se toca nada: el CSS ya deja las tarjetas completas, así que no
     hay forma de que algo quede escondido. */
  function initWhyScroll() {
    var grid = document.querySelector(".why-grid");
    if (!grid) return;
    if (!hasGSAP || reduced || window.innerWidth > 980) return;
    grid.classList.add("is-scrub");

    grid.querySelectorAll(".why").forEach(function (card) {
      var num = card.querySelector(".why-n i");
      var eco = card.querySelector(".why-eco");
      var rule = card.querySelector(".why-rule");
      if (!num || !eco || !rule) return;

      /* Una sola línea de tiempo por tarjeta, normalizada a su
         recorrido completo por la pantalla. Lo que se arma lo hace en
         el primer tercio —así queda listo cuando la tarjeta está a la
         vista— y el eco sigue derivando todo el trayecto, que es lo
         que mantiene algo en movimiento mientras scrolleás. */
      var tl = gsap.timeline({
        scrollTrigger: {
          trigger: card,
          start: "top bottom",
          end: "bottom top",
          scrub: 0.5
        }
      });
      tl.fromTo(rule, { scaleX: 0 }, { scaleX: 1, duration: 0.3, ease: "none" }, 0.02)
        .fromTo(num, { yPercent: 115 }, { yPercent: 0, duration: 0.28, ease: "none" }, 0.04)
        .fromTo(eco, { opacity: 0 }, { opacity: 1, duration: 0.25, ease: "none" }, 0.06)
        .fromTo(eco, { y: 38 }, { y: -38, duration: 1, ease: "none" }, 0);
    });
  }

  /* ---------------- "¿PARA QUIÉNES?": PLEGAR EN TELÉFONO ----------------
     En teléfono el texto de cada tarjeta va plegado a dos líneas para
     que las tres entren juntas. Esto lo abre. El plegado lo hace el
     CSS, así que si este script no corre el texto se ve igual: no hay
     forma de que quede contenido inaccesible. */
  function initAudMore() {
    document.querySelectorAll(".aud-card").forEach(function (card) {
      var btn = card.querySelector(".aud-more");
      if (!btn) return;
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        var abierto = card.classList.toggle("is-open");
        btn.setAttribute("aria-expanded", abierto ? "true" : "false");
        btn.setAttribute("aria-label", abierto ? "Ver menos" : "Ver más");
      });
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
    var t = false, prevY = window.scrollY || 0;
    /* El nav es fijo y opaco, así que al bajar pasa por encima de lo
       que estás leyendo: en "Sobre mí" le tapaba la cabeza a Iñaki.
       Transparentarlo dejaría los links ilegibles sobre la foto, así
       que se va mientras bajás y vuelve apenas subís un poco. */
    function up() {
      if (t) return; t = true;
      requestAnimationFrame(function () {
        var y = window.scrollY || window.pageYOffset;
        if (nav) {
          nav.classList.toggle("is-solid", y > 48);
          var d = y - prevY;
          if (y < 120) nav.classList.remove("is-away");
          else if (d > 6) nav.classList.add("is-away");
          else if (d < -6) nav.classList.remove("is-away");
          if (Math.abs(d) > 2) prevY = y;
        }
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
    /* En apilado el hero va justo de alto y el gráfico arranca
       pegado debajo de los botones, así que mover la columna de texto
       la metería encima de la curva. Ahí se mueve solo la foto. */
    var stacked = window.innerWidth <= 980;
    document.querySelectorAll("[data-parallax]").forEach(function (el) {
      var d = parseFloat(el.dataset.parallax || "0.12");
      if (stacked && d > 0) return;
      gsap.to(el, { yPercent: d * 100, ease: "none",
        scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: 0.6 } });
    });
    /* El parallax de las fotos enmarcadas son DOS capas opuestas:

       1. el marco entero se desliza dentro del aire que le deja la
          sección. Como es transform, no empuja nada y puede entrar en
          los márgenes sin chocar con el texto ni con la sección de
          abajo.
       2. la foto panea dentro del marco, en sentido contrario.

       Lo que se percibe es la suma, así que da un recorrido amplio sin
       tener que agrandar la imagen. Agrandarla era lo que le cortaba
       la cabeza a Iñaki: la foto y el marco comparten aspecto (4/5),
       así que todo el sobrante salía de ampliar, y el recorte se le
       comía la cara. Ver la nota en .about-photo img.

       El paneo interno sigue acotado a lo que no toca la cabeza; el
       grueso del movimiento lo pone el marco, que no recorta nada. */
    document.querySelectorAll("[data-para-frame]").forEach(function (el) {
      var d = window.innerWidth <= 980 ? 54 : 44;
      gsap.fromTo(el, { y: d }, {
        y: -d, ease: "none",
        scrollTrigger: { trigger: el, start: "top bottom", end: "bottom top", scrub: 0.8 }
      });
    });
    document.querySelectorAll("[data-para-img]").forEach(function (img) {
      var frame = img.closest("figure") || img.parentNode;
      gsap.fromTo(img, { yPercent: 0 }, {
        yPercent: 4.5, ease: "none",
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

    /* El índice, como atajo SIN mover el scroll.
       La sección se recorre scrolleando, pero son cuatro pantallas:
       quien no quiere recorrerlas tiene que poder ver cada paso.

       La primera versión saltaba el scroll al punto del tramo. No
       sirve: saltar dentro de un rango pinneado deja a ScrollTrigger
       con el spacer a medio acomodar y el rango inválido -medido,
       [959,4019] quedaba en [-1588,1472]- y la sección se trababa en
       el último paso. Acá el click no mueve la página: fija el paso y
       lo dibuja. El scroll recupera el mando apenas el visitante se
       mueve, así que las dos formas de recorrer conviven. */
    var fijado = null;

    var st = ScrollTrigger.create({
      trigger: sec,
      start: "top top",
      end: function () { return "+=" + window.innerHeight * 3.4; },
      pin: ".cima-pin",
      scrub: 0.6,
      anticipatePin: 1,
      invalidateOnRefresh: true,
      onUpdate: function (self) { if (fijado === null) render(self.progress); },
      onRefresh: function (self) { if (fijado === null) render(self.progress); }
    });

    function soltar() {
      if (fijado === null) return;
      fijado = null;
      render(st.progress);
    }
    window.addEventListener("wheel", soltar, { passive: true });
    window.addEventListener("touchmove", soltar, { passive: true });
    window.addEventListener("keydown", function (e) {
      if (/^(Arrow|Page|Home|End| )/.test(e.key)) soltar();
    });

    steps.forEach(function (el, i) {
      el.setAttribute("role", "button");
      el.setAttribute("tabindex", "0");
      el.setAttribute("aria-label", "Ver el paso " + (i + 1) + ": " +
        (el.querySelector("span") ? el.querySelector("span").textContent : ""));
      function ver(e) {
        e.preventDefault();
        fijado = i;
        render((i + 0.5) / 4);
      }
      el.addEventListener("click", ver);
      el.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") ver(e);
      });
    });

    var ol = sec.querySelector(".cima-index");
    if (ol) ol.removeAttribute("aria-hidden");
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
    safe(initHero, "hero");
    safe(initChrome, "chrome");
    safe(initNavHeight, "navHeight");
    safe(initReveal, "reveal");
    safe(initSplitText, "split");
    safe(initCountUp, "countup");
    safe(initAudMore, "audMore");
    safe(initWhyScroll, "whyScroll");
    safe(initWaForm, "waForm");
    safe(initMarquee, "marquee");
    safe(initMagnetic, "magnetic");
    safe(initProgGlow, "progGlow");
    safe(initParallax, "parallax");
    safe(initCima, "cima");
    safe(initAnchors, "anchors");
    if (hasGSAP) {
      var resort = function () { ScrollTrigger.sort(); ScrollTrigger.refresh(); };
      resort();
      window.addEventListener("load", resort);
      /* Las fotos de más abajo son lazy: cuando entran cambian el
         alto del documento y hay que volver a medir. */
      document.querySelectorAll("img[loading=lazy]").forEach(function (im) {
        if (!im.complete) im.addEventListener("load", resort, { once: true });
      });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
