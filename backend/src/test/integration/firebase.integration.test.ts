import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { initializeFirebaseEmulator, clearFirebaseEmulator, getFirestore } from '../setup-emulator';

/**
 * Firebase Firestore Integration Tests
 *
 * These tests run against the Firestore Emulator to verify basic CRUD operations.
 * Start the emulator first:  make emulator
 * Run these tests:           make test-integration
 *
 * The emulator runs locally and doesn't touch production data.
 */
describe('Firestore Integration', () => {
  beforeAll(() => {
    initializeFirebaseEmulator();
  });

  afterEach(async () => {
    await clearFirebaseEmulator();
  }, 15000);

  it('should create and read a document', async () => {
    const db = getFirestore();
    const collection = db.collection('users');

    // Create
    const docRef = await collection.add({
      name: 'Alice',
      email: 'alice@example.com',
      createdAt: new Date().toISOString(),
    });

    // Read
    const doc = await docRef.get();
    expect(doc.exists).toBe(true);
    expect(doc.data()?.name).toBe('Alice');
    expect(doc.data()?.email).toBe('alice@example.com');
  });

  it('should update a document', async () => {
    const db = getFirestore();
    const collection = db.collection('users');

    const docRef = await collection.add({
      name: 'Bob',
      role: 'user',
    });

    // Update
    await docRef.update({ role: 'admin' });

    const updated = await docRef.get();
    expect(updated.data()?.role).toBe('admin');
    expect(updated.data()?.name).toBe('Bob');
  });

  it('should delete a document', async () => {
    const db = getFirestore();
    const collection = db.collection('users');

    const docRef = await collection.add({ name: 'Charlie' });
    expect((await docRef.get()).exists).toBe(true);

    // Delete
    await docRef.delete();
    expect((await docRef.get()).exists).toBe(false);
  });

  it('should query documents with filters', async () => {
    const db = getFirestore();
    const collection = db.collection('users');

    // Seed dummy data
    await Promise.all([
      collection.add({ name: 'Alice', role: 'admin' }),
      collection.add({ name: 'Bob', role: 'user' }),
      collection.add({ name: 'Charlie', role: 'user' }),
      collection.add({ name: 'Diana', role: 'admin' }),
    ]);

    // Query only admins
    const admins = await collection.where('role', '==', 'admin').get();
    expect(admins.size).toBe(2);

    const adminNames = admins.docs.map(d => d.data().name).sort();
    expect(adminNames).toEqual(['Alice', 'Diana']);

    // Query only regular users
    const users = await collection.where('role', '==', 'user').get();
    expect(users.size).toBe(2);
  });

  it('should handle batch writes atomically', async () => {
    const db = getFirestore();
    const collection = db.collection('users');

    const batch = db.batch();
    const ref1 = collection.doc('user-1');
    const ref2 = collection.doc('user-2');

    batch.set(ref1, { name: 'BatchUser1', score: 10 });
    batch.set(ref2, { name: 'BatchUser2', score: 20 });
    await batch.commit();

    const doc1 = await ref1.get();
    const doc2 = await ref2.get();
    expect(doc1.data()?.name).toBe('BatchUser1');
    expect(doc2.data()?.score).toBe(20);
  });

  it('should run a transaction', async () => {
    const db = getFirestore();
    const counterRef = db.collection('counters').doc('visits');

    // Initialize counter
    await counterRef.set({ count: 5 });

    // Atomically increment inside a transaction
    await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(counterRef);
      const currentCount = doc.data()?.count ?? 0;
      transaction.update(counterRef, { count: currentCount + 1 });
    });

    const result = await counterRef.get();
    expect(result.data()?.count).toBe(6);
  });
});
