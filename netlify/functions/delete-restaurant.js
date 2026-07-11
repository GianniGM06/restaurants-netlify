/* POST /api/delete-restaurant — supprime UN restaurant (notes en cascade).
   Body : { id } */

const { getPool } = require('./lib/db.js');
const { authenticateRequest, writeCorsHeaders } = require('./lib/auth.js');

exports.handler = async (event) => {
  const headers = writeCorsHeaders();

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const auth = await authenticateRequest(event);
  if (!auth.ok) {
    return { statusCode: auth.status, headers, body: JSON.stringify({ success: false, message: auth.message }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Corps de requête JSON invalide' }) };
  }

  if (body?.id == null || Number.isNaN(Number(body.id))) {
    return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'ID manquant ou invalide' }) };
  }

  const client = getPool();

  try {
    // Les ratings sont supprimés en cascade (ON DELETE CASCADE)
    const result = await client.query('DELETE FROM restaurants WHERE id = $1', [body.id]);

    if (result.rowCount === 0) {
      return { statusCode: 404, headers, body: JSON.stringify({ success: false, message: 'Restaurant introuvable' }) };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, id: body.id, timestamp: new Date().toISOString() }),
    };
  } catch (error) {
    console.error('Erreur suppression restaurant:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: 'Erreur suppression', message: error.message }),
    };
  }
};
