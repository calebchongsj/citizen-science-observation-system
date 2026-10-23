import { openDB, type IDBPDatabase } from 'idb'

export interface PendingSightingFormData {
  adult_count: number
  juvenile_count: number
  infant_count: number
  behavior: string
  notes: string
  latitude: number
  longitude: number
  observation_timestamp: string
}

export interface StoredImageBlob {
  name: string
  type: string
  data: ArrayBuffer
}

export interface PendingSighting {
  id: string
  walkId: string
  formData: PendingSightingFormData
  imageBlobs: StoredImageBlob[]
  createdAt: string
  syncStatus: 'pending' | 'syncing' | 'failed'
  syncError?: string
  serverSightingId?: string
  uploadedImageCount?: number
}

export interface PendingEdit {
  id: string
  walkId: string
  sightingId: string
  type: 'edit' | 'delete'
  formData?: PendingSightingFormData & { images_references?: string[] }
  newImageBlobs?: StoredImageBlob[]
  removedImageUrls?: string[]
  createdAt: string
  syncStatus: 'pending' | 'syncing' | 'failed'
  syncError?: string
}

const DB_NAME = 'rafflesgo-offline'
const DB_VERSION = 3
const STORE_NAME = 'pendingSightings'
const EDITS_STORE = 'pendingEdits'

function openDb(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex('walkId', 'walkId', { unique: false })
        store.createIndex('syncStatus', 'syncStatus', { unique: false })
      }
      if (!db.objectStoreNames.contains(EDITS_STORE)) {
        const store = db.createObjectStore(EDITS_STORE, { keyPath: 'id' })
        store.createIndex('walkId', 'walkId', { unique: false })
        store.createIndex('sightingId', 'sightingId', { unique: false })
      }
    },
  })
}

export async function savePendingSighting(
  walkId: string,
  formData: PendingSightingFormData,
  files: File[],
): Promise<PendingSighting> {
  const imageBlobs: StoredImageBlob[] = await Promise.all(
    files.map(async (file) => ({
      name: file.name,
      type: file.type,
      data: await file.arrayBuffer(),
    })),
  )

  const sighting: PendingSighting = {
    id: crypto.randomUUID(),
    walkId,
    formData,
    imageBlobs,
    serverSightingId: undefined,
    uploadedImageCount: 0,
    createdAt: new Date().toISOString(),
    syncStatus: 'pending',
  }

  const db = await openDb()
  await db.put(STORE_NAME, sighting)
  return sighting
}

export async function getPendingSightings(
  walkId?: string,
): Promise<PendingSighting[]> {
  const db = await openDb()
  if (walkId) {
    return db.getAllFromIndex(STORE_NAME, 'walkId', walkId)
  }
  return db.getAll(STORE_NAME)
}

export async function deletePendingSighting(id: string): Promise<void> {
  const db = await openDb()
  await db.delete(STORE_NAME, id)
}

export async function updatePendingSighting(
  id: string,
  updates: Partial<Pick<PendingSighting, 'serverSightingId' | 'uploadedImageCount' | 'syncStatus' | 'syncError'>>,
): Promise<void> {
  const db = await openDb()
  const sighting = await db.get(STORE_NAME, id)
  if (!sighting) return
  Object.assign(sighting, updates)
  await db.put(STORE_NAME, sighting)
}

export async function updateSyncStatus(
  id: string,
  syncStatus: PendingSighting['syncStatus'],
  syncError?: string,
): Promise<void> {
  const db = await openDb()
  const sighting = await db.get(STORE_NAME, id)
  if (!sighting) return
  sighting.syncStatus = syncStatus
  sighting.syncError = syncError
  await db.put(STORE_NAME, sighting)
}

export async function countPendingSightings(
  walkId?: string,
): Promise<number> {
  const sightings = await getPendingSightings(walkId)
  const edits = await getPendingEdits(walkId)
  return sightings.length + edits.length
}

// --- Pending edits/deletes for server-side sightings ---

export async function savePendingEdit(
  walkId: string,
  sightingId: string,
  formData: PendingEdit['formData'],
  newFiles: File[],
  removedImageUrls: string[],
): Promise<PendingEdit> {
  const newImageBlobs: StoredImageBlob[] = await Promise.all(
    newFiles.map(async (file) => ({
      name: file.name,
      type: file.type,
      data: await file.arrayBuffer(),
    })),
  )

  const db = await openDb()

  // Remove any previous pending edit for the same sighting
  const existing = await db.getAllFromIndex(EDITS_STORE, 'sightingId', sightingId)
  for (const e of existing) {
    await db.delete(EDITS_STORE, e.id)
  }

  const edit: PendingEdit = {
    id: crypto.randomUUID(),
    walkId,
    sightingId,
    type: 'edit',
    formData,
    newImageBlobs,
    removedImageUrls,
    createdAt: new Date().toISOString(),
    syncStatus: 'pending',
  }

  await db.put(EDITS_STORE, edit)
  return edit
}

export async function savePendingDelete(
  walkId: string,
  sightingId: string,
): Promise<PendingEdit> {
  const db = await openDb()

  // Remove any previous pending edit for the same sighting
  const existing = await db.getAllFromIndex(EDITS_STORE, 'sightingId', sightingId)
  for (const e of existing) {
    await db.delete(EDITS_STORE, e.id)
  }

  const edit: PendingEdit = {
    id: crypto.randomUUID(),
    walkId,
    sightingId,
    type: 'delete',
    createdAt: new Date().toISOString(),
    syncStatus: 'pending',
  }

  await db.put(EDITS_STORE, edit)
  return edit
}

export async function getPendingEdits(
  walkId?: string,
): Promise<PendingEdit[]> {
  const db = await openDb()
  if (walkId) {
    return db.getAllFromIndex(EDITS_STORE, 'walkId', walkId)
  }
  return db.getAll(EDITS_STORE)
}

export async function deletePendingEdit(id: string): Promise<void> {
  const db = await openDb()
  await db.delete(EDITS_STORE, id)
}

export async function updateEditSyncStatus(
  id: string,
  syncStatus: PendingEdit['syncStatus'],
  syncError?: string,
): Promise<void> {
  const db = await openDb()
  const edit = await db.get(EDITS_STORE, id)
  if (!edit) return
  edit.syncStatus = syncStatus
  edit.syncError = syncError
  await db.put(EDITS_STORE, edit)
}
