/**
 * Logique pure des filtres — sans dépendance au DOM ni à la classe RestaurantApp.
 * Importé par script.js (via <script>) et par les tests Vitest (import ES module).
 */

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

// Exposition globale pour les environnements sans bundler (browser via <script>)
if (typeof window !== 'undefined') {
  window.Filters = { applyFilters, addFilter, removeFilter, hasActiveFilters, emptyFilters };
}
