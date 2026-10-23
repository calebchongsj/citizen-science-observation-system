import * as admin from 'firebase-admin';
import { FIRESTORE_COLLECTIONS } from '../lib/firestore-collections';

/**
 * Initialize Firebase Admin SDK connected to Firestore Emulator
 * Call this in test setup before running integration tests
 */
export function initializeFirebaseEmulator() {
  // Only initialize once
  if (admin.apps.length > 0) {
    return admin.app();
  }

  // Connect to emulator - no real credentials needed
  process.env.FIRESTORE_EMULATOR_HOST =
    process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8080';

  admin.initializeApp({
    projectId: 'test-project',
  });

  return admin.app();
}

/**
 * Clear all collections in Firestore Emulator
 */
export async function clearFirebaseEmulator() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error('Emulator is not running. Set FIRESTORE_EMULATOR_HOST=localhost:8080');
  }

  const db = admin.firestore();
  const collections = Object.values(FIRESTORE_COLLECTIONS);

  for (const collectionName of collections) {
    const snapshot = await db.collection(collectionName).get();
    const batch = db.batch();

    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });

    if (snapshot.docs.length > 0) {
      await batch.commit();
    }
  }
}

/**
 * Get Firestore instance
 */
export function getFirestore() {
  return admin.firestore();
}
