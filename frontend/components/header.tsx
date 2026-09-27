"use client"

import type React from "react"
import { CONTACT_INFO } from '../config/constants';
import Link from "next/link"
import Image from "next/image"
import { useState, useEffect } from "react"
import { ShoppingCart, User, Search, Menu, X, ChevronDown, Check, Languages } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useCart } from "@/lib/cart-context"
import { useAuth } from "@/lib/auth-context"
import { categoriesApi, type Category } from "@/lib/api"
import { useRouter } from "next/navigation"
import { useLanguage } from "@/lib/language-context"
import NotificationCenter from "@/components/notifications/NotificationCenter"

// Helper to get localized text from bilingual object or string
const getLocalizedName = (value: string | { fr?: string; ar?: string } | null | undefined, locale: string = 'fr'): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    return (locale === 'ar' ? value.ar || value.fr : value.fr || value.ar) || '';
  }
  return value;
};

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [categories, setCategories] = useState<Category[]>([])
  const [logoutDialog, setLogoutDialog] = useState(false)
  const { totalItems } = useCart()
  const { user, logout, isAuthenticated, isLoading: authLoading } = useAuth()
  const { t, language, setLanguage } = useLanguage()
  const router = useRouter()

  // Fetch categories on mount
  useEffect(() => {
    const fetchCategories = async () => {
      const result = await categoriesApi.getAll()
      if (result.data) {
        setCategories(result.data)
      }
    }
    fetchCategories()
  }, [])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      router.push(`/store?search=${encodeURIComponent(searchQuery)}`)
    }
  }

  return (
    <>
      <header className="sticky top-0 z-50 bg-background border-b border-border ">
        {/* Top Bar - Contact Info */}
        <div className="hidden xl:block bg-gradient-to-r from-blue-900 to-blue-800 text-white text-sm leading-none">
          <div className="container mx-auto px-6 py-2.5">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-6">
                <a href={`tel:${CONTACT_INFO.phone.primary}`} className="flex items-center gap-2 hover:text-orange-400 transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  <span dir="ltr" style={{ direction: 'ltr', unicodeBidi: 'isolate' }}>{CONTACT_INFO.phone.display.primary}</span>
                </a>
                <a href={`tel:${CONTACT_INFO.phone.secondary}`} className="flex items-center gap-2 hover:text-orange-400 transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  <span dir="ltr" style={{ direction: 'ltr', unicodeBidi: 'isolate' }}>{CONTACT_INFO.phone.display.secondary}</span>
                </a>
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span>{CONTACT_INFO.address.street}, {CONTACT_INFO.address.city}</span>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-white/80">{t.header.followUs}</span>
                <div className="flex gap-3">
                  <a href="https://www.facebook.com/SolutionMaxiAlgerie/" target="_blank" rel="noopener noreferrer" className="hover:text-orange-400 transition-colors">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                    </svg>
                  </a>
                  <a href="https://www.instagram.com/solutionmaxi/" target="_blank" rel="noopener noreferrer" className="hover:text-orange-400 transition-colors">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                    </svg>
                  </a>
                  <a href="https://www.linkedin.com/company/solution-maxi" target="_blank" rel="noopener noreferrer" className="hover:text-orange-400 transition-colors">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                    </svg>
                  </a>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="text-white hover:text-orange-400 h-auto px-2 py-1 gap-1">
                      <Languages className="h-4 w-4" aria-hidden="true" />
                      <span className="text-xs">{language === 'ar' ? 'عربي' : 'FR'}</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="bg-white">
                    <DropdownMenuItem onClick={() => setLanguage("fr")} className="cursor-pointer justify-between">
                      <span>Français</span>
                      {language === 'fr' && <Check className="h-4 w-4" aria-hidden="true" />}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setLanguage("ar")} className="cursor-pointer justify-between">
                      <span>العربية</span>
                      {language === 'ar' && <Check className="h-4 w-4" aria-hidden="true" />}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
        </div>

        {/* Main header */}
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-4">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2 shrink-0">
              <Image
                src="/logo.jpg"
                alt="Solution Maxi Logo"
                width={140}
                height={45}
                className="h-10 w-auto object-contain"
                priority
              />
            </Link>

            {/* Search bar - desktop */}
            <form onSubmit={handleSearch} className="hidden md:flex flex-1 max-w-xl">
              <div className="relative w-full">
                <Search className={`absolute ${language === 'ar' ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground`} aria-hidden="true" />
                <Input
                  type="search"
                  placeholder={t.header.searchPlaceholder}
                  className={`w-full ${language === 'ar' ? 'pr-10 pl-4' : 'pl-10 pr-4'}`}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Button type="submit" className={`ml-2 bg-secondary hover:bg-secondary/90 text-secondary-foreground ${language === 'ar' ? 'mr-2 ml-0' : 'ml-2'}`}>
                {t.header.searchButton}
              </Button>
            </form>

            {/* Actions */}
            <div className="flex items-center gap-2">
              {isAuthenticated && <NotificationCenter />}

              <Link href="/cart" className="relative">
                <Button variant="ghost" size="icon">
                  <ShoppingCart className="h-5 w-5" aria-hidden="true" />
                  {totalItems > 0 && (
                    <Badge className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center bg-secondary text-secondary-foreground">
                      {totalItems}
                    </Badge>
                  )}
                </Button>
              </Link>

              {authLoading ? (
                <Button variant="ghost" className="gap-2" disabled>
                  <User className="h-5 w-5" aria-hidden="true" />
                </Button>
              ) : isAuthenticated ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="gap-2">
                      <User className="h-5 w-5" aria-hidden="true" />
                      <span className="hidden sm:inline">{user?.firstName}</span>
                      <ChevronDown className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild>
                      <Link href="/account">{t.header.myAccount}</Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/orders">{t.header.myOrders}</Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/favorites">{language === 'ar' ? 'المفضلة' : 'Favoris'}</Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setLanguage("fr")} className="justify-between">
                      <span>Français</span>
                      {language === 'fr' && <Check className="h-4 w-4" aria-hidden="true" />}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setLanguage("ar")} className="justify-between">
                      <span>العربية</span>
                      {language === 'ar' && <Check className="h-4 w-4" aria-hidden="true" />}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setLogoutDialog(true)}>{t.header.logout}</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <Link href="/login">
                  <Button variant="ghost" className="gap-2">
                    <User className="h-5 w-5" aria-hidden="true" />
                    <span className="hidden sm:inline">{t.header.login}</span>
                  </Button>
                </Link>
              )}

              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              >
                {mobileMenuOpen ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
              </Button>
            </div>
          </div>

          {/* Mobile search */}
          <form onSubmit={handleSearch} className="md:hidden mt-4">
            <div className="relative">
              <Search className={`absolute ${language === 'ar' ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground`} aria-hidden="true" />
              <Input
                type="search"
                placeholder={t.header.searchMobilePlaceholder}
                className={`w-full ${language === 'ar' ? 'pr-10' : 'pl-10'}`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </form>
        </div>

        {/* Navigation */}
        <nav className="hidden md:block border-t border-border">
          <div className="container mx-auto px-4">
            <ul className="flex items-center gap-6 py-3">
              <li>
                <Link href="/store" className="text-sm font-medium hover:text-primary transition-colors">
                  {t.header.allProducts}
                </Link>
              </li>
              {categories.filter((c) => c.parent_category_id === null).slice(0, 6).map((category) => (
                <li key={category.category_id}>
                  <Link
                    href={`/store?category=${category.category_slug}`}
                    className="text-sm font-medium hover:text-primary transition-colors"
                  >
                    {getLocalizedName(category.category_name, language)}
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  href="/deals"
                  className="text-sm font-medium text-secondary hover:text-secondary/80 transition-colors"
                >
                  {t.header.deals}
                </Link>
              </li>
            </ul>
          </div>
        </nav>

        {/* Mobile menu */}
        {
          mobileMenuOpen && (
            <div className="md:hidden border-t border-border bg-background max-h-[calc(100vh-180px)] overflow-y-auto overscroll-contain">
              <nav className="container mx-auto px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                <ul className="space-y-3">
                  <li>
                    <Link href="/store" className="block py-2 font-medium" onClick={() => setMobileMenuOpen(false)}>
                      {t.header.allProducts}
                    </Link>
                  </li>
                  {categories.filter((c) => c.parent_category_id === null).map((category) => (
                    <li key={category.category_id}>
                      <Link
                        href={`/store?category=${category.category_slug}`}
                        className="block py-2 text-muted-foreground hover:text-foreground"
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        {getLocalizedName(category.category_name, language)}
                      </Link>
                    </li>
                  ))}
                  <li>
                    <Link
                      href="/deals"
                      className="block py-2 text-secondary font-medium"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      {t.header.deals}
                    </Link>
                  </li>
                </ul>
              </nav>
            </div>
          )
        }
      </header >

      <AlertDialog open={logoutDialog} onOpenChange={setLogoutDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.alertDialogs.logoutConfirmation.title}</AlertDialogTitle>
            <AlertDialogDescription>{t.alertDialogs.logoutConfirmation.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.alertDialogs.logoutConfirmation.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={() => { logout(); setLogoutDialog(false); }}>
              {t.alertDialogs.logoutConfirmation.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
