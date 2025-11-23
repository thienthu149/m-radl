// src/hooks/useLogin.js
import { useState, useEffect } from 'react';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInAnonymously, 
  onAuthStateChanged,
  updateProfile,
  signOut
} from 'firebase/auth';
import { auth } from '../config/firebase'; 

export const useLogin = () => {
    const [user, setUser] = useState(null);
    const [showLogin, setShowLogin] = useState(true);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(true);

    // 1. Listen for Auth Changes (Global Listener)
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser);
            setLoading(false);
            
            // If user exists, hide login modal. If not, show it.
            if (currentUser) {
                setShowLogin(false);
            } else {
                setShowLogin(true);
            }
        });
        return unsubscribe;
    }, []);

    // 2. Login Guest (Anonymous)
    const loginGuest = async () => {
        setError(null);
        try {
            await signInAnonymously(auth);
            // onAuthStateChanged will handle state updates
        } catch (err) {
            console.error('Guest login failed:', err);
            setError(mapAuthError(err.code));
        }
    };

    // 3. Login User (Email & Password)
    // Note: Your UI must now pass an Email, not just a nickname for login
    const loginUser = async (email, password) => {
        setError(null);
        try {
            await signInWithEmailAndPassword(auth, email, password);
        } catch (err) {
            console.error(err);
            setError(mapAuthError(err.code));
        }
    };

    // 4. Register User (Email, Password, Nickname)
    const registerUser = async (email, password, nickname) => {
        setError(null);
        try {
            // A. Create the Auth User
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            
            // B. Set the Display Name (Nickname)
            if (nickname) {
                await updateProfile(userCredential.user, {
                    displayName: nickname
                });
                
                // Force update local state to show the new display name immediately
                setUser({ ...userCredential.user, displayName: nickname });
            }
        } catch (err) {
            console.error(err);
            setError(mapAuthError(err.code));
        }
    };

    const logout = async () => {
        try {
            await signOut(auth);
        } catch (err) {
            console.error(err);
        }
    };

    return { 
        user, 
        showLogin, 
        error, 
        loading,
        loginUser, 
        registerUser, 
        loginGuest,
        logout 
    };
}

// Helper to make Firebase errors readable
const mapAuthError = (code) => {
    switch (code) {
        case 'auth/invalid-email': return 'Invalid email address.';
        case 'auth/user-disabled': return 'User account is disabled.';
        case 'auth/user-not-found': return 'No user found with this email.';
        case 'auth/wrong-password': return 'Incorrect password.';
        case 'auth/email-already-in-use': return 'Email already in use.';
        case 'auth/weak-password': return 'Password is too weak (6+ chars).';
        default: return 'Authentication failed. Please try again.';
    }
};