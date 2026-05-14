import { 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  query, 
  orderBy, 
  getDocs,
  serverTimestamp,
  deleteDoc,
  updateDoc,
  increment
} from 'firebase/firestore';
import { db, auth, storage } from '../lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export interface UserProfile {
  userId: string;
  email: string;
  subscriptionTier: 'free' | 'premium' | 'enterprise';
  scansRemaining: number;
  totalScans: number;
  isAdmin?: boolean;
  createdAt?: any;
}

export interface HistoryRecord {
  id: string;
  fileName: string;
  decision: 'REAL' | 'FORGED';
  confidence: number;
  localization: string;
  recordId: string;
  userId: string;
  createdAt: any;
  image?: string;
  imageUrl?: string;
  details?: string;
  summary?: string;
}

export interface GlobalSettings {
  isMaintenanceMode: boolean;
  defaultFreeScans: number;
  allowPublicRegistrations: boolean;
}

// Utility to wrap Firestore calls with a timeout
const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number = 10000): Promise<T> => {
  let timeoutId: any;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error("Firestore operation timed out. Please check your internet connection or Firebase setup."));
    }, timeoutMs);
  });
  
  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId);
    return result;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
};

export const ensureUserProfile = async (user: any) => {
  const path = `users/${user.uid}`;
  try {
    const userDoc = doc(db, 'users', user.uid);
    const snapshot = await withTimeout(getDoc(userDoc));
    
    if (!snapshot.exists()) {
      let defaultScans = 5;
      try {
        const settings = await getAppSettings();
        defaultScans = settings.defaultFreeScans;
      } catch (e) {
        console.error("Failed to fetch settings for new user, using default", e);
      }

      const newUser: UserProfile = {
        userId: user.uid,
        email: user.email || '',
        subscriptionTier: 'free',
        scansRemaining: defaultScans,
        totalScans: 0,
        isAdmin: user.email === 'abhishekkashyap.iitd@gmail.com', // Bootstrap admin
      };
      await withTimeout(setDoc(userDoc, { ...newUser, createdAt: serverTimestamp() }));
      return newUser;
    }
    
    const data = snapshot.data() as UserProfile;
    // Auto-bootstrap admin if email matches bootstrap email
    if (user.email === 'abhishekkashyap.iitd@gmail.com' && !data.isAdmin) {
      await withTimeout(updateDoc(userDoc, { isAdmin: true }));
      return { ...data, isAdmin: true };
    }
    
    return data;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
    throw error;
  }
};

// --- Admin Services ---

export const getAllUsers = async () => {
  const path = 'users';
  try {
    const usersCol = collection(db, 'users');
    const snapshot = await withTimeout(getDocs(usersCol));
    return snapshot.docs.map(d => d.data() as UserProfile);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    throw error;
  }
};

export const updateUserTier = async (userId: string, tier: UserProfile['subscriptionTier'], isAdmin?: boolean) => {
  const path = `users/${userId}`;
  try {
    const userDoc = doc(db, 'users', userId);
    const updates: any = { subscriptionTier: tier };
    if (isAdmin !== undefined) updates.isAdmin = isAdmin;
    await withTimeout(updateDoc(userDoc, updates));
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
    throw error;
  }
};

export const getAppSettings = async () => {
  const path = 'settings/global';
  try {
    const settingsDoc = doc(db, 'settings', 'global');
    const snapshot = await withTimeout(getDoc(settingsDoc), 5000); // Shorter timeout for settings
    if (!snapshot.exists()) {
      const defaultSettings: GlobalSettings = {
        isMaintenanceMode: false,
        defaultFreeScans: 5,
        allowPublicRegistrations: true
      };
      await withTimeout(setDoc(settingsDoc, defaultSettings), 5000);
      return defaultSettings;
    }
    return snapshot.data() as GlobalSettings;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
    throw error;
  }
};

export const updateAppSettings = async (settings: Partial<GlobalSettings>) => {
  const path = 'settings/global';
  try {
    const settingsDoc = doc(db, 'settings', 'global');
    await withTimeout(updateDoc(settingsDoc, settings));
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
    throw error;
  }
};

export const uploadFile = async (userId: string, file: File) => {
  const fileExtension = file.name.split('.').pop();
  const filePath = `scans/${userId}/${Date.now()}.${fileExtension}`;
  const storageRef = ref(storage, filePath);
  
  // Timeout for storage upload
  const timeoutPromise = new Promise((_, reject) => 
    setTimeout(() => reject(new Error("Storage upload timed out")), 30000)
  );

  const uploadProcess = (async () => {
    const snapshot = await uploadBytes(storageRef, file);
    const downloadURL = await getDownloadURL(snapshot.ref);
    return downloadURL;
  })();

  try {
    return await Promise.race([uploadProcess, timeoutPromise]) as string;
  } catch (error: any) {
    console.error("Storage upload failed or timed out. Ensure Firebase Storage is enabled in the console and security rules allow access.", error);
    if (error.code === 'storage/retry-limit-exceeded' || error.message === "Storage upload timed out") {
      throw new Error("Firebase Storage is not responding. Please check if it's enabled in your Firebase console.");
    }
    throw error;
  }
};

export const saveRecord = async (userId: string, record: any) => {
  const recordsColPath = `users/${userId}/records`;
  let currentRecordId: string | null = null;
  
  try {
    const recordsCol = collection(db, 'users', userId, 'records');
    const recordDocRef = doc(recordsCol);
    currentRecordId = recordDocRef.id;
    
    await withTimeout(setDoc(recordDocRef, {
      ...record,
      recordId: currentRecordId,
      userId,
      createdAt: serverTimestamp(),
    }));
    
    const userDoc = doc(db, 'users', userId);
    await withTimeout(updateDoc(userDoc, {
      scansRemaining: increment(-1),
      totalScans: increment(1),
    }));
    
    return currentRecordId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, currentRecordId ? `${recordsColPath}/${currentRecordId}` : recordsColPath);
    throw error;
  }
};

export const getHistory = async (userId: string) => {
  const path = `users/${userId}/records`;
  try {
    const recordsCol = collection(db, 'users', userId, 'records');
    const q = query(recordsCol, orderBy('createdAt', 'desc'));
    const snapshot = await withTimeout(getDocs(q));
    
    return snapshot.docs.map(d => ({
      id: d.id,
      ...d.data()
    })) as HistoryRecord[];
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    throw error;
  }
};

export const deleteRecord = async (userId: string, recordId: string) => {
  const path = `users/${userId}/records/${recordId}`;
  try {
    const docRef = doc(db, 'users', userId, 'records', recordId);
    await withTimeout(deleteDoc(docRef));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
    throw error;
  }
};
