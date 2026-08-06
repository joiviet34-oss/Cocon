// seo-data.js — données éditoriales pour seo-fix.js
// Modifiable sans toucher au script.

const AUTHOR = {
  name: "Alexandre Joiviet",
  jobTitle: "Fondateur de Cocon",
  url: "https://cocon-app.fr/a-propos",
  bio: "Fondateur de Cocon, un outil de gestion de projet pensé pour la décoration et la rénovation intérieure. J'ai créé Cocon après avoir rénové mon propre appartement et constaté qu'aucun outil ne permettait de suivre un budget, des inspirations et des commandes au même endroit, à plusieurs."
};

// 3 questions par article. Les réponses sont volontairement courtes et factuelles :
// c'est ce format que Google et les moteurs de réponse reprennent le mieux.
const FAQ = {
  "amenager-petit-salon": [
    ["Quelle taille de canapé choisir dans un petit salon ?",
     "Comptez un canapé 2 places de 160 à 180 cm de large pour un salon de 10 à 15 m². Au-delà, la circulation devient inconfortable. Privilégiez les modèles sur pieds fins et sans accoudoirs épais : ils libèrent visuellement le sol et donnent une impression d'espace supplémentaire."],
    ["Faut-il peindre un petit salon en blanc ?",
     "Pas nécessairement. Le blanc pur agrandit peu et rend la pièce froide si elle est mal exposée. Une teinte claire et chaude, comme un beige rosé ou un blanc cassé, fonctionne mieux. Peindre les murs et les plafonds dans la même teinte efface les angles et étire visuellement le volume."],
    ["Combien d'espace laisser pour circuler dans un petit salon ?",
     "Prévoyez 60 cm minimum entre le canapé et la table basse, et 70 à 80 cm pour les passages principaux. En dessous, la pièce paraît encombrée même si elle est bien rangée. C'est le premier réglage à faire avant de choisir le mobilier."]
  ],
  "budget-renovation-appartement": [
    ["Quel budget prévoir pour rénover un appartement au m² ?",
     "Comptez environ 250 à 500 euros du m² pour un rafraîchissement (peinture, sols, petites reprises), 700 à 1 200 euros du m² pour une rénovation complète, et 1 200 à 2 000 euros du m² si vous touchez à la structure, à la plomberie et à l'électricité. Ces fourchettes varient fortement selon la région."],
    ["Quelle marge de sécurité prévoir sur un budget travaux ?",
     "Ajoutez 10 à 15 % du budget total en réserve d'imprévus sur une rénovation légère, et 20 % dès que vous ouvrez des murs ou refaites des réseaux. Les dépassements viennent presque toujours de ce qui est découvert après démolition, pas des postes annoncés au devis."],
    ["Faut-il payer un artisan à l'avance ?",
     "Un acompte de 30 % à la signature est une pratique courante et légale. Refusez les demandes de paiement intégral avant travaux. Prévoyez un échelonnement par étapes avec un solde de 5 à 10 % versé après la levée des réserves à la réception du chantier."]
  ],
  "checklist-decoration-premier-appartement": [
    ["Quel budget prévoir pour meubler un premier appartement ?",
     "Comptez 3 000 à 5 000 euros pour un T2 en achetant neuf en milieu de gamme, et 1 500 à 2 500 euros en mixant seconde main et neuf. Le lit, le canapé et le réfrigérateur représentent à eux seuls près de la moitié de l'enveloppe."],
    ["Par quelle pièce commencer quand on emménage ?",
     "Commencez par la chambre et la cuisine. Ce sont les deux pièces qui rendent le logement vivable dès le premier soir. Le salon peut rester incomplet plusieurs semaines sans réel inconfort, et c'est aussi la pièce où les achats impulsifs coûtent le plus cher."],
    ["Que faut-il acheter avant même le jour de l'emménagement ?",
     "Rideaux ou stores, ampoules, rallonges, papier toilette, produits de nettoyage, une lampe d'appoint et un jeu d'outils de base. Ce sont les oublis classiques qui obligent à ressortir le soir même, alors qu'ils coûtent moins de 100 euros au total."]
  ],
  "choisir-couleurs-peinture-interieur": [
    ["Comment tester une couleur de peinture avant de se décider ?",
     "Peignez un carré d'au moins 50 x 50 cm directement sur le mur concerné, jamais sur une feuille posée dessus. Observez-le le matin, l'après-midi et le soir sous lumière artificielle pendant deux à trois jours. Une teinte peut changer radicalement selon l'orientation de la pièce."],
    ["Combien de couleurs différentes dans un même logement ?",
     "Trois à quatre teintes maximum sur l'ensemble du logement, plus les blancs et les neutres. Au-delà, la circulation entre les pièces devient visuellement heurtée. Une couleur dominante déclinée en plusieurs intensités donne un résultat plus cohérent que quatre couleurs indépendantes."],
    ["Quelle finition de peinture choisir selon la pièce ?",
     "Mat pour les plafonds et les chambres, il masque les défauts mais se nettoie mal. Velours ou satin pour les salons et les couloirs, bon compromis entre rendu et lavabilité. Satin ou laque pour les cuisines, salles de bain et boiseries, qui doivent résister à l'humidité."]
  ],
  "generateur-palette-couleurs-deco": [
    ["Comment extraire une palette de couleurs à partir d'une photo ?",
     "Importez la photo dans un générateur de palette, qui identifie les teintes dominantes par analyse des pixels. Retenez cinq couleurs maximum : une dominante, deux secondaires et deux accents. C'est la méthode la plus fiable pour transposer une inspiration en choix de peinture concret."],
    ["Quelle est la règle du 60 30 10 en décoration ?",
     "Elle répartit les couleurs d'une pièce en trois proportions : 60 % pour la teinte dominante (murs et grandes surfaces), 30 % pour la secondaire (mobilier, textiles) et 10 % pour l'accent (coussins, objets, luminaires). C'est le rapport qui produit le plus naturellement un ensemble équilibré."],
    ["Les couleurs d'un écran correspondent-elles à la peinture réelle ?",
     "Non. Un écran émet de la lumière alors qu'une peinture la réfléchit, et le rendu varie selon la calibration. Utilisez la palette générée comme point de départ pour choisir des références chez un fabricant, puis validez toujours avec un échantillon physique testé sur le mur."]
  ],
  "idee-deco-chambre-adulte": [
    ["Quelle couleur favorise le sommeil dans une chambre ?",
     "Les teintes désaturées et moyennement foncées fonctionnent le mieux : vert sauge, bleu grisé, taupe, terracotta éteint. Elles réduisent le contraste lumineux au réveil. Évitez les couleurs vives saturées et le blanc pur, qui maintiennent un niveau de stimulation visuelle élevé."],
    ["Comment éclairer une chambre d'adulte ?",
     "Prévoyez trois sources distinctes : un éclairage général au plafond, deux liseuses de part et d'autre du lit, et une lumière d'ambiance basse. Choisissez des ampoules à température chaude, autour de 2 700 kelvins, et installez un variateur sur le circuit principal."],
    ["Quelle hauteur pour accrocher un cadre au-dessus d'un lit ?",
     "Placez le bas du cadre 20 à 25 cm au-dessus de la tête de lit, et centrez-le sur le lit et non sur le mur. La largeur de l'ensemble accroché doit représenter environ les deux tiers de la largeur du lit pour rester proportionnée."]
  ],
  "moodboard-deco-gratuit": [
    ["Qu'est-ce qu'un moodboard en décoration ?",
     "C'est un tableau visuel qui rassemble au même endroit les images d'inspiration, les échantillons de couleurs, les matières et les produits envisagés pour un projet. Il sert à vérifier la cohérence d'un ensemble avant d'acheter, et à partager une direction claire avec un conjoint ou un artisan."],
    ["Combien d'images faut-il dans un moodboard ?",
     "Entre huit et quinze visuels par pièce. En dessous, la direction reste trop floue pour guider des achats. Au-delà, le tableau perd sa fonction d'arbitrage et redevient une simple collection d'inspirations contradictoires."],
    ["Comment passer d'un moodboard à des achats concrets ?",
     "Associez chaque image d'inspiration à un produit réel avec son prix et son lien, puis suivez son statut d'achat. C'est exactement ce que fait Cocon : le moodboard reste relié au budget et aux commandes, au lieu de vivre à part dans un dossier d'images."]
  ],
  "organiser-renovation-appartement": [
    ["Dans quel ordre réaliser les travaux de rénovation ?",
     "Démolition, puis gros œuvre et réseaux (plomberie, électricité), ensuite cloisons et isolation, puis enduits et plâtrerie, menuiseries, carrelage, peinture, et enfin sols souples et pose des équipements. Inverser cet ordre est la cause la plus fréquente de reprises coûteuses."],
    ["Combien de temps dure la rénovation d'un appartement ?",
     "Comptez 3 à 5 semaines pour un rafraîchissement complet d'un T2, 2 à 3 mois pour une rénovation lourde avec reprise des réseaux, et 4 à 6 mois si vous modifiez les cloisons ou déplacez une cuisine ou une salle de bain. Ajoutez les délais d'approvisionnement, souvent sous-estimés."],
    ["Faut-il une autorisation pour rénover un appartement ?",
     "Les travaux intérieurs sans modification de façade ni de structure ne nécessitent généralement aucune autorisation d'urbanisme, mais l'accord de la copropriété reste requis dès que vous touchez à un mur porteur, aux colonnes communes ou à l'aspect extérieur. Vérifiez le règlement de copropriété avant de démarrer."]
  ],
  "quelle-couleur-pour-un-salon": [
    ["Quelle couleur agrandit visuellement un salon ?",
     "Les teintes claires et légèrement chaudes agrandissent le plus : blanc cassé, beige rosé, gris perle. L'effet vient surtout de la continuité, peindre les murs et les boiseries dans la même teinte supprime les ruptures et étire la perception du volume plus efficacement que la clarté seule."],
    ["Quelle couleur pour un salon sombre orienté nord ?",
     "Évitez les gris froids et les blancs purs, qui accentuent la sensation de grisaille. Optez pour des teintes chaudes et lumineuses comme l'ocre clair, le beige doré ou le terracotta éteint. Elles compensent la lumière bleutée du nord et réchauffent la pièce toute la journée."],
    ["Peut-on mettre une couleur foncée dans un petit salon ?",
     "Oui, à condition de l'appliquer sur l'ensemble des murs plutôt que sur un seul pan. Une couleur foncée uniforme efface les limites de la pièce et crée un effet d'enveloppement, alors qu'un mur d'accent isolé raccourcit visuellement l'espace en marquant une frontière."]
  ],
  "relooker-cuisine-sans-travaux": [
    ["Peut-on repeindre des façades de cuisine sans les démonter ?",
     "Oui, mais le résultat dépend entièrement de la préparation. Dégraissez, poncez légèrement, appliquez un primaire d'accrochage spécifique aux supports mélaminés ou stratifiés, puis deux couches de peinture laque. Sans primaire adapté, la peinture s'écaille en quelques mois sur les zones de contact."],
    ["Combien coûte le relooking d'une cuisine sans travaux ?",
     "Entre 300 et 900 euros selon l'ampleur : peinture des façades, changement des poignées, crédence adhésive ou carreaux à coller, et nouvel éclairage sous meubles. À comparer à 4 000 à 12 000 euros pour une cuisine complète, ce qui rend l'opération intéressante sur un logement destiné à être revendu ou loué."],
    ["Comment changer un plan de travail sans tout refaire ?",
     "Le film adhésif haute résistance et la résine de rénovation permettent de couvrir un plan existant pour moins de 150 euros. La solution intermédiaire consiste à poser un plan neuf en stratifié découpé aux dimensions, en conservant les caissons, pour 250 à 600 euros."]
  ],
  "tricount-renovation-deco": [
    ["Peut-on utiliser Tricount pour des travaux de rénovation ?",
     "Oui pour le partage des dépenses entre plusieurs personnes, mais Tricount est conçu pour équilibrer des comptes après coup. Il ne gère ni le budget prévisionnel par pièce, ni les statuts de commande, ni les devis en attente, qui sont les trois besoins réels d'un chantier."],
    ["Comment partager un budget travaux en couple ?",
     "Définissez d'abord une enveloppe globale et une répartition, égale ou proportionnelle aux revenus. Suivez ensuite chaque dépense dans un outil partagé mis à jour en temps réel par les deux personnes. Les désaccords viennent presque toujours d'un décalage d'information, pas du montant lui-même."],
    ["Faut-il un compte joint pour financer une rénovation ?",
     "Ce n'est pas obligatoire. Un compte dédié simplifie le suivi mais complique la répartition en cas de séparation, surtout si les apports sont inégaux. Beaucoup de couples préfèrent garder des comptes séparés et suivre les contributions dans un outil partagé, avec un règlement des écarts à la fin du chantier."]
  ]
};

// Manifeste images. Chaque article : 1 hero + 2 illustrations inline.
// slot = position d'insertion : "hero" ou index du H2 (0 = avant le 1er H2, 1 = avant le 2e, etc.)
const IMAGES = {
  "amenager-petit-salon": [
    { file: "amenager-petit-salon-hero.webp", slot: "hero", alt: "Petit salon de 12 m² aménagé avec un canapé deux places clair et une table basse ronde" },
    { file: "amenager-petit-salon-canape.webp", slot: 1, alt: "Canapé compact sur pieds fins dans un salon étroit, laissant le sol visible" },
    { file: "amenager-petit-salon-rangements.webp", slot: 2, alt: "Rangements muraux verticaux au-dessus d'un canapé dans un petit salon" }
  ],
  "budget-renovation-appartement": [
    { file: "budget-renovation-hero.webp", slot: "hero", alt: "Appartement en cours de rénovation avec plan de chantier et calculatrice posés sur une table" },
    { file: "budget-renovation-postes.webp", slot: 1, alt: "Répartition des postes de dépenses d'une rénovation d'appartement" },
    { file: "budget-renovation-devis.webp", slot: 2, alt: "Comparaison de devis d'artisans pour des travaux de rénovation" }
  ],
  "checklist-decoration-premier-appartement": [
    { file: "checklist-premier-appartement-hero.webp", slot: "hero", alt: "Premier appartement en cours d'installation avec cartons de déménagement et mobilier essentiel" },
    { file: "checklist-premier-appartement-chambre.webp", slot: 1, alt: "Chambre d'un premier appartement meublée avec le strict nécessaire" },
    { file: "checklist-premier-appartement-cuisine.webp", slot: 2, alt: "Cuisine équipée des ustensiles de base pour un premier logement" }
  ],
  "choisir-couleurs-peinture-interieur": [
    { file: "choisir-couleurs-peinture-hero.webp", slot: "hero", alt: "Échantillons de peinture testés directement sur un mur intérieur" },
    { file: "choisir-couleurs-peinture-test.webp", slot: 1, alt: "Carrés de peinture peints sur un mur pour comparer les teintes selon la lumière" },
    { file: "choisir-couleurs-peinture-finitions.webp", slot: 2, alt: "Comparaison des finitions mate, satinée et laquée sur une même couleur" }
  ],
  "generateur-palette-couleurs-deco": [
    { file: "generateur-palette-hero.webp", slot: "hero", alt: "Palette de couleurs déco extraite d'une photo d'intérieur" },
    { file: "generateur-palette-photo.webp", slot: 1, alt: "Photo d'inspiration déco et palette de cinq couleurs correspondante" },
    { file: "generateur-palette-60-30-10.webp", slot: 2, alt: "Application de la règle 60 30 10 dans un salon décoré" }
  ],
  "idee-deco-chambre-adulte": [
    { file: "idee-deco-chambre-hero.webp", slot: "hero", alt: "Chambre d'adulte décorée dans des teintes désaturées avec tête de lit en bois" },
    { file: "idee-deco-chambre-eclairage.webp", slot: 1, alt: "Chambre éclairée par deux liseuses murales de part et d'autre du lit" },
    { file: "idee-deco-chambre-textiles.webp", slot: 2, alt: "Superposition de textiles en lin et laine sur un lit d'adulte" }
  ],
  "moodboard-deco-gratuit": [
    { file: "moodboard-deco-hero.webp", slot: "hero", alt: "Moodboard déco rassemblant images d'inspiration, échantillons de couleurs et matières" },
    { file: "moodboard-deco-matieres.webp", slot: 1, alt: "Échantillons de bois, lin et céramique disposés sur un moodboard physique" },
    { file: "moodboard-deco-numerique.webp", slot: 2, alt: "Moodboard numérique reliant des produits à un budget de projet déco" }
  ],
  "organiser-renovation-appartement": [
    { file: "organiser-renovation-hero.webp", slot: "hero", alt: "Planning de rénovation d'appartement affiché sur un mur de chantier" },
    { file: "organiser-renovation-ordre.webp", slot: 1, alt: "Chantier de rénovation au stade de la plâtrerie avant peinture" },
    { file: "organiser-renovation-suivi.webp", slot: 2, alt: "Suivi de l'avancement d'un chantier de rénovation pièce par pièce" }
  ],
  "quelle-couleur-pour-un-salon": [
    { file: "couleur-salon-hero.webp", slot: "hero", alt: "Salon peint en vert sauge avec mobilier en bois clair et textiles écrus" },
    { file: "couleur-salon-lumineux.webp", slot: 2, alt: "Salon lumineux orienté sud peint dans une teinte claire et chaude" },
    { file: "couleur-salon-sombre.webp", slot: 3, alt: "Salon orienté nord réchauffé par une peinture terracotta éteinte" }
  ],
  "relooker-cuisine-sans-travaux": [
    { file: "relooker-cuisine-hero.webp", slot: "hero", alt: "Cuisine relookée avec façades repeintes et poignées changées, sans travaux" },
    { file: "relooker-cuisine-facades.webp", slot: 1, alt: "Façades de cuisine en cours de peinture avec primaire d'accrochage" },
    { file: "relooker-cuisine-credence.webp", slot: 2, alt: "Crédence adhésive posée sur un mur de cuisine existant" }
  ],
  "tricount-renovation-deco": [
    { file: "tricount-renovation-hero.webp", slot: "hero", alt: "Couple suivant le budget de ses travaux de rénovation sur un écran partagé" },
    { file: "tricount-renovation-partage.webp", slot: 1, alt: "Répartition des dépenses de rénovation entre deux personnes" },
    { file: "tricount-renovation-statuts.webp", slot: 2, alt: "Suivi des statuts de commande de mobilier lors d'une rénovation" }
  ]
};

module.exports = { AUTHOR, FAQ, IMAGES };
