# -*- coding: utf-8 -*-
"""Genera la pelota de futbol: icosaedro truncado -> esfera -> proyeccion.

No se dibuja a ojo. Se construyen los 60 vertices del solido, se los
empuja a la esfera para que la silueta llegue al aro, se gira a un
angulo que deje un pentagono casi de frente -como en una foto- y se
proyecta en ortografica quedandose con las caras que miran al frente.
"""
import sys, math
import numpy as np
from scipy.spatial import ConvexHull

PHI = (1 + 5 ** .5) / 2

def vertices():
    base = []
    for s1 in (1, -1):
        for s2 in (1, -1):
            base.append((0, s1 * 1, s2 * 3 * PHI))
            base.append((s1 * 1, s2 * (2 + PHI), 0))      # se completa abajo
    pts = set()
    grupos = [(0, 1, 3 * PHI), (1, 2 + PHI, 2 * PHI), (PHI, 2, 2 * PHI + 1)]
    for a, b, c in grupos:
        for sa in ({1, -1} if a else {1}):
            for sb in ({1, -1} if b else {1}):
                for sc in ({1, -1} if c else {1}):
                    v = (sa * a, sb * b, sc * c)
                    # permutaciones cíclicas = permutaciones pares
                    for k in range(3):
                        pts.add(tuple(round(x, 9) for x in (v[k:] + v[:k])))
    return np.array(sorted(pts))

def caras(V):
    h = ConvexHull(V)
    grupos = {}
    for s, eq in zip(h.simplices, h.equations):
        clave = tuple(round(x, 5) for x in eq)
        grupos.setdefault(clave, set()).update(int(i) for i in s)
    salida = []
    for (nx, ny, nz, d), idx in grupos.items():
        idx = list(idx)
        n = np.array([nx, ny, nz], float)
        c = V[idx].mean(0)
        u = V[idx[0]] - c; u /= np.linalg.norm(u)
        w = np.cross(n, u)
        ang = [math.atan2(float(np.dot(V[i] - c, w)), float(np.dot(V[i] - c, u))) for i in idx]
        orden = [i for _, i in sorted(zip(ang, idx))]
        salida.append((orden, n / np.linalg.norm(n)))
    return salida

def rot(ejex, ejey, ejez):
    ax, ay, az = map(math.radians, (ejex, ejey, ejez))
    Rx = np.array([[1,0,0],[0,math.cos(ax),-math.sin(ax)],[0,math.sin(ax),math.cos(ax)]])
    Ry = np.array([[math.cos(ay),0,math.sin(ay)],[0,1,0],[-math.sin(ay),0,math.cos(ay)]])
    Rz = np.array([[math.cos(az),-math.sin(az),0],[math.sin(az),math.cos(az),0],[0,0,1]])
    return Rz @ Ry @ Rx

def construir(gx, gy, gz, C=20.0, R=15.4, umbral=0.03, dec=2):
    V = vertices()
    F = caras(V)
    # a la esfera: asi la silueta toca el aro
    S = V / np.linalg.norm(V, axis=1, keepdims=True)
    M = rot(gx, gy, gz)
    S = S @ M.T
    N = np.array([n for _, n in F]) @ M.T

    def proy(i):
        return (C + S[i][0] * R, C - S[i][1] * R)

    pent, aristas = [], set()
    for (idx, _), n in zip(F, N):
        if n[2] <= umbral:
            continue
        pts = [proy(i) for i in idx]
        d = "M" + "L".join("%.*f %.*f" % (dec, x, dec, y) for x, y in pts) + "Z"
        if len(idx) == 5:
            pent.append(d)
        for a, b in zip(idx, idx[1:] + idx[:1]):
            aristas.add((min(a, b), max(a, b)))

    red = "".join("M%.*f %.*fL%.*f %.*f" % (dec, proy(a)[0], dec, proy(a)[1],
                                            dec, proy(b)[0], dec, proy(b)[1])
                  for a, b in sorted(aristas))
    return "".join(pent), red, len(pent), len(aristas)

if __name__ == "__main__":
    gx, gy, gz = (float(x) for x in sys.argv[1:4])
    p, r, np_, na = construir(gx, gy, gz)
    print("PENT", p)
    print("RED", r)
    print("n pentagonos visibles:", np_, "| aristas:", na, "| bytes:", len(p) + len(r), file=sys.stderr)
