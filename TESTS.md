# Tests et qualité

Prérequis : Node 22+ (`npm install` une fois), et Chrome ou Edge pour les tests de bout en bout (e2e).

## Commandes

| Commande | Rôle |
| --- | --- |
| `npm run lint` | ESLint (0 avertissement toléré) |
| `npm run lint:fix` | corrige automatiquement le style (indentation, quotes, points-virgules…) |
| `npm test` | tests unitaires `node:test` (`tests/unit/*.test.mjs`) |
| `npm run test:e2e` | jeu complet dans Chrome headless (`tests/e2e.mjs`) |
| `npm run check` | lint + tests unitaires + e2e : à lancer avant chaque commit |

Lancer un seul fichier : `node --test tests/unit/physics.test.mjs`.

L'e2e a besoin d'internet (Three.js et Rapier viennent du CDN). Variables utiles :
`E2E_PORT` (3300), `CDP_PORT` (9666), `CHROME_PATH`, `E2E_TIMEOUT` (ms par attente).
En cas d'échec, une capture est écrite dans `tests/artifacts/` (ignoré par git).

## Ce qui est couvert

- `utils.test.mjs` : logique pure de `public/js/utils.js` (clamp, damp, approach, plans et groupes de
  collision, zSpan, UV des boîtes, toLocal/toWorld, chevauchement SAT, combo et score, bulles,
  checkpoints, formatTime).
- `physics.test.mjs` : vrai Rapier 2D (paquet npm, même version que le CDN) : collisions entre plans,
  objets « all », changement de plan, sonde au sol (`probeGround`).
- `server.test.mjs` : `server.js` sur un port libre : 200 sur `/`, types MIME, 404, refus de la
  traversée de chemin, URL mal encodée et octet nul sans plantage.
- `e2e.mjs` : écran titre, démarrage, déplacement, collecte d'une bulle, saut, changement de plan,
  et aucune exception ni erreur console. Le jeu expose pour cela `window.__lbw.getState()` (lecture seule).

Non couvert : rendu visuel, audio, manette, attraper/balancer, fin de niveau.

## Ajouter un test

- **Logique pure** : mettre la fonction dans `public/js/utils.js` (ou un autre module sans Three.js ni
  DOM), l'importer depuis le jeu, puis ajouter un `test()` dans `tests/unit/` (fichier `*.test.mjs`).
- **Physique** : voir `tests/unit/physics.test.mjs` (`makeWorld`, `addBox`, `addPlayer`).
- **Serveur / multijoueur** : `startServer()` de `tests/helpers/server.mjs` lance `server.js` sur un port
  libre (`srv.url`, `srv.port`, `await srv.stop()`). Le WebSocket global de Node permet de tester `ws`.
- **E2E** : ajouter un `step('nom', async () => { ... })` dans la section « Scénario » de
  `tests/e2e.mjs`, avec `tap`/`keyDown`/`keyUp`, `waitFor(desc, (s) => ...)` et `evaluate(expr)`.
  Si une nouvelle info d'état est nécessaire, l'ajouter à `getState()` dans `main.js` (lecture seule).
- **Lint** : `public/**/*.js` = navigateur, `server.js` = Node CommonJS, `tests/**` = Node ESM
  (voir `eslint.config.mjs`).
