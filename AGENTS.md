# Reglas para asistentes de programación — Fran TV

- PWA sin compilación (HTML + CSS + módulos ES), publicada con GitHub Pages desde `main` / raíz. Rutas siempre relativas.
- Estructura: `index.html` (incluye el sprite de iconos Lucide), `css/styles.css` (sistema de diseño con variables), `js/app.js` (UI), `js/m3u.js` (lectura de listas), `js/player.js` (HLS nativo en iPhone, `libs/hls.light.min.js` cargado solo si hace falta), `js/store.js` (localStorage `frantv:data`), `js/update.js` (service worker y auto-actualización), `data/*.m3u` (canales), `libs/` (hls.js 1.5.20 y Motion 11.18.2 con versión fija), `icons/` (fuente `icons/icon.svg`).
- **En cada cambio publicado sube la versión en los tres sitios:** `version.json`, `window.APP_VERSION` en `index.html` y `CACHE` en `sw.js`. Si agregas archivos, añádelos a `PRECACHE` en `sw.js`.
- Los datos del usuario (`frantv:data`) nunca se borran; si cambia el formato, migrar con el campo `schema`.
- La pestaña USA se carga en vivo desde iptv-org; las demás son locales.
- No cambiar el icono salvo que se pida. Interfaz en español (Puerto Rico).
