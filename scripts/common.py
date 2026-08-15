"""共用工具：HTTP 與資料檔輸出。刻意寫得跟 earnings-call 那個站一致。"""

from __future__ import annotations

import datetime as _dt
import json
import os
import sys
import time

import requests

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(ROOT, "data")

UA = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0 Safari/537.36 tw-stock-quiz-bot/1.0"
)

TZ_TAIPEI = _dt.timezone(_dt.timedelta(hours=8))


def log(msg: str) -> None:
    print(msg, flush=True)


def warn(msg: str) -> None:
    print("⚠️  " + msg, file=sys.stderr, flush=True)


def now_taipei() -> _dt.datetime:
    return _dt.datetime.now(TZ_TAIPEI)


def session() -> requests.Session:
    s = requests.Session()
    s.headers.update({"User-Agent": UA, "Accept-Language": "zh-TW,zh;q=0.9"})
    return s


def get_json(s: requests.Session, url: str, *, timeout: int = 30, retries: int = 3):
    """帶重試的 GET。失敗回 None 而不是丟例外——單一來源掛掉不該拖垮整個 build。"""
    delay = 2
    for attempt in range(1, retries + 1):
        try:
            r = s.get(url, timeout=timeout)
            if r.status_code == 200:
                return r.json()
            warn(f"{url} 回 HTTP {r.status_code}（第 {attempt} 次）")
        except Exception as e:  # noqa: BLE001
            warn(f"{url} 失敗：{e}（第 {attempt} 次）")
        if attempt < retries:
            time.sleep(delay)
            delay *= 2
    return None


def write_js(filename: str, varname: str, payload) -> None:
    """寫成 .js 而不是 .json，這樣用瀏覽器直接開本機 index.html 也不會被 CORS 擋。"""
    os.makedirs(DATA_DIR, exist_ok=True)
    path = os.path.join(DATA_DIR, filename)
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    with open(path, "w", encoding="utf-8") as f:
        f.write(f"window.{varname} = {body};\n")
    log(f"寫入 {path}（{len(body):,} bytes）")


def to_float(v):
    """OpenAPI 的數字欄位常常是字串，還可能是 '--'、'' 或帶逗號。"""
    if v is None:
        return None
    s = str(v).strip().replace(",", "")
    if s in ("", "-", "--", "N/A", "null"):
        return None
    try:
        return float(s)
    except ValueError:
        return None
