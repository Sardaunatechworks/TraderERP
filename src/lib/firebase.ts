import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';

const firebaseConfig = {
  apiKey: "AIzaSyBC4sx-uaDeFCpygs_qUeRZiz3lTegoTPg",
  authDomain: "tradererp.firebaseapp.com",
  projectId: "tradererp",
  storageBucket: "tradererp.firebasestorage.app",
  messagingSenderId: "26296654208",
  appId: "1:26296654208:web:136717e16abcf7b9258965",
  measurementId: "G-CKKL8LT30V"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const functions = getFunctions(app);
