# Magentify Mini — 개발 명세서

라이너 해커톤 .EXE-THON · 개발 기간 2026-11-12 \~ 11-25 · 기준 문서: 2주 데모 중심 PRD v1.1 (Part 2 우선)

## 1. 제품 개요

**한 줄 정의** 거래 파일(CSV/XLSX)을 올리면 평소 주문 주기보다 연락이 뜸해진 거래처를 근거와 함께 찾고, 연락 문안(이메일·통화 가이드)까지 준비해 주는 로컬 Streamlit 앱. 발송은 사용자가 직접 한다.

**사용자** 엑셀로 거래 내역을 관리하는 소규모 제조사 대표 1명. 로그인·다중 사용자 없음.

**핵심 흐름** 파일 불러오기 → 컬럼 확인 → 품질 검사 → 분석 실행 → 대시보드에서 우선 확인 거래처 선택 → 근거 확인·문안 생성·수정·복사 → 접촉 결과 기록

**설계 원칙**

1. 시연 시나리오가 곧 명세다. 시나리오에 없는 기능은 만들지 않는다.
2. 숫자와 판정은 코드(pandas)가, 말과 연락 전략은 Liner Model API가 맡는다.
3. 도구 호출, 병합 UI, 로그인, 배포, 백그라운드 작업은 쓰지 않는다.
4. LLM이 실패해도 시연은 계속된다. (캐시 → 폴백 템플릿)
5. 가상 데이터만 사용한다. API에는 별칭(C01…)과 요약 수치만 보낸다.

**역할 분담**

| 담당 | 하는 일 |
| :-- | :-- |
| 코드 (pandas) | 정규화, 품질 검사, 간격·배수·상태·우선순위, 근거 문장(템플릿) |
| Liner Model API | 주간 브리핑, 이메일 초안, 통화 가이드, (P1) 질문 답변 |
| Liner Search API (P1) | 업종 동향 기사 1\~3건의 제목·출처 |
| 사용자 | 매핑 확인, 문안 검토·수정·발송, 접촉 기록 |

**범위**

| 구분 | 기능 |
| :-- | :-- |
| Must (P0) | M1 파일 불러오기 · M2 컬럼 인식 · M3 품질 검사 5종 · M4 패턴 분석·우선순위 · M5 대시보드 · M6 거래처 상세 · M7 주간 브리핑 · M8 이메일·통화 가이드 · M9 접촉 기록 · M10 폴백·캐시·데모 리셋 |
| Should (P1) | S1 질문하기 · S2 업종 동향 (11/21 말 지연 시 모두 포기) |
| 하지 않는 것 | 자동 발송·전화, 이탈 예측·확정 표현, 홈택스 연동, 로그인, 배포, 예약 실행, 모바일 대응 |

## 2. 분석 규칙 (코드 상수, 변경 UI 없음)

1. **거래처 키**: 공백 제거, ㈜·(주)·주식회사 제거, 소문자화. 괄호 안 다른 내용은 유지 ("삼우정밀"과 "삼우정밀(2공장)"은 다른 거래처).
2. 같은 날 여러 행은 금액을 합쳐 하나의 거래일로 본다. **거래일 수** = 서로 다른 거래일 개수.
3. 거래일 수 5 미만 → 판단 보류(데이터 부족). 프로젝트성 체크 → 판단 보류(프로젝트성). 둘 다면 데이터 부족.
4. **간격** = 인접 거래일 차이(일), **평소 간격** = 간격의 중앙값 (0 이하면 판단 보류), **공백** = 기준일 − 마지막 거래일, **배수** = 공백 / 평소 간격.
5. **신뢰도**: 거래일 수 10 이상 high, 5\~9 medium.
6. 기준일과 파일 마지막 거래일 차이가 30일 초과 시 "데이터가 오래되었습니다" 배너.

| 배수 | 상태 (코드값) | 표시 문구 |
| :-- | :-- | :-- |
| 1.5 이하 | 정상 (normal) | 정기 거래 범위 |
| 1.5 초과 \~ 2.0 미만 | 관심 필요 (attention) | 거래 흐름 확인 권장 |
| 2.0 이상 \~ 3.0 미만 | 이탈 위험 후보 (risk) | 우선 연락 검토 |
| 3.0 이상 | 고위험 후보 (high\_risk) | 대표 우선 확인 |
| 해당 없음 | 판단 보류 (hold) | 추가 정보 필요 |

**우선순위 점수** = 상태 점수(관심 1, 위험 2, 고위험 3) + VIP 1.5. 정상·보류는 목록 제외. 점수 내림차순, 동점이면 배수 내림차순.

**품질 검사 5종**: ① 거래처·거래일 누락/날짜 파싱 실패(제외) ② 완전 중복(첫 행 유지) ③ 음수 금액(취소 후보, 제외) ④ 기준일 이후 미래 날짜(제외) ⑤ 유사 거래처명(포함 관계 또는 SequenceMatcher ≥ 0.85, 경고만·병합 안 함).

## 3. 기술 아키텍처

**스택**: Python 3.11 · Streamlit · pandas/openpyxl · openai SDK(Liner Model API, base\_url만 교체) · sqlite3(ORM 없음) · python-dotenv · pytest

```
[Browser]
    |
[Streamlit app.py]  3 screens, st.session_state
    |
    +--> core/ingest.py ---> pandas DataFrame (copy in data/uploads/)
    +--> core/analysis.py -> list[Assessment]  (pure functions, no I/O)
    +--> core/llm.py ------> data/cache/*.json (hit -> return)
    |         +-- miss --> OpenAI SDK --> Liner Model API
    |         |               | timeout / error / rule violation
    |         +---------------+--> fallback templates
    +--> core/store.py ----> SQLite data/app.db
```

| 모듈 | 책임 | 하면 안 되는 것 |
| :-- | :-- | :-- |
| app.py | 화면, 상태 관리, core 호출 | 판정·계산 규칙 구현 |
| core/ingest.py | 파일 읽기, 컬럼 인식, 정규화, 품질 검사 | DB·LLM 호출 |
| core/analysis.py | 간격·배수·상태·신뢰도·우선순위, 근거 문장 | 파일·DB·네트워크 접근 |
| core/llm.py | 프롬프트, 호출, 검증, 캐시, 폴백, 로그 | 분석 값 재계산 |
| core/store.py | SQLite 읽기·쓰기 | pandas 사용 |

**디렉터리**

```
magentify-mini/
├── app.py
├── core/ (models.py, ingest.py, analysis.py, llm.py, store.py)
├── demo/make_demo_data.py
├── tests/ (test_golden.py, test_llm_validate.py)
├── data/ (app.db, uploads/, cache/, demo_transactions.csv)
└── .env.example, .gitignore, requirements.txt, README.md
```

**운영 규칙**

- 모든 호출은 동기. 분석은 \[분석 실행\]과 기준일·플래그 변경 때만 재계산하고, 그 외 재실행은 session\_state를 쓴다.
- 앱 재시작 시 settings의 `current_data_path`로 파일을 다시 읽어 `build_clean`과 `analyze`를 자동 실행한다.
- 화면 이동은 버튼 `on_click` 콜백에서 `page`, `selected_key`를 설정한다.
- 모듈 경계 예외는 `AppError(code, message)`로 바꿔 `st.error`로 표시. LLM 실패는 예외가 아니라 `LlmResult(source='fallback')`.

**session\_state 키**: page(data/dashboard/customer) · raw\_df · mapping · clean\_df · quality · assessments · ref\_date · briefing · selected\_key · demo\_mode

**환경변수 (.env)**

| 이름 | 기본값 | 설명 |
| :-- | :-- | :-- |
| LINER\_API\_KEY | 없음 | 없으면 폴백 모드 |
| LINER\_BASE\_URL | 공식 문서 확인 | Model API 주소 (가정 금지) |
| LINER\_MODEL | 공식 문서 확인 | 모델명 |
| LINER\_TIMEOUT\_SEC | 20 | 호출 제한 시간 |
| LINER\_DAILY\_LIMIT | 200 | 하루 live 호출 상한, 초과 시 폴백 |
| DEMO\_MODE | 1 | 1이면 캐시 우선 |
| REF\_DATE\_DEFAULT | 2026-11-30 | 데모 기준일 |
| DB\_PATH | ./data/app.db | SQLite 파일 |

## 4. 기능 명세

**화면 구성**: 사이드바(분석 기준일 `date_input`, LLM 상태 배지, 데모 모드 토글, \[데모 리셋\]) + 화면 3개. 상태는 색뿐 아니라 글자로도 표시하고, 큰 글씨와 단순한 표를 쓴다.

| 화면 | 구성 |
| :-- | :-- |
| 1. 데이터 | \[데모 파일 불러오기\] 또는 업로드 → 컬럼 selectbox 3\~4개 → 품질 검사 결과 → \[분석 실행\] |
| 2. 대시보드 | 최신성 배너 → 요약 카드 5개 → 주간 브리핑 카드 → 우선 확인 목록(최대 10행) → 후속 조치 예정 → (P1) 질문 입력창 |
| 3. 거래처·문안 | 거래처 선택 → 근거 카드 → 간격 차트 → VIP·프로젝트성 체크박스 → 이메일/통화 가이드 → 편집·복사 → 접촉 기록 폼·이력 |

### 기능별 명세

| ID | 기능 | 입력 → 처리 → 출력 | 수용 기준 |
| :-- | :-- | :-- | :-- |
| F01 (M1) | 파일 불러오기 | `st.file_uploader`(csv, xlsx) 또는 데모 버튼 → 확장자·10MB 검사, CSV는 utf-8-sig→cp949 디코딩, XLSX는 첫 시트, 5,000행 초과 시 앞 5,000행만 읽고 경고, 사본을 `data/uploads/`에 저장하고 `current_data_path` 기록(새 파일이 이전 데이터를 교체) → 파일명·크기·행/열 수·상위 5행. 오류: E\_FILE\_TYPE, E\_FILE\_SIZE, E\_FILE\_EMPTY, E\_NO\_HEADER, E\_DECODE | 데모 파일이 버튼 한 번으로 읽힌다 |
| F02 (M2) | 컬럼 인식·확인 | 헤더 공백 제거·소문자화 후 동의어 사전과 정확 일치 → 없으면 포함 일치. 한 열은 한 필드에만 지정. 필수 열(거래처·거래일)이 비거나 같은 열이면 \[분석 실행\] 비활성화 + E\_MAPPING. 자동 인식 필드에 배지 | 데모 파일은 조작 없이 거래처·거래일·금액·품목 인식 |
| F03 (M3) | 정규화·품질 검사 | 날짜 `pd.to_datetime(errors='coerce')`, 금액은 쉼표·원·₩·공백 제거 후 정수, 원본 행 번호 `source_row`(헤더 다음 줄=2) 보존. 검사 순서 ①→⑤(2장) → `QualityResult`. UI: 정상·중복·취소·날짜 오류·미래 행 수 카드, 제외 행 표, 유사 이름 목록 | 데모: 정상 123, 중복 1, 취소 1, 날짜 오류 1, 미래 0, 유사 이름 1쌍 |
| F04 (M4) | 분석 실행 | `analyze(clean_df, flags, ref_date)` — 2장 규칙 그대로. 근거 문장은 템플릿(예: `최근 거래일 2026-09-28, 공백 63일, 평소 간격 30일의 2.1배`), 확인 질문은 상태별 템플릿 2개 → `list[Assessment]` + 상태별 카운트 | `tests/test_golden.py` 통과 |
| F05 (M5) | 대시보드 | 요약 카드(정상·관심·위험 후보·고위험 후보·판단 보류), 우선 확인 목록(순위·거래처·상태·최근 거래일·공백·평소 간격·배수·신뢰도·\[문안 준비\]). 후속 조치 예정: 거래처별 최신 접촉의 `next_contact_date`가 있는 건, 기준일 이전이면 '후속 조치 필요', 아니면 '예정' | 카운트 5·1·2·1·3, 우선 확인 순서가 데모와 일치 |
| F06 (M7) | 주간 브리핑 | 요약 카운트 + 상위 4곳(별칭, 상태, VIP, 공백, 평소 간격, 배수, 거래일 수, 신뢰도) → `generate_briefing` → 검증 → 별칭을 거래처명으로 치환. 카드: headline, 항목별 reason·행동·톤, caution, 출처 라벨. 버튼: \[이번 주 브리핑\](데모는 캐시 우선), \[새로 생성\](캐시 무시) | 응답 항목 id 집합 = 입력, 화면에 거래처명 표시 |
| F07 (M6) | 거래처 상세 | 상태 배지, 근거 카드(최근 거래일·공백·평소 간격·배수·거래일 수·데이터 기간·신뢰도·VIP·확인 질문 2개·고정 문구 "거래 이력만으로 이탈을 확정할 수 없습니다."), `st.bar_chart` 간격 차트, 최근 거래 10건. 체크박스 변경 시 `set_flag` 후 재분석. 판단 보류는 사유와 '근거 부족' 표시, 문안 생성은 허용 | 대성정밀 근거 카드가 데모 표와 일치 |
| F08 (M8) | 이메일 초안 | `Assessment` + 선택 입력 '담당자명' → `generate_email` → `[거래처명]` 치환(담당자명 비면 `[담당자명]` 유지) → 제목·본문 편집 영역·확인 질문 2개·'AI 초안'·출처 라벨, `drafts` 저장 | 금지어·입력에 없는 숫자 없음 |
| F09 (M8) | 통화 가이드 | `generate_call_guide` → 목적·첫 인사·확인 질문 2개·다음 단계·통화 후 기록 3개, `drafts` 저장 | 동일 |
| F10 (M8) | 편집·복사·저장 | `st.text_area` 수정 후 \[저장\] → `drafts.edited_text` 갱신(`original_json` 불변). `st.code`로 복사 아이콘 제공. \[다시 생성\]은 캐시 무시 live 호출, 실패 시 직전 결과 유지·사유 안내 | 재시작 후 마지막 편집본 복원 |
| F11 (M9) | 접촉 기록 | 접촉일(기본 기준일)·채널(이메일/전화/기타)·결과(7종)·메모(500자)·다음 연락일(접촉일 이후)·사용한 초안. DB 커밋 성공 후에만 성공 메시지, 실패 시 E\_DB. 접촉 이력은 최신순 | 이메일 / 회신 대기 / 2026-12-07 저장 → 대시보드 표시 |
| F12 (M10) | LLM 호출 계층 | 아래 6.3 절차 | 키를 지워도 시나리오 끝까지 진행 |
| F13 (M10) | 사이드바·리셋 | 기준일 변경 시 재분석. 배지: 키 있음 + 최근 호출 성공 = '연결됨', 아니면 '폴백 모드'. \[데모 리셋\]: 확인 체크 후 `touchpoints`·`drafts` 삭제, `customer_flags`를 데모 시드로 복원, session\_state·기준일 초기화(캐시 파일 유지). API 키는 화면에 표시 안 함 | 리셋 후 시나리오 재현 |
| F14 (P1) | 질문하기 | 질문(200자 이내) + 분석 요약 JSON(별칭) → 5문장 이내 답변. 근거 없으면 "제공된 분석 결과로는 알 수 없습니다". 금지어·숫자 검사 동일 | — |
| F15 (P1) | 업종 동향 | 이메일 화면 체크박스 '업종 동향 포함' → Liner Search API 1회(기본 검색어 '금속 가공 업계 동향') → 3건의 제목·URL·발행일 표시, 프롬프트에는 제목만 전달('최근 업계 소식' 수준 언급). 실패 시 생략 | — |

**데모 시연 안정화**: 시연 전 모든 거래처의 브리핑·초안을 한 번씩 호출해 `data/cache/`에 저장. 데모 모드는 캐시 우선이며 라벨은 "Liner Model API 응답(저장본)"으로 정직하게 표시. 영상 중 1회는 \[새로 생성\]으로 실제 호출을 보여 준다.

## 5. DB 구조 (SQLite)

거래 데이터는 DB에 넣지 않는다. 업로드 파일 사본에서 읽고, DB에는 사용자가 만든 정보와 호출 기록만 둔다. 날짜는 `YYYY-MM-DD`, 시각은 `YYYY-MM-DD HH:MM:SS` 문자열.

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

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
```

**접촉 결과 값 (touchpoints.outcome)**: planned=연락 예정 · contacted=연락 완료 · waiting\_reply=회신 대기 · quote\_requested=견적 요청 · reorder\_confirmed=재주문 확인 · on\_hold=거래 보류 · not\_needed=연락 불필요

**settings 키**: `current_data_path`(마지막 파일 사본 경로) · `mapping_json`(`{customer, date, amount, item}`) · `ref_date`(사용자가 바꾼 기준일, 없으면 `REF_DATE_DEFAULT`) · `demo_mode`(0/1)

**데이터 규칙**

- `customer_flags`는 체크박스를 바꿀 때만 행이 생긴다. 행이 없으면 VIP·프로젝트성 모두 0. 거래처 키가 같으면 파일을 교체해도 속성이 유지된다.
- 데모 시드: 대성정밀 `vip=1`, 미래산업 `vip=1`, 바른설비 `project_based=1` (\[데모 리셋\]과 첫 실행의 데모 불러오기에서 적용).
- `drafts.original_json`에는 검증을 통과한 LLM 출력 JSON을 그대로 저장한다.
- `followups(ref_date)`: 거래처마다 가장 최근 `touchpoints` 행을 고른 뒤 `next_contact_date`가 있는 것만 반환.
- `api_logs`는 live 호출을 시도할 때마다 1행을 쓰고, 캐시 적중은 기록하지 않는다. 하루 호출 수 = 오늘 날짜 행 수(성공 여부 무관).

**파일 저장소·Git 정책**

| 경로 | 내용 | Git |
| :-- | :-- | :-- |
| data/app.db | SQLite | 제외 |
| data/uploads/ | 업로드 사본 | 제외 |
| data/demo\_transactions.csv | 데모 거래 126행 | 포함 |
| data/cache/{sha256}.json | `{task, key, created_at, model, content}` | 포함 (가상 데이터 응답만) |
| .env | 키 | 제외 (`.env.example`만 포함) |

## 6. API·모듈 인터페이스

별도 서버가 없는 로컬 앱이므로 "API"는 (1) core 모듈 함수 인터페이스, (2) Liner API 연동으로 구성된다.

### 6.1 데이터 구조 (core/models.py)

```python
@dataclass
class QualityResult:
    clean_df: pd.DataFrame     # source_row, customer, customer_key, date, amount, item
    issues_df: pd.DataFrame    # source_row, customer, date, reason
    counts: dict               # ok, duplicate, negative, invalid, future
    similar_pairs: list        # [(display_a, display_b), ...]

@dataclass
class Assessment:
    customer_key: str; display_name: str; alias: str      # C01...
    txn_days: int; first_date: date; last_date: date
    gap_days: int; median_interval: float | None; ratio: float | None
    status: str                # normal | attention | risk | high_risk | hold
    hold_reason: str | None    # insufficient_data | project_based | invalid_interval
    confidence: str | None     # high | medium
    vip: bool; project_based: bool
    priority_score: float      # normal, hold -> 0
    intervals: list[int]; avg_amount: int | None
    reasons: list; questions: list

@dataclass
class LlmResult:
    content: dict              # 검증 통과 JSON
    source: str                # live | cache | fallback
    latency_ms: int | None
    error_code: str | None     # 폴백 사유

class AppError(Exception):
    def __init__(self, code: str, message: str): ...
```

### 6.2 모듈 함수 시그니처

```python
# core/ingest.py
def read_file(data: bytes, filename: str) -> pd.DataFrame
def suggest_mapping(df) -> dict                      # {customer, date, amount, item}
def build_clean(df, mapping: dict, ref_date: date) -> QualityResult

# core/analysis.py  (pure functions)
def normalize_key(name: str) -> str
def assign_aliases(keys: list) -> dict               # 키 오름차순 -> C01, C02...
def analyze(clean_df, flags: dict, ref_date: date) -> list   # flags: {key: (vip, project_based)}
def prioritize(items: list) -> list                  # 점수↓, 배수↓, normal·hold 제외
def summarize(items: list) -> dict                   # 상태별 거래처 수

# core/llm.py
def generate_briefing(top, summary, *, demo_mode, force_live=False) -> LlmResult
def generate_email(a, *, demo_mode, force_live=False, news=None) -> LlmResult
def generate_call_guide(a, *, demo_mode, force_live=False) -> LlmResult
def answer_question(q: str, items: list) -> LlmResult          # P1
def validate(task, content, allowed_numbers: set, allowed_ids: set | None = None) -> list  # 위반 사유, 빈 목록=통과
def fallback(task, a=None, top=None) -> dict
def render_placeholders(text, display_name, contact_name) -> str

# core/store.py
init_db() · get_flags() · set_flag(key, display_name, *, vip=None, project_based=None)
save_draft(key, kind, source, content, ref_date) -> int · update_draft_text(draft_id, edited_text)
latest_draft(key, kind) -> dict | None
add_touchpoint(key, contact_date, channel, outcome, note, next_contact_date, draft_id) -> int
list_touchpoints(key) · followups(ref_date) · log_api(task, api, ok, error_code, latency_ms)
calls_today() -> int · get_setting(key, default=None) · set_setting(key, value) · reset_demo()
```

### 6.3 Liner API 연동

**연결**: OpenAI Python SDK에서 `base_url`·`api_key`·`model`만 `.env` 값으로 교체. 도구 호출 없음. JSON 모드 미지원 시 프롬프트로 JSON만 출력하게 하고 코드에서 파싱. 실제 URL·모델명은 공식 문서(liner.com/ko/developers/docs/liner-model-api)에서 확인하고 가정하지 않는다.

| 기능 | API | 입력 | 출력 |
| :-- | :-- | :-- | :-- |
| 주간 브리핑 | Model | 요약 카드 + 우선 확인 Top 4 | JSON |
| 이메일 초안 | Model | 선택한 거래처의 근거 | JSON |
| 통화 가이드 | Model | 선택한 거래처의 근거 | JSON |
| 질문하기 (P1) | Model | 분석 결과 전체 + 질문 | 짧은 텍스트 |
| 업종 동향 (P1) | Search | 검색어 1개 | 제목·요약·출처 URL |

**전송 데이터**: 거래처명 대신 별칭만. 담당자명·연락처·메모·원본 파일은 보내지 않는다. 보내는 필드는 상태, VIP 여부, 공백 일수, 평소 간격, 배수, 거래일 수, 신뢰도. 응답의 `[거래처명]`, `[담당자명]`은 로컬에서 치환한다.

**System 프롬프트 규칙**: ① 입력 JSON의 사실만 사용 ② 가격·납기·할인·재고·혜택 약속 금지 ③ 이탈·손실·거래 중단 확정 표현·사유 추측 금지 ④ 압박·구매 강요 금지 ⑤ 입력에 있는 숫자만 인용 ⑥ 한국어 존댓말, 지정한 JSON 스키마로만 응답

**출력 스키마**

```
// 브리핑
{"headline": "60자 이내", "items": [{"id": "C01", "reason": "80자 이내", "action": "email|call", "tone": "정중|가벼운 안부"}], "caution": "한 문장"}
// 이메일
{"subject": "", "body": "", "check_questions": ["", ""]}
// 통화 가이드
{"purpose": "", "opening": "", "questions": ["", ""], "next_step": "", "after_call": [""]}
```

**출력 검증(코드)**: ① JSON 파싱·필수 키 ② 금지어(확정, 반드시, 이탈했, 손실, 할인, 특가, 무료, 납기 보장) ③ 본문 숫자가 입력값 집합에 없으면 실패 ④ 실패 시 1회 재생성, 그래도 실패하면 폴백 템플릿

**F12 호출 절차**

1. 입력 JSON 생성(별칭만 사용)
2. `cache_key = sha256(task + 입력 JSON)`
3. 데모 모드이고 `force_live`가 아니면 캐시 조회, 적중 시 `source='cache'`
4. 오늘 live 호출 수 ≥ `LINER_DAILY_LIMIT` 이거나 키가 없으면 폴백
5. live 호출(타임아웃 20초). 타임아웃·429·5xx는 1.5초 뒤 1회 재시도, 401·403은 재시도 안 함
6. 응답 파싱·검증. 위반이면 위반 사유를 프롬프트에 덧붙여 1회 재요청
7. 성공하면 캐시 파일 저장, 모든 시도를 `api_logs`에 기록
8. 끝까지 실패하면 폴백 템플릿 반환, `error_code`에 사유 기록

**화면 라벨**: live = "Liner Model API 응답" · cache = "Liner Model API 응답(저장본)" · fallback = "기본 템플릿(폴백)"

**오류 코드**: E\_FILE\_TYPE, E\_FILE\_SIZE, E\_FILE\_EMPTY, E\_NO\_HEADER, E\_DECODE, E\_MAPPING, E\_DB

## 7. 개발 일정 (11/12 \~ 11/25)

| 날짜 | 작업 | 완료 기준 |
| :-- | :-- | :-- |
| 11/12\~13 | Liner API 스파이크, 데모 데이터 생성기(`make_demo_data.py`), 업로드·컬럼 인식·품질 검사 | 스파이크 4항목 확인(짧은 호출 성공 · JSON 10회 중 파싱 성공 횟수 · 평균 응답 시간 · 한국어 문안 품질), 126행 파일 생성, 품질 카운트 일치 |
| 11/14\~15 | 분석 엔진 + 골든 테스트 | 데모 12개 거래처 결과 전부 일치 |
| 11/16\~17 | LLM 모듈(브리핑·이메일·통화), 검증, 폴백, 캐시, `store.py` | 키 없음·타임아웃·잘못된 JSON에서 폴백 동작 |
| 11/18\~19 | 3개 화면 연결, 접촉 기록, 데모 리셋 | 시연 시나리오 1회 완주 |
| 11/20\~21 | 리허설 1차, 버그 수정, (P1) 질문하기 | 5분 이내 3회 연속 완주 |
| 11/22\~23 | README, 기획서 보완, 실측 시간 측정, (여유 시) 업종 동향 | 제출 체크리스트 대부분 완료 |
| 11/24 | 데모 영상 촬영·편집, 키·개인정보 점검 | 5분 이내 영상, 저장소에서 키 문자열 검색 결과 없음 |
| 11/25 | 버퍼와 제출 | 제출 시각은 개별 안내 확인 |

**판단 시점**

- 11/15 말: 골든 테스트가 안 맞으면 규칙을 더 단순하게 줄인다. 규칙 설명 때문에 일정을 쓰지 않는다.
- 11/17 말: 라이브 호출이 불안정하면 캐시와 폴백 중심으로 시연을 구성한다.
- 11/21 말: 진행이 늦으면 P1(질문하기·업종 동향)은 모두 포기한다.

**의존 순서**: ingest → analysis → (llm ∥ store) → app 화면 연결. analysis는 I/O가 없으므로 11/12\~13 중 ingest와 병행 착수 가능하다.

## 8. 테스트와 수용 기준

### 8.1 골든 테스트 기준 (`tests/test_golden.py`)

기준일 2026-11-30. 거래일은 "마지막 거래일에서 평소 간격씩 거슬러 올라간 날짜"에 고정 오프셋(−2\~+2일 순환)을 더해 만들고 난수는 쓰지 않는다. 생성 스크립트는 항상 같은 파일을 만들어야 한다.

| 거래처 | 거래일 수 | 평소 간격 | 최근 거래일 | 공백 | 배수 | 기대 상태 |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| 대성정밀 (VIP) | 14 | 30 | 2026-09-28 | 63 | 2.1 | 이탈 위험 후보 |
| 한울기계 | 18 | 21 | 2026-11-17 | 13 | 0.62 | 정상 |
| 세진금속 | 12 | 30 | 2026-10-12 | 49 | 1.63 | 관심 필요 |
| 우리테크 | 9 | 45 | 2026-06-20 | 163 | 3.6 | 고위험 후보 |
| 미래산업 (VIP) | 24 | 14 | 2026-11-20 | 10 | 0.71 | 정상 |
| 동양프레스 | 10 | 28 | 2026-10-01 | 60 | 2.14 | 이탈 위험 후보 |
| 신흥공업 | 1 | — | 2026-11-10 | 20 | — | 판단 보류 (데이터 부족) |
| 태광산업 | 3 | 60 | 2026-08-15 | 107 | — | 판단 보류 (데이터 부족) |
| 바른설비 (프로젝트성) | 6 | 불규칙(12·95·40·7·63) | 2026-09-14 | 77 | — | 판단 보류 (프로젝트성) |
| 청운전자 | 8 | 35 | 2026-11-02 | 28 | 0.8 | 정상 |
| 삼우정밀 | 11 | 30 | 2026-11-05 | 25 | 0.83 | 정상 |
| 삼우정밀(2공장) | 7 | 30 | 2026-10-20 | 41 | 1.37 | 정상 |

- **우선 확인 순서**: 대성정밀(3.5) → 우리테크(3.0) → 동양프레스(2.0) → 세진금속(1.0)
- **요약 카운트**: 정상 5 · 관심 1 · 위험 후보 2 · 고위험 후보 1 · 판단 보류 3
- **회당 금액(가상, 원)**: 대성정밀 2,400,000 · 한울기계 800,000 · 세진금속 1,200,000 · 우리테크 1,500,000 · 미래산업 3,100,000 · 동양프레스 900,000 · 신흥공업 500,000 · 태광산업 700,000 · 바른설비 4,000,000 · 청운전자 600,000 · 삼우정밀 1,000,000 · 삼우정밀(2공장) 650,000
- **품질 검사용 추가 3행**(합계 126행): 대성정밀 2026-08-29 완전 중복 1행, 한울기계 2026-10-10 −800,000원 취소 1행, 세진금속 날짜 "2026-13-45" 1행. 모두 제외되므로 위 결과는 변하지 않는다. 기대 품질 카운트는 정상 123 · 중복 1 · 취소 1 · 날짜 오류 1 · 미래 0 · 유사 이름 1쌍(삼우정밀 / 삼우정밀(2공장)).

### 8.2 LLM 검증 테스트 (`tests/test_llm_validate.py`)

금지어, 입력에 없는 숫자, 스키마 누락(브리핑 id 집합 불일치 포함), 키 없음, 타임아웃, 잘못된 JSON에서 모두 폴백으로 전환되는지 확인한다.

### 8.3 완료 체크리스트

- 시연 시나리오가 끊김 없이 3회 연속 5분 이내에 끝난다
- 골든 테스트와 LLM 검증 테스트가 통과한다
- API 키 없이도 분석·폴백 문안·접촉 기록이 동작한다
- 앱을 재시작해도 접촉 기록이 남아 있다
- &#91;데모 리셋\] 후 같은 시나리오가 처음부터 재현된다
- 화면 어디에도 이탈 확정 표현과 가격·납기 약속이 없다

### 8.4 시연 시나리오 (기준 명세, 5분)

| 시간 | 화면 | 동작 | 기대 결과 |
| :-- | :-- | :-- | :-- |
| 0:00\~0:30 | 문제 슬라이드 | 문제 설명 | — |
| 0:30\~1:10 | 데이터 | \[데모 파일 불러오기\] → 컬럼 자동 인식 → \[분석 실행\] | 정상 123행, 경고 3건, 유사 이름 경고 1건 |
| 1:10\~2:00 | 대시보드 | 요약 카드 → \[이번 주 브리핑\] | 5·1·2·1·3, 브리핑 카드에 "Liner Model API" 라벨 |
| 2:00\~2:50 | 거래처 | 우선 확인 1위 대성정밀 클릭 | 최근 거래 2026-09-28, 공백 63일, 평소 간격 30일, 2.1배, 거래일 14, 신뢰도 높음, VIP, 확인 질문 2개 |
| 2:50\~3:50 | 거래처·문안 | \[이메일 초안\] → \[통화 가이드\] | "AI 초안" 라벨, 자리표시자 치환, 가격·납기·할인 표현 없음 |
| 3:50\~4:30 | 거래처·문안 | 한 문장 수정 → \[복사\] | 편집본 저장, 복사 영역 표시 |
| 4:30\~5:00 | 거래처 → 대시보드 | 접촉 기록(이메일 / 회신 대기 / 2026-12-07) 저장 → 복귀 | "후속 조치 예정"에 대성정밀 표시 |

## 9. 리스크와 미확인 사항

| 리스크 | 대응 |
| :-- | :-- |
| 라이브 호출 지연·실패 | 데모 모드(캐시), 폴백, 폴백 시연 영상 별도 녹화 |
| Model API가 JSON을 흐트러뜨림 | 스키마 검증 + 1회 재생성 + 폴백 |
| Streamlit 상태 꼬임 | \[데모 리셋\], 시연 직전 재시작 |
| 일정 지연 | 판단 시점에서 P1 포기, 규칙 단순화 |
| 키 노출 | `.gitignore`, 제출 전 키 문자열 검색 |
| 규정 위반(실제 자료 사용) | 데모·영상·저장소에 가상 데이터만 |

**남은 확인 사항**: Liner Model API의 base URL·모델명·JSON 출력 지원 여부, Search API 사용 여부(P1), 제출 시각.

**제출물**: 소스코드 + README(설치·실행·데모 절차·Liner API 사용 위치), 5분 이내 데모 영상, 기획서 보완본. 기존 코드를 재사용했다면 대회 기간에 새로 만든 부분과 구분해 표기한다.

## 10. 시연 영상 상세 시나리오 (5분 이내)

목표 길이 4분 50초. 모든 수치는 8.1의 골든 데이터와 일치해야 하며, 화면에 나오지 않는 기능은 말하지 않는다. 나레이션 속 \[ \] 칸은 본인 경험·실측값으로 채운다(근거 없는 수치 금지).

### 10.1 촬영 전 준비 (D-1, 11/23\~24)

- 앱 재시작 → \[데모 리셋\] 실행 → 기준일 **2026-11-30**, 데모 모드 ON, 상태 배지 확인
- 모든 거래처의 브리핑·이메일·통화 가이드를 실제 호출해 `data/cache/`에 저장했는지 확인 (특히 대성정밀 이메일·통화)
- 화면 1920×1080, 브라우저 확대 125%, 알림·메신저·북마크바 끄기, 터미널·`.env`·API 키가 화면에 잡히지 않게 창 구성
- 데모 파일은 반드시 `data/demo_transactions.csv`(가상 데이터) 사용. 실제 고객 자료가 열려 있는 창 금지
- 2종을 따로 녹화: **본편**(키 연결 + 데모 모드) / **폴백 시연본**(`.env`에서 키 제거 후 같은 흐름). 폴백본은 API 장애 시 대체 및 "키 없이도 동작" 증빙용
- 리허설 3회 연속 5분 이내 완주 후 본 촬영. 클릭 순서는 아래 표대로 고정

### 10.2 타임라인 총괄

| 구간 | 시간 | 화면 | 핵심 메시지 |
| :-- | :-- | :-- | :-- |
| ① 문제 | 0:00\~0:30 | 문제 슬라이드 | 누가·언제·무엇이 막히나 |
| ② 데이터 | 0:30\~1:10 | 데이터 | 파일 하나로 시작, 컬럼 자동 인식, 품질 검사 |
| ③ 대시보드 | 1:10\~2:00 | 대시보드 | 판정은 코드, 브리핑은 Liner Model API |
| ④ 근거 | 2:00\~2:50 | 거래처 상세 | 숫자 근거와 "확정 불가" 문구 |
| ⑤ 문안 | 2:50\~3:50 | 거래처·문안 | AI 초안, 가격·납기 약속 없음 |
| ⑥ 편집·복사 | 3:50\~4:30 | 거래처·문안 | 최종 판단과 발송은 사람 |
| ⑦ 기록·마무리 | 4:30\~4:50 | 거래처·문안 → 대시보드 | 후속 조치까지 이어지는 흐름 |

### 10.3 구간별 상세

#### ① 문제 (0:00\~0:30) — 슬라이드 1장

- **화면**: 문제 정의 한 장. \[누가·직무·사업장 규모\] / \[언제·주기\] / \[걸리는 시간·놓친 사례\] / \[지금 방식\]을 본인 경험으로 채운 것만 표기
- **나레이션**: "\[직무\]로 일하는 \[누구\]는 \[주기\]마다 거래 파일을 엑셀로 열어 평소보다 발주가 뜸해진 거래처를 직접 찾습니다. 이 일이 \[시간\]씩 걸리고, 바쁘면 뒤로 밀려 \[사례\]가 있었습니다. Magentify Mini는 거래 파일을 올리면 평소 주기보다 연락이 뜸해진 거래처를 근거와 함께 찾고, 연락 문안까지 준비해 줍니다. 발송은 대표가 직접 합니다."
- **주의**: 이 구간은 심사 30%가 걸린 부분이므로 일반론·외부 통계 대신 본인이 겪은 장면 한 가지를 구체적으로 말한다

#### ② 데이터 (0:30\~1:10)

- **클릭 순서**: 사이드바에서 기준일 2026-11-30 · 데모 모드 상태 잠깐 비춤 → \[데모 파일 불러오기\] → 상위 5행 미리보기 → 컬럼 인식 selectbox와 '자동 인식' 배지 → 품질 검사 카드와 제외 행 표 → 유사 이름 목록 → \[분석 실행\]
- **나레이션**: "가상의 금속 가공 업체 거래처 12곳, 126행입니다. 거래처·거래일·금액 열은 헤더 이름으로 자동 인식됐습니다. 품질 검사에서 정상 123행, 경고 3건이 나왔습니다. 중복 1건, 마이너스 금액인 취소 후보 1건, 날짜 오류 1건은 사유와 함께 분석에서 제외됩니다. '삼우정밀'과 '삼우정밀(2공장)'은 이름이 비슷하다는 경고만 하고 임의로 합치지 않습니다."
- **화면에 보여야 할 값**: 정상 123 · 중복 1 · 취소 후보 1 · 날짜 오류 1 · 미래 0 · 유사 이름 1쌍
- **연출 팁**: 제외 행 표는 3행이 한 화면에 들어오게 스크롤 위치를 맞춰 둔다

#### ③ 대시보드 (1:10\~2:00)

- **클릭 순서**: (분석 실행 후 자동 이동) 요약 카드 5개 → \[이번 주 브리핑\] → 브리핑 카드의 출처 라벨 → 우선 확인 목록 위에서 아래로 훑기
- **나레이션**: "정상 5곳, 관심 필요 1곳, 이탈 위험 후보 2곳, 고위험 후보 1곳, 판단 보류 3곳입니다. 이 분류는 거래 간격 중앙값 대비 공백 일수로 코드가 계산하므로 같은 파일이면 항상 같은 결과가 나옵니다. 이번 주 브리핑은 Liner Model API가 요약 수치만 받아 작성합니다. 거래처 이름은 보내지 않고 별칭만 보냅니다." (라벨이 "(저장본)"으로 보이면) "사전에 저장해 둔 Liner Model API 응답이라는 점을 화면에 그대로 표시합니다."
- **화면에 보여야 할 값**: 카드 5·1·2·1·3, 브리핑 카드(headline, 항목별 reason·행동·톤, caution), 라벨 "Liner Model API 응답(저장본)", 우선 확인 순서 대성정밀 → 우리테크 → 동양프레스 → 세진금속
- **주의**: 브리핑 문구에 가격·납기·할인·이탈 확정 표현이 없는지 촬영 전 캐시 내용을 직접 읽어 확인

#### ④ 근거 확인 (2:00\~2:50)

- **클릭 순서**: 우선 확인 1위 '대성정밀'의 \[문안 준비\] → 상태 배지 → 근거 카드 → 간격 차트 → 확인 질문 2개 → 고정 문구
- **나레이션**: "1순위는 VIP 거래처 대성정밀입니다. 마지막 거래는 9월 28일, 공백은 63일이고 평소 간격 30일의 2.1배입니다. 거래일 14번이 근거라 신뢰도는 높음입니다. 여기서 앱은 '이탈했다'고 말하지 않습니다. 대신 대표가 확인할 질문 두 가지를 제시하고, 거래 이력만으로 이탈을 확정할 수 없다는 문구를 항상 함께 보여 줍니다."
- **화면에 보여야 할 값**: 최근 거래일 2026-09-28 · 공백 63일 · 평소 간격 30일 · 2.1배 · 거래일 수 14 · 신뢰도 높음 · VIP · 확인 질문 2개 · "거래 이력만으로 이탈을 확정할 수 없습니다."

#### ⑤ 문안 생성 (2:50\~3:50)

- **클릭 순서**: \[이메일 초안\] → 'AI 초안'·출처 라벨, 제목·본문 → \[통화 가이드\] 생성 → (**이 구간에서 실제 호출 1회**: 통화 가이드는 \[다시 생성\]으로 live 호출, 대기 중 아래 나레이션 이어 말하기) → 통화 목적·첫 인사·확인 질문·다음 단계
- **나레이션**: "이메일 초안입니다. 'AI 초안'이라고 표시되고, 거래처명은 로컬에서 치환됩니다. 가격이나 납기, 할인 같은 약속은 들어가지 않습니다. 전화가 편한 거래처를 위해 통화 가이드도 만듭니다. 이번에는 저장본이 아니라 Liner Model API를 지금 실제로 호출합니다." (응답 후) "라벨이 '응답'으로 바뀌었습니다. 응답은 금지어와 숫자 검사를 통과해야 보이고, 통과하지 못하면 기본 템플릿으로 대체됩니다."
- **화면에 보여야 할 값**: 'AI 초안' 라벨, 담당자명 입력 시 치환 또는 `[담당자명]` 유지, 가격·납기·할인 표현 없음, 라이브 호출 후 출처 라벨 "Liner Model API 응답"
- **위험 관리**: 라이브 호출이 20초 안에 끝나지 않거나 폴백으로 떨어지면 해당 컷은 폐기하고 재촬영. 편집 시 대기 시간만 잘라 붙이는 것은 허용하되, 라벨은 실제 값 그대로 둔다

#### ⑥ 편집·복사 (3:50\~4:30)

- **클릭 순서**: 이메일 본문 편집 영역에서 안부 문장 한 문장 수정 → \[저장\] → 복사 영역(`st.code`) → 복사 아이콘 클릭
- **나레이션**: "초안은 그대로 쓰지 않습니다. 말투를 대표님 방식으로 한 문장 고치고 저장하면 편집본이 기록됩니다. 아래 복사 영역에서 복사해 평소 쓰는 메일에 붙여 보내면 됩니다. 발송은 앱이 아니라 사람이 합니다."
- **수정 문장 가이드**: 수치·가격·납기가 없는 안부 표현으로만 바꾼다 (수정 후에도 금지어·약속 표현 없음)
- **화면에 보여야 할 값**: 저장 완료 메시지, 편집본이 반영된 복사 영역

#### ⑦ 접촉 기록과 마무리 (4:30\~4:50)

- **클릭 순서**: 접촉 기록 폼 — 접촉일 기본값(기준일), 채널 **이메일**, 결과 **회신 대기**, 메모 한 줄(가상 내용), 다음 연락일 **2026-12-07**, 사용한 초안 선택 → 저장 → 성공 메시지 → 사이드/버튼으로 대시보드 복귀 → 후속 조치 예정
- **나레이션**: "보낸 뒤에는 접촉 결과와 다음 연락일을 기록합니다. 12월 7일로 저장하면 대시보드의 후속 조치 예정에 대성정밀이 올라옵니다. 판정은 코드가, 말과 연락 전략은 Liner Model API가 맡고, 발송과 최종 판단은 사람이 합니다."
- **화면에 보여야 할 값**: 접촉 이력 표에 새 행, 대시보드 '후속 조치 예정'에 대성정밀 · 2026-12-07 · 상태 '예정'
- **마지막 컷**: 대시보드 화면 3초 정지 후 종료 (엔딩 슬라이드가 필요하면 한 줄 요약만)

### 10.4 촬영·편집 체크리스트

- 각 구간 끝의 "화면에 보여야 할 값"이 화면에 1초 이상 머물렀는가
- 영상 어디에도 API 키, 실제 고객·회사명, 개인정보가 없는가 (제출 전 영상 프레임 확인 + 저장소 키 문자열 검색)
- 이탈 확정 표현, 가격·납기 약속이 화면과 나레이션에 없는가
- 라이브 호출은 정확히 1회 보여 주고, 저장본은 "저장본"이라고 말하거나 라벨로 보이는가
- 총 길이 5분 이내 (목표 4:50), 자막은 수치와 상태명 위주로 최소화
- 폴백 시연본(키 없는 상태)이 별도 파일로 보관되어 있는가

### 10.5 결선 라이브용 추가 순서 (10분 버전)

시연 구간(1:00\~6:30)에 위 시나리오를 그대로 쓰고 이어서 ① 질문하기(P1을 완성한 경우) ② 컬럼명이 다른 새 파일 업로드(동의어 사전 증명) ③ 키 없이 폴백 모드 전환 순으로 보여 준다. 새 파일은 헤더를 `업체명 / 일자 / 합계금액`처럼 바꾼 사본을 미리 준비하고, 결선 전에 한 번 업로드해 인식되는지 확인해 둔다.
