"""Migrate Firebase data to Google Sheets via Apps Script API."""
import json
import urllib.request
import urllib.parse

API_URL = "https://script.google.com/macros/s/AKfycbzf7SWtfdn1IHaxeF_zYy8Ktqc5z-9evmTVGvaMvCJvumECd2thL93_jTfedo32V7nsiw/exec"

# Firebase data exported - players and records
# We'll read from Firebase using the REST API
FIREBASE_PROJECT = "keio-soccer-ranking"
FIRESTORE_URL = f"https://firestore.googleapis.com/v1/projects/{FIREBASE_PROJECT}/databases/(default)/documents"

def get_firestore_docs(collection_name):
    """Get all documents from a Firestore collection."""
    url = f"{FIRESTORE_URL}/{collection_name}?pageSize=500"
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read())
    return data.get("documents", [])

def parse_firestore_value(val):
    """Parse a Firestore value object."""
    if "stringValue" in val:
        return val["stringValue"]
    if "doubleValue" in val:
        return val["doubleValue"]
    if "integerValue" in val:
        return int(val["integerValue"])
    if "timestampValue" in val:
        return val["timestampValue"]
    return None

def api_post(action, body):
    """Post to Apps Script API."""
    url = API_URL + "?" + urllib.parse.urlencode({"action": action})
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="POST")
    req.add_header("Content-Type", "text/plain")
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read())

def main():
    print("=== Fetching players from Firebase ===")
    player_docs = get_firestore_docs("players")
    players = {}
    for doc in player_docs:
        fields = doc.get("fields", {})
        doc_id = doc["name"].split("/")[-1]
        name = parse_firestore_value(fields.get("name", {}))
        grade = parse_firestore_value(fields.get("grade", {})) or ""
        if name:
            players[doc_id] = {"name": name, "grade": grade}
    print(f"Found {len(players)} players")

    print("\n=== Fetching records from Firebase ===")
    record_docs = get_firestore_docs("records")

    # Group records by type and date
    # Structure: { "20m": { "2026-03-28": { "田中": 3.45, ... }, ... }, ... }
    records_by_type = {"20m": {}, "30m": {}}

    for doc in record_docs:
        fields = doc.get("fields", {})
        rec_type = parse_firestore_value(fields.get("type", {}))
        player_name = parse_firestore_value(fields.get("playerName", {}))
        time_val = parse_firestore_value(fields.get("time", {}))
        date_val = parse_firestore_value(fields.get("date", {}))
        grade = parse_firestore_value(fields.get("grade", {})) or ""

        if not rec_type or not player_name or time_val is None:
            continue

        # Map old type names
        if rec_type == "20m_obstacle":
            rec_type = "30m"

        if rec_type not in records_by_type:
            continue

        # Parse date to YYYY-MM-DD
        if date_val and "T" in str(date_val):
            date_str = str(date_val).split("T")[0]
        else:
            date_str = str(date_val)

        if date_str not in records_by_type[rec_type]:
            records_by_type[rec_type][date_str] = {}

        # Store player info
        records_by_type[rec_type][date_str][player_name] = {
            "time": float(time_val),
            "grade": grade,
        }

    print(f"Found records for types: {list(records_by_type.keys())}")
    for t, dates in records_by_type.items():
        total = sum(len(v) for v in dates.values())
        print(f"  {t}: {len(dates)} dates, {total} records")

    # First, add all players
    print("\n=== Adding players to Sheets ===")
    all_player_names = set()
    all_player_info = {}
    for pid, pdata in players.items():
        all_player_names.add(pdata["name"])
        all_player_info[pdata["name"]] = pdata["grade"]

    # Also collect player names from records
    for t, dates in records_by_type.items():
        for date_str, player_records in dates.items():
            for pname, pdata in player_records.items():
                all_player_names.add(pname)
                if pname not in all_player_info:
                    all_player_info[pname] = pdata.get("grade", "")

    for pname in sorted(all_player_names):
        grade = all_player_info.get(pname, "")
        result = api_post("addPlayer", {"name": pname, "grade": grade})
        print(f"  Added player: {pname} ({grade}) -> {result}")

    # Add records by date
    print("\n=== Adding records to Sheets ===")
    for rec_type, dates in records_by_type.items():
        for date_str in sorted(dates.keys()):
            player_records = dates[date_str]
            entries = []
            for pname, pdata in player_records.items():
                entries.append({
                    "name": pname,
                    "grade": pdata.get("grade", ""),
                    "time": pdata["time"],
                })

            if entries:
                result = api_post("addRecords", {
                    "type": rec_type,
                    "date": date_str,
                    "entries": entries,
                })
                print(f"  {rec_type} / {date_str}: {len(entries)} records -> {result}")

    print("\n=== Migration complete! ===")

if __name__ == "__main__":
    main()
