"""
extract_xlsx.py — Convert an xlsx file to JSON for use with analyze_tickets.py

Usage:
    python scripts/extract_xlsx.py AUGFINAL.xlsx augfinal.json

Requires: pip install openpyxl
"""
import json, sys
try:
    import openpyxl
except ImportError:
    print("openpyxl not installed. Run: pip install openpyxl")
    sys.exit(1)

def main():
    if len(sys.argv) < 3:
        print("Usage: python extract_xlsx.py input.xlsx output.json")
        sys.exit(1)

    src, dst = sys.argv[1], sys.argv[2]
    wb = openpyxl.load_workbook(src, read_only=True, data_only=True)
    ws = wb.active

    rows_iter = ws.iter_rows(values_only=True)
    headers = [str(h).strip() if h is not None else "" for h in next(rows_iter)]

    out = []
    for row in rows_iter:
        d = {}
        for h, v in zip(headers, row):
            d[h] = str(v).strip() if v is not None else ""
        out.append(d)

    with open(dst, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

    print(f"Extracted {len(out)} rows → {dst}")
    print(f"Columns: {headers}")

if __name__ == "__main__":
    main()
