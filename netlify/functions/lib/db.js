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
      // TODO(TLS) : passer à la vérification du certificat (rejectUnauthorized: true
      // ou driver @neondatabase/serverless) — à tester avec la vraie DB Neon.
      ssl: {
        rejectUnauthorized: false
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
