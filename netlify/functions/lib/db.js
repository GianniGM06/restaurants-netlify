/* Pool Postgres partagé entre les fonctions (réutilisé entre invocations chaudes). */
const { Pool } = require('pg');

let pool;

function getPool() {
  if (!pool) {
    const databaseUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;

    if (!databaseUrl) {
      throw new Error('DATABASE_URL non configurée');
    }

    pool = new Pool({
      connectionString: databaseUrl,
      // Vérification du certificat activée : les certs Neon sont signés par une
      // CA publique reconnue par Node (testé contre la vraie DB le 2026-07-11).
      ssl: {
        rejectUnauthorized: true
      }
    });
  }
  return pool;
}

/** Réservé aux tests : injecte un pool factice à la place de la connexion réelle. */
function setPoolForTesting(fakePool) {
  pool = fakePool;
}

module.exports = { getPool, setPoolForTesting };
