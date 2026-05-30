// ═══════════════════════════════════════════════════════════════
// 🔥 FIREBASE CONFIG — REMPLACE PAR TES VRAIES CLÉS (étape 5 du guide)
// ═══════════════════════════════════════════════════════════════

const firebaseConfig = {
    apiKey: "AIzaSyC6Bguxqoa2jTq_4lR3p9rwEBVmnMc-o60",
    authDomain: "cocon-5a81e.firebaseapp.com",
    projectId: "cocon-5a81e",
    storageBucket: "cocon-5a81e.firebasestorage.app",
    messagingSenderId: "147594038734",
    appId: "1:147594038734:web:d00fa9867094425d42ef9f"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const googleProvider = new firebase.auth.GoogleAuthProvider();
const storage = firebase.storage();
