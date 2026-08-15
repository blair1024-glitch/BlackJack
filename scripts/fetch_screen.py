#!/usr/bin/env python3
"""從證交所／櫃買中心的公開 OpenAPI 抓資料，篩出各學習路徑的觀察名單。

這不是推薦名單。它做的事是：把使用者在網站上看到的篩選條件，
實際套用到官方公開資料上，產出「符合這些條件的清單」，並且標明資料日期與來源。
每一檔仍然要使用者自己跑過八題決策工具。

沒有 API key，全部是公開端點。跑法：

    python3 scripts/fetch_screen.py            # 抓資料並寫入 data/screen.js
    python3 scripts/fetch_screen.py --probe    # 只探測端點通不通，不寫檔
"""

from __future__ import annotations

import json
import os
import sys

from common import (DATA_DIR, get_json, log, now_taipei, session, to_float,
                    warn, write_js)

# ---- 公開端點 -----------------------------------------------------------
# 每組給多個候選網址，前面的失敗就試下一個。端點偶爾會改名，這樣不會整個掛掉。
SOURCES = {
    "twse_valuation": [
        # 上市個股：本益比、殖利率、股價淨值比
        "https://openapi.twse.com.tw/v1/exchangeReport/BWIBBU_ALL",
    ],
    "twse_daily": [
        # 上市個股：日成交資訊（收盤價、成交股數、成交金額）
        "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL",
    ],
    "tpex_valuation": [
        # 上櫃個股：本益比等。端點名稱改過幾次，多給幾個候選
        "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_peratio_analysis",
        "https://www.tpex.org.tw/openapi/v1/mainboard_peratio_analysis",
    ],
    "tpex_daily": [
        "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes",
        "https://www.tpex.org.tw/openapi/v1/mainboard_daily_close_quotes",
    ],
}

# 欄位名在兩個交易所不一樣，也改過版，所以用候選清單去找
FIELD_ALIASES = {
    "code":  ("Code", "SecuritiesCompanyCode", "股票代號", "CompanyCode"),
    "name":  ("Name", "CompanyName", "公司名稱", "SecuritiesCompanyName"),
    "pe":    ("PEratio", "PERatio", "本益比"),
    "yield": ("DividendYield", "殖利率", "DividendYieldRatio"),
    "pb":    ("PBratio", "PBRatio", "股價淨值比"),
    "close": ("ClosingPrice", "Close", "收盤價", "ClosingPrice1"),
    "value": ("TradeValue", "Amount", "成交金額"),
    "volume": ("TradeVolume", "TradingShares", "成交股數"),
}


def pick(row: dict, key: str):
    for alias in FIELD_ALIASES[key]:
        if alias in row:
            return row[alias]
    return None


def fetch_first(s, urls: list[str], label: str):
    """依序試候選網址，第一個成功的就用。全部失敗回 None。"""
    for url in urls:
        data = get_json(s, url)
        if isinstance(data, list) and data:
            log(f"  ✓ {label}：{url}（{len(data)} 筆）")
            return data, url
        warn(f"  ✗ {label}：{url}")
    return None, None


# ---- 純邏輯（離線可測，scripts/test_screen.py 直接 import 這幾支）--------

def normalise(rows: list[dict], market: str) -> dict:
    """把 OpenAPI 的原始列轉成統一格式，key 是股票代號。"""
    out = {}
    for row in rows or []:
        if not isinstance(row, dict):
            continue
        code = str(pick(row, "code") or "").strip()
        if not code or not code.isdigit():
            continue
        out[code] = {
            "code": code,
            "name": str(pick(row, "name") or "").strip(),
            "market": market,
            "pe": to_float(pick(row, "pe")),
            "yield": to_float(pick(row, "yield")),
            "pb": to_float(pick(row, "pb")),
            "close": to_float(pick(row, "close")),
            "value": to_float(pick(row, "value")),
            "volume": to_float(pick(row, "volume")),
        }
    return out


def merge(*dicts) -> dict:
    """合併多個來源。後面的只補值，不覆蓋前面已經有的非 None 欄位。"""
    out: dict = {}
    for d in dicts:
        for code, row in (d or {}).items():
            if code not in out:
                out[code] = dict(row)
            else:
                for k, v in row.items():
                    if out[code].get(k) in (None, "") and v not in (None, ""):
                        out[code][k] = v
    return out


def is_etf(code: str) -> bool:
    """台股 ETF 代號以 00 開頭，四到六碼：0050、0056 是四碼，
    00878、00929 五碼，006208 六碼。上市櫃個股沒有 00 開頭的，所以這個前綴夠可靠。"""
    return code.startswith("00") and 4 <= len(code) <= 6


MIN_VALUE = 20_000_000        # 日成交金額門檻，太冷門的買賣價差會吃掉報酬
MAX_ITEMS = 12                # 每份清單最多幾檔
HISTORY_DAYS = 250            # 約當一年的交易日數
HISTORY_PATH = os.path.join(DATA_DIR, "history.json")


# ---- 收盤價歷史：一天一筆慢慢累積，用來算「現在在一年區間的哪裡」 ----

def load_history() -> dict:
    try:
        with open(HISTORY_PATH, encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def update_history(hist: dict, rows: dict, date: str, codes) -> dict:
    """把今天的收盤價併進歷史。同一天重跑不會重複寫入，超過上限就丟掉最舊的。

    只留觀察名單會用到的代號——全市場一千九百檔乘以兩百五十天太肥，
    而且用不到。"""
    keep = set(codes)
    out = {}
    for code in keep:
        series = list(hist.get(code, []))
        close = (rows.get(code) or {}).get("close")
        if close is not None:
            series = [p for p in series if p and p[0] != date]
            series.append([date, close])
            series.sort(key=lambda p: p[0])
        out[code] = series[-HISTORY_DAYS:]
    return out


def range_stats(series) -> dict:
    """從累積的收盤價算出區間高低。天數不足一年時要照實說，不要假裝是 52 週。"""
    vals = [p[1] for p in (series or []) if p and p[1] is not None]
    if not vals:
        return {"high": None, "low": None, "days": 0}
    return {"high": max(vals), "low": min(vals), "days": len(vals)}


def build_screens(rows: dict) -> dict:
    """套用各路徑的篩選條件。條件全部寫在這裡，網站上顯示的就是這幾條。"""
    items = [r for r in rows.values() if r.get("close")]

    def liquid(r):
        v = r.get("value")
        return v is None or v >= MIN_VALUE   # 沒有成交金額欄位時不因此排除

    # --- ETF 定期定額起步 ---
    etfs = [r for r in items if is_etf(r["code"]) and liquid(r)]
    etfs.sort(key=lambda r: (-(r.get("value") or 0), r["code"]))

    # --- 存股與現金流：有殖利率、本益比不離譜 ---
    income = [
        r for r in items
        if not is_etf(r["code"]) and liquid(r)
        and (r.get("yield") or 0) >= 4.0
        and r.get("pe") and 0 < r["pe"] <= 20
        and r.get("pb") and 0 < r["pb"] <= 3
    ]
    income.sort(key=lambda r: (-(r.get("yield") or 0), r["code"]))

    # --- 個股研究：本益比落在合理區間，成交夠活絡，當作研究起點 ---
    research = [
        r for r in items
        if not is_etf(r["code"]) and liquid(r)
        and r.get("pe") and 0 < r["pe"] <= 25
        and r.get("pb") and 0 < r["pb"]
    ]
    research.sort(key=lambda r: (-(r.get("value") or 0), r["code"]))

    return {
        "etfStart": {
            "criteria": [
                # 單位固定用萬元，跟另外兩條路徑一致。
                # 之前想寫成「門檻大就顯示億、小就顯示萬」，結果兩段字串黏在一起
                # 變成「200000 萬元」，比實際門檻大 100 倍。動態單位不值得。
                f"ETF（代號 00 開頭），日成交金額 ≥ {MIN_VALUE // 10_000:,} 萬元",
                "依成交金額排序，流動性高的在前",
            ],
            "manual": [
                "內扣費用（經理費＋保管費）要去投信官網的公開說明書查，API 沒有這個欄位",
                "追蹤誤差與折溢價同樣要另外查",
            ],
            "items": etfs[:MAX_ITEMS],
        },
        "cashflow": {
            "criteria": [
                "殖利率 ≥ 4%",
                "本益比 0～20 倍之間",
                "股價淨值比 0～3 倍之間",
                f"日成交金額 ≥ {MIN_VALUE // 10_000:,} 萬元",
            ],
            "manual": [
                "連續配息年數、配發率、配息來源是本業還是業外，要去公開資訊觀測站的股利分派查",
                "歷年填息天數也要另外查——填不了息的高殖利率沒有意義",
            ],
            "items": income[:MAX_ITEMS],
        },
        "research": {
            "criteria": [
                "本益比 0～25 倍之間",
                "股價淨值比大於 0",
                f"日成交金額 ≥ {MIN_VALUE // 10_000:,} 萬元",
            ],
            "manual": [
                "三率趨勢、月營收年增率、客戶集中度，要去公開資訊觀測站查",
                "法說會簡報與逐字稿同樣在公開資訊觀測站",
            ],
            "items": research[:MAX_ITEMS],
        },
        "riskFirst": {
            "criteria": [],
            "manual": [
                "這條路徑不篩股票。在部位大小和停損規則定下來之前，篩出再好的名單也沒用",
                "先把緊急預備金、單一標的上限、出場條件這三件事處理完",
            ],
            "items": [],
        },
    }


# ---- 主流程 -------------------------------------------------------------

def main() -> int:
    probe = "--probe" in sys.argv
    s = session()

    log("抓取證交所／櫃買中心公開資料…")
    twse_val, u1 = fetch_first(s, SOURCES["twse_valuation"], "上市 本益比／殖利率")
    twse_day, u2 = fetch_first(s, SOURCES["twse_daily"], "上市 日成交")
    tpex_val, u3 = fetch_first(s, SOURCES["tpex_valuation"], "上櫃 本益比")
    tpex_day, u4 = fetch_first(s, SOURCES["tpex_daily"], "上櫃 日成交")

    if probe:
        log("\n--probe：只探測端點，不寫檔")
        for label, url in (("上市估值", u1), ("上市日成交", u2),
                           ("上櫃估值", u3), ("上櫃日成交", u4)):
            log(f"  {label}：{url or '全部候選都失敗'}")
        return 0

    if not (twse_val or twse_day):
        warn("上市資料一筆都沒抓到，不覆寫 data/screen.js（保留上一版）")
        return 1

    rows = merge(
        normalise(twse_val, "上市"),
        normalise(twse_day, "上市"),
        normalise(tpex_val, "上櫃"),
        normalise(tpex_day, "上櫃"),
    )
    log(f"合併後共 {len(rows):,} 檔")

    screens = build_screens(rows)

    # 把觀察名單裡的代號累積收盤價，算出區間高低
    watch_codes = set()
    for sc in screens.values():
        for it in sc["items"]:
            watch_codes.add(it["code"])

    today = now_taipei().strftime("%Y-%m-%d")
    hist = update_history(load_history(), rows, today, watch_codes)
    with open(HISTORY_PATH, "w", encoding="utf-8") as f:
        json.dump(hist, f, ensure_ascii=False, separators=(",", ":"))
    log(f"收盤價歷史：{len(hist)} 檔")

    for sc in screens.values():
        for it in sc["items"]:
            st = range_stats(hist.get(it["code"]))
            it["high"] = st["high"]
            it["low"] = st["low"]
            it["histDays"] = st["days"]

    for path, sc in screens.items():
        log(f"  {path}：{len(sc['items'])} 檔")

    write_js("screen.js", "SCREEN", {
        "meta": {
            "updated": now_taipei().strftime("%Y-%m-%d %H:%M"),
            "sources": [u for u in (u1, u2, u3, u4) if u],
            "total": len(rows),
            "note": "本清單為公開資料的篩選結果，不是推薦名單。",
            "historyDays": HISTORY_DAYS,
        },
        "screens": screens,
    })
    return 0


if __name__ == "__main__":
    sys.exit(main())
