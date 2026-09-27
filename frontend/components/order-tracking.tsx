"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Package,
  Truck,
  CheckCircle,
  XCircle,
  MapPin,
  ExternalLink,
  Copy,
  Clock,
  PackageCheck,
  Info
} from "lucide-react"
import { toast } from "sonner"
import { useState } from "react"

interface OrderTrackingProps {
  order: {
    tracking_number?: string | null
    guepex_tracking_number?: string | null
    shipment_status?: string | null
    shipment_status_reason?: string | null
    carrier?: string | null
    guepex_created_at?: string | null
    guepex_label_url?: string | null
    updated_at?: string | null
    prepaid_amount?: number | null
    cod_amount?: number | null
    payment_method?: string | null
    total_amount?: number | null
  }
  language?: string
}

export function OrderTracking({ order, language = 'fr' }: OrderTrackingProps) {
  const [copied, setCopied] = useState(false)

  // Helper for safe date formatting
  const safeDate = (dateStr: string | null | undefined, options?: Intl.DateTimeFormatOptions) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '';
    try {
      return date.toLocaleString(language === 'ar' ? 'ar-DZ' : 'fr-FR', options);
    } catch (e) {
      return '';
    }
  };

  // Translations
  const t = {
    fr: {
      title: "Suivi de Livraison",
      trackingNumber: "Numéro de Suivi",
      carrier: "Transporteur",
      shippedOn: "Expédié le",
      currentStatus: "Statut Actuel",
      copyTracking: "Copier le numéro",
      trackOnline: "Suivre en Ligne",
      copied: "Copié !",
      paymentInfo: "Informations de Paiement",
      prepaid: "Prépayé (CCP/Banque)",
      cashOnDelivery: "À Payer à la Livraison",
      pleaseHave: "Veuillez préparer",
      forDriver: "en espèces pour le livreur",
      statuses: {
        'En préparation': { label: 'En Préparation', desc: 'Votre colis est en cours de préparation' },
        'Expédié': { label: 'Expédié', desc: 'Votre colis a quitté notre entrepôt' },
        'En transit': { label: 'En Transit', desc: 'Votre colis est en route vers vous' },
        'Sorti en livraison': { label: 'En Livraison', desc: 'Le livreur est en route vers vous' },
        'Livré': { label: 'Livré', desc: 'Votre colis a été livré avec succès' },
        'Retourné au vendeur': { label: 'Retourné', desc: 'Le colis a été retourné' },
        'Echèc livraison': { label: 'Échec', desc: 'Échec de la livraison' }
      }
    },
    ar: {
      title: "تتبع التوصيل",
      trackingNumber: "رقم التتبع",
      carrier: "شركة الشحن",
      shippedOn: "تم الشحن في",
      currentStatus: "الحالة الحالية",
      copyTracking: "نسخ الرقم",
      trackOnline: "تتبع عبر الإنترنت",
      copied: "تم النسخ!",
      paymentInfo: "معلومات الدفع",
      prepaid: "مدفوع مسبقاً (CCP/البنك)",
      cashOnDelivery: "الدفع عند الاستلام",
      pleaseHave: "يرجى تحضير",
      forDriver: "نقداً للسائق",
      statuses: {
        'En préparation': { label: 'قيد التحضير', desc: 'طردك قيد التحضير' },
        'Expédié': { label: 'تم الشحن', desc: 'غادر طردك مستودعنا' },
        'En transit': { label: 'في الطريق', desc: 'طردك في طريقه إليك' },
        'Sorti en livraison': { label: 'قيد التوصيل', desc: 'السائق في طريقه إليك' },
        'Livré': { label: 'تم التسليم', desc: 'تم تسليم طردك بنجاح' },
        'Retourné au vendeur': { label: 'مرتجع', desc: 'تم إرجاع الطرد' },
        'Echèc livraison': { label: 'فشل', desc: 'فشل التسليم' }
      }
    }
  }

  const txt = t[language as keyof typeof t] || t.fr

  if (!order.tracking_number && !order.guepex_tracking_number) {
    return null
  }

  const trackingNumber = order.tracking_number || order.guepex_tracking_number
  const currentStatus = order.shipment_status || 'En préparation'
  const statusInfo = txt.statuses[currentStatus as keyof typeof txt.statuses] || txt.statuses['En préparation']

  // Tracking steps for visual progress
  const trackingSteps = [
    {
      key: 'preparation',
      status: 'En préparation',
      icon: Package,
    },
    {
      key: 'shipped',
      status: 'Expédié',
      icon: Truck,
    },
    {
      key: 'transit',
      status: 'En transit',
      icon: MapPin,
    },
    {
      key: 'delivery',
      status: 'Sorti en livraison',
      icon: PackageCheck,
    },
    {
      key: 'delivered',
      status: 'Livré',
      icon: CheckCircle,
    }
  ]

  const statusToStepMap: Record<string, number> = {
    'En préparation': 0,
    'Expédié': 1,
    'En transit': 2,
    'Sorti en livraison': 3,
    'Livré': 4,
    'Retourné au vendeur': -1,
    'Echèc livraison': -1
  }

  const currentStepIndex = statusToStepMap[currentStatus] ?? 0
  const isCancelled = currentStepIndex === -1

  const copyToClipboard = () => {
    if (trackingNumber) {
      navigator.clipboard.writeText(trackingNumber)
      toast.success(txt.copied)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="space-y-6 p-6">
      {/* Tracking Number Section */}
      <div className="bg-blue-50 dark:bg-blue-950 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wider">
            {txt.trackingNumber}
          </span>
          <Badge variant={isCancelled ? "destructive" : "default"} className="text-xs">
            {statusInfo.label}
          </Badge>
        </div>
        <div className="flex items-center gap-3">
          <code className="text-lg font-bold text-blue-900 dark:text-blue-100 font-mono tracking-wide flex-1">
            {trackingNumber}
          </code>
          <Button
            variant="ghost"
            size="sm"
            onClick={copyToClipboard}
            className="flex-shrink-0"
          >
            <Copy className={`h-4 w-4 ${copied ? 'text-green-600' : ''}`} />
          </Button>
        </div>
        <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
          {statusInfo.desc}
        </p>
      </div>

        {/* Tracking Progress */}
        {!isCancelled && (
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              {txt.currentStatus}
            </h4>
            <div className="relative">
              {trackingSteps.map((step, index) => {
                const isPassed = index <= currentStepIndex
                const isCurrent = index === currentStepIndex
                const StepIcon = step.icon

                return (
                  <div key={step.key} className="relative">
                    {/* Connector Line */}
                    {index < trackingSteps.length - 1 && (
                      <div
                        className={`absolute ${language === 'ar' ? 'right-5' : 'left-5'} top-12 w-0.5 h-12 transition-colors duration-500 ${isPassed ? 'bg-blue-600 dark:bg-blue-400' : 'bg-gray-200 dark:bg-gray-700'
                          }`}
                      />
                    )}

                    {/* Step Item */}
                    <div className="relative flex items-start gap-4 pb-6">
                      <div
                        className={`relative z-10 flex h-10 w-10 items-center justify-center rounded-full transition-all duration-500 ${isPassed
                          ? 'bg-blue-600 dark:bg-blue-500 shadow-lg shadow-blue-600/50'
                          : 'bg-gray-200 dark:bg-gray-700'
                          } ${isCurrent ? 'ring-4 ring-blue-600/20 animate-pulse' : ''}`}
                      >
                        <StepIcon
                          className={`h-5 w-5 ${isPassed ? 'text-white' : 'text-gray-400 dark:text-gray-500'}`}
                        />
                      </div>
                      <div className="flex-1 pt-1.5">
                        <p
                          className={`font-medium transition-colors ${isPassed ? 'text-foreground' : 'text-muted-foreground'
                            }`}
                        >
                          {txt.statuses[step.status as keyof typeof txt.statuses]?.label || step.status}
                        </p>
                        {isCurrent && order.updated_at && (
                          <p className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1 mt-1">
                            <Clock className="h-3 w-3" />
                            {safeDate(order.updated_at)}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Cancelled Status */}
        {isCancelled && (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertDescription>
              <div className="font-semibold">{statusInfo.label}</div>
              {order.shipment_status_reason && (
                <p className="text-sm mt-1">{order.shipment_status_reason}</p>
              )}
            </AlertDescription>
          </Alert>
        )}

        {/* Payment Info - Only show if there are amounts > 0 */}
        {((order.prepaid_amount ?? 0) > 0 || (order.cod_amount ?? 0) > 0) && order.payment_method === 'cod' && (
          <div className="bg-amber-50 dark:bg-amber-950 rounded-lg p-4 border border-amber-200 dark:border-amber-800">
            <h4 className="text-sm font-semibold text-amber-900 dark:text-amber-100 mb-3 flex items-center gap-2">
              <Info className="h-4 w-4" />
              {txt.paymentInfo}
            </h4>
            <div className="space-y-2">
              {(order.prepaid_amount ?? 0) > 0 && (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-amber-700 dark:text-amber-300">{txt.prepaid}</span>
                  <span className="font-semibold text-green-600 dark:text-green-400">
                    {order.prepaid_amount!.toLocaleString()} DA
                  </span>
                </div>
              )}
              {(order.cod_amount ?? 0) > 0 && (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-amber-700 dark:text-amber-300">{txt.cashOnDelivery}</span>
                  <span className="font-bold text-amber-900 dark:text-amber-100 text-lg">
                    {order.cod_amount!.toLocaleString()} DA
                  </span>
                </div>
              )}
            </div>
            {(order.cod_amount ?? 0) > 0 && (
              <Alert className="mt-3 bg-white dark:bg-gray-900 border-amber-300 dark:border-amber-700">
                <AlertDescription className="text-xs text-amber-800 dark:text-amber-200">
                  {txt.pleaseHave} <strong>{order.cod_amount!.toLocaleString()} DA</strong> {txt.forDriver}
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* Shipment Details - Only show if there's data to display */}
        {(order.carrier || order.guepex_created_at) && (
          <div className="grid grid-cols-2 gap-4 pt-4 border-t">
            {order.carrier && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{txt.carrier}</p>
                <p className="font-semibold">{order.carrier}</p>
              </div>
            )}
            {order.guepex_created_at && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{txt.shippedOn}</p>
                <p className="font-semibold">
                  {safeDate(order.guepex_created_at, { dateStyle: 'short' })}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Track Online Button */}
        <Button
          variant="outline"
          className="w-full"
          onClick={() => window.open(`https://guepex.com/track/${trackingNumber}`, '_blank')}
        >
          <MapPin className={`h-4 w-4 ${language === 'ar' ? 'ml-2' : 'mr-2'}`} />
          {txt.trackOnline}
          <ExternalLink className={`h-4 w-4 ${language === 'ar' ? 'mr-2' : 'ml-2'}`} />
        </Button>
    </div>
  )
}
