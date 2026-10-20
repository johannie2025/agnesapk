import { storage } from './storage.js';
import { KNOWN_MODELS, listModels, createVideo, getVideo, createImage, taskId, extractUrl, extractStatus, videoSeconds, isFlash } from './api.js';

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Thème ----------
function applyTheme(t) {
  document.documentElement.classList.toggle('dark', t === 'dark');
}
applyTheme(storage.getTheme());
$('btn-theme').onclick = () => {
  const next = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
  storage.setTheme(next);
  applyTheme(next);
};

// ---------- Paramètres ----------
$('api-key').value = storage.getKey();
$('base-url').value = storage.getBaseUrl();
if (!storage.getKey()) $('settings').classList.remove('hidden');

$('btn-settings').onclick = () => $('settings').classList.toggle('hidden');
$('btn-eye').onclick = () => {
  const i = $('api-key');
  i.type = i.type === 'password' ? 'text' : 'password';
};
$('btn-save').onclick = () => {
  const key = $('api-key').value.trim();
  const url = $('base-url').value.trim().replace(/\/+$/, '');
  if (!key) return flash('Entrez une clé API.', true);
  storage.setKey(key);
  if (url) storage.setBaseUrl(url);
  flash('Enregistré sur cet appareil.');
  setTimeout(() => $('settings').classList.add('hidden'), 700);
};
$('btn-clear').onclick = () => {
  storage.clearKey();
  $('api-key').value = '';
  flash('Clé supprimée.');
};
function flash(msg, err = false) {
  const el = $('settings-msg');
  el.textContent = msg;
  el.className = `text-xs mt-2 ${err ? 'text-red-500' : 'text-emerald-500'}`;
}

// ---------- Onglets / modèles ----------
let mode = 'video';
let models = { image: [...KNOWN_MODELS.image], video: [...KNOWN_MODELS.video] };

function renderModels() {
  const sel = $('model');
  const prev = sel.value;
  sel.innerHTML = '';
  models[mode].forEach((id) => sel.add(new Option(id, id)));
  if (prev && models[mode].includes(prev)) sel.value = prev;
  syncVideoOptions();
}

// Options vidéo dépendantes du modèle : durées, et 720p seulement pour les modèles « flash »
function syncVideoOptions() {
  if (mode !== 'video') return;
  const m = $('model').value;
  const dur = $('duration');
  const prevDur = dur.value;
  dur.innerHTML = '';
  videoSeconds(m).forEach((s) => dur.add(new Option(`${s} s`, String(s))));
  dur.value = [...dur.options].some((o) => o.value === prevDur) ? prevDur : dur.options[0].value;
  const hd = [...$('vres').options].find((o) => o.value === '1080P');
  if (hd) hd.disabled = isFlash(m);
  if (isFlash(m)) $('vres').value = '720P';
}
$('model').addEventListener('change', syncVideoOptions);

function setMode(m) {
  mode = m;
  const on = 'bg-white dark:bg-slate-800 shadow text-brand-500';
  $('tab-video').className = `py-2 rounded-lg ${m === 'video' ? on : 'text-slate-500'}`;
  $('tab-image').className = `py-2 rounded-lg ${m === 'image' ? on : 'text-slate-500'}`;
  $('opts-video').classList.toggle('hidden', m !== 'video');
  $('opts-image').classList.toggle('hidden', m !== 'image');
  renderModels();
  updateHint();
}
$('tab-video').onclick = () => setMode('video');
$('tab-image').onclick = () => setMode('image');

// Images de référence : fichiers locaux -> data URL JPEG (côté long ≤ 768 px, qualité 75 %)
let refs = [];
const getRefs = () => refs;

function fileToDataUrl(file, max = 768) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.75));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`Image illisible : ${file.name}`)); };
    img.src = url;
  });
}

function renderThumbs() {
  const box = $('refs-thumbs');
  box.innerHTML = '';
  refs.forEach((u, i) => {
    const w = document.createElement('div');
    w.className = 'relative';
    const im = document.createElement('img');
    im.src = u; im.className = 'w-16 h-16 object-cover rounded-lg border border-slate-300 dark:border-slate-700';
    const x = document.createElement('button');
    x.type = 'button'; x.textContent = '×';
    x.className = 'absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-600 text-white text-xs leading-5';
    x.onclick = () => { refs.splice(i, 1); renderThumbs(); updateHint(); };
    w.append(im, x);
    box.append(w);
  });
  $('btn-refs-clear').classList.toggle('hidden', !refs.length);
}

$('btn-pick').onclick = () => $('refs-file').click();
$('btn-refs-clear').onclick = () => { refs = []; renderThumbs(); updateHint(); };
$('refs-file').addEventListener('change', async (e) => {
  const files = [...e.target.files];
  e.target.value = '';
  try {
    for (const f of files) refs.push(await fileToDataUrl(f));
    if (refs.length > 4) refs = refs.slice(0, 4);
    renderThumbs(); updateHint();
  } catch (err) { setStatus(err.message, true); }
});

function updateHint() {
  const n = getRefs().length;
  const h = $('refs-hint');
  if (mode === 'video') h.textContent = n === 0 ? 'Texte → vidéo' : n === 1 ? 'Image → vidéo' : `Animation par images clés (${n} images)`;
  else h.textContent = n === 0 ? 'Texte → image' : 'Image → image (référence + prompt)';
}

async function loadModels() {
  const apiKey = storage.getKey();
  if (!apiKey) return;
  try {
    const found = await listModels({ apiKey, baseUrl: storage.getBaseUrl() });
    for (const k of ['image', 'video']) models[k] = [...new Set([...KNOWN_MODELS[k], ...found[k]])];
    renderModels();
  } catch { /* on garde le catalogue connu */ }
}

// ---------- Génération ----------
function setStatus(msg, err = false) {
  const el = $('status');
  el.textContent = msg;
  el.className = `text-center text-sm ${err ? 'text-red-500' : 'text-slate-500'}`;
}

function link(url, label) {
  const a = document.createElement('a');
  a.href = url; a.target = '_blank'; a.rel = 'noopener'; a.download = '';
  a.textContent = label;
  a.className = 'block text-center text-sm underline text-brand-500';
  return a;
}

function showVideo(url) {
  const box = $('result');
  box.innerHTML = '';
  const v = document.createElement('video');
  v.src = url; v.controls = true; v.playsInline = true;
  v.className = 'w-full rounded-xl bg-black';
  box.append(v, link(url, 'Ouvrir / télécharger la vidéo'));
}

function showImages(urls) {
  const box = $('result');
  box.innerHTML = '';
  urls.forEach((u, i) => {
    const img = document.createElement('img');
    img.src = u; img.className = 'w-full rounded-xl';
    box.append(img, link(u, `Ouvrir / télécharger l'image ${i + 1}`));
  });
}


$('btn-generate').onclick = async () => {
  const apiKey = storage.getKey();
  const baseUrl = storage.getBaseUrl();
  const prompt = $('prompt').value.trim();
  const images = getRefs();
  if (!apiKey) { $('settings').classList.remove('hidden'); return setStatus('Configurez votre clé API.', true); }
  if (!prompt) return setStatus('Entrez un prompt.', true);

  const btn = $('btn-generate');
  btn.disabled = true;
  $('result').innerHTML = '';
  setStatus('Envoi de la demande…');

  try {
    if (mode === 'image') {
      setStatus('Génération de l\'image…');
      const urls = await createImage({ apiKey, baseUrl, model: $('model').value, prompt, aspect: $('img-ratio').value, quality: $('img-quality').value, n: $('img-n').value, images });
      setStatus('Image prête ✅');
      return showImages(urls);
    }

    const created = await createVideo({ apiKey, baseUrl, model: $('model').value, prompt, seconds: $('duration').value, aspect: $('ratio').value, resolution: $('vres').value, images });
    const id = taskId(created);
    if (!id) throw new Error("Pas d'identifiant de tâche dans la réponse de l'API.");

    // Sondage toutes les 15 s, 15 min max (limite API : ~15 req/min)
    for (let i = 0; i < 60; i++) {
      await sleep(15000);
      const r = await getVideo({ apiKey, baseUrl, id });
      const st = extractStatus(r);
      if (st === 'failed') throw new Error(r?.error?.message || r?.error || 'La génération a échoué.');
      const url = extractUrl(r);
      if (st === 'completed' && url) { setStatus('Vidéo prête ✅'); return showVideo(url); }
      const pct = r?.progress != null ? ` — ${r.progress}%` : '';
      setStatus(`Génération en cours… (${(i + 1) * 15}s${pct})`);
    }
    throw new Error('Délai dépassé (15 min).');
  } catch (e) {
    setStatus(e.message || 'Erreur inconnue.', true);
  } finally {
    btn.disabled = false;
  }
};

setMode('video');
loadModels();
$('btn-save').addEventListener('click', () => setTimeout(loadModels, 0));
