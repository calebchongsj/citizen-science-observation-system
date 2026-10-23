import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { storage } from './firebase'
import { RafflesGoService } from '../api'
import {
  countPendingSightings,
  getPendingSightings,
  deletePendingSighting,
  updateSyncStatus,
  updatePendingSighting,
  getPendingEdits,
  deletePendingEdit,
  updateEditSyncStatus,
  type PendingSighting,
  type PendingEdit,
} from './offlineSightingDb'

const activeSyncs = new Map<string, Promise<{ synced: number; failed: number }>>()

function sanitizeFilename(filename: string): string {
  return filename.replace(/[\\/]/g, '_')
}

function buildStoragePath(walkId: string, sightingId: string, filename: string): string {
  const safeFilename = sanitizeFilename(filename)
  const uniquePrefix =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return `sightings/${walkId}/${sightingId}/${uniquePrefix}-${safeFilename}`
}

async function syncOneSighting(sighting: PendingSighting): Promise<void> {
  await updateSyncStatus(sighting.id, 'syncing')

  // Resume from a previous partial sync if serverSightingId already exists
  let sightingId = sighting.serverSightingId
  let uploadedCount = Math.min(sighting.uploadedImageCount ?? 0, sighting.imageBlobs.length)

  if (!sightingId) {
    const created = await RafflesGoService.createSighting(sighting.walkId, {
      adult_count: sighting.formData.adult_count,
      juvenile_count: sighting.formData.juvenile_count,
      infant_count: sighting.formData.infant_count,
      behavior: sighting.formData.behavior,
      notes: sighting.formData.notes,
      images_references: [],
      observation_timestamp: sighting.formData.observation_timestamp,
      latitude: sighting.formData.latitude,
      longitude: sighting.formData.longitude,
    })

    sightingId = (created as { sighting_id: string }).sighting_id
    await updatePendingSighting(sighting.id, { serverSightingId: sightingId, uploadedImageCount: 0 })
    sighting.serverSightingId = sightingId
    sighting.uploadedImageCount = 0
  }

  // Upload only images that haven't been uploaded yet
  const remainingImages = sighting.imageBlobs.slice(uploadedCount)
  for (const imageBlob of remainingImages) {
    const file = new File([imageBlob.data], imageBlob.name, { type: imageBlob.type })
    const storagePath = buildStoragePath(sighting.walkId, sightingId, imageBlob.name)
    const storageRef = ref(storage, storagePath)
    await uploadBytes(storageRef, file, {
      contentType: imageBlob.type || 'application/octet-stream',
    })
    const downloadUrl = await getDownloadURL(storageRef)
    await RafflesGoService.addSightingImageReference(sighting.walkId, sightingId, {
      imageUrl: downloadUrl,
    })
    uploadedCount++
    await updatePendingSighting(sighting.id, { uploadedImageCount: uploadedCount })
    sighting.uploadedImageCount = uploadedCount
  }

  await deletePendingSighting(sighting.id)
}

async function syncOneEdit(edit: PendingEdit): Promise<void> {
  await updateEditSyncStatus(edit.id, 'syncing')

  if (edit.type === 'delete') {
    await RafflesGoService.deleteSighting(edit.walkId, edit.sightingId)
    await deletePendingEdit(edit.id)
    return
  }

  // type === 'edit'
  if (edit.formData) {
    await RafflesGoService.updateSighting(edit.walkId, edit.sightingId, {
      adult_count: edit.formData.adult_count,
      juvenile_count: edit.formData.juvenile_count,
      infant_count: edit.formData.infant_count,
      behavior: edit.formData.behavior,
      notes: edit.formData.notes,
      images_references: edit.formData.images_references,
      observation_timestamp: edit.formData.observation_timestamp,
      latitude: edit.formData.latitude,
      longitude: edit.formData.longitude,
    })
  }

  // Delete removed images from Firebase Storage
  if (edit.removedImageUrls) {
    for (const url of edit.removedImageUrls) {
      try {
        const storageRef = ref(storage, url)
        await deleteObject(storageRef)
      } catch {
        // Image may already be deleted, continue
      }
    }
  }

  // Upload new images
  if (edit.newImageBlobs && edit.newImageBlobs.length > 0) {
    for (const imageBlob of edit.newImageBlobs) {
      const file = new File([imageBlob.data], imageBlob.name, { type: imageBlob.type })
      const storagePath = buildStoragePath(edit.walkId, edit.sightingId, imageBlob.name)
      const storageRef = ref(storage, storagePath)
      await uploadBytes(storageRef, file, {
        contentType: imageBlob.type || 'application/octet-stream',
      })
      const downloadUrl = await getDownloadURL(storageRef)
      await RafflesGoService.addSightingImageReference(edit.walkId, edit.sightingId, {
        imageUrl: downloadUrl,
      })
    }
  }

  await deletePendingEdit(edit.id)
}

export async function syncAllPendingSightings(walkId?: string): Promise<{
  synced: number
  failed: number
}> {
  const pending = await getPendingSightings(walkId)
  const pendingEdits = await getPendingEdits(walkId)
  let synced = 0
  let failed = 0

  // Sync new sightings first
  for (const sighting of pending) {
    if (sighting.syncStatus === 'syncing') continue
    try {
      await syncOneSighting(sighting)
      synced++
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Sync failed'
      await updateSyncStatus(sighting.id, 'failed', message)
      failed++
    }
  }

  // Then sync edits/deletes
  for (const edit of pendingEdits) {
    if (edit.syncStatus === 'syncing') continue
    try {
      await syncOneEdit(edit)
      synced++
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Sync failed'
      await updateEditSyncStatus(edit.id, 'failed', message)
      failed++
    }
  }

  return { synced, failed }
}

async function runSyncWithLock(walkId: string): Promise<{ synced: number; failed: number }> {
  const existing = activeSyncs.get(walkId)
  if (existing) {
    return existing
  }

  const syncPromise = (async () => {
    try {
      return await syncAllPendingSightings(walkId)
    } finally {
      activeSyncs.delete(walkId)
    }
  })()

  activeSyncs.set(walkId, syncPromise)
  return syncPromise
}

export function startAutoSync(
  walkId: string,
  callbacks: {
    onStart: () => void
    onComplete: (result: { synced: number; failed: number }) => void
  },
): () => void {
  const handleOnline = async () => {
    const pendingCount = await countPendingSightings(walkId)
    if (pendingCount === 0) {
      return
    }

    callbacks.onStart()
    try {
      const result = await runSyncWithLock(walkId)
      callbacks.onComplete(result)
    } catch (error) {
      callbacks.onComplete({ synced: 0, failed: pendingCount })
      throw error
    }
  }

  window.addEventListener('online', handleOnline)

  if (navigator.onLine) {
    handleOnline()
  }

  return () => {
    window.removeEventListener('online', handleOnline)
  }
}
