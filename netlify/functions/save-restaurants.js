const { Pool } = require('pg');

let pool;

function getPool() {
  if (!pool) {
    const databaseUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
    
    if (!databaseUrl) {
      throw new Error('❌ DATABASE_URL non configurée');
    }
    
    pool = new Pool({
      connectionString: databaseUrl,
      ssl: {
        rejectUnauthorized: false
      }
    });
  }
  return pool;
}

// Logins GitHub autorisés en écriture (vérifiés CÔTÉ SERVEUR).
// Surchargez avec la variable d'env Netlify ALLOWED_GITHUB_USERS (séparés par des virgules).
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

exports.handler = async (event, context) => {
  const headers = {
    // Endpoint d'écriture : CORS restreint à l'origine du site (URL fournie par Netlify)
    'Access-Control-Allow-Origin': process.env.URL || '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

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

  const client = getPool();

  try {
    console.log('💾 Sauvegarde des restaurants...');

    await client.query('SELECT 1');
    console.log('✅ Connection DB réussie');

    const requestData = JSON.parse(event.body);
    console.log('📊 Données reçues:', {
      tested: requestData.tested?.length || 0,
      wishlist: requestData.wishlist?.length || 0
    });

    await client.query('BEGIN');

    try {
      const existingIdsResult = await client.query(
        'SELECT id, status FROM restaurants'
      );
      const existingIds = new Map();
      existingIdsResult.rows.forEach(row => {
        existingIds.set(row.id.toString(), row.status);
      });

      const sentTestedIds = new Set(requestData.tested?.map(r => r.id.toString()) || []);
      const sentWishlistIds = new Set(requestData.wishlist?.map(r => r.id.toString()) || []);
      const allSentIds = new Set([...sentTestedIds, ...sentWishlistIds]);

      for (const [existingId, status] of existingIds) {
        if (!allSentIds.has(existingId)) {
          console.log('🗑️ Suppression restaurant ID:', existingId);
          await client.query('DELETE FROM ratings WHERE restaurant_id = $1', [existingId]);
          await client.query('DELETE FROM restaurants WHERE id = $1', [existingId]);
        }
      }

      if (requestData.tested) {
        for (const restaurant of requestData.tested) {
          console.log('📝 Traitement restaurant testé:', restaurant.name, 'ID:', restaurant.id);
          
          if (!restaurant.id) {
            throw new Error('❌ Restaurant ID manquant pour: ' + restaurant.name);
          }

          const cuisineResult = await client.query(
            'SELECT id FROM cuisine_types WHERE name = $1',
            [restaurant.type]
          );
          
          if (cuisineResult.rows.length === 0) {
            const newCuisineResult = await client.query(
              'INSERT INTO cuisine_types (name, emoji) VALUES ($1, $2) RETURNING id',
              [restaurant.type, '🍽️']
            );
            var cuisineTypeId = newCuisineResult.rows[0].id;
          } else {
            var cuisineTypeId = cuisineResult.rows[0].id;
          }

          const existingResult = await client.query(
            'SELECT id FROM restaurants WHERE id = $1',
            [restaurant.id]
          );

          if (existingResult.rows.length > 0) {
            console.log('🔄 Mise à jour restaurant:', restaurant.id);
            await client.query(`
              UPDATE restaurants SET 
                name = $1, 
                cuisine_type_id = $2, 
                location = $3,
                address = $4,
                latitude = $5,
                longitude = $6,
                google_maps_url = $7,
                photo_url = $8,
                comment = $9,
                photos = $10,
                status = $11,
                updated_at = CURRENT_TIMESTAMP
              WHERE id = $12
            `, [
              restaurant.name,
              cuisineTypeId,
              restaurant.location,
              restaurant.address || null,
              restaurant.coordinates?.lat || null,
              restaurant.coordinates?.lng || null,
              restaurant.googleMapsUrl || null,
              restaurant.photo || null,
              restaurant.comment || null,
              JSON.stringify(restaurant.photos || []),
              'tested',
              restaurant.id
            ]);
          } else {
            console.log('➕ Nouveau restaurant:', restaurant.id);
            await client.query(`
              INSERT INTO restaurants 
              (id, name, cuisine_type_id, location, address, latitude, longitude, google_maps_url, photo_url, comment, photos, status, date_added)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            `, [
              restaurant.id,
              restaurant.name,
              cuisineTypeId,
              restaurant.location,
              restaurant.address || null,
              restaurant.coordinates?.lat || null,
              restaurant.coordinates?.lng || null,
              restaurant.googleMapsUrl || null,
              restaurant.photo || null,
              restaurant.comment || null,
              JSON.stringify(restaurant.photos || []),
              'tested',
              restaurant.dateAdded || new Date().toISOString().split('T')[0]
            ]);
          }

          if (restaurant.ratings) {
            console.log('⭐ Sauvegarde des notes pour:', restaurant.id);
            await client.query(`
              INSERT INTO ratings (restaurant_id, plats, vins, accueil, lieu)
              VALUES ($1, $2, $3, $4, $5)
              ON CONFLICT (restaurant_id) 
              DO UPDATE SET 
                plats = $2, 
                vins = $3, 
                accueil = $4, 
                lieu = $5,
                updated_at = CURRENT_TIMESTAMP
            `, [
              restaurant.id,
              restaurant.ratings.plats,
              restaurant.ratings.vins,
              restaurant.ratings.accueil,
              restaurant.ratings.lieu
            ]);
          }
        }
      }

      if (requestData.wishlist) {
        for (const restaurant of requestData.wishlist) {
          console.log('📝 Traitement wishlist:', restaurant.name, 'ID:', restaurant.id);
          
          if (!restaurant.id) {
            throw new Error('❌ Restaurant ID manquant pour: ' + restaurant.name);
          }

          const cuisineResult = await client.query(
            'SELECT id FROM cuisine_types WHERE name = $1',
            [restaurant.type]
          );
          
          if (cuisineResult.rows.length === 0) {
            const newCuisineResult = await client.query(
              'INSERT INTO cuisine_types (name, emoji) VALUES ($1, $2) RETURNING id',
              [restaurant.type, '🍽️']
            );
            var cuisineTypeId = newCuisineResult.rows[0].id;
          } else {
            var cuisineTypeId = cuisineResult.rows[0].id;
          }

          const existingResult = await client.query(
            'SELECT id FROM restaurants WHERE id = $1',
            [restaurant.id]
          );

          if (existingResult.rows.length > 0) {
            await client.query(`
              UPDATE restaurants SET 
                name = $1, 
                cuisine_type_id = $2, 
                location = $3,
                address = $4,
                latitude = $5,
                longitude = $6,
                google_maps_url = $7,
                photo_url = $8,
                comment = $9, 
                reason = $10,
                status = $11,
                updated_at = CURRENT_TIMESTAMP
              WHERE id = $12
            `, [
              restaurant.name,
              cuisineTypeId,
              restaurant.location,
              restaurant.address || null,
              restaurant.coordinates?.lat || null,
              restaurant.coordinates?.lng || null,
              restaurant.googleMapsUrl || null,
              restaurant.photo || null,
              restaurant.comment || null,
              restaurant.reason || null,
              'wishlist',
              restaurant.id
            ]);
          } else {
            await client.query(`
              INSERT INTO restaurants 
              (id, name, cuisine_type_id, location, address, latitude, longitude, google_maps_url, photo_url, comment, reason, status, date_added)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            `, [
              restaurant.id,
              restaurant.name,
              cuisineTypeId,
              restaurant.location,
              restaurant.address || null,
              restaurant.coordinates?.lat || null,
              restaurant.coordinates?.lng || null,
              restaurant.googleMapsUrl || null,
              restaurant.photo || null,
              restaurant.comment || null,
              restaurant.reason || null,
              'wishlist',
              restaurant.dateAdded || new Date().toISOString().split('T')[0]
            ]);
          }
        }
      }

      await client.query('COMMIT');
      console.log('✅ Sauvegarde réussie avec coordonnées GPS');

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'Restaurants sauvegardés avec succès',
          timestamp: new Date().toISOString()
        })
      };

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }

  } catch (error) {
    console.error('❌ Erreur sauvegarde:', error);

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