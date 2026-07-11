/* Endpoint de sauvegarde EN BLOC (full-replace) - conserve pour les imports/
   restaurations completes. Les operations courantes passent par les endpoints
   unitaires upsert-restaurant / delete-restaurant. */

const { getPool } = require('./lib/db.js');
const { authenticateRequest, writeCorsHeaders } = require('./lib/auth.js');

/** Valide le payload et retourne la liste normalisée, ou une erreur. */
function validatePayload(requestData) {
  if (!requestData || typeof requestData !== 'object') {
    return { error: 'Payload JSON invalide' };
  }
  const tested = requestData.tested ?? [];
  const wishlist = requestData.wishlist ?? [];
  if (!Array.isArray(tested) || !Array.isArray(wishlist)) {
    return { error: '"tested" et "wishlist" doivent être des tableaux' };
  }

  const all = [
    ...tested.map((r) => ({ ...r, status: 'tested' })),
    ...wishlist.map((r) => ({ ...r, status: 'wishlist' })),
  ];

  for (const r of all) {
    if (r.id == null || Number.isNaN(Number(r.id))) {
      return { error: `ID manquant ou invalide pour "${r.name || '?'}"` };
    }
    if (!r.name || typeof r.name !== 'string') {
      return { error: `Nom manquant pour le restaurant id=${r.id}` };
    }
    if (!r.type || typeof r.type !== 'string') {
      return { error: `Type de cuisine manquant pour "${r.name}"` };
    }
  }

  const ids = all.map((r) => String(r.id));
  if (new Set(ids).size !== ids.length) {
    return { error: 'IDs de restaurants dupliqués dans le payload' };
  }

  return { all };
}

exports.handler = async (event, context) => {
  const headers = writeCorsHeaders();

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  // Toute écriture exige un token GitHub valide appartenant à l'allowlist
  const auth = await authenticateRequest(event);
  if (!auth.ok) {
    return {
      statusCode: auth.status,
      headers,
      body: JSON.stringify({ success: false, message: auth.message })
    };
  }

  let requestData;
  try {
    requestData = JSON.parse(event.body);
  } catch {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ success: false, message: 'Corps de requête JSON invalide' })
    };
  }

  const validation = validatePayload(requestData);
  if (validation.error) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ success: false, message: validation.error })
    };
  }
  const { all } = validation;

  const client = getPool();

  try {
    await client.query('BEGIN');

    try {
      // 1) Upsert des types de cuisine en une requête
      const cuisineNames = [...new Set(all.map((r) => r.type))];
      if (cuisineNames.length > 0) {
        await client.query(
          `INSERT INTO cuisine_types (name)
           SELECT unnest($1::text[])
           ON CONFLICT (name) DO NOTHING`,
          [cuisineNames]
        );
      }
      const cuisineRows = await client.query('SELECT id, name FROM cuisine_types');
      const cuisineIdByName = new Map(cuisineRows.rows.map((row) => [row.name, row.id]));

      // 2) Supprimer les restaurants absents du payload
      //    (ratings supprimés en cascade — ON DELETE CASCADE)
      await client.query(
        'DELETE FROM restaurants WHERE NOT (id = ANY($1::bigint[]))',
        [all.map((r) => r.id)]
      );

      // 3) Upsert de tous les restaurants en une requête (unnest multi-colonnes)
      if (all.length > 0) {
        const today = new Date().toISOString().split('T')[0];
        const cols = {
          ids: all.map((r) => r.id),
          names: all.map((r) => r.name),
          cuisineIds: all.map((r) => cuisineIdByName.get(r.type)),
          locations: all.map((r) => r.location || null),
          addresses: all.map((r) => r.address || null),
          latitudes: all.map((r) => r.coordinates?.lat ?? null),
          longitudes: all.map((r) => r.coordinates?.lng ?? null),
          priceRanges: all.map((r) => r.priceRange || '€€'),
          photoUrls: all.map((r) => r.photo || null),
          googleMapsUrls: all.map((r) => r.googleMapsUrl || null),
          comments: all.map((r) => r.comment || null),
          photosJson: all.map((r) => JSON.stringify(r.photos || [])),
          reasons: all.map((r) => (r.status === 'wishlist' ? r.reason || null : null)),
          statuses: all.map((r) => r.status),
          datesAdded: all.map((r) => r.dateAdded || today),
          datesVisited: all.map((r) => (r.status === 'tested' ? r.dateVisited || null : null)),
        };

        await client.query(
          `INSERT INTO restaurants
             (id, name, cuisine_type_id, location, address, latitude, longitude,
              price_range, photo_url, google_maps_url, comment, photos, reason,
              status, date_added, date_visited)
           SELECT u.id, u.name, u.cuisine_type_id, u.location, u.address, u.latitude, u.longitude,
                  u.price_range, u.photo_url, u.google_maps_url, u.comment, u.photos::jsonb, u.reason,
                  u.status, u.date_added, u.date_visited
           FROM unnest(
             $1::bigint[], $2::text[], $3::integer[], $4::text[], $5::text[],
             $6::decimal[], $7::decimal[], $8::text[], $9::text[], $10::text[],
             $11::text[], $12::text[], $13::text[], $14::text[], $15::date[], $16::date[]
           ) AS u(id, name, cuisine_type_id, location, address, latitude, longitude,
                  price_range, photo_url, google_maps_url, comment, photos, reason,
                  status, date_added, date_visited)
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
            cols.ids, cols.names, cols.cuisineIds, cols.locations, cols.addresses,
            cols.latitudes, cols.longitudes, cols.priceRanges, cols.photoUrls, cols.googleMapsUrls,
            cols.comments, cols.photosJson, cols.reasons, cols.statuses, cols.datesAdded, cols.datesVisited,
          ]
        );
      }

      // 4) Upsert des notes en une requête (vins null = "vins non testés")
      const rated = all.filter((r) => r.status === 'tested' && r.ratings);
      if (rated.length > 0) {
        await client.query(
          `INSERT INTO ratings (restaurant_id, plats, vins, accueil, lieu)
           SELECT * FROM unnest($1::bigint[], $2::decimal[], $3::decimal[], $4::decimal[], $5::decimal[])
           ON CONFLICT (restaurant_id) DO UPDATE SET
             plats = EXCLUDED.plats,
             vins = EXCLUDED.vins,
             accueil = EXCLUDED.accueil,
             lieu = EXCLUDED.lieu,
             updated_at = CURRENT_TIMESTAMP`,
          [
            rated.map((r) => r.id),
            rated.map((r) => r.ratings.plats),
            rated.map((r) => (r.winesNotTested ? null : r.ratings.vins ?? null)),
            rated.map((r) => r.ratings.accueil),
            rated.map((r) => r.ratings.lieu),
          ]
        );
      }

      await client.query('COMMIT');

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'Restaurants sauvegardés avec succès',
          saved: all.length,
          timestamp: new Date().toISOString()
        })
      };

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }

  } catch (error) {
    console.error('Erreur sauvegarde:', error);

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Erreur sauvegarde',
        message: error.message
      })
    };
  }
};
