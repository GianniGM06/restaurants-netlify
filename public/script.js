/* ===== MODULES (ES modules — exposent aussi window.* pour compat) ===== */
import './api.js';
import './auth.js';
import './map.js';
import './filters.js';
import { escapeHtml } from './ui.js';
import { calculateRating } from './rating.js';
import { initTheme } from './theme.js';

/* Image de repli locale (data URI) — remplace via.placeholder.com, service mort */
const FALLBACK_IMG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Crect width='100%25' height='100%25' fill='%23e9ecef'/%3E%3Ctext x='50%25' y='50%25' font-family='sans-serif' font-size='11' fill='%236c757d' text-anchor='middle' dy='.35em'%3EImage indisponible%3C/text%3E%3C/svg%3E";
if (typeof window !== 'undefined') window.FALLBACK_IMG = FALLBACK_IMG;

/* ===== SERVICE D'AUTHENTIFICATION GITHUB (auth.js) ===== */
// Délégué à window.Auth.GitHubAuthService (chargé par auth.js)
const GitHubAuthService = window.Auth.GitHubAuthService;

/* ===== APPLICATION RESTAURANT AVEC NETLIFY FUNCTIONS + GITHUB AUTH ===== */

class RestaurantApp {
  constructor() {
    // Configuration de l'API (Netlify Functions)
    this.apiBase = "/api"; // Les functions sont accessibles via /api/*

    // Service d'authentification GitHub (auth.js)
    this.githubAuth = new GitHubAuthService();

    // Gestionnaire de carte (map.js)
    this.mapManager = new window.MapModule.MapManager({
      generateStars: (r) => window.UI.generateStars(r),
      showToast: (m, t) => window.UI.showToast(m, t),
    });

    // État de l'application
    this.data = {
      tested: [],
      wishlist: [],
      cuisineTypes: [],
    };

    this.isEditMode = false;
    this.currentPhotos = [];
    this.currentPhotoIndex = 0;

    // État des filtres
    this.filters = {
        cuisines: [],
        prices: [],
        locations: [],
        query: ''
    };
    this.filteredData = {
        tested: [],
        wishlist: []
    };
  }

  /* ===== CHARGEMENT INITIAL ===== */
  async init() {
    try {
      // Toujours configurer l'UI d'abord
      this.setupUI();

      // Afficher le skeleton pendant le chargement
      this.showLoadingSkeleton();

      // Vérifier l'authentification GitHub
      await this.handleAuthentication();

      // Charger les données via Netlify Functions
      await this.loadData();

      this.render();
      this.updateSyncStatus();
    } catch (error) {
      console.error("Erreur initialisation:", error);
      // État d'erreur honnête : pas de fausses données de démo
      // (renderErrorState positionne le badge sur "Hors ligne")
      this.renderErrorState();
    }
  }

  /* ===== ÉTAT D'ERREUR ===== */
  renderErrorState() {
    const errorHtml = `
        <div class="col-12">
            <div class="error-state text-center py-5">
                <i class="bi bi-wifi-off fs-1 mb-3 d-block" aria-hidden="true"></i>
                <h4>Impossible de charger les données</h4>
                <p class="text-muted mb-4">Le serveur ne répond pas. Vérifiez votre connexion puis réessayez.</p>
                <button class="btn btn-primary" data-action="retry">
                    <i class="bi bi-arrow-clockwise" aria-hidden="true"></i> Réessayer
                </button>
            </div>
        </div>
    `;
    const tested = document.getElementById("tested-grid");
    const wishlist = document.getElementById("wishlist-grid");
    if (tested) tested.innerHTML = errorHtml;
    if (wishlist) wishlist.innerHTML = errorHtml;

    document.getElementById("tested-count").textContent = "--";
    document.getElementById("wishlist-count").textContent = "--";
    document.getElementById("avg-rating").textContent = "--";

    const modeIndicator = document.getElementById("mode-indicator");
    if (modeIndicator) {
      modeIndicator.className = "mode-pill is-danger";
      modeIndicator.innerHTML = '<i class="bi bi-exclamation-triangle" aria-hidden="true"></i> Données indisponibles';
    }
    this.updateSyncStatus("Hors ligne");
  }

  async retryLoad() {
    this.showLoadingSkeleton();
    try {
      await this.loadData();
      this.render();
      this.updateSyncStatus();
      this.showToast("Données chargées !", "success");
    } catch (error) {
      console.error("Erreur rechargement:", error);
      this.renderErrorState();
      this.showToast("Toujours impossible de joindre le serveur", "danger");
    }
  }

  showLoadingSkeleton() { window.UI.showLoadingSkeleton(); }

  /* ===== GESTION AUTHENTIFICATION GITHUB ===== */
  async handleAuthentication() {
    try {
      // Vérifier si un token est déjà stocké
      const hasValidToken = await this.githubAuth.checkStoredToken();

      if (hasValidToken) {
        this.isEditMode = true;
        this.updateAuthUI(true);
        this.showToast("✅ Connecté via GitHub !", "success");
      } else {
        this.isEditMode = false;
        this.updateAuthUI(false);
      }
    } catch (error) {
      console.error("❌ Erreur vérification auth:", error);
      this.isEditMode = false;
      this.updateAuthUI(false);
    }
  }

  updateAuthUI(isAuthenticated) {
    // Afficher/masquer les boutons d'édition
    const editElements = document.querySelectorAll(".edit-only");
    editElements.forEach((el) => {
      el.style.display = isAuthenticated ? "block" : "none";
    });

    // Mettre à jour le badge de statut
    const statusBadge = document.getElementById("status-badge");
    if (statusBadge) {
      if (isAuthenticated) {
        statusBadge.className = "badge bg-success";
        statusBadge.innerHTML = `${escapeHtml(this.githubAuth.userInfo.login)} <button class="btn btn-sm btn-outline-light ms-1" onclick="app.githubLogout()" title="Se déconnecter"><i class="bi bi-box-arrow-right" aria-hidden="true"></i></button>`;
      } else {
        statusBadge.className = "badge bg-secondary";
        statusBadge.textContent = "Lecture seule";
      }
    }

    // Mettre à jour l'indicateur dans la hero section
    const modeIndicator = document.getElementById("mode-indicator");
    if (modeIndicator) {
      if (isAuthenticated) {
        modeIndicator.className = "mode-pill is-success";
        modeIndicator.innerHTML = `
    <i class="bi bi-github" aria-hidden="true"></i>
    Connecté : <strong>${escapeHtml(this.githubAuth.userInfo.login)}</strong> — mode édition
    <button class="btn btn-sm btn-link p-0 ms-2 align-baseline" onclick="app.githubLogout()">Se déconnecter</button>
`;
      } else {
        modeIndicator.className = "mode-pill is-info";
        modeIndicator.innerHTML = `
                    <i class="bi bi-eye" aria-hidden="true"></i>
                    Mode lecture seule — connectez-vous avec GitHub pour modifier
                `;
      }
    }
  }

  checkEditPermission() {
    if (!this.isEditMode) {
      this.showToast(
        "🔒 Connectez-vous avec GitHub pour modifier les restaurants",
        "warning"
      );
      return false;
    }
    return true;
  }

  openGitHubConfig() {
    // Créer le modal de configuration GitHub s'il n'existe pas
    let modal = document.getElementById("github-config-modal");
    if (!modal) {
      modal = this.createGitHubConfigModal();
      document.body.appendChild(modal);
    }

    // Remplir le champ avec le token actuel s'il existe
    const tokenInput = document.getElementById("github-token-input");
    if (tokenInput && this.githubAuth.token) {
      tokenInput.value = this.githubAuth.token;
    }

    // Afficher le modal
    const bsModal = new bootstrap.Modal(modal);
    bsModal.show();
  }

  createGitHubConfigModal() {
    const modal = document.createElement("div");
    modal.className = "modal fade";
    modal.id = "github-config-modal";
    modal.innerHTML = `
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">
                            <i class="bi bi-github"></i> Configuration GitHub
                        </h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
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
                        
                        ${
                          this.githubAuth.isAuthenticated
                            ? `
                        <div class="alert alert-success">
                            <i class="bi bi-check-circle-fill"></i>
                            <strong>Connecté en tant que :</strong> ${this.githubAuth.userInfo.login}
                        </div>
                        `
                            : ""
                        }
                    </div>
                    <div class="modal-footer">
                        ${
                          this.githubAuth.isAuthenticated
                            ? `
                        <button type="button" class="btn btn-danger" onclick="app.githubLogout()">
                            <i class="bi bi-box-arrow-right"></i> Se déconnecter
                        </button>
                        `
                            : ""
                        }
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

  openFAQ() {
    const modal = document.getElementById("faq-modal");
    if (modal) {
        const bsModal = new bootstrap.Modal(modal);
        bsModal.show();
    }
}

  async githubLogin() {
    const tokenInput = document.getElementById("github-token-input");
    const token = tokenInput?.value?.trim();

    if (!token) {
      this.showToast("❌ Veuillez entrer un token GitHub", "danger");
      return;
    }

    try {
      this.showToast("🔄 Connexion en cours...", "info");

      await this.githubAuth.authenticate(token);

      this.isEditMode = true;
      this.updateAuthUI(true);

      // Fermer le modal
      const modal = bootstrap.Modal.getInstance(
        document.getElementById("github-config-modal")
      );
      if (modal) modal.hide();

      this.showToast("✅ Connexion GitHub réussie !", "success");
    } catch (error) {
      console.error("❌ Erreur connexion GitHub:", error);
      this.showToast("❌ " + error.message, "danger");
    }
  }

  githubLogout() {
    this.githubAuth.logout();
    this.isEditMode = false;
    this.updateAuthUI(false);

    // Fermer le modal
    const modal = bootstrap.Modal.getInstance(
      document.getElementById("github-config-modal")
    );
    if (modal) modal.hide();

    this.showToast("🔓 Déconnecté de GitHub", "info");
  }

  /* ===== CHARGEMENT DES DONNÉES (api.js) ===== */
  async loadData() {
    const jsonData = await window.Api.fetchRestaurants();
    this.data = {
      tested: jsonData.tested || [],
      wishlist: jsonData.wishlist || [],
      cuisineTypes: this.parseCuisineTypes(jsonData.cuisineTypes || {}),
    };
    this.populateFilterOptions();
    if (jsonData.metadata?.lastUpdated) {
      const lastUpdate = new Date(jsonData.metadata.lastUpdated);
      this.showToast(`📅 Données à jour : ${lastUpdate.toLocaleString()}`, 'info');
    }
  }

  /* ===== SAUVEGARDE (api.js) ===== */
  async saveData() {
    try {
      await window.Api.persistRestaurants({
        tested: this.data.tested,
        wishlist: this.data.wishlist,
        cuisineTypes: this.generateCuisineTypesObject(),
      }, this.githubAuth.token);
      return true;
    } catch (error) {
      this.showToast('❌ Erreur sauvegarde: ' + error.message, 'danger');
      return false;
    }
  }

  /* ===== SYNCHRONISATION MANUELLE ===== */
  async manualSync() {
    try {
      this.showToast("🔄 Rechargement...", "info");
      await this.loadData();
      this.render();
      this.showToast("✅ Données rechargées !", "success");
    } catch (error) {
      this.showToast("❌ Erreur rechargement", "danger");
    }
  }

  /* ===== SAUVEGARDE AUTOMATIQUE ===== */
  async autoSave() {
    if (!this.isEditMode) return;

    this.updateSyncStatus("Sauvegarde…");

    try {
      const success = await this.saveData();

      if (success) {
        this.updateSyncStatus("Sauvegardé");
        this.setSyncWarning(false);

        setTimeout(() => {
          this.updateSyncStatus();
        }, 2000);
      } else {
        throw new Error("Échec de la sauvegarde");
      }
    } catch (error) {
      console.error("Erreur sauvegarde automatique:", error);
      this.updateSyncStatus("Non synchronisé");
      this.setSyncWarning(true);
      this.showToast(
        "Sauvegarde échouée — vos modifications ne sont pas enregistrées. Vérifiez votre connexion puis relancez via « Actualiser ».",
        "danger"
      );

      setTimeout(() => {
        this.updateSyncStatus();
      }, 5000);
    }
  }

  setSyncWarning(active) { window.UI.setSyncWarning(document.getElementById('status-badge'), active); }

  /* ===== CONFIGURATION UI ===== */
  setupUI() {

    // Mise à jour du statut
    this.updateSyncStatus();

    this.setupEventListeners();
    // Branchés UNE SEULE FOIS (délégation) — jamais lors des re-render
    this.setupFilterEvents();
    this.setupCuisineAutocomplete();
    this.setupCardActions();
    this.setupBadgeEvents();
    this.setupPhotoInputEvents();
  }

  /* ===== DÉLÉGATION D'ÉVÉNEMENTS =====
     Les cards sont regénérées en innerHTML : aucun onclick inline avec des
     données utilisateur (risque XSS). Les actions passent par data-action,
     les listeners sont posés une seule fois sur les conteneurs stables. */

  setupCardActions() {
    [['tested-grid', 'tested'], ['wishlist-grid', 'wishlist']].forEach(([gridId, type]) => {
      const grid = document.getElementById(gridId);
      if (!grid) return;
      grid.addEventListener('click', (e) => {
        const actionEl = e.target.closest('[data-action]');
        if (!actionEl) return;
        const card = actionEl.closest('[data-restaurant-id]');
        const id = card ? card.dataset.restaurantId : null;
        const restaurant = id != null ? this.data[type].find((r) => r.id == id) : null;

        switch (actionEl.dataset.action) {
          case 'edit': this.editRestaurant(id, type); break;
          case 'delete': this.deleteRestaurant(id, type); break;
          case 'move': this.moveToTested(id); break;
          case 'toggle-detail': this.toggleRatingDetail(id); break;
          case 'open-photo': this.openLightbox(id, Number(actionEl.dataset.photoIndex)); break;
          case 'show-map':
            if (restaurant?.coordinates) this.showOnMap(restaurant.coordinates.lat, restaurant.coordinates.lng);
            break;
          case 'open-maps':
            if (restaurant?.googleMapsUrl) window.open(restaurant.googleMapsUrl, '_blank', 'noopener');
            break;
          case 'add': this.openAddModal(type); break;
          case 'clear-filters': this.clearAllFilters(); break;
          case 'github-config': this.openGitHubConfig(); break;
          case 'retry': this.retryLoad(); break;
        }
      });
    });
  }

  setupBadgeEvents() {
    const cuisineBadges = document.getElementById('cuisine-badges');
    if (cuisineBadges) {
      cuisineBadges.addEventListener('click', (e) => {
        const badge = e.target.closest('[data-value]');
        if (badge) this.removeCuisineFilter(badge.dataset.value);
      });
    }
    const locationBadges = document.getElementById('location-badges');
    if (locationBadges) {
      locationBadges.addEventListener('click', (e) => {
        const badge = e.target.closest('[data-value]');
        if (badge) this.removeLocationFilter(badge.dataset.value);
      });
    }
  }

  setupPhotoInputEvents() {
    const container = document.getElementById('photos-container');
    if (!container) return;
    container.addEventListener('change', (e) => {
      const group = e.target.closest('[data-photo-index]');
      if (!group) return;
      const index = Number(group.dataset.photoIndex);
      if (e.target.dataset.photoField === 'url') this.updatePhotoUrl(index, e.target.value);
      else if (e.target.dataset.photoField === 'comment') this.updatePhotoComment(index, e.target.value);
    });
    container.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action="remove-photo"]');
      if (!btn) return;
      const group = btn.closest('[data-photo-index]');
      if (group) this.removePhotoInput(Number(group.dataset.photoIndex));
    });
  }

  setupEventListeners() {

    try {
      // Boutons synchronisation
      const syncBtn = document.getElementById("sync-btn");
      if (syncBtn) {
        syncBtn.onclick = () => this.manualSync();
        syncBtn.innerHTML = '<i class="bi bi-arrow-clockwise"></i> Actualiser';
        syncBtn.title = "Recharger les données";
      }

      const syncBtnHero = document.getElementById("sync-btn-hero");
      if (syncBtnHero) {
        syncBtnHero.onclick = () => this.manualSync();
        syncBtnHero.innerHTML =
          '<i class="bi bi-arrow-clockwise"></i> Actualiser';
      }

      // Bouton FAQ
    const faqBtn = document.getElementById("faq-btn");
if (faqBtn) {
    faqBtn.onclick = () => this.openFAQ();
}

      // Boutons d'ajout (visibles seulement en mode édition)
      const addTestedBtn = document.getElementById("add-tested");
      if (addTestedBtn) {
        addTestedBtn.onclick = () => {
          if (this.isEditMode) {
            this.openAddModal("tested");
          } else {
            this.showToast(
              "🔒 Connectez-vous avec GitHub pour modifier",
              "warning"
            );
          }
        };
      }

      const addWishlistBtn = document.getElementById("add-wishlist");
      if (addWishlistBtn) {
        addWishlistBtn.onclick = () => {
          if (this.isEditMode) {
            this.openAddModal("wishlist");
          } else {
            this.showToast(
              "🔒 Connectez-vous avec GitHub pour modifier",
              "warning"
            );
          }
        };
      }

      // Bouton flottant
      const floatingBtn = document.getElementById("floating-add-btn");
      if (floatingBtn) {
        floatingBtn.onclick = () => {
          if (this.isEditMode) {
            const activeTab = document.querySelector(".nav-link.active");
            const type =
              activeTab && activeTab.id.includes("wishlist")
                ? "wishlist"
                : "tested";
            this.openAddModal(type);
          } else {
            this.showToast(
              "🔒 Connectez-vous avec GitHub pour modifier",
              "warning"
            );
          }
        };
      }

      // Bouton configuration GitHub
      const githubConfigBtn = document.getElementById("github-config");
      if (githubConfigBtn) {
        githubConfigBtn.onclick = () => this.openGitHubConfig();
      }

      // Onglet carte
      const mapTab = document.getElementById("map-tab");
      if (mapTab) {
        mapTab.addEventListener("shown.bs.tab", () => {
          this.initMap();
        });
      }

      // Bouton géolocalisation dans la carte
const geolocateBtn = document.getElementById("geolocate-btn");
if (geolocateBtn) {
    geolocateBtn.onclick = () => this.activateGeolocation();
}

// Bouton "Restaurants près de moi" dans hero
const nearbyBtn = document.getElementById("nearby-restaurants-btn");
if (nearbyBtn) {
    nearbyBtn.onclick = () => {
        // Activer l'onglet carte
        document.getElementById('map-tab').click();
        // Attendre que la carte soit chargée puis activer la géolocalisation
        setTimeout(() => this.activateGeolocation(), 200);
    };
}

      // ✅ CORRECTION 2 : Événements pour les onglets (sans saveFiltersState)
    const tabs = document.querySelectorAll('#mainTabs .nav-link');
    tabs.forEach(tab => {
        tab.addEventListener('shown.bs.tab', () => {
            this.applyFilters();
        });
    });

    } catch (error) {
      console.warn("⚠️ Erreur setup event listeners:", error);
    }
  }

  /* ===== MISE À JOUR DU STATUT ===== */
  updateSyncStatus(customStatus = null) {
    window.UI.updateSyncStatus(
      document.getElementById('status-badge'),
      customStatus,
      this.githubAuth.isAuthenticated
    );
  }

  /* ===== RENDU ===== */
  render() {
    this.renderStats();
    // Regénérer les options de filtres (les listeners, eux, sont branchés une fois dans setupUI)
    this.populateFilterOptions();
    this.applyFilters();
  }

  renderStats() {
    document.getElementById("tested-count").textContent =
      this.data.tested.length;
    document.getElementById("wishlist-count").textContent =
      this.data.wishlist.length;

    if (this.data.tested.length > 0) {
      const avgRating =
        this.data.tested.reduce(
          (sum, r) => sum + this.calculateRating(r.ratings),
          0
        ) / this.data.tested.length;
      document.getElementById("avg-rating").textContent = avgRating.toFixed(1);
    } else {
      document.getElementById("avg-rating").textContent = "--";
    }
  }

  renderTested() {
    const container = document.getElementById("tested-grid");
    if (this.data.tested.length === 0) {
      container.innerHTML = this.createEmptyState("tested");
    } else {
      container.innerHTML = this.data.tested
        .map((r) => this.createTestedCard(r))
        .join("");
    }
  }

  renderWishlist() {
    const container = document.getElementById("wishlist-grid");
    if (this.data.wishlist.length === 0) {
      container.innerHTML = this.createEmptyState("wishlist");
    } else {
      container.innerHTML = this.data.wishlist
        .map((r) => this.createWishlistCard(r))
        .join("");
    }
  }

  /* ===== CRÉATION DES CARDS ===== */
  createTestedCard(restaurant) {
    const rating = this.calculateRating(restaurant.ratings, restaurant.winesNotTested);
    const photo = restaurant.photo || restaurant.photos?.[0]?.url ||
        "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=400&h=250&fit=crop";

    const editButtons = this.isEditMode ? `
        <button class="btn btn-outline-primary btn-action" data-action="edit">
            <i class="bi bi-pencil"></i> Modifier
        </button>
        <button class="btn btn-outline-danger btn-action" data-action="delete">
            <i class="bi bi-trash"></i> Supprimer
        </button>
    ` : "";

    // Générer la galerie photos
    const photoGallery = restaurant.photos && restaurant.photos.length > 0 ? `
        <div class="photo-gallery">
            ${restaurant.photos.map((photo, index) => `
                <button type="button" class="photo-item" data-action="open-photo" data-photo-index="${index}" aria-label="Voir photo ${index + 1}">
                    <img src="${escapeHtml(photo.url)}" alt="Photo ${index + 1}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src=window.FALLBACK_IMG">
                </button>
            `).join('')}
        </div>
    ` : `
        <div class="empty-gallery">
            <i class="bi bi-camera" aria-hidden="true"></i>
            <p class="mb-0">Aucune photo ajoutée</p>
        </div>
    `;

    return `
        <div class="col-md-6 mb-4" data-restaurant-id="${escapeHtml(restaurant.id)}">
            <div class="card restaurant-card h-100">
                <img src="${escapeHtml(photo)}" class="card-img-top" alt="${escapeHtml(restaurant.name)}"
                     ${restaurant.googleMapsUrl ? 'style="cursor: pointer;" data-action="open-maps" title="Cliquer pour ouvrir dans Google Maps"' : ''}
                     loading="lazy" decoding="async">
                <div class="card-body">
                    <div class="d-flex justify-content-between align-items-start mb-2">
                        <h3 class="card-title h5">${escapeHtml(restaurant.name)}</h3>
                        <span class="badge bg-primary">${escapeHtml(restaurant.type)}</span>
                    </div>
                    <p class="card-text text-muted">
                        <i class="bi bi-geo-alt" aria-hidden="true"></i> ${escapeHtml(restaurant.address || restaurant.location)}
                        <span class="ms-2">${escapeHtml(restaurant.priceRange || "€€")}</span>
                    </p>

                    ${photoGallery}

                    <div class="final-rating" id="final-rating-${escapeHtml(restaurant.id)}">
                        <div class="rating-simple">
                            <strong>${rating.toFixed(1)}/5</strong> ${this.generateStars(rating)}
                            <button class="btn btn-sm btn-outline-light ms-2" data-action="toggle-detail">
                                Détails
                            </button>
                        </div>
                        <div class="rating-detailed" style="display: none;">
                            <div class="final-rating-compact">
                                <div class="rating-item">
                                    <span class="icon" aria-hidden="true">🍽️</span>
                                    <span class="value">${restaurant.ratings.plats.toFixed(1)}</span>
                                </div>
                                ${restaurant.winesNotTested ?
                                    '<div class="rating-item"><span class="icon" aria-hidden="true">🍷</span><span class="value text-muted">N/A</span></div>' :
                                    `<div class="rating-item"><span class="icon" aria-hidden="true">🍷</span><span class="value">${restaurant.ratings.vins.toFixed(1)}</span></div>`
                                }
                                <div class="rating-item">
                                    <span class="icon" aria-hidden="true">😊</span>
                                    <span class="value">${restaurant.ratings.accueil.toFixed(1)}</span>
                                </div>
                                <div class="rating-item">
                                    <span class="icon" aria-hidden="true">🏛️</span>
                                    <span class="value">${restaurant.ratings.lieu.toFixed(1)}</span>
                                </div>
                            </div>
                            <button class="btn btn-sm btn-outline-light mt-2" data-action="toggle-detail">
                                Note
                            </button>
                        </div>
                    </div>

                    ${restaurant.comment ? `<blockquote class="blockquote-footer mt-3">"${escapeHtml(restaurant.comment)}"</blockquote>` : ""}

                    <div class="action-buttons">
                        ${editButtons}
                        ${restaurant.coordinates ? `
                        <button class="btn btn-outline-info btn-action" data-action="show-map">
                            <i class="bi bi-geo-alt" aria-hidden="true"></i> Carte
                        </button>
                        ` : ""}
                    </div>
                </div>
            </div>
        </div>
    `;
}

  createWishlistCard(restaurant) {
    const photo = restaurant.photo || restaurant.photos?.[0] ||
        "https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=400&h=250&fit=crop";

    const editButtons = this.isEditMode ? `
        <button class="btn btn-success btn-action" data-action="move">
            <i class="bi bi-arrow-right" aria-hidden="true"></i> Testé !
        </button>
        <button class="btn btn-outline-primary btn-action" data-action="edit">
            <i class="bi bi-pencil" aria-hidden="true"></i> Modifier
        </button>
        <button class="btn btn-outline-danger btn-action" data-action="delete">
            <i class="bi bi-trash" aria-hidden="true"></i> Supprimer
        </button>
    ` : `
        <button class="btn btn-outline-secondary btn-action" disabled>
            <i class="bi bi-lock" aria-hidden="true"></i> Mode lecture
        </button>
    `;

    // Conteneur cliquable si Google Maps URL disponible (délégation data-action)
    const cardClickableStart = restaurant.googleMapsUrl ?
        `<div class="card restaurant-card wishlist-card h-100" style="cursor: pointer;" data-action="open-maps" title="Cliquer pour ouvrir dans Google Maps">` :
        `<div class="card restaurant-card wishlist-card h-100">`;

    return `
        <div class="col-md-6 mb-4" data-restaurant-id="${escapeHtml(restaurant.id)}">
            ${cardClickableStart}
                <img src="${escapeHtml(photo)}" class="card-img-top" alt="${escapeHtml(restaurant.name)}" loading="lazy" decoding="async">
                <div class="card-body">
                    <div class="d-flex justify-content-between align-items-start mb-2">
                        <h3 class="card-title h5">${escapeHtml(restaurant.name)}</h3>
                        <span class="badge bg-success">${escapeHtml(restaurant.type)}</span>
                    </div>
                    <p class="card-text text-muted">
                        <i class="bi bi-geo-alt" aria-hidden="true"></i> ${escapeHtml(restaurant.address || restaurant.location)}
                        <span class="ms-2">${escapeHtml(restaurant.priceRange || "€€")}</span>
                    </p>

                    ${restaurant.reason ? `
                    <div class="alert alert-success">
                        <strong><span aria-hidden="true">💡</span> Pourquoi :</strong><br>
                        ${escapeHtml(restaurant.reason)}
                    </div>
                    ` : ""}

                    ${restaurant.comment ? `<p class="text-muted"><em>"${escapeHtml(restaurant.comment)}"</em></p>` : ""}

                    <div class="action-buttons">
                        ${editButtons}
                        ${restaurant.coordinates ? `
                        <button class="btn btn-outline-info btn-action" data-action="show-map">
                            <i class="bi bi-geo-alt" aria-hidden="true"></i> Carte
                        </button>
                        ` : ""}
                    </div>
                </div>
            </div>
        </div>
    `;
  }

  toggleRatingDetail(restaurantId) {
    const container = document.getElementById(`final-rating-${restaurantId}`);
    if (!container) return;

    const simple = container.querySelector('.rating-simple');
    const detailed = container.querySelector('.rating-detailed');

    if (simple.style.display === 'none') {
        simple.style.display = 'block';
        detailed.style.display = 'none';
    } else {
        simple.style.display = 'none';
        detailed.style.display = 'block';
    }
}

openLightbox(restaurantId, photoIndex) {
    // == volontaire : les IDs peuvent être string (BIGINT Postgres) ou number (Date.now())
    const restaurant = this.data.tested.find(r => r.id == restaurantId);
    if (!restaurant || !restaurant.photos || restaurant.photos.length === 0) return;

    this.currentPhotos = restaurant.photos;
    this.currentPhotoIndex = photoIndex;

    this.showPhotoInLightbox();

    const modal = new bootstrap.Modal(document.getElementById('photo-lightbox-modal'));
    modal.show();
}

showPhotoInLightbox() {
    const photo = this.currentPhotos[this.currentPhotoIndex];
    document.getElementById('lightbox-image').src = photo.url;
    document.getElementById('lightbox-comment').textContent = photo.comment || '';
}

previousPhoto() {
    this.currentPhotoIndex = (this.currentPhotoIndex - 1 + this.currentPhotos.length) % this.currentPhotos.length;
    this.showPhotoInLightbox();
}

nextPhoto() {
    this.currentPhotoIndex = (this.currentPhotoIndex + 1) % this.currentPhotos.length;
    this.showPhotoInLightbox();
}

  createEmptyState(type) {
    const isWishlist = type === "wishlist";
    const icon = isWishlist ? "heart" : "star";
    const title = isWishlist
      ? "Aucun restaurant en wishlist"
      : "Aucun restaurant testé";
    const text = isWishlist
      ? "Ajoutez des restaurants que vous aimeriez tester !"
      : "Commencez par ajouter vos premiers restaurants testés !";

    const button = this.isEditMode
      ? `
            <button class="btn btn-${
              isWishlist ? "success" : "primary"
            }" data-action="add">
                <i class="bi bi-plus-lg"></i> Ajouter
            </button>
        `
      : `
            <button class="btn btn-outline-secondary" data-action="github-config">
                <i class="bi bi-key"></i> Se connecter pour ajouter
            </button>
        `;

    return `
            <div class="col-12 text-center py-5">
                <i class="bi bi-${icon} fs-1 text-muted mb-3"></i>
                <h4>${title}</h4>
                <p class="text-muted">${text}</p>
                ${button}
            </div>
        `;
  }

  /* ===== MODAL D'AJOUT/MODIFICATION ===== */
  openAddModal(type) {
    if (!this.checkEditPermission()) return;


    const modal = new bootstrap.Modal(
      document.getElementById("restaurant-modal")
    );

    // Reset du formulaire
    document.getElementById("restaurant-form").reset();
    document.getElementById("restaurant-id").value = "";
    document.getElementById("restaurant-type").value = type;

    // Configuration selon le type
    document.getElementById("modal-title").textContent =
      type === "tested"
        ? "Ajouter un restaurant testé"
        : "Ajouter à la wishlist";

    // Afficher/masquer les sections
    document.getElementById("ratings-section").style.display =
      type === "tested" ? "block" : "none";
    document.getElementById("wishlist-section").style.display =
      type === "wishlist" ? "block" : "none";

    // Section photos visible seulement pour les restaurants testés
document.getElementById("photos-section").style.display =
    type === "tested" ? "block" : "none";

// Réinitialiser les photos
this.currentPhotos = [];
this.renderPhotoInputs();

    modal.show();

    // Options d'autocomplete à jour (les listeners sont branchés une fois dans setupUI)
    this.updateCuisineDropdown();
  }

  addPhotoInput() {
    if (this.currentPhotos.length >= 10) {
        this.showToast('❌ Maximum 10 photos par restaurant', 'warning');
        return;
    }

    const photo = { url: '', comment: '' };
    this.currentPhotos.push(photo);
    this.renderPhotoInputs();
}

removePhotoInput(index) {
    this.currentPhotos.splice(index, 1);
    this.renderPhotoInputs();
}

renderPhotoInputs() {
    const container = document.getElementById('photos-container');
    if (!container) return;

    container.innerHTML = this.currentPhotos.map((photo, index) => `
        <div class="photo-input-group" data-photo-index="${index}">
            <div class="row align-items-center">
                <div class="col-md-2">
                    ${photo.url ? `<img src="${escapeHtml(photo.url)}" class="photo-preview" onerror="this.onerror=null;this.src=window.FALLBACK_IMG">` :
                    `<div class="photo-preview d-flex align-items-center justify-content-center bg-light">
                        <i class="bi bi-image text-muted" aria-hidden="true"></i>
                    </div>`}
                </div>
                <div class="col-md-10">
                    <div class="mb-2">
                        <label class="form-label small mb-1">URL de la photo</label>
                        <input type="url" class="form-control form-control-sm"
                               value="${escapeHtml(photo.url)}"
                               data-photo-field="url"
                               placeholder="https://i.imgur.com/...">
                    </div>
                    <div class="mb-2">
                        <label class="form-label small mb-1">Commentaire (optionnel)</label>
                        <input type="text" class="form-control form-control-sm"
                               value="${escapeHtml(photo.comment)}"
                               data-photo-field="comment"
                               placeholder="Description de la photo">
                    </div>
                    <button type="button" class="btn btn-sm btn-outline-danger" data-action="remove-photo">
                        <i class="bi bi-trash"></i> Supprimer
                    </button>
                </div>
            </div>
        </div>
    `).join('');
}

updatePhotoUrl(index, url) {
    this.currentPhotos[index].url = url;
    this.renderPhotoInputs();
}

updatePhotoComment(index, comment) {
    this.currentPhotos[index].comment = comment;
}

  async saveRestaurant() {
    // Vérifier les permissions d'édition
    if (!this.checkEditPermission()) return;

    const form = document.getElementById("restaurant-form");
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const id = document.getElementById("restaurant-id").value;
    const type = document.getElementById("restaurant-type").value;
    const isEdit = !!id;


    // Traiter le type de cuisine
    const cuisineInput = document.getElementById("restaurant-cuisine").value;
    const cuisineType = this.addNewCuisineType(cuisineInput);

    // Géocoder l'adresse automatiquement
const address = document.getElementById("restaurant-address").value;
let coordinates = null;

if (address && address.trim() !== '') {
  this.showToast("📍 Recherche des coordonnées...", "info");
  coordinates = await this.geocodeAddress(address);
  
  if (coordinates) {
    this.showToast("✅ Coordonnées GPS trouvées !", "success");
  }
}

    // CORRECTION : Générer un ID valide
    let restaurantId;
    if (isEdit && id && id.trim() !== "") {
      restaurantId = parseInt(id);
    } else {
      restaurantId = Date.now();
    }

    // Vérifier que l'ID est valide
    if (!restaurantId || isNaN(restaurantId)) {
      console.error("❌ Invalid ID generated:", restaurantId);
      this.showToast("❌ Erreur génération ID", "danger");
      return;
    }

    const restaurantData = {
  id: restaurantId,
  name: document.getElementById("restaurant-name").value,
  type: cuisineType,
  location: document.getElementById("restaurant-location").value,
  address: document.getElementById("restaurant-address").value,
  coordinates: coordinates,
  priceRange: document.getElementById("restaurant-price").value,
  photo: document.getElementById("restaurant-photo").value,
  googleMapsUrl: document.getElementById("restaurant-google-maps").value,
  comment: document.getElementById("restaurant-comment").value,
  photos: type === "tested" ? this.currentPhotos.filter(p => p.url) : [],
  dateAdded: isEdit
    ? this.data[type].find((r) => r.id == id)?.dateAdded ||
      new Date().toISOString().split("T")[0]
    : new Date().toISOString().split("T")[0],
};


    if (type === "tested") {
      const winesNotTested = document.getElementById('wines-not-tested')?.checked || false;
      
      restaurantData.ratings = {
        plats: parseFloat(document.getElementById("rating-plats").value),
        vins: winesNotTested ? null : parseFloat(document.getElementById("rating-vins").value),
        accueil: parseFloat(document.getElementById("rating-accueil").value),
        lieu: parseFloat(document.getElementById("rating-lieu").value),
      };
      restaurantData.winesNotTested = winesNotTested;
      restaurantData.dateVisited = restaurantData.dateAdded;
    } else {
      restaurantData.reason =
        document.getElementById("restaurant-reason").value;
    }

    // Ajouter/modifier dans les données
    if (isEdit) {
      const index = this.data[type].findIndex((r) => r.id == id);
      if (index !== -1) {
        this.data[type][index] = restaurantData;
      } else {
        console.warn("⚠️ Restaurant à modifier non trouvé, ajout en nouveau");
        this.data[type].push(restaurantData);
      }
    } else {
      this.data[type].push(restaurantData);
    }

    // Fermer le modal et re-render immédiatement
    bootstrap.Modal.getInstance(
      document.getElementById("restaurant-modal")
    ).hide();
    this.render();

    // Notification instantanée
    this.showToast(
      isEdit ? "✅ Restaurant modifié !" : "✅ Restaurant ajouté !",
      "success"
    );

    // Sauvegarde automatique en arrière-plan
    try {
      await this.autoSave();
    } catch (error) {
      console.error("❌ Erreur sauvegarde:", error);
      this.showToast(
        "⚠️ Erreur sauvegarde, modification locale seulement",
        "warning"
      );
    }
  }

  editRestaurant(id, type) {
    if (!this.checkEditPermission()) return;


    const restaurant = this.data[type].find((r) => r.id == id); // Utiliser == pour éviter les problèmes de type
    if (!restaurant) {
      console.error("❌ Restaurant non trouvé:", id);
      this.showToast("❌ Restaurant non trouvé", "danger");
      return;
    }


    // Remplir le formulaire
    document.getElementById("restaurant-id").value = id;
    document.getElementById("restaurant-type").value = type;
    document.getElementById("restaurant-name").value = restaurant.name;
    document.getElementById("restaurant-cuisine").value = restaurant.type;
    document.getElementById("restaurant-location").value = restaurant.location;
    document.getElementById("restaurant-address").value =
      restaurant.address || "";
    document.getElementById("restaurant-price").value =
      restaurant.priceRange || "€€";
    document.getElementById("restaurant-photo").value = restaurant.photo || "";
    document.getElementById("restaurant-google-maps").value = restaurant.googleMapsUrl || "";
    document.getElementById("restaurant-comment").value =
      restaurant.comment || "";

    if (type === "tested") {
      const ratings = restaurant.ratings || {
        plats: 5,
        vins: 5,
        accueil: 5,
        lieu: 5,
      };
      const winesNotTested = restaurant.winesNotTested || false;
      
      document.getElementById("rating-plats").value = ratings.plats;
      document.getElementById("rating-vins").value = ratings.vins || 5;
      document.getElementById("rating-accueil").value = ratings.accueil;
      document.getElementById("rating-lieu").value = ratings.lieu;

      // Restaurer l'état de la checkbox
      const checkbox = document.getElementById('wines-not-tested');
      if (checkbox) {
          checkbox.checked = winesNotTested;
          // Trigger l'event pour désactiver le slider si nécessaire
          checkbox.dispatchEvent(new Event('change'));
      }
      
      // Charger les photos
      this.currentPhotos = restaurant.photos || [];
      this.renderPhotoInputs();

      // Mettre à jour les affichages des sliders (vins peut être null : "non testés")
      document.getElementById("plats-value").textContent =
        ratings.plats.toFixed(1);
      if (!winesNotTested && ratings.vins != null) {
        document.getElementById("vins-value").textContent =
          ratings.vins.toFixed(1);
      }
      document.getElementById("accueil-value").textContent =
        ratings.accueil.toFixed(1);
      document.getElementById("lieu-value").textContent =
        ratings.lieu.toFixed(1);
    } else {
      document.getElementById("restaurant-reason").value =
        restaurant.reason || "";
    }

    // Ouvrir le modal
    document.getElementById(
      "modal-title"
    ).textContent = `Modifier ${restaurant.name}`;
    document.getElementById("ratings-section").style.display =
      type === "tested" ? "block" : "none";
    document.getElementById("wishlist-section").style.display =
      type === "wishlist" ? "block" : "none";
    document.getElementById("photos-section").style.display =
      type === "tested" ? "block" : "none";  

    const modal = new bootstrap.Modal(
      document.getElementById("restaurant-modal")
    );
    modal.show();

    // Options d'autocomplete à jour (les listeners sont branchés une fois dans setupUI)
    this.updateCuisineDropdown();
  }

  async deleteRestaurant(id, type) {
    if (!this.checkEditPermission()) return;
    
    
    const restaurant = this.data[type].find(r => r.id == id);
    if (!restaurant) {
        console.error('❌ Restaurant non trouvé:', id);
        this.showToast('❌ Restaurant non trouvé', 'danger');
        return;
    }
    
    // Ouvrir le modal de confirmation au lieu du popup navigateur
    this.openDeleteConfirmModal(restaurant, type);
}

  moveToTested(id) {
    if (!this.checkEditPermission()) return;

    // == volontaire : IDs string (BIGINT Postgres) ou number (Date.now())
    const restaurant = this.data.wishlist.find((r) => r.id == id);
    if (!restaurant) return;

    // Ouvrir le modal de transfert
    this.openTransferModal(restaurant);
  }

  openTransferModal(restaurant) {
    // Créer le modal s'il n'existe pas
    let modal = document.getElementById("transfer-modal");
    if (!modal) {
      modal = this.createTransferModal();
      document.body.appendChild(modal);
    }

    // Remplir les données
    document.getElementById("transfer-restaurant-name").textContent =
      restaurant.name;
    document.getElementById("transfer-restaurant-id").value = restaurant.id;

    // Reset des sliders
    ["plats", "vins", "accueil", "lieu"].forEach((type) => {
      const slider = document.getElementById(`transfer-rating-${type}`);
      const display = document.getElementById(`transfer-${type}-value`);
      if (slider && display) {
        slider.value = 5;
        display.textContent = "5.0";
      }
    });

    document.getElementById("transfer-comment").value = "";

    // Afficher le modal
    const bsModal = new bootstrap.Modal(modal);
    bsModal.show();
  }

  createTransferModal() {
    const modal = document.createElement("div");
    modal.className = "modal fade";
    modal.id = "transfer-modal";
    modal.innerHTML = `
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">🌟 Transférer vers "Testés"</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
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
      ["plats", "vins", "accueil", "lieu"].forEach((type) => {
        const slider = document.getElementById(`transfer-rating-${type}`);
        const display = document.getElementById(`transfer-${type}-value`);

        if (slider && display) {
          slider.addEventListener("input", () => {
            display.textContent = parseFloat(slider.value).toFixed(1);
          });
        }
      });
    }, 100);

    return modal;
  }

  async confirmTransfer() {
    const id = document.getElementById("transfer-restaurant-id").value;
    // == volontaire : IDs string (BIGINT Postgres) ou number (Date.now())
    const restaurant = this.data.wishlist.find((r) => r.id == id);
    if (!restaurant) return;

    // Récupérer les notes
    const ratings = {
      plats: parseFloat(document.getElementById("transfer-rating-plats").value),
      vins: parseFloat(document.getElementById("transfer-rating-vins").value),
      accueil: parseFloat(
        document.getElementById("transfer-rating-accueil").value
      ),
      lieu: parseFloat(document.getElementById("transfer-rating-lieu").value),
    };

    const comment = document.getElementById("transfer-comment").value;

    // Créer l'entrée testée
    const testedRestaurant = {
      ...restaurant,
      ratings: ratings,
      dateVisited: new Date().toISOString().split("T")[0],
      comment: comment || restaurant.comment,
    };
    delete testedRestaurant.reason;

    // Déplacer immédiatement
    this.data.tested.push(testedRestaurant);
    this.data.wishlist = this.data.wishlist.filter((r) => r.id != id);

    // Fermer le modal et mettre à jour l'affichage
    bootstrap.Modal.getInstance(
      document.getElementById("transfer-modal")
    ).hide();

    // Activer l'onglet testés
    document.getElementById("tested-tab").click();
    this.render();

    this.showToast('✅ Restaurant déplacé vers "Testés" !', "success");

    // Sauvegarde automatique en arrière-plan
    await this.autoSave();
  }

  createDeleteConfirmModal() {
    const modal = document.createElement('div');
    modal.className = 'modal fade';
    modal.id = 'delete-confirm-modal';
    modal.innerHTML = `
        <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content">
                <div class="modal-header bg-danger text-white">
                    <h5 class="modal-title">
                        <i class="bi bi-exclamation-triangle-fill"></i> Confirmer la suppression
                    </h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body text-center">
                    <i class="bi bi-trash3 text-danger" style="font-size: 3rem;"></i>
                    <h4 class="mt-3 mb-3">Êtes-vous sûr ?</h4>
                    <p class="mb-3">
                        Vous êtes sur le point de supprimer le restaurant :<br>
                        <strong id="delete-restaurant-name" class="text-danger fs-5"></strong>
                    </p>
                    <div class="alert alert-warning">
                        <i class="bi bi-info-circle"></i>
                        <strong>Cette action est irréversible.</strong><br>
                        Le restaurant sera définitivement supprimé de votre carnet.
                    </div>
                    <input type="hidden" id="delete-restaurant-id">
                    <input type="hidden" id="delete-restaurant-type">
                </div>
                <div class="modal-footer justify-content-center">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                        <i class="bi bi-x-lg"></i> Annuler
                    </button>
                    <button type="button" class="btn btn-danger" onclick="app.confirmDelete()">
                        <i class="bi bi-trash3"></i> Oui, supprimer
                    </button>
                </div>
            </div>
        </div>
    `;
    return modal;
}

openDeleteConfirmModal(restaurant, type) {
    // Créer le modal s'il n'existe pas
    let modal = document.getElementById('delete-confirm-modal');
    if (!modal) {
        modal = this.createDeleteConfirmModal();
        document.body.appendChild(modal);
    }
    
    // Remplir les données
    document.getElementById('delete-restaurant-name').textContent = restaurant.name;
    document.getElementById('delete-restaurant-id').value = restaurant.id;
    document.getElementById('delete-restaurant-type').value = type;
    
    // Afficher le modal
    const bsModal = new bootstrap.Modal(modal);
    bsModal.show();
}

async confirmDelete() {
    const id = parseInt(document.getElementById('delete-restaurant-id').value);
    const type = document.getElementById('delete-restaurant-type').value;
    
    
    const restaurant = this.data[type].find(r => r.id == id);
    if (!restaurant) {
        this.showToast('❌ Restaurant non trouvé', 'danger');
        return;
    }
    
    // Fermer le modal de confirmation
    const modal = bootstrap.Modal.getInstance(document.getElementById('delete-confirm-modal'));
    if (modal) modal.hide();
    
    // Supprimer immédiatement de la liste locale
    this.data[type] = this.data[type].filter(r => r.id != id);
    this.render();
    this.showToast(`✅ "${restaurant.name}" supprimé !`, 'success');
    
    // Sauvegarde automatique en arrière-plan
    try {
        await this.autoSave();
    } catch (error) {
        console.error('❌ Erreur sauvegarde suppression:', error);
        // Recharger les données en cas d'erreur
        await this.loadData();
        this.render();
        this.showToast('❌ Erreur suppression, données rechargées', 'warning');
    }
}

  /* ===== GESTION CUISINE TYPES ===== */
  setupCuisineAutocomplete() {
    try {
      const cuisineInput = document.getElementById("restaurant-cuisine");
      const cuisineDropdown = document.getElementById("cuisine-dropdown");

      if (!cuisineInput || !cuisineDropdown) {
        return;
      }


      // Sélection d'une option par délégation (les items sont regénérés en innerHTML)
      cuisineDropdown.addEventListener("click", (e) => {
        const item = e.target.closest(".dropdown-item");
        if (item && item.dataset.value != null) this.selectCuisine(item.dataset.value);
      });

      // Input event
      cuisineInput.addEventListener("input", (e) => {
        this.filterCuisineOptions(e.target.value);
      });

      // Focus event
      cuisineInput.addEventListener("focus", () => {
        this.showCuisineDropdown();
      });

      // Click outside
      document.addEventListener("click", (e) => {
        if (
          !cuisineInput.contains(e.target) &&
          !cuisineDropdown.contains(e.target)
        ) {
          cuisineDropdown.style.display = "none";
        }
      });
    } catch (error) {
      console.warn("⚠️ Erreur setup cuisine autocomplete:", error);
    }
  }

  updateCuisineDropdown() {
    try {
      const dropdown = document.getElementById("cuisine-dropdown");
      if (!dropdown) {
        return;
      }

      // Obtenir tous les types de cuisine uniques
      const allCuisines = new Set();

      // Ajouter les types par défaut
      this.data.cuisineTypes.forEach((type) => allCuisines.add(type.value));

      // Ajouter les types des restaurants existants
      [...this.data.tested, ...this.data.wishlist].forEach((restaurant) => {
        allCuisines.add(restaurant.type);
      });

      // Générer les options (sélection par délégation — voir setupCuisineAutocomplete)
      const sortedCuisines = Array.from(allCuisines).sort();
      dropdown.innerHTML = sortedCuisines
        .map((cuisine) => {
          const cuisineData = this.data.cuisineTypes.find(
            (c) => c.value === cuisine
          );
          const emoji = cuisineData ? cuisineData.emoji : "🍽️";
          return `<div class="dropdown-item" role="button" data-value="${escapeHtml(cuisine)}">${escapeHtml(emoji)} ${escapeHtml(cuisine)}</div>`;
        })
        .join("");

    } catch (error) {
      console.warn("⚠️ Erreur update cuisine dropdown:", error);
    }
  }

  filterCuisineOptions(searchValue) {
    const dropdown = document.getElementById("cuisine-dropdown");
    if (!dropdown) return;

    const items = dropdown.querySelectorAll(".dropdown-item");
    const search = searchValue.toLowerCase();

    items.forEach((item) => {
      const text = item.textContent.toLowerCase();
      item.style.display = text.includes(search) ? "block" : "none";
    });

    this.showCuisineDropdown();
  }

  showCuisineDropdown() {
    const dropdown = document.getElementById("cuisine-dropdown");
    if (dropdown) {
      dropdown.style.display = "block";
    }
  }

  selectCuisine(cuisine) {
    const cuisineInput = document.getElementById("restaurant-cuisine");
    const dropdown = document.getElementById("cuisine-dropdown");

    if (cuisineInput) {
      cuisineInput.value = cuisine;
    }

    if (dropdown) {
      dropdown.style.display = "none";
    }

    // Déclencher l'événement input pour valider le formulaire si nécessaire
    if (cuisineInput) {
      cuisineInput.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  addNewCuisineType(cuisineValue) {
    const normalizedValue = cuisineValue.toLowerCase().trim();

    // Vérifier si le type existe déjà
    const exists = this.data.cuisineTypes.some(
      (type) => type.value.toLowerCase() === normalizedValue
    );

    if (!exists && normalizedValue) {
      const newType = {
        value: normalizedValue,
        label: `🍽️ ${cuisineValue}`,
        emoji: "🍽️",
      };

      this.data.cuisineTypes.push(newType);
    }

    return normalizedValue;
  }

  /* ===== CARTE — délégué à MapManager (map.js) ===== */
  showOnMap(lat, lng) {
    document.getElementById('map-tab')?.click();
    this.initMap().then(() => {
      if (this.mapManager.map) this.mapManager.map.setView([lat, lng], 16);
    });
  }

  activateGeolocation() {
    this.mapManager.activateGeolocation(this.filteredData);
  }

  async initMap() {
    await this.mapManager.init(this.filteredData);
  }

  updateMapMarkers() {
    this.mapManager.updateMarkers(this.filteredData);
  }

  /* ===== UTILITAIRES ===== */
  calculateRating(ratings, winesNotTested = false) {
    // Logique pure partagée avec map.js — voir rating.js (testé par Vitest)
    return calculateRating(ratings, winesNotTested);
  }

  async geocodeAddress(address) {
    return window.Api.geocodeAddress(address);
  }

  generateStars(rating) { return window.UI.generateStars(rating); }

  showToast(message, type = 'info') { window.UI.showToast(message, type); }

  /* ===== NOUVELLES MÉTHODES POUR LES FILTRES ===== */

populateFilterOptions() {
    // Récupérer toutes les cuisines et localisations uniques
    const allCuisines = new Set();
    const allLocations = new Set();

    [...this.data.tested, ...this.data.wishlist].forEach(restaurant => {
        allCuisines.add(restaurant.type);
        allLocations.add(restaurant.location);
    });

    // Populer le dropdown cuisine (état coché restauré depuis this.filters)
    const cuisineMenu = document.getElementById('cuisine-dropdown-menu');
    if (cuisineMenu) {
        cuisineMenu.innerHTML = Array.from(allCuisines).sort().map(cuisine => {
            const cuisineData = this.data.cuisineTypes.find(c => c.value === cuisine);
            const emoji = cuisineData ? cuisineData.emoji : '🍽️';
            const active = this.filters.cuisines.includes(cuisine);
            return `
                <li>
                    <a class="dropdown-item${active ? ' active' : ''}" href="#" data-value="${escapeHtml(cuisine)}">
                        <input type="checkbox" class="form-check-input me-2" value="${escapeHtml(cuisine)}"${active ? ' checked' : ''}>
                        <span>${escapeHtml(emoji)} ${escapeHtml(cuisine)}</span>
                    </a>
                </li>
            `;
        }).join('');
    }

    // Populer le dropdown localisation (état coché restauré depuis this.filters)
    const locationMenu = document.getElementById('location-dropdown-menu');
    if (locationMenu) {
        locationMenu.innerHTML = Array.from(allLocations).sort().map(location => {
            const active = this.filters.locations.includes(location);
            return `
                <li>
                    <a class="dropdown-item${active ? ' active' : ''}" href="#" data-value="${escapeHtml(location)}">
                        <input type="checkbox" class="form-check-input me-2" value="${escapeHtml(location)}"${active ? ' checked' : ''}>
                        <span>📍 ${escapeHtml(location)}</span>
                    </a>
                </li>
            `;
        }).join('');
    }
}

setupFilterEvents() {
    
    // Événements pour le dropdown cuisine
const cuisineMenu = document.getElementById('cuisine-dropdown-menu');
if (cuisineMenu) {
    cuisineMenu.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const item = e.target.closest('.dropdown-item');
        if (item) {
            const checkbox = item.querySelector('input[type="checkbox"]');
            const value = item.dataset.value;
            
            // Toggle SEULEMENT si on n'a pas cliqué directement sur la checkbox
            if (e.target !== checkbox) {
                checkbox.checked = !checkbox.checked;
            }
            
            item.classList.toggle('active', checkbox.checked);
            
            // Mettre à jour les filtres
            if (checkbox.checked) {
                this.filters.cuisines = window.Filters.addFilter(this.filters.cuisines, value);
            } else {
                this.filters.cuisines = window.Filters.removeFilter(this.filters.cuisines, value);
            }
            
            this.updateCuisineBadges();
            this.updateDropdownButtonText('cuisineDropdownBtn', this.filters.cuisines.length, 'Cuisine');
            this.applyFilters();
            
        }
    });
} else {
        console.error('❌ cuisine-dropdown-menu non trouvé');
    }
    
    // Événements pour le dropdown localisation
const locationMenu = document.getElementById('location-dropdown-menu');
if (locationMenu) {
    locationMenu.addEventListener('click', (e) => {
        // Empêcher la propagation ET le comportement par défaut
        e.preventDefault();
        e.stopPropagation();
        
        const item = e.target.closest('.dropdown-item');
        if (item) {
            const checkbox = item.querySelector('input[type="checkbox"]');
            const value = item.dataset.value;
            
            // Toggle SEULEMENT si on n'a pas cliqué directement sur la checkbox
            if (e.target !== checkbox) {
                checkbox.checked = !checkbox.checked;
            }
            
            item.classList.toggle('active', checkbox.checked);
            
            // Mettre à jour les filtres
            if (checkbox.checked) {
                this.filters.locations = window.Filters.addFilter(this.filters.locations, value);
            } else {
                this.filters.locations = window.Filters.removeFilter(this.filters.locations, value);
            }
            
            this.updateLocationBadges();
            this.updateDropdownButtonText('locationDropdownBtn', this.filters.locations.length, 'Lieu');
            this.applyFilters();
            
        }
    });
} else {
        console.error('❌ location-dropdown-menu non trouvé');
    }
    
    // Événements pour les checkboxes de prix (inchangé)
    document.querySelectorAll('.price-checkbox').forEach(checkbox => {
        checkbox.addEventListener('click', (e) => {
            const priceValue = checkbox.dataset.price;
            const input = checkbox.querySelector('input');
            
            input.checked = !input.checked;
            checkbox.classList.toggle('active', input.checked);
            
            if (input.checked) {
                this.filters.prices = window.Filters.addFilter(this.filters.prices, priceValue);
            } else {
                this.filters.prices = window.Filters.removeFilter(this.filters.prices, priceValue);
            }
            
            this.applyFilters();
            
        });
    });
    
    // Recherche par nom
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            this.filters.query = e.target.value;
            this.applyFilters();
        });
    }

    // Bouton effacer filtres
    const clearBtn = document.getElementById('clear-filters-btn');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            this.clearAllFilters();
        });
    }
}

updateDropdownButtonText(btnId, count, label) {
    const btn = document.getElementById(btnId);
    if (btn) {
        if (count === 0) {
            btn.textContent = 'Choisir...';
            btn.classList.remove('btn-primary');
            btn.classList.add('btn-outline-secondary');
        } else {
            btn.textContent = `${count} ${label}${count > 1 ? 's' : ''}`;
            btn.classList.remove('btn-outline-secondary');
            btn.classList.add('btn-primary');
        }
    }
}

applyFilters() {
    const currentTab = this.getCurrentTab();

    // Déléguer le filtrage pur à filters.js
    ['tested', 'wishlist'].forEach(type => {
        this.filteredData[type] = window.Filters.applyFilters(this.data[type], this.filters);
    });
    
    // Mettre à jour l'affichage de l'onglet actuel
    this.renderFiltered(currentTab);
    this.updateResultsCount(this.filteredData[currentTab].length);
    this.updateClearButton();
    if (this.mapManager.map) {
        this.updateMapMarkers();
    }
}

renderFiltered(type) {
    const container = document.getElementById(type === 'tested' ? 'tested-grid' : 'wishlist-grid');
    const data = this.filteredData[type];

    if (data.length === 0) {
        container.innerHTML = this.createFilteredEmptyState(type);
        return;
    }

    // Rendu incrémental : ne remplacer que les cards qui ont changé
    const createCard = r => type === 'tested' ? this.createTestedCard(r) : this.createWishlistCard(r);

    // Index des nodes existants par restaurant ID
    const existingNodes = {};
    container.querySelectorAll('[data-restaurant-id]').forEach(node => {
        existingNodes[node.dataset.restaurantId] = node;
    });

    const newIds = new Set(data.map(r => String(r.id)));

    // Supprimer les nodes qui ne sont plus dans les données filtrées
    Object.keys(existingNodes).forEach(id => {
        if (!newIds.has(id)) existingNodes[id].remove();
    });

    // Si aucun node existant ne porte data-restaurant-id (premier rendu ou skeleton), régénérer entier
    if (Object.keys(existingNodes).length === 0) {
        const fragment = document.createDocumentFragment();
        data.forEach(r => {
            const tmp = document.createElement('div');
            tmp.innerHTML = createCard(r);
            const node = tmp.firstElementChild;
            node.dataset.restaurantId = r.id;
            fragment.appendChild(node);
        });
        container.innerHTML = '';
        container.appendChild(fragment);
        return;
    }

    // Mise à jour / insertion dans l'ordre
    data.forEach((r, i) => {
        const id = String(r.id);
        const tmp = document.createElement('div');
        tmp.innerHTML = createCard(r);
        const newNode = tmp.firstElementChild;
        newNode.dataset.restaurantId = r.id;

        const currentAtPos = container.children[i];
        if (!currentAtPos) {
            container.appendChild(newNode);
        } else if (currentAtPos.dataset.restaurantId !== id) {
            container.insertBefore(newNode, currentAtPos);
        }
        // Si même ID à la même position, on garde l'existant (pas de re-render)
    });
}

createFilteredEmptyState(type) {
    const hasActiveFilters = this.hasActiveFilters();
    const isWishlist = type === 'wishlist';
    
    if (hasActiveFilters) {
        return `
            <div class="col-12 text-center py-5">
                <i class="bi bi-search fs-1 text-muted mb-3"></i>
                <h4>Aucun restaurant trouvé</h4>
                <p class="text-muted">Aucun restaurant ne correspond aux filtres sélectionnés.</p>
                <button class="btn btn-outline-primary" data-action="clear-filters">
                    <i class="bi bi-x-circle"></i> Effacer les filtres
                </button>
            </div>
        `;
    } else {
        return this.createEmptyState(type);
    }
}

updateCuisineBadges() {
    const container = document.getElementById('cuisine-badges');
    if (!container) return;

    container.innerHTML = this.filters.cuisines.map(cuisine => {
        const cuisineData = this.data.cuisineTypes.find(c => c.value === cuisine);
        const emoji = cuisineData ? escapeHtml(cuisineData.emoji) : '🍽️';

        return `
            <button type="button" class="cuisine-badge" data-value="${escapeHtml(cuisine)}" aria-label="Retirer le filtre ${escapeHtml(cuisine)}">
                ${emoji} ${escapeHtml(cuisine)}
                <span aria-hidden="true">×</span>
            </button>
        `;
    }).join('');
}

updateLocationBadges() {
    const container = document.getElementById('location-badges');
    if (!container) return;

    container.innerHTML = this.filters.locations.map(location => `
        <button type="button" class="cuisine-badge" data-value="${escapeHtml(location)}" aria-label="Retirer le filtre ${escapeHtml(location)}">
            <span aria-hidden="true">📍</span> ${escapeHtml(location)}
            <span aria-hidden="true">×</span>
        </button>
    `).join('');
}

removeCuisineFilter(cuisine) {
    this.filters.cuisines = window.Filters.removeFilter(this.filters.cuisines, cuisine);
    
    // Décocher dans le dropdown
    const cuisineMenu = document.getElementById("cuisine-dropdown-menu");
    if (cuisineMenu) {
        cuisineMenu.querySelectorAll(".dropdown-item").forEach(item => {
            if (item.dataset.value === cuisine) {
                const checkbox = item.querySelector("input[type='checkbox']");
                if (checkbox) {
                    checkbox.checked = false;
                }
                item.classList.remove("active");
            }
        });
    }
    
    this.updateCuisineBadges();
    this.updateDropdownButtonText("cuisineDropdownBtn", this.filters.cuisines.length, "Cuisine");
    this.applyFilters();
}

removeLocationFilter(location) {
    this.filters.locations = window.Filters.removeFilter(this.filters.locations, location);
    
    // Décocher dans le dropdown
    const locationMenu = document.getElementById("location-dropdown-menu");
    if (locationMenu) {
        locationMenu.querySelectorAll(".dropdown-item").forEach(item => {
            if (item.dataset.value === location) {
                const checkbox = item.querySelector("input[type='checkbox']");
                if (checkbox) {
                    checkbox.checked = false;
                }
                item.classList.remove("active");
            }
        });
    }
    
    this.updateLocationBadges();
    this.updateDropdownButtonText("locationDropdownBtn", this.filters.locations.length, "Lieu");
    this.applyFilters();
}

getCurrentTab() {
    const activeTab = document.querySelector('.nav-link.active');
    return (activeTab && activeTab.id.includes('wishlist')) ? 'wishlist' : 'tested';
}

hasActiveFilters() {
    return window.Filters.hasActiveFilters(this.filters);
}

updateResultsCount(count) {
    const counter = document.getElementById('results-count');
    if (counter) {
        counter.textContent = `${count} restaurant${count !== 1 ? 's' : ''}`;
    }
    this.updateTabBadges();
}

updateTabBadges() {
    const hasFilters = this.hasActiveFilters();
    const testedCount = this.filteredData.tested.length;
    const wishlistCount = this.filteredData.wishlist.length;

    this.setTabBadge('tested-tab', testedCount, hasFilters);
    this.setTabBadge('wishlist-tab', wishlistCount, hasFilters);
}

setTabBadge(tabId, count, hasFilters) {
    const tab = document.getElementById(tabId);
    if (!tab) return;

    let badge = tab.querySelector('.tab-filter-badge');
    if (hasFilters) {
        if (!badge) {
            badge = document.createElement('span');
            badge.className = 'tab-filter-badge badge bg-warning text-dark ms-1';
            tab.appendChild(badge);
        }
        badge.textContent = count;
        badge.setAttribute('aria-label', `${count} résultat${count !== 1 ? 's' : ''} avec filtres actifs`);
    } else if (badge) {
        badge.remove();
    }
}

updateClearButton() {
    const btn = document.getElementById('clear-filters-btn');
    if (btn) {
        const hasFilters = this.hasActiveFilters();
        btn.disabled = !hasFilters;
        btn.style.opacity = hasFilters ? '1' : '0.5';
    }
}

clearAllFilters() {
    // Reset des filtres
    this.filters = {
        cuisines: [],
        prices: [],
        locations: [],
        query: ''
    };

    // Reset du champ de recherche
    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.value = '';


    // Reset des dropdowns cuisine
    const cuisineMenu = document.getElementById('cuisine-dropdown-menu');
    if (cuisineMenu) {
        cuisineMenu.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
            checkbox.checked = false;
        });
        cuisineMenu.querySelectorAll('.dropdown-item').forEach(item => {
            item.classList.remove('active');
        });
    }
    this.updateDropdownButtonText('cuisineDropdownBtn', 0, 'Cuisine');
    
    // Reset des dropdowns localisation
    const locationMenu = document.getElementById('location-dropdown-menu');
    if (locationMenu) {
        locationMenu.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
            checkbox.checked = false;
        });
        locationMenu.querySelectorAll('.dropdown-item').forEach(item => {
            item.classList.remove('active');
        });
    }
    this.updateDropdownButtonText('locationDropdownBtn', 0, 'Lieu');
    
    // Reset des checkboxes prix
    document.querySelectorAll('.price-checkbox').forEach(checkbox => {
        checkbox.classList.remove('active');
        checkbox.querySelector('input').checked = false;
    });
    
    // Effacer les badges
    this.updateCuisineBadges();
    this.updateLocationBadges();
    
    // Réappliquer les filtres (vides)
    this.applyFilters();
    
}

// ✅ CORRECTION 4 : Les méthodes loadFiltersState et restoreFiltersUI ont été supprimées

  /* ===== DONNÉES PAR DÉFAUT ===== */
  parseCuisineTypes(cuisineTypesData) {
    const defaults = this.getDefaultCuisineTypes();
    if (!cuisineTypesData || typeof cuisineTypesData !== "object") {
      return defaults;
    }

    const parsed = [];
    for (const [key, value] of Object.entries(cuisineTypesData)) {
      parsed.push({
        value: key,
        label: `${value.emoji || "🍽️"} ${key}`,
        emoji: value.emoji || "🍽️",
      });
    }

    return parsed.length > 0 ? parsed : defaults;
  }

  generateCuisineTypesObject() {
    const obj = {};
    this.data.cuisineTypes.forEach((cuisine) => {
      obj[cuisine.value] = {
        color: "primary",
        emoji: cuisine.emoji,
      };
    });
    return obj;
  }

  getDefaultCuisineTypes() {
    return [
      { value: "français", label: "🥖 Français", emoji: "🥖" },
      { value: "italien", label: "🍕 Italien", emoji: "🍕" },
      { value: "asiatique", label: "🍜 Asiatique", emoji: "🍜" },
      { value: "japonais", label: "🍣 Japonais", emoji: "🍣" },
    ];
  }

}

/* ===== INITIALISATION ===== */
let app;

document.addEventListener("DOMContentLoaded", async () => {

  initTheme();

  app = new RestaurantApp();
  // Exposé pour les handlers inline (onclick="app.…") — script.js est un module,
  // ses déclarations ne sont plus globales par défaut.
  window.app = app;
  await app.init();

  // Sliders de notation : affichage temps réel des valeurs
  ["plats", "vins", "accueil", "lieu"].forEach((type) => {
    const slider = document.getElementById(`rating-${type}`);
    const display = document.getElementById(`${type}-value`);

    if (slider && display) {
      slider.addEventListener("input", () => {
        display.textContent = parseFloat(slider.value).toFixed(1);
      });
    }
  });

  // Checkbox "Vins non testés" : désactive le slider vins
  const winesNotTestedCheckbox = document.getElementById("wines-not-tested");
  const vinsSlider = document.getElementById("rating-vins");
  const vinsValue = document.getElementById("vins-value");

  if (winesNotTestedCheckbox && vinsSlider && vinsValue) {
    winesNotTestedCheckbox.addEventListener("change", function () {
      if (this.checked) {
        vinsSlider.disabled = true;
        vinsSlider.style.opacity = "0.3";
        vinsValue.textContent = "N/A";
      } else {
        vinsSlider.disabled = false;
        vinsSlider.style.opacity = "1";
        vinsValue.textContent = parseFloat(vinsSlider.value).toFixed(1);
      }
    });
  }

});

/* ===== FONCTIONS GLOBALES (utilisées par les onclick inline de index.html) ===== */
window.saveRestaurant = () => {
  if (app) app.saveRestaurant();
};