# Cocon — Organisez vos projets déco

App gratuite de gestion de projets déco : moodboards, budget, collaboration, plans & dimensions.

## Stack
- HTML / CSS / Vanilla JS
- Firebase (Auth, Firestore, Storage)
- Netlify (hosting)

## Déployer
Push sur `main` → Netlify auto-deploy.

## Structure
```
├── index.html          # Landing page
├── app.html            # Application
├── mentions-legales.html
├── 404.html
├── css/app.css
├── js/
│   ├── app.js          # App logic
│   ├── auth.js         # Auth module
│   └── firebase-config.js
├── netlify.toml        # Headers, redirects, cache
├── firestore.rules     # Security rules (deploy manually)
├── sitemap.xml
└── robots.txt
```
