"""
core/analysis.py
거래 패턴 분석, 상태 판정, 우선순위 정렬 및 요약 함수 (순수 함수, I/O 금지)
PRD F04, 4.3~4.6 및 Part 2 B, E1 절 명세 준수
"""
import statistics
import re
from datetime import date
import pandas as pd

from core.models import Assessment


def normalize_key(name: str) -> str:
    """
    거래처 키 정규화 (공백 제거, ㈜·(주)·주식회사 제거, 소문자화, 괄호 안 내용 유지)
    """
    if not name or pd.isna(name):
        return ""
    s = str(name).strip()
    s = s.replace("(주)", "").replace("㈜", "").replace("주식회사", "")
    s = re.sub(r"\s+", "", s)
    return s.lower()


def assign_aliases(keys: list) -> dict:
    """
    거래처 키를 오름차순으로 정렬하여 C01, C02... 형식의 별칭 부여
    """
    sorted_keys = sorted(list(set(keys)))
    return {k: f"C{i+1:02d}" for i, k in enumerate(sorted_keys)}


def analyze(clean_df: pd.DataFrame, flags: dict, ref_date: date) -> list[Assessment]:
    """
    F04 (M4): 거래 데이터 분석 및 Assessment 목록 생성
    - clean_df: 정제된 거래 데이터 (source_row, customer, customer_key, date, amount, item)
    - flags: {customer_key: (vip_bool, project_based_bool)}
    - ref_date: 분석 기준일 (데모 기본: 2026-11-30)
    """
    if clean_df.empty:
        return []

    # 1. 같은 날의 여러 행은 금액을 합쳐 하나의 거래일로 병합
    # clean_df['date']는 datetime.date 객체
    grouped = clean_df.groupby(["customer_key", "date"]).agg({
        "customer": "first",
        "amount": "sum",
        "item": "first"
    }).reset_index()

    # 모든 고유 거래처 키 및 별칭 생성
    all_keys = grouped["customer_key"].unique()
    alias_map = assign_aliases(all_keys)

    assessments = []

    for cust_key in all_keys:
        c_df = grouped[grouped["customer_key"] == cust_key].sort_values("date")
        display_name = c_df["customer"].iloc[0]
        alias = alias_map[cust_key]

        dates = list(c_df["date"])
        txn_days = len(dates)
        first_date = dates[0]
        last_date = dates[-1]
        gap_days = (ref_date - last_date).days

        # 거래 간격 계산
        intervals = []
        for i in range(len(dates) - 1):
            interval = (dates[i + 1] - dates[i]).days
            intervals.append(interval)

        median_interval = None
        if len(intervals) >= 1:
            median_interval = float(statistics.median(intervals))

        avg_amount = None
        if not c_df["amount"].empty:
            avg_amount = int(c_df["amount"].mean())

        # 플래그 확인
        vip_flag = False
        project_flag = False
        if cust_key in flags:
            flag_val = flags[cust_key]
            if isinstance(flag_val, (tuple, list)):
                vip_flag = bool(flag_val[0])
                project_flag = bool(flag_val[1])
            elif isinstance(flag_val, dict):
                vip_flag = bool(flag_val.get("vip", False))
                project_flag = bool(flag_val.get("project_based", False))

        # 상태 판정 규칙 (PRD 4.3~4.4)
        status = "normal"
        hold_reason = None
        confidence = None
        ratio = None

        # 3. 거래일 수 5 미만 -> 판단 보류 (사유: 데이터 부족)
        # 프로젝트성 체크 -> 판단 보류 (사유: 프로젝트성)
        # 둘 다면 데이터 부족
        if txn_days < 5 and project_flag:
            status = "hold"
            hold_reason = "insufficient_data"
        elif txn_days < 5:
            status = "hold"
            hold_reason = "insufficient_data"
        elif project_flag:
            status = "hold"
            hold_reason = "project_based"
        elif median_interval is None or median_interval <= 0:
            status = "hold"
            hold_reason = "invalid_interval"
        else:
            # 4. 배수 계산
            ratio = round(gap_days / median_interval, 2)

            # 5. 신뢰도: 거래일 수 10 이상 high, 5~9 medium
            if txn_days >= 10:
                confidence = "high"
            elif txn_days >= 5:
                confidence = "medium"

            # 6. 상태 분류
            if ratio <= 1.5:
                status = "normal"
            elif ratio < 2.0:
                status = "attention"
            elif ratio < 3.0:
                status = "risk"
            else:
                status = "high_risk"

        # 우선순위 점수: normal, hold는 0, 그 외 상태 점수 + VIP 1.5
        priority_score = 0.0
        if status not in ("normal", "hold"):
            status_scores = {
                "attention": 1.0,
                "risk": 2.0,
                "high_risk": 3.0
            }
            priority_score = status_scores.get(status, 0.0) + (1.5 if vip_flag else 0.0)

        # 근거 문장 (템플릿)
        reasons = []
        if status == "hold":
            if hold_reason == "insufficient_data":
                reasons.append(f"거래일 수 {txn_days}일로 분석 기준(5일 이상)에 미달하여 판단을 보류합니다.")
            elif hold_reason == "project_based":
                reasons.append("비정기 프로젝트성 거래처로 지정되어 주기 분석 대상에서 제외되었습니다.")
            else:
                reasons.append("거래 간격 계산이 유효하지 않아 판단을 보류합니다.")
        else:
            int_str = f"{int(median_interval)}" if median_interval.is_integer() else f"{median_interval:.1f}"
            ratio_str = f"{round(ratio, 1)}" if round(ratio, 1) == round(ratio, 2) else f"{ratio:.2f}"
            # PRD 예시 형식: 최근 거래일 2026-09-28, 공백 63일, 평소 간격 30일의 2.1배
            reasons.append(f"최근 거래일 {last_date.strftime('%Y-%m-%d')}, 공백 {gap_days}일, 평소 간격 {int_str}일의 {ratio_str}배")

        # 확인 질문 2개 (상태별 템플릿)
        questions = []
        if status in ("high_risk", "risk"):
            questions = [
                "최근 발주 일정이나 프로젝트 계획에 변경 사항이 있었는지 확인",
                "현재 필요한 물량이나 재고 소진 시점이 언제인지 파악"
            ]
        elif status == "attention":
            questions = [
                "최근 거래 흐름이나 공정 일정에 지연 사항이 없는지 확인",
                "다음 발주 예상 일정이나 보완 필요한 품목 파악"
            ]
        elif status == "normal":
            questions = [
                "정기 거래 범위 내에서 원활하게 주문이 유지되고 있는지 점검",
                "특이사항 발생 여부 주기적 모니터링"
            ]
        else:  # hold
            questions = [
                "정기 발주 업체인지 또는 일회성 프로젝트성 거래처인지 거래 유형 확인",
                "추후 정기 거래 계획 및 담당자 연락선 업데이트 필요"
            ]

        assessments.append(Assessment(
            customer_key=cust_key,
            display_name=display_name,
            alias=alias,
            txn_days=txn_days,
            first_date=first_date,
            last_date=last_date,
            gap_days=gap_days,
            median_interval=median_interval,
            ratio=ratio,
            status=status,
            hold_reason=hold_reason,
            confidence=confidence,
            vip=vip_flag,
            project_based=project_flag,
            priority_score=priority_score,
            intervals=intervals,
            avg_amount=avg_amount,
            reasons=reasons,
            questions=questions
        ))

    return assessments


def prioritize(items: list[Assessment]) -> list[Assessment]:
    """
    F05 (M5): 우선 확인 목록 정렬
    - normal과 hold는 제외
    - priority_score 내림차순, 동점이면 ratio 내림차순
    """
    targets = [a for a in items if a.status not in ("normal", "hold")]
    return sorted(
        targets,
        key=lambda a: (a.priority_score, a.ratio if a.ratio is not None else 0.0),
        reverse=True
    )


def summarize(items: list[Assessment]) -> dict:
    """
    F05 (M5): 상태별 거래처 수 집계
    반환: {'normal': int, 'attention': int, 'risk': int, 'high_risk': int, 'hold': int}
    """
    counts = {
        "normal": 0,
        "attention": 0,
        "risk": 0,
        "high_risk": 0,
        "hold": 0
    }
    for a in items:
        if a.status in counts:
            counts[a.status] += 1
    return counts
