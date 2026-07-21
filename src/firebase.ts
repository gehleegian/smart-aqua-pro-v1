import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBF2j50qUYt3Xwz0r6USMhDlwnaQI0fTlE",
  authDomain: "practice-smartaqua.firebaseapp.com",
  projectId: "practice-smartaqua",
  storageBucket: "practice-smartaqua.firebasestorage.app",
  messagingSenderId: "602265164540",
  appId: "1:602265164540:web:a9ca2a3afda83606ef9579",
  measurementId: "G-93GFT6WX67"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);