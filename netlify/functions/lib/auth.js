/* Authentification des écritures : token GitHub vérifié CÔTÉ SERVEUR
   contre une allowlist de logins (env ALLOWED_GITHUB_USERS, séparés par des virgules). */

const ALLOWED_USERS = (process.env.ALLOWED_GITHUB_USERS || 'giannigm06')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

// Cache en mémoire de module (survit entre invocations chaudes) : évite un
// aller-retour api.github.com (~200 ms) à CHAQUE écriture. Seuls les succès
// sont mis en cache ; une révocation de token est donc effective en < 5 min.
const AUTH_CACHE_TTL_MS = 5 * 60 * 1000;
const authCache = new Map(); // token -> { result, expiresAt }

/** Réservé aux tests. */
function clearAuthCacheForTesting() {
  authCache.clear();
}

async function authenticateRequest(event) {
  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const token = authHeader.replace(/^(Bearer|token)\s+/i, '').trim();

  if (!token) {
    return { ok: false, status: 401, message: 'Authentification requise : token GitHub manquant' };
  }

  const cached = authCache.get(token);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result;
  }
  authCache.delete(token);

  const response = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'restaurants-netlify',
    },
  });

  if (!response.ok) {
    return { ok: false, status: 401, message: 'Token GitHub invalide' };
  }

  const user = await response.json();
  if (!ALLOWED_USERS.includes((user.login || '').toLowerCase())) {
    return { ok: false, status: 403, message: `Utilisateur "${user.login}" non autorisé en écriture` };
  }

  const result = { ok: true, login: user.login };
  authCache.set(token, { result, expiresAt: Date.now() + AUTH_CACHE_TTL_MS });
  return result;
}

/* En-têtes CORS communs aux endpoints d'écriture (origine du site uniquement). */
function writeCorsHeaders() {
  return {
    'Access-Control-Allow-Origin': process.env.URL || '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };
}

module.exports = { authenticateRequest, writeCorsHeaders, clearAuthCacheForTesting };
