import { useState, useEffect, useCallback, useRef } from 'react'

const PING_INTERVAL_MS = 5000
const PING_TIMEOUT_MS = 4000
const MIN_OFFLINE_DISPLAY_MS = 5000

/**
 * Hook to track online/offline status.
 * Uses both browser events (immediate) and periodic connectivity checks (reliable).
 * Once offline is detected, stays offline for at least MIN_OFFLINE_DISPLAY_MS
 * to prevent the banner from flickering.
 */
export function useOfflineStatus() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine)
  const offlineSinceRef = useRef<number | null>(null)
  const delayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const goOnline = useCallback(() => {
    const since = offlineSinceRef.current
    if (since !== null) {
      const elapsed = Date.now() - since
      if (elapsed < MIN_OFFLINE_DISPLAY_MS) {
        if (delayTimerRef.current) clearTimeout(delayTimerRef.current)
        delayTimerRef.current = setTimeout(() => {
          offlineSinceRef.current = null
          setIsOffline(false)
        }, MIN_OFFLINE_DISPLAY_MS - elapsed)
        return
      }
    }
    offlineSinceRef.current = null
    setIsOffline(false)
  }, [])

  const goOffline = useCallback(() => {
    if (delayTimerRef.current) clearTimeout(delayTimerRef.current)
    offlineSinceRef.current = Date.now()
    setIsOffline(true)
  }, [])

  const checkConnectivity = useCallback(async () => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), PING_TIMEOUT_MS)
    try {
      await fetch('/api/users/me', {
        method: 'HEAD',
        signal: controller.signal,
        cache: 'no-store',
      })
      goOnline()
    } catch {
      goOffline()
    } finally {
      clearTimeout(timeout)
    }
  }, [goOnline, goOffline])

  useEffect(() => {
    const handleOnline = () => checkConnectivity()
    const handleOffline = () => goOffline()

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    const interval = setInterval(checkConnectivity, PING_INTERVAL_MS)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      clearInterval(interval)
      if (delayTimerRef.current) clearTimeout(delayTimerRef.current)
    }
  }, [checkConnectivity, goOffline])

  return isOffline
}
