# Iñaki Etchegaray — Coach deportivo

Sitio estático (HTML + CSS + JS vanilla). Sin build, sin npm.

## Estructura
- `index.html` — página completa
- `styles.css` — estilos
- `main.js` — animaciones (GSAP + ScrollTrigger)
- `lib/` — librerías locales
- `assets/photos/source/` — fotos originales del cliente
- `assets/img/` — fotos optimizadas para la web

## Ver en local
Abrir `index.html`, o servirlo:

    python3 -m http.server 8765

## Publicar
Subir el contenido de la carpeta a cualquier hosting estático.
Al desplegar, subir el número de `?v=` en `index.html` para romper caché.

---
M-DATOS · Mauro Tondato
