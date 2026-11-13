import React, { useMemo, useState } from 'react';
import { clearApiLogs, getApiLogs } from '../storage';
import { ERROR_LABEL, STRATEGY_LABEL, TASK_LABEL, summarizeApiLogs } from '../apiStats';

const fmt = (n: number | null, unit = '') => (n === null ? '-' : `${n.toLocaleString('ko-KR')}${unit}`);

function joinCounts(rec: Record<string, number>, label?: Record<string, string>): string {
  const entries = Object.entries(rec);
  if (entries.length === 0) return '-';
  return entries.map(([k, v]) => `${label?.[k] || k} ${v}`).join(', ');
}

/** 설정 화면용: 이 브라우저에서 시도한 Liner API 호출 기록을 요약해 보여 준다. */
export function ApiUsagePanel() {
  const [tick, setTick] = useState(0);
  const logs = useMemo(() => {
    void tick;
    return getApiLogs();
  }, [tick]);
  const stats = useMemo(() => summarizeApiLogs(logs), [logs]);
  const recent = logs.slice(0, 6);

  return (
    <div className="lg:col-span-12 bento-card bento-enter space-y-4" style={{ animationDelay: '90ms' }} data-testid="api-usage-panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[16px] leading-[24px] font-semibold" style={{ color: 'var(--ztd-ink)' }}>
            Liner API 호출 현황
          </h2>
          <p className="text-[14px]" style={{ color: 'var(--ztd-muted)' }}>
            이 브라우저에서 시도한 호출 기록이에요. 저장본(캐시) 사용은 호출로 세지 않아요.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            clearApiLogs();
            setTick(t => t + 1);
          }}
          disabled={logs.length === 0}
          className="h-[34px] px-3.5 rounded-full text-[13px] font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ backgroundColor: 'var(--ztd-panel)', border: '1px solid var(--ztd-line)', color: 'var(--ztd-ink)' }}
        >
          호출 기록 지우기
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: '총 호출', value: fmt(stats.total, '회'), sub: `성공 ${stats.ok} · 실패 ${stats.failed}` },
          { label: '성공률', value: stats.successRate === null ? '-' : `${stats.successRate}%`, sub: '검증 위반 재요청 포함' },
          { label: '평균 응답 시간', value: stats.avgLatencyMs === null ? '-' : `${(stats.avgLatencyMs / 1000).toFixed(1)}초`, sub: '성공한 호출 기준' },
          { label: '사용 토큰', value: fmt(stats.totalTokens), sub: '응답에 표시된 값의 합' },
        ].map(card => (
          <div key={card.label} className="bento-sub p-4">
            <div className="text-[13px]" style={{ color: 'var(--ztd-muted)' }}>{card.label}</div>
            <div className="text-[24px] leading-[32px] font-bold" style={{ color: 'var(--ztd-ink)' }}>{card.value}</div>
            <div className="text-[12px]" style={{ color: 'var(--ztd-muted)' }}>{card.sub}</div>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-[13px]">
          <thead>
            <tr style={{ color: 'var(--ztd-muted)' }}>
              <th className="py-2 pr-3 font-medium">작업</th>
              <th className="py-2 pr-3 font-medium">Router 전략</th>
              <th className="py-2 pr-3 font-medium">실제 응답 모델</th>
              <th className="py-2 pr-3 font-medium">호출</th>
              <th className="py-2 pr-3 font-medium">평균 시간</th>
              <th className="py-2 font-medium">토큰</th>
            </tr>
          </thead>
          <tbody>
            {stats.byTask.map(t => (
              <tr key={t.task} style={{ borderTop: '1px solid var(--ztd-line)', color: 'var(--ztd-ink)' }}>
                <td className="py-2 pr-3 font-semibold">{TASK_LABEL[t.task]}</td>
                <td className="py-2 pr-3">{joinCounts(t.strategies, STRATEGY_LABEL)}</td>
                <td className="py-2 pr-3 font-mono">{joinCounts(t.models)}</td>
                <td className="py-2 pr-3">{t.ok}/{t.calls}</td>
                <td className="py-2 pr-3">{t.avgLatencyMs === null ? '-' : `${(t.avgLatencyMs / 1000).toFixed(1)}초`}</td>
                <td className="py-2">{fmt(t.tokens || null)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {Object.keys(stats.errors).length > 0 && (
        <p className="text-[13px]" style={{ color: 'var(--ztd-muted)' }}>
          실패 사유: {joinCounts(stats.errors, ERROR_LABEL)}
        </p>
      )}

      {recent.length === 0 ? (
        <p className="text-[14px]" style={{ color: 'var(--ztd-muted)' }}>
          아직 호출 기록이 없어요. 개요 화면의 "새로 생성"이나 문안 화면의 "다시 생성"을 누르면 실제 Liner API를 호출해요.
        </p>
      ) : (
        <div className="space-y-1">
          <div className="text-[13px] font-semibold" style={{ color: 'var(--ztd-ink)' }}>최근 호출</div>
          {recent.map(l => (
            <div key={l.id} className="flex flex-wrap items-center gap-x-3 text-[13px]" style={{ color: 'var(--ztd-muted)' }}>
              <span className="font-mono">{l.created_at.slice(11)}</span>
              <span style={{ color: 'var(--ztd-ink)' }}>{TASK_LABEL[l.task]}</span>
              <span>{l.ok ? '성공' : `실패(${ERROR_LABEL[l.error_code || ''] || l.error_code || '알 수 없음'})`}</span>
              <span className="font-mono">{l.model || '-'}</span>
              <span>{l.latency_ms === null ? '-' : `${(l.latency_ms / 1000).toFixed(1)}초`}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
