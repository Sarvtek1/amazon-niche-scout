import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";

/**
 * Utility: throw clear error if environment variable is missing.
 */
function must(name: string, v: string | undefined) {
  if (!v) throw new Error(`❌ Missing env var: ${name}. Check .env.local and restart dev server.`);
  return v;
}

/**
 * Initialize Firebase App
 * Uses your .env.local values prefixed with VITE_FB_*
 */
const app = initializeApp({
  apiKey: must("VITE_FB_API_KEY", import.meta.env.VITE_FB_API_KEY),
  authDomain: must("VITE_FB_AUTH_DOMAIN", import.meta.env.VITE_FB_AUTH_DOMAIN),
  projectId: must("VITE_FB_PROJECT_ID", import.meta.env.VITE_FB_PROJECT_ID),
  storageBucket: must("VITE_FB_STORAGE_BUCKET", import.meta.env.VITE_FB_STORAGE_BUCKET),
  messagingSenderId: must("VITE_FB_SENDER_ID", import.meta.env.VITE_FB_SENDER_ID),
  appId: must("VITE_FB_APP_ID", import.meta.env.VITE_FB_APP_ID),
});

/**
 * Firebase Services
 */
export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();
export const db = getFirestore(app);

/**
 * Cloud Functions (region must match your deployment region)
 * For your setup → "us-central1"
 */
export const functions = getFunctions(app, "us-central1");

/**
 * Default export (optional)
 * So you can import app elsewhere if needed
 */
export default app;
