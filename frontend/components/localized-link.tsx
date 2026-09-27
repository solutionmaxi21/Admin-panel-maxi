"use client"

import Link, { LinkProps } from "next/link"
import { usePathname } from "next/navigation"
import React from "react"

interface LocalizedLinkProps extends Omit<LinkProps, 'href'> {
  href: string
  children: React.ReactNode
  className?: string
  [key: string]: any
}

export function LocalizedLink({ href, children, ...props }: LocalizedLinkProps) {
  const pathname = usePathname()
  const locale = pathname?.split('/')[1] || 'fr'
  
  // If href already has locale, use as-is
  if (href.startsWith('/fr/') || href.startsWith('/ar/')) {
    return <Link href={href} {...props}>{children}</Link>
  }
  
  // Add locale prefix
  const localizedHref = href.startsWith('/') ? `/${locale}${href}` : `/${locale}/${href}`
  
  return <Link href={localizedHref} {...props}>{children}</Link>
}
