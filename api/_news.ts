/**
 * 업종 동향 검색 (Liner Search API, 웹 검색).
 * - 이메일 초안의 "최근 업계 소식" 연락 계기와 출처 표시에 쓴다.
 * - 거래처 정보는 보내지 않는다. 사용자가 고른 일반 검색어만 전송한다.
 * - 결과는 서버에서 걸러(SNS, 광고성 페이지, 날짜 없는 글 제외) 상위 N건만 돌려준다.
 */
import { checkAndCountDaily } from './_llm.js';

export const DEFAULT_NEWS_QUERY = '제조업 중소기업 수주 동향 뉴스';
export const NEWS_QUERY_MAX = 60;
export const NEWS_MAX_ITEMS = 3;

export interface NewsItem {
  title: string;
  url: string;
  hostname: string;
  /** YYYY-MM-DD (검색 결과에 날짜가 있는 것만 사용) */
  date: string;
  description: string;
}

export interface NewsResult {
  status: number;
  body: { items?: NewsItem[]; query?: string; error?: string; code?: string };
}

type Env = Record<string, string | undefined>;
type FetchLike = (url: string, init: any) => Promise<{ ok: boolean; status: number; json: () => Promise<any> }>;

const SEARCH_URL = 'https://platform.liner.com/api/v1/tools/search/web';

// 출처로 부적절한 도메인(SNS, 블로그, 커뮤니티)
const BLOCKED_HOSTS = [
  'instagram.com', 'facebook.com', 'linkedin.com', 'twitter.com', 'x.com', 'threads.net', 'youtube.com', 'youtu.be',
  'tiktok.com', 'pinterest.com', 'reddit.com', 'blog.naver.com', 'cafe.naver.com', 'tistory.com', 'blogspot.com',
  'brunch.co.kr', 'medium.com', 'wikipedia.org', 'namu.wiki',
];

/** 검색어 정리: 공백 정리, 제어문자 제거, 최대 길이 제한. 비어 있으면 기본 검색어. */
export function normalizeNewsQuery(q: unknown): string {
  const s = typeof q === 'string' ? q.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim() : '';
  return (s || DEFAULT_NEWS_QUERY).slice(0, NEWS_QUERY_MAX);
}

function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^www\./, '');
  return BLOCKED_HOSTS.some(b => h === b || h.endsWith('.' + b));
}

/** 한국 매체인지(도메인이 .kr 로 끝나거나 kr. 서브도메인). 해외 지역 소식을 거래처 연락 계기로 쓰지 않기 위한 조건. */
export function isKoreanHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^www\./, '');
  return h.endsWith('.kr') || h.startsWith('kr.');
}

function validDate(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** 기사가 아닌 제목(주가·티커·종목 추천, 서적·PDF 판매) */
export const JUNK_TITLE = /주가|티커|종목|골든\s*크로스|매수|매도|공시|서적|\bPDF\b|무역투자24/i;

/** 검색 결과를 걸러 출처 칩에 쓸 항목만 남긴다. (순수 함수) */
export function filterNews(results: any[], max = NEWS_MAX_ITEMS): NewsItem[] {
  const out: NewsItem[] = [];
  const seenHosts = new Set<string>();
  const seenUrls = new Set<string>();
  for (const r of Array.isArray(results) ? results : []) {
    const title = typeof r?.title === 'string' ? r.title.replace(/\s+/g, ' ').trim() : '';
    const url = typeof r?.url === 'string' ? r.url.trim() : '';
    if (title.length < 10 || /목\s*차|기사\s*목록/.test(title)) continue;
    if (JUNK_TITLE.test(title)) continue; // 주가·종목 페이지, 보고서 판매 페이지는 연락 계기로 쓸 수 없다
    if (!/^https?:\/\//i.test(url)) continue;
    let host = typeof r?.hostname === 'string' ? r.hostname.trim() : '';
    if (!host) {
      try {
        host = new URL(url).hostname;
      } catch {
        continue;
      }
    }
    if (isBlockedHost(host)) continue;
    if (!isKoreanHost(host)) continue;
    if (!validDate(r?.date)) continue; // 날짜가 없는 글은 "최근 소식"으로 쓸 수 없다
    const hostKey = host.toLowerCase().replace(/^www\./, '');
    if (seenHosts.has(hostKey) || seenUrls.has(url)) continue;
    seenHosts.add(hostKey);
    seenUrls.add(url);
    out.push({
      title: title.slice(0, 120),
      url,
      hostname: hostKey,
      date: r.date,
      description: typeof r?.description === 'string' ? r.description.replace(/\s+/g, ' ').trim().slice(0, 140) : '',
    });
    if (out.length >= max) break;
  }
  return out;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function callSearchOnce(
  key: string,
  query: string,
  timeoutSec: number,
  fetchImpl: FetchLike
): Promise<{ ok: true; results: any[] } | { ok: false; status: number | null; aborted: boolean }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutSec * 1000);
  try {
    const res = await fetchImpl(SEARCH_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'x-api-key': key.trim() },
      body: JSON.stringify({
        query,
        lang: 'ko',
        country_code: 'kr',
        date_range: 'past_month',
        max_results: 10,
        include_knowledge: false, // 주가·통계 표는 필요 없다(요금도 절반)
      }),
    });
    if (!res.ok) return { ok: false, status: res.status, aborted: false };
    const data = await res.json();
    return { ok: true, results: Array.isArray(data?.results) ? data.results : [] };
  } catch (err: any) {
    return { ok: false, status: null, aborted: err?.name === 'AbortError' };
  } finally {
    clearTimeout(timer);
  }
}

export async function searchNews(
  query: unknown,
  env: Env = process.env,
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
  retryDelayMs = 1500
): Promise<NewsResult> {
  const key = (env.LINER_API_KEY || '').trim();
  if (!key) return { status: 503, body: { error: 'No Liner API key configured on server', code: 'no_key' } };

  const q = normalizeNewsQuery(query);
  const limit = Number(env.LINER_DAILY_LIMIT) > 0 ? Number(env.LINER_DAILY_LIMIT) : 200;
  if (!checkAndCountDaily(limit)) return { status: 429, body: { error: 'Daily live-call limit reached', code: 'limit' } };

  const timeoutSec = Number(env.LINER_SEARCH_TIMEOUT_SEC) > 0 ? Number(env.LINER_SEARCH_TIMEOUT_SEC) : 20;
  let last: { status: number | null; aborted: boolean } = { status: null, aborted: false };
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await callSearchOnce(key, q, timeoutSec, fetchImpl);
    if (r.ok) return { status: 200, body: { items: filterNews(r.results), query: q } };
    last = { status: r.status, aborted: r.aborted };
    const retryable = r.aborted || r.status === 429 || (r.status !== null && r.status >= 500);
    if (!retryable) break;
    if (attempt === 0) await sleep(retryDelayMs);
  }
  if (last.aborted) return { status: 504, body: { error: 'Liner Search timeout', code: 'timeout' } };
  if (last.status === null) return { status: 502, body: { error: 'Liner Search network error', code: 'server' } };
  const code = last.status === 401 || last.status === 403 ? 'auth' : last.status === 429 ? 'rate_limit' : last.status >= 500 ? 'server' : `http_${last.status}`;
  return { status: 502, body: { error: `Liner Search HTTP error: ${last.status}`, code } };
}
