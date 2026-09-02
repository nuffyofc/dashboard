"""
analyze_tickets.py — GameArt ticket categorization validator

Runs the rules.js category patterns against an xlsx or csv export
and prints per-category counts + uncategorized sample.

Usage:
    python scripts/analyze_tickets.py augfinal.json
    python scripts/analyze_tickets.py all-tickets-view-2026-09-02-1349.csv

Supply the path as first argument. JSON files are loaded directly;
CSV files are read with the 'Subject' column used as the title field.
For XLSX you first run extract_xlsx.py to produce a JSON, then pass that here.
"""
import json, csv, re, sys, os

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

# ---------------------------------------------------------------------------
# Pattern table — mirrors rules.js RULES array.
# Keep in sync when you update rules.js.
# ---------------------------------------------------------------------------
RULES = {
    "Player Block": [
        (r"casino:\d+:player:", 8), (r"BLOCKED PLAYERS", 6),
        (r"Hack attempt[,;]", 7), (r"actionsValidCheck", 7),
        (r"Invalid custom actions", 7), (r"Invalid actions.*game:", 7),
        (r"reason:\s*Invalid (custom )?actions", 7),
    ],
    "Win Legitimacy": [
        (r"big.?win\s+verif", 8), (r"win verif", 7), (r"check.*legitimacy", 7),
        (r"Gameplay\s+review", 7), (r"check.*player.{0,10}win", 7),
        (r"regularity\s+check", 7), (r"BUYIN.{1,30}WIN.{1,40}x BET", 6),
        (r"BET.{1,30}WIN.{1,30}x BET", 6), (r"Winning\s+verification", 5),
        (r"verify.*winnings?\s+of\s+(user|player)", 6),
        (r"cross\s+betting.*advantage\s+play", 6), (r"legitimac", 3),
        (r"Lunar\s+Rabbit.*details", 6), (r"Lunar\s+Rabbit.*Vulnerability", 7),
        (r"Vulnerability\s+Check", 7), (r"black.?jack.*check", 6),
        (r"check.*winning\s+user", 7), (r"Missing\s+funds", 6),
        (r"\d+\s+/+\s+GameArt\s+/+\s+\d+", 5),
    ],
    "Player Activity Check": [
        (r"GA\s+player\s+activity\s+check", 8), (r"Player\s+activity\s+check(ing)?", 8),
        (r"User\s+activity\s+check", 8), (r"player\s+activity\s+check(ing)?", 7),
        (r"check.*player.{0,10}activity", 6),
    ],
    "Game Stuck": [
        (r"game\s+stuck", 8), (r"PENDING\s+ROUND", 7), (r"pending\s+game\s+round", 7),
        (r"PEDNING\s+ROUND", 7), (r"resolv.*pending\s+round", 7),
        (r"player.*gets?\s+stuck", 6), (r"unable\s+to\s+continue\s+playing", 6),
        (r"can.?t\s+continue\s+to\s+play", 6), (r"manually\s+close\s+this\s+round", 6),
        (r"stuck\s+in\s+resume", 5), (r"Player.{0,20}\d+.{0,5}Stuck", 6),
        (r"\bstuck\s+round\b", 7),
    ],
    "Round Check": [
        (r"round.{0,3}check", 8), (r"Bet\s+State\s+Issue", 8),
        (r"Unsettled\s+bets?", 8), (r"unsettled\s+round", 7),
        (r"rounds?\s+not\s+settled", 7), (r"unfinished.?bet", 7),
        (r"check.*open\s+round|open\s+round.*check", 7),
        (r"round.*reply\s+error", 7), (r"cancelled\s+bets?", 6),
        (r"\bcheck\s+rounds?\b", 6), (r"\bopen\s+rounds?\b", 5),
        (r"Rounds?\s+Auto.closing\s+issue", 8),
        (r"Automatic\s+Settlement.*Unfinished\s+Rounds?", 7),
        (r"\d+\s+-\s+Check\s+open\s+round", 8), (r"\d+\s+-\s+Stuck\s+round", 8),
        (r"does\s+not\s+return\s+rounds?", 7),
        (r"rounds?\s+listed\s+below\s+were\s+not\s+settled", 7),
    ],
    "Currency Enable": [
        (r"enable\s+\w+\s+currency\s+for\s+casino", 8),
        (r"New\s+currencies?\s+addition", 8), (r"currencies?\s+addition:", 7),
        (r"ENABLE\s+CURRENCY", 8), (r"Adding\s+a\s+new\s+currency\s+to", 8),
        (r"add\s+multiple\s+currencies\s+for", 8),
        (r"\[GAS-\d+\]:?\s+add\s+multiple\s+currencies", 8),
        (r"\[GAS-\d+\]:?\s+add\s+currencies\s+for", 8),
        (r"\[GAS-\d+\]:?\s+add\s+[A-Z]{3}\s+currency", 8),
        (r"enable\s+multiple\s+currencies\s+for\s+casino", 8),
        (r"\[GAS-\d+\]:?\s+enable\s+[A-Z]{3}", 7),
        (r"FUN\s+Currency\b", 7), (r"currency.*not\s+working", 6),
        (r"ratio\s+change.*currenc", 7), (r"activate.{0,20}currencies?\s+for", 7),
    ],
    "New Brand Setup": [
        (r"SOFTSWISS.{0,20}Gameart:\s*new\s+brands?:", 8),
        (r"REF\s+\[GAS-\d+\]\s+SOFTSWISS", 8), (r"new\s+brands?:\s+\w+", 7),
        (r"new\s+project\s+activation", 8), (r"Gameart:\s*New\s+projects?:", 8),
        (r"Please\s+connect\s+the\s+casino\s+to", 7), (r"GAS-\d+\].*new\s+brand", 7),
        (r"brand\s+split\s+access", 6),
    ],
    "Bet / Exposure Config": [
        (r"Min\s+[Bb]et\s*:", 8), (r"Max\s+[Bb]et\s*:", 8),
        (r"Max\s+winning\s*:", 8), (r"change\s+the\s+default\s+bet\s+to", 8),
        (r"default\s+bet\s+(is|to)\s+(too?\s+low|\d)", 7),
        (r"please\s+(change|set)\s+(the\s+)?default\s+bet", 7),
        (r"Exposure\s+Limits?\s+Game\s+Art", 8), (r"exposure\s+limit", 7),
        (r"changing\s+the\s+maximum\s+bonus\s+game\s+purchase", 8),
        (r"\[GAS-\d+\]:?\s+Default\s+bet\b", 8), (r"\[GAS-\d+\]:?\s+limits?\s+for", 8),
        (r"\[GAS-\d+\]:?\s+change\s+limits", 8), (r"limits?\s+in\s+[A-Z]{3}\b", 7),
        (r"\[GAS-\d+\]:?\s+max\s+expo", 8), (r"max\s+expo\s+(for|\d)", 7),
        (r"Adjust\s+Max\s+expo(sure)?", 7), (r"Bet\s+Values?\s+\w", 7),
        (r"bet\s+limit\s+(adjustment|query|incorrect)", 7),
        (r"wrong\s+bet\s+values?", 7), (r"Default\s+bet\s+[\d.,]+\s+[A-Z]{3}\b", 7),
        (r"min\s+bet\b", 4), (r"max\s+bet\b", 4), (r"default\s+bet\b", 4), (r"bet\s+limit", 5),
    ],
    "RTP Config": [
        (r"Please\s+set\s+RTP\s+to\s+\d+%", 8), (r"RTP\s+for\s+casino_?id", 8),
        (r"\[GAS-\d+\]?:?\s+RTP\b", 8), (r"\[GAS-\d+\]:?\s+RTP\s+for\b", 8),
        (r"set\s+RTP.*%.*for.*casino", 7), (r"low\s+RTP\s+access", 8),
        (r"\[GAS-\d+\]:?\s+\d+m\d+rtp", 8), (r"RTP\s+information\s+with\s+the\s+games", 7),
        (r"RTP\s+to\s+\d+%", 6),
    ],
    "Game Launch Issue": [
        (r"Provider.{0,10}launch\s+issue", 8), (r"launch\s+issue(s)?", 7),
        (r"launching\s+issues?", 7), (r"game.*is\s+not\s+loading\s+correctly", 8),
        (r"game.*not\s+loading", 7), (r"game.*loading.*error", 7),
        (r"games?.*not\s+working", 7), (r"game.*doesn.t\s+work", 7),
        (r"game_doesn.t_work", 7), (r"\[.*game_doesn.t_work\]", 8),
        (r"game_doesnt_work", 8), (r"games?\s+get\s+stuck\s+in\s+loading", 7),
        (r"games?\s+unavailability|provider.{0,10}unavailability", 7),
        (r"games?\s+from.*do\s+not\s+work", 7), (r"do\s+not\s+work.*\bprod\b", 6),
        (r"games?\s+unavailable", 6), (r"game\s+list\s+is\s+not\s+available", 7),
        (r"slot.*malfunction|malfunction.*slot", 6),
        (r"Game\s+Launch\s+Issue\b", 8), (r"TranslatorSession\s+error", 7),
        (r"no\s+URL\s+is\s+returned.*launch", 7),
    ],
    "IP Whitelist": [
        (r"WL\s+IPS?\s+FOR", 8), (r"Please\s+(WL|whitelist)\s+the\s+(following\s+)?IP", 8),
        (r"whitelist\s+the\s+following\s+IPs?", 8), (r"whitelist\s+this\s+IP", 8),
        (r"add.*IP.*whitelist", 7), (r"Adding\s+an\s+IP.{0,30}whitelist", 8),
        (r"Add\s+IP\s+to\s+(your\s+)?whitelist", 8),
        (r"ip\s+whitelist", 7), (r"whitelist.*IP", 5),
    ],
    "Account / BO Access": [
        (r"reset\s+password", 8), (r"reset\s+back.office\s+credentials?", 8),
        (r"Request\s+to\s+Unlock.*Account.*Reset\s+Password", 8),
        (r"BO\s+2FA\s+Issue", 8), (r"Reset\s+2FA\s+request", 8),
        (r"new\s+access\s+credentials?\s+or\s+restore", 7),
        (r"access\s+to\s+the\s+BO", 7), (r"\bBO\s+access\b", 6),
        (r"\bBO\s+Password\b", 7), (r"\bBackOffice\b", 6), (r"\bBack\s+Office\b", 5),
        (r"\bAccess\s+to\s+BO\b", 7), (r"Account\s+locked", 7),
        (r"2fa\s+Request\b", 7), (r"Access\s+Verification", 6),
        (r"production\s+access\s+\w", 6),
        (r"Back\s*[Oo]ffice\s+(2FA|Access|log\s+in)", 7),
        (r"Password\s+Rotation.*2FA|2FA.*Password\s+Rotation", 7),
        (r"close\s+operator\s+accounts?", 7), (r"disable.*following\s+agent", 7),
        (r"\[GAS-\d+\]:?\s+create\s+a\s+separate\s+account", 7),
        (r"\b2FA\b", 4),
    ],
    "GGR / Reporting": [
        (r"Discrepanc(y|ies)\s+in\s+reports?", 8), (r"BO\s+discrepancy", 8),
        (r"winnings?\s+not\s+included\s+in\s+(the\s+)?GGR", 8),
        (r"Missing\s+Vendor\s+Data", 8), (r"Incorrect.*player\s+bet\s+amount.*report", 8),
        (r"reconciliation\s+API", 7), (r"rounds?\s+absent\s+in\s+your\s+BO", 7),
        (r"report.*mismatches?", 6), (r"discrepanc", 4), (r"\bGGR\b", 4),
    ],
    "Bonus / Free Spins": [
        (r"free\s+spin\s+configuration\s+request", 8),
        (r"endpoint\s+for\s+creating\s+free\s+spins?", 8),
        (r"Bonus\s+issue", 7), (r"Crashing\s+at\s+Playing.*During\s+Bonus\s+Round", 8),
        (r"crash.*bonus\s+round", 7), (r"Zeus\s+Blitz.*Bonus", 7),
        (r"Stuck\s+Bonus\s+Round", 7), (r"free\s+spins?\s+(config|endpoint|request|via)", 6),
        (r"implement.*free\s+spins?\s+via\s+API", 7), (r"free\s+spins?\s+via\s+API", 7),
        (r"free\s+spins?\s+.{0,60}not\s+(visib|working)", 7),
        (r"Freespin\s+Cancellation", 7), (r"purchasing\s+a.*bonus|bonus.*purchase", 5),
    ],
    "Game Bug / UI": [
        (r"Mobile\s+UI.*cutoff", 8), (r"bar.*replay\s+video.*different", 8),
        (r"landscape\s+mode.*cutoff", 7), (r"game\s+result\s+error", 7),
        (r"Game\s+Result\s+Error\s+in\s+Prod", 8), (r"supported\s+browsers?", 7),
        (r"EntertainmentArt.*Game\s+Issues", 6),
        (r"Erorr\s+with\s+the\s+games?", 6), (r"Incorrect\s+Display.*Bet.*Win", 7),
        (r"home.*button.*issue", 7), (r"turn\s+to\s+portrait\s+mode", 7),
        (r"2\s+different\s+game\s+names?", 7),
        (r"Increase\s+button\s+not\s+working", 7),
        (r"win\s+animation", 5), (r"Error\s+code\s+-?\s*\d+", 5), (r"\bUI\b", 2),
    ],
}

MIN_CONFIDENCE = 0.34


def suggest(text):
    best_cat, best_score = None, 0
    for cat, patterns in RULES.items():
        score = sum(w for (p, w) in patterns if re.search(p, text, re.IGNORECASE))
        if score > best_score:
            best_score = score
            best_cat = cat
    if not best_cat:
        return None, 0
    conf = best_score / (best_score + 2)
    return (best_cat if conf >= MIN_CONFIDENCE else None), best_score


def load_rows(path):
    ext = os.path.splitext(path)[1].lower()
    if ext == ".json":
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        # Accept list of dicts with Title/Description or subject/description
        return [
            {
                "title": r.get("Title") or r.get("subject") or r.get("Subject") or "",
                "description": r.get("Description") or r.get("description") or "",
            }
            for r in data
        ]
    elif ext == ".csv":
        rows = []
        with open(path, encoding="utf-8-sig") as f:
            for row in csv.DictReader(f):
                rows.append({
                    "title": row.get("Subject") or row.get("subject") or row.get("Title") or "",
                    "description": row.get("Description") or row.get("description") or "",
                })
        return rows
    else:
        print(f"Unsupported file type: {ext}")
        sys.exit(1)


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else "augfinal.json"
    rows = load_rows(path)
    print(f"Loaded {len(rows)} rows from {path}\n")

    results, uncategorized = {}, []
    for row in rows:
        text = row["title"] + " " + row["description"]
        cat, score = suggest(text)
        if cat:
            results[cat] = results.get(cat, 0) + 1
        else:
            uncategorized.append(row["title"])

    total = len(rows)
    covered = total - len(uncategorized)
    pct = 100 * covered // total if total else 0
    print(f"COVERAGE: {covered}/{total} ({pct}%)\n")
    for cat in sorted(results, key=lambda c: -results[c]):
        print(f"  {results[cat]:4d}  {cat}")
    print(f"\nUNCATEGORIZED: {len(uncategorized)}")
    for t in uncategorized[:30]:
        print(f"  ?  {t[:90]}")


if __name__ == "__main__":
    main()
