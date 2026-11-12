# ztd charts (Zero-dependency React Chart Kit) 완벽 정리

- **원문 스레드**: [gangjoon__ 스레드 포스트](https://www.threads.com/@gangjoon__/post/Dfg1ailkSdX) (공유 링크: https://www.threads.com/share/_z4dzCKcn)
- **공식 사이트 & 문서**: [https://charts.ztd.app](https://charts.ztd.app)
- **GitHub 저장소**: [Junhan2/ztd-charts](https://github.com/Junhan2/ztd-charts)
- **라이선스**: MIT (무료 오픈소스)

---

## 1. 개요 및 탄생 배경
- 기존 차트 라이브러리들의 2% 아쉬운 점(무거운 런타임 의존성, 접근성 부족, 디자인 어색함 등)을 해결하기 위해 개발자가 직접 제작한 **순수 SVG 기반 차트 라이브러리**.
- 현존 최고 수준의 완성도와 AI 연동성을 목표로 제작되었음.

---

## 2. 핵심 특징 6가지

1. **압도적인 시각화 커버리지**
   - React 차트 **36종**, 세부 변형(Variants) 포함 **총 116종** 지원.
   - 바(Bar), 라인(Line), 영역(Area), 생키(Sankey) 다이어그램, 캔들스틱 등 대부분의 비즈니스 시각화 완벽 대응.
2. **런타임 의존성 0개 (Zero Runtime Dependencies)**
   - 무거운 외부 라이브러리 없이 **순수 SVG (Pure SVG)**로 직접 렌더링.
   - 번들 크기 부담이 없고 가볍고 빠름.
3. **웹 접근성 (Accessibility) 기본 내장**
   - 마우스뿐 아니라 **키보드 탐색(Tab, 방향키)**과 **스크린 리더** 완벽 대응.
   - 저시력자/시각장애인을 위한 데이터 테이블 대체 및 WCAG AA 대비 기준 충족.
4. **유려한 인터랙션 & 스프링 애니메이션**
   - 뷰포트에 들어올 때 스크롤 감지 애니메이션(`animateOnView`).
   - 데이터 변경 시 뚝 끊기지 않고 물리 기반 스프링(Spring) 모션으로 부드럽게 전환.
5. **한국어 로케일 최적화 (`locale="ko-KR"`)**
   - 기본 영어 외에 한국어 지원 완벽.
   - 한국식 숫자 및 통화 표기(1.2만, 3.4억, ₩5,000) 지원 및 프리텐다드(Pretendard) 폰트 레이아웃 최적화.
6. **"하나의 하이라이트" 디자인 철학**
   - 강조할 하나의 데이터만 포인트 컬러(Accent)로 살리고 나머지는 뉴트럴하게 정돈하여 데이터 스토리텔링에 최적화.

---

## 3. 실전 활용 방법 4가지

### ① React 프로젝트에서 직접 사용
```bash
npm i ztd-charts
```
- 프로젝트 내에서 `<ChartCard>`, `<SankeyChart>`, `<BarChart>` 등의 컴포넌트로 바로 임포트해 사용.

### ② CLI로 데이터 넣고 자동 생성
```bash
npx ztd-charts-cli suggest sales.csv --out-dir charts
```
- CSV 등 데이터 파일만 넘겨주면 데이터 형태에 가장 적합한 차트를 자동으로 제안·생성.

### ③ Claude 등 AI와 MCP(Model Context Protocol)로 연동
```bash
claude mcp add ztd-charts -- npx -y ztd-charts-mcp
```
- Claude Desktop이나 MCP 지원 AI 클라이언트에 위 한 줄만 추가하면, AI가 이 차트 라이브러리를 사용해 실시간 시각화 코드를 자동 생성.

### ④ 일반 AI 프롬프트 지시 (가장 쉬운 방법)
- 개발 환경 설정이 번거로울 경우, ChatGPT나 Claude 등 AI에게 아래처럼 프롬프트 한 줄만 입력:
  > *"앞으로 차트나 데이터 시각화 웹 코드를 짤 때는 https://github.com/Junhan2/ztd-charts 라이브러리를 사용해서 작성해 줘."*

---

## 4. 코드 예시 (Sankey Diagram)

```tsx
import { ChartCard, SankeyChart } from "ztd-charts";

const data = [
  { source: "검색 유입", target: "상품 상세", value: 4200 },
  { source: "SNS", target: "상품 상세", value: 2600 },
  { source: "SNS", target: "프로모션 페이지", value: 1400 },
  { source: "상품 상세", target: "장바구니", value: 3900 },
  { source: "장바구니", target: "구매 완료", value: 2900 },
];

export function UserFlowExample() {
  return (
    <ChartCard
      number="01"
      title="고객 전환 흐름"
      subtitle="방문부터 최종 구매까지의 이탈 분석"
      takeaway="상품 상세에서 장바구니 전환율 45% 달성"
      level="advanced"
      replay
    >
      <SankeyChart
        data={data}
        source="source"
        target="target"
        value="value"
        highlight="구매 완료"
        locale="ko-KR"
      />
    </ChartCard>
  );
}
```
