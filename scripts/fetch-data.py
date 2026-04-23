#!/usr/bin/env python3
"""
fetch-data.py — FuelMapPrice

Télécharge le flux officiel "Prix des carburants en France — flux instantané"
depuis donnees.roulez-eco.fr, le parse, et produit deux fichiers JSON destinés
à être consommés par le front statique :

  - data/stations.json   liste compacte de toutes les stations + prix courants
  - data/history.json    moyennes nationales quotidiennes par carburant
                         (accumulé à chaque run — 6 mois roulants)

Exécuté automatiquement par GitHub Actions toutes les heures.
"""

from __future__ import annotations

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
STATIONS_FILE = OUT_DIR / "stations.json"
HISTORY_FILE  = OUT_DIR / "history.json"

FUELS = ("Gazole", "SP95", "SP98", "E10", "E85", "GPLc")
HISTORY_DAYS = 180        # 6 mois roulants
USER_AGENT = "FuelMapPrice/1.0 (+https://github.com)"


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
            with z.open(members[0]) as f:
                xml_bytes = f.read()
                print(f"       → Archive ZIP détectée, XML extrait ({len(xml_bytes):,} o).")
                return xml_bytes
    except zipfile.BadZipFile:
        print(f"       → XML brut détecté ({len(raw):,} o).")
        return raw


def parse_stations(xml_bytes: bytes) -> list[dict]:
    print("[2/4] Parsing XML…")
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

            if not prices:
                skipped += 1
                continue

            stations.append({
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
            })
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
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    try:
        xml_bytes = download_xml()
        stations  = parse_stations(xml_bytes)
        if not stations:
            print("ERREUR : aucune station exploitable dans le flux.", file=sys.stderr)
            return 2
        write_stations(stations)
        update_history(stations)
        print("OK — données actualisées.")
        return 0
    except Exception as e:
        print(f"ERREUR : {e}", file=sys.stderr)
        import traceback; traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
