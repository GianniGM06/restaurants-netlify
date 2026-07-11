/* POST /api/upsert-restaurant — crée ou met à jour UN restaurant.
   Body : { status: 'tested'|'wishlist', restaurant: {...} }
   Remplace le full-replace pour les opérations unitaires : plus de risque
   d'écrasement par un client aux données périmées, payload minimal. */

const { getPool } = require('./lib/db.js');
const { authenticateRequest, writeCorsHeaders } = require('./lib/auth.js');

function validate(body) {
  if (!body || typeof body !== 'object') return { error: 'Payload JSON invalide' };
  const { status, restaurant: r } = body;
  if (status !== 'tested' && status !== 'wishlist') {
    return { error: '"status" doit être "tested" ou "wishlist"' };
  }
  if (!r || typeof r !== 'object') return { error: '"restaurant" manquant' };
  if (r.id == null || Number.isNaN(Number(r.id))) {
    return { error: `ID manquant ou invalide pour "${r.name || '?'}"` };
  }
  if (!r.name || typeof r.name !== 'string') return { error: `Nom manquant pour le restaurant id=${r.id}` };
  if (!r.type || typeof r.type !== 'string') return { error: `Type de cuisine manquant pour "${r.name}"` };
  if (status === 'tested' && r.ratings) {
    for (const key of ['plats', 'accueil', 'lieu']) {
      const v = r.ratings[key];
      if (typeof v !== 'number' || v < 1 || v > 5) {
        return { error: `Note "${key}" invalide pour "${r.name}"` };
      }
    }
    const vins = r.ratings.vins;
    if (!(vins === null || vins === undefined) && (typeof vins !== 'number' || vins < 1 || vins > 5)) {
      return { error: `Note "vins" invalide pour "${r.name}"` };
    }
  }
  return { status, restaurant: r };
}

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

  const validation = validate(body);
  if (validation.error) {
    return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: validation.error }) };
  }
  const { status, restaurant: r } = validation;

  const client = getPool();

  try {
    await client.query('BEGIN');
    try {
      // 1) Type de cuisine (créé au besoin)
      await client.query(
        'INSERT INTO cuisine_types (name) VALUES ($1) ON CONFLICT (name) DO NOTHING',
        [r.type]
      );
      const cuisineResult = await client.query('SELECT id FROM cuisine_types WHERE name = $1', [r.type]);
      const cuisineTypeId = cuisineResult.rows[0].id;

      // 2) Upsert du restaurant
      await client.query(
        `INSERT INTO restaurants
           (id, name, cuisine_type_id, location, address, latitude, longitude,
            price_range, photo_url, google_maps_url, comment, photos, reason,
            status, date_added, date_visited)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14, $15, $16)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           cuisine_type_id = EXCLUDED.cuisine_type_id,
           location = EXCLUDED.location,
           address = EXCLUDED.address,
           latitude = EXCLUDED.latitude,
           longitude = EXCLUDED.longitude,
           price_range = EXCLUDED.price_range,
           photo_url = EXCLUDED.photo_url,
           google_maps_url = EXCLUDED.google_maps_url,
           comment = EXCLUDED.comment,
           photos = EXCLUDED.photos,
           reason = EXCLUDED.reason,
           status = EXCLUDED.status,
           date_added = EXCLUDED.date_added,
           date_visited = EXCLUDED.date_visited,
           updated_at = CURRENT_TIMESTAMP`,
        [
          r.id,
          r.name,
          cuisineTypeId,
          r.location || null,
          r.address || null,
          r.coordinates?.lat ?? null,
          r.coordinates?.lng ?? null,
          r.priceRange || '€€',
          r.photo || null,
          r.googleMapsUrl || null,
          r.comment || null,
          JSON.stringify(r.photos || []),
          status === 'wishlist' ? r.reason || null : null,
          status,
          r.dateAdded || new Date().toISOString().split('T')[0],
          status === 'tested' ? r.dateVisited || null : null,
        ]
      );

      // 3) Notes : upsert pour un testé, purge pour une wishlist
      if (status === 'tested' && r.ratings) {
        await client.query(
          `INSERT INTO ratings (restaurant_id, plats, vins, accueil, lieu)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (restaurant_id) DO UPDATE SET
             plats = EXCLUDED.plats,
             vins = EXCLUDED.vins,
             accueil = EXCLUDED.accueil,
             lieu = EXCLUDED.lieu,
             updated_at = CURRENT_TIMESTAMP`,
          [
            r.id,
            r.ratings.plats,
            r.winesNotTested ? null : r.ratings.vins ?? null,
            r.ratings.accueil,
            r.ratings.lieu,
          ]
        );
      } else if (status === 'wishlist') {
        await client.query('DELETE FROM ratings WHERE restaurant_id = $1', [r.id]);
      }

      await client.query('COMMIT');

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, id: r.id, status, timestamp: new Date().toISOString() }),
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('Erreur upsert restaurant:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: 'Erreur sauvegarde', message: error.message }),
    };
  }
};
