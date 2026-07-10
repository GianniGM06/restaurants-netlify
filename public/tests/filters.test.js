import { describe, it, expect } from 'vitest';
import {
  applyFilters,
  addFilter,
  removeFilter,
  hasActiveFilters,
  emptyFilters,
} from '../filters.js';

// ===== Données de test =====

const restaurants = [
  { id: 1, type: 'français',  priceRange: '€€',  location: '6ème' },
  { id: 2, type: 'italien',   priceRange: '€€€', location: '11ème' },
  { id: 3, type: 'japonais',  priceRange: '€€€', location: '6ème' },
  { id: 4, type: 'français',  priceRange: '€',   location: '18ème' },
  { id: 5, type: 'asiatique', priceRange: '€€',  location: '11ème' },
];

// ===== applyFilters =====

describe('applyFilters', () => {
  it('retourne tout si les filtres sont vides', () => {
    expect(applyFilters(restaurants, emptyFilters())).toHaveLength(5);
  });

  it('filtre par cuisine unique', () => {
    const result = applyFilters(restaurants, { cuisines: ['français'], prices: [], locations: [] });
    expect(result).toHaveLength(2);
    expect(result.every(r => r.type === 'français')).toBe(true);
  });

  it('filtre par plusieurs cuisines (OR)', () => {
    const result = applyFilters(restaurants, { cuisines: ['français', 'japonais'], prices: [], locations: [] });
    expect(result).toHaveLength(3);
  });

  it('filtre par prix unique', () => {
    const result = applyFilters(restaurants, { cuisines: [], prices: ['€€€'], locations: [] });
    expect(result).toHaveLength(2);
  });

  it('filtre par localisation unique', () => {
    const result = applyFilters(restaurants, { cuisines: [], prices: [], locations: ['6ème'] });
    expect(result).toHaveLength(2);
  });

  it('combine cuisine ET localisation (AND entre critères)', () => {
    const result = applyFilters(restaurants, { cuisines: ['français'], prices: [], locations: ['6ème'] });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
  });

  it('retourne tableau vide si aucune correspondance', () => {
    const result = applyFilters(restaurants, { cuisines: ['mexicain'], prices: [], locations: [] });
    expect(result).toHaveLength(0);
  });

  it('utilise €€ par défaut si priceRange absent', () => {
    const withMissing = [{ id: 9, type: 'test', location: 'Paris' }];
    const result = applyFilters(withMissing, { cuisines: [], prices: ['€€'], locations: [] });
    expect(result).toHaveLength(1);
  });

  it('ne mute pas le tableau source', () => {
    const source = [...restaurants];
    applyFilters(restaurants, { cuisines: ['français'], prices: [], locations: [] });
    expect(restaurants).toHaveLength(source.length);
  });
});

// ===== addFilter =====

describe('addFilter', () => {
  it('ajoute une valeur absente', () => {
    expect(addFilter([], 'français')).toEqual(['français']);
    expect(addFilter(['français'], 'italien')).toEqual(['français', 'italien']);
  });

  it('ne duplique pas une valeur déjà présente', () => {
    expect(addFilter(['français'], 'français')).toEqual(['français']);
  });

  it('retourne un nouveau tableau (immutabilité)', () => {
    const original = ['français'];
    const result = addFilter(original, 'italien');
    expect(result).not.toBe(original);
  });
});

// ===== removeFilter =====

describe('removeFilter', () => {
  it('retire une valeur présente', () => {
    expect(removeFilter(['français', 'italien'], 'français')).toEqual(['italien']);
  });

  it('ne fait rien si la valeur est absente', () => {
    expect(removeFilter(['français'], 'japonais')).toEqual(['français']);
  });

  it('retourne tableau vide si la seule valeur est retirée', () => {
    expect(removeFilter(['français'], 'français')).toEqual([]);
  });

  it('retourne un nouveau tableau (immutabilité)', () => {
    const original = ['français'];
    const result = removeFilter(original, 'français');
    expect(result).not.toBe(original);
  });
});

// ===== hasActiveFilters =====

describe('hasActiveFilters', () => {
  it('retourne false pour des filtres vides', () => {
    expect(hasActiveFilters(emptyFilters())).toBe(false);
  });

  it('retourne true si cuisines non vide', () => {
    expect(hasActiveFilters({ cuisines: ['français'], prices: [], locations: [] })).toBe(true);
  });

  it('retourne true si prices non vide', () => {
    expect(hasActiveFilters({ cuisines: [], prices: ['€€'], locations: [] })).toBe(true);
  });

  it('retourne true si locations non vide', () => {
    expect(hasActiveFilters({ cuisines: [], prices: [], locations: ['6ème'] })).toBe(true);
  });
});

// ===== emptyFilters =====

describe('emptyFilters', () => {
  it('retourne un objet avec trois tableaux vides', () => {
    const f = emptyFilters();
    expect(f.cuisines).toEqual([]);
    expect(f.prices).toEqual([]);
    expect(f.locations).toEqual([]);
  });

  it('retourne un nouvel objet à chaque appel', () => {
    expect(emptyFilters()).not.toBe(emptyFilters());
  });
});
