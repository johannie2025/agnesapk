// Client Agnes Open API (https://apihub.agnes-ai.com) : 100 % front-end.
// Vidéo : POST /v1/videos -> { video_id | task_id } ; GET /agnesapi?video_id=... -> { status, progress, video_url }
// Image : POST /v1/images/generations (format OpenAI) -> { data: [{ url | b64_json }] }
// Limite : ~15 requêtes/min (429 => backoff).

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const auth = (apiKey) => ({ Authorization: `Bearer ${apiKey}` });
const jsonHeaders = (apiKey) => ({ ...auth(apiKey), 'Content-Type': 'application/json' });

// Catalogue connu (toujours proposé) ; /v1/models peut en ajouter d'autres.
export const KNOWN_MODELS = {
  image: ['agnes-image-2.5-flash', 'agnes-image-2.1-flash', 'agnes-image-2.0-flash'],
  video: ['agnes-video-2.5-flash', 'agnes-video-2.5', 'agnes-video-v2.0'],
};

// Deux familles de paramètres :
//  - « legacy » (agnes-video-v2.0) : width/height/num_frames/frame_rate
//  - « moderne » (2.5) : seconds + aspect_ratio + size ; width/height/num_frames sont REFUSÉS (« forbidden field »)
export const isLegacyVideo = (m) => /v2\.0/i.test(m);
export const isModernImage = (m) => /2\.5/.test(m);
export const isFlash = (m) => /flash/i.test(m);
export const videoSeconds = (m) => (isLegacyVideo(m) ? [5, 10, 15, 18] : [4, 6, 8, 10, 12, 15]);

async function request(url, options, retries = 3) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, options);
    if (res.status === 429 && attempt < retries) {
      await sleep(2000 * 2 ** attempt);
      continue;
    }
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    if (!res.ok) {
      if (res.status === 401) throw new Error('Clé API invalide ou expirée (401).');
      if (res.status === 429) throw new Error('Trop de requêtes (429). Réessayez dans une minute.');
      const e = data?.error;
      throw new Error((typeof e === 'string' ? e : e?.message) || data?.message || `Erreur HTTP ${res.status}`);
    }
    return data;
  }
}

export async function listModels({ apiKey, baseUrl }) {
  const d = await request(`${baseUrl}/v1/models`, { headers: auth(apiKey) });
  const arr = Array.isArray(d) ? d : d?.data || d?.models || [];
  const ids = arr.map((m) => m?.id || m?.model_id || m).filter((x) => typeof x === 'string');
  return {
    image: ids.filter((i) => /image/i.test(i)),
    video: ids.filter((i) => /video/i.test(i)),
  };
}

// ---------- Vidéo ----------
// Durée -> images (24 fps) : 5 s ≈ 121, 10 s ≈ 241
export const framesFor = (seconds) => Number(seconds) * 24 + 1;

const LEGACY_DIMS = { '16:9': [1152, 768], '9:16': [768, 1152], '1:1': [768, 768] };

// 0 image = texte->vidéo ; 1 image = image->vidéo (ti2vid) ; 2+ = keyframes
export function createVideo({ apiKey, baseUrl, model, prompt, seconds, aspect, resolution, images = [] }) {
  let body;
  if (isLegacyVideo(model)) {
    const [width, height] = LEGACY_DIMS[aspect] || LEGACY_DIMS['9:16'];
    body = { model, prompt, width, height, num_frames: framesFor(seconds), frame_rate: 24 };
  } else {
    body = { model, prompt, seconds: Number(seconds), aspect_ratio: aspect, size: resolution };
  }
  if (images.length) {
    body.images = images;
    body.mode = images.length === 1 ? 'ti2vid' : 'keyframes';
  }
  return request(`${baseUrl}/v1/videos`, { method: 'POST', headers: jsonHeaders(apiKey), body: JSON.stringify(body) });
}

export function getVideo({ apiKey, baseUrl, id }) {
  return request(`${baseUrl}/agnesapi?video_id=${encodeURIComponent(id)}`, { headers: auth(apiKey) });
}

export const taskId = (d) => d?.video_id || d?.task_id || d?.id || null;
export const extractUrl = (d) => d?.video_url || d?.url || null;
export const extractStatus = (d) => String(d?.status || '').toLowerCase();

// ---------- Image ----------
// Avec images de référence : image->image / composition multi-images.
const LEGACY_IMG_SIZE = { '16:9': '1792x1024', '9:16': '1024x1792', '1:1': '1024x1024' };

export async function createImage({ apiKey, baseUrl, model, prompt, aspect, quality, n = 1, images = [] }) {
  const body = { model, prompt, n: Number(n) };
  if (isModernImage(model)) { body.aspect_ratio = aspect; body.quality = quality; }
  else body.size = LEGACY_IMG_SIZE[aspect] || '1024x1024';
  if (images.length) body.images = images;
  const d = await request(`${baseUrl}/v1/images/generations`, { method: 'POST', headers: jsonHeaders(apiKey), body: JSON.stringify(body) });
  const list = d?.data || d?.images || [];
  const urls = list
    .map((x) => x?.url || (x?.b64_json ? `data:image/png;base64,${x.b64_json}` : typeof x === 'string' ? x : null))
    .filter(Boolean);
  if (!urls.length) throw new Error("Aucune image dans la réponse de l'API.");
  return urls;
}
