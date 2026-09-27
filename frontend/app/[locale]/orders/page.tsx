"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/lib/auth-context"
import { ordersApi, reviewsApi, type Order, type ReviewEligibility } from "@/lib/api"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import Link from "next/link"
import Image from "next/image"
import { Package, Calendar, DollarSign, ShoppingBag, Eye, ArrowRight, Star, Edit, Truck, Copy } from "lucide-react"
import { format, type Locale } from "date-fns"
import { fr, arDZ } from "date-fns/locale"
import { useRouter } from "next/navigation"
import { useLanguage } from "@/lib/language-context"

// Safe date formatting helper
const formatDateSafe = (dateInput: any, formatStr: string, locale: Locale): string => {
  if (!dateInput) return '';
  try {
    const date = new Date(dateInput);
    if (!date || isNaN(date.getTime())) return '';
    return format(date, formatStr, { locale });
  } catch (error) {
    console.error("Format date error:", error);
    return '';
  }
};

// Helper to get localized text from bilingual object or string
const getLocalizedName = (value: string | { fr?: string; ar?: string } | null | undefined, locale: string = 'fr'): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    return (locale === 'ar' ? value.ar || value.fr : value.fr || value.ar) || '';
  }
  return value;
};

export default function OrdersPage() {
  const { user, isLoading: authLoading } = useAuth()

  const { t, language } = useLanguage()
  const [orders, setOrders] = useState<Order[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const [reviewEligibility, setReviewEligibility] = useState<Record<number, ReviewEligibility>>({})
  const router = useRouter()

  useEffect(() => {
    // console.log('[Orders] Review eligibility updated:', reviewEligibility)
  }, [reviewEligibility])

  useEffect(() => {
    if (user) {
      loadOrders()
    } else if (!authLoading) {
      setIsLoading(false)
    }
  }, [user, authLoading])

  const loadOrders = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await ordersApi.getMyOrders()
      if (result.data !== undefined) {
        // Sort by date, newest first
        const sortedOrders = [...result.data].sort((a, b) =>
          new Date(b.ordered_at).getTime() - new Date(a.ordered_at).getTime()
        )
        setOrders(sortedOrders)

        // Check review eligibility for delivered orders
        const eligibilityPromises: Promise<void>[] = []
        sortedOrders.forEach(order => {
          if (order.current_status === 'delivered' && order.items) {
            order.items.forEach(item => {
              if (item.product_id) {
                eligibilityPromises.push(
                  reviewsApi.checkEligibility(item.product_id).then(result => {
                    if (result.data) {
                      setReviewEligibility(prev => ({
                        ...prev,
                        [item.product_id!]: result.data!
                      }))
                    }
                  }).catch(err => {
                    console.error('[Orders] Eligibility exception for product', item.product_id, ':', err)
                  })
                )
              }
            })
          }
        })
        await Promise.all(eligibilityPromises)
        setRetryCount(0) // Reset retry count on success
      } else if (result.error) {
        // Handle error object properly - extract message from error object
        const errorMsg = result.error?.message || t.ordersPage.errors.loadFailed
        setError(errorMsg)
        console.error('[Orders] Load error:', result.error)
      }
    } catch (err: any) {
      const errorMsg = err.message || t.ordersPage.errors.loadFailed
      setError(errorMsg)
      console.error('[Orders] Load exception:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const getStatusLabel = (status: string) => {
    const key = status as keyof typeof t.ordersPage.status
    return t.ordersPage.status[key] || status
  }

  const getPaymentStatusLabel = (status: string) => {
    const key = status as keyof typeof t.ordersPage.paymentStatus
    return t.ordersPage.paymentStatus[key] || status
  }

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'pending': return 'secondary';
      case 'processing': return 'default';
      case 'shipped': return 'default';
      case 'delivered': return 'default';
      case 'cancelled': return 'destructive';
      default: return 'secondary';
    }
  }

  const getPaymentStatusVariant = (status: string) => {
    switch (status) {
      case 'paid': return 'default';
      case 'unpaid': return 'secondary';
      case 'refunded': return 'outline';
      default: return 'secondary';
    }
  }

  // Determine date locale
  const dateLocale = language === 'ar' ? arDZ : fr

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1">
          <div className="container mx-auto px-4 py-8">
            <div className="space-y-6">
              <Skeleton className="h-10 w-48" />
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-48 w-full" />
                ))}
              </div>
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
                <div className="text-center">
                  <ShoppingBag className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                  <h2 className="text-2xl font-bold mb-2">{t.ordersPage.pleaseLogin}</h2>
                  <p className="text-muted-foreground mb-6">{t.ordersPage.loginMsg}</p>
                  <Link href="/login">
                    <Button>{t.ordersPage.loginBtn}</Button>
                  </Link>
                </div>
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
            <Card>
              <CardContent className="py-8">
                <p className="text-center text-destructive mb-4">{error}</p>
                <div className="text-center">
                  <Button
                    onClick={() => {
                      if (retryCount < 3) {
                        setRetryCount(prev => prev + 1)
                        loadOrders()
                      }
                    }}
                    disabled={retryCount >= 3}
                  >
                    {t.ordersPage.errors.tryAgain}
                    {retryCount > 0 && ` (${retryCount}/3)`}
                  </Button>
                  {retryCount >= 3 && (
                    <p className="text-sm text-muted-foreground mt-2">
                      {language === 'ar' ? 'يرجى المحاولة مرة أخرى لاحقًا أو الاتصال بالدعم' : 'Veuillez réessayer plus tard ou contacter le support'}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
        <Footer />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <div className="container mx-auto px-4 py-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold mb-2">{t.ordersPage.title}</h1>
            <p className="text-muted-foreground">{t.ordersPage.subtitle}</p>
          </div>

          {orders.length === 0 ? (
            <Card>
              <CardContent className="py-12">
                <div className="text-center">
                  <Package className="mx-auto h-16 w-16 text-muted-foreground mb-4" />
                  <h2 className="text-2xl font-bold mb-2">{t.ordersPage.empty.title}</h2>
                  <p className="text-muted-foreground mb-6">
                    {t.ordersPage.empty.message}
                  </p>
                  <Link href="/store">
                    <Button>
                      {t.ordersPage.empty.action}
                      <ArrowRight className={`h-4 w-4 ${language === 'ar' ? 'mr-2 rotate-180' : 'ml-2'}`} />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {/* Summary Stats */}
              <div className="grid gap-4 md:grid-cols-3">
                <Card>
                  <CardHeader className="pb-3">
                    <CardDescription>{t.ordersPage.stats.totalOrders}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2">
                      <ShoppingBag className="h-5 w-5 text-muted-foreground" />
                      <span className="text-2xl font-bold">{orders.length}</span>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-3">
                    <CardDescription>{t.ordersPage.stats.totalSpent}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-5 w-5 text-muted-foreground" />
                      <span className="text-2xl font-bold">
                        {orders
                          .filter(order => order.current_status === 'delivered')
                          .reduce((sum, order) => sum + order.total_amount, 0).toLocaleString()} {t.common.dzd}
                      </span>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-3">
                    <CardDescription>{t.ordersPage.stats.delivered}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2">
                      <Package className="h-5 w-5 text-muted-foreground" />
                      <span className="text-2xl font-bold">
                        {orders.filter(o => o.current_status === 'delivered').length}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Orders List */}
              <div className="space-y-4">
                {orders.map((order) => (
                  <Card key={order.order_id}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div className="space-y-1">
                          <CardTitle className="text-lg flex items-center gap-2">
                            {t.ordersPage.details.orderHash}<span style={{ direction: 'ltr' }}>{order.order_number}</span>
                          </CardTitle>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Calendar className="h-4 w-4" />
                              {formatDateSafe(order.ordered_at, "PPP", dateLocale)}
                            </div>
                            <div className="flex items-center gap-1">
                              <Package className="h-4 w-4" />
                              {order.items?.length || 0} {order.items?.length === 1 ? t.ordersPage.details.item : t.ordersPage.details.items}
                            </div>
                            <div className="flex items-center gap-1">
                              <DollarSign className="h-4 w-4" />
                              {order.payment_method === 'cod' ? t.checkout.cashOnDelivery :
                                order.payment_method === 'card' ? t.checkout.creditCard : t.checkout.bankTransfer}
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <Badge variant={getStatusVariant(order.current_status) as any}>
                            {getStatusLabel(order.current_status)}
                          </Badge>
                          <Badge variant={getPaymentStatusVariant(order.payment_status) as any}>
                            {getPaymentStatusLabel(order.payment_status)}
                          </Badge>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {/* Order Items Preview */}
                      {order.items && order.items.length > 0 && (
                        <div className="space-y-3 mb-4">
                          {order.items.slice(0, 3).map((item, index) => {
                            const eligibility = item.product_id ? reviewEligibility[item.product_id] : null
                            const canReview = eligibility?.eligible
                            const canEdit = eligibility?.canEdit
                            const hasReview = !!eligibility?.existingReview
                            const reviewStatus = eligibility?.existingReview?.status

                            return (
                              <div key={`${item.order_item_id}-${item.product_id}-${index}`} className="flex items-center gap-4">
                                {item.product?.images && item.product.images[0] ? (
                                  <div className="relative h-16 w-16 rounded-md overflow-hidden bg-muted">
                                    <Image
                                      src={item.product.images[0].image_url}
                                      alt={getLocalizedName(item.product_name_snapshot, language)}
                                      fill
                                      className="object-cover"
                                    />
                                  </div>
                                ) : (
                                  <div className="h-16 w-16 rounded-md bg-muted flex items-center justify-center">
                                    <Package className="h-6 w-6 text-muted-foreground" />
                                  </div>
                                )}
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium text-sm truncate">{getLocalizedName(item.product_name_snapshot, language)}</p>
                                  <p className="text-sm text-muted-foreground">
                                    {t.ordersPage.details.qty}: {item.quantity} × {item.unit_price.toLocaleString()} {t.common.dzd}
                                  </p>
                                  {/* Review Status/Action for Delivered Orders */}
                                  {order.current_status === 'delivered' && eligibility && (
                                    <div className="mt-1">
                                      {canReview ? (
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          className="h-7 text-xs"
                                          onClick={() => router.push(`/${language === 'ar' ? 'ar' : 'fr'}/product/${item.product_id}?tab=reviews`)}
                                        >
                                          <Star className={`h-3 w-3 ${language === 'ar' ? 'ml-1' : 'mr-1'}`} />
                                          {t.ordersPage.reviews.write} ({eligibility.daysRemaining}{t.ordersPage.reviews.daysLeft})
                                        </Button>
                                      ) : hasReview ? (
                                        <div className="flex items-center gap-2">
                                          {reviewStatus === 'pending' && (
                                            <Badge variant="secondary" className="text-xs h-6">
                                              {t.ordersPage.reviews.pending}
                                            </Badge>
                                          )}
                                          {reviewStatus === 'approved' && (
                                            <Badge variant="default" className="text-xs h-6">
                                              ✓ {t.ordersPage.reviews.published}
                                            </Badge>
                                          )}
                                          {reviewStatus === 'rejected' && (
                                            <Badge variant="destructive" className="text-xs h-6">
                                              {t.ordersPage.reviews.rejected}
                                            </Badge>
                                          )}
                                          {canEdit && (
                                            <Button
                                              size="sm"
                                              variant="ghost"
                                              className="h-6 text-xs px-2"
                                              onClick={() => router.push(`/${language === 'ar' ? 'ar' : 'fr'}/product/${item.product_id}?tab=reviews`)}
                                            >
                                              <Edit className="h-3 w-3" />
                                            </Button>
                                          )}
                                        </div>
                                      ) : eligibility.reason === 'time_expired' ? (
                                        <span className="text-xs text-muted-foreground">{t.ordersPage.reviews.expired}</span>
                                      ) : null}
                                    </div>
                                  )}
                                </div>
                                <div className={`${language === 'ar' ? 'text-left' : 'text-right'}`}>
                                  <p className="font-semibold">{item.line_total.toLocaleString()} {t.common.dzd}</p>
                                </div>
                              </div>
                            )
                          })}
                          {order.items.length > 3 && (
                            <p className="text-sm text-muted-foreground">
                              +{order.items.length - 3} {t.ordersPage.details.moreItems}
                            </p>
                          )}
                        </div>
                      )}

                      <Separator className="my-4" />

                      {/* Tracking Information */}
                      {order.tracking_number && (
                        <div className="mb-4 bg-blue-50 dark:bg-blue-950 rounded-lg p-3 border border-blue-200 dark:border-blue-800">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <Truck className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wider">
                                  {language === 'ar' ? 'رقم التتبع' : 'Numéro de Suivi'}
                                </p>
                                <code className="text-sm font-mono font-semibold text-blue-900 dark:text-blue-100 truncate block">
                                  {order.tracking_number}
                                </code>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {order.shipment_status && (
                                <Badge variant="outline" className="bg-white dark:bg-gray-900 text-xs whitespace-nowrap">
                                  {order.shipment_status}
                                </Badge>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.preventDefault()
                                  navigator.clipboard.writeText(order.tracking_number!)
                                  // Could add toast notification here
                                }}
                                className="h-8 w-8 p-0"
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">{t.ordersPage.details.total}</p>
                          <p className="text-2xl font-bold">{order.total_amount.toLocaleString()} {t.common.dzd}</p>
                        </div>
                        <Link href={`/orders/${order.order_id}`}>
                          <Button>
                            <Eye className={`h-4 w-4 ${language === 'ar' ? 'ml-2' : 'mr-2'}`} />
                            {t.ordersPage.details.viewDetails}
                          </Button>
                        </Link>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  )
}
