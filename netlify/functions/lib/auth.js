/* Authentification des écritures : token GitHub vérifié CÔTÉ SERVEUR
   contre une allowlist de logins (env ALLOWED_GITHUB_USERS, séparés par des virgules). */

const ALLOWED_USERS = (process.env.ALLOWED_GITHUB_USERS || 'giannigm06')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

async function authenticateRequest(event) {
  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const token = authHeader.replace(/^(Bearer|token)\s+/i, '').trim();

  if (!token) {
    return { ok: false, status: 401, message: 'Authentification requise : token GitHub manquant' };
  }

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

  return { ok: true, login: user.login };
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

module.exports = { authenticateRequest, writeCorsHeaders };
