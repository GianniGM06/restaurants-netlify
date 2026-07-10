import { describe, it, expect } from 'vitest';
import { calculateRating } from '../rating.js';

describe('calculateRating', () => {
  it('applique la formule complète avec les vins', () => {
    // (4×2 + 3×1.5 + 5×1.5 + 2×1) ÷ 6 = (8 + 4.5 + 7.5 + 2) ÷ 6 = 22/6
    expect(calculateRating({ plats: 4, vins: 3, accueil: 5, lieu: 2 })).toBeCloseTo(22 / 6);
  });

  it('retourne 5 quand toutes les notes sont à 5', () => {
    expect(calculateRating({ plats: 5, vins: 5, accueil: 5, lieu: 5 })).toBe(5);
  });

  it('retourne 1 quand toutes les notes sont à 1 (borne basse)', () => {
    expect(calculateRating({ plats: 1, vins: 1, accueil: 1, lieu: 1 })).toBe(1);
  });

  it('exclut les vins quand winesNotTested est vrai', () => {
    // (4×2 + 5×1.5 + 2×1) ÷ 4.5 = 17.5/4.5
    expect(calculateRating({ plats: 4, vins: 1, accueil: 5, lieu: 2 }, true)).toBeCloseTo(17.5 / 4.5);
  });

  it('exclut les vins quand vins est null (convention DB)', () => {
    expect(calculateRating({ plats: 4, vins: null, accueil: 5, lieu: 2 })).toBeCloseTo(17.5 / 4.5);
  });

  it('exclut les vins quand vins est undefined', () => {
    expect(calculateRating({ plats: 4, accueil: 5, lieu: 2 })).toBeCloseTo(17.5 / 4.5);
  });

  it('la note sans vins reste bornée entre 1 et 5', () => {
    expect(calculateRating({ plats: 5, vins: null, accueil: 5, lieu: 5 })).toBe(5);
    expect(calculateRating({ plats: 1, vins: null, accueil: 1, lieu: 1 })).toBe(1);
  });

  it('ne retourne jamais NaN pour des vins null (bug historique)', () => {
    expect(Number.isNaN(calculateRating({ plats: 4, vins: null, accueil: 4, lieu: 4 }))).toBe(false);
  });
});
