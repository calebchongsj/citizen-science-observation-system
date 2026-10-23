import "dotenv/config";
import { initializeApp, cert, App } from 'firebase-admin/app';
import { getAuth, Auth } from 'firebase-admin/auth';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getStorage, Storage } from "firebase-admin/storage"
import fs from 'fs';
import path from 'path';

let app: App | null = null;
let _auth: Auth | null = null;
let _db: Firestore | null = null;
let _storage: Storage | null = null;

function initialize(): App {
  if (app) return app;

  // Check if using Firebase Emulator (for testing)
  const isEmulator = process.env.FIRESTORE_EMULATOR_HOST !== undefined;

  if (isEmulator) {
    // Use emulator with a dummy project ID - no credentials needed
    app = initializeApp({
      projectId: process.env.FIREBASE_PROJECT_ID || 'test-project',
    });
  } else {
    // Use production Firebase with service account credentials
    const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

    if (!credentialsPath) {
      throw new Error(
        `Firebase Admin not configured. Set GOOGLE_APPLICATION_CREDENTIALS in backend/.env\n\n` +
        `1. Download service account key from:\n` +
        `   https://console.firebase.google.com > Project Settings > Service accounts\n\n` +
        `2. Save as: backend/svc-account-key.json\n\n` +
        `3. Create backend/.env with:\n` +
        `   GOOGLE_APPLICATION_CREDENTIALS=./svc-account-key.json`
      );
    }

    const resolvedPath = path.resolve(process.cwd(), credentialsPath);
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(
        `Service account file not found: ${resolvedPath}\n\n` +
        `Download it from:\n` +
        `https://console.firebase.google.com > Project Settings > Service accounts\n\n` +
        `Save as: backend/svc-account-key.json`
      );
    }

    const serviceAccount = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
    app = initializeApp({
      credential: cert(serviceAccount),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    });
  }

  return app;
}

export const auth: Auth = new Proxy({} as Auth, {
  get(_, prop) {
    if (!_auth) {
      _auth = getAuth(initialize());
    }
    return Reflect.get(_auth, prop);
  }
});

export const db: Firestore = new Proxy({} as Firestore, {
  get(_, prop) {
    if (!_db) {
      _db = getFirestore(initialize());
    }
    return Reflect.get(_db, prop);
  }
});

export const storage: Storage = new Proxy({} as Storage, {
  get(_, prop) {
    if (!_storage) {
      _storage = getStorage(initialize())
    }
    return Reflect.get(_storage, prop)
  },
})
