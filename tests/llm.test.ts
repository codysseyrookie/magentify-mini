import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { analyze, buildClean, suggestMapping } from '../src/analysis';
import { DEMO_CSV_DATA, parseCSV } from '../src/demoData';
import {
  __setBundledCacheForTest,
  buildAllowedNumbers,
  fallbackEmail,
  generateBriefing,
  generateCallGuide,
  generateEmail,
  renderPlaceholders,
  validate,
} from '../src/llm';
import { prioritize, summarize } from '../src/analysis';
import type { Assessment } from '../src/types';

const REF = '2026-11-30';
const FLAGS = {
  '대성정밀': { vip: true, project_based: false },
  '미래산업': { vip: true, project_based: false },
  '바른설비': { vip: false, project_based: true },
};

function daeseong(): Assessment {
  const { headers, rows } = parseCSV(DEMO_CSV_DATA);
  const q = buildClean(rows, suggestMapping(headers), REF);
  const list = analyze(q.clean_rows, FLAGS, REF);
  return list.find(a => a.display_name === '대성정밀')!;
}

function okEmailJson(extra: Record<string, any> = {}) {
  return JSON.stringify({
    subject: '[거래처명] 안부 인사',
    body: '안녕하세요, [담당자명]님. 최근 거래 일정 확인차 연락드립니다.',
    check_questions: ['최근 발주 일정에 변경이 있었는지', '현재 필요한 물량이나 일정이 있는지'],
    ...extra,
  });
}

function mockFetchSequence(responses: Array<{ ok: boolean; status?: number; json: any }>) {
  const fn = vi.fn();
  for (const r of responses) {
    fn.mockResolvedValueOnce({
      ok: r.ok,
      status: r.status ?? (r.ok ? 200 : 500),
      json: async () => r.json,
    });
  }
  vi.stubGlobal('fetch', fn);
  return fn;
}

beforeEach(() => {
  __setBundledCacheForTest(null); // 저장소 캐시 파일 조회를 막는다
});
afterEach(() => {
  vi.unstubAllGlobals();
  __setBundledCacheForTest(undefined);
});

describe('validate: 금지어·스키마·숫자 검사 (PRD 6.3)', () => {
  it('금지어가 있으면 위반으로 잡는다', () => {
    for (const w of ['확정', '반드시', '이탈했', '손실', '할인', '특가', '무료', '납기 보장']) {
      const v = validate('email', { subject: 's', body: `본문 ${w} 포함`, check_questions: [] });
      expect(v.some(x => x.includes(w)), w).toBe(true);
    }
  });

  it('필수 키가 없으면 위반이다', () => {
    expect(validate('email', { subject: 's' }).length).toBeGreaterThan(0);
    expect(validate('call', { purpose: 'p' }).length).toBeGreaterThan(0);
    expect(validate('briefing', { headline: 'h' }).length).toBeGreaterThan(0);
  });

  it('JSON 객체가 아니면 위반이다', () => {
    expect(validate('email', null)).toHaveLength(1);
    expect(validate('email', 'text')).toHaveLength(1);
  });

  it('입력에 없는 숫자를 인용하면 위반이다', () => {
    const allowed = buildAllowedNumbers('공백 63일, 평소간격 30일, 배수 2.1배, 2026-09-28');
    const bad = validate('email', { subject: 's', body: '최근 45일간 주문이 없었습니다.', check_questions: [] }, allowed);
    expect(bad.some(x => x.includes('입력에 없는 숫자'))).toBe(true);
    const good = validate('email', { subject: 's', body: '최근 63일간, 평소 30일 주기, 약 2배 정도 경과', check_questions: [] }, allowed);
    expect(good).toEqual([]);
  });

  it('브리핑 id 집합이 입력과 다르면 위반이다', () => {
    const content = { headline: 'h', items: [{ id: 'C01' }], caution: 'c' };
    expect(validate('briefing', content, undefined, new Set(['C01', 'C02'])).length).toBeGreaterThan(0);
    expect(validate('briefing', content, undefined, new Set(['C01']))).toEqual([]);
  });

  it('통과 가능한 폴백 템플릿은 스스로 검증을 통과한다(금지어 없음)', () => {
    const a = daeseong();
    for (const tone of ['정중하게', '친근하게', '간단하게'] as const) {
      expect(validate('email', fallbackEmail(a, tone))).toEqual([]);
    }
  });
});

describe('renderPlaceholders', () => {
  it('[거래처명]은 치환하고 담당자명이 없으면 [담당자명]을 그대로 둔다', () => {
    expect(renderPlaceholders('[거래처명] [담당자명]님', '대성정밀')).toBe('대성정밀 [담당자명]님');
    expect(renderPlaceholders('[거래처명] [담당자명]님', '대성정밀', '김부장')).toBe('대성정밀 김부장님');
  });
});

describe('LLM 호출 계층: 폴백·재요청·캐시 (PRD F12)', () => {
  it('키가 없으면(503 no_key) 폴백으로 돌려주고 live/cache 라벨을 붙이지 않는다', async () => {
    const f = mockFetchSequence([{ ok: false, status: 503, json: { error: 'No key', code: 'no_key' } }]);
    const r = await generateEmail(daeseong(), { demoMode: true, forceLive: true });
    expect(r.source).toBe('fallback');
    expect(r.error_code).toBe('no_key');
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('"새로 생성" 실패를 live 성공처럼 꾸미지 않는다 (가짜 지연시간 없음)', async () => {
    mockFetchSequence([{ ok: false, status: 502, json: { error: 'x', code: 'server' } }]);
    const r = await generateCallGuide(daeseong(), { demoMode: true, forceLive: true });
    expect(r.source).toBe('fallback');
    expect(r.latency_ms).toBeNull();
  });

  it('정상 JSON 응답이면 source=live, provider를 기록한다', async () => {
    mockFetchSequence([{ ok: true, json: { text: okEmailJson(), provider: 'liner' } }]);
    const r = await generateEmail(daeseong(), { demoMode: false });
    expect(r.source).toBe('live');
    expect(r.provider).toBe('liner');
    expect(r.error_code).toBeNull();
    expect(r.content.subject).toContain('[거래처명]');
  });

  it('코드펜스로 감싼 JSON도 파싱한다', async () => {
    mockFetchSequence([{ ok: true, json: { text: '```json\n' + okEmailJson() + '\n```', provider: 'liner' } }]);
    const r = await generateEmail(daeseong(), { demoMode: false });
    expect(r.source).toBe('live');
  });

  it('잘못된 JSON이면 1회 재요청하고, 두 번째가 정상이면 live', async () => {
    const f = mockFetchSequence([
      { ok: true, json: { text: '죄송합니다. JSON이 아닙니다', provider: 'liner' } },
      { ok: true, json: { text: okEmailJson(), provider: 'liner' } },
    ]);
    const r = await generateEmail(daeseong(), { demoMode: false });
    expect(f).toHaveBeenCalledTimes(2);
    expect(r.source).toBe('live');
    // 재요청 프롬프트에 오류 사유가 덧붙는다
    const secondBody = JSON.parse((f.mock.calls[1][1] as any).body);
    expect(secondBody.userPrompt).toContain('이전 응답 오류');
  });

  it('금지어가 두 번 연속 나오면 폴백(rule_violation)', async () => {
    const bad = okEmailJson({ body: '할인 혜택을 드리겠습니다.' });
    const f = mockFetchSequence([
      { ok: true, json: { text: bad, provider: 'liner' } },
      { ok: true, json: { text: bad, provider: 'liner' } },
    ]);
    const r = await generateEmail(daeseong(), { demoMode: false });
    expect(f).toHaveBeenCalledTimes(2);
    expect(r.source).toBe('fallback');
    expect(r.error_code).toBe('rule_violation');
    expect(JSON.stringify(r.content)).not.toContain('할인');
  });

  it('입력에 없는 숫자를 쓰면 위반으로 처리한다', async () => {
    const bad = okEmailJson({ body: '최근 45일간 주문이 없었습니다.' });
    mockFetchSequence([
      { ok: true, json: { text: bad, provider: 'liner' } },
      { ok: true, json: { text: bad, provider: 'liner' } },
    ]);
    const r = await generateEmail(daeseong(), { demoMode: false });
    expect(r.source).toBe('fallback');
    expect(r.error_code).toBe('rule_violation');
  });

  it('타임아웃(504)은 재요청하지 않고 폴백', async () => {
    const f = mockFetchSequence([{ ok: false, status: 504, json: { error: 'timeout', code: 'timeout' } }]);
    const r = await generateEmail(daeseong(), { demoMode: false });
    expect(f).toHaveBeenCalledTimes(1);
    expect(r.source).toBe('fallback');
    expect(r.error_code).toBe('timeout');
  });

  it('서버에 연결할 수 없으면(network) 폴백', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const r = await generateCallGuide(daeseong(), { demoMode: false });
    expect(r.source).toBe('fallback');
    expect(r.error_code).toBe('network');
  });

  it('데모 모드에서 저장소 캐시 파일에 항목이 있으면 호출 없이 cache를 돌려준다', async () => {
    const a = daeseong();
    const key = `email_${a.customer_key}_${a.gap_days}_${a.ratio}_정중하게`;
    __setBundledCacheForTest({ [key]: JSON.parse(okEmailJson()) });
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    const r = await generateEmail(a, { demoMode: true });
    expect(r.source).toBe('cache');
    expect(f).not.toHaveBeenCalled();
  });

  it('"새로 생성"(forceLive)은 캐시를 무시하고 live 호출을 시도한다', async () => {
    const a = daeseong();
    const key = `email_${a.customer_key}_${a.gap_days}_${a.ratio}_정중하게`;
    __setBundledCacheForTest({ [key]: JSON.parse(okEmailJson()) });
    const f = mockFetchSequence([{ ok: true, json: { text: okEmailJson(), provider: 'liner' } }]);
    const r = await generateEmail(a, { demoMode: true, forceLive: true });
    expect(f).toHaveBeenCalledTimes(1);
    expect(r.source).toBe('live');
  });

  it('데모 모드에서 캐시가 없고 키도 없으면 폴백이며 "저장본"으로 표시되지 않는다', async () => {
    mockFetchSequence([{ ok: false, status: 503, json: { error: 'No key', code: 'no_key' } }]);
    const r = await generateEmail(daeseong(), { demoMode: true });
    expect(r.source).toBe('fallback');
  });

  it('브리핑: 입력 id 집합과 같은 응답이면 live, 아니면 폴백', async () => {
    const { headers, rows } = parseCSV(DEMO_CSV_DATA);
    const q = buildClean(rows, suggestMapping(headers), REF);
    const list = analyze(q.clean_rows, FLAGS, REF);
    const top = prioritize(list);
    const summary = summarize(list);
    const ids = top.slice(0, 4).map(a => a.alias);

    const good = JSON.stringify({
      headline: '이번 주 확인할 거래처입니다',
      items: ids.map(id => ({ id, reason: '평소 간격보다 공백이 깁니다', action: 'email', tone: '정중' })),
      caution: '거래 이력만으로 이탈을 확정할 수 없습니다',
    });
    // '확정' 금지어를 피하기 위해 caution을 바꾼다
    const goodSafe = good.replace('이탈을 확정할 수 없습니다', '사실 확인이 먼저입니다');
    mockFetchSequence([{ ok: true, json: { text: goodSafe, provider: 'liner' } }]);
    const r1 = await generateBriefing(top, summary, { demoMode: false });
    expect(r1.source).toBe('live');

    const wrong = JSON.stringify({ headline: 'h', items: [{ id: 'C99' }], caution: 'c' });
    mockFetchSequence([
      { ok: true, json: { text: wrong, provider: 'liner' } },
      { ok: true, json: { text: wrong, provider: 'liner' } },
    ]);
    const r2 = await generateBriefing(top, summary, { demoMode: false });
    expect(r2.source).toBe('fallback');
  });
});

describe('브리핑 문장 품질 검증', () => {
  const base = { items: [{ id: 'C01', reason: '공백 일수는 63일입니다.' }] };
  it('영어 필드명(gap, median, ratio, high_risk)이 문장에 있으면 위반', () => {
    const v = validate('briefing', { ...base, headline: '확인 필요', caution: 'high_risk 거래처 주의' });
    expect(v.some(x => x.includes('영어 필드명'))).toBe(true);
    const v2 = validate('briefing', { headline: 'h', caution: 'c', items: [{ id: 'C01', reason: 'gap 63이 median 30' }] });
    expect(v2.some(x => x.includes('영어 필드명'))).toBe(true);
  });
  it('headline/caution에 별칭(C01)이 있으면 위반, items의 id는 허용', () => {
    expect(validate('briefing', { ...base, headline: 'C01 먼저 확인', caution: '주의' }).some(x => x.includes('별칭'))).toBe(true);
    expect(validate('briefing', { ...base, headline: '우선 거래처를 확인하세요', caution: '단정하지 마세요' })).toEqual([]);
  });
});
