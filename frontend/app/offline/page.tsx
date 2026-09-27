'use client'

import Link from 'next/link'
import { WifiOff, Home, ShoppingCart, Heart } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function OfflinePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted p-4">
      <div className="max-w-md w-full text-center space-y-8">
        {/* Offline Icon */}
        <div className="flex justify-center">
          <div className="relative">
            <div className="absolute inset-0 bg-primary/20 rounded-full blur-3xl" />
            <div className="relative bg-background border-4 border-muted p-8 rounded-full">
              <WifiOff className="w-16 h-16 text-muted-foreground" />
            </div>
          </div>
        </div>

        {/* Message */}
        <div className="space-y-4">
          <h1 className="text-4xl font-bold">You're Offline</h1>
          <p className="text-muted-foreground text-lg">
            No internet connection detected. Some features may be limited.
          </p>
        </div>

        {/* What You Can Do */}
        <div className="bg-muted/50 rounded-lg p-6 space-y-3 text-left">
          <h2 className="font-semibold text-center mb-4">What you can do:</h2>
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <ShoppingCart className="w-5 h-5 text-primary" />
              <span className="text-sm">View your cart</span>
            </div>
            <div className="flex items-center gap-3">
              <Heart className="w-5 h-5 text-primary" />
              <span className="text-sm">Browse your wishlist</span>
            </div>
            <div className="flex items-center gap-3">
              <Home className="w-5 h-5 text-primary" />
              <span className="text-sm">View cached products</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-3">
          <Button asChild className="w-full" size="lg">
            <Link href="/">
              Return to Home
            </Link>
          </Button>
          <Button
            variant="outline"
            className="w-full"
            size="lg"
            onClick={() => window.location.reload()}
          >
            Try Again
          </Button>
        </div>

        {/* Info */}
        <p className="text-xs text-muted-foreground">
          Your cart and wishlist are saved offline. Orders will sync automatically when you're back online.
        </p>
      </div>
    </div>
  )
}
