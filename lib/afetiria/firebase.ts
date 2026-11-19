import { getApp, getApps, initializeApp } from "firebase/app";
import { browserLocalPersistence, getAuth, setPersistence, type Auth } from "firebase/auth";

let instance: Promise<Auth> | undefined;
export function getServiceAuth() {
  if (!instance) instance = initialize();
  return instance;
}
export function getFirebaseConfig() {
  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  };
}
async function initialize() {
  const config = getFirebaseConfig();
  if ([config.apiKey, config.authDomain, config.projectId, config.appId].some(value => !value)) throw Error("CONFIG_REQUIRED");
  const name = "udm-afetiria";
  const app = getApps().some(app => app.name === name) ? getApp(name) : initializeApp(config, name);
  const auth = getAuth(app);
  await setPersistence(auth, browserLocalPersistence);
  return auth;
}
