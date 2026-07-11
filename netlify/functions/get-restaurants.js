const { getPool } = require('./lib/db.js');

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
        r.photo_url,
        r.google_maps_url,
        r.comment,
        r.status,
        r.reason,
        r.date_added,
        r.date_visited,
        r.photos,
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

    // Vraie date de dernière modification (pas l'heure de la requête)
    const lastUpdatedResult = await client.query(
      'SELECT GREATEST(MAX(created_at), MAX(updated_at)) AS last_updated FROM restaurants'
    );
    const lastUpdated = lastUpdatedResult.rows[0]?.last_updated || null;

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
        photo: row.photo_url,  // ✅ CORRECTION : Utiliser photo_url au lieu de photo
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
        // Convention : vins NULL en DB = "vins non testés" (pas de parseFloat(null) -> NaN)
        if (row.plats !== null) {
          restaurant.ratings = {
            plats: parseFloat(row.plats),
            vins: row.vins === null ? null : parseFloat(row.vins),
            accueil: parseFloat(row.accueil),
            lieu: parseFloat(row.lieu)
          };
          restaurant.winesNotTested = row.vins === null;
        }
        restaurant.dateVisited = row.date_visited;
        restaurant.photos = row.photos || [];
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
        lastUpdated,
        totalEntries: tested.length + wishlist.length,
        source: 'neon-db'
      }
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(responseData)
    };

  } catch (error) {
    console.error('Erreur récupération restaurants:', error);

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