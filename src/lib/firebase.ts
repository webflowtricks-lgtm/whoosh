import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithCredential, signInWithPopup, type User } from "firebase/auth";
import { Capacitor } from "@capacitor/core";
import { SocialLogin } from "@capgo/capacitor-social-login";
import firebaseConfig from "../../firebase-applet-config.json";

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });
let nativeGoogleInitialization: Promise<void> | null = null;

const toGoogleUser = async (user: User) => ({
  googleId: user.uid,
  email: user.email,
  name: user.displayName || (user.email ? user.email.split('@')[0] : 'Shinobi Google'),
  photoUrl: user.photoURL || undefined,
  idToken: await user.getIdToken(),
});

export async function signInWithGoogle() {
  if (Capacitor.getPlatform() === "android" && Capacitor.isPluginAvailable("SocialLogin")) {
    if (!nativeGoogleInitialization) {
      nativeGoogleInitialization = SocialLogin.initialize({
        google: {
          webClientId: firebaseConfig.oAuthClientId,
          mode: "online",
        },
      });
    }
    try {
      await nativeGoogleInitialization;
    } catch (error) {
      nativeGoogleInitialization = null;
      throw error;
    }

    const response = await SocialLogin.login({
      provider: "google",
      options: { scopes: ["email", "profile"] },
    });
    if (response.provider !== "google" || response.result.responseType !== "online" || !response.result.idToken) {
      throw new Error("O Google não retornou um token de autenticação.");
    }

    const firebaseCredential = GoogleAuthProvider.credential(response.result.idToken);
    return toGoogleUser((await signInWithCredential(auth, firebaseCredential)).user);
  }

  const result = await signInWithPopup(auth, googleProvider);
  return toGoogleUser(result.user);
}
