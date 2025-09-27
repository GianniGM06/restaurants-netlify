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

    // Test de connection
    await client.query('SELECT 1');
    console.log('✅ Connection DB réussie');

    const requestData = JSON.parse(event.body);
    console.log('📊 Données reçues:', {
      tested: requestData.tested?.length || 0,
      wishlist: requestData.wishlist?.length || 0
    });

    // Transaction
    await client.query('BEGIN');

    try {
      // 1. Traiter chaque restaurant testé
      if (requestData.tested) {
        for (const restaurant of requestData.tested) {
          console.log('📝 Traitement restaurant testé:', restaurant.name, 'ID:', restaurant.id);
          
          // Vérification ID
          if (!restaurant.id) {
            throw new Error('❌ Restaurant ID manquant pour: ' + restaurant.name);
          }

          // Obtenir l'ID du type de cuisine
          const cuisineResult = await client.query(
            'SELECT id FROM cuisine_types WHERE name = $1',
            [restaurant.type]
          );
          
          if (cuisineResult.rows.length === 0) {
            // Créer le type de cuisine s'il n'existe pas
            const newCuisineResult = await client.query(
              'INSERT INTO cuisine_types (name, emoji) VALUES ($1, $2) RETURNING id',
              [restaurant.type, '🍽️']
            );
            var cuisineTypeId = newCuisineResult.rows[0].id;
          } else {
            var cuisineTypeId = cuisineResult.rows[0].id;
          }

          // Vérifier si le restaurant existe
          const existingResult = await client.query(
            'SELECT id FROM restaurants WHERE id = $1',
            [restaurant.id]
          );

          if (existingResult.rows.length > 0) {
            // Mettre à jour
            console.log('🔄 Mise à jour restaurant:', restaurant.id);
            await client.query(`
              UPDATE restaurants SET 
                name = $1, 
                cuisine_type_id = $2, 
                location = $3,
                address = $4,
                google_maps_url = $5,
                comment = $6, 
                status = $7,
                updated_at = CURRENT_TIMESTAMP
              WHERE id = $8
            `, [
              restaurant.name,
              cuisineTypeId,
              restaurant.location,
              restaurant.address || null,
              restaurant.googleMapsUrl || null,
              restaurant.comment || null,
              'tested',
              restaurant.id
            ]);
          } else {
            // Insérer nouveau
            console.log('➕ Nouveau restaurant:', restaurant.id);
            await client.query(`
              INSERT INTO restaurants 
              (id, name, cuisine_type_id, location, address, google_maps_url, comment, status, date_added)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            `, [
              restaurant.id,
              restaurant.name,
              cuisineTypeId,
              restaurant.location,
              restaurant.address || null,
              restaurant.googleMapsUrl || null,
              restaurant.comment || null,
              'tested',
              restaurant.dateAdded || new Date().toISOString().split('T')[0]
            ]);
          }

          // Gérer les notes
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

      // 2. Traiter la wishlist de la même manière
      if (requestData.wishlist) {
        for (const restaurant of requestData.wishlist) {
          console.log('📝 Traitement wishlist:', restaurant.name, 'ID:', restaurant.id);
          
          if (!restaurant.id) {
            throw new Error('❌ Restaurant ID manquant pour: ' + restaurant.name);
          }

          // Obtenir l'ID du type de cuisine
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

          // Vérifier si existe
          const existingResult = await client.query(
            'SELECT id FROM restaurants WHERE id = $1',
            [restaurant.id]
          );

          if (existingResult.rows.length > 0) {
            // Mettre à jour
            await client.query(`
              UPDATE restaurants SET 
                name = $1, 
                cuisine_type_id = $2, 
                location = $3,
                address = $4,
                google_maps_url = $5,
                comment = $6, 
                reason = $7,
                status = $8,
                updated_at = CURRENT_TIMESTAMP
              WHERE id = $9
            `, [
              restaurant.name,
              cuisineTypeId,
              restaurant.location,
              restaurant.address || null,
              restaurant.googleMapsUrl || null,
              restaurant.comment || null,
              restaurant.reason || null,
              'wishlist',
              restaurant.id
            ]);
          } else {
            // Insérer nouveau
            await client.query(`
              INSERT INTO restaurants 
              (id, name, cuisine_type_id, location, address, google_maps_url, comment, reason, status, date_added)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            `, [
              restaurant.id,
              restaurant.name,
              cuisineTypeId,
              restaurant.location,
              restaurant.address || null,
              restaurant.googleMapsUrl || null,
              restaurant.comment || null,
              restaurant.reason || null,
              'wishlist',
              restaurant.dateAdded || new Date().toISOString().split('T')[0]
            ]);
          }
        }
      }

      await client.query('COMMIT');
      console.log('✅ Sauvegarde réussie');

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