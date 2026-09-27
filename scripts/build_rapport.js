// Génère le rapport Word (rapport/) et l'inventaire CSV (data/) à partir de data/sources.json.
// Usage : node scripts/build_rapport.js
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ShadingType,
  AlignmentType, HeadingLevel, PageOrientation, LevelFormat, ExternalHyperlink, TableOfContents,
  Header, Footer, PageNumber, BorderStyle, PageBreak, VerticalAlign,
} = require("docx");

const RACINE = path.resolve(__dirname, "..");
const data = JSON.parse(fs.readFileSync(path.join(RACINE, "data", "sources.json"), "utf8"));
const { meta, sources, exclues } = data;
const PAYS = meta.pays;
const ORDRE_PAYS = ["BEN", "BFA", "CIV", "GNB", "MLI", "NER", "SEN", "TGO"];
const CAT = meta.categories;

// ---------- utilitaires de notation ----------
const total = (s) => s.scores.reduce((a, b) => a + b, 0);
const niveau = (t) => (t <= 3 ? "Faible" : t <= 5 ? "Moyenne" : t <= 7 ? "Élevée" : "Très élevée");
const COULEUR_NIVEAU = { "Faible": "D9EAD3", "Moyenne": "FFF2CC", "Élevée": "FCE5CD", "Très élevée": "F4CCCC" };
const nomsPays = (codes) => codes.map((c) => PAYS[c] || c).join(", ");
const estMarche = (s) => ["A", "B", "C", "D", "G"].includes(s.categorie);

// ---------- styles de base ----------
const POLICE = "Calibri";
const BLEU = "1F3864";
const bordure = { style: BorderStyle.SINGLE, size: 4, color: "A6A6A6" };
const bordures = { top: bordure, bottom: bordure, left: bordure, right: bordure };
const marges = { top: 60, bottom: 60, left: 90, right: 90 };

function run(text, opts = {}) {
  return new TextRun({ text, font: POLICE, ...opts });
}
function p(text, opts = {}) {
  const children = Array.isArray(text) ? text : [run(text)];
  return new Paragraph({ children, spacing: { after: 120, line: 276 }, ...opts });
}
function h1(text) { return new Paragraph({ heading: HeadingLevel.HEADING_1, children: [run(text)] }); }
function h2(text) { return new Paragraph({ heading: HeadingLevel.HEADING_2, children: [run(text)] }); }
function puce(text, niveauPuce = 0) {
  const children = Array.isArray(text) ? text : [run(text)];
  return new Paragraph({ numbering: { reference: "puces", level: niveauPuce }, children, spacing: { after: 80, line: 264 } });
}
function num(text, ref = "numeros") {
  const children = Array.isArray(text) ? text : [run(text)];
  return new Paragraph({ numbering: { reference: ref, level: 0 }, children, spacing: { after: 80, line: 264 } });
}
function gras(text) { return run(text, { bold: true }); }
function lien(url, taille = 16) {
  return new ExternalHyperlink({ link: url, children: [run(url, { color: "0563C1", underline: {}, size: taille })] });
}

function cellule(contenu, largeur, opts = {}) {
  const { fond, grasTexte = false, taille = 18, align = AlignmentType.LEFT, couleur } = opts;
  let paragraphs;
  if (contenu instanceof Paragraph) paragraphs = [contenu];
  else if (Array.isArray(contenu) && contenu[0] instanceof Paragraph) paragraphs = contenu;
  else if (Array.isArray(contenu)) paragraphs = [new Paragraph({ alignment: align, children: contenu })];
  else paragraphs = [new Paragraph({ alignment: align, children: [run(String(contenu), { bold: grasTexte, size: taille, color: couleur })] })];
  return new TableCell({
    width: { size: largeur, type: WidthType.DXA },
    borders: bordures,
    margins: marges,
    verticalAlign: VerticalAlign.CENTER,
    shading: fond ? { fill: fond, type: ShadingType.CLEAR, color: "auto" } : undefined,
    children: paragraphs,
  });
}

function tableau(entetes, lignes, largeurs, opts = {}) {
  const tailleTexte = opts.taille || 18;
  const ligneEntete = new TableRow({
    tableHeader: true,
    children: entetes.map((e, i) => cellule(e, largeurs[i], { fond: BLEU, grasTexte: true, taille: tailleTexte, couleur: "FFFFFF" })),
  });
  const corps = lignes.map((l) => new TableRow({
    cantSplit: true,
    children: l.map((c, i) => {
      if (c && typeof c === "object" && c.__cellule) return cellule(c.contenu, largeurs[i], { taille: tailleTexte, ...c.opts });
      return cellule(c, largeurs[i], { taille: tailleTexte });
    }),
  }));
  return new Table({
    width: { size: largeurs.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    columnWidths: largeurs,
    rows: [ligneEntete, ...corps],
  });
}
const C = (contenu, opts = {}) => ({ __cellule: true, contenu, opts });

// ---------- calculs de synthèse ----------
const nbSources = sources.length;
const nbLiens = sources.reduce((a, s) => a + s.liens.length, 0);
const parCategorie = Object.keys(CAT).map((k) => [k, CAT[k], sources.filter((s) => s.categorie === k).length]);

function sourcesPays(code, prioMax = 2) {
  return sources.filter((s) => estMarche(s) && s.priorite <= prioMax && s.pays.includes(code));
}
const DIFF_PAYS = {
  BEN: ["Moyenne", "Afrilogement (plus de 2 700 annonces vérifiées) complète les plateformes régionales. Offre concentrée sur Cotonou, Abomey-Calavi et Porto-Novo."],
  BFA: ["Moyenne", "Offre concentrée à Ouagadougou (Ouaga 2000 surreprésenté). Le contexte sécuritaire peut réduire l'activité en dehors de la capitale."],
  CIV: ["Faible", "Offre dense et diversifiée. IvoireDomi publie un prix au m² mensuel par commune, utile pour valider un futur indice."],
  GNB: ["Très élevée", "Quasi-absence de portails structurés ; marché surtout sur les réseaux sociaux, en portugais. Niveaux de référence seulement via CAHF et Properstar."],
  MLI: ["Moyenne", "Se Loger au Mali (1 727 annonces à Bamako) et CoinAfrique suffisent pour Bamako ; presque rien en dehors."],
  NER: ["Élevée", "Niger Immobilier et CoinAfrique fournissent un volume faible, centré sur Niamey."],
  SEN: ["Faible", "Offre la plus riche de la zone, avec des variables structurées. Deux sources (SamaGallé, Keur-Immo) publient déjà des médianes, ce qui facilite la validation. Biais vers Dakar et le haut de gamme."],
  TGO: ["Moyenne", "Nombreux petits sites d'agences ; volume utile surtout via CoinAfrique et Keur-Immo (environ 370 biens)."],
};

// ---------- contenu ----------
const enfants = [];

// Page de titre
enfants.push(
  new Paragraph({ spacing: { before: 2400, after: 240 }, alignment: AlignmentType.CENTER,
    children: [run("INDICE DES PRIX DU LOGEMENT DANS L'UEMOA À PARTIR DE DONNÉES EN LIGNE", { bold: true, size: 36, color: BLEU })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 480 },
    children: [run("Phase 1 : recensement des sources et test de la difficulté de collecte", { size: 28, color: "404040" })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 },
    children: [run("Bénin · Burkina Faso · Côte d'Ivoire · Guinée-Bissau · Mali · Niger · Sénégal · Togo", { size: 22 })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 1600 },
    children: [run("L'indicateur n'est pas calculé à ce stade.", { italics: true, size: 22 })] }),
  new Paragraph({ alignment: AlignmentType.CENTER,
    children: [run(`Rapport établi le 27 septembre 2026 · ${nbSources} sources, ${nbLiens} liens recensés`, { size: 20, color: "595959" })] }),
  new Paragraph({ children: [new PageBreak()] }),
);

// Sommaire
enfants.push(
  new Paragraph({ children: [run("Sommaire", { bold: true, size: 28, color: BLEU })], spacing: { after: 200 } }),
  new TableOfContents("Sommaire", { hyperlink: true, headingStyleRange: "1-2" }),
  p([run("Si le sommaire apparaît vide, faites un clic droit dessus puis « Mettre à jour les champs ».", { italics: true, size: 18, color: "7F7F7F" })]),
  new Paragraph({ children: [new PageBreak()] }),
);

// 1. Synthèse
enfants.push(
  h1("1. Synthèse"),
  p(`Ce rapport ouvre les travaux sur un indice des prix du logement pour les huit États de l'UEMOA, construit à partir de données disponibles sur Internet. Conformément à la demande, il ne calcule pas l'indice : il recense les sources exploitables et évalue la difficulté de les collecter. ${nbSources} sources (${nbLiens} liens) ont été identifiées ; la liste complète figure en annexe A.`),
  puce([gras("Aucun indice officiel des prix de l'immobilier résidentiel "), run("n'est publié dans la zone, ni par la BCEAO ni par les instituts nationaux de statistique. Les seules références officielles régulières sont le sous-indice « loyers effectifs » des IHPC nationaux (mensuel) et les microdonnées de l'enquête EHCVM 2021-2022.")]),
  puce([gras("L'offre en ligne est très inégale. "), run("La collecte est jugée facile au Sénégal et en Côte d'Ivoire, de difficulté moyenne au Bénin, au Togo, au Burkina Faso et au Mali, difficile au Niger et très difficile en Guinée-Bissau.")]),
  puce([gras("Trois plateformes multi-pays forment un socle régional : "), run("CoinAfrique (7 pays), Keur-Immo (7 pays annoncés) et un réseau de portails au gabarit commun (5 pays, dont le Niger et le Mali). Chacune se collecte avec un seul programme, ce qui limite fortement le coût d'un dispositif à l'échelle de l'UEMOA.")]),
  puce([gras("Plusieurs sites publient déjà des prix médians "), run("(SamaGallé et Keur-Immo au Sénégal, IvoireDomi en Côte d'Ivoire). Ils serviront de points de contrôle et sont de bons candidats à des partenariats de données.")]),
  puce([gras("Obstacles principaux : "), run("les prix affichés sont des prix demandés et non des prix de transaction, la surface est souvent absente, la localisation reste imprécise, les doublons entre sites sont fréquents, l'offre en ligne est biaisée vers les capitales et le haut de gamme, et les conditions d'utilisation des sites encadrent la collecte.")]),
  puce([gras("Limite de cette phase : "), run("l'environnement d'exécution n'avait pas accès à Internet ; le test automatisé a été préparé mais n'a pas pu interroger les sites (section 4.5). Les notes de difficulté sont donc documentaires, établies à partir des pages indexées, de la structure des adresses, des volumes affichés et des outils existants. Elles sont à confirmer en lançant le script fourni.")]),
  puce([gras("Prochaine étape recommandée : "), run("un pilote de collecte hebdomadaire de 8 à 12 semaines à Dakar et Abidjan sur six sources prioritaires, pour mesurer les volumes, les taux de remplissage des variables et les doublons, avant tout choix de méthode d'indice.")]),
);

// 2. Objectif, périmètre, démarche
enfants.push(
  h1("2. Objectif, périmètre et démarche"),
  h2("2.1 Objectif"),
  p("Préparer la construction d'un indice des prix du logement (IPL) fondé sur des données en ligne, en commençant par deux questions : quelles sources existent, pays par pays, et à quel point leur collecte est-elle difficile ? Le calcul de l'indicateur est volontairement reporté à une phase ultérieure."),
  h2("2.2 Périmètre"),
  puce("Géographique : les huit États membres de l'UEMOA, avec attention aux capitales et aux grandes villes secondaires."),
  puce("Biens : logement résidentiel à la vente (appartements, maisons, villas), à la location, et terrains à bâtir, qui pèsent lourd dans l'offre en ligne."),
  puce("Sources : portails d'annonces, sites d'agences et de promoteurs, agrégateurs de prix, statistiques officielles, études institutionnelles et sources foncières accessibles en ligne."),
  h2("2.3 Démarche"),
  num("Recherches systématiques par pays et par type de source, en français, en anglais et en portugais (Guinée-Bissau), en septembre 2026."),
  num("Qualification de chaque source : pays couverts, type de biens, variables disponibles, volume indicatif, observations."),
  num("Notation de la difficulté de collecte sur cinq critères (grille ci-dessous) et attribution d'une priorité (1 = à collecter en premier, 3 = complément)."),
  num("Préparation d'un test automatisé (robots.txt, accès HTTP, détection anti-robots, présence des prix, des surfaces et des liens vers les fiches, pagination)."),
  h2("2.4 Grille d'évaluation de la difficulté"),
  p("Chaque critère est noté de 0 (facile) à 2 (difficile). La somme, sur 10, donne le niveau de difficulté : 0 à 3 Faible, 4 à 5 Moyenne, 6 à 7 Élevée, 8 à 10 Très élevée."),
  tableau(
    ["Critère", "0 - facile", "1 - moyen", "2 - difficile"],
    [
      [C("Accès technique (A)", { grasTexte: true }), "HTML statique, pages indexées", "Rendu JavaScript, lenteur, inscription", "Anti-robot, connexion obligatoire, anti-copie"],
      [C("Structure (S)", { grasTexte: true }), "Prix, surface, pièces, lieu dans des champs distincts", "Une partie dans le texte libre", "Texte libre ou PDF non tabulaire"],
      [C("Volume (V)", { grasTexte: true }), "Centaines/milliers d'annonces, ou série mensuelle", "Dizaines d'annonces, ou série annuelle", "Quelques annonces, ou donnée ponctuelle"],
      [C("Qualité (Q)", { grasTexte: true }), "Annonces vérifiées, source officielle", "Agences et particuliers mêlés", "Particuliers non modérés, doublons, prix absents"],
      [C("Cadre d'utilisation (C)", { grasTexte: true }), "Réutilisation ouverte ou API", "Conditions à vérifier", "Collecte interdite, paywall, licence payante"],
    ],
    [2000, 2546, 2546, 2546],
  ),
  h2("2.5 Limites"),
  p("Les notes reposent sur des éléments indirects : contenu indexé par les moteurs de recherche (qui montre que les prix sont servis en HTML), structure des adresses, volumes et statistiques affichés par les sites, existence d'outils de collecte tiers. Les critères Accès et Cadre d'utilisation sont les plus incertains : ils dépendent de protections et de conditions d'utilisation qui n'ont pas pu être lues directement. Les volumes cités sont ceux affichés par les sites en septembre 2026."),
);

// 3. Panorama
enfants.push(
  h1("3. Panorama des sources"),
  h2("3.1 Vue d'ensemble"),
  tableau(
    ["Catégorie", "Nombre de sources"],
    parCategorie.map(([k, lib, n]) => [`${k}. ${lib}`, C(String(n), { align: AlignmentType.CENTER })]),
    [7138, 2500],
  ),
  p(""),
  tableau(
    ["Pays", "Sources de marché (priorités 1-2)", "Principales sources"],
    ORDRE_PAYS.map((c) => {
      const l = sourcesPays(c);
      return [PAYS[c], C(String(l.length), { align: AlignmentType.CENTER }), l.map((s) => s.nom.replace(/ \(.*\)$/, "")).join(" ; ")];
    }),
    [1800, 1900, 5938],
  ),
  h2("3.2 Plateformes multi-pays"),
  p([gras("CoinAfrique "), run("est la plateforme de petites annonces la plus fournie de la zone, avec un sous-domaine par pays (sn, ci, bj, tg, bf, ml, ne) et le même gabarit partout. Les annonces apparaissent avec leur prix dans les résultats des moteurs de recherche, ce qui indique un contenu servi en HTML, et chaque fiche a une adresse stable avec un identifiant numérique. Principale faiblesse : ce sont surtout des particuliers qui publient, d'où des doublons et des prix parfois fantaisistes.")]),
  p([gras("Keur-Immo "), run("n'accepte que des agences vérifiées. Les données sont plus propres et mieux structurées (pièces, surface, quartier), et les pages de catégorie affichent déjà des statistiques (prix moyen, intervalle interquartile). Le volume est de quelques centaines d'annonces par grande ville au Sénégal et en Côte d'Ivoire, plus faible ailleurs, avec un biais vers le haut de gamme.")]),
  p([gras("Le réseau « Immobilier <pays> » "), run("regroupe cinq portails à l'arborescence identique : annonces-immobilieres-senegal.com, annonces-immobilieres-cote-ivoire.com, niger-immobilier.com, selogeraumali.com et burkina-faso-immobilier.com. Ils semblent avoir le même éditeur (à confirmer). Un seul collecteur couvrirait cinq pays, dont le Niger et le Mali où l'offre en ligne est rare ; Se Loger au Mali affiche à lui seul 1 727 annonces à Bamako.")]),
  p([gras("Afrimalin "), run("(Côte d'Ivoire, Burkina Faso, Bénin, Sénégal, Mali) et plusieurs portails internationaux (Expat.com, Agentiz, Realigro, Properstar) complètent l'offre, avec des volumes faibles.")]),
  h2("3.3 Sources nationales"),
  ...ORDRE_PAYS.map((c) => p([gras(`${PAYS[c]}. `), run(DIFF_PAYS[c][1])])),
  h2("3.4 Agrégateurs et observatoires privés"),
  puce([gras("SamaGallé (Sénégal) : "), run("médianes par zone et type, avec méthodologie publiée. Exemples : loyer médian d'un appartement à Dakar de 300 000 FCFA (1 578 annonces, août 2026), terrain à 133 333 FCFA/m² (381 annonces), villa à 85 millions FCFA (274 annonces).")]),
  puce([gras("IvoireDomi (Côte d'Ivoire) : "), run("prix au m² mensuel par ville et commune. Abidjan en septembre 2026 : appartements 275 054 FCFA/m², maisons 380 398 FCFA/m², terrains 250 373 FCFA/m².")]),
  puce([gras("Observatoire des prix de Sénégal Immobilier, Properstar, Numbeo, Global Property Guide : "), run("utiles comme contrôles de vraisemblance. Numbeo repose sur très peu de contributions (81 saisies à Abidjan, 54 à Dakar sur 18 mois).")]),
  h2("3.5 Sources officielles et institutionnelles"),
  puce([gras("IHPC nationaux (8 instituts) : "), run("méthodologie harmonisée UEMOA (nomenclature NCOA). Le sous-indice des loyers effectifs est la meilleure référence officielle pour valider un indice des loyers. Il est publié chaque mois, surtout en PDF.")]),
  puce([gras("BCEAO : "), run("rapports sur les prix, notes de conjoncture et base EDEN (séries mensuelles exportables : IHPC par pays, crédit, taux). Aucun indice immobilier publié.")]),
  puce([gras("EHCVM 2021-2022 : "), run("microdonnées harmonisées sur les huit pays (loyers payés, statut d'occupation, pièces, matériaux, équipements). C'est la base pour pondérer un futur indice et vérifier la représentativité des annonces en ligne. Accès sur inscription.")]),
  puce([gras("CAHF (Housing Finance in Africa Yearbook) : "), run("seule source annuelle comparable couvrant les huit pays (prix du logement neuf le moins cher, loyers typiques). Par exemple, 10,23 millions FCFA pour un logement de 50 m² en Guinée-Bissau.")]),
  puce([gras("CRRH-UEMOA, ONU-Habitat, Reall, études privées : "), run("contexte, déficit en logements (3,5 millions d'unités), partenariats possibles.")]),
  puce([gras("Sources foncières : "), run("barème DGID des terrains de l'État au Sénégal (prix administratifs de 2010) et ANDF / e-Foncier au Bénin (pas de prix de transaction publiés). Les données de transactions (domaines, notaires) ne sont pas en ligne et relèveraient de conventions.")]),
  h2("3.6 Sources écartées"),
  tableau(["Source", "Motif"], exclues.map((e) => [e.nom, e.motif]), [2600, 7038]),
);

// 4. Test de difficulté
const prio12 = sources.filter((s) => s.priorite <= 2).sort((a, b) => a.priorite - b.priorite || total(a) - total(b));
function tableauNotes(liste) {
  return tableau(
    ["ID", "Source", "Pays", "A", "S", "V", "Q", "C", "Total", "Difficulté", "Prio."],
    liste.map((s) => {
      const t = total(s); const n = niveau(t);
      return [s.id, s.nom, s.pays.includes("UEMOA") ? "UEMOA" : s.pays.join(", "),
        ...s.scores.map((x) => C(String(x), { align: AlignmentType.CENTER })),
        C(String(t), { align: AlignmentType.CENTER, grasTexte: true }),
        C(n, { fond: COULEUR_NIVEAU[n] }), C(String(s.priorite), { align: AlignmentType.CENTER })];
    }),
    [560, 3098, 1500, 380, 380, 380, 380, 380, 620, 1360, 600], { taille: 16 },
  );
}
enfants.push(
  h1("4. Test de la difficulté de collecte"),
  h2("4.1 Protocole"),
  p("Le test comporte deux volets. Le volet documentaire, réalisé ici, note chaque source sur la grille de la section 2.4. Le volet automatisé (script scripts/test_collecte.py) télécharge une seule page par source, sans exécuter de JavaScript et après lecture du robots.txt, puis mesure : code HTTP, temps de réponse, protections anti-robots, nombre de prix en FCFA, de surfaces et de pièces détectés, liens vers des fiches d'annonce, pagination, données structurées (JSON-LD). Il en déduit automatiquement les notes Accès, Structure et Volume."),
  h2("4.2 Résultats par source (priorités 1 et 2)"),
  p("A = accès, S = structure, V = volume, Q = qualité, C = cadre d'utilisation. Pays : BEN Bénin, BFA Burkina Faso, CIV Côte d'Ivoire, GNB Guinée-Bissau, MLI Mali, NER Niger, SEN Sénégal, TGO Togo. Les notes de toutes les sources, avec leurs observations, figurent en annexe B."),
  p([gras("Sources de marché (annonces, agrégateurs)")]),
  tableauNotes(prio12.filter(estMarche)),
  p(""),
  p([gras("Sources officielles et institutionnelles (validation, pondération, contexte)")]),
  tableauNotes(prio12.filter((s) => !estMarche(s))),
  h2("4.3 Difficulté par pays"),
  tableau(
    ["Pays", "Difficulté globale", "Appréciation"],
    ORDRE_PAYS.map((c) => [C(PAYS[c], { grasTexte: true }), C(DIFF_PAYS[c][0], { fond: COULEUR_NIVEAU[DIFF_PAYS[c][0]] }), DIFF_PAYS[c][1]]),
    [1700, 1600, 6338],
  ),
  h2("4.4 Principaux obstacles et parades"),
  tableau(
    ["Obstacle", "Effet sur un futur indice", "Parade envisagée"],
    [
      ["Prix affichés (demandés), non prix de transaction", "Niveau surestimé ; marge de négociation variable", "Suivre les évolutions plutôt que les niveaux ; étalonner avec CAHF et, par convention, des données de notaires ou des domaines ; mesurer les baisses de prix et la durée de vie des annonces"],
      ["Surface absente ou noyée dans le texte", "Pas de prix au m² ; effet qualité mal contrôlé", "Extraction par expressions régulières du titre et de la description ; stratification par nombre de pièces ; imputation"],
      ["Localisation imprécise (quartier en texte libre, orthographes multiples)", "Stratification géographique fragile", "Référentiel des quartiers par ville et table de correspondance des graphies"],
      ["Doublons (même bien chez plusieurs agences ou sur plusieurs sites, republications)", "Surpondération de certains biens", "Empreinte (type, prix, surface, quartier, pièces), comparaison d'images, identifiants propres à chaque site"],
      ["Mélange vente, location et courte durée ; prix par nuit ; prix en euros", "Séries contaminées", "Règles de classement ; conversion EUR/FCFA à la parité fixe de 655,957"],
      ["Prix fantaisistes ou absents (1 FCFA, « à débattre »)", "Valeurs aberrantes", "Filtres de plausibilité par type de bien et ville"],
      ["Représentativité : capitales, haut de gamme, marché formel", "Indice non représentatif du parc", "Pondération à partir de l'EHCVM ; publication d'abord par ville"],
      ["Instabilité des sites (fermeture de Jumia House, site compromis, refontes)", "Ruptures de série", "Au moins deux sources par pays ; surveillance automatique des collecteurs ; archivage des pages brutes"],
      ["Conditions d'utilisation, robots.txt, données personnelles", "Risque juridique et réputationnel", "Respect du robots.txt, délai entre requêtes, aucune collecte de nom ou de téléphone ; conventions avec les plateformes. Textes applicables notamment : loi sénégalaise n° 2008-12, loi ivoirienne n° 2013-450, Code du numérique béninois (loi n° 2017-20)"],
      ["Statistiques officielles en PDF", "Travail manuel à chaque publication", "Passer par BCEAO EDEN quand la série existe ; extraction semi-automatique des tableaux sinon"],
    ],
    [2600, 2400, 4638], { taille: 17 },
  ),
  h2("4.5 Résultat du test automatisé"),
  p("Le script a été exécuté le 27 septembre 2026 depuis l'environnement de travail. Toutes les requêtes ont été refusées par le proxy de sortie de cet environnement (erreur ProxyError sur robots.txt), avant d'atteindre les sites. Ce refus ne dit rien des sites eux-mêmes : le script ne leur attribue alors aucune note. L'auto-test hors ligne du parseur (détection des prix, surfaces, pièces, liens de fiches et pagination sur une page type) est concluant."),
  p([gras("Pour obtenir les résultats réels : "), run("lancer « python3 scripts/test_collecte.py --priorite 2 » depuis un poste ayant accès à Internet (voir annexe C). Les notes automatiques A, S et V remplaceront ou confirmeront les notes documentaires du tableau 4.2. Comptez environ 5 minutes pour les sources de priorités 1 et 2 avec un délai de 3 secondes entre requêtes.")]),
);

// 5. Recommandations
enfants.push(
  h1("5. Recommandations pour la suite"),
  num([gras("Confirmer les notes (1 jour). "), run("Exécuter le test automatisé sur les priorités 1 et 2 depuis un poste connecté, puis mettre à jour les tableaux 4.2 et 4.3.")], "reco"),
  num([gras("Ouvrir des discussions de partage de données "), run("avec SamaGallé, Keur-Immo, CoinAfrique, IvoireDomi et Expat-Dakar. Un flux ou une API négociés sont plus robustes et plus sûrs juridiquement qu'une collecte automatique.")], "reco"),
  num([gras("Lancer un pilote de collecte à Dakar et Abidjan "), run("(8 à 12 semaines, une collecte par semaine) sur CoinAfrique, Keur-Immo, le réseau « Immobilier <pays> », Expat-Dakar, SamaGallé et IvoireDomi, sans calculer d'indice. Objectifs : nouvelles annonces par semaine, par type et par ville ; taux de remplissage de la surface, des pièces et du quartier ; taux de doublons au sein d'un site et entre sites ; durée de vie des annonces ; dispersion des prix.")], "reco"),
  num([gras("Étendre aux autres capitales "), run("avec les trois collecteurs multi-pays, plus Afrilogement au Bénin. En Guinée-Bissau, prévoir un relevé manuel ou un partenariat avec les agences actives sur les réseaux sociaux.")], "reco"),
  num([gras("Constituer les référentiels : "), run("quartiers par ville, typologie des biens, séries IHPC des loyers (INS et BCEAO EDEN), extraction EHCVM des loyers et des caractéristiques des logements.")], "reco"),
  num([gras("Choisir ensuite la méthode d'indice "), run("(stratification, prix hédoniques ou ventes répétées) au vu des taux de remplissage observés pendant le pilote. Ce choix sort du périmètre de la présente phase.")], "reco"),
  h2("Variables minimales à collecter"),
  tableau(
    ["Variable", "Description", "Disponibilité observée"],
    [
      ["source, id_annonce, url", "Traçabilité et dédoublonnage", "Toujours"],
      ["date_collecte, date_publication", "Datation ; durée de vie de l'annonce", "Collecte : toujours ; publication : souvent (parfois relative)"],
      ["transaction", "Vente, location longue durée, courte durée", "Toujours (catégorie ou statut)"],
      ["type_bien", "Appartement, maison/villa, terrain, chambre, studio", "Toujours"],
      ["prix, devise, périodicité", "Montant ; FCFA ou EUR ; par mois ou par nuit", "Presque toujours ; « prix sur demande » parfois"],
      ["surface_habitable, surface_terrain", "m²", "Keur-Immo, Expat-Dakar, réseau P04 : souvent ; CoinAfrique : dans le texte"],
      ["pieces, chambres, salles_de_bain", "Taille du logement", "Souvent (titre ou champ)"],
      ["ville, quartier", "Localisation", "Toujours la ville ; quartier souvent, en texte libre"],
      ["meuble, standing, equipements", "Qualité du bien", "Variable"],
      ["type_annonceur", "Agence ou particulier (sans nom ni téléphone)", "Souvent"],
    ],
    [2700, 3400, 3538], { taille: 17 },
  ),
);

const sectionPortrait = {
  properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
  headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [run("IPL UEMOA - Phase 1 : sources et faisabilité de la collecte", { size: 16, color: "7F7F7F" })] })] }) },
  footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [run("Page ", { size: 16, color: "7F7F7F" }), new TextRun({ children: [PageNumber.CURRENT], size: 16, color: "7F7F7F", font: POLICE })] })] }) },
  children: enfants,
};

// ---------- Annexes (paysage) ----------
const annexes = [];
annexes.push(
  h1("Annexe A - Liste complète des sources et des liens"),
  p(`${nbSources} sources, ${nbLiens} liens. Catégories : ${Object.entries(CAT).map(([k, v]) => `${k} = ${v}`).join(" ; ")}.`),
);
const lignesA = [];
let n = 0;
for (const s of sources) {
  for (const l of s.liens) {
    n += 1;
    lignesA.push([String(n), s.id, s.nom, PAYS[l.pays] || l.pays, s.categorie, C([lien(l.url)])]);
  }
}
annexes.push(tableau(["N°", "ID", "Source", "Pays", "Cat.", "Lien"], lignesA, [560, 620, 3400, 1500, 560, 7930], { taille: 16 }));
annexes.push(
  p(""),
  p([gras("Sources écartées")]),
  tableau(["Source", "Lien", "Motif"], exclues.map((e) => [e.nom, C([lien(e.url)]), e.motif]), [2400, 6000, 6170], { taille: 16 }),
);

annexes.push(
  new Paragraph({ children: [new PageBreak()] }),
  h1("Annexe B - Fiches détaillées et notes de toutes les sources"),
  tableau(
    ["ID", "Source", "Pays", "Type / variables", "Volume indicatif", "A-S-V-Q-C", "Difficulté", "Observations"],
    sources.map((s) => {
      const t = total(s); const nv = niveau(t);
      return [s.id, `${s.nom} (${s.categorie}, prio. ${s.priorite})`, nomsPays(s.pays), `${s.type}. ${s.variables}`, s.volume,
        C(`${s.scores.join("-")} = ${t}`, { align: AlignmentType.CENTER }), C(nv, { fond: COULEUR_NIVEAU[nv] }), s.observations];
    }),
    [560, 1900, 1300, 2800, 2000, 1400, 1000, 3610], { taille: 15 },
  ),
);

annexes.push(
  new Paragraph({ children: [new PageBreak()] }),
  h1("Annexe C - Utilisation du script de test"),
  p("Prérequis : Python 3.9 ou plus, avec les paquets requests, beautifulsoup4 et lxml (pip install requests beautifulsoup4 lxml)."),
  tableau(
    ["Commande", "Effet"],
    [
      ["python3 scripts/test_collecte.py --selftest", "Vérifie le parseur hors ligne"],
      ["python3 scripts/test_collecte.py", "Teste les sources de priorité 1"],
      ["python3 scripts/test_collecte.py --priorite 2", "Teste les priorités 1 et 2"],
      ["python3 scripts/test_collecte.py --ids P01 P11 P12", "Teste des sources choisies"],
      ["--delai 5", "Allonge le délai entre requêtes (3 s par défaut ; le Crawl-delay du robots.txt est respecté)"],
    ],
    [6500, 8070], { taille: 17 },
  ),
  p(""),
  p("Les résultats sont écrits dans resultats/test_collecte_<date>.csv et .json, une ligne par source, avec : autorisation robots.txt, code HTTP, durée, taille, détection anti-robots, nombres de prix, de surfaces, de pièces et de liens de fiches, pagination, JSON-LD, données JSON embarquées, et notes automatiques A, S et V (0 à 2). Le script ne télécharge qu'une page par source, s'identifie par un User-Agent explicite et ne collecte aucune donnée personnelle."),
  p("Pour régénérer ce rapport et l'inventaire CSV après modification de data/sources.json : cd scripts && npm install && node build_rapport.js."),
);

const sectionPaysage = {
  properties: { page: { size: { width: 11906, height: 16838, orientation: PageOrientation.LANDSCAPE }, margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
  headers: sectionPortrait.headers,
  footers: sectionPortrait.footers,
  children: annexes,
};

const doc = new Document({
  creator: "Étude IPL UEMOA",
  title: "IPL UEMOA - Phase 1 : sources et faisabilité de la collecte",
  features: { updateFields: true },
  styles: {
    default: { document: { run: { font: POLICE, size: 21 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 30, bold: true, font: POLICE, color: BLEU }, paragraph: { spacing: { before: 360, after: 160 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 24, bold: true, font: POLICE, color: "2E5597" }, paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 1 } },
    ],
  },
  numbering: {
    config: [
      { reference: "puces", levels: [
        { level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 270 } } } },
        { level: 1, format: LevelFormat.BULLET, text: "–", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 1080, hanging: 270 } } } },
      ] },
      { reference: "numeros", levels: [
        { level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 360 } } } },
      ] },
      { reference: "reco", levels: [
        { level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 360 } } } },
      ] },
    ],
  },
  sections: [sectionPortrait, sectionPaysage],
});

// ---------- écriture ----------
const dossierRapport = path.join(RACINE, "rapport");
fs.mkdirSync(dossierRapport, { recursive: true });
const cheminDocx = path.join(dossierRapport, "Rapport_IPL_UEMOA_Phase1_Sources.docx");
Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(cheminDocx, buf);
  console.log("Rapport :", cheminDocx);
});

const csvEsc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const lignesCsv = [["id", "source", "categorie", "pays", "url", "type", "variables", "volume",
  "note_acces", "note_structure", "note_volume", "note_qualite", "note_cadre", "total", "difficulte", "priorite", "observations"]];
for (const s of sources) {
  for (const l of s.liens) {
    lignesCsv.push([s.id, s.nom, CAT[s.categorie], PAYS[l.pays] || l.pays, l.url, s.type, s.variables, s.volume,
      ...s.scores, total(s), niveau(total(s)), s.priorite, s.observations]);
  }
}
const cheminCsv = path.join(RACINE, "data", "sources.csv");
fs.writeFileSync(cheminCsv, "﻿" + lignesCsv.map((l) => l.map(csvEsc).join(";")).join("\n") + "\n");
console.log("Inventaire CSV :", cheminCsv, `(${lignesCsv.length - 1} liens)`);
