/**
 * LLM 서버 로직 (Express 개발 서버와 Vercel 서버리스 함수가 함께 사용).
 * - 공급자 우선순위: Liner Model API -> (키가 없을 때만) Gemini -> 없음
 * - 파일명이 _로 시작하므로 Vercel은 이 파일을 라우트로 취급하지 않는다.
 * - API 키는 서버 환경변수에서만 읽고, 응답 본문에는 절대 포함하지 않는다.
 */

export type LlmProvider = 'liner' | 'gemini' | 'fallback';

export interface ServerStatus {
  configured: boolean;
  provider: LlmProvider;
}

/** Liner Router 전략: cost(비용 우선), balanced(기본), quality(품질 우선) */
export type RoutingStrategy = 'cost' | 'balanced' | 'quality';

export interface UsageInfo {
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
}

export interface GenerateResult {
  status: number;
  body: {
    text?: string;
    provider?: LlmProvider;
    /** 실제로 응답한 모델(라우터가 고른 모델) */
    model?: string;
    usage?: UsageInfo;
    strategy?: RoutingStrategy;
    error?: string;
    code?: string;
  };
}

export function parseStrategy(v: unknown): RoutingStrategy | undefined {
  return v === 'cost' || v === 'balanced' || v === 'quality' ? v : undefined;
}

type Env = Record<string, string | undefined>;
type FetchLike = (url: string, init: any) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<any>;
}>;

const DEFAULT_LINER_BASE = 'https://platform.liner.com/api/v1';
const DEFAULT_LINER_MODEL = 'liner-gpt-router';

/** LINER_BASE_URL이 `.../api/v1` 이든 `.../api/v1/chat/completions` 이든 올바른 호출 주소로 만든다. */
export function normalizeLinerUrl(base?: string | null): string {
  let url = (base || '').trim();
  if (!url) url = DEFAULT_LINER_BASE;
  url = url.replace(/\/+$/, '');
  if (!/\/chat\/completions$/.test(url)) url += '/chat/completions';
  return url;
}

export function getProvider(env: Env = process.env): LlmProvider {
  if (env.LINER_API_KEY && env.LINER_API_KEY.trim()) return 'liner';
  if (env.GEMINI_API_KEY && env.GEMINI_API_KEY.trim()) return 'gemini';
  return 'fallback';
}

export function getStatus(env: Env = process.env): ServerStatus {
  const provider = getProvider(env);
  return { configured: provider !== 'fallback', provider };
}

/** 재시도 대상: 타임아웃(AbortError), 429, 5xx. 401/403은 재시도하지 않는다. */
export function isRetryable(status: number | null, aborted = false): boolean {
  if (aborted) return true;
  if (status === null) return false;
  return status === 429 || status >= 500;
}

export function errorCodeForStatus(status: number): string {
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate_limit';
  if (status >= 500) return 'server';
  return 'http_' + status;
}

// 하루 live 호출 수 (서버리스에서는 인스턴스 단위의 best-effort 보호)
const dailyCounter = { day: '', count: 0 };

export function checkAndCountDaily(limit: number, now = new Date()): boolean {
  const day = now.toISOString().slice(0, 10);
  if (dailyCounter.day !== day) {
    dailyCounter.day = day;
    dailyCounter.count = 0;
  }
  if (limit > 0 && dailyCounter.count >= limit) return false;
  dailyCounter.count += 1;
  return true;
}

export function __resetDailyCounterForTest(): void {
  dailyCounter.day = '';
  dailyCounter.count = 0;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function callLinerOnce(
  key: string,
  env: Env,
  systemPrompt: string,
  userPrompt: string,
  fetchImpl: FetchLike,
  strategy?: RoutingStrategy
): Promise<{ ok: true; text: string; model?: string; usage?: UsageInfo } | { ok: false; status: number | null; aborted: boolean }> {
  const timeoutSec = Number(env.LINER_TIMEOUT_SEC) > 0 ? Number(env.LINER_TIMEOUT_SEC) : 20;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutSec * 1000);
  try {
    const res = await fetchImpl(normalizeLinerUrl(env.LINER_BASE_URL), {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key.trim()}`,
      },
      body: JSON.stringify({
        model: (env.LINER_MODEL && env.LINER_MODEL.trim()) || DEFAULT_LINER_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.2,
        ...(strategy ? { routing_strategy: strategy } : {}),
      }),
    });
    if (!res.ok) return { ok: false, status: res.status, aborted: false };
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || !text.trim()) return { ok: false, status: 502, aborted: false };
    const u = data?.usage;
    const usage: UsageInfo | undefined = u
      ? {
          prompt_tokens: typeof u.prompt_tokens === 'number' ? u.prompt_tokens : null,
          completion_tokens: typeof u.completion_tokens === 'number' ? u.completion_tokens : null,
          total_tokens: typeof u.total_tokens === 'number' ? u.total_tokens : null,
        }
      : undefined;
    return { ok: true, text, model: typeof data?.model === 'string' ? data.model : undefined, usage };
  } catch (err: any) {
    return { ok: false, status: null, aborted: err?.name === 'AbortError' };
  } finally {
    clearTimeout(timer);
  }
}

async function generateWithLiner(
  key: string,
  env: Env,
  systemPrompt: string,
  userPrompt: string,
  fetchImpl: FetchLike,
  retryDelayMs: number,
  strategy?: RoutingStrategy
): Promise<GenerateResult> {
  let last: { status: number | null; aborted: boolean } = { status: null, aborted: false };
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await callLinerOnce(key, env, systemPrompt, userPrompt, fetchImpl, strategy);
    if (r.ok) {
      return { status: 200, body: { text: r.text, provider: 'liner', model: r.model, usage: r.usage, strategy } };
    }
    last = { status: r.status, aborted: r.aborted };
    if (!isRetryable(r.status, r.aborted)) break;
    if (attempt === 0) await sleep(retryDelayMs);
  }
  if (last.aborted) return { status: 504, body: { error: 'Liner API timeout', code: 'timeout' } };
  if (last.status === null) return { status: 502, body: { error: 'Liner API network error', code: 'server' } };
  // 상태 코드만 노출하고 키·응답 본문은 노출하지 않는다.
  return {
    status: 502,
    body: { error: `Liner API HTTP error: ${last.status}`, code: errorCodeForStatus(last.status) },
  };
}

async function generateWithGemini(key: string, systemPrompt: string, userPrompt: string): Promise<GenerateResult> {
  try {
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: key });
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: userPrompt,
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: 'application/json',
        temperature: 0.2,
      },
    });
    return { status: 200, body: { text: response.text || '', provider: 'gemini', model: 'gemini-3.8-flash' } };
  } catch (err: any) {
    return { status: 502, body: { error: 'Gemini call failed', code: 'server' } };
  }
}

export async function generate(
  systemPrompt: string,
  userPrompt: string,
  env: Env = process.env,
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
  retryDelayMs = 1500,
  strategy?: unknown
): Promise<GenerateResult> {
  if (typeof systemPrompt !== 'string' || typeof userPrompt !== 'string' || !userPrompt) {
    return { status: 400, body: { error: 'systemPrompt/userPrompt required', code: 'bad_request' } };
  }
  const provider = getProvider(env);
  if (provider === 'fallback') {
    return { status: 503, body: { error: 'No LLM API key configured on server', code: 'no_key' } };
  }
  const limit = Number(env.LINER_DAILY_LIMIT) > 0 ? Number(env.LINER_DAILY_LIMIT) : 200;
  if (!checkAndCountDaily(limit)) {
    return { status: 429, body: { error: 'Daily live-call limit reached', code: 'limit' } };
  }
  if (provider === 'liner') {
    return generateWithLiner(env.LINER_API_KEY as string, env, systemPrompt, userPrompt, fetchImpl, retryDelayMs, parseStrategy(strategy));
  }
  return generateWithGemini(env.GEMINI_API_KEY as string, systemPrompt, userPrompt);
}
