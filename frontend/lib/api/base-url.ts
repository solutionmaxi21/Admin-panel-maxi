/**
 * Resolution de l'URL de base de l'API.
 *
 * Architecture MaxiStore : UNE SEULE ORIGINE PUBLIQUE.
 * Le navigateur appelle toujours une URL relative (`/api`) servie par le
 * serveur Next.js, qui proxifie vers l'API Express via les `rewrites` de
 * next.config.mjs. Consequence : le meme build fonctionne en local, en LAN,
 * derriere ngrok ou un domaine, sans reconfiguration ni probleme de CORS.
 *
 * Les appels cote serveur (SSR, Server Components, route handlers) ne peuvent
 * pas utiliser d'URL relative : ils passent par NEXT_INTERNAL_API_URL, qui vise
 * l'API directement (localhost en dev, `backend` sous Docker).
 */

const DEFAULT_PUBLIC_API_URL = '/api'
const DEFAULT_INTERNAL_API_URL = 'http://localhost:3001/api'

function isLoopback(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
}

/**
 * URL de base de l'API, adaptee au contexte d'execution (serveur ou navigateur).
 */
export function getApiBaseUrl(): string {
  const publicApiUrl = process.env.NEXT_PUBLIC_API_URL || DEFAULT_PUBLIC_API_URL
  const internalApiUrl = process.env.NEXT_INTERNAL_API_URL || DEFAULT_INTERNAL_API_URL

  // Cote serveur : une URL absolue est obligatoire.
  if (typeof window === 'undefined') {
    return internalApiUrl
  }

  // Cote navigateur : une URL relative est valable quelle que soit l'origine.
  if (publicApiUrl.startsWith('/')) {
    return publicApiUrl
  }

  // Une URL absolue loopback configuree explicitement, mais une page ouverte
  // depuis un autre hote (telephone sur le LAN, ngrok, domaine...) : on retombe
  // sur l'origine courante plutot que de laisser l'appel echouer.
  try {
    const configured = new URL(publicApiUrl)
    if (isLoopback(configured.hostname) && !isLoopback(window.location.hostname)) {
      return '/api'
    }
  } catch {
    // Valeur non analysable : retournee telle quelle.
  }

  return publicApiUrl
}

/**
 * URL publique de l'API telle que configuree.
 *
 * Reste volontairement relative par defaut (`/api`) : `getImageUrl()` en derive
 * des chemins `/uploads/...` qui passent par le proxy Next, ce qui evite d'avoir
 * a declarer `localhost` dans `images.remotePatterns`.
 */
export function getPublicApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL || DEFAULT_PUBLIC_API_URL
}
