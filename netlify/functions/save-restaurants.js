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
    console.log('💾 Sauvegarde des restaurants sur GitHub...');
    
    // Configuration GitHub
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
    const GITHUB_OWNER = process.env.GITHUB_OWNER || 'giannigm06';
    const GITHUB_REPO = process.env.GITHUB_REPO || 'Restaurants_data';
    const GITHUB_FILE = process.env.GITHUB_FILE || 'restaurants.json';
    
    if (!GITHUB_TOKEN) {
      throw new Error('GITHUB_TOKEN non configuré');
    }
    
    // Parser les données reçues
    const requestData = JSON.parse(event.body);
    console.log('📊 Données reçues:', {
      tested: requestData.tested?.length || 0,
      wishlist: requestData.wishlist?.length || 0
    });
    
    // Construire le JSON complet avec métadonnées
    const fullData = {
      config: {
        title: "Mon Carnet Gastro",
        author: "Gianni",
        location: "Paris, France"
      },
      cuisineTypes: requestData.cuisineTypes || {},
      tested: requestData.tested || [],
      wishlist: requestData.wishlist || [],
      metadata: {
        lastUpdated: new Date().toISOString(),
        totalEntries: (requestData.tested?.length || 0) + (requestData.wishlist?.length || 0),
        updatedVia: 'netlify-functions'
      }
    };
    
    // 1. Récupérer le SHA actuel du fichier
    const getUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_FILE}`;
    const getResponse = await fetch(getUrl, {
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Netlify-Functions'
      }
    });
    
    let fileSha = null;
    if (getResponse.ok) {
      const currentFile = await getResponse.json();
      fileSha = currentFile.sha;
      console.log('🔑 SHA actuel récupéré:', fileSha);
    } else if (getResponse.status === 404) {
      console.log('📄 Fichier n\'existe pas encore, sera créé');
    } else {
      throw new Error(`Erreur récupération SHA: ${getResponse.status}`);
    }
    
    // 2. Encoder le nouveau contenu en base64
    const jsonString = JSON.stringify(fullData, null, 2);
    const content = Buffer.from(jsonString, 'utf8').toString('base64');
    
    // 3. Sauvegarder sur GitHub
    const putUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_FILE}`;
    const putPayload = {
      message: `Mise à jour restaurants - ${new Date().toLocaleString()} (via Netlify)`,
      content: content,
      branch: 'main'
    };
    
    // Inclure le SHA si le fichier existe
    if (fileSha) {
      putPayload.sha = fileSha;
    }
    
    const putResponse = await fetch(putUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Netlify-Functions'
      },
      body: JSON.stringify(putPayload)
    });
    
    if (!putResponse.ok) {
      const errorData = await putResponse.json();
      throw new Error(`GitHub API Error: ${putResponse.status} - ${errorData.message}`);
    }
    
    const result = await putResponse.json();
    console.log('✅ Sauvegarde réussie, nouveau SHA:', result.content.sha);
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Restaurants sauvegardés avec succès',
        sha: result.content.sha,
        timestamp: new Date().toISOString()
      })
    };
    
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