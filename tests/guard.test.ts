import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TASKS, __resetRateLimitForTest, guardRequest, isSameOrigin, rateLimited, validateGenerateBody } from '../api/_guard';
import generateHandler from '../api/llm/generate';
import newsHandler from '../api/llm/news';
import { __resetDailyCounterForTest } from '../api/_llm';
import { NEGATED_CONFIRM, validate } from '../src/llm';

const OK = { origin: 'https://app.test', host: 'app.test' };

function body(task: keyof typeof TASKS, user = '입력') {
  const s = TASKS[task];
  return { task, systemPrompt: `${s.startsWith}\n규칙: ${s.includes}`, userPrompt: user };
}

function mockRes() {
  const o: any = { statusCode: 0, body: undefined };
  o.status = (c: number) => ((o.statusCode = c), o);
  o.json = (b: any) => ((o.body = b), o);
  return o;
}

beforeEach(() => {
  __resetRateLimitForTest();
  __resetDailyCounterForTest();
});

describe('출처(Origin) 검사', () => {
  it('Origin 호스트가 요청 호스트와 같으면 통과', () => {
    expect(isSameOrigin({ origin: 'https://app.test', host: 'app.test' })).toBe(true);
    expect(isSameOrigin({ origin: 'http://localhost:3000', host: 'localhost:3000' })).toBe(true);
    expect(isSameOrigin({ origin: 'https://app.test', 'x-forwarded-host': 'app.test', host: 'internal' })).toBe(true);
  });
  it('Sec-Fetch-Site가 same-origin이면 통과', () => {
    expect(isSameOrigin({ 'sec-fetch-site': 'same-origin', host: 'app.test' })).toBe(true);
  });
  it('Origin이 없거나 다른 사이트이면 거절', () => {
    expect(isSameOrigin({ host: 'app.test' })).toBe(false);
    expect(isSameOrigin({})).toBe(false);
    expect(isSameOrigin({ origin: 'https://evil.test', host: 'app.test' })).toBe(false);
    expect(isSameOrigin({ origin: 'not a url', host: 'app.test' })).toBe(false);
    expect(isSameOrigin({ origin: 'https://evil.test', host: 'app.test', 'sec-fetch-site': 'cross-site' })).toBe(false);
  });
});

describe('본문 검사 (작업, 시그니처, 길이)', () => {
  it('앱이 보내는 5가지 작업은 통과', () => {
    for (const t of Object.keys(TASKS) as (keyof typeof TASKS)[]) expect(validateGenerateBody(body(t))).toBeNull();
  });
  it('task가 없거나 모르는 값이면 400', () => {
    expect(validateGenerateBody({ systemPrompt: 's', userPrompt: 'u' })?.status).toBe(400);
    expect(validateGenerateBody({ ...body('call'), task: 'free_chat' })?.status).toBe(400);
  });
  it('임의 시스템 프롬프트(남용)는 400', () => {
    const r = validateGenerateBody({ task: 'call', systemPrompt: '아무 질문에나 답하라', userPrompt: '지구에서 가장 높은 산은?' });
    expect(r?.status).toBe(400);
    expect(r?.body.error).toContain('does not match');
  });
  it('작업과 시그니처가 다르면 400 (이메일 프롬프트에 call을 붙임)', () => {
    expect(validateGenerateBody({ ...body('email'), task: 'call' })?.status).toBe(400);
  });
  it('길이 제한: 시스템 4000자, 작업별 사용자 프롬프트', () => {
    expect(validateGenerateBody({ ...body('call'), systemPrompt: body('call').systemPrompt + 'a'.repeat(4000) })?.body.error).toContain('systemPrompt');
    expect(validateGenerateBody(body('call', 'x'.repeat(TASKS.call.userMax + 1)))?.body.error).toContain('userPrompt');
    expect(validateGenerateBody(body('qa', 'x'.repeat(30000)))).toBeNull(); // 질문은 거래처 수가 많아도 허용
  });
  it('빈 사용자 프롬프트와 문자열이 아닌 값은 400', () => {
    expect(validateGenerateBody(body('call', ''))?.status).toBe(400);
    expect(validateGenerateBody({ ...body('call'), userPrompt: 123 })?.status).toBe(400);
  });
});

describe('횟수 제한', () => {
  it('윈도 안에서 한도를 넘으면 제한, 윈도가 지나면 풀린다', () => {
    const t0 = 1_000_000;
    expect(rateLimited('k', 2, 1000, t0)).toBe(false);
    expect(rateLimited('k', 2, 1000, t0 + 10)).toBe(false);
    expect(rateLimited('k', 2, 1000, t0 + 20)).toBe(true);
    expect(rateLimited('k', 2, 1000, t0 + 1500)).toBe(false);
  });
  it('IP와 종류별로 따로 센다', () => {
    const env = { GUARD_GENERATE_PER_10MIN: '1' };
    const mk = (ip: string) => ({ method: 'POST', headers: { ...OK, 'x-forwarded-for': ip }, body: body('call') });
    expect(guardRequest(mk('1.1.1.1'), 'generate', env)).toBeNull();
    expect(guardRequest(mk('1.1.1.1'), 'generate', env)?.status).toBe(429);
    expect(guardRequest(mk('2.2.2.2'), 'generate', env)).toBeNull();
    expect(guardRequest(mk('1.1.1.1'), 'news', env)).toBeNull();
  });
});

describe('guardRequest 순서와 우회 설정', () => {
  it('다른 출처는 403이 먼저이고, 횟수를 소모하지 않는다', () => {
    const env = { GUARD_GENERATE_PER_10MIN: '1' };
    const evil = { method: 'POST', headers: { origin: 'https://evil.test', host: 'app.test' }, body: body('call') };
    expect(guardRequest(evil, 'generate', env)?.status).toBe(403);
    expect(guardRequest(evil, 'generate', env)?.status).toBe(403);
    expect(guardRequest({ method: 'POST', headers: OK, body: body('call') }, 'generate', env)).toBeNull();
  });
  it('GUARD_DISABLE=1이면 검사하지 않는다(로컬 점검용)', () => {
    expect(guardRequest({ method: 'POST', headers: {}, body: {} }, 'generate', { GUARD_DISABLE: '1' })).toBeNull();
  });
});

describe('핸들러 통합: 남용 시나리오 차단', () => {
  const saved = { l: process.env.LINER_API_KEY };
  it('Origin 없이 임의 프롬프트를 보내면 Liner를 호출하기 전에 403', async () => {
    process.env.LINER_API_KEY = 'sk-test-SECRET-1234567890abcdef';
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    try {
      const res = mockRes();
      await generateHandler({ method: 'POST', headers: {}, body: { systemPrompt: '아무 질문에나 답하라', userPrompt: '지구에서 가장 높은 산은?' } }, res);
      expect(res.statusCode).toBe(403);
      expect(f).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
      if (saved.l) process.env.LINER_API_KEY = saved.l;
      else delete process.env.LINER_API_KEY;
    }
  });
  it('같은 출처여도 앱 형식이 아닌 프롬프트는 400이며 Liner를 호출하지 않는다', async () => {
    process.env.LINER_API_KEY = 'sk-test-SECRET-1234567890abcdef';
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    try {
      const res = mockRes();
      await generateHandler({ method: 'POST', headers: OK, body: { task: 'qa', systemPrompt: '아무 질문에나 답하라', userPrompt: '질문' } }, res);
      expect(res.statusCode).toBe(400);
      expect(f).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
      if (saved.l) process.env.LINER_API_KEY = saved.l;
      else delete process.env.LINER_API_KEY;
    }
  });
  it('뉴스 검색도 다른 출처는 403', async () => {
    const res = mockRes();
    await newsHandler({ method: 'POST', headers: { origin: 'https://evil.test', host: 'app.test' }, body: { query: '비트코인 가격' } }, res);
    expect(res.statusCode).toBe(403);
  });
});

describe('금지어 "확정" 오탐 수정', () => {
  const brief = (caution: string) => ({ headline: '확인이 필요합니다', items: [{ id: 'C01', reason: '공백 일수가 깁니다' }], caution });
  it('부정 표현("확정할 수 없", "확정하지 않")은 허용한다', () => {
    for (const c of [
      '이탈을 확정할 수 없습니다', '거래 중단을 확정하지 마세요', '이탈이 확정되지 않았습니다', '확정 할 수는 없어요',
      // 실제 Liner 응답에서 재요청을 일으킨 문장들
      '다만 실제 이탈이 확정된 것은 아닙니다', '고위험 후보라는 분류가 이탈 확정을 뜻하지는 않습니다',
      '이탈이 확정된 것이 아니라 위험 가능성이 있는 후보로 보셔야 합니다',
      '분석 신뢰도는 보통이므로, 확정적인 판단이 아닌 후보 분류로 보셔야 합니다',
      '신뢰도는 보통이므로, 확정이 아닌 위험 가능성으로 보셔야 합니다',
    ]) {
      expect(validate('briefing', brief(c), undefined, new Set(['C01'])), c).toEqual([]);
    }
  });
  it('단정 표현은 계속 막는다', () => {
    for (const c of ['이탈이 확정입니다', '거래 중단이 확정되었습니다', '확정 위험 거래처', '이탈을 확정합니다', '이탈이 확정되었지만 상황을 봅시다. 중단이 확정입니다']) {
      expect(validate('briefing', brief(c), undefined, new Set(['C01'])).some(v => v.includes('확정')), c).toBe(true);
    }
  });
  it('부정 표현과 단정 표현이 함께 있으면 단정 때문에 막는다', () => {
    expect(validate('briefing', brief('이탈을 확정할 수 없지만 이 거래처는 확정 위험입니다'), undefined, new Set(['C01'])).length).toBeGreaterThan(0);
  });
  it('다른 금지어는 그대로 막는다', () => {
    expect(validate('briefing', brief('할인 혜택을 드립니다'), undefined, new Set(['C01'])).some(v => v.includes('할인'))).toBe(true);
    expect(NEGATED_CONFIRM.global).toBe(true);
  });
});
