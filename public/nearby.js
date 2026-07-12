/* ===== MODULE "AUTOUR DE MOI" — logique pure, testée par Vitest =====
   Classement des restaurants par distance à une position de référence
   (géolocalisation ou adresse saisie manuellement). */

import { distanceKm } from './map.js';

/**
 * Retourne les restaurants les plus proches d'une position, triés par
 * distance croissante. Les restaurants sans coordonnées sont exclus.
 *
 * @param {{lat: number, lng: number}|null} position
 * @param {Array} restaurants
 * @param {number} [limit=8]
 * @returns {Array<{restaurant: object, km: number}>}
 */
export function nearestRestaurants(position, restaurants, limit = 8) {
  if (!position || typeof position.lat !== 'number' || typeof position.lng !== 'number') {
    return [];
  }
  return restaurants
    .filter((r) =>
      r.coordinates &&
      typeof r.coordinates.lat === 'number' &&
      typeof r.coordinates.lng === 'number'
    )
    .map((r) => ({
      restaurant: r,
      km: distanceKm(position.lat, position.lng, r.coordinates.lat, r.coordinates.lng),
    }))
    .sort((a, b) => a.km - b.km)
    .slice(0, limit);
}

/** Nombre de restaurants absents du classement faute de coordonnées. */
export function countWithoutCoordinates(restaurants) {
  return restaurants.filter((r) => !r.coordinates).length;
}

if (typeof window !== 'undefined') {
  window.Nearby = { nearestRestaurants, countWithoutCoordinates };
}
