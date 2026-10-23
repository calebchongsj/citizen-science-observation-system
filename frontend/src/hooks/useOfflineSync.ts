import { useEffect, useState, useCallback, useRef } from 'react'
import { useOfflineStatus } from './useOfflineStatus'
import { countPendingSightings } from '../lib/offlineSightingDb'
import { startAutoSync } from '../lib/offlineSyncService'

export function useOfflineSync(walkId: string, onSyncComplete?: () => void) {
  const isOffline = useOfflineStatus()
  const [pendingCount, setPendingCount] = useState(0)
  const [isSyncing, setIsSyncing] = useState(false)
  const [lastSyncError, setLastSyncError] = useState<string | null>(null)
  const [syncResult, setSyncResult] = useState<{ synced: number; failed: number } | null>(null)
  const onSyncCompleteRef = useRef(onSyncComplete)

  useEffect(() => {
    onSyncCompleteRef.current = onSyncComplete
  }, [onSyncComplete])

  const refreshPendingCount = useCallback(async () => {
    if (!walkId) return
    const count = await countPendingSightings(walkId)
    setPendingCount(count)
  }, [walkId])

  // Refresh pending count on mount
  useEffect(() => {
    let active = true
    countPendingSightings(walkId).then((count) => {
      if (active) setPendingCount(count)
    })
    return () => { active = false }
  }, [walkId])

  // Refresh pending count when connectivity changes
  useEffect(() => {
    refreshPendingCount()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOffline])

  useEffect(() => {
    if (!walkId) return

    const cleanup = startAutoSync(walkId, {
      onStart: () => {
        setIsSyncing(true)
      },
      onComplete: async (result) => {
        setIsSyncing(false)
        setSyncResult(result)
        if (result.failed > 0) {
          setLastSyncError(`${result.failed} sighting(s) failed to sync.`)
        } else {
          setLastSyncError(null)
        }
        await refreshPendingCount()
        if (result.synced > 0 && onSyncCompleteRef.current) {
          onSyncCompleteRef.current()
        }
      },
    })

    return cleanup
  }, [walkId, refreshPendingCount])

  return {
    isOffline,
    pendingCount,
    isSyncing,
    lastSyncError,
    syncResult,
    refreshPendingCount,
  }
}
