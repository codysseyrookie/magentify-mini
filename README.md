# Magentify Mini (마젠티파이 미니)

> **소규모 제조업 대표를 위한 거래처 발주 주기 & 이탈 위험 감지 에이전트**
> 라이너 해커톤 (.EXE-THON) 출품작 · 개발 기간 2026-11-12 ~ 11-25
> **핵심 원칙**: 숫자와 판정은 코드가, 말과 연락 전략은 Liner Model API가, 최종 판단과 발송은 사람이 한다.

---

## 1. 제품 개요

- **한 줄 정의**: 엑셀 거래 내역(CSV/XLSX)을 올리면 평소 발주 간격보다 연락이 뜸해진 거래처를 객관적 수치 근거와 함께 찾아내고, 대표가 바로 검토해 쓸 수 있는 이메일 초안과 통화 가이드까지 준비해 주는 에이전트.
- **사용자**: 거래처 발주 흐름을 엑셀로 관리하는 소규모 제조사 대표 1명 (로그인 없음).
- **하지 않는 것**: 자동 발송·자동 전화, 이탈 "예측" 또는 확정 표현, 가격·납기·할인 약속. 발송과 통화는 항상 사람이 한다.

## 2. 역할 분담

| 담당 | 위치 | 하는 일 |
| :--- | :--- | :--- |
| **코드** | `src/analysis.ts` | 거래처 키 정규화, 품질 검사 5종, 거래 간격 중앙값과 공백 배수 계산, 5단계 상태 분류, 우선순위, 근거 문장(템플릿). 같은 입력이면 항상 같은 결과. |
| **Liner Model API** | `src/llm.ts` + `api/_llm.ts` | 주간 브리핑, 이메일 초안, 통화 가이드 작성. 거래처명 대신 별칭(C01…)과 요약 수치만 전송한다. |
| **코드 (안전장치)** | `src/llm.ts` | 응답 검증(스키마, 금지어, 입력에 없는 숫자), 1회 재요청, 폴백 템플릿, 응답 저장본. |
| **사용자(대표)** | 화면 | 컬럼 매핑 확인, VIP·프로젝트성 지정, 문안 검토·수정·복사, 직접 발송·통화, 접촉 결과와 다음 연락일 기록. |

## 3. Liner API 사용 위치

| 위치 | 내용 |
| :--- | :--- |
| `api/_llm.ts` | `LINER_API_KEY`가 있으면 Liner Model API(OpenAI 호환 `chat/completions`)를 호출한다. 타임아웃(기본 20초), 429·5xx·타임아웃 시 1회 재시도, 401·403은 재시도 안 함, 하루 호출 상한(`LINER_DAILY_LIMIT`). Liner 키가 없을 때만 Gemini 키를 쓴다. |
| `server.ts` | 개발·로컬 실행용 Express 서버. `/api/llm/status`, `/api/llm/generate`를 `api/_llm.ts`로 연결한다. |
| `api/llm/*.ts` | 같은 로직을 Vercel 서버리스 함수로 제공한다. (배포 환경) |
| `src/llm.ts` | 브리핑·이메일·통화 가이드 프롬프트와 응답 검증. 브라우저에는 API 키가 전달되지 않는다. |

**응답 라벨은 사실대로 표시한다.**

| 라벨 | 의미 |
| :--- | :--- |
| 실시간 AI 응답 | 이번에 API를 호출해 검증을 통과한 응답 |
| Liner Model API 응답(저장본) | 과거에 실제 API가 만든 응답을 저장해 둔 것(`public/cache/llm-cache.json` 또는 브라우저 저장소) |
| 안전한 기본 템플릿 / 기본 템플릿 | API 키가 없거나 호출·검증에 실패해 코드 템플릿을 쓴 경우 (폴백 템플릿은 저장본으로 저장하지 않는다) |

호출 시도는 브라우저에 로그로 남는다(`magentify_api_logs`: 작업, 공급자, 성공 여부, 오류 코드, 지연 시간).

## 4. 구조

```
magentify-mini/
├── api/
│   ├── _llm.ts            # LLM 서버 로직 (공급자 선택, 재시도, 타임아웃, 일일 한도)
│   └── llm/
│       ├── generate.ts    # Vercel 함수: POST /api/llm/generate
│       └── status.ts      # Vercel 함수: GET  /api/llm/status
├── server.ts              # Express 개발·로컬 서버 (같은 로직 사용)
├── src/
│   ├── analysis.ts        # 컬럼 인식, 품질 검사, 분석, 우선순위 (순수 함수)
│   ├── llm.ts             # 프롬프트, 검증, 캐시, 폴백, 호출 계층
│   ├── storage.ts         # 브라우저 localStorage (플래그, 초안, 접촉 기록, API 로그)
│   ├── demoData.ts        # 데모 CSV 126행, CSV/XLSX 읽기
│   ├── App.tsx, components/   # 화면 (개요, 거래처, 문안, 가져오기, 설정)
│   └── types.ts
├── public/
│   ├── cache/llm-cache.json   # 응답 저장본 (npm run cache:generate 로 생성)
│   └── assets/aistudio/       # 기획서·PRD·디자인 문서
├── data/demo_transactions.csv # 가상 거래처 12곳 126행
├── scripts/
│   ├── check-secrets.mjs      # 제출 전 키 문자열 검사
│   └── generate-cache.ts      # 데모 응답 저장본 생성 (Liner 키 필요)
├── tests/                     # vitest (골든, LLM 검증, 서버 로직, Vercel 함수)
├── .env.example
└── vercel.json
```

- 기술 스택: React 19, Vite, Tailwind CSS 4, Express, TypeScript, vitest, xlsx.
- 데이터 저장: 거래 파일은 브라우저 메모리에서 처리하고, 사용자가 만든 정보(플래그, 초안, 접촉 기록)는 브라우저 localStorage에 저장한다. 서버에는 거래 데이터가 저장되지 않는다.

## 5. 설치와 실행

요구 사양: Node.js 22.18 이상(권장 24), npm

```bash
git clone <저장소 URL>
cd magentify-mini
npm install                 # .npmrc에 legacy-peer-deps가 설정되어 있다
cp .env.example .env        # 키는 .env에만 넣는다 (저장소에서 제외됨)
npm run dev                 # http://localhost:3000
```

> `.npmrc`의 `legacy-peer-deps=true`가 필요한 이유: vite 8이 esbuild 0.27 이상을 선택 의존성으로 요구하는데, 프로젝트가 esbuild 0.25를 쓰고 있어 peer 충돌이 난다.

### 환경변수 (`.env`)

| 이름 | 기본값 | 설명 |
| :--- | :--- | :--- |
| `LINER_API_KEY` | (없음) | 없으면 폴백·저장본 모드로 동작한다 |
| `LINER_BASE_URL` | `https://platform.liner.com/api/v1` | `/chat/completions`는 자동으로 붙는다 (붙여 넣어도 된다) |
| `LINER_MODEL` | `liner-gpt-router` | 사용 가능한 모델은 Liner 문서의 모델 목록 참고 |
| `LINER_TIMEOUT_SEC` | 20 | 호출 제한 시간 |
| `LINER_DAILY_LIMIT` | 200 | 하루 live 호출 상한. 넘으면 폴백 |
| `GEMINI_API_KEY` | (없음) | Liner 키가 없을 때만 쓰는 대체 공급자 |
| `DEMO_MODE`, `REF_DATE_DEFAULT`, `DB_PATH` | | 이전 버전(Streamlit) 호환용 이름. 현재 화면 설정에서 변경한다 |

## 6. 5분 시연 시나리오

| 시간 | 화면 | 시연 동작 | 확인 포인트 |
| :--- | :--- | :--- | :--- |
| 0:00~0:30 | 문제 소개 | 소규모 제조사 대표의 거래처 관리 어려움 설명 | 거래 원장은 있으나 발주 주기를 일일이 챙기지 못함 |
| 0:30~1:10 | 가져오기 | 기준일 2026-11-30 확인, 데모 파일 불러오기, 컬럼 자동 인식 확인, 분석 실행 | 정상 123행, 중복 1, 취소 1, 날짜 오류 1(총 126행). 유사 이름(삼우정밀 / 삼우정밀(2공장)) 경고, 자동 병합 없음 |
| 1:10~2:00 | 개요 | 요약 카드 확인, 브리핑 생성 | 정상 5 · 관심 1 · 위험 후보 2 · 고위험 후보 1 · 판단 보류 3. 우선 확인 순서: 대성정밀, 우리테크, 동양프레스, 세진금속 |
| 2:00~2:50 | 거래처 상세 | 대성정밀 선택 | 최근 거래 2026-09-28, 공백 63일, 평소 간격 30일의 2.1배, 거래일 14, 신뢰도 높음, VIP, 확인 질문 2개 |
| 2:50~3:50 | 문안 | 이메일 초안 생성, 통화 가이드 생성 | "AI 초안" 라벨, 가격·납기·할인 표현 없음 |
| 3:50~4:30 | 문안 | 한 문장 수정 후 저장, 복사 | 수정본 저장, 복사 |
| 4:30~5:00 | 문안 → 거래처 | 접촉 기록 저장(이메일 / 회신 대기 / 다음 연락일 2026-12-07) | 후속 조치 예정 현황에 즉시 표시 |

영상 중 1회는 **새로 생성**을 눌러 실제 API 호출을 보여 준다. 키가 없는 환경에서는 "기본 템플릿" 라벨이 표시되며, 저장본이나 실시간 응답으로 위장하지 않는다.

### 응답 저장본 (심사자가 키 없이도 볼 수 있게)

`public/cache/llm-cache.json`에 실제 Liner Model API 응답 41건(브리핑 1, 12개 거래처의 이메일·통화 가이드, 우선 확인 4곳은 3가지 톤)이 포함되어 있다. 2026-11-13에 생성했고, 가상 거래처 요약 수치만 전송했다. 검증(스키마, 금지어, 입력 외 숫자, 영어 필드명 노출)을 통과한 응답만 저장한다.

```bash
# .env에 LINER_API_KEY를 넣은 뒤
npm run cache:generate              # 없는 항목만 생성 (약 8분, 호출당 약 5~10초)
npm run cache:generate -- --force   # 전체 다시 생성
```

프롬프트나 분석 값이 바뀌면 캐시 키(거래처, 공백 일수, 배수, 톤)가 달라질 수 있으므로 다시 생성한다.

## 7. 테스트

```bash
npm test            # vitest 67개
npm run lint        # tsc --noEmit
npm run check:secrets   # 키 문자열 검사 (결과 0건이어야 함)
```

| 파일 | 내용 |
| :--- | :--- |
| `tests/golden.test.ts` | 데모 126행, 품질 검사 카운트(123/1/1/1/0), 12개 거래처의 거래일 수·평소 간격·공백·배수·상태, 요약 카운트, 우선순위 순서, 키 정규화 |
| `tests/llm.test.ts` | 금지어, 스키마 누락, 입력에 없는 숫자, 브리핑 id 집합과 문장 품질(영어 필드명·별칭 노출 금지), 키 없음·타임아웃·잘못된 JSON·위반 시 폴백, 재요청, 저장본 사용, "새로 생성" 실패를 live로 위장하지 않는지 |
| `tests/server_llm.test.ts` | Liner 주소 보정, 공급자 우선순위, 재시도 정책, 401 시 재시도 없음과 키 비노출, 타임아웃, 일일 한도 |
| `tests/vercel_handlers.test.ts` | Vercel 함수의 메서드·본문·키 없음 처리 |

## 8. 배포 (Vercel)

1. 저장소를 Vercel 프로젝트에 연결한다. Vite 프로젝트로 자동 인식된다. `api/` 폴더는 서버리스 함수가 된다.
2. 프로젝트 환경변수에 `LINER_API_KEY`(필수), 필요하면 `LINER_MODEL`, `LINER_BASE_URL`을 등록한다.
3. 배포 후 `/api/llm/status`가 `{"configured":true,"provider":"liner"}`를 돌려주는지 확인한다.

## 9. 보안과 개인정보

- API 키는 서버 환경변수에만 있고 브라우저와 응답 본문에는 전달되지 않는다. `.env`는 `.gitignore`로 제외된다.
- API에는 실제 거래처명, 담당자명, 연락처를 보내지 않는다. 별칭(C01…)과 요약 수치만 보낸다.
- 데모와 영상, 저장소에는 가상 데이터만 사용한다.
- 제출 전 `npm run check:secrets`로 키 문자열이 없는지 검사한다.

## 10. 대회 기간 구현 내역과 기존 코드 구분

- 이 저장소의 앱 골격(화면, 분석, 저장)은 Google AI Studio에서 생성한 프로토타입을 바탕으로 한다. 아래 표의 "기존" 항목이 해당한다.
- 2026-11-13 이후 추가·변경한 부분은 git 기록으로 구분된다. 첫 커밋은 변경 전 상태이고, 두 번째 커밋부터가 대회 기간 작업이다.

| 구분 | 내용 |
| :--- | :--- |
| 기존(프로토타입) | 화면 5개, 분석 로직(`src/analysis.ts`), localStorage 저장, 데모 데이터, 기획서·PRD 문서 |
| 신규(2026-11-13~) | LLM 서버 로직 분리(`api/_llm.ts`)와 Vercel 함수, Liner 우선 호출과 주소 보정, 재시도·타임아웃·일일 한도, 응답 검증 강화(입력 외 숫자), 폴백·저장본 라벨의 사실 표시, API 호출 로그, 응답 저장본 로더와 생성 스크립트, vitest 67개, 키 검사 스크립트, 응답 저장본 41건, 이 README |

## 11. 확인된 사실 (2026-11-13 기준)

- Liner Model API 연결 확인: `https://platform.liner.com/api/v1/chat/completions`, 모델 `liner-gpt-router`, 인증 `Authorization: Bearer` 방식으로 호출 성공. 브리핑 1회 응답 시간 약 5.3초(기본 타임아웃 20초 안).
- 앱에서 **새로 생성**을 눌렀을 때 "실시간 AI 응답" 라벨과 호출 로그(공급자 liner, 성공)가 남는 것을 확인했다.
- 키가 없는 환경에서는 "기본 템플릿" 라벨이 표시되고, 저장본이 있으면 "Liner Model API 응답(저장본)"으로 표시된다.
- 후속 조치 예정 현황은 **거래처 화면 하단과 알림 벨**에 표시된다(접촉 기록 저장 즉시 반영). 개요 화면에는 별도 표가 없다.
- 주문 간격 차트는 애니메이션 종료 후 정상 표시된다.

## 12. PRD v1.1 대비 변경 사항

PRD v1.1은 Streamlit/Python 기준으로 쓰였다. 구현은 아래처럼 바뀌었고, 기능 범위와 판정 규칙(4장)은 그대로다.

| 항목 | PRD v1.1 | 현재 구현 |
| :--- | :--- | :--- |
| 스택 | Python, Streamlit, pandas, sqlite3, pytest | React, Vite, TypeScript, Express(로컬), Vercel 서버리스 함수, vitest |
| 화면 | 3개(데이터, 대시보드, 거래처) | 5개(개요, 거래처, 문안, 가져오기, 설정). 문안 작성과 접촉 기록은 "문안" 화면 |
| 저장 | SQLite(`data/app.db`) | 브라우저 localStorage(플래그, 초안, 접촉 기록, API 로그). 서버에 거래 데이터 저장 없음 |
| 응답 캐시 | `data/cache/*.json` | `public/cache/llm-cache.json`(저장소 포함) + 브라우저 localStorage |
| 배포 | 제외 | Vercel(서버리스 함수로 LLM 호출) |
| LLM 호출 | openai SDK, base_url 교체 | 서버에서 fetch로 OpenAI 호환 `chat/completions` 호출. 브라우저에는 키 비노출 |
| 환경변수 | `DEMO_MODE`, `REF_DATE_DEFAULT`, `DB_PATH` | 현재 사용하지 않음(설정 화면에서 변경). `LINER_*`, `GEMINI_API_KEY`만 사용 |
| 테스트 | `test_golden.py`, `test_llm_validate.py` | `tests/*.test.ts` (golden, llm, server_llm, vercel_handlers) |
| 추가된 검증 | 금지어, 입력 외 숫자 | + 브리핑의 영어 필드명 노출 금지, headline/caution의 별칭 노출 금지 |
| 우선 확인 순서 | 대성정밀, 우리테크, 동양프레스, 세진금속 | 동일(골든 테스트로 고정) |
| 미구현(P1) | 질문하기, 업종 동향 | 미구현(PRD 8장 판단 시점에 따라 11/21에 결정) |

## 13. 문서

- `public/assets/aistudio/Magentify_Mini___2________PRD__v1.1_*.md`: 2주 데모 중심 PRD v1.1 (기준 명세)
- `public/assets/aistudio/liner-env-vars-guide_*.md`: Liner 환경변수와 문서 위치 정리
- 일부 문서는 초기 계획(Streamlit, Python) 기준으로 쓰여 있다. 현재 구현은 이 README를 따른다.
