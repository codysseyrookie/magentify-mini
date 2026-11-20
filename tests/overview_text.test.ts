import { describe, expect, it } from 'vitest';
import { analyze, buildClean, gapTakeaway, prioritize, suggestMapping } from '../src/analysis';
import { DEMO_CSV_DATA, parseCSV } from '../src/demoData';
import type { Assessment } from '../src/types';

const REF = '2026-11-30';
const FLAGS = { '대성정밀': { vip: true, project_based: false }, '미래산업': { vip: true, project_based: false }, '바른설비': { vip: false, project_based: true } };

function priority(flags = FLAGS): Assessment[] {
  const { headers, rows } = parseCSV(DEMO_CSV_DATA);
  const q = buildClean(rows, suggestMapping(headers), REF);
  return prioritize(analyze(q.clean_rows, flags, REF));
}

describe('개요 그래프 요약 문구(gapTakeaway)', () => {
  it('1순위(VIP 가산)와 공백이 가장 긴 거래처가 다르면 둘을 함께 밝힌다', () => {
    expect(gapTakeaway(priority())).toBe(
      '우선 확인 1순위는 대성정밀(VIP, 평소 주기의 2.1배)이에요. 공백이 가장 긴 곳은 우리테크(163일, 3.62배)예요.'
    );
  });

  it('1순위가 공백도 가장 길면 한 문장으로 말한다', () => {
    const p = priority({ ...FLAGS, '대성정밀': { vip: false, project_based: false } });
    expect(p[0].display_name).toBe('우리테크');
    expect(gapTakeaway(p)).toBe('우리테크의 공백이 163일(평소 주기의 3.62배)로 가장 길어 먼저 확인이 필요해요.');
  });

  it('연락 필요 거래처가 없으면 안정 문구', () => {
    expect(gapTakeaway([])).toBe('모든 거래처가 평소 발주 주기 안에서 안정적으로 유지되고 있어요.');
  });
});
