# MaxiStore — Maxi Admin Panel

Monorepo **à origine unique** : le storefront Next.js et l'API Express ne sont plus
deux projets séparés. Le navigateur ne parle qu'à **une seule origine** (Next.js,
port 3000), qui proxifie `/api/*` et `/uploads/*` vers l'API Express.

```
maxi-admin-panel/
├── backend/            API Express (port 3001, non exposée en Docker)
│   ├── sql/            Migrations ordonnées + migrations.manifest.json
│   ├── scripts/        apply-schema.mjs (runner de migrations)
│   └── Dockerfile
├── frontend/           Next.js 16 (port 3000, seule origine publique)
│   ├── scripts/        start-standalone.mjs
│   └── Dockerfile
├── scripts/            init-env.mjs, verify.mjs
├── docker-compose.yml
└── .env.example
```

## Pourquoi une origine unique

Avant, le storefront appelait l'API sur un autre port. Cookies, CORS et CSRF
devenaient dépendants de l'environnement : ce qui marchait en local cassait en
LAN ou derrière un domaine.

Ici, Next.js réécrit `/api/*` et `/uploads/*` vers Express
(`frontend/next.config.mjs`, section `rewrites()`, en `afterFiles` pour que les
routes locales `app/api/*` — `contact`, `revalidate` — restent prioritaires).
Le navigateur ne voit donc qu'une origine, et le même build tourne en local, en
LAN ou derrière un domaine sans reconfiguration.

> **`BACKEND_URL` est figé au moment du build.** Next.js écrit la cible des
> rewrites dans `.next/routes-manifest.json`, et `next.config.mjs` n'est pas
> recopié dans la sortie `standalone`. Changer `BACKEND_URL` au démarrage n'a
> donc **aucun effet** : il faut reconstruire. C'est pourquoi le
> `docker-compose.yml` le passe en `build.args` et non en `environment`.

**Deux topologies de déploiement.** Tout-en-un avec `docker compose` (plus bas),
ou storefront sur Vercel avec le backend en Docker — voir
**[DEPLOY-VERCEL.md](./DEPLOY-VERCEL.md)**, qui liste les variables à changer, la
configuration du projet Vercel, et les six pièges de cette séparation.

---

## Démarrage rapide (sans Docker)

```bash
npm run setup     # installe backend + frontend et génère les .env
npm run verify    # contrôle que tout est prêt
npm run dev       # API sur :3001 + storefront sur :3000
```

`npm run setup` enchaîne `install:all` puis `env:init`, qui **génère des secrets
aléatoires** dans `backend/.env` et crée `frontend/.env.local`. Il ne remplace
jamais un fichier existant.

Une base PostgreSQL est nécessaire. Le plus simple :

```bash
docker run -d --name maxistore-db -p 5432:5432 \
  -e POSTGRES_USER=maxistore -e POSTGRES_PASSWORD=maxistore -e POSTGRES_DB=maxistore \
  postgres:16-alpine

npm run db:bootstrap   # applique le schéma
npm run db:seed        # données de démonstration
```

### Les migrations

Le schéma n'est pas appliqué par un fichier unique mais par **17 migrations
ordonnées**, déclarées dans `backend/sql/migrations.manifest.json`. Cet ordre
n'est pas alphabétique et ne peut pas l'être : `000` doit précéder `001`, `005`
doit précéder `003`, `008` doit précéder `010`.

C'est aussi pourquoi `docker-entrypoint-initdb.d` n'est **pas** utilisé : ce
dossier applique les fichiers par ordre alphabétique, ce qui casse ces
dépendances.

```bash
npm run db:check       # dry-run : compare au registre et affiche ce qui reste, n'écrit rien
npm run db:bootstrap   # applique
```

Le runner est **idempotent** : chaque fichier appliqué est enregistré dans la
table `schema_migrations` avec son empreinte SHA-256, dans sa propre
transaction. Relancer ne réapplique que les fichiers **absents du registre** —
c'est le mécanisme normal d'ajout d'une migration. Un échec laisse les fichiers
déjà appliqués en place.

**Une migration appliquée est immuable.** Si le contenu d'un fichier déjà
appliqué change, le runner **refuse de démarrer** au lieu de le rejouer. C'est
délibéré, et mesuré : 9 des 17 migrations de cette chaîne ne sont pas
rejouables (`CREATE TYPE`, `ADD CONSTRAINT` et `CREATE INDEX` n'ont pas de
`IF NOT EXISTS` en PostgreSQL), et un rejeu produirait un schéma différent de
celui d'une installation neuve. Pour faire évoluer le schéma, ajouter un
**nouveau** fichier et l'inscrire dans le manifest. C'est le comportement de
Flyway, Prisma et Alembic.

`db:check` sort en **code 1** si une migration a été modifiée après application,
et affiche le décompte (`N à appliquer, M déjà à jour, K MODIFIEE`) : utilisable
tel quel en CI.

Deux fichiers sont **volontairement exclus** (voir la section `excluded` du
manifest, qui documente le motif de chacun) :

- `006_rename_guepex_tables.sql` — alternative destructrice abandonnée au profit
  de `006_create_standard_views.sql` ; les deux sont mutuellement exclusives.
- `complete-schema.sql` — instantané **pré-migration** dont les clés primaires
  (`user_id`, `product_id`) ne correspondent plus au code, qui utilise des clés
  nues (`id`). L'utiliser comme base casse la chaîne.

---

## Démarrage en production (local)

```bash
npm run build     # produit frontend/.next/standalone/
npm run start     # API + storefront en mode production
```

`npm start` lance le serveur **standalone** de Next.js
(`frontend/scripts/start-standalone.mjs`), pas `next start` : avec
`output: 'standalone'`, Next.js signale explicitement que `next start` n'est pas
supporté. Le script suit le chemin supporté et copie `public/` et
`.next/static/` à côté du serveur, exactement comme le fait le `Dockerfile`.

---

## Démarrage avec Docker

```bash
cp .env.example .env
# Remplacer TOUS les secrets par des valeurs générées :
#   node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
docker compose up -d --build
```

→ **http://localhost:3000**

Quatre services :

| Service | Rôle | Exposé sur l'hôte |
|---|---|---|
| `postgres` | Base PostgreSQL 16 | `POSTGRES_PORT` (défaut 5432) |
| `schema` | Applique les migrations, **one-shot**, puis s'arrête | non |
| `backend` | API Express | **non** — réseau interne uniquement |
| `frontend` | Next.js, point d'entrée unique | `WEB_PORT` (défaut 3000) |

Le service `schema` réutilise l'image du backend pour disposer de `pg` et des
dossiers `sql/` et `scripts/`. Le backend ne démarre qu'une fois le schéma
appliqué **avec succès** :

```yaml
depends_on:
  postgres:
    condition: service_healthy
  schema:
    condition: service_completed_successfully
```

Si `schema` échoue, `backend` et `frontend` ne démarrent pas — l'échec est
visible immédiatement au lieu de produire une application qui tourne sur un
schéma incomplet.

```bash
npm run docker:logs    # suivre les logs
npm run docker:down    # arrêter
npm run docker:reset   # tout recréer, volumes compris (DESTRUCTIF)
```

---

## Variables d'environnement

Deux modes, deux fichiers :

- **Sans Docker** — `backend/.env` et `frontend/.env.local`, générés par
  `npm run env:init`. Le `.env` racine n'est pas lu.
- **Avec Docker** — `.env` à la racine, dérivé de `.env.example` et lu par
  `docker compose`.

Les services externes (Google OAuth, SMTP, Guepex) sont **optionnels** : laisser
vide désactive l'intégration correspondante.

---

## Sécurité

- **Ne jamais committer un `.env`.** Les secrets y sont en clair.
- Les valeurs par défaut de `docker-compose.yml` (`dev-insecure-...`) servent
  uniquement au premier lancement : **à remplacer avant toute mise en ligne**.
  `npm run verify` échoue si les placeholders de `backend/.env` n'ont pas été
  régénérés.
- En production derrière TLS, passer `COOKIE_SECURE=true` et renseigner
  `PUBLIC_URL` / `ALLOWED_ORIGINS` avec le domaine réel.
- Un identifiant de base exposé accidentellement doit être **révoqué et
  régénéré** : le retirer du fichier ne suffit pas, il reste dans l'historique.

---

## Dépannage

**`next start` avertit qu'il ne supporte pas `output: standalone`.**
Normal : utiliser `npm run start`, qui lance le serveur standalone.

**Le conteneur frontend redémarre en boucle.**
Vérifier que `.next/standalone/server.js` existe bien **à la racine** de
`standalone/` :

```bash
ls frontend/.next/standalone/
```

S'il n'y a qu'un dossier `frontend/` et pas de `server.js`, Next.js a remonté
jusqu'au `package-lock.json` du monorepo. C'est le rôle de
`outputFileTracingRoot` dans `next.config.mjs` de l'empêcher : sans lui, la
sortie est imbriquée (`.next/standalone/frontend/server.js`) alors que le
`Dockerfile` lance `node server.js`.

**`relation "wilayas" is not a table` ou `column "commune_id" does not exist`.**
Les migrations ont été appliquées dans le mauvais ordre, ou une partie
seulement. Repartir d'une base vide et relancer `npm run db:bootstrap`, qui
respecte l'ordre du manifest.

**`Cette migration a deja ete appliquee, mais son contenu a change.`**
Le runner a détecté qu'un fichier déjà appliqué a été édité, et refuse de
poursuivre. C'est voulu (voir « Les migrations »). Ajouter un **nouveau**
fichier de migration et l'inscrire dans `migrations.manifest.json`, ou repartir
d'une base vide avec `npm run docker:reset` si rien n'est en production.

**Le proxy `/api` renvoie 502.**
Le backend n'est pas joignable. Vérifier `http://localhost:3001/api/health`,
puis `BACKEND_URL` — en se rappelant qu'il est figé au build.

---

## Scripts disponibles

| Script | Effet |
|---|---|
| `npm run setup` | Installe les dépendances et génère les `.env` |
| `npm run verify` | Contrôle l'installation (dépendances, env, build) |
| `npm run dev` | API + storefront en développement |
| `npm run build` | Build de production du frontend |
| `npm run start` | API + storefront en production |
| `npm run typecheck` | `tsc --noEmit` sur le frontend |
| `npm run lint` | ESLint sur le frontend |
| `npm run db:check` | Dry-run des migrations |
| `npm run db:bootstrap` | Applique les migrations |
| `npm run db:seed` | Données de démonstration |
| `npm run docker:up` / `down` / `logs` / `reset` | Cycle de vie Docker |
