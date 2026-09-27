#!/usr/bin/env python3
"""Test automatisé de la difficulté de collecte des sources recensées.

Pour chaque source de data/sources.json ayant une `url_test`, le script :
  1. lit le robots.txt du domaine et vérifie que la page est autorisée ;
  2. télécharge une seule page (sans exécuter de JavaScript), en respectant un délai ;
  3. détecte les protections anti-robots (Cloudflare, captcha, 403/429/503) ;
  4. mesure les signaux de structure : prix en FCFA, surfaces en m², pièces/chambres,
     liens vers des fiches d'annonce, pagination, JSON-LD, données JSON embarquées ;
  5. calcule trois notes automatiques (accès, structure, volume) sur la même échelle
     0-2 que la grille documentaire du rapport.

Aucune donnée personnelle (téléphone, nom d'annonceur) n'est extraite ni stockée.

Usage :
    python3 scripts/test_collecte.py                 # sources de priorité 1
    python3 scripts/test_collecte.py --priorite 2    # priorités 1 et 2
    python3 scripts/test_collecte.py --ids P01 P11   # sources choisies
    python3 scripts/test_collecte.py --selftest      # test hors ligne du parseur
"""

import argparse
import csv
import datetime as dt
import json
import re
import sys
import time
import urllib.robotparser
from pathlib import Path
from urllib.parse import urljoin, urlparse

RACINE = Path(__file__).resolve().parent.parent
SOURCES = RACINE / "data" / "sources.json"
SORTIE = RACINE / "resultats"

USER_AGENT = "IPL-UEMOA-TestFaisabilite/0.1 (etude statistique; collecte minimale d'une page)"
TIMEOUT = 25

RE_PRIX = re.compile(
    r"\d{1,3}(?:[\s  .,]\d{3})+\s*(?:F\s?CFA|FCFA|XOF|CFA|F)\b"
    r"|\d{4,}\s*(?:F\s?CFA|FCFA|XOF|CFA)\b"
    r"|\d+(?:[.,]\d+)?\s*(?:millions?|M)\s*(?:de\s*)?(?:F\s?CFA|FCFA|XOF|CFA)",
    re.IGNORECASE,
)
RE_SURFACE = re.compile(r"\d+(?:[.,]\d+)?\s*m(?:²|2)(?![a-z])", re.IGNORECASE)
RE_PIECES = re.compile(r"\b\d+\s*(?:pi[eè]ces?|chambres?|ch\.|bedrooms?|quartos?)\b|\bF[1-9]\b", re.IGNORECASE)
RE_FICHE = re.compile(
    r"/(?:annonces?|offres?|property|properties|listing|listings|biens?|annonce-immobiliere[^/]*|"
    r"annonces-immobilieres|imoveis|details?)/[^\s\"'#?]{4,}",
    re.IGNORECASE,
)
RE_PAGINATION = re.compile(r"(?:[?&](?:page|p|pg)=\d+|/page/\d+)", re.IGNORECASE)
MARQUEURS_ANTIROBOT = (
    "just a moment", "attention required", "cf-challenge", "cf_chl", "captcha",
    "are you a robot", "access denied", "ddos-guard", "please enable javascript",
)
MARQUEURS_JSON = ("__NEXT_DATA__", "window.__NUXT__", "__INITIAL_STATE__", "__APOLLO_STATE__")


def lire_sources(priorite_max, ids):
    donnees = json.loads(SOURCES.read_text(encoding="utf-8"))
    choisies = []
    for s in donnees["sources"]:
        if not s.get("url_test"):
            continue
        if ids and s["id"] not in ids:
            continue
        if not ids and s["priorite"] > priorite_max:
            continue
        choisies.append(s)
    return choisies


def verifier_robots(session, url):
    """Retourne (autorise: bool|None, statut_robots: str, crawl_delay: float|None)."""
    parts = urlparse(url)
    url_robots = f"{parts.scheme}://{parts.netloc}/robots.txt"
    try:
        r = session.get(url_robots, timeout=TIMEOUT)
    except Exception as e:  # réseau indisponible, DNS, TLS...
        return None, f"erreur: {type(e).__name__}", None
    if r.status_code >= 400:
        return True, f"absent ({r.status_code})", None
    rp = urllib.robotparser.RobotFileParser()
    rp.parse(r.text.splitlines())
    delai = rp.crawl_delay(USER_AGENT) or rp.crawl_delay("*")
    return rp.can_fetch(USER_AGENT, url), "présent", delai


def analyser_html(html, url_base):
    """Mesure les signaux de structure dans le HTML brut (sans JavaScript)."""
    try:
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(html, "lxml") if _lxml_dispo() else BeautifulSoup(html, "html.parser")
        for balise in soup(["script", "style", "noscript"]):
            balise.extract()
        texte = soup.get_text(" ", strip=True)
        liens = [a.get("href", "") for a in soup.find_all("a")]
    except ImportError:
        texte = re.sub(r"<[^>]+>", " ", html)
        liens = re.findall(r'href=["\']([^"\']+)', html)

    hote = urlparse(url_base).netloc
    fiches = set()
    pagination = False
    for href in liens:
        absolu = urljoin(url_base, href)
        if urlparse(absolu).netloc != hote:
            continue
        chemin = urlparse(absolu).path + ("?" + urlparse(absolu).query if urlparse(absolu).query else "")
        if RE_FICHE.search(chemin):
            fiches.add(absolu.split("#")[0])
        if RE_PAGINATION.search(chemin):
            pagination = True

    bas = html.lower()
    return {
        "taille_texte": len(texte),
        "nb_prix": len(RE_PRIX.findall(texte)),
        "nb_surfaces": len(RE_SURFACE.findall(texte)),
        "nb_pieces": len(RE_PIECES.findall(texte)),
        "nb_liens_fiches": len(fiches),
        "pagination": pagination,
        "json_ld": "application/ld+json" in bas,
        "json_embarque": any(m.lower() in bas for m in MARQUEURS_JSON),
        "antirobot": any(m in bas for m in MARQUEURS_ANTIROBOT),
    }


def _lxml_dispo():
    try:
        import lxml  # noqa: F401
        return True
    except ImportError:
        return False


def noter(res):
    """Notes automatiques 0 (facile) à 2 (difficile), comme la grille du rapport.

    Une panne réseau côté poste de test (robots.txt injoignable) ne dit rien du
    site : aucune note n'est alors attribuée.
    """
    if res.get("robots_autorise") is None:
        return None, None, None
    if res.get("erreur") or res.get("robots_autorise") is False:
        acces = 2
    elif res["statut_http"] in (401, 403, 429, 503) or res["antirobot"]:
        acces = 2
    elif res["statut_http"] != 200 or (res["taille_texte"] < 1500 and res["json_embarque"]):
        acces = 1
    elif res["duree_s"] > 10:
        acces = 1
    else:
        acces = 0

    if acces == 2 and not res.get("nb_prix"):
        return acces, None, None
    if res["nb_prix"] >= 10 and (res["nb_surfaces"] >= 3 or res["nb_pieces"] >= 5):
        structure = 0
    elif res["nb_prix"] >= 3:
        structure = 1
    else:
        structure = 2

    if res["nb_liens_fiches"] >= 20 and res["pagination"]:
        volume = 0
    elif res["nb_liens_fiches"] >= 5:
        volume = 1
    else:
        volume = 2
    return acces, structure, volume


def tester(session, source, delai):
    url = source["url_test"]
    res = {
        "id": source["id"], "nom": source["nom"], "url_test": url,
        "horodatage": dt.datetime.now().isoformat(timespec="seconds"),
        "robots_autorise": None, "robots": "", "statut_http": None, "duree_s": None,
        "octets": None, "url_finale": "", "erreur": "",
        "taille_texte": 0, "nb_prix": 0, "nb_surfaces": 0, "nb_pieces": 0,
        "nb_liens_fiches": 0, "pagination": False, "json_ld": False,
        "json_embarque": False, "antirobot": False,
    }
    autorise, statut_robots, crawl_delay = verifier_robots(session, url)
    res["robots_autorise"], res["robots"] = autorise, statut_robots
    if autorise is False:
        res["erreur"] = "page interdite par robots.txt (non téléchargée)"
    elif autorise is None:
        res["erreur"] = statut_robots
    else:
        time.sleep(max(delai, crawl_delay or 0))
        debut = time.monotonic()
        try:
            r = session.get(url, timeout=TIMEOUT, allow_redirects=True)
            res["duree_s"] = round(time.monotonic() - debut, 2)
            res["statut_http"] = r.status_code
            res["octets"] = len(r.content)
            res["url_finale"] = r.url
            if "cf-ray" in {k.lower() for k in r.headers} and r.status_code in (403, 503):
                res["antirobot"] = True
            res.update({k: v for k, v in analyser_html(r.text, r.url).items() if not (k == "antirobot" and res["antirobot"])})
        except Exception as e:
            res["duree_s"] = round(time.monotonic() - debut, 2)
            res["erreur"] = f"{type(e).__name__}: {e}"[:200]
    a, s, v = noter(res)
    res["note_acces"], res["note_structure"], res["note_volume"] = a, s, v
    return res


def selftest():
    html = """<html><body>
      <div class="card"><a href="/annonce/appartements/appartement-f3-mermoz-123456">F3 Mermoz</a>
        <p>350 000 FCFA / mois - 3 pièces - 95 m²</p></div>
      <div class="card"><a href="/annonce/villas/villa-5-pieces-ouaga-2000-5702803">Villa</a>
        <p>75 500 000 F CFA - 5 chambres - 412 m2</p></div>
      <div><p>Prix : 1.200.000 XOF, 2 chambres</p><p>45 millions FCFA</p></div>
      <a href="?page=2">Suivant</a>
      <script type="application/ld+json">{}</script>
    </body></html>"""
    m = analyser_html(html, "https://exemple.test/categorie/immobilier")
    attendu = {"nb_prix": 4, "nb_surfaces": 2, "nb_liens_fiches": 2, "pagination": True, "json_ld": True}
    ok = all(m[k] == v for k, v in attendu.items()) and m["nb_pieces"] >= 4
    print(json.dumps(m, ensure_ascii=False, indent=2))
    print("SELFTEST", "OK" if ok else f"ÉCHEC (attendu {attendu})")
    return 0 if ok else 1


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--priorite", type=int, default=1, help="priorité maximale testée (1 à 3)")
    ap.add_argument("--ids", nargs="*", default=[], help="identifiants de sources (ex. P01 P11)")
    ap.add_argument("--delai", type=float, default=3.0, help="délai minimal entre requêtes (s)")
    ap.add_argument("--selftest", action="store_true", help="test hors ligne du parseur")
    args = ap.parse_args()

    if args.selftest:
        return selftest()

    import requests
    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT, "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.5"})

    sources = lire_sources(args.priorite, set(args.ids))
    if not sources:
        print("Aucune source à tester.", file=sys.stderr)
        return 1

    resultats = []
    for i, s in enumerate(sources, 1):
        print(f"[{i}/{len(sources)}] {s['id']} {s['nom']} ...", flush=True)
        r = tester(session, s, args.delai)
        print(f"    HTTP={r['statut_http']} robots={r['robots']} prix={r['nb_prix']} "
              f"fiches={r['nb_liens_fiches']} notes(A,S,V)=({r['note_acces']},{r['note_structure']},{r['note_volume']}) "
              f"{r['erreur']}")
        resultats.append(r)

    SORTIE.mkdir(exist_ok=True)
    horodatage = dt.datetime.now().strftime("%Y%m%d_%H%M")
    chemin_csv = SORTIE / f"test_collecte_{horodatage}.csv"
    with chemin_csv.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(resultats[0].keys()))
        w.writeheader()
        w.writerows(resultats)
    (SORTIE / f"test_collecte_{horodatage}.json").write_text(
        json.dumps(resultats, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nRésultats : {chemin_csv}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
