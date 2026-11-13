import React, { useState } from 'react';
import { FollowupContent, LlmResult } from '../types';
import { FOLLOWUP_MEMO_MAX, FOLLOWUP_PRESET_MEMO, generateFollowup } from '../llm';
import { ERROR_LABEL } from '../apiStats';
import { StatusBadge } from './StatusBadge';

const OUTCOME_LABEL: Record<FollowupContent['outcome'], string> = {
  planned: '연락 예정',
  contacted: '연락 완료',
  waiting_reply: '회신 대기',
  quote_requested: '견적 요청',
  reorder_confirmed: '재주문 확인',
  on_hold: '거래 보류',
  not_needed: '연락 불필요',
};

const CHANNEL_LABEL: Record<string, string> = { email: '이메일', phone: '전화', other: '기타' };

interface FollowupSuggestProps {
  memo: string;
  contactDate: string;
  customerName: string;
  contactName: string;
  demoMode: boolean;
  onUsePresetMemo: (memo: string) => void;
  onApply: (c: FollowupContent) => void;
}

/** 접촉 메모에서 결과, 채널, 다음 연락일을 "제안"한다. 저장은 사람이 확인한 뒤 기존 저장 버튼으로 한다. */
export function FollowupSuggest({ memo, contactDate, customerName, contactName, demoMode, onUsePresetMemo, onApply }: FollowupSuggestProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LlmResult<FollowupContent> | null>(null);
  const [forMemo, setForMemo] = useState('');
  const [applied, setApplied] = useState(false);

  const trimmed = memo.trim();

  async function suggest(forceLive = false) {
    if (!trimmed || loading) return;
    setLoading(true);
    setApplied(false);
    try {
      const r = await generateFollowup(
        { memo: trimmed, contactDate, names: [customerName, contactName] },
        { demoMode, forceLive }
      );
      setResult(r);
      setForMemo(memo);
    } finally {
      setLoading(false);
    }
  }

  const visible = result && forMemo === memo;
  const failed = visible && result.source === 'fallback';
  const c = visible && !failed ? result.content : null;

  return (
    <div className="space-y-2.5" data-testid="followup-suggest">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => suggest(false)}
          disabled={loading || !trimmed}
          className="h-[34px] px-3.5 rounded-full text-[13px] font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ backgroundColor: 'var(--ztd-panel)', border: '1px solid var(--ztd-line)', color: 'var(--ztd-ink)' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }} aria-hidden="true">auto_awesome</span>
          {loading ? '메모 읽는 중...' : '메모로 후속 조치 제안'}
        </button>
        <button
          type="button"
          onClick={() => onUsePresetMemo(FOLLOWUP_PRESET_MEMO)}
          className="text-[12px] underline cursor-pointer"
          style={{ color: 'var(--ztd-muted)' }}
        >
          예시 메모 넣기
        </button>
        <span className="text-[12px]" style={{ color: 'var(--ztd-muted)' }}>
          거래처명·담당자명은 가려서 보내요. 메모는 {FOLLOWUP_MEMO_MAX}자까지 전달돼요.
        </span>
      </div>

      {visible && failed && (
        <p className="text-[13px]" style={{ color: 'var(--ztd-muted)' }}>
          메모에서 후속 조치를 뽑지 못했어요{result.error_code ? ` (${ERROR_LABEL[result.error_code] || result.error_code})` : ''}. 아래 항목을 직접 입력해 주세요.
        </p>
      )}

      {c && result && (
        <div className="bento-sub p-4 space-y-2" data-testid="followup-card">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status="in_progress" label="AI 제안" />
            <span className="text-[13px]" style={{ color: 'var(--ztd-muted)' }}>
              {result.source === 'live'
                ? `실시간 AI 응답 (${result.latency_ms ?? 0}ms${result.model ? ` · ${result.model}` : ''})`
                : 'Liner Model API 응답(저장본)'}
            </span>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[14px]" style={{ color: 'var(--ztd-ink)' }}>
            <dt style={{ color: 'var(--ztd-muted)' }}>접촉 결과</dt>
            <dd className="font-semibold">{OUTCOME_LABEL[c.outcome]}</dd>
            <dt style={{ color: 'var(--ztd-muted)' }}>접촉 채널</dt>
            <dd className="font-semibold">{c.channel ? CHANNEL_LABEL[c.channel] : '메모에서 알 수 없음 (현재 선택 유지)'}</dd>
            <dt style={{ color: 'var(--ztd-muted)' }}>다음 연락일</dt>
            <dd className="font-semibold tabular-nums">{c.next_contact_date ?? '메모에 시점 없음 (지정 안 함)'}</dd>
            <dt style={{ color: 'var(--ztd-muted)' }}>해석 근거</dt>
            <dd>{c.reason}</dd>
          </dl>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                onApply(c);
                setApplied(true);
              }}
              disabled={applied}
              className="h-[34px] px-4 rounded-full text-[13px] font-semibold cursor-pointer disabled:opacity-60"
              style={{ backgroundColor: 'var(--ztd-ink)', color: 'var(--ztd-on-ink)' }}
            >
              {applied ? '폼에 채웠어요' : '제안을 폼에 채우기'}
            </button>
            {result.source === 'cache' && (
              <button
                type="button"
                onClick={() => suggest(true)}
                disabled={loading}
                className="text-[12px] underline cursor-pointer disabled:opacity-50"
                style={{ color: 'var(--ztd-muted)' }}
              >
                새로 생성
              </button>
            )}
            <span className="text-[12px]" style={{ color: 'var(--ztd-muted)' }}>
              날짜와 내용을 확인한 뒤 아래 "접촉 기록 저장"을 눌러야 저장돼요.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
