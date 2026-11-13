import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetDailyCounterForTest,
  errorCodeForStatus,
  generate,
  getProvider,
  getStatus,
  isRetryable,
  normalizeLinerUrl,
} from '../api/_llm';

const SECRET = 'sk-test-SECRET-1234567890abcdef';

function res(ok: boolean, status: number, json: any) {
  return { ok, status, json: async () => json };
}

beforeEach(() => {
  __resetDailyCounterForTest();
});

describe('normalizeLinerUrl', () => {
  it('base URL(.../api/v1)에 /chat/completions를 붙인다', () => {
    expect(normalizeLinerUrl('https://platform.liner.com/api/v1')).toBe('https://platform.liner.com/api/v1/chat/completions');
    expect(normalizeLinerUrl('https://platform.liner.com/api/v1/')).toBe('https://platform.liner.com/api/v1/chat/completions');
  });
  it('이미 전체 주소이면 그대로 둔다', () => {
    expect(normalizeLinerUrl('https://platform.liner.com/api/v1/chat/completions')).toBe('https://platform.liner.com/api/v1/chat/completions');
  });
  it('비어 있으면 공식 기본값을 쓴다', () => {
    expect(normalizeLinerUrl('')).toBe('https://platform.liner.com/api/v1/chat/completions');
    expect(normalizeLinerUrl(undefined)).toBe('https://platform.liner.com/api/v1/chat/completions');
  });
});

describe('공급자 선택과 상태', () => {
  it('Liner 키가 있으면 Gemini 키가 있어도 Liner가 우선이다', () => {
    expect(getProvider({ LINER_API_KEY: 'a', GEMINI_API_KEY: 'b' })).toBe('liner');
  });
  it('Liner 키가 없을 때만 Gemini를 쓴다', () => {
    expect(getProvider({ GEMINI_API_KEY: 'b' })).toBe('gemini');
  });
  it('키가 없으면 fallback', () => {
    expect(getProvider({})).toBe('fallback');
    expect(getProvider({ LINER_API_KEY: '   ' })).toBe('fallback');
    expect(getStatus({})).toEqual({ configured: false, provider: 'fallback' });
    expect(getStatus({ LINER_API_KEY: 'a' })).toEqual({ configured: true, provider: 'liner' });
  });
});

describe('재시도 정책', () => {
  it('타임아웃·429·5xx는 재시도하고 401/403/400은 하지 않는다', () => {
    expect(isRetryable(null, true)).toBe(true);
    expect(isRetryable(429)).toBe(true);
    expect(isRetryable(500)).toBe(true);
    expect(isRetryable(503)).toBe(true);
    expect(isRetryable(401)).toBe(false);
    expect(isRetryable(403)).toBe(false);
    expect(isRetryable(400)).toBe(false);
  });
  it('상태 코드를 오류 코드로 바꾼다', () => {
    expect(errorCodeForStatus(401)).toBe('auth');
    expect(errorCodeForStatus(429)).toBe('rate_limit');
    expect(errorCodeForStatus(502)).toBe('server');
  });
});

describe('generate: Liner 호출', () => {
  const env = { LINER_API_KEY: SECRET, LINER_BASE_URL: 'https://platform.liner.com/api/v1', LINER_MODEL: 'liner-gpt-router' };

  it('키가 없으면 503 no_key', async () => {
    const r = await generate('sys', 'user', {}, vi.fn() as any, 0);
    expect(r.status).toBe(503);
    expect(r.body.code).toBe('no_key');
  });

  it('요청 본문이 없으면 400', async () => {
    const r = await generate('sys', '', env, vi.fn() as any, 0);
    expect(r.status).toBe(400);
  });

  it('올바른 주소·헤더·본문으로 호출하고 응답 텍스트를 돌려준다', async () => {
    const f = vi.fn().mockResolvedValue(res(true, 200, { choices: [{ message: { content: '{"ok":1}' } }] }));
    const r = await generate('sys', 'user', env, f as any, 0);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ text: '{"ok":1}', provider: 'liner' });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('https://platform.liner.com/api/v1/chat/completions');
    expect(init.headers.Authorization).toBe(`Bearer ${SECRET}`);
    const body = JSON.parse(init.body);
    expect(body.model).toBe('liner-gpt-router');
    expect(body.messages[0]).toEqual({ role: 'system', content: 'sys' });
    expect(body.messages[1]).toEqual({ role: 'user', content: 'user' });
  });

  it('429 다음 200이면 1회 재시도로 성공한다', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(res(false, 429, {}))
      .mockResolvedValueOnce(res(true, 200, { choices: [{ message: { content: 'ok' } }] }));
    const r = await generate('s', 'u', env, f as any, 0);
    expect(f).toHaveBeenCalledTimes(2);
    expect(r.status).toBe(200);
  });

  it('401은 재시도하지 않고 auth 오류이며 키가 응답에 노출되지 않는다', async () => {
    const f = vi.fn().mockResolvedValue(res(false, 401, { error: `bad key ${SECRET}` }));
    const r = await generate('s', 'u', env, f as any, 0);
    expect(f).toHaveBeenCalledTimes(1);
    expect(r.status).toBe(502);
    expect(r.body.code).toBe('auth');
    expect(JSON.stringify(r)).not.toContain(SECRET);
  });

  it('5xx가 두 번 이어지면 server 오류', async () => {
    const f = vi.fn().mockResolvedValue(res(false, 500, {}));
    const r = await generate('s', 'u', env, f as any, 0);
    expect(f).toHaveBeenCalledTimes(2);
    expect(r.body.code).toBe('server');
  });

  it('타임아웃(AbortError)은 504 timeout', async () => {
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    const f = vi.fn().mockRejectedValue(abort);
    const r = await generate('s', 'u', env, f as any, 0);
    expect(r.status).toBe(504);
    expect(r.body.code).toBe('timeout');
  });

  it('응답에 choices가 없으면 오류로 처리한다', async () => {
    const f = vi.fn().mockResolvedValue(res(true, 200, { choices: [] }));
    const r = await generate('s', 'u', env, f as any, 0);
    expect(r.status).toBe(502);
  });

  it('하루 호출 한도를 넘으면 429 limit', async () => {
    const f = vi.fn().mockResolvedValue(res(true, 200, { choices: [{ message: { content: 'ok' } }] }));
    const e = { ...env, LINER_DAILY_LIMIT: '2' };
    expect((await generate('s', 'u', e, f as any, 0)).status).toBe(200);
    expect((await generate('s', 'u', e, f as any, 0)).status).toBe(200);
    const third = await generate('s', 'u', e, f as any, 0);
    expect(third.status).toBe(429);
    expect(third.body.code).toBe('limit');
    expect(f).toHaveBeenCalledTimes(2);
  });
});
