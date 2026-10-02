(function () {
  "use strict";
  /* ===========================================================
     CIMA — la curva
     Iñaki Etchegaray · M-DATOS

     Una sola imagen: un gráfico de rendimiento que se traza solo y
     cuya silueta ES la montaña. Dos lecturas en la misma forma.

     El relato está en la curva, no en la cantidad de elementos: sube,
     recae, remonta más alto, vuelve a recaer, y llega a la cumbre. Es
     literalmente lo que dice el sitio más abajo —"el camino no fue
     lineal"—. Cada marcador se posa en una caída remontada.

     Canvas 2D a propósito. Acá no hay nada que una GPU resuelva mejor
     que un buen path, y sin WebGL no hay cadena de repliegue que
     mantener ni equipo que quede afuera. La sofisticación está en la
     matemática: interpolación Catmull-Rom, micro-volatilidad por
     ruido fractal, trazo de ancho variable resuelto como cinta de un
     solo relleno, y lectura del gráfico bajo el cursor.
     =========================================================== */

  /* Puntos de control del relato. Y en 0..1, donde 1 es la cumbre. */
  /* La serie, punto por punto. No hay interpolación ni paseo
     aleatorio: un gráfico de líneas va de dato a dato con una recta,
     y cualquier suavizado devuelve las lomas. El dentado sigue el
     patrón del isotipo —filos rectos, cada cumbre más alta que la
     anterior, retrocesos parciales— y termina arriba. */
  var DATA = [
    [0.000, 0.05], [0.030, 0.15], [0.055, 0.11], [0.090, 0.24], [0.120, 0.17],
    [0.150, 0.31], [0.185, 0.24], [0.215, 0.40], [0.250, 0.31], [0.285, 0.47],
    [0.310, 0.40], [0.345, 0.56], [0.380, 0.44], [0.410, 0.59], [0.445, 0.50],
    [0.480, 0.68], [0.510, 0.59], [0.545, 0.76], [0.575, 0.64], [0.610, 0.81],
    [0.645, 0.71], [0.675, 0.89], [0.710, 0.76], [0.745, 0.94], [0.775, 0.82],
    [0.805, 1.00], [0.840, 0.85], [0.870, 0.96], [0.905, 0.87], [0.940, 0.97],
    [0.975, 0.89], [1.000, 0.95]
  ];

  function sstep(a, b, x) {
    var t = (x - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t;
    return t * t * (3 - 2 * t);
  }

  window.HERO_mount = function (canvas) {
    if (!canvas) return false;
    var hero = canvas.closest(".hero") || canvas.parentNode;
    if (!hero) return false;
    var ctx = canvas.getContext("2d");
    if (!ctx) return false;

    var reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    var fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
    var small = window.innerWidth < 760;

    /* ---------------- la serie ---------------- */
    var N = DATA.length;
    var SX = new Float32Array(N), SY = new Float32Array(N);
    for (var i = 0; i < N; i++) { SX[i] = DATA[i][0]; SY[i] = DATA[i][1]; }

    var TOP = 0;
    for (var ti = 1; ti < N; ti++) if (SY[ti] > SY[TOP]) TOP = ti;

    /* Marcadores en los extremos más destacados —picos y retrocesos—
       medidos por prominencia: cuánto se despega cada punto de sus
       vecinos. Con un dentado parejo, marcarlos todos sería ruido. */
    var MARKS = (function () {
      var cand = [];
      for (var i = 1; i < N - 1; i++) {
        var up = SY[i] > SY[i - 1] && SY[i] > SY[i + 1];
        var dn = SY[i] < SY[i - 1] && SY[i] < SY[i + 1];
        if (!up && !dn) continue;
        if (i === TOP) continue;
        cand.push([i, Math.abs(SY[i] - (SY[i - 1] + SY[i + 1]) / 2)]);
      }
      cand.sort(function (a, b) { return b[1] - a[1]; });
      var out = [];
      for (var c = 0; c < cand.length && out.length < 9; c++) {
        var idx = cand[c][0], ok = true;
        for (var o = 0; o < out.length; o++) if (Math.abs(out[o] - idx) < 3) ok = false;
        if (ok) out.push(idx);
      }
      return out.sort(function (a, b) { return a - b; });
    })();

    /* ---------------- lienzo ---------------- */
    var W = 0, H = 0, DPR = 1, BX = 0, BY = 0, BW = 0, BH = 0;
    var gFill = null, gLine = null;
    function layout() {
      var r = hero.getBoundingClientRect();
      W = Math.max(320, Math.round(r.width));
      H = Math.max(320, Math.round(r.height));
      DPR = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(W * DPR);
      canvas.height = Math.round(H * DPR);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

      /* El gráfico vive donde no hay texto y se sale por la derecha */
      if (small) { BX = -0.04 * W; BW = 1.08 * W; BY = 0.5 * H; BH = 0.34 * H; }
      else { BX = 0.34 * W; BW = 0.68 * W; BY = 0.26 * H; BH = 0.5 * H; }

      gFill = ctx.createLinearGradient(0, BY, 0, BY + BH);
      gFill.addColorStop(0, "rgba(69,174,229,.38)");
      gFill.addColorStop(0.55, "rgba(69,174,229,.18)");
      gFill.addColorStop(1, "rgba(69,174,229,.02)");
      gLine = ctx.createLinearGradient(BX, 0, BX + BW, 0);
      gLine.addColorStop(0, "rgba(26,98,201,.55)");
      gLine.addColorStop(0.5, "#2E86D4");
      gLine.addColorStop(1, "#45AEE5");
    }

    function px(i) { return BX + SX[i] * BW; }
    function py(i) { return BY + BH - SY[i] * BH; }

    /* ---------------- interacción ---------------- */
    var mxT = -1, myT = 0, mx = -1, my = 0, hov = 0, hovT = 0;
    if (fine) {
      hero.addEventListener("pointermove", function (e) {
        var r = hero.getBoundingClientRect();
        mxT = e.clientX - r.left; myT = e.clientY - r.top; hovT = 1;
      });
      hero.addEventListener("pointerleave", function () { hovT = 0; });
    }

    var prog = 0, progT = 0, energy = 0;

    function draw(t, dt) {
      /* Avance: marcha propia al entrar, y el scroll la empuja */
      var sc = Math.min(1, (window.scrollY || 0) / Math.max(1, window.innerHeight * 0.9));
      progT = Math.min(1, t / 2.6 + sc * 0.5);
      prog += (progT - prog) * Math.min(1, dt * 3.2);
      energy += (sc - energy) * Math.min(1, dt * 2);
      hov += (hovT - hov) * Math.min(1, dt * 5);
      if (mx < 0) { mx = mxT; my = myT; }
      else { mx += (mxT - mx) * Math.min(1, dt * 7); my += (myT - my) * Math.min(1, dt * 7); }

      ctx.clearRect(0, 0, W, H);
      /* Paralaje mínima: el conjunto respira con el puntero */
      var ox = fine && hovT ? (mx / W - 0.5) * -10 : 0;
      var oy = fine && hovT ? (my / H - 0.5) * -6 : 0;
      ctx.save();
      ctx.translate(ox, oy);

      var base = BY + BH;
      var cut = BX + BW * prog;

      /* --- retícula y eje: la medida --- */
      var gridA = 0.05 + 0.03 * energy;
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(3,29,64," + gridA.toFixed(3) + ")";
      for (var g = 1; g <= 4; g++) {
        var gy = BY + BH * (g / 5);
        ctx.beginPath(); ctx.moveTo(BX, gy); ctx.lineTo(BX + BW, gy); ctx.stroke();
      }
      ctx.strokeStyle = "rgba(3,29,64,.16)";
      ctx.beginPath(); ctx.moveTo(BX, base); ctx.lineTo(BX + BW, base); ctx.stroke();

      /* --- la recta de lo esperado: la curva la cruza y la deja atrás --- */
      ctx.save();
      ctx.setLineDash([3, 6]);
      ctx.strokeStyle = "rgba(3,29,64,.2)";
      ctx.beginPath();
      ctx.moveTo(px(0), py(0));
      ctx.lineTo(px(N - 1), py(N - 1));
      ctx.stroke();
      ctx.restore();

      /* Todo lo trazado se revela de izquierda a derecha */
      ctx.save();
      ctx.beginPath();
      ctx.rect(BX - 2, BY - BH * 0.3, Math.max(0, cut - BX + 2), BH * 1.6);
      ctx.clip();

      /* --- área bajo la curva: el macizo --- */
      ctx.beginPath();
      ctx.moveTo(px(0), base);
      for (var i = 0; i < N; i++) ctx.lineTo(px(i), py(i));
      ctx.lineTo(px(N - 1), base);
      ctx.closePath();
      ctx.fillStyle = gFill;
      ctx.globalAlpha = 0.72 + 0.28 * energy;
      ctx.fill();
      ctx.globalAlpha = 1;

      /* --- el trazo ---
         Ancho constante y uniones en punta. La cinta de ancho
         variable que había antes desplazaba cada borde según la
         pendiente, y eso redondeaba justo las esquinas que tienen
         que verse. */
      ctx.beginPath();
      ctx.moveTo(px(0), py(0));
      for (var j = 1; j < N; j++) ctx.lineTo(px(j), py(j));
      ctx.strokeStyle = gLine;
      ctx.lineWidth = 2.4;
      ctx.lineJoin = "miter";
      ctx.miterLimit = 6;
      ctx.lineCap = "butt";
      ctx.stroke();
      ctx.restore();

      /* --- marcadores: cada caída remontada --- */
      for (var k = 0; k < MARKS.length; k++) {
        var mi = MARKS[k];
        var a = sstep(0, 0.04, prog - SX[mi]);
        if (a <= 0) continue;
        ctx.globalAlpha = a;
        ctx.beginPath();
        ctx.arc(px(mi), py(mi), 3.6, 0, 6.2832);
        ctx.fillStyle = "#fff"; ctx.fill();
        ctx.lineWidth = 1.8; ctx.strokeStyle = "rgba(46,134,212,.85)"; ctx.stroke();
        ctx.globalAlpha = 1;
      }

      /* --- la cumbre --- */
      var ta = sstep(0, 0.05, prog - SX[TOP]);
      if (ta > 0) {
        var tx = px(TOP), ty = py(TOP);
        var pulse = 1 + Math.sin(t * 1.5) * 0.12;
        ctx.globalAlpha = ta * 0.3;
        ctx.beginPath(); ctx.arc(tx, ty, 13 * pulse, 0, 6.2832);
        ctx.strokeStyle = "#45AEE5"; ctx.lineWidth = 1.4; ctx.stroke();
        ctx.globalAlpha = ta;
        ctx.beginPath(); ctx.arc(tx, ty, 5.6, 0, 6.2832);
        ctx.fillStyle = "#fff"; ctx.fill();
        ctx.lineWidth = 2.6; ctx.strokeStyle = "#45AEE5"; ctx.stroke();
        ctx.globalAlpha = 1;
      }

      /* --- la cabeza del trazo mientras avanza --- */
      if (prog < 0.999) {
        var hi = Math.max(0, Math.min(N - 1, Math.round(prog * (N - 1))));
        var hx = px(hi), hy = py(hi);
        var rg = ctx.createRadialGradient(hx, hy, 0, hx, hy, 26);
        rg.addColorStop(0, "rgba(69,174,229,.5)");
        rg.addColorStop(1, "rgba(69,174,229,0)");
        ctx.fillStyle = rg;
        ctx.beginPath(); ctx.arc(hx, hy, 26, 0, 6.2832); ctx.fill();
        ctx.beginPath(); ctx.arc(hx, hy, 3.4, 0, 6.2832);
        ctx.fillStyle = "#fff"; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = "#45AEE5"; ctx.stroke();
      }

      /* --- lectura bajo el cursor: es un gráfico, se inspecciona --- */
      if (hov > 0.01 && prog > 0.2) {
        var u = (mx - ox - BX) / BW;
        if (u > 0 && u < prog) {
          var ci = Math.max(0, Math.min(N - 1, Math.round(u * (N - 1))));
          var cx = px(ci), cy = py(ci);
          ctx.globalAlpha = hov * 0.55;
          ctx.save();
          ctx.setLineDash([2, 5]);
          ctx.strokeStyle = "rgba(3,29,64,.45)";
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(cx, base); ctx.lineTo(cx, cy); ctx.stroke();
          ctx.restore();
          ctx.globalAlpha = hov;
          ctx.beginPath(); ctx.arc(cx, cy, 4.6, 0, 6.2832);
          ctx.fillStyle = "#031D40"; ctx.fill();
          ctx.beginPath(); ctx.arc(cx, cy, 9, 0, 6.2832);
          ctx.strokeStyle = "rgba(69,174,229,.7)"; ctx.lineWidth = 1.4; ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }

      ctx.restore();
    }

    layout();
    if (reduced) { prog = 1; draw(0, 0.016); return true; }

    var running = true, raf = 0;
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (es) { running = es[0].isIntersecting; },
        { threshold: 0 }).observe(hero);
    }
    var t0 = performance.now(), prev = t0;
    (function loop(now) {
      raf = requestAnimationFrame(loop);
      var raw = (now - prev) / 1000;
      prev = now;
      if (running) draw((now - t0) / 1000, Math.min(0.05, raw));
    })(t0);

    var to;
    window.addEventListener("resize", function () {
      clearTimeout(to);
      to = setTimeout(function () {
        small = window.innerWidth < 760;
        layout();
      }, 180);
    }, { passive: true });

    return true;
  };
})();
