# Workflow SEO Cocon, piloté par les données

> Cadre de travail pour toutes les tâches SEO. À relire avant chaque brief.

## Principe
On passe d'un SEO « on écrit des articles » à un SEO piloté par les données de Search Console.
On n'écrit plus rien sans avoir vérifié ce que Google montre déjà, et on optimise l'existant avant de créer.

## Qui fait quoi
- **Claude Code** (sur le Mac, dans ~/cocon-app) : accès à Search Console et GA4 via un MCP en lecture seule. Il analyse et produit les briefs.
- **OpenClaw (Chef)** : exécute les briefs. Modifie les fichiers, commit sur une branche draft/, publie une preview avec netlify deploy SANS --prod, et envoie l'URL de preview avec le diff gate.
- **Al** : relit la preview. Quand il répond « OK prod », on merge la branche dans main et on pousse (déploiement production). Jamais avant.

## Règles de travail SEO
1. **Une requête = une page.** Avant de créer un article, vérifier qu'aucune page existante ne reçoit déjà des impressions dessus. Si oui, on optimise celle-là. Créer un doublon fait se concurrencer nos propres pages.
2. **Le title** est l'élément le plus important de la page. Il contient la requête principale telle que les gens la tapent, et reste sous 60 caractères environ.
3. On ne retouche pas une page modifiée il y a moins de **60 jours**, sauf demande explicite. Google met des semaines à réévaluer une page, et la modifier trop tôt brouille la mesure.
4. Chaque page optimisée reçoit des **liens internes** depuis les articles proches, dans le corps du texte.
5. **DIFF GATE obligatoire** avant tout commit qui modifie une page existante : lister tout ce qui était présent avant et a disparu après (checklists, tableaux, CTA, liens internes, schema, FAQ, images). Rien ne disparaît sans être listé. Règle la plus importante : un agent qui réécrit une page peut supprimer en silence ce qui la faisait ranker.
6. **Jamais de chiffre inventé** (volumes, prix, statistiques). Si la donnée manque, l'écrire et la demander.

## Règles éditoriales (inchangées)
Français, vouvoiement, aucun tiret cadratin ni point médian. Cocon cité 1 à 2 fois maximum avec un lien vers /app. Jamais mettre en avant « gratuit ». Author schema en Person. FAQ avec schema FAQPage. Pas d'images générées par IA.

## Où on en est (Search Console, septembre 2026)
- Le site a des impressions mais très peu de clics : la plupart des pages sont en page 2 ou 3 de Google.
- **Priorité 1** : /blog/checklist-decoration-premier-appartement (1 101 impressions, position 12,6). Google la montre pour des requêtes de liste d'emménagement, alors que le titre parle de décoration. Un brief arrive juste après ce message.
- **Priorité 2** : le cluster moodboard (moodboard gratuit, moodboard en ligne, créer un moodboard), page en position 29.
- **Ensuite** : retravailler les titres des pages déjà en page 1 sans clic (quelle-couleur-pour-un-salon, tricount-renovation-deco).

## Déploiement beta
La beta (https://beta--ephemeral-syrniki-e31b2e.netlify.app) ne doit jamais être indexée. Le noindex vient d'un fichier `_headers` généré au build pour les seuls contextes deploy-preview et branch-deploy (voir netlify.toml).
1. La beta se déploie **uniquement** avec :
   `netlify deploy --build --context deploy-preview --alias beta`
   Sans `--build`, le `_headers` n'est pas généré et la beta part sans noindex.
2. Après chaque déploiement, `curl -I https://beta--ephemeral-syrniki-e31b2e.netlify.app/` : l'en-tête `X-Robots-Tag: noindex` doit être présent. S'il manque, le signaler immédiatement à Al.
3. `curl -I https://cocon-app.fr/` : l'en-tête `X-Robots-Tag` doit être **absent**. S'il est présent, le signaler immédiatement : la production est en noindex.
4. Supprimer le `_headers` généré en local après le déploiement (`rm -f _headers`), pour qu'il ne parte jamais en production.

## Rapports et documents internes
Le site est publié depuis la racine du repo : tout fichier poussé sur main est public sur cocon-app.fr. Les rapports SEO vont dans ~/cocon-growth/reviews/, jamais dans le repo du site (reviews/ est dans .gitignore). /docs/, /reviews/ et /CLAUDE.md renvoient un 404 forcé (netlify.toml).

## Interdits
- Ne jamais utiliser netlify deploy --prod, merger dans main ou pousser sur main sans un message explicite « OK prod ».
- Ne jamais toucher aux fichiers de credentials (~/.config/gcloud, client_secret*, token*). Ils sont dans .gitignore, ne jamais les ajouter à un commit.
- Ne jamais soumettre d'URL à un service d'indexation (IndexNow, API Indexing) sans accord explicite.
