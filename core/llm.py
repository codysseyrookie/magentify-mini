"""
core/llm.py
Liner Model API 호출, 프롬프트, 3단계 검증, 응답 캐시, 폴백 템플릿
PRD 5.1~5.7, F06, F08~F10, F12 및 Part 2 B, E1 절 명세 준수
"""
import os
import json
import time
import re
import hashlib
from datetime import datetime
from dotenv import load_dotenv
from openai import OpenAI, APIError, APITimeoutError, RateLimitError, AuthenticationError

from core.models import Assessment, LlmResult
from core.store import log_api, calls_today

load_dotenv()

# 환경변수 로드
LINER_API_KEY = os.getenv("LINER_API_KEY", "")
LINER_BASE_URL = os.getenv("LINER_BASE_URL", "")
LINER_MODEL = os.getenv("LINER_MODEL", "")
LINER_TIMEOUT_SEC = int(os.getenv("LINER_TIMEOUT_SEC", "20"))
LINER_DAILY_LIMIT = int(os.getenv("LINER_DAILY_LIMIT", "200"))
CACHE_DIR = os.getenv("CACHE_DIR", "./data/cache")

# 금지어 목록 (PRD 5.6)
FORBIDDEN_WORDS = ["확정", "반드시", "이탈했", "손실", "할인", "특가", "무료", "납기 보장"]


def render_placeholders(text: str, display_name: str, contact_name: str | None = None) -> str:
    """
    자리표시자 치환:
    - [거래처명] -> display_name
    - [담당자명] -> contact_name (비어있으면 [담당자명] 유지)
    """
    if not text:
        return ""
    res = text.replace("[거래처명]", display_name)
    if contact_name and str(contact_name).strip():
        res = res.replace("[담당자명]", str(contact_name).strip())
    return res


def extract_numbers(text: str) -> set:
    """텍스트에서 모든 숫자 추출 (정수 및 소수, 한국어 조사/접미사 앞뒤 지원)"""
    nums = set()
    matches = re.findall(r"\d+(?:\.\d+)?", text)
    for m in matches:
        try:
            val = float(m)
            nums.add(int(val) if val.is_integer() else val)
        except ValueError:
            continue
    return nums


def validate(task: str, content: dict, allowed_numbers: set, allowed_ids: set | None = None) -> list[str]:
    """
    출력 검증 (PRD 5.6):
    1) JSON 파싱 및 필수 키 확인
    2) 금지어 검사 (확정, 반드시, 이탈했, 손실, 할인, 특가, 무료, 납기 보장)
    3) 숫자 검사: 본문에 나타난 숫자가 allowed_numbers 집합에 속하는지
    반환: 위반 사유 리스트 (빈 리스트면 통과)
    """
    violations = []

    # 1. 스키마 및 필수 키 확인
    if not isinstance(content, dict):
        return ["응답이 올바른 JSON 객체(dict) 형식이 아닙니다."]

    if task == "briefing":
        required = ["headline", "items", "caution"]
        for k in required:
            if k not in content:
                violations.append(f"브리핑 필수 키 '{k}' 누락")
        if "items" in content:
            if not isinstance(content["items"], list) or len(content["items"]) == 0:
                violations.append("브리핑 items는 비어있지 않은 리스트여야 합니다.")
            else:
                resp_ids = set()
                for i, it in enumerate(content["items"]):
                    if not isinstance(it, dict):
                        violations.append(f"items[{i}]가 객체 형식이 아닙니다.")
                        continue
                    for ik in ["id", "reason", "action", "tone"]:
                        if ik not in it:
                            violations.append(f"items[{i}] 필수 키 '{ik}' 누락")
                    if "id" in it:
                        resp_ids.add(it["id"])
                # allowed_ids 집합 일치 검사
                if allowed_ids is not None and resp_ids != allowed_ids:
                    violations.append(f"브리핑 항목 id 집합({resp_ids})이 입력 id({allowed_ids})와 일치하지 않습니다.")

    elif task == "email":
        required = ["subject", "body", "check_questions"]
        for k in required:
            if k not in content:
                violations.append(f"이메일 필수 키 '{k}' 누락")
        if "check_questions" in content and not isinstance(content["check_questions"], list):
            violations.append("check_questions는 리스트여야 합니다.")

    elif task == "call":
        required = ["purpose", "opening", "questions", "next_step", "after_call"]
        for k in required:
            if k not in content:
                violations.append(f"통화 가이드 필수 키 '{k}' 누락")
        if "questions" in content and not isinstance(content["questions"], list):
            violations.append("questions는 리스트여야 합니다.")
        if "after_call" in content and not isinstance(content["after_call"], list):
            violations.append("after_call은 리스트여야 합니다.")

    elif task == "qa":
        if "answer" not in content:
            violations.append("질문 답변 필수 키 'answer' 누락")

    # 2. 금지어 검사
    dumped_str = json.dumps(content, ensure_ascii=False)
    for word in FORBIDDEN_WORDS:
        if word in dumped_str:
            violations.append(f"금지어 포함: '{word}'")

    # 3. 숫자 검사
    found_nums = extract_numbers(dumped_str)
    # 기본 허용 숫자: 연도 2025~2027, 월일 1~31, 0, 1, 2, 3, 4, 5
    safe_defaults = set(range(0, 32)) | {2025, 2026, 2027}
    effective_allowed = set(allowed_numbers) | safe_defaults

    unauthorized_nums = found_nums - effective_allowed
    if unauthorized_nums:
        violations.append(f"입력값에 없는 숫자 인용: {unauthorized_nums}")

    return violations


def fallback(task: str, a: Assessment | None = None, top: list | None = None) -> dict:
    """
    기본 템플릿(폴백) 생성 (PRD 5.7 및 F08~F09 명세)
    """
    if task == "briefing":
        items = []
        if top:
            for item in top:
                action = "email" if item.status == "risk" else "call"
                tone = "정중" if item.vip else "가벼운 안부"
                reason_text = item.reasons[0] if item.reasons else "거래 주기 흐름 점검"
                items.append({
                    "id": item.alias,
                    "reason": reason_text,
                    "action": action,
                    "tone": tone
                })
        else:
            items = [{
                "id": "C01",
                "reason": "정기 거래 간격 확인 및 안부 점검",
                "action": "email",
                "tone": "정중"
            }]
        return {
            "headline": "이번 주 거래처 정기 연락 및 거래 흐름 점검 안내",
            "items": items,
            "caution": "거래 이력 수치만으로 이탈을 확정할 수 없으므로 사실 위주로 안부를 확인하세요."
        }

    elif task == "email":
        q = a.questions if a and a.questions else [
            "최근 발주 일정에 변경이 있었는지",
            "현재 필요한 물량이나 일정이 있는지"
        ]
        return {
            "subject": "[거래처명] 안부 인사 및 거래 일정 확인 건",
            "body": "안녕하세요, [담당자명]님.\n한동안 연락이 뜸해 안부차 인사드립니다.\n최근 일정이나 변경된 사항이 있는지 편하게 말씀해 주세요. 도움이 필요한 부분이 있으면 확인해 드리겠습니다.\n감사합니다.",
            "check_questions": q
        }

    elif task == "call":
        q = a.questions if a and a.questions else [
            "최근 진행 중이신 작업 일정에 변경 사항은 없으신지요?",
            "가까운 시일 내 필요하신 자재나 부품 일정이 있으신가요?"
        ]
        return {
            "purpose": "거래처 안부 확인 및 향후 발주 일정 파악",
            "opening": "안녕하십니까, [거래처명] 담당자님. 평소 거래 관련 안부차 연락드렸습니다.",
            "questions": q,
            "next_step": "필요 시 상세 사양 확인 및 이메일 회신 요청",
            "after_call": [
                "통화 일시 및 응답자",
                "주요 확인 내용 및 일정 변경 여부",
                "다음 연락 예정일자"
            ]
        }

    elif task == "qa":
        return {
            "answer": "제공된 분석 결과로는 알 수 없습니다."
        }

    return {"error": "알 수 없는 작업"}


def _get_cache(cache_key: str) -> dict | None:
    path = os.path.join(CACHE_DIR, f"{cache_key}.json")
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data.get("content")
        except Exception:
            return None
    return None


def _set_cache(cache_key: str, task: str, content: dict) -> None:
    os.makedirs(CACHE_DIR, exist_ok=True)
    path = os.path.join(CACHE_DIR, f"{cache_key}.json")
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump({
                "task": task,
                "key": cache_key,
                "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "model": LINER_MODEL or "liner-model",
                "content": content
            }, f, ensure_ascii=False, indent=2)
    except Exception:
        pass


def _execute_llm_call(task: str, system_prompt: str, user_prompt: str,
                       allowed_numbers: set, allowed_ids: set | None,
                       cache_key: str, fallback_data: dict, force_live: bool, demo_mode: bool) -> LlmResult:
    """
    F12 호출 계층 (PRD 5.7, 6.3):
    1. 데모 모드 && not force_live -> 캐시 조회 (적중 시 source='cache')
    2. 일일 한도 초과 또는 키 부재 시 -> 폴백 반환
    3. live 호출 (20초 타임아웃, 1회 재시도)
    4. 응답 파싱 및 검증 -> 위반 시 1회 재요청 -> 실패 시 폴백
    5. 성공 시 캐시 저장 및 api_logs 기록
    """
    # 1. 캐시 조회 (데모 모드 및 force_live가 아닐 때)
    if demo_mode and not force_live:
        cached_content = _get_cache(cache_key)
        if cached_content:
            return LlmResult(content=cached_content, source="cache", latency_ms=None, error_code=None)

    # 2. 일일 호출 한도 확인
    today_cnt = calls_today()
    if today_cnt >= LINER_DAILY_LIMIT:
        log_api(task, "model", False, "limit", None)
        return LlmResult(content=fallback_data, source="fallback", latency_ms=None, error_code="limit")

    # 3. API 키 확인 (키가 없으면 즉시 안전하게 폴백 반환)
    if not LINER_API_KEY or not LINER_API_KEY.strip():
        # 키 부재는 오류 로그 없이 조용히 폴백 모드로 작동
        return LlmResult(content=fallback_data, source="fallback", latency_ms=None, error_code="no_key")

    # 4. 클라이언트 설정
    client_kwargs = {
        "api_key": LINER_API_KEY,
        "timeout": float(LINER_TIMEOUT_SEC)
    }
    if LINER_BASE_URL and LINER_BASE_URL.strip():
        client_kwargs["base_url"] = LINER_BASE_URL.strip()

    model_name = LINER_MODEL if LINER_MODEL and LINER_MODEL.strip() else "gpt-4o-mini"

    # Live 호출 시도 (최대 1회 재시도)
    client = OpenAI(**client_kwargs)

    start_time = time.time()
    last_err_code = None

    for attempt in range(2):
        try:
            call_start = time.time()
            resp = client.chat.completions.create(
                model=model_name,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.2
            )
            latency_ms = int((time.time() - call_start) * 1000)
            raw_text = resp.choices[0].message.content or ""

            # JSON 파싱 시도 (코드블록 제거)
            clean_text = raw_text.strip()
            if clean_text.startswith("```"):
                clean_text = re.sub(r"^```[a-zA-Z]*\n?", "", clean_text)
                clean_text = re.sub(r"\n?```$", "", clean_text).strip()

            parsed = json.loads(clean_text)
            violations = validate(task, parsed, allowed_numbers, allowed_ids)

            if not violations:
                # 검증 성공
                _set_cache(cache_key, task, parsed)
                log_api(task, "model", True, None, latency_ms)
                return LlmResult(content=parsed, source="live", latency_ms=latency_ms, error_code=None)

            # 위반 시 1회 재요청 (프롬프트에 위반 사유 추가)
            if attempt == 0:
                user_prompt += f"\n\n[이전 응답 수정 요청]\n다음 규칙 위반이 발견되었습니다: {'; '.join(violations)}\n규칙을 엄격히 준수하여 순수한 JSON으로만 다시 출력하십시오."
                time.sleep(1.0)
                continue
            else:
                last_err_code = "rule_violation"

        except (APITimeoutError, RateLimitError) as e:
            last_err_code = "timeout" if isinstance(e, APITimeoutError) else "rate_limit"
            if attempt == 0:
                time.sleep(1.5)
                continue
        except AuthenticationError:
            last_err_code = "auth"
            break  # 인증 실패는 재시도 없음
        except APIError:
            last_err_code = "server"
            if attempt == 0:
                time.sleep(1.5)
                continue
        except json.JSONDecodeError:
            last_err_code = "invalid_json"
            if attempt == 0:
                user_prompt += "\n\n[오류] 응답이 유효한 JSON 형식이 아닙니다. 마크다운 없이 순수 JSON만 출력하세요."
                time.sleep(1.0)
                continue
        except Exception:
            last_err_code = "server"
            break

    # 실패 시 폴백 반환 및 로그 기록
    total_latency = int((time.time() - start_time) * 1000)
    log_api(task, "model", False, last_err_code, total_latency)
    return LlmResult(content=fallback_data, source="fallback", latency_ms=total_latency, error_code=last_err_code)


def generate_briefing(top: list[Assessment], summary: dict, *, demo_mode: bool, force_live: bool = False) -> LlmResult:
    """
    F06 (M7): 주간 브리핑 생성
    - 입력: 요약 카운트 + 우선 확인 Top 4 (별칭만 사용, 거래처명 금지)
    """
    top_4 = top[:4] if top else []
    allowed_ids = {a.alias for a in top_4}

    # 허용 숫자 집합 추출
    allowed_numbers = set()
    for k, v in summary.items():
        if isinstance(v, (int, float)):
            allowed_numbers.add(v)
    for a in top_4:
        for val in [a.txn_days, a.gap_days, a.median_interval, a.ratio]:
            if val is not None:
                allowed_numbers.add(int(val) if isinstance(val, float) and val.is_integer() else val)

    input_payload = {
        "summary": summary,
        "top_targets": [
            {
                "id": a.alias,
                "status": a.status,
                "vip": a.vip,
                "gap_days": a.gap_days,
                "median_interval": a.median_interval,
                "ratio": a.ratio,
                "txn_days": a.txn_days,
                "confidence": a.confidence
            }
            for a in top_4
        ]
    }

    json_str = json.dumps(input_payload, ensure_ascii=False, sort_keys=True)
    cache_key = hashlib.sha256(f"briefing_{json_str}".encode("utf-8")).hexdigest()
    fallback_data = fallback("briefing", top=top_4)

    system_prompt = (
        "너는 B2B 제조업 대표를 위한 거래처 관리 비서다.\n"
        "반드시 제공된 입력 JSON의 사실만 사용하여 주간 브리핑을 작성하라.\n"
        "규칙:\n"
        "1. 가격, 납기, 할인, 재고, 혜택을 약속하거나 언급하지 않는다.\n"
        "2. 이탈, 손실, 거래 중단을 확정하는 표현을 쓰지 않는다. 사유를 임의로 추측하지 않는다.\n"
        "3. 압박하거나 구매를 강요하지 않는다.\n"
        "4. 숫자는 입력에 있는 값만 인용한다.\n"
        "5. 한국어 존댓말을 사용한다.\n"
        "6. 출력은 지정한 JSON 스키마로만 답하라:\n"
        '{"headline": "60자 이내 요약", "items": [{"id": "별칭", "reason": "80자 이내 근거", "action": "email 또는 call", "tone": "정중 또는 가벼운 안부"}], "caution": "한 문장 주의사항"}'
    )

    user_prompt = f"다음 분석 데이터를 바탕으로 브리핑 JSON을 작성하라:\n{json_str}"

    return _execute_llm_call(
        task="briefing",
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        allowed_numbers=allowed_numbers,
        allowed_ids=allowed_ids,
        cache_key=cache_key,
        fallback_data=fallback_data,
        force_live=force_live,
        demo_mode=demo_mode
    )


def generate_email(a: Assessment, *, demo_mode: bool, force_live: bool = False, news: list | None = None) -> LlmResult:
    """
    F08 (M8): 이메일 초안 생성
    - 입력: Assessment 요약 수치 (별칭만 사용, [거래처명], [담당자명] 자리표시자 활용)
    """
    allowed_numbers = set()
    for val in [a.txn_days, a.gap_days, a.median_interval, a.ratio]:
        if val is not None:
            allowed_numbers.add(int(val) if isinstance(val, float) and val.is_integer() else val)

    input_payload = {
        "id": a.alias,
        "status": a.status,
        "vip": a.vip,
        "gap_days": a.gap_days,
        "median_interval": a.median_interval,
        "ratio": a.ratio,
        "txn_days": a.txn_days,
        "confidence": a.confidence,
        "questions": a.questions
    }
    if news:
        input_payload["industry_news_headlines"] = [n.get("title", "") for n in news[:3]]

    json_str = json.dumps(input_payload, ensure_ascii=False, sort_keys=True)
    cache_key = hashlib.sha256(f"email_{a.alias}_{json_str}".encode("utf-8")).hexdigest()
    fallback_data = fallback("email", a=a)

    system_prompt = (
        "너는 소규모 제조사 대표를 대필하는 정중한 업무 이메일 작성 비서다.\n"
        "거래처명은 '[거래처명]', 담당자명은 '[담당자명]' 자리표시자를 그대로 사용하라.\n"
        "규칙:\n"
        "1. 가격, 납기, 할인, 재고, 혜택, 무상 제공을 약속하지 않는다.\n"
        "2. 이탈, 거래 중단, 손실 등 부담을 주는 단어를 쓰지 않는다.\n"
        "3. 구매나 발주를 압박하지 말고, 안부와 일정 확인 위주로 부드럽게 문의한다.\n"
        "4. 숫자는 입력 JSON에 있는 값만 인용한다.\n"
        "5. 지정한 JSON 스키마로만 응답하라:\n"
        '{"subject": "이메일 제목", "body": "이메일 본문", "check_questions": ["질문1", "질문2"]}'
    )

    user_prompt = f"다음 거래처 요약 데이터를 바탕으로 안부 이메일 초안을 작성하라:\n{json_str}"

    return _execute_llm_call(
        task="email",
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        allowed_numbers=allowed_numbers,
        allowed_ids=None,
        cache_key=cache_key,
        fallback_data=fallback_data,
        force_live=force_live,
        demo_mode=demo_mode
    )


def generate_call_guide(a: Assessment, *, demo_mode: bool, force_live: bool = False) -> LlmResult:
    """
    F09 (M8): 통화 가이드 생성
    """
    allowed_numbers = set()
    for val in [a.txn_days, a.gap_days, a.median_interval, a.ratio]:
        if val is not None:
            allowed_numbers.add(int(val) if isinstance(val, float) and val.is_integer() else val)

    input_payload = {
        "id": a.alias,
        "status": a.status,
        "vip": a.vip,
        "gap_days": a.gap_days,
        "median_interval": a.median_interval,
        "ratio": a.ratio,
        "questions": a.questions
    }

    json_str = json.dumps(input_payload, ensure_ascii=False, sort_keys=True)
    cache_key = hashlib.sha256(f"call_{a.alias}_{json_str}".encode("utf-8")).hexdigest()
    fallback_data = fallback("call", a=a)

    system_prompt = (
        "너는 소규모 제조사 대표를 위한 전화 통화 가이드 작성 비서다.\n"
        "거래처명은 '[거래처명]', 담당자명은 '[담당자명]' 자리표시자를 그대로 사용하라.\n"
        "규칙:\n"
        "1. 가격, 납기, 할인, 특가, 납기 보장을 약속하지 않는다.\n"
        "2. 상대방에게 이탈이나 거래 중단을 추궁하지 않는다.\n"
        "3. 지정한 JSON 스키마로만 답하라:\n"
        '{"purpose": "통화 목적", "opening": "첫 인사", "questions": ["확인질문1", "확인질문2"], "next_step": "다음 단계", "after_call": ["기록항목1", "기록항목2", "기록항목3"]}'
    )

    user_prompt = f"다음 거래처 데이터를 바탕으로 통화 가이드 JSON을 작성하라:\n{json_str}"

    return _execute_llm_call(
        task="call",
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        allowed_numbers=allowed_numbers,
        allowed_ids=None,
        cache_key=cache_key,
        fallback_data=fallback_data,
        force_live=force_live,
        demo_mode=demo_mode
    )


def answer_question(q: str, items: list[Assessment]) -> LlmResult:
    """
    F14 (P1): 분석 결과 요약 기반 질문 답변
    """
    # 200자 제한
    short_q = q[:200]
    payload = [
        {"id": a.alias, "status": a.status, "vip": a.vip, "gap_days": a.gap_days, "ratio": a.ratio}
        for a in items
    ]
    json_str = json.dumps(payload, ensure_ascii=False)
    cache_key = hashlib.sha256(f"qa_{short_q}_{json_str}".encode("utf-8")).hexdigest()
    fallback_data = fallback("qa")

    system_prompt = (
        "너는 거래 패턴 분석 요약 데이터를 기반으로 질문에 5문장 이내로 답하는 비서다.\n"
        "근거가 부족하면 반드시 '제공된 분석 결과로는 알 수 없습니다.'라고 답변하라.\n"
        "금지어(확정, 반드시, 이탈했, 손실, 할인)를 쓰지 말라.\n"
        '{"answer": "5문장 이내 답변"}'
    )
    user_prompt = f"데이터:\n{json_str}\n\n질문: {short_q}"

    return _execute_llm_call(
        task="qa",
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        allowed_numbers=set(),
        allowed_ids=None,
        cache_key=cache_key,
        fallback_data=fallback_data,
        force_live=True,
        demo_mode=False
    )
