"""
tests/test_golden.py
PRD 4.7 및 8.1 절 골든 테스트
기준일 2026-11-30 기준 12개 거래처 판정, 요약 카운트, 우선순위 정렬 및 품질 검사 검증
"""
from datetime import date
import pytest

from core.ingest import read_file, suggest_mapping, build_clean
from core.analysis import analyze, prioritize, summarize


REF_DATE = date(2026, 11, 30)


@pytest.fixture(scope="module")
def quality_data():
    with open("data/demo_transactions.csv", "rb") as f:
        raw_bytes = f.read()
    df = read_file(raw_bytes, "demo_transactions.csv")
    mapping = suggest_mapping(df)
    return build_clean(df, mapping, REF_DATE)


def test_quality_counts(quality_data):
    """품질 검사 5종 결과 검증 (정상 123, 중복 1, 취소 1, 날짜 오류 1, 미래 0, 유사 1쌍)"""
    counts = quality_data.counts
    assert counts["ok"] == 123, f"Expected 123, got {counts['ok']}"
    assert counts["duplicate"] == 1, f"Expected 1, got {counts['duplicate']}"
    assert counts["negative"] == 1, f"Expected 1, got {counts['negative']}"
    assert counts["invalid"] == 1, f"Expected 1, got {counts['invalid']}"
    assert counts["future"] == 0, f"Expected 0, got {counts['future']}"

    assert len(quality_data.similar_pairs) == 1
    pair = quality_data.similar_pairs[0]
    assert ("삼우정밀" in pair) and ("삼우정밀(2공장)" in pair)


def test_assessments_and_golden_metrics(quality_data):
    """PRD 4.7 표 12개 거래처의 수치 및 상태 분류 일치 검증"""
    flags = {
        "대성정밀": (True, False),   # VIP
        "미래산업": (True, False),   # VIP
        "바른설비": (False, True),   # 프로젝트성
    }

    assessments = analyze(quality_data.clean_df, flags, REF_DATE)
    by_key = {a.customer_key: a for a in assessments}

    # 1. 대성정밀 (VIP)
    ds = by_key["대성정밀"]
    assert ds.txn_days == 14
    assert ds.median_interval == 30.0
    assert ds.last_date == date(2026, 9, 28)
    assert ds.gap_days == 63
    assert ds.ratio == 2.1
    assert ds.status == "risk"
    assert ds.vip is True
    assert ds.confidence == "high"

    # 2. 한울기계
    hw = by_key["한울기계"]
    assert hw.txn_days == 18
    assert hw.median_interval == 21.0
    assert hw.last_date == date(2026, 11, 17)
    assert hw.gap_days == 13
    assert hw.ratio == 0.62
    assert hw.status == "normal"
    assert hw.confidence == "high"

    # 3. 세진금속
    sj = by_key["세진금속"]
    assert sj.txn_days == 12
    assert sj.median_interval == 30.0
    assert sj.last_date == date(2026, 10, 12)
    assert sj.gap_days == 49
    assert sj.ratio == 1.63
    assert sj.status == "attention"
    assert sj.confidence == "high"

    # 4. 우리테크
    wt = by_key["우리테크"]
    assert wt.txn_days == 9
    assert wt.median_interval == 45.0
    assert wt.last_date == date(2026, 6, 20)
    assert wt.gap_days == 163
    assert wt.ratio == 3.62
    assert wt.status == "high_risk"
    assert wt.confidence == "medium"

    # 5. 미래산업 (VIP)
    mr = by_key["미래산업"]
    assert mr.txn_days == 24
    assert mr.median_interval == 14.0
    assert mr.last_date == date(2026, 11, 20)
    assert mr.gap_days == 10
    assert mr.ratio == 0.71
    assert mr.status == "normal"
    assert mr.vip is True

    # 6. 동양프레스
    dy = by_key["동양프레스"]
    assert dy.txn_days == 10
    assert dy.median_interval == 28.0
    assert dy.last_date == date(2026, 10, 1)
    assert dy.gap_days == 60
    assert dy.ratio == 2.14
    assert dy.status == "risk"

    # 7. 신흥공업
    sh = by_key["신흥공업"]
    assert sh.txn_days == 1
    assert sh.last_date == date(2026, 11, 10)
    assert sh.gap_days == 20
    assert sh.status == "hold"
    assert sh.hold_reason == "insufficient_data"

    # 8. 태광산업
    tk = by_key["태광산업"]
    assert tk.txn_days == 3
    assert tk.last_date == date(2026, 8, 15)
    assert tk.gap_days == 107
    assert tk.status == "hold"
    assert tk.hold_reason == "insufficient_data"

    # 9. 바른설비 (프로젝트성)
    br = by_key["바른설비"]
    assert br.txn_days == 6
    assert br.last_date == date(2026, 9, 14)
    assert br.gap_days == 77
    assert br.status == "hold"
    assert br.hold_reason == "project_based"

    # 10. 청운전자
    cu = by_key["청운전자"]
    assert cu.txn_days == 8
    assert cu.median_interval == 35.0
    assert cu.last_date == date(2026, 11, 2)
    assert cu.gap_days == 28
    assert cu.ratio == 0.8
    assert cu.status == "normal"

    # 11. 삼우정밀
    sw = by_key["삼우정밀"]
    assert sw.txn_days == 11
    assert sw.median_interval == 30.0
    assert sw.last_date == date(2026, 11, 5)
    assert sw.gap_days == 25
    assert sw.ratio == 0.83
    assert sw.status == "normal"

    # 12. 삼우정밀(2공장)
    sw2 = by_key["삼우정밀(2공장)"]
    assert sw2.txn_days == 7
    assert sw2.median_interval == 30.0
    assert sw2.last_date == date(2026, 10, 20)
    assert sw2.gap_days == 41
    assert sw2.ratio == 1.37
    assert sw2.status == "normal"


def test_summary_counts(quality_data):
    """요약 카운트: 정상 5, 관심 1, 위험 후보 2, 고위험 후보 1, 판단 보류 3"""
    flags = {
        "대성정밀": (True, False),
        "미래산업": (True, False),
        "바른설비": (False, True),
    }
    assessments = analyze(quality_data.clean_df, flags, REF_DATE)
    summary = summarize(assessments)

    assert summary["normal"] == 5, f"Expected normal=5, got {summary['normal']}"
    assert summary["attention"] == 1, f"Expected attention=1, got {summary['attention']}"
    assert summary["risk"] == 2, f"Expected risk=2, got {summary['risk']}"
    assert summary["high_risk"] == 1, f"Expected high_risk=1, got {summary['high_risk']}"
    assert summary["hold"] == 3, f"Expected hold=3, got {summary['hold']}"


def test_prioritization_order(quality_data):
    """우선 확인 순서: 대성정밀(3.5) → 우리테크(3.0) → 동양프레스(2.0) → 세진금속(1.0)"""
    flags = {
        "대성정밀": (True, False),
        "미래산업": (True, False),
        "바른설비": (False, True),
    }
    assessments = analyze(quality_data.clean_df, flags, REF_DATE)
    priority_list = prioritize(assessments)

    assert len(priority_list) == 4
    names = [a.display_name for a in priority_list]
    assert names == ["대성정밀", "우리테크", "동양프레스", "세진금속"]

    scores = [a.priority_score for a in priority_list]
    assert scores == [3.5, 3.0, 2.0, 1.0]
