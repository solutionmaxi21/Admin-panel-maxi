"use client"

import { useEffect, useState } from 'react'
import { useWishlist } from '@/lib/wishlist-context'
import { useAuth } from '@/lib/auth-context'
import { getApiBaseUrl } from '@/lib/api/base-url'

export default function WishlistDebugPage() {
  const { items, itemCount, isInWishlist } = useWishlist()
  const { user } = useAuth()
  const [logs, setLogs] = useState<string[]>([])
  const apiUrl = getApiBaseUrl()

  // Only accessible in development
  if (process.env.NODE_ENV !== 'development') {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <h1>404 - Page Not Found</h1>
      </div>
    )
  }

  useEffect(() => {
    // Capture ALL console logs (removed filter)
    const originalLog = console.log
    const originalWarn = console.warn
    const originalError = console.error

    console.log = (...args) => {
      const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')
      setLogs(prev => [...prev, `[LOG] ${msg}`])
      originalLog(...args)
    }

    console.warn = (...args) => {
      const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')
      setLogs(prev => [...prev, `[WARN] ${msg}`])
      originalWarn(...args)
    }

    console.error = (...args) => {
      const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')
      setLogs(prev => [...prev, `[ERROR] ${msg}`])
      originalError(...args)
    }

    return () => {
      console.log = originalLog
      console.warn = originalWarn
      console.error = originalError
    }
  }, [])

  const testFetch = async () => {
    setLogs(prev => [...prev, '[TEST] Starting manual fetch test...'])
    
    try {
      const response = await fetch(`${apiUrl}/favorites/product-ids`, {
        credentials: 'include'
      })
      
      setLogs(prev => [...prev, `[TEST] Response status: ${response.status}`])
      
      if (response.ok) {
        const data = await response.json()
        setLogs(prev => [...prev, `[TEST] Response data: ${JSON.stringify(data)}`])
      } else {
        const text = await response.text()
        setLogs(prev => [...prev, `[TEST] Error response: ${text}`])
      }
    } catch (error) {
      setLogs(prev => [...prev, `[TEST] Fetch error: ${error}`])
    }
  }

  const checkIndexedDB = async () => {
    setLogs(prev => [...prev, '[CHECK] Checking IndexedDB...'])
    try {
      const { openDB } = await import('idb')
      const db = await openDB('offline-store', 1)
      const wishlistData = await db.get('appMetadata', 'wishlist')
      setLogs(prev => [...prev, `[CHECK] IndexedDB wishlist: ${wishlistData ? 'EXISTS' : 'EMPTY'}`])
      if (wishlistData) {
        setLogs(prev => [...prev, `[CHECK] Raw data length: ${JSON.stringify(wishlistData).length} chars`])
      }
    } catch (error) {
      setLogs(prev => [...prev, `[CHECK] IndexedDB error: ${error}`])
    }
  }

  return (
    <div style={{ padding: '20px', fontFamily: 'monospace', fontSize: '12px' }}>
      <h1 style={{ fontSize: '24px', marginBottom: '20px' }}>Wishlist Debug Page</h1>
      
      <div style={{ marginBottom: '20px', padding: '10px', background: '#f0f0f0', borderRadius: '5px' }}>
        <h2 style={{ fontSize: '18px', marginBottom: '10px' }}>User Status</h2>
        <div>Logged in: {user ? 'Yes' : 'No'}</div>
        <div>User ID: {user?.id || 'N/A'}</div>
        <div>Email: {user?.email || 'N/A'}</div>
      </div>

      <div style={{ marginBottom: '20px', padding: '10px', background: '#f0f0f0', borderRadius: '5px' }}>
        <h2 style={{ fontSize: '18px', marginBottom: '10px' }}>Wishlist Status</h2>
        <div>Item Count: {itemCount}</div>
        <div>Items in Context: {JSON.stringify(items, null, 2)}</div>
      </div>

      <button 
        onClick={testFetch}
        style={{ 
          padding: '10px 20px', 
          background: '#007bff', 
          color: 'white', 
          border: 'none', 
          borderRadius: '5px',
          cursor: 'pointer',
          marginBottom: '10px',
          marginRight: '10px'
        }}
      >
        Test Manual Fetch
      </button>

      <button 
        onClick={checkIndexedDB}
        style={{ 
          padding: '10px 20px', 
          background: '#28a745', 
          color: 'white', 
          border: 'none', 
          borderRadius: '5px',
          cursor: 'pointer',
          marginBottom: '10px'
        }}
      >
        Check IndexedDB
      </button>

      <div style={{ padding: '10px', background: '#f0f0f0', borderRadius: '5px' }}>
        <h2 style={{ fontSize: '18px', marginBottom: '10px' }}>Console Logs</h2>
        <div style={{ maxHeight: '400px', overflow: 'auto' }}>
          {logs.map((log, i) => (
            <div key={i} style={{ 
              padding: '5px', 
              borderBottom: '1px solid #ddd',
              color: log.includes('[ERROR]') ? 'red' : log.includes('[WARN]') ? 'orange' : 'black'
            }}>
              {log}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
