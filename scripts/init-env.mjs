#!/usr/bin/env node
/**
 * MaxiStore — initialisation de l'environnement
 * ---------------------------------------------
 * Genere les fichiers .env a partir des .env.example, avec des secrets
 * aleatoires forts. Ne remplace jamais un .env deja existant.
 *
 * Usage: npm run env:init
 */

import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const BACKEND = join(ROOT, 'backend')
const FRONTEND = join(ROOT, 'frontend')

const secret = (bytes = 64) => randomBytes(bytes).toString('hex')

const created = []
const skipped = []

function writeIfAbsent(file, content) {
  if (existsSync(file)) {
    skipped.push(file)
    return false
  }
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, content, 'utf8')
  created.push(file)
  return true
}

// ---------------------------------------------------------------
// 1. backend/.env — derive de backend/.env.example
// ---------------------------------------------------------------
const backendExample = join(BACKEND, '.env.example')
const backendEnv = join(BACKEND, '.env')

if (existsSync(backendExample)) {
  let tpl = readFileSync(backendExample, 'utf8')

  const replacements = {
    DATABASE_URL: 'postgresql://maxistore:maxistore@localhost:5432/maxistore',
    JWT_ACCESS_SECRET: secret(),
    JWT_REFRESH_SECRET: secret(),
    HMAC_SECRET: secret(32),
    GUEPEX_WEBHOOK_SECRET: secret(32),
    REVALIDATION_SECRET: secret(32),
    NODE_ENV: 'development',
    COOKIE_SECURE: 'false',
    ALLOWED_ORIGINS: 'http://localhost:3000',
    CLIENT_URL: 'http://localhost:3000',
    FRONTEND_URL: 'http://localhost:3000',
    STORE_URL: 'http://localhost:3000',
    LOG_PRETTY: 'true',
  }

  for (const [key, value] of Object.entries(replacements)) {
    const re = new RegExp(`^${key}=.*$`, 'm')
    if (re.test(tpl)) {
      tpl = tpl.replace(re, `${key}=${value}`)
    } else {
      tpl += `\n${key}=${value}\n`
    }
  }

  const header = [
    '# ===============================================',
    '# Genere automatiquement par scripts/init-env.mjs',
    '# Ne pas committer. Regenerer : npm run env:init',
    '# ===============================================',
    '',
  ].join('\n')

  writeIfAbsent(backendEnv, header + tpl)
} else {
  console.warn(`[env] .env.example backend introuvable: ${backendExample}`)
}

// ---------------------------------------------------------------
// 2. frontend/.env.local — origine unique via rewrites Next
// ---------------------------------------------------------------
const frontendEnv = join(FRONTEND, '.env.local')
writeIfAbsent(
  frontendEnv,
  [
    '# ===============================================',
    '# Genere automatiquement par scripts/init-env.mjs',
    '# ===============================================',
    '',
    '# Le navigateur appelle TOUJOURS la meme origine (le serveur Next.js),',
    "# qui proxifie /api et /uploads vers l'API Express (voir next.config.mjs).",
    '# => fonctionne en local, en LAN, derriere ngrok ou un domaine, sans changement.',
    'NEXT_PUBLIC_API_URL=/api',
    '',
    '# Appels cote serveur (SSR / Server Components) : URL absolue requise.',
    'NEXT_INTERNAL_API_URL=http://localhost:3001/api',
    '',
    '# Images produits servies par l\'API Express',
    'NEXT_PUBLIC_UPLOADS_URL=http://localhost:3001',
    '',
  ].join('\n')
)

// ---------------------------------------------------------------
// Rapport
// ---------------------------------------------------------------
console.log("\n[env] Initialisation de l'environnement MaxiStore")
for (const f of created) console.log(`  cree     ${f.replace(ROOT, '.')}`)
for (const f of skipped) console.log(`  conserve ${f.replace(ROOT, '.')} (deja present)`)

if (created.length === 0) {
  console.log('\n[env] Rien a faire — tous les fichiers existent deja.')
} else {
  console.log('\n[env] Termine. Pense a renseigner les identifiants externes')
  console.log('      (Google OAuth, SMTP, Guepex) dans backend/.env si besoin.')
}
console.log('')
