"""
core/ingest.py
파일 읽기, 컬럼 자동 인식, 정규화 및 데이터 품질 검사 5종
PRD F01~F03 및 Part 2 B, E1 절 명세 준수
"""
import io
import re
import difflib
from datetime import date
import pandas as pd

from core.models import QualityResult, AppError


SYNONYMS = {
    "customer": ["거래처", "거래처명", "업체명", "상호", "공급받는자", "고객명", "매출처"],
    "date": ["거래일", "거래일자", "일자", "작성일자", "납품일", "주문일"],
    "amount": ["금액", "거래금액", "합계금액", "공급가액", "매출액"],
    "item": ["품목", "품목명", "품명", "상품명", "제품명"]
}


def read_file(data: bytes, filename: str) -> pd.DataFrame:
    """
    F01 (M1): CSV/XLSX 파일 읽기
    - 10MB 크기 제한
    - CSV는 utf-8-sig -> cp949 디코딩
    - XLSX는 첫 번째 시트 읽기
    - 최대 5,000행 제한
    """
    if not data or len(data) == 0:
        raise AppError("E_FILE_EMPTY", "파일에 데이터가 없습니다.")

    # 10MB (10 * 1024 * 1024 bytes) 검사
    if len(data) > 10 * 1024 * 1024:
        raise AppError("E_FILE_SIZE", "파일 크기가 10MB를 초과했습니다.")

    lower_name = filename.lower()
    df: pd.DataFrame | None = None

    if lower_name.endswith(".csv"):
        # UTF-8-sig -> CP949 순서 시도
        decoded = False
        for enc in ["utf-8-sig", "utf-8", "cp949", "euc-kr"]:
            try:
                text_stream = io.StringIO(data.decode(enc))
                df = pd.read_csv(text_stream)
                decoded = True
                break
            except Exception:
                continue

        if not decoded or df is None:
            raise AppError("E_DECODE", "파일 인코딩을 인식할 수 없습니다. UTF-8 또는 CP949 형식이어야 합니다.")

    elif lower_name.endswith(".xlsx") or lower_name.endswith(".xls"):
        try:
            excel_stream = io.BytesIO(data)
            df = pd.read_excel(excel_stream, sheet_name=0, engine="openpyxl")
        except Exception as e:
            raise AppError("E_FILE_TYPE", f"엑셀 파일을 읽을 수 없습니다: {e}")
    else:
        raise AppError("E_FILE_TYPE", "지원하지 않는 파일 형식입니다. CSV 또는 XLSX 파일을 올려주세요.")

    if df.empty or len(df.columns) == 0:
        raise AppError("E_NO_HEADER", "유효한 헤더(열 이름)를 찾을 수 없습니다.")

    # 5,000행 초과 시 앞 5,000행만 유지
    if len(df) > 5000:
        df = df.iloc[:5000].copy()

    return df


def suggest_mapping(df: pd.DataFrame) -> dict:
    """
    F02 (M2): 헤더 동의어 사전을 기반으로 컬럼 자동 인식
    1) 공백 제거 및 소문자화 후 정확 일치 우선
    2) 없으면 포함 일치
    3) 한 열은 한 필드에만 지정 가능
    """
    mapping = {
        "customer": None,
        "date": None,
        "amount": None,
        "item": None
    }
    
    assigned_cols = set()
    cleaned_headers = {}
    for col in df.columns:
        # 공백 제거 및 소문자화
        cleaned = re.sub(r"\s+", "", str(col)).lower()
        cleaned_headers[col] = cleaned

    fields = ["customer", "date", "amount", "item"]

    # 1단계: 정확 일치 검색
    for field in fields:
        syns = SYNONYMS[field]
        for col, cleaned in cleaned_headers.items():
            if col in assigned_cols:
                continue
            if cleaned in syns:
                mapping[field] = col
                assigned_cols.add(col)
                break

    # 2단계: 포함 일치 검색 (아직 할당되지 않은 필드 대상)
    for field in fields:
        if mapping[field] is not None:
            continue
        syns = SYNONYMS[field]
        for col, cleaned in cleaned_headers.items():
            if col in assigned_cols:
                continue
            for syn in syns:
                if syn in cleaned:
                    mapping[field] = col
                    assigned_cols.add(col)
                    break
            if mapping[field] is not None:
                break

    return mapping


def normalize_key(name: str) -> str:
    """
    거래처 키 정규화:
    - 앞뒤 공백 제거
    - ㈜, (주), 주식회사 제거
    - 내부 공백 제거
    - 소문자화
    - 괄호 안 다른 내용은 유지 (예: 삼우정밀(2공장))
    """
    if not name or pd.isna(name):
        return ""
    s = str(name).strip()
    s = s.replace("(주)", "").replace("㈜", "").replace("주식회사", "")
    s = re.sub(r"\s+", "", s)
    return s.lower()


def build_clean(df: pd.DataFrame, mapping: dict, ref_date: date) -> QualityResult:
    """
    F03 (M3): 정규화 및 데이터 품질 검사 5종
    검사 순서:
    1) 거래처/거래일 누락 또는 날짜 변환 실패 (invalid)
    2) 완전 중복 (duplicate)
    3) 음수 금액 (negative)
    4) 기준일 이후 미래 날짜 (future)
    5) 유사 거래처명 (경고만, 병합 안 함)
    """
    col_cust = mapping.get("customer")
    col_date = mapping.get("date")
    col_amt = mapping.get("amount")
    col_item = mapping.get("item")

    if not col_cust or not col_date or col_cust == col_date:
        raise AppError("E_MAPPING", "거래처와 거래일 열을 모두 지정해야 하며, 서로 다른 열이어야 합니다.")

    issues = []
    clean_rows = []
    counts = {
        "ok": 0,
        "duplicate": 0,
        "negative": 0,
        "invalid": 0,
        "future": 0
    }

    seen_duplicates = set()

    for idx, row in df.iterrows():
        source_row = idx + 2  # 헤더 다음 줄 = 2
        raw_cust = row.get(col_cust)
        raw_date = row.get(col_date)
        raw_amt = row.get(col_amt) if col_amt else None
        raw_item = row.get(col_item) if col_item else ""

        # 1. 거래처 검사
        if pd.isna(raw_cust) or str(raw_cust).strip() == "":
            counts["invalid"] += 1
            issues.append({
                "source_row": source_row,
                "customer": str(raw_cust) if not pd.isna(raw_cust) else "",
                "date": str(raw_date) if not pd.isna(raw_date) else "",
                "reason": "거래처명 누락"
            })
            continue

        cust_str = re.sub(r"\s+", " ", str(raw_cust).strip())
        cust_key = normalize_key(cust_str)

        # 2. 거래일 검사 및 파싱
        if pd.isna(raw_date) or str(raw_date).strip() == "":
            counts["invalid"] += 1
            issues.append({
                "source_row": source_row,
                "customer": cust_str,
                "date": "",
                "reason": "거래일자 누락"
            })
            continue

        try:
            parsed_ts = pd.to_datetime(raw_date, errors="coerce")
            if pd.isna(parsed_ts):
                raise ValueError("NaT")
            txn_date = parsed_ts.date()
        except Exception:
            counts["invalid"] += 1
            issues.append({
                "source_row": source_row,
                "customer": cust_str,
                "date": str(raw_date),
                "reason": "날짜 변환 실패"
            })
            continue

        # 3. 금액 파싱
        amount_val = 0
        if raw_amt is not None and not pd.isna(raw_amt):
            amt_str = str(raw_amt).replace(",", "").replace("원", "").replace("₩", "").strip()
            try:
                amount_val = int(float(amt_str))
            except Exception:
                amount_val = 0
        
        item_str = str(raw_item).strip() if raw_item is not None and not pd.isna(raw_item) else ""

        # 4. 품질 검사 2: 완전 중복 (거래처 키, 날짜, 금액, 품목 동일)
        dup_signature = (cust_key, txn_date.strftime("%Y-%m-%d"), amount_val, item_str)
        if dup_signature in seen_duplicates:
            counts["duplicate"] += 1
            issues.append({
                "source_row": source_row,
                "customer": cust_str,
                "date": txn_date.strftime("%Y-%m-%d"),
                "reason": "완전 중복 (이전 행과 동일)"
            })
            continue
        seen_duplicates.add(dup_signature)

        # 5. 품질 검사 3: 음수 금액 (취소 후보)
        if amount_val < 0:
            counts["negative"] += 1
            issues.append({
                "source_row": source_row,
                "customer": cust_str,
                "date": txn_date.strftime("%Y-%m-%d"),
                "reason": "취소 후보 (음수 금액)"
            })
            continue

        # 6. 품질 검사 4: 기준일보다 미래인 날짜
        if txn_date > ref_date:
            counts["future"] += 1
            issues.append({
                "source_row": source_row,
                "customer": cust_str,
                "date": txn_date.strftime("%Y-%m-%d"),
                "reason": f"기준일({ref_date}) 이후 미래 날짜"
            })
            continue

        # 정상 데이터 행
        counts["ok"] += 1
        clean_rows.append({
            "source_row": source_row,
            "customer": cust_str,
            "customer_key": cust_key,
            "date": txn_date,
            "amount": amount_val,
            "item": item_str
        })

    clean_df = pd.DataFrame(clean_rows)
    issues_df = pd.DataFrame(issues)

    # 7. 품질 검사 5: 유사 거래처명 (경고만, 병합 안 함)
    similar_pairs = []
    if not clean_df.empty:
        # 키 -> 표시명 매핑
        unique_keys = clean_df.groupby("customer_key")["customer"].first().to_dict()
        key_list = sorted(unique_keys.keys())
        
        for i in range(len(key_list)):
            for j in range(i + 1, len(key_list)):
                k1 = key_list[i]
                k2 = key_list[j]
                # 포함 관계 검사
                is_substr = (k1 in k2) or (k2 in k1)
                # SequenceMatcher 유사도 검사
                sim_ratio = difflib.SequenceMatcher(None, k1, k2).ratio()
                if is_substr or sim_ratio >= 0.85:
                    similar_pairs.append((unique_keys[k1], unique_keys[k2]))

    return QualityResult(
        clean_df=clean_df,
        issues_df=issues_df,
        counts=counts,
        similar_pairs=similar_pairs
    )
