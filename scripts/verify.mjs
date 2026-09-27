#!/usr/bin/env node
/**
 * MaxiStore — verification de l'installation
 * ------------------------------------------
 * Controle que le monorepo est pret a tourner : dependances installees,
 * fichiers d'environnement presents, ports coherents.
 *
 * Usage: npm run verify
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))

const checks = []
const check = (label, ok, hint) => checks.push({ label, ok, hint })

// --- Dependances -------------------------------------------------
check(
  'backend/node_modules',
  existsSync(join(ROOT, 'backend', 'node_modules')),
  'npm run install:all'
)
check(
  'frontend/node_modules',
  existsSync(join(ROOT, 'frontend', 'node_modules')),
  'npm run install:all'
)
check(
  'node_modules (racine, concurrently)',
  existsSync(join(ROOT, 'node_modules')),
  'npm install'
)

// --- Environnement -----------------------------------------------
check('backend/.env', existsSync(join(ROOT, 'backend', '.env')), 'npm run env:init')
check('frontend/.env.local', existsSync(join(ROOT, 'frontend', '.env.local')), 'npm run env:init')

// --- Secrets par defaut encore en place --------------------------
const backendEnvPath = join(ROOT, 'backend', '.env')
if (existsSync(backendEnvPath)) {
  const env = readFileSync(backendEnvPath, 'utf8')
  const placeholders = [
    ['JWT_ACCESS_SECRET personnalise', /JWT_ACCESS_SECRET=GENERATE_YOUR_OWN/],
    ['JWT_REFRESH_SECRET personnalise', /JWT_REFRESH_SECRET=GENERATE_YOUR_OWN/],
    ['HMAC_SECRET personnalise', /HMAC_SECRET=GENERATE_YOUR_OWN/],
    ['DATABASE_URL personnalise', /DATABASE_URL=postgresql:\/\/username:password@/],
  ]
  for (const [name, re] of placeholders) {
    check(name, !re.test(env), 'valeur par defaut detectee — regenerer backend/.env puis npm run env:init')
  }
}

// --- Artefacts de build ------------------------------------------
check(
  'frontend/.next (build)',
  existsSync(join(ROOT, 'frontend', '.next')),
  'npm run build'
)

// --- Rapport ------------------------------------------------------
let failures = 0
console.log("\n  MaxiStore — verification de l'installation\n")

for (const { label, ok, hint } of checks) {
  if (!ok) failures++
  const mark = ok ? 'OK  ' : 'FAIL'
  console.log(`  [${mark}] ${label}`)
  if (!ok && hint) console.log(`           -> ${hint}`)
}

console.log('')
if (failures === 0) {
  console.log('  Tout est pret. Lance le projet avec : npm run dev\n')
  process.exit(0)
}

console.log(`  ${failures} point(s) a corriger (voir ci-dessus).\n`)
process.exit(1)
