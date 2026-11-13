import type { NewsItem } from './types';
import { logApiCall } from './storage';

/** 기본 검색어: 뉴스성 기사(통신사, 일간지)가 가장 잘 나온 표현 */
export const DEFAULT_NEWS_QUERY = '제조업 중소기업 수주 동향 뉴스';
export const NEWS_QUERY_MAX = 60;

const CACHE_PREFIX = 'magentify_news_';
const BUNDLED_NEWS_URL = '/cache/news-cache.json';

export interface NewsResult {
  items: NewsItem[];
  /** live: 이번에 Liner Search를 호출함 / cache: 저장본 / none: 결과 없음 또는 실패 */
  source: 'live' | 'cache' | 'none';
  latency_ms: number | null;
  error_code: string | null;
  query: string;
}

/** 서버와 같은 규칙으로 검색어를 정리한다. */
export function normalizeNewsQuery(q: unknown): string {
  const s = typeof q === 'string' ? q.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim() : '';
  return (s || DEFAULT_NEWS_QUERY).slice(0, NEWS_QUERY_MAX);
}

/** 기사 목록의 짧은 지문(캐시 키용). 같은 기사 URL 목록이면 항상 같은 값. */
export function newsFingerprint(items: NewsItem[]): string {
  const s = items.map(i => i.url).join('|');
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

let bundledNews: Record<string, { items: NewsItem[] }> | null | undefined;

export function __setBundledNewsForTest(v: Record<string, { items: NewsItem[] }> | null | undefined): void {
  bundledNews = v;
}

function getLocal(query: string): NewsItem[] | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + query);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? parsed : null;
  } catch {
    return null;
  }
}

function setLocal(query: string, items: NewsItem[]): void {
  try {
    localStorage.setItem(CACHE_PREFIX + query, JSON.stringify(items));
  } catch {
    // 용량 초과 등은 무시
  }
}

async function getBundled(query: string): Promise<NewsItem[] | null> {
  if (bundledNews === undefined) {
    try {
      const res = await fetch(BUNDLED_NEWS_URL);
      bundledNews = res.ok ? await res.json() : null;
    } catch {
      bundledNews = null;
    }
  }
  const items = bundledNews?.[query]?.items;
  return Array.isArray(items) && items.length ? items : null;
}

/**
 * 업종 동향을 가져온다.
 * 데모 모드(새로 불러오기가 아닐 때)는 저장본을 먼저 쓰고, 없으면 Liner Search API를 호출한다.
 * 실패하거나 결과가 없으면 items가 비어 있고(source='none'), 이메일은 동향 없이 만들어진다.
 */
export async function fetchNews(
  rawQuery: string,
  options: { demoMode: boolean; forceLive?: boolean }
): Promise<NewsResult> {
  const query = normalizeNewsQuery(rawQuery);

  if (options.demoMode && !options.forceLive) {
    const cached = getLocal(query) ?? (await getBundled(query));
    if (cached) return { items: cached, source: 'cache', latency_ms: null, error_code: null, query };
  }

  const started = performance.now();
  const meta = { provider: 'liner' as const, model: 'search/web', strategy: null };
  try {
    const res = await fetch('/api/llm/news', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    const latency = Math.round(performance.now() - started);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const code = err.code || `http_${res.status}`;
      logApiCall({ task: 'news', ok: false, error_code: code, latency_ms: latency, ...meta, provider: code === 'no_key' ? null : 'liner' });
      return { items: [], source: 'none', latency_ms: null, error_code: code, query };
    }
    const data = await res.json();
    const items: NewsItem[] = Array.isArray(data.items) ? data.items : [];
    if (items.length === 0) {
      logApiCall({ task: 'news', ok: false, error_code: 'empty', latency_ms: latency, ...meta });
      return { items: [], source: 'none', latency_ms: latency, error_code: 'empty', query };
    }
    logApiCall({ task: 'news', ok: true, error_code: null, latency_ms: latency, ...meta });
    setLocal(query, items);
    return { items, source: 'live', latency_ms: latency, error_code: null, query };
  } catch {
    logApiCall({ task: 'news', ok: false, error_code: 'network', latency_ms: Math.round(performance.now() - started), ...meta, provider: null });
    return { items: [], source: 'none', latency_ms: null, error_code: 'network', query };
  }
}
