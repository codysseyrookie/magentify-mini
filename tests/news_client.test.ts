import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { analyze, buildClean, suggestMapping } from '../src/analysis';
import { DEMO_CSV_DATA, parseCSV } from '../src/demoData';
import { __setBundledCacheForTest, emailCacheKey, generateEmail, newsPromptBlock, validate, NEWS_SYSTEM_RULES } from '../src/llm';
import { __setBundledNewsForTest, DEFAULT_NEWS_QUERY, fetchNews, newsFingerprint } from '../src/news';
import type { NewsItem } from '../src/types';

const REF = '2026-11-30';
const FLAGS = {
  '대성정밀': { vip: true, project_based: false },
  '미래산업': { vip: true, project_based: false },
  '바른설비': { vip: false, project_based: true },
};

const NEWS: NewsItem[] = [
  { title: '기업 체감경기 4년여 만에 최고…반도체 온기 확산', url: 'https://nocutnews.co.kr/a', hostname: 'nocutnews.co.kr', date: '2026-10-29', description: '' },
  { title: '생산·수출 줄고 일자리 증발 기계산업 메카 창원 빨간불', url: 'https://mk.co.kr/b', hostname: 'mk.co.kr', date: '2026-11-10', description: '' },
];

function daeseong() {
  const { headers, rows } = parseCSV(DEMO_CSV_DATA);
  const q = buildClean(rows, suggestMapping(headers), REF);
  return analyze(q.clean_rows, FLAGS, REF).find(a => a.display_name === '대성정밀')!;
}

const okEmail = (extra: Record<string, any> = {}) =>
  JSON.stringify({
    subject: '[거래처명] 안부 인사',
    body: '[담당자명]님, 안녕하세요. 최근 업계 소식을 접하며 안부를 여쭙고자 연락드립니다.',
    check_questions: ['최근 발주 일정에 변경이 있었는지', '현재 필요한 물량이나 일정이 있는지'],
    ...extra,
  });

function mockFetch(responses: Array<{ ok: boolean; status?: number; json: any }>) {
  const fn = vi.fn();
  for (const r of responses) fn.mockResolvedValueOnce({ ok: r.ok, status: r.status ?? (r.ok ? 200 : 500), json: async () => r.json });
  vi.stubGlobal('fetch', fn);
  return fn;
}

beforeEach(() => {
  __setBundledNewsForTest(null);
  __setBundledCacheForTest(null);
});
afterEach(() => {
  vi.unstubAllGlobals();
  __setBundledNewsForTest(undefined);
  __setBundledCacheForTest(undefined);
});

describe('fetchNews (클라이언트)', () => {
  it('데모 모드이고 저장본이 있으면 호출 없이 cache를 돌려준다', async () => {
    __setBundledNewsForTest({ [DEFAULT_NEWS_QUERY]: { items: NEWS } });
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    const r = await fetchNews(DEFAULT_NEWS_QUERY, { demoMode: true });
    expect(r.source).toBe('cache');
    expect(r.items).toHaveLength(2);
    expect(f).not.toHaveBeenCalled();
  });

  it('forceLive이면 저장본을 무시하고 /api/llm/news를 호출한다', async () => {
    __setBundledNewsForTest({ [DEFAULT_NEWS_QUERY]: { items: NEWS } });
    const f = mockFetch([{ ok: true, json: { items: [NEWS[1]], query: DEFAULT_NEWS_QUERY } }]);
    const r = await fetchNews(DEFAULT_NEWS_QUERY, { demoMode: true, forceLive: true });
    expect(f).toHaveBeenCalledTimes(1);
    expect(String(f.mock.calls[0][0])).toBe('/api/llm/news');
    expect(JSON.parse((f.mock.calls[0][1] as any).body)).toEqual({ query: DEFAULT_NEWS_QUERY });
    expect(r.source).toBe('live');
    expect(r.items).toEqual([NEWS[1]]);
  });

  it('키가 없으면(503) 결과 없음(none)이며 live/cache로 위장하지 않는다', async () => {
    mockFetch([{ ok: false, status: 503, json: { error: 'No key', code: 'no_key' } }]);
    const r = await fetchNews('동향', { demoMode: false });
    expect(r.source).toBe('none');
    expect(r.items).toEqual([]);
    expect(r.error_code).toBe('no_key');
  });

  it('검색 결과가 비어 있으면 none(empty)', async () => {
    mockFetch([{ ok: true, json: { items: [], query: 'x' } }]);
    const r = await fetchNews('x', { demoMode: false });
    expect(r.source).toBe('none');
    expect(r.error_code).toBe('empty');
  });

  it('서버에 연결할 수 없으면 none(network)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const r = await fetchNews('x', { demoMode: false });
    expect(r.source).toBe('none');
    expect(r.error_code).toBe('network');
  });
});

describe('이메일에 업종 동향 반영', () => {
  it('캐시 키는 기사 목록이 있을 때만 지문(news-...)이 붙고, 같은 기사면 같다', () => {
    const a = daeseong();
    expect(emailCacheKey(a, '정중하게')).not.toContain('_news-');
    const k1 = emailCacheKey(a, '정중하게', NEWS);
    expect(k1).toContain('_news-');
    expect(emailCacheKey(a, '정중하게', [...NEWS])).toBe(k1);
    expect(emailCacheKey(a, '정중하게', [NEWS[0]])).not.toBe(k1);
    expect(newsFingerprint(NEWS)).toBe(newsFingerprint([...NEWS]));
  });

  it('프롬프트에는 기사 제목만 전달하고(URL 제외), 시스템 규칙에 사실 인용 금지가 들어간다', async () => {
    const f = mockFetch([{ ok: true, json: { text: okEmail(), provider: 'liner', model: 'm' } }]);
    await generateEmail(daeseong(), { demoMode: false, news: NEWS });
    const body = JSON.parse((f.mock.calls[0][1] as any).body);
    expect(body.userPrompt).toContain(NEWS[0].title);
    expect(body.userPrompt).not.toContain('https://');
    expect(body.systemPrompt).toContain(NEWS_SYSTEM_RULES.trim().slice(0, 12));
    expect(newsPromptBlock([])).toBe('');
  });

  it('동향이 없으면 기존 프롬프트와 같고 규칙이 추가되지 않는다', async () => {
    const f = mockFetch([{ ok: true, json: { text: okEmail(), provider: 'liner', model: 'm' } }]);
    await generateEmail(daeseong(), { demoMode: false });
    const body = JSON.parse((f.mock.calls[0][1] as any).body);
    expect(body.userPrompt).not.toContain('참고 업계 소식');
    expect(body.systemPrompt).not.toContain('업계 소식 활용 규칙');
  });

  it('기사 제목에 있는 숫자를 본문에 인용하면 위반으로 처리한다', async () => {
    const news: NewsItem[] = [{ ...NEWS[0], title: '기업 체감경기 4년여 만에 최고 기록, 지수 97 돌파' }];
    const bad = okEmail({ body: '최근 체감경기 지수 97을 보며 안부를 여쭙니다.' });
    mockFetch([
      { ok: true, json: { text: bad, provider: 'liner' } },
      { ok: true, json: { text: bad, provider: 'liner' } },
    ]);
    const r = await generateEmail(daeseong(), { demoMode: false, news });
    expect(r.source).toBe('fallback');
    expect(r.error_code).toBe('rule_violation');
  });

  it('이메일 본문에 링크가 있으면 위반', () => {
    const v = validate('email', { subject: 's', body: '자세한 내용 https://mk.co.kr/b', check_questions: [] });
    expect(v.some(x => x.includes('링크'))).toBe(true);
    expect(validate('email', { subject: 's', body: '안부 인사드립니다', check_questions: [] })).toEqual([]);
  });

  it('데모 모드에서 같은 기사 목록의 저장본 이메일이 있으면 호출 없이 cache', async () => {
    const a = daeseong();
    __setBundledCacheForTest({ [emailCacheKey(a, '정중하게', NEWS)]: JSON.parse(okEmail()) });
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    const r = await generateEmail(a, { demoMode: true, news: NEWS });
    expect(r.source).toBe('cache');
    expect(f).not.toHaveBeenCalled();
  });
});
