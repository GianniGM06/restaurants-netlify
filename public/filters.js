/**
 * Logique pure des filtres et du tri — sans dépendance au DOM ni à la classe
 * RestaurantApp. Importé par script.js et par les tests Vitest.
 */

import { calculateRating } from './rating.js';
import { distanceKm } from './map.js';

/**
 * @typedef {{ cuisines: string[], prices: string[], locations: string[], query?: string, minRating?: number|null }} Filters
 * @typedef {{ name?: string, type: string, priceRange?: string, location: string }} Restaurant
 */

/**
 * Filtre un tableau de restaurants selon les critères actifs.
 * Retourne tous les restaurants si un critère est vide (pas de filtre actif).
 * `query` cherche dans le nom, le commentaire et l'adresse (insensible à la casse).
 * `minRating` exclut les non-notés (wishlist incluse) sous le seuil.
 *
 * @param {Restaurant[]} restaurants
 * @param {Filters} filters
 * @returns {Restaurant[]}
 */
export function applyFilters(restaurants, filters) {
  const query = (filters.query || '').trim().toLowerCase();
  const minRating = filters.minRating || null;

  return restaurants.filter(r => {
    const cuisineMatch = filters.cuisines.length === 0 ||
      filters.cuisines.includes(r.type);

    const priceMatch = filters.prices.length === 0 ||
      filters.prices.includes(r.priceRange || '€€');

    const locationMatch = filters.locations.length === 0 ||
      filters.locations.includes(r.location);

    const haystack = `${r.name || ''} ${r.comment || ''} ${r.address || ''}`.toLowerCase();
    const queryMatch = query === '' || haystack.includes(query);

    const ratingMatch = minRating === null ||
      (r.ratings && calculateRating(r.ratings, r.winesNotTested) >= minRating);

    return cuisineMatch && priceMatch && locationMatch && queryMatch && ratingMatch;
  });
}

/**
 * Ajoute une valeur au tableau si elle n'y est pas déjà.
 * Retourne un nouveau tableau (immuable).
 *
 * @param {string[]} list
 * @param {string} value
 * @returns {string[]}
 */
export function addFilter(list, value) {
  if (list.includes(value)) return list;
  return [...list, value];
}

/**
 * Retire une valeur du tableau.
 * Retourne un nouveau tableau (immuable).
 *
 * @param {string[]} list
 * @param {string} value
 * @returns {string[]}
 */
export function removeFilter(list, value) {
  return list.filter(v => v !== value);
}

/**
 * Retourne true si au moins un filtre est actif.
 *
 * @param {Filters} filters
 * @returns {boolean}
 */
export function hasActiveFilters(filters) {
  return filters.cuisines.length > 0 ||
    filters.prices.length > 0 ||
    filters.locations.length > 0 ||
    (filters.query || '').trim() !== '' ||
    (filters.minRating || null) !== null;
}

/**
 * Retourne un objet Filters vide.
 *
 * @returns {Filters}
 */
export function emptyFilters() {
  return { cuisines: [], prices: [], locations: [], query: '', minRating: null };
}

/**
 * Trie un tableau de restaurants (retourne un NOUVEAU tableau).
 *
 * Clés : 'recent' (date d'ajout décroissante), 'rating' (note décroissante,
 * les entrées sans notes — wishlist — passent en fin), 'name' (A→Z),
 * 'distance' (croissante depuis `position`, sans-coordonnées en fin ;
 * sans position fournie, retombe sur 'recent').
 *
 * @param {Restaurant[]} restaurants
 * @param {'recent'|'rating'|'name'|'distance'} sortKey
 * @param {{lat: number, lng: number}|null} [position]
 * @returns {Restaurant[]}
 */
export function sortRestaurants(restaurants, sortKey = 'recent', position = null) {
  const byDateDesc = (a, b) => {
    const da = Date.parse(a.dateAdded) || 0;
    const db = Date.parse(b.dateAdded) || 0;
    if (db !== da) return db - da;
    return (Number(b.id) || 0) - (Number(a.id) || 0); // ids Date.now() = ordre de création
  };

  const sorted = [...restaurants];
  switch (sortKey) {
    case 'rating':
      sorted.sort((a, b) => {
        const ra = a.ratings ? calculateRating(a.ratings, a.winesNotTested) : -1;
        const rb = b.ratings ? calculateRating(b.ratings, b.winesNotTested) : -1;
        if (rb !== ra) return rb - ra;
        return byDateDesc(a, b);
      });
      break;
    case 'name':
      sorted.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'fr', { sensitivity: 'base' }));
      break;
    case 'distance': {
      if (!position) {
        sorted.sort(byDateDesc);
        break;
      }
      const dist = (r) => r.coordinates
        ? distanceKm(position.lat, position.lng, r.coordinates.lat, r.coordinates.lng)
        : Infinity;
      sorted.sort((a, b) => {
        const da = dist(a);
        const db = dist(b);
        if (da !== db) return da - db;
        return byDateDesc(a, b);
      });
      break;
    }
    case 'recent':
    default:
      sorted.sort(byDateDesc);
      break;
  }
  return sorted;
}

// Exposition globale pour les environnements sans bundler (browser via <script>)
if (typeof window !== 'undefined') {
  window.Filters = { applyFilters, addFilter, removeFilter, hasActiveFilters, emptyFilters, sortRestaurants };
}
