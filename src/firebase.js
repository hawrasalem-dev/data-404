import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyARNydZ0uqLLXNndJFv60EOJj7ASjCQcU0",
  authDomain: "data404-nova.firebaseapp.com",
  projectId: "data404-nova",
  storageBucket: "data404-nova.firebasestorage.app",
  messagingSenderId: "30395653823",
  appId: "1:30395653823:web:573b5904fed0af1a95700a",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
