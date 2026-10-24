import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, getRedirectResult, signInWithPopup, signInWithRedirect, type User } from "firebase/auth";
import firebaseConfig from "../../firebase-applet-config.json";

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

const toGoogleUser = async (user: User) => ({
  googleId: user.uid,
  email: user.email,
  name: user.displayName || (user.email ? user.email.split('@')[0] : 'Shinobi Google'),
  photoUrl: user.photoURL || undefined,
  idToken: await user.getIdToken(),
});

export async function signInWithGoogle() {
  const result = await signInWithPopup(auth, googleProvider);
  return toGoogleUser(result.user);
}

export async function signInWithGoogleRedirect() {
  await signInWithRedirect(auth, googleProvider);
}

export async function getGoogleRedirectUser() {
  const result = await getRedirectResult(auth);
  return result ? toGoogleUser(result.user) : null;
}
