"""
tests/test_llm_validate.py
PRD 5.6, 6.3, 8.2 절 LLM 검증 및 폴백 테스트
금지어, 입력에 없는 숫자, 스키마 누락, 키 없음, 타임아웃, 잘못된 JSON에서 모두 폴백으로 전환되는지 mock 테스트
"""
from unittest.mock import patch, MagicMock
from datetime import date
import pytest
from openai import APITimeoutError

from core.models import Assessment
from core.llm import validate, fallback, render_placeholders, generate_email, generate_briefing


@pytest.fixture
def sample_assessment():
    return Assessment(
        customer_key="대성정밀",
        display_name="대성정밀",
        alias="C01",
        txn_days=14,
        first_date=date(2025, 9, 1),
        last_date=date(2026, 9, 28),
        gap_days=63,
        median_interval=30.0,
        ratio=2.1,
        status="risk",
        hold_reason=None,
        confidence="high",
        vip=True,
        project_based=False,
        priority_score=3.5,
        intervals=[30] * 13,
        avg_amount=2400000,
        reasons=["최근 거래일 2026-09-28, 공백 63일, 평소 간격 30일의 2.1배"],
        questions=["최근 발주 일정에 변경이 있었는지", "현재 필요한 물량이나 일정이 있는지"]
    )


def test_validate_forbidden_words():
    """금지어가 포함된 경우 검증 위반 발생"""
    content = {
        "subject": "[거래처명] 안부 인사",
        "body": "이번 발주는 반드시 이탈했 손실이 확정되었습니다. 10% 할인 특가 및 무료 납기 보장 안내드립니다.",
        "check_questions": ["질문1", "질문2"]
    }
    violations = validate("email", content, allowed_numbers={10})
    assert any("금지어 포함: '확정'" in v for v in violations)
    assert any("금지어 포함: '반드시'" in v for v in violations)
    assert any("금지어 포함: '이탈했'" in v for v in violations)
    assert any("금지어 포함: '손실'" in v for v in violations)
    assert any("금지어 포함: '할인'" in v for v in violations)
    assert any("금지어 포함: '특가'" in v for v in violations)
    assert any("금지어 포함: '무료'" in v for v in violations)
    assert any("금지어 포함: '납기 보장'" in v for v in violations)


def test_validate_unallowed_numbers():
    """입력 데이터에 없는 숫자를 임의로 인용한 경우 검증 위반 발생"""
    content = {
        "subject": "[거래처명] 안부 인사",
        "body": "평소 30일 간격인데 63일이 지났습니다. 이번에 99999개의 재고가 남았습니다.",
        "check_questions": ["질문1", "질문2"]
    }
    # 허용 숫자: 30, 63만 제공
    allowed = {30, 63}
    violations = validate("email", content, allowed_numbers=allowed)
    assert any("입력값에 없는 숫자 인용" in v for v in violations)
    assert any("99999" in v for v in violations)


def test_validate_schema_missing_keys():
    """스키마 필수 키가 누락되었거나 id 집합이 불일치할 때 검증 위반"""
    # 1. 브리핑 키 누락
    broken_briefing = {"headline": "요약"}
    v1 = validate("briefing", broken_briefing, allowed_numbers=set())
    assert any("필수 키 'items' 누락" in v for v in v1)
    assert any("필수 키 'caution' 누락" in v for v in v1)

    # 2. 브리핑 id 불일치
    mismatched_ids = {
        "headline": "요약",
        "items": [{"id": "C99", "reason": "이유", "action": "call", "tone": "정중"}],
        "caution": "주의"
    }
    v2 = validate("briefing", mismatched_ids, allowed_numbers=set(), allowed_ids={"C01", "C02"})
    assert any("항목 id 집합" in v for v in v2)


def test_fallback_templates(sample_assessment):
    """폴백 템플릿 구조 및 금지어 미포함 검증"""
    fb_email = fallback("email", a=sample_assessment)
    assert "subject" in fb_email and "body" in fb_email and "check_questions" in fb_email
    assert len(fb_email["check_questions"]) == 2
    # 금지어 없음 확인
    assert not validate("email", fb_email, allowed_numbers=set())

    fb_call = fallback("call", a=sample_assessment)
    assert "purpose" in fb_call and "opening" in fb_call and "questions" in fb_call
    assert not validate("call", fb_call, allowed_numbers=set())


def test_render_placeholders():
    """자리표시자 치환 규칙 검증: 담당자명 없을 땐 [담당자명] 유지"""
    text = "안녕하세요, [담당자명]님. [거래처명] 거래 관련 연락드립니다."
    # 1. 담당자명 지정 시
    out1 = render_placeholders(text, "대성정밀", "김철수")
    assert out1 == "안녕하세요, 김철수님. 대성정밀 거래 관련 연락드립니다."

    # 2. 담당자명 없을 시
    out2 = render_placeholders(text, "대성정밀", None)
    assert out2 == "안녕하세요, [담당자명]님. 대성정밀 거래 관련 연락드립니다."


def test_fallback_on_no_api_key(sample_assessment, monkeypatch):
    """API 키가 비어있으면 안전하게 폴백 결과 반환 (error_code='no_key')"""
    monkeypatch.setattr("core.llm.LINER_API_KEY", "")
    res = generate_email(sample_assessment, demo_mode=False, force_live=True)
    assert res.source == "fallback"
    assert res.error_code == "no_key"
    assert "안녕하세요" in res.content["body"]


def test_fallback_on_timeout(sample_assessment, monkeypatch):
    """API 타임아웃 발생 시 1회 재시도 후 폴백 반환"""
    monkeypatch.setattr("core.llm.LINER_API_KEY", "test-key-123")
    mock_client = MagicMock()
    # 2회 모두 타임아웃 발생
    mock_client.chat.completions.create.side_effect = APITimeoutError(request=MagicMock())

    with patch("core.llm.OpenAI", return_value=mock_client), patch("time.sleep"):
        res = generate_email(sample_assessment, demo_mode=False, force_live=True)
        assert res.source == "fallback"
        assert res.error_code == "timeout"


def test_fallback_on_invalid_json(sample_assessment, monkeypatch):
    """API 응답이 깨진 JSON일 때 1회 재요청 후 실패 시 폴백 반환"""
    monkeypatch.setattr("core.llm.LINER_API_KEY", "test-key-123")
    mock_client = MagicMock()
    mock_resp = MagicMock()
    mock_resp.choices = [MagicMock(message=MagicMock(content="이것은 JSON이 아닙니다!"))]
    mock_client.chat.completions.create.return_value = mock_resp

    with patch("core.llm.OpenAI", return_value=mock_client), patch("time.sleep"):
        res = generate_email(sample_assessment, demo_mode=False, force_live=True)
        assert res.source == "fallback"
        assert res.error_code == "invalid_json"


def test_fallback_on_rule_violation(sample_assessment, monkeypatch):
    """API 응답에 금지어 또는 허용되지 않은 숫자가 포함되어 재요청 후에도 실패하면 폴백 반환"""
    monkeypatch.setattr("core.llm.LINER_API_KEY", "test-key-123")
    mock_client = MagicMock()
    mock_resp = MagicMock()
    # 금지어 '이탈했'과 비허용 숫자 '88888' 포함
    violation_json = '{"subject": "안내", "body": "고객사가 이탈했으니 88888원 손실입니다.", "check_questions": ["질문1"]}'
    mock_resp.choices = [MagicMock(message=MagicMock(content=violation_json))]
    mock_client.chat.completions.create.return_value = mock_resp

    with patch("core.llm.OpenAI", return_value=mock_client), patch("time.sleep"):
        res = generate_email(sample_assessment, demo_mode=False, force_live=True)
        assert res.source == "fallback"
        assert res.error_code == "rule_violation"
