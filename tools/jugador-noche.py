import sys, numpy as np
# Pasa el recorte del jugador del caso a la luz del estadio de noche:
# más frío, un poco más oscuro y con luz de contorno celeste desde arriba.
# Uso: python3 tools/jugador-noche.py original.webp assets/img/caso-jugador.webp
from PIL import Image
from scipy.ndimage import binary_erosion, gaussian_filter, sobel
src, out = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGBA')
a0 = np.array(im)
al = a0[..., 3]
ys, xs = np.where(al > 10)
pad = 12
x0, y0, x1, y1 = max(0, xs.min()-pad), max(0, ys.min()-pad), min(im.width, xs.max()+pad), min(im.height, ys.max()+pad)
im = im.crop((x0, y0, x1, y1))
H = 780; W = round(im.width * H / im.height)
im = im.resize((W, H), Image.LANCZOS)
a = np.array(im).astype(np.float32) / 255
rgb, A = a[..., :3], a[..., 3]
# 1) noche: más frío, un poco más oscuro, algo más de contraste
rgb = rgb ** 1.06
rgb = rgb * np.array([0.84, 0.92, 1.0]) * 0.93
rgb = np.clip((rgb - 0.5) * 1.06 + 0.5, 0, 1)
# 2) luz de contorno: borde del recorte, más fuerte en lo que mira arriba
m = A > 0.5
borde = A - binary_erosion(m, iterations=4).astype(np.float32)
borde = np.clip(gaussian_filter(np.clip(borde, 0, 1), 1.6), 0, 1) * A
gx, gy = sobel(gaussian_filter(A, 2.0), 1), sobel(gaussian_filter(A, 2.0), 0)
nx, ny = -gx, -gy
nn = np.sqrt(nx*nx + ny*ny) + 1e-6
nx, ny = nx/nn, ny/nn
L = np.array([0.25, -0.97])
dirw = np.clip(nx*L[0] + ny*L[1], 0, 1) ** 1.3
rim = borde * (0.25 + 0.75 * dirw)
cel = np.array([0.66, 0.88, 1.0])
rgb = rgb * (1 - rim[..., None] * 0.55) + cel * rim[..., None] * 0.75
# 3) leve sombra de abajo hacia arriba (las piernas reciben menos luz)
yy = np.linspace(0, 1, H)[:, None]
rgb = rgb * (1 - 0.12 * np.clip((yy - 0.55) / 0.45, 0, 1))[..., None]
outa = np.dstack([np.clip(rgb, 0, 1), A])
Image.fromarray((outa * 255).astype(np.uint8), 'RGBA').save(out, 'WEBP', quality=86, method=6)
print(W, H)
