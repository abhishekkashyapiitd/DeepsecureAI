import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();

export const signInWithGoogle = async () => {
  console.log('signInWithGoogle internal called. Auth state:', !!auth);
  if (!auth) {
    console.error('Auth is not initialized');
    throw new Error('Firebase Auth not initialized');
  }
  try {
    console.log('Attempting signInWithPopup...');
    const result = await signInWithPopup(auth, googleProvider);
    console.log('signInWithPopup success:', result.user.email);
    return result;
  } catch (error: any) {
    console.error('signInWithPopup internal error:', error);
    // Log detailed error info
    console.error('Error details:', {
      code: error.code,
      message: error.message,
      stack: error.stack
    });
    throw error;
  }
};

export const signInWithGoogleRedirect = () => signInWithRedirect(auth, googleProvider);
export const handleRedirectResult = () => getRedirectResult(auth);
