/**
 * Calcul de la note finale d'un restaurant — logique pure, partagée par
 * script.js (cards, stats) et map.js (popups), testée par Vitest.
 *
 * Formule : (Plats × 2 + Vins × 1.5 + Accueil × 1.5 + Lieu × 1) ÷ 6
 * Si les vins n'ont pas été testés (flag ou vins null) :
 *           (Plats × 2 + Accueil × 1.5 + Lieu × 1) ÷ 4.5
 *
 * @param {{ plats: number, vins: number|null, accueil: number, lieu: number }} ratings
 * @param {boolean} [winesNotTested=false]
 * @returns {number} note sur 5
 */
export function calculateRating(ratings, winesNotTested = false) {
  if (winesNotTested || ratings.vins == null) {
    return (ratings.plats * 2 + ratings.accueil * 1.5 + ratings.lieu * 1) / 4.5;
  }
  return (
    (ratings.plats * 2 + ratings.vins * 1.5 + ratings.accueil * 1.5 + ratings.lieu * 1) / 6
  );
}

// Exposition globale pour compat navigateur sans bundler
if (typeof window !== 'undefined') {
  window.Rating = { calculateRating };
}
