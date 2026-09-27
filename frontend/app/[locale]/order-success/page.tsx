"use client"

import { Suspense } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { CheckCircle, Package, ArrowRight, Home } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { useLanguage } from "@/lib/language-context"

function OrderSuccessContent() {
  const searchParams = useSearchParams()
  const orderNumber = searchParams.get("order") || `ORD-${Date.now().toString().slice(-6)}`
  const paymentMethod = searchParams.get("payment") || 'cod'
  const total = searchParams.get("total") || '0'
  const { t, language } = useLanguage()

  const localT = {
    fr: {
      confirmed: "Commande Confirmée!",
      thankYou: "Merci pour votre achat. Votre commande a été reçue et est en cours de traitement.",
      orderNumber: "Numéro de Commande",
      codTitle: "Paiement à la Livraison",
      codMsg: "Veuillez préparer",
      codMsg2: "en espèces. Vous paierez le livreur à l'arrivée de votre commande.",
      whatsNext: "Et Maintenant?",
      nextMsg: "Nous traiterons votre commande et la préparerons pour l'expédition. Le livreur vous contactera avant l'arrivée.",
      viewOrder: "Voir la Commande",
      continueShopping: "Continuer vos Achats"
    },
    ar: {
      confirmed: "تم تأكيد الطلب!",
      thankYou: "شكرًا لطلبك. تم استلام طلبك وجاري معالجته.",
      orderNumber: "رقم الطلب",
      codTitle: "الدفع عند الاستلام",
      codMsg: "يرجى تحضير مبلغ",
      codMsg2: "نقدًا. ستقوم بالدفع للمندوب عند استلام طلبك.",
      whatsNext: "ماذا الآن؟",
      nextMsg: "سنقوم بمعالجة طلبك وتجهيزه للشحن. سيتصل بك المندوب قبل الوصول.",
      viewOrder: "عرض الطلب",
      continueShopping: "مواصلة التسوق"
    }
  }

  const txt = localT[language === 'ar' ? 'ar' : 'fr']

  return (
    <div className="max-w-md w-full text-center">
      <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
        <CheckCircle className="h-10 w-10 text-green-600" />
      </div>

      <h1 className="text-3xl font-bold mb-2">{txt.confirmed}</h1>
      <p className="text-muted-foreground mb-6">
        {txt.thankYou}
      </p>

      <div className="bg-muted/50 rounded-lg p-6 mb-6">
        <p className="text-sm text-muted-foreground mb-1">{txt.orderNumber}</p>
        <p className="text-xl font-mono font-bold text-primary" style={{ direction: 'ltr' }}>{orderNumber}</p>
      </div>

      {paymentMethod === 'cod' && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
          <div className="text-left rtl:text-right space-y-2">
            <p className="font-semibold text-blue-900">{txt.codTitle}</p>
            <p className="text-sm text-blue-800">
              {txt.codMsg} <span className="font-bold">{parseInt(total).toLocaleString()} {t.common.dzd}</span> {txt.codMsg2}
            </p>
          </div>
        </div>
      )}

      <div className="bg-card border border-border rounded-lg p-6 mb-8">
        <div className="flex items-center gap-3 text-left rtl:text-right">
          <Package className="h-8 w-8 text-primary shrink-0" />
          <div>
            <p className="font-medium">{txt.whatsNext}</p>
            <p className="text-sm text-muted-foreground">
              {txt.nextMsg}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <Link href={`/orders`} className="flex-1">
          <Button variant="outline" className="w-full bg-transparent">
            <Package className={`h-4 w-4 ${language === 'ar' ? 'ml-2' : 'mr-2'}`} />
            {txt.viewOrder}
          </Button>
        </Link>
        <Link href="/store" className="flex-1">
          <Button className="w-full bg-primary hover:bg-primary/90">
            {txt.continueShopping}
            <ArrowRight className={`h-4 w-4 ${language === 'ar' ? 'mr-2 rotate-180' : 'ml-2'}`} />
          </Button>
        </Link>
      </div>
    </div>
  )
}

export default function OrderSuccessPage() {
  const { language } = useLanguage()
  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1 flex items-center justify-center px-4 py-16">
        <Suspense fallback={<div>{language === 'ar' ? "جار التحميل..." : "Chargement..."}</div>}>
          <OrderSuccessContent />
        </Suspense>
      </main>

      <Footer />
    </div>
  )
}
