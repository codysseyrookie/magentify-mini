import { describe, expect, it } from 'vitest';
import { summarizeApiLogs } from '../src/apiStats';
import type { ApiLogRecord } from '../src/types';

let seq = 0;
function log(p: Partial<ApiLogRecord>): ApiLogRecord {
  return {
    id: ++seq,
    task: 'briefing',
    provider: 'liner',
    ok: true,
    error_code: null,
    latency_ms: 1000,
    created_at: '2026-11-13 10:00:00',
    ...p,
  };
}

describe('summarizeApiLogs', () => {
  it('기록이 없으면 성공률과 평균이 null이다', () => {
    const s = summarizeApiLogs([]);
    expect(s.total).toBe(0);
    expect(s.successRate).toBeNull();
    expect(s.avgLatencyMs).toBeNull();
    expect(s.totalTokens).toBe(0);
    expect(s.byTask.map(t => t.task)).toEqual(['briefing', 'email', 'call', 'news']);
    expect(s.byTask.map(t => t.calls)).toEqual([0, 0, 0, 0]);
  });

  it('성공률, 평균 시간(성공만), 토큰 합계를 계산한다', () => {
    const logs = [
      log({ task: 'briefing', latency_ms: 2000, model: 'gpt-6-luna', strategy: 'cost', total_tokens: 100 }),
      log({ task: 'email', latency_ms: 4000, model: 'gpt-6.1-sol', strategy: 'quality', total_tokens: 300 }),
      log({ task: 'email', ok: false, error_code: 'timeout', latency_ms: 20000, provider: null }),
      log({ task: 'call', latency_ms: 6000, model: 'gpt-6.1-sol', strategy: 'quality', total_tokens: 200 }),
    ];
    const s = summarizeApiLogs(logs);
    expect(s.total).toBe(4);
    expect(s.ok).toBe(3);
    expect(s.failed).toBe(1);
    expect(s.successRate).toBe(75);
    expect(s.avgLatencyMs).toBe(4000); // 실패(20초)는 평균에서 제외
    expect(s.totalTokens).toBe(600);
    expect(s.errors).toEqual({ timeout: 1 });
  });

  it('작업별로 모델과 전략 횟수를 센다', () => {
    const logs = [
      log({ task: 'email', model: 'gpt-6.1-sol', strategy: 'quality' }),
      log({ task: 'email', model: 'gpt-6.1-sol', strategy: 'quality' }),
      log({ task: 'email', model: 'gpt-6.1-terra', strategy: 'balanced' }),
      log({ task: 'briefing', model: 'gpt-6-luna', strategy: 'cost' }),
    ];
    const s = summarizeApiLogs(logs);
    const email = s.byTask.find(t => t.task === 'email')!;
    expect(email.models).toEqual({ 'gpt-6.1-sol': 2, 'gpt-6.1-terra': 1 });
    expect(email.strategies).toEqual({ quality: 2, balanced: 1 });
    expect(s.byTask.find(t => t.task === 'briefing')!.models).toEqual({ 'gpt-6-luna': 1 });
  });

  it('오류 코드가 없는 실패는 unknown으로 센다', () => {
    const s = summarizeApiLogs([log({ ok: false, error_code: null })]);
    expect(s.errors).toEqual({ unknown: 1 });
  });
});
