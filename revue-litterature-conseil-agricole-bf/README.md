# Revue de littérature — Conseil agricole et productivité céréalière au Burkina Faso

**Thème du mémoire :** *Effets hétérogènes de l'accès aux services de conseil agricole sur la productivité des exploitations céréalières au Burkina Faso : une estimation par double machine learning et forêts causales.*

## Contenu

| Élément | Description |
|---|---|
| [`Fiche_de_lecture_revue_de_litterature.docx`](Fiche_de_lecture_revue_de_litterature.docx) | **Fiche de lecture unique (Word)** qui recense les 50 documents. Pour chacun : titre, auteurs, année et revue, lien, accès, objectif, méthodologie (modèle et variables), résultats, et un paragraphe **« Résumé & importance pour le mémoire »**. Elle contient aussi un tableau récapitulatif, un sommaire et une synthèse transversale (dimensions d'hétérogénéité, lacune de recherche, variables et pièges d'estimation, plan du chapitre). |
| [`documents/`](documents/) | Emplacement des PDF en accès libre, rangés par niveau de pertinence (`niveau-1/`, `niveau-2/`, `niveau-3/`), avec la liste des liens. |
| [`scripts/telecharger_documents.py`](scripts/telecharger_documents.py) | Télécharge automatiquement les 31 documents en accès libre dans `documents/`. |
| [`bibliographie/references.bib`](bibliographie/references.bib) | Bibliographie BibTeX (clé = identifiant de fiche) pour Zotero, Mendeley ou LaTeX. |

## Classement par pertinence

- **Niveau 1 — Très pertinent (17 documents)** : études sur le Burkina Faso (conseil agricole, productivité, hétérogénéité) et articles fondateurs du DML et des forêts causales.
- **Niveau 2 — Pertinent (20 documents)** : évaluations de la vulgarisation en Afrique subsaharienne, hétérogénéité des rendements de l'adoption, applications du ML causal à l'agriculture.
- **Niveau 3 — Complémentaire (13 documents)** : revues de synthèse, compléments méthodologiques et logiciels, contexte des politiques agricoles au Burkina Faso.

La liste complète, avec les méthodes et les terrains, figure dans le tableau récapitulatif au début de la fiche Word.

## Récupérer les documents

```bash
python3 scripts/telecharger_documents.py          # tous les documents en accès libre
python3 scripts/telecharger_documents.py --liste  # voir la liste et les liens
```

## Remarques sur la méthode

- Les fiches ont été établies à partir des résumés, des pages des éditeurs et des index bibliographiques ; les DOI ont été vérifiés. Les points marqués **[à vérifier]** dans la fiche Word sont à confirmer à la lecture du texte intégral.
- Seuls des documents en accès libre légal sont proposés au téléchargement. Pour les articles payants, passez par la bibliothèque universitaire ou demandez le texte aux auteurs.
