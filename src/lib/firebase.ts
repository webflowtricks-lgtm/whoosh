import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import firebaseConfig from "../../firebase-applet-config.json";

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export async function signInWithGoogle() {
  const result = await signInWithPopup(auth, googleProvider);
  const user = result.user;
  return {
    googleId: user.uid,
    email: user.email,
    name: user.displayName || (user.email ? user.email.split('@')[0] : 'Shinobi Google'),
    photoUrl: user.photoURL || undefined,
  };
}
