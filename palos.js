(function () {
  "use strict";
  /* ===========================================================
     PALOS — la patada del cierre
     Iñaki Etchegaray · M-DATOS

     "Primer paso. ¿Qué querés lograr con el proceso?" La pregunta va
     enmarcada entre los palos de rugby: para que una patada valga, la
     pelota tiene que pasar entre los parantes y por encima del
     travesaño, y ahí es exactamente donde está la pregunta.

     La toma es la del pateador: desde atrás, a ras del pasto, mirando
     a los palos. La cancha se va hacia el horizonte con sus líneas
     convergiendo, y cuando la sección entra en pantalla se levantan
     los palos, se trazan las líneas y la pelota entra.

     Las medidas salen del texto: los parantes se separan lo justo para
     que entre el titular y el travesaño cae entre la bajada y el
     formulario. Con esa separación fija, la altura del travesaño
     (3 m), los protectores y el horizonte (la altura de los ojos del
     pateador) salen de las proporciones reales de una H.

     Sobre el formulario la cancha se apaga: los campos quedan limpios.
     =========================================================== */

  var D = 22, OJO = 1.7, MEDIO = 2.8;     // distancia a los palos, altura de los ojos, medio ancho de la H

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function ease(t) { t = clamp(t, 0, 1); return 1 - Math.pow(1 - t, 3); }
  function easeIO(t) { t = clamp(t, 0, 1); return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

  window.PALOS_mount = function (canvas) {
    if (!canvas) return false;
    var sec = canvas.parentNode;
    var ctx = canvas.getContext("2d");
    var titulo = sec.querySelector(".final-title"), bajada = sec.querySelector(".final-text"), form = sec.querySelector(".cform");
    if (!ctx || !titulo) return false;
    var reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

    var W = 0, H = 0, DPR = 1, c = 0, s = 1, f = 1, yh = 0, yc = 0, yg = 0, hueco = null, meta = null;

    /* Posición sin transformaciones: el titular, la bajada y el
       formulario entran con un desplazamiento (.reveal) y la H tiene
       que calzar con donde TERMINAN, no donde están al medir. */
    function rel(el) {
      var x = 0, y = 0, n = el;
      while (n && n !== sec) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
      return { l: x, t: y, r: x + el.offsetWidth, b: y + el.offsetHeight };
    }
    /* el ancho real del titular, renglón por renglón */
    function anchoTexto(el) {
      var a = sec.getBoundingClientRect(), l = 1e9, r = -1e9;
      try {
        var rg = document.createRange(); rg.selectNodeContents(el);
        var ls = rg.getClientRects();
        for (var i = 0; i < ls.length; i++) if (ls[i].width > 1) { l = Math.min(l, ls[i].left); r = Math.max(r, ls[i].right); }
      } catch (e) { /* sin Range */ }
      if (r < l) { var b = el.getBoundingClientRect(); l = b.left; r = b.right; }
      return { l: l - a.left, r: r - a.left };
    }

    /* Un punto del mundo (x lateral, y altura, z distancia) a pantalla. */
    function P(x, y, z) { return [c + f * x / z, yh + f * (OJO - y) / z]; }

    function layout() {
      var r = sec.getBoundingClientRect();
      W = Math.round(r.width); H = Math.round(r.height);
      if (!W || !H) return false;
      DPR = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
      var T = rel(titulo), A = anchoTexto(titulo);
      var B = bajada ? rel(bajada) : { t: T.b + 20, b: T.b + 60, l: T.l, r: T.r };
      var F = form ? rel(form) : { t: B.b + 60, b: B.b + 400, l: T.l, r: T.r };
      c = (A.l + A.r) / 2;
      var pad = Math.max(28, W * 0.045);
      var hw = Math.min(W / 2 - 8, Math.max((A.r - A.l) / 2, (B.r - B.l) / 2) + pad);
      s = hw / MEDIO;                     // px por metro en el plano de los palos
      f = s * D;
      yc = B.b + Math.min(26, (F.t - B.b) * 0.45);   // el travesaño, entre la bajada y el formulario
      yg = yc + 3 * s;                    // el pie de los palos
      yh = yg - OJO * s;                  // el horizonte, a la altura de los ojos
      /* lo que queda limpio: el formulario, los botones y los datos */
      hueco = [F];
      [".final-actions", ".final-meta"].forEach(function (q) { var e = sec.querySelector(q); if (e) hueco.push(rel(e)); });
      meta = { T: T, B: B, A: A };
      return true;
    }

    function linea(x0, z0, x1, z1, prog, a, n) {
      n = n || 24;
      ctx.strokeStyle = "rgba(205,236,255," + a + ")";
      var upto = prog * n;
      for (var i = 1; i <= n && i - 1 < upto; i++) {
        var za = z0 + (z1 - z0) * (i - 1) / n, zb = z0 + (z1 - z0) * i / n;
        if (za < 2 || zb < 2) continue;
        var p = P(x0 + (x1 - x0) * (i - 1) / n, 0, za), q = P(x0 + (x1 - x0) * i / n, 0, zb);
        var fr = Math.min(1, upto - (i - 1));
        ctx.lineWidth = clamp(f * 0.12 / ((za + zb) / 2), 0.8, 2.2);
        ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(p[0] + (q[0] - p[0]) * fr, p[1] + (q[1] - p[1]) * fr); ctx.stroke();
      }
    }
    function raya(x0, z0, x1, z1, prog, a, lleno, hueco2) {
      var len = Math.hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / len, uz = (z1 - z0) / len;
      for (var t = 0; t < len * prog; t += lleno + hueco2) {
        var e = Math.min(len * prog, t + lleno);
        linea(x0 + ux * t, z0 + uz * t, x0 + ux * e, z0 + uz * e, 1, a, 2);
      }
    }

    /* la trayectoria: sale de abajo a la izquierda, gira apenas y pasa
       entre los palos, por encima del travesaño, a la altura de la
       bajada */
    /* La patada, en pantalla. La tomamos desde atrás del pateador:
       la pelota sale de abajo, del costado izquierdo del formulario,
       sube casi derecho alejándose —y achicándose— y cruza por encima
       del travesaño, entre los parantes. */
    function tray(t) {
      var hw = MEDIO * s;
      var x0 = c - hw * 0.8, y0 = H + 20;
      var x2 = Math.min(c - hw * 0.5, meta.B.l - 26), y2 = meta.T.b + (yc - meta.T.b) * 0.25;
      var x1 = c - hw * 0.9, y1 = y2 + (y0 - y2) * 0.35;
      var v = 1 - t;
      return [v * v * x0 + 2 * v * t * x1 + t * t * x2,
              v * v * y0 + 2 * v * t * y1 + t * t * y2,
              Math.max(1.6, 10 - 8 * Math.pow(t, 0.6))];
    }
    /* en qué punto de la trayectoria pasa por arriba del travesaño */
    function cruce() {
      for (var i = 0; i <= 200; i++) if (tray(i / 200)[1] <= yc) return i / 200;
      return 0.8;
    }

    function draw(t) {
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.clearRect(0, 0, W, H);
      var a = reduced ? 1 : ease(t / 0.5);
      ctx.lineCap = "round";

      /* el pasto: luz que cae desde los palos hacia el pateador */
      var g = ctx.createLinearGradient(0, yh, 0, H);
      g.addColorStop(0, "rgba(90,180,235," + (0.0 * a) + ")");
      g.addColorStop(0.15, "rgba(90,180,235," + (0.08 * a) + ")");
      g.addColorStop(1, "rgba(90,180,235," + (0.02 * a) + ")");
      ctx.fillStyle = g; ctx.fillRect(0, yh, W, H - yh);
      ctx.save();
      ctx.beginPath(); ctx.rect(0, yh, W, H - yh); ctx.clip();
      for (var zz = D + 12, k = 0; zz > 3; zz -= 5, k++) {
        if (k % 2) continue;
        var y0 = P(0, 0, zz)[1], y1 = P(0, 0, Math.max(3, zz - 5))[1];
        ctx.fillStyle = "rgba(150,215,250," + (0.035 * a) + ")"; ctx.fillRect(0, y0, W, y1 - y0);
      }
      ctx.restore();

      /* las líneas: try, pelota muerta, y las de 5 y 15 metros que
         corren hacia los palos */
      var pl = reduced ? 1 : ease((t - 0.25) / 1.0);
      if (pl > 0) {
        linea(0, D, -40, D, pl, 0.55 * a, 30); linea(0, D, 40, D, pl, 0.55 * a, 30);
        linea(0, D + 10, -40, D + 10, pl, 0.32 * a, 30); linea(0, D + 10, 40, D + 10, pl, 0.32 * a, 30);
        [-20, 20].forEach(function (x) { raya(x, 3, x, D + 10, pl, 0.32 * a, 2, 3); });
        [-30, 30].forEach(function (x) { raya(x, 3, x, D + 10, pl, 0.26 * a, 1, 4); });
        [-35, 35].forEach(function (x) { linea(x, 3, x, D + 10, pl, 0.4 * a, 30); });
      }

      /* los palos se levantan: finos, más claros abajo y perdiéndose
         hacia arriba, con el protector celeste al pie */
      var pr = reduced ? 1 : ease((t - 0.1) / 0.9);
      if (pr > 0) {
        var pw = clamp(s * 0.022, 2, 4);
        [-MEDIO, MEDIO].forEach(function (x) {
          var b0 = P(x, 0, D), yTop = -40, yb = b0[1], yt = yb + (yTop - yb) * pr;
          var ph = Math.min(90, (yb - yc) * 0.32), pwid = Math.min(13, Math.max(7, s * 0.06));
          ctx.fillStyle = "rgba(69,174,229," + (0.5 * a) + ")";
          ctx.fillRect(b0[0] - pwid / 2, yb - ph * Math.min(1, pr * 3), pwid, ph * Math.min(1, pr * 3));
          var gp = ctx.createLinearGradient(0, yb, 0, Math.min(yt, yb - 1));
          gp.addColorStop(0, "rgba(214,240,255," + (0.8 * a) + ")");
          gp.addColorStop(1, "rgba(214,240,255," + (0.18 * a) + ")");
          ctx.strokeStyle = gp; ctx.lineWidth = pw;
          ctx.beginPath(); ctx.moveTo(b0[0], yb); ctx.lineTo(b0[0], yt); ctx.stroke();
        });
        if (pr > 0.35) {
          var c0 = P(-MEDIO, 0, D), c1 = P(MEDIO, 0, D), cb = ease((pr - 0.35) / 0.4);
          ctx.strokeStyle = "rgba(214,240,255," + (0.8 * a) + ")"; ctx.lineWidth = pw;
          ctx.beginPath(); ctx.moveTo(c0[0], yc); ctx.lineTo(c0[0] + (c1[0] - c0[0]) * cb, yc); ctx.stroke();
        }
      }

      /* la patada */
      var tv = reduced ? 1 : clamp((t - 1.5) / 1.6, 0, 1);
      if (tv > 0 && meta.B.l - 26 > c - MEDIO * s + 40) {
        var e = easeIO(tv), N = 80;
        ctx.setLineDash([4, 7]);
        ctx.strokeStyle = "rgba(143,217,250," + (0.6 * a) + ")"; ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (var i = 0; i <= N * e; i++) {
          var q = tray(i / N);
          if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]);
        }
        ctx.stroke(); ctx.setLineDash([]);
        if (tv < 1) {
          var pb = tray(e), rb = pb[2];
          ctx.globalCompositeOperation = "lighter";
          var gb = ctx.createRadialGradient(pb[0], pb[1], 0, pb[0], pb[1], rb * 4);
          gb.addColorStop(0, "rgba(220,242,255,.7)"); gb.addColorStop(1, "rgba(120,200,250,0)");
          ctx.fillStyle = gb; ctx.fillRect(pb[0] - rb * 4, pb[1] - rb * 4, rb * 8, rb * 8);
          ctx.globalCompositeOperation = "source-over";
          ctx.fillStyle = "rgba(245,251,255,.95)";
          ctx.beginPath(); ctx.ellipse(pb[0], pb[1], rb * 1.3, rb * 0.82, -0.6, 0, 7); ctx.fill();
        }
        /* adentro: un destello donde cruzó y el travesaño se enciende */
        var tc = cruce(), dentro = reduced ? 1 : clamp((e - tc) / (1 - tc), 0, 1);
        if (dentro > 0 && dentro < 1) {
          var tq = tray(tc), pul = Math.sin(Math.PI * dentro);
          ctx.globalCompositeOperation = "lighter";
          var gd = ctx.createRadialGradient(tq[0], tq[1], 0, tq[0], tq[1], 60);
          gd.addColorStop(0, "rgba(160,225,255," + (0.28 * pul) + ")"); gd.addColorStop(1, "rgba(69,174,229,0)");
          ctx.fillStyle = gd; ctx.fillRect(tq[0] - 60, tq[1] - 60, 120, 120);
          var k0 = P(-MEDIO, 0, D)[0], k1 = P(MEDIO, 0, D)[0];
          ctx.strokeStyle = "rgba(143,217,250," + (0.22 * pul) + ")"; ctx.lineWidth = 7;
          ctx.beginPath(); ctx.moveTo(k0, yc); ctx.lineTo(k1, yc); ctx.stroke();
          ctx.globalCompositeOperation = "source-over";
        }
      }

      /* el formulario queda limpio: la cancha se apaga detrás */
      ctx.globalCompositeOperation = "destination-out";
      (hueco || []).forEach(function (Q, qi) {
        var m = 28, top = qi ? Q.t - m : Q.t - 6;
        ctx.fillStyle = "#000"; ctx.fillRect(Q.l, Q.t, Q.r - Q.l, Q.b - Q.t);
        var gl = ctx.createLinearGradient(Q.l - m, 0, Q.l, 0);
        gl.addColorStop(0, "rgba(0,0,0,0)"); gl.addColorStop(1, "#000");
        ctx.fillStyle = gl; ctx.fillRect(Q.l - m, top, m, Q.b + m - top);
        var gr = ctx.createLinearGradient(Q.r + m, 0, Q.r, 0);
        gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(1, "#000");
        ctx.fillStyle = gr; ctx.fillRect(Q.r, top, m, Q.b + m - top);
        var gt = ctx.createLinearGradient(0, top, 0, Q.t);
        gt.addColorStop(0, "rgba(0,0,0,0)"); gt.addColorStop(1, "#000");
        ctx.fillStyle = gt; ctx.fillRect(Q.l, top, Q.r - Q.l, Q.t - top);
        var gb2 = ctx.createLinearGradient(0, Q.b, 0, Q.b + m);
        gb2.addColorStop(0, "#000"); gb2.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = gb2; ctx.fillRect(Q.l, Q.b, Q.r - Q.l, m);
      });
      ctx.globalCompositeOperation = "source-over";
    }

    /* ---------------- entrada ---------------- */
    var FIN = 3.4, t0 = 0, raf = 0, empezo = false;
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
      }, { threshold: 0.6 });
      io.observe(titulo);
    } else arrancar();

    var to = 0, lw = 0;
    window.addEventListener("resize", function () {
      clearTimeout(to);
      to = setTimeout(function () {
        if (!empezo || window.innerWidth === lw) return;
        lw = window.innerWidth;
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
