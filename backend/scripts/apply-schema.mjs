#!/usr/bin/env node
/**
 * Applique la chaine de migrations PostgreSQL du projet.
 *
 * L'ordre est defini par `sql/migrations.manifest.json` et n'est PAS
 * alphabetique : voir le `$comment` du manifest pour les trois dependances qui
 * l'imposent. C'est aussi pourquoi ce script existe plutot qu'un montage du
 * dossier dans `docker-entrypoint-initdb.d`.
 *
 * Proprietes :
 *   - chaque fichier est applique dans SA propre transaction ; un echec
 *     n'annule pas les fichiers deja appliques avec succes ;
 *   - idempotent : une table de suivi `schema_migrations` enregistre le nom et
 *     l'empreinte SHA-256 de chaque fichier. Un fichier deja applique et
 *     inchange est ignore ; un fichier deja applique dont le contenu a CHANGE
 *     provoque une erreur (voir ci-dessous) ;
 *   - une migration appliquee est IMMUABLE. Rejouer un fichier modifie est
 *     refuse, pour deux raisons mesurees sur cette chaine : 9 des 17 fichiers
 *     ne sont pas rejouables (`CREATE TYPE`, `ADD CONSTRAINT` et `CREATE INDEX`
 *     n'ont pas de `IF NOT EXISTS` en PostgreSQL), et un rejeu produirait de
 *     toute facon un schema different de celui d'une installation neuve. C'est
 *     le comportement de Flyway / Prisma / Alembic : on echoue bruyamment
 *     plutot que de deviner. Pour faire evoluer le schema, ajouter un NOUVEAU
 *     fichier et l'inscrire dans le manifest ;
 *   - les metacommandes psql (lignes commencant par un antislash), que le
 *     protocole de `pg` ne sait pas analyser, sont retirees avec un compte
 *     rendu ;
 *   - un fichier contenant `CONCURRENTLY` est execute hors transaction, cas ou
 *     PostgreSQL l'interdit.
 *
 * Usage :
 *   node scripts/apply-schema.mjs            applique ce qui reste a appliquer
 *   node scripts/apply-schema.mjs --check    dry-run : compare au registre et
 *                                            affiche ce qui reste a appliquer,
 *                                            sans rien ecrire
 *   node scripts/apply-schema.mjs --verbose  detaille chaque fichier
 *
 * Variables d'environnement :
 *   DATABASE_URL   obligatoire. Fournie par backend/.env en local, ou par
 *                  docker-compose.yml.
 */

import { readFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SQL_DIR = path.resolve(HERE, '..', 'sql')
const MANIFEST_PATH = path.join(SQL_DIR, 'migrations.manifest.json')

const ARGS = new Set(process.argv.slice(2))
const CHECK_ONLY = ARGS.has('--check')
const VERBOSE = ARGS.has('--verbose')

/** Le protocole simple de `pg` ne comprend pas les metacommandes psql. */
const BACKSLASH_CODE = 92

function stripPsqlMetaCommands(sql) {
  const kept = []
  let removed = 0

  for (const line of sql.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (trimmed.length > 0 && trimmed.charCodeAt(0) === BACKSLASH_CODE) {
      removed++
      continue
    }
    kept.push(line)
  }

  return { sql: kept.join('\n'), removed }
}

function checksum(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

function loadManifest() {
  if (!existsSync(MANIFEST_PATH)) {
    throw new Error(`Manifest introuvable : ${MANIFEST_PATH}`)
  }
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'))
  if (!Array.isArray(manifest.migrations) || manifest.migrations.length === 0) {
    throw new Error('Le manifest ne declare aucune migration.')
  }
  return manifest
}

/**
 * Neon et la plupart des bases managees exigent TLS. `pg` ne deduit pas
 * `sslmode=require` de l'URL de facon fiable : on l'active explicitement.
 */
function resolveSsl(connectionString) {
  try {
    const { hostname } = new URL(connectionString)
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return false
  } catch {
    return false
  }
  return { rejectUnauthorized: false }
}

const LEDGER_DDL = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    filename    TEXT PRIMARY KEY,
    checksum    TEXT NOT NULL,
    applied_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    duration_ms INTEGER
  )
`

async function readLedger(client) {
  const { rows } = await client.query('SELECT filename, checksum FROM schema_migrations')
  return new Map(rows.map((r) => [r.filename, r.checksum]))
}

async function main() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    console.error('✗ DATABASE_URL est absent de l\'environnement.')
    process.exit(1)
  }

  const manifest = loadManifest()
  const client = new pg.Client({ connectionString, ssl: resolveSsl(connectionString) })
  await client.connect()

  let applied = 0
  let skipped = 0
  let pending = 0
  let modified = 0
  let metaRemoved = 0

  try {
    // En mode --check on n'ecrit rien, pas meme la table de suivi. On lit le
    // registre uniquement s'il existe deja : le creer serait deja une ecriture,
    // et sur une base vierge il n'y a de toute facon rien a comparer. Sans cette
    // lecture, la comparaison plus bas porte sur une Map vide et TOUS les
    // fichiers sont annonces comme a appliquer, meme sur une base a jour.
    let ledger = new Map()
    if (CHECK_ONLY) {
      const { rows } = await client.query(
        "SELECT to_regclass('public.schema_migrations') IS NOT NULL AS present"
      )
      if (rows[0].present) ledger = await readLedger(client)
      console.log('Mode --check : aucune ecriture.')
    } else {
      await client.query(LEDGER_DDL)
      ledger = await readLedger(client)
      console.log(`Base : ${new URL(connectionString).pathname.slice(1)}`)
    }

    for (const entry of manifest.migrations) {
      const filePath = path.join(SQL_DIR, entry.file)
      if (!existsSync(filePath)) {
        console.error(`✗ Fichier manquant : ${entry.file}`)
        process.exitCode = 1
        break
      }

      const raw = readFileSync(filePath, 'utf8')
      const { sql, removed } = stripPsqlMetaCommands(raw)
      metaRemoved += removed
      const sum = checksum(raw)

      const recorded = ledger.get(entry.file)

      if (recorded === sum) {
        skipped++
        if (VERBOSE) console.log(`  = ${entry.file} (deja applique)`)
        continue
      }

      // En --check on se contente de RAPPORTER. Le refus ci-dessous ne doit pas
      // s'appliquer ici : il interromprait le scan et le resume annoncerait un
      // etat faux (c'est le bug qui a rendu ce mode mensonger).
      if (CHECK_ONLY) {
        if (recorded !== undefined) {
          modified++
          console.log(`  !! ${entry.file}  (MODIFIEE depuis son application : erreur)`)
        } else {
          pending++
          console.log(`  -> ${entry.file}`)
        }
        continue
      }

      // Application reelle : deja applique mais contenu change -> on refuse de
      // rejouer. Voir le commentaire d'en-tete — rejouer produirait un schema
      // different de celui d'une installation neuve, et echouerait de toute
      // facon sur les `CREATE TYPE` / `ADD CONSTRAINT` sans garde.
      if (recorded !== undefined) {
        console.error(`✗ ${entry.file}`)
        console.error('  Cette migration a deja ete appliquee, mais son contenu a change.')
        console.error('  Une migration appliquee est immuable. Pour faire evoluer le schema :')
        console.error('    - ajouter un NOUVEAU fichier de migration et l\'inscrire dans le manifest ;')
        console.error('    - ou repartir d\'une base vide (npm run docker:reset) si rien n\'est en production.')
        process.exitCode = 1
        break
      }

      const useTransaction = !/CONCURRENTLY/i.test(sql)
      const startedAt = Date.now()

      try {
        if (useTransaction) await client.query('BEGIN')
        await client.query(sql)
        await client.query(
          `INSERT INTO schema_migrations (filename, checksum, duration_ms)
           VALUES ($1, $2, $3)
           ON CONFLICT (filename)
           DO UPDATE SET checksum = EXCLUDED.checksum,
                         applied_at = CURRENT_TIMESTAMP,
                         duration_ms = EXCLUDED.duration_ms`,
          [entry.file, sum, Date.now() - startedAt]
        )
        if (useTransaction) await client.query('COMMIT')

        applied++
        const secs = ((Date.now() - startedAt) / 1000).toFixed(2)
        console.log(`✓ ${entry.file}  (${secs}s)`)
      } catch (error) {
        if (useTransaction) await client.query('ROLLBACK').catch(() => {})
        console.error(`✗ ${entry.file}`)
        console.error(`  ${error.message.split('\n')[0]}`)
        process.exitCode = 1
        break
      }
    }
  } finally {
    await client.end().catch(() => {})
  }

  if (metaRemoved > 0) {
    console.log(`(${metaRemoved} metacommande(s) psql ignoree(s))`)
  }
  if (CHECK_ONLY) {
    console.log(
      `--- ${pending} a appliquer, ${skipped} deja a jour` +
        (modified > 0 ? `, ${modified} MODIFIEE(S)` : '')
    )
    if (modified > 0) {
      console.error(
        `${modified} migration(s) modifiee(s) apres application : a remplacer par un nouveau fichier.`
      )
      process.exitCode = 1
    } else {
      console.log(
        pending === 0
          ? 'Rien a faire : le schema est deja a jour.'
          : 'Relancer sans --check pour appliquer.'
      )
    }
  } else {
    console.log(`--- ${applied} applique(s), ${skipped} deja a jour`)
    if (process.exitCode) {
      console.error('La chaine de migrations s\'est arretee sur une erreur.')
    } else {
      console.log('Schema a jour.')
    }
  }
}

main().catch((error) => {
  console.error(`✗ ${error.message}`)
  process.exit(1)
})
