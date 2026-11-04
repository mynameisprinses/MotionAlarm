import { readFile } from 'node:fs/promises';
import { after, before, beforeEach, test } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs } from 'firebase/firestore';

let environment;
before(async () => {
  environment = await initializeTestEnvironment({
    projectId: 'demo-motion-alarm',
    firestore: { host: '127.0.0.1', port: 8080, rules: await readFile('firestore.rules', 'utf8') },
  });
});
beforeEach(async () => environment.clearFirestore());
after(async () => environment?.cleanup());
const alert = {
  id: 'movement',
  source: 'Movement',
  createdAt: '2026-11-04T00:00:00.000Z',
  status: 'New',
  strength: 2.5,
};
const reference = (db, uid = 'alice') => doc(db, 'users', uid, 'alerts', 'movement');

test('owner can create, read, review, list, and delete movement alerts', async () => {
  const db = environment.authenticatedContext('alice').firestore();
  await assertSucceeds(setDoc(reference(db), alert));
  await assertSucceeds(getDoc(reference(db)));
  await assertSucceeds(getDocs(collection(db, 'users', 'alice', 'alerts')));
  await assertSucceeds(updateDoc(reference(db), { status: 'Reviewed' }));
  await assertSucceeds(deleteDoc(reference(db)));
});
test('unauthenticated users and other accounts cannot access alerts', async () => {
  await environment.withSecurityRulesDisabled(async (context) => setDoc(reference(context.firestore()), alert));
  for (const db of [
    environment.unauthenticatedContext().firestore(),
    environment.authenticatedContext('bob').firestore(),
  ]) {
    await assertFails(getDoc(reference(db)));
    await assertFails(getDocs(collection(db, 'users', 'alice', 'alerts')));
    await assertFails(setDoc(reference(db), alert));
    await assertFails(updateDoc(reference(db), { status: 'Reviewed' }));
    await assertFails(deleteDoc(reference(db)));
  }
});
test('test records, malformed records, extra fields, and changed event details are rejected', async () => {
  const db = environment.authenticatedContext('alice').firestore();
  for (const invalid of [
    { source: 'Test' },
    { id: 'wrong-id' },
    { createdAt: 'today' },
    { status: 'Reviewed' },
    { strength: -1 },
    { strength: 'bad' },
    { strength: Infinity },
    { extra: true },
  ]) {
    await assertFails(setDoc(reference(db), { ...alert, ...invalid }));
  }
  await assertSucceeds(setDoc(reference(db), alert));
  for (const changes of [
    { source: 'Test' },
    { createdAt: '2026-11-03T00:00:00.000Z' },
    { strength: 3 },
    { status: 'invalid' },
  ])
    await assertFails(updateDoc(reference(db), changes));
});
test('native import receipts are private and immutable', async () => {
  const db = environment.authenticatedContext('alice').firestore();
  const receipt = doc(db, 'users', 'alice', 'imports', 'movement');
  await assertSucceeds(setDoc(receipt, { id: 'movement' }));
  await assertSucceeds(getDoc(receipt));
  await assertFails(deleteDoc(receipt));
  await assertFails(setDoc(receipt, { id: 'movement' }));
  await assertFails(
    getDoc(doc(environment.authenticatedContext('bob').firestore(), 'users', 'alice', 'imports', 'movement')),
  );
});
