import { describe, it, expect } from 'vitest';
import { createTestedCard, createWishlistCard, createEmptyState } from '../cards.js';

const base = {
  id: 42,
  name: 'Chez Test',
  type: 'français',
  location: '6ème',
  priceRange: '€€',
};

describe('createTestedCard', () => {
  it('affiche la note quand ratings est présent', () => {
    const html = createTestedCard(
      { ...base, ratings: { plats: 5, vins: 5, accueil: 5, lieu: 5 } },
      false
    );
    expect(html).toContain('5.0/5');
    expect(html).toContain('data-restaurant-id="42"');
  });

  it('ne plante pas et affiche "Non noté" sans ratings (garde anti-crash)', () => {
    const html = createTestedCard(base, false);
    expect(html).toContain('Non noté');
    expect(html).not.toContain('NaN');
  });

  it('gère vins null / winesNotTested (N/A affiché)', () => {
    const html = createTestedCard(
      { ...base, winesNotTested: true, ratings: { plats: 4, vins: null, accueil: 4, lieu: 4 } },
      false
    );
    expect(html).toContain('N/A');
    expect(html).not.toContain('NaN');
  });

  it('échappe les noms malveillants', () => {
    const html = createTestedCard(
      { ...base, name: '<img src=x onerror=alert(1)>', ratings: { plats: 4, vins: 4, accueil: 4, lieu: 4 } },
      false
    );
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img');
  });

  it('boutons d\'édition présents uniquement en mode édition', () => {
    const rated = { ...base, ratings: { plats: 4, vins: 4, accueil: 4, lieu: 4 } };
    expect(createTestedCard(rated, true)).toContain('data-action="edit"');
    expect(createTestedCard(rated, false)).not.toContain('data-action="edit"');
  });
});

describe('createWishlistCard', () => {
  it('rend la card avec raison échappée', () => {
    const html = createWishlistCard({ ...base, reason: 'Réputé & <bon>' }, false);
    expect(html).toContain('Réputé &amp; &lt;bon&gt;');
  });
});

describe('createEmptyState', () => {
  it('propose la connexion en mode lecture, l\'ajout en mode édition', () => {
    expect(createEmptyState('tested', false)).toContain('data-action="github-config"');
    expect(createEmptyState('tested', true)).toContain('data-action="add"');
  });
});
