/* ===== API — Netlify Functions ===== */

const API_BASE = '/api';

export async function fetchRestaurants() {
  const response = await fetch(`${API_BASE}/get-restaurants`);
  if (!response.ok) throw new Error(`API Error: ${response.status}`);
  return response.json();
}

async function postJson(path, payload, token) {
  const headers = { 'Content-Type': 'application/json' };
  // L'API d'écriture vérifie ce token GitHub côté serveur (allowlist)
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || `Erreur API (${response.status})`);
  }
  return response.json();
}

/** Crée ou met à jour UN restaurant (endpoint unitaire). */
export function upsertRestaurant(restaurant, status, token) {
  return postJson('/upsert-restaurant', { restaurant, status }, token);
}

/** Supprime UN restaurant. */
export function deleteRestaurant(id, token) {
  return postJson('/delete-restaurant', { id }, token);
}

/** Sauvegarde en bloc (full-replace) — conservé pour import/restauration. */
export function persistRestaurants(payload, token) {
  return postJson('/save-restaurants', payload, token);
}

export async function geocodeAddress(address) {
  if (!address || !address.trim()) return null;
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'MonCarnetGastro/1.0' },
    });
    if (!response.ok) throw new Error('Erreur géocodage');
    const data = await response.json();
    if (data?.length > 0) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    return null;
  } catch {
    return null;
  }
}

if (typeof window !== 'undefined') {
  window.Api = { fetchRestaurants, upsertRestaurant, deleteRestaurant, persistRestaurants, geocodeAddress };
}
