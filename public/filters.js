/**
 * Logique pure des filtres et du tri — sans dépendance au DOM ni à la classe
 * RestaurantApp. Importé par script.js et par les tests Vitest.
 */

import { calculateRating } from './rating.js';

/**
 * @typedef {{ cuisines: string[], prices: string[], locations: string[], query?: string }} Filters
 * @typedef {{ name?: string, type: string, priceRange?: string, location: string }} Restaurant
 */

/**
 * Filtre un tableau de restaurants selon les critères actifs.
 * Retourne tous les restaurants si un critère est vide (pas de filtre actif).
 * `query` est une recherche plein-texte insensible à la casse sur le nom.
 *
 * @param {Restaurant[]} restaurants
 * @param {Filters} filters
 * @returns {Restaurant[]}
 */
export function applyFilters(restaurants, filters) {
  const query = (filters.query || '').trim().toLowerCase();

  return restaurants.filter(r => {
    const cuisineMatch = filters.cuisines.length === 0 ||
      filters.cuisines.includes(r.type);

    const priceMatch = filters.prices.length === 0 ||
      filters.prices.includes(r.priceRange || '€€');

    const locationMatch = filters.locations.length === 0 ||
      filters.locations.includes(r.location);

    const queryMatch = query === '' ||
      (r.name || '').toLowerCase().includes(query);

    return cuisineMatch && priceMatch && locationMatch && queryMatch;
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
    (filters.query || '').trim() !== '';
}

/**
 * Retourne un objet Filters vide.
 *
 * @returns {Filters}
 */
export function emptyFilters() {
  return { cuisines: [], prices: [], locations: [], query: '' };
}

/**
 * Trie un tableau de restaurants (retourne un NOUVEAU tableau).
 *
 * Clés : 'recent' (date d'ajout décroissante), 'rating' (note décroissante,
 * les entrées sans notes — wishlist — passent en fin), 'name' (A→Z).
 *
 * @param {Restaurant[]} restaurants
 * @param {'recent'|'rating'|'name'} sortKey
 * @returns {Restaurant[]}
 */
export function sortRestaurants(restaurants, sortKey = 'recent') {
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
