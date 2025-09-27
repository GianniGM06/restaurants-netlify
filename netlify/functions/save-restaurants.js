const { Pool } = require('pg');

let pool;

function getPool() {
  if (!pool) {
    // Utilise la variable d'environnement Netlify + Neon
    const databaseUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
    
    console.log('🔍 Variables d\'environnement disponibles:', Object.keys(process.env).filter(key => key.includes('DATABASE')));
    console.log('🔍 DATABASE_URL configurée:', databaseUrl ? 'Oui' : 'Non');
    console.log('🔍 URL commence par postgresql:', databaseUrl?.startsWith('postgresql://') ? 'Oui' : 'Non');
    
    if (!databaseUrl) {
      throw new Error('❌ Aucune DATABASE_URL configurée. Variables disponibles: ' + Object.keys(process.env).filter(key => key.includes('DATABASE')).join(', '));
    }
    
    if (databaseUrl.includes('127.0.0.1') || databaseUrl.includes('localhost')) {
      throw new Error('❌ DATABASE_URL pointe vers localhost au lieu de Neon: ' + databaseUrl);
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
  // Headers CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    console.log('💾 Sauvegarde des restaurants dans Neon DB...');

    // Test de connection avant de traiter les données
    const client = getPool();
    await client.query('SELECT 1'); // Test de connection simple
    console.log('✅ Connection Neon DB réussie');

    const requestData = JSON.parse(event.body);
    const { tested = [], wishlist = [], cuisineTypes = {} } = requestData;

    console.log('📊 Données reçues:', {
      tested: tested.length,
      wishlist: wishlist.length,
      cuisineTypes: Object.keys(cuisineTypes).length
    });

    // Commencer une transaction
    await client.query('BEGIN');

    try {
      // 1. Mettre à jour les types de cuisine
      for (const [cuisineName, cuisineData] of Object.entries(cuisineTypes)) {
        await client.query(`
          INSERT INTO cuisine_types (name, emoji) 
          VALUES ($1, $2) 
          ON CONFLICT (name) DO UPDATE SET emoji = $2
        `, [cuisineName, cuisineData.emoji || '🍽️']);
      }

      // 2. Fonction helper pour obtenir l'ID du type de cuisine
      async function getCuisineTypeId(cuisineName) {
        const result = await client.query(
          'SELECT id FROM cuisine_types WHERE name = $1',
          [cuisineName]
        );
        return result.rows[0]?.id;
      }

      // 3. Fonction helper pour sauvegarder un restaurant
      async function saveRestaurant(restaurant, status) {
        const cuisineTypeId = await getCuisineTypeId(restaurant.type);
        
        const restaurantData = [
          restaurant.name,
          cuisineTypeId,
          restaurant.location,
          restaurant.address || null,
          restaurant.coordinates?.lat || null,
          restaurant.coordinates?.lng || null,
          restaurant.priceRange || '€€',
          restaurant.photo || null,
          restaurant.comment || null,
          status,
          restaurant.reason || null,
          restaurant.dateAdded || new Date().toISOString().split('T')[0],
          restaurant.dateVisited || null
        ];

        // Vérifier si le restaurant existe déjà
        const existingResult = await client.query(
          'SELECT id FROM restaurants WHERE id = $1',
          [restaurant.id]
        );

        let restaurantId;

        if (existingResult.rows.length > 0) {
          // Mettre à jour le restaurant existant
          await client.query(`
            UPDATE restaurants SET 
              name = $2, 
              cuisine_type_id = $3, 
              location = $4, 
              address = $5, 
              latitude = $6, 
              longitude = $7, 
              price_range = $8, 
              photo_url = $9, 
              comment = $10, 
              status = $11, 
              reason = $12, 
              date_added = $13, 
              date_visited = $14,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
          `, [restaurant.id, ...restaurantData]);
          
          restaurantId = restaurant.id;
        } else {
          // Insérer un nouveau restaurant
          const insertResult = await client.query(`
            INSERT INTO restaurants 
            (name, cuisine_type_id, location, address, latitude, longitude, 
             price_range, photo_url, comment, status, reason, date_added, date_visited)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            RETURNING id
          `, restaurantData);
          
          restaurantId = insertResult.rows[0].id;
        }

        // 4. Gérer les notes pour les restaurants testés
        if (status === 'tested' && restaurant.ratings) {
          const { plats, vins, accueil, lieu } = restaurant.ratings;
          
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
          `, [restaurantId, plats, vins, accueil, lieu]);
        }

        return restaurantId;
      }

      // 5. Sauvegarder tous les restaurants testés
      for (const restaurant of tested) {
        await saveRestaurant(restaurant, 'tested');
      }

      // 6. Sauvegarder tous les restaurants de la wishlist
      for (const restaurant of wishlist) {
        await saveRestaurant(restaurant, 'wishlist');
      }

      // 7. Supprimer les restaurants qui ne sont plus dans les données envoyées
      const allCurrentIds = [...tested, ...wishlist].map(r => r.id);
      if (allCurrentIds.length > 0) {
        const placeholders = allCurrentIds.map((_, index) => `${index + 1}`).join(',');
        await client.query(
          `DELETE FROM restaurants WHERE id NOT IN (${placeholders})`,
          allCurrentIds
        );
      }

      // Valider la transaction
      await client.query('COMMIT');

      console.log('✅ Sauvegarde réussie dans Neon DB');

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'Restaurants sauvegardés avec succès',
          timestamp: new Date().toISOString(),
          counts: {
            tested: tested.length,
            wishlist: wishlist.length
          }
        })
      };

    } catch (error) {
      // Annuler la transaction en cas d'erreur
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
        message: error.message,
        details: error.stack
      })
    };
  }
};
