#!/usr/bin/env node
/**
 * Demarre le serveur Next.js en sortie `standalone`.
 *
 * Pourquoi ce script existe
 * -------------------------
 * Avec `output: 'standalone'`, Next.js affiche au demarrage :
 *
 *   "next start" does not work with "output: standalone" configuration.
 *   Use "node .next/standalone/server.js" instead.
 *
 * `next start` continue de repondre, mais emprunte un chemin non supporte.
 * Ce script suit le chemin supporte, et surtout il rend le demarrage local
 * IDENTIQUE au conteneur : le stage `runner` du Dockerfile copie `public/` et
 * `.next/static` dans la sortie standalone, puis lance `node server.js`. Faire
 * pareil en local evite qu'un bug ne se manifeste qu'en production.
 *
 * Ordre d'execution
 * -----------------
 *   npm run build        # produit .next/standalone/
 *   npm run start        # ce script
 *
 * Variables d'environnement lues par le serveur genere : PORT et HOSTNAME.
 */
import { cpSync, existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const FRONTEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const STANDALONE_DIR = path.join(FRONTEND_DIR, '.next', 'standalone')
const SERVER_JS = path.join(STANDALONE_DIR, 'server.js')

if (!existsSync(SERVER_JS)) {
  console.error(
    [
      '',
      '  Sortie standalone introuvable :',
      `    ${SERVER_JS}`,
      '',
      '  Generez-la d\'abord :',
      '    npm run build',
      '',
      '  Si `.next/standalone/` existe mais sans `server.js` a sa racine,',
      '  la sortie est imbriquee : verifiez `outputFileTracingRoot` dans',
      '  next.config.mjs. Le Dockerfile copie `.next/standalone` dans `/app`',
      '  puis lance `node server.js` ; une sortie imbriquee produit',
      '  `.next/standalone/frontend/server.js` et le conteneur ne demarre pas.',
      '',
    ].join('\n')
  )
  process.exit(1)
}

// Ces deux dossiers ne font pas partie de la trace de build : Next.js ne peut
// pas les inclure seul, ils doivent etre copies a cote du serveur.
const copies = [
  [path.join(FRONTEND_DIR, 'public'), path.join(STANDALONE_DIR, 'public')],
  [path.join(FRONTEND_DIR, '.next', 'static'), path.join(STANDALONE_DIR, '.next', 'static')],
]

for (const [from, to] of copies) {
  if (!existsSync(from)) {
    console.warn(`  Ignore (absent) : ${path.relative(FRONTEND_DIR, from)}`)
    continue
  }
  cpSync(from, to, { recursive: true, force: true })
}

const port = process.env.PORT || '3000'
const hostname = process.env.HOSTNAME || '0.0.0.0'

console.log(`  Next.js standalone -> http://localhost:${port}`)

// `cwd` sur le dossier standalone : `server.js` resout ses chemins relativement
// a lui-meme, comme dans le conteneur ou il est lance depuis `/app`.
const child = spawn(process.execPath, [SERVER_JS], {
  stdio: 'inherit',
  cwd: STANDALONE_DIR,
  env: { ...process.env, PORT: port, HOSTNAME: hostname },
})

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exit(code ?? 0)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal))
}
