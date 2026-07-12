import { describe, it, expect } from 'vitest';
import { nearestRestaurants, countWithoutCoordinates } from '../nearby.js';
import { distanceKm, formatDistance } from '../map.js';

// Position de référence : Odéon, Paris
const ODEON = { lat: 48.8520, lng: 2.3390 };

const restaurants = [
  { id: 1, name: 'À côté',      coordinates: { lat: 48.8530, lng: 2.3400 } },  // ~130 m
  { id: 2, name: 'Bastille',    coordinates: { lat: 48.8532, lng: 2.3690 } },  // ~2.2 km
  { id: 3, name: 'Montmartre',  coordinates: { lat: 48.8867, lng: 2.3431 } },  // ~3.9 km
  { id: 4, name: 'Sans coords' },
  { id: 5, name: 'Coords nulles', coordinates: null },
];

describe('distanceKm / formatDistance', () => {
  it('distance nulle au même point', () => {
    expect(distanceKm(48.85, 2.34, 48.85, 2.34)).toBe(0);
  });

  it('1 degré de latitude ≈ 111 km', () => {
    expect(distanceKm(48, 2, 49, 2)).toBeGreaterThan(110);
    expect(distanceKm(48, 2, 49, 2)).toBeLessThan(112);
  });

  it('formate en mètres sous 1 km, en km au-dessus', () => {
    expect(formatDistance(0.35)).toBe('350 m');
    expect(formatDistance(2.44)).toBe('2.4 km');
  });
});

describe('nearestRestaurants', () => {
  it('trie par distance croissante', () => {
    const result = nearestRestaurants(ODEON, restaurants);
    expect(result.map((x) => x.restaurant.id)).toEqual([1, 2, 3]);
    expect(result[0].km).toBeLessThan(result[1].km);
  });

  it('exclut les restaurants sans coordonnées', () => {
    const result = nearestRestaurants(ODEON, restaurants);
    expect(result.some((x) => x.restaurant.id === 4 || x.restaurant.id === 5)).toBe(false);
  });

  it('respecte la limite', () => {
    expect(nearestRestaurants(ODEON, restaurants, 2)).toHaveLength(2);
  });

  it('retourne [] sans position', () => {
    expect(nearestRestaurants(null, restaurants)).toEqual([]);
    expect(nearestRestaurants({ lat: 'x' }, restaurants)).toEqual([]);
  });

  it('les distances sont plausibles', () => {
    const result = nearestRestaurants(ODEON, restaurants);
    expect(result[0].km).toBeLessThan(0.3);       // « À côté »
    expect(result[1].km).toBeGreaterThan(1.5);    // Bastille
  });
});

describe('countWithoutCoordinates', () => {
  it('compte les restaurants non positionnés', () => {
    expect(countWithoutCoordinates(restaurants)).toBe(2);
    expect(countWithoutCoordinates([])).toBe(0);
  });
});
