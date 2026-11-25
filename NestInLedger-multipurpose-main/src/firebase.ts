import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDcABLjVXgvfFhlrB2Ew0PwoT3oxJ6zcAc",
  authDomain: "nestbook-e30fb.firebaseapp.com",
  projectId: "nestbook-e30fb",
  storageBucket: "nestbook-e30fb.firebasestorage.app",
  messagingSenderId: "776048840713",
  appId: "1:776048840713:web:884618f97e014eedf368d8",
  measurementId: "G-9K7TM1SF4K"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
