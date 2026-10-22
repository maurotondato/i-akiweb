(function () {
  "use strict";
  /* ===========================================================
     Iñaki Etchegaray — motor de interacción
     M-DATOS · IIFE, sin módulos (funciona también en file://)
     =========================================================== */

  var hasGSAP = !!(window.gsap && window.ScrollTrigger);
  if (hasGSAP) {
    gsap.registerPlugin(ScrollTrigger);
    /* En celular, esconder y mostrar la barra de direcciones dispara
       un resize. Sin esto, cada uno de esos resize hace un refresh de
       ScrollTrigger y, con la sección CIMA pineada, el scroll se va
       de lugar: era buena parte del "se vuelve para arriba solo". */
    /* "load" sale de los refresh automáticos: la página termina de
       cargar cuando el visitante ya puede estar scrolleando, y un
       refresh en pleno gesto lleva el scroll a 0 y lo devuelve —en
       el teléfono eso se siente como un salto—. El de "load" lo
       hacemos nosotros, esperando a que el dedo se quede quieto. */
    ScrollTrigger.config({ ignoreMobileResize: true,
      autoRefreshEvents: "visibilitychange,DOMContentLoaded,resize" });
  }

  /* El alto de pantalla "estable": el de la barra de direcciones
     visible (svh). window.innerHeight cambia cada vez que la barra se
     esconde; usarlo para medir el tramo pineado de CIMA hacía que su
     largo dependiera de en qué momento caía el refresh. Se mide una
     vez y solo se vuelve a medir si cambia el ancho (giro de pantalla). */
  var altoEstable = (function () {
    var v = 0, w = 0;
    return function () {
      if (v && w === window.innerWidth) return v;
      var probe = document.createElement("div");
      probe.style.cssText = "position:absolute;top:0;left:0;width:1px;visibility:hidden;pointer-events:none;height:100vh;height:100svh";
      document.body.appendChild(probe);
      v = probe.offsetHeight || window.innerHeight;
      probe.remove();
      w = window.innerWidth;
      return v;
    };
  })();

  /* Un refresh nunca durante un scroll: espera a que pasen 450 ms sin
     que la página se mueva y sin el dedo apoyado. */
  var ultimoMovimiento = 0, dedoApoyado = false;
  addEventListener("scroll", function () { ultimoMovimiento = Date.now(); }, { passive: true });
  addEventListener("touchstart", function () { dedoApoyado = true; ultimoMovimiento = Date.now(); }, { passive: true });
  addEventListener("touchend", function () { dedoApoyado = false; ultimoMovimiento = Date.now(); }, { passive: true });
  addEventListener("touchcancel", function () { dedoApoyado = false; }, { passive: true });
  function cuandoQuieto(fn) {
    (function esperar() {
      if (dedoApoyado || Date.now() - ultimoMovimiento < 450) setTimeout(esperar, 200);
      else fn();
    })();
  }
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
    /* Ya se vio en esta visita: nada de esperar, la página arranca. */
    if (document.documentElement.classList.contains("sin-splash")) {
      requestAnimationFrame(done);
      return;
    }
    try { sessionStorage.setItem("splash-visto", "1"); } catch (e) { /* modo privado */ }
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
    /* Detrás del gráfico, la cancha de noche (estadio.js). */
    var est = document.querySelector("[data-estadio]");
    if (est && window.ESTADIO_mount) window.ESTADIO_mount(est);
    /* La jugada al lado del lema (pizarra.js). */
    var piz = document.querySelector("[data-pizarra]");
    if (piz && window.PIZARRA_mount) window.PIZARRA_mount(piz);
    /* El estadio que se llena en el caso (tribuna.js). */
    var tri = document.querySelector("[data-tribuna]");
    if (tri && window.TRIBUNA_mount) window.TRIBUNA_mount(tri);
    /* Los palos del cierre (palos.js). */
    var pal = document.querySelector("[data-palos]");
    if (pal && window.PALOS_mount) window.PALOS_mount(pal);
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
        el.style.setProperty("--rd", Math.min(i * 0.07, 0.35) + "s");
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
      /* El trofeo y la medalla del caso acompañan al contador: entran
         cuando arranca y, al terminar, la medalla se balancea y la copa
         brilla. Se esconden recién acá, con JS, para que sin JS se vean. */
      var stat = el.closest(".stat");
      var anim = stat && stat.querySelector(".stat-ico") && hasGSAP && !reduced;
      if (anim) stat.classList.add("stat-anim");
      function run() {
        if (done) return; done = true;
        if (hasGSAP && !reduced) {
          if (anim) stat.classList.add("is-run");
          var o = { v: 0 };
          gsap.to(o, { v: target, duration: 1.5, ease: "power2.out",
            onUpdate: function () { el.textContent = Math.round(o.v); },
            onComplete: function () { if (anim) stat.classList.add("is-won"); } });
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

      /* la nota se lee en voz alta cuando cambia (lectores de pantalla) */
      if (note) note.setAttribute("aria-live", "polite");
      function fail(field, msg) {
        field.classList.add("is-bad");
        /* el temblor se reinicia aunque el mismo campo falle dos veces */
        field.classList.remove("is-temblor"); void field.offsetWidth; field.classList.add("is-temblor");
        if (note) { note.textContent = msg; note.classList.add("is-bad"); }
        var input = field.querySelector("input, textarea");
        if (input) { input.setAttribute("aria-invalid", "true"); input.focus(); }
      }
      function clear() {
        form.querySelectorAll(".is-bad").forEach(function (e) { e.classList.remove("is-bad"); });
        form.querySelectorAll("[aria-invalid]").forEach(function (e) { e.removeAttribute("aria-invalid"); });
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

  /* ---------------- PASARELA DE DEPORTES ----------------
     Cada fila se duplica las veces que haga falta para cubrir dos
     anchos de pantalla, y corre en loop: la de arriba hacia la
     izquierda, la de abajo hacia la derecha. Acelera con el scroll,
     igual que la de clubes. Con movimiento reducido quedan quietas. */
  function initDeportes() {
    var tracks = document.querySelectorAll("[data-dep-track]");
    if (!tracks.length || !hasGSAP || reduced) return;
    var tls = [];
    tracks.forEach(function (track) {
      var d = track.scrollWidth;
      if (!d) return;
      var fila = track.parentNode, total = d, copias = [track];
      while (total < window.innerWidth * 2 + d) {
        var c = track.cloneNode(true);
        c.removeAttribute("data-dep-track");
        c.setAttribute("aria-hidden", "true");
        fila.appendChild(c); copias.push(c); total += d;
      }
      var vel = parseFloat(track.dataset.depVel || "40");
      var rev = track.hasAttribute("data-dep-rev");
      tls.push(gsap.fromTo(copias, { x: rev ? -d : 0 }, { x: rev ? 0 : -d, duration: d / vel, ease: "none", repeat: -1 }));
    });
    var v = 0;
    ScrollTrigger.create({
      trigger: document.body, start: "top top", end: "bottom bottom",
      onUpdate: function (self) { v = self.getVelocity(); }
    });
    gsap.ticker.add(function () {
      var want = 1 + Math.min(Math.abs(v) / 1400, 2.4);
      tls.forEach(function (tl) { tl.timeScale(tl.timeScale() + (want - tl.timeScale()) * 0.07); });
      v *= 0.92;
    });
  }

  /* ---------------- FOTOS QUE CARGAN ----------------
     Solo se marcan las lazy que todavía no llegaron: las que ya están
     en caché se ven directo, sin fundido. Si una falla, igual se
     muestra (el alt) en vez de quedar invisible. */
  function initImagenes() {
    document.querySelectorAll('img[loading="lazy"]').forEach(function (img) {
      if (img.complete && img.naturalWidth) return;
      img.classList.add("img-carga");
      var listo = function () { img.classList.add("img-lista"); };
      img.addEventListener("load", listo, { once: true });
      img.addEventListener("error", listo, { once: true });
    });
  }

  /* ---------------- MENÚ DEL TELÉFONO ----------------
     Se abre desde el botón: el círculo del panel crece desde su
     centro. Esc cierra, el foco queda adentro mientras está abierto y
     vuelve al botón al cerrar. Tocar un link cierra el menú ANTES de
     que initAnchors haga el scroll (se registra antes en boot). */
  function initMenu() {
    var btn = document.querySelector("[data-menu-toggle]");
    var menu = document.querySelector("[data-menu]");
    var nav = document.querySelector("[data-nav]");
    if (!btn || !menu || !nav) return;
    var abierto = false, cierre = 0;
    function focos() { return [btn].concat([].slice.call(menu.querySelectorAll("a"))); }
    function abrir() {
      if (abierto) return;
      abierto = true;
      clearTimeout(cierre);
      var r = btn.getBoundingClientRect();
      menu.style.setProperty("--mx", Math.round(r.left + r.width / 2) + "px");
      menu.style.setProperty("--my", Math.round(r.top + r.height / 2) + "px");
      menu.hidden = false;
      void menu.offsetWidth;                 /* que el círculo arranque cerrado */
      menu.classList.add("is-open");
      nav.classList.add("menu-abierto");
      document.documentElement.classList.add("menu-open");
      btn.setAttribute("aria-expanded", "true");
      btn.setAttribute("aria-label", "Cerrar menú");
      var primero = menu.querySelector("a");
      if (primero) primero.focus({ preventScroll: true });
    }
    function cerrar(devolverFoco) {
      if (!abierto) return;
      abierto = false;
      menu.classList.remove("is-open");
      nav.classList.remove("menu-abierto");
      document.documentElement.classList.remove("menu-open");
      btn.setAttribute("aria-expanded", "false");
      btn.setAttribute("aria-label", "Abrir menú");
      cierre = setTimeout(function () { if (!abierto) menu.hidden = true; }, 560);
      if (devolverFoco) btn.focus({ preventScroll: true });
    }
    btn.addEventListener("click", function () { abierto ? cerrar(true) : abrir(); });
    menu.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function () { cerrar(false); });
    });
    document.addEventListener("keydown", function (e) {
      if (!abierto) return;
      if (e.key === "Escape") { e.preventDefault(); cerrar(true); return; }
      if (e.key !== "Tab") return;
      var f = focos(), i = f.indexOf(document.activeElement);
      if (e.shiftKey && (i <= 0)) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    });
    /* si se agranda la ventana a escritorio con el menú abierto */
    matchMedia("(min-width: 981px)").addEventListener("change", function (q) { if (q.matches) cerrar(false); });
  }

  /* ---------------- NAV, PROGRESO Y WHATSAPP ---------------- */
  function initChrome() {
    var nav = document.querySelector("[data-nav]");
    var bar = document.querySelector("[data-progress]");
    var ball = document.querySelector("[data-progress-ball]");
    var pelotas = ball ? ball.querySelectorAll(".pp-b") : [], cual = 0;
    var quieto = matchMedia("(prefers-reduced-motion: reduce)").matches;
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
          var p = max > 0 ? Math.min(y / max, 1) : 0;
          bar.style.transform = "scaleX(" + p.toFixed(4) + ")";
          /* la pelota va en la punta de la línea y gira según lo que
             recorrió: una vuelta cada ~60 px, como si rodara */
          if (ball) {
            var bx = p * (window.innerWidth - ball.offsetWidth);
            var giro = quieto ? -12 : bx * 6;
            ball.style.transform = "translateX(" + bx.toFixed(1) + "px) rotate(" + giro.toFixed(1) + "deg)";
            ball.style.opacity = y > 40 ? "1" : "0";
            /* cada tramo de la página, otro deporte */
            var k = Math.min(pelotas.length - 1, Math.floor(p * pelotas.length));
            if (k !== cual && pelotas[k]) {
              pelotas[cual].classList.remove("is-on");
              pelotas[k].classList.add("is-on");
              cual = k;
            }
          }
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
      end: function () { return "+=" + altoEstable() * 3.4; },
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
  /* ---------------- GALERÍA ----------------
     Carrusel de verdad: el recorrido lo maneja el lector. Dedo y
     trackpad ya los da overflow-x con enganche; acá se suman el
     arrastre con el mouse -con inercia- y las flechas, que es lo que
     le falta a un carrusel nativo en desktop.

     La primera versión la movía el scroll de la página y tenía un
     defecto de fondo: para cuando la sección terminaba de entrar, la
     primera foto ya se había ido por la izquierda.

     El paneo interno escribe --px y el zoom del mouse escribe --z;
     los dos los compone el CSS en un solo transform, así no hay dos
     motores peleándose por la misma propiedad.

     El telón nace display:none en el CSS: si el script no corre, las
     fotos se ven igual en vez de quedar tapadas. */
  function initGaleria() {
    var sec = document.querySelector(".gal");
    var via = document.querySelector("[data-gal-via]");
    var rail = document.querySelector("[data-gal-rail]");
    if (!sec || !via || !rail) return;

    var tarjetas = Array.prototype.slice.call(rail.querySelectorAll("[data-gal]"));
    if (!tarjetas.length) return;
    var fotos = tarjetas.map(function (t) { return t.querySelector("img"); });
    var flechas = Array.prototype.slice.call(sec.querySelectorAll("[data-gal-ir]"));
    var cajaIx = sec.querySelector("[data-gal-ix]");
    sec.classList.add("gal-viva");

    function irA(i) {
      i = Math.max(0, Math.min(tarjetas.length - 1, i));
      var ref = via.getBoundingClientRect().left + 2;
      via.scrollTo({
        left: via.scrollLeft + (tarjetas[i].getBoundingClientRect().left - ref),
        behavior: reduced ? "auto" : "smooth"
      });
    }

    /* Un tramo por foto. Sin JS no se dibujan: un control muerto es
       peor que no tenerlo. */
    var tramos = tarjetas.map(function (t, i) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "gal-s";
      b.setAttribute("aria-label", "Ir a la foto " + (i + 1) + " de " + tarjetas.length);
      b.appendChild(document.createElement("i"));
      b.addEventListener("click", function () { irA(i); });
      if (cajaIx) cajaIx.appendChild(b);
      return b;
    });

    var pendiente = false;
    function pintar() {
      pendiente = false;
      var max = via.scrollWidth - via.clientWidth;
      var vr = via.getBoundingClientRect();
      var ancho = window.innerWidth, i, r, visible;
      for (i = 0; i < tarjetas.length; i++) {
        r = tarjetas[i].getBoundingClientRect();
        /* Lo que enciende el tramo es la fracción de esa foto que
           entra en la ventana, no una posición inventada. */
        visible = Math.max(0, Math.min(r.right, vr.right) - Math.max(r.left, vr.left));
        tramos[i].firstChild.style.setProperty("--on",
          (r.width ? Math.min(1, visible / r.width) : 0).toFixed(3));
        /* Paneo: ±3.5% sobre un ancho de 112% son 3.9% del marco,
           dentro del 6% de aire que tiene a cada lado. */
        if (fotos[i]) fotos[i].style.setProperty("--px",
          (Math.max(-1, Math.min(1, (r.left + r.width / 2 - ancho / 2) / ancho)) * -3.5).toFixed(2));
      }
      flechas.forEach(function (b) {
        var dir = +b.dataset.galIr;
        b.disabled = dir < 0 ? via.scrollLeft < 4 : via.scrollLeft > max - 4;
      });
    }
    function pedir() { if (!pendiente) { pendiente = true; requestAnimationFrame(pintar); } }

    via.addEventListener("scroll", pedir, { passive: true });
    window.addEventListener("resize", pedir);
    pintar();

    /* Las flechas avanzan de a una foto. Probé que saltaran a la
       primera que no se ve entera -suena más útil- y era peor: en
       desktop entran dos y media, así que el primer clic se comía
       todo el recorrido y el carrusel terminaba de una. */
    function indiceActual() {
      var ref = via.getBoundingClientRect().left + 2, mejor = 0, min = Infinity, i, d;
      for (i = 0; i < tarjetas.length; i++) {
        d = Math.abs(tarjetas[i].getBoundingClientRect().left - ref);
        if (d < min) { min = d; mejor = i; }
      }
      return mejor;
    }
    flechas.forEach(function (b) {
      b.addEventListener("click", function () { irA(indiceActual() + (+b.dataset.galIr)); });
    });

    /* Arrastre con el mouse. El enganche se apaga mientras se
       arrastra y vuelve al soltar, si no pelea con cada movimiento. */
    if (matchMedia("(hover:hover) and (pointer:fine)").matches) {
      var abajo = false, x0 = 0, sl0 = 0, vel = 0, raf = 0, movido = 0;
      via.addEventListener("pointerdown", function (e) {
        if (e.pointerType !== "mouse" || e.button !== 0) return;
        abajo = true; movido = 0; x0 = e.clientX; sl0 = via.scrollLeft; vel = 0;
        cancelAnimationFrame(raf);
        via.classList.add("arrastrando");
        via.style.scrollSnapType = "none";
      });
      via.addEventListener("pointermove", function (e) {
        if (!abajo) return;
        var d = e.clientX - x0;
        movido = Math.max(movido, Math.abs(d));
        var nuevo = sl0 - d;
        vel = nuevo - via.scrollLeft;
        via.scrollLeft = nuevo;
      });
      /* Al reactivar scroll-snap el navegador no reengancha hasta el
         próximo scroll: queda a mitad de camino entre dos fotos. Se
         lo lleva a mano a la más cercana. */
      var asentar = function () {
        via.style.scrollSnapType = "";
        var ref = via.getBoundingClientRect().left + 2, mejor = null, min = Infinity, i, d;
        for (i = 0; i < tarjetas.length; i++) {
          d = tarjetas[i].getBoundingClientRect().left - ref;
          if (Math.abs(d) < min) { min = Math.abs(d); mejor = d; }
        }
        if (mejor !== null && Math.abs(mejor) > 1) {
          via.scrollTo({ left: via.scrollLeft + mejor, behavior: reduced ? "auto" : "smooth" });
        }
      };
      var soltar = function () {
        if (!abajo) return;
        abajo = false;
        via.classList.remove("arrastrando");
        (function inercia() {
          if (Math.abs(vel) < 0.5) { asentar(); return; }
          via.scrollLeft += vel; vel *= 0.93;
          raf = requestAnimationFrame(inercia);
        })();
      };
      via.addEventListener("pointerup", soltar);
      via.addEventListener("pointercancel", soltar);
      via.addEventListener("pointerleave", soltar);
      /* Un arrastre no es un clic: si no, se dispara el hover/zoom. */
      via.addEventListener("click", function (e) {
        if (movido > 6) { e.preventDefault(); e.stopPropagation(); }
      }, true);
    }

    if (!hasGSAP || reduced) return;

    /* El telón: entra en cascada cuando la sección aparece. */
    var telones = rail.querySelectorAll(".gal-telon");
    telones.forEach(function (t) { t.style.display = "block"; });
    gsap.set(telones, { scaleY: 1, transformOrigin: "bottom center" });
    gsap.timeline({ scrollTrigger: { trigger: sec, start: "top 78%", once: true } })
      .to(telones, { scaleY: 0, duration: .9, ease: "power3.inOut", stagger: .085 })
      .set(telones, { display: "none" });

    if (matchMedia("(hover:hover) and (pointer:fine)").matches) {
      tarjetas.forEach(function (t) {
        var im = t.querySelector("img");
        if (!im) return;
        t.addEventListener("mouseenter", function () { im.style.setProperty("--z", "1.05"); });
        t.addEventListener("mouseleave", function () { im.style.setProperty("--z", "1"); });
      });
    }
  }

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

  /* ---------------- LA PERSONA Y LOS DOLORES ----------------
     Todo con el scroll y sin pinear nada (cada pin suma un tramo que se
     recalcula, y en el teléfono eso es riesgo de saltos):
     · los anillos se abren de adentro hacia afuera y las órbitas giran;
     · el titular se enciende palabra por palabra, y los dos "crece"
       llegan con su color;
     · los párrafos se aclaran mientras los leés;
     · por la lista baja una línea y cada problema se tilda cuando la
       línea de lectura (62% de la pantalla) pasa por su casillero. Es
       reversible: si volvés para arriba, se destilda;
     · el lema, la pregunta y el cierre suben desde abajo una sola vez,
       y el botón entra con un destello. */
  function partirPalabras(el, conMascara) {
    /* Parte los nodos de texto en palabras sin tocar las etiquetas que
       ya hay (los .t-crece, las dos mitades del lema). Las palabras
       siguen siendo texto real: nada de aria-hidden ni aria-label. */
    var palabras = [], textos = [];
    var w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) textos.push(w.currentNode);
    textos.forEach(function (t) {
      var frag = document.createDocumentFragment();
      t.textContent.split(/(\s+)/).forEach(function (p) {
        if (!p) return;
        if (/^\s+$/.test(p)) { frag.appendChild(document.createTextNode(p)); return; }
        var s = document.createElement("span");
        s.className = "pw";
        s.textContent = p;
        palabras.push(s);
        if (conMascara) {
          var m = document.createElement("span");
          m.className = "pw-mask";
          m.appendChild(s);
          frag.appendChild(m);
        } else frag.appendChild(s);
      });
      t.parentNode.replaceChild(frag, t);
    });
    return palabras;
  }
  function initPersona() {
    var sec = document.querySelector(".persona");
    if (!sec || !hasGSAP || reduced) return;
    try {
      sec.classList.add("persona-viva");
      var top = sec.querySelector(".persona-top");

      /* Anillos: crecen con la primera mitad de la sección, todo
         alrededor del centro del dibujo (0,0). Cada elemento tiene una
         sola animación de transform: el trazo crece en su círculo y gira
         en el grupo que lo envuelve. Con las dos sobre el mismo círculo,
         GSAP compensaba el cambio de origen y lo dejaba fuera de centro. */
      var tlA = gsap.timeline({ scrollTrigger: { trigger: top, start: "top 90%", end: "bottom 40%", scrub: 0.8 } });
      tlA.from(sec.querySelectorAll(".pa-anillo"), { scale: 0.3, opacity: 0, svgOrigin: "0 0",
          stagger: 0.08, duration: 0.6, ease: "power2.out" }, 0)
        .from(sec.querySelector(".pa-halo"), { scale: 0.4, opacity: 0, svgOrigin: "0 0",
          duration: 0.7, ease: "power2.out" }, 0)
        .from(sec.querySelector(".pa-trazo"), { scale: 0.7, opacity: 0, svgOrigin: "0 0",
          duration: 0.6, ease: "power2.out" }, 0.25)
        .from(sec.querySelectorAll(".pa-orbita"), { opacity: 0, duration: 0.3, stagger: 0.1 }, 0.45);
      /* El trazo y las órbitas giran durante toda la sección (las
         órbitas por afuera del titular, para no pasar entre las letras),
         y el dibujo se queda un poco atrás del texto (parallax suave).
         Cuando la lectura pasa a la lista, los anillos se apagan. */
      var giro = function () { return { trigger: sec, start: "top bottom", end: "bottom top", scrub: 1 }; };
      gsap.to(sec.querySelector(".pa-giro"), { rotation: 140, svgOrigin: "0 0", ease: "none", scrollTrigger: giro() });
      gsap.to(sec.querySelector(".pa-orbita-1"), { rotation: 120, svgOrigin: "0 0", ease: "none", scrollTrigger: giro() });
      gsap.to(sec.querySelector(".pa-orbita-2"), { rotation: -90, svgOrigin: "0 0", ease: "none", scrollTrigger: giro() });
      gsap.to(sec.querySelector(".persona-anillos"), { yPercent: -9, ease: "none", scrollTrigger: giro() });
      gsap.to(sec.querySelector(".persona-anillos"),
        { opacity: 0.3, ease: "none", scrollTrigger: { trigger: top, start: "bottom 55%", end: "bottom 5%", scrub: 0.8 } });

      /* Titular: las palabras se encienden en orden de lectura. */
      var titulo = sec.querySelector(".persona-title");
      var pal = partirPalabras(titulo, false);
      var tlT = gsap.timeline({ scrollTrigger: { trigger: titulo, start: "top 85%", end: "bottom 45%", scrub: 0.6 } });
      pal.forEach(function (p, i) {
        tlT.from(p, { opacity: 0.12, yPercent: 30, duration: 0.5, ease: "power1.out" }, i * 0.12);
        if (p.closest(".t-crece")) {
          tlT.from(p, { color: "#031D40", scale: 0.84, transformOrigin: "50% 85%", duration: 0.45,
            ease: "back.out(2)" }, i * 0.12 + 0.18);
        }
      });

      /* Párrafos: se aclaran a medida que suben. */
      sec.querySelectorAll(".persona-p").forEach(function (p) {
        gsap.fromTo(p, { opacity: 0.15, y: 24 }, { opacity: 1, y: 0, ease: "none",
          scrollTrigger: { trigger: p, start: "top 92%", end: "top 64%", scrub: 0.6 } });
      });

      /* Lema, pregunta y cierre: suben desde su máscara, una vez. */
      function subir(el, start, extra) {
        var ws = partirPalabras(el, true);
        gsap.set(ws, { yPercent: 115 });
        var tl = gsap.timeline({ scrollTrigger: { trigger: el, start: start, once: true } });
        tl.to(ws, { yPercent: 0, duration: 1, stagger: 0.045, ease: "expo.out" })
          .call(function () { el.classList.add("is-on"); }, null, 0.25);
        if (extra) extra(tl);
        return tl;
      }
      subir(sec.querySelector(".persona-lema"), "top 86%");
      subir(sec.querySelector(".dolores-title"), "top 85%");

      /* La lista que se tilda sola. */
      var wrap = sec.querySelector(".dolores-wrap");
      var items = Array.prototype.slice.call(wrap.querySelectorAll(".dolor"));
      var linea = wrap.querySelector(".dolores-linea");
      var fill = linea.querySelector("i");
      var barras = sec.querySelectorAll(".dolores-cuenta i");
      var centros = [], c0 = 0, cN = 1, altoWrap = 1;
      function medir() {
        var r = wrap.getBoundingClientRect();
        altoWrap = r.height || 1;
        centros = items.map(function (li) {
          var c = li.querySelector(".dolor-check").getBoundingClientRect();
          return c.top + c.height / 2 - r.top;
        });
        c0 = centros[0]; cN = centros[centros.length - 1];
        linea.style.top = c0 + "px";
        linea.style.bottom = "auto";
        linea.style.height = Math.max(0, cN - c0) + "px";
      }
      gsap.set(fill, { scaleY: 0, transformOrigin: "50% 0%" });
      var llenar = gsap.quickTo(fill, "scaleY", { duration: 0.45, ease: "power3.out" });
      function pintar(p) {
        var lectura = p * altoWrap, n = 0;
        llenar(clamp01((lectura - c0) / ((cN - c0) || 1)));
        items.forEach(function (li, i) {
          var si = lectura >= centros[i] - 2;
          li.classList.toggle("is-check", si);
          if (si) n++;
        });
        for (var i = 0; i < barras.length; i++) barras[i].classList.toggle("is-on", i < n);
      }
      medir();
      ScrollTrigger.create({ trigger: wrap, start: "top 62%", end: "bottom 62%",
        onRefresh: function (self) { medir(); pintar(self.progress); },
        onUpdate: function (self) { pintar(self.progress); } });

      /* Cierre: la frase sube, se subraya y aparece el botón. */
      var cta = sec.querySelector(".dolores-cta");
      gsap.set(cta, { opacity: 0, y: 18 });
      subir(sec.querySelector(".dolores-frase"), "top 82%", function (tl) {
        tl.to(cta, { opacity: 1, y: 0, duration: 0.7, ease: "power3.out", clearProps: "opacity,transform" }, "-=0.6")
          .call(function () { cta.classList.add("is-brillo"); }, null, "-=0.3");
      });
      cta.addEventListener("animationend", function () { cta.classList.remove("is-brillo"); });
      if (fine) cta.addEventListener("mouseenter", function () { cta.classList.add("is-brillo"); });
    } catch (e) {
      /* Si algo falla a mitad de camino, la sección vuelve a su estado
         final: nada puede quedar apagado ni el botón invisible. */
      ScrollTrigger.getAll().forEach(function (t) {
        if (t.trigger && sec.contains(t.trigger)) t.kill(true);
      });
      sec.classList.remove("persona-viva");
      gsap.set(sec.querySelectorAll(".pw, .pa-grupo, .pa-grupo *, .pa-halo, .pa-giro, .pa-trazo, .pa-orbita, .persona-anillos, .persona-p, .dolores-linea i, .dolores-cta"),
        { clearProps: "all" });
      throw e;
    }
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
        /* el foco del teclado acompaña al salto (sin volver a scrollear)
           y la dirección queda apuntando a la sección */
        if (!t.hasAttribute("tabindex")) t.setAttribute("tabindex", "-1");
        t.focus({ preventScroll: true });
        try { history.replaceState(null, "", id); } catch (err) { /* file:// */ }
      });
    });
  }

  /* ---------------- SECCIÓN ACTUAL ----------------
     El link de la sección que está en el medio de la pantalla queda
     marcado, en el nav de escritorio y en el menú del teléfono. */
  function initSeccionActual() {
    if (!("IntersectionObserver" in window)) return;
    var links = document.querySelectorAll('.nav-links a[href^="#"], .menu-movil-links a[href^="#"]');
    var ids = {};
    links.forEach(function (a) { ids[a.getAttribute("href").slice(1)] = true; });
    var actual = null;
    function marcar(id) {
      if (id === actual) return;
      actual = id;
      links.forEach(function (a) {
        var si = a.getAttribute("href") === "#" + id;
        a.classList.toggle("is-current", si);
        if (si) a.setAttribute("aria-current", "location"); else a.removeAttribute("aria-current");
      });
    }
    /* Cada sección marca el link de su parte: las que no tienen link
       propio heredan el de la última que sí tiene ("La persona" es parte
       de "Sobre mí", la pasarela y el lema son parte del método). El
       hero y la pasarela de clubes no marcan ninguno. */
    var seccionDe = new Map(), ultimo = null;
    document.querySelectorAll("header.hero, body > section").forEach(function (s) {
      if (s.id && ids[s.id]) ultimo = s.id;
      seccionDe.set(s, s.classList.contains("hero") ? null : ultimo);
    });
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) marcar(seccionDe.get(e.target)); });
    }, { rootMargin: "-48% 0px -48% 0px" });
    seccionDe.forEach(function (v, s) { io.observe(s); });
  }

  function boot() {
    safe(initSplash, "splash");
    safe(initHero, "hero");
    safe(initChrome, "chrome");
    safe(initMenu, "menu");
    safe(initImagenes, "imagenes");
    safe(initNavHeight, "navHeight");
    safe(initReveal, "reveal");
    safe(initSplitText, "split");
    safe(initCountUp, "countup");
    safe(initAudMore, "audMore");
    safe(initWhyScroll, "whyScroll");
    safe(initWaForm, "waForm");
    safe(initMarquee, "marquee");
    safe(initDeportes, "deportes");
    safe(initPersona, "persona");
    safe(initMagnetic, "magnetic");
    safe(initProgGlow, "progGlow");
    safe(initGaleria, "galeria");
    safe(initParallax, "parallax");
    safe(initCima, "cima");
    safe(initAnchors, "anchors");
    safe(initSeccionActual, "seccionActual");
    if (hasGSAP) {
      var resort = function () { ScrollTrigger.sort(); ScrollTrigger.refresh(); };
      resort();
      window.addEventListener("load", function () { cuandoQuieto(resort); });

      /* Antes, CADA foto lazy que terminaba de cargar disparaba un
         refresh. Con la sección CIMA pineada, un refresh recalcula el
         alto del documento y te corre el scroll: scrolleabas en
         celular, entraba una foto, y la página se iba sola para
         arriba. Y son más de una docena de imágenes lazy.

         Todas tienen width y height declarados, así que cargar no les
         cambia el lugar a nadie. Entonces: una sola pasada demorada, y
         solo si el documento realmente cambió de alto. */
      var alto = document.documentElement.scrollHeight, demora = 0;
      var remedir = function () {
        clearTimeout(demora);
        demora = setTimeout(function () {
          cuandoQuieto(function () {
            var h = document.documentElement.scrollHeight;
            if (h === alto) return;
            alto = h;
            resort();
          });
        }, 240);
      };
      document.querySelectorAll("img[loading=lazy]").forEach(function (im) {
        if (!im.complete) im.addEventListener("load", remedir, { once: true });
      });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
