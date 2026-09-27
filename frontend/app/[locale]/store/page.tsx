"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { useSearchParams } from "next/navigation"
import { Filter, Grid3X3, List, X, SlidersHorizontal, Loader2, ChevronDown, Search, Layers, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Badge } from "@/components/ui/badge"
import { Slider } from "@/components/ui/slider"
import Container from "@/components/ui/container"
import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { ProductCard } from "@/components/product-card"
import { productsApi, categoriesApi, collectionsApi, type Product, type Category, type Collection } from "@/lib/api"
import { useLanguage } from "@/lib/language-context"

// Helper to get localized text from bilingual object or string
const getLocalizedName = (value: string | { fr?: string; ar?: string } | null | undefined, locale: string = 'fr'): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    return (locale === 'ar' ? value.ar || value.fr : value.fr || value.ar) || '';
  }
  return value;
};

type SortOption = "featured" | "price-low" | "price-high" | "newest" | "rating"

export default function StorePage() {
  const searchParams = useSearchParams()
  const categoryParam = searchParams.get("category")
  const collectionParam = searchParams.get("collection")
  const searchQuery = searchParams.get("search")
  const { t, language } = useLanguage()
  const isArabic = language === "ar"
  const searchIconPositionClass = isArabic ? "right-3" : "left-3"
  const searchInputPaddingClass = isArabic ? "pr-9" : "pl-9"
  const inlineOffsetClass = isArabic ? "mr-2" : "ml-2"

  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [collections, setCollections] = useState<Collection[]>([])
  const [brands, setBrands] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const [selectedCategories, setSelectedCategories] = useState<string[]>(categoryParam ? [categoryParam] : [])
  const [selectedCollections, setSelectedCollections] = useState<string[]>(collectionParam ? [collectionParam] : [])
  const [selectedBrands, setSelectedBrands] = useState<string[]>([])
  const [maxPrice, setMaxPrice] = useState<number>(5000000)
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 5000000])
  const [minPriceInput, setMinPriceInput] = useState("0")
  const [maxPriceInput, setMaxPriceInput] = useState("5000000")
  const [sortBy, setSortBy] = useState<SortOption>("featured")
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")
  const [brandSearch, setBrandSearch] = useState("")
  const [categorySearch, setCategorySearch] = useState("")
  const [collectionsSearch, setCollectionsSearch] = useState("")
  const lastFetchRef = useRef(0)

  // Fetch products and categories on mount + refetch on visibility
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true)
      try {
        const [productsResult, categoriesResult, collectionsResult] = await Promise.all([
          productsApi.getAll({ limit: 1000, collection: collectionParam || undefined }),
          categoriesApi.getAll(),
          collectionsApi.getAll(true),
        ])

        if (productsResult.data?.products) {
          setProducts(productsResult.data.products)
          const uniqueBrands = [...new Set(productsResult.data.products.map((p) => p.brand))].sort()
          setBrands(uniqueBrands)

          // Calculate max price from products
          const prices = productsResult.data.products.map((p) => p.sale_price || p.current_price)
          const calculatedMaxPrice = Math.max(...prices, 5000000)
          setMaxPrice(calculatedMaxPrice)
          setPriceRange([0, calculatedMaxPrice])
        }

        if (categoriesResult.data) {
          setCategories(categoriesResult.data)
        }

        if (collectionsResult.data) {
          setCollections(collectionsResult.data)
        }
      } catch (error) {
        console.error("Failed to fetch data:", error)
      } finally {
        setIsLoading(false)
        lastFetchRef.current = Date.now()
      }
    }

    fetchData()

    // Refetch when page becomes visible (e.g. returning from another tab/page)
    const handleVisibility = () => {
      // Reduced threshold to 5 seconds for more responsive updates
      if (document.visibilityState === 'visible' && Date.now() - lastFetchRef.current > 5000) {
        fetchData()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [collectionParam])

  // Update selected categories when URL param changes
  useEffect(() => {
    if (categoryParam) {
      setSelectedCategories([categoryParam])
    }
    if (collectionParam) {
      setSelectedCollections([collectionParam])
    }
  }, [categoryParam, collectionParam])

  useEffect(() => {
    setMinPriceInput(String(priceRange[0]))
    setMaxPriceInput(String(priceRange[1]))
  }, [priceRange])

  const filteredProducts = useMemo(() => {
    let filtered = [...products]

    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (p) => {
          const nameMatch = typeof p.product_name === 'object'
            ? (p.product_name.fr?.toLowerCase().includes(query) || p.product_name.ar?.toLowerCase().includes(query))
            : p.product_name.toLowerCase().includes(query);

          const descMatch = p.short_description
            ? (typeof p.short_description === 'object'
              ? (p.short_description.fr?.toLowerCase().includes(query) || p.short_description.ar?.toLowerCase().includes(query))
              : p.short_description.toLowerCase().includes(query))
            : false;

          return nameMatch || descMatch || p.brand.toLowerCase().includes(query)
        }
      )
    }

    if (selectedCategories.length > 0) {
      filtered = filtered.filter((p) => {
        const category = categories.find((c) => c.category_id === p.category_id)
        return category && selectedCategories.includes(category.category_slug)
      })
    }

    if (selectedBrands.length > 0) {
      filtered = filtered.filter((p) => selectedBrands.includes(p.brand))
    }

    const effectivePrice = (p: Product) => p.sale_price || p.current_price
    filtered = filtered.filter((p) => effectivePrice(p) >= priceRange[0] && effectivePrice(p) <= priceRange[1])

    switch (sortBy) {
      case "price-low":
        filtered.sort((a, b) => effectivePrice(a) - effectivePrice(b))
        break
      case "price-high":
        filtered.sort((a, b) => effectivePrice(b) - effectivePrice(a))
        break
      case "newest":
        filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        break
      case "rating":
        filtered.sort((a, b) => (b.average_rating || 0) - (a.average_rating || 0))
        break
      case "featured":
      default:
        break
    }

    return filtered
  }, [products, categories, selectedCategories, selectedBrands, priceRange, sortBy, searchQuery])

  const toggleCategory = (slug: string) => {
    setSelectedCategories((prev) => (prev.includes(slug) ? prev.filter((c) => c !== slug) : [...prev, slug]))
  }

  const toggleCollection = (slug: string) => {
    setSelectedCollections((prev) => (prev.includes(slug) ? prev.filter((c) => c !== slug) : [...prev, slug]))
  }

  const toggleBrand = (brand: string) => {
    setSelectedBrands((prev) => (prev.includes(brand) ? prev.filter((b) => b !== brand) : [...prev, brand]))
  }

  const clearFilters = () => {
    setSelectedCategories([])
    setSelectedCollections([])
    setSelectedBrands([])
    setPriceRange([0, maxPrice])
  }

  const hasPriceFilter = priceRange[0] > 0 || priceRange[1] < maxPrice
  const hasActiveFilters =
    selectedCategories.length > 0 || selectedCollections.length > 0 || selectedBrands.length > 0 || hasPriceFilter

  const parentCategories = useMemo(() => {
    return categories.filter((c) => c.parent_category_id === null)
  }, [categories])

  const getChildCategories = (parentId: number) => {
    return categories.filter((c) => c.parent_category_id === parentId)
  }

  const filteredBrands = useMemo(() => {
    return brands.filter(brand =>
      brand.toLowerCase().includes(brandSearch.toLowerCase())
    )
  }, [brands, brandSearch])

  const filteredParentCategories = useMemo(() => {
    return parentCategories.filter(cat => {
      const name = getLocalizedName(cat.category_name, language);
      return name.toLowerCase().includes(categorySearch.toLowerCase());
    })
  }, [parentCategories, categorySearch, language])

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat(language === 'ar' ? 'ar-DZ' : 'fr-DZ', {
      style: 'decimal',
      maximumFractionDigits: 0
    }).format(price)
  }

  const applyPriceInputs = () => {
    const parsedMin = minPriceInput.trim() === "" ? 0 : Number(minPriceInput)
    const parsedMax = maxPriceInput.trim() === "" ? maxPrice : Number(maxPriceInput)

    const safeMin = Number.isFinite(parsedMin) ? Math.max(0, parsedMin) : priceRange[0]
    const safeMax = Number.isFinite(parsedMax) ? Math.min(maxPrice, parsedMax) : priceRange[1]

    const nextMin = Math.min(safeMin, safeMax)
    const nextMax = Math.max(safeMin, safeMax)

    setPriceRange([nextMin, nextMax])
  }

  const FilterContent = () => {
    const filteredCollections = collections.filter(col => {
      if (!col.is_active) return false
      if (!collectionsSearch) return true
      const searchLower = collectionsSearch.toLowerCase()
      // La recherche porte sur les deux langues, quelle que soit la locale active.
      const nameAr = getLocalizedName(col.collection_name, 'ar').toLowerCase()
      const nameFr = getLocalizedName(col.collection_name, 'fr').toLowerCase()
      const taglineAr = getLocalizedName(col.tagline, 'ar').toLowerCase()
      const taglineFr = getLocalizedName(col.tagline, 'fr').toLowerCase()
      return nameAr.includes(searchLower) || nameFr.includes(searchLower) ||
             taglineAr.includes(searchLower) || taglineFr.includes(searchLower)
    })

    return (
    <div className="space-y-6">
      {/* 1. Price Range - Fast and simple price filtering */}
      <Collapsible defaultOpen>
        <CollapsibleTrigger className="flex items-center justify-between w-full group hover:text-primary transition-colors">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-sm">{t.store.priceRange}</h3>
            {hasPriceFilter && (
              <Badge variant="default" className="h-5 px-1.5 text-xs">
                {formatPrice(priceRange[0])} - {formatPrice(priceRange[1])}
              </Badge>
            )}
          </div>
          <ChevronDown className="h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-4 space-y-4">
          {/* Current Range Display */}
          <div className="text-center">
            <div className="text-sm font-semibold text-foreground">
              {formatPrice(priceRange[0])} - {formatPrice(priceRange[1])} {t.common.dzd}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {t.store.adjustPriceRange}
            </div>
          </div>

          {/* Improved Slider with better step sizes */}
          <div className="px-1 py-2">
            <Slider
              value={priceRange}
              onValueChange={(value: number[]) => setPriceRange(value as [number, number])}
              min={0}
              max={maxPrice}
              step={maxPrice > 100000 ? 5000 : maxPrice > 50000 ? 2000 : 1000}
              className="w-full"
            />
            {/* Min/Max labels under slider */}
            <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
              <span>0 {t.common.dzd}</span>
              <span>{formatPrice(maxPrice)} {t.common.dzd}</span>
            </div>
          </div>

          {/* Min/Max Inputs - Compact layout */}
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <Input
                id="min-price"
                type="number"
                placeholder="0"
                value={minPriceInput}
                onChange={(e) => setMinPriceInput(e.target.value)}
                onBlur={applyPriceInputs}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    applyPriceInputs()
                  }
                }}
                className="h-9 text-sm text-center"
              />
              <div className="text-[10px] text-muted-foreground text-center mt-1">
                {t.store.minLabel}
              </div>
            </div>
            <span className="text-muted-foreground text-sm pb-4">—</span>
            <div className="flex-1">
              <Input
                id="max-price"
                type="number"
                placeholder={maxPrice.toString()}
                value={maxPriceInput}
                onChange={(e) => setMaxPriceInput(e.target.value)}
                onBlur={applyPriceInputs}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    applyPriceInputs()
                  }
                }}
                className="h-9 text-sm text-center"
              />
              <div className="text-[10px] text-muted-foreground text-center mt-1">
                {t.store.maxLabel}
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      <div className="border-t border-border" />

      {/* 2. Categories - Product type filter */}
      <Collapsible defaultOpen>
        <CollapsibleTrigger className="flex items-center justify-between w-full group hover:text-primary transition-colors">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-sm">{t.store.category}</h3>
            {selectedCategories.length > 0 && (
              <Badge variant="secondary" className="h-5 min-w-5 flex items-center justify-center px-1.5 text-xs">
                {selectedCategories.length}
              </Badge>
            )}
          </div>
          <ChevronDown className="h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3 space-y-3">
          {/* Search Input */}
          <div className="relative">
            <Search className={`absolute top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground ${searchIconPositionClass}`} />
            <Input
              type="text"
              placeholder={t.store.categorySearchPlaceholder}
              value={categorySearch}
              onChange={(e) => setCategorySearch(e.target.value)}
              className={`h-9 text-sm ${searchInputPaddingClass}`}
            />
          </div>

          {/* Category List */}
          <div className="space-y-0.5 max-h-64 overflow-y-auto pr-1 scrollbar-thin">
            {filteredParentCategories.map((parentCategory) => {
              const children = getChildCategories(parentCategory.category_id)
              const hasChildren = children.length > 0
              const categoryCount = children.filter(c => selectedCategories.includes(c.category_slug)).length

              if (hasChildren) {
                return (
                  <Collapsible key={parentCategory.category_id} defaultOpen={selectedCategories.includes(parentCategory.category_slug) || categoryCount > 0}>
                    <div className="group/item">
                      <div className="flex items-center gap-2 py-2 px-2 hover:bg-muted/70 rounded-md transition-all duration-200">
                        <Checkbox
                          id={`cat-${parentCategory.category_slug}`}
                          checked={selectedCategories.includes(parentCategory.category_slug)}
                          onCheckedChange={() => toggleCategory(parentCategory.category_slug)}
                          className="data-[state=checked]:bg-primary shrink-0"
                        />
                        <CollapsibleTrigger className="flex items-center flex-1 min-w-0 group/trigger">
                          <Label
                            htmlFor={`cat-${parentCategory.category_slug}`}
                            className="text-sm cursor-pointer font-medium flex-1 min-w-0 truncate text-left"
                          >
                            {getLocalizedName(parentCategory.category_name, language)}
                          </Label>
                          <div className={`flex items-center gap-1 shrink-0 ${inlineOffsetClass}`}>
                            {categoryCount > 0 && (
                              <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[10px] font-medium">
                                {categoryCount}
                              </Badge>
                            )}
                            <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-data-[state=open]/trigger:rotate-180" />
                          </div>
                        </CollapsibleTrigger>
                      </div>
                      <CollapsibleContent className={`border-l-2 border-muted mt-0.5 ${language === 'ar' ? 'mr-6 border-r-2 border-l-0' : 'ml-6'}`}>
                        <div className={`py-1 space-y-0.5 ${language === 'ar' ? 'pr-4' : 'pl-4'}`}>
                          {children.map((childCategory) => (
                            <div
                              key={childCategory.category_id}
                              className="flex items-center gap-2 py-2 px-2 hover:bg-muted/70 rounded-md transition-all duration-200"
                            >
                              <Checkbox
                                id={`cat-${childCategory.category_slug}`}
                                checked={selectedCategories.includes(childCategory.category_slug)}
                                onCheckedChange={() => toggleCategory(childCategory.category_slug)}
                                className="data-[state=checked]:bg-primary shrink-0"
                              />
                              <Label
                                htmlFor={`cat-${childCategory.category_slug}`}
                                className="text-sm cursor-pointer flex-1 min-w-0 truncate text-left"
                              >
                                {getLocalizedName(childCategory.category_name, language)}
                              </Label>
                            </div>
                          ))}
                        </div>
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                )
              }

              return (
                <div
                  key={parentCategory.category_id}
                  className="flex items-center gap-2 py-2 px-2 hover:bg-muted/70 rounded-md transition-all duration-200"
                >
                  <Checkbox
                    id={`cat-${parentCategory.category_slug}`}
                    checked={selectedCategories.includes(parentCategory.category_slug)}
                    onCheckedChange={() => toggleCategory(parentCategory.category_slug)}
                    className="data-[state=checked]:bg-primary shrink-0"
                  />
                  <Label
                    htmlFor={`cat-${parentCategory.category_slug}`}
                    className="text-sm cursor-pointer font-medium flex-1 min-w-0 truncate text-left"
                  >
                    {getLocalizedName(parentCategory.category_name, language)}
                  </Label>
                </div>
              )
            })}
            {filteredParentCategories.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                {t.store.noCategoryFound}
              </p>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      <div className="border-t border-border" />

      {/* 2. Collections - Curated groups with visual appeal */}
      {collections.length > 0 && (
        <>
          <Collapsible>
            <CollapsibleTrigger className="flex items-center justify-between w-full group hover:text-primary transition-colors">
              <div className="flex items-center gap-2">
                <div className="p-1 rounded-md bg-gradient-to-br from-primary/10 to-primary/5 group-hover:from-primary/15 group-hover:to-primary/10 transition-all">
                  <Layers className="h-4 w-4 text-primary" />
                </div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-sm">{t.store.collections}</h3>
                  {selectedCollections.length > 0 && (
                    <Badge variant="default" className="h-5 min-w-5 flex items-center justify-center px-1.5 text-xs">
                      {selectedCollections.length}
                    </Badge>
                  )}
                </div>
              </div>
              <ChevronDown className="h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3 space-y-3">
              {/* Search Input */}
              <div className="relative">
                <Search className={`absolute top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground ${searchIconPositionClass}`} />
                <Input
                  type="text"
                  placeholder={t.store.collectionSearchPlaceholder}
                  value={collectionsSearch}
                  onChange={(e) => setCollectionsSearch(e.target.value)}
                  className={`h-9 text-sm ${searchInputPaddingClass}`}
                />
              </div>

              {/* Collections List with compact card design */}
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1 scrollbar-thin">
                {filteredCollections.map((collection) => {
                  const isSelected = selectedCollections.includes(collection.collection_slug)
                  const gradient = collection.gradient || 'from-primary to-primary'
                  
                  return (
                    <div
                      key={collection.collection_id || collection.id}
                      onClick={() => toggleCollection(collection.collection_slug)}
                      className={`group/collection relative overflow-hidden rounded-lg border transition-all duration-200 cursor-pointer ${
                        isSelected 
                          ? 'border-primary/50 bg-gradient-to-r ' + gradient + ' bg-opacity-5 shadow-sm'
                          : 'border-border hover:border-primary/30 bg-card hover:bg-muted/50'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 p-2.5">
                        {/* Icon */}
                        <div className={`flex-shrink-0 w-8 h-8 rounded-md flex items-center justify-center transition-all ${
                          isSelected
                            ? 'bg-gradient-to-br ' + gradient + ' text-white'
                            : 'bg-muted text-muted-foreground group-hover/collection:bg-muted/70'
                        }`}>
                          <Sparkles className="h-4 w-4" />
                        </div>
                        
                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <h4 className={`font-medium text-sm truncate transition-colors ${
                            isSelected ? 'text-primary' : 'text-foreground'
                          }`}>
                            {getLocalizedName(collection.collection_name, language)}
                          </h4>
                        </div>

                        {/* Count & Checkbox */}
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {(collection.product_count ?? 0) > 0 && (
                            <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                              {collection.product_count}
                            </Badge>
                          )}
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleCollection(collection.collection_slug)}
                            className="data-[state=checked]:bg-primary"
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                      </div>
                    </div>
                  )
                })}
                {filteredCollections.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    {t.store.noCollectionFound}
                  </p>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>

          <div className="border-t border-border" />
        </>
      )}

      {/* 3. Brands - Brand preference filter */}
      <Collapsible>
        <CollapsibleTrigger className="flex items-center justify-between w-full group hover:text-primary transition-colors">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-sm">{t.store.brands}</h3>
            {selectedBrands.length > 0 && (
              <Badge variant="secondary" className="h-5 min-w-5 flex items-center justify-center px-1.5 text-xs">
                {selectedBrands.length}
              </Badge>
            )}
          </div>
          <ChevronDown className="h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3 space-y-3">
          {/* Search Input */}
          <div className="relative">
            <Search className={`absolute top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground ${searchIconPositionClass}`} />
            <Input
              type="text"
              placeholder={t.store.brandSearchPlaceholder}
              value={brandSearch}
              onChange={(e) => setBrandSearch(e.target.value)}
              className={`h-9 text-sm ${searchInputPaddingClass}`}
            />
          </div>

          {/* Brand List */}
          <div className="space-y-0.5 max-h-64 overflow-y-auto pr-1 scrollbar-thin">
            {filteredBrands.map((brand) => (
              <div
                key={brand}
                className="flex items-center gap-2 py-2 px-2 hover:bg-muted/70 rounded-md transition-all duration-200 group/brand"
              >
                <Checkbox
                  id={`brand-${brand}`}
                  checked={selectedBrands.includes(brand)}
                  onCheckedChange={() => toggleBrand(brand)}
                  className="data-[state=checked]:bg-primary shrink-0"
                />
                <Label htmlFor={`brand-${brand}`} className="text-sm cursor-pointer flex-1 min-w-0 truncate text-left">
                  {brand}
                </Label>
                {selectedBrands.includes(brand) && (
                  <div className="h-2 w-2 rounded-full bg-primary shrink-0" />
                )}
              </div>
            ))}
            {filteredBrands.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                {t.store.noBrandFound}
              </p>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Clear All Filters Button */}
      {hasActiveFilters && (
        <>
          <div className="border-t border-border" />
          <Button variant="outline" className="w-full bg-transparent hover:bg-destructive/10 hover:text-destructive hover:border-destructive/50 transition-colors" onClick={clearFilters}>
            <X className={`h-4 w-4 ${language === 'ar' ? 'ml-2' : 'mr-2'}`} />
            {t.store.clearFilters}
          </Button>
        </>
      )}
    </div>
  )}

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1">
        {/* Page Header */}
        <div className="bg-muted/50 border-b border-border py-8">
          <Container>
            <h1 className="text-3xl font-bold">
              {searchQuery
                ? `${t.store.searchFor}: "${searchQuery}"`
                : t.header.allProducts}
            </h1>
            <p className="text-muted-foreground mt-1">
              {filteredProducts.length} {isArabic ? t.store.productsFoundPlural : (filteredProducts.length === 1 ? t.store.productsFoundSingular : t.store.productsFoundPlural)}
            </p>
          </Container>
        </div>

        <Container className="py-8">
          <div className="flex gap-8">
            {/* Sidebar Filters - Desktop */}
            <aside className="hidden lg:block w-64 shrink-0">
              <div className="sticky top-24">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-2">
                    <Filter className="h-5 w-5 text-primary" />
                    <h2 className="font-semibold text-lg">{t.store.filters}</h2>
                    {hasActiveFilters && (
                      <Badge variant="secondary" className="h-5 min-w-5 flex items-center justify-center px-1.5">
                        {selectedCategories.length + selectedCollections.length + selectedBrands.length + (hasPriceFilter ? 1 : 0)}
                      </Badge>
                    )}
                  </div>
                  {hasActiveFilters && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearFilters}
                      className="h-8 text-xs text-muted-foreground hover:text-foreground"
                    >
                      {t.store.reset}
                    </Button>
                  )}
                </div>
                <FilterContent />
              </div>
            </aside>

            {/* Product Grid */}
            <div className="flex-1">
              {/* Toolbar */}
              <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
                <div className="flex items-center gap-2">
                  {/* Mobile Filter Button */}
                  <Sheet>
                    <SheetTrigger asChild>
                      <Button variant="outline" className="lg:hidden bg-transparent">
                        <SlidersHorizontal className={`h-4 w-4 ${language === 'ar' ? 'ml-2' : 'mr-2'}`} />
                        {t.store.filters}
                        {hasActiveFilters && (
                          <span className={`bg-primary text-primary-foreground text-xs px-1.5 py-0.5 rounded-full ${language === 'ar' ? 'mr-1' : 'ml-1'}`}>
                            !
                          </span>
                        )}
                      </Button>
                    </SheetTrigger>
                    <SheetContent side={language === 'ar' ? "right" : "left"}>
                      <SheetHeader>
                        <SheetTitle>{t.store.filters}</SheetTitle>
                      </SheetHeader>
                      <div className="mt-6">
                        <FilterContent />
                      </div>
                    </SheetContent>
                  </Sheet>

                  {/* Active Filters */}
                  {selectedCategories.map((cat) => {
                    const category = categories.find((c) => c.category_slug === cat)
                    return category ? (
                      <Button key={cat} variant="secondary" size="sm" onClick={() => toggleCategory(cat)}>
                        {getLocalizedName(category.category_name, language)}
                        <X className={`h-3 w-3 ${language === 'ar' ? 'mr-1' : 'ml-1'}`} />
                      </Button>
                    ) : null
                  })}
                </div>

                <div className="flex items-center gap-4">
                  {/* View Mode */}
                  <div className="hidden sm:flex items-center gap-1 border border-border rounded-lg p-1">
                    <Button
                      variant={viewMode === "grid" ? "secondary" : "ghost"}
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setViewMode("grid")}
                    >
                      <Grid3X3 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant={viewMode === "list" ? "secondary" : "ghost"}
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setViewMode("list")}
                    >
                      <List className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Sort */}
                  <Select value={sortBy} onValueChange={(v: string) => setSortBy(v as SortOption)}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder={t.store.sortBy} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="featured">{t.store.sortOptions.featured}</SelectItem>
                      <SelectItem value="newest">{t.store.sortOptions.newest}</SelectItem>
                      <SelectItem value="price-low">{t.store.sortOptions.priceLowToHigh}</SelectItem>
                      <SelectItem value="price-high">{t.store.sortOptions.priceHighToLow}</SelectItem>
                      <SelectItem value="rating">{t.store.sortOptions.rating}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Products */}
              {isLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : filteredProducts.length > 0 ? (
                <div
                  className={`grid gap-4 md:gap-6 ${viewMode === "grid" ? "grid-cols-2 md:grid-cols-3 xl:grid-cols-4" : "grid-cols-1"
                    }`}
                >
                  {filteredProducts.map((product) => (
                    <ProductCard key={product.product_id} product={product} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-16">
                  <p className="text-muted-foreground text-lg">{t.store.noProducts}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {t.store.tryAdjustFilters}
                  </p>
                  <Button variant="outline" className="mt-4 bg-transparent" onClick={clearFilters}>
                    {t.store.clearFilters}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </Container>
      </main>

      <Footer />
    </div>
  )
}