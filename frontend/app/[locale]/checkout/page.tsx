"use client"

import type React from "react"
import { useState, useEffect } from "react"
import Image from "next/image"
import { getApiBaseUrl } from "@/lib/api/base-url"

// API_BASE_URL should NOT include /api as the env var already has it
const API_BASE_URL = getApiBaseUrl()
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ChevronLeft, CreditCard, MapPin, Truck, Clock, Loader2, Phone, AlertCircle } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { useCart } from "@/lib/cart-context"
import { useAuth } from "@/lib/auth-context"
import { ordersApi, ERROR_CODES } from "@/lib/api"
import { formatPrice, getImageUrl } from "@/lib/utils"
import { useLanguage } from "@/lib/language-context"

interface Wilaya {
  id: number
  name: string
}

interface Commune {
  id: number
  name: string
  wilaya_id: number
  is_deliverable: boolean
}

interface StopDesk {
  center_id: number
  name: string
  address: string
  wilaya_id: number
  commune_id: number
  commune_name: string
}

interface ShippingEstimate {
  totalShippingCost: number
  deliveryTime: number
  baseFee: number
  overweightFee: number
  codFee: number
  insuranceFee: number
  communeName: string
  wilayaName: string
  deliveryType: string
  selectedWarehouse?: string
}

export default function CheckoutPage() {
  const { items, totalPrice, clearCart, appliedPromo } = useCart()
  const { user } = useAuth()
  const router = useRouter()
  const [paymentMethod, setPaymentMethod] = useState("cod")
  const [loading, setLoading] = useState(false)
  const [errorDialog, setErrorDialog] = useState<{ open: boolean; title: string; description: string } | null>(null)
  const { t, language } = useLanguage()

  // Shipping state
  const [wilayas, setWilayas] = useState<Wilaya[]>([])
  const [communes, setCommunes] = useState<Commune[]>([])
  const [stopDesks, setStopDesks] = useState<StopDesk[]>([])
  const [selectedWilaya, setSelectedWilaya] = useState<string>("")
  const [selectedCommune, setSelectedCommune] = useState<string>("")
  const [deliveryType, setDeliveryType] = useState<"home" | "stopdesk">("home")
  const [selectedStopDesk, setSelectedStopDesk] = useState<string>("")
  const [shippingEstimate, setShippingEstimate] = useState<ShippingEstimate | null>(null)
  const [loadingWilayas, setLoadingWilayas] = useState(true)
  const [loadingShipping, setLoadingShipping] = useState(false)
  const [loadingCommunes, setLoadingCommunes] = useState(false)
  const [loadingStopDesks, setLoadingStopDesks] = useState(false)
  const [phoneError, setPhoneError] = useState<string>("")
  const [phoneValue, setPhoneValue] = useState<string>("")
  const [shippingError, setShippingError] = useState<string>("")

  // Validate Algerian phone number (05XX, 06XX, 07XX + 8 digits)
  const validateAlgerianPhone = (phone: string): boolean => {
    // Remove spaces, dashes, parentheses
    const cleaned = phone.replace(/[\s\-()]/g, '')
    
    // Check formats: +213XXXXXXXXX, 00213XXXXXXXXX, 0XXXXXXXXX
    const patterns = [
      /^\+213[567]\d{8}$/,  // +213 5XX/6XX/7XX XXXXXXXX
      /^00213[567]\d{8}$/,  // 00213 5XX/6XX/7XX XXXXXXXX
      /^0[567]\d{8}$/       // 05XX/06XX/07XX XXXXXXXX
    ]
    
    return patterns.some(pattern => pattern.test(cleaned))
  }

  // Helper to get localized text
  const getLocalizedName = (value: string | { fr?: string; ar?: string } | null | undefined, locale: string = 'fr'): string => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') {
      return (locale === 'ar' ? value.ar || value.fr : value.fr || value.ar) || '';
    }
    return value;
  };

  const localT = {
    fr: {
      backToCart: "Retour au Panier",
      contactInfo: "Informations de Contact",
      codDesc: "Payez à la réception de votre commande",
      cibDesc: "Payez avec votre carte bancaire algérienne",
      qty: "Qté",
      discount: "Réduction",
      free: "Gratuit",
      processing: "Traitement...",
      terms: "En passant votre commande, vous acceptez nos Conditions d'Utilisation et notre Politique de Confidentialité.",
      orderSuccess: "Commande passée avec succès!",
      orderFailed: "Échec de la commande. Veuillez réessayer.",
      genericError: "Une erreur s'est produite. Veuillez réessayer.",
      // Error messages by code
      errors: {
        outOfStock: "Certains produits ne sont plus disponibles en quantité suffisante. Veuillez mettre à jour votre panier.",
        networkError: "Connexion impossible. Vérifiez votre connexion internet et réessayez.",
        authRequired: "Votre session a expiré. Veuillez vous reconnecter.",
        validationError: "Veuillez vérifier les informations saisies.",
        shippingFailed: "Impossible de calculer les frais de livraison. Veuillez réessayer.",
      }
    },
    ar: {
      backToCart: "العودة إلى السلة",
      contactInfo: "معلومات الاتصال",
      codDesc: "الدفع عند استلام الطلب",
      cibDesc: "الدفع باستخدام بطاقتك البنكية (CIB / الذهبية)",
      qty: "الكمية",
      discount: "خصم",
      free: "مجاني",
      processing: "جاري المعالجة...",
      terms: "بإتمام الطلب، أنت توافق على شروط الاستخدام وسياسة الخصوصية.",
      orderSuccess: "تم تأكيد الطلب بنجاح!",
      orderFailed: "فشل إنشاء الطلب. يرجى المحاولة مرة أخرى.",
      genericError: "حدث خطأ ما. يرجى المحاولة مرة أخرى.",
      // Error messages by code
      errors: {
        outOfStock: "بعض المنتجات غير متوفرة بالكمية المطلوبة. يرجى تحديث سلة التسوق.",
        networkError: "فشل الاتصال. يرجى التحقق من اتصالك بالإنترنت والمحاولة مرة أخرى.",
        authRequired: "انتهت صلاحية الجلسة. يرجى تسجيل الدخول مرة أخرى.",
        validationError: "يرجى التحقق من المعلومات المدخلة.",
        shippingFailed: "تعذر حساب تكلفة الشحن. يرجى المحاولة مرة أخرى.",
      }
    }
  }

  const txt = localT[language === 'ar' ? 'ar' : 'fr']

  // Load wilayas on mount with localStorage cache
  useEffect(() => {
    const loadWilayas = async () => {
      const cacheKey = 'wilayas_cache'
      const cacheTimeKey = 'wilayas_cache_time'
      
      try {
        // Check cache first (wilayas are static data, cache for 24h)
        if (typeof window !== 'undefined') {
          const cached = localStorage.getItem(cacheKey)
          const cacheTime = localStorage.getItem(cacheTimeKey)
          
          if (cached && cacheTime) {
            try {
              const cachedData = JSON.parse(cached)
              // Validate cached data is an array with at least one wilaya
              if (Array.isArray(cachedData) && cachedData.length > 0 && cachedData[0].id) {
                const age = Date.now() - parseInt(cacheTime)
                const ONE_DAY = 24 * 60 * 60 * 1000
                
                if (age < ONE_DAY) {
                  setWilayas(cachedData)
                  setLoadingWilayas(false)
                  return
                }
              } else {
                // Invalid cache, clear it
                localStorage.removeItem(cacheKey)
                localStorage.removeItem(cacheTimeKey)
              }
            } catch {
              // Invalid JSON in cache, clear it
              localStorage.removeItem(cacheKey)
              localStorage.removeItem(cacheTimeKey)
            }
          }
        }
        
        // Fetch fresh data
        setLoadingWilayas(true)
        const response = await fetch(`${API_BASE_URL}/shipping/wilayas`, {
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' }
        })
        const data = await response.json()
        
        if (data.success && data.data && Array.isArray(data.data) && data.data.length > 0) {
          setWilayas(data.data)
          // Cache the data
          if (typeof window !== 'undefined') {
            localStorage.setItem(cacheKey, JSON.stringify(data.data))
            localStorage.setItem(cacheTimeKey, Date.now().toString())
          }
        } else {
          console.error('Invalid wilayas data:', data)
          // Clear any bad cache
          if (typeof window !== 'undefined') {
            localStorage.removeItem(cacheKey)
            localStorage.removeItem(cacheTimeKey)
          }
          toast.error(language === 'ar' ? 'فشل تحميل الولايات' : 'Échec du chargement des wilayas')
        }
      } catch (error) {
        console.error('Failed to load wilayas:', error)
        // Clear any bad cache
        if (typeof window !== 'undefined') {
          localStorage.removeItem(cacheKey)
          localStorage.removeItem(cacheTimeKey)
        }
        toast.error(language === 'ar' ? 'فشل تحميل الولايات' : 'Échec du chargement des wilayas')
      } finally {
        setLoadingWilayas(false)
      }
    }
    loadWilayas()
  }, [language])

  // Validate phone on mount if user has phone
  useEffect(() => {
    if (user?.phone && !phoneValue) {
      setPhoneValue(user.phone)
      if (!validateAlgerianPhone(user.phone)) {
        setPhoneError(language === 'ar' 
          ? 'رقم هاتف جزائري غير صالح (05XX، 06XX، 07XX)' 
          : 'Numéro de téléphone algérien invalide (05XX, 06XX, 07XX)')
      }
    }
  }, [user?.phone, language, phoneValue])

  // Redirect to cart if empty
  useEffect(() => {
    if (items.length === 0) {
      router.push(`/${language}/cart`)
    }
  }, [items.length, router, language])

  // Load communes when wilaya changes
  useEffect(() => {
    const loadCommunes = async () => {
      if (!selectedWilaya) {
        setCommunes([])
        setSelectedCommune("")
        setShippingEstimate(null)
        return
      }
      
      setLoadingCommunes(true)
      setCommunes([])
      setSelectedCommune("")
      setShippingEstimate(null)
      
      try {
        const response = await fetch(
          `${API_BASE_URL}/shipping/communes?wilayaId=${selectedWilaya}&isDeliverable=true`,
          { credentials: 'include', headers: { 'Content-Type': 'application/json' } }
        )
        const data = await response.json()
        if (data.success && data.data) {
          setCommunes(data.data)
        } else {
          toast.error(language === 'ar' ? 'فشل تحميل البلديات' : 'Échec du chargement des communes')
        }
      } catch (error) {
        console.error('Failed to load communes:', error)
        toast.error(language === 'ar' ? 'فشل تحميل البلديات' : 'Échec du chargement des communes')
      } finally {
        setLoadingCommunes(false)
      }
    }
    loadCommunes()
  }, [selectedWilaya, language])

  // Load stop desks when wilaya is selected (to show availability in delivery options)
  useEffect(() => {
    const loadStopDesks = async () => {
      if (!selectedWilaya) {
        setStopDesks([])
        setSelectedStopDesk("")
        return
      }

      setLoadingStopDesks(true)
      setSelectedStopDesk("") // Reset selection when loading new stop desks
      try {
        const response = await fetch(
          `${API_BASE_URL}/shipping/centers?wilayaId=${selectedWilaya}`,
          { credentials: 'include', headers: { 'Content-Type': 'application/json' } }
        )
        const data = await response.json()
        if (data.success && data.data) {
          setStopDesks(data.data)
        } else {
          setStopDesks([])
        }
      } catch (error) {
        console.error('Failed to load stop desks:', error)
        // Don't show error toast here - just set empty array
        setStopDesks([])
      } finally {
        setLoadingStopDesks(false)
      }
    }
    loadStopDesks()
  }, [selectedWilaya])

  // Calculate shipping estimate when commune and delivery type are selected
  useEffect(() => {
    const calculateShipping = async () => {
      // Don't calculate if cart is empty
      if (!items || items.length === 0) {
        setShippingEstimate(null)
        setShippingError("")
        return
      }

      // For stop desk, wait until a stop desk is selected (which auto-populates commune)
      // For home delivery, just need commune selected
      if (!selectedCommune || !deliveryType) {
        setShippingEstimate(null)
        setShippingError("")
        return
      }

      // For stop desk, ensure stop desk is selected
      if (deliveryType === 'stopdesk' && !selectedStopDesk) {
        setShippingEstimate(null)
        setShippingError("")
        return
      }

      setLoadingShipping(true)
      setShippingError("")
      
      try {
        // Transform cart items to shipping calculator format
        const shippingItems = items.map(({ product, quantity }) => ({
          price: product.sale_price || product.current_price,
          quantity: quantity,
          weight: product.weight || 1,
          length: product.length || 30,
          width: product.width || 20,
          height: product.height || 10,
          hasInsurance: (product.sale_price || product.current_price) > 50000,
          declaredValue: product.sale_price || product.current_price
        }))

        const csrfToken = document.cookie.match(/XSRF-TOKEN=([^;]+)/)?.[1]
        const response = await fetch(`${API_BASE_URL}/orders/shipping-estimate`, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            ...(csrfToken ? { 'X-XSRF-TOKEN': csrfToken } : {}),
          },
          body: JSON.stringify({
            communeId: parseInt(selectedCommune),
            isStopDesk: deliveryType === 'stopdesk',
            items: shippingItems
          })
        })
        const data = await response.json()
        
        if (data.success && data.data) {
          setShippingEstimate(data.data)
          setShippingError("")
        } else {
          const errorMsg = language === 'ar' 
            ? 'فشل حساب تكلفة الشحن' 
            : 'Échec du calcul des frais de livraison'
          setShippingError(errorMsg)
          toast.error(errorMsg)
          console.error('Shipping estimate error:', data.error)
        }
      } catch (error) {
        const errorMsg = language === 'ar' 
          ? 'فشل حساب تكلفة الشحن' 
          : 'Échec du calcul des frais de livraison'
        setShippingError(errorMsg)
        toast.error(errorMsg)
        console.error('Failed to calculate shipping:', error)
      } finally {
        setLoadingShipping(false)
      }
    }
    calculateShipping()
  }, [selectedCommune, deliveryType, selectedStopDesk, items, language])

  // Calculate discount
  const calculateDiscount = (): number => {
    if (!appliedPromo) return 0
    if (appliedPromo.type === 'percentage') {
      return Math.round(totalPrice * (appliedPromo.value / 100))
    } else if (appliedPromo.type === 'fixed') {
      return appliedPromo.value
    } else if (appliedPromo.type === 'free_shipping') {
      return shippingEstimate?.totalShippingCost || 0
    }
    return 0
  }

  const discountAmount = calculateDiscount()
  const shipping = shippingEstimate?.totalShippingCost || 0
  const total = totalPrice - discountAmount + shipping

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setPhoneValue(value)
    
    if (value && !validateAlgerianPhone(value)) {
      setPhoneError(language === 'ar' 
        ? 'رقم هاتف جزائري غير صالح (05XX، 06XX، 07XX)' 
        : 'Numéro de téléphone algérien invalide (05XX, 06XX, 07XX)')
    } else {
      setPhoneError('')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const formData = new FormData(e.target as HTMLFormElement)
    const phone = formData.get('phone') as string

    // Validate phone number
    if (!validateAlgerianPhone(phone)) {
      toast.error(language === 'ar' 
        ? 'رقم هاتف جزائري غير صالح. استخدم 05XX، 06XX أو 07XX'
        : 'Numéro de téléphone algérien invalide. Utilisez 05XX, 06XX ou 07XX')
      return
    }

    // Validate shipping selection
    if (!selectedWilaya || !selectedCommune) {
      toast.error(language === 'ar' ? "يرجى اختيار الولاية والبلدية" : "Veuillez sélectionner une wilaya et une commune")
      return
    }

    if (deliveryType === 'stopdesk' && !selectedStopDesk) {
      toast.error(language === 'ar' ? "يرجى اختيار نقطة الاستلام" : "Veuillez sélectionner un point relais")
      return
    }

    // Validate shipping estimate is calculated
    if (!shippingEstimate) {
      toast.error(language === 'ar' 
        ? 'يرجى الانتظار حتى يتم حساب تكلفة الشحن'
        : 'Veuillez attendre le calcul des frais de livraison')
      return
    }

    // Validate stop desk belongs to selected commune if applicable
    if (deliveryType === 'stopdesk' && selectedStopDesk) {
      const selectedDesk = stopDesks.find(d => d.center_id.toString() === selectedStopDesk)
      if (!selectedDesk) {
        toast.error(language === 'ar' 
          ? 'نقطة الاستلام غير صالحة'
          : 'Point relais invalide')
        setSelectedStopDesk("")
        return
      }
    }

    setLoading(true)

    try {
      // Get commune name from stop desk or communes list
      const communeName = deliveryType === 'stopdesk' && selectedStopDesk
        ? stopDesks.find(d => d.center_id.toString() === selectedStopDesk)?.commune_name
        : communes.find(c => c.id === parseInt(selectedCommune))?.name

      const orderData = {
        items: items.map(({ product, quantity }) => ({
          product_id: product.product_id,
          variant_id: product.variant_id,
          quantity,
        })),
        shipping_address: {
          address_line_1: formData.get('address') as string,
          city: communeName || '',
          state: wilayas.find(w => w.id === parseInt(selectedWilaya))?.name || '',
          postal_code: formData.get('postalCode') as string,
          country: 'Algeria',
        },
        delivery_commune_id: parseInt(selectedCommune),
        delivery_wilaya_id: parseInt(selectedWilaya),
        delivery_type: deliveryType,
        delivery_center_id: deliveryType === 'stopdesk' && selectedStopDesk ? parseInt(selectedStopDesk) : undefined,
        delivery_notes: `Name: ${formData.get('firstName')} ${formData.get('lastName')}, Phone: ${formData.get('phone')}`,
        payment_method: paymentMethod,
        promotion_code: appliedPromo?.code,
        customer_phone: formData.get('phone') as string,
        customer_email: formData.get('email') as string,
        customer_name: `${formData.get('firstName')} ${formData.get('lastName')}`,
      }

      const result = await ordersApi.create(orderData)

      if (result.data) {
        const orderNumber = result.data.order_number || result.data.order_id
        clearCart()
        toast.success(txt.orderSuccess)
        router.push(`/order-success?order=${orderNumber}&payment=${paymentMethod}&total=${total}`)
      } else {
        console.error("Order creation failed:", result.error)
        
        // Map error code to user-friendly message
        let errorMessage = txt.orderFailed
        const errorCode = result.error?.code
        
        if (errorCode === ERROR_CODES.OUT_OF_STOCK || errorCode === 'OUT_OF_STOCK') {
          errorMessage = txt.errors.outOfStock
        } else if (errorCode === ERROR_CODES.NETWORK_ERROR || errorCode === 'NETWORK_ERROR') {
          errorMessage = txt.errors.networkError
        } else if (errorCode === ERROR_CODES.AUTH_REQUIRED || errorCode === 'AUTH_REQUIRED' || result.error?.status === 401) {
          errorMessage = txt.errors.authRequired
        } else if (errorCode === ERROR_CODES.VALIDATION_ERROR || errorCode === 'VALIDATION_ERROR') {
          errorMessage = txt.errors.validationError
        } else if (result.error?.message) {
          // Use backend message as fallback but check if it's user-friendly
          const msg = result.error.message.toLowerCase()
          if (msg.includes('stock') || msg.includes('available')) {
            errorMessage = txt.errors.outOfStock
          } else if (msg.includes('session') || msg.includes('login') || msg.includes('auth')) {
            errorMessage = txt.errors.authRequired
          } else {
            // Show backend message only if it seems user-friendly (not too technical)
            errorMessage = result.error.message.length < 150 ? result.error.message : txt.orderFailed
          }
        }
        
        setErrorDialog({
          open: true,
          title: t.alertDialogs.checkoutError.title,
          description: errorMessage,
        })
      }
    } catch (error: any) {
      console.error("Order submission error:", error)
      
      // Handle network/fetch errors
      let errorMessage = txt.genericError
      if (error.message?.includes('fetch') || error.message?.includes('network') || error.message?.includes('connection')) {
        errorMessage = txt.errors.networkError
      }
      
      setErrorDialog({
        open: true,
        title: t.alertDialogs.checkoutError.title,
        description: errorMessage,
      })
    } finally {
      setLoading(false)
    }
  }

  // Show nothing while redirecting
  if (items.length === 0) {
    return null
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1 bg-muted/30">
        <div className="container mx-auto px-4 py-8">
          <Link
            href="/cart"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6"
          >
            <ChevronLeft className={`h-4 w-4 ${language === 'ar' ? 'ml-1 rotate-180' : 'mr-1'}`} />
            {txt.backToCart}
          </Link>

          <h1 className="text-3xl font-bold mb-8">{t.checkout.title}</h1>

          <form onSubmit={handleSubmit}>
            <div className="grid lg:grid-cols-3 gap-8">
              {/* Checkout Form */}
              <div className="lg:col-span-2 space-y-6">
                {/* Contact Information */}
                <div className="bg-card rounded-lg border border-border p-6">
                  <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <span className="w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm">
                      1
                    </span>
                    {txt.contactInfo}
                  </h2>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="firstName">
                        {t.checkout.firstName}
                        <span className="text-red-500 ml-1">*</span>
                      </Label>
                      <Input 
                        id="firstName" 
                        name="firstName" 
                        defaultValue={user?.firstName || ""} 
                        required 
                        minLength={2}
                        maxLength={50}
                        className="text-left" 
                        style={{ direction: 'ltr' }} 
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lastName">
                        {t.checkout.lastName}
                        <span className="text-red-500 ml-1">*</span>
                      </Label>
                      <Input 
                        id="lastName" 
                        name="lastName" 
                        defaultValue={user?.lastName || ""} 
                        required 
                        minLength={2}
                        maxLength={50}
                        className="text-left" 
                        style={{ direction: 'ltr' }} 
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">
                        {t.checkout.email}
                        <span className="text-red-500 ml-1">*</span>
                      </Label>
                      <Input 
                        id="email" 
                        name="email" 
                        type="email" 
                        defaultValue={user?.email || ""} 
                        required 
                        className="text-left" 
                        style={{ direction: 'ltr' }} 
                        placeholder="example@email.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone" className="flex items-center gap-2">
                        <Phone className="h-4 w-4" />
                        {t.checkout.phone}
                        <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id="phone"
                        name="phone"
                        type="tel"
                        value={phoneValue || user?.phone || ""}
                        onChange={handlePhoneChange}
                        placeholder="0555 12 34 56"
                        required
                        className={`text-left ${phoneError ? 'border-red-500 focus:ring-red-500' : ''}`}
                        style={{ direction: 'ltr' }}
                      />
                      {phoneError && (
                        <p className="text-sm text-red-500 flex items-center gap-1">
                          <AlertCircle className="h-3.5 w-3.5" />
                          {phoneError}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {language === 'ar' 
                          ? 'مثال: 0555 12 34 56 أو +213 555 12 34 56'
                          : 'Exemple: 0555 12 34 56 ou +213 555 12 34 56'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Shipping Address */}
                <div className="bg-card rounded-lg border border-border p-6">
                  <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <span className="w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm">
                      2
                    </span>
                    <MapPin className="h-4 w-4" />
                    {t.checkout.shippingAddress}
                  </h2>
                  <div className="space-y-4">
                    {/* Wilaya Selector */}
                    <div className="space-y-2">
                      <Label htmlFor="wilaya">
                        {language === 'ar' ? "الولاية" : "Wilaya"}
                        <span className="text-red-500 ml-1">*</span>
                      </Label>
                      <Select value={selectedWilaya} onValueChange={setSelectedWilaya} disabled={loadingWilayas} required>
                        <SelectTrigger id="wilaya">
                          <SelectValue placeholder={
                            loadingWilayas
                              ? (language === 'ar' ? "جاري التحميل..." : "Chargement...")
                              : (language === 'ar' ? "اختر الولاية" : "Sélectionnez une wilaya")
                          } />
                        </SelectTrigger>
                        <SelectContent>
                          {wilayas.map((wilaya) => (
                            <SelectItem key={wilaya.id} value={wilaya.id.toString()}>
                              {wilaya.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {loadingWilayas && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          {language === 'ar' ? 'جاري تحميل الولايات...' : 'Chargement des wilayas...'}
                        </div>
                      )}
                    </div>

                    {/* Delivery Type - Show after wilaya selection */}
                    {selectedWilaya && (
                      <div className="space-y-3 p-4 bg-muted/30 rounded-lg border border-border">
                        <Label className="font-semibold flex items-center gap-2">
                          <Truck className="h-4 w-4" />
                          {language === 'ar' ? "طريقة التوصيل" : "Mode de livraison"}
                        </Label>
                        <RadioGroup value={deliveryType} onValueChange={(value: "home" | "stopdesk") => {
                          setDeliveryType(value)
                          setSelectedStopDesk("")
                          setShippingEstimate(null)
                        }} className="grid gap-3">
                          {/* Home Delivery Option */}
                          <div className={`relative flex items-start gap-3 p-4 border-2 rounded-lg cursor-pointer transition-all ${
                            deliveryType === 'home' 
                              ? 'border-primary bg-primary/5' 
                              : 'border-border hover:border-muted-foreground/50 hover:bg-muted/50'
                          }`}>
                            <RadioGroupItem value="home" id="home-delivery" className="mt-1" />
                            <Label htmlFor="home-delivery" className="flex-1 cursor-pointer">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="text-lg">🏠</span>
                                  <span className="font-medium">{language === 'ar' ? "توصيل منزلي" : "Livraison à domicile"}</span>
                                </div>
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">
                                {language === 'ar' ? "يتم التوصيل مباشرة إلى عنوانك" : "Livraison directe à votre adresse"}
                              </p>
                            </Label>
                          </div>

                          {/* Stop Desk Option */}
                          <div className={`relative flex items-start gap-3 p-4 border-2 rounded-lg cursor-pointer transition-all ${
                            deliveryType === 'stopdesk' 
                              ? 'border-primary bg-primary/5' 
                              : 'border-border hover:border-muted-foreground/50 hover:bg-muted/50'
                          } ${stopDesks.length === 0 && !loadingStopDesks ? 'opacity-50' : ''}`}>
                            <RadioGroupItem 
                              value="stopdesk" 
                              id="stopdesk-delivery" 
                              className="mt-1"
                              disabled={stopDesks.length === 0 && !loadingStopDesks}
                            />
                            <Label htmlFor="stopdesk-delivery" className="flex-1 cursor-pointer">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="text-lg">📦</span>
                                  <span className="font-medium">{language === 'ar' ? "نقطة استلام" : "Point relais"}</span>
                                </div>
                                {stopDesks.length > 0 && (
                                  <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full">
                                    {language === 'ar' ? "أرخص" : "Moins cher"}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">
                                {stopDesks.length === 0 && !loadingStopDesks
                                  ? (language === 'ar' ? "غير متوفر في هذه المنطقة" : "Non disponible dans cette zone")
                                  : (language === 'ar' ? "استلام من نقطة قريبة - توفير في التكلفة" : "Retrait en point relais - Économisez sur les frais")}
                              </p>
                            </Label>
                          </div>
                        </RadioGroup>
                      </div>
                    )}

                    {/* Stop Desk Selector - Show when delivery type is stopdesk (directly from wilaya) */}
                    {deliveryType === 'stopdesk' && selectedWilaya && stopDesks.length > 0 && (
                      <div className="space-y-2">
                        <Label htmlFor="stopdesk">
                          {language === 'ar' ? "نقطة الاستلام" : "Point relais"}
                          <span className="text-red-500 ml-1">*</span>
                        </Label>
                        <Select 
                          value={selectedStopDesk} 
                          onValueChange={(value: string) => {
                            setSelectedStopDesk(value)
                            // Auto-populate commune from selected stop desk
                            const selectedDesk = stopDesks.find(desk => desk.center_id.toString() === value)
                            if (selectedDesk) {
                              setSelectedCommune(selectedDesk.commune_id.toString())
                            }
                          }}
                          disabled={loadingStopDesks || stopDesks.length === 0}
                          required
                        >
                          <SelectTrigger id="stopdesk">
                            <SelectValue placeholder={
                              loadingStopDesks
                                ? (language === 'ar' ? "جاري التحميل..." : "Chargement...")
                                : stopDesks.length === 0
                                ? (language === 'ar' ? "لا توجد نقاط استلام في هذه الولاية" : "Aucun point relais dans cette wilaya")
                                : (language === 'ar' ? "اختر نقطة الاستلام" : "Sélectionnez un point relais")
                            } />
                          </SelectTrigger>
                          <SelectContent>
                            {stopDesks.map((desk) => (
                              <SelectItem key={desk.center_id} value={desk.center_id.toString()}>
                                <div className="flex flex-col">
                                  <span className="font-medium">{desk.name}</span>
                                  <span className="text-xs text-muted-foreground">{desk.commune_name} - {desk.address}</span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {loadingStopDesks && (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            {language === 'ar' ? 'جاري تحميل نقاط الاستلام...' : 'Chargement des points relais...'}
                          </div>
                        )}
                        {!loadingStopDesks && stopDesks.length === 0 && selectedWilaya && (
                          <p className="text-xs text-amber-600">
                            {language === 'ar' 
                              ? "لا توجد نقاط استلام في هذه الولاية. يرجى اختيار التوصيل المنزلي." 
                              : "Aucun point relais n'est disponible dans cette wilaya. Veuillez choisir la livraison à domicile."}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Commune Selector - Show only for home delivery */}
                    {deliveryType === 'home' && selectedWilaya && (
                      <div className="space-y-2">
                        <Label htmlFor="commune">
                          {language === 'ar' ? "البلدية" : "Commune"}
                          <span className="text-red-500 ml-1">*</span>
                        </Label>
                        <Select 
                          value={selectedCommune} 
                          onValueChange={setSelectedCommune}
                          disabled={loadingCommunes || communes.length === 0}
                          required
                        >
                          <SelectTrigger id="commune">
                            <SelectValue placeholder={
                              loadingCommunes
                              ? (language === 'ar' ? "جاري التحميل..." : "Chargement...")
                              : communes.length === 0
                              ? (language === 'ar' ? "لا توجد بلديات متاحة" : "Aucune commune disponible")
                              : (language === 'ar' ? "اختر البلدية" : "Sélectionnez une commune")
                            } />
                          </SelectTrigger>
                          <SelectContent>
                            {communes.map((commune) => (
                              <SelectItem key={commune.id} value={commune.id.toString()}>
                                {commune.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {loadingCommunes && (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            {language === 'ar' ? 'جاري تحميل البلديات...' : 'Chargement des communes...'}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Selected Stop Desk Info */}
                    {deliveryType === 'stopdesk' && selectedStopDesk && (
                      <div className="text-sm bg-muted/50 p-3 rounded-lg border">
                        <p className="font-medium">
                          {stopDesks.find(d => d.center_id.toString() === selectedStopDesk)?.name}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {stopDesks.find(d => d.center_id.toString() === selectedStopDesk)?.commune_name} - {stopDesks.find(d => d.center_id.toString() === selectedStopDesk)?.address}
                        </p>
                      </div>
                    )}



                    {/* Address Line */}
                    <div className="space-y-2">
                      <Label htmlFor="address">
                        {t.checkout.address}
                        <span className="text-red-500 ml-1">*</span>
                      </Label>
                      <Input 
                        id="address" 
                        name="address" 
                        placeholder={language === 'ar' ? "رقم المنزل، اسم الشارع، الحي" : "N° maison, rue, quartier"} 
                        required 
                        minLength={5}
                        maxLength={200}
                      />
                    </div>

                    {/* Postal Code */}
                    <div className="space-y-2">
                      <Label htmlFor="postalCode">{t.checkout.postalCode}</Label>
                      <Input 
                        id="postalCode" 
                        name="postalCode" 
                        placeholder="16000" 
                        pattern="[0-9]{5}"
                        maxLength={5}
                        className="text-left" 
                        style={{ direction: 'ltr' }} 
                      />
                      <p className="text-xs text-muted-foreground">
                        {language === 'ar' ? 'اختياري - 5 أرقام' : 'Optionnel - 5 chiffres'}
                      </p>
                    </div>

                    {/* Shipping Estimate */}
                    {selectedCommune && shippingEstimate && (
                      <div className="bg-blue-50 dark:bg-blue-950/20 p-4 rounded-lg space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium flex items-center gap-2">
                            <Truck className="h-4 w-4 text-blue-600" />
                            {language === 'ar' ? "تكلفة الشحن" : "Frais de livraison"}
                          </span>
                          {loadingShipping ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <span className="font-bold text-blue-600">{formatPrice(shippingEstimate.totalShippingCost)}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Clock className="h-4 w-4" />
                          <span>
                            {language === 'ar' ? "وقت التوصيل: " : "Délai: "}
                            {shippingEstimate.deliveryTime} {language === 'ar' ? 'أيام' : 'jours'}
                          </span>
                        </div>
                      </div>
                    )}
                    {/* Shipping Error */}
                    {selectedCommune && shippingError && !loadingShipping && (
                      <div className="bg-red-50 dark:bg-red-950/20 p-4 rounded-lg">
                        <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
                          <AlertCircle className="h-4 w-4" />
                          <span>{shippingError}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Payment Method */}
                <div className="bg-card rounded-lg border border-border p-6">
                  <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <span className="w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm">
                      3
                    </span>
                    <CreditCard className="h-4 w-4" />
                    {t.checkout.paymentMethod}
                  </h2>
                  <RadioGroup value={paymentMethod} onValueChange={setPaymentMethod}>
                    <div className="flex items-center gap-3 p-4 border border-border rounded-lg cursor-pointer hover:bg-muted/50">
                      <RadioGroupItem value="cod" id="cod" />
                      <Label htmlFor="cod" className="flex-1 cursor-pointer">
                        <div className="font-medium">{t.checkout.cashOnDelivery}</div>
                        <div className="text-sm text-muted-foreground">{txt.codDesc}</div>
                      </Label>
                    </div>
                    <div className="relative flex items-center gap-3 p-4 border border-border rounded-lg opacity-60 mt-3">
                      <RadioGroupItem value="cib" id="cib" disabled />
                      <Label htmlFor="cib" className="flex-1">
                        <div className="font-medium flex items-center gap-2">
                          Carte CIB / EDAHABIA
                          <span className="text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full">
                            {language === 'ar' ? 'قريباً' : 'Bientôt'}
                          </span>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {language === 'ar' ? 'هذه الطريقة غير متاحة حالياً' : 'Cette méthode n\'est pas encore disponible'}
                        </div>
                      </Label>
                    </div>
                  </RadioGroup>
                </div>
              </div>

              {/* Order Summary */}
              <div>
                <div className="bg-card rounded-lg border border-border p-6 sticky top-24">
                  <h2 className="text-lg font-semibold mb-4">{t.checkout.orderSummary}</h2>

                  <div className="space-y-3 max-h-64 overflow-y-auto">
                    {items.map(({ product, quantity }) => {
                      const displayName = getLocalizedName(product.product_name, language)
                      return (
                        <div key={`${product.product_id}_${product.variant_id || ''}`} className="flex gap-3">
                          <div className="w-16 h-16 bg-muted rounded-lg shrink-0 relative">
                            <Image
                              src={getImageUrl(product.image_url)}
                              alt={displayName}
                              fill
                              className="object-contain p-1"
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{displayName}</p>
                            {product.variant_name && (
                              <p className="text-xs text-muted-foreground">{product.variant_name}</p>
                            )}
                            <p className="text-xs text-muted-foreground">{txt.qty}: {quantity}</p>
                            <p className="text-sm font-medium text-primary">
                              {formatPrice((product.sale_price || product.current_price) * quantity)}
                            </p>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  <div className="border-t border-border mt-4 pt-4 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t.cart.subtotal}</span>
                      <span>{formatPrice(totalPrice)}</span>
                    </div>
                    {appliedPromo && (
                      <div className="flex justify-between text-green-600">
                        <span>{txt.discount} ({appliedPromo.code})</span>
                        <span>-{formatPrice(discountAmount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Truck className="h-3.5 w-3.5" />
                        {t.cart.shipping}
                      </span>
                      {!selectedCommune ? (
                        <span className="text-muted-foreground">—</span>
                      ) : loadingShipping ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      ) : shipping === 0 && appliedPromo?.type === 'free_shipping' ? (
                        <span className="text-green-600 font-medium">{txt.free}</span>
                      ) : shipping === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span className="font-medium text-blue-600">{formatPrice(shipping)}</span>
                      )}
                    </div>
                    {shippingEstimate && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        <span>
                          {language === 'ar' ? 'التوصيل: ' : 'Délai: '}
                          {shippingEstimate.deliveryTime} {language === 'ar' ? 'أيام (تقريبا)' : 'jours (approx.)'}
                        </span>
                      </div>
                    )}
                    <div className="border-t border-border pt-2 flex justify-between text-base font-semibold">
                      <span>{t.cart.total}</span>
                      <span className="text-primary">{formatPrice(total)}</span>
                    </div>
                  </div>

                  <Button
                    type="submit"
                    className="w-full mt-6 bg-secondary hover:bg-secondary/90 text-secondary-foreground"
                    size="lg"
                    disabled={loading || loadingShipping || !shippingEstimate || !!shippingError || !!phoneError}
                  >
                    {loading ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {txt.processing}
                      </span>
                    ) : loadingShipping ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {language === 'ar' ? 'جاري حساب الشحن...' : 'Calcul de la livraison...'}
                      </span>
                    ) : (
                      t.checkout.placeOrder
                    )}
                  </Button>

                  <p className="text-xs text-muted-foreground text-center mt-4">
                    {txt.terms}
                  </p>
                </div>
              </div>
            </div>
          </form>
        </div>
      </main>

      <Footer />

      <AlertDialog open={errorDialog?.open || false} onOpenChange={(open: boolean) => !open && setErrorDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{errorDialog?.title}</AlertDialogTitle>
            <AlertDialogDescription>{errorDialog?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setErrorDialog(null)}>
              {t.alertDialogs.common.ok}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
