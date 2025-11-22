import { useState, useEffect } from 'react';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { collection, addDoc, query, where, getDocs } from 'firebase/firestore';
import { auth, db } from '../config/firebase';

export function useLogin() {
    const [user, setUser] = useState(null);
    const [showLogin, setShowLogin] = useState(true);
    const [error, setError] = useState(null);
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (u) => {
            setUser(u);
            if (u) setShowLogin(false);
        });
        return unsubscribe;
    }, []);
    const loginGuest = async () => {
        try {
            await signInAnonymously(auth);
        } catch (err) {
            console.error('Guest login failed:', err);
            setError(err.message);
        }
    };

    const loginUser = async (nickname, password) => {
        try {
            const q = query(collection(db, 'users'), where('nickname', '==', nickname));
            const docs = await getDocs(q);
            if (docs.empty) {
                setError('User not found');
                return;
            }
            const userData = docs.docs[0].data();
            if (userData.password !== password) {
                setError('Wrong password');
                return;
            }
            setUser({ id: docs.docs[0].id, ...userData });
            setShowLogin(false);
            setError(null);
        } catch (err) {
            console.error(err);
            setError(err.message);
        }
    };

    const registerUser = async (nickname, password) => {
        try {
            const q = query(collection(db, 'users'), where('nickname', '==', nickname));
            const docs = await getDocs(q);
            if (!docs.empty) {
                setError('Nickname already exists');
                return;
            }
            const docRef = await addDoc(collection(db, 'users'), { nickname, password });
            setUser({ id: docRef.id, nickname });
            setShowLogin(false);
            setError(null);
        } catch (err) {
            console.error(err);
            setError(err.message);
        }
    };
    return { user, showLogin, error, loginUser, registerUser, loginGuest };
}
