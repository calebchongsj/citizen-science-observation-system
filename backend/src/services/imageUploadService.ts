import { storage } from "../lib/firebase-admin"

// Firebase Storage signed URLs have a maximum expiration of 7 days.
// Use a small buffer under the limit to avoid clock skew issues.
const SIX_DAYS_MS = 6 * 24 * 60 * 60 * 1000

type GenerateUploadUrlResult = {
  uploadUrl: string
  storagePath: string
  downloadUrl: string
}

function sanitizeFilename(filename: string): string {
  return filename.replace(/[\\/]/g, "_")
}

function getBucket() {
  const bucketName = process.env.FIREBASE_STORAGE_BUCKET
  if (!bucketName || bucketName.trim() === "") {
    throw new Error(
      "FIREBASE_STORAGE_BUCKET is not set. Add it to backend .env (e.g. your-project-id.appspot.com) to enable image uploads.",
    )
  }
  return storage.bucket(bucketName)
}

export async function generateUploadUrl(
  walkId: string,
  sightingId: string,
  filename: string,
  contentType: string,
): Promise<GenerateUploadUrlResult> {
  const safeFilename = sanitizeFilename(filename)
  const storagePath = `sightings/${walkId}/${sightingId}/${safeFilename}`
  const bucket = getBucket()
  const file = bucket.file(storagePath)

  const [uploadUrl] = await file.getSignedUrl({
    version: "v4",
    action: "write",
    expires: Date.now() + 15 * 60 * 1000,
    contentType,
  })

  const [downloadUrl] = await file.getSignedUrl({
    version: "v4",
    action: "read",
    expires: Date.now() + SIX_DAYS_MS,
  })

  return {
    uploadUrl,
    storagePath,
    downloadUrl,
  }
}
