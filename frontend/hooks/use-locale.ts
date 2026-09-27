"use client"

import { usePathname } from "next/navigation"

export function useLocale() {
  const pathname = usePathname()
  const locale = pathname?.split('/')[1] as 'fr' | 'ar' || 'fr'
  
  const getLocalizedPath = (path: string) => {
    // Remove leading slash if present
    const cleanPath = path.startsWith('/') ? path.slice(1) : path
    return `/${locale}/${cleanPath}`
  }
  
  return {
    locale,
    getLocalizedPath,
  }
}
