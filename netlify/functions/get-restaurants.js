const { Pool } = require('pg');

let pool;

function getPool() {
  if (!pool) {
    // Utilise la variable d'environnement Netlify + Neon
    const databaseUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
    
    if (!databaseUrl) {
      throw new Error('Aucune DATABASE_URL configurée');
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
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
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

  // Only allow GET
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  const client = getPool();

  try {
    console.log('🔍 Récupération des restaurants depuis Neon DB...');

    // Récupérer tous les restaurants avec leurs infos complètes
    const restaurantsQuery = `
      SELECT 
        r.id,
        r.name,
        ct.name as type,
        ct.emoji as cuisine_emoji,
        r.location,
        r.address,
        r.latitude,
        r.longitude,
        r.price_range,
        r.photo_url as photo,
        r.google_maps_url,
        r.comment,
        r.status,
        r.reason,
        r.date_added,
        r.date_visited,
        rt.plats,
        rt.vins,
        rt.accueil,
        rt.lieu
      FROM restaurants r
      LEFT JOIN cuisine_types ct ON r.cuisine_type_id = ct.id
      LEFT JOIN ratings rt ON r.id = rt.restaurant_id
      ORDER BY r.created_at DESC
    `;

    const restaurantsResult = await client.query(restaurantsQuery);

    // Récupérer les types de cuisine
    const cuisineTypesQuery = `
      SELECT name, emoji 
      FROM cuisine_types 
      ORDER BY name
    `;

    const cuisineTypesResult = await client.query(cuisineTypesQuery);

    // Traiter les données des restaurants
    const tested = [];
    const wishlist = [];

    restaurantsResult.rows.forEach(row => {
      const restaurant = {
        id: row.id,
        name: row.name,
        type: row.type,
        location: row.location,
        address: row.address,
        priceRange: row.price_range,
        photo: row.photo_url,
        googleMapsUrl: row.google_maps_url,
        comment: row.comment,
        dateAdded: row.date_added
      };

      // Ajouter les coordonnées si elles existent
      if (row.latitude && row.longitude) {
        restaurant.coordinates = {
          lat: parseFloat(row.latitude),
          lng: parseFloat(row.longitude)
        };
      }

      if (row.status === 'tested') {
        // Ajouter les notes et la date de visite
        if (row.plats !== null) {
          restaurant.ratings = {
            plats: parseFloat(row.plats),
            vins: parseFloat(row.vins),
            accueil: parseFloat(row.accueil),
            lieu: parseFloat(row.lieu)
          };
        }
        restaurant.dateVisited = row.date_visited;
        tested.push(restaurant);
      } else if (row.status === 'wishlist') {
        restaurant.reason = row.reason;
        wishlist.push(restaurant);
      }
    });

    // Traiter les types de cuisine
    const cuisineTypes = {};
    cuisineTypesResult.rows.forEach(row => {
      cuisineTypes[row.name] = {
        color: 'primary',
        emoji: row.emoji
      };
    });

    const responseData = {
      config: {
        title: "Mon Carnet Gastro",
        author: "Gianni",
        location: "Paris, France"
      },
      tested: tested,
      wishlist: wishlist,
      cuisineTypes: cuisineTypes,
      metadata: {
        lastUpdated: new Date().toISOString(),
        totalEntries: tested.length + wishlist.length,
        source: 'neon-db'
      }
    };

    console.log('✅ Restaurants récupérés:', {
      tested: tested.length,
      wishlist: wishlist.length,
      cuisineTypes: Object.keys(cuisineTypes).length
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(responseData)
    };

  } catch (error) {
    console.error('❌ Erreur récupération restaurants:', error);

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Erreur serveur', 
        message: error.message 
      })
    };
  }
};