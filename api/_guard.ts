/**
 * 공개 API 보호: Liner 크레딧을 임의로 쓰지 못하게 한다.
 *  1) 같은 출처(Origin)의 브라우저 요청만 허용
 *  2) IP별 호출 횟수 제한(인스턴스 메모리 기준, best-effort)
 *  3) 앱이 쓰는 작업(task)만 허용하고, 작업별 시스템 프롬프트 시그니처와 길이를 검사
 *
 * 한계: Origin 헤더는 curl 등으로 위조할 수 있고, 서버리스 인스턴스가 여러 개면 횟수 제한도 인스턴스별이다.
 * 로그인이 없는 데모 앱의 현실적인 최소 방어이며, 완전한 인증을 대신하지 않는다.
 */

export type GuardKind = 'generate' | 'news';
export type TaskName = 'briefing' | 'email' | 'call' | 'qa' | 'followup' | 'news_query';

type Env = Record<string, string | undefined>;
export interface GuardResult {
  status: number;
  body: { error: string; code: string };
}
export interface GuardRequest {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
  ip?: string;
  body?: any;
}

export const SYSTEM_MAX = 4000;

/** 작업별 시스템 프롬프트 시그니처(src/llm.ts의 프롬프트와 맞춰야 한다)와 사용자 프롬프트 최대 길이 */
export const TASKS: Record<TaskName, { startsWith: string; includes: string; userMax: number }> = {
  briefing: { startsWith: '너는 B2B 제조업 대표를 위한 거래처 관리 비서다.', includes: '주간 브리핑', userMax: 3000 },
  qa: { startsWith: '너는 B2B 제조업 대표를 위한 거래처 관리 비서다.', includes: '질문에 답하라', userMax: 40000 },
  email: { startsWith: '너는 소규모 제조사 대표를 대필하는 업무 이메일 작성 비서다.', includes: '이메일', userMax: 3500 },
  call: { startsWith: '너는 소규모 제조사 대표를 위한 전화 통화 가이드 작성 비서다.', includes: '통화', userMax: 1500 },
  followup: { startsWith: '너는 접촉 메모에서 후속 조치를 뽑아 주는 비서다.', includes: '후속 조치', userMax: 3000 },
  news_query: { startsWith: '너는 업종 동향 검색어를 만드는 비서다.', includes: '검색어', userMax: 200 },
};

function header(h: GuardRequest['headers'], name: string): string {
  const v = h?.[name];
  return (Array.isArray(v) ? v[0] : v) || '';
}

/** 같은 출처의 브라우저 요청인지. 최신 브라우저의 동일 출처 POST는 Origin 또는 Sec-Fetch-Site를 항상 보낸다. */
export function isSameOrigin(headers: GuardRequest['headers']): boolean {
  if (header(headers, 'sec-fetch-site') === 'same-origin') return true;
  const origin = header(headers, 'origin');
  const host = header(headers, 'x-forwarded-host') || header(headers, 'host');
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host.split(',')[0].trim();
  } catch {
    return false;
  }
}

export function clientIp(req: GuardRequest): string {
  const xf = header(req.headers, 'x-forwarded-for');
  return (xf ? xf.split(',')[0].trim() : req.ip) || 'unknown';
}

// ---- 횟수 제한 (슬라이딩 윈도) ----
const hits = new Map<string, number[]>();
export function __resetRateLimitForTest(): void {
  hits.clear();
}

export function rateLimited(key: string, max: number, windowMs: number, now = Date.now()): boolean {
  const arr = (hits.get(key) || []).filter(t => now - t < windowMs);
  if (arr.length >= max) {
    hits.set(key, arr);
    return true;
  }
  arr.push(now);
  hits.set(key, arr);
  // 메모리 보호: 오래된 키 정리
  if (hits.size > 2000) {
    for (const [k, v] of hits) if (v.every(t => now - t >= windowMs)) hits.delete(k);
  }
  return false;
}

const num = (v: string | undefined, d: number) => (Number(v) > 0 ? Number(v) : d);

/** 본문(작업, 시스템 프롬프트 시그니처, 길이)이 앱이 보내는 형태인지 검사한다. 오류가 없으면 null. */
export function validateGenerateBody(body: any): GuardResult | null {
  const bad = (error: string): GuardResult => ({ status: 400, body: { error, code: 'bad_request' } });
  const task = body?.task as TaskName;
  const spec = TASKS[task];
  if (!spec) return bad('unsupported task');
  const { systemPrompt, userPrompt } = body;
  if (typeof systemPrompt !== 'string' || typeof userPrompt !== 'string' || !userPrompt) return bad('systemPrompt/userPrompt required');
  if (systemPrompt.length > SYSTEM_MAX) return bad('systemPrompt too long');
  if (userPrompt.length > spec.userMax) return bad('userPrompt too long');
  if (!systemPrompt.startsWith(spec.startsWith) || !systemPrompt.includes(spec.includes)) return bad('prompt does not match task');
  return null;
}

/** 요청을 통과시킬지 결정한다. 통과하면 null, 거절하면 응답을 돌려준다. */
export function guardRequest(req: GuardRequest, kind: GuardKind, env: Env = process.env, now = Date.now()): GuardResult | null {
  if (env.GUARD_DISABLE === '1') return null; // 로컬 점검용
  if (!isSameOrigin(req.headers)) {
    return { status: 403, body: { error: 'Cross-origin requests are not allowed', code: 'forbidden' } };
  }
  const max = kind === 'generate' ? num(env.GUARD_GENERATE_PER_10MIN, 40) : num(env.GUARD_NEWS_PER_10MIN, 20);
  if (rateLimited(`${kind}:${clientIp(req)}`, max, 10 * 60 * 1000, now)) {
    return { status: 429, body: { error: 'Too many requests. Try again later.', code: 'rate_limit' } };
  }
  if (kind === 'generate') return validateGenerateBody(req.body);
  return null;
}
