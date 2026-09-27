"use client"

import { useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { Minus, Plus, Trash2, ShoppingBag, ArrowRight, Tag, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
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
import { useCart } from "@/lib/cart-context"
import { promotionsApi, type ValidatePromoResponse } from "@/lib/api"
import { formatPrice, getImageUrl } from "@/lib/utils"
import { toast } from "sonner"
import { useLanguage } from "@/lib/language-context"

export default function CartPage() {
  const { items, removeItem, updateQuantity, totalPrice, clearCart, appliedPromo, setAppliedPromo } = useCart()
  const [promoCode, setPromoCode] = useState("")
  const [isValidating, setIsValidating] = useState(false)
  const [errorDialog, setErrorDialog] = useState({ open: false, message: '', title: '' })
  const [clearCartDialog, setClearCartDialog] = useState(false)

  // --- CHANGE 1: Add state to track which item is being removed ---
  const [itemToRemove, setItemToRemove] = useState<{ productId: number; variantId?: number } | null>(null)

  const { t, language } = useLanguage()

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
      enterPromo: "Veuillez entrer un code promo",
      promoApplied: "Code promo appliqué avec succès!",
      promoInvalid: "Code promo invalide",
      validationFailed: "Échec de la validation du code promo",
      promoRemoved: "Code promo supprimé",
      emptyMessage: "Il semble que vous n'ayez encore rien ajouté à votre panier.",
      clearCart: "Vider le Panier",
      each: "chacun",
      promoPlaceholder: "Code promo",
      apply: "Appliquer",
      applying: "...",
      discount: "Réduction",
      free: "Gratuit",
      freeShippingMsg: "Livraison gratuite avec le code promo!",
      freeShippingQualify: "Vous bénéficiez de la livraison gratuite!",
      youSaved: "Vous avez économisé",
      securePayment: "Paiement sécurisé par Solution Maxi",
      // --- CHANGE 2: Add translations for item removal ---
      removeItemTitle: "Retirer l'article ?",
      removeItemDesc: "Êtes-vous sûr de vouloir retirer cet article de votre panier ?",
    },
    ar: {
      enterPromo: "الرجاء إدخال رمز العرض",
      promoApplied: "تم تطبيق الرمز الترويجي بنجاح!",
      promoInvalid: "رمز ترويجي غير صالح",
      validationFailed: "فشل التحقق من الرمز",
      promoRemoved: "تم إزالة الرمز الترويجي",
      emptyMessage: "يبدو أنك لم تضف أي شيء إلى عربة التسوق بعد.",
      clearCart: "إفراغ السلة",
      each: "للقطعة",
      promoPlaceholder: "رمز العرض",
      apply: "تطبيق",
      applying: "...",
      discount: "خصم",
      free: "مجاني",
      freeShippingMsg: "شحن مجاني مع الرمز الترويجي!",
      freeShippingQualify: "أنت مؤهل للشحن المجاني!",
      youSaved: "لقد وفرت",
      securePayment: "دفع آمن عبر Solution Maxi",
      // --- CHANGE 2: Add translations for item removal ---
      removeItemTitle: "حذف المنتج؟",
      removeItemDesc: "هل أنت متأكد أنك تريد إزالة هذا المنتج من السلة؟",
    }
  }

  const txt = localT[language === 'ar' ? 'ar' : 'fr']

  const shipping = 0

  const calculateDiscount = (subtotal: number, promo: { type: string; value: number }): number => {
    if (promo.type === 'percentage') {
      return Math.round(subtotal * (promo.value / 100))
    } else if (promo.type === 'fixed') {
      return promo.value
    } else if (promo.type === 'free_shipping') {
      return shipping
    }
    return 0
  }

  const discountAmount = appliedPromo ? calculateDiscount(totalPrice, appliedPromo) : 0
  const total = totalPrice - discountAmount

  const handleApplyPromo = async () => {
    if (!promoCode.trim()) {
      setErrorDialog({
        open: true,
        title: t.alertDialogs.validationError.title,
        message: txt.enterPromo
      })
      return
    }

    setIsValidating(true)
    try {
      const result = await promotionsApi.validate(promoCode.trim(), totalPrice)

      if (result.valid && result.code) {
        setAppliedPromo({
          code: result.code,
          type: result.type || 'fixed',
          value: result.value || 0,
          description: result.description
        })
        toast.success(`${txt.promoApplied} "${promoCode}"`)
      } else {
        setErrorDialog({
          open: true,
          title: t.alertDialogs.validationError.title,
          message: result.message || result.error || txt.promoInvalid
        })
      }
    } catch (error: any) {
      setErrorDialog({
        open: true,
        title: t.alertDialogs.validationError.title,
        message: error.message || txt.validationFailed
      })
    } finally {
      setIsValidating(false)
    }
  }

  const handleRemovePromo = () => {
    setAppliedPromo(null)
    setPromoCode("")
    toast.success(txt.promoRemoved)
  }

  if (items.length === 0) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center px-4 py-10 md:py-14">
          <div className="text-center">
            <div className="w-24 h-24 bg-muted rounded-full flex items-center justify-center mx-auto mb-6">
              <ShoppingBag className="h-12 w-12 text-muted-foreground" />
            </div>
            <h1 className="text-2xl font-bold mb-2">{t.cart.empty}</h1>
            <p className="text-muted-foreground mb-6">{txt.emptyMessage}</p>
            <Link href="/store">
              <Button className="bg-primary hover:bg-primary/90">
                {t.cart.continueShopping}
                <ArrowRight className={`h-4 w-4 ${language === 'ar' ? 'mr-2 rotate-180' : 'ml-2'}`} />
              </Button>
            </Link>
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
          <h1 className="text-3xl font-bold mb-8">{t.cart.title}</h1>

          <div className="grid lg:grid-cols-3 gap-8">
            {/* Cart Items */}
            <div className="lg:col-span-2 space-y-4">
              {items.map(({ product, quantity }) => {
                const effectivePrice = product.sale_price || product.current_price
                const displayName = getLocalizedName(product.product_name, language)

                return (
                  <div key={`${product.product_id}_${product.variant_id || ''}`} className="flex gap-4 p-4 bg-card rounded-lg border border-border">
                    <div className="w-24 h-24 bg-muted rounded-lg shrink-0 relative">
                      <Image
                        src={getImageUrl(product.image_url)}
                        alt={displayName}
                        fill
                        className="object-contain p-2"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <Link href={`/${language === 'ar' ? 'ar' : 'fr'}/product/${product.product_id}`}>
                        <h3 className="font-medium hover:text-primary transition-colors truncate">{displayName}</h3>
                      </Link>
                      <p className="text-sm text-muted-foreground">
                        {product.brand}
                        {product.variant_name && (
                          <span className="ml-2 text-xs bg-muted px-2 py-0.5 rounded">{product.variant_name}</span>
                        )}
                      </p>
                      <div className="flex items-center justify-between mt-3">
                        <div className="flex items-center border border-border rounded-lg">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => updateQuantity(product.product_id, quantity - 1, product.variant_id)}
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <span className="w-8 text-center text-sm">{quantity}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => updateQuantity(product.product_id, quantity + 1, product.variant_id)}
                            disabled={quantity >= product.stock}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                        <div className={`${language === 'ar' ? 'text-left' : 'text-right'}`}>
                          <p className="font-bold text-primary">{formatPrice(effectivePrice * quantity)}</p>
                          {quantity > 1 && (
                            <p className="text-xs text-muted-foreground">{formatPrice(effectivePrice)} {txt.each}</p>
                          )}
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                      // --- CHANGE 3: Update onClick to open dialog instead of removing immediately ---
                      onClick={() => setItemToRemove({ productId: product.product_id, variantId: product.variant_id })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )
              })
              }

              < div className="flex justify-between items-center pt-4" >
                <Button variant="outline" onClick={() => setClearCartDialog(true)}>
                  {txt.clearCart}
                </Button>
                <Link href="/store">
                  <Button variant="ghost">{t.cart.continueShopping}</Button>
                </Link>
              </div >
            </div >

            {/* Order Summary */}
            < div >
              <div className="bg-card rounded-lg border border-border p-6 sticky top-24">
                <h2 className="text-lg font-semibold mb-4">{t.cart.orderSummary}</h2>

                {/* Promo Code */}
                {!appliedPromo ? (
                  <div className="flex gap-2 mb-6">
                    <div className="relative flex-1">
                      <Tag className={`absolute top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground ${language === 'ar' ? 'right-3' : 'left-3'}`} />
                      <Input
                        placeholder={txt.promoPlaceholder}
                        className={`${language === 'ar' ? 'pr-10' : 'pl-10'}`}
                        value={promoCode}
                        onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                        onKeyDown={(e) => e.key === 'Enter' && handleApplyPromo()}
                      />
                    </div>
                    <Button
                      variant="outline"
                      onClick={handleApplyPromo}
                      disabled={isValidating || !promoCode.trim()}
                    >
                      {isValidating ? txt.applying : txt.apply}
                    </Button>
                  </div>
                ) : (
                  <div className="mb-6 p-3 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Tag className="h-4 w-4 text-green-600" />
                        <div>
                          <p className="font-medium text-sm text-green-700 dark:text-green-400">
                            {appliedPromo.code}
                          </p>
                          <p className="text-xs text-green-600 dark:text-green-500">
                            {appliedPromo.description}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={handleRemovePromo}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}

                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t.cart.subtotal}</span>
                    <span>{formatPrice(totalPrice)}</span>
                  </div>
                  {discountAmount > 0 && (
                    <div className="flex justify-between text-green-600">
                      <span>{txt.discount} ({appliedPromo?.code})</span>
                      <span>-{formatPrice(discountAmount)}</span>
                    </div>
                  )}
                  <div className="border-t border-border pt-3 flex justify-between text-base font-semibold">
                    <span>{t.cart.total}</span>
                    <span className="text-primary">{formatPrice(total)}</span>
                  </div>
                  {discountAmount > 0 && appliedPromo?.type !== 'free_shipping' && (
                    <p className="text-xs text-green-600">
                      {txt.youSaved} {formatPrice(discountAmount)}!
                    </p>
                  )}
                </div>

                <Link href="/checkout" className="block mt-6">
                  <Button className="w-full bg-secondary hover:bg-secondary/90 text-secondary-foreground" size="lg">
                    {t.cart.proceedToCheckout}
                    <ArrowRight className={`h-4 w-4 ${language === 'ar' ? 'mr-2 rotate-180' : 'ml-2'}`} />
                  </Button>
                </Link>

                <div className="mt-4 text-center">
                  <p className="text-xs text-muted-foreground">{txt.securePayment}</p>
                </div>
              </div>
            </div >
          </div >
        </div >
      </main >

      <Footer />

      {/* Cart Error AlertDialog */}
      <AlertDialog open={errorDialog.open} onOpenChange={(open) => setErrorDialog({ ...errorDialog, open })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{errorDialog.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {errorDialog.message}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setErrorDialog({ open: false, message: '', title: '' })}>
              {t.alertDialogs.common.ok}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Clear Cart Confirmation AlertDialog */}
      <AlertDialog open={clearCartDialog} onOpenChange={setClearCartDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.alertDialogs.clearCart.title}</AlertDialogTitle>
            <AlertDialogDescription>{t.alertDialogs.clearCart.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.alertDialogs.common.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                clearCart()
                setClearCartDialog(false)
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t.alertDialogs.common.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* --- CHANGE 4: Add the Item Removal Confirmation AlertDialog --- */}
      <AlertDialog open={!!itemToRemove} onOpenChange={(open) => !open && setItemToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {txt.removeItemTitle || (language === 'ar' ? "حذف المنتج؟" : "Retirer l'article ?")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {txt.removeItemDesc || (language === 'ar' ? "هل أنت متأكد أنك تريد إزالة هذا المنتج من السلة؟" : "Êtes-vous sûr de vouloir retirer cet article de votre panier ?")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.alertDialogs.common.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (itemToRemove) removeItem(itemToRemove.productId, itemToRemove.variantId)
                setItemToRemove(null)
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t.alertDialogs.common.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div >
  )
}