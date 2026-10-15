(function () {
  "use strict";
  /* ===========================================================
     PIZARRA — la jugada de la franja del lema
     Iñaki Etchegaray · M-DATOS

     "La verdadera cima no está afuera. Está en quien te convertís
     durante el ascenso." Al lado de la frase va una jugada dibujada
     sobre la cancha, como en un análisis de video: pase, desmarque
     por el hueco, remate y gol. El camino ES la jugada.

     Es la misma escena nocturna del hero (estadio.js): las mismas
     líneas, el mismo pasto, la misma luz. Ahí es rugby; acá es
     fútbol a propósito, porque el método es el mismo en cualquier
     deporte.

     La cámara es real y se encuadra sola: se proyectan los puntos
     que tienen que entrar (el área, el arco, los jugadores) y la
     escala y el centro salen de esa caja. Así en un teléfono es la
     misma jugada, más chica y debajo del texto.

     Se arma una vez, cuando la franja entra en pantalla, y queda
     quieta.
     =========================================================== */

  var MZ = 34, GL = 52.5;                 // mitad del ancho; línea de gol
  /* Los jugadores, en metros. X hacia el arco, Z a lo ancho. */
  var ATAQUE = [[27, 22.5], [31, 45], [34, 28.5]];   // 0 lleva la pelota, 1 recibe y define, 2 arrastra la marca
  var DORSAL = ["10", "7", "9"];
  var DEFENSA = [[41, 41.5], [40, 28.5], [36, 35.5], [51.2, 34]];
  var PASE = [[27.6, 23.3], [30.6, 44.2]];
  var CORRIDA = [[31, 45], [37, 44.5], [43.5, 37.5]];   // curva por el hueco
  var ARRASTRE = [[34, 28.5], [38.5, 28], [43, 25]];
  var REMATE = [[44, 37.2], [GL + 0.6, 35.8]];

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function ease(t) { t = clamp(t, 0, 1); return 1 - Math.pow(1 - t, 3); }
  function easeIO(t) { t = clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function bez(P, t) {
    if (P.length === 2) return [P[0][0] + (P[1][0] - P[0][0]) * t, P[0][1] + (P[1][1] - P[0][1]) * t];
    var u = 1 - t;
    return [u * u * P[0][0] + 2 * u * t * P[1][0] + t * t * P[2][0],
            u * u * P[0][1] + 2 * u * t * P[1][1] + t * t * P[2][1]];
  }

  window.PIZARRA_mount = function (canvas) {
    if (!canvas) return false;
    var band = canvas.parentNode;
    var ctx = canvas.getContext("2d");
    if (!ctx) return false;
    var reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

    var W = 0, H = 0, DPR = 1, small = false;
    var C = {};      // cámara
    var R = {};      // región de la escena

    /* Cámara mirando al arco desde atrás del ataque, alta y apenas
       cruzada, como la toma de análisis. */
    var POS = [12, 17, 22], MIRA = [GL - 4, 0, 36];
    function base() {
      var f = [MIRA[0] - POS[0], MIRA[1] - POS[1], MIRA[2] - POS[2]];
      var lf = Math.hypot(f[0], f[1], f[2]); f = [f[0] / lf, f[1] / lf, f[2] / lf];
      /* derecha = adelante x arriba; con Z creciendo hacia la derecha de la toma */
      var r = [-f[2], 0, f[0]]; var lr = Math.hypot(r[0], r[2]); r = [r[0] / lr, 0, r[2] / lr];
      var u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
      C.f = f; C.r = r; C.u = u;
    }
    function raw(X, Y, Z) {
      var d = [X - POS[0], Y - POS[1], Z - POS[2]];
      var zc = d[0] * C.f[0] + d[1] * C.f[1] + d[2] * C.f[2];
      return [(d[0] * C.r[0] + d[1] * C.r[1] + d[2] * C.r[2]) / zc,
              -(d[0] * C.u[0] + d[1] * C.u[1] + d[2] * C.u[2]) / zc, zc];
    }
    function P3(X, Y, Z) {
      var q = raw(X, Y, Z);
      return [C.ox + C.k * q[0], C.oy + C.k * q[1], q[2]];
    }
    function G(X, Z) { return P3(X, 0, Z); }

    function layout() {
      var r = band.getBoundingClientRect();
      W = Math.round(r.width); H = Math.round(r.height);
      if (!W || !H) return false;
      small = window.innerWidth <= 760;
      DPR = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);

      /* La región: a la derecha del texto en escritorio; debajo, apilado. */
      var txt = band.querySelector(".cima-motto");
      var tr = txt ? txt.getBoundingClientRect() : r;
      var right = 0;
      if (txt) {
        try {
          var rg = document.createRange(); rg.selectNodeContents(txt);
          var ls = rg.getClientRects();
          for (var i = 0; i < ls.length; i++) if (ls[i].width && ls[i].right > right) right = ls[i].right;
        } catch (e) { right = tr.right; }
      }
      right = (right || tr.right) - r.left;
      var gut = Math.max(16, W * 0.04);
      if (small) {
        R = { x0: gut, x1: W - gut, y0: tr.bottom - r.top + 18, y1: H - 14 };
      } else {
        R = { x0: Math.max(right + W * 0.035, W * 0.5), x1: Math.min(W - gut, r.left + W), y0: H * 0.07, y1: H * 0.95 };
        if (W > 1500) R.x1 = Math.min(R.x1, W / 2 + 700);
      }
      R.fade = !small;
      base();
      /* encuadre: lo que tiene que entrar */
      var pts = [[GL, 0, MZ - 20.16], [GL, 0, MZ + 20.16], [GL - 16.5, 0, MZ - 20.16], [GL - 16.5, 0, MZ + 20.16],
                 [GL, 2.44, MZ - 3.66], [GL, 2.44, MZ + 3.66], [GL + 2, 0, MZ], [24, 0, 20], [30, 0, 46]];
      var x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      pts.forEach(function (p) {
        var q = raw(p[0], p[1], p[2]);
        x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]);
      });
      var rw = R.x1 - R.x0, rh = R.y1 - R.y0;
      C.k = Math.min(rw / (x1 - x0), rh / (y1 - y0)) * 0.94;
      C.ox = R.x0 + rw / 2 - C.k * (x0 + x1) / 2;
      C.oy = R.y0 + rh / 2 - C.k * (y0 + y1) / 2;
      /* ancho de línea: un metro a la distancia del área */
      C.m = C.k / raw(GL - 8, 0, MZ)[2];
      return true;
    }

    /* ---------------- trazos ---------------- */
    function lw(z, mul) { return Math.max(0.8, C.k * 0.11 * (mul || 1) / z); }
    function trazo(pts, prog, color, mul, dash) {
      var n = pts.length - 1, upto = prog * n;
      ctx.strokeStyle = color;
      if (dash) ctx.setLineDash(dash);
      for (var i = 1; i <= n && i - 1 < upto; i++) {
        var p = G(pts[i - 1][0], pts[i - 1][1]), q = G(pts[i][0], pts[i][1]);
        if (p[2] < 2 || q[2] < 2) continue;
        var fr = Math.min(1, upto - (i - 1));
        ctx.lineWidth = lw((p[2] + q[2]) / 2, mul);
        ctx.beginPath(); ctx.moveTo(p[0], p[1]);
        ctx.lineTo(p[0] + (q[0] - p[0]) * fr, p[1] + (q[1] - p[1]) * fr); ctx.stroke();
      }
      if (dash) ctx.setLineDash([]);
    }
    function recta(x0, z0, x1, z1, n) {
      var a = []; n = n || 16;
      for (var i = 0; i <= n; i++) a.push([x0 + (x1 - x0) * i / n, z0 + (z1 - z0) * i / n]);
      return a;
    }
    function arco(cx, cz, rr, a0, a1, n) {
      var a = []; n = n || 32;
      for (var i = 0; i <= n; i++) { var t = a0 + (a1 - a0) * i / n; a.push([cx + rr * Math.cos(t), cz + rr * Math.sin(t)]); }
      return a;
    }
    function curva(P, n) { var a = []; n = n || 40; for (var i = 0; i <= n; i++) a.push(bez(P, i / n)); return a; }
    function poly(pts) {
      ctx.beginPath();
      pts.forEach(function (p, i) { var s = G(p[0], p[1]); if (i) ctx.lineTo(s[0], s[1]); else ctx.moveTo(s[0], s[1]); });
      ctx.closePath();
    }
    /* Un anillo apoyado en el pasto: un círculo de verdad, en perspectiva. */
    function anillo(x, z, rad, a, color, glow) {
      var pts = arco(x, z, rad, 0, Math.PI * 2, 36);
      if (glow) {
        var c = G(x, z), gr = C.k * rad * 3.2 / c[2];
        var g = ctx.createRadialGradient(c[0], c[1], 0, c[0], c[1], gr);
        g.addColorStop(0, "rgba(69,174,229," + (0.32 * a) + ")"); g.addColorStop(1, "rgba(69,174,229,0)");
        ctx.save(); ctx.translate(c[0], c[1]); ctx.scale(1, 0.5); ctx.translate(-c[0], -c[1]);
        ctx.fillStyle = g; ctx.fillRect(c[0] - gr, c[1] - gr, gr * 2, gr * 2); ctx.restore();
      }
      poly(pts);
      ctx.fillStyle = color.replace("A", 0.22 * a); ctx.fill();
      ctx.lineWidth = lw(G(x, z)[2], 1.9); ctx.strokeStyle = color.replace("A", a); ctx.stroke();
    }
    function cruz(x, z, s, a) {
      var c = "rgba(170,196,222," + (0.75 * a) + ")";
      trazo([[x - s, z - s], [x + s, z + s]], 1, c, 1.7);
      trazo([[x - s, z + s], [x + s, z - s]], 1, c, 1.7);
    }
    /* Flecha sobre el pasto: la punta es un triángulo apoyado en el plano. */
    function flecha(P, prog, color, mul, dash) {
      var pts = curva(P, 40);
      trazo(pts, prog, color, mul, dash);
      if (prog < 1) return;
      var e = pts[pts.length - 1], b = pts[pts.length - 4];
      var dx = e[0] - b[0], dz = e[1] - b[1], l = Math.hypot(dx, dz); dx /= l; dz /= l;
      var L = 1.9, Wd = 1.05;
      poly([[e[0] + dx * 0.4, e[1] + dz * 0.4], [e[0] - dx * L - dz * Wd, e[1] - dz * L + dx * Wd],
            [e[0] - dx * L + dz * Wd, e[1] - dz * L - dx * Wd]]);
      ctx.fillStyle = color; ctx.fill();
    }

    /* ---------------- la escena ---------------- */
    function draw(t) {
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.clearRect(0, 0, W, H);
      var LC = "rgba(205,236,255,";

      /* luz y pasto */
      var luz = reduced ? 1 : ease(t / 0.6);
      var gcen = G(GL - 10, MZ);
      ctx.save();
      var xn = POS[0] + 3;     /* lo que queda detrás de la cámara no se proyecta */
      poly(recta(xn, -6, GL + 6, -6, 8).concat(recta(GL + 6, -6, GL + 6, 74, 8), recta(GL + 6, 74, xn, 74, 8)));
      var g = ctx.createRadialGradient(gcen[0], gcen[1], 0, gcen[0], gcen[1], (R.x1 - R.x0) * 0.75);
      g.addColorStop(0, "rgba(110,195,240," + (0.15 * luz) + ")");
      g.addColorStop(1, "rgba(90,180,235," + (0.03 * luz) + ")");
      ctx.fillStyle = g; ctx.fill(); ctx.clip();
      for (var x = 8.5, k = 0; x < GL + 6; x += 5.5, k++) {
        if (k % 2 || x + 5.5 <= xn) continue;
        var xa = Math.max(x, xn);
        poly(recta(xa, -6, x + 5.5, -6, 2).concat(recta(x + 5.5, 74, xa, 74, 2)));
        ctx.fillStyle = "rgba(150,215,250," + (0.06 * luz) + ")"; ctx.fill();
      }
      ctx.restore();

      /* líneas de la cancha, del arco hacia afuera */
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      var pl = reduced ? 1 : ease((t - 0.15) / 1.0);
      var A = 0.5 * luz;
      trazo(recta(GL, -2, GL, 70, 36), pl, LC + A + ")");                       // línea de fondo
      trazo(recta(GL, 0, xn, 0, 30), pl, LC + A + ")");                         // laterales
      trazo(recta(GL, 68, xn, 68, 30), pl, LC + A + ")");
      trazo([[GL, MZ - 20.16], [GL - 16.5, MZ - 20.16], [GL - 16.5, MZ + 20.16], [GL, MZ + 20.16]], pl, LC + A + ")");
      trazo([[GL, MZ - 9.16], [GL - 5.5, MZ - 9.16], [GL - 5.5, MZ + 9.16], [GL, MZ + 9.16]], pl, LC + A + ")");
      var a0 = Math.acos(5.5 / 9.15);
      trazo(arco(GL - 11, MZ, 9.15, Math.PI - a0, Math.PI + a0, 20), pl, LC + A + ")");
      var ps = G(GL - 11, MZ);
      ctx.fillStyle = LC + (A * pl) + ")"; ctx.beginPath(); ctx.arc(ps[0], ps[1], Math.max(1, C.k * 0.13 / ps[2]), 0, 7); ctx.fill();

      /* el arco, con su red */
      var pa = reduced ? 1 : ease((t - 0.5) / 0.6);
      if (pa > 0) {
        var b0 = P3(GL, 0, MZ - 3.66), b1 = P3(GL, 0, MZ + 3.66), t0 = P3(GL, 2.44 * pa, MZ - 3.66), t1 = P3(GL, 2.44 * pa, MZ + 3.66);
        var n0 = P3(GL + 2, 0, MZ - 3.66), n1 = P3(GL + 2, 0, MZ + 3.66), m0 = P3(GL + 1.2, 2.44 * pa, MZ - 3.66), m1 = P3(GL + 1.2, 2.44 * pa, MZ + 3.66);
        ctx.strokeStyle = "rgba(205,236,255," + (0.28 * pa) + ")"; ctx.lineWidth = 0.8;
        for (var i = 1; i < 8; i++) {                                           // malla
          var f = i / 8, ax = t0[0] + (t1[0] - t0[0]) * f, ay = t0[1] + (t1[1] - t0[1]) * f;
          var bx = m0[0] + (m1[0] - m0[0]) * f, by = m0[1] + (m1[1] - m0[1]) * f;
          var cx = n0[0] + (n1[0] - n0[0]) * f, cy = n0[1] + (n1[1] - n0[1]) * f;
          ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(cx, cy); ctx.stroke();
        }
        ctx.beginPath(); ctx.moveTo(m0[0], m0[1]); ctx.lineTo(m1[0], m1[1]);
        ctx.moveTo(n0[0], n0[1]); ctx.lineTo(n1[0], n1[1]);
        ctx.moveTo(t0[0], t0[1]); ctx.lineTo(m0[0], m0[1]); ctx.lineTo(n0[0], n0[1]);
        ctx.moveTo(t1[0], t1[1]); ctx.lineTo(m1[0], m1[1]); ctx.lineTo(n1[0], n1[1]); ctx.stroke();
        ctx.strokeStyle = "rgba(225,244,255," + (0.85 * pa) + ")";
        ctx.lineWidth = Math.max(1.4, C.k * 0.24 / b0[2]);
        ctx.beginPath(); ctx.moveTo(b0[0], b0[1]); ctx.lineTo(t0[0], t0[1]); ctx.lineTo(t1[0], t1[1]); ctx.lineTo(b1[0], b1[1]); ctx.stroke();
      }

      /* la defensa: cruces, como en la pizarra */
      DEFENSA.forEach(function (d, i) {
        var a = reduced ? 1 : ease((t - 0.9 - i * 0.08) / 0.35);
        if (a > 0) cruz(d[0], d[1], 0.95, a);
      });
      /* el ataque: anillos celestes */
      ATAQUE.forEach(function (p, i) {
        var a = reduced ? 1 : ease((t - 1.15 - i * 0.1) / 0.35);
        if (a > 0) {
          anillo(p[0], p[1], 1.25, a, "rgba(69,174,229,A)", true);
          /* el dorsal, arriba del anillo, como en la pizarra */
          var s0 = G(p[0], p[1]), fz = Math.round(clamp(C.k * 1.5 / s0[2], 11, 17));
          ctx.font = "600 " + fz + "px 'Barlow Condensed','Archivo Narrow',Arial,sans-serif";
          ctx.textAlign = "center";
          ctx.fillStyle = "rgba(200,236,255," + (0.9 * a) + ")";
          ctx.fillText(DORSAL[i], s0[0], s0[1] - C.k * 1.9 / s0[2] - 3);
        }
      });

      /* la jugada */
      var CEL = "rgba(143,217,250,0.95)";
      var tp = reduced ? 1 : easeIO((t - 1.7) / 0.7);          // pase
      var tc = reduced ? 1 : easeIO((t - 2.45) / 1.0);         // corrida
      var ta = reduced ? 1 : easeIO((t - 2.45) / 1.0);         // arrastre
      var tr = reduced ? 1 : easeIO((t - 3.5) / 0.45);         // remate
      if (ta > 0) flecha(ARRASTRE, ta, "rgba(143,217,250,0.45)", 1.6);
      if (tp > 0) trazo(recta(PASE[0][0], PASE[0][1], PASE[1][0], PASE[1][1], 24), tp, "rgba(205,236,255,0.8)", 1.4, [5, 5]);
      /* la corrida es la protagonista: lleva un halo debajo, como el
         trazo de un análisis de televisión */
      if (tc > 0) {
        ctx.globalCompositeOperation = "lighter";
        trazo(curva(CORRIDA, 40), tc, "rgba(69,174,229,0.16)", 7);
        trazo(curva(CORRIDA, 40), tc, "rgba(69,174,229,0.22)", 4);
        ctx.globalCompositeOperation = "source-over";
        flecha(CORRIDA, tc, CEL, 2.1);
      }
      if (tr > 0) trazo(recta(REMATE[0][0], REMATE[0][1], REMATE[1][0], REMATE[1][1], 16), tr, "rgba(225,244,255,0.9)", 1.4, [3, 4]);

      /* la pelota recorre la jugada */
      var bp;
      if (tr > 0) bp = bez(REMATE, tr);
      else if (tc > 0) bp = bez([[CORRIDA[0][0] + 0.6, CORRIDA[0][1] - 0.6], CORRIDA[1], [44, 37.2]], tc);
      else if (tp > 0) bp = bez(PASE, tp);
      else bp = PASE[0];
      var bvis = reduced ? 1 : ease((t - 1.35) / 0.3);
      if (bvis > 0) {
        var s = G(bp[0], bp[1]), br = Math.max(2.4, C.k * 0.34 / s[2]);
        ctx.globalCompositeOperation = "lighter";
        var gb = ctx.createRadialGradient(s[0], s[1] - br, 0, s[0], s[1] - br, br * 4);
        gb.addColorStop(0, "rgba(200,236,255," + (0.55 * bvis) + ")"); gb.addColorStop(1, "rgba(120,200,250,0)");
        ctx.fillStyle = gb; ctx.fillRect(s[0] - br * 4, s[1] - br * 5, br * 8, br * 8);
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = "rgba(245,251,255," + bvis + ")";
        ctx.beginPath(); ctx.arc(s[0], s[1] - br, br, 0, 7); ctx.fill();
      }
      /* gol: un destello en la red */
      var tg = reduced ? 1 : (t - 3.95) / 0.9;
      if (tg > 0) {
        var gp = P3(GL + 0.8, 1.0, 35.8), gr2 = C.k * 6 / gp[2];
        var fl = clamp(1 - Math.abs(tg - 0.25) * 1.6, 0.35, 1) * (reduced ? 0.6 : 1);
        ctx.globalCompositeOperation = "lighter";
        var gg = ctx.createRadialGradient(gp[0], gp[1], 0, gp[0], gp[1], gr2);
        gg.addColorStop(0, "rgba(160,225,255," + (0.35 * fl) + ")"); gg.addColorStop(1, "rgba(69,174,229,0)");
        ctx.fillStyle = gg; ctx.fillRect(gp[0] - gr2, gp[1] - gr2, gr2 * 2, gr2 * 2);
        ctx.globalCompositeOperation = "source-over";
      }

      /* foco del estadio, arriba a la derecha de la escena */
      var lz = reduced ? 1 : ease((t - 0.05) / 0.5);
      var lx = R.x1 - (R.x1 - R.x0) * 0.08, ly = R.y0 - 4, LR = (R.x1 - R.x0) * 0.55;
      ctx.globalCompositeOperation = "lighter";
      var gl = ctx.createRadialGradient(lx, ly, 0, lx, ly, LR);
      gl.addColorStop(0, "rgba(170,225,255," + (0.18 * lz) + ")"); gl.addColorStop(1, "rgba(69,174,229,0)");
      ctx.fillStyle = gl; ctx.fillRect(lx - LR, ly - LR, LR * 2, LR * 2);
      ctx.globalCompositeOperation = "source-over";

      /* bordes: la escena se funde con la franja, sin caja */
      ctx.globalCompositeOperation = "destination-out";
      var fx = R.x0, fw = Math.min(120, (R.x1 - R.x0) * 0.22);
      if (R.fade) {
        var gm = ctx.createLinearGradient(fx - fw * 0.4, 0, fx + fw, 0);
        gm.addColorStop(0, "#000"); gm.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = gm; ctx.fillRect(0, 0, fx + fw, H);
      } else {
        var gy = ctx.createLinearGradient(0, R.y0 - 6, 0, R.y0 + 36);
        gy.addColorStop(0, "#000"); gy.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = gy; ctx.fillRect(0, 0, W, R.y0 + 36);
      }
      ctx.globalCompositeOperation = "source-over";
    }

    /* ---------------- entrada ---------------- */
    var FIN = 5.2, t0 = 0, raf = 0, empezo = false;
    function frame() {
      var t = (performance.now() - t0) / 1000;
      draw(t);
      raf = t < FIN ? requestAnimationFrame(frame) : 0;
    }
    function arrancar() {
      if (empezo) return;
      empezo = true;
      if (!layout()) return;
      if (reduced) { draw(1e3); return; }
      t0 = performance.now();
      raf = requestAnimationFrame(frame);
    }
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (es) {
        if (es[0].isIntersecting) { io.disconnect(); arrancar(); }
      }, { threshold: 0.35 });
      io.observe(band);
    } else arrancar();

    var to = 0, lw0 = 0;
    window.addEventListener("resize", function () {
      clearTimeout(to);
      to = setTimeout(function () {
        if (!empezo || window.innerWidth === lw0) return;
        lw0 = window.innerWidth;
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
        if (layout()) draw(1e3);
      }, 160);
    });
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { if (empezo && !raf && layout()) draw(1e3); });
    }
    return true;
  };
})();
