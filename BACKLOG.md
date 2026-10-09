# LittleBigWeb — Backlog produit

> Remake web fidèle des **mécaniques** de LittleBigPlanet 1 (PS3), joué en local / LAN entre amis.
> Aucun asset Sony : modèles, textures, musiques et logos sont faits maison ou procéduraux.

## Conventions

- **Format** : « En tant que… je veux… afin de… » + critères d'acceptation (CA).
- **Priorité MoSCoW** : **M** = Must, **S** = Should, **C** = Could, **W** = Won't (pas pour l'instant).
- **Points** : suite 1, 2, 3, 5, 8, 13 (13 = à découper avant d'entrer en sprint).
- **Statut** : `[FAIT]` = couvert par le code de `main` (vérifié dans `public/js/*.js`) ; `[EN COURS]` = sprint 1, développé sur `feat/editeur` ou `feat/online`.
- **Identifiants** : `JOU` Jouer, `CRE` Popit/Création, `PER` Personnalisation, `MUL` Multijoueur, `COM` Communauté, `HIS` Histoire, `DAN` Dangers, `HUD` HUD/menus.

### Socle technique existant (rappel)

| Fichier | Contenu vérifié |
|---|---|
| `server.js` | Serveur statique Node sans dépendance, port 3000+ auto, ouverture du navigateur |
| `public/js/main.js` | Boucle à pas fixe 60 Hz + interpolation, contrôle du joueur, caméra, HUD, clavier/souris/manette |
| `public/js/level.js` | 3 plans (masques de collision Rapier), boîtes, boules, sol, plates-formes mobiles, balançoire, pendule, bulles, checkpoints, panneaux, arrivée, niveau 1 |
| `public/js/character.js` | Sackboy en tricot : marche, saut, atterrissage écrasé, clignement, 4 émotions, couleur |
| `public/js/textures.js` | Carton, carton foncé, bois, métal, éponge, feutrine, tricot, ciel, collines, fleurs, panneaux |
| `public/js/audio.js` | Bruitages synthétisés (saut, pop, attraper, checkpoint…) + musique en boucle |

---

## Épopée 1 — Jouer (mécaniques de base) `JOU`

Le cœur du platformer : si ça n'est pas agréable manette en main, rien d'autre ne compte.

| ID | Story | CA | MoSCoW | Pts | Statut |
|---|---|---|---|---|---|
| JOU-01 | En tant que joueur, je veux courir à gauche/droite avec accélération et inertie, afin de contrôler mon perso finement. | Q/D, flèches ou stick ; vitesse max ~7 u/s ; inertie réduite en l'air. | M | 3 | [FAIT] |
| JOU-02 | En tant que joueur, je veux un saut dont la hauteur dépend de la durée d'appui, afin de doser mes sauts comme dans LBP. | Relâcher coupe la vitesse montante ; « coyote time » 0,1 s ; tampon de saut 0,12 s. | M | 3 | [FAIT] |
| JOU-03 | En tant que joueur, je veux passer entre les 3 plans (devant/milieu/fond), afin d'explorer la profondeur. | Z/S ou croix ; refus (son « nope ») si un objet occupe la place ; transition z animée ; HUD des plans. | M | 5 | [FAIT] |
| JOU-04 | En tant que joueur, je veux attraper un objet et le tirer/pousser, afin de résoudre des énigmes physiques. | Shift/clic/gâchette maintenus ; joint pivot sur le point le plus proche ; vitesse réduite à 75 % ; relâcher = libérer. | M | 5 | [FAIT] |
| JOU-05 | En tant que joueur, je veux me balancer accroché à un objet suspendu, afin de franchir des trous. | Accroché en l'air, la direction applique une impulsion ; lâcher conserve l'élan. | M | 3 | [FAIT] |
| JOU-06 | En tant que joueur, je veux être porté par les plates-formes mobiles, afin de ne pas glisser dessus. | Vitesse de la plate-forme ajoutée au joueur ; saut hérite de la vitesse verticale. | M | 2 | [FAIT] |
| JOU-07 | En tant que joueur, je veux collecter des bulles de score avec combos, afin d'être récompensé de jouer vite et bien. | Petites 10 pts, grosses 50 ; combo si < 0,7 s, multiplicateur jusqu'à x5 ; popup flottant. | M | 3 | [FAIT] |
| JOU-08 | En tant que joueur, je veux des checkpoints qui deviennent mon point de réapparition, afin de ne pas tout recommencer. | Activation au passage ; anneau vert ; R = retour checkpoint ; chute hors niveau = réapparition. | M | 3 | [FAIT] |
| JOU-09 | En tant que joueur, je veux que chaque checkpoint ait un nombre de vies limité (4, 8 pour un double checkpoint), afin de retrouver la tension de LBP. | Compteur de vies visible sur la borne ; à 0 : la borne s'éteint, retour au checkpoint précédent ; plus aucune borne = échec du niveau. | S | 3 | |
| JOU-10 | En tant que joueur, je veux que seuls les matériaux « attrapables » (éponge, tissu…) puissent être saisis, afin de respecter la logique de LBP. | Propriété `grabbable` dérivée du matériau ; métal/bois non saisissables par défaut ; surcharge possible dans l'éditeur. | S | 2 | |
| JOU-11 | En tant que joueur, je veux être écrasé si je suis coincé entre deux objets, afin que la physique ait des conséquences. | Détection d'écrasement (contacts opposés + force > seuil) → mort « pouf » + réapparition. | S | 3 | |
| JOU-12 | En tant que joueur, je veux une vraie animation de mort et de réapparition depuis la borne, afin de comprendre ce qui s'est passé. | Le Sackboy éclate en peluches, puis réapparaît « éjecté » par la borne avec un son. | C | 2 | |
| JOU-13 | En tant que joueur, je veux sauter sur des trampolines/surfaces rebondissantes, afin de varier le level design. | Restitution par matériau ou gadget ; rebond proportionnel à la vitesse d'arrivée. | C | 2 | |
| JOU-14 | En tant que joueur, je veux nager dans l'eau, afin de varier les niveaux — **hors LBP1** (l'eau arrive dans LBP2/3). | — | W | — | |
| JOU-15 | En tant que joueur, je veux une caméra qui suit en douceur et s'écarte quand plusieurs joueurs sont loin, afin de garder tout le monde à l'écran. | Caméra amortie déjà en place (solo) ; en multi : cadrage englobant + zoom arrière jusqu'à une limite. | M | 3 | [FAIT] solo / à étendre (MUL-06) |

---

## Épopée 2 — Popit / Mode création (éditeur) `CRE`

Le « Crée » de LBP1 : construire des niveaux avec des matériaux, des formes, des outils et des gadgets, en mettant le jeu en pause ou en direct.

### 2.a Fondations de l'éditeur

| ID | Story | CA | MoSCoW | Pts | Statut |
|---|---|---|---|---|---|
| CRE-01 | En tant que créateur, je veux basculer entre mode jeu et mode création dans le même niveau, afin de tester immédiatement ce que je construis. | Touche dédiée ; en création la physique est en pause ; retour au jeu = simulation reprend depuis l'état édité. | M | 5 | [EN COURS] |
| CRE-02 | En tant que créateur, je veux un format de niveau JSON sérialisable (objets, plans, gadgets, spawn, arrivée), afin de sauvegarder, charger et partager. | `buildLevel1` réexprimé en JSON chargeable ; versionnage `format: 1` ; aller-retour sans perte. | M | 5 | [EN COURS] |
| CRE-03 | En tant que créateur, je veux déplacer un curseur (Popit) libre et zoomer la caméra, afin de construire n'importe où. | Curseur souris/stick ; caméra libre + zoom molette/gâchettes ; changement de plan du curseur. | M | 3 | [EN COURS] |
| CRE-04 | En tant que créateur, je veux sauvegarder/charger mes niveaux localement, afin de ne rien perdre. | Sauvegarde dans `localStorage` + export/import fichier `.lbw.json` ; liste « Mes niveaux ». | M | 3 | [EN COURS] |
| CRE-05 | En tant que créateur, je veux annuler/rétablir (Ctrl+Z / Ctrl+Y), afin d'expérimenter sans peur. | Pile d'au moins 50 actions ; couvre création, suppression, déplacement, propriété. | M | 3 | [EN COURS] |
| CRE-06 | En tant que créateur, je veux une grille magnétique activable, afin d'aligner proprement. | Pas 0,25/0,5/1 ; rotation par crans de 15° ; désactivable. | S | 2 | |

### 2.b Matériaux, formes et outils

| ID | Story | CA | MoSCoW | Pts | Statut |
|---|---|---|---|---|---|
| CRE-07 | En tant que créateur, je veux poser des formes de base (carré, cercle, triangle, demi-cercle) dans un matériau, afin de construire le décor. | Palette de formes ; taille réglable ; épaisseur 1, 2 ou 3 plans. | M | 5 | [EN COURS] |
| CRE-08 | En tant que créateur, je veux choisir parmi les matériaux de base (carton, bois, métal, éponge, feutrine, pierre, verre, caoutchouc, polystyrène « fixe »), afin que chaque matériau ait sa physique. | Densité/friction/restitution/attrapable par matériau ; textures procédurales ; 6 existants + pierre, verre, caoutchouc, polystyrène. | M | 5 | Partiel (6 matériaux dans `textures.js`) |
| CRE-09 | En tant que créateur, je veux dessiner une forme libre (polygone au tracé), afin d'aller au-delà des primitives. | Clic-glisser = contour ; simplification ; découpage convexe pour Rapier ; extrusion sur le(s) plan(s). | S | 8 | |
| CRE-10 | En tant que créateur, je veux sélectionner, déplacer, tourner, redimensionner, dupliquer et supprimer, afin d'éditer vite. | Poignées ; multi-sélection rectangle ; Ctrl+D duplique ; Suppr efface. | M | 5 | [EN COURS] |
| CRE-11 | En tant que créateur, je veux l'outil « Fixer » (rendre statique / dynamique), afin de figer un décor ou libérer un objet. | Bascule fixe/dynamique visible (icône/teinte) ; persiste en JSON. | M | 2 | [EN COURS] |
| CRE-12 | En tant que créateur, je veux l'outil « Colle » et « Découpe/Gomme » (ajouter/soustraire une forme), afin de sculpter le matériau. | Union/soustraction de polygones de même matériau ; recalcul des colliders. | C | 8 | |
| CRE-13 | En tant que créateur, je veux cloner l'apparence (pipette matériau), afin d'enchaîner sans repasser par le menu. | Pipette sur un objet → matériau actif. | C | 1 | |

### 2.c Gadgets mécaniques (liaisons)

| ID | Story | CA | MoSCoW | Pts | Statut |
|---|---|---|---|---|---|
| CRE-14 | En tant que créateur, je veux poser un **boulon** (pivot) libre, à ressort ou motorisé, afin de faire des roues, portes et balançoires. | Joint revolute Rapier ; options : libre, limites d'angle, moteur (vitesse, couple), « wobble » ; balançoire/pendule existants réexprimés avec. | M | 5 | Partiel (balançoire et pendule codés en dur) |
| CRE-15 | En tant que créateur, je veux des liaisons **ressort**, **corde/fil** et **tige**, afin de créer suspensions et pendules. | Ressort (raideur, amortissement) ; corde (longueur max, rendu en laine) ; tige (distance fixe). | M | 5 | Partiel (pendule à fil) |
| CRE-16 | En tant que créateur, je veux un **piston** (allers-retours linéaires), afin de faire des ascenseurs et presses. | Joint prismatique motorisé ; course min/max, période, pause, synchronisé ou déclenché. | M | 5 | Partiel (`mover` cinématique) |
| CRE-17 | En tant que créateur, je veux un **treuil** (corde dont la longueur varie) et un **moteur à rotation continue**, afin de compléter la panoplie LBP1. | Treuil : longueur min/max, période ; moteur : vitesse signée. | S | 3 | |

### 2.d Logique : interrupteurs, capteurs, émetteurs

| ID | Story | CA | MoSCoW | Pts | Statut |
|---|---|---|---|---|---|
| CRE-18 | En tant que créateur, je veux relier un **interrupteur** à un gadget via un fil visible, afin de déclencher des mécanismes. | Fil tracé de l'interrupteur à la cible ; une sortie → plusieurs cibles ; option inverser. | M | 5 | |
| CRE-19 | En tant que créateur, je veux les interrupteurs LBP1 : **bouton**, **levier** (on/off/3 positions), **interrupteur à clé**, afin de varier les déclencheurs. | Bouton à pression (momentané ou bascule) ; levier attrapable ; clé = objet ramassable qui active ses serrures. | M | 5 | |
| CRE-20 | En tant que créateur, je veux un **capteur de proximité** (joueur dans un rayon), afin de déclencher sans contact. | Rayon réglable ; « nombre de joueurs requis » ; affichage du rayon en création seulement. | M | 3 | |
| CRE-21 | En tant que créateur, je veux un **capteur d'attrapage** (objet saisi = actif), afin de faire des poignées. | Actif tant qu'un joueur tient l'objet. | S | 2 | |
| CRE-22 | En tant que créateur, je veux un **émetteur** d'objets (copie d'un objet modèle à intervalle), afin de faire des distributeurs, pluies de rochers, etc. | Fréquence, durée de vie, vitesse initiale, nombre max simultané ; activable par interrupteur. | M | 5 | |
| CRE-23 | En tant que créateur, je veux transformer une sélection en **objet personnalisé** réutilisable (prefab), afin de ne pas tout reconstruire. | « Capturer un objet » → inventaire « Mes objets » ; posé = copie liée à rien. | S | 5 | |
| CRE-24 | En tant que créateur, je veux poser les éléments de niveau (spawn, checkpoint, double checkpoint, arrivée, bulle, bulle prix), afin de fabriquer un niveau complet. | Entrée/arrivée obligatoires pour publier ; bulles posables à la main ou en ligne/arc. | M | 3 | [EN COURS] |
| CRE-25 | En tant que créateur, je veux des **bulles prix** qui contiennent un objet/autocollant, afin de récompenser l'exploration. | La bulle prix débloque un élément dans l'inventaire du joueur (PER). | S | 3 | |
| CRE-26 | En tant que créateur, je veux régler les **paramètres globaux** (musique, éclairage, brouillard, fond), afin de donner une ambiance. | 3 thèmes de fond procéduraux au moins ; choix de piste musicale synthétisée. | C | 3 | |
| CRE-27 | En tant que créateur, je veux un **éditeur de musique « Musique interactive »** — **hors priorité**. | — | W | — | |

---

## Épopée 3 — Personnalisation `PER`

| ID | Story | CA | MoSCoW | Pts | Statut |
|---|---|---|---|---|---|
| PER-01 | En tant que joueur, je veux changer la couleur de mon Sackboy, afin de me distinguer. | Touche C / bouton Y ; 7 teintes ; effet de fumée + son. | M | 1 | [FAIT] |
| PER-02 | En tant que joueur, je veux exprimer 4 émotions (joie, tristesse, colère, surprise), afin de communiquer sans parler. | Touches 1-4 / croix gauche-droite ; sourcils et bouche animés. | M | 2 | [FAIT] |
| PER-03 | En tant que joueur, je veux régler l'intensité de l'émotion (3 niveaux par émotion), afin de retrouver la finesse de LBP1. | Appuyer plusieurs fois intensifie ; 4 × 3 expressions. | C | 2 | |
| PER-04 | En tant que joueur, je veux un vrai menu de costumes par emplacement (tête, yeux, bouche, torse, jambes, mains…), afin de composer mon perso. | Pièces procédurales (chapeaux, lunettes, moustache, écharpe…) ; aperçu 3D ; combinables. | M | 8 | Partiel (couleur unique seulement) |
| PER-05 | En tant que joueur, je veux sauvegarder mon apparence, afin de la retrouver au prochain lancement et en ligne. | `localStorage` ; envoyée au serveur à la connexion multi. | M | 2 | |
| PER-06 | En tant que joueur, je veux bouger les bras librement au stick droit (gestes), afin de saluer/taper les copains. | Stick droit / souris + touche = bras orientés ; giflé = petite poussée physique. | S | 3 | |
| PER-07 | En tant que créateur, je veux coller des **autocollants** sur n'importe quelle surface, afin de décorer. | Projection décalque sur la face ; taille/rotation ; 20+ autocollants procéduraux (formes, lettres, icônes). | S | 5 | |
| PER-08 | En tant que joueur, je veux coller un autocollant sur mon Sackboy, afin de personnaliser mon costume. | Décalque sur le tricot ; sauvegardé avec l'apparence. | C | 3 | |
| PER-09 | En tant que créateur, je veux poser des **décorations** 3D (fleurs, ampoules, boutons, rubans), afin d'habiller sans changer la physique. | Décorations sans collision fixées à un objet ; suivent l'objet. | S | 3 | Partiel (fleurs décoratives en bordure du sol) |
| PER-10 | En tant que joueur, je veux débloquer costumes/autocollants via les bulles prix, afin d'avoir envie de tout collecter. | Inventaire persistant ; notification « Nouvel objet ! ». | S | 3 | |
| PER-11 | En tant que joueur, je veux un outil « Photo » (capture d'écran avec cadre), afin de garder des souvenirs. | Capture canvas → PNG téléchargé / attaché au niveau. | C | 2 | |

---

## Épopée 4 — Multijoueur `MUL`

Co-op jusqu'à 4 joueurs, en ligne (LAN/Internet via le `server.js`) et en local sur un même écran.

| ID | Story | CA | MoSCoW | Pts | Statut |
|---|---|---|---|---|---|
| MUL-01 | En tant que joueur, je veux héberger une partie depuis `server.js` et que mes amis la rejoignent par l'URL du LAN, afin de jouer ensemble sans installation. | Serveur WebSocket intégré (sans dépendance ou `ws`) ; adresse LAN affichée au lancement ; 4 joueurs max. | M | 5 | [EN COURS] |
| MUL-02 | En tant que joueur, je veux voir les autres Sackboys bouger de façon fluide, afin d'avoir l'impression d'être ensemble. | Snapshots ≥ 20 Hz ; interpolation ~100 ms ; couleur/costume, émotion et plan synchronisés. | M | 8 | [EN COURS] |
| MUL-03 | En tant que joueur, je veux que les objets physiques soient les mêmes pour tous, afin de coopérer sur les énigmes. | Hôte autoritaire pour la physique des objets ; clients prédisent leur propre perso ; correction douce. | M | 8 | [EN COURS] |
| MUL-04 | En tant que joueur, je veux attraper un autre joueur ou un objet tenu par un autre, afin de tirer ensemble (mécanique LBP). | Joint perso↔perso ; objet lourd nécessitant 2 joueurs déplaçable. | S | 5 | |
| MUL-05 | En tant que joueur, je veux un lobby simple (pseudo, couleur, prêt), afin de lancer la partie quand tout le monde est là. | Liste des joueurs ; hôte lance le niveau ; joueur qui rejoint en cours apparaît au checkpoint actif. | M | 3 | [EN COURS] |
| MUL-06 | En tant que joueur en groupe, je veux une caméra partagée qui garde tout le monde visible, et qu'un joueur trop loin soit ramené (bulle), afin de ne pas perdre de copains. | Cadrage englobant ; hors écran > 3 s → joueur mis en bulle et ramené. | M | 5 | |
| MUL-07 | En tant que joueurs, nous voulons un score par joueur et un classement en fin de niveau, afin d'avoir une rivalité amicale. | Bulles attribuées à qui les prend ; écran de fin avec podium. | S | 3 | |
| MUL-08 | En tant que joueurs, nous voulons des **zones à N joueurs** (« 2 joueurs requis »), afin de retrouver les secrets co-op de LBP1. | Capteur de proximité avec nombre requis (dépend de CRE-20) ; porte qui s'ouvre. | S | 3 | |
| MUL-09 | En tant que joueurs sur le même PC, nous voulons jouer à plusieurs avec plusieurs manettes (+ 1 clavier), afin de jouer en local sans réseau. | Jusqu'à 4 manettes Gamepad API ; « appuie sur A pour rejoindre » ; écran partagé non (caméra commune). | M | 5 | |
| MUL-10 | En tant que joueur, je veux un chat rapide / émotions visibles par tous, afin de communiquer. | Messages courts prédéfinis + saisie libre ; bulle au-dessus du perso. | C | 2 | |
| MUL-11 | En tant que joueurs, nous voulons créer un niveau à plusieurs en même temps (création co-op), afin de construire entre amis comme dans LBP1. | Curseurs Popit de chacun visibles ; actions éditeur synchronisées par l'hôte ; verrou par objet. | S | 8 | |
| MUL-12 | En tant qu'hôte, je veux gérer la déconnexion/reconnexion, afin qu'un joueur qui saute ne casse pas la partie. | Perso retiré proprement ; reconnexion avec même pseudo reprend sa couleur et son score. | S | 3 | |

---

## Épopée 5 — Partage communautaire (local / LAN) `COM`

L'équivalent de « LBP.me / Communauté » mais hébergé par `server.js` sur le PC de l'hôte.

| ID | Story | CA | MoSCoW | Pts | Statut |
|---|---|---|---|---|---|
| COM-01 | En tant que créateur, je veux publier mon niveau sur le serveur local, afin que mes amis puissent y jouer. | `POST /api/levels` ; stockage `data/levels/*.json` ; titre, description, auteur, vignette ; validation (entrée + arrivée). | M | 5 | |
| COM-02 | En tant que joueur, je veux parcourir les niveaux publiés (liste, recherche, tri), afin de trouver quoi jouer. | `GET /api/levels` ; tri récents/populaires/mieux notés ; recherche par titre/auteur. | M | 3 | |
| COM-03 | En tant que joueur, je veux noter un niveau (cœur + note 1-5 étoiles) et lui donner des tags, afin d'aider les autres à choisir. | Un vote par pseudo ; tags prédéfinis (« Facile », « Joli », « Co-op »…) ; moyenne affichée. | M | 3 | |
| COM-04 | En tant que joueur, je veux voir le tableau des scores de chaque niveau, afin de défier mes amis. | Meilleur score par pseudo ; top 10 ; mis à jour à la fin du niveau. | S | 3 | |
| COM-05 | En tant que créateur, je veux mettre à jour ou dépublier mon niveau, afin de corriger un bug. | Version incrémentée ; seul l'auteur (pseudo + jeton local) peut modifier. | S | 2 | |
| COM-06 | En tant que joueur, je veux laisser un commentaire sur un niveau, afin de féliciter le créateur. | Commentaires texte courts, horodatés. | C | 2 | |
| COM-07 | En tant que joueur, je veux « mettre en cœur » un créateur/niveau pour le retrouver, afin de suivre mes préférés. | Liste « Mes cœurs » côté client. | C | 1 | |
| COM-08 | En tant que créateur, je veux une vignette générée automatiquement (capture), afin que la liste soit visuelle. | Capture du canvas au moment de la publication (PNG redimensionné). | S | 2 | |
| COM-09 | En tant qu'hôte, je veux exporter/importer un pack de niveaux, afin d'échanger hors réseau. | Archive JSON unique contenant plusieurs niveaux. | C | 2 | |

---

## Épopée 6 — Mode Histoire `HIS`

Recréer la structure de LBP1 (mondes thématiques, niveaux, clés, objets cachés) avec des thèmes **originaux**.

| ID | Story | CA | MoSCoW | Pts | Statut |
|---|---|---|---|---|---|
| HIS-01 | En tant que joueur, je veux jouer le niveau 1 « Le Jardin en Carton » avec un tutoriel intégré, afin d'apprendre les commandes. | Panneaux tutoriel ; zones : déplacement, plans, balançoire, éponge, ascenseur, pendule, pyramide ; arrivée. | M | 5 | [FAIT] |
| HIS-02 | En tant que joueur, je veux un écran de fin avec score, bulles, temps et record, afin de mesurer ma progression. | Record stocké en `localStorage` ; Entrée/A pour rejouer. | M | 2 | [FAIT] |
| HIS-03 | En tant que joueur, je veux une carte des mondes (au moins 3 mondes × 3 niveaux), afin d'avoir une progression. | Carte sélectionnable ; niveaux verrouillés tant que le précédent n'est pas fini. | M | 5 | |
| HIS-04 | En tant que joueur, je veux que les niveaux d'histoire soient des fichiers JSON chargés par le moteur, afin qu'on puisse les créer avec l'éditeur. | `buildLevel1` converti en JSON (dépend de CRE-02) ; tous les niveaux d'histoire au format éditeur. | M | 3 | |
| HIS-05 | En tant que joueur, je veux un compteur « bulles prix trouvées / total » par niveau, afin de viser le 100 %. | Affiché sur la carte et en fin de niveau ; badge « Tout collecté » + « Sans mourir ». | S | 2 | |
| HIS-06 | En tant que joueur, je veux trouver des **clés** qui débloquent des mini-niveaux défis (score, survie), afin de rejouer les mondes. | Clé cachée dans un niveau → mini-niveau débloqué sur la carte. | S | 3 | |
| HIS-07 | En tant que joueur, je veux des **zones à 2/3/4 joueurs** dans les niveaux d'histoire, afin de rejouer en co-op. | Au moins une zone co-op par niveau (dépend de MUL-08). | S | 2 | |
| HIS-08 | En tant que joueur, je veux un niveau « boss » par monde (grosse machine à gadgets), afin de conclure chaque monde. | Boss construit avec gadgets (pistons, émetteurs, dangers) ; points faibles à activer. | C | 8 | |
| HIS-09 | En tant que joueur, je veux une musique et une ambiance propres à chaque monde, afin de varier les sensations. | Une boucle synthétisée par monde ; palette de fond dédiée. | S | 3 | Partiel (1 musique) |
| HIS-10 | En tant que joueur, je veux des courses chronométrées (porte de départ/arrivée), afin de reproduire les niveaux « course » de LBP1. | Gadget départ/arrivée course ; chrono dédié ; tableau des temps. | C | 3 | |

Mondes proposés (thèmes maison) : 1. **Le Jardin en Carton** · 2. **L'Atelier du Bricoleur** (métal, pistons, électricité) · 3. **La Cuisine Volcanique** (feu, gaz, émetteurs).

---

## Épopée 7 — Dangers `DAN`

En LBP1 les dangers sont des « propriétés » appliquées à un matériau (feu, électricité, gaz horrible) + la chute et l'écrasement.

| ID | Story | CA | MoSCoW | Pts | Statut |
|---|---|---|---|---|---|
| DAN-01 | En tant que joueur, je veux réapparaître si je tombe hors du niveau, afin de ne pas rester bloqué. | Sous y = -14 → retour checkpoint + toast « Oups ! ». | M | 1 | [FAIT] |
| DAN-02 | En tant que créateur, je veux appliquer la propriété **feu** à un objet, afin de créer des surfaces brûlantes. | Contact = Sackboy prend feu (flammes procédurales) puis meurt ; rendu flammes + son. | M | 5 | |
| DAN-03 | En tant que créateur, je veux appliquer la propriété **électricité**, afin de créer des pièges électriques. | Arcs bleus procéduraux ; contact = électrocution (squelette visible bref) + mort. | M | 3 | |
| DAN-04 | En tant que créateur, je veux appliquer la propriété **gaz horrible** (nuage vert), afin de créer des zones mortelles traversant les plans. | Volume de gaz ; mort au contact ; particules vertes. | S | 3 | |
| DAN-05 | En tant que créateur, je veux pouvoir activer/désactiver un danger via un interrupteur, afin de faire des pièges rythmés. | Entrée logique on/off sur la propriété danger (dépend de CRE-18). | S | 2 | |
| DAN-06 | En tant que joueur, je veux une mort par écrasement, afin que les presses soient dangereuses. | Voir JOU-11. | S | — | (lié JOU-11) |
| DAN-07 | En tant que créateur, je veux des **objets destructibles** (« matériau dissolvant ») et des explosifs, afin de faire tomber des passages. | Dissolvant : disparaît sur signal ; explosif : impulsion radiale + destruction. | C | 5 | |
| DAN-08 | En tant que joueur, je veux une alerte visuelle claire des dangers (couleur, animation), afin que la mort soit juste. | Chaque danger a un rendu et un son distinctifs ; visible en création et en jeu. | M | 2 | |

---

## Épopée 8 — HUD / menus (Pod, Popit) `HUD`

| ID | Story | CA | MoSCoW | Pts | Statut |
|---|---|---|---|---|---|
| HUD-01 | En tant que joueur, je veux un HUD avec score, chrono et indicateur de plan, afin de suivre ma partie. | Score avec effet « bump », chrono mm:ss, plan actif surligné. | M | 2 | [FAIT] |
| HUD-02 | En tant que joueur, je veux un écran titre avec commandes et un rappel en jeu, afin de démarrer facilement. | Écran titre + aide qui s'efface après 12 s ; démarrage clavier/souris/manette. | M | 1 | [FAIT] |
| HUD-03 | En tant que joueur, je veux jouer à la manette, afin de retrouver les sensations PS3. | A saut, gâchettes attraper, croix plans/émotions, Y costume, Start. | M | 2 | [FAIT] |
| HUD-04 | En tant que joueur, je veux couper/remettre la musique, afin de jouer en discutant. | Touche M + toast. | M | 1 | [FAIT] |
| HUD-05 | En tant que joueur, je veux un **menu pause** (reprendre, recommencer, quitter, options), afin de contrôler la partie. | Échap/Start ; physique en pause ; « Recommencer » remet le niveau à zéro sans recharger la page. | M | 2 | |
| HUD-06 | En tant que joueur, je veux un **Pod** (vaisseau-hub en carton) comme menu principal, afin d'accéder à Histoire, Communauté, Mes niveaux, Personnaliser. | Scène 3D du Pod avec mon Sackboy ; 4 entrées ; navigation clavier/manette. | S | 5 | |
| HUD-07 | En tant que créateur, je veux le **Popit** (menu radial/onglets au curseur) : Matériaux, Objets, Gadgets, Autocollants, Outils, Mes objets, afin d'accéder à tout l'éditeur. | Ouverture touche/bouton carré ; onglets ; vignettes ; recherche. | M | 5 | [EN COURS] (version de base) |
| HUD-08 | En tant que créateur, je veux un **panneau de réglages** (« tweak ») sur chaque gadget, afin d'ajuster ses paramètres. | Sélection d'un gadget → curseurs/valeurs ; appliqué immédiatement. | M | 3 | |
| HUD-09 | En tant que joueur, je veux les options (volumes séparés, remap touches, qualité graphique/ombres), afin d'adapter le jeu à mon PC. | Persistance `localStorage` ; qualité basse = pas d'ombres, pixelRatio 1. | S | 3 | |
| HUD-10 | En tant que joueur, je veux voir le pseudo et la couleur des autres joueurs au-dessus d'eux et dans le HUD, afin de savoir qui est qui. | Étiquette flottante ; liste des joueurs avec score. | S | 2 | |
| HUD-11 | En tant que joueur, je veux un écran de chargement et des messages d'erreur clairs (CDN, WebGL, réseau), afin de comprendre ce qui ne va pas. | Message déjà présent pour le chargement des modules ; à étendre au réseau et WebGL absent. | S | 1 | Partiel |

---

## Récapitulatif

| Épopée | Stories | dont [FAIT] | dont [EN COURS] | Points restants (hors FAIT, hors W) |
|---|---|---|---|---|
| 1. Jouer | 15 | 9 | 0 | 12 |
| 2. Popit / Création | 27 | 0 | 9 | 107 |
| 3. Personnalisation | 11 | 2 | 0 | 31 |
| 4. Multijoueur | 12 | 0 | 4 | 58 |
| 5. Communauté | 9 | 0 | 0 | 23 |
| 6. Histoire | 10 | 2 | 0 | 29 |
| 7. Dangers | 8 | 1 | 0 | 20 |
| 8. HUD / menus | 11 | 4 | 1 | 21 |
| **Total** | **103** | **18** | **14** | **≈ 301** |

(Points [EN COURS] inclus dans « restants » ; JOU-15 compté en FAIT pour la partie solo.)

---

## Plan de sprints proposé

Hypothèse de vélocité : ~25-30 points par sprint (petite équipe d'agents + relecture humaine). Chaque sprint se termine par une soirée de test entre amis.

### Sprint 1 — Éditeur de base + co-op en ligne *(en cours : `feat/editeur`, `feat/online`)*
- **Éditeur** : CRE-01, CRE-02, CRE-03, CRE-04, CRE-05, CRE-07, CRE-10, CRE-11, CRE-24, HUD-07 (version simple).
- **Online** : MUL-01, MUL-02, MUL-03, MUL-05.
- **Objectif démo** : je construis un petit niveau, je le sauvegarde, et deux amis y jouent avec moi sur le LAN.

### Sprint 2 — Gadgets mécaniques + fusion des deux branches
- CRE-14 boulon, CRE-15 ressort/corde/tige, CRE-16 piston, CRE-08 matériaux complets, CRE-06 grille, HUD-08 réglages des gadgets.
- HIS-04 : convertir « Le Jardin en Carton » au format JSON (preuve que l'éditeur sait tout exprimer).
- MUL-06 caméra partagée, MUL-12 déconnexion.
- **Objectif démo** : refaire la balançoire, le pendule et l'ascenseur du niveau 1 *avec l'éditeur*, en co-op.

### Sprint 3 — Logique + dangers
- CRE-18 fils, CRE-19 bouton/levier/clé, CRE-20 capteur de proximité, CRE-22 émetteur.
- DAN-02 feu, DAN-03 électricité, DAN-08 lisibilité, JOU-09 vies aux checkpoints, JOU-11 écrasement.
- HUD-05 menu pause.
- **Objectif démo** : un niveau-piège avec porte à levier, presse, sol électrique et distributeur de rochers.

### Sprint 4 — Partage communautaire
- COM-01 publier, COM-02 parcourir, COM-03 noter, COM-04 scores, COM-08 vignette, COM-05 mise à jour.
- MUL-07 score par joueur, HUD-10 étiquettes joueurs.
- **Objectif démo** : chacun publie un niveau depuis son PC, on les note en fin de soirée.

### Sprint 5 — Personnalisation
- PER-04 costumes par emplacement, PER-05 sauvegarde apparence, PER-07 autocollants, PER-09 décorations, PER-06 gestes, PER-10 déblocages, CRE-25 bulles prix.

### Sprint 6 — Mode Histoire (monde 1 complet) + Pod
- HIS-03 carte, HIS-05 compteur prix, HIS-07 zones co-op (avec MUL-08), HIS-09 ambiances, HUD-06 Pod.
- Création de 2 nouveaux niveaux du monde 1 avec l'éditeur.

### Sprint 7 — Jeu local et finitions
- MUL-09 multi-manettes local, MUL-04 attraper un joueur, MUL-11 création co-op, DAN-04 gaz, DAN-05 dangers commutables, CRE-17 treuil/moteur, CRE-21, CRE-23 objets perso, HUD-09 options.

### Après (Could)
- Mondes 2 et 3, boss (HIS-08), clés/défis (HIS-06), courses (HIS-10), forme libre (CRE-09), colle/gomme (CRE-12), dissolvant/explosifs (DAN-07), commentaires, photos, émotions à 3 niveaux, chat.

### Hors périmètre (Won't)
- Nage/eau (LBP2+), éditeur de musique interactive, matchmaking Internet public, tout asset Sony.
