import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetDailyCounterForTest } from '../api/_llm';
import { DEFAULT_NEWS_QUERY, NEWS_QUERY_MAX, filterNews, isKoreanHost, normalizeNewsQuery, searchNews } from '../api/_news';
import newsHandler from '../api/llm/news';

const SECRET = 'sk-test-SECRET-1234567890abcdef';

function res(ok: boolean, status: number, json: any) {
  return { ok, status, json: async () => json };
}

const r = (over: Record<string, any> = {}) => ({
  title: '생산·수출 줄고 일자리 증발 기계산업 메카 창원 빨간불',
  url: 'https://www.mk.co.kr/news/economy/1',
  hostname: 'mk.co.kr',
  date: '2026-11-10',
  description: '설명',
  ...over,
});

beforeEach(() => {
  __resetDailyCounterForTest();
});

describe('normalizeNewsQuery', () => {
  it('비어 있으면 기본 검색어, 공백과 제어문자는 정리한다', () => {
    expect(normalizeNewsQuery('')).toBe(DEFAULT_NEWS_QUERY);
    expect(normalizeNewsQuery(undefined)).toBe(DEFAULT_NEWS_QUERY);
    expect(normalizeNewsQuery('  금속   가공\n동향 ')).toBe('금속 가공 동향');
  });
  it(`최대 ${NEWS_QUERY_MAX}자로 자른다`, () => {
    expect(normalizeNewsQuery('가'.repeat(200)).length).toBe(NEWS_QUERY_MAX);
  });
  it('문자열이 아니면 기본 검색어', () => {
    expect(normalizeNewsQuery(123)).toBe(DEFAULT_NEWS_QUERY);
    expect(normalizeNewsQuery({ a: 1 })).toBe(DEFAULT_NEWS_QUERY);
  });
});

describe('filterNews', () => {
  it('정상 항목은 통과하고 hostname의 www를 제거한다', () => {
    const out = filterNews([r({ hostname: 'www.mk.co.kr' })]);
    expect(out).toHaveLength(1);
    expect(out[0].hostname).toBe('mk.co.kr');
  });
  it('SNS, 블로그, 위키 등 부적절한 도메인은 제외한다', () => {
    const hosts = ['instagram.com', 'blog.naver.com', 'kr.linkedin.com', 'youtube.com', 'hyeong.blogspot.com', 'ko.wikipedia.org'];
    const list = hosts.map((h, i) => r({ hostname: h, url: `https://${h}/${i}` }));
    expect(filterNews(list)).toEqual([]);
  });
  it('날짜가 없거나 잘못된 항목은 제외한다', () => {
    expect(filterNews([r({ date: '' }), r({ date: undefined }), r({ date: '2026-13-45' }), r({ date: '2026' })])).toEqual([]);
  });
  it('한국 매체(.kr, kr. 서브도메인)만 쓴다', () => {
    expect(isKoreanHost('mk.co.kr')).toBe(true);
    expect(isKoreanHost('kr.investing.com')).toBe(true);
    expect(isKoreanHost('sccommerce.com')).toBe(false);
    expect(filterNews([r({ hostname: 'sccommerce.com', url: 'https://sccommerce.com/a' })])).toEqual([]);
  });
  it('제목이 너무 짧거나 목차·목록 페이지는 제외한다', () => {
    expect(filterNews([r({ title: '목 차' }), r({ title: '아웃소싱 < 기사목록' }), r({ title: '짧은제목' })])).toEqual([]);
  });
  it('같은 매체와 같은 URL은 한 번만, 최대 3건', () => {
    const list = [
      r({ hostname: 'a.co.kr', url: 'https://a.co.kr/1' }),
      r({ hostname: 'a.co.kr', url: 'https://a.co.kr/2' }), // 같은 매체
      r({ hostname: 'b.co.kr', url: 'https://b.co.kr/1' }),
      r({ hostname: 'c.co.kr', url: 'https://c.co.kr/1' }),
      r({ hostname: 'd.co.kr', url: 'https://d.co.kr/1' }),
    ];
    const out = filterNews(list);
    expect(out.map(x => x.hostname)).toEqual(['a.co.kr', 'b.co.kr', 'c.co.kr']);
  });
  it('http(s)가 아닌 URL과 배열이 아닌 입력을 안전하게 처리한다', () => {
    expect(filterNews([r({ url: 'javascript:alert(1)' })])).toEqual([]);
    expect(filterNews(undefined as any)).toEqual([]);
  });
});

describe('searchNews (Liner Search API)', () => {
  const env = { LINER_API_KEY: SECRET };

  it('키가 없으면 503 no_key이며 호출하지 않는다', async () => {
    const f = vi.fn();
    const out = await searchNews('x', {}, f as any, 0);
    expect(out.status).toBe(503);
    expect(out.body.code).toBe('no_key');
    expect(f).not.toHaveBeenCalled();
  });

  it('올바른 주소·헤더·본문으로 호출하고 걸러진 항목을 돌려준다', async () => {
    const f = vi.fn().mockResolvedValue(
      res(true, 200, {
        results: [r(), r({ hostname: 'instagram.com', url: 'https://instagram.com/p/1' }), r({ date: '', url: 'https://x.co.kr/1', hostname: 'x.co.kr' })],
      })
    );
    const out = await searchNews('  금속 동향 ', env, f as any, 0);
    expect(out.status).toBe(200);
    expect(out.body.query).toBe('금속 동향');
    expect(out.body.items).toHaveLength(1);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('https://platform.liner.com/api/v1/tools/search/web');
    expect(init.headers['x-api-key']).toBe(SECRET);
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ query: '금속 동향', lang: 'ko', country_code: 'kr', date_range: 'past_month', include_knowledge: false });
  });

  it('429 다음 200이면 1회 재시도로 성공한다', async () => {
    const f = vi.fn().mockResolvedValueOnce(res(false, 429, {})).mockResolvedValueOnce(res(true, 200, { results: [r()] }));
    const out = await searchNews('x', env, f as any, 0);
    expect(f).toHaveBeenCalledTimes(2);
    expect(out.status).toBe(200);
  });

  it('401은 재시도하지 않고 auth 오류이며 키가 응답에 없다', async () => {
    const f = vi.fn().mockResolvedValue(res(false, 401, { error: `bad ${SECRET}` }));
    const out = await searchNews('x', env, f as any, 0);
    expect(f).toHaveBeenCalledTimes(1);
    expect(out.body.code).toBe('auth');
    expect(JSON.stringify(out)).not.toContain(SECRET);
  });

  it('타임아웃은 504 timeout', async () => {
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    const out = await searchNews('x', env, vi.fn().mockRejectedValue(abort) as any, 0);
    expect(out.status).toBe(504);
    expect(out.body.code).toBe('timeout');
  });

  it('하루 호출 한도를 넘으면 429 limit', async () => {
    const f = vi.fn().mockResolvedValue(res(true, 200, { results: [r()] }));
    const e = { ...env, LINER_DAILY_LIMIT: '1' };
    expect((await searchNews('x', e, f as any, 0)).status).toBe(200);
    const second = await searchNews('x', e, f as any, 0);
    expect(second.status).toBe(429);
    expect(second.body.code).toBe('limit');
  });

  it('결과가 비어도 200이며 items는 빈 배열', async () => {
    const out = await searchNews('x', env, vi.fn().mockResolvedValue(res(true, 200, { results: [] })) as any, 0);
    expect(out.status).toBe(200);
    expect(out.body.items).toEqual([]);
  });
});

describe('Vercel 함수 /api/llm/news', () => {
  function mockRes() {
    const o: any = { statusCode: 0, body: undefined };
    o.status = (c: number) => ((o.statusCode = c), o);
    o.json = (b: any) => ((o.body = b), o);
    return o;
  }
  it('POST가 아니면 405', async () => {
    const o = mockRes();
    await newsHandler({ method: 'GET' }, o);
    expect(o.statusCode).toBe(405);
  });
  it('키가 없으면 503 no_key', async () => {
    const saved = process.env.LINER_API_KEY;
    delete process.env.LINER_API_KEY;
    try {
      const o = mockRes();
      await newsHandler({ method: 'POST', body: { query: '동향' } }, o);
      expect(o.statusCode).toBe(503);
      expect(o.body.code).toBe('no_key');
    } finally {
      if (saved) process.env.LINER_API_KEY = saved;
    }
  });
});
