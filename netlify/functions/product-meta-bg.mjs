// netlify/functions/product-meta-bg.mjs
// Fonction d'arrière-plan (jusqu'à 15 min) lancée par product-meta quand la lecture
// directe ne suffit pas. Interroge Zyte (navigateur + anti-bot) puis Microlink, et
// dépose le résultat dans le cache que product-meta consulte quand l'app rappelle.

import { parseTarget, openCache, resultKey, statusKey, cachePut,
         viaZyte, viaMicrolink, mergeResults, usable, isGood, isComplete } from '../lib/product-extract.mjs';

export default async (req) => {
  let body = {};
  try { body = await req.json(); } catch {}
  const { target, error } = parseTarget(body.url);
  if (error) return;

  const cache = await openCache();
  const tried = ['direct:' + (body.directError || 'incomplet')];
  let best = usable(body.partial) ? body.partial : null;
  let source = best ? 'direct' : null;

  if (process.env.ZYTE_API_KEY) {
    const z = await viaZyte(target.href, 110000);
    tried.push('zyte:' + (z.error || 'ok'));
    if (!z.error) { best = mergeResults(best, z); source = 'zyte'; }
  }

  if (!isComplete(best)) {
    const ml = await viaMicrolink(target.href, 25000);
    tried.push('microlink:' + (ml.error || 'ok'));
    if (!ml.error) { best = mergeResults(best, ml); source = source === 'zyte' ? 'zyte' : 'microlink'; }
  }

  if (isGood(best)) {
    // Résultat exploitable : servi à l'app au prochain rappel, puis pendant 7 jours
    await cachePut(cache, resultKey(target.href), { ...best, source }, isComplete(best) ? 604800 : 3600);
  } else {
    await cachePut(cache, statusKey(target.href), { state: 'failed', partial: best, tried }, 600);
  }
  console.log('product-meta-bg', target.hostname, tried.join(' '), isGood(best) ? 'OK' : 'ÉCHEC');
};

export const config = { background: true };
