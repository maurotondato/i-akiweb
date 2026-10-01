(function () {
  "use strict";
  /* ===========================================================
     CIMA — una pieza escultórica
     Iñaki Etchegaray · M-DATOS

     Un solo macizo abstracto detrás del hero, visto DESDE AFUERA y con
     cámara casi fija. La versión anterior metía la cámara dentro de un
     cañón: desde adentro nunca hay silueta, y una montaña se reconoce
     por su silueta. Además el terreno visto en ángulo rasante producía
     overdraw y triángulos astilla, que es de donde venían los tirones.

     Renderer WebGL2 propio, sin Three.js: son ~600 KB para un fondo en
     un sitio sin build step, y lo necesario entra acá. Una sola llamada
     de dibujo, geometría estática, cámara quieta.

     El canvas se compone CON ALPHA sobre el degradado del hero: la base
     del macizo se disuelve en el fondo de la página en vez de cortarse,
     así la pieza se siente más grande que el viewport.
     =========================================================== */

  var VS = [
    "#version 300 es",
    "in vec3 aPos;",
    "uniform mat4 uVP;",
    "out vec3 vW;",
    "void main(){ vW = aPos; gl_Position = uVP * vec4(aPos, 1.0); }"
  ].join("\n");

  var FS = [
    "#version 300 es",
    "precision highp float;",
    "in vec3 vW;",
    "uniform vec3 uCam, uSun, uRock, uAccent;",
    "uniform float uLight, uPeak, uBandY, uFade, uFogD;",
    "out vec4 o;",
    "void main(){",
    /* Normal por derivadas: caras planas sin duplicar un vértice */
    "  vec3 n = normalize(cross(dFdx(vW), dFdy(vW)));",
    "  if (n.y < 0.0) n = -n;",
    "  float key = max(dot(n, uSun), 0.0);",
    "  float sky = 0.5 + 0.5 * n.y;",
    "  float steep = smoothstep(0.78, 0.16, n.y);",
    /* Base mate: la luz es la que revela la geometría, no el material */
    "  vec3 col = uRock * (0.26 + 0.34 * sky);",
    "  col += vec3(0.94, 0.955, 0.98) * key * uLight * 0.44;",
    /* La cumbre recibe algo más de luz. Eso es CIMA. */
    "  float top = smoothstep(uPeak * 0.44, uPeak * 0.98, vW.y);",
    "  col += vec3(1.0, 0.99, 0.96) * top * key * uLight * 0.3;",
    /* Acento de marca sólo en el filo que mira a la luz */
    "  col += uAccent * pow(key, 10.0) * steep * uLight * 0.5;",
    /* Una luz fina que sube por las aristas: el camino a la cima */
    "  float band = exp(-pow((vW.y - uBandY) / (uPeak * 0.055), 2.0));",
    "  col += uAccent * band * steep * pow(key, 2.0) * 0.36;",
    /* Curvas de nivel; fwidth las apaga solas en los planos muy
       inclinados y a la distancia, así nunca muaren */
    "  float b = vW.y * 0.09;",
    "  float f = abs(fract(b) - 0.5);",
    "  float w = fwidth(b);",
    "  col += uAccent * (1.0 - smoothstep(w * 0.8, w * 2.4, f)) * 0.11;",
    /* La base se disuelve en el fondo de la página, no se corta */
    /* La base se disuelve en el fondo de la pagina en vez de cortarse.
       El umbral se ondula con la posicion: un corte por altura pura
       proyecta un plano, y con la camara nivelada eso es una recta
       perfectamente visible al pie del macizo. */
    "  float jit = sin(vW.x * 0.055) * 7.0 + cos(vW.z * 0.047) * 6.0;",
    "  float a = smoothstep(-14.0, uFade, vW.y + jit);",
    "  a *= clamp(exp(-pow(distance(vW, uCam) / uFogD, 2.4)), 0.0, 1.0);",
    "  o = vec4(col * a, a);",
    "}"
  ].join("\n");

  var V_MOTE = [
    "#version 300 es",
    "in vec3 aP; in float aS;",
    "uniform mat4 uVP; uniform vec3 uCam; uniform float uT, uDpr;",
    "out float vA;",
    "void main(){",
    "  vec3 p = aP;",
    "  p.y += sin(uT * 0.19 + aP.x * 0.03) * 3.0;",
    "  p.x += cos(uT * 0.14 + aP.z * 0.02) * 2.4;",
    "  gl_Position = uVP * vec4(p, 1.0);",
    "  float d = distance(p, uCam);",
    "  vA = (1.0 - smoothstep(120.0, 330.0, d)) * 0.3;",
    "  gl_PointSize = max(1.0, aS * uDpr * (130.0 / max(d, 60.0)));",
    "}"
  ].join("\n");

  var F_MOTE = [
    "#version 300 es",
    "precision mediump float;",
    "in float vA;",
    "out vec4 o;",
    "void main(){",
    "  float a = vA * (1.0 - smoothstep(0.16, 0.5, length(gl_PointCoord - 0.5)));",
    "  o = vec4(vec3(0.8, 0.88, 0.96) * a, a);",
    "}"
  ].join("\n");

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

  /* ---------------- el macizo ----------------
     Una cumbre principal, un hombro más bajo, y espolones que bajan
     desde la cima. El ruido angular entra por cos/sen del ángulo —no
     por el ángulo directo— para que no quede una costura en el eje.
     Los bordes se desploman: así no aparece un suelo plano alrededor,
     que es lo que delata una maqueta. */
  var R = 100, PEAK = 92;
  function surface(x, z) {
    var nx = x / R, nz = z / R;
    var d1 = Math.hypot(nx - 0.06, nz + 0.04);
    var d2 = Math.hypot(nx + 0.6, nz - 0.3);
    var c1 = Math.pow(Math.max(0, 1 - d1), 1.45);
    var c2 = 0.58 * Math.pow(Math.max(0, 1 - d2 / 0.66), 1.6);
    var h = Math.max(c1, c2);

    var ang = Math.atan2(nz, nx);
    var spur = ridged(Math.cos(ang) * 2.7 + 7.3, Math.sin(ang) * 2.7 + 3.1, 4);
    h *= 0.68 + 0.5 * spur;

    h += 0.11 * ridged(nx * 2.3, nz * 2.3, 4) * Math.max(0, 1 - d1 * 0.85);
    h -= 0.055 * fbm(nx * 3.6, nz * 3.6, 3);

    /* Estratos: aire escultórico, no geológico */
    var q = h / 0.07, qf = Math.floor(q);
    h = h * 0.76 + 0.24 * (qf * 0.07 + 0.07 * sstep(0.52, 0.95, q - qf));

    h -= 1.5 * sstep(0.92, 1.3, Math.hypot(nx, nz));
    return h * PEAK;
  }

  /* ---------------- matrices ---------------- */
  function perspective(out, fovy, aspect, near, far, sx, sy) {
    var f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    out[0] = f / aspect; out[1] = 0; out[2] = 0; out[3] = 0;
    out[4] = 0; out[5] = f; out[6] = 0; out[7] = 0;
    /* Desplazamiento de lente: encuadra el macizo sin inclinar la
       cámara, así la perspectiva no se deforma */
    out[8] = sx; out[9] = sy; out[10] = (far + near) * nf; out[11] = -1;
    out[12] = 0; out[13] = 0; out[14] = 2 * far * near * nf; out[15] = 0;
    return out;
  }
  function lookAt(out, eye, c) {
    var zx = eye[0] - c[0], zy = eye[1] - c[1], zz = eye[2] - c[2];
    var l = Math.hypot(zx, zy, zz) || 1;
    zx /= l; zy /= l; zz /= l;
    var xx = zz, xy = 0, xz = -zx;
    l = Math.hypot(xx, xy, xz) || 1;
    xx /= l; xy /= l; xz /= l;
    var yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0;
    out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0;
    out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0;
    out[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
    out[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
    out[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
    out[15] = 1;
    return out;
  }
  function mul(out, a, b) {
    for (var c = 0; c < 4; c++) {
      var b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
      out[c * 4] = b0 * a[0] + b1 * a[4] + b2 * a[8] + b3 * a[12];
      out[c * 4 + 1] = b0 * a[1] + b1 * a[5] + b2 * a[9] + b3 * a[13];
      out[c * 4 + 2] = b0 * a[2] + b1 * a[6] + b2 * a[10] + b3 * a[14];
      out[c * 4 + 3] = b0 * a[3] + b1 * a[7] + b2 * a[11] + b3 * a[15];
    }
    return out;
  }

  function compile(gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn("[cima]", gl.getShaderInfoLog(s)); gl.deleteShader(s); return null;
    }
    return s;
  }
  function program(gl, vs, fs) {
    var v = compile(gl, gl.VERTEX_SHADER, vs), f = compile(gl, gl.FRAGMENT_SHADER, fs);
    if (!v || !f) return null;
    var p = gl.createProgram();
    gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p);
    gl.deleteShader(v); gl.deleteShader(f);
    return gl.getProgramParameter(p, gl.LINK_STATUS) ? p : null;
  }

  window.CIMA_mount = function (canvas) {
    if (!canvas) return false;
    var hero = canvas.closest(".hero") || canvas.parentNode;
    if (!hero) return false;

    /* Por ANCHO, no por el menor de los dos lados: con min(w,h) una
       laptop de 13" a 1280x720 caia en la rama de celular y recibia el
       encuadre equivocado. */
    var small = window.innerWidth < 760;
    var gl = null;
    try {
      gl = canvas.getContext("webgl2", {
        alpha: true, premultipliedAlpha: true, antialias: !small,
        depth: true, stencil: false, powerPreference: "high-performance"
      });
    } catch (e) { return false; }
    if (!gl) return false;

    var reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    var fine = matchMedia("(hover: hover) and (pointer: fine)").matches;

    var pT = program(gl, VS, FS);
    if (!pT) return false;
    var pM = small ? null : program(gl, V_MOTE, F_MOTE);

    /* ---------------- malla ----------------
       Rejilla con alabeo suave hacia el centro: más resolución donde
       está la cumbre, menos en la falda que igual se desvanece. */
    var N = small ? 96 : 156;
    var EXT = R * 1.3;
    var verts = new Float32Array((N + 1) * (N + 1) * 3), vi = 0, i, j;
    var warp = function (t) {
      var u = t / N * 2 - 1;
      return Math.sign(u) * Math.pow(Math.abs(u), 1.22) * EXT;
    };
    for (j = 0; j <= N; j++) {
      var zz = warp(j);
      for (i = 0; i <= N; i++) {
        var xx = warp(i);
        verts[vi++] = xx; verts[vi++] = surface(xx, zz); verts[vi++] = zz;
      }
    }
    var idx = new Uint32Array(N * N * 6), ii = 0;
    for (j = 0; j < N; j++) {
      for (i = 0; i < N; i++) {
        var a = j * (N + 1) + i, b = a + 1, c = a + (N + 1), d = c + 1;
        idx[ii++] = a; idx[ii++] = c; idx[ii++] = b;
        idx[ii++] = b; idx[ii++] = c; idx[ii++] = d;
      }
    }

    var vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    var vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(gl.getAttribLocation(pT, "aPos"));
    gl.vertexAttribPointer(gl.getAttribLocation(pT, "aPos"), 3, gl.FLOAT, false, 0, 0);
    var ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    gl.bindVertexArray(null);

    /* Polvo atmosférico: contadísimo, sólo para que el aire no esté muerto */
    var NM = pM ? 90 : 0, vaoM = null, mb1 = null, mb2 = null;
    if (NM) {
      var mp = new Float32Array(NM * 3), ms = new Float32Array(NM);
      for (i = 0; i < NM; i++) {
        mp[i * 3] = (Math.random() * 2 - 1) * 190;
        mp[i * 3 + 1] = 10 + Math.random() * 150;
        mp[i * 3 + 2] = (Math.random() * 2 - 1) * 190;
        ms[i] = 0.8 + Math.random() * 1.6;
      }
      vaoM = gl.createVertexArray();
      gl.bindVertexArray(vaoM);
      mb1 = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, mb1);
      gl.bufferData(gl.ARRAY_BUFFER, mp, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(gl.getAttribLocation(pM, "aP"));
      gl.vertexAttribPointer(gl.getAttribLocation(pM, "aP"), 3, gl.FLOAT, false, 0, 0);
      mb2 = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, mb2);
      gl.bufferData(gl.ARRAY_BUFFER, ms, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(gl.getAttribLocation(pM, "aS"));
      gl.vertexAttribPointer(gl.getAttribLocation(pM, "aS"), 1, gl.FLOAT, false, 0, 0);
      gl.bindVertexArray(null);
    }

    var U = {};
    ["uVP", "uCam", "uSun", "uRock", "uAccent", "uLight", "uPeak", "uBandY", "uFade", "uFogD"]
      .forEach(function (n) { U[n] = gl.getUniformLocation(pT, n); });
    var UM = {};
    if (pM) ["uVP", "uCam", "uT", "uDpr"].forEach(function (n) { UM[n] = gl.getUniformLocation(pM, n); });

    var ROCK = [0.039, 0.145, 0.263];
    var ACCENT = [0.271, 0.682, 0.898];
    var proj = new Float32Array(16), view = new Float32Array(16), vp = new Float32Array(16);
    /* Con MSAA activo, subir el pixel ratio multiplica el costo de
       relleno, que es lo que ahoga a una grafica integrada. 1.25 con
       multimuestreo rinde mas que 1.5 sin el. */
    var W = 0, H = 0, DPR = 1, MAXDPR = small ? 1 : 1.25, quality = 1;
    var dawn = hero.querySelector("[data-dawn]");

    function resize() {
      var r = hero.getBoundingClientRect();
      W = Math.max(320, Math.round(r.width));
      H = Math.max(320, Math.round(r.height));
      DPR = Math.max(0.6, Math.min(window.devicePixelRatio || 1, MAXDPR) * quality);
      var cw = Math.round(W * DPR), ch = Math.round(H * DPR);
      if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
      gl.viewport(0, 0, cw, ch);
    }

    var mxT = 0, myT = 0, mx = 0, my = 0;
    if (fine) {
      hero.addEventListener("pointermove", function (e) {
        var r = hero.getBoundingClientRect();
        mxT = (e.clientX - r.left) / r.width * 2 - 1;
        myT = (e.clientY - r.top) / r.height * 2 - 1;
      });
      hero.addEventListener("pointerleave", function () { mxT = 0; myT = 0; });
    }

    function render(t) {
      var aspect = W / H;
      /* Encuadre: en desktop el volumen va a la derecha, que es donde no
         hay texto; apilado, abajo y algo más cerca. */
      var sx = small ? 0.1 : -0.62;
      var sy = small ? 0.66 : 0.24;
      var dist = small ? 278 : 268;
      var fov = (small ? 36 : 31) * Math.PI / 180;
      if (aspect < 1) fov = 2 * Math.atan(Math.tan(fov / 2) / aspect) * 0.62;

      /* Movimiento: órbita mínima y respiración. Nada de vuelo. */
      var az = (small ? -0.34 : -0.46) + Math.sin(t * 0.055) * 0.035 + mx * 0.028;
      var el = 0.235 + Math.sin(t * 0.041) * 0.012 - my * 0.022;
      var dd = dist * (1 + Math.sin(t * 0.032) * 0.012);
      var ex = Math.sin(az) * Math.cos(el) * dd;
      var ey = Math.sin(el) * dd + PEAK * 0.3;
      var ez = Math.cos(az) * Math.cos(el) * dd;

      perspective(proj, fov, aspect, 1, 1400, sx, sy);
      lookAt(view, [ex, ey, ez], [0, PEAK * 0.42, 0]);
      mul(vp, proj, view);

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

      /* Luz diagonal, fija. Respira muy poco. */
      var sl = Math.hypot(0.62, 0.52, 0.58);
      gl.useProgram(pT);
      gl.uniformMatrix4fv(U.uVP, false, vp);
      gl.uniform3f(U.uCam, ex, ey, ez);
      gl.uniform3f(U.uSun, 0.62 / sl, 0.52 / sl, 0.58 / sl);
      gl.uniform3fv(U.uRock, ROCK);
      gl.uniform3fv(U.uAccent, ACCENT);
      gl.uniform1f(U.uLight, 0.92 + Math.sin(t * 0.09) * 0.07);
      gl.uniform1f(U.uPeak, PEAK);
      /* La luz sube por las aristas y descansa: ciclo largo */
      var cyc = (t % 17) / 17;
      gl.uniform1f(U.uBandY, -PEAK * 0.3 + PEAK * 1.7 * sstep(0, 0.62, cyc));
      gl.uniform1f(U.uFade, PEAK * 0.52);
      gl.uniform1f(U.uFogD, 520);
      gl.bindVertexArray(vao);
      gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_INT, 0);

      if (NM) {
        gl.depthMask(false);
        gl.useProgram(pM);
        gl.uniformMatrix4fv(UM.uVP, false, vp);
        gl.uniform3f(UM.uCam, ex, ey, ez);
        gl.uniform1f(UM.uT, t);
        gl.uniform1f(UM.uDpr, DPR);
        gl.bindVertexArray(vaoM);
        gl.drawArrays(gl.POINTS, 0, NM);
        gl.depthMask(true);
      }
      gl.bindVertexArray(null);

      if (dawn) dawn.style.opacity = (0.3 + 0.1 * Math.sin(t * 0.09)).toFixed(3);
    }

    resize();
    if (reduced) { render(3.2); return true; }

    var running = true, raf = 0, lost = false;
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (es) { running = es[0].isIntersecting; },
        { threshold: 0 }).observe(hero);
    }

    function destroy() {
      cancelAnimationFrame(raf);
      try {
        gl.deleteBuffer(vbo); gl.deleteBuffer(ibo);
        if (mb1) gl.deleteBuffer(mb1);
        if (mb2) gl.deleteBuffer(mb2);
        gl.deleteVertexArray(vao);
        if (vaoM) gl.deleteVertexArray(vaoM);
        gl.deleteProgram(pT); if (pM) gl.deleteProgram(pM);
        var ext = gl.getExtension("WEBGL_lose_context");
        if (ext) ext.loseContext();
      } catch (e) {}
      if (dawn) dawn.style.opacity = "0";
      canvas.width = canvas.height = 1;
    }

    canvas.addEventListener("webglcontextlost", function (ev) {
      ev.preventDefault(); lost = true; cancelAnimationFrame(raf);
      if (window.CIMA_fallback) window.CIMA_fallback();
    });

    /* Calidad: UNA sola medición tras el arranque y a lo sumo un ajuste.
       El esquema anterior remedía cada 1.6 s y redimensionaba el buffer,
       que reasigna memoria de GPU y era en sí mismo fuente de tirones. */
    var acc = 0, frames = 0, settled = false;

    var t0 = performance.now(), prev = t0;
    (function loop(now) {
      raf = requestAnimationFrame(loop);
      if (lost) return;
      var raw = (now - prev) / 1000;
      prev = now;
      if (!running) return;
      var t = (now - t0) / 1000;
      mx += (mxT - mx) * Math.min(1, raw * 1.7);
      my += (myT - my) * Math.min(1, raw * 1.7);
      render(t);

      if (!settled && t > 1.2) {
        acc += raw; frames++;
        if (acc > 2.2) {
          settled = true;
          var avg = acc / frames;
          if (avg > 0.09) { destroy(); if (window.CIMA_fallback) window.CIMA_fallback(); }
          else if (avg > 0.026) { quality = 0.68; NM = 0; resize(); }
        }
      }
    })(t0);

    var to;
    window.addEventListener("resize", function () {
      clearTimeout(to);
      to = setTimeout(resize, 180);
    }, { passive: true });

    return true;
  };
})();
