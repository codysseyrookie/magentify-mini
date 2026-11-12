"""
core/models.py
Magentify Mini 데이터 구조 및 예외 정의
PRD Part 2 E1 절 명세 준수
"""
from dataclasses import dataclass
from datetime import date
import pandas as pd


@dataclass
class QualityResult:
    clean_df: pd.DataFrame     # source_row, customer, customer_key, date, amount, item
    issues_df: pd.DataFrame    # source_row, customer, date, reason
    counts: dict               # ok, duplicate, negative, invalid, future
    similar_pairs: list        # [(display_a, display_b), ...]


@dataclass
class Assessment:
    customer_key: str
    display_name: str
    alias: str                 # C01...
    txn_days: int
    first_date: date
    last_date: date
    gap_days: int
    median_interval: float | None
    ratio: float | None
    status: str                # normal | attention | risk | high_risk | hold
    hold_reason: str | None    # insufficient_data | project_based | invalid_interval
    confidence: str | None     # high | medium
    vip: bool
    project_based: bool
    priority_score: float      # normal, hold -> 0
    intervals: list            # list[int]
    avg_amount: int | None
    reasons: list              # 근거 문장
    questions: list            # 확인 질문 2개


@dataclass
class LlmResult:
    content: dict              # 검증을 통과한 JSON
    source: str                # live | cache | fallback
    latency_ms: int | None
    error_code: str | None     # 폴백 사유


class AppError(Exception):
    """애플리케이션 표준 에러 클래스 (E절 오류 코드)"""
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message
