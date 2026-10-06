// netlify/functions/product-meta.mjs
// Récupère nom, prix, photo, enseigne et réf d'une page produit.
// Appel : /.netlify/functions/product-meta?url=https://...
//
// Solution 1 : lecture directe de la page (JSON-LD Product > og:/product: > <title>)
// Solution 2 : si le site bloque ou renvoie une page anti-robot, on passe par
//              Microlink (navigateur headless hébergé), qui renvoie les mêmes
//              données. Sans clé : quota gratuit quotidien limité.
//              Avec clé : variable d'env Netlify MICROLINK_API_KEY.

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36';
const BLOCKED_NAME = /access denied|accès refusé|captcha|robot|un instant|just a moment|attention required|forbidden|pardon our interruption/i;

export default async (req) => {
  const raw = new URL(req.url).searchParams.get('url');
  let target;
  try { target = new URL(raw); } catch { return json({ error: 'bad_url' }, 400); }

  // Garde-fou SSRF minimal
  if (!/^https?:$/.test(target.protocol) ||
      /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|\[)/.test(target.hostname)) {
    return json({ error: 'forbidden' }, 400);
  }

  // Solution 1 : lecture directe
  const direct = await viaDirect(target);
  if (isGood(direct)) return json({ ...direct, source: 'direct' }, 200, true);

  // Solution 2 : Microlink
  const ml = await viaMicrolink(target.href);
  if (isGood(ml) || (ml && !ml.error)) {
    const merged = mergeResults(direct, ml);
    return json({ ...merged, source: 'microlink' }, 200, isGood(merged));
  }

  // Rien d'exploitable : on renvoie au moins ce que la lecture directe a trouvé
  if (direct && !direct.error && direct.name) return json({ ...direct, source: 'direct-partial' });
  return json({ error: direct?.error || ml?.error || 'unreadable' });
};

function isGood(r) {
  return !!(r && !r.error && r.name && !BLOCKED_NAME.test(r.name) && (r.price || r.image));
}

function mergeResults(a, b) {
  const base = a && !a.error && a.name && !BLOCKED_NAME.test(a.name) ? a : {};
  const out = { ...b };
  for (const k of ['name', 'price', 'image', 'site', 'brand', 'ref']) out[k] = base[k] ?? b?.[k] ?? null;
  delete out.error;
  return out;
}

async function viaDirect(target) {
  try {
    const res = await fetch(target, {
      headers: { 'User-Agent': UA, 'Accept': 'text/html', 'Accept-Language': 'fr-FR,fr;q=0.9' },
      redirect: 'follow',
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return { error: 'fetch_' + res.status };
    const html = (await res.text()).slice(0, 2_000_000);
    return extract(html, res.url || target.href);
  } catch {
    return { error: 'timeout' };
  }
}

async function viaMicrolink(pageUrl) {
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
      signal: AbortSignal.timeout(5500),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.status !== 'success') return { error: 'microlink_' + (body.code || res.status) };
    const d = body.data || {};

    // On reconstruit un mini-HTML pour réutiliser exactement le même extracteur
    let html = [].concat(d.ld || []).filter(Boolean)
      .map(s => `<script type="application/ld+json">${s}</script>`).join('');
    if (d.price) html += `<meta property="product:price:amount" content="${String(d.price).replace(/"/g, '')}">`;
    const r = extract(html, pageUrl);

    r.name = r.name || cleanName(d.title, d.publisher, pageUrl);
    r.image = r.image || d.image?.url || null;
    r.site = r.site || d.publisher || null;
    return r;
  } catch {
    return { error: 'microlink_timeout' };
  }
}

function json(obj, status = 200, cache = false) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': cache ? 'public, max-age=86400' : 'no-store',
    },
  });
}

// ─── Extraction ────────────────────────────────────────────────

function extract(html, pageUrl) {
  let p = null;
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try { p = findProduct(JSON.parse(m[1].trim())); if (p) break; } catch { /* JSON-LD invalide, on continue */ }
  }
  if (p && p.hasVariant && !p.offers) p = { ...p, offers: [].concat(p.hasVariant)[0]?.offers };

  const offer = [].concat(p?.offers || [])[0] || {};
  const priceRaw = offer.price ?? offer.lowPrice ?? offer.priceSpecification?.price
    ?? meta(html, 'product:price:amount') ?? meta(html, 'og:price:amount') ?? meta(html, 'price');

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

function parsePrice(v) {
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
