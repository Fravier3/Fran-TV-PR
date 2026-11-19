// Lectura de listas M3U / M3U8 a objetos de canal.

const QUALITY_RE = /\s*\((?:\d{3,4}[pi]|SD|HD|FHD|UHD|4K)\)/gi;
const TAGS_RE = /\s*\[[^\]]*]/g;
// Algunas entradas traen la URL pegada al final del nombre y sin "http://"
const INLINE_URL_RE = /\s+((?:https?:\/\/)?[\w.-]+(?::\d+)?\/\S+\.m3u8\S*)$/i;
const SECTION_RE = /^([^#:/][^:/]{1,40}):$/; // ej. "Colombia:"

const GROUP_ES = {
  general: "General", news: "Noticias", religious: "Religión", family: "Familia",
  kids: "Infantil", music: "Música", sports: "Deportes", movies: "Cine",
  entertainment: "Entretenimiento", culture: "Cultura", documentary: "Documentales",
  education: "Educación", lifestyle: "Estilo de vida", comedy: "Comedia", series: "Series",
  business: "Negocios", undefined: "Otros", animation: "Animación", classic: "Clásicos",
  cooking: "Cocina", travel: "Viajes", weather: "Clima", shop: "Compras", science: "Ciencia",
  legislative: "Gobierno", outdoor: "Aire libre", relax: "Relax", auto: "Motor",
  public: "Pública", xxx: "Adultos",
};

function attr(line, name) {
  const m = line.match(new RegExp(name + '="([^"]*)"', "i"));
  return m ? m[1].trim() : "";
}

export function cleanName(name) {
  return String(name || "Canal").replace(TAGS_RE, "").replace(QUALITY_RE, "").replace(/\s+/g, " ").trim() || "Canal";
}

export function translateGroup(group) {
  const first = String(group || "").split(";")[0].trim();
  if (!first) return "";
  return GROUP_ES[first.toLowerCase()] || first;
}

function quality(title) {
  const m = title.match(/\((\d{3,4})[pi]\)/i);
  if (!m) return "";
  const n = Number(m[1]);
  return n >= 2160 ? "4K" : n >= 1080 ? "Full HD" : n >= 720 ? "HD" : "SD";
}

const isHttp = (u) => /^https?:\/\//i.test(u);

/** @returns {{name:string, logo:string, group:string, url:string, quality:string, flags:string[]}[]} */
export function parseM3U(text, fallbackGroup = "") {
  const lines = String(text).split(/\r?\n/);
  const out = [];
  const seen = new Set();
  let section = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const sec = line.match(SECTION_RE);
    if (sec) { section = sec[1].trim(); continue; }
    if (!line.startsWith("#EXTINF")) continue;

    // El nombre va después de la coma que cierra los atributos (los atributos pueden tener comas)
    const quoteComma = line.lastIndexOf('",');
    const comma = quoteComma > -1 ? quoteComma + 1 : line.indexOf(",");
    let title = comma > -1 ? line.slice(comma + 1).trim() : "";
    if (!title) title = attr(line, "tvg-name") || "Canal";

    let url = "";
    const inline = title.match(INLINE_URL_RE);
    if (inline) {
      url = isHttp(inline[1]) ? inline[1] : "http://" + inline[1];
      title = title.slice(0, inline.index).trim();
    } else {
      for (let j = i + 1; j < lines.length; j++) {
        const next = lines[j].trim();
        if (next.startsWith("#EXTINF")) break;
        if (next && !next.startsWith("#")) { url = next; i = j; break; }
      }
    }
    if (!isHttp(url) || seen.has(url)) continue;
    seen.add(url);

    const logo = attr(line, "tvg-logo");
    const flags = [];
    if (/\[geo-blocked]/i.test(title)) flags.push("Bloqueo regional");
    if (/\[not 24\/7]/i.test(title)) flags.push("No 24/7");

    out.push({
      name: cleanName(title),
      logo: isHttp(logo) ? logo : "",
      group: translateGroup(attr(line, "group-title")) || section || fallbackGroup,
      url,
      quality: quality(title),
      flags,
    });
  }
  return out;
}
