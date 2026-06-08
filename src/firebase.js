import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyD2IXzi56gFy5ql2SHXTNVJF7s1jnrBSgI",
  authDomain: "proprep-ec427.firebaseapp.com",
  projectId: "proprep-ec427",
  storageBucket: "proprep-ec427.firebasestorage.app",
  messagingSenderId: "720555056492",
  appId: "1:720555056492:web:bffb944069834b03b46749",
  measurementId: "G-XZXV9N56MK"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);