// Fenêtre de l'extension : lit la fiche produit de l'onglet ouvert, puis la range
// dans une pièce Cocon via l'API Firestore, en tant que l'utilisateur connecté
// (les règles Firestore s'appliquent comme dans l'app).

const API_KEY = 'AIzaSyC6Bguxqoa2jTq_4lR3p9rwEBVmnMc-o60';
const PROJECT = 'cocon-5a81e';
const DOCS = `projects/${PROJECT}/databases/(default)/documents`;
const FS = `https://firestore.googleapis.com/v1/${DOCS}`;
// Page où l'utilisateur se connecte pour relier l'extension.
// Beta : la preview. À passer sur https://cocon-app.fr avant publication.
const CONNECT_ORIGIN = 'https://mini--ephemeral-syrniki-e31b2e.netlify.app';

const $ = (id) => document.getElementById(id);
const store = {
  get: (keys) => new Promise((r) => chrome.storage.local.get(keys, r)),
  set: (obj) => new Promise((r) => chrome.storage.local.set(obj, r)),
  remove: (keys) => new Promise((r) => chrome.storage.local.remove(keys, r)),
};

let product = null;
let auth = null;
let projects = [];

function show(view) {
  for (const v of ['view-loading', 'view-empty', 'view-product']) $(v).hidden = v !== view;
}
function block(name) {
  for (const b of ['block-connect', 'block-add', 'block-noproject', 'block-done']) $(b).hidden = b !== name;
}
function error(msg) { $('error').textContent = msg || ''; $('error').hidden = !msg; }

// ─── Lecture de la fiche produit (exécuté dans la page du marchand) ───
function extractProduct() {
  const d = { u: location.href };
  let p = null;
  const findP = (n) => {
    if (!n || typeof n !== 'object') return null;
    if (Array.isArray(n)) { for (const x of n) { const r = findP(x); if (r) return r; } return null; }
    const t = [].concat(n['@type'] || []);
    if (t.includes('Product') || t.includes('ProductGroup')) return n;
    return findP(n['@graph']) || findP(n.mainEntity);
  };
  document.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
    if (!p) { try { p = findP(JSON.parse(s.textContent)); } catch (e) {} }
  });
  if (p && p.hasVariant && !p.offers) { const v = [].concat(p.hasVariant)[0]; p.offers = v && v.offers; }
  const m = (k) => {
    const el = document.querySelector(`meta[property="${k}"],meta[name="${k}"],meta[itemprop="${k}"]`);
    return el ? el.getAttribute('content') : null;
  };
  const offer = p ? ([].concat(p.offers || [])[0] || {}) : {};
  let price = offer.price || offer.lowPrice || (offer.priceSpecification && offer.priceSpecification.price)
    || m('product:price:amount') || m('og:price:amount') || m('price');
  if (!price) {
    const ip = document.querySelector('[itemprop="price"]');
    if (ip) price = ip.getAttribute('content') || ip.textContent;
  }
  if (!price) {
    const mm = document.documentElement.innerHTML.match(/"(?:product_)?price"\s*:\s*\[\s*"(\d+(?:[.,]\d{1,2})?)"/);
    if (mm) price = mm[1];
  }
  let img = p && [].concat(p.image || [])[0];
  if (img && typeof img === 'object') img = img.url || img.contentUrl;
  img = img || m('og:image') || m('twitter:image');
  const h1 = document.querySelector('h1');
  d.n = (p && p.name) || m('og:title') || (h1 && h1.textContent.trim()) || document.title;
  d.p = price ? String(price) : '';
  d.i = img ? new URL(img, location.href).href : '';
  d.s = m('og:site_name') || '';
  d.r = (p && (p.sku || p.mpn || p.productID)) || '';
  d.isProduct = !!(p || m('og:type') === 'product' || m('product:price:amount') || price);
  return d;
}

// ─── Mise en forme (mêmes règles que l'app) ───
function cleanName(c) {
  let n = String(c.n || '').replace(/\s+/g, ' ').trim();
  let host = '';
  try { host = new URL(c.u).hostname.replace(/^www\./, '').split('.')[0].toLowerCase(); } catch (e) {}
  const parts = n.split(/\s[|–—-]\s/);
  if (parts.length > 1) {
    const last = parts[parts.length - 1].toLowerCase().replace(/[\s.-]/g, '');
    const site = String(c.s || '').toLowerCase().replace(/[\s.-]/g, '');
    if ((host && last.includes(host.replace(/-/g, ''))) || (site && last.includes(site))) n = parts.slice(0, -1).join(' - ');
  }
  return n.slice(0, 100) || 'Produit';
}
function parsePrice(v) {
  if (v == null || v === '') return null;
  let s = String(v).replace(/[^\d.,]/g, '');
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}
function siteName(c) {
  if (c.s) return c.s;
  try { const h = new URL(c.u).hostname.replace(/^www\./, '').split('.')[0]; return h.charAt(0).toUpperCase() + h.slice(1); } catch (e) { return ''; }
}
const euros = (n) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: n % 1 ? 2 : 0 }).format(n);

// ─── Session ───
async function idToken() {
  const s = await store.get(['auth', 'idToken', 'idTokenExp']);
  if (!s.auth) return null;
  if (s.idToken && s.idTokenExp > Date.now() + 60000) return s.idToken;
  const res = await fetch(`https://securetoken.googleapis.com/v1/token?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(s.auth.refreshToken)}`,
  });
  if (!res.ok) {
    if (res.status === 400 || res.status === 401) await store.remove(['auth', 'idToken', 'idTokenExp', 'projects']);
    throw new Error(res.status === 400 || res.status === 401 ? 'session' : 'réseau');
  }
  const j = await res.json();
  await store.set({
    idToken: j.id_token,
    idTokenExp: Date.now() + Number(j.expires_in || 3600) * 1000,
    auth: { ...s.auth, refreshToken: j.refresh_token || s.auth.refreshToken },
  });
  return j.id_token;
}

async function fs(path, body) {
  const token = await idToken();
  if (!token) throw new Error('session');
  const res = await fetch(`${FS}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`firestore ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

// ─── Firestore : valeurs ───
const val = (v) => {
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  return { stringValue: String(v ?? '') };
};
const unval = (v) => {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(unval);
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, unval(x)]));
  return null;
};

async function loadProjects(uid) {
  const rows = await fs(':runQuery', {
    structuredQuery: {
      from: [{ collectionId: 'projects' }],
      where: { fieldFilter: { field: { fieldPath: 'ownerId' }, op: 'EQUAL', value: { stringValue: uid } } },
      orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }],
    },
  });
  return rows.filter((r) => r.document).map((r) => {
    const f = r.document.fields || {};
    return { id: r.document.name.split('/').pop(), name: unval(f.name) || 'Projet', rooms: unval(f.rooms) || [] };
  });
}

// ─── Affichage ───
function renderProduct() {
  const price = parsePrice(product.p);
  $('p-name').textContent = cleanName(product);
  $('p-meta').textContent = [siteName(product), price ? euros(price) : ''].filter(Boolean).join(' · ');
  const img = $('p-img');
  if (product.i) { img.src = product.i; img.onerror = () => img.parentElement.classList.add('no-img'); }
  else img.parentElement.classList.add('no-img');
}

async function renderRooms() {
  const dests = [];
  projects.forEach((p) => (p.rooms || []).forEach((r, i) => dests.push({
    value: `${p.id}|${i}`, label: `${r.icon ? r.icon + ' ' : ''}${r.name}`, project: p.name,
  })));
  if (!dests.length) { block('block-noproject'); return; }
  const { lastRoom } = await store.get('lastRoom');
  const chosen = dests.some((d) => d.value === lastRoom) ? lastRoom : dests[0].value;
  const byProject = {};
  dests.forEach((d) => (byProject[d.project] = byProject[d.project] || []).push(d));
  const multi = Object.keys(byProject).length > 1;
  const sel = $('room');
  sel.textContent = '';
  for (const [proj, rooms] of Object.entries(byProject)) {
    const parent = multi ? sel.appendChild(Object.assign(document.createElement('optgroup'), { label: proj })) : sel;
    rooms.forEach((d) => {
      const o = document.createElement('option');
      o.value = d.value; o.textContent = multi ? d.label : `${d.label} · ${proj}`;
      o.selected = d.value === chosen;
      parent.appendChild(o);
    });
  }
  block('block-add');
}

// ─── Actions ───
function newId() {
  const a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(20)), (x) => a[x % a.length]).join('');
}

async function add() {
  error('');
  const [pid, idx] = $('room').value.split('|');
  const proj = projects.find((p) => p.id === pid);
  const room = proj && proj.rooms[Number(idx)];
  if (!room) return;
  const btn = $('btn-add');
  btn.disabled = true; btn.textContent = 'Ajout…';
  const price = parsePrice(product.p) || 0;
  const itemPath = `${DOCS}/projects/${pid}/items/${newId()}`;
  const fields = {
    name: cleanName(product), imageUrl: product.i || '', category: '', subcategory: '',
    supplier: siteName(product), ref: product.r || '', link: product.u, price, qty: 1, dimensions: '',
    status: 'planned', paidBy: '', notes: '', roomIndex: Number(idx), roomName: room.name || '',
  };
  const writes = [{
    update: { name: itemPath, fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, val(v)])) },
    currentDocument: { exists: false },
    updateTransforms: ['createdAt', 'updatedAt'].map((f) => ({ fieldPath: f, setToServerValue: 'REQUEST_TIME' })),
  }];
  if (price) writes.push({ transform: { document: `${DOCS}/projects/${pid}`, fieldTransforms: [{ fieldPath: 'totalBudget', increment: val(price) }] } });
  try {
    await fs(':commit', { writes });
    await store.set({ lastRoom: $('room').value });
    $('done-text').textContent = `Ajouté à ${room.name} · ${proj.name}`;
    block('block-done');
    $('btn-undo').onclick = () => undo(itemPath, pid, price);
  } catch (e) {
    console.error(e);
    btn.disabled = false; btn.textContent = 'Ajouter';
    if (e.message === 'session') return needConnect();
    error('Ajout impossible. Vérifiez votre connexion et réessayez.');
  }
}

async function undo(itemPath, pid, price) {
  const btn = $('btn-undo');
  btn.disabled = true;
  const writes = [{ delete: itemPath }];
  if (price) writes.push({ transform: { document: `${DOCS}/projects/${pid}`, fieldTransforms: [{ fieldPath: 'totalBudget', increment: val(-price) }] } });
  try {
    await fs(':commit', { writes });
    $('btn-add').disabled = false; $('btn-add').textContent = 'Ajouter';
    btn.disabled = false;
    block('block-add');
  } catch (e) {
    btn.disabled = false;
    error('Annulation impossible. Supprimez le produit depuis Cocon.');
  }
}

function openCocon(path) {
  chrome.tabs.create({ url: `${(auth && auth.origin) || CONNECT_ORIGIN}${path}` });
  window.close();
}

function needConnect() {
  auth = null;
  block('block-connect');
}

// ─── Démarrage ───
async function init() {
  $('btn-connect').onclick = () => { chrome.tabs.create({ url: `${CONNECT_ORIGIN}/app?ext=1` }); window.close(); };
  $('btn-add').onclick = add;
  $('btn-create').onclick = () => openCocon('/app');
  $('btn-open').onclick = () => openCocon('/app');

  // ?tabId= : ouverture de la fenêtre dans un onglet pour le débogage
  const forced = Number(new URLSearchParams(location.search).get('tabId'));
  const [tab] = forced ? [{ id: forced }] : await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractProduct });
    product = res && res.result;
  } catch (e) { product = null; } // pages Chrome, Web Store, PDF… : pas d'accès
  if (!product || !product.isProduct || !/^https?:/.test(product.u)) { show('view-empty'); return; }

  renderProduct();
  show('view-product');

  const s = await store.get(['auth', 'projects']);
  auth = s.auth || null;
  if (!auth) return needConnect();

  // Affichage immédiat depuis le cache, puis mise à jour
  if (s.projects && s.projects.uid === auth.uid) { projects = s.projects.list; await renderRooms(); }
  try {
    projects = await loadProjects(auth.uid);
    await store.set({ projects: { uid: auth.uid, list: projects } });
    if ($('block-done').hidden) await renderRooms();
  } catch (e) {
    console.error(e);
    if (e.message === 'session') return needConnect();
    if (!projects.length) { block(null); error('Impossible de charger vos projets. Réessayez dans un instant.'); }
  }
}

init();
