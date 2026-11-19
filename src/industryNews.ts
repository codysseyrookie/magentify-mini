import type { NewsItem } from './types';
import { generateNewsQuery } from './llm';
import { DEFAULT_NEWS_QUERY, NEWS_QUERY_MAX, fetchNews, normalizeNewsQuery, type NewsResult } from './news';

export const NEWS_MERGE_MAX = 3;

export interface IndustryNewsResult {
  items: NewsItem[];
  /** live: 화면에 쓴 기사가 모두 이번 Liner Search 호출에서 옴 / cache: 저장본이 하나라도 섞임 / none: 결과 없음 */
  source: 'live' | 'cache' | 'none';
  /** Liner가 품목에서 만든 업종 검색어(못 만들었으면 null) */
  query: string | null;
  /** 검색어를 만든 방식: live(이번 호출) / cache(저장본) / null(만들지 않음 또는 실패) */
  querySource: 'live' | 'cache' | null;
  /** 화면에 쓴 기사 중 업종 검색어로 찾은 건수(나머지는 기본 검색어 기사) */
  queryHits: number;
}

const COMPANY_SUFFIX = '정밀|엔지니어링|산업|공업|테크|기계|금속|전자|프레스|설비|그룹|홀딩스|주식회사';

/**
 * 거래처와 이름이 비슷한 회사 기사는 빼고 보여 준다(거래처 소식으로 오해하지 않도록).
 * 예: 거래처 '대성정밀'이면 '대성엔지니어링' 기사를 뺀다. 거래처명은 브라우저 안에서만 쓴다.
 */
export function isSimilarCompanyNews(title: string, customerName: string | null | undefined): boolean {
  if (!customerName) return false;
  const name = customerName.replace(/\(.*?\)/g, '').trim();
  if (name.length >= 2 && title.includes(name)) return true;
  const core = name.replace(new RegExp(`(${COMPANY_SUFFIX})$`), '').trim();
  if (core.length < 2 || core === name) return false;
  const esc = core.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`${esc}\\s?(${COMPANY_SUFFIX})`).test(title);
}

/** 업종 검색 결과를 먼저, 기본 검색 결과로 나머지를 채운다(URL·제목 중복 제거). */
export function mergeNews(primary: NewsItem[], secondary: NewsItem[], max = NEWS_MERGE_MAX): { items: NewsItem[]; fromPrimary: number } {
  const out: NewsItem[] = [];
  const seenUrl = new Set<string>();
  const seenTitle = new Set<string>();
  let fromPrimary = 0;
  for (const [list, isPrimary] of [[primary, true], [secondary, false]] as const) {
    for (const n of list) {
      if (out.length >= max) break;
      const t = n.title.replace(/\s+/g, '');
      if (seenUrl.has(n.url) || seenTitle.has(t)) continue;
      seenUrl.add(n.url);
      seenTitle.add(t);
      out.push(n);
      if (isPrimary) fromPrimary++;
    }
  }
  return { items: out, fromPrimary };
}

/**
 * 거래처 품목에 맞춘 업종 동향.
 * 1) Liner Model API가 품목에서 업종 검색어를 만들고(비용 우선) 2) Liner Search API로 그 검색어와 기본 검색어를 찾아
 * 3) 업종 기사를 먼저, 기본 기사로 3건을 채운다. 기본 검색은 검색어 생성과 동시에 시작해 기다림을 줄인다.
 * 품목이 없거나 검색어를 못 만들면 기본 검색어 결과만 쓴다.
 */
/** 앱과 저장본 생성 스크립트가 같은 규칙으로 기사 목록을 만든다(캐시 키의 기사 지문이 같아야 한다). */
export function composeIndustryNews(primary: NewsItem[], secondary: NewsItem[], customerName?: string | null) {
  const keep = (list: NewsItem[]) => list.filter(n => !isSimilarCompanyNews(n.title, customerName));
  return mergeNews(keep(primary), keep(secondary));
}

export async function fetchIndustryNews(
  item: string | null,
  options: { demoMode: boolean; forceLive?: boolean },
  customerName?: string | null
): Promise<IndustryNewsResult> {
  const defaultPromise = fetchNews(DEFAULT_NEWS_QUERY, options);

  let query: string | null = null;
  let querySource: 'live' | 'cache' | null = null;
  let primary: NewsResult | null = null;

  if (item && item.trim()) {
    const qr = await generateNewsQuery(item, options);
    const q = qr.source !== 'fallback' ? normalizeNewsQuery(qr.content.query).slice(0, NEWS_QUERY_MAX) : '';
    if (q && q !== DEFAULT_NEWS_QUERY) {
      query = q;
      querySource = qr.source === 'live' ? 'live' : 'cache';
      primary = await fetchNews(q, options);
    }
  }

  const def = await defaultPromise;
  const { items, fromPrimary } = composeIndustryNews(primary?.items ?? [], def.items, customerName);
  if (items.length === 0) return { items, source: 'none', query, querySource, queryHits: 0 };

  const contributed: NewsResult[] = [];
  if (primary && fromPrimary > 0) contributed.push(primary);
  if (items.length > fromPrimary) contributed.push(def);
  const source = contributed.every(r => r.source === 'live') ? 'live' : 'cache';
  return { items, source, query, querySource, queryHits: fromPrimary };
}
