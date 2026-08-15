#!/usr/bin/env python3
"""篩選邏輯的離線測試：不連網，只驗證解析與篩選規則。

跑法：python3 scripts/test_screen.py
壞掉就別讓它去覆蓋 data/screen.js。
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import re  # noqa: E402

from fetch_screen import (MIN_VALUE, build_screens, is_etf,  # noqa: E402
                          merge, normalise, range_stats, update_history)

failed = 0


def ok(cond, msg):
    global failed
    print(("  ✓ " if cond else "  ✗ ") + msg)
    if not cond:
        failed += 1


# ---- 假資料：欄位名稱與型別刻意做成跟真實 OpenAPI 一樣的樣子 ----
TWSE_VALUATION = [
    {"Code": "2330", "Name": "台積電", "PEratio": "21.50", "DividendYield": "1.80", "PBratio": "5.20"},
    {"Code": "2884", "Name": "玉山金", "PEratio": "12.30", "DividendYield": "5.40", "PBratio": "1.30"},
    {"Code": "2412", "Name": "中華電", "PEratio": "24.10", "DividendYield": "4.20", "PBratio": "2.40"},
    {"Code": "1101", "Name": "台泥",   "PEratio": "--",    "DividendYield": "6.10", "PBratio": "0.90"},
    {"Code": "9999", "Name": "冷門股", "PEratio": "8.00",  "DividendYield": "7.00", "PBratio": "0.80"},
]

TWSE_DAILY = [
    {"Code": "2330", "Name": "台積電", "ClosingPrice": "1,050.00", "TradeValue": "35,000,000,000"},
    {"Code": "2884", "Name": "玉山金", "ClosingPrice": "28.50",    "TradeValue": "1,200,000,000"},
    {"Code": "2412", "Name": "中華電", "ClosingPrice": "128.00",   "TradeValue": "800,000,000"},
    {"Code": "1101", "Name": "台泥",   "ClosingPrice": "33.00",    "TradeValue": "500,000,000"},
    {"Code": "9999", "Name": "冷門股", "ClosingPrice": "15.00",    "TradeValue": "1,000,000"},
    {"Code": "0050", "Name": "元大台灣50", "ClosingPrice": "195.00", "TradeValue": "3,000,000,000"},
    {"Code": "0056", "Name": "元大高股息", "ClosingPrice": "38.00",  "TradeValue": "2,500,000,000"},
    {"Code": "00878", "Name": "國泰永續高股息", "ClosingPrice": "22.50", "TradeValue": "4,000,000,000"},
    {"Code": "006208", "Name": "富邦台50", "ClosingPrice": "110.00", "TradeValue": "600,000,000"},
    {"Code": "00777", "Name": "冷門 ETF", "ClosingPrice": "20.00", "TradeValue": "500,000"},
    {"Code": "",     "Name": "壞資料",  "ClosingPrice": "10.00",   "TradeValue": "100,000,000"},
    {"Code": "ABCD", "Name": "非數字代號", "ClosingPrice": "10.00", "TradeValue": "100,000,000"},
]

print("\n=== 代號判斷 ===")
ok(is_etf("0050"), "0050 是 ETF（四碼）")
ok(is_etf("0056"), "0056 是 ETF（四碼）")
ok(is_etf("00878"), "00878 是 ETF（五碼）")
ok(is_etf("006208"), "006208 是 ETF（六碼）")
ok(not is_etf("2330"), "2330 不是 ETF")
ok(not is_etf("1101"), "1101 不是 ETF")

print("\n=== 解析 ===")
val = normalise(TWSE_VALUATION, "上市")
day = normalise(TWSE_DAILY, "上市")
ok(len(val) == 5, f"估值資料解析出 5 檔（實際 {len(val)}）")
ok(len(day) == 10, f"日成交解析出 10 檔，壞資料被丟掉（實際 {len(day)}）")
ok(val["2330"]["pe"] == 21.5, "本益比字串轉成數字")
ok(day["2330"]["close"] == 1050.0, "帶逗號的收盤價解析正確")
ok(day["2330"]["value"] == 35_000_000_000, "帶逗號的成交金額解析正確")
ok(val["1101"]["pe"] is None, "'--' 的本益比變成 None，不是 0")

print("\n=== 合併 ===")
rows = merge(val, day)
ok(len(rows) == 10, f"合併後 10 檔（實際 {len(rows)}）")
ok(rows["2330"]["pe"] == 21.5 and rows["2330"]["close"] == 1050.0,
   "兩個來源的欄位都併進同一筆")
ok(rows["0050"]["pe"] is None, "只在日成交出現的 ETF 沒有本益比，維持 None")

print("\n=== 篩選 ===")
sc = build_screens(rows)

etf_codes = [r["code"] for r in sc["etfStart"]["items"]]
ok("0050" in etf_codes and "00878" in etf_codes, "ETF 清單抓得到 0050 與 00878")
ok("00777" not in etf_codes, "成交太冷清的 ETF 被排除")
ok("2330" not in etf_codes, "個股不會跑進 ETF 清單")
ok(etf_codes[0] == "00878", f"ETF 依成交金額排序，最大的在前（{etf_codes[0]}）")

income_codes = [r["code"] for r in sc["cashflow"]["items"]]
ok("2884" in income_codes, "殖利率 5.4%、本益比 12.3 的玉山金入選存股清單")
ok("2330" not in income_codes, "殖利率 1.8% 的台積電不入選存股清單")
ok("2412" not in income_codes, "本益比 24.1 超過 20 倍，不入選存股清單")
ok("1101" not in income_codes, "本益比是 '--' 查不到的，不入選（不猜）")
ok("9999" not in income_codes, "成交太冷清的不入選，就算殖利率 7%")

research_codes = [r["code"] for r in sc["research"]["items"]]
ok("2330" in research_codes, "本益比 21.5 的台積電進得了研究清單")
ok("2412" in research_codes, "本益比 24.1 仍在 25 倍門檻內")
ok(all(not is_etf(c) for c in research_codes), "研究清單裡沒有 ETF")

ok(sc["riskFirst"]["items"] == [], "風險控管路徑不給股票清單")
ok(len(sc["riskFirst"]["manual"]) >= 2, "風險控管路徑改成給該做的事")

print("\n=== 條件與人工查核項目都要寫出來 ===")
for path, s in sc.items():
    if path != "riskFirst":
        ok(len(s["criteria"]) >= 2, f"{path} 列出篩選條件")
    ok(len(s["manual"]) >= 1, f"{path} 列出 API 查不到、要自己查的項目")

print("\n=== 顯示的門檻要等於實際門檻 ===")
# 這一組是為了擋住一個真的發生過的 bug：ETF 那條路徑的標籤寫成
# 「≥ 200000 萬元」，比實際的 2,000 萬大 100 倍。原本的測試只檢查
# 「有沒有列出條件」，沒檢查內容對不對，所以放過了。

def threshold_line(path):
    for c in sc[path]["criteria"]:
        if "成交金額" in c:
            return c
    return None

lines = {p: threshold_line(p) for p in ("etfStart", "cashflow", "research")}
for path, line in lines.items():
    ok(line is not None, f"{path} 有寫出成交金額門檻")

texts = [l for l in lines.values() if l]
nums = []
for path, line in lines.items():
    if not line:
        continue
    m = re.search(r"≥\s*([\d,]+)\s*萬元", line)
    ok(m is not None, f"{path} 的門檻文字格式解析得出來（{line}）")
    if m:
        val = int(m.group(1).replace(",", "")) * 10_000
        nums.append((path, val))
        ok(val == MIN_VALUE,
           f"{path} 顯示的門檻等於實際的 MIN_VALUE（顯示 {m.group(1)} 萬 = {val:,}）")

ok(len(set(v for _, v in nums)) == 1, "三條路徑顯示的門檻一致")

print("\n=== 名單長度上限 ===")
ok(all(len(s["items"]) <= 12 for s in sc.values()), "每份清單最多 12 檔")

print("\n=== 收盤價歷史 ===")
h0 = update_history({}, rows, "2026-08-15", ["2330", "0050"])
ok(set(h0) == {"2330", "0050"}, "只累積指定的代號")
ok(h0["2330"] == [["2026-08-15", 1050.0]], "第一天寫入一筆")

h1 = update_history(h0, rows, "2026-08-16", ["2330", "0050"])
ok(len(h1["2330"]) == 2, "第二天再加一筆")

h2 = update_history(h1, rows, "2026-08-16", ["2330", "0050"])
ok(len(h2["2330"]) == 2, "同一天重跑不會寫成兩筆")

# 超過上限要丟掉最舊的
big = {"2330": [[f"2020-{(i % 12) + 1:02d}-{(i % 28) + 1:02d}", 100.0 + i] for i in range(300)]}
h3 = update_history(big, rows, "2026-08-17", ["2330"])
ok(len(h3["2330"]) == 250, f"超過 250 筆會丟掉最舊的（實際 {len(h3['2330'])}）")

# 名單以外的代號要被丟掉，不然檔案會無限長大
h4 = update_history({"9999": [["2020-01-01", 5.0]]}, rows, "2026-08-17", ["2330"])
ok("9999" not in h4, "不在名單裡的代號會被清掉")

st = range_stats([["2026-01-01", 100.0], ["2026-02-01", 130.0], ["2026-03-01", 90.0]])
ok(st["high"] == 130.0 and st["low"] == 90.0, "算得出區間高低")
ok(st["days"] == 3, "回報實際累積了幾天，不假裝是一年")
ok(range_stats([])["days"] == 0, "沒有資料時回 0 天而不是炸掉")
ok(range_stats(None)["high"] is None, "None 也不會炸")

print(f"\n✗ {failed} 項沒過\n" if failed else "\n全部通過\n")
sys.exit(1 if failed else 0)
