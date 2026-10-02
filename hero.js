(function () {
  "use strict";
  /* ===========================================================
     CIMA — energía contenida
     Iñaki Etchegaray · M-DATOS

     Una sola forma. Toda la complejidad está en la animación.

     Una esfera de superficie finísima, deformada en el vertex shader
     por ruido de gradiente 3D, recorriendo un ciclo de energía:
     reposo → acumulación → tensión → expansión → liberación → reposo.
     Alrededor, un aro quirúrgico que se tensa y se separa en el
     estallido. El puntero abre un campo de fuerza local que cede
     despacio. El scroll sube la energía base.

     WebGL2 propio, sin Three.js: son ~600 KB para una esfera en un
     sitio sin build step. Acá entran tres programas y un framebuffer.

     Sobre el fondo claro de la página, el "bloom" clásico no sirve
     —sumar luz sobre blanco no se ve—. El pase de post hace lo
     inverso: difunde la forma oscura en un halo suave por detrás.
     =========================================================== */

  /* ---------- ruido de gradiente 3D, compartido por los shaders ---------- */
  var NOISE = [
    "vec3 hash3(vec3 p){",
    "  p = vec3(dot(p,vec3(127.1,311.7,74.7)),",
    "           dot(p,vec3(269.5,183.3,246.1)),",
    "           dot(p,vec3(113.5,271.9,124.6)));",
    "  return -1.0 + 2.0*fract(sin(p)*43758.5453123);",
    "}",
    "float gnoise(vec3 p){",
    "  vec3 i = floor(p), f = fract(p);",
    "  vec3 u = f*f*(3.0-2.0*f);",
    "  return mix(mix(mix(dot(hash3(i+vec3(0,0,0)), f-vec3(0,0,0)),",
    "                     dot(hash3(i+vec3(1,0,0)), f-vec3(1,0,0)), u.x),",
    "                 mix(dot(hash3(i+vec3(0,1,0)), f-vec3(0,1,0)),",
    "                     dot(hash3(i+vec3(1,1,0)), f-vec3(1,1,0)), u.x), u.y),",
    "             mix(mix(dot(hash3(i+vec3(0,0,1)), f-vec3(0,0,1)),",
    "                     dot(hash3(i+vec3(1,0,1)), f-vec3(1,0,1)), u.x),",
    "                 mix(dot(hash3(i+vec3(0,1,1)), f-vec3(0,1,1)),",
    "                     dot(hash3(i+vec3(1,1,1)), f-vec3(1,1,1)), u.x), u.y), u.z);",
    "}",
    "float fbm(vec3 p){",
    "  float s = 0.0, a = 0.5;",
    "  for (int i = 0; i < 3; i++) { s += a*gnoise(p); p *= 2.03; a *= 0.5; }",
    "  return s;",
    "}"
  ].join("\n");

  /* El campo que desplaza la superficie. Tres evaluaciones por vértice
     dan la normal analítica, que es lo que permite que la luz revele
     la deformación en vez de aplanarla. */
  var FIELD = [
    "uniform float uTime, uFreq, uBurst, uRipple, uForceAmt;",
    "uniform vec3 uForce;",
    "float field(vec3 d){",
    "  float n = fbm(d*uFreq + vec3(0.0, uTime*0.1, uTime*0.065));",
    /* Frente de liberación recorriendo la esfera */
    "  float band = exp(-pow((dot(d, vec3(0.18,0.96,0.2)) - uRipple)*2.6, 2.0));",
    "  n += band * uBurst;",
    /* Campo de fuerza del puntero: una depresión local y blanda */
    "  float f = max(0.0, dot(d, uForce));",
    "  n -= pow(f, 5.0) * uForceAmt;",
    "  return n;",
    "}"
  ].join("\n");

  var VS_SPHERE = [
    "#version 300 es",
    "precision highp float;",
    "in vec3 aPos;",
    "uniform mat4 uVP;",
    "uniform vec3 uCenter;",
    "uniform float uAmp, uRadius;",
    "out vec3 vN; out vec3 vW; out float vH;",
    NOISE, FIELD,
    "void main(){",
    "  vec3 d = normalize(aPos);",
    "  float h = field(d);",
    /* Normal analítica: se desplazan dos tangentes y se cruza */
    "  vec3 up = abs(d.y) < 0.95 ? vec3(0.0,1.0,0.0) : vec3(1.0,0.0,0.0);",
    "  vec3 t1 = normalize(cross(d, up));",
    "  vec3 t2 = cross(d, t1);",
    "  vec3 da = normalize(d + t1*0.035);",
    "  vec3 db = normalize(d + t2*0.035);",
    "  vec3 P  = d  * (uRadius + uAmp*h);",
    "  vec3 Pa = da * (uRadius + uAmp*field(da));",
    "  vec3 Pb = db * (uRadius + uAmp*field(db));",
    "  vec3 n = normalize(cross(Pa - P, Pb - P));",
    "  if (dot(n, d) < 0.0) n = -n;",
    "  vW = uCenter + P;",
    "  vN = n;",
    "  vH = h;",
    "  gl_Position = uVP * vec4(vW, 1.0);",
    "}"
  ].join("\n");

  var FS_SPHERE = [
    "#version 300 es",
    "precision highp float;",
    "in vec3 vN; in vec3 vW; in float vH;",
    "uniform vec3 uCam, uKey, uDeep, uMid, uRim;",
    "uniform float uE;",
    "out vec4 o;",
    "void main(){",
    "  vec3 N = normalize(vN);",
    "  vec3 V = normalize(uCam - vW);",
    "  float lam = max(dot(N, uKey), 0.0);",
    /* abs(): se dibujan las dos caras y las normales van todas hacia
       afuera, así que sin el valor absoluto el hemisferio trasero daba
       fresnel = 1 y rellenaba el disco entero. */
    "  float fres = pow(1.0 - abs(dot(N, V)), 3.4);",
    /* Superficie finísima: el cuerpo apenas se insinúa y el borde
       define la silueta, que es donde la deformación más se lee. */
    /* Casi todo el peso en el borde: así se lee una cáscara finísima
       y no una bola sólida. Se dibujan las dos caras, de modo que el
       borde suma dos veces y gana densidad solo donde corresponde. */
    "  float a = 0.014 + 0.8 * fres;",
    "  vec3 col = mix(uDeep, uMid, lam);",
    "  col = mix(col, uRim, fres * (0.5 + 0.5*uE));",
    "  col += uRim * pow(lam, 9.0) * 0.22 * uE;",
    "  col += uRim * smoothstep(0.05, 0.45, vH) * 0.14 * uE;",
    "  a *= 0.5 + 0.5*uE;",
    "  a = clamp(a, 0.0, 1.0);",
    "  o = vec4(col * a, a);",
    "}"
  ].join("\n");

  /* El aro: una cinta finísima encarada a cámara, con su propio
     radio por ángulo. Se tensa, se separa y vuelve a integrarse. */
  var VS_RING = [
    "#version 300 es",
    "precision highp float;",
    "in vec2 aRing;",             /* x: ángulo 0..1 · y: lado -1/1 */
    "uniform mat4 uVP;",
    "uniform vec3 uCenter, uRight, uUp;",
    "uniform float uRingR, uRingW, uTime, uRingWob, uDetach;",
    NOISE,
    "out float vA;",
    "void main(){",
    "  float a = aRing.x * 6.28318530718;",
    "  vec3 dir = uRight*cos(a) + uUp*sin(a);",
    "  float wob = fbm(vec3(cos(a)*1.6, sin(a)*1.6, uTime*0.22)) * uRingWob;",
    "  float r = uRingR * (1.0 + wob + uDetach);",
    "  vec3 p = uCenter + dir * (r + aRing.y * uRingW);",
    "  vA = 1.0;",
    "  gl_Position = uVP * vec4(p, 1.0);",
    "}"
  ].join("\n");

  var FS_RING = [
    "#version 300 es",
    "precision highp float;",
    "in float vA;",
    "uniform vec3 uRim; uniform float uRingA;",
    "out vec4 o;",
    "void main(){ float a = uRingA; o = vec4(uRim * a, a); }"
  ].join("\n");

  /* Pase de post: copia y desenfoque separable sobre el framebuffer */
  var VS_QUAD = [
    "#version 300 es",
    "in vec2 aQ; out vec2 vUV;",
    "void main(){ vUV = aQ*0.5+0.5; gl_Position = vec4(aQ,0.0,1.0); }"
  ].join("\n");

  var FS_QUAD = [
    "#version 300 es",
    "precision highp float;",
    "in vec2 vUV; out vec4 o;",
    "uniform sampler2D uTex; uniform vec2 uDir; uniform float uAlpha;",
    "void main(){",
    "  if (uDir.x == 0.0 && uDir.y == 0.0) { o = texture(uTex, vUV) * uAlpha; return; }",
    "  vec4 s = texture(uTex, vUV) * 0.2270270270;",
    "  s += (texture(uTex, vUV + uDir*1.3846153846) + texture(uTex, vUV - uDir*1.3846153846)) * 0.3162162162;",
    "  s += (texture(uTex, vUV + uDir*3.2307692308) + texture(uTex, vUV - uDir*3.2307692308)) * 0.0702702703;",
    "  o = s * uAlpha;",
    "}"
  ].join("\n");

  /* ---------------- icoesfera ---------------- */
  function icosphere(div) {
    var t = (1 + Math.sqrt(5)) / 2;
    var v = [[-1,t,0],[1,t,0],[-1,-t,0],[1,-t,0],[0,-1,t],[0,1,t],
             [0,-1,-t],[0,1,-t],[t,0,-1],[t,0,1],[-t,0,-1],[-t,0,1]];
    for (var i = 0; i < v.length; i++) {
      var l = Math.hypot(v[i][0], v[i][1], v[i][2]);
      v[i] = [v[i][0]/l, v[i][1]/l, v[i][2]/l];
    }
    var f = [[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],
             [11,10,2],[10,7,6],[7,1,8],[3,9,4],[3,4,2],[3,2,6],[3,6,8],
             [3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];
    for (var d = 0; d < div; d++) {
      var nf = [], cache = {};
      function mid(a, b) {
        var k = a < b ? a + "_" + b : b + "_" + a;
        if (cache[k] !== undefined) return cache[k];
        var p = [(v[a][0]+v[b][0]), (v[a][1]+v[b][1]), (v[a][2]+v[b][2])];
        var l = Math.hypot(p[0], p[1], p[2]);
        v.push([p[0]/l, p[1]/l, p[2]/l]);
        return (cache[k] = v.length - 1);
      }
      for (i = 0; i < f.length; i++) {
        var a = f[i][0], b = f[i][1], c = f[i][2];
        var ab = mid(a,b), bc = mid(b,c), ca = mid(c,a);
        nf.push([a,ab,ca],[b,bc,ab],[c,ca,bc],[ab,bc,ca]);
      }
      f = nf;
    }
    var pos = new Float32Array(v.length * 3);
    for (i = 0; i < v.length; i++) { pos[i*3]=v[i][0]; pos[i*3+1]=v[i][1]; pos[i*3+2]=v[i][2]; }
    var idx = new Uint32Array(f.length * 3);
    for (i = 0; i < f.length; i++) { idx[i*3]=f[i][0]; idx[i*3+1]=f[i][1]; idx[i*3+2]=f[i][2]; }
    return { pos: pos, idx: idx };
  }

  /* ---------------- matrices ---------------- */
  function perspective(out, fovy, aspect, near, far, sx, sy) {
    var f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    out[0]=f/aspect; out[1]=0; out[2]=0; out[3]=0;
    out[4]=0; out[5]=f; out[6]=0; out[7]=0;
    out[8]=sx; out[9]=sy; out[10]=(far+near)*nf; out[11]=-1;
    out[12]=0; out[13]=0; out[14]=2*far*near*nf; out[15]=0;
    return out;
  }
  function lookAt(out, eye, c) {
    var zx=eye[0]-c[0], zy=eye[1]-c[1], zz=eye[2]-c[2];
    var l=Math.hypot(zx,zy,zz)||1; zx/=l; zy/=l; zz/=l;
    var xx=zz, xy=0, xz=-zx;
    l=Math.hypot(xx,xy,xz)||1; xx/=l; xy/=l; xz/=l;
    var yx=zy*xz-zz*xy, yy=zz*xx-zx*xz, yz=zx*xy-zy*xx;
    out[0]=xx; out[1]=yx; out[2]=zx; out[3]=0;
    out[4]=xy; out[5]=yy; out[6]=zy; out[7]=0;
    out[8]=xz; out[9]=yz; out[10]=zz; out[11]=0;
    out[12]=-(xx*eye[0]+xy*eye[1]+xz*eye[2]);
    out[13]=-(yx*eye[0]+yy*eye[1]+yz*eye[2]);
    out[14]=-(zx*eye[0]+zy*eye[1]+zz*eye[2]);
    out[15]=1;
    return { rx:[xx,xy,xz], ry:[yx,yy,yz] };
  }
  function mul(out, a, b) {
    for (var c = 0; c < 4; c++) {
      var b0=b[c*4], b1=b[c*4+1], b2=b[c*4+2], b3=b[c*4+3];
      out[c*4]   = b0*a[0]+b1*a[4]+b2*a[8]+b3*a[12];
      out[c*4+1] = b0*a[1]+b1*a[5]+b2*a[9]+b3*a[13];
      out[c*4+2] = b0*a[2]+b1*a[6]+b2*a[10]+b3*a[14];
      out[c*4+3] = b0*a[3]+b1*a[7]+b2*a[11]+b3*a[15];
    }
    return out;
  }

  function compile(gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn("[hero]", gl.getShaderInfoLog(s)); return null;
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
      console.warn("[hero]", gl.getProgramInfoLog(p)); return null;
    }
    return p;
  }
  function uni(gl, p, names) {
    var u = {};
    for (var i = 0; i < names.length; i++) u[names[i]] = gl.getUniformLocation(p, names[i]);
    return u;
  }
  function sstep(a, b, x) {
    var t = (x-a)/(b-a); t = t<0?0:t>1?1:t;
    return t*t*(3-2*t);
  }

  window.HERO_mount = function (canvas) {
    if (!canvas) return false;
    var hero = canvas.closest(".hero") || canvas.parentNode;
    if (!hero) return false;

    var small = window.innerWidth < 760;
    var gl = null;
    try {
      gl = canvas.getContext("webgl2", {
        alpha: true, premultipliedAlpha: true, antialias: !small,
        depth: false, stencil: false, powerPreference: "high-performance"
      });
    } catch (e) { return false; }
    if (!gl) return false;

    var pS = program(gl, VS_SPHERE, FS_SPHERE);
    var pR = program(gl, VS_RING, FS_RING);
    var pQ = program(gl, VS_QUAD, FS_QUAD);
    if (!pS || !pR || !pQ) return false;

    var reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    var fine = matchMedia("(hover: hover) and (pointer: fine)").matches;

    /* ---- geometría ---- */
    var ico = icosphere(small ? 4 : 5);
    var vaoS = gl.createVertexArray();
    gl.bindVertexArray(vaoS);
    var vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, ico.pos, gl.STATIC_DRAW);
    var la = gl.getAttribLocation(pS, "aPos");
    gl.enableVertexAttribArray(la);
    gl.vertexAttribPointer(la, 3, gl.FLOAT, false, 0, 0);
    var ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, ico.idx, gl.STATIC_DRAW);
    gl.bindVertexArray(null);

    var SEG = 220, ring = new Float32Array((SEG + 1) * 4);
    for (var i = 0; i <= SEG; i++) {
      ring[i*4] = i/SEG; ring[i*4+1] = -1;
      ring[i*4+2] = i/SEG; ring[i*4+3] = 1;
    }
    var vaoR = gl.createVertexArray();
    gl.bindVertexArray(vaoR);
    var rb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, rb);
    gl.bufferData(gl.ARRAY_BUFFER, ring, gl.STATIC_DRAW);
    var lr = gl.getAttribLocation(pR, "aRing");
    gl.enableVertexAttribArray(lr);
    gl.vertexAttribPointer(lr, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    var vaoQ = gl.createVertexArray();
    gl.bindVertexArray(vaoQ);
    var qb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, qb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
    var lq = gl.getAttribLocation(pQ, "aQ");
    gl.enableVertexAttribArray(lq);
    gl.vertexAttribPointer(lq, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    var uS = uni(gl, pS, ["uVP","uCenter","uAmp","uRadius","uTime","uFreq","uBurst",
      "uRipple","uForce","uForceAmt","uCam","uKey","uDeep","uMid","uRim","uE"]);
    var uR = uni(gl, pR, ["uVP","uCenter","uRight","uUp","uRingR","uRingW","uTime",
      "uRingWob","uDetach","uRim","uRingA"]);
    var uQ = uni(gl, pQ, ["uTex","uDir","uAlpha"]);

    /* ---- framebuffers del pase de post ---- */
    var fbScene = null, txScene = null, fbA = null, txA = null, fbB = null, txB = null;
    function tex(w, h) {
      var t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    }
    function fbo(t) {
      var f = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return f;
    }
    function freeTargets() {
      [fbScene, fbA, fbB].forEach(function (f) { if (f) gl.deleteFramebuffer(f); });
      [txScene, txA, txB].forEach(function (t) { if (t) gl.deleteTexture(t); });
      fbScene = fbA = fbB = txScene = txA = txB = null;
    }

    var W = 0, H = 0, DPR = 1, CW = 0, CH = 0, BW = 0, BH = 0;
    function resize() {
      var r = hero.getBoundingClientRect();
      W = Math.max(320, Math.round(r.width));
      H = Math.max(320, Math.round(r.height));
      DPR = Math.min(window.devicePixelRatio || 1, small ? 1.5 : 1.75);
      CW = Math.round(W * DPR); CH = Math.round(H * DPR);
      canvas.width = CW; canvas.height = CH;
      BW = Math.max(16, CW >> 2); BH = Math.max(16, CH >> 2);
      freeTargets();
      txScene = tex(CW, CH); fbScene = fbo(txScene);
      txA = tex(BW, BH); fbA = fbo(txA);
      txB = tex(BW, BH); fbB = fbo(txB);
    }

    /* ---- puntero: campo de fuerza con retorno lento ---- */
    var mxT = 0, myT = 0, mx = 0, my = 0, fAmt = 0, fVel = 0, fTarget = 0, lastMove = -99;
    if (fine) {
      hero.addEventListener("pointermove", function (e) {
        var r = hero.getBoundingClientRect();
        mxT = (e.clientX - r.left) / r.width * 2 - 1;
        myT = 1 - (e.clientY - r.top) / r.height * 2;
        fTarget = 1; lastMove = performance.now();
      });
      hero.addEventListener("pointerleave", function () { fTarget = 0; });
    }

    var proj = new Float32Array(16), view = new Float32Array(16), vp = new Float32Array(16);
    var DEEP = [0.02, 0.11, 0.24], MID = [0.1, 0.38, 0.78], RIM = [0.27, 0.68, 0.9];

    /* ---------- el ciclo de energía ----------
       reposo → acumulación → tensión → expansión → liberación → reposo */
    var CYC = 11.5;
    function energy(t, out) {
      var u = (t % CYC) / CYC;
      var accum = sstep(0.3, 0.52, u);                    /* se carga      */
      var relax = sstep(0.56, 0.62, u);                   /* se suelta     */
      var ten = accum * (1 - relax);                      /* tensión       */
      var burst = sstep(0.55, 0.605, u) * (1 - sstep(0.62, 0.84, u));
      var calm = 1 - sstep(0.86, 1.0, u);

      out.radius = 1 - 0.055 * ten + 0.075 * burst;       /* comprime y abre */
      out.amp = 0.055 - 0.028 * ten + 0.2 * burst
              + 0.02 * Math.sin(t * 0.6);                 /* respiración     */
      out.freq = 1.55 + 1.5 * ten;                        /* más detalle bajo tensión */
      out.burstN = burst * 0.5;
      out.ripple = -1.3 + 2.8 * sstep(0.58, 0.86, u);     /* frente que recorre */
      out.e = 0.34 + 0.3 * ten + 0.52 * burst;
      out.detach = burst * 0.09;                          /* el aro se separa */
      out.ringWob = 0.012 + 0.02 * ten + 0.05 * burst;
      out.calm = calm;
    }
    var E = {};

    function draw(t, dt) {
      energy(reduced ? 1.2 : t, E);

      /* El scroll sube la energía base: más definición al avanzar */
      var sc = Math.min(1, (window.scrollY || 0) / Math.max(1, window.innerHeight));
      var e = Math.min(1, E.e * (0.86 + 0.5 * sc));

      if (!reduced) {
        mx += (mxT - mx) * Math.min(1, dt * 2.4);
        my += (myT - my) * Math.min(1, dt * 2.4);
        /* Resorte amortiguado: el campo cede rápido y vuelve despacio */
        if (fTarget > 0 && performance.now() - lastMove > 420) fTarget = 0;
        fVel += (fTarget - fAmt) * dt * 9.0;
        fVel *= Math.pow(0.0025, dt);
        fAmt += fVel * dt;
        if (fAmt < 0) { fAmt = 0; fVel = 0; }
      }

      var aspect = W / H;
      /* Encuadre: la forma vive donde no hay texto y sale de cuadro */
      var sx = small ? 0 : -0.46;
      var sy = small ? 0.34 : 0.04;
      var dist = small ? 5.9 : 5.3;
      var fov = 34 * Math.PI / 180;
      if (aspect < 1) fov = 2 * Math.atan(Math.tan(fov / 2) / aspect) * 0.72;

      var eye = [Math.sin(t * 0.055) * 0.16, 0.1 + Math.sin(t * 0.041) * 0.08, dist];
      perspective(proj, fov, aspect, 0.1, 20, sx, sy);
      var b = lookAt(view, eye, [0, 0, 0]);
      mul(vp, proj, view);

      /* La fuerza apunta al punto de la esfera más cercano al cursor */
      var fx = b.rx[0]*mx*aspect*0.8 + b.ry[0]*my*0.8 + 0.0;
      var fy = b.rx[1]*mx*aspect*0.8 + b.ry[1]*my*0.8 + 0.0;
      var fz = b.rx[2]*mx*aspect*0.8 + b.ry[2]*my*0.8 + 0.9;
      var fl = Math.hypot(fx, fy, fz) || 1;

      /* ---- escena al framebuffer ---- */
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbScene);
      gl.viewport(0, 0, CW, CH);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.disable(gl.CULL_FACE);

      gl.useProgram(pS);
      gl.uniformMatrix4fv(uS.uVP, false, vp);
      gl.uniform3f(uS.uCenter, 0, 0, 0);
      gl.uniform1f(uS.uAmp, E.amp);
      gl.uniform1f(uS.uRadius, E.radius);
      gl.uniform1f(uS.uTime, t);
      gl.uniform1f(uS.uFreq, E.freq);
      gl.uniform1f(uS.uBurst, E.burstN);
      gl.uniform1f(uS.uRipple, E.ripple);
      gl.uniform3f(uS.uForce, fx/fl, fy/fl, fz/fl);
      gl.uniform1f(uS.uForceAmt, fAmt * 0.3);
      gl.uniform3f(uS.uCam, eye[0], eye[1], eye[2]);
      /* Luz lateral: es la que revela la deformación */
      gl.uniform3f(uS.uKey, -0.62, 0.52, 0.59);
      gl.uniform3fv(uS.uDeep, DEEP);
      gl.uniform3fv(uS.uMid, MID);
      gl.uniform3fv(uS.uRim, RIM);
      gl.uniform1f(uS.uE, e);
      gl.bindVertexArray(vaoS);
      gl.drawElements(gl.TRIANGLES, ico.idx.length, gl.UNSIGNED_INT, 0);

      gl.useProgram(pR);
      gl.uniformMatrix4fv(uR.uVP, false, vp);
      gl.uniform3f(uR.uCenter, 0, 0, 0);
      gl.uniform3f(uR.uRight, b.rx[0], b.rx[1], b.rx[2]);
      gl.uniform3f(uR.uUp, b.ry[0], b.ry[1], b.ry[2]);
      gl.uniform1f(uR.uRingR, E.radius * 1.085);
      gl.uniform1f(uR.uRingW, 0.0022);
      gl.uniform1f(uR.uTime, t);
      gl.uniform1f(uR.uRingWob, E.ringWob);
      gl.uniform1f(uR.uDetach, E.detach);
      gl.uniform3fv(uR.uRim, RIM);
      gl.uniform1f(uR.uRingA, 0.3 + 0.42 * e);
      gl.bindVertexArray(vaoR);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, (SEG + 1) * 2);

      /* ---- post: difusión. Sobre fondo claro el bloom aditivo no se
         ve, así que el halo es la propia forma oscura desenfocada. ---- */
      gl.bindVertexArray(vaoQ);
      gl.useProgram(pQ);
      gl.uniform1i(uQ.uTex, 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.disable(gl.BLEND);

      gl.bindFramebuffer(gl.FRAMEBUFFER, fbA);
      gl.viewport(0, 0, BW, BH);
      gl.bindTexture(gl.TEXTURE_2D, txScene);
      gl.uniform2f(uQ.uDir, 1 / BW, 0);
      gl.uniform1f(uQ.uAlpha, 1);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      gl.bindFramebuffer(gl.FRAMEBUFFER, fbB);
      gl.bindTexture(gl.TEXTURE_2D, txA);
      gl.uniform2f(uQ.uDir, 0, 1 / BH);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, CW, CH);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

      gl.bindTexture(gl.TEXTURE_2D, txB);
      gl.uniform2f(uQ.uDir, 0, 0);
      gl.uniform1f(uQ.uAlpha, 0.3 + 0.22 * e);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      gl.bindTexture(gl.TEXTURE_2D, txScene);
      gl.uniform1f(uQ.uAlpha, 1);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      gl.bindVertexArray(null);
    }

    resize();
    hero.classList.add("has-gl");
    if (reduced) { draw(1.2, 0.016); return true; }

    var running = true, raf = 0, lost = false;
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (es) { running = es[0].isIntersecting; },
        { threshold: 0 }).observe(hero);
    }
    canvas.addEventListener("webglcontextlost", function (ev) {
      ev.preventDefault(); lost = true; cancelAnimationFrame(raf);
      hero.classList.remove("has-gl");
    });

    var t0 = performance.now(), prev = t0, acc = 0, nf = 0, settled = false;
    (function loop(now) {
      raf = requestAnimationFrame(loop);
      if (lost) return;
      var raw = (now - prev) / 1000;
      prev = now;
      if (!running) return;
      draw((now - t0) / 1000, Math.min(0.05, raw));

      /* Una sola medición tras el arranque, y como mucho un ajuste. */
      if (!settled && (now - t0) > 1200) {
        acc += raw; nf++;
        if (acc > 2) {
          settled = true;
          var avg = acc / nf;
          if (avg > 0.09) {
            cancelAnimationFrame(raf);
            freeTargets();
            hero.classList.remove("has-gl");
          } else if (avg > 0.026 && DPR > 1) {
            DPR = Math.max(1, DPR * 0.72);
            CW = Math.round(W * DPR); CH = Math.round(H * DPR);
            canvas.width = CW; canvas.height = CH;
            BW = Math.max(16, CW >> 2); BH = Math.max(16, CH >> 2);
            freeTargets();
            txScene = tex(CW, CH); fbScene = fbo(txScene);
            txA = tex(BW, BH); fbA = fbo(txA);
            txB = tex(BW, BH); fbB = fbo(txB);
          }
        }
      }
    })(t0);

    var to;
    window.addEventListener("resize", function () {
      clearTimeout(to);
      to = setTimeout(function () { small = window.innerWidth < 760; resize(); }, 180);
    }, { passive: true });

    return true;
  };
})();
