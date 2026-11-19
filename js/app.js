// Fran TV — app principal
import { parseM3U } from "./m3u.js";
import { store } from "./store.js";
import { createPlayer } from "./player.js";
import { setupUpdates } from "./update.js";

/* ---------- Constantes ---------- */
const SOURCES = {
  fran: { title: "Fran", file: "data/fran.m3u" },
  internacional: { title: "Mundo", file: "data/internacional.m3u" },
  variado: { title: "Variado", file: "data/variado.m3u" },
  usa: { title: "Estados Unidos", file: "https://iptv-org.github.io/iptv/countries/us.m3u", remote: true },
  mios: { title: "Mis canales" },
};
const FIRST_BATCH = 40;
const BATCH = 250;
const ALL = "__all__";

const $ = (sel) => document.querySelector(sel);
const els = {
  splash: $("#splash"), video: $("#video"), list: $("#list"), chips: $("#chips"),
  listTitle: $("#listTitle"), listCount: $("#listCount"), library: $("#library"),
  search: $("#searchInput"), clearSearch: $("#clearSearch"),
  ovIdle: $("#ovIdle"), ovLoading: $("#ovLoading"), ovError: $("#ovError"),
  loadingText: $("#loadingText"), errorTitle: $("#errorTitle"), errorText: $("#errorText"),
  now: $("#now"), nowLogo: $("#nowLogo"), nowName: $("#nowName"), nowGroup: $("#nowGroup"),
  nowFav: $("#nowFav"), toast: $("#toast"), tabs: [...document.querySelectorAll(".tab")],
  addSheet: $("#addSheet"), addForm: $("#addForm"), addUrl: $("#addUrl"), addName: $("#addName"),
  addError: $("#addError"), addSubmit: $("#addSubmit"), iosSheet: $("#iosSheet"), installBtn: $("#installBtn"),
};

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const motion = () => (!reducedMotion && window.Motion) || null;
const haptic = (ms = 8) => navigator.vibrate?.(ms);

/* ---------- Estado ---------- */
const state = {
  tab: SOURCES[store.lastTab] ? store.lastTab : "fran",
  group: ALL,
  query: "",
  cache: {},          // tab -> canales
  visible: [],        // canales que se ven ahora (para anterior / siguiente)
  renderToken: 0,
};

/* ---------- Utilidades ---------- */
const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function hue(str) {
  let h = 0;
  for (const ch of str) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 360;
}

function initials(name) {
  const words = String(name).replace(/[^\p{L}\p{N} ]/gu, " ").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "TV";
  return words.length === 1 ? words[0].slice(0, 3).toUpperCase() : (words[0][0] + words[1][0]).toUpperCase();
}

function host(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

let toastTimer = 0;
function toast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove("show"), 2200);
}

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k === "style") node.style.cssText = v;
    else node.setAttribute(k, v);
  }
  node.append(...children);
  return node;
}

function icon(name) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "icon");
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", `#i-${name}`);
  svg.append(use);
  return svg;
}

/* ---------- Logo de canal (imagen con respaldo de iniciales) ---------- */
function logoNode(channel, cls = "logo") {
  const box = el("div", { class: cls, style: `--h:${hue(channel.name)}`, "aria-hidden": "true" }, [initials(channel.name)]);
  if (channel.logo) {
    const img = el("img", { src: channel.logo, alt: "", loading: "lazy", decoding: "async", referrerpolicy: "no-referrer" });
    box.append(img);
  }
  return box;
}

// Los eventos load/error de <img> no burbujean: se escuchan en fase de captura
function wireLogoEvents(root) {
  root.addEventListener("load", (e) => {
    if (e.target.tagName === "IMG") e.target.parentElement.classList.add("has-img");
  }, true);
  root.addEventListener("error", (e) => {
    if (e.target.tagName === "IMG") e.target.remove();
  }, true);
}

/* ---------- Datos ---------- */
async function loadTab(tab) {
  if (state.cache[tab]) return state.cache[tab];
  const src = SOURCES[tab];
  const res = await fetch(src.file, { cache: src.remote ? "no-store" : "default" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const channels = parseM3U(await res.text(), src.title);
  state.cache[tab] = channels;
  return channels;
}

function matches(channel, q) {
  return !q || norm(`${channel.name} ${channel.group}`).includes(q);
}

/* ---------- Render ---------- */
function rowNode(channel, index, { removable = false } = {}) {
  const fav = store.isFavorite(channel.url);
  const meta = [channel.group, channel.quality, ...channel.flags].filter(Boolean).join(" · ") || host(channel.url);
  const eq = el("span", { class: "eq", "aria-hidden": "true" }, [el("i"), el("i"), el("i")]);

  const main = el("button", { class: "row-main", type: "button", "data-play": index }, [
    logoNode(channel),
    el("span", { class: "row-text" }, [
      el("span", { class: "row-name" }, [eq, channel.name]),
      el("span", { class: "row-meta", text: meta }),
    ]),
  ]);

  const side = removable
    ? el("button", { class: "ghost-btn fav-btn", type: "button", "data-remove": index, "aria-label": `Quitar ${channel.name}` }, [icon("trash")])
    : el("button", {
        class: "ghost-btn fav-btn", type: "button", "data-fav": index,
        "aria-pressed": String(fav), "aria-label": `${fav ? "Quitar de" : "Agregar a"} favoritos: ${channel.name}`,
      }, [icon("star")]);

  const row = el("div", { class: "row", "data-url": channel.url }, [main, side]);
  if (player.channel?.url === channel.url) row.classList.add("playing");
  return row;
}

function emptyNode(iconName, title, text, action) {
  const box = el("div", { class: "empty" }, [icon(iconName), el("strong", { text: title }), el("p", { text })]);
  if (action) box.append(action);
  return box;
}

function renderSkeleton() {
  els.list.replaceChildren(...Array.from({ length: 8 }, () => el("div", { class: "skeleton", "aria-hidden": "true" })));
  els.listCount.textContent = "";
}

function renderChips(channels) {
  if (state.tab === "mios") { els.chips.hidden = true; return; }
  const counts = new Map();
  for (const c of channels) counts.set(c.group, (counts.get(c.group) || 0) + 1);
  const groups = [...counts].sort((a, b) => b[1] - a[1]);
  if (groups.length < 2) { els.chips.hidden = true; state.group = ALL; return; }

  els.chips.hidden = false;
  const chip = (id, label, n) => el("button", {
    class: "chip", type: "button", "data-group": id, "aria-pressed": String(state.group === id),
  }, [label, el("small", { text: String(n) })]);
  els.chips.replaceChildren(chip(ALL, "Todos", channels.length), ...groups.map(([g, n]) => chip(g, g, n)));
}

// Pinta muchas filas sin congelar la pantalla: primero un lote pequeño y luego el resto por partes
async function paintRows(items, token, opts) {
  const frag = document.createDocumentFragment();
  const first = items.slice(0, FIRST_BATCH).map(({ channel, index }) => rowNode(channel, index, opts));
  frag.append(...first);
  els.list.append(frag);
  animateIn(first.slice(0, 10));

  for (let i = FIRST_BATCH; i < items.length; i += BATCH) {
    await new Promise((r) => (window.requestIdleCallback ? requestIdleCallback(r, { timeout: 120 }) : setTimeout(r, 16)));
    if (token !== state.renderToken) return;
    const part = document.createDocumentFragment();
    for (const { channel, index } of items.slice(i, i + BATCH)) part.append(rowNode(channel, index, opts));
    els.list.append(part);
  }
}

function animateIn(nodes) {
  const M = motion();
  if (!M || !nodes.length) return;
  M.animate(nodes, { opacity: [0, 1], y: [10, 0] }, { duration: 0.35, delay: M.stagger(0.025), ease: [0.22, 1, 0.36, 1] });
}

function setCount(n) {
  els.listCount.textContent = n === 1 ? "1 canal" : `${n.toLocaleString("es")} canales`;
}

function renderMine() {
  const q = norm(state.query);
  const sections = [
    { label: "Agregados por ti", items: store.custom, removable: true },
    { label: "Favoritos", items: store.favorites },
    { label: "Vistos recientemente", items: store.recents },
  ];
  state.visible = [];
  const token = state.renderToken;
  els.list.replaceChildren();
  let total = 0;

  for (const s of sections) {
    const items = s.items.filter((c) => matches(c, q));
    if (!items.length) continue;
    els.list.append(el("div", { class: "list-label", text: s.label }));
    const indexed = items.map((channel) => ({ channel, index: state.visible.push(channel) - 1 }));
    total += items.length;
    paintRows(indexed, token, { removable: s.removable });
  }

  setCount(total);
  if (!total) {
    els.list.replaceChildren(q
      ? emptyNode("search", "Sin resultados", `No hay canales guardados que coincidan con “${state.query}”.`)
      : emptyNode("star", "Aún no tienes canales", "Toca la estrella de cualquier canal para guardarlo aquí, o agrega uno propio con el botón +."));
  }
}

function renderChannels() {
  const token = ++state.renderToken;
  els.listTitle.textContent = SOURCES[state.tab].title;
  if (state.tab === "mios") { els.chips.hidden = true; renderMine(); return; }

  const all = state.cache[state.tab] || [];
  const q = norm(state.query);
  state.visible = all.filter((c) => (state.group === ALL || c.group === state.group) && matches(c, q));
  els.list.replaceChildren();
  setCount(state.visible.length);

  if (!state.visible.length) {
    els.list.append(q
      ? emptyNode("search", "Sin resultados", `No encontré “${state.query}” en ${SOURCES[state.tab].title}.`)
      : emptyNode("tv", "No hay canales", "Esta lista está vacía por ahora."));
    return;
  }
  paintRows(state.visible.map((channel, index) => ({ channel, index })), token);
}

async function showTab(tab, { fromUser = false } = {}) {
  state.tab = tab;
  state.group = ALL;
  store.lastTab = tab;
  els.tabs.forEach((t) => t.setAttribute("aria-selected", String(t.dataset.tab === tab)));
  els.library.setAttribute("aria-labelledby", `tab-${tab}`);
  els.listTitle.textContent = SOURCES[tab].title;
  if (fromUser) window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });

  if (tab === "mios") { renderChannels(); return; }

  if (!state.cache[tab]) {
    els.chips.hidden = true;
    renderSkeleton();
    try {
      await loadTab(tab);
    } catch {
      if (state.tab !== tab) return;
      const retry = el("button", { class: "pill-btn primary", type: "button" }, [icon("retry"), "Reintentar"]);
      retry.addEventListener("click", () => showTab(tab));
      els.list.replaceChildren(emptyNode(navigator.onLine ? "alert" : "offline",
        navigator.onLine ? "No se pudo cargar la lista" : "Sin conexión",
        navigator.onLine ? "El servidor de la lista no respondió. Prueba de nuevo en un momento." : "Conéctate a internet para ver los canales.", retry));
      return;
    }
    if (state.tab !== tab) return;
  }
  renderChips(state.cache[tab]);
  renderChannels();
}

/* ---------- Reproducción ---------- */
const overlays = { idle: els.ovIdle, loading: els.ovLoading, error: els.ovError };
function showOverlay(name) {
  for (const [k, node] of Object.entries(overlays)) node.classList.toggle("show", k === name);
}

const player = createPlayer(els.video, (status, info) => {
  switch (status) {
    case "loading": els.loadingText.textContent = `Conectando con ${info.channel.name}…`; showOverlay("loading"); break;
    case "buffering": els.loadingText.textContent = "Cargando…"; showOverlay("loading"); break;
    case "playing": case "paused": showOverlay(null); break;
    case "error":
      els.errorTitle.textContent = info.title;
      els.errorText.textContent = info.text;
      showOverlay("error");
      break;
  }
});

function updateNowPlaying(channel) {
  const wasHidden = els.now.hidden;
  els.now.hidden = false;
  els.nowLogo.replaceWith(Object.assign(logoNode(channel), { id: "nowLogo" }));
  els.nowLogo = $("#nowLogo");
  els.nowName.textContent = channel.name;
  els.nowGroup.textContent = channel.group || host(channel.url);
  syncFavButton();
  document.querySelectorAll(".row.playing").forEach((r) => r.classList.remove("playing"));
  document.querySelectorAll(".row").forEach((r) => { if (r.dataset.url === channel.url) r.classList.add("playing"); });
  if (wasHidden) motion()?.animate(els.now, { opacity: [0, 1], y: [-6, 0], scale: [0.98, 1] }, { duration: 0.35 });

  if ("mediaSession" in navigator) {
    const artwork = [{ src: new URL("icons/icon-512.png", location.href).href, sizes: "512x512", type: "image/png" }];
    if (channel.logo) artwork.unshift({ src: channel.logo, sizes: "256x256" });
    navigator.mediaSession.metadata = new MediaMetadata({ title: channel.name, artist: "Fran TV", album: channel.group || "En vivo", artwork });
    navigator.mediaSession.setActionHandler?.("nexttrack", () => step(1));
    navigator.mediaSession.setActionHandler?.("previoustrack", () => step(-1));
  }
}

function play(channel) {
  haptic();
  player.play(channel);
  store.addRecent(channel);
  updateNowPlaying(channel);
}

function step(dir) {
  const list = state.visible.length ? state.visible : store.recents;
  if (!list.length) return;
  const i = list.findIndex((c) => c.url === player.channel?.url);
  const next = list[(i + dir + list.length) % list.length];
  play(next);
  document.querySelector(`.row[data-url="${CSS.escape(next.url)}"]`)?.scrollIntoView({ block: "nearest", behavior: reducedMotion ? "auto" : "smooth" });
}

function syncFavButton() {
  const ch = player.channel;
  const on = !!ch && store.isFavorite(ch.url);
  els.nowFav.setAttribute("aria-pressed", String(on));
  els.nowFav.setAttribute("aria-label", on ? "Quitar de favoritos" : "Agregar a favoritos");
}

function toggleFavorite(channel) {
  const on = store.toggleFavorite(channel);
  haptic(on ? 12 : 6);
  toast(on ? "Agregado a favoritos" : "Quitado de favoritos");
  document.querySelectorAll(`.row[data-url="${CSS.escape(channel.url)}"] [data-fav]`).forEach((b) => {
    b.setAttribute("aria-pressed", String(on));
    b.setAttribute("aria-label", `${on ? "Quitar de" : "Agregar a"} favoritos: ${channel.name}`);
    if (on) motion()?.animate(b.firstChild, { scale: [1, 1.35, 1] }, { duration: 0.35 });
  });
  syncFavButton();
  if (state.tab === "mios") renderChannels();
}

async function shareChannel() {
  const ch = player.channel;
  if (!ch) return;
  try {
    if (navigator.share) { await navigator.share({ title: ch.name, text: `${ch.name} en vivo`, url: ch.url }); return; }
    await navigator.clipboard.writeText(ch.url);
    toast("Enlace copiado");
  } catch (err) {
    if (err?.name !== "AbortError") toast("No se pudo compartir");
  }
}

/* ---------- Agregar canal o lista ---------- */
function openSheet(dialog) {
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
}

async function submitAdd(e) {
  e.preventDefault();
  const url = els.addUrl.value.trim();
  const name = els.addName.value.trim();
  els.addError.textContent = "";
  if (!/^https?:\/\/\S+$/i.test(url)) { els.addError.textContent = "Escribe un enlace válido que empiece con http:// o https://"; return; }

  els.addSubmit.disabled = true;
  els.addSubmit.textContent = "Cargando…";
  try {
    let channels;
    if (/\.m3u8(\?|$)/i.test(url) || /m3u8/i.test(url)) {
      channels = [{ name: name || host(url) || "Mi canal", logo: "", group: "Agregado", url, quality: "", flags: [] }];
    } else {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error("http");
      channels = parseM3U(await res.text(), name || "Agregado");
      if (!channels.length) { els.addError.textContent = "No encontré canales en ese enlace."; return; }
    }
    const added = store.addCustom(channels);
    els.addSheet.close();
    els.addForm.reset();
    toast(added ? (added === 1 ? "Canal agregado" : `${added} canales agregados`) : "Ya tenías estos canales");
    await showTab("mios", { fromUser: true });
    if (channels.length === 1) play(channels[0]);
  } catch {
    els.addError.textContent = "No se pudo leer ese enlace. Puede que el servidor no permita abrirlo desde el navegador.";
  } finally {
    els.addSubmit.disabled = false;
    els.addSubmit.textContent = "Agregar";
  }
}

/* ---------- Instalación ---------- */
function setupInstall() {
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  if (standalone) return;
  let deferred = null;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e;
    els.installBtn.hidden = false;
  });
  if (isIOS) els.installBtn.hidden = false;

  els.installBtn.addEventListener("click", async () => {
    if (deferred) {
      deferred.prompt();
      await deferred.userChoice.catch(() => null);
      deferred = null;
      els.installBtn.hidden = true;
    } else {
      openSheet(els.iosSheet);
    }
  });
  window.addEventListener("appinstalled", () => { els.installBtn.hidden = true; });
}

/* ---------- Eventos ---------- */
function bindEvents() {
  els.tabs.forEach((t) => t.addEventListener("click", () => {
    if (t.dataset.tab === state.tab) { window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    haptic(5);
    showTab(t.dataset.tab, { fromUser: true });
  }));

  els.list.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const i = Number(btn.dataset.play ?? btn.dataset.fav ?? btn.dataset.remove);
    const channel = state.visible[i];
    if (!channel) return;
    if ("play" in btn.dataset) play(channel);
    else if ("fav" in btn.dataset) toggleFavorite(channel);
    else if ("remove" in btn.dataset) {
      store.removeCustom(channel.url);
      toast("Canal quitado");
      renderChannels();
    }
  });
  wireLogoEvents(document.body);

  els.chips.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    state.group = chip.dataset.group;
    els.chips.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", String(c === chip)));
    chip.scrollIntoView({ inline: "nearest", block: "nearest", behavior: "smooth" });
    renderChannels();
  });

  let searchTimer = 0;
  els.search.addEventListener("input", () => {
    els.clearSearch.hidden = !els.search.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { state.query = els.search.value.trim(); renderChannels(); }, 140);
  });
  els.search.addEventListener("keydown", (e) => { if (e.key === "Enter") els.search.blur(); });
  els.clearSearch.addEventListener("click", () => {
    els.search.value = "";
    els.clearSearch.hidden = true;
    state.query = "";
    renderChannels();
    els.search.focus();
  });

  $("#prevBtn").addEventListener("click", () => step(-1));
  $("#nextBtn").addEventListener("click", () => step(1));
  $("#skipBtn").addEventListener("click", () => step(1));
  $("#retryBtn").addEventListener("click", () => player.retry());
  els.nowFav.addEventListener("click", () => player.channel && toggleFavorite(player.channel));
  $("#shareBtn").addEventListener("click", shareChannel);

  $("#addBtn").addEventListener("click", () => { els.addError.textContent = ""; openSheet(els.addSheet); });
  els.addForm.addEventListener("submit", submitAdd);
  document.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => b.closest("dialog").close()));
  // Cerrar al tocar fuera (respaldo para navegadores sin closedby)
  document.querySelectorAll("dialog.sheet").forEach((d) => d.addEventListener("click", (e) => { if (e.target === d) d.close(); }));

  window.addEventListener("online", () => { if (!state.cache[state.tab] && state.tab !== "mios") showTab(state.tab); });
}

/* ---------- Inicio ---------- */
async function init() {
  bindEvents();
  setupInstall();
  setupUpdates({ onUpdating: () => toast("Actualizando…") });
  await showTab(state.tab);
  requestAnimationFrame(() => els.splash.classList.add("done"));
  setTimeout(() => els.splash.remove(), 800);
}

init();
