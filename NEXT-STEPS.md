# Next Steps — Les Restos de Gianni

> Établi le 2026-07-12 après re-vérification factuelle du code (commit `9c1ca46`), en croisant l'audit initial, une relecture à œil neuf du repo, et l'état de la prod (https://gianni-resto.netlify.app).

## 1. Résumé décisionnel

L'application est **saine, déployée et fonctionnelle** : les 13 sujets de l'audit initial sont corrigés et vérifiés (10/10 contrôles code + smoke test 18/18 contre la vraie base Neon). L'architecture est modulaire (8 modules ESM + 4 functions + libs partagées), sécurisée (auth serveur allowlist, zéro handler inline, CSP `script-src 'self'`, TLS vérifié), testée (59 tests).
La relecture à œil neuf révèle cependant : **aucune sauvegarde des données** (la base Neon est l'unique copie), un **schéma `DB.sql` désynchronisé** (colonne `photos` manquante), un **crash de rendu possible** si un restaurant testé n'a pas de notes, et un token de test dans `.env` (conservé volontairement pendant les travaux pour les smoke tests, à révoquer en fin de chantier).
Les trois enjeux à traiter maintenant : (1) hygiène sécurité + garde-fous anti-crash, (2) sauvegarde/export des données, (3) cohérence de l'état local en cas d'échec d'écriture. Côté produit, la fonctionnalité la plus attendue est « **Autour de moi** » : les restos les plus proches d'une position détectée ou saisie manuellement.
**Prochaine étape immédiate recommandée : Lot 0** (une demi-journée, aucun risque, tout vérifiable en local).

## 2. Vérification de l'audit précédent

| Sujet de l'audit | État actuel | Preuve dans le code | Action restante |
|---|---|---|---|
| Modules ESM cassés (`export` sans `type="module"`) | Corrigé et vérifié | `index.html:534`, imports `script.js:1-9` | — |
| API d'écriture sans authentification | Corrigé et vérifié | `lib/auth.js` (allowlist), appelé par les 3 endpoints ; testé 401/403 en prod | — |
| XSS via `onclick` inline interpolés | Corrigé et vérifié | 0 occurrence hors `vendor/` ; délégation `data-action` (`script.js:448-478`) | Valider le schéma des URLs saisies (rang 17) |
| « Vins non testés » perdu (NaN) | Corrigé et vérifié | `get-restaurants.js:108-116`, convention `vins NULL` ; smoke test prod | — |
| Listeners dupliqués / accumulés | Corrigé et vérifié | binding unique dans `setupUI` (`script.js`) | — |
| `price_range`/`date_visited` jamais persistés | Corrigé et vérifié | `upsert-restaurant.js:81+` ; smoke test prod (€€→€€€) | — |
| Full-replace destructif comme seul chemin d'écriture | Corrigé et vérifié | CRUD unitaires (`upsert-restaurant.js`, `delete-restaurant.js`), client `persistOne/persistDelete` | Encadrer l'endpoint bulk résiduel (rang 13) |
| TLS Neon non vérifié | Corrigé et vérifié | `lib/db.js:18-20` `rejectUnauthorized: true`, testé contre la vraie base | — |
| CSP `unsafe-inline`, multi-CDN | Corrigé et vérifié | `netlify.toml:25` `script-src 'self'` ; assets dans `public/vendor/` | — |
| Dark mode incomplet (cards illisibles) | Corrigé et vérifié | tokens `[data-bs-theme]` (`styles.css`), toggle `theme.js` | — |
| Cards cliquables inaccessibles au clavier | **Toujours présent** | `cards.js:44` (`<img data-action>`), `cards.js:126` (`<div>` cliquable) | Rang 8 du backlog |
| Boutons d'édition absents après login | Corrigé et vérifié | `cardRenderKey` + `render()` post-login (`script.js:1576+`, `:320`) | — |
| Tests quasi absents | Corrigé et vérifié | 59 tests / 3 fichiers (filters 35, rating 8, CRUD handlers 16) | CI absente (rang 5) |
| **Nouveau risque** : token de test vivant dans `.env` | Nouveau risque (assumé) | `.env:1` (gitignoré, hors historique git, aucune permission GitHub) | Conservé pour les smoke tests pendant les travaux ; révoquer + supprimer en fin de chantier |
| **Nouveau risque** : `DB.sql` sans colonne `photos` | Nouveau risque | `DB.sql:19-36` vs `get-restaurants.js:51` | Rang 10 |
| **Nouveau risque** : crash si testé sans `ratings` | Nouveau risque | `rating.js:14` + `cards.js:69` + `renderStats` sans garde | Rang 4 |
| **Nouveau risque** : état local incohérent après échec d'écriture | Nouveau risque | `saveRestaurant`/`confirmTransfer` vs `confirmDelete` (`script.js:1285-1290`) | Rang 2 |

Non vérifiable sans accès : comportement des functions sous quota Netlify, restauration Neon (PITR limité sur le plan gratuit).

## 3. Backlog priorisé

Score = (Valeur utilisateur × 2 + Impact produit × 2 + Réduction du risque × 3 + Confiance) − Effort

| Rang | Amélioration | Problème résolu | Catégorie | VU | IP | RR | Eff | Conf | Score | Dépendances | Recommandation concrète |
|---:|---|---|---|---:|---:|---:|---:|---:|---:|---|---|
| 0 | Révoquer le token `pourClaude` + supprimer `.env` **en fin de chantier** | Credential vivante en clair sur le disque (sans permission GitHub — risque limité, assumé pendant les travaux pour les smoke tests) | Sécurité | 0 | 0 | 5 | 1 | 5 | 19* | Fin des lots (décision propriétaire : conserver pour l'instant) | GitHub → Settings → Fine-grained tokens → Delete ; `del .env` — dernière étape du plan d'exécution |
| 1 | Bouton « Exporter mes données (JSON) » | La base Neon est l'unique copie ; aucune sauvegarde | Fiabilité des données | 4 | 4 | 5 | 1 | 5 | 35 | — | Bouton navbar → télécharge `restos-AAAA-MM-JJ.json` (données déjà en mémoire client) ; documenter la restauration via `save-restaurants` |
| 2 | Resynchronisation uniforme après échec d'écriture | Ajout/édition/transfert restent affichés alors qu'ils ne sont pas sauvegardés | Fiabilité des données | 3 | 3 | 4 | 2 | 4 | 26 | — | Factoriser le pattern de `confirmDelete` (reload + render en cas d'échec) dans `persistOperation` (`script.js`) |
| 3 | Toast « Annuler » après suppression (5 s) | Suppression irréversible malgré la confirmation | UX | 4 | 3 | 3 | 2 | 4 | 25 | — | Conserver le resto supprimé en mémoire ; bouton Annuler dans le toast → `persistOne` de restauration |
| 4 | Garde « restaurant sans notes » | Un seul testé sans `ratings` en base → page entière en état d'erreur | Fiabilité des données | 2 | 2 | 4 | 1 | 5 | 24 | — | Défaut « non noté » dans `cards.js`/`renderStats` + `upsert-restaurant.js` : exiger `ratings` quand `status=tested` |
| 5 | CI GitHub Actions (vitest sur push/PR) | Les 59 tests ne tournent que manuellement | Qualité / tests | 1 | 3 | 4 | 1 | 5 | 24 | — | `.github/workflows/test.yml` : npm ci + vitest run, Node 20 |
| 6 | **« Autour de moi » : restos les plus proches, position modifiable** | Trouver où manger près d'ici (ou près d'une adresse choisie) est le cas d'usage n°1 en mobilité, aujourd'hui limité à des marqueurs muets | Fonctionnalité produit | 5 | 5 | 0 | 3 | 4 | 21 | Renforcé par rang 12 (restos sans coordonnées invisibles) | Géoloc → adresse affichée (reverse geocoding Nominatim) **modifiable** (saisie libre → `geocodeAddress` existant) ; liste des N plus proches triée avec distances, clic → marqueur/carte ; tri « Distance » dans la liste principale |
| 7 | « Se souvenir de moi » (localStorage opt-in) | Reconnexion GitHub à chaque onglet/session | UX | 4 | 3 | 1 | 1 | 4 | 20 | Décision D3 | Case à cocher dans le modal de connexion ; CSP strict existant limite le risque XSS |
| 8 | Cards accessibles au clavier | Image/card cliquables inaccessibles sans souris (reste d'audit) | Accessibilité | 3 | 2 | 2 | 2 | 5 | 19 | — | Lien `<a>` réel + `stretched-link` Bootstrap sur le titre ; retirer `data-action` de l'`<img>`/`<div>` |
| 9 | README de reprise de projet | README d'une ligne ; architecture non documentée | Exploitation | 1 | 2 | 3 | 1 | 5 | 19 | — | Archi (modules, functions, DB), setup local (`netlify dev`), env vars, déploiement, restauration |
| 10 | Resynchroniser `DB.sql` (colonne `photos`) | Rejouer le schéma casse toutes les fonctions | Fiabilité des données | 0 | 1 | 4 | 1 | 5 | 18 | — | `ALTER TABLE restaurants ADD COLUMN photos JSONB DEFAULT '[]'` documenté dans `DB.sql` |
| 11 | Deep-link vers une fiche (`#resto-<id>`) | Impossible de partager/retrouver un resto précis | Fonctionnalité produit | 3 | 3 | 1 | 2 | 4 | 17 | — | Ancre par card + scroll/highlight à l'ouverture ; bouton « copier le lien » |
| 12 | Indicateur « X restos sans position » + géocodage en lot | Des restos absents de la carte et du classement distance, sans explication | UX | 3 | 3 | 1 | 2 | 4 | 17 | — | Compteur sur l'onglet Carte + bouton (mode édition) géocodant les adresses manquantes via Nominatim (1 req/s) |
| 13 | Encadrer l'endpoint bulk `save-restaurants` | Full-replace destructif encore appelable (authentifié) | Sécurité | 0 | 1 | 3 | 1 | 4 | 14 | Décision D6 | Exiger `"confirmReplace": true` dans le payload, sinon 400 |
| 14 | Cache TTL de l'auth GitHub dans les functions | 1 appel `api.github.com` par écriture (latence ~200 ms) | Performance | 2 | 2 | 1 | 1 | 4 | 14 | — | Map token→login en mémoire de module, TTL 5 min (`lib/auth.js`) |
| 15 | Fusionner « Photo (URL) » et la galerie | Deux champs photo redondants dans le formulaire | UX | 2 | 2 | 1 | 2 | 4 | 13 | — | La 1re photo de la galerie devient la photo de card ; supprimer le champ isolé |
| 16 | Meta description / OG / décision noindex | Partage de lien sans aperçu ; indexation non choisie | UX | 1 | 2 | 1 | 1 | 5 | 13 | Décision D7 | `<meta>` description + OG dans `index.html` ; `robots.txt` selon D7 |
| 17 | Valider le schéma des URLs saisies | `javascript:` possible dans `googleMapsUrl`/photos | Sécurité | 0 | 1 | 2 | 1 | 5 | 12 | — | N'accepter que `https?://` à la sauvegarde (client + `upsert-restaurant.js`) |
| 18 | Filtre « note minimale » | Impossible de ne voir que les ≥ 4/5 | Fonctionnalité produit | 3 | 2 | 0 | 2 | 4 | 12 | — | Chips 3+/4+/4.5+ dans la barre de filtres, logique pure dans `filters.js` + tests |
| 19 | Nettoyage + normalisation `cuisine_types` | Types orphelins accumulés ; doublons de casse possibles via API | Fiabilité des données | 1 | 1 | 2 | 2 | 4 | 12 | — | `lower(trim())` côté serveur + suppression des types non référencés |
| 20 | Recherche étendue aux commentaires | « Le resto avec la super terrasse » introuvable | Fonctionnalité produit | 2 | 2 | 0 | 1 | 4 | 11 | — | Étendre `applyFilters` (nom + commentaire + adresse) + tests |
| 21 | PWA installable (mobile) | Pas d'icône d'app ni d'accès rapide mobile | Fonctionnalité produit | 3 | 3 | 0 | 4 | 3 | 11 | Décision D10 | Manifest + service worker cache statique (pas de offline données) |
| 22 | ESLint + Prettier minimal | Style hétérogène, erreurs latentes non détectées | Qualité / tests | 0 | 1 | 2 | 2 | 4 | 10 | — | Config flat ESLint (recommended) + format ; script npm + CI |
| 23 | FAQ : documenter « vins non testés » | La formule affichée ignore le cas sans vins | UX | 2 | 1 | 0 | 1 | 5 | 10 | — | Ajouter la formule ÷4,5 dans l'accordéon FAQ (`index.html`) |
| 24 | Favicon manquant (404 à chaque visite) | `icons8-letter-g-32.png` référencé mais absent | UX | 1 | 1 | 0 | 1 | 5 | 8 | — | Ajouter un favicon (SVG data-URI ou PNG) |
| 25 | Subset icônes / purge Bootstrap | ~350 Ko d'assets pour une fraction utilisée | Performance | 1 | 1 | 0 | 3 | 3 | 4 | — | Optionnel ; gain modeste (assets déjà locaux + cache immutable) |

\* Rang 0 : score hors barème — règle « toute faille de sécurité passe d'abord ».

## 4. Les 10 améliorations les plus utiles

### 1. Export JSON des données (S)
- **Pourquoi maintenant** : la base Neon (plan gratuit) est l'unique copie des découvertes gastronomiques ; aucune procédure de restauration n'existe.
- **Concrètement** : bouton « Exporter » dans le menu → fichier `restos-2026-07-12.json` téléchargé ; restauration possible via l'endpoint bulk existant.
- **Risque si non fait** : perte totale et définitive des données (fausse manip, incident Neon, compte suspendu).
- **Critères d'acceptation** : le JSON contient tested + wishlist + cuisineTypes ; ré-importable via `save-restaurants` ; fonctionne sans connexion GitHub (lecture publique).
- **Fichiers** : `public/index.html` (bouton navbar), `public/script.js`, `public/api.js`.

### 2. Resynchronisation après échec d'écriture (S/M)
- **Pourquoi** : un ajout/transfert échoué reste affiché comme réussi jusqu'au prochain rechargement — la donnée locale ment.
- **Concrètement** : en cas d'échec, l'app recharge l'état serveur ; l'utilisateur voit la réalité + le toast d'erreur existant.
- **Risque si non fait** : confiance erronée, doubles saisies, incompréhension.
- **Critères** : couper le réseau → ajouter un resto → toast d'erreur ET la card disparaît ; comportement identique pour modifier/transférer/supprimer.
- **Fichiers** : `public/script.js` (`persistOperation`, `saveRestaurant`, `confirmTransfer`).

### 3. Annulation de suppression (M)
- **Pourquoi** : la confirmation modale n'empêche pas l'erreur ; la suppression reste définitive.
- **Concrètement** : toast « "Chez X" supprimé — Annuler » pendant 5 s ; clic → le resto revient (re-upsert).
- **Risque si non fait** : perte accidentelle d'une fiche détaillée (photos, notes, commentaires).
- **Critères** : suppression → Annuler → la card revient complète (notes + photos) ; sans clic, disparition définitive.
- **Fichiers** : `public/script.js` (`confirmDelete`), `public/ui.js` (toast avec action).

### 4. Garde « restaurant sans notes » (S)
- **Pourquoi** : `calculateRating(undefined)` jette une exception ; un seul enregistrement incomplet bascule toute l'app en écran d'erreur.
- **Concrètement** : une fiche sans notes affiche « Non noté » ; l'API refuse un `tested` sans notes.
- **Critères** : injecter un testé sans `ratings` → l'app s'affiche, card « Non noté » ; `POST upsert` tested sans ratings → 400 ; test unitaire ajouté.
- **Fichiers** : `public/cards.js`, `public/script.js` (`renderStats`), `netlify/functions/upsert-restaurant.js`, tests.

### 5. CI GitHub Actions (S)
- **Pourquoi** : 59 tests existent mais rien ne les exécute automatiquement ; une régression peut partir en prod via un simple push.
- **Concrètement** : chaque push affiche ✅/❌ sur GitHub avant que Netlify déploie.
- **Critères** : workflow vert sur `main` ; un test cassé volontairement fait échouer le run.
- **Fichiers** : `.github/workflows/test.yml` (nouveau).

### 6. « Autour de moi » — restos les plus proches, position modifiable (M/L) ⭐ demandé
- **Pourquoi maintenant** : c'est LE cas d'usage mobile (« où manger près d'ici ? ») ; la carte actuelle montre des marqueurs mais ne répond pas à la question.
- **Concrètement** : clic sur « Restaurants près de moi » → géolocalisation → un panneau affiche « Autour de : *12 rue Oberkampf, Paris* ✏️ » (adresse issue du reverse geocoding, **modifiable** : saisir « Bastille » recalcule tout) + la liste des restos les plus proches avec distances (« Le Comptoir — 350 m »), triée, cliquable (centre la carte + ouvre le popup). Si la géolocalisation est refusée, le panneau propose directement la saisie d'adresse. Une option « Distance » apparaît dans le tri de la liste principale dès qu'une position est connue.
- **Risque si non fait** : l'app reste un carnet consultable, pas un compagnon de terrain — la carte sous-exploite les données existantes (coordonnées déjà stockées).
- **Critères d'acceptation** : (1) géoloc acceptée → adresse détectée affichée et liste triée par distance ; (2) adresse saisie manuellement → position, marqueur, distances et liste recalculés ; (3) géoloc refusée → saisie manuelle proposée, pas d'erreur bloquante ; (4) restos sans coordonnées exclus avec mention « X restos sans position » ; (5) tri « Distance » disponible et correct dans la liste principale ; (6) logique de classement pure et testée (`nearestRestaurants` : tri, limite, exclusion sans-coords).
- **Fichiers** : `public/map.js` (scinder `calculateDistance` → `distanceKm` + `formatDistance` ; `setReferencePosition`), `public/api.js` (`reverseGeocode` Nominatim — le forward `geocodeAddress` existe déjà), `public/filters.js` ou `public/nearby.js` (logique pure + tests), `public/index.html` (panneau onglet carte), `public/script.js` (orchestration + option de tri), `public/styles.css`.
- **Estimation** : M/L (1 à 1,5 jour avec tests).

### 7. « Se souvenir de moi » (S)
- **Pourquoi** : le token vit en `sessionStorage` → reconnexion à chaque session, friction n°1 du mode édition.
- **Critères** : cocher → fermer/rouvrir le navigateur → toujours connecté ; décocher → comportement actuel ; déconnexion purge les deux stockages.
- **Fichiers** : `public/auth.js`, `public/script.js` (modal).

### 8. Cards accessibles au clavier (M)
- **Pourquoi** : dernier reste de l'audit — l'ouverture Google Maps (image/card) est impossible au clavier.
- **Critères** : parcours clavier complet d'une card testée et wishlist sans souris ; focus visible ; lecteur d'écran annonce le lien.
- **Fichiers** : `public/cards.js`, `public/styles.css` (`stretched-link` + focus).

### 9. README de reprise (S)
- **Pourquoi** : une ligne aujourd'hui ; toi (ou un futur assistant) dans 6 mois devra tout redécouvrir.
- **Critères** : archi, prérequis, `netlify dev`, env vars, tests, déploiement, procédure export/restore — en un ou deux écrans.
- **Fichiers** : `README.md`.

### 10. `DB.sql` resynchronisé (S)
- **Pourquoi** : le schéma versionné ne crée pas `photos` ; rejouer `DB.sql` sur une base neuve casse toutes les fonctions.
- **Critères** : `psql -f DB.sql` sur base vierge + `netlify dev` → GET/upsert passent ; migration commentée et datée.
- **Fichiers** : `DB.sql`.

## 5. Quick wins

1. **Favicon** — critère : plus de 404 réseau, icône visible dans l'onglet. (15 min)
2. **`DB.sql` + colonne `photos`** — critère : schéma rejouable sur base vierge. (20 min)
3. **CI vitest** — critère : badge vert sur le prochain push. (30 min)
4. **Garde « sans notes »** — critère : fiche sans ratings affichée « Non noté », test ajouté. (1 h)
5. **Export JSON** — critère : fichier téléchargé complet et ré-importable. (1-2 h)
6. **Validation `https?://` des URLs** — critère : `javascript:alert(1)` refusé à la sauvegarde. (45 min)
7. **FAQ vins non testés** — critère : formule ÷4,5 documentée. (15 min)
8. **README** — critère : setup local reproductible en suivant uniquement le README. (1-2 h)

## 6. Roadmap proposée

### Lot 0 — Pré-requis de sécurité et stabilité
- **Objectif** : plus aucun crash possible sur données réelles, filet de sécurité CI. (Le token `.env` est conservé pendant les travaux — décision propriétaire — et servira aux smoke tests des lots.)
- **Tâches** : rangs 4 (garde sans-notes), 5 (CI), 17 (validation URLs), 13 (flag bulk), 24 (favicon), 10 (DB.sql).
- **Prérequis** : aucun.
- **Risques** : quasi nuls — changements additifs et testés unitairement.
- **Terminé quand** : tests verts en CI, payloads malformés → 400, schéma rejouable, 0 fichier sensible sur disque.
- **Vérification** : vitest + `netlify dev` (smoke GET/upsert sur cas limites).
- **Déploiement Netlify** : local (`netlify dev`) → deploy preview (branche/PR) → production.

### Lot 1 — Fiabilité des données et API
- **Objectif** : les données survivent aux pannes, aux erreurs humaines et au temps.
- **Tâches** : rangs 1 (export JSON), 2 (resync échec), 3 (annuler suppression), 14 (cache auth TTL), 19 (nettoyage cuisines).
- **Prérequis** : Lot 0 (CI en place).
- **Risques** : l'annulation de suppression touche le flux delete → étendre les tests E2E mock existants.
- **Terminé quand** : export/restauration documentés et testés ; échec réseau → état local = état serveur ; suppression annulable.
- **Vérification** : vitest + scénario navigateur réseau coupé + smoke test réel via `netlify dev`.
- **Déploiement Netlify** : local → preview → production.

### Lot 2 — Parcours principal et UX à forte valeur
- **Objectif** : transformer le carnet en compagnon de terrain — item vedette : « Autour de moi ».
- **Tâches** : rang 6 (**Autour de moi** : géoloc + adresse modifiable + classement distance + tri Distance), 12 (géocodage en lot — synergie directe : plus de restos positionnés = meilleur classement), 7 (se souvenir de moi), 11 (deep-link), 18 (filtre note), 20 (recherche étendue), 15 (fusion photos), 23 (FAQ), 16 (meta/OG selon D7).
- **Prérequis** : décisions D3, D7 ; Lot 1 recommandé avant (resync fiabilisée).
- **Risques** : rate-limit Nominatim (1 req/s — throttler le géocodage en lot et le reverse geocoding) ; précision géoloc en intérieur (l'adresse modifiable est justement la parade).
- **Terminé quand** : critères d'acceptation de chaque item (section 4) validés sur mobile et desktop, dans les deux thèmes.
- **Vérification** : parcours navigateur complet (géoloc simulée + adresse manuelle), tests logique pure (`nearestRestaurants`, filtres, tri).
- **Déploiement Netlify** : par petits incréments, preview à chaque item, production quand stable.

### Lot 3 — Accessibilité et design system
- **Objectif** : parcours 100 % clavier et lecteur d'écran sur les composants critiques.
- **Tâches** : rang 8 (cards clavier), audit focus des 4 modaux (piège, restitution), contrastes AA re-vérifiés sur les deux thèmes, cibles tactiles ≥ 44 px, panneau « Autour de moi » accessible (liste = vrais liens/boutons).
- **Prérequis** : Lot 2 (pour auditer les nouveaux composants en même temps).
- **Risques** : `stretched-link` vs boutons d'action des cards (z-index) — à tester.
- **Terminé quand** : navigation complète au clavier sans piège ; Lighthouse a11y ≥ 95.
- **Vérification** : navigation clavier scriptée + Lighthouse.
- **Déploiement Netlify** : local → preview → production.

### Lot 4 — Architecture, performance et qualité long terme
- **Objectif** : maintenabilité durable, sans sur-ingénierie.
- **Tâches** : rangs 9 (README), 22 (lint/format), 25 (subset assets — optionnel), 21 (PWA — si D10 oui), découpage résiduel de `script.js` (~1 950 lignes : extraire `filters-ui.js` et `modals.js` si le fichier continue de grossir).
- **Prérequis** : décision D10.
- **Risques** : PWA = complexité de cache à ne pas sous-estimer.
- **Terminé quand** : lint vert en CI, README complet, D10 actée.
- **Vérification** : CI + Lighthouse perf.
- **Déploiement Netlify** : local → preview → production.

## 7. Décisions à prendre par le propriétaire

| # | Décision | Recommandation par défaut | Compromis en une phrase |
|---|---|---|---|
| D1 | Mono-utilisateur privé ou multi-comptes ? | **Mono-utilisateur** (allowlist actuelle) | Le multi exigerait rôles + isolation des données, disproportionné pour un carnet personnel. |
| D2 | Méthode d'authentification | **Garder le PAT GitHub sans permission** | L'OAuth GitHub serait plus fluide mais ajoute une app à maintenir pour un seul utilisateur. |
| D3 | Token « se souvenir de moi » en localStorage ? | **Oui, opt-in coché par défaut** | Persistance contre surface XSS — risque faible avec le CSP strict actuel. |
| D4 | Politique de suppression | **Toast « Annuler » 5 s** (pas de corbeille) | Une corbeille serait plus sûre mais complexifie le modèle pour un gain marginal. |
| D5 | Stratégie de sauvegarde | **Export JSON manuel mensuel** (bouton) + avant toute grosse édition | Un backup automatisé (cron → stockage) est possible mais ajoute de l'infra à surveiller. |
| D6 | Endpoint bulk `save-restaurants` | **Garder avec flag `confirmReplace: true`** | Le supprimer est plus sûr mais on perd le chemin de restauration d'un export. |
| D7 | Indexation par les moteurs de recherche ? | **`noindex`** (app personnelle) | L'indexation donnerait de la visibilité mais expose tes adresses et habitudes. |
| D8 | Compatibilité navigateur | **Navigateurs modernes (2023+)** | Supporter les anciens imposerait de retirer `color-mix()`/`backdrop-filter` pour un public inexistant. |
| D9 | Priorité mobile vs desktop | **Mobile d'abord pour la consultation** (dont « Autour de moi »), desktop pour l'édition | C'est l'usage réel probable : consulter en déplacement, éditer au calme. |
| D10 | PWA installable ? | **Pas maintenant** (réévaluer après le Lot 2 — « Autour de moi » en ferait un bien meilleur candidat) | Icône d'app sympa, mais service worker = complexité de cache pour un gain encore incertain. |

## 8. Plan d'exécution proposé

1. Lot 0 : garde sans-notes + validation URLs + flag bulk + favicon + `DB.sql` + CI — ½ journée
2. Vérification Lot 0 : vitest + smoke test API (token `.env` conservé à cet effet) via `netlify dev` + deploy preview → production
3. Lot 1 : export JSON, resync après échec, annulation de suppression, cache auth — 1 journée
4. Vérification Lot 1 (scénarios réseau coupé + smoke test réel) → preview → production
5. Décisions D3/D7, puis Lot 2 en commençant par « **Autour de moi** » (rang 6) et le géocodage en lot (rang 12) qui la renforce — 1,5 à 2 journées
6. Suite du Lot 2 : se souvenir de moi, deep-link, filtre note, recherche étendue — 1 journée
7. Lot 3 : accessibilité clavier complète + audit focus (y compris le nouveau panneau) — ½ journée
8. Lot 4 : README, lint, arbitrage D10 (PWA) — ½ journée
9. **Fin de chantier** : révoquer le token GitHub `pourClaude` (toi) + suppression de `.env` (moi) — 10 min
