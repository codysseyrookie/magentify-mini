import { describe, expect, it } from 'vitest';
import { analyze, assignAliases, buildClean, normalizeKey, prioritize, suggestMapping, summarize } from '../src/analysis';
import { DEMO_CSV_DATA, parseCSV } from '../src/demoData';

const REF = '2026-11-30';
const DEMO_FLAGS = {
  '대성정밀': { vip: true, project_based: false },
  '미래산업': { vip: true, project_based: false },
  '바른설비': { vip: false, project_based: true },
};

function run() {
  const { headers, rows } = parseCSV(DEMO_CSV_DATA);
  const mapping = suggestMapping(headers);
  const quality = buildClean(rows, mapping, REF);
  const assessments = analyze(quality.clean_rows, DEMO_FLAGS, REF);
  return { headers, rows, mapping, quality, assessments };
}

describe('데모 데이터와 컬럼 인식 (PRD 2.2, 4.7)', () => {
  it('126행이며 거래처·거래일·금액·품목이 자동 인식된다', () => {
    const { rows, mapping } = run();
    expect(rows.length).toBe(126);
    expect(mapping.customer).toBeTruthy();
    expect(mapping.date).toBeTruthy();
    expect(mapping.amount).toBeTruthy();
    expect(mapping.item).toBeTruthy();
  });
});

describe('품질 검사 5종 골든 카운트', () => {
  it('정상 123, 중복 1, 취소 1, 날짜 오류 1, 미래 0', () => {
    const { quality } = run();
    expect(quality.counts).toEqual({ ok: 123, duplicate: 1, negative: 1, invalid: 1, future: 0 });
  });

  it('유사 거래처명 1쌍(삼우정밀 / 삼우정밀(2공장))은 경고만 하고 병합하지 않는다', () => {
    const { quality, assessments } = run();
    expect(quality.similar_pairs.length).toBe(1);
    const pair = quality.similar_pairs[0].join('|');
    expect(pair).toContain('삼우정밀');
    expect(pair).toContain('삼우정밀(2공장)');
    const names = assessments.map(a => a.display_name);
    expect(names).toContain('삼우정밀');
    expect(names).toContain('삼우정밀(2공장)');
  });
});

describe('12개 거래처 수치·상태 골든 (PRD 4.7)', () => {
  // [표시명, 거래일 수, 평소 간격, 최근 거래일, 공백, 배수, 상태]
  const golden: [string, number, number | null, string, number, number | null, string][] = [
    ['대성정밀', 14, 30, '2026-09-28', 63, 2.1, 'risk'],
    ['한울기계', 18, 21, '2026-11-17', 13, 0.62, 'normal'],
    ['세진금속', 12, 30, '2026-10-12', 49, 1.63, 'attention'],
    ['우리테크', 9, 45, '2026-06-20', 163, 3.6, 'high_risk'],
    ['미래산업', 24, 14, '2026-11-20', 10, 0.71, 'normal'],
    ['동양프레스', 10, 28, '2026-10-01', 60, 2.14, 'risk'],
    ['신흥공업', 1, null, '2026-11-10', 20, null, 'hold'],
    ['태광산업', 3, 60, '2026-08-15', 107, null, 'hold'],
    ['바른설비', 6, null, '2026-09-14', 77, null, 'hold'],
    ['청운전자', 8, 35, '2026-11-02', 28, 0.8, 'normal'],
    ['삼우정밀', 11, 30, '2026-11-05', 25, 0.83, 'normal'],
    ['삼우정밀(2공장)', 7, 30, '2026-10-20', 41, 1.37, 'normal'],
  ];

  it('거래처는 정확히 12곳이다', () => {
    expect(run().assessments.length).toBe(12);
  });

  for (const [name, days, median, last, gap, ratio, status] of golden) {
    it(`${name}: 거래일 ${days}, 공백 ${gap}, 상태 ${status}`, () => {
      const a = run().assessments.find(x => x.display_name === name);
      expect(a, `${name} 없음`).toBeDefined();
      expect(a!.txn_days).toBe(days);
      expect(a!.last_date).toBe(last);
      expect(a!.gap_days).toBe(gap);
      expect(a!.status).toBe(status);
      if (median !== null) expect(a!.median_interval).toBe(median);
      if (ratio !== null) expect(a!.ratio).toBeCloseTo(ratio, 1);
    });
  }

  it('요약 카운트는 정상 5 · 관심 1 · 위험 2 · 고위험 1 · 보류 3', () => {
    const s = summarize(run().assessments);
    expect(s).toEqual({ normal: 5, attention: 1, risk: 2, high_risk: 1, hold: 3 });
  });

  it('우선 확인 순서: 대성정밀(3.5) → 우리테크(3.0) → 동양프레스(2.0) → 세진금속(1.0)', () => {
    const top = prioritize(run().assessments);
    expect(top.map(a => a.display_name)).toEqual(['대성정밀', '우리테크', '동양프레스', '세진금속']);
    expect(top.map(a => a.priority_score)).toEqual([3.5, 3, 2, 1]);
  });

  it('대성정밀 신뢰도는 높음, 바른설비는 프로젝트성 보류, 신흥공업은 데이터 부족 보류', () => {
    const list = run().assessments;
    expect(list.find(a => a.display_name === '대성정밀')!.confidence).toBe('high');
    expect(list.find(a => a.display_name === '바른설비')!.hold_reason).toBe('project_based');
    expect(list.find(a => a.display_name === '신흥공업')!.hold_reason).toBe('insufficient_data');
  });

  it('같은 입력은 항상 같은 결과를 낸다(결정성)', () => {
    expect(JSON.stringify(run().assessments)).toBe(JSON.stringify(run().assessments));
  });
});

describe('거래처 키 정규화와 별칭 (PRD 4.3)', () => {
  it('㈜·(주)·주식회사·공백을 제거하고 소문자로 만든다', () => {
    expect(normalizeKey('(주) 대성정밀')).toBe(normalizeKey('대성정밀'));
    expect(normalizeKey('주식회사 대성정밀')).toBe(normalizeKey('대성정밀'));
    expect(normalizeKey('㈜대성정밀')).toBe(normalizeKey('대성정밀'));
  });
  it('괄호 안의 다른 내용은 유지한다', () => {
    expect(normalizeKey('삼우정밀(2공장)')).not.toBe(normalizeKey('삼우정밀'));
  });
  it('별칭은 키 오름차순으로 C01, C02… 가 부여된다', () => {
    const m = assignAliases(['b', 'a', 'c']);
    expect(m['a']).toBe('C01');
    expect(m['b']).toBe('C02');
    expect(m['c']).toBe('C03');
  });
});
