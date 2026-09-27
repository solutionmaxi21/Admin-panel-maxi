'use client';

import { useEffect, useState, useCallback, useRef, ReactNode } from 'react';
import {
  Bell,
  Package,
  Truck,
  Undo2,
  Star,
  Tag,
  Info,
  AlertCircle,
  CheckCircle2,
  X
} from 'lucide-react';
import * as Popover from '@radix-ui/react-popover';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAuth } from '@/lib/auth-context';
import { useLanguage } from '@/lib/language-context';
import { getApiBaseUrl } from '@/lib/api/base-url';

const API_URL = getApiBaseUrl();

interface Notification {
  id: number;
  user_id: number;
  type: string;
  title: string;
  message: string;
  action_url?: string;
  related_entity_type?: string;
  related_entity_id?: number;
  is_read: boolean;
  read_at?: string;
  created_at: string;
  updated_at: string;
}

/**
 * NotificationCenter - Professional notification system for customers
 * Features:
 * - Real-time unread count badge
 * - Popover notification panel with scroll
 * - Smart polling (30s interval, pauses on visibility change)
 * - Mark as read functionality
 * - Navigation to related entities
 */
const localT = {
  fr: {
    notifications: 'Notifications',
    new: (count: number) => `${count} nouveau`,
    markAllRead: 'Tout marquer comme lu',
    failedToLoad: 'Échec du chargement',
    retry: 'Réessayer',
    noNotifications: 'Aucune notification',
    allCaughtUp: 'Vous êtes à jour ! Les notifications apparaîtront ici.',
    viewAllHistory: "Voir tout l'historique",
    justNow: "À l'instant",
    mAgo: 'min',
    hAgo: 'h',
    dAgo: 'j',
    locale: 'fr-DZ',
  },
  ar: {
    notifications: 'الإشعارات',
    new: (count: number) => `${count} جديد`,
    markAllRead: 'تحديد الكل كمقروء',
    failedToLoad: 'فشل التحميل',
    retry: 'إعادة المحاولة',
    noNotifications: 'لا توجد إشعارات',
    allCaughtUp: 'أنت على اطلاع! ستظهر الإشعارات هنا.',
    viewAllHistory: 'عرض كل السجل',
    justNow: 'الآن',
    mAgo: 'د',
    hAgo: 'س',
    dAgo: 'ي',
    locale: 'ar-DZ',
  },
};

export default function NotificationCenter() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const txt = localT[language === 'ar' ? 'ar' : 'fr'];
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const router = useRouter();

  // Fetch unread count
  const fetchUnreadCount = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/notifications/unread-count`, {
        credentials: 'include',
        cache: 'no-store', // Always get fresh notification count
      });

      if (!response.ok) {
        if (response.status === 401) {
          console.log('[Notifications] User not authenticated, skipping');
          return;
        }
        const errorData = await response.json().catch(() => ({}));
        console.warn(`Failed to fetch unread count: ${response.status} - ${errorData.error || response.statusText}`);
        return;
      }

      const data = await response.json();
      setUnreadCount(data.unreadCount || 0);
    } catch (err) {
      console.error('Failed to fetch unread count:', err);
    }
  }, []);

  // Fetch paginated notifications
  const fetchNotifications = useCallback(async () => {
    if (!isOpen) return;

    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/notifications?limit=20&filter=all`, {
        credentials: 'include',
        cache: 'no-store', // Always get fresh notifications
      });

      if (!response.ok) {
        if (response.status === 401) {
          console.log('[Notifications] User not authenticated');
          setNotifications([]);
          return;
        }
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`API Error: ${response.status} - ${errorData.error || response.statusText}`);
      }

      const result = await response.json();
      setNotifications(result.data || []);
      setError(null);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to load notifications';
      console.error('Failed to fetch notifications:', errorMsg);
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  }, [isOpen]);

  // Mark notification as read
  const markAsRead = useCallback(async (notificationId: number) => {
    try {
      const response = await fetch(`${API_URL}/notifications/${notificationId}/read`, {
        method: 'PATCH',
        credentials: 'include',
        cache: 'no-store',
      });

      if (response.ok) {
        // Update local state
        setNotifications((prev: Notification[]) =>
          prev.map((notif: Notification) =>
            notif.id === notificationId
              ? { ...notif, is_read: true, read_at: new Date().toISOString() }
              : notif
          )
        );

        // Refresh unread count
        await fetchUnreadCount();
      }
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  }, [fetchUnreadCount]);

  // Mark all as read
  const markAllAsRead = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/notifications/mark-all-read`, {
        method: 'PATCH',
        credentials: 'include',
        cache: 'no-store',
      });

      if (response.ok) {
        setNotifications((prev: Notification[]) =>
          prev.map((notif: Notification) => ({
            ...notif,
            is_read: true,
            read_at: new Date().toISOString(),
          }))
        );

        setUnreadCount(0);
      }
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    }
  }, []);

  // Handle notification click - navigate and mark as read
  const handleNotificationClick = useCallback(
    (notification: Notification) => {
      // Mark as read first
      if (!notification.is_read) {
        markAsRead(notification.id);
      }

      // Navigate if actionUrl exists
      if (notification.action_url) {
        setIsOpen(false);
        router.push(notification.action_url);
      }
    },
    [markAsRead, router]
  );

  // Setup polling for unread count - runs every 60s, stops when page is hidden
  useEffect(() => {
    // Only poll if user is authenticated
    if (!user) return;

    // Initial fetch
    fetchUnreadCount();

    // Setup polling
    const startPolling = () => {
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);

      pollingIntervalRef.current = setInterval(() => {
        // Double check auth inside interval (though effect cleanup should handle it)
        fetchUnreadCount();
      }, 60000); // 60 seconds
    };

    // Handle visibility change
    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
        }
      } else {
        // Resume polling
        startPolling();
        // Also fetch immediately on visible to get fresh data
        fetchUnreadCount();
      }
    };

    startPolling();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [fetchUnreadCount, user]);

  // Fetch notifications when popover opens
  useEffect(() => {
    if (isOpen) {
      fetchNotifications();
    }
  }, [isOpen, fetchNotifications]);

  return (
    <Popover.Root open={isOpen} onOpenChange={setIsOpen}>
      <Popover.Trigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-10 w-10 hover:bg-gray-100 transition-colors"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5 text-gray-600" />
          {unreadCount > 0 && (
            <span className="absolute right-1.5 top-1.5 h-4 w-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center ring-2 ring-white">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </Popover.Trigger>

      <Popover.Content className="w-[calc(100vw-2rem)] sm:w-[400px] p-0 shadow-xl border border-gray-100 rounded-xl overflow-hidden mr-4 sm:mr-0" side="bottom" align="end" sideOffset={8}>
        <div className="bg-white flex flex-col h-[500px]">
          {/* Header */}
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-white shrink-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-base text-gray-900">{txt.notifications}</h3>
              {unreadCount > 0 && (
                <span className="bg-blue-50 text-blue-700 text-xs font-medium px-2 py-0.5 rounded-full">
                  {txt.new(unreadCount)}
                </span>
              )}
            </div>
            {notifications.length > 0 && !notifications.every(n => n.is_read) && (
              <button
                onClick={markAllAsRead}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium hover:underline decoration-blue-600/30 underline-offset-2 transition-all"
              >
                {txt.markAllRead}
              </button>
            )}
          </div>

          {/* List */}
          <div className="flex-1 overflow-hidden relative">
            {loading ? (
              <div className="absolute inset-0 flex items-center justify-center bg-white/50 z-10">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-200 border-t-blue-600" />
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-gray-50/50">
                <AlertCircle className="h-10 w-10 text-red-400 mb-3" />
                <p className="text-sm font-medium text-gray-900 mb-1">{txt.failedToLoad}</p>
                <p className="text-xs text-gray-500">{error}</p>
                <Button variant="outline" size="sm" onClick={() => fetchNotifications()} className="mt-4">
                  {txt.retry}
                </Button>
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                <div className="bg-gray-50 p-4 rounded-full mb-4">
                  <Bell className="h-8 w-8 text-gray-300" />
                </div>
                <h4 className="text-sm font-medium text-gray-900 mb-1">{txt.noNotifications}</h4>
                <p className="text-xs text-gray-500 max-w-[200px]">
                  {txt.allCaughtUp}
                </p>
              </div>
            ) : (
              <ScrollArea className="h-full">
                <div className="divide-y divide-gray-50">
                  {notifications.map((notification) => (
                    <button
                      key={notification.id}
                      onClick={() => handleNotificationClick(notification)}
                      className={cn(
                        "w-full text-left px-5 py-4 hover:bg-gray-50/80 transition-all duration-200 group relative",
                        !notification.is_read ? "bg-blue-50/30" : "bg-white"
                      )}
                    >
                      {!notification.is_read && (
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500" />
                      )}

                      <div className="flex gap-4">
                        {/* Icon */}
                        <div className={cn(
                          "h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm border border-white",
                          getNotificationTypeStyles(notification.type).bg
                        )}>
                          {getNotificationTypeIcon(notification.type)}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-start justify-between gap-3">
                            <p className={cn(
                              "text-sm leading-snug truncate pr-2",
                              !notification.is_read ? "font-semibold text-gray-900" : "font-medium text-gray-700"
                            )}>
                              {notification.title}
                            </p>
                            <span className="text-[10px] text-gray-400 whitespace-nowrap shrink-0 mt-0.5">
                              {formatTime(new Date(notification.created_at), txt)}
                            </span>
                          </div>

                          <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">
                            {notification.message}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="border-t border-gray-100 p-3 bg-gray-50/50 shrink-0">
              <Button
                variant="ghost"
                className="w-full text-xs h-9 font-medium text-gray-600 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                onClick={() => {
                  setIsOpen(false);
                  router.push('/notifications');
                }}
              >
                {txt.viewAllHistory}
              </Button>
            </div>
          )}
        </div>
      </Popover.Content>
    </Popover.Root>
  );
}

/**
 * Format time relative to now
 */
function formatTime(date: Date, t: typeof localT['fr']): string {
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return t.justNow;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}${t.mAgo}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}${t.hAgo}`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}${t.dAgo}`;

  return date.toLocaleDateString(t.locale, { month: 'short', day: 'numeric' });
}

/**
 * Get styling for notification type
 */
function getNotificationTypeStyles(type: string): { bg: string } {
  const normalizedType = type?.toLowerCase().replace(/_/g, '') || 'system';

  const typeStyles: { [key: string]: { bg: string } } = {
    order: { bg: 'bg-blue-100 text-blue-600' },
    orderstatus: { bg: 'bg-blue-100 text-blue-600' },
    neworder: { bg: 'bg-green-100 text-green-600' },
    shipment: { bg: 'bg-sky-100 text-sky-600' },
    delivery: { bg: 'bg-emerald-100 text-emerald-600' },
    return: { bg: 'bg-amber-100 text-amber-600' },
    returnupdate: { bg: 'bg-amber-100 text-amber-600' },
    review: { bg: 'bg-violet-100 text-violet-600' },
    promo: { bg: 'bg-rose-100 text-rose-600' },
    system: { bg: 'bg-slate-100 text-slate-600' },
    warning: { bg: 'bg-red-100 text-red-600' },
  };

  return typeStyles[normalizedType] || typeStyles.system;
}

/**
 * Get icon for notification type
 */
function getNotificationTypeIcon(type: string): ReactNode {
  const normalizedType = type?.toLowerCase().replace(/_/g, '') || 'system';
  const iconProps = { className: "h-5 w-5" };

  const typeIcons: { [key: string]: ReactNode } = {
    order: <Package {...iconProps} />,
    orderstatus: <Package {...iconProps} />,
    neworder: <Package {...iconProps} />,
    shipment: <Truck {...iconProps} />,
    delivery: <CheckCircle2 {...iconProps} />,
    return: <Undo2 {...iconProps} />,
    returnupdate: <Undo2 {...iconProps} />,
    review: <Star {...iconProps} />,
    promo: <Tag {...iconProps} />,
    system: <Info {...iconProps} />,
    warning: <AlertCircle {...iconProps} />,
  };

  return typeIcons[normalizedType] || typeIcons.system;
}
