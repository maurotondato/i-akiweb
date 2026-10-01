(function () {
  "use strict";
  /* ===========================================================
     CIMA — el ascenso
     Iñaki Etchegaray · M-DATOS

     Escena 3D real (proyección en perspectiva, z-buffer, geometría
     facetada) sobre un renderer WebGL2 propio. No se usa Three.js a
     propósito: son ~600 KB para un fondo, en un sitio sin build step.
     Acá alcanzan dos shaders y un heightfield estático.

     El canvas se dibuja CON ALPHA sobre el degradado del hero, que
     hace de cielo: la niebla no se pinta, se disuelve en el fondo de
     la página. Así la escena gana profundidad sin tocar un color del
     diseño ni comprometer la legibilidad del titular.

     Si no hay WebGL2 esto no monta nada y main.js cae al macizo 2D.
     =========================================================== */

  var V_TERRAIN = [
    "#version 300 es",
    "in vec3 aPos;",
    "uniform mat4 uVP;",
    "out vec3 vW;",
    "void main(){ vW = aPos; gl_Position = uVP * vec4(aPos, 1.0); }"
  ].join("\n");

  /* Normal por derivadas: caras planas sin duplicar un solo vértice. */
  var F_TERRAIN = [
    "#version 300 es",
    "precision highp float;",
    "in vec3 vW;",
    "uniform vec3 uCam, uSun, uRock, uAccent;",
    "uniform float uLight, uFogD, uContour;",
    "out vec4 o;",
    "void main(){",
    "  vec3 n = normalize(cross(dFdx(vW), dFdy(vW)));",
    "  if (n.y < 0.0) n = -n;",
    "  float key = max(dot(n, uSun), 0.0);",
    "  float sky = 0.5 + 0.5 * n.y;",
    "  vec3 col = uRock * (0.3 + 0.62 * sky);",
    "  col += vec3(1.0, 0.985, 0.96) * key * uLight * 0.66;",
    /* El acento de marca sólo donde la luz roza el filo de la cresta */
    "  col += uAccent * pow(key, 9.0) * uLight * 0.55;",
    /* Curvas de nivel: fwidth las apaga solas en los planos muy
       inclinados y a la distancia, así nunca muaren */
    "  float band = vW.y * 0.085;",
    "  float f = abs(fract(band) - 0.5);",
    "  float w = fwidth(band);",
    "  float line = 1.0 - smoothstep(w * 0.8, w * 2.4, f);",
    "  col += uAccent * line * uContour;",
    /* La niebla es transparencia: deja ver el degradado del hero */
    "  float a = clamp(exp(-pow(distance(vW, uCam) / uFogD, 2.2)), 0.0, 1.0);",
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
    "  p.y += sin(uT * 0.21 + aP.x * 0.07) * 2.4;",
    "  p.x += cos(uT * 0.16 + aP.z * 0.05) * 2.0;",
    "  gl_Position = uVP * vec4(p, 1.0);",
    "  float d = distance(p, uCam);",
    "  vA = (1.0 - smoothstep(26.0, 170.0, d)) * smoothstep(8.0, 26.0, d) * 0.42;",
    "  gl_PointSize = max(1.0, aS * uDpr * (52.0 / max(d, 18.0)));",
    "}"
  ].join("\n");

  var F_MOTE = [
    "#version 300 es",
    "precision mediump float;",
    "in float vA;",
    "uniform vec3 uTint;",
    "out vec4 o;",
    "void main(){",
    "  float r = length(gl_PointCoord - 0.5);",
    "  float a = vA * (1.0 - smoothstep(0.18, 0.5, r));",
    "  o = vec4(uTint * a, a);",
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
    for (var i = 0; i < oct; i++) { s += amp * vnoise(x * f, y * f); amp *= 0.5; f *= 2.02; }
    return s;
  }
  /* Crestas afiladas: 1-|n| da filos, no lomas */
  function ridged(x, y, oct) {
    var s = 0, amp = 0.5, f = 1;
    for (var i = 0; i < oct; i++) {
      var n = 1 - Math.abs(vnoise(x * f, y * f) * 2 - 1);
      s += amp * n * n; amp *= 0.5; f *= 2.03;
    }
    return s;
  }
  function sstep(a, b, x) {
    var t = (x - a) / (b - a);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return t * t * (3 - 2 * t);
  }
  function gauss(x, c, s) { var d = (x - c) / s; return Math.exp(-d * d); }

  /* ---------------- el relieve ----------------
     Todo se define RELATIVO a la linea de ojo de la camara en cada
     tramo. Modelado en absoluto, a media subida la camara superaba al
     terreno y el cuadro se vaciaba; atado al ojo, el macizo derecho
     domina siempre y la pared izquierda se hunde con el ascenso, que
     es lo que deja limpia la zona del titular.

     El corredor es mas ancho a la izquierda que a la derecha por la
     misma razon: el peso visual va donde no hay texto. */
  /* Compresion lateral del relieve. En retrato el encuadre es angosto
     y el macizo se iba de cuadro; comprimido, el canon queda ajustado
     y la escena llena la pantalla sin deformar la perspectiva. */
  var XS = 1;
  function eyeLine(z) {
    return 118 * sstep(0.02, 0.97, sstep(0, 250, z)) + 18;
  }
  function height(xw, z) {
    var x = xw / XS;
    var t = sstep(0, 250, z);
    var base = eyeLine(z) - 18;
    var eye = base + 18;

    /* El borde interno del macizo derecho se mantiene CERCA todo el
       ascenso: si se abre con el resto del canon, a media subida la
       masa queda lejos lateralmente y el centro del cuadro se vacia.
       La izquierda si se abre, y es lo que entrega la luz. */
    var hw = x < 0 ? 14 + 17 * t : 32 + 150 * t;
    var rise = sstep(hw * 0.55, hw + (x < 0 ? 26 : 70), Math.abs(x));

    /* Derecha: siempre por encima del ojo, es la masa que acompana.
       Izquierda: encajona al principio y despues se abre en meseta,
       nunca por debajo del valle o deja un pozo y el cuadro se vacia. */
    var top = x < 0
      ? eye + 76 - 22 * sstep(0.1, 1, t)
      : Math.max(base + 5, eye + 56 - 108 * sstep(0.04, 0.5, t));

    var h = base + (top - base) * rise;
    h += (7 + 26 * rise) * ridged(x * 0.0125, z * 0.0125, 4);
    h += 6 * fbm(x * 0.05, z * 0.05, 3);

    /* Estratos: la terraza da el aire escultorico, no geologico */
    var q = h / 7.5, qf = Math.floor(q);
    h = h * 0.72 + 0.28 * (qf * 7.5 + 7.5 * sstep(0.5, 0.96, q - qf));

    /* La cresta final queda apenas por debajo del ojo: se la ve venir
       y se la domina. Detras, el terreno cae y abre el horizonte, pero
       bien lejos del final del recorrido: si el corte queda cerca,
       borra justo la masa que tiene que cerrar el cuadro. */
    h += 22 * gauss(z, 238, 27) * gauss(x, -30, 76);
    /* El vacio se abre hacia el centro y la izquierda, no hacia la
       derecha: ahi el macizo tiene que seguir hasta el fondo. Es lo
       que al final encuadra la cima: luz y horizonte por un lado,
       una cordillera lejana sosteniendo el otro. */
    h -= 340 * sstep(262, 352, z) * (1 - sstep(-14, -78, x));
    return h;
  }

  /* ---------------- matrices ---------------- */
  function perspective(out, fovy, aspect, near, far) {
    var f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    out[0] = f / aspect; out[1] = 0; out[2] = 0; out[3] = 0;
    out[4] = 0; out[5] = f; out[6] = 0; out[7] = 0;
    out[8] = 0; out[9] = 0; out[10] = (far + near) * nf; out[11] = -1;
    out[12] = 0; out[13] = 0; out[14] = 2 * far * near * nf; out[15] = 0;
    return out;
  }
  function lookAt(out, eye, center, upY) {
    var zx = eye[0] - center[0], zy = eye[1] - center[1], zz = eye[2] - center[2];
    var l = Math.hypot(zx, zy, zz) || 1;
    zx /= l; zy /= l; zz /= l;
    var xx = upY[1] * zz - upY[2] * zy;
    var xy = upY[2] * zx - upY[0] * zz;
    var xz = upY[0] * zy - upY[1] * zx;
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
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn("[cima] shader:", gl.getShaderInfoLog(s));
      gl.deleteShader(s);
      return null;
    }
    return s;
  }
  function program(gl, vs, fs) {
    var v = compile(gl, gl.VERTEX_SHADER, vs), f = compile(gl, gl.FRAGMENT_SHADER, fs);
    if (!v || !f) return null;
    var p = gl.createProgram();
    gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p);
    gl.deleteShader(v); gl.deleteShader(f);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      console.warn("[cima] link:", gl.getProgramInfoLog(p));
      return null;
    }
    return p;
  }

  window.CIMA_mount = function (canvas) {
    if (!canvas) return false;
    var hero = canvas.closest(".hero") || canvas.parentNode;
    if (!hero) return false;

    var gl = null;
    try {
      gl = canvas.getContext("webgl2", {
        alpha: true, premultipliedAlpha: true,
        antialias: Math.min(window.innerWidth, window.innerHeight) >= 760,
        depth: true, stencil: false, failIfMajorPerformanceCaveat: false,
        powerPreference: "high-performance"
      });
    } catch (e) { return false; }
    if (!gl) return false;

    var reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    var fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
    var small = Math.min(window.innerWidth, window.innerHeight) < 760;

    var pT = program(gl, V_TERRAIN, F_TERRAIN);
    var pM = program(gl, V_MOTE, F_MOTE);
    if (!pT) return false;

    /* ---------------- malla ----------------
       La resolución en x se concentra cerca del eje del cañón, que es
       por donde pasa la cámara: la periferia se come menos triángulos
       y queda igual porque la niebla la borra. */
    /* Presupuesto base: en celular es otra escena, no la de desktop
       escalada. Misma idea —profundo, ascenso, luz, cima— con menos
       geometria y sin motas. */
    XS = small ? 0.6 : 1;
    var NX = small ? 84 : 148;
    var NZ = small ? 126 : 226;
    var XW = (small ? 124 : 196), Z0 = -34, Z1 = 364;

    var verts = new Float32Array((NX + 1) * (NZ + 1) * 3);
    var vi = 0, ix, iz;
    for (iz = 0; iz <= NZ; iz++) {
      var z = Z0 + (Z1 - Z0) * (iz / NZ);
      for (ix = 0; ix <= NX; ix++) {
        var u = ix / NX * 2 - 1;
        var x = Math.sign(u) * Math.pow(Math.abs(u), 1.65) * XW;
        verts[vi++] = x;
        verts[vi++] = height(x, z);
        verts[vi++] = z;
      }
    }
    var idx = new Uint32Array(NX * NZ * 6), ii = 0;
    for (iz = 0; iz < NZ; iz++) {
      for (ix = 0; ix < NX; ix++) {
        var a = iz * (NX + 1) + ix, b = a + 1, c = a + (NX + 1), d = c + 1;
        idx[ii++] = a; idx[ii++] = c; idx[ii++] = b;
        idx[ii++] = b; idx[ii++] = c; idx[ii++] = d;
      }
    }

    var vaoT = gl.createVertexArray();
    gl.bindVertexArray(vaoT);
    var vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    var locPos = gl.getAttribLocation(pT, "aPos");
    gl.enableVertexAttribArray(locPos);
    gl.vertexAttribPointer(locPos, 3, gl.FLOAT, false, 0, 0);
    var ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    gl.bindVertexArray(null);

    /* ---------------- motas en suspensión ---------------- */
    var NM = small ? 0 : 130;
    var vaoM = null, mbufP = null, mbufS = null;
    if (pM && NM) {
      var mp = new Float32Array(NM * 3), ms = new Float32Array(NM);
      for (var m = 0; m < NM; m++) {
        var mz = -20 + Math.random() * 280;
        mp[m * 3] = (Math.random() * 2 - 1) * 90;
        mp[m * 3 + 1] = height(mp[m * 3] * 0.3, mz) + 8 + Math.random() * 70;
        mp[m * 3 + 2] = mz;
        ms[m] = 0.9 + Math.random() * 1.9;
      }
      vaoM = gl.createVertexArray();
      gl.bindVertexArray(vaoM);
      mbufP = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, mbufP);
      gl.bufferData(gl.ARRAY_BUFFER, mp, gl.STATIC_DRAW);
      var lp = gl.getAttribLocation(pM, "aP");
      gl.enableVertexAttribArray(lp);
      gl.vertexAttribPointer(lp, 3, gl.FLOAT, false, 0, 0);
      mbufS = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, mbufS);
      gl.bufferData(gl.ARRAY_BUFFER, ms, gl.STATIC_DRAW);
      var lsz = gl.getAttribLocation(pM, "aS");
      gl.enableVertexAttribArray(lsz);
      gl.vertexAttribPointer(lsz, 1, gl.FLOAT, false, 0, 0);
      gl.bindVertexArray(null);
    }

    var U = {};
    ["uVP", "uCam", "uSun", "uRock", "uAccent", "uLight", "uFogD", "uContour"]
      .forEach(function (n) { U[n] = gl.getUniformLocation(pT, n); });
    var UM = {};
    if (pM) ["uVP", "uCam", "uT", "uDpr", "uTint"]
      .forEach(function (n) { UM[n] = gl.getUniformLocation(pM, n); });

    /* ---------------- cámara ----------------
       Recorrido autoral: de muy abajo y encajonada, a por encima de la
       cresta. La altura nunca baja del terreno + holgura, así la
       cámara no atraviesa geometría en ningún punto del trayecto. */
    function camera(p, out) {
      var e = p * p * (3 - 2 * p);
      var z = -14 + 216 * (0.22 * p + 0.78 * e);
      /* La camara deriva hacia el lado abierto: deja el macizo a la
         derecha de pantalla y lo encuadra en vez de meterse dentro */
      var x = (4 + 6 * Math.sin(p * 2.1) + 5 * p) * XS;
      var y = 9 + 134 * Math.pow(e, 1.12);
      /* Holgura sobre el terreno inmediato y el que viene: la camara
         no atraviesa geometria en ningun punto del recorrido */
      var floorH = Math.max(height(x, z), height(x, z + 12), height(x, z + 26));
      y = Math.max(y, floorH + 16);
      out.ex = x; out.ey = y; out.ez = z;
      /* Al principio miramos hacia arriba, buscando la salida; al
         final la mirada se nivela sobre el horizonte */
      out.tx = x * 0.35 + 5 * p;
      out.ty = y + 17 - 16 * sstep(0.45, 1, p);
      out.tz = z + 54;
    }

    var ROCK = [0.043, 0.157, 0.286];
    var ACCENT = [0.271, 0.682, 0.898];
    var proj = new Float32Array(16), view = new Float32Array(16), vp = new Float32Array(16);
    var cam = {};
    var W = 0, H = 0, DPR = 1;
    var MAXDPR = small ? 1 : 1.35, scale = 1;

    function resize() {
      var r = hero.getBoundingClientRect();
      W = Math.max(320, Math.round(r.width));
      H = Math.max(320, Math.round(r.height));
      DPR = Math.max(0.5, Math.min(window.devicePixelRatio || 1, MAXDPR) * scale);
      var cw = Math.round(W * DPR), ch = Math.round(H * DPR);
      if (canvas.width !== cw || canvas.height !== ch) {
        canvas.width = cw; canvas.height = ch;
      }
      gl.viewport(0, 0, cw, ch);
    }

    /* Calidad adaptativa: se mide el costo real de cuadro y la escena
       se repliega sola —primero resolucion, despues las motas— antes
       que entregar una experiencia a los tirones. Si ni asi alcanza,
       se desmonta y main.js cae al macizo 2D. */
    var acc = 0, frames = 0, steps = 0, giveUp = false;
    function governor(raw) {
      /* Se mide el costo REAL de cuadro, no el dt topado que usa la
         animacion: con el tope, el umbral de rendirse era inalcanzable */
      acc += raw; frames++;
      if (acc < 1.6) return;
      var avg = acc / frames;
      acc = 0; frames = 0;
      if (avg > 0.025 && steps < 3) {
        steps++;
        if (steps === 3) { NM = 0; }
        else { scale *= 0.74; resize(); }
      } else if (avg > 0.09 && steps >= 3) {
        giveUp = true;
      } else if (avg < 0.013 && steps > 0 && steps < 3) {
        steps--; scale /= 0.74; resize();
      }
    }

    function destroy() {
      cancelAnimationFrame(raf);
      try {
        gl.deleteBuffer(vbo); gl.deleteBuffer(ibo);
        if (mbufP) gl.deleteBuffer(mbufP);
        if (mbufS) gl.deleteBuffer(mbufS);
        gl.deleteVertexArray(vaoT);
        if (vaoM) gl.deleteVertexArray(vaoM);
        gl.deleteProgram(pT); if (pM) gl.deleteProgram(pM);
        var ext = gl.getExtension("WEBGL_lose_context");
        if (ext) ext.loseContext();
      } catch (e) {}
      hero.style.removeProperty("--veil");
      if (dawn) dawn.style.opacity = "0";
      canvas.width = canvas.height = 1;
    }

    /* El scroll empuja el ascenso, no lo gobierna: hay una marcha
       propia y lenta, y el scroll la adelanta. Todo pasa por un
       seguimiento suave, así un scroll brusco nunca salta. */
    var prog = 0, mxT = 0, myT = 0, mx = 0, my = 0;
    if (fine) {
      hero.addEventListener("pointermove", function (ev) {
        var r = hero.getBoundingClientRect();
        mxT = (ev.clientX - r.left) / r.width * 2 - 1;
        myT = (ev.clientY - r.top) / r.height * 2 - 1;
      });
      hero.addEventListener("pointerleave", function () { mxT = 0; myT = 0; });
    }

    function frame(time, dt) {
      var auto = Math.min(1, time / 27);
      var sc = (window.scrollY || 0) / Math.max(1, window.innerHeight * 1.35);
      var target = Math.min(1, auto + Math.min(sc, 1) * 0.92);
      prog += (target - prog) * Math.min(1, dt * 2.6);
      mx += (mxT - mx) * Math.min(1, dt * 2.2);
      my += (myT - my) * Math.min(1, dt * 2.2);
      render(time);
    }

    function render(time) {
      camera(prog, cam);
      /* Respiración ambiental: nunca se queda del todo quieta */
      var amb = Math.sin(time * 0.17) * 1.1;
      /* En retrato, un FOV vertical fijo deja un horizontal de ~11
         grados y la escena se va de cuadro: se fija un minimo
         horizontal y se deriva el vertical de el. */
      var aspect = W / H;
      var fov = (58 - 12 * prog) * Math.PI / 180;
      var minX = 42 * Math.PI / 180;
      if (2 * Math.atan(Math.tan(fov / 2) * aspect) < minX) {
        fov = 2 * Math.atan(Math.tan(minX / 2) / aspect);
      }
      perspective(proj, fov, aspect, 0.8, 620);
      lookAt(view, [cam.ex - mx * 1.2, cam.ey + amb + my * 1.6, cam.ez],
        [cam.tx - mx * 5.5, cam.ty + amb * 0.6 - my * 4.2, cam.tz], [0, 1, 0]);
      mul(vp, proj, view);

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

      /* El sol nace detrás de la cresta y va ganando altura */
      /* El sol entra por el lado del macizo: la luz rompe sobre la cresta */
      var sy = 0.07 + 0.4 * prog, sz = 0.94 - 0.1 * prog;
      var sl = Math.hypot(0.32, sy, sz);

      gl.useProgram(pT);
      gl.uniformMatrix4fv(U.uVP, false, vp);
      gl.uniform3f(U.uCam, cam.ex, cam.ey, cam.ez);
      gl.uniform3f(U.uSun, -0.32 / sl, sy / sl, sz / sl);
      gl.uniform3fv(U.uRock, ROCK);
      gl.uniform3fv(U.uAccent, ACCENT);
      gl.uniform1f(U.uLight, 0.26 + 0.92 * prog);
      gl.uniform1f(U.uFogD, 112 + 104 * prog);
      gl.uniform1f(U.uContour, 0.1 + 0.13 * prog);
      gl.bindVertexArray(vaoT);
      gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_INT, 0);

      if (pM && vaoM && NM) {
        gl.depthMask(false);
        gl.useProgram(pM);
        gl.uniformMatrix4fv(UM.uVP, false, vp);
        gl.uniform3f(UM.uCam, cam.ex, cam.ey, cam.ez);
        gl.uniform1f(UM.uT, time);
        gl.uniform1f(UM.uDpr, DPR);
        gl.uniform3f(UM.uTint, 0.78, 0.88, 0.97);
        gl.bindVertexArray(vaoM);
        gl.drawArrays(gl.POINTS, 0, NM);
        gl.depthMask(true);
      }
      gl.bindVertexArray(null);

      if (dawn) dawn.style.opacity = (Math.max(0, prog - 0.42) / 0.58 * 0.62).toFixed(3);
      /* Abajo la escena es profunda y oscura: el velo protege el
         titular y se afloja solo a medida que se gana altura y luz */
      hero.style.setProperty("--veil", (1 - 0.42 * sstep(0.25, 0.85, prog)).toFixed(3));
    }

    var dawn = hero.querySelector("[data-dawn]");
    var running = true, raf = 0, lost = false;

    resize();
    if (reduced) {
      /* Sin bucle: una sola toma, ya arriba y abierta */
      prog = 0.78;
      render(0);
      return true;
    }


    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (es) { running = es[0].isIntersecting; },
        { threshold: 0 }).observe(hero);
    }
    canvas.addEventListener("webglcontextlost", function (ev) {
      ev.preventDefault(); lost = true; cancelAnimationFrame(raf);
      if (window.CIMA_fallback) window.CIMA_fallback();
    });

    var t0 = performance.now(), prev = t0;
    (function loop(now) {
      raf = requestAnimationFrame(loop);
      if (lost) return;
      if (giveUp) { destroy(); if (window.CIMA_fallback) window.CIMA_fallback(); return; }
      var raw = (now - prev) / 1000;
      prev = now;
      if (running) { frame((now - t0) / 1000, Math.min(0.05, raw)); governor(raw); }
    })(t0);

    var to;
    window.addEventListener("resize", function () {
      clearTimeout(to);
      to = setTimeout(resize, 160);
    }, { passive: true });

    return true;
  };
})();
