// Service worker + auto-actualización: la app toma los cambios sola al abrirla o volver a ella.

const CHECK_EVERY_MS = 30 * 60 * 1000;

export function setupUpdates({ onUpdating } = {}) {
  if (!("serviceWorker" in navigator)) return;

  let reloading = false;
  const hadController = !!navigator.serviceWorker.controller;

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading || !hadController) return;
    reloading = true;
    onUpdating?.();
    setTimeout(() => location.reload(), 600);
  });

  navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then((reg) => {
    const activateWaiting = () => reg.waiting?.postMessage({ type: "SKIP_WAITING" });
    reg.addEventListener("updatefound", () => {
      reg.installing?.addEventListener("statechange", activateWaiting);
    });

    const check = async () => {
      try {
        await reg.update();
        const res = await fetch(`version.json?t=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) return;
        const { version } = await res.json();
        if (version && version !== window.APP_VERSION) activateWaiting();
      } catch { /* sin conexión: se intentará luego */ }
    };

    check();
    setInterval(check, CHECK_EVERY_MS);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") check();
    });
  }).catch(() => { /* el registro puede fallar en modo privado */ });
}
