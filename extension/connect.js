// Tourne sur cocon-app.fr : récupère la session de l'utilisateur connecté et la confie à l'extension.
// L'app répond à « cocon-ext-hello » avec son jeton de session (voir public/js/app.js).
(function () {
  const ORIGIN = location.origin;

  window.addEventListener('message', (e) => {
    if (e.source !== window || e.origin !== ORIGIN || !e.data) return;
    const { type } = e.data;
    if (type === 'cocon-ext-auth' && e.data.refreshToken) {
      chrome.storage.local.set({
        auth: { refreshToken: e.data.refreshToken, uid: e.data.uid, name: e.data.name || '', origin: ORIGIN },
        idToken: null, idTokenExp: 0,
      }, () => window.postMessage({ type: 'cocon-ext-connected' }, ORIGIN));
    } else if (type === 'cocon-ext-logout') {
      chrome.storage.local.remove(['auth', 'idToken', 'idTokenExp', 'projects']);
    }
  });

  window.postMessage({ type: 'cocon-ext-hello' }, ORIGIN);
})();
