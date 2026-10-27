// netlify/functions/product-meta.mjs
// Récupère nom, prix, photo, enseigne et réf d'une page produit.
// Appel : /.netlify/functions/product-meta?url=https://...
//
// Netlify coupe toute réponse synchrone vers 30 s. Donc :
//   1. Résultat déjà connu (cache 7 jours) : réponse immédiate.
//   2. Lecture directe de la page (gratuit, ~2 s) : si nom + prix + photo, réponse immédiate.
//   3. Sinon : on lance product-meta-bg (fonction d'arrière-plan, jusqu'à 15 min) qui
//      interroge Zyte puis Microlink, et on répond tout de suite { pending: true }
//      avec ce qu'on a déjà. L'app rappelle ensuite cette URL avec &poll=1 toutes
//      les 3 s jusqu'à obtenir le résultat ou { error }.

import { parseTarget, openCache, resultKey, statusKey, cacheGet, cachePut,
         viaDirect, usable, isComplete } from '../lib/product-extract.mjs';

const RUN_TTL = 300; // une recherche en arrière-plan est considérée en cours pendant 5 min max

export default async (req) => {
  const reqUrl = new URL(req.url);
  const { target, error } = parseTarget(reqUrl.searchParams.get('url'));
  if (error) return json({ error }, 400);
  const isPoll = reqUrl.searchParams.has('poll');

  const cache = await openCache();

  // 1. Déjà connu
  const known = await cacheGet(cache, resultKey(target.href));
  if (known) return json({ ...known, cached: true }, 200, true);

  // Recherche en arrière-plan déjà lancée pour ce lien ?
  const status = await cacheGet(cache, statusKey(target.href));
  if (status?.state === 'failed') return json({ ...(status.partial || {}), error: status.partial?.name ? undefined : 'unreadable', source: status.partial?.name ? 'partial' : undefined, tried: status.tried });
  const running = status?.state === 'running' && Date.now() - status.t < RUN_TTL * 1000;
  if (isPoll) return json(running ? { pending: true } : { error: 'expired' });
  if (running) return json({ pending: true });

  // 2. Lecture directe
  const direct = await viaDirect(target, 2500);
  if (isComplete(direct)) {
    await cachePut(cache, resultKey(target.href), { ...direct, source: 'direct' }, 604800);
    return json({ ...direct, source: 'direct' }, 200, true);
  }

  // 3. Arrière-plan
  const partial = usable(direct) ? direct : null;
  await cachePut(cache, statusKey(target.href), { state: 'running', t: Date.now() }, RUN_TTL);
  try {
    const bg = await fetch(`${reqUrl.origin}/.netlify/functions/product-meta-bg`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: target.href, partial, directError: direct.error || null }),
      signal: AbortSignal.timeout(5000),
    });
    if (bg.status !== 202 && !bg.ok) throw new Error('bg_' + bg.status);
  } catch (e) {
    await cachePut(cache, statusKey(target.href), { state: 'failed', partial, tried: ['bg:' + (e.message || 'launch')] }, 60);
    return json(partial ? { ...partial, source: 'partial' } : { error: 'unreadable', tried: ['direct:' + direct.error, 'bg:launch'] });
  }
  return json({ ...(partial || {}), pending: true });
};

function json(obj, status = 200, cache = false) {
  for (const k of Object.keys(obj)) if (obj[k] === undefined) delete obj[k];
  const headers = { 'content-type': 'application/json; charset=utf-8', 'netlify-vary': 'query=url' };
  if (cache) {
    headers['cache-control'] = 'public, max-age=86400';
    headers['netlify-cdn-cache-control'] = 'public, durable, max-age=604800';
  } else {
    headers['cache-control'] = 'no-store';
  }
  return new Response(JSON.stringify(obj), { status, headers });
}
