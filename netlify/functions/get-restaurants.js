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

  try {
    console.log('🔍 Récupération des restaurants depuis GitHub...');
    
    // Configuration GitHub depuis les variables d'environnement
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
    const GITHUB_OWNER = process.env.GITHUB_OWNER || 'giannigm06';
    const GITHUB_REPO = process.env.GITHUB_REPO || 'Restaurants_data';
    const GITHUB_FILE = process.env.GITHUB_FILE || 'restaurants.json';
    
    if (!GITHUB_TOKEN) {
      throw new Error('GITHUB_TOKEN non configuré');
    }
    
    // Récupérer le fichier depuis l'API GitHub
    const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_FILE}`;
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Netlify-Functions'
      }
    });
    
    if (!response.ok) {
      throw new Error(`GitHub API Error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Décoder le contenu base64
    const content = Buffer.from(data.content, 'base64').toString('utf8');
    const restaurantData = JSON.parse(content);
    
    console.log('✅ Restaurants récupérés:', {
      tested: restaurantData.tested?.length || 0,
      wishlist: restaurantData.wishlist?.length || 0
    });
    
    // Ajouter métadonnées
    const response_data = {
      ...restaurantData,
      _meta: {
        timestamp: new Date().toISOString(),
        source: 'netlify-functions',
        sha: data.sha
      }
    };
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response_data)
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