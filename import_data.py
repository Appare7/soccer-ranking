import json, urllib.request, openpyxl, random, time as _time
from datetime import datetime

PROJECT_ID = "keio-soccer-ranking"
BASE_URL = f"https://firestore.googleapis.com/v1/projects/{PROJECT_ID}/databases/(default)/documents"

def api_call(url, method="GET", data=None):
    for attempt in range(3):
        try:
            if data:
                body = json.dumps(data).encode("utf-8")
                req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"}, method=method)
            else:
                req = urllib.request.Request(url, method=method)
            resp = urllib.request.urlopen(req)
            return json.loads(resp.read()) if method != "DELETE" else None
        except Exception as e:
            if attempt < 2:
                _time.sleep(2)
            else:
                raise e

def firestore_post(coll, fields_dict):
    fields = {}
    for k, v in fields_dict.items():
        if isinstance(v, str): fields[k] = {"stringValue": v}
        elif isinstance(v, (int, float)): fields[k] = {"doubleValue": v}
        elif isinstance(v, datetime): fields[k] = {"timestampValue": v.strftime("%Y-%m-%dT%H:%M:%SZ")}
    result = api_call(f"{BASE_URL}/{coll}", "POST", {"fields": fields})
    return result["name"].split("/")[-1]

def clear_collection(coll):
    try:
        result = api_call(f"{BASE_URL}/{coll}?pageSize=500")
        docs = result.get("documents", [])
        for i, doc in enumerate(docs):
            doc_id = doc["name"].split("/")[-1]
            api_call(f"{BASE_URL}/{coll}/{doc_id}", "DELETE")
            if i % 10 == 0: _time.sleep(0.5)
        print(f"  Cleared {coll}: {len(docs)} docs")
    except:
        print(f"  {coll}: empty or error")

print("=== Clearing existing data ===")
clear_collection("players")
_time.sleep(1)
clear_collection("records")
_time.sleep(1)

print("\n=== Reading Excel ===")
wb = openpyxl.load_workbook("/Users/taguchiappare/Downloads/スプリントデータ.xlsx")
ws = wb["0328"]

players_data = []
for row in ws.iter_rows(min_row=4, max_row=ws.max_row, values_only=True):
    grade, name, t20, t30 = row[0], row[1], row[2], row[3]
    if grade and name:
        players_data.append({"grade": str(grade), "name": str(name),
                             "time_20m": float(t20) if t20 else None,
                             "time_30m": float(t30) if t30 else None})

print(f"Found {len(players_data)} players")

print("\n=== Creating players ===")
player_ids = {}
for i, p in enumerate(players_data):
    doc_id = firestore_post("players", {"name": p["name"], "grade": p["grade"]})
    player_ids[p["name"]] = doc_id
    print(f"  {p['grade']} {p['name']}")
    if i % 5 == 4: _time.sleep(0.5)

_time.sleep(1)
print("\n=== Creating records (5 days: 3/24-3/28) ===")
for day in range(5):
    date = datetime(2026, 3, 24 + day, 10, 0, 0)
    days_before = 4 - day
    count = 0
    for i, p in enumerate(players_data):
        pid = player_ids[p["name"]]
        for typ, base_key in [("20m", "time_20m"), ("30m", "time_30m")]:
            base = p[base_key]
            if base is None: continue
            if days_before == 0:
                t = base
            else:
                slower = days_before * 0.03 + random.uniform(-0.02, 0.08)
                t = round(base + slower, 2)
            firestore_post("records", {
                "playerId": pid, "playerName": p["name"], "grade": p["grade"],
                "type": typ, "time": t, "date": date
            })
            count += 1
        if i % 5 == 4: _time.sleep(0.3)
    print(f"  {date.strftime('%m/%d')}: {count} records")
    _time.sleep(1)

print("\n=== DONE ===")
