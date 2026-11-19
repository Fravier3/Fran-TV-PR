# Estado del proyecto — Fran TV

**Versión:** 3.0.0 (2026-11-19)

## Hecho en 3.0.0
- Rediseño completo estilo app de iPhone: barra de pestañas inferior, reproductor fijo arriba, barra "En vivo", hojas inferiores con `<dialog>`, modo claro/oscuro, safe areas y diseño en dos columnas en horizontal y computadora.
- Listas separadas en `data/*.m3u` (antes estaban dentro del HTML de 500 KB); nombres con acentos corregidos; entradas con la URL pegada al nombre ahora se leen.
- Categorías traducidas al español y filtros por categoría; calidad (HD, Full HD) y avisos (No 24/7, bloqueo regional).
- Favoritos, recientes y canales/listas propios guardados en el teléfono.
- Errores de canal con Reintentar / Siguiente y tiempo límite de 20 s.
- PWA: manifest, service worker, funciona sin conexión, auto-actualización, iconos nuevos sin transparencia (mismo concepto FRAN TV).
- Librerías del catálogo Repos: Motion (animaciones), guías Modern Web Guidance y Hallmark; iconos Lucide; hls.js fijado a 1.5.20 (antes `@latest`).

## Pendiente / ideas
- Probar en un iPhone real los canales `http://` (Safari puede bloquearlos en sitio https).
- Ver "Mejoras sugeridas" en la conversación de la versión 3.0.0.
