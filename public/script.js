/* ===== APPLICATION RESTAURANT AVEC NETLIFY FUNCTIONS ===== */

// Nouveau service d'authentification GitHub
class GitHubAuthService {
    constructor() {
        this.token = localStorage.getItem('github-token') || null;
        this.isAuthenticated = false;
    }

    async authenticate(token) {
        if (!token || token.trim() === '') {
            throw new Error('Token GitHub requis');
        }

        try {
            // Tester le token avec l'API GitHub
            const response = await fetch('https://api.github.com/user', {
                headers: {
                    'Authorization': `token ${token.trim()}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (!response.ok) {
                if (response.status === 401) {
                    throw new Error('Token GitHub invalide');
                } else {
                    throw new Error(`Erreur GitHub API: ${response.status}`);
                }
            }

            const userData = await response.json();
            
            // Sauvegarder le token et les infos utilisateur
            this.token = token.trim();
            this.userInfo = userData;
            this.isAuthenticated = true;
            
            localStorage.setItem('github-token', this.token);
            
            console.log('✅ Authentification GitHub réussie:', userData.login);
            return userData;

        } catch (error) {
            this.logout();
            throw error;
        }
    }

    logout() {
        this.token = null;
        this.userInfo = null;
        this.isAuthenticated = false;
        localStorage.removeItem('github-token');
        console.log('🔓 Déconnexion GitHub');
    }

    async checkStoredToken() {
        if (this.token) {
            try {
                await this.authenticate(this.token);
                return true;
            } catch (error) {
                console.log('⚠️ Token stocké invalide, déconnexion');
                this.logout();
                return false;
            }
        }
        return false;
    }

    getAuthHeaders() {
        if (!this.isAuthenticated || !this.token) {
            throw new Error('Non authentifié');
        }
        
        return {
            'Authorization': `token ${this.token}`,
            'Accept': 'application/vnd.github.v3+json'
        };
    }
}

// Modifications à apporter au constructeur de RestaurantApp
class RestaurantApp {
    constructor() {
        // Configuration de l'API (Netlify Functions)
        this.apiBase = '/api';
        
        // Nouveau service d'authentification GitHub
        this.githubAuth = new GitHubAuthService();
        
        // État de l'application
        this.data = {
            tested: [],
            wishlist: [],
            cuisineTypes: []
        };
        
        // Mode édition basé sur l'authentification GitHub
        this.isEditMode = false; // Par défaut en lecture
        this.map = null;
        
        console.log('🚀 Application initialisée avec Neon Functions + GitHub Auth');
    }

    // Nouvelle méthode pour gérer l'authentification
    async handleAuthentication() {
        try {
            // Vérifier si un token est déjà stocké
            const hasValidToken = await this.githubAuth.checkStoredToken();
            
            if (hasValidToken) {
                this.isEditMode = true;
                this.updateAuthUI(true);
                this.showToast('✅ Connecté via GitHub !', 'success');
            } else {
                this.isEditMode = false;
                this.updateAuthUI(false);
            }
            
        } catch (error) {
            console.error('❌ Erreur vérification auth:', error);
            this.isEditMode = false;
            this.updateAuthUI(false);
        }
    }

    updateAuthUI(isAuthenticated) {
        // Afficher/masquer les boutons d'édition
        const editElements = document.querySelectorAll('.edit-only');
        editElements.forEach(el => {
            el.style.display = isAuthenticated ? 'block' : 'none';
        });

        // Mettre à jour le badge de statut
        const statusBadge = document.getElementById('status-badge');
        if (statusBadge) {
            if (isAuthenticated) {
                statusBadge.className = 'badge bg-success fs-6';
                statusBadge.textContent = `✅ ${this.githubAuth.userInfo.login}`;
            } else {
                statusBadge.className = 'badge bg-secondary fs-6';
                statusBadge.textContent = '👀 Mode lecture';
            }
        }

        // Mettre à jour l'indicateur dans la hero section
        const modeIndicator = document.getElementById('mode-indicator');
        if (modeIndicator) {
            if (isAuthenticated) {
                modeIndicator.className = 'alert alert-success d-inline-block';
                modeIndicator.innerHTML = `
                    <i class="bi bi-github"></i>
                    <strong>Connecté :</strong> ${this.githubAuth.userInfo.login}
                    <br><small>⚡ Mode édition activé - Données sur Neon DB</small>
                `;
            } else {
                modeIndicator.className = 'alert alert-info d-inline-block';
                modeIndicator.innerHTML = `
                    <i class="bi bi-eye-fill"></i>
                    <strong>Mode lecture seule</strong>
                    <br><small>🔑 Connectez-vous avec GitHub pour modifier</small>
                `;
            }
        }
    }

    openGitHubConfig() {
        // Créer le modal de configuration GitHub s'il n'existe pas
        let modal = document.getElementById('github-config-modal');
        if (!modal) {
            modal = this.createGitHubConfigModal();
            document.body.appendChild(modal);
        }

        // Remplir le champ avec le token actuel s'il existe
        const tokenInput = document.getElementById('github-token-input');
        if (tokenInput && this.githubAuth.token) {
            tokenInput.value = this.githubAuth.token;
        }

        // Afficher le modal
        const bsModal = new bootstrap.Modal(modal);
        bsModal.show();
    }

    createGitHubConfigModal() {
        const modal = document.createElement('div');
        modal.className = 'modal fade';
        modal.id = 'github-config-modal';
        modal.innerHTML = `
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">
                            <i class="bi bi-github"></i> Configuration GitHub
                        </h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="mb-3">
                            <label class="form-label">🔑 Token d'accès personnel GitHub</label>
                            <input type="password" class="form-control" id="github-token-input" 
                                   placeholder="ghp_xxxxxxxxxxxxxxxxxxxx">
                            <div class="form-text">
                                <strong>Comment obtenir un token :</strong><br>
                                1. Allez sur <a href="https://github.com/settings/tokens" target="_blank">GitHub Settings → Developer settings → Personal access tokens</a><br>
                                2. Créez un nouveau token avec les permissions "repo"<br>
                                3. Copiez-collez le token ici
                            </div>
                        </div>
                        
                        ${this.githubAuth.isAuthenticated ? `
                        <div class="alert alert-success">
                            <i class="bi bi-check-circle-fill"></i>
                            <strong>Connecté en tant que :</strong> ${this.githubAuth.userInfo.login}
                        </div>
                        ` : ''}
                    </div>
                    <div class="modal-footer">
                        ${this.githubAuth.isAuthenticated ? `
                        <button type="button" class="btn btn-danger" onclick="app.githubLogout()">
                            <i class="bi bi-box-arrow-right"></i> Se déconnecter
                        </button>
                        ` : ''}
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Annuler</button>
                        <button type="button" class="btn btn-primary" onclick="app.githubLogin()">
                            <i class="bi bi-key"></i> Se connecter
                        </button>
                    </div>
                </div>
            </div>
        `;
        return modal;
    }

    async githubLogin() {
        const tokenInput = document.getElementById('github-token-input');
        const token = tokenInput?.value?.trim();

        if (!token) {
            this.showToast('❌ Veuillez entrer un token GitHub', 'danger');
            return;
        }

        try {
            this.showToast('🔄 Connexion en cours...', 'info');
            
            await this.githubAuth.authenticate(token);
            
            this.isEditMode = true;
            this.updateAuthUI(true);
            
            // Fermer le modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('github-config-modal'));
            if (modal) modal.hide();
            
            this.showToast('✅ Connexion GitHub réussie !', 'success');
            
        } catch (error) {
            console.error('❌ Erreur connexion GitHub:', error);
            this.showToast('❌ ' + error.message, 'danger');
        }
    }

    githubLogout() {
        this.githubAuth.logout();
        this.isEditMode = false;
        this.updateAuthUI(false);
        
        // Fermer le modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('github-config-modal'));
        if (modal) modal.hide();
        
        this.showToast('🔓 Déconnecté de GitHub', 'info');
    }
}

class RestaurantApp {
    constructor() {
        // Configuration de l'API (Netlify Functions)
        this.apiBase = '/api'; // Les functions sont accessibles via /api/*
        
        // État de l'application
        this.data = {
            tested: [],
            wishlist: [],
            cuisineTypes: []
        };
        
        this.isEditMode = true; // Toujours en mode édition avec Netlify
        this.map = null;
        
        console.log('🚀 Application initialisée avec Netlify Functions');
    }

    /* ===== CHARGEMENT INITIAL ===== */
    async init() {
        console.log('🚀 Début initialisation...');
        
        try {
            // Toujours configurer l'UI d'abord
            this.setupUI();
            console.log('✅ UI configurée');
            
            // Charger les données via Netlify Functions
            await this.loadData();
            console.log('✅ Données chargées');
            
            this.render();
            console.log('✅ Rendu effectué');
            
            this.showToast('✅ Application prête !', 'success');
            
        } catch (error) {
            console.error('❌ Erreur initialisation:', error);
            
            // En cas d'erreur, utiliser les données par défaut
            this.data = {
                tested: this.getDefaultTestedData(),
                wishlist: this.getDefaultWishlistData(),
                cuisineTypes: this.getDefaultCuisineTypes()
            };
            
            this.render();
            this.showToast('⚠️ Données par défaut chargées', 'warning');
        }
        
        this.updateSyncStatus();
    }

    /* ===== CHARGEMENT DES DONNÉES VIA NETLIFY FUNCTIONS ===== */
    async loadData() {
        console.log('📖 Chargement des données via Netlify Functions...');
        
        try {
            const response = await fetch(`${this.apiBase}/get-restaurants`);
            
            if (!response.ok) {
                throw new Error(`API Error: ${response.status}`);
            }
            
            const jsonData = await response.json();
            console.log('✅ Données reçues via API');
            
            // Parser les données
            this.data = {
                tested: jsonData.tested || [],
                wishlist: jsonData.wishlist || [],
                cuisineTypes: this.parseCuisineTypes(jsonData.cuisineTypes || {})
            };
            
            console.log('📊 Données parsées:', {
                tested: this.data.tested.length,
                wishlist: this.data.wishlist.length,
                cuisines: this.data.cuisineTypes.length
            });
            
            // Afficher info de mise à jour
            if (jsonData.metadata?.lastUpdated) {
                const lastUpdate = new Date(jsonData.metadata.lastUpdated);
                console.log('🕒 Dernière mise à jour:', lastUpdate.toLocaleString());
                this.showToast(`📅 Données à jour : ${lastUpdate.toLocaleString()}`, 'info');
            }
            
        } catch (error) {
            console.error('❌ Erreur chargement API:', error);
            throw error;
        }
    }

    /* ===== SAUVEGARDE VIA NETLIFY FUNCTIONS ===== */
    async saveData() {
        console.log('💾 Sauvegarde via Netlify Functions...');
        
        try {
            const payload = {
                tested: this.data.tested,
                wishlist: this.data.wishlist,
                cuisineTypes: this.generateCuisineTypesObject()
            };
            
            const response = await fetch(`${this.apiBase}/save-restaurants`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Erreur sauvegarde');
            }
            
            const result = await response.json();
            console.log('✅ Sauvegarde réussie:', result);
            
            return true;
            
        } catch (error) {
            console.error('❌ Erreur sauvegarde:', error);
            this.showToast('❌ Erreur sauvegarde: ' + error.message, 'danger');
            return false;
        }
    }

    /* ===== SYNCHRONISATION MANUELLE ===== */
    async manualSync() {
        try {
            this.showToast('🔄 Rechargement...', 'info');
            await this.loadData();
            this.render();
            this.showToast('✅ Données rechargées !', 'success');
        } catch (error) {
            this.showToast('❌ Erreur rechargement', 'danger');
        }
    }

    /* ===== SAUVEGARDE AUTOMATIQUE ===== */
    async autoSave() {
        console.log('💾 Sauvegarde automatique...');
        
        this.updateSyncStatus('💾 Sauvegarde...');
        
        try {
            const success = await this.saveData();
            
            if (success) {
                console.log('✅ Sauvegarde automatique réussie');
                this.updateSyncStatus('✅ Sauvegardé');
                
                // Remettre le statut normal après 2 secondes
                setTimeout(() => {
                    this.updateSyncStatus();
                }, 2000);
            }
            
        } catch (error) {
            console.error('❌ Erreur sauvegarde automatique:', error);
            this.updateSyncStatus('❌ Erreur');
            
            setTimeout(() => {
                this.updateSyncStatus();
            }, 3000);
        }
    }

    /* ===== CONFIGURATION UI ===== */
    setupUI() {
        console.log('🔧 Configuration UI...');
        
        // Mise à jour du statut
        this.updateSyncStatus();

        // Mise à jour de l'indicateur dans la hero section
        const modeIndicator = document.getElementById('mode-indicator');
        if (modeIndicator) {
            modeIndicator.className = 'alert alert-success d-inline-block';
            modeIndicator.innerHTML = `
                <i class="bi bi-rocket-fill"></i>
                <strong>Powered by Netlify Functions :</strong> Mises à jour instantanées !
                <br><small>⚡ Données synchronisées en temps réel via API sécurisée</small>
            `;
        }

        // Afficher tous les boutons d'édition
        const editElements = document.querySelectorAll('.edit-only');
        editElements.forEach(el => {
            el.style.display = 'block';
        });

        this.setupEventListeners();
    }

    setupEventListeners() {
        console.log('🔧 Configuration des event listeners...');
        
        try {
            // Boutons synchronisation
            const syncBtn = document.getElementById('sync-btn');
            if (syncBtn) {
                syncBtn.onclick = () => this.manualSync();
                syncBtn.innerHTML = '<i class="bi bi-arrow-clockwise"></i> Actualiser';
                syncBtn.title = 'Recharger les données';
            }

            const syncBtnHero = document.getElementById('sync-btn-hero');
            if (syncBtnHero) {
                syncBtnHero.onclick = () => this.manualSync();
                syncBtnHero.innerHTML = '<i class="bi bi-arrow-clockwise"></i> Actualiser';
            }

            // Boutons d'ajout
            const addTestedBtn = document.getElementById('add-tested');
            if (addTestedBtn) {
                addTestedBtn.onclick = () => this.openAddModal('tested');
            }

            const addWishlistBtn = document.getElementById('add-wishlist');
            if (addWishlistBtn) {
                addWishlistBtn.onclick = () => this.openAddModal('wishlist');
            }

            // Bouton flottant
            const floatingBtn = document.getElementById('floating-add-btn');
            if (floatingBtn) {
                floatingBtn.onclick = () => {
                    const activeTab = document.querySelector('.nav-link.active');
                    const type = (activeTab && activeTab.id.includes('wishlist')) ? 'wishlist' : 'tested';
                    this.openAddModal(type);
                };
            }

            // Onglet carte
            const mapTab = document.getElementById('map-tab');
            if (mapTab) {
                mapTab.addEventListener('shown.bs.tab', () => {
                    setTimeout(() => this.initMap(), 100);
                });
            }

            console.log('✅ Event listeners configurés');
            
        } catch (error) {
            console.warn('⚠️ Erreur setup event listeners:', error);
        }
    }

    /* ===== MISE À JOUR DU STATUT ===== */
    updateSyncStatus(customStatus = null) {
        const statusBadge = document.getElementById('status-badge');
        if (statusBadge) {
            if (customStatus) {
                statusBadge.className = 'badge bg-warning fs-6';
                statusBadge.textContent = customStatus;
            } else {
                statusBadge.className = 'badge bg-success fs-6';
                statusBadge.textContent = '⚡ Netlify Functions';
            }
        }
    }

    /* ===== RENDU ===== */
    render() {
        this.renderStats();
        this.renderTested();
        this.renderWishlist();
    }

    renderStats() {
        document.getElementById('tested-count').textContent = this.data.tested.length;
        document.getElementById('wishlist-count').textContent = this.data.wishlist.length;
        
        if (this.data.tested.length > 0) {
            const avgRating = this.data.tested.reduce((sum, r) => sum + this.calculateRating(r.ratings), 0) / this.data.tested.length;
            document.getElementById('avg-rating').textContent = avgRating.toFixed(1);
        } else {
            document.getElementById('avg-rating').textContent = '--';
        }
    }

    renderTested() {
        const container = document.getElementById('tested-grid');
        if (this.data.tested.length === 0) {
            container.innerHTML = this.createEmptyState('tested');
        } else {
            container.innerHTML = this.data.tested.map(r => this.createTestedCard(r)).join('');
        }
    }

    renderWishlist() {
        const container = document.getElementById('wishlist-grid');
        if (this.data.wishlist.length === 0) {
            container.innerHTML = this.createEmptyState('wishlist');
        } else {
            container.innerHTML = this.data.wishlist.map(r => this.createWishlistCard(r)).join('');
        }
    }

    /* ===== CRÉATION DES CARDS ===== */
    createTestedCard(restaurant) {
        const rating = this.calculateRating(restaurant.ratings);
        const photo = restaurant.photo || restaurant.photos?.[0] || 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=400&h=250&fit=crop';
        
        return `
            <div class="col-md-6 mb-4">
                <div class="card restaurant-card h-100">
                    <img src="${photo}" class="card-img-top" alt="${restaurant.name}">
                    <div class="card-body">
                        <div class="d-flex justify-content-between align-items-start mb-2">
                            <h5 class="card-title">${restaurant.name}</h5>
                            <span class="badge bg-primary">${restaurant.type}</span>
                        </div>
                        <p class="card-text text-muted">
                            <i class="bi bi-geo-alt"></i> ${restaurant.location}
                            <span class="ms-2">${restaurant.priceRange || '€€'}</span>
                        </p>
                        
                        <div class="rating-section">
                            <div class="row mb-2">
                                <div class="col-8"><small>🍽️ Plats (x2)</small></div>
                                <div class="col-4 text-end"><span class="stars">${this.generateStars(restaurant.ratings.plats)}</span></div>
                            </div>
                            <div class="row mb-2">
                                <div class="col-8"><small>🍷 Vins (x1.5)</small></div>
                                <div class="col-4 text-end"><span class="stars">${this.generateStars(restaurant.ratings.vins)}</span></div>
                            </div>
                            <div class="row mb-2">
                                <div class="col-8"><small>😊 Accueil (x1.5)</small></div>
                                <div class="col-4 text-end"><span class="stars">${this.generateStars(restaurant.ratings.accueil)}</span></div>
                            </div>
                            <div class="row">
                                <div class="col-8"><small>🏛️ Lieu (x1)</small></div>
                                <div class="col-4 text-end"><span class="stars">${this.generateStars(restaurant.ratings.lieu)}</span></div>
                            </div>
                        </div>

                        <div class="final-rating">
                            <strong>${rating.toFixed(1)}/5</strong> ${this.generateStars(rating)}
                        </div>

                        ${restaurant.comment ? `<blockquote class="blockquote-footer mt-3">"${restaurant.comment}"</blockquote>` : ''}

                        <div class="action-buttons">
                            <button class="btn btn-outline-primary btn-action" onclick="app.editRestaurant(${restaurant.id}, 'tested')">
                                <i class="bi bi-pencil"></i> Modifier
                            </button>
                            <button class="btn btn-outline-danger btn-action" onclick="app.deleteRestaurant(${restaurant.id}, 'tested')">
                                <i class="bi bi-trash"></i> Supprimer
                            </button>
                            ${restaurant.coordinates ? `
                            <button class="btn btn-outline-info btn-action" onclick="app.showOnMap(${restaurant.coordinates.lat}, ${restaurant.coordinates.lng})">
                                <i class="bi bi-geo-alt"></i> Carte
                            </button>
                            ` : ''}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    createWishlistCard(restaurant) {
        const photo = restaurant.photo || restaurant.photos?.[0] || 'https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=400&h=250&fit=crop';
        
        return `
            <div class="col-md-6 mb-4">
                <div class="card restaurant-card wishlist-card h-100">
                    <img src="${photo}" class="card-img-top" alt="${restaurant.name}">
                    <div class="card-body">
                        <div class="d-flex justify-content-between align-items-start mb-2">
                            <h5 class="card-title">${restaurant.name}</h5>
                            <span class="badge bg-success">${restaurant.type}</span>
                        </div>
                        <p class="card-text text-muted">
                            <i class="bi bi-geo-alt"></i> ${restaurant.location}
                            <span class="ms-2">${restaurant.priceRange || '€€'}</span>
                        </p>
                        
                        ${restaurant.reason ? `
                        <div class="alert alert-success">
                            <strong>💡 Pourquoi :</strong><br>
                            ${restaurant.reason}
                        </div>
                        ` : ''}

                        ${restaurant.comment ? `<p class="text-muted"><em>"${restaurant.comment}"</em></p>` : ''}

                        <div class="action-buttons">
                            <button class="btn btn-success btn-action" onclick="app.moveToTested(${restaurant.id})">
                                <i class="bi bi-arrow-right"></i> Testé !
                            </button>
                            <button class="btn btn-outline-primary btn-action" onclick="app.editRestaurant(${restaurant.id}, 'wishlist')">
                                <i class="bi bi-pencil"></i> Modifier
                            </button>
                            <button class="btn btn-outline-danger btn-action" onclick="app.deleteRestaurant(${restaurant.id}, 'wishlist')">
                                <i class="bi bi-trash"></i> Supprimer
                            </button>
                            ${restaurant.coordinates ? `
                            <button class="btn btn-outline-info btn-action" onclick="app.showOnMap(${restaurant.coordinates.lat}, ${restaurant.coordinates.lng})">
                                <i class="bi bi-geo-alt"></i> Carte
                            </button>
                            ` : ''}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    createEmptyState(type) {
        const isWishlist = type === 'wishlist';
        const icon = isWishlist ? 'heart' : 'star';
        const title = isWishlist ? 'Aucun restaurant en wishlist' : 'Aucun restaurant testé';
        const text = isWishlist ? 'Ajoutez des restaurants que vous aimeriez tester !' : 'Commencez par ajouter vos premiers restaurants testés !';
        
        return `
            <div class="col-12 text-center py-5">
                <i class="bi bi-${icon} fs-1 text-muted mb-3"></i>
                <h4>${title}</h4>
                <p class="text-muted">${text}</p>
                <button class="btn btn-${isWishlist ? 'success' : 'primary'}" onclick="app.openAddModal('${type}')">
                    <i class="bi bi-plus-lg"></i> Ajouter
                </button>
            </div>
        `;
    }

    /* ===== MODAL D'AJOUT/MODIFICATION ===== */
    openAddModal(type) {
        console.log('📝 Ouverture modal:', type);

        const modal = new bootstrap.Modal(document.getElementById('restaurant-modal'));
        
        // Reset du formulaire
        document.getElementById('restaurant-form').reset();
        document.getElementById('restaurant-id').value = '';
        document.getElementById('restaurant-type').value = type;
        
        // Configuration selon le type
        document.getElementById('modal-title').textContent = 
            type === 'tested' ? 'Ajouter un restaurant testé' : 'Ajouter à la wishlist';
        
        // Afficher/masquer les sections
        document.getElementById('ratings-section').style.display = type === 'tested' ? 'block' : 'none';
        document.getElementById('wishlist-section').style.display = type === 'wishlist' ? 'block' : 'none';
        
        modal.show();
        
        // Setup après ouverture du modal
        setTimeout(() => {
            this.updateCuisineDropdown();
            this.setupCuisineAutocomplete();
        }, 200);
    }

    // Dans la fonction saveRestaurant de script.js, remplace cette partie :

async saveRestaurant() {
    const form = document.getElementById('restaurant-form');
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }
    
    const id = document.getElementById('restaurant-id').value;
    const type = document.getElementById('restaurant-type').value;
    const isEdit = !!id;
    
    console.log('🔍 === DEBUG JAVASCRIPT SAVE ===');
    console.log('Form ID value:', id);
    console.log('Is edit mode:', isEdit);
    console.log('ID exists and not empty:', id && id.trim() !== '');
    
    // Traiter le type de cuisine
    const cuisineInput = document.getElementById('restaurant-cuisine').value;
    const cuisineType = this.addNewCuisineType(cuisineInput);
    
    // CORRECTION : Générer un ID valide
    let restaurantId;
    if (isEdit && id && id.trim() !== '') {
        restaurantId = parseInt(id);
        console.log('🔄 Using existing ID:', restaurantId);
    } else {
        restaurantId = Date.now();
        console.log('➕ Generated new ID:', restaurantId);
    }
    
    // Vérifier que l'ID est valide
    if (!restaurantId || isNaN(restaurantId)) {
        console.error('❌ Invalid ID generated:', restaurantId);
        this.showToast('❌ Erreur génération ID', 'danger');
        return;
    }
    
    const restaurantData = {
        id: restaurantId, // Utiliser l'ID corrigé
        name: document.getElementById('restaurant-name').value,
        type: cuisineType,
        location: document.getElementById('restaurant-location').value,
        address: document.getElementById('restaurant-address').value,
        priceRange: document.getElementById('restaurant-price').value,
        photo: document.getElementById('restaurant-photo').value,
        comment: document.getElementById('restaurant-comment').value,
        dateAdded: isEdit ? this.data[type].find(r => r.id === parseInt(id)).dateAdded : new Date().toISOString().split('T')[0]
    };
    
    console.log('🔍 Final restaurant data:', restaurantData);
    console.log('🔍 Restaurant ID type:', typeof restaurantData.id);
    console.log('🔍 Restaurant ID value:', restaurantData.id);
    
    if (type === 'tested') {
        restaurantData.ratings = {
            plats: parseFloat(document.getElementById('rating-plats').value),
            vins: parseFloat(document.getElementById('rating-vins').value),
            accueil: parseFloat(document.getElementById('rating-accueil').value),
            lieu: parseFloat(document.getElementById('rating-lieu').value)
        };
        restaurantData.dateVisited = restaurantData.dateAdded;
    } else {
        restaurantData.reason = document.getElementById('restaurant-reason').value;
    }
    
    // Ajouter/modifier dans les données
    if (isEdit) {
        const index = this.data[type].findIndex(r => r.id === parseInt(id));
        this.data[type][index] = restaurantData;
    } else {
        this.data[type].push(restaurantData);
    }
    
    // Fermer le modal et re-render immédiatement
    bootstrap.Modal.getInstance(document.getElementById('restaurant-modal')).hide();
    this.render();
    
    // Notification instantanée
    this.showToast(isEdit ? '✅ Restaurant modifié !' : '✅ Restaurant ajouté !', 'success');
    
    // Sauvegarde automatique en arrière-plan
    await this.autoSave();
}

    editRestaurant(id, type) {
        const restaurant = this.data[type].find(r => r.id === id);
        if (!restaurant) return;
        
        console.log('✏️ Édition restaurant:', restaurant.name);
        
        // Remplir le formulaire
        document.getElementById('restaurant-id').value = id;
        document.getElementById('restaurant-type').value = type;
        document.getElementById('restaurant-name').value = restaurant.name;
        document.getElementById('restaurant-cuisine').value = restaurant.type;
        document.getElementById('restaurant-location').value = restaurant.location;
        document.getElementById('restaurant-address').value = restaurant.address || '';
        document.getElementById('restaurant-price').value = restaurant.priceRange || '€€';
        document.getElementById('restaurant-photo').value = restaurant.photo || '';
        document.getElementById('restaurant-comment').value = restaurant.comment || '';
        
        if (type === 'tested') {
            document.getElementById('rating-plats').value = restaurant.ratings.plats || 5;
            document.getElementById('rating-vins').value = restaurant.ratings.vins || 5;
            document.getElementById('rating-accueil').value = restaurant.ratings.accueil || 5;
            document.getElementById('rating-lieu').value = restaurant.ratings.lieu || 5;
            
            // Mettre à jour les affichages des sliders
            document.getElementById('plats-value').textContent = (restaurant.ratings.plats || 5).toFixed(1);
            document.getElementById('vins-value').textContent = (restaurant.ratings.vins || 5).toFixed(1);
            document.getElementById('accueil-value').textContent = (restaurant.ratings.accueil || 5).toFixed(1);
            document.getElementById('lieu-value').textContent = (restaurant.ratings.lieu || 5).toFixed(1);
        } else {
            document.getElementById('restaurant-reason').value = restaurant.reason || '';
        }
        
        // Ouvrir le modal
        document.getElementById('modal-title').textContent = `Modifier ${restaurant.name}`;
        document.getElementById('ratings-section').style.display = type === 'tested' ? 'block' : 'none';
        document.getElementById('wishlist-section').style.display = type === 'wishlist' ? 'block' : 'none';
        
        const modal = new bootstrap.Modal(document.getElementById('restaurant-modal'));
        modal.show();
        
        // Setup après ouverture du modal
        setTimeout(() => {
            this.updateCuisineDropdown();
            this.setupCuisineAutocomplete();
        }, 200);
    }

    async deleteRestaurant(id, type) {
        const restaurant = this.data[type].find(r => r.id === id);
        if (!restaurant) return;
        
        if (confirm(`Supprimer "${restaurant.name}" ?`)) {
            // Supprimer immédiatement
            this.data[type] = this.data[type].filter(r => r.id !== id);
            this.render();
            this.showToast('✅ Restaurant supprimé !', 'success');
            
            // Sauvegarde automatique en arrière-plan
            await this.autoSave();
        }
    }

    moveToTested(id) {
        const restaurant = this.data.wishlist.find(r => r.id === id);
        if (!restaurant) return;
        
        // Ouvrir le modal de transfert
        this.openTransferModal(restaurant);
    }

    openTransferModal(restaurant) {
        // Créer le modal s'il n'existe pas
        let modal = document.getElementById('transfer-modal');
        if (!modal) {
            modal = this.createTransferModal();
            document.body.appendChild(modal);
        }
        
        // Remplir les données
        document.getElementById('transfer-restaurant-name').textContent = restaurant.name;
        document.getElementById('transfer-restaurant-id').value = restaurant.id;
        
        // Reset des sliders
        ['plats', 'vins', 'accueil', 'lieu'].forEach(type => {
            const slider = document.getElementById(`transfer-rating-${type}`);
            const display = document.getElementById(`transfer-${type}-value`);
            if (slider && display) {
                slider.value = 5;
                display.textContent = '5.0';
            }
        });
        
        document.getElementById('transfer-comment').value = '';
        
        // Afficher le modal
        const bsModal = new bootstrap.Modal(modal);
        bsModal.show();
    }

    createTransferModal() {
        const modal = document.createElement('div');
        modal.className = 'modal fade';
        modal.id = 'transfer-modal';
        modal.innerHTML = `
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">🌟 Transférer vers "Testés"</h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <p>Ajoutez vos notes pour <strong id="transfer-restaurant-name"></strong> :</p>
                        <input type="hidden" id="transfer-restaurant-id">
                        
                        <div class="row mb-3">
                            <div class="col-6">
                                <label class="form-label">🍽️ Plats (x2)</label>
                                <input type="range" class="form-range" id="transfer-rating-plats" min="1" max="5" step="0.5" value="5">
                                <div class="text-center"><span id="transfer-plats-value">5.0</span>/5</div>
                            </div>
                            <div class="col-6">
                                <label class="form-label">🍷 Vins (x1.5)</label>
                                <input type="range" class="form-range" id="transfer-rating-vins" min="1" max="5" step="0.5" value="5">
                                <div class="text-center"><span id="transfer-vins-value">5.0</span>/5</div>
                            </div>
                        </div>
                        <div class="row mb-3">
                            <div class="col-6">
                                <label class="form-label">😊 Accueil (x1.5)</label>
                                <input type="range" class="form-range" id="transfer-rating-accueil" min="1" max="5" step="0.5" value="5">
                                <div class="text-center"><span id="transfer-accueil-value">5.0</span>/5</div>
                            </div>
                            <div class="col-6">
                                <label class="form-label">🏛️ Lieu (x1)</label>
                                <input type="range" class="form-range" id="transfer-rating-lieu" min="1" max="5" step="0.5" value="5">
                                <div class="text-center"><span id="transfer-lieu-value">5.0</span>/5</div>
                            </div>
                        </div>
                        <div class="mb-3">
                            <label class="form-label">💬 Votre avis après visite</label>
                            <textarea class="form-control" id="transfer-comment" rows="3" placeholder="Comment s'est passée votre expérience ?"></textarea>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Annuler</button>
                        <button type="button" class="btn btn-success" onclick="app.confirmTransfer()">
                            <i class="bi bi-arrow-right"></i> Transférer
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        // Ajouter les event listeners pour les sliders
        setTimeout(() => {
            ['plats', 'vins', 'accueil', 'lieu'].forEach(type => {
                const slider = document.getElementById(`transfer-rating-${type}`);
                const display = document.getElementById(`transfer-${type}-value`);
                
                if (slider && display) {
                    slider.addEventListener('input', () => {
                        display.textContent = parseFloat(slider.value).toFixed(1);
                    });
                }
            });
        }, 100);
        
        return modal;
    }

    async confirmTransfer() {
        const id = parseInt(document.getElementById('transfer-restaurant-id').value);
        const restaurant = this.data.wishlist.find(r => r.id === id);
        if (!restaurant) return;
        
        // Récupérer les notes
        const ratings = {
            plats: parseFloat(document.getElementById('transfer-rating-plats').value),
            vins: parseFloat(document.getElementById('transfer-rating-vins').value),
            accueil: parseFloat(document.getElementById('transfer-rating-accueil').value),
            lieu: parseFloat(document.getElementById('transfer-rating-lieu').value)
        };
        
        const comment = document.getElementById('transfer-comment').value;
        
        // Créer l'entrée testée
        const testedRestaurant = {
            ...restaurant,
            ratings: ratings,
            dateVisited: new Date().toISOString().split('T')[0],
            comment: comment || restaurant.comment
        };
        delete testedRestaurant.reason;
        
        // Déplacer immédiatement
        this.data.tested.push(testedRestaurant);
        this.data.wishlist = this.data.wishlist.filter(r => r.id !== id);
        
        // Fermer le modal et mettre à jour l'affichage
        bootstrap.Modal.getInstance(document.getElementById('transfer-modal')).hide();
        
        // Activer l'onglet testés
        document.getElementById('tested-tab').click();
        this.render();
        
        this.showToast('✅ Restaurant déplacé vers "Testés" !', 'success');
        
        // Sauvegarde automatique en arrière-plan
        await this.autoSave();
    }

    /* ===== GESTION CUISINE TYPES ===== */
    setupCuisineAutocomplete() {
        try {
            const cuisineInput = document.getElementById('restaurant-cuisine');
            const cuisineDropdown = document.getElementById('cuisine-dropdown');
            
            if (!cuisineInput || !cuisineDropdown) {
                console.log('⚠️ Éléments cuisine pas encore dans le DOM');
                return;
            }
            
            console.log('✅ Setup autocomplete cuisine');
            
            // Input event
            cuisineInput.addEventListener('input', (e) => {
                this.filterCuisineOptions(e.target.value);
            });
            
            // Focus event
            cuisineInput.addEventListener('focus', () => {
                this.showCuisineDropdown();
            });
            
            // Click outside
            document.addEventListener('click', (e) => {
                if (!cuisineInput.contains(e.target) && !cuisineDropdown.contains(e.target)) {
                    cuisineDropdown.style.display = 'none';
                }
            });
            
        } catch (error) {
            console.warn('⚠️ Erreur setup cuisine autocomplete:', error);
        }
    }

    updateCuisineDropdown() {
        try {
            const dropdown = document.getElementById('cuisine-dropdown');
            if (!dropdown) {
                console.log('⚠️ Dropdown cuisine pas trouvé');
                return;
            }
            
            // Obtenir tous les types de cuisine uniques
            const allCuisines = new Set();
            
            // Ajouter les types par défaut
            this.data.cuisineTypes.forEach(type => allCuisines.add(type.value));
            
            // Ajouter les types des restaurants existants
            [...this.data.tested, ...this.data.wishlist].forEach(restaurant => {
                allCuisines.add(restaurant.type);
            });
            
            // Générer les options
            const sortedCuisines = Array.from(allCuisines).sort();
            dropdown.innerHTML = sortedCuisines.map(cuisine => {
                const cuisineData = this.data.cuisineTypes.find(c => c.value === cuisine);
                const emoji = cuisineData ? cuisineData.emoji : '🍽️';
                return `<div class="dropdown-item" onclick="app.selectCuisine('${cuisine}')">${emoji} ${cuisine}</div>`;
            }).join('');
            
            console.log('✅ Dropdown cuisine mise à jour avec', sortedCuisines.length, 'options');
            
        } catch (error) {
            console.warn('⚠️ Erreur update cuisine dropdown:', error);
        }
    }

    filterCuisineOptions(searchValue) {
        const dropdown = document.getElementById('cuisine-dropdown');
        if (!dropdown) return;
        
        const items = dropdown.querySelectorAll('.dropdown-item');
        const search = searchValue.toLowerCase();
        
        items.forEach(item => {
            const text = item.textContent.toLowerCase();
            item.style.display = text.includes(search) ? 'block' : 'none';
        });
        
        this.showCuisineDropdown();
    }

    showCuisineDropdown() {
        const dropdown = document.getElementById('cuisine-dropdown');
        if (dropdown) {
            dropdown.style.display = 'block';
        }
    }

    selectCuisine(cuisine) {
        const cuisineInput = document.getElementById('restaurant-cuisine');
        const dropdown = document.getElementById('cuisine-dropdown');
        
        if (cuisineInput) {
            cuisineInput.value = cuisine;
        }
        
        if (dropdown) {
            dropdown.style.display = 'none';
        }
        
        // Déclencher l'événement input pour valider le formulaire si nécessaire
        if (cuisineInput) {
            cuisineInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }

    addNewCuisineType(cuisineValue) {
        const normalizedValue = cuisineValue.toLowerCase().trim();
        
        // Vérifier si le type existe déjà
        const exists = this.data.cuisineTypes.some(type => 
            type.value.toLowerCase() === normalizedValue
        );
        
        if (!exists && normalizedValue) {
            const newType = {
                value: normalizedValue,
                label: `🍽️ ${cuisineValue}`,
                emoji: '🍽️'
            };
            
            this.data.cuisineTypes.push(newType);
            console.log('Nouveau type de cuisine ajouté:', newType);
        }
        
        return normalizedValue;
    }

    /* ===== CARTE ===== */
    showOnMap(lat, lng) {
        // Activer l'onglet carte
        const mapTab = document.getElementById('map-tab');
        if (mapTab) {
            mapTab.click();
        }
        
        // Attendre que la carte soit initialisée et centrer sur le point
        setTimeout(() => {
            if (!this.map) {
                this.initMap();
            }
            if (this.map) {
                this.map.setView([lat, lng], 16);
            }
        }, 100);
    }

    initMap() {
        if (this.map) return;
        
        this.map = L.map('map').setView([48.8566, 2.3522], 12);
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(this.map);
        
        // Ajouter les marqueurs pour les restaurants testés (bleu)
        this.data.tested.forEach(restaurant => {
            if (restaurant.coordinates) {
                const rating = this.calculateRating(restaurant.ratings);
                const marker = L.marker([restaurant.coordinates.lat, restaurant.coordinates.lng]).addTo(this.map);
                
                marker.bindPopup(`
                    <div style="min-width: 200px;">
                        <h6><strong>${restaurant.name}</strong></h6>
                        <p class="mb-1"><span class="badge bg-primary">${restaurant.type}</span></p>
                        <p class="mb-2">${restaurant.location}</p>
                        <div>${this.generateStars(rating)} ${rating.toFixed(1)}/5</div>
                        ${restaurant.comment ? `<p class="small mt-2"><em>"${restaurant.comment}"</em></p>` : ''}
                    </div>
                `);
            }
        });
        
        // Ajouter les marqueurs pour la wishlist (vert)
        this.data.wishlist.forEach(restaurant => {
            if (restaurant.coordinates) {
                const marker = L.marker([restaurant.coordinates.lat, restaurant.coordinates.lng]).addTo(this.map);
                marker.bindPopup(`
                    <div style="min-width: 200px;">
                        <h6><strong>${restaurant.name}</strong></h6>
                        <p class="mb-1"><span class="badge bg-success">${restaurant.type}</span></p>
                        <p class="mb-2">${restaurant.location}</p>
                        <div class="alert alert-info mb-0 py-2">
                            ❤️ <strong>À tester</strong><br>
                            ${restaurant.reason ? `<small>${restaurant.reason}</small>` : ''}
                        </div>
                    </div>
                `);
            }
        });
    }

    /* ===== UTILITAIRES ===== */
    calculateRating(ratings) {
        return (ratings.plats * 2 + ratings.vins * 1.5 + ratings.accueil * 1.5 + ratings.lieu * 1) / 6;
    }

    generateStars(rating) {
        let stars = '';
        for (let i = 1; i <= 5; i++) {
            if (i <= rating) {
                stars += '<i class="bi bi-star-fill"></i>';
            } else if (i - 0.5 <= rating) {
                stars += '<i class="bi bi-star-half"></i>';
            } else {
                stars += '<i class="bi bi-star"></i>';
            }
        }
        return stars;
    }

    showToast(message, type = 'info') {
        try {
            console.log(`📢 Toast: ${message}`);
            
            // Toast simple
            const toast = document.createElement('div');
            toast.className = `alert alert-${type} position-fixed`;
            toast.style.cssText = 'top: 20px; right: 20px; z-index: 9999; min-width: 300px; opacity: 0.9;';
            toast.textContent = message;
            
            document.body.appendChild(toast);
            
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.remove();
                }
            }, 3000);
            
        } catch (error) {
            console.warn('⚠️ Erreur toast, fallback alert:', error);
            alert(message);
        }
    }

    /* ===== DONNÉES PAR DÉFAUT ===== */
    parseCuisineTypes(cuisineTypesData) {
        const defaults = this.getDefaultCuisineTypes();
        if (!cuisineTypesData || typeof cuisineTypesData !== 'object') {
            return defaults;
        }
        
        const parsed = [];
        for (const [key, value] of Object.entries(cuisineTypesData)) {
            parsed.push({
                value: key,
                label: `${value.emoji || '🍽️'} ${key}`,
                emoji: value.emoji || '🍽️'
            });
        }
        
        return parsed.length > 0 ? parsed : defaults;
    }

    generateCuisineTypesObject() {
        const obj = {};
        this.data.cuisineTypes.forEach(cuisine => {
            obj[cuisine.value] = {
                color: 'primary',
                emoji: cuisine.emoji
            };
        });
        return obj;
    }

    getDefaultCuisineTypes() {
        return [
            { value: 'français', label: '🥖 Français', emoji: '🥖' },
            { value: 'italien', label: '🍕 Italien', emoji: '🍕' },
            { value: 'asiatique', label: '🍜 Asiatique', emoji: '🍜' },
            { value: 'japonais', label: '🍣 Japonais', emoji: '🍣' }
        ];
    }

    getDefaultTestedData() {
        return [
            {
                id: 1,
                name: "Le Comptoir du Relais",
                type: "français",
                location: "6ème arrondissement",
                address: "9 Carrefour de l'Odéon, 75006 Paris",
                coordinates: { lat: 48.8534, lng: 2.3387 },
                ratings: { plats: 4.5, vins: 4.0, accueil: 4.5, lieu: 4.0 },
                comment: "Bistrot authentique avec une cuisine excellente !",
                dateVisited: "2024-12-15",
                dateAdded: "2024-12-15",
                priceRange: "€€",
                photo: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=400&h=300&fit=crop"
            }
        ];
    }

    getDefaultWishlistData() {
        return [
            {
                id: 4,
                name: "L'Ami Jean",
                type: "français",
                location: "7ème arrondissement",
                address: "27 rue Malar, 75007 Paris",
                coordinates: { lat: 48.8584, lng: 2.3019 },
                reason: "Recommandé par un ami pour la cuisine basque",
                dateAdded: "2024-12-01",
                priceRange: "€€€",
                photo: "https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=400&h=250&fit=crop"
            }
        ];
    }
}

/* ===== INITIALISATION ===== */
let app;

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Démarrage de l\'application Netlify...');
    
    app = new RestaurantApp();
    await app.init();
    
    console.log('✅ Application Netlify prête !');
});

/* ===== FONCTIONS GLOBALES ===== */
function saveRestaurant() {
    if (app) app.saveRestaurant();
}

function selectCuisine(cuisine) {
    if (app) app.selectCuisine(cuisine);
}

function confirmTransfer() {
    if (app) app.confirmTransfer();

}
