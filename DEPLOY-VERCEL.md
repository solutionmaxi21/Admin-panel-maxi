# Déploiement : storefront sur Vercel, backend en Docker

Cette topologie sépare les deux moitiés du monorepo sur deux hébergeurs :

```
navigateur
   |
   |  une seule origine publique, en HTTPS
   v
Vercel — Next.js  (rewrites /api/* et /uploads/*)
   |
   |  requête serveur-à-serveur, hors navigateur
   v
backend Express  (conteneur, disque persistant)
   |
   v
PostgreSQL
```

Le navigateur ne connaît que le domaine Vercel. Il n'y a donc **aucun CORS côté
navigateur** et aucune URL d'API à exposer au client : `/api` reste relatif.

---

## Pourquoi le backend n'est pas sur Vercel

Deux choses dans ce backend ne survivent pas à un environnement serverless. Ce ne
sont pas des problèmes de configuration, et les contourner changerait le code :

1. **Les images uploadées vivent sur le disque.**
   `backend/src/shared/middleware/upload.js` écrit via `multer.diskStorage` dans
   `backend/uploads/products` (idem `categoryUpload.js`). En Docker c'est le
   volume nommé `backend-uploads` (`docker-compose.yml`). Ce dossier est
   gitignoré : ces fichiers n'existent **que** là. Sur Vercel le système de
   fichiers est éphémère — l'upload réussit, l'image s'affiche, puis disparaît au
   déploiement suivant ou dès qu'une autre instance sert la requête.

2. **Deux traitements périodiques tournent dans le processus.**
   `backend/server.js` démarre `guepex-polling` (synchronisation des statuts de
   commande) et `notification-cleanup`. Une fonction serverless est instanciée
   plusieurs fois : chaque instance lancerait son propre polling sur les mêmes
   commandes, et il s'arrêterait dès que l'instance gèle.

Si un jour le backend doit passer sur Vercel, il faut d'abord déplacer les
uploads vers un stockage objet (Vercel Blob, S3) et le polling vers un Cron
appelant une route protégée.

---

## Étape 1 — le backend

N'importe quel hébergeur qui fait tourner un conteneur avec un disque persistant
convient : un VPS, Railway, Render, Fly.io. Le conteneur est déjà décrit par
`backend/Dockerfile`, rien à écrire.

Sur un VPS, depuis la racine du dépôt :

```bash
cp .env.example .env
# régénérer TOUS les secrets :
#   node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
docker compose up -d postgres schema backend
```

On ne lance **pas** le service `frontend` : c'est Vercel qui le sert. Le service
`schema` applique les migrations puis s'arrête ; `backend` ne démarre qu'une fois
cette étape réussie (`service_completed_successfully`).

### Ce qui doit impérativement changer dans `.env`

| Variable | Valeur | Pourquoi |
|---|---|---|
| `ALLOWED_ORIGINS` | `https://<ton-domaine-vercel>` | Vercel relaie la requête en serveur-à-serveur et transmet l'en-tête `Origin` du navigateur. Le backend le valide : une origine absente de cette liste fait **échouer chaque appel `/api`**. |
| `FRONTEND_URL` | `https://<ton-domaine-vercel>` | URL des liens dans les e-mails : vérification d'adresse et réinitialisation de mot de passe (`src/shared/services/email.js`, lignes 60 et 76). Laissée à `localhost`, les liens envoyés aux clients pointeront vers `localhost`. |
| `STORE_URL` | `https://<ton-domaine-vercel>` | Lue par `cacheManager.js` (ligne 165) pour l'invalidation du cache. |
| `PUBLIC_URL` | — | **Spécifique au chemin `docker compose`**, pas à ce déploiement. `docker-compose.yml` la recopie dans `CLIENT_URL`, `FRONTEND_URL` et `STORE_URL` (lignes 95-97) : c'est cette indirection, et elle seule, qui la rend utile. Sur un backend hébergé directement (Render, Railway, Fly.io), aucune variable ne lit `PUBLIC_URL` — la définir n'a **aucun effet**, il faut poser `FRONTEND_URL` et `STORE_URL` elles-mêmes. |
| `COOKIE_SECURE` | `true` | Le navigateur est en HTTPS. Un cookie `Secure` posé depuis un site HTTP est rejeté. |
| `DATABASE_URL` | chaîne de la base hébergée | Si Postgres n'est pas dans le même `compose`. |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `HMAC_SECRET`, `REVALIDATION_SECRET`, `GUEPEX_WEBHOOK_SECRET` | valeurs générées | Les valeurs `dev-insecure-...` du compose ne servent qu'au premier lancement. |

### Contraintes

- **Le backend doit être joignable publiquement en HTTPS, sur un nom d'hôte
  stable.** Vercel le joint depuis son infrastructure : il n'a aucun accès au
  réseau Docker interne. Un nom qui change à chaque redéploiement casserait le
  build Vercel (voir le piège n°1).
- **Le volume `backend-uploads` doit persister.** C'est là que vivent les images
  produits.
- Le port 3001 n'a pas besoin d'être exposé sur l'hôte : un reverse proxy
  (Caddy, nginx) peut le publier en HTTPS depuis le réseau Docker.

---

## Étape 2 — le projet Vercel

### Configuration du projet

La détection automatique propose le preset **Services** parce qu'elle voit deux
services dans le dépôt. Ce n'est **pas** ce qu'on veut ici : le backend n'est pas
sur Vercel. Dans les réglages du projet :

| Réglage | Valeur |
|---|---|
| Framework Preset | **Next.js** (et non « Services ») |
| Root Directory | **`frontend`** |
| Build Command | défaut (`next build`) |
| Output Directory | défaut (`.next`) |
| Install Command | défaut (`npm install`) |

Avec `Root Directory = frontend`, Vercel utilise `frontend/package-lock.json`,
qui est bien versionné. Il n'y a **pas de `vercel.json` à créer** : les rewrites
viennent de `frontend/next.config.mjs`, et sans tableau de services il n'y a
aucun conflit de routage à arbitrer.

### Variables d'environnement

À définir pour **Production** et **Preview** :

| Variable | Valeur | Quand est-elle lue |
|---|---|---|
| `BACKEND_URL` | `https://api.exemple.com` | **au build** — voir piège n°1 |
| `NEXT_INTERNAL_API_URL` | `https://api.exemple.com/api` | à l'exécution (SSR, Server Components) |
| `NEXT_PUBLIC_API_URL` | `/api` | valeur par défaut du code — optionnel |

À ne **pas** définir :

- `PORT` — Vercel le gère.
- `NODE_ENV` — Vercel positionne `production` lui-même. Le forcer casse le build.
- `NEXT_PUBLIC_UPLOADS_URL` — lu par aucun fichier du dépôt.
- Tout secret du backend. Ils vivent sur l'hébergeur du backend, pas ici. Le
  frontend n'en a aucun besoin : il n'appelle l'API que par le proxy.

---

## Étape 3 — les migrations

Il n'y a pas d'équivalent Vercel au service `schema` du compose. Les migrations
se lancent une fois, depuis une machine qui atteint la base :

```bash
cd backend
DATABASE_URL='postgresql://...' npm run db:check      # dry-run : n'écrit rien
DATABASE_URL='postgresql://...' npm run db:bootstrap  # applique
```

`db:check` sort en code 1 si une migration déjà appliquée a été modifiée depuis
(voir « Les migrations » dans le README). À faire **avant** le premier démarrage
du backend : il ne crée pas le schéma lui-même.

---

## Vérification

À faire dans l'ordre — chaque étape isole une couche différente :

1. `https://api.exemple.com/api/health` → 200. Le backend est joignable en HTTPS.
2. `https://<domaine-vercel>/api/health` → 200. Le proxy Next fonctionne et
   `BACKEND_URL` a été figé correctement.
3. Ouvrir le site, se connecter. Vérifie le cookie `XSRF-TOKEN` (le CSRF est en
   double-soumission : cookie lisible par le JS + en-tête `X-XSRF-TOKEN`), donc
   aussi `COOKIE_SECURE`.
4. Uploader une image de produit depuis l'admin, puis **forcer un redéploiement
   du backend** et vérifier que l'image est toujours là. C'est le test qui
   distingue un volume qui persiste d'un disque éphémère.
5. `curl -I https://api.exemple.com/uploads/products/<fichier>` → 200. Les images
   sortent bien.
6. Ouvrir une page rendue côté serveur (fiche produit, collection) pour vérifier
   `NEXT_INTERNAL_API_URL`.

---

## Les six pièges

**1. `BACKEND_URL` est figé au moment du build.**
Next.js écrit la cible des rewrites dans `.next/routes-manifest.json`, et
`next.config.mjs` n'est pas recopié dans la sortie. Changer `BACKEND_URL` dans
les réglages Vercel **n'a aucun effet** tant qu'on ne relance pas un build. C'est
pourquoi le `docker-compose.yml` la passe en `build.args`. Corollaire : le nom
d'hôte du backend doit être **connu et stable avant le premier build Vercel**.

**2. Les déploiements de prévisualisation seront bloqués par le CORS.**
Chaque preview reçoit un domaine aléatoire
(`admin-panel-maxi-git-<branche>-<compte>.vercel.app`), impossible à pré-inscrire
dans `ALLOWED_ORIGINS` — qui vit dans l'image Docker du backend. Deux issues :
assigner un domaine d'alias stable à la branche de preview et l'ajouter à la
liste, ou accepter que les previews ne puissent pas appeler l'API. Ne pas élargir
`ALLOWED_ORIGINS` à `*.vercel.app` : n'importe qui peut déployer sur ce domaine.

**3. Le CSRF fonctionne à travers le proxy, à une condition près.**
Le cookie `XSRF-TOKEN` est posé sans attribut `Domain` : le navigateur le scope
donc au domaine Vercel, et Vercel relaie le `Set-Cookie` tel quel. Le JS peut le
lire (`httpOnly: false`) et le renvoyer en en-tête. La condition : `secure` vaut
`process.env.NODE_ENV === 'production'` (`csrf.js`). Si le backend tourne avec
`NODE_ENV=development` derrière un domaine HTTPS, le cookie part sans `Secure` ;
s'il tourne en production derrière du HTTP, il est rejeté. `NODE_ENV=production`
+ HTTPS, toujours.

**4. Les uploads traversent Vercel.**
La limite de `multer` est à 5 Mo (`upload.js`). La requête fait
navigateur → Vercel → backend. Si les uploads échouent alors que tout le reste
fonctionne, c'est la première chose à mesurer.

**5. Les images passent par le proxy, et c'est voulu.**
`getImageUrl()` (`frontend/lib/utils.ts`) dérive tout de `NEXT_PUBLIC_API_URL` :
avec la valeur par défaut `/api`, il produit des chemins **relatifs**
`/uploads/...`. Ceux-ci sont servis par Next.js puis réécrits vers le backend —
même origine, donc `images.remotePatterns` n'a pas à connaître le domaine du
backend. Ne pas définir `NEXT_PUBLIC_UPLOADS_URL` : cela produirait des URL
absolues vers le backend, et il faudrait alors déclarer son domaine dans
`remotePatterns` **et** vérifier le CORS de `/uploads`.

**6. `output: 'standalone'` et `outputFileTracingRoot` sont désactivés sur Vercel.**
`frontend/next.config.mjs` les conditionne à `!process.env.VERCEL`. Sur Vercel,
`standalone` est ignoré (Vercel produit sa propre sortie) et
`outputFileTracingRoot` est connu pour casser le déploiement
([vercel/next.js#83294](https://github.com/vercel/next.js/issues/83294)). En
Docker et en local, `VERCEL` est absent : le comportement reste exactement celui
décrit dans le README, et `npm run start` continue de lancer la sortie
standalone.

---

## Ce qui reste identique

- **Aucun changement de code applicatif.** Le frontend ne sait pas qu'il tourne
  sur Vercel : `/api` reste relatif, les rewrites font le reste.
- **Le `docker-compose.yml` reste utilisable tel quel** pour un déploiement
  entièrement auto-hébergé — c'est toujours la voie la plus simple si un domaine
  unique suffit.
- `frontend/scripts/start-standalone.mjs` n'est pas utilisé par Vercel. Il reste
  le chemin supporté pour Docker et `npm run start`.
