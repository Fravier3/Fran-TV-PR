// Datos del usuario en el teléfono (localStorage). Nunca se borran en actualizaciones.

const KEY = "frantv:data";
const SCHEMA = 1;
const MAX_RECENTS = 12;

const empty = () => ({ schema: SCHEMA, favorites: [], recents: [], custom: [], lastTab: "fran" });

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null");
    if (!raw || typeof raw !== "object") return empty();
    return { ...empty(), ...raw, schema: SCHEMA };
  } catch {
    return empty();
  }
}

let data = load();

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* almacenamiento lleno o bloqueado */ }
}

const slim = ({ name, logo, group, url, quality = "", flags = [] }) => ({ name, logo, group, url, quality, flags });

export const store = {
  get favorites() { return data.favorites; },
  get recents() { return data.recents; },
  get custom() { return data.custom; },
  get lastTab() { return data.lastTab; },
  set lastTab(tab) { data.lastTab = tab; save(); },

  isFavorite(url) { return data.favorites.some((c) => c.url === url); },

  toggleFavorite(channel) {
    const on = !this.isFavorite(channel.url);
    data.favorites = on
      ? [slim(channel), ...data.favorites]
      : data.favorites.filter((c) => c.url !== channel.url);
    save();
    return on;
  },

  addRecent(channel) {
    data.recents = [slim(channel), ...data.recents.filter((c) => c.url !== channel.url)].slice(0, MAX_RECENTS);
    save();
  },

  addCustom(channels) {
    const known = new Set(data.custom.map((c) => c.url));
    const fresh = channels.filter((c) => !known.has(c.url)).map(slim);
    data.custom = [...fresh, ...data.custom];
    save();
    return fresh.length;
  },

  removeCustom(url) {
    data.custom = data.custom.filter((c) => c.url !== url);
    save();
  },

  clearRecents() { data.recents = []; save(); },
};
