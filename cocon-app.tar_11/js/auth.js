// ═══════════════════════════════════════════════════════════════
// AUTH MODULE
// ═══════════════════════════════════════════════════════════════

let currentUser = null;
let isSignUp = false;

// ─── Auth State Listener ─────────────────────────────────────
auth.onAuthStateChanged(user => {
    currentUser = user;
    const params = new URLSearchParams(window.location.search);
    const shareId = params.get('share');
    const viewId = params.get('view');

    // Public read-only view — no auth required
    if (viewId) {
        if (typeof loadPublicView === 'function') loadPublicView(viewId);
        return;
    }

    if (user) {
        if (shareId) {
            if (typeof loadSharedProject === 'function') loadSharedProject(shareId);
        } else {
            if (typeof showDashboard === 'function') {
                showDashboard();
            } else {
                window.addEventListener('load', () => showDashboard());
            }
        }
        if (typeof updateUserUI === 'function') updateUserUI(user);
    } else {
        if (shareId) {
            // Auto sign-in anonymously for shared links
            auth.signInAnonymously().catch(err => {
                console.error('Anonymous auth failed:', err);
                showAuthError('Impossible de charger le projet partagé. Veuillez vous connecter.');
                showScreen('auth-screen');
            });
        } else {
            showScreen('auth-screen');
        }
    }
});

// ─── Google Login ─────────────────────────────────────────────
async function loginWithGoogle() {
    try {
        await auth.signInWithPopup(googleProvider);
    } catch (error) {
        showAuthError(error.message);
    }
}

// ─── Email Auth ───────────────────────────────────────────────
async function handleEmailAuth(e) {
    e.preventDefault();
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const name = document.getElementById('auth-name').value;

    try {
        if (isSignUp) {
            const cred = await auth.createUserWithEmailAndPassword(email, password);
            if (name) {
                await cred.user.updateProfile({ displayName: name });
            }
            // Create user doc
            await db.collection('users').doc(cred.user.uid).set({
                name: name || email.split('@')[0],
                email: email,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        } else {
            await auth.signInWithEmailAndPassword(email, password);
        }
    } catch (error) {
        let msg = error.message;
        if (error.code === 'auth/user-not-found') msg = 'Aucun compte avec cet email.';
        if (error.code === 'auth/wrong-password') msg = 'Mot de passe incorrect.';
        if (error.code === 'auth/email-already-in-use') msg = 'Cet email est déjà utilisé.';
        if (error.code === 'auth/weak-password') msg = 'Mot de passe trop court (6 caractères min).';
        showAuthError(msg);
    }
}

// ─── Toggle Login/Signup ──────────────────────────────────────
function toggleAuthMode(e) {
    if (e) e.preventDefault();
    isSignUp = !isSignUp;
    document.getElementById('auth-title').textContent = isSignUp ? 'Créer un compte' : 'Connexion';
    document.getElementById('auth-subtitle').textContent = isSignUp ? 'Commencez à organiser votre déco' : 'Retrouvez vos projets déco';
    document.getElementById('auth-submit-btn').textContent = isSignUp ? 'Créer mon compte' : 'Se connecter';
    document.getElementById('auth-switch-text').textContent = isSignUp ? 'Déjà un compte ?' : 'Pas encore de compte ?';
    document.getElementById('auth-switch-link').textContent = isSignUp ? 'Se connecter' : 'Créer un compte';
    document.getElementById('auth-name-group').style.display = isSignUp ? 'block' : 'none';
    document.getElementById('auth-error').textContent = '';
}

// ─── Logout ───────────────────────────────────────────────────
async function logout() {
    await auth.signOut();
    showScreen('auth-screen');
}

// ─── Helpers ──────────────────────────────────────────────────
function showAuthError(msg) {
    const el = document.getElementById('auth-error');
    el.textContent = msg;
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 5000);
}

function updateUserUI(user) {
    const name = user.displayName || user.email.split('@')[0];
    const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    document.querySelectorAll('[id^="user-avatar"]').forEach(el => el.textContent = initials);
    document.querySelectorAll('[id^="user-name"]').forEach(el => el.textContent = name);
}
