"use client"

import { useEffect, useState, useCallback } from "react"
import { useAuth } from "@/lib/auth-context"
import { useLanguage } from "@/lib/language-context"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Bell, Package, Truck, CheckCircle, XCircle, Star, RotateCcw, ArrowLeft, CheckCheck, Filter } from "lucide-react"
import { getApiBaseUrl } from "@/lib/api/base-url"

const API_URL = getApiBaseUrl()

interface Notification {
    id: number
    user_id: number
    type: string
    title: string
    message: string
    action_url?: string
    related_entity_type?: string
    related_entity_id?: number
    is_read: boolean
    read_at?: string
    created_at: string
}

type FilterType = 'all' | 'unread' | 'read'

export default function NotificationsPage() {
    const { user, isLoading: authLoading } = useAuth()
    const { t, language } = useLanguage()
    const router = useRouter()

    const [notifications, setNotifications] = useState<Notification[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [filter, setFilter] = useState<FilterType>('all')
    const [hasMore, setHasMore] = useState(false)
    const [nextCursor, setNextCursor] = useState<number | null>(null)

    // Translations
    const translations = {
        fr: {
            title: 'Notifications',
            subtitle: 'Suivez l\'état de vos commandes et mises à jour',
            filters: { all: 'Toutes', unread: 'Non lues', read: 'Lues' },
            markAllRead: 'Tout marquer comme lu',
            empty: 'Aucune notification',
            emptyDesc: 'Vous n\'avez pas encore de notifications',
            loadMore: 'Charger plus',
            back: 'Retour',
            justNow: 'À l\'instant',
            minutesAgo: 'm',
            hoursAgo: 'h',
            daysAgo: 'j',
            loginRequired: 'Connexion requise',
            loginMessage: 'Connectez-vous pour voir vos notifications',
            loginButton: 'Se connecter'
        },
        ar: {
            title: 'الإشعارات',
            subtitle: 'تابع حالة طلباتك والتحديثات',
            filters: { all: 'الكل', unread: 'غير مقروءة', read: 'مقروءة' },
            markAllRead: 'تحديد الكل كمقروء',
            empty: 'لا توجد إشعارات',
            emptyDesc: 'ليس لديك إشعارات بعد',
            loadMore: 'تحميل المزيد',
            back: 'رجوع',
            justNow: 'الآن',
            minutesAgo: 'د',
            hoursAgo: 'س',
            daysAgo: 'ي',
            loginRequired: 'يجب تسجيل الدخول',
            loginMessage: 'سجل الدخول لعرض إشعاراتك',
            loginButton: 'تسجيل الدخول'
        }
    }

    const txt = translations[language] || translations.fr

    // Fetch notifications
    const fetchNotifications = useCallback(async (cursor?: number, signal?: AbortSignal) => {
        try {
            const url = cursor
                ? `${API_URL}/notifications?limit=20&filter=${filter}&cursor=${cursor}`
                : `${API_URL}/notifications?limit=20&filter=${filter}`

            const response = await fetch(url, { credentials: 'include', signal })

            if (!response.ok) {
                if (response.status === 401) {
                    setNotifications([])
                    setHasMore(false)
                    setNextCursor(null)
                    return
                }
                throw new Error('Failed to fetch notifications')
            }

            const result = await response.json()

            if (cursor) {
                setNotifications(prev => [...prev, ...(result.data || [])])
            } else {
                setNotifications(result.data || [])
            }

            setHasMore(result.pagination?.hasMore || false)
            setNextCursor(result.pagination?.nextCursor || null)
        } catch (err) {
            if (err instanceof DOMException && err.name === 'AbortError') return
            console.error('Failed to fetch notifications:', err)
        } finally {
            setIsLoading(false)
        }
    }, [filter])

    useEffect(() => {
        const controller = new AbortController()
        if (user) {
            setIsLoading(true)
            fetchNotifications(undefined, controller.signal)
        } else if (!authLoading) {
            setIsLoading(false)
        }
        return () => controller.abort()
    }, [user, authLoading, filter, fetchNotifications])

    // Mark as read
    const markAsRead = async (notificationId: number) => {
        try {
            await fetch(`${API_URL}/notifications/${notificationId}/read`, {
                method: 'PATCH',
                credentials: 'include',
            })

            setNotifications(prev =>
                prev.map(n => n.id === notificationId ? { ...n, is_read: true, read_at: new Date().toISOString() } : n)
            )
        } catch (err) {
            console.error('Failed to mark as read:', err)
        }
    }

    // Mark all as read
    const markAllAsRead = async () => {
        try {
            await fetch(`${API_URL}/notifications/mark-all-read`, {
                method: 'PATCH',
                credentials: 'include',
            })

            setNotifications(prev => prev.map(n => ({ ...n, is_read: true, read_at: new Date().toISOString() })))
        } catch (err) {
            console.error('Failed to mark all as read:', err)
        }
    }

    // Handle notification click
    const handleNotificationClick = (notification: Notification) => {
        if (!notification.is_read) {
            markAsRead(notification.id)
        }

        if (notification.action_url) {
            router.push(notification.action_url)
        }
    }

    // Format time
    const formatTime = (dateString: string): string => {
        const date = new Date(dateString)
        const now = new Date()
        const seconds = Math.floor((now.getTime() - date.getTime()) / 1000)

        if (seconds < 60) return txt.justNow
        const minutes = Math.floor(seconds / 60)
        if (minutes < 60) return `${minutes}${txt.minutesAgo}`
        const hours = Math.floor(minutes / 60)
        if (hours < 24) return `${hours}${txt.hoursAgo}`
        const days = Math.floor(hours / 24)
        if (days < 7) return `${days}${txt.daysAgo}`

        return date.toLocaleDateString(language === 'ar' ? 'ar-DZ' : 'fr-DZ')
    }

    // Get icon for notification type
    const getNotificationIcon = (type: string) => {
        const iconClass = "h-5 w-5"
        switch (type) {
            case 'ORDER_STATUS':
                return <Package className={`${iconClass} text-blue-600`} />
            case 'SHIPMENT_UPDATE':
                return <Truck className={`${iconClass} text-cyan-600`} />
            case 'RETURN_UPDATE':
                return <RotateCcw className={`${iconClass} text-amber-600`} />
            case 'REVIEW_SUBMITTED':
            case 'REVIEW_MODERATED':
                return <Star className={`${iconClass} text-purple-600`} />
            default:
                return <Bell className={`${iconClass} text-gray-600`} />
        }
    }

    // Get background for notification type
    const getNotificationBg = (type: string) => {
        switch (type) {
            case 'ORDER_STATUS': return 'bg-blue-100'
            case 'SHIPMENT_UPDATE': return 'bg-cyan-100'
            case 'RETURN_UPDATE': return 'bg-amber-100'
            case 'REVIEW_SUBMITTED':
            case 'REVIEW_MODERATED': return 'bg-purple-100'
            default: return 'bg-gray-100'
        }
    }

    const unreadCount = notifications.filter(n => !n.is_read).length

    // Loading state
    if (authLoading || isLoading) {
        return (
            <div className="min-h-screen flex flex-col">
                <Header />
                <main className="flex-1">
                    <div className="container mx-auto px-4 py-8">
                        <Skeleton className="h-10 w-48 mb-6" />
                        <div className="space-y-4">
                            {[1, 2, 3, 4, 5].map(i => (
                                <Skeleton key={i} className="h-24 w-full" />
                            ))}
                        </div>
                    </div>
                </main>
                <Footer />
            </div>
        )
    }

    // Not authenticated
    if (!user) {
        return (
            <div className="min-h-screen flex flex-col">
                <Header />
                <main className="flex-1">
                    <div className="container mx-auto px-4 py-8">
                        <Card>
                            <CardContent className="py-12">
                                <div className="text-center">
                                    <Bell className="mx-auto h-16 w-16 text-muted-foreground mb-4" />
                                    <h2 className="text-2xl font-bold mb-2">{txt.loginRequired}</h2>
                                    <p className="text-muted-foreground mb-6">{txt.loginMessage}</p>
                                    <Link href={`/${language}/login`}>
                                        <Button>{txt.loginButton}</Button>
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

    return (
        <div className="min-h-screen flex flex-col">
            <Header />
            <main className="flex-1">
                <div className="container mx-auto px-4 py-8">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <div className="flex items-center gap-3 mb-1">
                                <Button variant="ghost" size="icon" onClick={() => router.back()}>
                                    <ArrowLeft className={`h-4 w-4 ${language === 'ar' ? 'rotate-180' : ''}`} />
                                </Button>
                                <h1 className="text-3xl font-bold">{txt.title}</h1>
                                {unreadCount > 0 && (
                                    <Badge variant="destructive">{unreadCount}</Badge>
                                )}
                            </div>
                            <p className="text-muted-foreground ml-12">{txt.subtitle}</p>
                        </div>

                        {unreadCount > 0 && (
                            <Button variant="outline" onClick={markAllAsRead}>
                                <CheckCheck className={`h-4 w-4 ${language === 'ar' ? 'ml-2' : 'mr-2'}`} />
                                {txt.markAllRead}
                            </Button>
                        )}
                    </div>

                    {/* Filter Tabs */}
                    <div className="flex gap-2 mb-6">
                        {(['all', 'unread', 'read'] as FilterType[]).map(f => (
                            <Button
                                key={f}
                                variant={filter === f ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => setFilter(f)}
                            >
                                {txt.filters[f]}
                            </Button>
                        ))}
                    </div>

                    {/* Notifications List */}
                    {notifications.length === 0 ? (
                        <Card>
                            <CardContent className="py-12">
                                <div className="text-center">
                                    <Bell className="mx-auto h-16 w-16 text-muted-foreground mb-4" />
                                    <h2 className="text-xl font-semibold mb-2">{txt.empty}</h2>
                                    <p className="text-muted-foreground">{txt.emptyDesc}</p>
                                </div>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="space-y-3">
                            {notifications.map(notification => (
                                <Card
                                    key={notification.id}
                                    className={`cursor-pointer transition-all hover:shadow-md ${!notification.is_read ? 'border-l-4 border-l-blue-500 bg-blue-50/30' : ''
                                        }`}
                                    onClick={() => handleNotificationClick(notification)}
                                >
                                    <CardContent className="py-4">
                                        <div className="flex gap-4">
                                            <div className={`h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 ${getNotificationBg(notification.type)}`}>
                                                {getNotificationIcon(notification.type)}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-start justify-between gap-2">
                                                    <h3 className={`font-medium ${!notification.is_read ? 'font-semibold' : ''}`}>
                                                        {notification.title}
                                                    </h3>
                                                    <div className="flex items-center gap-2 flex-shrink-0">
                                                        <span className="text-xs text-muted-foreground">
                                                            {formatTime(notification.created_at)}
                                                        </span>
                                                        {!notification.is_read && (
                                                            <div className="h-2 w-2 rounded-full bg-blue-600" />
                                                        )}
                                                    </div>
                                                </div>
                                                <p className="text-sm text-muted-foreground mt-1">
                                                    {notification.message}
                                                </p>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}

                            {/* Load More */}
                            {hasMore && (
                                <div className="text-center pt-4">
                                    <Button
                                        variant="outline"
                                        onClick={() => nextCursor && fetchNotifications(nextCursor)}
                                    >
                                        {txt.loadMore}
                                    </Button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </main>
            <Footer />
        </div>
    )
}
