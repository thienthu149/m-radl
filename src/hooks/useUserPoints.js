// src/hooks/useUserPoints.js
import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';

export const useUserPoints = (user) => {
  const [points, setPoints] = useState(0);

  useEffect(() => {
    if (!user?.uid) {
      setPoints(0);
      return;
    }

    // Listen to the document named after the User ID
    const userRef = doc(db, 'points', user.uid);

    const unsub = onSnapshot(userRef, (docSnap) => {
      if (docSnap.exists()) {
        setPoints(docSnap.data().points || 0);
      } else {
        setPoints(0); // User exists but has no points doc yet
      }
    });

    return () => unsub();
  }, [user]); // Re-run if user logs out/in

  return points;
};