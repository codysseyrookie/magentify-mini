# design.md — Magentify Mini

> 거래 내역(CSV/XLSX)을 기반으로 연락이 뜸해진 거래처를 감지하고, 맞춤형 연락 문안을 지원하는 로컬 에이전트.
> 이 문서는 [ztd-charts Theme](https://charts.ztd.app/docs/docs/theme/)의 `--ztd-*` 토큰을 기반으로 하고, 첨부된 대시보드 레퍼런스(상단 필 내비게이션 · 좌측 아이콘 레일 · 벤토 카드 그리드)의 UIUX 구조를 따른다.

---

## 1. 디자인 원칙

1. **한 화면 한 목적** — 지금 해야 할 일(연락이 필요한 거래처)이 항상 첫 화면의 가장 큰 영역을 차지한다.
2. **3클릭 이내** — 파일 업로드 → 감지 결과 확인 → 문안 복사까지 3단계로 끝난다.
3. **가독성 우선** — 본문 16px 이상, 보조 텍스트도 WCAG AA(4.5:1) 이상. 장식보다 대비와 여백.
4. **강조는 하나만** — 한 화면에 accent는 하나의 핵심 항목에만 쓴다 (ztd의 "The one highlight" 원칙).
5. **로컬 에이전트의 신뢰감** — 데이터가 내 기기 안에서 처리됨을 UI 곳곳에서 짧게 알려준다.

---

## 2. 컬러 토큰 (ztd-charts 기반)

ztd-charts의 light/dark 토큰을 그대로 사용해 UI와 차트 색이 어긋나지 않게 한다. 기본은 **Light**.

| 토큰 | CSS 변수 | Light | Dark | 용도 |
|---|---|---|---|---|
| bg | `--ztd-bg` | `#FFFFFF` | `#14171B` | 페이지 배경 (아래 §2-1 참고) |
| panel | `--ztd-panel` | `#FFFFFF` | `#14171B` | 카드 배경 |
| ink | `--ztd-ink` | `#14171B` | `#F1F3F5` | 본문·제목 |
| muted | `--ztd-muted` | `#5D6570` | `#A3ABB5` | 보조 텍스트 (AA 충족) |
| dim | `--ztd-dim` | `#B3B9C2` | `#5B636D` | 축·가이드선 전용, **텍스트 금지** |
| accent | `--ztd-accent` | `#0B8FD8` | `#D6FD70` | 핵심 CTA, 선택 상태, 하이라이트 |
| accentText | `--ztd-accent-text` | `#006DA8` | `#D6FD70` | accent를 텍스트로 쓸 때 |
| onAccent | `--ztd-on-accent` | `#14171B` | `#14171B` | accent 위 텍스트 |
| accent2 | `--ztd-accent2` | `#D8488C` | `#FF8CC1` | **주의/이탈 위험** (뜸해진 거래처) |
| accent3 | `--ztd-accent3` | `#659815` | `#38C6F6` | **완료/양호** (연락 완료) |
| line | `--ztd-line` | `#E6E9ED` | `#2A2F36` | 테두리, 그리드선 |
| line2 | `--ztd-line2` | `#F0F2F5` | `#22272D` | 보조 구분선, 트랙 |
| neutral | `--ztd-neutral` | `#D5DAE0` | `#3A414A` | 나머지 항목 채움 |
| neutralSoft | `--ztd-neutral-soft` | `#EEF1F4` | `#262B31` | 연한 채움, 프로그레스 트랙 |
| lift | `--ztd-lift` | `#F4F6F8` | `#1D2126` | hover/focus 배경, 사이드 영역 |
| tint | `--ztd-tint` | `rgba(11,143,216,.12)` | `rgba(214,253,112,.14)` | 배지 배경 |

### 2-1. 배경 레이어 (레퍼런스 이미지의 벤토 느낌)
레퍼런스처럼 "연회색 캔버스 위에 흰 카드"가 떠 있는 구조를 쓴다.

- 앱 캔버스: `--ztd-lift`(`#F4F6F8`)
- 카드: `--ztd-panel`(`#FFFFFF`) + 1px `--ztd-line`
- 카드 안쪽 서브 영역(지갑 목록 같은 하위 블록): `--ztd-lift`

### 2-2. 의미 색상 매핑
| 상태 | 색 | 배지 배경 | 텍스트 |
|---|---|---|---|
| 연락 필요 (뜸해짐) | accent2 | accent2 12% | accent2를 ink 쪽으로 섞어 4.5:1 확보 |
| 문안 작성 중 | accent | `--ztd-tint` | `--ztd-accent-text` |
| 연락 완료 | accent3 | accent3 12% | accent3를 ink 쪽으로 섞어 4.5:1 확보 |
| 보류/제외 | neutral | `--ztd-neutral-soft` | `--ztd-muted` |

> 색만으로 상태를 전달하지 않는다. 배지에는 항상 **점(●) + 텍스트**를 함께 쓴다 (레퍼런스의 Completed / Pending / In Progress 배지 방식).

### 2-3. 브랜드 accent 변경
accent는 한 줄 CSS로 바꿀 수 있다. 바꿀 때는 `accent-text`를 카드 배경 대비 4.5:1이 되도록 함께 조정한다.

```css
.app { --ztd-accent: #0B8FD8; --ztd-accent-text: #006DA8; }
```

---

## 3. 타이포그래피

- 폰트: **Pretendard Variable** (ztd 권장). 폴백은 ztd 스택을 그대로 사용.
- 숫자: 표·KPI는 `font-variant-numeric: tabular-nums`로 자릿수 정렬.

```css
--ztd-font: "Pretendard Variable", Pretendard, "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", system-ui, -apple-system, sans-serif;
--ztd-mono: "Roboto Mono", "Share Tech Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
```

| 역할 | 크기 / 행간 | 굵기 | 비고 |
|---|---|---|---|
| 인사 헤드라인 ("좋은 아침이에요") | 32 / 40 | 700 | 레퍼런스의 Good morning 영역 |
| 페이지 제목 | 24 / 32 | 700 | |
| 카드 제목 | 16 / 24 | 600 | |
| KPI 숫자 | 32 / 40 | 700 | tabular-nums |
| 본문 | 16 / 24 | 400 | 최소 크기 |
| 보조 텍스트·표 | 14 / 20 | 400 | `--ztd-muted`, 14px 미만 금지 |
| 배지·캡션 | 13 / 16 | 500 | 점+텍스트 |

---

## 4. 형태 · 간격 · 그림자

| 항목 | 값 |
|---|---|
| 카드 radius | `18px` (`--ztd-radius`) |
| 내부 서브 블록 radius | `14px` (`--ztd-radius-code`) |
| 버튼 · 입력 · 내비 | `999px` 풀 라운드 (레퍼런스의 필 형태) |
| 배지 | `999px` |
| 작은 마크 | `4px` (`--ztd-radius-mark`) |
| 간격 단위 | 4px 베이스: 4 / 8 / 12 / 16 / 24 / 32 |
| 카드 내부 패딩 | 20–24px |
| 카드 간격 (그리드 gap) | 16px |
| 그림자 | 기본 없음. 테두리 `1px --ztd-line`로 구분. 떠 있는 요소(드롭다운·모달)만 `0 8px 24px rgba(20,23,27,.08)` |

---

## 5. 레이아웃 (레퍼런스 구조)

```
┌──────────────────────────────────────────────────────────────┐
│ [로고]        ( 개요 | 거래처 | 문안 | 가져오기 | 설정 )   🔍 🔔 [프로필] │  ← 상단 필 내비
├────┬─────────────────────────────────────────────────────────┤
│ ▢  │  좋은 아침이에요, OO님                                      │
│ ▢  │  오늘 연락할 거래처를 확인해보세요.                              │
│ ▢  │ ┌───────────────┬──────────┬──────────┬───────────────┐ │
│ ▢  │ │ 핵심 요약 카드      │ KPI 2×2 벤토        │ 월별 활동 차트  │ │
│ ▢  │ │ (연락 필요 N곳)   │                     │                │ │
│    │ ├───────────────┴──────────┴──────────┴───────────────┤ │
│ ?  │ │ 이번 주 연락 목표 (프로그레스) │ 최근 거래처 테이블 (검색·필터)   │ │
│ ⎋  │ └────────────────────────────────────────────────────────┘ │
└────┴─────────────────────────────────────────────────────────┘
 좌측 아이콘 레일(64px)
```

- **상단 필 내비**: 중앙 정렬된 알약 컨테이너(`--ztd-panel`), 활성 탭은 `--ztd-ink` 배경 + `--ztd-on-ink` 텍스트(레퍼런스의 검정 필). 우측에 검색·알림·프로필.
- **좌측 아이콘 레일**: 폭 64px, 아이콘 위주. 하단에 도움말·로그아웃. 활성 아이콘은 `--ztd-ink` 원형 배경. **모든 아이콘에 툴팁과 `aria-label` 필수** (아이콘만으로 의미를 맡기지 않는다).
- **콘텐츠 그리드**: 데스크톱 12컬럼, 최대 폭 1280px, 바깥 여백 24px.

### 반응형
| 구간 | 동작 |
|---|---|
| ≥ 1200px | 레퍼런스와 동일한 3열 벤토 |
| 768–1199px | 2열, 차트 카드는 가로 전체 |
| < 768px | 1열 스택, 좌측 레일은 하단 탭바로 전환, 테이블은 카드 리스트로 전환 |

---

## 6. 컴포넌트

### 6-1. KPI 카드 (벤토)
- 구성: 라벨 → 큰 숫자 → 증감 배지 + "지난달 대비".
- **하이라이트 카드는 단 하나**: 핵심 지표 "연락 필요 거래처" 카드만 `--ztd-accent` 배경 + `--ztd-on-accent` 텍스트 (레퍼런스의 주황 카드 역할). 나머지는 흰 카드.
- 구현: ztd-charts `StatCard` 또는 직접 구성.
- 증감 배지: ▲/▼ 아이콘 + 수치 + 텍스트, 색은 의미 매핑(§2-2) 사용.

| 카드 | 라벨 예시 | 비고 |
|---|---|---|
| 하이라이트 | 연락 필요 거래처 | accent 배경 |
| 일반 | 전체 거래처 | |
| 일반 | 문안 작성 대기 | |
| 일반 | 이번 달 연락 완료 | accent3 배지 |

### 6-2. 버튼
| 종류 | 스타일 | 사용 |
|---|---|---|
| Primary | `--ztd-ink` 배경, `--ztd-on-ink` 텍스트, 풀 라운드, 높이 44px | 화면당 1개 (예: "문안 만들기") |
| Secondary | `--ztd-lift` 배경 + `--ztd-line` 테두리 | 보조 (예: "요청", "나중에") |
| Accent | `--ztd-accent` 배경 + `--ztd-on-accent` | 핵심 전환 (예: "파일 가져오기") |
| Ghost | 텍스트 + hover 시 `--ztd-lift` | 표 안의 행 동작 |

- 최소 터치 영역 **44×44px**.
- focus: 2px `--ztd-accent` 아웃라인 + 2px 오프셋. 제거 금지.

### 6-3. 테이블 (최근 활동 → 거래처 목록)
레퍼런스의 Recent Activities 패턴을 그대로 쓴다.

| 열 | 내용 |
|---|---|
| ☐ | 선택 체크박스 (다중 선택 → 일괄 문안 생성) |
| 거래처 | 아이콘/이니셜 + 이름 |
| 마지막 거래일 | `YYYY. M. D.` |
| 미접촉 기간 | 예: 47일 (정렬 기본값: 내림차순) |
| 최근 거래액 | 우측 정렬, tabular-nums, `formatCurrency` |
| 상태 | 점 + 텍스트 배지 |
| ⋯ | 행 메뉴 |

- 상단: 검색 입력(풀 라운드) + 필터 버튼.
- 행 높이 52px, 선택된 행은 `--ztd-lift` 배경.
- 행 hover 시 우측에 **"문안 만들기"** 고스트 버튼 노출 (클릭 수 절감).

### 6-4. 프로그레스 (Monthly Spending Limit → 이번 주 연락 목표)
- 트랙 `--ztd-neutral-soft`, 채움 `--ztd-accent`, 높이 10px, 풀 라운드.
- 아래에 "n곳 연락 완료 / 목표 m곳" 텍스트. 목표 달성 시 채움이 `--ztd-accent3`.

### 6-5. 서브 리스트 블록 (Wallets → 업로드한 파일/기간)
- 카드 안에서 `--ztd-lift` 배경 + 14px radius 블록, 3열 미니 카드.
- 상태 텍스트(Active/Inactive 대응)는 점+텍스트.

### 6-6. 입력 · 업로드
- 입력: 높이 44px, 풀 라운드, `--ztd-line` 테두리, focus 시 accent 테두리.
- **파일 드롭존**: 점선 테두리 `--ztd-neutral-strong`, radius 18px, 가운데 아이콘 + "CSV 또는 XLSX 파일을 끌어다 놓으세요" + "파일 선택" 버튼. 업로드 후 즉시 컬럼 매핑 미리보기 표시.
- 에러 문구는 해결 방법까지 한 줄로 ("날짜 열을 찾지 못했어요. 열 이름을 선택해주세요"). ztd의 한국어 톤("~했어요")을 따른다.

### 6-7. 문안 편집기 (핵심 화면)
- 좌: 거래처 요약(마지막 거래, 주요 품목, 미접촉 기간). 우: 문안 미리보기 + 톤 선택(정중하게 / 친근하게 / 간단하게) 필 토글.
- 하단 고정 액션: **[복사]** (Primary) · [다시 생성] (Secondary) · [연락 완료로 표시] (Ghost).
- 복사 성공 시 토스트: "문안을 복사했어요".

### 6-8. 배지 · 토스트 · 빈 상태
- 빈 상태: 일러스트 대신 아이콘 + 한 줄 설명 + Primary 버튼 하나 ("거래 내역을 가져오면 뜸해진 거래처를 찾아드려요").
- 토스트: 하단 중앙, 3초, `--ztd-ink` 배경, aria-live="polite".

---

## 7. 사용자 흐름 (효율적인 동선)

```
첫 방문
  [개요 빈 상태] → ① 파일 가져오기 → ② 열 자동 매핑 확인(1화면) → ③ 감지 결과(개요)

일상 사용
  [개요] "연락 필요 N곳" 카드 클릭 → [거래처 목록: 미접촉 내림차순 필터 적용됨]
        → 행의 "문안 만들기" → [문안 편집기] → 복사 → "연락 완료" → 다음 거래처로 자동 이동
```

설계 규칙:
1. **첫 화면에서 바로 행동** — 개요의 하이라이트 카드가 곧 진입점이다. 메뉴를 거치지 않는다.
2. **자동 기본값** — 열 매핑·감지 기준은 자동 추천값으로 채우고, 사용자는 확인만 한다. 상세 설정은 "설정"에 둔다.
3. **연속 작업** — 문안 편집기에서 "연락 완료" 후 목록으로 돌아가지 않고 **다음 거래처**로 이동하는 버튼 제공.
4. **일괄 처리** — 목록에서 다중 선택 → "선택한 N곳 문안 만들기".
5. **되돌리기** — 상태 변경(완료·보류)은 토스트에 "실행 취소" 제공.
6. **현재 위치 표시** — 상단 필 내비 활성 탭 + 페이지 제목. 깊이는 최대 2단계.
7. **로컬 처리 안내** — 업로드 영역 하단에 "파일은 이 기기에서만 처리돼요" 한 줄.

---

## 8. 차트 가이드 (ztd-charts)

설치: `npm i ztd-charts` (React 18+). 앱 루트에서 ThemeProvider로 테마·한국어 로케일을 한 번만 지정한다.

```tsx
import { ThemeProvider } from "ztd-charts";

<ThemeProvider theme="light" locale="ko-KR" paint>
  <App />
</ThemeProvider>
```

- `locale="ko-KR"` → 숫자 `1.2만`, 통화 `₩5,000`, 날짜 `3월 15일`, 툴팁·스크린리더 문구가 한국어로 표시.
- 단일 accent 변경은 `<ThemeProvider theme={{ accent, accentText }}>` 또는 CSS 변수로.

### 차트 선택 표 (레퍼런스의 Total Income 영역 대응)
| 목적 | 차트 | 규칙 |
|---|---|---|
| 월별 거래/연락 추이 | `BarChart` | 강조할 달 1개만 `highlight`, 나머지는 `neutral` |
| 상태별 비율 | `DonutChart` | 2–4개 항목, 중앙에 총 거래처 수 |
| 거래처별 활동 추세 | `Sparkline` (표 행 안) | 행 높이 안에서 축 없이 |
| 핵심 수치 | `StatCard` | 증감 + 한 줄 해석 |
| 미접촉 기간 분포 | `HistogramChart` | 구간을 14일/30일/60일 등 사용자가 이해하는 단위로 |

### 차트 규칙
1. 카드 안에서 쓴다: `ChartCard`로 제목·부제·**한 줄 요약(takeaway)**을 항상 붙인다. 숫자만 던지지 않는다.
2. 범례는 `legend`로 명시하고, 색 외에 라벨/값 텍스트를 함께 보여준다.
3. 축·그리드는 `dim`, 텍스트는 `muted` — `dim`을 텍스트에 쓰지 않는다.
4. 차트 높이 기본 240px(KPI 옆 카드 기준), 모바일 200px.
5. 데이터 로딩 실패 문구는 ztd 기본 한국어("데이터를 불러오지 못했어요" / "다시 시도")를 그대로 사용.

---

## 9. 모션

- 카드 진입: 8px 아래에서 페이드 인, 200ms `ease-out`, 카드 간 stagger 40ms.
- 차트: ztd 기본 스프링(오버슈트 없음), 뷰포트 진입 시 1회 재생.
- 상태 변경(배지·프로그레스): 200–300ms.
- `prefers-reduced-motion: reduce`이면 모든 모션을 끄고 최종 상태를 즉시 표시 (ztd는 `reducedMotion="auto"` 기본).

---

## 10. 접근성

- 텍스트 대비 4.5:1 이상 (muted 사용, dim은 선·축 전용), 대형 텍스트·UI 컴포넌트 3:1 이상.
- 상태는 색 + 아이콘/텍스트로 중복 전달.
- 키보드: 모든 동작은 Tab / Enter / Space / 방향키로 가능, 표는 방향키 행 이동, 모달은 포커스 트랩 + Esc 닫기.
- 차트는 `role="img"`, 제목·설명·숨김 데이터 표 제공 (ztd 내장). 필요 시 `ariaLabel`, `description` 지정.
- 아이콘 버튼은 `aria-label` 필수, 토스트·결과 알림은 `aria-live`.
- 터치 영역 최소 44×44px.

---

## 11. 다크 모드

- `ThemeProvider theme="dark"` 또는 `prefers-color-scheme: dark`에서 §2 표의 Dark 컬럼을 사용.
- 다크의 accent는 라임(`#D6FD70`), 카드 `#14171B`. 하이라이트 KPI 카드의 텍스트는 `--ztd-on-accent`(`#14171B`).
- 캔버스는 `#0E1114` 정도로 카드보다 한 단계 어둡게 두어 벤토 구분을 유지.

---

## 12. 구현용 CSS 변수 (Light)

```css
:root {
  --ztd-bg: #FFFFFF;
  --ztd-panel: #FFFFFF;
  --ztd-ink: #14171B;
  --ztd-muted: #5D6570;
  --ztd-dim: #B3B9C2;
  --ztd-accent: #0B8FD8;
  --ztd-accent-text: #006DA8;
  --ztd-on-accent: #14171B;
  --ztd-accent2: #D8488C;
  --ztd-accent3: #659815;
  --ztd-on-ink: #FFFFFF;
  --ztd-line: #E6E9ED;
  --ztd-line2: #F0F2F5;
  --ztd-neutral: #D5DAE0;
  --ztd-neutral-strong: #9AA3AE;
  --ztd-on-neutral-strong: #14171B;
  --ztd-neutral-soft: #EEF1F4;
  --ztd-lift: #F4F6F8;
  --ztd-tint: rgba(11, 143, 216, 0.12);
  --ztd-font: "Pretendard Variable", Pretendard, "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", system-ui, -apple-system, sans-serif;
  --ztd-mono: "Roboto Mono", "Share Tech Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
  --ztd-radius: 18px;
  --ztd-radius-code: 14px;
  --ztd-radius-mark: 4px;

  /* Magentify Mini 확장 */
  --app-canvas: var(--ztd-lift);
  --app-gap: 16px;
  --app-rail-width: 64px;
  --app-pill: 999px;
  --app-shadow-float: 0 8px 24px rgba(20, 23, 27, 0.08);
}
```

---

## 13. Do / Don't

| Do | Don't |
|---|---|
| 한 화면에 accent는 하나의 핵심 요소에만 | accent를 여러 카드·버튼에 동시에 사용 |
| 카드마다 한 줄 요약(takeaway) 제공 | 숫자·차트만 나열 |
| 상태는 점 + 텍스트 | 색만으로 상태 구분 |
| 본문 16px, 보조 14px 이상 | 12px 이하 회색 텍스트 |
| `muted`로 보조 텍스트 | `dim`을 텍스트에 사용 |
| 행에서 바로 "문안 만들기" | 목록 → 상세 → 메뉴 → 작성 순으로 깊게 이동 |
| 빈 상태에 다음 행동 하나 제시 | 빈 표만 노출 |

---

## 14. 출처 / 참고

- 토큰·테마·로케일·모션·접근성: https://charts.ztd.app/docs/docs/theme/ (ztd-charts 0.11.3)
- 서비스 설명: https://magentify-mini.vercel.app/ — "거래 내역(CSV/XLSX)을 기반으로 연락이 뜸해진 거래처를 감지하고 맞춤형 연락 문안을 지원하는 로컬 에이전트"
- UIUX 구조 참고: 첨부 대시보드 이미지 (상단 필 내비, 좌측 아이콘 레일, 벤토 KPI 카드, 차트 카드, 진행도 바, 최근 활동 표)
