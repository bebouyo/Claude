#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Télécharge les documents en accès libre de la revue de littérature.

Les PDF sont rangés par niveau de pertinence dans documents/niveau-1, -2, -3.
Seules des sources légales en accès libre sont listées (arXiv, dépôts
institutionnels, revues en accès ouvert, Banque mondiale, FAO, 3ie, NBER...).

Usage (depuis le dossier revue-litterature-conseil-agricole-bf/) :
    python3 scripts/telecharger_documents.py            # tout télécharger
    python3 scripts/telecharger_documents.py N1-13 N2-04  # certains documents
    python3 scripts/telecharger_documents.py --liste    # afficher la liste

Aucune dépendance externe (bibliothèque standard uniquement).
"""
import os
import sys
import time
import urllib.request

ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.dirname(ICI)

# (identifiant, niveau, nom court, [URL du PDF en accès libre])
DOCUMENTS = [
    ('N1-01', 1, 'Bindlish_Evenson_Gbetibouo_1993_TV_BurkinaFaso', ['https://documents1.worldbank.org/curated/en/789481468770350629/pdf/multi_page.pdf']),
    ('N1-04', 1, 'Bouguen_etal_2020_3ie_ISFM_BurkinaFaso', ['https://www.3ieimpact.org/sites/default/files/2020-07/IE123-TW4.1028-ISFM-Burkina-Faso.pdf']),
    ('N1-07', 1, 'Theriault_Smale_Haider_2017_WD', ['https://europepmc.org/articles/PMC5268358?pdf=render']),
    ('N1-10', 1, 'Bationo_Diallo_Topan_2025_FES', ['https://onlinelibrary.wiley.com/doi/pdfdirect/10.1002/fes3.70069']),
    ('N1-11', 1, 'Bationo_2025_Cogent_zones', ['https://www.tandfonline.com/doi/pdf/10.1080/23311932.2025.2570904']),
    ('N1-13', 1, 'Chernozhukov_etal_2018_DML', ['https://arxiv.org/pdf/1608.00060']),
    ('N1-14', 1, 'Wager_Athey_2018_CausalForest', ['https://arxiv.org/pdf/1510.04342']),
    ('N1-15', 1, 'Athey_Tibshirani_Wager_2019_GRF', ['https://arxiv.org/pdf/1610.01271']),
    ('N1-16', 1, 'Chernozhukov_Demirer_Duflo_FernandezVal_2025_GenericML', ['https://arxiv.org/pdf/1712.04802']),
    ('N1-17', 1, 'Knaus_2022_DML_evaluation', ['https://arxiv.org/pdf/2003.03191']),
    ('N2-01', 2, 'Dercon_etal_2009_AJAE_WP', ['https://ora.ox.ac.uk/objects/uuid:e524e444-5d47-466a-94ae-d97af5e64254/download_file?safe_filename=2007-01text.pdf&type_of_work=Working+paper']),
    ('N2-04', 2, 'DansoAbbeam_etal_2018_AFS', ['https://agricultureandfoodsecurity.biomedcentral.com/counter/pdf/10.1186/s40066-018-0225-x.pdf']),
    ('N2-06', 2, 'Ragasa_etal_2013_JAEE_WP49', ['https://essp.ifpri.info/files/2011/04/ESSP_WP49_GendDiffExtensionServices.pdf']),
    ('N2-11', 2, 'Aker_Jack_2021_NBER_HarvestingRain', ['https://www.nber.org/system/files/working_papers/w29518/w29518.pdf']),
    ('N2-12', 2, 'Deutschmann_etal_2025_JDE', ['https://research-management.mq.edu.au/ws/portalfiles/portal/427810550/427474013.pdf']),
    ('N2-14', 2, 'Addai_Temoso_Ngombe_2023_JAAE', ['https://www.cambridge.org/core/services/aop-cambridge-core/content/view/049E016A441934D815B1C9B06B02D62E/S1074070823000160a.pdf/heterogeneous_effects_of_agricultural_technology_adoption_on_smallholder_household_welfare_in_ghana.pdf']),
    ('N2-15', 2, 'Beaman_etal_2013_AER_Mali', ['https://poverty-action.org/sites/default/files/publications/profitability-fertilizer-experimental-evidence-female-rice-farmers-mali.pdf']),
    ('N2-17', 2, 'Deines_Wang_Lobell_2019_ERL', ['https://iopscience.iop.org/article/10.1088/1748-9326/ab503b/pdf']),
    ('N2-18', 2, 'Kakimoto_etal_2022_CEA_these', ['https://digitalcommons.unl.edu/cgi/viewcontent.cgi?article=1077&context=agecondiss']),
    ('N2-19', 2, 'Giannarakis_etal_2022_CVPRW', ['https://openaccess.thecvf.com/content/CVPR2022W/EarthVision/papers/Giannarakis_Towards_Assessing_Agricultural_Land_Suitability_With_Causal_Machine_Learning_CVPRW_2022_paper.pdf']),
    ('N2-20', 2, 'Nikiema_etal_2025_AFS', ['https://agricultureandfoodsecurity.biomedcentral.com/counter/pdf/10.1186/s40066-025-00572-x.pdf']),
    ('N3-02', 3, 'Anderson_Feder_2004_WBRO', ['https://documents1.worldbank.org/curated/en/473431468320670648/pdf/764750JRN0Agri0Box0374379B00PUBLIC0.pdf']),
    ('N3-03', 3, 'Waddington_etal_2014_Campbell_FFS', ['https://files.givewell.org/files/DWDA%202009/PAD/Waddington_et_al_2014.pdf']),
    ('N3-04', 3, 'Fabregas_Kremer_Schilbach_2019_Science', ['https://economics.mit.edu/sites/default/files/2022-09/agricultural-advice-science.pdf']),
    ('N3-07', 3, 'Athey_Imbens_2016_PNAS', ['https://arxiv.org/pdf/1504.01132']),
    ('N3-08', 3, 'Athey_Wager_2019_ObsStudies', ['https://arxiv.org/pdf/1902.07409']),
    ('N3-09', 3, 'Knaus_Lechner_Strittmatter_2021_EJ', ['https://arxiv.org/pdf/1810.13237']),
    ('N3-10', 3, 'Bach_etal_DoubleML', ['https://www.jstatsoft.org/article/download/v108i03/4527', 'https://jmlr.org/papers/volume23/21-0862/21-0862.pdf']),
    ('N3-11', 3, 'Rehill_2025_ISR', ['https://arxiv.org/pdf/2404.13356']),
    ('N3-12', 3, 'Lechner_2023_SJES', ['https://sjes.springeropen.com/counter/pdf/10.1186/s41937-023-00113-y.pdf']),
    ('N3-13', 3, 'FAO_2020_PolicyBrief28_BurkinaFaso', ['https://www.fao.org/3/cb0917en/CB0917EN.pdf']),
]

ENTETES = {"User-Agent": "Mozilla/5.0 (revue-litterature; usage academique)"}


def telecharger(url, cible):
    req = urllib.request.Request(url, headers=ENTETES)
    with urllib.request.urlopen(req, timeout=60) as rep:
        contenu = rep.read()
    if not contenu.startswith(b"%PDF"):
        raise ValueError("la réponse n'est pas un PDF (page HTML, captcha ou accès refusé)")
    with open(cible, "wb") as f:
        f.write(contenu)
    return len(contenu)


def main(args):
    if "--liste" in args:
        for ident, niveau, nom, urls in DOCUMENTS:
            print(f"{ident}  niveau {niveau}  {nom}")
            for u in urls:
                print(f"        {u}")
        return 0
    choix = set(a.upper() for a in args if not a.startswith("-"))
    echecs = []
    for ident, niveau, nom, urls in DOCUMENTS:
        if choix and ident not in choix:
            continue
        dossier = os.path.join(RACINE, "documents", f"niveau-{niveau}")
        os.makedirs(dossier, exist_ok=True)
        for k, url in enumerate(urls):
            suffixe = f"_{k + 1}" if len(urls) > 1 else ""
            cible = os.path.join(dossier, f"{ident}_{nom}{suffixe}.pdf")
            if os.path.exists(cible):
                print(f"[déjà là] {ident} -> {os.path.relpath(cible, RACINE)}")
                continue
            try:
                taille = telecharger(url, cible)
                print(f"[ok]      {ident} -> {os.path.relpath(cible, RACINE)} ({taille // 1024} Ko)")
            except Exception as e:  # noqa: BLE001
                print(f"[échec]   {ident} : {e}\n          à télécharger à la main : {url}")
                echecs.append((ident, url))
            time.sleep(1)
    if echecs:
        print(f"\n{len(echecs)} document(s) à récupérer manuellement (lien ci-dessus).")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
