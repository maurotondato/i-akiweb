# -*- coding: utf-8 -*-
"""Pelota de rugby sobre tee de pateo (assets/img/pelota-rugby.webp).

Trazado de rayos sobre superficies implícitas, en numpy: la pelota es
una superficie de revolución con puntas (radio = Rm * (1 - y^2)^K), con
cuatro gajos abombados y su costura; el tee es un cono truncado. Luz de
estadio de noche: principal arriba a la izquierda, contraluz celeste.

Se generó con:
  python3 tools/pelota-rugby.py '{"w":220,"h":380,"rbot":0.44,"teeh":0.36,"kd":1.12,"amb":0.07,"ks":0.3}' rt.png
y después se pasó a WebP con calidad 88.
"""
import sys, json, math
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter

P = json.loads(sys.argv[1]) if len(sys.argv) > 1 else {}
out = sys.argv[2] if len(sys.argv) > 2 else 'rt.png'
W = P.get('w', 300); Hh = P.get('h', 520); SS = 2
Wr, Hr = W * SS, Hh * SS
L = 1.0; Rm = P.get('rm', 0.62); K = P.get('k', 0.72)

def nz(a): a = np.array(a, float); return a / np.linalg.norm(a)
def rx(a): a = math.radians(a); return np.array([[1,0,0],[0,math.cos(a),-math.sin(a)],[0,math.sin(a),math.cos(a)]])
def ry(a): a = math.radians(a); return np.array([[math.cos(a),0,math.sin(a)],[0,1,0],[-math.sin(a),0,math.cos(a)]])
def rz(a): a = math.radians(a); return np.array([[math.cos(a),-math.sin(a),0],[math.sin(a),math.cos(a),0],[0,0,1]])

Mb = rz(P.get('lean', -6)) @ rx(P.get('fwd', -8)) @ ry(P.get('spin', 35))   # escena <- objeto pelota
Rv = rx(P.get('elev', 12))       # vista <- escena (la cámara mira un poco desde arriba)
# punta inferior de la pelota en escena
tipo = Mb @ np.array([0, -L, 0]); ytip = tipo[1]
th = P.get('teeh', 0.42); tt = ytip + P.get('sink', 0.10); tb = tt - th
r_top, r_bot = P.get('rtop', 0.20), P.get('rbot', 0.40)

def Fb(ps):
    po = ps @ Mb               # objeto = Mb^T ps
    y = po[..., 1]
    t = np.clip(1 - (y / L) ** 2, 0, None)
    R = Rm * t ** K + 1e-6
    return (po[..., 0] ** 2 + po[..., 2] ** 2) / R ** 2 - 1 + (np.abs(y) > L) * 10
def Ft(ps):
    y = ps[..., 1]
    s = np.clip((y - tb) / th, 0, 1)
    r = r_bot + (r_top - r_bot) * s ** 0.8
    cup = (y > tt - 0.06)
    ins = (ps[..., 0] ** 2 + ps[..., 2] ** 2) / r ** 2 - 1
    return np.where((y < tb) | (y > tt), 10.0, ins)
def Fs(ps): return np.minimum(Fb(ps), Ft(ps))

cx = P.get('cx', 0.0); cy = P.get('cy', -0.18); sc = P.get('scale', 0.62)
ys, xs = np.mgrid[0:Hr, 0:Wr]
u = ((xs + 0.5) - Wr / 2) / (Hr / 2) / sc + cx
v = (Hr / 2 - (ys + 0.5)) / (Hr / 2) / sc + cy
NS = 200; zs = np.linspace(2.0, -2.0, NS)
zh = np.full(u.shape, np.nan); hit = np.zeros(u.shape, bool)
for r0 in range(0, Hr, 48):
    uu = u[r0:r0+48]; vv = v[r0:r0+48]
    pv = np.stack(np.broadcast_arrays(uu[..., None], vv[..., None], zs[None, None, :]), -1)
    ps = pv @ Rv               # escena = Rv^T pv
    ins = Fs(ps) < 0
    any_ = ins.any(-1); first = np.argmax(ins, -1)
    a = zs[np.clip(first - 1, 0, NS - 1)]; b = zs[first]
    for _ in range(20):
        m = (a + b) / 2
        pm = np.stack(np.broadcast_arrays(uu, vv, m), -1) @ Rv
        im = Fs(pm) < 0
        b = np.where(im, m, b); a = np.where(im, a, m)
    zh[r0:r0+48] = np.where(any_, b, np.nan); hit[r0:r0+48] = any_
pv = np.stack([u, v, np.nan_to_num(zh)], -1); ps = pv @ Rv
isball = Fb(ps) <= Ft(ps)
e = 1e-3
def grad(F, p):
    return np.stack([F(p + np.array([e,0,0])) - F(p - np.array([e,0,0])),
                     F(p + np.array([0,e,0])) - F(p - np.array([0,e,0])),
                     F(p + np.array([0,0,e])) - F(p - np.array([0,0,e]))], -1)
gb = grad(Fb, ps); gt = grad(Ft, ps)
g = np.where(isball[..., None], gb, gt)
g /= np.linalg.norm(g, axis=-1, keepdims=True) + 1e-9          # normal en escena
# --- gajos de la pelota (en coords objeto)
po = ps @ Mb; go = g @ Mb
thg = np.arctan2(po[..., 2], po[..., 0]); yy = po[..., 1] / L
rl = np.sqrt(po[..., 0] ** 2 + po[..., 2] ** 2)
ds = np.abs(np.mod(thg, math.pi / 2) - math.pi / 4)
dseam = (math.pi / 4 - ds) * rl
seam = np.clip(1 - dseam / P.get('sw', 0.014), 0, 1) * isball
puff = np.where(isball, np.clip(dseam / P.get('pw', 0.09), 0, 1), 1)
tang = np.stack([-np.sin(thg), np.zeros_like(thg), np.cos(thg)], -1)
side = np.sign(np.mod(thg, math.pi / 2) - math.pi / 4)
bend = (1 - puff) ** 2 * P.get('bend', 0.25)
gob = go + tang * (side * bend)[..., None]; gob /= np.linalg.norm(gob, axis=-1, keepdims=True)
gs = np.where(isball[..., None], gob @ Mb.T, g)                 # normal sombreada, escena
Nv = gs @ Rv.T                                                    # a vista
Ng = g @ Rv.T
# --- material
white = np.array(P.get('cw', [228, 236, 245])) / 255
navy = np.array([11, 42, 82]) / 255; cel = np.array([69, 174, 229]) / 255
band = (np.abs(yy) > P.get('b0', 0.56)) & (np.abs(yy) < P.get('b1', 0.70))
band2 = (np.abs(yy) > 0.74) & (np.abs(yy) < 0.78)
base = np.where(band[..., None], navy, white); base = np.where(band2[..., None], cel, base)
base = base * (1 - seam[..., None] * 0.7) + np.array([30, 48, 70]) / 255 * seam[..., None] * 0.7
teec = np.array(P.get('ct', [38, 128, 196])) / 255
# franja del tee
ys_ = ps[..., 1]
teeband = (np.abs(ys_ - (tb + th * 0.55)) < 0.03)
teecol = np.where(teeband[..., None], np.array([12, 44, 86]) / 255, teec)
base = np.where(isball[..., None], base, teecol)
rng = np.random.default_rng(3)
noise = gaussian_filter(rng.normal(0, 1, u.shape), 1.2) * P.get('grain', 0.08) * isball
Lk = nz(P.get('key', [-0.6, 0.6, 0.5])); Vw = np.array([0, 0, 1.0])
dif = np.clip(Nv @ Lk, 0, 1)
Hv = nz(Lk + Vw); spec = np.clip(Nv @ Hv, 0, 1) ** np.where(isball, P.get('shin', 45), 20)
rimd = nz(P.get('rim', [0.85, -0.05, -0.5]))
rim = np.clip(1 - np.abs(Ng[..., 2]), 0, 1) ** P.get('rimp', 3.0) * np.clip((Ng[..., :2] @ nz(rimd[:2])) * 0.7 + 0.45, 0, 1)
ao = 0.6 + 0.4 * puff
# oclusión del tee bajo la pelota
ao_t = np.where(isball, 1.0, np.clip(0.55 + (tt - ys_) / th * 0.6, 0.5, 1))
col = base * (P.get('amb', 0.05) + P.get('kd', 0.95) * dif[..., None] * (1 + noise[..., None])) * (ao * ao_t)[..., None]
col += P.get('ks', 0.25) * spec[..., None] * (1 - seam[..., None])
col += np.array([120, 205, 250]) / 255 * rim[..., None] * P.get('kr', 1.1)
col = np.clip(col, 0, 1)
a = gaussian_filter(hit.astype(float), 0.6)
img = np.dstack([col, a[..., None]])
im = Image.fromarray((img * 255).astype(np.uint8), 'RGBA').resize((W, Hh), Image.LANCZOS)
bb = im.getbbox(); im = im.crop(bb)
im.save(out); print('ok', out, im.size)
