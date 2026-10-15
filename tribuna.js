(function () {
  "use strict";
  /* ===========================================================
     TRIBUNA — "jugar con el estadio lleno"
     Iñaki Etchegaray · M-DATOS

     El caso real de la página cuenta de un apertura de 21 años cuyo
     sueño era jugar con el estadio lleno. Debajo del título va ese
     estadio, de noche y vacío; a medida que se baja por la historia
     se va llenando: se encienden las linternas de los celulares, saltan
     los flashes y, cuando está lleno, se prenden los carteles LED de
     la cancha con la frase de la marca.

     El llenado depende del scroll, no del tiempo: si se vuelve para
     arriba, el estadio se vacía. Encima de eso, con el estadio a
     medio llenar, saltan flashes sueltos como en una tribuna de
     verdad, sólo mientras el panel se ve.

     Lo pesado (la estructura, los asientos apagados, el pasto) se
     dibuja una vez en un lienzo aparte; cada cuadro sólo estampa ese
     fondo y pinta los asientos encendidos.
     =========================================================== */

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function sstep(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  /* azar con semilla: la tribuna se llena siempre igual */
  function rnd(seed) { var s = seed >>> 0 || 1; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

  var FRASE = "LA CIMA SE CONSTRUYE";

  window.TRIBUNA_mount = function (canvas) {
    if (!canvas) return false;
    var ctx = canvas.getContext("2d");
    if (!ctx) return false;
    var reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

    var W = 0, H = 0, DPR = 1;
    var fondo = document.createElement("canvas"), fctx = fondo.getContext("2d");
    var asientos = [], focos = [], cartel = null;
    var lleno = -1, visible = false, raf = 0, flashes = [], ultimoFlash = 0;

    /* La curva de cada fila: sube hacia los costados, como una tribuna
       que rodea la cancha vista desde el medio. */
    function fila(y0, k, x) { var u = (x - W / 2) / (W / 2); return y0 - k * u * u; }

    function layout() {
      var r = canvas.getBoundingClientRect();
      W = Math.round(r.width); H = Math.round(r.height);
      if (!W || !H) return false;
      DPR = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = fondo.width = Math.round(W * DPR);
      canvas.height = fondo.height = Math.round(H * DPR);
      armar();
      return true;
    }

    function armar() {
      var c = fctx, R = rnd(7);
      c.setTransform(DPR, 0, 0, DPR, 0, 0);
      /* cielo de noche */
      var g = c.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, "#010B19"); g.addColorStop(0.55, "#02132B"); g.addColorStop(1, "#041D3A");
      c.fillStyle = g; c.fillRect(0, 0, W, H);

      var esc = clamp(H / 380, 0.55, 1.25);
      var bend = H * 0.07;
      /* el techo */
      var yr = H * 0.1;
      c.fillStyle = "#010A17";
      c.beginPath(); c.moveTo(0, 0); c.lineTo(W, 0);
      for (var x = W; x >= 0; x -= 8) c.lineTo(x, fila(yr, bend * 1.1, x));
      c.closePath(); c.fill();
      c.strokeStyle = "rgba(120,170,215,.18)"; c.lineWidth = 1;
      c.beginPath(); for (x = 0; x <= W; x += 8) { var yy = fila(yr, bend * 1.1, x); if (x) c.lineTo(x, yy); else c.moveTo(x, yy); } c.stroke();
      focos = [];
      var nf = Math.max(6, Math.round(W / 110));
      for (var i = 0; i < nf; i++) { var fx = W * (i + 0.5) / nf; focos.push([fx, fila(yr, bend * 1.1, fx) - 2]); }

      /* las bandejas: alta y baja, con los palcos en el medio */
      asientos = [];
      var tiers = [
        { top: H * 0.16, bot: H * 0.42, filas: Math.round(9 * esc + 2), s0: 0.62, s1: 0.85 },
        { top: H * 0.53, bot: H * 0.79, filas: Math.round(10 * esc + 2), s0: 0.9, s1: 1.25 }
      ];
      tiers.forEach(function (T, ti) {
        /* el cemento de la bandeja */
        c.fillStyle = ti ? "rgba(5,30,60,.55)" : "rgba(5,30,60,.42)";
        c.beginPath();
        for (x = 0; x <= W; x += 8) { var ya = fila(T.top - 6, bend, x); if (x) c.lineTo(x, ya); else c.moveTo(x, ya); }
        for (x = W; x >= 0; x -= 8) c.lineTo(x, fila(T.bot + 6, bend * 0.8, x));
        c.closePath(); c.fill();
        for (var fi = 0; fi < T.filas; fi++) {
          var t = fi / (T.filas - 1), y0 = T.top + (T.bot - T.top) * Math.pow(t, 1.12);
          var k = bend * (1 - 0.2 * t), sc = (T.s0 + (T.s1 - T.s0) * t) * esc;
          var dx = 5.4 * sc, dot = Math.max(1.1, 1.9 * sc);
          /* el borde de la grada */
          c.strokeStyle = "rgba(120,170,215," + (0.035 + 0.03 * t) + ")"; c.lineWidth = 1;
          c.beginPath(); for (x = 0; x <= W; x += 10) { var yl = fila(y0 + dot * 1.4, k, x); if (x) c.lineTo(x, yl); else c.moveTo(x, yl); } c.stroke();
          for (x = dx * (0.3 + R() * 0.5); x < W; x += dx * (0.7 + R() * 0.6)) {
            var y = fila(y0, k, x) + (R() - 0.5) * dot * 0.9;
            var o = R();
            /* el orden en que se llena: más gente en el medio y abajo */
            var cen = Math.abs(x - W / 2) / (W / 2);
            var orden = clamp(o * 0.75 + cen * 0.2 + (ti ? 0 : 0.08) - t * 0.05, 0, 0.999);
            var tipo = R();
            /* luz: una parte de la gente levanta el celular */
            asientos.push({ x: x, y: y, s: dot * (0.85 + R() * 0.35), o: orden, luz: tipo < 0.18 ? (tipo < 0.04 ? 2 : 1) : 0, b: 0.45 + R() * 0.5 });
            c.fillStyle = "rgba(90,140,195," + (0.05 + 0.04 * t) + ")";
            c.fillRect(x - dot / 2, y - dot / 2, dot, dot);
          }
        }
      });
      /* los palcos */
      var yp = H * 0.465;
      c.fillStyle = "rgba(2,14,30,.9)";
      c.beginPath();
      for (x = 0; x <= W; x += 8) { var y1 = fila(yp - H * 0.02, bend * 0.9, x); if (x) c.lineTo(x, y1); else c.moveTo(x, y1); }
      for (x = W; x >= 0; x -= 8) c.lineTo(x, fila(yp + H * 0.025, bend * 0.9, x));
      c.closePath(); c.fill();
      for (x = 14; x < W; x += 26 * esc) {
        c.fillStyle = "rgba(143,217,250," + (0.08 + 0.1 * R()) + ")";
        c.fillRect(x, fila(yp - H * 0.008, bend * 0.9, x), 14 * esc, H * 0.016);
      }
      /* el cartel LED alrededor de la cancha */
      var yc = H * 0.815, hc = H * 0.045;
      cartel = { y: yc, h: hc };
      c.fillStyle = "#010A17"; c.fillRect(0, yc, W, hc);
      c.fillStyle = "rgba(69,174,229,.10)"; c.fillRect(0, yc, W, 1);
      /* el pasto */
      var gp = c.createLinearGradient(0, yc + hc, 0, H);
      gp.addColorStop(0, "#06305A"); gp.addColorStop(1, "#0A3C6E");
      c.fillStyle = gp; c.fillRect(0, yc + hc, W, H - yc - hc);
      var nb = 14;
      for (i = 0; i < nb; i += 2) {
        var xa = (i - nb / 2) / (nb / 2), xb = (i + 1 - nb / 2) / (nb / 2);
        c.fillStyle = "rgba(150,215,250,.05)";
        c.beginPath();
        c.moveTo(W / 2 + xa * W * 0.62, yc + hc); c.lineTo(W / 2 + xb * W * 0.62, yc + hc);
        c.lineTo(W / 2 + xb * W * 0.95, H); c.lineTo(W / 2 + xa * W * 0.95, H); c.closePath(); c.fill();
      }
      c.strokeStyle = "rgba(205,236,255,.38)"; c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(0, yc + hc + (H - yc - hc) * 0.35); c.lineTo(W, yc + hc + (H - yc - hc) * 0.35); c.stroke();
      asientos.sort(function (a, b) { return a.o - b.o; });
    }

    /* un destello: cruz fina con halo, el flash de una cámara */
    function flash(x, y, a, s) {
      var r = s * 7;
      var g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, "rgba(255,255,255," + a + ")"); g.addColorStop(0.25, "rgba(200,236,255," + (0.5 * a) + ")");
      g.addColorStop(1, "rgba(143,217,250,0)");
      ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
      ctx.fillStyle = "rgba(255,255,255," + (0.9 * a) + ")";
      ctx.fillRect(x - r * 0.9, y - 0.5, r * 1.8, 1); ctx.fillRect(x - 0.5, y - r * 0.9, 1, r * 1.8);
    }

    /* el brillo de una linterna, dibujado una vez */
    var BRILLO = (function () {
      var b = document.createElement("canvas"), R = 32; b.width = b.height = R * 2;
      var c = b.getContext("2d"), g = c.createRadialGradient(R, R, 0, R, R, R);
      g.addColorStop(0, "rgba(235,248,255,1)"); g.addColorStop(0.18, "rgba(170,225,255,.55)");
      g.addColorStop(0.5, "rgba(69,174,229,.12)"); g.addColorStop(1, "rgba(69,174,229,0)");
      c.fillStyle = g; c.fillRect(0, 0, R * 2, R * 2);
      return b;
    })();
    function draw(now) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(fondo, 0, 0);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      var f = lleno;

      /* los focos del techo se prenden apenas empieza a llegar gente */
      var lf = sstep(0, 0.2, f);
      if (lf > 0) {
        ctx.globalCompositeOperation = "lighter";
        focos.forEach(function (p) {
          var r = H * 0.5;
          var g = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], r);
          g.addColorStop(0, "rgba(180,228,255," + (0.14 * lf) + ")"); g.addColorStop(1, "rgba(69,174,229,0)");
          ctx.fillStyle = g; ctx.fillRect(p[0] - r, p[1], r * 2, r);
          /* el haz que cae a la cancha */
          var gb = ctx.createLinearGradient(0, p[1], 0, H);
          gb.addColorStop(0, "rgba(170,225,255," + (0.05 * lf) + ")"); gb.addColorStop(1, "rgba(170,225,255,0)");
          ctx.fillStyle = gb;
          var hacia = W / 2 + (p[0] - W / 2) * 0.55;
          ctx.beginPath(); ctx.moveTo(p[0] - 5, p[1]); ctx.lineTo(p[0] + 5, p[1]);
          ctx.lineTo(hacia + W * 0.07, H); ctx.lineTo(hacia - W * 0.07, H); ctx.closePath(); ctx.fill();
          ctx.drawImage(BRILLO, p[0] - 16, p[1] - 16, 32, 32);
          ctx.fillStyle = "rgba(245,252,255," + (0.95 * lf) + ")";
          ctx.fillRect(p[0] - 7, p[1] - 1.5, 14, 3);
        });
        ctx.globalCompositeOperation = "source-over";
      }

      /* la gente llega en orden hasta la fracción 'f': cabezas que
         agarra la luz de los focos desde arriba... */
      var n = Math.floor(asientos.length * f), i, s;
      for (i = 0; i < n; i++) {
        s = asientos[i];
        ctx.fillStyle = "rgba(70,125,180," + (0.32 + 0.3 * s.b) + ")";
        ctx.fillRect(s.x - s.s * 0.55, s.y - s.s * 0.45, s.s * 1.1, s.s * 1.2);
        ctx.fillStyle = "rgba(150,200,240," + (0.25 * s.b) + ")";
        ctx.fillRect(s.x - s.s * 0.4, s.y - s.s * 0.55, s.s * 0.8, s.s * 0.3);
      }
      /* ...y una parte levanta el celular con la linterna prendida */
      ctx.globalCompositeOperation = "lighter";
      for (i = 0; i < n; i++) {
        s = asientos[i];
        if (!s.luz) continue;
        var r = s.s * (s.luz === 2 ? 4.2 : 2.8);
        ctx.globalAlpha = 0.55 + 0.45 * s.b;
        ctx.drawImage(BRILLO, s.x - r, s.y - r - s.s, r * 2, r * 2);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      /* un velo de luz sobre la tribuna llena */
      if (f > 0.3) {
        ctx.globalCompositeOperation = "lighter";
        var gv = ctx.createRadialGradient(W / 2, H * 0.55, 0, W / 2, H * 0.55, W * 0.6);
        gv.addColorStop(0, "rgba(69,174,229," + (0.07 * sstep(0.3, 1, f)) + ")"); gv.addColorStop(1, "rgba(69,174,229,0)");
        ctx.fillStyle = gv; ctx.fillRect(0, 0, W, H);
        ctx.globalCompositeOperation = "source-over";
      }

      /* el cartel LED: se prende cuando el estadio está lleno */
      var lc = sstep(0.55, 0.85, f);
      if (cartel && lc > 0) {
        var fz = Math.round(cartel.h * 0.62);
        ctx.font = "600 " + fz + "px 'Barlow Condensed','Archivo Narrow',Arial,sans-serif";
        ctx.textBaseline = "middle"; ctx.textAlign = "left";
        if ("letterSpacing" in ctx) ctx.letterSpacing = (fz * 0.28).toFixed(1) + "px";
        var paso = ctx.measureText(FRASE + "   ◆   ").width;
        ctx.fillStyle = "rgba(69,174,229," + (0.12 * lc) + ")"; ctx.fillRect(0, cartel.y, W, cartel.h);
        ctx.fillStyle = "rgba(143,217,250," + (0.95 * lc) + ")";
        for (var x = -paso * 0.3; x < W; x += paso) ctx.fillText(FRASE + "   ◆", x, cartel.y + cartel.h / 2 + 0.5);
        if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
      }

      /* flashes */
      for (var j = flashes.length - 1; j >= 0; j--) {
        var fl = flashes[j], e = (now - fl.t) / 380;
        if (e >= 1) { flashes.splice(j, 1); continue; }
        flash(fl.x, fl.y, (1 - e) * (1 - e), fl.s);
      }
    }

    /* cuánto del panel ya pasó por la pantalla -> qué tan lleno está */
    function medir() {
      var r = canvas.getBoundingClientRect(), vh = window.innerHeight || 800;
      var p = clamp((vh - r.top) / (vh + r.height), 0, 1);
      return reduced ? 1 : sstep(0.14, 0.62, p);
    }

    function tick(now) {
      raf = 0;
      if (!W) return;
      var f = medir();
      if (f !== lleno) {
        /* los que se acaban de encender, algunos con flash */
        var a = Math.floor(asientos.length * Math.max(0, lleno)), b = Math.floor(asientos.length * f);
        if (!reduced && b > a) {
          var cuantos = Math.min(6, Math.ceil((b - a) / 60));
          for (var i = 0; i < cuantos; i++) {
            var s = asientos[a + Math.floor(Math.random() * (b - a))];
            if (s) flashes.push({ x: s.x, y: s.y, s: s.s, t: now });
          }
        }
        lleno = f;
      }
      /* con gente en la tribuna, flashes sueltos */
      if (!reduced && visible && lleno > 0.2 && now - ultimoFlash > 140 + Math.random() * 260) {
        var m = Math.floor(asientos.length * lleno), s2 = asientos[Math.floor(Math.random() * m)];
        if (s2) flashes.push({ x: s2.x, y: s2.y, s: s2.s, t: now });
        ultimoFlash = now;
      }
      draw(now);
      if (visible && !reduced) raf = requestAnimationFrame(tick);
    }
    function pedir() { if (!raf) raf = requestAnimationFrame(tick); }

    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (es) {
        visible = es[0].isIntersecting;
        if (visible) { if (!W) layout(); pedir(); }
      }, { rootMargin: "120px 0px" }).observe(canvas);
    } else { visible = true; layout(); pedir(); }
    window.addEventListener("scroll", function () { if (visible) pedir(); }, { passive: true });

    var to = 0, lw = 0;
    window.addEventListener("resize", function () {
      clearTimeout(to);
      to = setTimeout(function () {
        if (window.innerWidth === lw && W) return;
        lw = window.innerWidth;
        if (layout()) { lleno = -1; pedir(); }
      }, 160);
    });
    return true;
  };
})();
