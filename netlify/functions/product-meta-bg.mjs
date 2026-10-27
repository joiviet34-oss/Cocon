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
    // Zyte recommande de réessayer les 520 (ban non contourné à temps) : 3 essais max, ~4 min au total
    const deadline = Date.now() + 240000;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const z = await viaZyte(target.href, Math.min(100000, deadline - Date.now()));
      tried.push(`zyte${attempt > 1 ? '#' + attempt : ''}:` + (z.error || 'ok'));
      if (!z.error) { best = mergeResults(best, z); source = 'zyte'; break; }
      if (!z.retryable || deadline - Date.now() < 30000) break;
      await new Promise(r => setTimeout(r, 3000 * attempt + Math.random() * 2000));
    }
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
