import { describe, it, expect } from 'vitest';
import {
  applyFilters,
  addFilter,
  removeFilter,
  hasActiveFilters,
  emptyFilters,
  sortRestaurants,
} from '../filters.js';

// ===== Données de test =====

const restaurants = [
  { id: 1, name: 'Le Comptoir',   type: 'français',  priceRange: '€€',  location: '6ème' },
  { id: 2, name: 'La Trattoria',  type: 'italien',   priceRange: '€€€', location: '11ème' },
  { id: 3, name: 'Sushi Yama',    type: 'japonais',  priceRange: '€€€', location: '6ème' },
  { id: 4, name: 'Chez Marcel',   type: 'français',  priceRange: '€',   location: '18ème' },
  { id: 5, name: 'Wok Impérial',  type: 'asiatique', priceRange: '€€',  location: '11ème' },
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

  it('recherche par nom insensible à la casse', () => {
    const result = applyFilters(restaurants, { ...emptyFilters(), query: 'comptoir' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
  });

  it('recherche partielle', () => {
    const result = applyFilters(restaurants, { ...emptyFilters(), query: 'ch' });
    expect(result.map(r => r.id)).toEqual([4]);
  });

  it('query vide ou espaces = pas de filtre', () => {
    expect(applyFilters(restaurants, { ...emptyFilters(), query: '   ' })).toHaveLength(5);
  });

  it('combine recherche et cuisine', () => {
    const result = applyFilters(restaurants, { ...emptyFilters(), cuisines: ['français'], query: 'marcel' });
    expect(result.map(r => r.id)).toEqual([4]);
  });

  it('tolère les restaurants sans nom', () => {
    const noName = [{ id: 9, type: 'test', location: 'Paris' }];
    expect(applyFilters(noName, { ...emptyFilters(), query: 'x' })).toHaveLength(0);
    expect(applyFilters(noName, emptyFilters())).toHaveLength(1);
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

  it('retourne true si une recherche est saisie', () => {
    expect(hasActiveFilters({ ...emptyFilters(), query: 'sushi' })).toBe(true);
  });

  it('ignore une recherche composée d\'espaces', () => {
    expect(hasActiveFilters({ ...emptyFilters(), query: '  ' })).toBe(false);
  });
});

// ===== sortRestaurants =====

describe('sortRestaurants', () => {
  const items = [
    { id: 1, name: 'Zola',   dateAdded: '2024-01-10', ratings: { plats: 3, vins: 3, accueil: 3, lieu: 3 } },
    { id: 2, name: 'Élan',   dateAdded: '2024-03-05', ratings: { plats: 5, vins: 5, accueil: 5, lieu: 5 } },
    { id: 3, name: 'aubade', dateAdded: '2024-02-01' }, // wishlist : pas de notes
  ];

  it('recent : date d\'ajout décroissante', () => {
    expect(sortRestaurants(items, 'recent').map(r => r.id)).toEqual([2, 3, 1]);
  });

  it('rating : note décroissante, sans-notes en fin', () => {
    expect(sortRestaurants(items, 'rating').map(r => r.id)).toEqual([2, 1, 3]);
  });

  it('rating : respecte winesNotTested / vins null', () => {
    const wines = [
      { id: 1, ratings: { plats: 3, vins: 5, accueil: 3, lieu: 3 } },              // (6+7.5+4.5+3)/6 = 3.5
      { id: 2, ratings: { plats: 5, vins: null, accueil: 5, lieu: 5 } },           // sans vins = 5
    ];
    expect(sortRestaurants(wines, 'rating').map(r => r.id)).toEqual([2, 1]);
  });

  it('name : alphabétique insensible casse/accents', () => {
    expect(sortRestaurants(items, 'name').map(r => r.name)).toEqual(['aubade', 'Élan', 'Zola']);
  });

  it('ne mute pas le tableau source', () => {
    const before = items.map(r => r.id);
    sortRestaurants(items, 'name');
    expect(items.map(r => r.id)).toEqual(before);
  });

  it('départage les dates égales par id décroissant', () => {
    const sameDay = [
      { id: 100, dateAdded: '2024-01-01' },
      { id: 200, dateAdded: '2024-01-01' },
    ];
    expect(sortRestaurants(sameDay, 'recent').map(r => r.id)).toEqual([200, 100]);
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
