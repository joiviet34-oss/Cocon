# Extension Chrome « Ajouter à Cocon »

Un clic sur l'icône Cocon dans la barre de Chrome : la fiche produit de l'onglet est lue,
on choisit la pièce, on ajoute. On ne quitte jamais le site du marchand.

## Installer en local (test)
1. chrome://extensions → activer « Mode développeur »
2. « Charger l'extension non empaquetée » → choisir ce dossier `extension/`
3. Épingler l'icône Cocon (puzzle → épingle)
4. Clic sur l'icône → « Connecter mon compte » → se connecter sur la page Cocon qui s'ouvre

## Fonctionnement
- `popup.js` lit la page (JSON-LD, og:, microdata) et écrit dans Firestore via l'API REST,
  avec le jeton de l'utilisateur : les règles Firestore s'appliquent comme dans l'app.
- `connect.js` tourne sur Cocon et récupère la session (poignée de main dans `public/js/auth.js`).
- `CONNECT_ORIGIN` (popup.js) pointe sur la preview beta : à passer sur https://cocon-app.fr avant publication.
