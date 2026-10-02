(function () {
  "use strict";
  /* ===========================================================
     CIMA — de muchas a una
     Iñaki Etchegaray · M-DATOS

     Canvas 2D. Un enjambre de partículas va completando, paso a paso y
     de abajo hacia arriba, la silueta de la montaña del logo. Al
     llegar arriba no queda una nube de puntos: queda la forma llena,
     como una sombra celeste traslúcida.

     La clave está en separar las dos cosas. Las partículas son el
     MECANISMO: pocas, sueltas, visibles sólo mientras viajan. La masa
     es una SILUETA REAL —el trazado del isotipo rasterizado y
     rellenado— que se revela de abajo hacia arriba. Resolverlo todo
     con densidad de partículas era lo que daba ese aspecto de nieve.
     =========================================================== */

  /* El isotipo de la marca. De acá sale la silueta final. */
  var LOGO = "M125 0 L144 12 L156 4 L199 35 L243 8 L278 58 L290 43 L335 107 L273 59 L238 26 L236 26 L231 35 L225 66 L222 70 L202 74 L199 77 L199 88 L196 93 L171 100 L153 108 L185 63 L195 46 L153 21 L134 12 L127 11 L121 16 L117 26 L107 36 L90 72 L71 73 L68 76 L62 96 L61 105 L0 109 L29 76 L42 78 L46 74 L89 16 L109 23 L124 1 Z";
  var LOGO_W = 336, LOGO_H = 110;

  /* Resolución interna de la máscara. Los objetivos se guardan
     normalizados, así un cambio de tamaño no los invalida. */
  var MW0 = 560, MH0 = 260, RIDGE_H = Math.round(MW0 * LOGO_H / LOGO_W);

  function sstep(a, b, x) {
    var t = (x - a) / (b - a);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return t * t * (3 - 2 * t);
  }

  window.CIMA_mount = function (canvas) {
    if (!canvas) return false;
    var hero = canvas.closest(".hero") || canvas.parentNode;
    if (!hero) return false;
    var ctx = canvas.getContext("2d");
    if (!ctx || typeof Path2D !== "function") return false;

    var reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    var fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
    var small = window.innerWidth < 760;
    var dawn = hero.querySelector("[data-dawn]");

    /* ---------------- la silueta ----------------
       Se rasteriza el trazado del logo, se busca por columna el píxel
       más alto y se rellena hacia abajo. Resultado: una montaña maciza
       cuyo perfil es exactamente el del isotipo. El trazado del logo
       es un contorno; relleno tal cual dejaría huecos internos. */
    var env = new Int16Array(MW0);
    var tinted = document.createElement("canvas");

    function buildShape() {
      var m = document.createElement("canvas");
      m.width = MW0; m.height = MH0;
      var mc = m.getContext("2d");
      mc.save();
      mc.scale(MW0 / LOGO_W, RIDGE_H / LOGO_H);
      mc.fillStyle = "#fff";
      mc.fill(new Path2D(LOGO));
      mc.restore();

      var d = mc.getImageData(0, 0, MW0, MH0).data;
      var x, y;
      for (x = 0; x < MW0; x++) {
        env[x] = MH0;
        for (y = 0; y < RIDGE_H; y++) {
          if (d[(y * MW0 + x) * 4 + 3] > 24) { env[x] = y; break; }
        }
      }
      /* Suavizado corto: el contorno trae dientes de un píxel que a
         escala de pantalla leen como ruido en el filo. */
      var sm = Int16Array.from(env);
      for (var p = 0; p < 2; p++) {
        for (x = 1; x < MW0 - 1; x++) sm[x] = (env[x - 1] + env[x] * 2 + env[x + 1]) >> 2;
        env.set(sm);
      }

      tinted.width = MW0; tinted.height = MH0;
      var tc = tinted.getContext("2d");
      tc.beginPath();
      tc.moveTo(0, MH0);
      for (x = 0; x < MW0; x++) tc.lineTo(x, env[x]);
      tc.lineTo(MW0 - 1, MH0);
      tc.closePath();
      /* Sombra celeste traslúcida: más densa y profunda en la base,
         más clara y abierta hacia la cumbre. */
      var g = tc.createLinearGradient(0, MH0, 0, 0);
      g.addColorStop(0, "rgba(12,48,92,.34)");
      g.addColorStop(0.45, "rgba(30,112,186,.3)");
      g.addColorStop(0.82, "rgba(69,174,229,.36)");
      g.addColorStop(1, "rgba(122,203,240,.46)");
      tc.fillStyle = g;
      tc.fill();
      /* El filo, apenas marcado: es lo que define la forma */
      tc.beginPath();
      tc.moveTo(0, env[0]);
      for (x = 1; x < MW0; x++) tc.lineTo(x, env[x]);
      tc.strokeStyle = "rgba(96,190,236,.72)";
      tc.lineWidth = 1.6;
      tc.lineJoin = "round";
      tc.stroke();
    }

    /* ---------------- partículas ----------------
       Pocas y sueltas: son el mecanismo, no la masa. */
    var N = 0, P = null, TX, TY, ORD, HX, HY, X, Y, VX, VY, PH, AMP;
    function seed(n) {
      N = n;
      P = new Float32Array(N * 11);
      TX = 0; TY = N; ORD = N * 2; HX = N * 3; HY = N * 4;
      X = N * 5; Y = N * 6; VX = N * 7; VY = N * 8; PH = N * 9; AMP = N * 10;

      /* Columnas sorteadas en proporción a su altura: con x uniforme,
         los bordes finos reciben tantas partículas como la cumbre. */
      var cdf = new Float32Array(MW0), acc = 0, i;
      for (i = 0; i < MW0; i++) { acc += (MH0 - env[i]); cdf[i] = acc; }

      for (i = 0; i < N; i++) {
        var r = Math.random() * acc, lo = 0, hi = MW0 - 1;
        while (lo < hi) { var mid = (lo + hi) >> 1; if (cdf[mid] < r) lo = mid + 1; else hi = mid; }
        var top = env[lo];
        var crest = Math.random() < 0.4;
        var py = crest ? top + (MH0 - top) * Math.pow(Math.random(), 4)
                       : top + (MH0 - top) * Math.random();
        var u = lo / (MW0 - 1), v = py / MH0;
        P[TX + i] = u;
        P[TY + i] = v;
        P[ORD + i] = 1 - v;                       /* 0 base · 1 cumbre */
        P[HX + i] = u + (Math.random() - 0.5) * 0.7;
        P[HY + i] = v + (Math.random() - 0.5) * 0.6;
        P[X + i] = P[HX + i];
        P[Y + i] = P[HY + i];
        P[PH + i] = Math.random() * 6.283;
        P[AMP + i] = 0.6 + Math.random() * 0.75;
      }
    }

    /* ---------------- lienzos ---------------- */
    var shp = document.createElement("canvas"), sctx = shp.getContext("2d");
    var dots = document.createElement("canvas"), dctx = dots.getContext("2d");
    var img = null, px32 = null;
    var BW = 0, BH = 0, W = 0, H = 0, MX = 0, MY = 0, MWp = 0, MHp = 0;

    function layout() {
      var r = hero.getBoundingClientRect();
      W = Math.max(320, Math.round(r.width));
      H = Math.max(320, Math.round(r.height));
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = true;

      var sc = small ? 0.5 : 0.54;
      BW = Math.max(200, Math.round(W * sc));
      BH = Math.max(200, Math.round(H * sc));
      shp.width = BW; shp.height = BH;
      dots.width = BW; dots.height = BH;
      dctx.imageSmoothingEnabled = false;
      img = dctx.createImageData(BW, BH);
      px32 = new Uint32Array(img.data.buffer);

      /* En desktop el volumen va a la derecha, que es donde no hay
         texto; apilado, abajo y a todo el ancho. */
      if (small) { MX = -0.08 * BW; MWp = 1.16 * BW; MY = 0.52 * BH; MHp = 0.5 * BH; }
      else { MX = 0.4 * BW; MWp = 0.82 * BW; MY = 0.28 * BH; MHp = 0.74 * BH; }
    }

    /* ---------------- ciclo ----------------
       Se desarma rápido y se rearma lento: el mensaje está en subir. */
    var STEPS = 12;
    var UP = 10.5, HOLD = 3.4, DOWN = 1.7, REST = 0.8;
    var CYCLE = UP + HOLD + DOWN + REST;

    var mxT = 0, myT = 0, mx = 0, my = 0, flash = 0;
    if (fine) {
      hero.addEventListener("pointermove", function (e) {
        var r = hero.getBoundingClientRect();
        mxT = (e.clientX - r.left) / r.width * 2 - 1;
        myT = (e.clientY - r.top) / r.height * 2 - 1;
      });
      hero.addEventListener("pointerleave", function () { mxT = 0; myT = 0; });
    }

    function step(t, dt, frozen) {
      var tc = frozen ? UP + 1 : t % CYCLE;
      var front, building;
      if (tc < UP) {
        /* El frente sube a saltos: cada paso trepa y después descansa.
           Ese descanso es lo que lo hace leer como etapa. */
        var a = tc / UP, si = Math.floor(a * STEPS), sf = a * STEPS - si;
        front = (si + sstep(0, 0.5, sf)) / STEPS;
        building = 1;
      } else if (tc < UP + HOLD) { front = 1.04; building = 1; }
      else if (tc < UP + HOLD + DOWN) {
        front = 1.04 * (1 - sstep(0, 1, (tc - UP - HOLD) / DOWN));
        building = 0;
      } else { front = 0; building = 0; }

      var want = (tc > UP - 0.4 && tc < UP + HOLD * 0.75) ? 1 : 0;
      flash += (want - flash) * Math.min(1, dt * (want ? 4 : 1.1));
      mx += (mxT - mx) * Math.min(1, dt * 1.8);
      my += (myT - my) * Math.min(1, dt * 1.8);

      var ox = MX + mx * (small ? 4 : 10);
      var oy = MY + my * (small ? 3 : 6);

      /* ---- la silueta, revelada hasta el frente ---- */
      sctx.clearRect(0, 0, BW, BH);
      sctx.globalCompositeOperation = "source-over";
      sctx.drawImage(tinted, ox, oy, MWp, MHp);
      var fy = oy + (1 - front) * MHp;
      var soft = MHp * 0.05;
      var gm = sctx.createLinearGradient(0, fy - soft, 0, fy + soft * 0.4);
      gm.addColorStop(0, "rgba(0,0,0,0)");
      gm.addColorStop(1, "rgba(0,0,0,1)");
      sctx.globalCompositeOperation = "destination-in";
      sctx.fillStyle = gm;
      sctx.fillRect(0, 0, BW, BH);
      sctx.globalCompositeOperation = "source-over";

      /* ---- las partículas en vuelo ---- */
      px32.fill(0);
      var i, k = Math.min(1, dt * 60) * 0.5;
      for (i = 0; i < N; i++) {
        var ord = P[ORD + i];
        /* Visible sólo mientras viaja: una vez que el frente la pasa,
           ya es parte de la silueta y deja de dibujarse. */
        var near = building ? sstep(0.34, 0.0, ord - front) : 0;
        var gone = building ? sstep(0.0, -0.05, ord - front) : 0;
        var pull = near * (1 - gone);

        var ph = P[PH + i];
        var hx = P[HX + i] + Math.sin(t * 0.26 + ph) * 0.02;
        var hy = P[HY + i] + Math.cos(t * 0.21 + ph) * 0.016;
        var gx = hx + (P[TX + i] - hx) * pull;
        var gy = hy + (P[TY + i] - hy) * pull;

        var cx = P[X + i], cy = P[Y + i];
        var vx = P[VX + i] * 0.9 + (gx - cx) * k * 0.2;
        var vy = P[VY + i] * 0.9 + (gy - cy) * k * 0.2;
        cx += vx; cy += vy;
        P[X + i] = cx; P[Y + i] = cy; P[VX + i] = vx; P[VY + i] = vy;

        /* Sólo se ven las que están trabajando: repartidas por todo
           el cuadro leían como polvo, no como material en camino. */
        var al = (210 * pull + 30 * sstep(0.6, 0.1, ord - front)) * (1 - gone) * P[AMP + i];
        if (al < 3) continue;
        if (al > 235) al = 235;
        al = al | 0;

        var fx = ox + cx * MWp, fyy = oy + cy * MHp;
        var ix = fx | 0, iy = fyy | 0;
        if (ix < 1 || iy < 1 || ix >= BW - 1 || iy >= BH - 1) continue;
        /* Mota blanda de 3x3: al escalar el búfer queda un punto
           redondeado en vez de un píxel duro. */
        var o = iy * BW + ix, h = al >> 1, q = al >> 2;
        put(o, al, MOTE); put(o - 1, h, MOTE); put(o + 1, h, MOTE);
        put(o - BW, h, MOTE); put(o + BW, h, MOTE);
        put(o - BW - 1, q, MOTE); put(o - BW + 1, q, MOTE);
        put(o + BW - 1, q, MOTE); put(o + BW + 1, q, MOTE);
      }

      /* ---- composición ----
         Las motas se componen sobre la silueta A RESOLUCIÓN DE BÚFER y
         recién después se escala una sola vez: dos escalados a pantalla
         completa por cuadro costaban el doble sin aportar nada. */
      dctx.putImageData(img, 0, 0);
      sctx.drawImage(dots, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(shp, 0, 0, W, H);

      /* La línea del frente: hasta dónde llegó el ascenso */
      if (building && front < 1.01 && front > 0.004) {
        var ly = fy / BH * H;
        var lx0 = ox / BW * W, lx1 = (ox + MWp) / BW * W;
        var g = ctx.createLinearGradient(lx0, 0, lx1, 0);
        g.addColorStop(0, "rgba(69,174,229,0)");
        g.addColorStop(0.45, "rgba(69,174,229,.3)");
        g.addColorStop(0.72, "rgba(69,174,229,.6)");
        g.addColorStop(1, "rgba(69,174,229,0)");
        ctx.strokeStyle = g;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(lx0, ly);
        ctx.lineTo(lx1, ly);
        ctx.stroke();
      }

      if (dawn) dawn.style.opacity = (flash * 0.42).toFixed(3);
    }

    /* Celeste claro empaquetado en el orden del búfer (B<<16|G<<8|R) */
    var MOTE = (239 << 16) | (206 << 8) | 160;
    function put(o, a, col) {
      var prev = px32[o];
      if (prev === 0) { px32[o] = (a << 24) | col; return; }
      var s = (prev >>> 24) + a;
      px32[o] = ((s > 250 ? 250 : s) << 24) | col;
    }

    buildShape();
    layout();
    seed(small ? 2300 : 4800);

    if (reduced) { step(0, 0.016, true); return true; }

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
      if (running) step((now - t0) / 1000, Math.min(0.05, raw), false);
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
