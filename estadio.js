(function () {
  "use strict";
  /* ===========================================================
     ESTADIO — la cancha de noche detrás del hero
     Iñaki Etchegaray · M-DATOS

     El pedido: que desde que se abre la web se lea DEPORTE. Sin
     fotos de stock y sin íconos sueltos: una cancha de rugby de
     noche, vista desde el campo hacia los palos.

     Es rugby y no fútbol a propósito: Iñaki creció en el rugby y la
     mayoría de sus clubes son de rugby. La H se reconoce en un golpe
     de vista.

     La cancha no se dibuja a ojo: hay una cámara real (altura,
     inclinación, giro, distancia focal) y cada línea es una recta del
     reglamento proyectada. Todo se escala con la figura de Iñaki, así
     que en un teléfono es la misma escena más chica.

     Es una ENTRADA, no un fondo en bucle: aparece el pasto, las
     líneas se trazan y los palos se levantan. Después el lienzo queda
     quieto y no repinta más hasta un cambio de tamaño.
     =========================================================== */

  /* La escena, en metros. X a lo largo de la cancha (try en -50),
     Z a lo ancho (0..70), Y hacia arriba. */
  var ANCHO = 70, MZ = 35, TRY = -50;
  var LINEAS = [
    /* [x0, z0, x1, z1, demora, raya] — la demora ordena el trazado
       desde los palos hacia afuera. raya: [lleno, hueco] en metros. */
    [TRY, MZ, TRY, 0, 0.00], [TRY, MZ, TRY, ANCHO, 0.00],          // try, desde el centro
    [-58, MZ, -58, 0, 0.10], [-58, MZ, -58, ANCHO, 0.10],          // pelota muerta
    [-58, 0, 58, 0, 0.18], [-58, ANCHO, 58, ANCHO, 0.18],          // laterales
    [-45, 0, -45, ANCHO, 0.26, [1.2, 6]],                          // 5 m
    [-28, 0, -28, ANCHO, 0.34],                                    // 22
    [-10, 0, -10, ANCHO, 0.42, [2, 3]],                            // 10 m
    [0, 0, 0, ANCHO, 0.48]                                         // mitad
  ];

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function ease(t) { t = clamp(t, 0, 1); return 1 - Math.pow(1 - t, 3); }

  window.ESTADIO_mount = function (canvas) {
    if (!canvas) return false;
    var hero = canvas.closest(".hero");
    var ctx = canvas.getContext("2d");
    var cut = hero && hero.querySelector(".hero-cut");
    if (!hero || !ctx || !cut) return false;

    var reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    var root = document.documentElement;

    var W = 0, H = 0, DPR = 1, small = false;
    var f, cy0, ox, camX, camZ, camH, sY, cYw, sP, cP;
    var S = {};          // medidas de la escena en pantalla

    /* Posición del recorte sin transformaciones: la entrada lo mueve
       (translateY + scale) y el parallax también, y la cancha tiene
       que calzar con donde la figura TERMINA, no donde está ahora. */
    function caja(el) {
      var x = 0, y = 0, n = el;
      while (n && n !== hero) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
      return { l: x, t: y, w: el.offsetWidth, h: el.offsetHeight };
    }
    function borde(sel, lado) {
      var el = hero.querySelector(sel);
      if (!el) return null;
      var hr = hero.getBoundingClientRect(), r = el.getBoundingClientRect();
      if (!r.width && !r.height) return null;
      return lado === "b" ? r.bottom - hr.top : lado === "t" ? r.top - hr.top : r.right - hr.left;
    }

    function cam(X, Y, Z) {
      var dx = X - camX, dy = Y - camH, dz = Z - camZ;
      var x1 = dx * cYw - dz * sY, z1 = dx * sY + dz * cYw;
      return [x1, dy * cP + z1 * sP, -dy * sP + z1 * cP];
    }
    function P3(X, Y, Z) {
      var c = cam(X, Y, Z);
      return [ox + f * c[0] / c[2], cy0 - f * c[1] / c[2], c[2]];
    }

    function layout() {
      var r = hero.getBoundingClientRect();
      W = Math.round(r.width); H = Math.round(r.height);
      if (!W || !H) return false;
      small = window.innerWidth <= 980;
      DPR = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);

      /* Todo se mide contra la figura: la H va a su derecha, la
         línea de try a la altura de la cintura, y la distancia focal
         sale de su alto. Así la escena guarda la proporción con él
         en cualquier pantalla. */
      var c = caja(cut);
      var ch = c.h, cw = Math.min(c.w, c.h * 971 / 1400);
      var cl = c.l + (c.w - cw) / 2;
      S.cutL = cl; S.cutT = c.t; S.cutH = ch;
      var spotX = Math.min(cl + cw * 1.17, W - ch * 0.12);
      var spotY = c.t + ch * 0.91;
      var hy = spotY - ch * 0.285;
      f = ch * 1.89;
      var tilt = 11.2 * Math.PI / 180, yaw = -100 * Math.PI / 180;
      sP = Math.sin(tilt); cP = Math.cos(tilt); sY = Math.sin(yaw); cYw = Math.cos(yaw);
      camH = 12; ox = spotX; cy0 = hy + f * Math.tan(tilt);
      /* La cámara se ubica de modo que el pie de los palos caiga
         justo en (spotX, spotY): distancia resuelta en cerrado. */
      var k = (cy0 - spotY) / f;
      var D = camH * (k * sP + cP) / (sP - k * cP);
      camX = TRY - D * sY; camZ = MZ - D * cYw;

      S.hy = hy; S.spotX = spotX; S.spotY = spotY;
      /* La columna del texto queda limpia: en escritorio se apaga a
         la izquierda; apilado, todo lo que queda arriba de la foto. */
      var copyR = Math.max(borde(".hero-title", "r") || 0, borde(".hero-sub", "r") || 0,
                           borde(".hero-actions", "r") || 0);
      S.copyR = copyR || W * 0.5;
      S.actsB = borde(".hero-actions", "b") || c.t;
      return true;
    }

    /* ---------------- dibujo ---------------- */
    function linea(pts, prog, a, mul) {
      var n = pts.length - 1, upto = prog * n;
      for (var i = 1; i <= n; i++) {
        if (i - 1 >= upto) break;
        var p = P3(pts[i - 1][0], 0, pts[i - 1][1]), q = P3(pts[i][0], 0, pts[i][1]);
        if (p[2] <= 0.5 || q[2] <= 0.5) continue;
        var fr = Math.min(1, upto - (i - 1));
        ctx.lineWidth = Math.max(0.75, f * 0.12 * (mul || 1.6) / ((p[2] + q[2]) / 2));
        ctx.strokeStyle = "rgba(205,236,255," + a + ")";
        ctx.beginPath(); ctx.moveTo(p[0], p[1]);
        ctx.lineTo(p[0] + (q[0] - p[0]) * fr, p[1] + (q[1] - p[1]) * fr); ctx.stroke();
      }
    }
    function tramo(x0, z0, x1, z1, n) {
      var a = [];
      for (var i = 0; i <= n; i++) a.push([x0 + (x1 - x0) * i / n, z0 + (z1 - z0) * i / n]);
      return a;
    }
    function quad(x0, z0, x1, z1) {
      ctx.beginPath();
      var pts = tramo(x0, z0, x1, z0, 10).concat(tramo(x1, z0, x1, z1, 10),
                tramo(x1, z1, x0, z1, 10), tramo(x0, z1, x0, z0, 10));
      var first = true;
      for (var i = 0; i < pts.length; i++) {
        var s = P3(pts[i][0], 0, pts[i][1]);
        if (s[2] <= 0.5) continue;
        if (first) { ctx.moveTo(s[0], s[1]); first = false; } else ctx.lineTo(s[0], s[1]);
      }
      ctx.closePath();
    }

    function draw(t) {
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.clearRect(0, 0, W, H);
      var luz = reduced ? 1 : ease(t / 0.6);
      if (luz <= 0) return;

      /* ---- el pasto, iluminado ---- */
      var base = P3(TRY, 0, MZ);
      ctx.save();
      quad(-58, 0, 58, ANCHO);
      var g = ctx.createRadialGradient(base[0], base[1], 0, base[0], base[1], S.cutH * 1.4);
      g.addColorStop(0, "rgba(110,195,240," + (0.17 * luz) + ")");
      g.addColorStop(1, "rgba(90,180,235," + (0.035 * luz) + ")");
      ctx.fillStyle = g; ctx.fill();
      ctx.clip();
      /* franjas de corte, paralelas al try: lo que da la profundidad */
      for (var x = -58, k = 0; x < 58; x += 5, k++) {
        if (k % 2) continue;
        quad(x, 0, x + 5, ANCHO);
        ctx.fillStyle = "rgba(150,215,250," + (0.05 * luz) + ")"; ctx.fill();
      }
      ctx.restore();

      /* ---- las líneas, desde los palos hacia afuera ---- */
      ctx.lineCap = "round";
      var lt = reduced ? 1e3 : t - 0.35;
      for (var i = 0; i < LINEAS.length; i++) {
        var L = LINEAS[i], p = ease((lt - L[4] * 1.6) / 0.85);
        if (p <= 0) continue;
        if (L[5]) {
          var len = Math.hypot(L[2] - L[0], L[3] - L[1]), ux = (L[2] - L[0]) / len, uz = (L[3] - L[1]) / len;
          for (var s = 0; s < len * p; s += L[5][0] + L[5][1]) {
            var e = Math.min(len * p, s + L[5][0]);
            linea(tramo(L[0] + ux * s, L[1] + uz * s, L[0] + ux * e, L[1] + uz * e, 2), 1, 0.4 * luz);
          }
        } else {
          linea(tramo(L[0], L[1], L[2], L[3], 36), p, 0.42 * luz);
        }
      }

      /* ---- los palos: se levantan ---- */
      var pr = reduced ? 1 : ease((t - 0.75) / 0.7);
      if (pr > 0) {
        var top = 15 * pr, cb = 3.0, hw = 2.8;
        [MZ - hw, MZ + hw].forEach(function (z) {
          var b0 = P3(TRY, 0, z), b1 = P3(TRY, top, z);
          var lw = Math.max(small ? 1.5 : 1.1, f * 0.17 * 1.6 / b0[2]);
          /* protector al pie, en el celeste de la marca */
          var q0 = P3(TRY - 0.55, 0, z), q1 = P3(TRY + 0.55, 0, z),
              q2 = P3(TRY + 0.55, Math.min(top, 1.9), z), q3 = P3(TRY - 0.55, Math.min(top, 1.9), z);
          ctx.fillStyle = "rgba(69,174,229," + (0.6 * luz) + ")";
          ctx.beginPath(); ctx.moveTo(q0[0], q0[1]); ctx.lineTo(q1[0], q1[1]);
          ctx.lineTo(q2[0], q2[1]); ctx.lineTo(q3[0], q3[1]); ctx.closePath(); ctx.fill();
          var gp = ctx.createLinearGradient(0, b0[1], 0, b1[1]);
          gp.addColorStop(0, "rgba(214,240,255," + (0.8 * luz) + ")");
          gp.addColorStop(1, "rgba(214,240,255," + (0.5 * luz) + ")");
          ctx.strokeStyle = gp; ctx.lineWidth = lw;
          ctx.beginPath(); ctx.moveTo(b0[0], b0[1]); ctx.lineTo(b1[0], b1[1]); ctx.stroke();
        });
        if (top > cb) {
          var c0 = P3(TRY, cb, MZ - hw), c1 = P3(TRY, cb, MZ + hw);
          ctx.strokeStyle = "rgba(214,240,255," + (0.75 * luz) + ")";
          ctx.lineWidth = Math.max(small ? 1.5 : 1.1, f * 0.17 * 1.6 / c0[2]);
          ctx.beginPath(); ctx.moveTo(c0[0], c0[1]); ctx.lineTo(c1[0], c1[1]); ctx.stroke();
        }
      }

      /* ---- la columna del texto, limpia ---- */
      ctx.globalCompositeOperation = "destination-out";
      var gm;
      if (small) {
        var y1 = S.actsB + 6, y2 = y1 + Math.max(36, H * 0.05);
        gm = ctx.createLinearGradient(0, y1, 0, y2);
        gm.addColorStop(0, "#000"); gm.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = gm; ctx.fillRect(0, 0, W, y2);
      } else {
        var x1 = S.copyR + 8, x2 = x1 + W * 0.14;
        gm = ctx.createLinearGradient(x1, 0, x2, 0);
        gm.addColorStop(0, "#000"); gm.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = gm; ctx.fillRect(0, 0, x2, H);
      }
      ctx.globalCompositeOperation = "source-over";
    }

    /* ---------------- la entrada ---------------- */
    var FIN = 2.1, t0 = 0, raf = 0, listo = false;
    function frame() {
      var t = (performance.now() - t0) / 1000;
      draw(t);
      raf = t < FIN ? requestAnimationFrame(frame) : 0;
    }
    function arrancar() {
      if (listo) return;
      listo = true;
      if (!layout()) return;
      if (reduced) { draw(1e3); return; }
      t0 = performance.now();
      raf = requestAnimationFrame(frame);
    }

    if (root.classList.contains("is-ready")) arrancar();
    else {
      var mo = new MutationObserver(function () {
        if (root.classList.contains("is-ready")) { mo.disconnect(); arrancar(); }
      });
      mo.observe(root, { attributes: true, attributeFilter: ["class"] });
    }

    /* Al cambiar de tamaño se vuelve a medir y se pinta el estado
       final. Sólo si cambia el ancho o el alto del hero: en celular
       la barra del navegador mueve el viewport sin cambiar nada. */
    var to = 0, lastW = 0, lastH = 0;
    window.addEventListener("resize", function () {
      clearTimeout(to);
      to = setTimeout(function () {
        if (!listo) return;
        var r = hero.getBoundingClientRect();
        if (Math.round(r.width) === lastW && Math.round(r.height) === lastH) return;
        lastW = Math.round(r.width); lastH = Math.round(r.height);
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
        if (layout()) draw(1e3);
      }, 160);
    });
    if (document.fonts && document.fonts.ready) {
      /* el titular define el borde de la columna del texto */
      document.fonts.ready.then(function () { if (listo && !raf && layout()) draw(1e3); });
    }
    return true;
  };
})();
