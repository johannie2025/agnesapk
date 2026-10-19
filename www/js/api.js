// Client Agnes Open API (https://apihub.agnes-ai.com) : 100 % front-end.
// Contrat : POST /v1/videos -> { video_id | task_id } ; GET /agnesapi?video_id=... -> { status, progress, video_url }
// status : "completed" | "failed" | (en cours). Limite : ~15 requêtes/min (429 => backoff).

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const auth = (apiKey) => ({ Authorization: `Bearer ${apiKey}` });

async function request(url, options, retries = 3) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, options);
    if (res.status === 429 && attempt < retries) {
      await sleep(2000 * 2 ** attempt); // backoff exponentiel
      continue;
    }
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    if (!res.ok) {
      if (res.status === 401) throw new Error('Clé API invalide ou expirée (401).');
      if (res.status === 429) throw new Error('Trop de requêtes (429). Réessayez dans une minute.');
      throw new Error(data?.error?.message || data?.error || data?.message || `Erreur HTTP ${res.status}`);
    }
    return data;
  }
}

// Durée -> nombre d'images (24 fps) : 5 s ≈ 121, 10 s ≈ 241
export const framesFor = (seconds) => Number(seconds) * 24 + 1;

export function createVideo({ apiKey, baseUrl, model, prompt, duration, width, height }) {
  return request(`${baseUrl}/v1/videos`, {
    method: 'POST',
    headers: { ...auth(apiKey), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model, prompt, width, height,
      num_frames: framesFor(duration),
      frame_rate: 24,
    }),
  });
}

export function getVideo({ apiKey, baseUrl, id }) {
  return request(`${baseUrl}/agnesapi?video_id=${encodeURIComponent(id)}`, { headers: auth(apiKey) });
}

export async function listVideoModels({ apiKey, baseUrl }) {
  const d = await request(`${baseUrl}/v1/models`, { headers: auth(apiKey) });
  const arr = Array.isArray(d) ? d : d?.data || d?.models || [];
  return arr.map((m) => m?.id || m?.model_id || m).filter((id) => typeof id === 'string' && /video/i.test(id));
}

export const taskId = (d) => d?.video_id || d?.task_id || d?.id || null;
export const extractUrl = (d) => d?.video_url || d?.url || null;
export const extractStatus = (d) => String(d?.status || '').toLowerCase();
