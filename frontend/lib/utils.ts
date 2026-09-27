import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { getPublicApiBaseUrl } from '@/lib/api/base-url'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Format price in Algerian Dinar
export function formatPrice(price: number): string {
  return new Intl.NumberFormat('fr-DZ', {
    style: 'decimal',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price) + ' DZD'
}

// Calculate discount percentage
export function calculateDiscount(originalPrice: number, salePrice: number): number {
  if (!originalPrice || !salePrice || salePrice >= originalPrice) return 0
  return Math.round((1 - salePrice / originalPrice) * 100)
}

// Get effective price (sale price if available, otherwise current price)
export function getEffectivePrice(currentPrice: number, salePrice: number | null): number {
  return salePrice || currentPrice
}

// Truncate text with ellipsis
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength).trim() + '...'
}

// Generate slug from text
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/--+/g, '-')
    .trim()
}

// API image URL helper
export function getImageUrl(path: string | undefined): string {
  if (!path) return '/placeholder.svg'
  if (path.startsWith('http')) return path
  // If path starts with /uploads, always use backend
  if (path.startsWith('/uploads/')) {
    const apiUrl = getPublicApiBaseUrl()
    const baseUrl = apiUrl.replace('/api', '')
    return `${baseUrl}${path}`
  }
  // If path starts with /, treat as public asset (logo, placeholder, etc)
  if (path.startsWith('/')) return path
  // Otherwise, treat as relative to /uploads
  const apiUrl = getPublicApiBaseUrl()
  const baseUrl = apiUrl.replace('/api', '')
  return `${baseUrl}/uploads/${path}`
}
