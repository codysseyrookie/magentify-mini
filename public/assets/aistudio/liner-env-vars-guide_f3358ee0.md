# Liner 개발자 문서 기준 환경변수 위치 확인

확인일: 2026-11-12
기준 문서: https://liner.com/ko/developers/docs

## 요약

이미지의 6개 값(`LINER_BASE_URL`, `LINER_MODEL`, `LINER_TIMEOUT_SEC`, `LINER_DAILY_LIMIT`, `DEMO_MODE`, `REF_DATE_DEFAULT`)은 Liner 문서에 정의된 이름이 아닙니다. 이 앱이나 코드에서 만든 환경변수일 가능성이 큽니다.
문서가 정의한 환경변수는 `LINER_API_KEY` 하나뿐입니다.
아래는 각 값의 이름이 아니라 값 자체를 문서 어디서 찾는지 정리한 것입니다.

## 값별 위치

| 환경변수 | 문서에서 찾을 위치 | 확인한 값 |
|---|---|---|
| `LINER_BASE_URL` | Router API 첫 요청 예제 / Search Agent API / Quick Answer Agent API | Router API(OpenAI SDK용): `https://platform.liner.com/api/v1` <br> Search Agent: `POST https://platform.liner.com/api/v1/agents/search` <br> Quick Answer: `POST https://platform.liner.com/api/v1/agents/quick-answer` |
| `LINER_MODEL` | Router API 문서의 "모델과 가격" 절 | `liner-gpt-router`, `liner-claude-router`, `liner-gemini-router`, `liner-mark-1.3`. 호출 가능한 모델은 `GET /v1/models`로 확인. Search Agent API는 `model`을 `null`로 두면 기본 모델 사용 |
| `LINER_TIMEOUT_SEC` | Search Agent API 문서의 "응답 시간" 절 | 중앙값 약 30초, p90 약 45초, p99 약 100초. 업스트림 1회 시도 상한이 300초이므로 클라이언트 타임아웃은 그보다 길게 설정하라고 안내 |
| `LINER_DAILY_LIMIT` | Search Agent API 문서의 "에러" 표 / 요청 제한(rate-limits) 문서 | 일일 한도 숫자는 문서에 없음. 초과 시 `429 DAILY_LIMIT_EXCEEDED` 반환. 초당/분당 한도는 요청 제한 문서에 있음(예: Search Agent 초당 2회). 앱 자체의 일일 사용량 제한값일 가능성이 큼 |
| `DEMO_MODE` | 문서에 없음 | 앱 자체 설정으로 보임. 데모용으로 실제 호출을 막거나 목업 응답을 쓰는 스위치일 가능성 |
| `REF_DATE_DEFAULT` | 문서에 없음 | 앱 자체 설정으로 보임. 문서의 날짜 관련 값은 응답 `references[].date`(출처 발행일) 정도 |

## 참고 링크

- 시작 가이드: https://liner.com/ko/developers/docs/quick-start
- Router API: https://liner.com/ko/developers/docs/router-api
- Search Agent API: https://liner.com/ko/developers/docs/search-agent-api
- Quick Answer Agent API: https://liner.com/ko/developers/docs/quick-answer-agent-api
- 요청 제한: https://liner.com/ko/developers/docs/rate-limits
- API 키 발급: https://platform.liner.com/keys
- 키 확인(무료): `GET https://platform.liner.com/api/v1/credits/balance` (헤더 `x-api-key`)

## 확인 결과 (2026-11-13 업데이트)

- `DEMO_MODE`, `REF_DATE_DEFAULT`, `DB_PATH`: 현재 구현(React/Express)에서는 사용하지 않는다. 이전 Streamlit 계획의 이름이 `.env.example`에 남아 있다. 기준일과 데모 모드는 설정 화면에서 변경한다.
- `LINER_DAILY_LIMIT`: Liner 문서에 숫자가 없는 **앱 자체 사용량 제한**이다(기본 200). 서버 인스턴스 단위로 집계한다.
- `LINER_TIMEOUT_SEC`: 앱 설정값(기본 20초). Model API 브리핑 호출은 실측 약 5초였다. (Search Agent API의 중앙값 30초는 별개 제품 기준)
- 실제 호출 확인: `https://platform.liner.com/api/v1/chat/completions` + `liner-gpt-router` + `Authorization: Bearer` 헤더로 성공. `x-api-key` 헤더도 동작했지만 앱은 Bearer를 쓴다. 크레딧 조회(`/credits/balance`)와 모델 목록(`/models`)도 응답했다.
