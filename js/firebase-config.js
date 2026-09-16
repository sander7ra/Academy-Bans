import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBMd9fP-NsOlxJNGiWHUOunKAk73Wu7vxM",
  authDomain: "academy-bans.firebaseapp.com",
  projectId: "academy-bans",
  storageBucket: "academy-bans.firebasestorage.app",
  messagingSenderId: "2408486948",
  appId: "1:2408486948:web:6ebd3a4f3c384d815ce0b1"
};

const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);
