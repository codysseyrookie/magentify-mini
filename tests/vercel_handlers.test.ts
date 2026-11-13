import { describe, expect, it, vi } from 'vitest';
import generateHandler from '../api/llm/generate';
import statusHandler from '../api/llm/status';

function mockRes() {
  const res: any = { statusCode: 0, body: undefined };
  res.status = (c: number) => {
    res.statusCode = c;
    return res;
  };
  res.json = (b: any) => {
    res.body = b;
    return res;
  };
  return res;
}

describe('Vercel 서버리스 함수', () => {
  it('GET /api/llm/status 는 공급자 상태를 JSON으로 돌려준다', () => {
    const res = mockRes();
    statusHandler({}, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('configured');
    expect(res.body).toHaveProperty('provider');
  });

  it('POST가 아닌 요청은 405', async () => {
    const res = mockRes();
    await generateHandler({ method: 'GET' }, res);
    expect(res.statusCode).toBe(405);
  });

  it('키가 없으면 503 no_key (키 값은 응답에 없다)', async () => {
    const saved = { l: process.env.LINER_API_KEY, g: process.env.GEMINI_API_KEY };
    delete process.env.LINER_API_KEY;
    delete process.env.GEMINI_API_KEY;
    try {
      const res = mockRes();
      await generateHandler({ method: 'POST', body: { systemPrompt: 's', userPrompt: 'u' } }, res);
      expect(res.statusCode).toBe(503);
      expect(res.body.code).toBe('no_key');
    } finally {
      if (saved.l) process.env.LINER_API_KEY = saved.l;
      if (saved.g) process.env.GEMINI_API_KEY = saved.g;
    }
  });

  it('본문이 문자열(JSON)로 와도 파싱한다', async () => {
    const saved = process.env.LINER_API_KEY;
    delete process.env.LINER_API_KEY;
    delete process.env.GEMINI_API_KEY;
    try {
      const res = mockRes();
      await generateHandler({ method: 'POST', body: JSON.stringify({ systemPrompt: 's', userPrompt: 'u' }) }, res);
      expect(res.statusCode).toBe(503); // 파싱에 성공해 키 검사 단계까지 도달
    } finally {
      if (saved) process.env.LINER_API_KEY = saved;
    }
  });

  it('본문이 비어 있으면 400', async () => {
    const res = mockRes();
    await generateHandler({ method: 'POST', body: {} }, res);
    expect(res.statusCode).toBe(400);
    vi.restoreAllMocks();
  });
});
