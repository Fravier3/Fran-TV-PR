// Reproductor HLS: nativo en iPhone/Safari, hls.js (cargado solo si hace falta) en el resto.

const HLS_SRC = "libs/hls.light.min.js";
const START_TIMEOUT_MS = 20000;

let hlsLoader = null;
function loadHls() {
  if (window.Hls) return Promise.resolve(window.Hls);
  hlsLoader ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = HLS_SRC;
    s.onload = () => (window.Hls ? resolve(window.Hls) : reject(new Error("hls.js no disponible")));
    s.onerror = () => { hlsLoader = null; reject(new Error("No se pudo cargar hls.js")); };
    document.head.append(s);
  });
  return hlsLoader;
}

const isHlsUrl = (url) => /m3u8/i.test(url);
const isMixedContent = (url) => location.protocol === "https:" && /^http:\/\//i.test(url);

export function createPlayer(video, onState) {
  const nativeHls = !!video.canPlayType("application/vnd.apple.mpegurl");
  let hls = null;
  let token = 0;
  let current = null;
  let timer = 0;
  let started = false;

  const emit = (state, detail = {}) => onState(state, { channel: current, ...detail });

  function teardown() {
    clearTimeout(timer);
    if (hls) { try { hls.destroy(); } catch { /* ignorar */ } hls = null; }
    video.pause();
    video.removeAttribute("src");
    video.load();
  }

  function fail(myToken, reason) {
    if (myToken !== token) return;
    clearTimeout(timer);
    const mixed = isMixedContent(current?.url || "");
    video.controls = false;
    emit("error", {
      title: "Este canal no está disponible",
      text: mixed
        ? "Este canal usa una conexión no segura (http) y el navegador puede bloquearlo."
        : reason || "Puede estar fuera del aire o bloqueado en tu región.",
    });
  }

  function armTimeout(myToken) {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!started) fail(myToken, "El canal tardó demasiado en responder.");
    }, START_TIMEOUT_MS);
  }

  async function tryPlay(myToken) {
    try {
      await video.play();
    } catch (err) {
      if (myToken !== token) return;
      // iOS/Chrome pueden exigir un toque: mostramos los controles nativos
      if (err?.name === "NotAllowedError") { video.controls = true; emit("paused"); }
    }
  }

  async function startHlsJs(myToken, url) {
    let Hls;
    try { Hls = await loadHls(); } catch { return fail(myToken, "No se pudo cargar el reproductor."); }
    if (myToken !== token) return;
    if (!Hls.isSupported()) return fail(myToken, "Este navegador no puede reproducir este canal.");

    const recovered = { network: false, media: false };
    hls = new Hls({ enableWorker: true, lowLatencyMode: true, backBufferLength: 30 });
    hls.on(Hls.Events.MANIFEST_PARSED, () => tryPlay(myToken));
    hls.on(Hls.Events.ERROR, (_e, data) => {
      if (myToken !== token || !data?.fatal) return;
      if (data.type === Hls.ErrorTypes.NETWORK_ERROR && !recovered.network && started) {
        recovered.network = true;
        hls.startLoad();
      } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !recovered.media) {
        recovered.media = true;
        hls.recoverMediaError();
      } else {
        fail(myToken);
      }
    });
    hls.loadSource(url);
    hls.attachMedia(video);
  }

  function startNative(myToken, url) {
    video.src = url;
    tryPlay(myToken);
  }

  // Eventos del elemento <video>
  video.addEventListener("playing", () => {
    if (!current) return;
    started = true;
    video.controls = true;
    clearTimeout(timer);
    emit("playing");
  });
  video.addEventListener("waiting", () => { if (current && started) emit("buffering"); });
  video.addEventListener("error", () => {
    if (!current || hls) return;
    const myToken = token;
    // Si el HLS nativo falla y hls.js puede, se intenta con hls.js
    if (nativeHls && isHlsUrl(current.url) && !current._triedHlsJs) {
      current._triedHlsJs = true;
      video.removeAttribute("src");
      startHlsJs(myToken, current.url);
      return;
    }
    fail(myToken);
  });

  return {
    get channel() { return current; },

    play(channel) {
      const myToken = ++token;
      teardown();
      current = { ...channel };
      started = false;
      video.controls = false;
      emit("loading");
      armTimeout(myToken);

      if (nativeHls || !isHlsUrl(channel.url)) startNative(myToken, channel.url);
      else startHlsJs(myToken, channel.url);
    },

    retry() { if (current) this.play(current); },
  };
}
