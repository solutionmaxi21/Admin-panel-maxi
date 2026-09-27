import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const locales = ['fr', 'ar']
const defaultLocale = 'fr'

// Protected routes that require authentication
// Note: The actual auth check happens in the page components via useAuth hook
// This just prevents completely unauthenticated access to these routes
const PROTECTED_ROUTES = [
  '/account',
  '/checkout',
  '/orders',
  '/order-success'
]

const AUTH_ROUTES = [
  '/login',
  '/signup',
  '/forgot-password'
]

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 1. Handle Locale
  const pathnameHasLocale = locales.some(
    (locale) => pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`
  )

  if (!pathnameHasLocale) {
    const locale = getLocale(request)
    request.nextUrl.pathname = `/${locale}${pathname}`
    return NextResponse.redirect(request.nextUrl)
  }

  // 2. Handle Authentication via Cookie Presence
  // NOTE: This is a SOFT check - cookie presence doesn't guarantee auth validity
  // Actual auth validation happens in AuthProvider on page load
  const locale = pathname.split('/')[1]
  const pathWithoutLocale = pathname.replace(`/${locale}`, '') || '/'
  const hasAccessToken = request.cookies.has('accessToken')
  const hasRefreshToken = request.cookies.has('refreshToken')
  const hasAnyAuthToken = hasAccessToken || hasRefreshToken

  const isProtectedRoute = PROTECTED_ROUTES.some(route => 
    pathWithoutLocale.startsWith(route)
  )

  // If protected route and NO cookies at all (neither access nor refresh), redirect to login
  // If refreshToken exists, let the page load - AuthProvider will refresh the access token
  if (isProtectedRoute && !hasAnyAuthToken) {
    return NextResponse.redirect(new URL(`/${locale}/login`, request.url))
  }

  const isAuthRoute = AUTH_ROUTES.some(route => 
    pathWithoutLocale.startsWith(route)
  )

  // If auth route and user has a valid access token, redirect to account (user already logged in)
  // Only check accessToken here — refreshToken alone means session may be expired
  if (isAuthRoute && hasAccessToken) {
    return NextResponse.redirect(new URL(`/${locale}/account`, request.url))
  }

  return NextResponse.next()
}

function getLocale(request: NextRequest): string {
  const cookieLocale = request.cookies.get('NEXT_LOCALE')?.value
  if (cookieLocale && locales.includes(cookieLocale)) return cookieLocale

  const acceptLanguage = request.headers.get('accept-language')
  if (acceptLanguage) {
    const languages = acceptLanguage.split(',').map(lang => {
      const [code] = lang.split(';')
      return code.trim().split('-')[0]
    })
    for (const lang of languages) {
      if (locales.includes(lang)) return lang
    }
  }
  return defaultLocale
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|icon.jpg|logo.jpg|hero.webp|.*\\..*|_next).*)',
  ],
}