import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { analyze, buildClean, suggestMapping } from '../src/analysis';
import { DEMO_CSV_DATA, parseCSV } from '../src/demoData';
import {
  __setBundledCacheForTest,
  customerContext,
  emailExposureViolations,
  generateCallGuide,
  generateEmail,
  generateNewsQuery,
  newsQueryCacheKey,
  orderFlowText,
  validate,
} from '../src/llm';
import { __setBundledNewsForTest, DEFAULT_NEWS_QUERY } from '../src/news';
import { composeIndustryNews, fetchIndustryNews, isSimilarCompanyNews, mergeNews } from '../src/industryNews';
import { JUNK_TITLE, filterNews } from '../api/_news';
import { TASKS, validateGenerateBody } from '../api/_guard';
import type { Assessment, NewsItem } from '../src/types';

const REF = '2026-11-30';
const FLAGS = { '대성정밀': { vip: true, project_based: false } };

function all(): Assessment[] {
  const { headers, rows } = parseCSV(DEMO_CSV_DATA);
  const q = buildClean(rows, suggestMapping(headers), REF);
  return analyze(q.clean_rows, FLAGS, REF);
}
const daeseong = () => all().find(a => a.display_name === '대성정밀')!;

const store: Record<string, string> = {};
beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  });
  __setBundledCacheForTest(null);
  __setBundledNewsForTest(null);
});
afterEach(() => vi.unstubAllGlobals());

const okEmail = (body = '[담당자명]님, 안녕하세요. 정밀 금형 부품의 다음 생산 계획이 있으신지 여쭙습니다.') =>
  JSON.stringify({ subject: '안부 인사드립니다', body, check_questions: ['정밀 금형 부품 사양 변경이 있으신가요?'] });

function respond(json: any, ok = true, status = 200) {
  return Promise.resolve({ ok, status, json: () => Promise.resolve(json) } as any);
}

describe('문안 개인화(A): 품목과 주문 흐름', () => {
  it('거래처마다 가장 자주 주문한 품목을 계산한다', () => {
    const list = all();
    expect(list.find(a => a.display_name === '대성정밀')!.main_item).toBe('정밀 금형 부품');
    expect(list.find(a => a.display_name === '우리테크')!.main_item).toBe('정밀 축 가공');
  });

  it('주문 흐름은 코드가 판단한다(간격이 일정하면 "일정했음")', () => {
    expect(orderFlowText(daeseong())).toContain('일정했음');
  });

  it('거래 맥락에는 품목·최근 간격·흐름만 있고 거래처명·금액은 없다', () => {
    const a = daeseong();
    const ctx = customerContext(a);
    expect(ctx).toContain('주요 품목: 정밀 금형 부품');
    expect(ctx).toMatch(/최근 주문 간격\(일\): (\d+, ){5}\d+/);
    expect(ctx).not.toContain('대성정밀');
    expect(ctx).not.toMatch(/2400000|2,400,000/);
  });

  it('품목명에 거래처명이 섞여 있으면 가려서 보낸다', () => {
    const a = { ...daeseong(), main_item: '대성정밀 전용 금형' };
    expect(customerContext(a)).not.toContain('대성정밀');
  });

  it('이메일 요청에 거래 맥락과 "숫자를 본문에 쓰지 않는다" 규칙이 들어간다', async () => {
    const f = vi.fn(() => respond({ text: okEmail(), provider: 'liner' }));
    vi.stubGlobal('fetch', f);
    const r = await generateEmail(daeseong(), { demoMode: false, forceLive: true });
    expect(r.source).toBe('live');
    const body = JSON.parse((f.mock.calls[0] as any)[1].body);
    expect(body.userPrompt).toContain('거래 맥락: 주요 품목: 정밀 금형 부품');
    expect(body.userPrompt).not.toContain('대성정밀');
    expect(body.systemPrompt).toContain('제목과 본문에 쓰지 않는다');
  });

  it('이메일 본문에 공백 일수 같은 숫자를 쓰면 다시 요청한다', async () => {
    const f = vi
      .fn()
      .mockImplementationOnce(() => respond({ text: okEmail('[담당자명]님, 63일째 주문이 없어 연락드립니다.'), provider: 'liner' }))
      .mockImplementationOnce(() => respond({ text: okEmail(), provider: 'liner' }));
    vi.stubGlobal('fetch', f);
    const r = await generateEmail(daeseong(), { demoMode: false, forceLive: true });
    expect(f).toHaveBeenCalledTimes(2);
    expect(r.source).toBe('live');
    expect(JSON.parse((f.mock.calls[1] as any)[1].body).userPrompt).toContain('거래 공백이나 주문 간격');
  });

  it('노출 검사: "63일", "2.1배", 날짜는 걸리고 "다음 주 월요일"은 통과', () => {
    expect(emailExposureViolations({ subject: '', body: '63일 만에 연락드립니다' })).toHaveLength(1);
    expect(emailExposureViolations({ subject: '', body: '평소의 2.1배' })).toHaveLength(1);
    expect(emailExposureViolations({ subject: '', body: '2026-09-28 이후' })).toHaveLength(1);
    expect(emailExposureViolations({ subject: '안부', body: '다음 주 월요일에 다시 연락드리겠습니다.' })).toEqual([]);
  });

  it('통화 가이드도 거래 맥락을 받고, 첫 인사에 공백 숫자를 쓰면 다시 요청한다', async () => {
    const bad = JSON.stringify({ purpose: '공백 63일 확인', opening: '63일 만에 연락드립니다', questions: ['정밀 금형 부품 계획은?'], next_step: '정리', after_call: ['기록'] });
    const good = JSON.stringify({ purpose: '공백 63일 확인', opening: '안녕하세요, 안부차 연락드렸습니다', questions: ['정밀 금형 부품 계획은?'], next_step: '정리', after_call: ['기록'] });
    const f = vi
      .fn()
      .mockImplementationOnce(() => respond({ text: bad, provider: 'liner' }))
      .mockImplementationOnce(() => respond({ text: good, provider: 'liner' }));
    vi.stubGlobal('fetch', f);
    const r = await generateCallGuide(daeseong(), { demoMode: false, forceLive: true });
    expect(f).toHaveBeenCalledTimes(2);
    expect(r.source).toBe('live');
    expect(JSON.parse((f.mock.calls[0] as any)[1].body).userPrompt).toContain('주요 품목: 정밀 금형 부품');
  });
});

describe('업종 검색어(B): Liner가 품목에서 검색어를 만든다', () => {
  it('검색어 검증: 길이, 한국어, 숫자·증권 용어·링크 금지', () => {
    expect(validate('news_query', { query: '금형 업계 동향 뉴스' })).toEqual([]);
    expect(validate('news_query', { query: '금형' })).not.toEqual([]);
    expect(validate('news_query', { query: '금형 2026 동향 뉴스' })).not.toEqual([]);
    expect(validate('news_query', { query: '금형 관련주 주가 동향 뉴스' })).not.toEqual([]);
    expect(validate('news_query', { query: 'mold industry news' })).not.toEqual([]);
    expect(validate('news_query', {})).not.toEqual([]);
  });

  it('품목만 보내고(거래처명 없음) 비용 우선 전략으로 요청한다', async () => {
    const f = vi.fn(() => respond({ text: JSON.stringify({ query: '금형 업계 동향 뉴스' }), provider: 'liner', model: 'm' }));
    vi.stubGlobal('fetch', f);
    const r = await generateNewsQuery('정밀 금형 부품', { demoMode: false, forceLive: true });
    expect(r.source).toBe('live');
    expect(r.content.query).toBe('금형 업계 동향 뉴스');
    const body = JSON.parse((f.mock.calls[0] as any)[1].body);
    expect(body).toMatchObject({ task: 'news_query', userPrompt: '품목: 정밀 금형 부품', strategy: 'cost' });
    // 서버 가드의 작업 시그니처를 통과하는 요청이어야 한다
    expect(validateGenerateBody(body)).toBeNull();
  });

  it('저장본에 0건으로 기록된 검색어는 데모 모드에서 다시 호출하지 않는다', async () => {
    __setBundledCacheForTest({ [newsQueryCacheKey('정밀 축 가공')]: { query: '정밀가공 업계 동향 뉴스' } });
    const d: NewsItem = { url: 'https://n.kr/d', title: '기본 검색 기사 제목입니다', hostname: 'n.kr', date: '2026-11-10', description: '' };
    __setBundledNewsForTest({ '정밀가공 업계 동향 뉴스': { items: [] }, [DEFAULT_NEWS_QUERY]: { items: [d] } });
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    const r = await fetchIndustryNews('정밀 축 가공', { demoMode: true }, '우리테크');
    expect(f).not.toHaveBeenCalled();
    expect(r.items).toEqual([d]);
    expect(r.source).toBe('cache');
    expect(r.query).toBe('정밀가공 업계 동향 뉴스');
  });

  it('실시간 검색이 0건이면 저장본 기사를 저장본 라벨로 쓴다(실시간으로 위장하지 않음)', async () => {
    const d: NewsItem = { url: 'https://n.kr/d', title: '기본 검색 기사 제목입니다', hostname: 'n.kr', date: '2026-11-10', description: '' };
    __setBundledNewsForTest({ [DEFAULT_NEWS_QUERY]: { items: [d] } });
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url.includes('/api/llm/generate')) return respond({ text: JSON.stringify({ query: '금형 업계 동향 뉴스' }), provider: 'liner' });
      return respond({ items: [] });
    }));
    const r = await fetchIndustryNews('정밀 금형 부품', { demoMode: true, forceLive: true }, '대성정밀');
    expect(r.items).toEqual([d]);
    expect(r.source).toBe('cache');
    expect(r.queryHits).toBe(0);
  });

  it('데모 모드는 저장본 검색어를 먼저 쓴다', async () => {
    __setBundledCacheForTest({ [newsQueryCacheKey('정밀 금형 부품')]: { query: '금형 업계 동향 뉴스' } });
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    const r = await generateNewsQuery('정밀 금형 부품', { demoMode: true });
    expect(r.source).toBe('cache');
    expect(f).not.toHaveBeenCalled();
  });

  it('mergeNews: 업종 기사를 먼저, 기본 기사로 3건까지 채우고 중복을 뺀다', () => {
    const n = (u: string, t = `기사 제목 ${u} 입니다`): NewsItem => ({ url: `https://a.kr/${u}`, title: t, hostname: 'a.kr', date: '2026-11-01', description: '' });
    const r = mergeNews([n('1'), n('2')], [n('2'), n('3', '기사 제목 1 입니다'), n('4'), n('5')]);
    expect(r.items.map(i => i.url)).toEqual(['https://a.kr/1', 'https://a.kr/2', 'https://a.kr/4']);
    expect(r.fromPrimary).toBe(2);
  });

  it('fetchIndustryNews: 검색어 생성 → 업종 검색 + 기본 검색 → 합쳐서 실시간 표시', async () => {
    const item = (u: string): NewsItem => ({ url: `https://news.kr/${u}`, title: `업계 소식 기사 제목 ${u}`, hostname: 'news.kr', date: '2026-11-10', description: '' });
    const searched: string[] = [];
    vi.stubGlobal('fetch', vi.fn((url: string, init: any) => {
      const body = JSON.parse(init.body);
      if (url.includes('/api/llm/generate')) return respond({ text: JSON.stringify({ query: '금형 업계 동향 뉴스' }), provider: 'liner' });
      searched.push(body.query);
      return respond({ items: body.query === DEFAULT_NEWS_QUERY ? [item('d1'), item('d2'), item('d3')] : [item('m1')], query: body.query });
    }));
    const r = await fetchIndustryNews('정밀 금형 부품', { demoMode: false, forceLive: true });
    expect(searched.sort()).toEqual(['금형 업계 동향 뉴스', DEFAULT_NEWS_QUERY].sort());
    expect(r.query).toBe('금형 업계 동향 뉴스');
    expect(r.querySource).toBe('live');
    expect(r.items.map(i => i.url)).toEqual(['https://news.kr/m1', 'https://news.kr/d1', 'https://news.kr/d2']);
    expect(r.source).toBe('live');
  });

  it('품목이 없거나 검색어를 못 만들면 기본 검색어만 쓴다', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string, init: any) => {
      if (url.includes('/api/llm/generate')) return respond({ error: 'x', code: 'auth' }, false, 502);
      return respond({ items: [{ url: 'https://n.kr/1', title: '기본 검색 기사 제목입니다', hostname: 'n.kr', date: '2026-11-10', description: '' }] });
    }));
    const r1 = await fetchIndustryNews('정밀 금형 부품', { demoMode: false, forceLive: true });
    expect(r1.query).toBeNull();
    expect(r1.items).toHaveLength(1);
    const r2 = await fetchIndustryNews(null, { demoMode: false, forceLive: true });
    expect(r2.query).toBeNull();
    expect(r2.items).toHaveLength(1);
  });
});

describe('거래처와 이름이 비슷한 회사 기사 제외', () => {
  it('대성정밀이면 대성엔지니어링 기사를 뺀다', () => {
    expect(isSimilarCompanyNews('올해의 금형인에 박대성 대성엔지니어링 대표', '대성정밀')).toBe(true);
    expect(isSimilarCompanyNews('삼우정밀 신규 공장 착공', '삼우정밀(2공장)')).toBe(true);
  });
  it('일반 단어와 같은 이름 일부는 빼지 않는다', () => {
    expect(isSimilarCompanyNews('“수출 잘된다더니 우리 공장은 왜”…중소기업 경기 온도차', '우리테크')).toBe(false);
    expect(isSimilarCompanyNews('반도체가 끌고 자동차가 밀고…기업심리 기준선 넘었다', '대성정밀')).toBe(false);
    expect(isSimilarCompanyNews('아무 기사', null)).toBe(false);
  });
  it('composeIndustryNews는 걸러낸 뒤 합친다', () => {
    const n = (u: string, t: string): NewsItem => ({ url: `https://a.kr/${u}`, title: t, hostname: 'a.kr', date: '2026-11-01', description: '' });
    const r = composeIndustryNews([n('1', '올해의 금형인에 박대성 대성엔지니어링 대표')], [n('2', '중소기업 경기 온도차 기사 제목')], '대성정밀');
    expect(r.items.map(i => i.url)).toEqual(['https://a.kr/2']);
    expect(r.fromPrimary).toBe(0);
  });
});

describe('검색 잡음 필터와 서버 가드', () => {
  it('주가·티커·종목·서적 제목은 기사로 쓰지 않는다', () => {
    for (const t of ['Cs Bearing 오늘의 주가 | 실시간 티커', '[MK 골든크로스 돌파종목 : 서연탑메탈', '[소재/부품/장비] 분야별 기술 보고서 ( 서적 | PDF )', 'KOTRA 무역투자24']) {
      expect(JUNK_TITLE.test(t)).toBe(true);
    }
    expect(JUNK_TITLE.test('뿌리산업 특화단지 4개 추가 지정')).toBe(false);
    const out = filterNews([
      { title: 'Cs Bearing Co Ltd 오늘의 주가 | 297090 실시간 티커', url: 'https://kr.investing.com/x', hostname: 'kr.investing.com', date: '2026-11-19' },
      { title: '뿌리산업 특화단지 4개 추가 지정 | 경제정책자료', url: 'https://eiec.kdi.re.kr/y', hostname: 'eiec.kdi.re.kr', date: '2026-10-30' },
    ]);
    expect(out.map(o => o.hostname)).toEqual(['eiec.kdi.re.kr']);
  });

  it('서버 가드는 업종 검색어 작업을 허용하고 긴 입력은 막는다', () => {
    const s = TASKS.news_query;
    expect(validateGenerateBody({ task: 'news_query', systemPrompt: `${s.startsWith}\n${s.includes}`, userPrompt: '품목: 정밀 금형 부품' })).toBeNull();
    expect(validateGenerateBody({ task: 'news_query', systemPrompt: `${s.startsWith}\n${s.includes}`, userPrompt: 'x'.repeat(s.userMax + 1) })).not.toBeNull();
  });
});
