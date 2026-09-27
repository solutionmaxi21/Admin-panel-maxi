"use client"

import { useEffect, useState, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { ordersApi, type Order } from "@/lib/api"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import { Alert, AlertDescription } from "@/components/ui/alert"
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
import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { OrderTracking } from "@/components/order-tracking"
import { toast } from "sonner"
import Link from "next/link"
import Image from "next/image"
import {
  ArrowLeft,
  Package,
  MapPin,
  Calendar,
  CreditCard,
  Truck,
  CheckCircle2,
  XCircle,
  Clock,
  FileText,
} from "lucide-react"
import { useLanguage } from "@/lib/language-context"

const getLocalizedName = (value: string | { fr?: string; ar?: string } | null | undefined, locale: string = 'fr'): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    return (locale === 'ar' ? value.ar || value.fr : value.fr || value.ar) || '';
  }
  return String(value);
};

const formatDateSafe = (dateInput: string | number | Date | null | undefined, options: Intl.DateTimeFormatOptions, locale: string = 'fr'): string => {
  if (!dateInput) return '';
  if (typeof dateInput !== 'string' && typeof dateInput !== 'number' && !(dateInput instanceof Date)) {
    return '';
  }
  try {
    const date = new Date(dateInput);
    if (!date || isNaN(date.getTime()) || date.getTime() === 0) {
      return '';
    }
    const localeStr = locale === 'ar' ? 'ar-DZ' : 'fr-FR';
    return new Intl.DateTimeFormat(localeStr, options).format(date);
  } catch {
    return '';
  }
};

export default function OrderDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { user, authState } = useAuth()
  const { t, language } = useLanguage()
  const [order, setOrder] = useState<Order | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const [isCancelling, setIsCancelling] = useState(false)
  const [showCancelDialog, setShowCancelDialog] = useState(false)
  const [fetchKey, setFetchKey] = useState(0)

  // Parse orderId safely - handle both string and array params
  const rawId = params?.id
  const orderId = rawId 
    ? parseInt(Array.isArray(rawId) ? rawId[0] : rawId, 10) 
    : null
  const localeCode = language === 'ar' ? 'ar' : 'fr'
  
  // Debug logging
  console.log('[OrderDetail] Render:', { 
    rawId, 
    orderId, 
    authState, 
    hasUser: !!user, 
    hasOrder: !!order, 
    isLoading, 
    fetchKey 
  })

  const localT = {
    fr: {
      statusDesc: {
        pending: "Votre commande a été reçue et est en attente de confirmation",
        processing: "Nous préparons votre commande pour l'expédition",
        shipped: "Votre commande est en route",
        delivered: "Votre commande a été livrée",
        cancelled: "Cette commande a été annulée"
      },
      confirmCancel: "Êtes-vous sûr de vouloir annuler cette commande ? Cette action est irréversible.",
      cancelSuccess: "Commande annulée avec succès",
      cancelError: "Échec de l'annulation de la commande",
      cancelBtn: "Annuler la Commande",
      cancelling: "Annulation...",
      errorLoad: "Échec du chargement de la commande",
      notFound: "Commande non trouvée",
      placedOn: "Passée le",
      at: "à",
      progress: "Progression de la Commande",
      deliveryStatus: "Statut de Livraison",
      deliveryAddress: "Adresse de Livraison",
      deliveryNotes: "Notes de Livraison",
      needHelp: "Besoin d'Aide ?",
      helpText: "Si vous avez des questions concernant votre commande, veuillez contacter notre équipe de support.",
      contactSupport: "Contacter le Support",
      method: "Méthode",
      status: "Statut",
      paidOn: "Payé le",
      paidAmount: "Montant Payé",
      payOnDelivery: "Vous paierez",
      payOnDelivery2: "au livreur à l'arrivée de votre commande.",
      onWay: "Votre commande est en route ! Le livreur vous contactera bientôt.",
      prepareCash: "Veuillez préparer",
      prepareCash2: "en espèces pour le livreur.",
      deliveredSuccess: "Commande livrée avec succès !",
      deliveredOn: "Livrée le",
      paymentReceived: "Paiement de",
      paymentReceived2: "reçu du client.",
      taxes: "Taxe"
    },
    ar: {
      statusDesc: {
        pending: "تم استلام طلبك وهو في انتظار التأكيد",
        processing: "نقوم بتجهيز طلبك للشحن",
        shipped: "طلبك في طريقه إليك",
        delivered: "تم توصيل طلبك بنجاح",
        cancelled: "تم إلغاء هذا الطلب"
      },
      confirmCancel: "هل أنت متأكد من رغبتك في إلغاء هذا الطلب؟ هذا الإجراء لا يمكن التراجع عنه.",
      cancelSuccess: "تم إلغاء الطلب بنجاح",
      cancelError: "فشل إلغاء الطلب",
      cancelBtn: "إلغاء الطلب",
      cancelling: "جاري الإلغاء...",
      errorLoad: "فشل تحميل الطلب",
      notFound: "الطلب غير موجود",
      placedOn: "تم الطلب في",
      at: "الساعة",
      progress: "تتبع الطلب",
      deliveryStatus: "حالة التوصيل",
      deliveryAddress: "عنوان التوصيل",
      deliveryNotes: "ملاحظات التوصيل",
      needHelp: "تحتاج مساعدة؟",
      helpText: "إذا كان لديك أي أسئلة بخصوص طلبك، يرجى الاتصال بفريق الدعم.",
      contactSupport: "تواصل مع الدعم",
      method: "طريقة الدفع",
      status: "الحالة",
      paidOn: "تم الدفع في",
      paidAmount: "المبلغ المدفوع",
      payOnDelivery: "ستدفع",
      payOnDelivery2: "للمندوب عند وصول طلبك.",
      onWay: "طلبك في الطريق! سيتصل بك المندوب قريبًا.",
      prepareCash: "يرجى تحضير مبلغ",
      prepareCash2: "نقدًا للمندوب.",
      deliveredSuccess: "تم توصيل الطلب بنجاح!",
      deliveredOn: "تم التوصيل في",
      paymentReceived: "تم استلام مبلغ",
      paymentReceived2: "من العميل.",
      taxes: "الضريبة"
    }
  }

  const txt = localT[language === 'ar' ? 'ar' : 'fr']

  const statusConfig = {
    pending: {
      label: t.ordersPage.status.pending,
      icon: Clock,
      color: "text-yellow-600",
      bgColor: "bg-yellow-50",
      description: txt.statusDesc.pending
    },
    processing: {
      label: t.ordersPage.status.processing,
      icon: Package,
      color: "text-blue-600",
      bgColor: "bg-blue-50",
      description: txt.statusDesc.processing
    },
    shipped: {
      label: t.ordersPage.status.shipped,
      icon: Truck,
      color: "text-purple-600",
      bgColor: "bg-purple-50",
      description: txt.statusDesc.shipped
    },
    delivered: {
      label: t.ordersPage.status.delivered,
      icon: CheckCircle2,
      color: "text-green-600",
      bgColor: "bg-green-50",
      description: txt.statusDesc.delivered
    },
    cancelled: {
      label: t.ordersPage.status.cancelled,
      icon: XCircle,
      color: "text-red-600",
      bgColor: "bg-red-50",
      description: txt.statusDesc.cancelled
    },
  }

  // Fetch order data - single effect with all logic
  useEffect(() => {
    let isMounted = true
    let timeoutId: NodeJS.Timeout | null = null
    
    console.log('[OrderDetail] Effect triggered:', { orderId, authState, hasUser: !!user })
    
    const fetchOrder = async () => {
      // Validate orderId first
      if (!orderId || isNaN(orderId)) {
        console.log('[OrderDetail] Invalid orderId, skipping fetch')
        if (isMounted) {
          setError(language === 'ar' ? 'الطلب غير موجود' : 'Commande non trouvée')
          setIsLoading(false)
        }
        return
      }

      // Wait for auth to complete
      if (authState === 'loading') {
        console.log('[OrderDetail] Auth still loading, waiting...')
        return
      }

      // Handle unauthenticated state
      if (authState === 'unauthenticated' || !user) {
        console.log('[OrderDetail] Not authenticated')
        if (isMounted) {
          setIsLoading(false)
        }
        return
      }

      console.log('[OrderDetail] Fetching order:', orderId)
      if (isMounted) {
        setIsLoading(true)
        setError(null)
      }

      try {
        const result = await ordersApi.getById(orderId)
        console.log('[OrderDetail] API result:', { hasData: !!result.data, hasError: !!result.error })
        
        if (!isMounted) {
          console.log('[OrderDetail] Component unmounted, discarding result')
          return
        }
        
        if (result.data) {
          console.log('[OrderDetail] Setting order data')
          setOrder(result.data)
          setRetryCount(0)
        } else if (result.error) {
          const errMessage = result.error.message || (language === 'ar' ? 'فشل تحميل الطلب' : 'Échec du chargement')
          const errorMsg = errMessage.includes('404') || errMessage.includes('not found')
            ? (language === 'ar' ? 'الطلب غير موجود' : 'Commande non trouvée')
            : errMessage
          setError(errorMsg)
        } else {
          // No data and no error - shouldn't happen but handle it
          console.log('[OrderDetail] No data and no error - unexpected state')
          setError(language === 'ar' ? 'حدث خطأ غير متوقع' : 'Une erreur inattendue s\'est produite')
        }
      } catch (err: unknown) {
        console.error('[OrderDetail] Fetch exception:', err)
        if (isMounted) {
          const errorMsg = err instanceof Error ? err.message : (language === 'ar' ? 'فشل تحميل الطلب' : 'Échec du chargement')
          setError(errorMsg)
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    // Reset state when orderId changes
    setOrder(null)
    setError(null)
    setIsLoading(true)
    
    // Small delay to ensure params are fully resolved on client navigation
    timeoutId = setTimeout(() => {
      fetchOrder()
    }, 0)

    return () => {
      isMounted = false
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
  }, [orderId, user?.id, authState, language, fetchKey])

  const loadOrder = () => {
    // Trigger a re-fetch by incrementing fetchKey
    console.log('[OrderDetail] Manual reload triggered')
    setFetchKey(prev => prev + 1)
  }

  const handleCancelOrder = async () => {
    if (!order) return
    setShowCancelDialog(false)
    setIsCancelling(true)

    try {
      const result = await ordersApi.cancel(order.order_id)
      if (result.success) {
        toast.success(txt.cancelSuccess)
        await loadOrder()
      } else {
        const errMessage = result.error?.message || txt.cancelError
        const errorMsg = errMessage.includes('Only')
          ? (language === 'ar'
            ? `لا يمكن إلغاء الطلب. ${errMessage}`
            : `Impossible d'annuler la commande. ${errMessage}`)
          : errMessage
        toast.error(errorMsg)
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : txt.cancelError
      toast.error(errorMsg)
    } finally {
      setIsCancelling(false)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1">
          <div className="container mx-auto px-4 py-8">
            <Skeleton className="h-10 w-32 mb-6" />
            <div className="space-y-6">
              <Skeleton className="h-64 w-full" />
              <Skeleton className="h-96 w-full" />
            </div>
          </div>
        </main>
        <Footer />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1">
          <div className="container mx-auto px-4 py-8">
            <Card>
              <CardContent className="py-8">
                <p className="text-center text-muted-foreground">{t.accountPage.pleaseLogin}</p>
              </CardContent>
            </Card>
          </div>
        </main>
        <Footer />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1">
          <div className="container mx-auto px-4 py-8">
            <Button variant="ghost" onClick={() => router.back()} className="mb-6">
              <ArrowLeft className={`h-4 w-4 ${language === 'ar' ? 'ml-2 rotate-180' : 'mr-2'}`} />
              {t.common.back}
            </Button>
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
            <div className="flex gap-2 mt-4">
              <Button
                onClick={() => {
                  if (retryCount < 3) {
                    setRetryCount(prev => prev + 1)
                    loadOrder()
                  }
                }}
                disabled={retryCount >= 3}
              >
                {language === 'ar' ? 'إعادة المحاولة' : 'Réessayer'}
                {retryCount > 0 && ` (${retryCount}/3)`}
              </Button>
              <Link href="/orders">
                <Button variant="outline">
                  <ArrowLeft className={`h-4 w-4 ${language === 'ar' ? 'ml-2 rotate-180' : 'mr-2'}`} />
                  {language === 'ar' ? 'العودة إلى الطلبات' : 'Retour aux Commandes'}
                </Button>
              </Link>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    )
  }

  if (!order) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1">
          <div className="container mx-auto px-4 py-8">
            <Skeleton className="h-10 w-32 mb-6" />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-6">
                <Skeleton className="h-48 w-full" />
                <Skeleton className="h-64 w-full" />
              </div>
              <div className="space-y-6">
                <Skeleton className="h-40 w-full" />
                <Skeleton className="h-40 w-full" />
                <Skeleton className="h-32 w-full" />
              </div>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    )
  }

  const status = statusConfig[order.current_status as keyof typeof statusConfig] || statusConfig.pending
  const StatusIcon = status.icon

  const shippingInfo = order.shipping_snapshot
    ? (typeof order.shipping_snapshot === 'string'
      ? JSON.parse(order.shipping_snapshot)
      : order.shipping_snapshot)
    : null

  const statusOrder = ['pending', 'processing', 'shipped', 'delivered']
  const currentStatusIndex = statusOrder.indexOf(order.current_status)

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <div className="container mx-auto px-4 py-8">
          <Button variant="ghost" onClick={() => router.back()} className="mb-6">
            <ArrowLeft className={`h-4 w-4 ${language === 'ar' ? 'ml-2 rotate-180' : 'mr-2'}`} />
            {t.common.back}
          </Button>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column - Main Content */}
            <div className="lg:col-span-2 space-y-6">
            {/* Order Status Card */}
            <Card className="overflow-hidden">
              <CardHeader className="bg-gradient-to-r from-primary/5 via-primary/10 to-transparent border-b">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <CardTitle className="flex items-center gap-2 text-xl">
                      <Package className="h-5 w-5 text-primary" />
                      {t.ordersPage.details.orderHash}
                      <span style={{ direction: 'ltr' }} className="font-mono text-primary">{order.order_number}</span>
                    </CardTitle>
                    <CardDescription className="flex items-center gap-2 text-sm">
                      <Calendar className="h-4 w-4" />
                      {txt.placedOn} {formatDateSafe(order.ordered_at, { dateStyle: 'long' }, localeCode)} {txt.at} {formatDateSafe(order.ordered_at, { timeStyle: 'short' }, localeCode)}
                    </CardDescription>
                  </div>
                  <div className={`p-4 rounded-2xl ${status.bgColor} shadow-sm`}>
                    <StatusIcon className={`h-8 w-8 ${status.color}`} />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                <div className={`p-5 rounded-xl ${status.bgColor} border ${status.color.replace('text-', 'border-')}/20`}>
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-white/80 dark:bg-black/20">
                      <StatusIcon className={`h-5 w-5 ${status.color}`} />
                    </div>
                    <div>
                      <h3 className={`font-bold text-lg ${status.color}`}>{status.label}</h3>
                      <p className="text-sm text-muted-foreground">{status.description}</p>
                    </div>
                  </div>
                </div>

                {/* Order Timeline - Hide when Guepex tracking exists */}
                {order.current_status !== 'cancelled' && !order.tracking_number && !order.guepex_tracking_number && (
                  <div className="mt-6 space-y-4">
                    <h4 className="font-semibold">{txt.progress}</h4>
                    <div className="relative">
                      <div className={`absolute top-5 h-[calc(100%-40px)] w-0.5 bg-muted ${language === 'ar' ? 'right-5' : 'left-5'}`} />
                      {statusOrder.map((statusKey, index) => {
                        const isPassed = index <= currentStatusIndex
                        const statusInfo = statusConfig[statusKey as keyof typeof statusConfig]
                        const StatusIconItem = statusInfo.icon

                        return (
                          <div key={statusKey} className="relative flex items-start gap-4 pb-8 last:pb-0">
                            <div className={`relative z-10 flex h-10 w-10 items-center justify-center rounded-full border-2 ${isPassed
                              ? 'bg-primary border-primary text-primary-foreground'
                              : 'bg-background border-muted'
                              }`}>
                              <StatusIconItem className="h-5 w-5" />
                            </div>
                            <div className="flex-1 pt-1">
                              <p className={`font-medium ${isPassed ? 'text-foreground' : 'text-muted-foreground'}`}>
                                {statusInfo.label}
                              </p>
                              {index === currentStatusIndex && order.history && order.history[0] && order.history[0].changed_at && (
                                <p className="text-sm text-muted-foreground">
                                  {formatDateSafe(order.history[0].changed_at, { dateStyle: 'medium', timeStyle: 'short' }, localeCode)}
                                </p>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                {order.current_status === 'pending' && (
                  <div className="mt-6 pt-6 border-t">
                    <Button
                      variant="outline"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => setShowCancelDialog(true)}
                      disabled={isCancelling}
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      {isCancelling ? txt.cancelling : txt.cancelBtn}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Order Items */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5 text-muted-foreground" />
                  {t.ordersPage.details.items}
                </CardTitle>
                <CardDescription>
                  {order.items?.length || 0} {(order.items?.length ?? 0) === 1 ? t.ordersPage.details.item : t.ordersPage.details.items}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {order.items?.map((item, index) => (
                    <div key={`${item.order_item_id}-${item.product_id}-${index}`} className="flex gap-4">
                      {item.product?.images && item.product.images[0] ? (
                        <div className="relative h-20 w-20 rounded-md overflow-hidden bg-muted flex-shrink-0">
                          <Image
                            src={item.product.images[0].image_url}
                            alt={getLocalizedName(item.product_name_snapshot, language)}
                            fill
                            className="object-cover"
                          />
                        </div>
                      ) : (
                        <div className="h-20 w-20 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                          <Package className="h-8 w-8 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{getLocalizedName(item.product_name_snapshot, language)}</p>
                        <p className="text-sm text-muted-foreground">
                          {(item.unit_price ?? 0).toLocaleString()} {t.common.dzd} × {item.quantity ?? 1}
                        </p>
                        {(item.discount_amount ?? 0) > 0 && (
                          <p className="text-sm text-green-600">
                            {t.cart.discount}: -{(item.discount_amount ?? 0).toLocaleString()} {t.common.dzd}
                          </p>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-semibold">{(item.line_total ?? 0).toLocaleString()} {t.common.dzd}</p>
                      </div>
                    </div>
                  ))}
                  {(!order.items || order.items.length === 0) && (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <div className="p-4 rounded-full bg-muted mb-4">
                        <Package className="h-10 w-10 text-muted-foreground" />
                      </div>
                      <p className="text-muted-foreground font-medium">
                        {language === 'ar' ? 'لا توجد منتجات' : 'Aucun produit'}
                      </p>
                    </div>
                  )}
                </div>

                {/* Order Summary in items card */}
                {order.items && order.items.length > 0 && (
                  <>
                    <Separator className="my-4" />
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{t.cart.subtotal}</span>
                        <span>{(order.subtotal ?? 0).toLocaleString()} {t.common.dzd}</span>
                      </div>
                      {order.discount_amount != null && order.discount_amount > 0 && (
                        <div className="flex justify-between text-sm text-green-600">
                          <span>{t.cart.discount}</span>
                          <span>-{(order.discount_amount ?? 0).toLocaleString()} {t.common.dzd}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{t.cart.shipping}</span>
                        <span>{(order.shipping_cost ?? 0).toLocaleString()} {t.common.dzd}</span>
                      </div>
                      {order.tax_amount != null && order.tax_amount > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">{txt.taxes}</span>
                          <span>{(order.tax_amount ?? 0).toLocaleString()} {t.common.dzd}</span>
                        </div>
                      )}
                      <Separator />
                      <div className="flex justify-between font-bold text-lg">
                        <span>{t.cart.total}</span>
                        <span>{(order.total_amount ?? 0).toLocaleString()} {t.common.dzd}</span>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Delivery Status with Tracking */}
            {order.tracking_number && (
              <OrderTracking order={order} language={language} />
            )}

            {/* Shipping Address */}
            {shippingInfo && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="h-5 w-5" />
                    {txt.deliveryAddress}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-sm space-y-1">
                    {shippingInfo.firstName && (
                      <p className="font-semibold">
                        {shippingInfo.firstName} {shippingInfo.lastName}
                      </p>
                    )}
                    <p>{shippingInfo.address_line1 || shippingInfo.addressLine1}</p>
                    {(shippingInfo.address_line2 || shippingInfo.addressLine2) && (
                      <p>{shippingInfo.address_line2 || shippingInfo.addressLine2}</p>
                    )}
                    <p>
                      {shippingInfo.city}, {shippingInfo.state} {shippingInfo.postal_code || shippingInfo.postalCode}
                    </p>
                    <p>{shippingInfo.country}</p>
                    {shippingInfo.phone && (
                      <p className="pt-2 text-muted-foreground" style={{ direction: 'ltr', textAlign: language === 'ar' ? 'right' : 'left' }}>
                        {shippingInfo.phone}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Delivery Notes */}
            {order.delivery_notes && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    {txt.deliveryNotes}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{order.delivery_notes}</p>
                </CardContent>
              </Card>
            )}
            </div>

            {/* Right Column - Sidebar */}
            <div className="space-y-6">
              {/* Order Summary Card */}
              <Card>
                <CardHeader>
                  <CardTitle>{language === 'ar' ? 'ملخص الطلب' : 'Résumé de la Commande'}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t.cart.subtotal}</span>
                    <span>{(order.subtotal ?? 0).toLocaleString()} {t.common.dzd}</span>
                  </div>
                  {order.discount_amount != null && order.discount_amount > 0 && (
                    <div className="flex justify-between text-sm text-green-600">
                      <span>{t.cart.discount}</span>
                      <span>-{(order.discount_amount ?? 0).toLocaleString()} {t.common.dzd}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t.cart.shipping}</span>
                    <span>{(order.shipping_cost ?? 0).toLocaleString()} {t.common.dzd}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between font-bold text-lg">
                    <span>{t.cart.total}</span>
                    <span>{(order.total_amount ?? 0).toLocaleString()} {t.common.dzd}</span>
                  </div>
                </CardContent>
              </Card>

            {/* Payment Info */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  {t.ordersPage.details.paymentMethod}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{txt.method}</span>
                    <span className="font-medium">
                      {order.payment_method === 'cod' ? t.checkout.cashOnDelivery :
                        order.payment_method === 'card' ? t.checkout.creditCard :
                          t.checkout.bankTransfer}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{txt.status}</span>
                    <Badge variant={order.payment_status === 'paid' ? 'default' : 'secondary'}>
                      {order.payment_status === 'paid' ? t.ordersPage.paymentStatus.paid :
                        order.payment_status === 'unpaid' ? t.ordersPage.paymentStatus.unpaid :
                          t.ordersPage.paymentStatus.refunded}
                    </Badge>
                  </div>

                  {/* Show prepayment details if exists */}
                  {order.prepaid_amount && order.prepaid_amount > 0 && (
                    <div className="p-3 rounded-lg bg-muted/50 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">
                          {language === 'ar' ? 'المبلغ المدفوع مسبقاً' : 'Montant Prépayé'}
                        </span>
                        <span className="font-medium text-green-600">
                          {(order.prepaid_amount ?? 0).toLocaleString()} {t.common.dzd}
                        </span>
                      </div>
                      {(order.cod_amount ?? 0) > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-amber-700 dark:text-amber-300">
                            {language === 'ar' ? 'المتبقي للدفع' : 'Restant à Payer'}
                          </span>
                          <span className="font-bold text-amber-700 dark:text-amber-300">
                            {(order.cod_amount ?? 0).toLocaleString()} {t.common.dzd}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* COD Payment Alert */}
                  {order.payment_method === 'cod' && order.payment_status === 'unpaid' && !order.tracking_number && !order.guepex_tracking_number && (
                    <Alert>
                      <AlertDescription className="text-sm">
                        {txt.payOnDelivery}{' '}
                        <span className="font-bold">
                          {((order.cod_amount ?? 0) > 0 ? (order.cod_amount ?? 0) : (order.total_amount ?? 0)).toLocaleString()} {t.common.dzd}
                        </span>{' '}
                        {txt.payOnDelivery2}
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Paid info */}
                  {order.paid_at && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{txt.paidOn}</span>
                      <span>{formatDateSafe(order.paid_at, { dateStyle: 'long' }, localeCode)}</span>
                    </div>
                  )}
                  {order.payment_status === 'paid' && order.paid_amount && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{txt.paidAmount}</span>
                      <span className="font-semibold text-green-600">
                        {order.paid_amount.toLocaleString()} {t.common.dzd}
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Need Help */}
            <Card>
              <CardHeader>
                <CardTitle>{txt.needHelp}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {txt.helpText}
                </p>
                <Link href="/contact">
                  <Button variant="outline" className="w-full">
                    {txt.contactSupport}
                  </Button>
                </Link>
              </CardContent>
            </Card>
            </div>
          </div>
        </div>
      </main>
      <Footer />

      {/* Cancel Order AlertDialog */}
      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.alertDialogs.cancelOrder.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.alertDialogs.cancelOrder.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.alertDialogs.common.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelOrder}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t.alertDialogs.cancelOrder.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
