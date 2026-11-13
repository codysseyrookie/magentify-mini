import type { ApiLogRecord } from './types';

export interface TaskStat {
  task: ApiLogRecord['task'];
  calls: number;
  ok: number;
  avgLatencyMs: number | null;
  tokens: number;
  /** 해당 작업에서 실제 응답한 모델별 횟수 */
  models: Record<string, number>;
  /** 해당 작업에서 요청한 Router 전략별 횟수 */
  strategies: Record<string, number>;
}

export interface ApiStats {
  total: number;
  ok: number;
  failed: number;
  /** 0~100, 호출이 없으면 null */
  successRate: number | null;
  avgLatencyMs: number | null;
  totalTokens: number;
  byTask: TaskStat[];
  errors: Record<string, number>;
}

const TASKS: TaskStat['task'][] = ['briefing', 'email', 'call', 'news'];

function avg(values: number[]): number | null {
  return values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null;
}

const nums = (rows: ApiLogRecord[]) =>
  rows.map(r => r.latency_ms).filter((v): v is number => typeof v === 'number');

/**
 * 호출 로그에서 현황 지표를 계산한다.
 * 평균 지연은 성공한 호출만 센다. 토큰은 응답에 있는 값만 합친다(비용은 계산하지 않는다).
 */
export function summarizeApiLogs(logs: ApiLogRecord[]): ApiStats {
  const okLogs = logs.filter(l => l.ok);
  const errors: Record<string, number> = {};
  for (const l of logs) {
    if (!l.ok) {
      const code = l.error_code || 'unknown';
      errors[code] = (errors[code] || 0) + 1;
    }
  }

  const byTask: TaskStat[] = TASKS.map(task => {
    const rows = logs.filter(l => l.task === task);
    const okRows = rows.filter(l => l.ok);
    const models: Record<string, number> = {};
    const strategies: Record<string, number> = {};
    for (const r of okRows) {
      if (r.model) models[r.model] = (models[r.model] || 0) + 1;
      if (r.strategy) strategies[r.strategy] = (strategies[r.strategy] || 0) + 1;
    }
    return {
      task,
      calls: rows.length,
      ok: okRows.length,
      avgLatencyMs: avg(nums(okRows)),
      tokens: okRows.reduce((s, r) => s + (r.total_tokens || 0), 0),
      models,
      strategies,
    };
  });

  return {
    total: logs.length,
    ok: okLogs.length,
    failed: logs.length - okLogs.length,
    successRate: logs.length ? Math.round((okLogs.length / logs.length) * 100) : null,
    avgLatencyMs: avg(nums(okLogs)),
    totalTokens: okLogs.reduce((s, r) => s + (r.total_tokens || 0), 0),
    byTask,
    errors,
  };
}

export const TASK_LABEL: Record<TaskStat['task'], string> = {
  briefing: '주간 브리핑',
  email: '이메일 초안',
  call: '통화 가이드',
  news: '업종 동향 검색',
};

export const STRATEGY_LABEL: Record<string, string> = {
  cost: '비용 우선',
  balanced: '균형',
  quality: '품질 우선',
};

export const ERROR_LABEL: Record<string, string> = {
  no_key: '키 없음',
  limit: '하루 한도 초과',
  timeout: '시간 초과',
  auth: '인증 오류',
  rate_limit: '호출 한도',
  server: '서버 오류',
  network: '연결 실패',
  invalid_json: 'JSON 형식 오류',
  rule_violation: '검증 위반(재요청)',
  empty: '검색 결과 없음',
};
