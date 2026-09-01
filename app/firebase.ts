import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyC0KPeJbYNPK0uJNjPtL9FI_TcrQ921-VM",
  authDomain: "talkup-12a3c.firebaseapp.com",
  projectId: "talkup-12a3c",
  storageBucket: "talkup-12a3c.firebasestorage.app",
  messagingSenderId: "513203705954",
  appId: "1:513203705954:web:8ce0ffd6ab974c7e86d93b",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

export async function ensureFirebaseUser() {
  if (auth.currentUser) return auth.currentUser;
  return (await signInAnonymously(auth)).user;
}
