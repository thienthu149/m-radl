// src/hooks/useAuth.js
import { useState, useEffect } from 'react';
import { signInWithEmailAndPassword, onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { auth } from '../config/firebase'; 

export const useAuth = () => {
  const [user, setUser] = useState(null);

  useEffect(() => {
    // 1. HARDCODED / ANON LOGIN
    const TEST_EMAIL = "dev@mradl.com";
    const TEST_PASS = "123456";

    signInWithEmailAndPassword(auth, TEST_EMAIL, TEST_PASS)
      .catch((err) => {
        console.warn("Dev login failed, using Anon:", err);
        signInAnonymously(auth);
      });

    // 2. LISTEN FOR AUTH CHANGES
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });

    return () => unsub();
  }, []);

  return { user };
};