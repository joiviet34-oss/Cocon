// netlify/lib/product-extract.mjs
// Code partagé par product-meta (réponse rapide) et product-meta-bg (fonction d'arrière-plan).

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36';
const BLOCKED_NAME = /access denied|accès refusé|captcha|robot|un instant|just a moment|attention required|forbidden|pardon our interruption/i;

// ─── Validation & cache ───────────────────────────────────────

export function parseTarget(raw) {
  let target;
  try { target = new URL(raw); } catch { return { error: 'bad_url' }; }
  if (!/^https?:$/.test(target.protocol) ||
      /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|\[)/.test(target.hostname)) {
    return { error: 'forbidden' };
  }
  return { target };
}

// Cache API Netlify : partagé entre les deux fonctions (même région), lectures/écritures cohérentes
export async function openCache() {
  try { return typeof caches !== 'undefined' ? await caches.open('product-meta') : null; } catch { return null; }
}
export const resultKey = (href) => new Request('https://product-meta.cache/?url=' + encodeURIComponent(href));
export const statusKey = (href) => new Request('https://product-meta.status/?url=' + encodeURIComponent(href));

export async function cacheGet(cache, key) {
  try { const r = await cache?.match(key); return r ? await r.json() : null; } catch { return null; }
}
export async function cachePut(cache, key, obj, ttlSeconds) {
  try {
    await cache?.put(key, new Response(JSON.stringify(obj), {
      headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${ttlSeconds}` },
    }));
  } catch {}
}

// ─── Sources ──────────────────────────────────────────────────

export function usable(r) { return !!(r && !r.error && r.name && !BLOCKED_NAME.test(r.name)); }
export function isGood(r) { return usable(r) && !!(r.price || r.image); }
export function isComplete(r) { return usable(r) && !!r.price && !!r.image; }

// Garde les valeurs déjà trouvées, complète avec la nouvelle source
export function mergeResults(a, b) {
  const base = usable(a) ? a : {};
  const out = {};
  for (const k of ['name', 'price', 'image', 'site', 'brand', 'ref']) out[k] = base[k] ?? b?.[k] ?? null;
  return out;
}

export async function viaDirect(target, ms) {
  try {
    const res = await fetch(target, {
      headers: { 'User-Agent': UA, 'Accept': 'text/html', 'Accept-Language': 'fr-FR,fr;q=0.9' },
      redirect: 'follow',
      signal: AbortSignal.timeout(ms),
    });
    if (!res.ok) return { error: 'http_' + res.status };
    const html = (await res.text()).slice(0, 2_000_000);
    return extract(html, res.url || target.href);
  } catch {
    return { error: 'timeout' };
  }
}

export async function viaZyte(pageUrl, ms) {
  try {
    const res = await fetch('https://api.zyte.com/v1/extract', {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(process.env.ZYTE_API_KEY + ':'),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: pageUrl,
        product: true,
        // Rendu dans un vrai navigateur (défaut Zyte) : nécessaire pour passer les murs anti-bot
        // Sortie depuis une IP française : les sites FR bloquent ou redirigent souvent l'étranger
        geolocation: 'FR',
      }),
      signal: AbortSignal.timeout(ms),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { error: 'http_' + res.status + (body.type ? '_' + String(body.type).split('/').pop() : ''), retryable: res.status === 520 || res.status === 521 };
    const p = body.product;
    if (!p || !p.name) return { error: 'no_product' };
    return {
      name: cleanName(p.name, null, pageUrl),
      price: parsePrice(p.price),
      image: p.mainImage?.url || p.images?.[0]?.url || null,
      site: siteFromHost(pageUrl),
      brand: p.brand?.name || null,
      ref: p.sku || p.mpn || p.productId || null,
    };
  } catch {
    return { error: 'timeout' };
  }
}

export async function viaMicrolink(pageUrl, ms) {
  const key = process.env.MICROLINK_API_KEY;
  const q = new URLSearchParams({
    url: pageUrl,
    'data.ld.selectorAll': 'script[type="application/ld+json"]',
    'data.ld.attr': 'html',
    'data.price.selector': 'meta[property="product:price:amount"],meta[property="og:price:amount"],meta[itemprop="price"]',
    'data.price.attr': 'content',
  });
  try {
    const res = await fetch(`https://${key ? 'pro' : 'api'}.microlink.io/?${q}`, {
      headers: key ? { 'x-api-key': key } : {},
      signal: AbortSignal.timeout(ms),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.status !== 'success') return { error: 'http_' + (body.code || res.status) };
    const d = body.data || {};

    // On reconstruit un mini-HTML pour réutiliser exactement le même extracteur
    let html = [].concat(d.ld || []).filter(Boolean)
      .map(s => `<script type="application/ld+json">${s}</script>`).join('');
    if (d.price) html += `<meta property="product:price:amount" content="${String(d.price).replace(/"/g, '')}">`;
    const r = extract(html, pageUrl);

    r.name = r.name || cleanName(d.title, d.publisher, pageUrl);
    r.image = r.image || d.image?.url || null;
    r.site = r.site || d.publisher || siteFromHost(pageUrl);
    return r;
  } catch {
    return { error: 'timeout' };
  }
}

const SITE_NAMES = {
  ikea: 'IKEA', maisonsdumonde: 'Maisons du Monde', laredoute: 'La Redoute', ampm: 'AM.PM',
  leroymerlin: 'Leroy Merlin', castorama: 'Castorama', conforama: 'Conforama', but: 'BUT',
  habitat: 'Habitat', westwing: 'Westwing', manomano: 'ManoMano', bricodepot: 'Brico Dépôt',
  zarahome: 'Zara Home', hm: 'H&M Home', fermlivingfr: 'ferm LIVING', made: 'Made.com',
  sklum: 'Sklum', kavehome: 'Kave Home', amazon: 'Amazon', cdiscount: 'Cdiscount',
  boulanger: 'Boulanger', darty: 'Darty', fnac: 'Fnac', alinea: 'Alinéa', gifi: 'Gifi',
};
export function siteFromHost(pageUrl) {
  const h = new URL(pageUrl).hostname.replace(/^(www\d?|m|fr)\./, '').split('.')[0].replace(/-/g, '');
  return SITE_NAMES[h] || h.charAt(0).toUpperCase() + h.slice(1);
}

// ─── Extraction ────────────────────────────────────────────────

export function extract(html, pageUrl) {
  let p = null;
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try { p = findProduct(JSON.parse(m[1].trim())); if (p) break; } catch { /* JSON-LD invalide, on continue */ }
  }
  if (p && p.hasVariant && !p.offers) p = { ...p, offers: [].concat(p.hasVariant)[0]?.offers };

  const offer = [].concat(p?.offers || [])[0] || {};
  const priceRaw = offer.price ?? offer.lowPrice ?? offer.priceSpecification?.price
    ?? meta(html, 'product:price:amount') ?? meta(html, 'og:price:amount') ?? meta(html, 'price')
    ?? (p || meta(html, 'og:type') === 'product' ? dataLayerPrice(html) : null);

  const ldImg = [].concat(p?.image || [])[0];
  const image = (typeof ldImg === 'object' ? ldImg?.url || ldImg?.contentUrl : ldImg)
    || meta(html, 'og:image') || meta(html, 'twitter:image');

  const site = meta(html, 'og:site_name') || null;
  const brand = typeof p?.brand === 'object' ? p.brand?.name : p?.brand;
  const name = p?.name || meta(html, 'og:title') || html.match(/<title[^>]*>([^<]*)/i)?.[1];

  return {
    name: cleanName(decode(name), site, pageUrl),
    price: parsePrice(priceRaw),
    image: absolutize(decode(image), pageUrl),
    site: decode(site),
    brand: decode(brand) || null,
    ref: p?.sku || p?.mpn || p?.productID || null,
  };
}

// Prix présent seulement dans un objet JS embarqué (data layer type Tealium, ex. IKEA : "price":["549"])
function dataLayerPrice(html) {
  const m = html.match(/"(?:product_)?price"\s*:\s*\[\s*"(\d+(?:[.,]\d{1,2})?)"/)
    || html.match(/"(?:product_price|productPrice|price_ttc)"\s*:\s*"?(\d+(?:[.,]\d{1,2})?)/);
  return m ? m[1] : null;
}

function findProduct(node) {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) { for (const n of node) { const r = findProduct(n); if (r) return r; } return null; }
  const t = [].concat(node['@type'] || []);
  if (t.includes('Product') || t.includes('ProductGroup')) return node;
  if (node['@graph']) return findProduct(node['@graph']);
  if (node.mainEntity) return findProduct(node.mainEntity);
  return null;
}

function meta(html, key) {
  const re = new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${key}["'][^>]*>`, 'i');
  const tag = html.match(re)?.[0];
  return tag?.match(/content=["']([^"']*)["']/i)?.[1] || null;
}

export function parsePrice(v) {
  if (v == null || v === '') return null;
  let s = String(v).replace(/[^\d.,]/g, '');
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.'); // 1.299,00
  else s = s.replace(',', '.');                                                       // 1299,00
  const n = parseFloat(s);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

// Retire le suffixe " | IKEA", " - Maisons du Monde", etc. seulement s'il correspond à l'enseigne
function cleanName(name, site, pageUrl) {
  if (!name) return null;
  let n = name.replace(/\s+/g, ' ').trim();
  const host = new URL(pageUrl).hostname.replace(/^www\./, '').split('.')[0];
  const parts = n.split(/\s[|–—-]\s/);
  if (parts.length > 1) {
    const last = parts[parts.length - 1].toLowerCase().replace(/\s/g, '');
    if (last.includes(host.toLowerCase()) || (site && last.includes(site.toLowerCase().replace(/\s/g, '')))) {
      n = parts.slice(0, -1).join(' - ');
    }
  }
  return n.slice(0, 100);
}

function absolutize(u, base) {
  if (!u) return null;
  try { return new URL(u, base).href; } catch { return null; }
}

function decode(s) {
  if (!s) return s;
  return String(s)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(d))
    .replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .trim();
}
