"""
demo/make_demo_data.py
데모 거래 내역 126행 생성 스크립트 (난수 없이 항상 동일한 내용 생성)
PRD 4.7 및 8.1 절 명세 준수
"""
import os
from datetime import date, timedelta


def generate_demo_transactions() -> list[dict]:
    """
    12개 가상 거래처의 123행 정상 거래 + 품질 검사용 3행 = 총 126행 생성
    """
    customers = [
        # (거래처명, 거래일수, 평소간격, 최근거래일, 회당금액, 품목, is_project)
        ("대성정밀", 14, 30, date(2026, 9, 28), 2400000, "정밀 금형 부품", False),
        ("한울기계", 18, 21, date(2026, 11, 17), 800000, "유압 밸브 가공", False),
        ("세진금속", 12, 30, date(2026, 10, 12), 1200000, "알루미늄 브래킷", False),
        ("우리테크", 9, 45, date(2026, 6, 20), 1500000, "정밀 축 가공", False),
        ("미래산업", 24, 14, date(2026, 11, 20), 3100000, "센서 하우징", False),
        ("동양프레스", 10, 28, date(2026, 10, 1), 900000, "프레스 금형 부품", False),
        ("신흥공업", 1, None, date(2026, 11, 10), 500000, "시제품 샘플 가공", False),
        ("태광산업", 3, 60, date(2026, 8, 15), 700000, "대형 플레이트 가공", False),
        ("바른설비", 6, None, date(2026, 9, 14), 4000000, "특수 배관 모듈", True),
        ("청운전자", 8, 35, date(2026, 11, 2), 600000, "방열판 지그 가공", False),
        ("삼우정밀", 11, 30, date(2026, 11, 5), 1000000, "베어링 가공품", False),
        ("삼우정밀(2공장)", 7, 30, date(2026, 10, 20), 650000, "서브 지그 가공", False),
    ]

    # 고정 오프셋 순환 배열 (평소 간격 유지용)
    offset_cycle = [0, 0, 1, -1, 2, -2]

    rows = []

    for name, n, median_exp, last_d, amt, item, is_proj in customers:
        if name == "바른설비":
            # 바른설비: 최근일 2026-09-14, 불규칙 간격 (12, 95, 40, 7, 63)
            # 최근일에서 역순으로 차감: 63, 7, 40, 95, 12
            diffs = [63, 7, 40, 95, 12]
            curr = last_d
            dates = [curr]
            for diff in diffs:
                curr = curr - timedelta(days=diff)
                dates.append(curr)
            dates.sort()
        elif n == 1:
            dates = [last_d]
        else:
            curr = last_d
            dates = [curr]
            for step in range(n - 1):
                off = offset_cycle[step % len(offset_cycle)]
                curr = curr - timedelta(days=median_exp + off)
                dates.append(curr)
            dates.sort()

        for d in dates:
            rows.append({
                "거래처": name,
                "거래일자": d.strftime("%Y-%m-%d"),
                "금액": amt,
                "품목": item
            })

    # 정상 123행 확인
    assert len(rows) == 123, f"Expected 123 normal rows, got {len(rows)}"

    # 품질 검사용 추가 3행 (PRD 4.7 및 8.1 명세)
    # 1) 대성정밀 2026-08-29 완전 중복 1행
    rows.append({
        "거래처": "대성정밀",
        "거래일자": "2026-08-29",
        "금액": 2400000,
        "품목": "정밀 금형 부품"
    })

    # 2) 한울기계 2026-10-10 -800,000원 취소 1행
    rows.append({
        "거래처": "한울기계",
        "거래일자": "2026-10-10",
        "금액": -800000,
        "품목": "유압 밸브 가공"
    })

    # 3) 세진금속 날짜 "2026-13-45" 오류 1행
    rows.append({
        "거래처": "세진금속",
        "거래일자": "2026-13-45",
        "금액": 1200000,
        "품목": "알루미늄 브래킷"
    })

    # 총 126행
    assert len(rows) == 126, f"Expected 126 total rows, got {len(rows)}"
    return rows


def write_csv(output_path: str = "data/demo_transactions.csv") -> str:
    rows = generate_demo_transactions()
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    # UTF-8 with BOM (utf-8-sig) for Excel and universal compatibility
    with open(output_path, "w", encoding="utf-8-sig", newline="") as f:
        f.write("거래처,거래일자,금액,품목\n")
        for r in rows:
            f.write(f"{r['거래처']},{r['거래일자']},{r['금액']},{r['품목']}\n")
            
    return output_path


if __name__ == "__main__":
    path = write_csv()
    print(f"Successfully generated {path} with 126 rows.")
