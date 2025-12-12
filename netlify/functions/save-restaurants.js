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

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
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