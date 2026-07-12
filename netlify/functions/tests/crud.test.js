import { describe, it, expect, vi, beforeEach } from 'vitest';

/* Tests unitaires des endpoints CRUD : pg est mocké (fake pool qui enregistre
   les requêtes), l'API GitHub est mockée via fetch. La connexion réelle à
   Neon reste à valider via `netlify dev`. */

// ===== Fake pool =====
const queries = [];
let deleteRowCount = 1;
let failOnRestaurantUpsert = false;

const fakePool = {
  query: vi.fn(async (sql, params) => {
    queries.push({ sql, params });
    if (failOnRestaurantUpsert && /INSERT INTO restaurants/i.test(sql)) {
      throw new Error('boom SQL');
    }
    if (/SELECT id FROM cuisine_types/i.test(sql)) return { rows: [{ id: 7 }] };
    if (/DELETE FROM restaurants WHERE id/i.test(sql)) return { rowCount: deleteRowCount, rows: [] };
    return { rows: [], rowCount: 0 };
  }),
};

// ===== Mock GitHub API =====
let githubResponse = { ok: true, json: async () => ({ login: 'GianniGM06' }) };
vi.stubGlobal('fetch', vi.fn(async () => githubResponse));

// Les fonctions Netlify sont en CommonJS : on charge tout via le MÊME loader
// CJS (createRequire) pour partager l'instance de lib/db.js et y injecter le fake pool.
import { createRequire } from 'node:module';
const cjsRequire = createRequire(import.meta.url);

cjsRequire('../lib/db.js').setPoolForTesting(fakePool);
const { handler: upsertHandler } = cjsRequire('../upsert-restaurant.js');
const { handler: deleteHandler } = cjsRequire('../delete-restaurant.js');
const { handler: saveHandler } = cjsRequire('../save-restaurants.js');

function post(body, token = 'ghp_valid') {
  return {
    httpMethod: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: JSON.stringify(body),
  };
}

const validTested = {
  status: 'tested',
  restaurant: {
    id: 123, name: 'Chez Test', type: 'français', location: '6ème',
    priceRange: '€€€', dateAdded: '2024-06-01',
    ratings: { plats: 4.5, vins: 4, accueil: 5, lieu: 3.5 },
  },
};

beforeEach(() => {
  queries.length = 0;
  deleteRowCount = 1;
  failOnRestaurantUpsert = false;
  githubResponse = { ok: true, json: async () => ({ login: 'GianniGM06' }) };
});

// ===== Auth =====

describe('authentification des écritures', () => {
  it('401 sans token', async () => {
    const res = await upsertHandler(post(validTested, null));
    expect(res.statusCode).toBe(401);
    expect(queries).toHaveLength(0); // aucune requête SQL
  });

  it('401 si le token GitHub est invalide', async () => {
    githubResponse = { ok: false };
    const res = await upsertHandler(post(validTested));
    expect(res.statusCode).toBe(401);
  });

  it('403 si le login n\'est pas dans l\'allowlist', async () => {
    githubResponse = { ok: true, json: async () => ({ login: 'intrus' }) };
    const res = await upsertHandler(post(validTested));
    expect(res.statusCode).toBe(403);
    expect(queries).toHaveLength(0);
  });

  it('l\'allowlist est insensible à la casse', async () => {
    const res = await upsertHandler(post(validTested));
    expect(res.statusCode).toBe(200);
  });
});

// ===== Validation upsert =====

describe('upsert-restaurant — validation', () => {
  it('400 si status invalide', async () => {
    const res = await upsertHandler(post({ status: 'autre', restaurant: validTested.restaurant }));
    expect(res.statusCode).toBe(400);
  });

  it('400 si id manquant', async () => {
    const res = await upsertHandler(post({ status: 'tested', restaurant: { name: 'X', type: 'y' } }));
    expect(res.statusCode).toBe(400);
  });

  it('400 si note hors bornes', async () => {
    const bad = structuredClone(validTested);
    bad.restaurant.ratings.plats = 7;
    const res = await upsertHandler(post(bad));
    expect(res.statusCode).toBe(400);
  });

  it('400 si un testé n\'a pas de notes (protège le rendu)', async () => {
    const bad = structuredClone(validTested);
    delete bad.restaurant.ratings;
    const res = await upsertHandler(post(bad));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toMatch(/not/i);
  });

  it('400 si une URL n\'est pas http(s)', async () => {
    const bad = structuredClone(validTested);
    bad.restaurant.googleMapsUrl = 'javascript:alert(1)';
    const res = await upsertHandler(post(bad));
    expect(res.statusCode).toBe(400);

    const bad2 = structuredClone(validTested);
    bad2.restaurant.photos = [{ url: 'data:text/html,x', comment: '' }];
    const res2 = await upsertHandler(post(bad2));
    expect(res2.statusCode).toBe(400);
  });

  it('les URLs https passent et le type est normalisé en minuscules', async () => {
    const payload = structuredClone(validTested);
    payload.restaurant.type = '  Français ';
    payload.restaurant.googleMapsUrl = 'https://maps.google.com/?q=test';
    const res = await upsertHandler(post(payload));
    expect(res.statusCode).toBe(200);
    const cuisineInsert = queries.find((q) => /INSERT INTO cuisine_types/.test(q.sql));
    expect(cuisineInsert.params).toEqual(['français']);
  });

  it('405 sur GET', async () => {
    const res = await upsertHandler({ httpMethod: 'GET', headers: {} });
    expect(res.statusCode).toBe(405);
  });
});

// ===== Comportement upsert =====

describe('upsert-restaurant — écriture', () => {
  it('testé : transaction, cuisine, restaurant (avec price_range) puis notes', async () => {
    const res = await upsertHandler(post(validTested));
    expect(res.statusCode).toBe(200);

    const sqls = queries.map((q) => q.sql);
    expect(sqls[0]).toBe('BEGIN');
    expect(sqls.at(-1)).toBe('COMMIT');
    expect(sqls.some((s) => /INSERT INTO cuisine_types/.test(s))).toBe(true);

    const restaurantQuery = queries.find((q) => /INSERT INTO restaurants/.test(q.sql));
    expect(restaurantQuery.params[7]).toBe('€€€');        // price_range persisté
    expect(restaurantQuery.params[13]).toBe('tested');    // status

    const ratingsQuery = queries.find((q) => /INSERT INTO ratings/.test(q.sql));
    expect(ratingsQuery.params).toEqual([123, 4.5, 4, 5, 3.5]);
  });

  it('vins non testés -> vins NULL en base', async () => {
    const payload = structuredClone(validTested);
    payload.restaurant.winesNotTested = true;
    await upsertHandler(post(payload));
    const ratingsQuery = queries.find((q) => /INSERT INTO ratings/.test(q.sql));
    expect(ratingsQuery.params[2]).toBeNull();
  });

  it('wishlist : purge des notes, raison conservée', async () => {
    const payload = {
      status: 'wishlist',
      restaurant: { id: 5, name: 'Envie', type: 'italien', location: '11ème', reason: 'Réputé' },
    };
    const res = await upsertHandler(post(payload));
    expect(res.statusCode).toBe(200);

    expect(queries.some((q) => /DELETE FROM ratings/.test(q.sql) && q.params[0] === 5)).toBe(true);
    const restaurantQuery = queries.find((q) => /INSERT INTO restaurants/.test(q.sql));
    expect(restaurantQuery.params[12]).toBe('Réputé');    // reason
    expect(restaurantQuery.params[13]).toBe('wishlist');
  });

  it('ROLLBACK puis 500 si une requête échoue', async () => {
    failOnRestaurantUpsert = true;
    const res = await upsertHandler(post(validTested));
    expect(res.statusCode).toBe(500);
    expect(queries.map((q) => q.sql)).toContain('ROLLBACK');
    expect(queries.map((q) => q.sql)).not.toContain('COMMIT');
  });
});

// ===== save-restaurants (bulk, destructif) =====

describe('save-restaurants — garde-fou confirmReplace', () => {
  it('400 sans le flag confirmReplace (full-replace refusé)', async () => {
    const res = await saveHandler(post({ tested: [], wishlist: [] }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toMatch(/confirmReplace/);
    expect(queries).toHaveLength(0); // aucune requête SQL exécutée
  });

  it('200 avec confirmReplace: true', async () => {
    const res = await saveHandler(post({ confirmReplace: true, tested: [], wishlist: [] }));
    expect(res.statusCode).toBe(200);
    expect(queries.map((q) => q.sql)).toContain('COMMIT');
  });
});

// ===== delete-restaurant =====

describe('delete-restaurant', () => {
  it('supprime par id', async () => {
    const res = await deleteHandler(post({ id: 42 }));
    expect(res.statusCode).toBe(200);
    const del = queries.find((q) => /DELETE FROM restaurants/.test(q.sql));
    expect(del.params).toEqual([42]);
  });

  it('404 si le restaurant n\'existe pas', async () => {
    deleteRowCount = 0;
    const res = await deleteHandler(post({ id: 42 }));
    expect(res.statusCode).toBe(404);
  });

  it('400 si id invalide', async () => {
    const res = await deleteHandler(post({ id: 'abc' }));
    expect(res.statusCode).toBe(400);
    expect(queries).toHaveLength(0);
  });

  it('401 sans token', async () => {
    const res = await deleteHandler(post({ id: 42 }, null));
    expect(res.statusCode).toBe(401);
  });
});
