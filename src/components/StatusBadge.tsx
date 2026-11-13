import React from 'react';
import { AssessmentStatus } from '../types';

interface StatusBadgeProps {
  status: AssessmentStatus | 'in_progress' | 'contacted' | 'followup_due' | 'followup_planned';
  label?: string;
}

const STATUS_CONFIG: Record<string, { className: string; defaultLabel: string }> = {
  high_risk: { className: 'status-badge status-badge--risk', defaultLabel: '고위험 후보' },
  risk: { className: 'status-badge status-badge--risk', defaultLabel: '연락 필요' },
  attention: { className: 'status-badge status-badge--attention', defaultLabel: '관심 필요' },
  in_progress: { className: 'status-badge status-badge--progress', defaultLabel: '문안 작성 중' },
  normal: { className: 'status-badge status-badge--ok', defaultLabel: '정상 관리' },
  contacted: { className: 'status-badge status-badge--ok', defaultLabel: '연락 완료' },
  hold: { className: 'status-badge status-badge--hold', defaultLabel: '보류/제외' },
  followup_due: { className: 'status-badge status-badge--risk', defaultLabel: '후속 조치 필요' },
  followup_planned: { className: 'status-badge status-badge--progress', defaultLabel: '예정' },
};

export function StatusBadge({ status, label }: StatusBadgeProps) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.hold;
  return (
    <span className={cfg.className}>
      <span className="status-badge-dot" aria-hidden="true" />
      <span>{label || cfg.defaultLabel}</span>
    </span>
  );
}

export function VipBadge() {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[12px] font-semibold tabular-nums"
      style={{
        backgroundColor: 'var(--status-attention-bg)',
        color: 'var(--status-attention-text)',
      }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: '13px' }} aria-hidden="true">
        star
      </span>
      VIP
    </span>
  );
}
