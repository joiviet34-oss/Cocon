#!/usr/bin/env node
/**
 * seo-fix.js — Correction SEO en masse des articles de blog Cocon
 *
 * Usage, depuis la racine du repo :
 *   node seo-fix.js ./blog --dry     (simulation, n'écrit rien)
 *   node seo-fix.js ./blog           (applique)
 *
 * Idempotent : relancer le script ne duplique rien.
 *
 * Sur chaque article :
 *  1. Corrige og:image (chemin cassé) + og:image:width/height/alt + twitter:image
 *  2. Ajoute meta robots avec max-image-preview:large
 *  3. Ajoute un fallback favicon PNG
 *  4. Enrichit le schema Article : auteur Person, image, dateModified, inLanguage, publisher logo
 *  5. Ajoute un schema BreadcrumbList
 *  6. Ajoute une section FAQ visible + le schema FAQPage correspondant
 *  7. Ajoute un bloc auteur E-E-A-T en fin d'article
 *  8. Insère les emplacements d'images (1 hero + 2 inline), qui se masquent
 *     automatiquement tant que le fichier image n'existe pas
 *  9. Injecte le CSS nécessaire
 * 10. Nettoie les tirets cadratins et points médians
 * 11. Met à jour la date de mise à jour visible et le sitemap
 */

const fs = require('fs');
const path = require('path');
const { AUTHOR, FAQ, IMAGES } = require('./seo-data.js');

const DIR = process.argv[2] || './blog';
const DRY = process.argv.includes('--dry');
const SITE = 'https://cocon-app.fr';
const IMG_BASE = '/blog/img/';

const today = new Date();
const ISO = today.toISOString().slice(0, 10);
const MOIS = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
const FR_DATE = `${today.getDate()} ${MOIS[today.getMonth()]} ${today.getFullYear()}`;

const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

const CSS = `
/* --- blocs SEO (seo-fix.js) --- */
.post-figure{margin:2.2rem 0}
.post-figure img{width:100%;height:auto;border-radius:14px;display:block;background:var(--sand)}
.post-hero-figure{margin:0 0 2.5rem}
.faq-section{margin:3.5rem 0 0;padding-top:2rem;border-top:1px solid var(--sand)}
.faq-section h2{margin-top:0}
.faq-item{border-bottom:1px solid rgba(196,168,130,.25)}
.faq-item summary{font-weight:700;cursor:pointer;color:var(--charcoal);font-size:1.02rem;padding:1.1rem 2rem 1.1rem 0;list-style:none;position:relative}
.faq-item summary::-webkit-details-marker{display:none}
.faq-item summary::after{content:'+';position:absolute;right:0;top:1rem;color:var(--terracotta);font-size:1.3rem;line-height:1}
.faq-item[open] summary::after{content:'-'}
.faq-item p{margin:0 0 1.2rem;color:var(--deep-brown);line-height:1.75;font-size:.95rem}
.author-box{display:flex;gap:1.1rem;align-items:flex-start;background:var(--warm-white);border:1px solid var(--sand);border-radius:14px;padding:1.5rem;margin:2.5rem 0 0}
.author-box .avatar{flex:0 0 48px;width:48px;height:48px;border-radius:50%;background:var(--terracotta);color:#fff;display:flex;align-items:center;justify-content:center;font-family:var(--font-display);font-size:1.1rem}
.author-box .who{font-weight:700;color:var(--charcoal);font-size:.95rem;margin-bottom:.15rem}
.author-box .role{font-size:.8rem;color:var(--terracotta);margin-bottom:.6rem}
.author-box .bio{font-size:.87rem;color:var(--deep-brown);line-height:1.7;margin:0}
@media(max-width:600px){.author-box{flex-direction:column}}
/* --- fin blocs SEO --- */`;

const initials = name => name.split(/\s+/).map(w => w[0]).join('').slice(0,2).toUpperCase();

function figure(img, isHero){
  const dims = isHero ? 'width="1200" height="675"' : 'width="1200" height="800"';
  const load = isHero ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"';
  const cls  = isHero ? 'post-figure post-hero-figure' : 'post-figure';
  return `<figure class="${cls}"><img src="${IMG_BASE}${img.file}" alt="${esc(img.alt)}" ${dims} ${load} decoding="async" onerror="this.closest('figure').style.display='none'"></figure>`;
}

function faqHtml(items){
  const body = items.map(([q,a]) =>
    `            <details class="faq-item"><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`
  ).join('\n');
  return `\n        <section class="faq-section">\n            <h2>Questions fréquentes</h2>\n${body}\n        </section>\n`;
}

function authorHtml(){
  return `\n        <aside class="author-box">
            <div class="avatar">${initials(AUTHOR.name)}</div>
            <div>
                <div class="who">${esc(AUTHOR.name)}</div>
                <div class="role">${esc(AUTHOR.jobTitle)}</div>
                <p class="bio">${esc(AUTHOR.bio)}</p>
            </div>
        </aside>\n`;
}

function cleanDashes(html){
  const m = html.match(/([\s\S]*?<body[^>]*>)([\s\S]*?)(<\/body>[\s\S]*)/i);
  if(!m) return html;
  let body = m[2];
  body = body.replace(/\.\s*·\s*/g, '. ');
  body = body.replace(/\s+·\s+/g, ', ');
  body = body.replace(/\s+—\s+/g, ', ');
  body = body.replace(/—/g, ',');
  body = body.replace(/, Lecture /g, ', lecture ');
  return m[1] + body + m[3];
}

function processFile(file){
  const slug = path.basename(file, '.html');
  let html = fs.readFileSync(file, 'utf8');
  const before = html;
  const notes = [];

  const h1 = (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [,''])[1].replace(/<[^>]*>/g,'').trim();
  const crumb = (html.match(/class="breadcrumb"[^>]*>[\s\S]*?→\s*([^<]+?)\s*<\/div>/) || [,h1])[1].trim();
  const desc = (html.match(/<meta name="description" content="([^"]*)"/) || [,''])[1];
  const url = `${SITE}/blog/${slug}`;
  const imgs = IMAGES[slug] || [];
  const hero = imgs.find(i => i.slot === 'hero');
  const heroUrl = hero ? `${SITE}${IMG_BASE}${hero.file}` : `${SITE}/ogimage.png`;

  // 1. og:image + twitter:image
  if(/og:image" content="[^"]*og-image\.png"/.test(html) || !html.includes('twitter:image')){
    html = html.replace(/<meta property="og:image" content="[^"]*">/,
      `<meta property="og:image" content="${heroUrl}">\n    <meta property="og:image:width" content="1200">\n    <meta property="og:image:height" content="675">\n    <meta property="og:image:alt" content="${esc(hero ? hero.alt : h1)}">\n    <meta name="twitter:image" content="${heroUrl}">`);
    notes.push('og:image corrigé');
  }

  // 2. meta robots
  if(!/name="robots"/.test(html)){
    html = html.replace(/(<meta name="description"[^>]*>)/,
      `$1\n    <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1">`);
    notes.push('meta robots');
  }

  // 3. favicon fallback
  if(!html.includes('favicon512.png')){
    html = html.replace(/(<link rel="icon" href="\/favicon\.svg"[^>]*>)/,
      `$1\n    <link rel="alternate icon" href="/favicon512.png" type="image/png">`);
    notes.push('favicon fallback');
  }

  // 4. schema Article enrichi
  html = html.replace(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g, (full, json) => {
    let data;
    try { data = JSON.parse(json); } catch(e){ return full; }
    if(data['@type'] !== 'Article') return full;
    data.author = { '@type':'Person', name:AUTHOR.name, jobTitle:AUTHOR.jobTitle, url:AUTHOR.url };
    data.publisher = { '@type':'Organization', name:'Cocon', url:SITE,
      logo:{ '@type':'ImageObject', url:`${SITE}/favicon512.png`, width:512, height:512 } };
    data.image = [heroUrl];
    data.dateModified = ISO;
    data.inLanguage = 'fr-FR';
    if(!data.description && desc) data.description = desc;
    data.mainEntityOfPage = { '@type':'WebPage', '@id':url };
    notes.push('schema Article enrichi');
    return `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
  });

  // 5. BreadcrumbList
  if(!html.includes('BreadcrumbList')){
    const bc = { '@context':'https://schema.org','@type':'BreadcrumbList', itemListElement:[
      {'@type':'ListItem',position:1,name:'Accueil',item:`${SITE}/`},
      {'@type':'ListItem',position:2,name:'Blog',item:`${SITE}/blog`},
      {'@type':'ListItem',position:3,name:crumb,item:url}
    ]};
    html = html.replace('</head>', `    <script type="application/ld+json">${JSON.stringify(bc)}</script>\n</head>`);
    notes.push('BreadcrumbList');
  }

  // 6. FAQPage
  const faq = FAQ[slug];
  if(faq && !html.includes('FAQPage')){
    const fp = { '@context':'https://schema.org','@type':'FAQPage',
      mainEntity: faq.map(([q,a]) => ({'@type':'Question',name:q,acceptedAnswer:{'@type':'Answer',text:a}})) };
    html = html.replace('</head>', `    <script type="application/ld+json">${JSON.stringify(fp)}</script>\n</head>`);
    notes.push('FAQPage');
  }

  // 7. CSS
  if(!html.includes('blocs SEO')){
    html = html.replace('</style>', CSS + '\n</style>');
    notes.push('CSS');
  }

  // 8. emplacements images
  if(imgs.length && !html.includes('<figure class="post-figure')){
    if(hero) html = html.replace(/(<article[^>]*>)/, `$1\n        ${figure(hero, true)}`);
    const inline = imgs.filter(i => i.slot !== 'hero').sort((a,b) => a.slot - b.slot);
    let h2i = 0;
    html = html.replace(/<h2/g, () => {
      h2i++;
      const hit = inline.find(i => i.slot === h2i - 1);
      return hit ? `${figure(hit,false)}\n\n        <h2` : '<h2';
    });
    notes.push(`${imgs.length} emplacements images`);
  }

  // 9. FAQ visible + bloc auteur
  if(faq && !html.includes('<section class="faq-section"')){
    html = html.replace(/<\/article>/, faqHtml(faq) + authorHtml() + '    </article>');
    notes.push('FAQ visible + bloc auteur');
  }

  // 10. date visible
  html = html.replace(/Mis à jour le [0-9]{1,2}(?:er)? [A-Za-zûéèôêà]+ [0-9]{4}/gi, `Mis à jour le ${FR_DATE}`);

  // 11. tirets cadratins et points médians
  html = cleanHeadTypography(cleanDashes(html));

  if(html !== before){
    if(!DRY) fs.writeFileSync(file, html, 'utf8');
    console.log(`  ${slug} : ${[...new Set(notes)].join(', ')}`);
    return true;
  }
  console.log(`  ${slug} : déjà à jour`);
  return false;
}

// Nettoie aussi les tirets cadratins dans les balises title / description / og
function cleanHeadTypography(html){
  return html.replace(/(<title>|<meta (?:name|property)="(?:description|og:title|og:description|og:image:alt|twitter:title|twitter:description)" content=")([^<"]*)/g,
    (m, pre, txt) => pre + txt.replace(/\s+—\s+/g, ', ').replace(/—/g, ',').replace(/\s+·\s+/g, ', ')
      // minuscule après la virgule quand le mot n'est pas un nom propre
      .replace(/, ([A-ZÀ-Þ])([a-zà-ÿ]+)/g, (mm, c, rest) => ', ' + c.toLowerCase() + rest));
}

// Index du blog : schema Blog + Open Graph complet
function processIndex(file){
  if(!fs.existsSync(file)) return false;
  let html = fs.readFileSync(file, 'utf8');
  const before = html;

  if(!/name="robots"/.test(html)){
    html = html.replace(/(<meta name="description"[^>]*>)/,
      `$1\n    <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1">`);
  }
  // favicon-512.png n'existe pas dans le repo, le fichier réel est favicon512.png
  html = html.replace(/href="\/favicon-512\.png"/g, 'href="/favicon512.png"');

  if(!html.includes('og:image')){
    html = html.replace(/(<meta property="og:description"[^>]*>)/,
      `$1\n    <meta property="og:type" content="website">\n    <meta property="og:url" content="${SITE}/blog/">\n    <meta property="og:locale" content="fr_FR">\n    <meta property="og:site_name" content="Cocon">\n    <meta property="og:image" content="${SITE}/ogimage.png">\n    <meta name="twitter:card" content="summary_large_image">\n    <meta name="twitter:image" content="${SITE}/ogimage.png">`);
  }

  if(!html.includes('"@type":"Blog"') && !html.includes('"@type": "Blog"')){
    const slugs = fs.readdirSync(path.dirname(file))
      .filter(f => f.endsWith('.html') && f !== 'index.html')
      .map(f => path.basename(f, '.html'));
    const blog = {
      '@context':'https://schema.org','@type':'Blog',
      '@id':`${SITE}/blog/`, name:'Blog Cocon', inLanguage:'fr-FR',
      description:'Guides pratiques pour organiser un projet de décoration et de rénovation.',
      publisher:{ '@type':'Organization', name:'Cocon', url:SITE,
        logo:{ '@type':'ImageObject', url:`${SITE}/favicon512.png` } },
      blogPost: slugs.map(s => ({ '@type':'BlogPosting', '@id':`${SITE}/blog/${s}`, url:`${SITE}/blog/${s}` }))
    };
    const bc = { '@context':'https://schema.org','@type':'BreadcrumbList', itemListElement:[
      {'@type':'ListItem',position:1,name:'Accueil',item:`${SITE}/`},
      {'@type':'ListItem',position:2,name:'Blog',item:`${SITE}/blog`}
    ]};
    html = html.replace('</head>',
      `    <script type="application/ld+json">${JSON.stringify(blog)}</script>\n    <script type="application/ld+json">${JSON.stringify(bc)}</script>\n</head>`);
  }

  html = cleanHeadTypography(cleanDashes(html));

  if(html !== before){
    if(!DRY) fs.writeFileSync(file, html, 'utf8');
    console.log('  index du blog : og complet, schema Blog, BreadcrumbList, favicon corrigé');
    return true;
  }
  console.log('  index du blog : déjà à jour');
  return false;
}

function updateSitemap(){
  const candidates = ['sitemap.xml', path.join(path.dirname(DIR), 'sitemap.xml')];
  const target = candidates.find(fs.existsSync);
  if(!target){ console.log('\nsitemap.xml introuvable, ignoré'); return; }
  let xml = fs.readFileSync(target, 'utf8');
  xml = xml.replace(/<lastmod>[^<]*<\/lastmod>/g, `<lastmod>${ISO}</lastmod>`);
  if(!DRY) fs.writeFileSync(target, xml, 'utf8');
  console.log(`\nsitemap.xml : lastmod mis au ${ISO}`);
}

console.log(`\nCorrection SEO ${DRY ? '(simulation, aucune écriture)' : ''} sur ${DIR}\n`);
const files = fs.readdirSync(DIR).filter(f => f.endsWith('.html') && f !== 'index.html');
let n = 0;
files.forEach(f => { if(processFile(path.join(DIR, f))) n++; });
processIndex(path.join(DIR,'index.html'));
updateSitemap();
console.log(`\n${n}/${files.length} fichiers modifiés.`);
console.log(`Images attendues dans ${DIR}/img/ (voir images-a-produire.md).`);
console.log(`Les emplacements sans fichier image se masquent tout seuls, rien ne casse en prod.\n`);
