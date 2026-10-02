(function () {
  "use strict";
  /* ===========================================================
     CIMA — el ascenso, partícula por partícula
     Iñaki Etchegaray · M-DATOS

     Canvas 2D. Decenas de miles de partículas que se desarman y se
     vuelven a armar DE ABAJO HACIA ARRIBA, en pasos discretos, hasta
     cerrar la cumbre. Cada paso es una etapa del programa: no se salta
     ninguno, y la cima es lo último que se forma.

     Nada de WebGL. Las partículas no se dibujan con arc() ni
     fillRect() —eso serían decenas de miles de llamadas por cuadro—
     sino escribiendo directo en el búfer de píxeles de un ImageData,
     que después se escala al canvas: una sola operación de dibujo, y
     el escalado regala el halo suave sin coste de blur.
     =========================================================== */

  /* ---------------- ruido ---------------- */
  function hash2(x, y) {
    var n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
    return n - Math.floor(n);
  }
  function vnoise(x, y) {
    var ix = Math.floor(x), iy = Math.floor(y);
    var fx = x - ix, fy = y - iy;
    var ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    var a = hash2(ix, iy), b = hash2(ix + 1, iy);
    var c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  }
  function fbm(x, y, oct) {
    var s = 0, amp = 0.5, f = 1;
    for (var i = 0; i < oct; i++) { s += amp * vnoise(x * f, y * f); amp *= 0.5; f *= 2.03; }
    return s;
  }
  function ridged(x, y, oct) {
    var s = 0, amp = 0.5, f = 1;
    for (var i = 0; i < oct; i++) {
      var n = 1 - Math.abs(vnoise(x * f, y * f) * 2 - 1);
      s += amp * n * n; amp *= 0.5; f *= 2.07;
    }
    return s;
  }
  function sstep(a, b, x) {
    var t = (x - a) / (b - a);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return t * t * (3 - 2 * t);
  }

  /* ---------------- la silueta ----------------
     Cumbres angostas a propósito: con laderas anchas el ápice cae
     menos que sus vecinos y la cima se amesetaba. */
  function pk(x, c, w, h, p) {
    var d = 1 - Math.abs((x - c) / w);
    return d <= 0 ? 0 : h * Math.pow(d, p);
  }
  function profile(u) {
    /* Una cumbre claramente dominante y dos hombros: con picos de
       altura parecida la silueta leia como "dos lomas". */
    var h = Math.max(
      pk(u, 0.44, 0.33, 1, 1.22),
      pk(u, 0.76, 0.19, 0.52, 1.32),
      pk(u, 0.17, 0.16, 0.34, 1.38)
    );
    if (h <= 0) return 0;
    h += 0.085 * ridged(u * 7.4, 2.1, 4) * Math.pow(h, 0.65);
    h -= 0.03 * fbm(u * 12, 5.5, 3) * h;
    return h < 0 ? 0 : h;
  }

  /* Azules de la marca, de la base a la cumbre */
  var RAMP = [
    [6, 32, 68], [10, 48, 104], [16, 74, 150], [26, 110, 192],
    [55, 156, 220], [110, 198, 238], [186, 228, 248], [240, 250, 255]
  ];
  function ramp(t, out) {
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    var f = t * (RAMP.length - 1), i = Math.floor(f), k = f - i;
    var a = RAMP[i], b = RAMP[Math.min(RAMP.length - 1, i + 1)];
    out[0] = a[0] + (b[0] - a[0]) * k;
    out[1] = a[1] + (b[1] - a[1]) * k;
    out[2] = a[2] + (b[2] - a[2]) * k;
  }

  window.CIMA_mount = function (canvas) {
    if (!canvas) return false;
    var hero = canvas.closest(".hero") || canvas.parentNode;
    if (!hero) return false;
    var ctx = canvas.getContext("2d");
    if (!ctx) return false;

    var reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    var fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
    var small = window.innerWidth < 760;
    var dawn = hero.querySelector("[data-dawn]");

    /* Lienzo interno a media resolución: menos píxeles que tocar, y al
       escalarlo cada partícula se convierte en un punto con halo. */
    var off = document.createElement("canvas");
    var octx = off.getContext("2d");
    var img = null, px32 = null;
    var BW = 0, BH = 0, W = 0, H = 0;

    /* ---------------- partículas (SoA, sin objetos) ---------------- */
    var N = 0, P = null;
    var X = 0, Y = 0, VX = 0, VY = 0, TX = 0, TY = 0, HX = 0, HY = 0,
        ORD = 0, WGT = 0, SPD = 0, PHS = 0, COL = 0;

    var rgb0 = [0, 0, 0];
    function build(n) {
      N = n;
      P = new Float32Array(N * 13);
      X = 0; Y = N; VX = N * 2; VY = N * 3; TX = N * 4; TY = N * 5;
      HX = N * 6; HY = N * 7; ORD = N * 8; WGT = N * 9; SPD = N * 10;
      PHS = N * 11; COL = N * 12;
      for (var i = 0; i < N; i++) {
        /* Muestreo pesado por altura de columna: con u uniforme, los
           bordes finos reciben tantas particulas como la cumbre y la
           densidad queda al reves de lo que se espera de un macizo. */
        var u = 0, ridge = 0, guard = 0;
        do {
          u = Math.random(); ridge = profile(u);
          if (Math.random() < ridge) break;
        } while (++guard < 8);
        if (ridge < 0.02) ridge = 0.02;
        /* Un tercio va sobre la cresta misma: es lo que hace que el
           filo se lea como un corte y no como una nube difusa. */
        var crest = Math.random() < 0.32;
        var yy = crest ? ridge * (0.986 + Math.random() * 0.014)
                       : ridge * Math.pow(Math.random(), 0.82);
        /* Refuerzo de cumbre. Un macizo tiene poca masa arriba —es
           geometría, no un error— pero la cima es justo lo que tiene
           que leerse, así que una parte se reasigna al tramo alto. */
        if (!crest && Math.random() < 0.09) {
          var uu = 0.44 + (Math.random() - 0.5) * 0.3;
          var rr = profile(uu);
          if (rr > yy) { u = uu; ridge = rr; yy = rr * (0.74 + Math.random() * 0.26); }
        }
        P[TX + i] = u;
        P[TY + i] = yy;
        P[ORD + i] = yy;
        /* La nube dispersa nace alrededor del propio objetivo: asi el
           desarme se lee como el macizo estallando en su lugar, no
           como polvo repartido por toda la pantalla. */
        P[HX + i] = u + (Math.random() - 0.5) * 0.85;
        P[HY + i] = yy + (Math.random() - 0.5) * 0.78;
        P[X + i] = P[HX + i];
        P[Y + i] = P[HY + i];
        P[PHS + i] = Math.random() * 6.283;
        /* El color depende sólo de la altura y de si va en el filo:
           ambos son estáticos, así que se empaqueta acá y el bucle de
           cada cuadro no vuelve a tocar la rampa. */
        ramp(yy * 0.8 + (crest ? 0.2 : 0), rgb0);
        P[COL + i] = ((rgb0[2] | 0) << 16) | ((rgb0[1] | 0) << 8) | (rgb0[0] | 0);
        /* Idem el factor de brillo: dispersión por partícula y el
           refuerzo por altura, que compensa la poca masa de la cumbre. */
        P[SPD + i] = (0.5 + 0.5 * (0.55 + Math.random() * 0.9)) * (0.78 + 0.5 * yy);
      }
    }

    /* ---------------- encuadre ----------------
       En desktop el volumen va a la derecha, que es donde no hay
       texto; apilado, abajo y a todo el ancho. */
    var MX = 0, MY = 0, MW = 0, MH = 0;
    function layout() {
      var r = hero.getBoundingClientRect();
      W = Math.max(320, Math.round(r.width));
      H = Math.max(320, Math.round(r.height));
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = true;

      var scale = small ? 0.46 : 0.5;
      BW = Math.max(160, Math.round(W * scale));
      BH = Math.max(160, Math.round(H * scale));
      off.width = BW; off.height = BH;
      img = octx.createImageData(BW, BH);
      px32 = new Uint32Array(img.data.buffer);

      if (small) { MX = -0.05 * BW; MW = 1.1 * BW; MY = 0.87 * BH; MH = 0.38 * BH; }
      else { MX = 0.3 * BW; MW = 0.84 * BW; MY = 0.95 * BH; MH = 0.66 * BH; }
    }

    /* ---------------- ciclo ----------------
       Se desarma rápido y se rearma lento: el mensaje está en subir,
       no en caerse. */
    var STEPS = 14;
    var UP = 10.4, HOLD = 3.2, DOWN = 1.9, REST = 0.9;
    var CYCLE = UP + HOLD + DOWN + REST;

    var front = 0, flash = 0, mxT = 0, myT = 0, mx = 0, my = 0;
    if (fine) {
      hero.addEventListener("pointermove", function (e) {
        var r = hero.getBoundingClientRect();
        mxT = (e.clientX - r.left) / r.width * 2 - 1;
        myT = (e.clientY - r.top) / r.height * 2 - 1;
      });
      hero.addEventListener("pointerleave", function () { mxT = 0; myT = 0; });
    }

    function step(t, dt, frozen) {
      var tc = frozen ? UP : t % CYCLE;
      var goal;
      if (tc < UP) {
        /* El frente sube a saltos: cada paso trepa y después descansa.
           Ese descanso es lo que lo hace leer como etapa, no como barra. */
        var a = tc / UP;
        var si = Math.floor(a * STEPS), sf = a * STEPS - si;
        front = (si + sstep(0, 0.52, sf)) / STEPS;
        goal = 1;
      } else if (tc < UP + HOLD) { front = 1.02; goal = 1; }
      else if (tc < UP + HOLD + DOWN) { front = 1.02; goal = 0; }
      else { front = 0; goal = 0; }

      /* Fogonazo cuando se cierra la cumbre */
      var want = (tc > UP - 0.5 && tc < UP + HOLD * 0.8) ? 1 : 0;
      flash += (want - flash) * Math.min(1, dt * (want ? 4.5 : 1.1));

      mx += (mxT - mx) * Math.min(1, dt * 1.8);
      my += (myT - my) * Math.min(1, dt * 1.8);

      px32.fill(0);

      var sx = MX + mx * (small ? 4 : 11);
      var sy = MY + my * (small ? 3 : 7);
      var k = Math.min(1, dt * 60) * 0.5;
      var drift = small ? 0.015 : 0.022;
      var i, wgt, gx, gy, fx, fy, ix, iy, idx, prev, al, a2;

      for (i = 0; i < N; i++) {
        /* Peso de ensamblado: 0 disperso, 1 en su lugar */
        var on = (goal === 1 && P[ORD + i] <= front) ? 1 : 0;
        wgt = P[WGT + i];
        wgt += (on - wgt) * Math.min(1, dt * (on ? 1.9 + P[PHS + i] * 0.42 : 1.5));
        P[WGT + i] = wgt;

        /* Deriva de la nube dispersa */
        var ph = P[PHS + i];
        var hx = P[HX + i] + Math.sin(t * 0.3 + ph) * drift;
        var hy = P[HY + i] + Math.cos(t * 0.24 + ph) * drift * 0.8;

        gx = hx + (P[TX + i] - hx) * wgt;
        gy = hy + (P[TY + i] - hy) * wgt;

        var cx = P[X + i], cy = P[Y + i];
        var vx = P[VX + i] * 0.9 + (gx - cx) * k * 0.22;
        var vy = P[VY + i] * 0.9 + (gy - cy) * k * 0.22;
        cx += vx; cy += vy;
        P[X + i] = cx; P[Y + i] = cy; P[VX + i] = vx; P[VY + i] = vy;

        /* A píxeles del búfer. La montaña crece hacia arriba, por eso
           la y se invierte respecto de la altura normalizada. */
        fx = sx + cx * MW;
        fy = sy - cy * MH;
        ix = fx | 0; iy = fy | 0;
        if (ix < 0 || iy < 0 || ix >= BW || iy >= BH) continue;

        al = (24 + 178 * wgt) * P[SPD + i];
        if (al > 248) al = 248;
        al = al | 0;
        var col = P[COL + i];

        idx = iy * BW + ix;
        prev = px32[idx];
        if (prev === 0) px32[idx] = (al << 24) | col;
        else {
          /* Acumular alfa: donde se juntan más partículas, más densidad */
          a2 = (prev >>> 24) + al;
          if (a2 > 252) a2 = 252;
          px32[idx] = (a2 << 24) | (prev & 0x00FFFFFF);
        }
        /* Ya en su sitio, cada partícula engrosa un píxel hacia abajo:
           es lo que convierte la nube en cuerpo sólido. */
        if (wgt > 0.55 && iy + 1 < BH) {
          idx += BW;
          prev = px32[idx];
          a2 = (prev === 0 ? 0 : prev >>> 24) + (al >> 1);
          if (a2 > 252) a2 = 252;
          px32[idx] = (a2 << 24) | (prev === 0 ? col : (prev & 0x00FFFFFF));
        }
      }

      octx.putImageData(img, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(off, 0, 0, W, H);

      /* La línea del frente: hasta dónde llegó el ascenso */
      if (goal === 1 && front < 1.01) {
        var ly = (sy - front * MH) / BH * H;
        var lx0 = sx / BW * W, lx1 = (sx + MW) / BW * W;
        var g = ctx.createLinearGradient(lx0, 0, lx1, 0);
        g.addColorStop(0, "rgba(69,174,229,0)");
        g.addColorStop(0.46, "rgba(69,174,229,.3)");
        g.addColorStop(0.72, "rgba(69,174,229,.62)");
        g.addColorStop(1, "rgba(69,174,229,0)");
        ctx.strokeStyle = g;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(lx0, ly);
        ctx.lineTo(lx1, ly);
        ctx.stroke();
      }

      if (dawn) dawn.style.opacity = (flash * 0.5).toFixed(3);
    }

    layout();
    build(small ? Math.round(W * H / 20) : Math.min(72000, Math.round(W * H / 15)));

    if (reduced) { step(UP * 0.999, 0.016, true); return true; }

    var running = true, raf = 0;
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (es) { running = es[0].isIntersecting; },
        { threshold: 0 }).observe(hero);
    }

    var t0 = performance.now(), prev = t0, acc = 0, nf = 0, settled = false;
    (function loop(now) {
      raf = requestAnimationFrame(loop);
      var raw = (now - prev) / 1000;
      prev = now;
      if (!running) return;
      var t = (now - t0) / 1000;
      step(t, Math.min(0.05, raw), false);

      /* Una sola medición tras el arranque, y como mucho un ajuste: el
         esquema de remedir y redimensionar en bucle era en sí mismo
         fuente de tirones. */
      if (!settled && t > 1.2) {
        acc += raw; nf++;
        if (acc > 2) {
          settled = true;
          if (acc / nf > 0.027) build(Math.round(N * 0.55));
        }
      }
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
