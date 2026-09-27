'use client'

import { useEffect, useState } from 'react'
import { Wifi, WifiOff, Cloud, CloudOff, Loader2 } from 'lucide-react'
import { onSyncStatus, getSyncStatus, getPendingCount, type SyncStatus } from '@/lib/sync/sync-manager'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useLanguage } from '@/lib/language-context'

const translations = {
  offline: { fr: "Hors ligne", ar: "غير متصل" },
  synced: { fr: "Synchronisé", ar: "تمت المزامنة" },
  tooltipOffline: {
    fr: "Vous êtes hors ligne. Les modifications seront synchronisées à la reconnexion.",
    ar: "أنت غير متصل. سيتم مزامنة التغييرات عند إعادة الاتصال.",
  },
  tooltipSynced: {
    fr: "Toutes les modifications sont synchronisées",
    ar: "تمت مزامنة جميع التغييرات",
  },
  syncing: (processed: number, total: number) => ({
    fr: `Synchronisation ${processed}/${total}...`,
    ar: `مزامنة ${processed}/${total}...`,
  }),
  syncFailed: (n: number) => ({
    fr: `Échec sync (${n})`,
    ar: `فشل المزامنة (${n})`,
  }),
  pending: (n: number) => ({
    fr: `${n} en attente`,
    ar: `${n} معلق`,
  }),
  tooltipSyncing: (processed: number, total: number) => ({
    fr: `Synchronisation de ${processed} sur ${total}...`,
    ar: `مزامنة ${processed} من ${total}...`,
  }),
  tooltipSyncFailed: (message: string) => ({
    fr: `Échec de synchronisation: ${message}. Nouvelle tentative automatique.`,
    ar: `فشل المزامنة: ${message}. ستتم إعادة المحاولة تلقائياً.`,
  }),
  tooltipPending: (n: number) => ({
    fr: `${n} opérations en attente de synchronisation`,
    ar: `${n} عمليات بانتظار المزامنة`,
  }),
}

export function SyncStatusIndicator() {
  const { language } = useLanguage()
  const [status, setStatus] = useState<SyncStatus>({
    status: 'idle',
    processed: 0,
    total: 0,
    failed: 0
  })
  const [pendingCount, setPendingCount] = useState(0)
  const [isOnline, setIsOnline] = useState(true)

  useEffect(() => {
    // Check initial online status
    setIsOnline(navigator.onLine)

    // Listen for sync status updates
    const unsubscribe = onSyncStatus((newStatus) => {
      setStatus(newStatus)
    })

    // Listen for online/offline events
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Update pending count periodically
    const updatePendingCount = async () => {
      const count = await getPendingCount()
      setPendingCount(count)
    }

    updatePendingCount()
    const interval = setInterval(updatePendingCount, 15000) // Every 15 seconds

    return () => {
      unsubscribe()
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      clearInterval(interval)
    }
  }, [])

  // Don't show if online with no pending operations
  if (isOnline && pendingCount === 0 && status.status === 'idle') {
    return null
  }

  const getIcon = () => {
    if (!isOnline) {
      return <WifiOff className="w-4 h-4" />
    }
    if (status.status === 'syncing') {
      return <Loader2 className="w-4 h-4 animate-spin" />
    }
    if (pendingCount > 0) {
      return <CloudOff className="w-4 h-4" />
    }
    return <Cloud className="w-4 h-4" />
  }

  const getVariant = () => {
    if (!isOnline) return 'destructive'
    if (status.status === 'syncing') return 'default'
    if (status.status === 'error') return 'destructive'
    if (pendingCount > 0) return 'secondary'
    return 'outline'
  }

  const getMessage = () => {
    if (!isOnline) return language === 'fr' ? translations.offline.fr : language === 'ar' ? translations.offline.ar : 'Offline'
    if (status.status === 'syncing') {
      const t = translations.syncing(status.processed, status.total)
      return language === 'fr' ? t.fr : language === 'ar' ? t.ar : `Syncing ${status.processed}/${status.total}...`
    }
    if (status.status === 'error') {
      const t = translations.syncFailed(status.failed)
      return language === 'fr' ? t.fr : language === 'ar' ? t.ar : `Sync failed (${status.failed})`
    }
    if (pendingCount > 0) {
      const t = translations.pending(pendingCount)
      return language === 'fr' ? t.fr : language === 'ar' ? t.ar : `${pendingCount} pending`
    }
    return language === 'fr' ? translations.synced.fr : language === 'ar' ? translations.synced.ar : 'Synced'
  }

  const getTooltip = () => {
    if (!isOnline) {
      return language === 'fr' ? translations.tooltipOffline.fr : language === 'ar' ? translations.tooltipOffline.ar : 'You are offline. Changes will sync when you reconnect.'
    }
    if (status.status === 'syncing') {
      const t = translations.tooltipSyncing(status.processed, status.total)
      return language === 'fr' ? t.fr : language === 'ar' ? t.ar : `Syncing ${status.processed} of ${status.total} operations...`
    }
    if (status.status === 'error') {
      const msg = status.message || (language === 'fr' ? 'Erreur inconnue' : language === 'ar' ? 'خطأ غير معروف' : 'Unknown error')
      const t = translations.tooltipSyncFailed(msg)
      return language === 'fr' ? t.fr : language === 'ar' ? t.ar : `Sync failed: ${status.message || 'Unknown error'}. Will retry automatically.`
    }
    if (pendingCount > 0) {
      const t = translations.tooltipPending(pendingCount)
      return language === 'fr' ? t.fr : language === 'ar' ? t.ar : `${pendingCount} operations waiting to sync`
    }
    return language === 'fr' ? translations.tooltipSynced.fr : language === 'ar' ? translations.tooltipSynced.ar : 'All changes synced'
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant={getVariant()}
            className="gap-1.5 cursor-help fixed bottom-4 right-4 z-50 shadow-lg"
          >
            {getIcon()}
            <span className="text-xs font-medium">{getMessage()}</span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="left" className="max-w-xs">
          <p className="text-sm">{getTooltip()}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
