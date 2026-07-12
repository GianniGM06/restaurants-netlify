/* ===== MODULE CARDS — templates HTML des cards et états vides =====
   Fonctions pures (données -> chaîne HTML). Les interactions passent par
   data-action + délégation (voir setupCardActions dans script.js) :
   aucun onclick inline, aucune donnée utilisateur non échappée. */

import { escapeHtml, generateStars } from './ui.js';
import { calculateRating } from './rating.js';

const DEFAULT_TESTED_PHOTO = 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=400&h=250&fit=crop';
const DEFAULT_WISHLIST_PHOTO = 'https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=400&h=250&fit=crop';

export function createTestedCard(restaurant, isEditMode) {
  // Garde : un testé sans notes (possible via l'API) ne doit jamais casser le rendu
  const rating = restaurant.ratings
    ? calculateRating(restaurant.ratings, restaurant.winesNotTested)
    : null;
  const photo = restaurant.photo || restaurant.photos?.[0]?.url || DEFAULT_TESTED_PHOTO;

  const editButtons = isEditMode ? `
        <button class="btn btn-outline-primary btn-action" data-action="edit">
            <i class="bi bi-pencil"></i> Modifier
        </button>
        <button class="btn btn-outline-danger btn-action" data-action="delete">
            <i class="bi bi-trash"></i> Supprimer
        </button>
    ` : "";

  const photoGallery = restaurant.photos && restaurant.photos.length > 0 ? `
        <div class="photo-gallery">
            ${restaurant.photos.map((p, index) => `
                <button type="button" class="photo-item" data-action="open-photo" data-photo-index="${index}" aria-label="Voir photo ${index + 1}">
                    <img src="${escapeHtml(p.url)}" alt="Photo ${index + 1}" loading="lazy" decoding="async">
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

                    ${rating === null ? `
                    <div class="final-rating" id="final-rating-${escapeHtml(restaurant.id)}">
                        <div class="rating-simple"><strong>Non noté</strong></div>
                    </div>
                    ` : `
                    <div class="final-rating" id="final-rating-${escapeHtml(restaurant.id)}">
                        <div class="rating-simple">
                            <strong>${rating.toFixed(1)}/5</strong> ${generateStars(rating)}
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
                                ${restaurant.winesNotTested || restaurant.ratings.vins == null ?
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
                    `}

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

export function createWishlistCard(restaurant, isEditMode) {
  const photo = restaurant.photo || restaurant.photos?.[0]?.url || DEFAULT_WISHLIST_PHOTO;

  const editButtons = isEditMode ? `
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
                        <strong>Pourquoi :</strong><br>
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

export function createEmptyState(type, isEditMode) {
  const isWishlist = type === "wishlist";
  const icon = isWishlist ? "heart" : "star";
  const title = isWishlist
    ? "Aucun restaurant en wishlist"
    : "Aucun restaurant testé";
  const text = isWishlist
    ? "Ajoutez des restaurants que vous aimeriez tester !"
    : "Commencez par ajouter vos premiers restaurants testés !";

  const button = isEditMode
    ? `
            <button class="btn btn-${isWishlist ? "success" : "primary"}" data-action="add">
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

export function createFilteredEmptyState(type, hasActiveFilters, isEditMode) {
  if (!hasActiveFilters) return createEmptyState(type, isEditMode);
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
}

if (typeof window !== 'undefined') {
  window.Cards = { createTestedCard, createWishlistCard, createEmptyState, createFilteredEmptyState };
}
