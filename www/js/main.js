import { storage } from './storage.js';
import { createVideo, getVideo, listVideoModels, taskId, extractUrl, extractStatus } from './api.js';

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

// ---------- Génération ----------
function setStatus(msg, err = false) {
  const el = $('status');
  el.textContent = msg;
  el.className = `text-center text-sm ${err ? 'text-red-500' : 'text-slate-500'}`;
}

function showVideo(url) {
  const box = $('result');
  box.innerHTML = '';
  const v = document.createElement('video');
  v.src = url; v.controls = true; v.playsInline = true;
  v.className = 'w-full rounded-xl bg-black';
  const a = document.createElement('a');
  a.href = url; a.target = '_blank'; a.rel = 'noopener';
  a.textContent = 'Ouvrir / télécharger la vidéo';
  a.className = 'block text-center text-sm underline text-brand-500';
  box.append(v, a);
}

const SIZES = { landscape: [1152, 768], portrait: [768, 1152], square: [768, 768] };

$('btn-generate').onclick = async () => {
  const apiKey = storage.getKey();
  const baseUrl = storage.getBaseUrl();
  const prompt = $('prompt').value.trim();
  if (!apiKey) { $('settings').classList.remove('hidden'); return setStatus('Configurez votre clé API.', true); }
  if (!prompt) return setStatus('Entrez un prompt.', true);

  const btn = $('btn-generate');
  btn.disabled = true;
  $('result').innerHTML = '';
  setStatus('Envoi de la demande…');

  try {
    const [width, height] = SIZES[$('ratio').value];
    const created = await createVideo({ apiKey, baseUrl, model: $('model').value, prompt, duration: $('duration').value, width, height });
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

// ---------- Modèles vidéo (liste dynamique, repli sur agnes-video-v2.0) ----------
async function loadModels() {
  const apiKey = storage.getKey();
  if (!apiKey) return;
  try {
    const ids = await listVideoModels({ apiKey, baseUrl: storage.getBaseUrl() });
    if (!ids.length) return;
    const sel = $('model');
    sel.innerHTML = '';
    ids.forEach((id) => sel.add(new Option(id, id)));
  } catch { /* on garde la liste par défaut */ }
}
loadModels();
$('btn-save').addEventListener('click', () => setTimeout(loadModels, 0));
