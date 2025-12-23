// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCJcEmFGOeuj0uCXLiafUD6v5dY23ODI2U",
  authDomain: "gst-return-tracker.firebaseapp.com",
  projectId: "gst-return-tracker",
  storageBucket: "gst-return-tracker.firebasestorage.app",
  messagingSenderId: "799081302174",
  appId: "1:799081302174:web:b89e7b12abe4240b62538f"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();