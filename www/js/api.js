// Client Agnes Open API (https://apihub.agnes-ai.com) : 100 % front-end.
// Vidéo : POST /v1/videos -> { video_id | task_id } ; GET /agnesapi?video_id=... -> { status, progress, video_url }
// Image : POST /v1/images/generations (format OpenAI) -> { data: [{ url | b64_json }] }
// Limite : ~15 requêtes/min (429 => backoff).

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const auth = (apiKey) => ({ Authorization: `Bearer ${apiKey}` });
const jsonHeaders = (apiKey) => ({ ...auth(apiKey), 'Content-Type': 'application/json' });

// Catalogue connu (toujours proposé) ; /v1/models peut en ajouter d'autres.
export const KNOWN_MODELS = {
  image: ['agnes-image-2.1-flash', 'agnes-image-2.0-flash'],
  video: ['agnes-video-v2.0'],
};

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

// 0 image = texte->vidéo ; 1 image = image->vidéo (mode ti2vid) ; 2+ = keyframes
export function createVideo({ apiKey, baseUrl, model, prompt, duration, width, height, images = [] }) {
  const body = { model, prompt, width, height, num_frames: framesFor(duration), frame_rate: 24 };
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
export async function createImage({ apiKey, baseUrl, model, prompt, size, n = 1, images = [] }) {
  const body = { model, prompt, size, n: Number(n) };
  if (images.length) body.images = images;
  const d = await request(`${baseUrl}/v1/images/generations`, { method: 'POST', headers: jsonHeaders(apiKey), body: JSON.stringify(body) });
  const list = d?.data || d?.images || [];
  const urls = list
    .map((x) => x?.url || (x?.b64_json ? `data:image/png;base64,${x.b64_json}` : typeof x === 'string' ? x : null))
    .filter(Boolean);
  if (!urls.length) throw new Error("Aucune image dans la réponse de l'API.");
  return urls;
}
