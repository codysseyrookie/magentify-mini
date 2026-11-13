# Magentify Mini — 2주 데모 중심 PRD (v1.1)

> **구현 현황 안내 (2026-11-13)**: 이 문서는 Streamlit/Python 기준이다. 현재 구현은 React/TypeScript + Express/Vercel 서버리스로 바뀌었고, 기능 범위와 판정 규칙(4장), 시연 시나리오(2장)는 그대로다. 스택, 화면 수, 저장 방식, 배포의 차이는 루트 `README.md` 12장 "PRD v1.1 대비 변경 사항"을 따른다.

> 대회: 라이너 해커톤 .EXE-THON · 개발 기간 11/12\~11/25 · 작성일 2026-11-12 기준: Magentify Mini PRD v1.0을 "2주 안에, 시나리오대로 시연되는 것"에 맞춰 줄인 실행안

## 0. 원칙

1. 시연 시나리오가 곧 명세다. 시나리오에 나오지 않는 기능은 만들지 않는다.
2. 숫자와 판정은 코드가, 말과 연락 전략은 Liner Model API가 맡는다.
3. 어려운 것은 쓰지 않는다. (도구 호출, 병합 UI, 로그인, 배포, 백그라운드 작업)
4. 실패해도 시연은 계속된다. (폴백 템플릿 + 응답 캐시)
5. 실제 고객 데이터는 쓰지 않는다. 데모는 가상 데이터만 사용한다.

### 0.1 난이도를 낮추는 결정

| 항목        | v1.0            | v1.1                                        |
| :-------- | :-------------- | :------------------------------------------ |
| 화면        | 9개              | 3개                                          |
| 거래 데이터 저장 | DB 적재           | 업로드 파일을 pandas로 계산 (DB에는 표시값·초안·접촉·API 로그만) |
| 컬럼 매핑     | LLM 보조 + 저장 재사용 | 헤더 동의어 사전, 저장 재사용 없음                        |
| 거래처 병합    | 병합 UI·되돌리기      | 없음 (유사 이름 경고만, 자동 병합 안 함)                   |
| 분석 기준     | 설정 UI·변경 이력     | 코드 상수                                       |
| LLM 사용 방식 | 어댑터·도구 호출       | 분석 결과 JSON을 프롬프트에 넣고 JSON으로 받음 (도구 호출 없음)   |
| 제외        | —               | 분석 이력 비교, 백업/복원 UI, 시트 선택, 계절성, 모바일 대응, 배포  |
| 업로드 방식    | 증분·중복 정책        | "대체" 하나 (새 파일이 기존 거래를 교체)                   |

## 1. 문제 정의 (본인 경험으로 채울 칸)

심사 30%가 걸린 부분이다. 대괄호를 실제 경험으로 채운다. 수치는 직접 겪었거나 직접 잰 값만 쓰고, 근거 없는 통계는 쓰지 않는다.

* 누가: \[직무·사업장 규모]
* 언제: \[주기·상황]
* 무엇이 막히나: 거래 데이터는 엑셀에 있지만, 평소 발주 주기와 비교해 연락할 거래처를 고르고 문안을 준비하는 일이 뒤로 밀린다.
* 얼마나: \[걸리는 시간 / 놓친 사례]
* 지금 방식: \[엑셀·기억·메모]
* 한 줄 정의: 거래 파일을 올리면 평소 주기보다 연락이 뜸해진 거래처를 근거와 함께 찾고, 연락 문안까지 준비해 주는 에이전트. 발송은 대표가 직접 한다.

## 2. 시연 시나리오 (기준 명세)

### 2.1 설정

* 사용자: 금속 가공 소규모 제조사 대표 (가상 인물)
* 분석 기준일: **2026-11-30 고정** (사이드바 기본값)
* 데이터: 가상 거래처 12곳, 126행 (2025-06 \~ 2026-11), 4.7절의 명세로 생성

### 2.2 5분 영상 시나리오

| 시간         | 화면            | 동작                                                  | 화면에 나와야 할 결과                                                                                                  |
| :--------- | :------------ | :-------------------------------------------------- | :------------------------------------------------------------------------------------------------------------ |
| 0:00\~0:30 | 문제 슬라이드       | 문제 한 장 설명                                           | —                                                                                                             |
| 0:30\~1:10 | 데이터           | \[데모 파일 불러오기] → 컬럼 자동 인식 확인 → \[분석 실행]              | 매핑 3개 자동 인식. 품질 검사: 정상 123행, 경고 3건(중복 1·취소 1·날짜 오류 1), 유사 이름 경고 1건(삼우정밀 / 삼우정밀(2공장), 자동 병합 안 함)               |
| 1:10\~2:00 | 대시보드          | 요약 카드 확인 → \[이번 주 브리핑]                              | 정상 5 · 관심 1 · 위험 후보 2 · 고위험 후보 1 · 판단 보류 3. 브리핑 카드에 "Liner Model API" 라벨                                      |
| 2:00\~2:50 | 대시보드 → 거래처    | 우선 확인 1위 '대성정밀' 클릭                                  | 근거 카드: 최근 거래 2026-09-28, 공백 63일, 평소 간격 30일, 2.1배, 거래일 14, 신뢰도 높음, VIP. 확인 질문 2개. "거래 이력만으로 이탈을 확정할 수 없습니다" 문구 |
| 2:50\~3:50 | 거래처·문안        | \[이메일 초안] 생성 → \[통화 가이드] 생성                         | "AI 초안" 라벨, 거래처명 자리표시자 치환, 가격·납기·할인 표현 없음                                                                     |
| 3:50\~4:30 | 거래처·문안        | 초안 한 문장 수정 → \[복사]                                  | 편집본 저장, 복사 영역 표시                                                                                              |
| 4:30\~5:00 | 거래처·문안 → 대시보드 | 접촉 기록(이메일 / 회신 대기 / 다음 연락일 2026-12-07) 저장 → 대시보드 복귀 | "후속 조치 예정"에 대성정밀 표시                                                                                           |

### 2.3 시연 안정화 규칙

* 시연 전에 모든 거래처의 브리핑·초안을 실제로 한 번씩 호출해 `data/cache/`에 저장한다. "데모 모드"는 캐시를 먼저 쓰고, 화면에는 "Liner Model API 응답(저장본)"으로 정직하게 표시한다. 영상 중 1회는 \[새로 생성]으로 실제 호출을 보여 준다.
* \[데모 리셋] 버튼: 접촉·초안 기록 삭제, 세션 초기화, 기준일 2026-11-30 복원.
* 시연 직전 앱을 재시작하고 기준일과 상태 배지를 확인한다. API 장애에 대비해 폴백 모드 시연본을 따로 녹화해 둔다.

## 3. 범위

### Must (P0)

| ID  | 기능                                      |
| :-- | :-------------------------------------- |
| M1  | 데모 파일 불러오기, CSV/XLSX 업로드 (UTF-8·CP949)  |
| M2  | 컬럼 자동 인식과 사용자 확인                        |
| M3  | 데이터 품질 검사 5종                            |
| M4  | 거래처별 패턴 분석, 상태 분류, 우선순위                 |
| M5  | 대시보드 (요약 카드, 우선 확인 목록, 후속 조치 예정)        |
| M6  | 거래처 상세: 근거 카드, 거래 간격 차트, VIP·프로젝트성 체크박스 |
| M7  | 이번 주 브리핑 (Liner Model API)              |
| M8  | 이메일 초안·통화 가이드 (Liner Model API), 편집·복사  |
| M9  | 접촉 기록과 다음 연락일                           |
| M10 | 폴백 템플릿, 응답 캐시, 데모 리셋                    |

### Should (P1, 시간이 남을 때)

| ID | 기능                                                                 |
| :- | :----------------------------------------------------------------- |
| S1 | 질문하기: "이번 주 VIP 중 연락할 곳은?" 같은 자연어 질의 (분석 결과를 프롬프트에 넣어 답변)          |
| S2 | 업종 동향 한 줄: Liner Search API로 공개 기사 1\~3건을 찾아 출처와 함께 이메일의 연락 계기로 제안 |

### 하지 않는 것

자동 발송·자동 전화, 이탈 예측 또는 확정 표현, 홈택스 연동, 로그인·다중 사용자, 배포, 예약 실행, 모바일 대응.

## 4. 데이터와 분석 규칙

### 4.1 입력

* 필수 열: 거래처, 거래일. 선택 열: 금액, 품목.
* 인코딩은 UTF-8, CP949 순으로 시도한다. 최대 10MB, 5,000행.
* 헤더 동의어 사전 (공백 제거 후 비교):

| 필드  | 인식하는 헤더                             |
| :-- | :---------------------------------- |
| 거래처 | 거래처, 거래처명, 업체명, 상호, 공급받는자, 고객명, 매출처 |
| 거래일 | 거래일, 거래일자, 일자, 작성일자, 납품일, 주문일       |
| 금액  | 금액, 거래금액, 합계금액, 공급가액, 매출액           |

* 자동 인식된 결과를 selectbox 3개로 보여 주고 사용자가 확인·수정한다. 필수 열이 비면 \[분석 실행]을 막는다.

### 4.2 품질 검사 5종

| 번호 | 검사                                   | 처리            |
| :- | :----------------------------------- | :------------ |
| 1  | 거래처·거래일 누락 또는 날짜 파싱 실패               | 제외, 경고        |
| 2  | 완전히 같은 행 중복                          | 첫 행만 유지, 경고   |
| 3  | 음수 금액                                | 취소 후보로 제외, 경고 |
| 4  | 기준일보다 미래인 거래일                        | 제외, 경고        |
| 5  | 유사 거래처명 (정규화 후 포함 관계 또는 유사도 0.85 이상) | 경고만, 병합 안 함   |

경고가 있어도 분석은 진행할 수 있다. 제외된 행은 사유와 함께 목록으로 볼 수 있다.

### 4.3 계산 규칙 (고정)

1. 거래처 키: 공백 제거, ㈜·(주)·주식회사 제거, 소문자 변환. 괄호 안의 다른 내용은 유지한다. ("삼우정밀"과 "삼우정밀(2공장)"은 다른 거래처)
2. 같은 날의 여러 행은 하나의 거래일로 합산한다. 이후 "거래일 수"는 서로 다른 거래일의 개수다.
3. 거래일 수가 5 미만이면 **판단 보류**(사유: 데이터 부족). 프로젝트성 체크가 된 거래처도 판단 보류(사유: 프로젝트성).
4. 간격 = 인접한 거래일의 차이(일). 평소 간격 = 간격의 중앙값. 0 이하면 판단 보류.
5. 공백 = 기준일 − 마지막 거래일. 배수 = 공백 / 평소 간격.
6. 기준일 기본값은 오늘, 데모는 2026-11-30. 기준일과 파일의 마지막 거래일 차이가 30일을 넘으면 "데이터가 오래되었습니다" 배너를 띄운다.
7. 신뢰도: 거래일 수 10 이상 높음, 5\~9 보통.

### 4.4 상태 분류

| 배수               | 상태       | 표시 문구       |
| :--------------- | :------- | :---------- |
| 1.5 이하           | 정상       | 정기 거래 범위    |
| 1.5 초과 \~ 2.0 미만 | 관심 필요    | 거래 흐름 확인 권장 |
| 2.0 이상 \~ 3.0 미만 | 이탈 위험 후보 | 우선 연락 검토    |
| 3.0 이상           | 고위험 후보   | 대표 우선 확인    |
| 해당 없음            | 판단 보류    | 추가 정보 필요    |

### 4.5 우선순위

* 점수 = 상태 점수(관심 1, 위험 후보 2, 고위험 후보 3) + VIP 1.5. 정상과 판단 보류는 목록에서 제외한다.
* 점수 내림차순, 같으면 배수 내림차순.

### 4.6 근거 카드 항목

최근 거래일, 공백 일수, 평소 간격, 배수, 거래일 수, 데이터 기간, 신뢰도, VIP 여부, 확인할 질문 2개(템플릿), 고정 문구 "거래 이력만으로 이탈을 확정할 수 없습니다."

### 4.7 데모 데이터 명세 (골든 테스트 기준)

기준일 2026-11-30. 각 거래처의 거래일은 "마지막 거래일에서 평소 간격씩 거슬러 올라간 날짜"에 고정 오프셋(−2\~+2일을 순환하는 배열)을 더해 만든다. 난수는 쓰지 않는다. 마지막 거래일은 표와 정확히 일치시킨다.

| 거래처          | 거래일 수 | 평소 간격              | 최근 거래일     | 공백  | 배수   | 기대 상태          |
| :----------- | :---- | :----------------- | :--------- | :-- | :--- | :------------- |
| 대성정밀 (VIP)   | 14    | 30                 | 2026-09-28 | 63  | 2.1  | 이탈 위험 후보       |
| 한울기계         | 18    | 21                 | 2026-11-17 | 13  | 0.62 | 정상             |
| 세진금속         | 12    | 30                 | 2026-10-12 | 49  | 1.63 | 관심 필요          |
| 우리테크         | 9     | 45                 | 2026-06-20 | 163 | 3.6  | 고위험 후보         |
| 미래산업 (VIP)   | 24    | 14                 | 2026-11-20 | 10  | 0.71 | 정상             |
| 동양프레스        | 10    | 28                 | 2026-10-01 | 60  | 2.14 | 이탈 위험 후보       |
| 신흥공업         | 1     | —                  | 2026-11-10 | 20  | —    | 판단 보류 (데이터 부족) |
| 태광산업         | 3     | 60                 | 2026-08-15 | 107 | —    | 판단 보류 (데이터 부족) |
| 바른설비 (프로젝트성) | 6     | 불규칙(12·95·40·7·63) | 2026-09-14 | 77  | —    | 판단 보류 (프로젝트성)  |
| 청운전자         | 8     | 35                 | 2026-11-02 | 28  | 0.8  | 정상             |
| 삼우정밀         | 11    | 30                 | 2026-11-05 | 25  | 0.83 | 정상             |
| 삼우정밀(2공장)    | 7     | 30                 | 2026-10-20 | 41  | 1.37 | 정상             |

* 우선 확인 순서: 대성정밀(3.5) → 우리테크(3.0) → 동양프레스(2.0) → 세진금속(1.0)
* 회당 금액(가상, 원): 대성정밀 2,400,000 · 한울기계 800,000 · 세진금속 1,200,000 · 우리테크 1,500,000 · 미래산업 3,100,000 · 동양프레스 900,000 · 신흥공업 500,000 · 태광산업 700,000 · 바른설비 4,000,000 · 청운전자 600,000 · 삼우정밀 1,000,000 · 삼우정밀(2공장) 650,000
* 품질 검사용으로 거래 126행 중 3행을 추가한다: 대성정밀 2026-08-29 행의 완전 중복 1행, 한울기계 2026-10-10 −800,000원 취소 1행, 세진금속 날짜가 "2026-13-45"인 1행. 세 행 모두 제외되므로 위 표의 결과는 변하지 않는다. (정상 123행 + 경고 3행 = 126행)
* 생성 스크립트 `demo/make_demo_data.py`는 같은 파일을 항상 같은 내용으로 만들어야 한다.

## 5. Liner API 연동

### 5.1 사용처

| 기능         | API    | 입력                  | 출력           |
| :--------- | :----- | :------------------ | :----------- |
| 주간 브리핑     | Model  | 요약 카드 + 우선 확인 Top 4 | JSON         |
| 이메일 초안     | Model  | 선택한 거래처의 근거         | JSON         |
| 통화 가이드     | Model  | 선택한 거래처의 근거         | JSON         |
| 질문하기 (P1)  | Model  | 분석 결과 전체 + 질문       | 짧은 텍스트       |
| 업종 동향 (P1) | Search | 검색어 1개              | 제목·요약·출처 URL |

### 5.2 연결 방식

* OpenAI Python SDK를 쓴다. 대회 안내에 따르면 Liner Model API는 OpenAI·Anthropic SDK 코드에서 주소와 키만 바꿔 호출할 수 있다.
* `LINER_API_KEY`, `LINER_BASE_URL`, `LINER_MODEL`은 `.env`에 둔다. 실제 값은 공식 문서(liner.com/ko/developers/docs/liner-model-api)에서 확인하고, 문서에 없는 값은 가정하지 않는다.
* 도구 호출(function calling)은 쓰지 않는다. JSON 모드를 지원하지 않으면 프롬프트로 JSON만 출력하게 하고 코드에서 파싱한다.
* **첫날 스파이크**: ① 짧은 호출 성공 ② JSON 출력 10회 중 파싱 성공 횟수 ③ 평균 응답 시간 ④ 한국어 문안 품질 확인.

### 5.3 전송 데이터

* 거래처명 대신 별칭(C01, C02…)을 보낸다. 담당자명·연락처·메모·원본 파일은 보내지 않는다.
* 보내는 필드: 상태, VIP 여부, 공백 일수, 평소 간격, 배수, 거래일 수, 신뢰도.
* 응답의 `[거래처명]`, `[담당자명]` 자리표시자는 로컬에서 치환한다.

### 5.4 프롬프트 규칙 (system)

1. 입력 JSON에 있는 사실만 쓴다.
2. 가격·납기·할인·재고·혜택을 약속하지 않는다.
3. 이탈, 손실, 거래 중단을 확정하는 표현을 쓰지 않는다. 사유를 추측하지 않는다.
4. 압박하거나 구매를 강요하는 표현을 쓰지 않는다.
5. 숫자는 입력에 있는 값만 인용한다.
6. 한국어 존댓말, 지정한 JSON 스키마로만 답한다.

### 5.5 출력 스키마

```
// 브리핑
{"headline": "60자 이내", "items": [{"id": "C01", "reason": "80자 이내", "action": "email|call", "tone": "정중|가벼운 안부"}], "caution": "한 문장"}
// 이메일
{"subject": "", "body": "", "check_questions": ["", ""]}
// 통화 가이드
{"purpose": "", "opening": "", "questions": ["", ""], "next_step": "", "after_call": [""]}
```

### 5.6 출력 검증 (코드)

1. JSON 파싱과 필수 키 확인
2. 금지어 검사: 확정, 반드시, 이탈했, 손실, 할인, 특가, 무료, 납기 보장
3. 숫자 검사: 본문에 나온 숫자가 입력값 집합에 없으면 실패
4. 실패하면 1회 재생성, 그래도 실패하면 폴백 템플릿

### 5.7 호출 순서와 라벨

데모 모드: 캐시 → 라이브 호출(타임아웃 20초, 재시도 1회) → 검증 → 실패 시 폴백. 캐시 키는 `task + 별칭 + 입력 JSON`의 해시다.

| 출처     | 화면 라벨                   |
| :----- | :---------------------- |
| 라이브 호출 | Liner Model API 응답      |
| 캐시     | Liner Model API 응답(저장본) |
| 템플릿    | 기본 템플릿(폴백)              |

폴백 이메일 예시: 「안녕하세요, \[담당자명]님. 한동안 연락이 뜸해 안부차 인사드립니다. 최근 일정이나 변경된 사항이 있는지 편하게 말씀해 주세요. 도움이 필요한 부분이 있으면 확인해 드리겠습니다. 감사합니다.」 통화 가이드 폴백은 목적, 첫 인사, 확인 질문 2개, 다음 단계, 통화 후 기록 항목으로 구성한다.

## 6. 화면 (3개 + 사이드바)

* **사이드바**: 분석 기준일(기본 2026-11-30), LLM 상태 배지(연결됨 / 폴백 모드), 데모 모드 토글, \[데모 리셋].
* **화면 1 · 데이터**: \[데모 파일 불러오기] 또는 파일 업로드 → 컬럼 인식 결과 3개 selectbox → 품질 검사 결과(정상·경고·제외 행 수, 사유 목록) → \[분석 실행].
* **화면 2 · 대시보드**: 데이터 최신성 배너(해당 시) → 요약 카드 5개 → 이번 주 브리핑 카드 → 우선 확인 목록(거래처, 상태, 공백, 배수, \[문안 준비]) → 후속 조치 예정(다음 연락일이 있는 거래처, 지난 날짜는 "후속 조치 필요" 표시) → 질문 입력창(P1).
* **화면 3 · 거래처·문안**: 거래처 선택 → 근거 카드 → 거래일 간격 차트(`st.bar_chart`) → VIP·프로젝트성 체크박스 → \[이메일 초안] \[통화 가이드] → 편집 영역과 복사(`st.code`의 복사 아이콘) → 접촉 기록 폼 → 접촉 이력 표.
* 색에만 의존하지 않고 상태는 글자로 함께 표시한다. 큰 글씨와 단순한 표를 쓴다.

## 7. 기술 구성

| 영역    | 선택                           |
| :---- | :--------------------------- |
| 언어·UI | Python 3.11, Streamlit       |
| 데이터   | pandas, openpyxl             |
| LLM   | openai SDK (Liner Model API) |
| 저장    | sqlite3 (표준 라이브러리, ORM 없음)   |
| 설정    | python-dotenv                |
| 테스트   | pytest                       |

```
magentify-mini/
├── app.py                  # Streamlit 3개 화면
├── core/
│   ├── ingest.py           # 읽기, 컬럼 인식, 품질 검사
│   ├── analysis.py         # 계산, 상태, 우선순위
│   ├── llm.py              # 호출, 프롬프트, 검증, 폴백, 캐시
│   └── store.py            # SQLite
├── demo/make_demo_data.py
├── tests/test_golden.py, test_llm_validate.py
├── data/                   # app.db, cache/, demo_transactions.csv
└── .env.example, .gitignore, requirements.txt, README.md
```

### SQLite 테이블 4개

| 테이블             | 컬럼                                                                                                           |
| :-------------- | :----------------------------------------------------------------------------------------------------------- |
| customer\_flags | customer\_key(PK), display\_name, vip, project\_based, updated\_at                                           |
| drafts          | id, customer\_key, kind(email/call), source(liner/cache/fallback), original\_json, edited\_text, created\_at |
| touchpoints     | id, customer\_key, contact\_date, channel, outcome, note, next\_contact\_date, created\_at                   |
| api\_logs       | id, task, ok, latency\_ms, created\_at                                                                       |

접촉 결과 값: 연락 예정, 연락 완료, 회신 대기, 견적 요청, 재주문 확인, 거래 보류, 연락 불필요. 거래 데이터는 DB에 넣지 않고 업로드 파일(`data/`에 사본 저장)에서 읽는다.

## 8. 일정과 체크포인트

| 날짜        | 작업                                          | 완료 기준                                  |
| :-------- | :------------------------------------------ | :------------------------------------- |
| 11/12\~13 | Liner API 스파이크, 데모 데이터 생성기, 업로드·컬럼 인식·품질 검사 | 5.2 스파이크 4항목 확인, 126행 파일 생성, 품질 카운트 일치 |
| 11/14\~15 | 분석 엔진 + 골든 테스트                              | 4.7 표의 12개 결과 전부 일치                    |
| 11/16\~17 | LLM 모듈(브리핑·이메일·통화), 검증, 폴백, 캐시              | 키 없음·타임아웃·잘못된 JSON에서 폴백 동작             |
| 11/18\~19 | 3개 화면 연결, 접촉 기록, 데모 리셋                      | 2.2 시나리오 1회 완주                         |
| 11/20\~21 | 시나리오 리허설 1차, 버그 수정, (P1) 질문하기               | 5분 이내 3회 연속 완주                         |
| 11/22\~23 | README, 기획서 보완, 실측 시간 측정, (여유 시) 업종 동향      | 제출 체크리스트 대부분 완료                        |
| 11/24     | 데모 영상 촬영·편집, 키·개인정보 점검                      | 5분 이내 영상, 키 문자열 검색 결과 없음               |
| 11/25     | 버퍼와 제출                                      | 제출 시각은 개별 안내 확인                        |

**판단 시점**

* 11/15 말: 골든 테스트가 안 맞으면 규칙을 더 단순하게 줄인다. 규칙 설명 때문에 일정을 쓰지 않는다.
* 11/17 말: 라이브 호출이 불안정하면 캐시와 폴백 중심으로 시연을 구성한다.
* 11/21 말: 진행이 늦으면 P1(S1·S2)은 모두 포기한다.

## 9. 테스트와 수용 기준

* `test_golden.py`: 4.7의 12개 거래처의 상태·배수·우선순위 순서, 품질 검사 카운트(정상 123, 경고 3, 유사 이름 1)가 일치한다.
* `test_llm_validate.py`: 금지어, 입력에 없는 숫자, 스키마 누락, 키 없음, 타임아웃, 잘못된 JSON에서 폴백으로 전환된다.

**완료 체크리스트**

* 2.2 시나리오가 처음부터 끝까지 끊김 없이 3회 연속 5분 이내에 끝난다
* 골든 테스트와 LLM 검증 테스트가 통과한다
* API 키 없이도 분석·폴백 문안·접촉 기록이 동작한다
* 앱을 재시작해도 접촉 기록이 남아 있다
* \[데모 리셋] 후 같은 시나리오가 처음부터 재현된다
* 화면 어디에도 이탈 확정 표현과 가격·납기 약속이 없다

## 10. 심사 기준 대응

| 기준           | 비중  | 보여줄 것                                                                                         |
| :----------- | :-- | :-------------------------------------------------------------------------------------------- |
| 문제 정의        | 30% | 1장의 본인 경험(누가·언제·얼마나), 영상 0:00\~0:30                                                           |
| 완성도          | 30% | 업로드부터 접촉 기록까지 끊김 없는 시나리오, 품질 검사, 폴백                                                           |
| Liner API 활용 | 20% | Model API가 브리핑·이메일·통화 가이드를 만드는 장면, API 응답 라벨, api\_logs 호출 수. (여유 시) Search로 업종 동향 출처 표시      |
| 확장성·임팩트      | 20% | 재주문 주기가 있는 B2B 전반(설비 정비 주기, 소모품 납품, 구독·재방문)으로 확장. 시간 절감은 직접 잰 값(수작업 \[  ]분 vs 도구 \[  ]초)으로 제시 |

## 11. 제출·규정 체크

* 소스코드(GitHub 저장소 또는 압축 파일) + README(설치, 실행, 데모 절차, Liner API 사용 위치)
* 5분 이내 데모 영상
* 기획서(신청 때 낸 내용을 보완)
* 가상 데이터만 사용 (실제 고객·회사 자료·개인정보 없음)
* API 키가 저장소와 영상에 노출되지 않음 (`.env` 제외, 커밋 전 키 문자열 검색)
* 기존 코드를 재사용했다면 원래 있던 부분과 대회 기간에 새로 만든 부분을 구분해 표기
* 개발은 신청서에 등록한 팀원만 수행
* 제출 마감(11/25)과 제출 방식·시각은 참가 확정 후 개별 안내로 확인

## 12. 결선 10분 버전

| 시간          | 내용                                                         |
| :---------- | :--------------------------------------------------------- |
| 0:00\~1:00  | 문제 (본인 경험)                                                 |
| 1:00\~6:30  | 라이브 시연: 2.2 시나리오 + 질문하기 + 컬럼명이 다른 새 파일 업로드 + 키 없이 폴백 모드 전환 |
| 6:30\~8:30  | 확장성과 임팩트 (실측 시간, 적용 가능한 업종)                                |
| 8:30\~10:00 | 정리: 판정은 코드, 말과 전략은 Liner Model, 발송은 사람                     |

**예상 질문 (답변 방향)**

1. 왜 판정을 LLM이 하지 않나? → 같은 입력에 같은 결과가 나오고, 근거를 설명할 수 있어야 대표가 신뢰한다. LLM은 언어와 연락 전략을 맡는다.
2. 이탈 예측 정확도는? → 예측 모델이 아니라 거래 패턴 이상 신호다. 기준은 초기 규칙이며 파일럿에서 검증할 계획이다.
3. 실제 데이터를 넣으면? → 로컬 저장이고 API에는 별칭과 요약 수치만 보낸다.
4. 다른 업종에도 되나? → 재주문 주기가 있고 거래 파일이 있으면 컬럼 동의어 매핑으로 적용된다.
5. 시간 절감 근거는? → 직접 측정한 수작업 시간과 도구 시간 비교.

## 13. 리스크와 대응

| 리스크                    | 대응                            |
| :--------------------- | :---------------------------- |
| 라이브 호출 지연·실패           | 데모 모드(캐시), 폴백, 폴백 시연 영상 별도 녹화 |
| Model API가 JSON을 흐트러뜨림 | 스키마 검증 + 1회 재생성 + 폴백          |
| Streamlit 상태 꼬임        | \[데모 리셋], 시연 직전 재시작           |
| 일정 지연                  | 판단 시점(8장)에서 P1 포기, 규칙 단순화     |
| 키 노출                   | `.gitignore`, 제출 전 키 문자열 검색   |
| 규정 위반(실제 자료 사용)        | 데모·영상·저장소에 가상 데이터만            |

**남은 확인 사항**: Liner Model API의 base URL·모델명·JSON 출력 지원, Search API 사용 여부, 제출 시각.

## Part 2 · 개발 명세 (Dev Spec)

이 파트는 바로 구현할 수 있는 수준의 명세다. 7장(기술 구성)과 8장(일정)을 대체하며, 앞 장과 충돌하면 Part 2가 우선한다. 판정 규칙의 기준값은 4장을 그대로 따른다.

### A. 제품 개요 (개발자용)

거래 파일(CSV/XLSX)을 읽어 거래처별 평소 주문 간격과 현재 공백을 비교하고, 연락이 뜸해진 거래처의 근거와 연락 문안을 만들어 주는 로컬 Streamlit 앱이다. 발송은 사용자가 직접 한다. 사용자는 거래 파일을 엑셀로 관리하는 소규모 제조사 대표 1명이며 로그인은 없다.

**핵심 흐름**

1. 파일 불러오기
2. 컬럼 확인
3. 품질 검사
4. 분석 실행
5. 대시보드에서 우선 확인 거래처 선택
6. 근거 확인, 문안 생성, 수정, 복사
7. 접촉 결과 기록

**역할 분담**

| 담당                    | 하는 일                                  |
| :-------------------- | :------------------------------------ |
| 코드 (pandas)           | 정규화, 품질 검사, 간격·배수·상태·우선순위, 근거 문장(템플릿) |
| Liner Model API       | 주간 브리핑, 이메일 초안, 통화 가이드, (P1) 질문 답변    |
| Liner Search API (P1) | 업종 동향 기사 1\~3건의 제목·출처                 |
| 사용자                   | 매핑 확인, 문안 검토·수정·발송, 접촉 기록             |

**용어**

| 용어                       | 정의                                                             |
| :----------------------- | :------------------------------------------------------------- |
| 거래일 수                    | 같은 날의 여러 행을 합친 뒤, 서로 다른 거래일의 개수                                |
| 공백 (gap\_days)           | 기준일 − 마지막 거래일 (일)                                              |
| 평소 간격 (median\_interval) | 인접한 거래일 간격(일)의 중앙값                                             |
| 배수 (ratio)               | gap\_days / median\_interval                                   |
| 거래처 키 (customer\_key)    | 4.3의 정규화 결과                                                    |
| 별칭 (alias)               | C01, C02… 형식의 임시 식별자. 거래처 키를 오름차순으로 정렬해 순서대로 부여하고, API 전송에만 쓴다 |

### B. 기술 아키텍처

```
[Browser]
    |
[Streamlit  app.py]   3 screens, st.session_state
    |
    +--> core/ingest.py ---> pandas DataFrame   (copy saved in data/uploads/)
    |
    +--> core/analysis.py -> list[Assessment]   (pure functions, no I/O)
    |
    +--> core/llm.py ------> data/cache/*.json   (hit -> return)
    |         |
    |         +-- miss --> OpenAI SDK --> Liner Model API
    |         |                |  timeout / error / rule violation
    |         +----------------+--> fallback templates
    |
    +--> core/store.py ----> SQLite  data/app.db
```

| 모듈               | 책임                       | 하면 안 되는 것              |
| :--------------- | :----------------------- | :--------------------- |
| app.py           | 화면, 상태 관리, core 호출       | 판정·계산 규칙 구현            |
| core/ingest.py   | 파일 읽기, 컬럼 인식, 정규화, 품질 검사 | DB·LLM 호출              |
| core/analysis.py | 간격·배수·상태·신뢰도·우선순위, 근거 문장 | 파일·DB·네트워크 접근 (테스트 대상) |
| core/llm.py      | 프롬프트, 호출, 검증, 캐시, 폴백, 로그 | 분석 값 재계산               |
| core/store.py    | SQLite 읽기·쓰기             | pandas 사용              |

**데이터 흐름**

1. 업로드 또는 데모 → `read_file` → `raw_df`. 원본 사본을 `data/uploads/`에 저장하고 경로를 settings에 기록한다. 새 파일은 이전 데이터를 교체한다.
2. `suggest_mapping` → 사용자 확인 → `build_clean`(정규화 + 품질 검사) → `clean_df`, `quality`
3. [분석 실행] → `analyze(clean_df, flags, ref_date)` → `assessments`
4. 대시보드: `prioritize` → 요약 카드, 우선 확인 목록, `generate_briefing`
5. 거래처 선택 → `generate_email` 또는 `generate_call_guide` → drafts 저장
6. 접촉 기록 → touchpoints 저장 → 후속 조치 예정 목록 갱신

**st.session\_state 키**

| 키                  | 내용                                  |
| :----------------- | :---------------------------------- |
| page               | 현재 화면 (data / dashboard / customer) |
| raw\_df, mapping   | 읽은 원본, 확정된 컬럼 매핑                    |
| clean\_df, quality | 정제 결과, QualityResult                |
| assessments        | list\[Assessment] (우선순위 정렬 전)       |
| ref\_date          | 분석 기준일                              |
| briefing           | 마지막 브리핑 LlmResult                   |
| selected\_key      | 거래처 상세 화면에서 선택한 customer\_key       |
| demo\_mode         | 데모 모드 여부                            |

**운영 규칙**

* 모든 호출은 동기다. 분석은 \[분석 실행]과 기준일·플래그 변경 때만 다시 계산하고, 그 밖의 재실행에서는 session\_state 값을 쓴다.
* 앱을 재시작하면 settings의 `current_data_path`로 파일을 다시 읽어 `build_clean`과 `analyze`를 자동 실행한다.
* 화면 이동은 버튼의 `on_click` 콜백에서 `page`와 `selected_key`를 설정한다.
* 모듈 경계의 예외는 `AppError(code, message)`로 바꾸고, 화면은 `st.error(message)`로 보여 준다. LLM 실패는 예외가 아니라 `LlmResult(source='fallback')`로 돌려준다.

**환경변수 (.env)**

| 이름                  | 기본값           | 설명                                 |
| :------------------ | :------------ | :--------------------------------- |
| LINER\_API\_KEY     | (없음)          | 없으면 폴백 모드                          |
| LINER\_BASE\_URL    | 공식 문서 확인      | Model API 주소                       |
| LINER\_MODEL        | 공식 문서 확인      | 모델명                                |
| LINER\_TIMEOUT\_SEC | 20            | 호출 제한 시간                           |
| LINER\_DAILY\_LIMIT | 200           | 하루 live 호출 상한. 넘으면 폴백으로 처리 (비용 보호) |
| DEMO\_MODE          | 1             | 1이면 캐시 우선                          |
| REF\_DATE\_DEFAULT  | 2026-11-30    | 데모 기준일                             |
| DB\_PATH            | ./data/app.db | SQLite 파일                          |

### C. 기능 명세

각 기능의 ID는 3장의 M1\~M10, S1\~S2와 대응한다. 판정 규칙의 수치는 4장이 기준이다.

#### F01. 파일 불러오기 (M1)

* **입력**: [데모 파일 불러오기] 버튼 또는 `st.file_uploader`(csv, xlsx)
* **처리**: 확장자와 크기(10MB 이하)를 검사한다. CSV는 utf-8-sig → cp949 순서로 디코딩하고, XLSX는 첫 시트를 읽는다. 5,000행을 넘으면 앞 5,000행만 읽고 경고한다. 사본을 `data/uploads/`에 저장하고 경로를 settings에 기록한다. 새 파일은 이전 데이터를 교체한다.
* **출력**: 파일명, 크기, 행 수, 열 수, 상위 5행 미리보기
* **오류**: E\_FILE\_TYPE, E\_FILE\_SIZE, E\_FILE\_EMPTY, E\_NO\_HEADER, E\_DECODE (E절 오류 코드 표)
* **수용 기준**: 데모 파일이 \[데모 파일 불러오기] 한 번으로 읽힌다.

#### F02. 컬럼 인식과 확인 (M2)

* **처리**: 헤더의 공백을 제거하고 소문자로 바꾼 뒤 4.1의 사전과 정확히 일치하는 열을 먼저 고르고, 없으면 사전 단어를 포함한 열을 고른다. 한 열은 한 필드에만 지정할 수 있다.
* **UI**: 필드(거래처, 거래일, 금액, 품목)마다 selectbox(모든 열과 '(없음)'). 자동 인식된 필드에는 '자동 인식' 배지를 붙인다.
* **규칙**: 거래처와 거래일이 지정되지 않았거나 같은 열이면 \[분석 실행]을 비활성화하고 E\_MAPPING을 보여 준다.
* **수용 기준**: 데모 파일은 사용자 조작 없이 거래처·거래일·금액·품목이 인식된다.

#### F03. 정규화와 품질 검사 (M3)

* **정규화**: 날짜는 `pd.to_datetime(errors='coerce')`로 변환한다. 금액은 쉼표·원·₩·공백을 제거해 정수로 바꾸고 실패하면 비워 둔다. 거래처명은 앞뒤 공백을 지우고 연속 공백을 하나로 만든다. 원본 행 번호(`source_row`, 헤더 다음 줄이 2)를 보존한다.
* **검사 순서**: ① 거래처·거래일 누락 또는 날짜 변환 실패 ② 완전 중복(거래처 키, 날짜, 금액, 품목이 모두 같은 행, 첫 행만 유지) ③ 음수 금액 ④ 기준일보다 미래인 날짜 ⑤ 유사 거래처명
* **유사 거래처명**: 거래처 키 쌍에서 한쪽이 다른 쪽을 포함하거나 `difflib.SequenceMatcher` 유사도가 0.85 이상이면 경고 목록에 올린다. 병합하지 않는다.
* **출력**: `QualityResult` (E절 참고)
* **UI**: 정상·중복·취소 후보·날짜 오류·미래 날짜 행 수 카드, 제외 행 표(원본 행 번호, 거래처, 날짜, 사유), 유사 이름 목록, \[분석 실행]
* **수용 기준**: 데모 파일에서 정상 123, 중복 1, 취소 후보 1, 날짜 오류 1, 미래 0, 유사 이름 1쌍(삼우정밀 / 삼우정밀(2공장))이 나온다.

#### F04. 분석 실행 (M4)

* **입력**: `clean_df`, 거래처별 플래그(VIP, 프로젝트성), `ref_date`
* **처리**: 4.3\~4.5의 규칙을 그대로 구현한다. 같은 날 행은 금액을 합쳐 하나의 거래일로 만든다. 거래일 수가 5 미만이거나 프로젝트성이면 판단 보류로 두며, 둘 다 해당하면 사유는 데이터 부족으로 한다. 거래일 수 10 이상이면 신뢰도 high, 5\~9이면 medium이다.
* **근거 문장(`reasons`)**: 템플릿으로 만든다. 예: `최근 거래일 2026-09-28, 공백 63일, 평소 간격 30일의 2.1배`
* **확인 질문(`questions`)**: 상태별 템플릿 2개. 예: `최근 발주 일정에 변경이 있었는지`, `현재 필요한 물량이나 일정이 있는지`
* **출력**: `list[Assessment]`, 요약 카운트(상태별 거래처 수)
* **수용 기준**: `tests/test_golden.py` 통과

#### F05. 대시보드 (M5)

* **구성 순서**: 데이터 최신성 배너(해당 시) → 요약 카드 5개 → 주간 브리핑 카드 → 우선 확인 목록 → 후속 조치 예정 → (P1) 질문 입력창
* **요약 카드**: 정상 관리, 관심 필요, 이탈 위험 후보, 고위험 후보, 판단 보류
* **우선 확인 목록**: 순위, 거래처, 상태, 최근 거래일, 공백(일), 평소 간격(일), 배수, 신뢰도, [문안 준비] 버튼. 최대 10행이며 4.5의 순서를 따른다. [문안 준비]는 `on_click`으로 `selected_key`와 `page`를 설정한다.
* **후속 조치 예정**: 거래처마다 가장 최근 접촉 기록의 `next_contact_date`가 있는 건을 날짜순으로 보여 준다. 기준일보다 이전이면 '후속 조치 필요', 아니면 '예정'으로 표시한다.
* **수용 기준**: 2.2 시나리오 1:10\~2:00의 결과(카운트 5·1·2·1·3, 우선 확인 순서)가 나온다.

#### F06. 주간 브리핑 (M7)

* **입력**: 요약 카운트와 우선 확인 상위 4곳(별칭, 상태, VIP, 공백, 평소 간격, 배수, 거래일 수, 신뢰도)
* **처리**: `generate_briefing` → 응답 검증 → 별칭을 실제 거래처명으로 바꿔 카드로 보여 준다. 카드에는 headline, 항목별 reason·추천 행동(이메일/통화)·톤, caution과 출처 라벨(5.7)이 들어간다.
* **버튼**: \[이번 주 브리핑]\(데모 모드는 캐시 우선), \[새로 생성]\(캐시 무시)
* **수용 기준**: 응답의 항목 id 집합이 입력과 같고, 화면에는 거래처명이 표시된다.

#### F07. 거래처 상세 (M6)

* **구성**: 거래처 선택(기본값은 `selected_key`) → 상태 배지 → 근거 카드(4.6) → 거래 간격 차트(`st.bar_chart`, 거래일 순서별 간격, 평소 간격은 캡션) → 최근 거래 10건 표(날짜, 금액, 품목) → VIP·프로젝트성 체크박스 → 문안 영역(F08\~F10) → 접촉 기록(F11)
* **체크박스**: 값을 바꾸면 `store.set_flag` 후 `analyze`를 다시 실행하고 화면을 갱신한다.
* **판단 보류**: 사유를 표시하되 문안 생성은 막지 않는다. 근거 카드에는 '근거 부족' 문구를 붙인다.
* **수용 기준**: 대성정밀의 근거 카드 값이 4.7 표와 일치한다.

#### F08. 이메일 초안 (M8)

* **입력**: 선택한 `Assessment`, 선택 입력 '담당자명'
* **처리**: `generate_email` → 검증 통과본 → `[거래처명]`을 거래처명으로 치환한다. 담당자명이 비어 있으면 `[담당자명]`을 그대로 둔다.
* **출력**: 제목, 본문 편집 영역, 확인 질문 2개, 'AI 초안' 라벨, 출처 라벨. `drafts`에 저장한다.
* **수용 기준**: 금지어와 입력에 없는 숫자가 없다.

#### F09. 통화 가이드 (M8)

* **처리**: `generate_call_guide` → 검증 통과본
* **출력**: 통화 목적, 첫 인사, 확인 질문 2개, 다음 단계, 통화 후 기록 항목 3개. 'AI 초안' 라벨과 출처 라벨. `drafts`에 저장한다.

#### F10. 편집·복사·저장 (M8)

* **편집**: `st.text_area`에서 수정하고 [저장]을 누르면 `drafts.edited_text`를 갱신한다. `original_json`은 바꾸지 않는다.
* **복사**: 편집본을 `st.code`로 한 번 더 보여 주고 오른쪽 위 복사 아이콘을 쓴다.
* **\[다시 생성]**: 캐시를 무시하고 live 호출한다. 실패하면 직전 결과를 유지하고 사유를 안내한다.
* **수용 기준**: 앱을 재시작해도 마지막 편집본이 복원된다.

#### F11. 접촉 기록과 후속 조치 (M9)

* **폼**: 접촉일(기본값 기준일), 채널(이메일/전화/기타), 결과(연락 예정, 연락 완료, 회신 대기, 견적 요청, 재주문 확인, 거래 보류, 연락 불필요), 메모(500자 이내), 다음 연락일(선택, 접촉일 이후), 사용한 초안(선택)
* **저장**: DB 커밋이 성공한 뒤에만 성공 메시지를 보여 준다. 실패하면 E\_DB를 보여 준다.
* **표시**: 거래처별 접촉 이력(최신순), 대시보드 후속 조치 예정
* **수용 기준**: 2.2 시나리오 4:30\~5:00(이메일 / 회신 대기 / 다음 연락일 2026-12-07)이 저장되고 대시보드에 나타난다.

#### F12. LLM 호출 계층 (M10)

1. 입력 JSON을 만든다(별칭만 사용).
2. `cache_key = sha256(task + 입력 JSON)`
3. 데모 모드이고 `force_live`가 아니면 캐시를 조회해 적중 시 `source='cache'`로 돌려준다.
4. 오늘 live 호출 수가 `LINER_DAILY_LIMIT` 이상이거나 키가 없으면 폴백한다.
5. live 호출(제한 20초). 타임아웃·429·5xx는 1.5초 뒤 1회 재시도하고, 401·403은 재시도하지 않는다.
6. 응답을 파싱하고 검증한다. 위반이면 위반 사유를 프롬프트에 덧붙여 1회 다시 요청한다.
7. 성공하면 캐시 파일에 저장한다. 모든 시도를 `api_logs`에 기록한다.
8. 끝까지 실패하면 폴백 템플릿을 돌려주고 `error_code`에 사유를 남긴다.
* **수용 기준**: 키를 지운 상태에서도 시나리오 2.2가 폴백으로 끝까지 진행된다.

#### F13. 사이드바·데모 리셋 (M10)

* 분석 기준일 `date_input`(기본값 `REF_DATE_DEFAULT`, 변경하면 재분석)
* LLM 상태 배지: 키가 있고 최근 호출이 성공하면 '연결됨', 아니면 '폴백 모드'
* 데모 모드 토글
* [데모 리셋]: 확인 체크 후 `touchpoints`와 `drafts`를 지우고 `customer_flags`를 데모 시드로 되돌리며 session\_state와 기준일을 초기화한다. 캐시 파일은 지우지 않는다.
* API 키는 화면 어디에도 표시하지 않는다.

#### P1. F14 질문하기 (S1)

* 질문(200자 이내)과 분석 결과 요약 JSON(별칭 기준)을 보내고 5문장 이내의 답을 받는다. 금지어·숫자 검사를 같은 방식으로 적용하고, 별칭은 거래처명으로 치환한다. 근거가 없는 질문에는 '제공된 분석 결과로는 알 수 없습니다'라고 답하게 한다.

#### P1. F15 업종 동향 (S2)

* 이메일 생성 화면의 체크박스 '업종 동향 포함'을 켜면 Liner Search API로 검색어(기본 '금속 가공 업계 동향')를 1회 호출한다.
* 결과 3건의 제목·출처 URL·발행일을 화면에 보여 주고, 이메일 프롬프트에는 제목만 전달해 '최근 업계 소식' 정도로만 언급하게 한다. 사실 주장은 하지 않게 한다. 실패하면 생략한다.

### D. DB 구조 (SQLite)

거래 데이터는 DB에 넣지 않는다. 업로드 파일 사본에서 읽어 오고, DB에는 사용자가 만든 정보와 호출 기록만 둔다. 날짜는 `YYYY-MM-DD` 문자열, 시각은 `YYYY-MM-DD HH:MM:SS` 문자열로 저장한다. 7장의 테이블 4개 안은 아래 5개로 대체한다.

```
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

**접촉 결과 값 (touchpoints.outcome)**

| 저장값                | 화면 표시  |
| :----------------- | :----- |
| planned            | 연락 예정  |
| contacted          | 연락 완료  |
| waiting\_reply     | 회신 대기  |
| quote\_requested   | 견적 요청  |
| reorder\_confirmed | 재주문 확인 |
| on\_hold           | 거래 보류  |
| not\_needed        | 연락 불필요 |

**settings 키**

| 키                   | 값                                             |
| :------------------ | :-------------------------------------------- |
| current\_data\_path | 마지막으로 불러온 파일 사본 경로                            |
| mapping\_json       | 마지막 확정 컬럼 매핑 `{customer, date, amount, item}` |
| ref\_date           | 사용자가 바꾼 기준일 (없으면 `REF_DATE_DEFAULT`)          |
| demo\_mode          | 0 또는 1                                        |

**규칙**

* `customer_flags`에는 사용자가 체크박스를 바꿀 때만 행이 생긴다. 행이 없으면 VIP·프로젝트성 모두 0이다. 거래처 키가 같으면 파일을 교체해도 속성이 유지된다.
* 데모 시드: 대성정밀 `vip=1`, 미래산업 `vip=1`, 바른설비 `project_based=1`. \[데모 리셋]과 앱 첫 실행의 데모 불러오기에서 적용한다.
* `drafts.original_json`에는 검증을 통과한 LLM 출력 JSON(5.5 스키마)을 그대로 저장한다.
* `followups(ref_date)`: 거래처마다 가장 최근 `touchpoints` 행을 고른 뒤 `next_contact_date`가 있는 것만 반환한다.
* `api_logs`는 live 호출을 시도할 때마다 1행을 쓰고, 캐시 적중은 기록하지 않는다. 하루 호출 수는 오늘 날짜의 `ok` 여부와 관계없는 행 수다.

**파일 저장소와 Git 정책**

| 경로                          | 내용                                        | Git                                         |
| :-------------------------- | :---------------------------------------- | :------------------------------------------ |
| data/app.db                 | SQLite                                    | 제외                                          |
| data/uploads/               | 업로드 파일 사본                                 | 제외                                          |
| data/demo\_transactions.csv | 데모 거래 126행                                | 포함                                          |
| data/cache/{sha256}.json    | `{task, key, created_at, model, content}` | 포함 (가상 데이터 응답만 있으므로 심사자가 키 없이도 저장본을 볼 수 있다) |
| .env                        | 키                                         | 제외 (`.env.example`만 포함)                     |

### E. API·모듈 인터페이스

#### E1. 데이터 구조와 함수 시그니처

```
# core/models.py
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
    def __init__(self, code: str, message: str): ...
```

```
# core/ingest.py
def read_file(data: bytes, filename: str) -> pd.DataFrame: ...
def suggest_mapping(df: pd.DataFrame) -> dict: ...           # {customer, date, amount, item} -> 열 이름 또는 None
def build_clean(df: pd.DataFrame, mapping: dict, ref_date: date) -> QualityResult: ...

# core/analysis.py
def normalize_key(name: str) -> str: ...
def assign_aliases(keys: list) -> dict: ...                   # 키 오름차순 -> C01, C02...
def analyze(clean_df: pd.DataFrame, flags: dict, ref_date: date) -> list: ...   # flags: {key: (vip, project_based)}
def prioritize(items: list) -> list: ...                      # 4.5 정렬, normal·hold 제외
def summarize(items: list) -> dict: ...                       # 상태별 거래처 수

# core/llm.py
def generate_briefing(top: list, summary: dict, *, demo_mode: bool, force_live: bool = False) -> LlmResult: ...
def generate_email(a: Assessment, *, demo_mode: bool, force_live: bool = False, news: list | None = None) -> LlmResult: ...
def generate_call_guide(a: Assessment, *, demo_mode: bool, force_live: bool = False) -> LlmResult: ...
def answer_question(q: str, items: list) -> LlmResult: ...    # P1
def validate(task: str, content: dict, allowed_numbers: set, allowed_ids: set | None = None) -> list: ...   # 위반 사유 목록, 빈 목록이면 통과
def fallback(task: str, a: Assessment | None = None, top: list | None = None) -> dict: ...
def render_placeholders(text: str, display_name: str, contact_name: str | None) -> str: ...

# core/store.py
def init_db() -> None: ...
def get_flags() -> dict: ...
def set_flag(customer_key: str, display_name: str, *, vip: bool | None = None, project_based: bool | None = None) -> None: ...
def save_draft(customer_key: str, kind: str, source: str, content: dict, ref_date: str) -> int: ...
def update_draft_text(draft_id: int, edited_text: str) -> None: ...
def latest_draft(customer_key: str, kind: str) -> dict | None: ...
def add_touchpoint(customer_key: str, contact_date: str, channel: str, outcome: str,
                   note: str | None, next_contact_date: str | None, draft_id: int | None) -> int: ...
def list_touchpoints(customer_key: str) -> list: ...
def followups(ref_date: str) -> list: ...
def log_api(task: str, api: str, ok: bool, error_code: str | None, latency_ms: int | None) -> None: ...
def calls_today() -> int: ...
def get_setting(key: str, default: str | None = None) -> str | None: ...
def set_setting(key: str, value: str) -> None: ...
def reset_demo() -> None: ...
```
