# Indice des prix du logement dans l'UEMOA à partir de données en ligne

Phase 1 : recensement des sources et test de la difficulté de collecte. L'indice n'est pas calculé à ce stade.

## Contenu

| Chemin | Rôle |
|---|---|
| `rapport/Rapport_IPL_UEMOA_Phase1_Sources.docx` | Rapport Word : synthèse, panorama des sources, grille et résultats de difficulté, obstacles, recommandations, liste complète des liens (annexe A) |
| `data/sources.json` | Inventaire maître : 76 sources, 139 liens, notes de difficulté, priorités |
| `data/sources.csv` | Même inventaire, une ligne par lien (séparateur `;`, UTF-8), à ouvrir dans Excel |
| `scripts/test_collecte.py` | Test automatisé de collecte (robots.txt, HTTP, anti-robots, prix, surfaces, fiches, pagination) |
| `scripts/build_rapport.js` | Régénère le rapport et le CSV à partir de `data/sources.json` |

## Lancer le test de collecte

Depuis un poste ayant accès à Internet :

```bash
pip install requests beautifulsoup4 lxml
python3 scripts/test_collecte.py --selftest     # vérifie le parseur hors ligne
python3 scripts/test_collecte.py --priorite 2   # teste les sources de priorités 1 et 2
```

Les résultats sont écrits dans `resultats/`. Le script ne télécharge qu'une page par source, respecte le robots.txt et un délai entre requêtes, et ne collecte aucune donnée personnelle.

## Régénérer le rapport

```bash
cd scripts && npm install && node build_rapport.js
```
