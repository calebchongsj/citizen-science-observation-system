import { useOfflineStatus } from '../hooks/useOfflineStatus'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface OfflineBannerProps {
  pendingCount?: number
  isSyncing?: boolean
  hidden?: boolean
  syncResult?: { synced: number; failed: number } | null
}

export function OfflineBanner({ pendingCount = 0, isSyncing = false, hidden = false, syncResult = null }: OfflineBannerProps) {
  const isOffline = useOfflineStatus()
  const [showSyncedMessage, setShowSyncedMessage] = useState(false)
  const [navOffset, setNavOffset] = useState(84)
  const wasSyncingRef = useRef(false)

  // Detect syncing -> done transition
  useEffect(() => {
    if (isSyncing) {
      wasSyncingRef.current = true
      return
    }
    if (!wasSyncingRef.current) return
    wasSyncingRef.current = false

    // Show "synced" message for 5 seconds after sync completes
    const showTimer = setTimeout(() => setShowSyncedMessage(true), 0)
    const hideTimer = setTimeout(() => setShowSyncedMessage(false), 5000)
    return () => {
      clearTimeout(showTimer)
      clearTimeout(hideTimer)
    }
  }, [isSyncing])

  useEffect(() => {
    if (typeof document === 'undefined') return undefined

    const updateNavOffset = () => {
      const nav = document.querySelector('.main-nav')
      const navHeight = nav instanceof HTMLElement ? nav.getBoundingClientRect().height : 0
      setNavOffset(Math.max(72, Math.round(navHeight) + 12))
    }

    updateNavOffset()

    const nav = document.querySelector('.main-nav')
    const resizeObserver =
      nav instanceof HTMLElement && typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(updateNavOffset)
        : null

    if (nav instanceof HTMLElement && resizeObserver) {
      resizeObserver.observe(nav)
    }

    window.addEventListener('resize', updateNavOffset)
    return () => {
      window.removeEventListener('resize', updateNavOffset)
      resizeObserver?.disconnect()
    }
  }, [])

  // Build the list of messages to display
  const messages: Array<{ key: string; text: string; variant: 'success' | 'error' }> = []

  if (isOffline) {
    messages.push({
      key: 'offline',
      text: 'You are offline. Sightings will be saved to your device.',
      variant: 'error',
    })
    if (pendingCount > 0) {
      messages.push({
        key: 'pending',
        text: `${pendingCount} sighting(s) saved offline, waiting to sync.`,
        variant: 'error',
      })
    }
  } else if (isSyncing) {
    messages.push({
      key: 'syncing',
      text: 'Back online. Syncing offline sightings...',
      variant: 'success',
    })
  } else if (showSyncedMessage && syncResult && syncResult.synced > 0) {
    messages.push({
      key: 'synced',
      text: 'All offline sightings have been synced.',
      variant: 'success',
    })
  }

  if (messages.length === 0 || hidden) return null

  return createPortal(
    <div
      className="toast-viewport"
      style={{
        top: `max(env(safe-area-inset-top, 0px), ${navOffset}px)`,
      }}
    >
      {messages.map((msg) => (
        <div
          key={msg.key}
          className={`toast toast--${msg.variant}`}
          role={msg.variant === 'error' ? 'alert' : 'status'}
          style={{ pointerEvents: 'auto' }}
        >
          <p className="toast__message">{msg.text}</p>
        </div>
      ))}
    </div>,
    document.body,
  )
}
