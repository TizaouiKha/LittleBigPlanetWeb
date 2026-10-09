# LittleBigPlanetWeb

## Mode création (Popit)

**Tab** (ou **Select** à la manette) bascule entre jeu et création ; la physique est en pause pendant l'édition.
Réservé au solo : désactivé pendant une partie en ligne (les clients indexent les mêmes bulles / checkpoints / objets).

| Touche | Action |
| --- | --- |
| Clic gauche | outil courant : **P** placer, **G** déplacer, **X** supprimer, **C** dupliquer |
| Molette | taille (ou taille de l'objet saisi) · **Shift+molette** rotation · **Ctrl+molette** zoom |
| **R** / **F** | rotation +15° / −15° (pas de conflit avec ZQSD) |
| **1 / 2 / 3 / 4** | plan devant / milieu / fond / les trois · **0** plan du joueur |
| **M** / **N** | matériau suivant (carton, bois, métal, éponge, verre) / forme suivante |
| **T** | fixe / dynamique |
| ZQSD, flèches, clic droit | déplacer la vue |
| **Suppr** | effacer l'objet survolé · **Ctrl+Z** / **Ctrl+Y** annuler / rétablir · **Ctrl+S** sauver |

Les niveaux sont des JSON versionnés (`public/js/levelFormat.js`, format `littlebigweb-level`),
reconstruits par `public/js/levelBuilder.js`. Sauvegarde dans le navigateur (+ brouillon automatique),
export / import de fichier, « Nouveau » et « Niveau 1 » depuis le panneau Niveau.
