// src/services/userService.js
import { doc, setDoc, increment, serverTimestamp, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';

/**
 * Safely adds points to a user.
 * Uses 'merge: true' so it creates the doc if it doesn't exist.
 * Uses 'increment' so it doesn't overwrite other parallel updates.
 */
export const addUserPoints = async (userId, amount) => {
  if (!userId) return;

  const userRef = doc(db, 'points', userId);

  try {
    await setDoc(userRef, {
      points: increment(amount), // Atomic update (Safe!)
      lastUpdated: serverTimestamp(),
      // We don't need to store 'owner' field because the ID is the owner
    }, { merge: true });
    
    console.log(`Added ${amount} points to user ${userId}`);
  } catch (error) {
    console.error("Error adding points:", error);
  }
};

/**
 * Optional: Check current score once (non-realtime)
 */
export const getUserPoints = async (userId) => {
    if (!userId) return 0;
    const snap = await getDoc(doc(db, 'points', userId));
    if (snap.exists()) return snap.data().points;
    return 0;
};