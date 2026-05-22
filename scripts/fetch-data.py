#!/usr/bin/env python3
"""
fetch-data.py — FuelMapPrice

Télécharge le flux officiel "Prix des carburants en France — flux instantané"
depuis donnees.roulez-eco.fr, le parse, et produit trois fichiers JSON destinés
à être consommés par le front statique :

  - data/stations.json    liste compacte de toutes les stations + prix courants
  - data/history.json     moyennes nationales quotidiennes par carburant
                          (accumulé à chaque run — 6 mois roulants)
  - data/oil-prices.json  cours Brent / WTI (6 mois roulants, source EIA/datahub.io)

Exécuté automatiquement par GitHub Actions toutes les heures.
"""

from __future__ import annotations

import csv
import io
import json
import sys
import zipfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.request import Request, urlopen
from xml.etree import ElementTree as ET

# ---------------------------------------------------------------------------

DATA_URL = "https://donnees.roulez-eco.fr/opendata/instantane"
OUT_DIR = Path(__file__).resolve().parent.parent / "data"
STATIONS_FILE   = OUT_DIR / "stations.json"
HISTORY_FILE    = OUT_DIR / "history.json"
OIL_PRICES_FILE = OUT_DIR / "oil-prices.json"

FUELS = ("Gazole", "SP95", "SP98", "E10", "E85", "GPLc")
HISTORY_DAYS = 180        # 6 mois roulants
USER_AGENT = "FuelMapPrice/1.0 (+https://github.com)"

# Seuil plancher de plausibilité : le flux compte historiquement
# ~10 000-11 000 stations. En dessous, on suspecte un XML tronqué ou
# corrompu et on refuse d'écraser le JSON existant — qui restera
# affiché par l'app jusqu'au prochain run réussi.
MIN_PLAUSIBLE_STATIONS = 5000

# Plafond de taille du XML interne d'une archive ZIP — défense contre
# les zip bombs (quelques Ko qui décompressent en plusieurs Go et
# saturent le runner). Le flux légitime pèse ~50 Mo.
MAX_XML_SIZE = 200 * 1024 * 1024  # 200 Mo

# Bornes de plausibilité des cours du pétrole — défense contre des
# valeurs aberrantes injectées dans le CSV upstream (datasets/oil-prices).
MIN_OIL_PRICE = 1.0       # USD/baril ; un cours sous 1 $ est invraisemblable
MAX_OIL_PRICE = 500.0     # le pic historique (2008) plafonnait à ~147 $

# Cours du pétrole (CSV publics, source EIA via datahub.io / GitHub datasets)
BRENT_CSV_URL = "https://raw.githubusercontent.com/datasets/oil-prices/main/data/brent-daily.csv"
WTI_CSV_URL   = "https://raw.githubusercontent.com/datasets/oil-prices/main/data/wti-daily.csv"


# ---------------------------------------------------------------------------
# Téléchargement + parsing XML
# ---------------------------------------------------------------------------

def download_xml() -> bytes:
    print(f"[1/4] Téléchargement du flux : {DATA_URL}")
    req = Request(DATA_URL, headers={"User-Agent": USER_AGENT})
    with urlopen(req, timeout=60) as r:
        raw = r.read()

    # Le flux est parfois servi en ZIP, parfois directement en XML.
    # On tente le ZIP d'abord, puis on retombe sur le XML brut.
    try:
        with zipfile.ZipFile(io.BytesIO(raw)) as z:
            members = [n for n in z.namelist() if n.lower().endswith(".xml")]
            if not members:
                raise RuntimeError("ZIP reçu mais aucun XML à l'intérieur.")
            # Lecture de la taille déclarée avant extraction : un ZIP qui
            # déclare 10 Go nous épargne d'allouer la mémoire pour le savoir.
            info = z.getinfo(members[0])
            if info.file_size > MAX_XML_SIZE:
                raise RuntimeError(
                    f"XML interne trop grand : {info.file_size:,} o "
                    f"(plafond {MAX_XML_SIZE:,} o — protection zip bomb)."
                )
            with z.open(members[0]) as f:
                xml_bytes = f.read()
                print(f"       → Archive ZIP détectée, XML extrait ({len(xml_bytes):,} o).")
                return xml_bytes
    except zipfile.BadZipFile:
        print(f"       → XML brut détecté ({len(raw):,} o).")
        return raw


def parse_stations(xml_bytes: bytes) -> list[dict]:
    print("[2/4] Parsing XML…")

    # Défense en profondeur contre XXE / billion laughs : le parseur stdlib
    # xml.etree.ElementTree reste vulnérable aux entités externes et aux
    # bombes d'entités. La source data.gouv.fr est de confiance, mais on
    # refuse toute déclaration DOCTYPE / ENTITY dans l'en-tête du flux.
    header = xml_bytes[:4096]
    if b'<!DOCTYPE' in header or b'<!ENTITY' in header:
        raise RuntimeError("XML refusé : DOCTYPE/ENTITY détecté (risque XXE).")

    # Les XML publiés sont parfois en ISO-8859-1 ; ElementTree gère via l'en-tête.
    root = ET.fromstring(xml_bytes)

    stations: list[dict] = []
    skipped = 0

    for pdv in root.findall("pdv"):
        try:
            lat_raw = pdv.get("latitude")
            lon_raw = pdv.get("longitude")
            if not lat_raw or not lon_raw:
                skipped += 1
                continue
            # Les coordonnées sont en 1/100000e de degré.
            lat = float(lat_raw) / 100000.0
            lon = float(lon_raw) / 100000.0
            # Les coordonnées "0" signifient station absente de la carto.
            if lat == 0.0 and lon == 0.0:
                skipped += 1
                continue

            station_id = pdv.get("id")
            cp = (pdv.get("cp") or "").strip()
            address_el = pdv.find("adresse")
            city_el    = pdv.find("ville")
            name_el    = pdv.find("marque")  # parfois absent

            address = (address_el.text or "").strip() if address_el is not None else ""
            city    = (city_el.text or "").strip()    if city_el    is not None else ""
            name    = (name_el.text or "").strip()    if name_el    is not None else ""

            prices: dict[str, float] = {}
            updated_at: dict[str, str] = {}
            latest_maj: str | None = None

            for prix in pdv.findall("prix"):
                fuel = prix.get("nom")
                val  = prix.get("valeur")
                maj  = prix.get("maj")
                if fuel not in FUELS or not val:
                    continue
                try:
                    prices[fuel] = round(float(val), 3)
                except ValueError:
                    continue
                if maj:
                    updated_at[fuel] = maj
                    if latest_maj is None or maj > latest_maj:
                        latest_maj = maj

            # Ruptures : carburants signalés en rupture de stock
            ruptures: list[str] = []
            for rupt in pdv.findall("rupture"):
                fuel_rupt = rupt.get("nom")
                if fuel_rupt and fuel_rupt in FUELS:
                    ruptures.append(fuel_rupt)

            if not prices:
                skipped += 1
                continue

            entry: dict = {
                "id":      station_id,
                "name":    name,
                "address": address,
                "city":    city,
                "cp":      cp,
                "lat":     round(lat, 6),
                "lon":     round(lon, 6),
                "prices":  prices,
                "updated_at":        updated_at,
                "updated_at_global": latest_maj,
            }
            if ruptures:
                entry["ruptures"] = ruptures

            stations.append(entry)
        except Exception as e:
            skipped += 1
            print(f"       ! station ignorée : {e}")

    print(f"       → {len(stations):,} stations valides, {skipped:,} ignorées.")
    return stations


# ---------------------------------------------------------------------------
# Fichiers de sortie
# ---------------------------------------------------------------------------

def write_stations(stations: list[dict]) -> None:
    print(f"[3/4] Écriture de {STATIONS_FILE.relative_to(STATIONS_FILE.parent.parent)}…")
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source":       DATA_URL,
        "count":        len(stations),
        "fuels":        list(FUELS),
        "stations":     stations,
    }
    STATIONS_FILE.parent.mkdir(parents=True, exist_ok=True)
    with STATIONS_FILE.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
    size_kb = STATIONS_FILE.stat().st_size / 1024
    print(f"       → {size_kb:,.0f} Ko écrits.")


def update_history(stations: list[dict]) -> None:
    """
    Agrège les prix du jour (moyennes nationales par carburant) et les ajoute
    à l'historique. Conserve uniquement les HISTORY_DAYS derniers jours.
    """
    print(f"[4/4] Mise à jour de {HISTORY_FILE.relative_to(HISTORY_FILE.parent.parent)}…")

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    averages: dict[str, float] = {}
    for fuel in FUELS:
        vals = [s["prices"][fuel] for s in stations if fuel in s.get("prices", {})]
        if vals:
            averages[fuel] = round(sum(vals) / len(vals), 4)

    # Charge l'historique existant si présent
    if HISTORY_FILE.exists():
        try:
            with HISTORY_FILE.open("r", encoding="utf-8") as f:
                history = json.load(f)
        except Exception:
            history = {"days": []}
    else:
        history = {"days": []}

    days = history.get("days", [])
    # Remplace l'entrée du jour si elle existe, sinon ajoute
    days = [d for d in days if d.get("date") != today]
    days.append({"date": today, "avg": averages, "n": len(stations)})

    # Tronque à HISTORY_DAYS derniers jours
    cutoff = (datetime.now(timezone.utc) - timedelta(days=HISTORY_DAYS)).strftime("%Y-%m-%d")
    days = [d for d in days if d["date"] >= cutoff]
    days.sort(key=lambda d: d["date"])

    history = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "days": days,
    }

    with HISTORY_FILE.open("w", encoding="utf-8") as f:
        json.dump(history, f, ensure_ascii=False, separators=(",", ":"))
    print(f"       → {len(days)} jour(s) d'historique conservé(s) ; moyennes du jour : "
          + ", ".join(f"{k}={v:.3f}" for k, v in averages.items()))


# ---------------------------------------------------------------------------
# Cours du pétrole (Brent / WTI)
# ---------------------------------------------------------------------------

def fetch_oil_csv(url: str) -> dict[str, float]:
    """Télécharge un CSV date,price et retourne {date: price}."""
    req = Request(url, headers={"User-Agent": USER_AGENT})
    with urlopen(req, timeout=30) as r:
        text = r.read().decode("utf-8")
    reader = csv.DictReader(io.StringIO(text))
    today_iso = datetime.now(timezone.utc).date().isoformat()
    prices: dict[str, float] = {}
    skipped = 0
    for row in reader:
        date = row.get("Date") or row.get("date") or ""
        val  = row.get("Price") or row.get("price") or ""
        if not (date and val):
            continue
        try:
            price = float(val)
        except ValueError:
            skipped += 1
            continue
        # Garde-fous : NaN, négatifs, plafond historique, dates futures.
        if not (MIN_OIL_PRICE <= price <= MAX_OIL_PRICE):
            skipped += 1
            continue
        if date > today_iso:
            skipped += 1
            continue
        prices[date] = round(price, 2)
    if skipped:
        print(f"       ! {skipped} ligne(s) de cours ignorée(s) (plages invalides).")
    return prices


def update_oil_prices() -> None:
    """Fusionne les cours Brent + WTI en un seul JSON (6 mois roulants)."""
    print("[5/5] Cours du pétrole (Brent + WTI)…")
    cutoff = (datetime.now(timezone.utc) - timedelta(days=HISTORY_DAYS)).strftime("%Y-%m-%d")

    try:
        brent = fetch_oil_csv(BRENT_CSV_URL)
        wti   = fetch_oil_csv(WTI_CSV_URL)
    except Exception as e:
        print(f"       ! Impossible de récupérer les cours du pétrole : {e}")
        return

    # Fusionner les dates
    all_dates = sorted(set(list(brent.keys()) + list(wti.keys())))
    # Filtrer les 6 derniers mois
    all_dates = [d for d in all_dates if d >= cutoff]

    days = []
    for d in all_dates:
        entry: dict = {"date": d}
        if d in brent:
            entry["brent"] = brent[d]
        if d in wti:
            entry["wti"] = wti[d]
        days.append(entry)

    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": "EIA via datahub.io",
        "days": days,
    }

    OIL_PRICES_FILE.parent.mkdir(parents=True, exist_ok=True)
    with OIL_PRICES_FILE.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))

    print(f"       → {len(days)} jours de cours enregistrés.")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    try:
        xml_bytes = download_xml()
        stations  = parse_stations(xml_bytes)
        if not stations:
            print("ERREUR : aucune station exploitable dans le flux.", file=sys.stderr)
            return 2
        if len(stations) < MIN_PLAUSIBLE_STATIONS:
            # Garde-fou : on préfère conserver les dernières données valides
            # plutôt que d'écraser le JSON avec un échantillon partiel.
            print(
                f"ERREUR : {len(stations)} stations seulement "
                f"(seuil min {MIN_PLAUSIBLE_STATIONS}). Abandon, JSON existant préservé.",
                file=sys.stderr,
            )
            return 3
        write_stations(stations)
        update_history(stations)

        # Cours du pétrole (non bloquant — l'appli marche sans)
        try:
            update_oil_prices()
        except Exception as e:
            print(f"       ! Cours du pétrole ignorés : {e}")

        print("OK — données actualisées.")
        return 0
    except Exception as e:
        print(f"ERREUR : {e}", file=sys.stderr)
        import traceback; traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
