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

  /* La serie, punto por punto. No hay interpolación ni suavizado: un
     gráfico de líneas va de dato a dato con una recta.

     EL ISOTIPO ABRE EL GRÁFICO. Los primeros trece vértices no son
     inventados: son la silueta del logo de Iñaki. Se trazó el borde
     superior de la montaña del isotipo —el píxel verde más alto de
     cada columna— y se simplificó con Douglas-Peucker hasta quedarse
     con sus esquinas reales: el flanco escalonado, la cima principal,
     el collado, el segundo pico, el espolón corto y la bajada final.
     Van en x 0..0.300, escalados a y 0.08..0.52. Si mirás el primer
     tercio de la curva, estás mirando el logo.

     De ahí en más, la construcción: dos macizos más, cada uno con su
     pico más alto que el anterior, y la cumbre al final.

     Las BAJADAS son el recurso. Caen casi al doble de pendiente que
     lo que suben (-7.8 contra +4.1 en una caja de desktop), y eso es
     lo que hace que cada remontada se lea como una ladera en vez de
     un serrucho. Dos derrumbes de -.42 y -.36 parten el gráfico.

     La tendencia nunca deja de subir, pero no punto a punto —por
     macizo—: las cimas van .52 (el logo) → .68 → .86 → 1.00, y el
     piso de cada macizo va .08 → .21 → .44. Se cae más hondo cada
     vez, y aun así nunca se vuelve al punto de partida.

     Dos retrocesos chicos salieron a propósito: los que seguían a una
     cima menor, antes de .494 y antes de .784. Sin ellos, lo que era
     subida-freno-subida queda como una sola recta larga entrando a
     cada pico. Prueba a ver cómo lee. */
  var DATA = [
    [0.000, 0.080], [0.025, 0.208], [0.040, 0.212], [0.080, 0.455], [0.097, 0.426],
    [0.112, 0.520], [0.128, 0.474], [0.142, 0.498], [0.179, 0.381], [0.217, 0.489],
    [0.249, 0.289], [0.261, 0.344], [0.300, 0.095], [0.332, 0.270], [0.352, 0.200],
    [0.386, 0.410], [0.408, 0.330], [0.438, 0.530], [0.494, 0.680],
    [0.518, 0.570], [0.538, 0.630], [0.574, 0.210], [0.608, 0.390], [0.630, 0.310],
    [0.666, 0.530], [0.688, 0.450], [0.724, 0.690], [0.784, 0.860],
    [0.806, 0.740], [0.824, 0.800], [0.852, 0.440], [0.888, 0.660], [0.906, 0.600],
    [0.968, 1.000]
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
    var small = window.innerWidth <= 980;   /* igual que el CSS del hero */

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
    /* Borde de un elemento del hero, en coordenadas del lienzo.
       Para el titular no sirve su caja: con max-width:12ch la caja
       llega bastante más a la derecha que la última letra, y usarla
       nos comía ~100px de lienzo. Un Range devuelve el rectángulo de
       cada renglón, ajustado al texto; nos quedamos con el más ancho. */
    function edge(sel, side) {
      var el = hero.querySelector(sel);
      if (!el) return null;
      var hr = hero.getBoundingClientRect(), er = el.getBoundingClientRect();
      if (!er.width && !er.height) return null;
      if (side === "bottom") return er.bottom - hr.top;

      var right = er.right;
      try {
        var rg = document.createRange();
        rg.selectNodeContents(el);
        var ls = rg.getClientRects(), best = 0;
        for (var k = 0; k < ls.length; k++) {
          if (ls[k].width && ls[k].right > best) best = ls[k].right;
        }
        if (best) right = Math.min(right, best);
      } catch (e) { /* sin Range, queda la caja */ }
      return right - hr.left;
    }
    /* ---------------- paleta y utilería ----------------
       El halo NO se hace con shadowBlur: recalcularlo en cada nodo y
       en cada cuadro es lo que funde el frame budget. Se dibuja una
       sola vez a un lienzo aparte y después se estampa escalado, que
       es una operación de GPU. Con eso entran cientos de nodos sin
       bajar de 60fps. */
    var GLOW = (function () {
      var g = document.createElement("canvas");
      var R = 64; g.width = g.height = R * 2;
      var c = g.getContext("2d");
      var rg = c.createRadialGradient(R, R, 0, R, R, R);
      rg.addColorStop(0.00, "rgba(190,236,255,1)");
      rg.addColorStop(0.18, "rgba(105,205,245,.55)");
      rg.addColorStop(0.45, "rgba(69,174,229,.18)");
      rg.addColorStop(1.00, "rgba(69,174,229,0)");
      c.fillStyle = rg; c.fillRect(0, 0, R * 2, R * 2);
      return g;
    })();
    function glow(x, y, r, a) {
      if (a <= 0.004) return;
      ctx.globalAlpha = a;
      ctx.drawImage(GLOW, x - r, y - r, r * 2, r * 2);
      ctx.globalAlpha = 1;
    }

    /* Ruido suave y barato: suma de dos senos desfasados por índice.
       No asigna memoria, no necesita tabla, y da un vagabundeo
       orgánico en vez del temblor de un random por cuadro. */
    function wob(i, t, a, b) {
      return Math.sin(t * a + i * 1.7) * 0.6 + Math.sin(t * b + i * 0.9) * 0.4;
    }

    /* ---------------- las series de fondo ----------------
       La serie del isotipo sigue siendo la protagonista. Detrás van
       dos series más, densas y nerviosas, que son las que arman la
       constelación: le dan al cuadro la lectura de "muchos datos
       midiéndose a la vez" sin tapar la forma de la marca. */
    function makeSerie(n, seed, lo, hi) {
      var a = [];
      for (var i = 0; i < n; i++) {
        var u = i / (n - 1);
        /* sube a lo largo del recorrido, como la principal */
        var trend = lo + (hi - lo) * u;
        a.push({
          u: u,
          base: trend + Math.sin(seed + i * 2.3) * 0.17,
          amp: 0.07 + 0.08 * Math.abs(Math.sin(seed * 1.7 + i)),
          s1: 0.5 + 0.5 * Math.abs(Math.sin(seed + i * 0.6)),
          s2: 0.9 + 0.7 * Math.abs(Math.cos(seed + i * 0.4))
        });
      }
      return a;
    }
    var SER = [makeSerie(46, 1.3, 0.14, 0.62), makeSerie(38, 4.1, 0.22, 0.78)];

    /* ---------------- el cielo ----------------
       Distribución fija por semilla y no aleatoria por carga: la web
       tiene que verse igual cada vez que alguien entra. */
    var STARS = (function () {
      var a = [];
      for (var i = 0; i < 130; i++) {
        var h = Math.sin(i * 12.9898) * 43758.5453;
        var h2 = Math.sin(i * 78.233) * 12345.6789;
        a.push({
          x: h - Math.floor(h), y: h2 - Math.floor(h2),
          r: 0.5 + (h - Math.floor(h)) * 1.3,
          ph: i * 0.7, sp: 0.5 + (h2 - Math.floor(h2))
        });
      }
      return a;
    })();

    var gFill = null, gLine = null, gMask = null;
    function layout() {
      var r = hero.getBoundingClientRect();
      W = Math.max(320, Math.round(r.width));
      H = Math.max(320, Math.round(r.height));
      /* Tope de 1.5 a propósito: esto son halos difusos, no tipografía.
         A 2x se pagaba el doble de relleno por cuadro sin diferencia
         visible, y era lo que hundía los fps en pantallas grandes. */
      DPR = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(W * DPR);
      canvas.height = Math.round(H * DPR);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

      /* El encuadre no se adivina con fracciones: se mide contra el
         texto que efectivamente hay en pantalla. Así el gráfico no se
         cruza con el título en desktop ni con los botones en mobile,
         sin importar el ancho, el tamaño de fuente o lo largo que
         termine siendo el copy de Iñaki. */
      var gap = Math.max(22, Math.min(56, W * 0.034));
      var copyR = Math.max(
        edge(".hero-title", "right") || 0,
        edge(".hero-sub", "right") || 0,
        edge(".hero-actions", "right") || 0
      ) || null;
      var actsB = edge(".hero-actions", "bottom");

      if (small) {
        /* Apilado: la serie arranca debajo de los botones y ocupa lo
           que quede. Pero si el alto sobrante es poco —una tablet en
           apaisado, por ejemplo— un gráfico a todo lo ancho sale
           chato y se pierde la montaña, así que se le limita el ancho
           contra el alto y se centra. */
        BY = actsB != null ? actsB + gap : 0.58 * H;
        BY = Math.min(BY, H * 0.70);
        BH = Math.max(H * 0.18, H * 0.97 - BY);
        var full = (W * 0.94 + W * 0.05) / SX[N - 1];
        BW = Math.min(full, BH * 2.3);
        BX = BW >= W ? -0.05 * W : (W - BW) / 2;
      } else {
        /* Horizontal: la serie empieza donde termina el titular, y la
           cumbre cae adentro del lienzo en vez de irse por el borde. */
        BX = copyR != null ? copyR + gap : 0.52 * W;
        BX = Math.min(BX, W * 0.64);
        BW = (W * 0.965 - BX) / SX[N - 1];
        BY = 0.21 * H; BH = 0.50 * H;
      }

      /* El desvanecido del borde, que antes era una mask CSS. En
         destination-out el alfa del degradado BORRA, así que va al
         revés que la máscara: opaco donde queremos que desaparezca. */
      if (small) {
        gMask = ctx.createLinearGradient(0, 0, 0, H * 0.45);
        gMask.addColorStop(0.00, "rgba(0,0,0,1)");
        gMask.addColorStop(0.53, "rgba(0,0,0,.65)");
        gMask.addColorStop(0.98, "rgba(0,0,0,0)");
      } else {
        gMask = ctx.createLinearGradient(0, 0, W * 0.25, 0);
        gMask.addColorStop(0.00, "rgba(0,0,0,1)");
        gMask.addColorStop(0.40, "rgba(0,0,0,.55)");
        gMask.addColorStop(0.96, "rgba(0,0,0,0)");
      }

      gFill = ctx.createLinearGradient(0, BY, 0, BY + BH);
      gFill.addColorStop(0, "rgba(69,174,229,.22)");
      gFill.addColorStop(0.6, "rgba(69,174,229,.07)");
      gFill.addColorStop(1, "rgba(69,174,229,0)");
      gLine = ctx.createLinearGradient(BX, 0, BX + BW, 0);
      gLine.addColorStop(0, "rgba(46,134,212,.85)");
      gLine.addColorStop(0.55, "#58C2EE");
      gLine.addColorStop(1, "#AEE9FF");
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
      progT = Math.min(1, t / 2.8 + sc * 0.5);
      prog += (progT - prog) * Math.min(1, dt * 3.2);
      energy += (sc - energy) * Math.min(1, dt * 2);
      hov += (hovT - hov) * Math.min(1, dt * 5);
      if (mx < 0) { mx = mxT; my = myT; }
      else { mx += (mxT - mx) * Math.min(1, dt * 7); my += (myT - my) * Math.min(1, dt * 7); }

      ctx.clearRect(0, 0, W, H);

      var ox = fine && hovT ? (mx / W - 0.5) * -14 : 0;
      var oy = fine && hovT ? (my / H - 0.5) * -8 : 0;

      /* ---- el cielo ----
         Va con su propia paralaje, más corta que la del gráfico: eso
         es lo que da la sensación de profundidad entre las dos capas. */
      /* El cielo respeta la columna de texto. El mismo borde que ya
         calcula layout() contra el titular y los botones sirve acá:
         las estrellas se apagan antes de llegar y entran de a poco,
         así no queda un corte recto donde terminan. */
      var sop = Math.min(1, t / 1.1);
      var lim = small ? BY : BX;
      var feather = small ? H * 0.10 : W * 0.10;
      ctx.fillStyle = "#CFE8FA";
      for (var si = 0; si < STARS.length; si++) {
        var st = STARS[si];
        var sx = st.x * W + ox * 0.35, sy = st.y * H + oy * 0.35;
        var room = (small ? sy : sx) - lim;
        if (room < 0) continue;
        var edge = Math.min(1, room / feather);
        var tw = 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(t * st.sp + st.ph));
        ctx.globalAlpha = tw * 0.55 * sop * edge;
        var sr = st.r;
        ctx.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
      }
      ctx.globalAlpha = 1;

      ctx.save();
      ctx.translate(ox, oy);

      var base = BY + BH;
      var cut = BX + BW * prog;

      /* ---- la retícula: el instrumento ----
         Marcas de escala sin números. Un gráfico decorativo con cifras
         en los ejes se lee como dato real, y acá no hay dato que
         respaldar. */
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(127,203,240," + (0.07 + 0.05 * energy).toFixed(3) + ")";
      for (var g = 1; g <= 5; g++) {
        var gy = BY + BH * (g / 6);
        ctx.beginPath(); ctx.moveTo(BX, gy); ctx.lineTo(BX + BW, gy); ctx.stroke();
      }
      for (var v = 1; v < 14; v++) {
        var gx = BX + BW * (v / 14);
        ctx.beginPath(); ctx.moveTo(gx, BY); ctx.lineTo(gx, base); ctx.stroke();
      }
      ctx.strokeStyle = "rgba(127,203,240,.26)";
      ctx.beginPath(); ctx.moveTo(BX, base); ctx.lineTo(BX + BW, base); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(BX, BY); ctx.lineTo(BX, base); ctx.stroke();
      ctx.strokeStyle = "rgba(127,203,240,.34)";
      for (var tk = 0; tk <= 14; tk++) {
        var tx2 = BX + BW * (tk / 14);
        ctx.beginPath(); ctx.moveTo(tx2, base); ctx.lineTo(tx2, base + 5); ctx.stroke();
      }
      for (var tk2 = 0; tk2 <= 6; tk2++) {
        var ty2 = BY + BH * (tk2 / 6);
        ctx.beginPath(); ctx.moveTo(BX - 5, ty2); ctx.lineTo(BX, ty2); ctx.stroke();
      }

      /* Todo lo trazado se revela de izquierda a derecha */
      ctx.save();
      ctx.beginPath();
      ctx.rect(BX - 3, BY - BH * 0.45, Math.max(0, cut - BX + 3), BH * 1.9);
      ctx.clip();

      /* ---- las series de fondo ----
         Vagabundean con ruido suave: nunca se quedan quietas, que es
         lo que mantiene el cuadro vivo cuando ya terminó de entrar. */
      for (var k = 0; k < SER.length; k++) {
        var S = SER[k], n = S.length;
        var dim = k === 0 ? 0.36 : 0.24;
        ctx.beginPath();
        for (var i = 0; i < n; i++) {
          var p = S[i];
          var yv = p.base + p.amp * wob(i, t, p.s1, p.s2);
          var X = BX + p.u * BW, Y = BY + BH - yv * BH;
          i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
        }
        ctx.strokeStyle = k === 0 ? "rgba(88,194,238," + dim + ")" : "rgba(46,134,212," + dim + ")";
        ctx.lineWidth = 1.1;
        ctx.lineJoin = "miter"; ctx.miterLimit = 4;
        ctx.stroke();

        /* nodos de las secundarias: chicos, apenas encendidos */
        for (var i2 = 0; i2 < n; i2 += 2) {
          var p2 = S[i2];
          var yv2 = p2.base + p2.amp * wob(i2, t, p2.s1, p2.s2);
          var X2 = BX + p2.u * BW, Y2 = BY + BH - yv2 * BH;
          var tw2 = 0.5 + 0.5 * Math.sin(t * 1.6 + i2 * 0.8 + k * 2);
          glow(X2, Y2, 6 + 3 * tw2, (0.09 + 0.12 * tw2) * dim * 2);
          ctx.globalAlpha = (0.5 + 0.3 * tw2) * dim;
          ctx.beginPath(); ctx.arc(X2, Y2, 1.5, 0, 6.2832);
          ctx.fillStyle = "#BEE9FF"; ctx.fill();
          ctx.globalAlpha = 1;
        }
      }

      /* ---- el macizo bajo la serie del isotipo ---- */
      ctx.beginPath();
      ctx.moveTo(px(0), base);
      for (var a1 = 0; a1 < N; a1++) ctx.lineTo(px(a1), py(a1));
      ctx.lineTo(px(N - 1), base);
      ctx.closePath();
      ctx.fillStyle = gFill;
      ctx.globalAlpha = 0.8 + 0.2 * energy;
      ctx.fill();
      ctx.globalAlpha = 1;

      /* ---- el trazo de la marca ----
         Va dos veces: un pase ancho y translúcido que hace de halo, y
         encima el trazo nítido. Es el mismo truco del sprite: dos
         rellenos baratos en lugar de un blur caro. */
      ctx.beginPath();
      ctx.moveTo(px(0), py(0));
      for (var j = 1; j < N; j++) ctx.lineTo(px(j), py(j));
      ctx.lineJoin = "miter"; ctx.miterLimit = 6; ctx.lineCap = "round";
      ctx.strokeStyle = "rgba(110,208,246,.22)";
      ctx.lineWidth = 11; ctx.stroke();
      ctx.strokeStyle = gLine;
      ctx.lineWidth = 3; ctx.lineCap = "butt"; ctx.stroke();
      ctx.restore();

      /* ---- los nodos de la serie principal ----
         Encienden al pasar el trazado y después laten. El que está
         bajo el cursor se agranda: la constelación responde. */
      for (var m = 0; m < N; m++) {
        var ap = sstep(0, 0.035, prog - SX[m]);
        if (ap <= 0) continue;
        var nx = px(m), ny = py(m);
        var beat = 0.5 + 0.5 * Math.sin(t * 1.9 + m * 0.55);
        var near = 0;
        if (hov > 0.01) {
          var d = Math.abs(nx - (mx - ox)) + Math.abs(ny - (my - oy)) * 0.6;
          near = hov * Math.max(0, 1 - d / 150);
        }
        glow(nx, ny, (9 + 5 * beat + 16 * near), ap * (0.3 + 0.2 * beat + 0.5 * near));
        ctx.globalAlpha = ap;
        ctx.beginPath(); ctx.arc(nx, ny, 2 + 0.5 * beat + 1.6 * near, 0, 6.2832);
        ctx.fillStyle = "#EAF8FF"; ctx.fill();
        ctx.globalAlpha = 1;
      }

      /* ---- el barrido ----
         Un pulso recorre la serie cada tantos segundos y va
         encendiendo los nodos a su paso. Es lo que le da dirección al
         movimiento: sin él, el latido es ruido parejo. */
      if (prog > 0.985) {
        var sw = (t * 0.26) % 1.6;
        if (sw < 1) {
          var su = sw, sy = 0, found = false;
          for (var q = 0; q < N - 1; q++) {
            if (SX[q] <= su && su <= SX[q + 1]) {
              var ft2 = (su - SX[q]) / (SX[q + 1] - SX[q]);
              sy = py(q) + (py(q + 1) - py(q)) * ft2; found = true; break;
            }
          }
          if (found) {
            var sx2 = BX + su * BW;
            var fade = Math.sin(su * 3.1416);
            glow(sx2, sy, 34, 0.5 * fade);
            ctx.globalAlpha = 0.9 * fade;
            ctx.beginPath(); ctx.arc(sx2, sy, 3, 0, 6.2832);
            ctx.fillStyle = "#fff"; ctx.fill();
            ctx.globalAlpha = 1;
          }
        }
      }

      /* ---- la cumbre ---- */
      var ta = sstep(0, 0.05, prog - SX[TOP]);
      if (ta > 0) {
        var tx = px(TOP), ty = py(TOP);
        var pulse = 1 + Math.sin(t * 1.5) * 0.14;
        glow(tx, ty, 30 * pulse, ta * 0.55);
        ctx.globalAlpha = ta * 0.4;
        ctx.beginPath(); ctx.arc(tx, ty, 14 * pulse, 0, 6.2832);
        ctx.strokeStyle = "#8FD9FA"; ctx.lineWidth = 1.3; ctx.stroke();
        ctx.globalAlpha = ta;
        ctx.beginPath(); ctx.arc(tx, ty, 4.4, 0, 6.2832);
        ctx.fillStyle = "#fff"; ctx.fill();
        ctx.globalAlpha = 1;
      }

      /* ---- la cabeza del trazo mientras avanza ---- */
      if (prog < 0.999) {
        var hi = Math.max(0, Math.min(N - 1, Math.round(prog * (N - 1))));
        glow(px(hi), py(hi), 30, 0.75);
        ctx.beginPath(); ctx.arc(px(hi), py(hi), 3, 0, 6.2832);
        ctx.fillStyle = "#fff"; ctx.fill();
      }

      /* ---- lectura bajo el cursor ---- */
      if (hov > 0.01 && prog > 0.2) {
        var u2 = (mx - ox - BX) / BW;
        if (u2 > SX[0] && u2 < Math.min(prog, SX[N - 1])) {
          var ci = 0;
          while (ci < N - 2 && SX[ci + 1] < u2) ci++;
          var sg = SX[ci + 1] - SX[ci];
          var fr = sg > 0 ? (u2 - SX[ci]) / sg : 0;
          var cx = px(ci) + (px(ci + 1) - px(ci)) * fr;
          var cy = py(ci) + (py(ci + 1) - py(ci)) * fr;
          ctx.globalAlpha = hov * 0.5;
          ctx.save();
          ctx.setLineDash([2, 5]);
          ctx.strokeStyle = "rgba(143,217,250,.6)"; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(cx, base); ctx.lineTo(cx, cy); ctx.stroke();
          ctx.restore();
          glow(cx, cy, 26, hov * 0.6);
          ctx.globalAlpha = hov;
          ctx.beginPath(); ctx.arc(cx, cy, 4.2, 0, 6.2832);
          ctx.fillStyle = "#fff"; ctx.fill();
          ctx.globalAlpha = 1;
        }
      }

      ctx.restore();

      /* El borrado va SOLO sobre la franja que se desvanece. Pintarlo
         sobre todo el lienzo costaba lo mismo que la máscara CSS que
         vinimos a sacar: el ahorro está en el área, no en la técnica. */
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = gMask;
      if (small) ctx.fillRect(0, 0, W, H * 0.45);
      else ctx.fillRect(0, 0, W * 0.25, H);
      ctx.globalCompositeOperation = "source-over";
    }

    layout();
    /* El encuadre se mide contra el titular, y el titular cambia de
       ancho cuando entra la tipografía real. Hay que volver a medir. */
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { layout(); if (reduced) draw(0, 0.016); });
    }
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
        small = window.innerWidth <= 980;
        layout();
      }, 180);
    }, { passive: true });

    return true;
  };
})();
