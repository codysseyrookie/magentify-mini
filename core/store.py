"""
core/store.py
SQLite 저장소 모듈 (pandas 사용 금지, 순수 sqlite3)
PRD Part 2 D·E1 절 명세 준수
"""
import os
import sqlite3
import json
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

DB_PATH = os.getenv("DB_PATH", "./data/app.db")


_db_initialized = False

def get_connection() -> sqlite3.Connection:
    global _db_initialized
    os.makedirs(os.path.dirname(DB_PATH) or ".", exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=10.0)
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.row_factory = sqlite3.Row
    if not _db_initialized:
        init_db()
        _db_initialized = True
    return conn


def init_db() -> None:
    """PRD Part 2 D절 5개 테이블 및 인덱스 초기화"""
    global _db_initialized
    _db_initialized = True
    os.makedirs(os.path.dirname(DB_PATH) or ".", exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=10.0)
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA foreign_keys = ON;")
    with conn:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS settings (
          key        TEXT PRIMARY KEY,
          value      TEXT NOT NULL,
          updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );

        CREATE TABLE IF NOT EXISTS customer_flags (
          customer_key  TEXT PRIMARY KEY,
          display_name  TEXT NOT NULL,
          vip           INTEGER NOT NULL DEFAULT 0 CHECK (vip IN (0,1)),
          project_based INTEGER NOT NULL DEFAULT 0 CHECK (project_based IN (0,1)),
          updated_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );

        CREATE TABLE IF NOT EXISTS drafts (
          id            INTEGER PRIMARY KEY AUTOINCREMENT,
          customer_key  TEXT NOT NULL,
          kind          TEXT NOT NULL CHECK (kind IN ('email','call')),
          source        TEXT NOT NULL CHECK (source IN ('live','cache','fallback')),
          original_json TEXT NOT NULL,
          edited_text   TEXT,
          ref_date      TEXT NOT NULL,
          created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime')),
          updated_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );
        CREATE INDEX IF NOT EXISTS idx_drafts_customer ON drafts(customer_key, kind, id DESC);

        CREATE TABLE IF NOT EXISTS touchpoints (
          id                INTEGER PRIMARY KEY AUTOINCREMENT,
          customer_key      TEXT NOT NULL,
          draft_id          INTEGER REFERENCES drafts(id) ON DELETE SET NULL,
          contact_date      TEXT NOT NULL,
          channel           TEXT NOT NULL CHECK (channel IN ('email','phone','other')),
          outcome           TEXT NOT NULL CHECK (outcome IN
            ('planned','contacted','waiting_reply','quote_requested','reorder_confirmed','on_hold','not_needed')),
          note              TEXT,
          next_contact_date TEXT,
          created_at        TEXT NOT NULL DEFAULT (datetime('now','localtime')),
          CHECK (next_contact_date IS NULL OR next_contact_date >= contact_date)
        );
        CREATE INDEX IF NOT EXISTS idx_touch_customer ON touchpoints(customer_key, id DESC);
        CREATE INDEX IF NOT EXISTS idx_touch_next ON touchpoints(next_contact_date);

        CREATE TABLE IF NOT EXISTS api_logs (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          task       TEXT NOT NULL,   -- briefing | email | call | qa | search
          api        TEXT NOT NULL,   -- model | search
          ok         INTEGER NOT NULL CHECK (ok IN (0,1)),
          error_code TEXT,            -- no_key | limit | timeout | auth | rate_limit | server | invalid_json | rule_violation
          latency_ms INTEGER,
          created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );
        CREATE INDEX IF NOT EXISTS idx_api_logs_day ON api_logs(created_at);
        """)
        conn.commit()


def get_flags() -> dict:
    """
    모든 거래처 플래그 조회.
    반환: {customer_key: (vip_bool, project_based_bool)}
    """
    with get_connection() as conn:
        cursor = conn.execute("SELECT customer_key, vip, project_based FROM customer_flags")
        rows = cursor.fetchall()
        return {row["customer_key"]: (bool(row["vip"]), bool(row["project_based"])) for row in rows}


def get_flags_detail() -> dict:
    """거래처 상세 정보 포함 플래그 조회"""
    with get_connection() as conn:
        cursor = conn.execute("SELECT customer_key, display_name, vip, project_based FROM customer_flags")
        rows = cursor.fetchall()
        return {
            row["customer_key"]: {
                "display_name": row["display_name"],
                "vip": bool(row["vip"]),
                "project_based": bool(row["project_based"])
            }
            for row in rows
        }


def set_flag(customer_key: str, display_name: str, *, vip: bool | None = None, project_based: bool | None = None) -> None:
    """
    customer_flags 설정 또는 업데이트.
    vip나 project_based가 None이면 기존 값 유지 (없으면 0).
    """
    with get_connection() as conn:
        cursor = conn.execute(
            "SELECT vip, project_based FROM customer_flags WHERE customer_key = ?",
            (customer_key,)
        )
        row = cursor.fetchone()
        
        curr_vip = row["vip"] if row else 0
        curr_proj = row["project_based"] if row else 0
        
        new_vip = int(vip) if vip is not None else curr_vip
        new_proj = int(project_based) if project_based is not None else curr_proj
        
        conn.execute("""
            INSERT INTO customer_flags (customer_key, display_name, vip, project_based, updated_at)
            VALUES (?, ?, ?, ?, datetime('now','localtime'))
            ON CONFLICT(customer_key) DO UPDATE SET
                display_name = excluded.display_name,
                vip = excluded.vip,
                project_based = excluded.project_based,
                updated_at = datetime('now','localtime')
        """, (customer_key, display_name, new_vip, new_proj))
        conn.commit()


def save_draft(customer_key: str, kind: str, source: str, content: dict, ref_date: str) -> int:
    """새 초안 저장"""
    original_json = json.dumps(content, ensure_ascii=False)
    # 초기 edited_text는 이메일인 경우 body, 통화 가이드인 경우 json dump 또는 텍스트
    edited_text = content.get("body", "") if kind == "email" else ""
    with get_connection() as conn:
        cursor = conn.execute("""
            INSERT INTO drafts (customer_key, kind, source, original_json, edited_text, ref_date)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (customer_key, kind, source, original_json, edited_text, ref_date))
        conn.commit()
        return cursor.lastrowid


def update_draft_text(draft_id: int, edited_text: str) -> None:
    """초안 수정 텍스트 업데이트 (original_json은 불변)"""
    with get_connection() as conn:
        conn.execute("""
            UPDATE drafts
            SET edited_text = ?, updated_at = datetime('now','localtime')
            WHERE id = ?
        """, (edited_text, draft_id))
        conn.commit()


def latest_draft(customer_key: str, kind: str) -> dict | None:
    """거래처와 종류에 해당하는 최신 초안 조회"""
    with get_connection() as conn:
        cursor = conn.execute("""
            SELECT id, customer_key, kind, source, original_json, edited_text, ref_date, created_at, updated_at
            FROM drafts
            WHERE customer_key = ? AND kind = ?
            ORDER BY id DESC
            LIMIT 1
        """, (customer_key, kind))
        row = cursor.fetchone()
        if not row:
            return None
        return {
            "id": row["id"],
            "customer_key": row["customer_key"],
            "kind": row["kind"],
            "source": row["source"],
            "original_json": json.loads(row["original_json"]),
            "edited_text": row["edited_text"],
            "ref_date": row["ref_date"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"]
        }


def add_touchpoint(customer_key: str, contact_date: str, channel: str, outcome: str,
                   note: str | None, next_contact_date: str | None, draft_id: int | None) -> int:
    """새 접촉 기록 저장 (DB 커밋 성공 후 id 반환)"""
    with get_connection() as conn:
        cursor = conn.execute("""
            INSERT INTO touchpoints (customer_key, draft_id, contact_date, channel, outcome, note, next_contact_date)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (customer_key, draft_id, contact_date, channel, outcome, note, next_contact_date))
        conn.commit()
        return cursor.lastrowid


def list_touchpoints(customer_key: str) -> list:
    """거래처별 접촉 이력 (최신순)"""
    with get_connection() as conn:
        cursor = conn.execute("""
            SELECT id, customer_key, draft_id, contact_date, channel, outcome, note, next_contact_date, created_at
            FROM touchpoints
            WHERE customer_key = ?
            ORDER BY id DESC
        """, (customer_key,))
        rows = cursor.fetchall()
        return [dict(row) for row in rows]


def followups(ref_date: str) -> list:
    """
    거래처마다 가장 최근 touchpoints 행을 고른 뒤 next_contact_date가 있는 것만 반환.
    기준일 이전이면 status='need_followup', 아니면 status='planned'
    """
    with get_connection() as conn:
        cursor = conn.execute("""
            WITH LatestTouch AS (
                SELECT *,
                       ROW_NUMBER() OVER (PARTITION BY customer_key ORDER BY id DESC) as rn
                FROM touchpoints
            )
            SELECT t.id, t.customer_key, cf.display_name, t.contact_date, t.channel, t.outcome,
                   t.note, t.next_contact_date, t.created_at
            FROM LatestTouch t
            LEFT JOIN customer_flags cf ON t.customer_key = cf.customer_key
            WHERE t.rn = 1 AND t.next_contact_date IS NOT NULL AND t.next_contact_date != ''
            ORDER BY t.next_contact_date ASC
        """)
        rows = cursor.fetchall()
        results = []
        for row in rows:
            d = dict(row)
            if not d.get("display_name"):
                d["display_name"] = d["customer_key"]
            next_date = d["next_contact_date"]
            if next_date < ref_date:
                d["followup_status"] = "후속 조치 필요"
            else:
                d["followup_status"] = "예정"
            results.append(d)
        return results


def log_api(task: str, api: str, ok: bool, error_code: str | None, latency_ms: int | None) -> None:
    """API 호출 로그 기록 (라이브 시도 시만 기록, 캐시 적중 제외)"""
    with get_connection() as conn:
        conn.execute("""
            INSERT INTO api_logs (task, api, ok, error_code, latency_ms)
            VALUES (?, ?, ?, ?, ?)
        """, (task, api, 1 if ok else 0, error_code, latency_ms))
        conn.commit()


def calls_today() -> int:
    """오늘 날짜 기준 라이브 API 호출 수"""
    with get_connection() as conn:
        cursor = conn.execute("""
            SELECT COUNT(*) as cnt
            FROM api_logs
            WHERE date(created_at) = date('now','localtime')
        """)
        row = cursor.fetchone()
        return row["cnt"] if row else 0


def get_setting(key: str, default: str | None = None) -> str | None:
    """설정 조회"""
    with get_connection() as conn:
        cursor = conn.execute("SELECT value FROM settings WHERE key = ?", (key,))
        row = cursor.fetchone()
        return row["value"] if row else default


def set_setting(key: str, value: str) -> None:
    """설정 저장 또는 업데이트"""
    with get_connection() as conn:
        conn.execute("""
            INSERT INTO settings (key, value, updated_at)
            VALUES (?, ?, datetime('now','localtime'))
            ON CONFLICT(key) DO UPDATE SET
                value = excluded.value,
                updated_at = datetime('now','localtime')
        """, (key, str(value)))
        conn.commit()


def seed_demo_flags() -> None:
    """데모 시드 플래그 주입: 대성정밀 vip=1, 미래산업 vip=1, 바른설비 project_based=1"""
    # 키 정규화 규칙: ㈜ 제거, 공백 제거, 소문자화
    set_flag("대성정밀", "대성정밀", vip=True, project_based=False)
    set_flag("미래산업", "미래산업", vip=True, project_based=False)
    set_flag("바른설비", "바른설비", vip=False, project_based=True)


def reset_demo() -> None:
    """
    [데모 리셋]:
    touchpoints, drafts 삭제,
    customer_flags를 데모 시드로 복원.
    settings 초기화.
    (캐시 파일은 유지)
    """
    with get_connection() as conn:
        conn.execute("DELETE FROM touchpoints")
        conn.execute("DELETE FROM drafts")
        conn.execute("DELETE FROM customer_flags")
        conn.commit()
    seed_demo_flags()
