(function () {
  "use strict";
  /* ===========================================================
     ESTADIO — las canchas de noche detrás del hero
     Iñaki Etchegaray · M-DATOS

     El pedido: que desde que se abre la web se lea DEPORTE. Sin
     fotos de stock y sin íconos sueltos: una cancha de noche, vista
     desde el campo hacia el arco, a la derecha de Iñaki.

     Y no una sola: la cancha va cambiando de deporte —fútbol, rugby,
     hockey y golf— porque el método es el mismo en cualquier
     disciplina. Arranca con fútbol: Iñaki pidió que el rugby, que es
     de donde viene él, no se lleve todo el peso. (El
     tenis se probó: con esta cámara baja la cancha queda chata y
     escondida detrás de Iñaki, y no se lee.)

     Las canchas no se dibujan a ojo: hay una cámara real (altura,
     inclinación, giro, distancia focal) y cada línea es una medida
     del reglamento proyectada. Todas comparten la cámara y el punto
     de apoyo —el centro del arco o el hoyo cae siempre
     en el mismo lugar—, así que el cambio se lee como la misma toma
     con otra cancha. Todo se escala con la figura de Iñaki: en un
     teléfono es la misma escena, más chica.

     Cada cancha entra trazando sus líneas desde el arco hacia afuera
     y levantando su estructura; después de unos segundos se recoge y
     entra la siguiente. Entre cambio y cambio el lienzo no repinta, y
     si el hero sale de pantalla, el reloj se detiene.
     =========================================================== */

  /* ---------------- las canchas ----------------
     Coordenadas en metros con el origen en el centro del arco (o en
     el hoyo). X crece hacia la cámara, a lo largo de la
     cancha; Z va a lo ancho. 'esc' acerca la toma en las canchas
     chicas para que su estructura pese lo mismo que la H. */
  function recta(x0, z0, x1, z1, n) {
    var a = []; n = n || 24;
    for (var i = 0; i <= n; i++) a.push([x0 + (x1 - x0) * i / n, z0 + (z1 - z0) * i / n]);
    return a;
  }
  function arco(cx, cz, r, a0, a1, n) {
    var a = []; n = n || 32;
    for (var i = 0; i <= n; i++) { var t = a0 + (a1 - a0) * i / n; a.push([cx + r * Math.cos(t), cz + r * Math.sin(t)]); }
    return a;
  }
  function L(pts, d, raya) { return { p: pts, d: d, raya: raya }; }
  /* un rectángulo abierto contra la línea de fondo, desde el centro */
  function caja(prof, medio, d) {
    return [L([[0, -medio], [prof, -medio], [prof, 0]], d), L([[0, medio], [prof, medio], [prof, 0]], d)];
  }

  var PI = Math.PI;
  var a9 = Math.acos(5.5 / 9.15);
  var DEPORTES = [
    { id: "fútbol", esc: 1.25,
      lineas: [
        L(recta(0, 0, 0, -34), 0), L(recta(0, 0, 0, 34), 0),                       // fondo
        L(recta(0, -34, 60, -34, 40), 0.2), L(recta(0, 34, 60, 34, 40), 0.2),      // laterales
        L(arco(0, -34, 1, 0, PI / 2, 6), 0.2), L(arco(0, 34, 1, -PI / 2, 0, 6), 0.2)
      ].concat(caja(5.5, 9.16, 0.06), caja(16.5, 20.16, 0.12), [
        L(arco(11, 0, 9.15, -a9, a9, 20), 0.22),                                   // medialuna
        L(recta(52.5, -34, 52.5, 34), 0.4),                                        // mitad
        L(arco(52.5, 0, 9.15, 0, 2 * PI, 48), 0.46)
      ]),
      puntos: [[11, 0]] },
    { id: "rugby", esc: 1,
      lineas: [
        L(recta(0, 0, 0, -35), 0), L(recta(0, 0, 0, 35), 0),                       // try
        L(recta(-8, 0, -8, -35), 0.1), L(recta(-8, 0, -8, 35), 0.1),               // pelota muerta
        L(recta(-8, -35, 108, -35, 48), 0.18), L(recta(-8, 35, 108, 35, 48), 0.18),// laterales
        L(recta(5, -35, 5, 35), 0.26, [1.2, 6]),                                   // 5 m
        L(recta(22, -35, 22, 35), 0.34),                                           // 22
        L(recta(40, -35, 40, 35), 0.42, [2, 3]),                                   // 10 m
        L(recta(50, -35, 50, 35), 0.48)                                            // mitad
      ] },
    { id: "hockey", esc: 1.45,
      lineas: [
        L(recta(0, 0, 0, -27.45), 0), L(recta(0, 0, 0, 27.45), 0),                 // fondo
        L(recta(0, -27.45, 50, -27.45, 40), 0.18), L(recta(0, 27.45, 50, 27.45, 40), 0.18),
        L(arco(0, -1.83, 14.63, -PI / 2, 0, 24).concat([[14.63, 0]]), 0.08),      // el área
        L(arco(0, 1.83, 14.63, PI / 2, 0, 24).concat([[14.63, 0]]), 0.08),
        L(arco(0, -1.83, 19.63, -PI / 2, 0, 30).concat([[19.63, 1.83]], arco(0, 1.83, 19.63, 0, PI / 2, 30)), 0.18, [0.3, 2.7]),
        L(recta(22.9, -27.45, 22.9, 27.45), 0.3),                                  // 23 m
        L(recta(45.7, -27.45, 45.7, 27.45), 0.42)                                  // mitad
      ],
      puntos: [[6.475, 0]] },
    { id: "golf", esc: 2.0,
      lineas: (function () {
        /* el green: un contorno irregular */
        function borde(r0, cx, cz, n) {
          var a = [];
          for (var i = 0; i <= n; i++) {
            var t = i / n * 2 * PI;
            var r = r0 + 1.6 * Math.sin(2 * t + 0.6) + 0.9 * Math.cos(3 * t - 0.4);
            a.push([cx + r * Math.cos(t) * 1.15, cz + r * Math.sin(t)]);
          }
          return a;
        }
        var g = borde(9, 2.5, 0.5, 72);
        /* el búnker, a la derecha del green */
        var b = [];
        for (var i = 0; i <= 40; i++) {
          var t = i / 40 * 2 * PI;
          b.push([-3 + 2.4 * Math.cos(t) + 0.5 * Math.cos(2 * t), 13 + 3.4 * Math.sin(t) - 0.6 * Math.sin(2 * t)]);
        }
        return [L(g, 0), L(b, 0.3)];
      })(),
      hoyo: true }
  ];

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function ease(t) { t = clamp(t, 0, 1); return 1 - Math.pow(1 - t, 3); }
  function easeIn(t) { t = clamp(t, 0, 1); return t * t * t; }

  /* Tiempos de cada cancha, en segundos: entra, se queda, se va. */
  var ENTRA = 1.6, QUEDA = 4.6, SALE = 0.8, CICLO = ENTRA + QUEDA + SALE;

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
    var E = 1;           // escala de la cancha que se está dibujando

    /* Posición del recorte sin transformaciones: la entrada lo mueve
       (translateY + scale) y el parallax también, y la cancha tiene
       que calzar con donde la figura TERMINA, no donde está ahora. */
    function cajaDe(el) {
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
    /* Proyecta un punto de la cancha actual (en sus metros). */
    function P3(X, Y, Z) {
      var c = cam(X * E, Y * E, Z * E);
      return [ox + f * c[0] / c[2], cy0 - f * c[1] / c[2], c[2]];
    }

    function layout() {
      var r = hero.getBoundingClientRect();
      W = Math.round(r.width); H = Math.round(r.height);
      if (!W || !H) return false;
      small = window.innerWidth <= 980;
      DPR = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);

      /* Todo se mide contra la figura: la estructura va a su derecha,
         la línea de fondo a la altura de la cintura, y la distancia
         focal sale de su alto. */
      var c = cajaDe(cut);
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
      /* La cámara se ubica de modo que el centro del arco caiga justo
         en (spotX, spotY): distancia resuelta en cerrado. */
      var k = (cy0 - spotY) / f;
      var D = camH * (k * sP + cP) / (sP - k * cP);
      camX = -D * sY; camZ = -D * cYw;

      S.spotX = spotX; S.spotY = spotY;
      /* La columna del texto queda limpia: en escritorio se apaga a
         la izquierda; apilado, todo lo que queda arriba de la foto. */
      var copyR = Math.max(borde(".hero-title", "r") || 0, borde(".hero-sub", "r") || 0,
                           borde(".hero-actions", "r") || 0);
      S.copyR = copyR || W * 0.5;
      S.actsB = borde(".hero-actions", "b") || c.t;
      return true;
    }

    /* ---------------- trazos ---------------- */
    var LC = "rgba(205,236,255,";
    function linea(pts, prog, a) {
      var n = pts.length - 1, upto = prog * n;
      ctx.strokeStyle = LC + a + ")";
      for (var i = 1; i <= n && i - 1 < upto; i++) {
        var p = P3(pts[i - 1][0], 0, pts[i - 1][1]), q = P3(pts[i][0], 0, pts[i][1]);
        if (p[2] <= 0.5 || q[2] <= 0.5) continue;
        var fr = Math.min(1, upto - (i - 1));
        ctx.lineWidth = Math.max(0.75, f * 0.12 * 1.6 * E / ((p[2] + q[2]) / 2));
        ctx.beginPath(); ctx.moveTo(p[0], p[1]);
        ctx.lineTo(p[0] + (q[0] - p[0]) * fr, p[1] + (q[1] - p[1]) * fr); ctx.stroke();
      }
    }
    /* Una línea punteada: se reparte en tramos por largo real. */
    function punteada(pts, prog, a, raya) {
      var acc = [0];
      for (var i = 1; i < pts.length; i++) acc.push(acc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      var tot = acc[acc.length - 1] * prog, j = 1;
      function en(s) {
        while (j < acc.length - 1 && acc[j] < s) j++;
        while (j > 1 && acc[j - 1] > s) j--;
        var u = (s - acc[j - 1]) / ((acc[j] - acc[j - 1]) || 1);
        return [pts[j - 1][0] + (pts[j][0] - pts[j - 1][0]) * u, pts[j - 1][1] + (pts[j][1] - pts[j - 1][1]) * u];
      }
      for (var s = 0; s < tot; s += raya[0] + raya[1]) {
        var e = Math.min(tot, s + raya[0]);
        linea([en(s), en((s + e) / 2), en(e)], 1, a);
      }
    }
    function cuad(pts) {
      ctx.beginPath();
      var first = true;
      for (var i = 0; i < pts.length; i++) {
        var s = P3(pts[i][0], pts[i][2] || 0, pts[i][1]);
        if (s[2] <= 0.5) continue;
        if (first) { ctx.moveTo(s[0], s[1]); first = false; } else ctx.lineTo(s[0], s[1]);
      }
      ctx.closePath();
    }
    function palo(x0, y0, z0, x1, y1, z1, a, mul) {
      var p = P3(x0, y0, z0), q = P3(x1, y1, z1);
      ctx.strokeStyle = "rgba(214,240,255," + a + ")";
      ctx.lineWidth = Math.max(small ? 1.5 : 1.1, f * 0.17 * 1.6 * (mul || 1) * E / ((p[2] + q[2]) / 2));
      ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
    }
    function malla(c0, c1, c2, c3, nu, nv, a) {
      /* una red: grilla entre cuatro esquinas (en metros) */
      ctx.strokeStyle = "rgba(205,236,255," + a + ")"; ctx.lineWidth = 0.7;
      function lerp(p, q, t) { return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t]; }
      ctx.beginPath();
      for (var i = 0; i <= nu; i++) {
        var a0 = lerp(c0, c1, i / nu), b0 = lerp(c3, c2, i / nu);
        var p = P3(a0[0], a0[1], a0[2]), q = P3(b0[0], b0[1], b0[2]);
        ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]);
      }
      for (var j = 0; j <= nv; j++) {
        var a1 = lerp(c0, c3, j / nv), b1 = lerp(c1, c2, j / nv);
        var p2 = P3(a1[0], a1[1], a1[2]), q2 = P3(b1[0], b1[1], b1[2]);
        ctx.moveTo(p2[0], p2[1]); ctx.lineTo(q2[0], q2[1]);
      }
      ctx.stroke();
    }

    /* ---------------- las estructuras ----------------
       pr: cuánto se levantó (0..1). a: intensidad. */
    var ESTRUCTURA = {
      rugby: function (pr, a) {
        var top = 15 * pr, hw = 2.8;
        [-hw, hw].forEach(function (z) {
          var q0 = P3(-0.55, 0, z), q1 = P3(0.55, 0, z), q2 = P3(0.55, Math.min(top, 1.9), z), q3 = P3(-0.55, Math.min(top, 1.9), z);
          ctx.fillStyle = "rgba(69,174,229," + (0.6 * a) + ")";
          ctx.beginPath(); ctx.moveTo(q0[0], q0[1]); ctx.lineTo(q1[0], q1[1]);
          ctx.lineTo(q2[0], q2[1]); ctx.lineTo(q3[0], q3[1]); ctx.closePath(); ctx.fill();
          palo(0, 0, z, 0, top, z, 0.8 * a);
        });
        if (top > 3) palo(0, 3, -hw, 0, 3, hw, 0.75 * a);
      },
      "fútbol": function (pr, a) {
        var h = 2.44 * pr, w = 3.66;
        malla([0, h, -w], [0, h, w], [-1.2, h * 0.92, w], [-1.2, h * 0.92, -w], 12, 2, 0.22 * a);
        malla([-1.2, h * 0.92, -w], [-1.2, h * 0.92, w], [-2, 0, w], [-2, 0, -w], 12, 4, 0.22 * a);
        malla([0, h, -w], [-1.2, h * 0.92, -w], [-2, 0, -w], [0, 0, -w], 2, 4, 0.18 * a);
        malla([0, h, w], [-1.2, h * 0.92, w], [-2, 0, w], [0, 0, w], 2, 4, 0.18 * a);
        palo(0, 0, -w, 0, h, -w, 0.85 * a); palo(0, 0, w, 0, h, w, 0.85 * a);
        palo(0, h, -w, 0, h, w, 0.85 * a);
      },
      hockey: function (pr, a) {
        var h = 2.14 * pr, w = 1.83, d = 1.2;
        malla([0, h, -w], [0, h, w], [-d, h, w], [-d, h, -w], 8, 2, 0.2 * a);
        malla([-d, h, -w], [-d, h, w], [-d, 0, w], [-d, 0, -w], 8, 4, 0.2 * a);
        /* tablas de fondo y de los costados, en celeste */
        var tb = Math.min(h, 0.46);
        cuad([[-d, -w, 0], [-d, w, 0], [-d, w, tb], [-d, -w, tb]]);
        ctx.fillStyle = "rgba(69,174,229," + (0.45 * a) + ")"; ctx.fill();
        palo(0, 0, -w, 0, h, -w, 0.85 * a); palo(0, 0, w, 0, h, w, 0.85 * a);
        palo(0, h, -w, 0, h, w, 0.85 * a);
      },
      golf: function (pr, a) {
        /* el hoyo y la bandera */
        var c = P3(0, 0, 0), rr = f * 0.25 * E / c[2];
        ctx.save(); ctx.translate(c[0], c[1]); ctx.scale(1, 0.3);
        ctx.fillStyle = "rgba(1,10,24," + (0.85 * a) + ")";
        ctx.beginPath(); ctx.arc(0, 0, rr, 0, 7); ctx.fill();
        ctx.strokeStyle = "rgba(205,236,255," + (0.6 * a) + ")"; ctx.lineWidth = 1; ctx.stroke();
        ctx.restore();
        var h = 2.4 * pr;
        palo(0, 0, 0, 0, h, 0, 0.85 * a, 0.6);
        if (pr > 0.6) {
          var fa = (pr - 0.6) / 0.4;
          cuad([[0, 0, h], [-0.1, 1.15 * fa, h - 0.36], [0, 0, h - 0.72]]);
          ctx.fillStyle = "rgba(69,174,229," + (0.85 * a) + ")"; ctx.fill();
        }
      }
    };

    /* ---------------- la escena ---------------- */
    function cancha(dep, pl, ps, a) {
      E = dep.esc;
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      for (var i = 0; i < dep.lineas.length; i++) {
        var l = dep.lineas[i], p = typeof pl === "function" ? pl(l.d) : pl;
        if (p <= 0) continue;
        /* los tramos de una línea continua van a tope: con punta
           redonda se pisan en cada unión y la línea se ve punteada */
        ctx.lineCap = l.raya ? "round" : "butt";
        if (l.raya) punteada(l.p, p, 0.4 * a, l.raya); else linea(l.p, p, 0.42 * a);
      }
      (dep.puntos || []).forEach(function (q) {
        var s = P3(q[0], 0, q[1]);
        ctx.fillStyle = LC + (0.5 * a * (typeof pl === "function" ? pl(0.3) : pl)) + ")";
        ctx.beginPath(); ctx.arc(s[0], s[1], Math.max(1, f * 0.12 * E / s[2]), 0, 7); ctx.fill();
      });
      ctx.lineCap = "round";
      if (ps > 0) ESTRUCTURA[dep.id](ps, a);
    }

    function pasto(luz) {
      E = 1;
      var base = P3(0, 0, 0);
      ctx.save();
      /* el contorno se muestrea para que la perspectiva lo curve bien */
      ctx.beginPath();
      var pts = recta(-12, -40, 110, -40, 12).concat(recta(110, -40, 110, 40, 12), recta(110, 40, -12, 40, 12), recta(-12, 40, -12, -40, 12));
      var first = true;
      pts.forEach(function (q) { var s = P3(q[0], 0, q[1]); if (s[2] <= 0.5) return; if (first) { ctx.moveTo(s[0], s[1]); first = false; } else ctx.lineTo(s[0], s[1]); });
      ctx.closePath();
      var g = ctx.createRadialGradient(base[0], base[1], 0, base[0], base[1], S.cutH * 1.4);
      g.addColorStop(0, "rgba(110,195,240," + (0.17 * luz) + ")");
      g.addColorStop(1, "rgba(90,180,235," + (0.035 * luz) + ")");
      ctx.fillStyle = g; ctx.fill();
      ctx.clip();
      /* franjas de corte, paralelas a la línea de fondo */
      for (var x = -12, k = 0; x < 110; x += 5, k++) {
        if (k % 2) continue;
        ctx.beginPath(); first = true;
        recta(x, -40, x + 5, -40, 2).concat(recta(x + 5, 40, x, 40, 2)).forEach(function (q) {
          var s = P3(q[0], 0, q[1]); if (s[2] <= 0.5) return;
          if (first) { ctx.moveTo(s[0], s[1]); first = false; } else ctx.lineTo(s[0], s[1]);
        });
        ctx.closePath();
        ctx.fillStyle = "rgba(150,215,250," + (0.05 * luz) + ")"; ctx.fill();
      }
      ctx.restore();
    }

    function limpiarTexto() {
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

    /* El estado en el instante t (segundos de reloj propio). */
    function draw(t) {
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.clearRect(0, 0, W, H);
      var luz = reduced ? 1 : ease(t / 0.6);
      if (luz <= 0) return;
      pasto(luz);
      if (reduced) { cancha(DEPORTES[0], 1, 1, 1); limpiarTexto(); rotulo(DEPORTES[0].id, 1); return; }

      var n = Math.floor(t / CICLO), u = t - n * CICLO;
      var dep = DEPORTES[n % DEPORTES.length];
      var sale = u - ENTRA - QUEDA;           // > 0 mientras se recoge
      var pl = function (d) {
        var pin = ease((u - 0.35 - d * 1.6) / 0.85);
        var pout = sale > 0 ? 1 - easeIn((sale - (0.5 - d) * 0.5) / 0.5) : 1;
        return Math.min(pin, pout);
      };
      var ps = ease((u - 0.75) / 0.7);
      if (sale > 0) ps = Math.min(ps, 1 - easeIn(sale / 0.45));
      cancha(dep, pl, ps, luz);
      limpiarTexto();
      rotulo(dep.id, ps * luz);
    }

    /* El nombre del deporte, chico y espaciado como los copetes, al
       pie de la estructura: dice que el cambio es a propósito. */
    function rotulo(txt, a) {
      if (a <= 0.01) return;
      E = 1;
      var x = S.spotX, y = Math.min(S.spotY + S.cutH * 0.072, H - 14);
      var fz = Math.round(clamp(S.cutH * 0.019, 10, 12.5));
      ctx.font = "600 " + fz + "px 'Barlow Condensed','Archivo Narrow',Arial,sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      if ("letterSpacing" in ctx) ctx.letterSpacing = (fz * 0.32).toFixed(1) + "px";
      ctx.fillStyle = "rgba(143,217,250," + (0.85 * a) + ")";
      ctx.fillText(txt.toUpperCase(), x, y);
      if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
    }

    /* ---------------- el reloj ----------------
       Corre sólo mientras el hero se ve y la pestaña está activa. */
    var t0 = 0, acum = 0, corre = false, raf = 0, listo = false, visible = true, ultimo = -1;
    function ahora() { return acum + (corre ? (performance.now() - t0) / 1000 : 0); }
    function frame() {
      raf = 0;
      if (!corre) return;
      var t = ahora();
      /* mientras una cancha está quieta no hace falta repintar */
      var n = Math.floor(t / CICLO), u = t - n * CICLO;
      var quieta = u > ENTRA && u < ENTRA + QUEDA && t > 1;
      var clave = quieta ? n : -2;
      if (!(quieta && clave === ultimo)) draw(t);
      ultimo = clave;
      raf = requestAnimationFrame(frame);
    }
    function play() {
      if (corre || reduced || !listo || !visible || document.hidden) return;
      corre = true; t0 = performance.now(); ultimo = -1;
      if (!raf) raf = requestAnimationFrame(frame);
    }
    function pause() {
      if (!corre) return;
      acum = ahora(); corre = false;
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
    }
    function arrancar() {
      if (listo) return;
      listo = true;
      if (!layout()) return;
      if (reduced) { draw(1e3); return; }
      play();
    }

    if (root.classList.contains("is-ready")) arrancar();
    else {
      var mo = new MutationObserver(function () {
        if (root.classList.contains("is-ready")) { mo.disconnect(); arrancar(); }
      });
      mo.observe(root, { attributes: true, attributeFilter: ["class"] });
    }
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (es) {
        visible = es[0].isIntersecting;
        if (visible) play(); else pause();
      }).observe(hero);
    }
    document.addEventListener("visibilitychange", function () { if (document.hidden) pause(); else play(); });

    /* Al cambiar de tamaño se vuelve a medir. Sólo si cambia el ancho
       o el alto del hero: en celular la barra del navegador mueve el
       viewport sin cambiar nada. */
    var to = 0, lastW = 0, lastH = 0;
    window.addEventListener("resize", function () {
      clearTimeout(to);
      to = setTimeout(function () {
        if (!listo) return;
        var r = hero.getBoundingClientRect();
        if (Math.round(r.width) === lastW && Math.round(r.height) === lastH) return;
        lastW = Math.round(r.width); lastH = Math.round(r.height);
        if (layout()) { ultimo = -1; draw(reduced ? 1e3 : ahora()); }
      }, 160);
    });
    if (document.fonts && document.fonts.ready) {
      /* el titular define el borde de la columna del texto */
      document.fonts.ready.then(function () { if (listo && layout()) { ultimo = -1; draw(reduced ? 1e3 : ahora()); } });
    }
    return true;
  };
})();
