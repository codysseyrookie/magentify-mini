import React, { useState } from 'react';
import { Assessment, LlmResult, QaContent, SummaryCounts } from '../types';
import {
  QA_NOT_KNOWN,
  QA_PRESET_QUESTIONS,
  QA_QUESTION_MAX,
  generateAnswer,
  normalizeQuestion,
  replaceAliases,
} from '../llm';
import { ERROR_LABEL } from '../apiStats';
import { StatusBadge } from './StatusBadge';

interface QaPanelProps {
  assessments: Assessment[];
  summary: SummaryCounts;
  demoMode: boolean;
  onOpenCustomer: (customerKey: string) => void;
}

/** 개요 화면: 분석 결과를 근거로 자연어 질문에 답한다(Liner Model API). */
export function QaPanel({ assessments, summary, demoMode, onOpenCustomer }: QaPanelProps) {
  const [question, setQuestion] = useState('');
  const [asked, setAsked] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LlmResult<QaContent> | null>(null);

  async function ask(q: string, forceLive = false) {
    const nq = normalizeQuestion(q);
    if (!nq || loading || assessments.length === 0) return;
    setQuestion(nq);
    setAsked(nq);
    setLoading(true);
    try {
      setResult(await generateAnswer(nq, assessments, summary, { demoMode, forceLive }));
    } finally {
      setLoading(false);
    }
  }

  const failed = result?.source === 'fallback';
  const answerText = result && !failed ? replaceAliases(result.content.answer, assessments) : '';
  const referenced = result && !failed
    ? Array.from(new Set(result.content.referenced))
        .map(id => assessments.find(a => a.alias === id))
        .filter((a): a is Assessment => Boolean(a))
    : [];

  return (
    <div className="bento-card bento-enter space-y-3" data-testid="qa-panel">
      <div>
        <h2 className="text-[16px] leading-[24px] font-semibold" style={{ color: 'var(--ztd-ink)' }}>
          질문하기
        </h2>
        <p className="text-[14px]" style={{ color: 'var(--ztd-muted)' }}>
          분석 결과를 근거로 답해요. 거래처명은 보내지 않고 별칭과 요약 수치만 Liner로 전달돼요.
        </p>
      </div>

      <form
        className="flex flex-col sm:flex-row gap-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
      >
        <input
          type="text"
          value={question}
          maxLength={QA_QUESTION_MAX}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="예: 이번 주 가장 먼저 연락할 거래처 3곳과 이유는?"
          aria-label="분석 결과에 대한 질문"
          className="flex-1 h-[44px] rounded-full px-4 text-[14px]"
          style={{ backgroundColor: 'var(--ztd-lift)', border: '1px solid var(--ztd-line)', color: 'var(--ztd-ink)' }}
        />
        <button
          type="submit"
          disabled={loading || !normalizeQuestion(question)}
          className="h-[44px] px-5 rounded-full font-semibold text-[14px] inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
          style={{ backgroundColor: 'var(--ztd-ink)', color: 'var(--ztd-on-ink)' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }} aria-hidden="true">forum</span>
          <span>{loading ? '답변 만드는 중...' : '질문하기'}</span>
        </button>
      </form>

      <div className="flex flex-wrap gap-2">
        {QA_PRESET_QUESTIONS.map(p => (
          <button
            key={p}
            type="button"
            onClick={() => ask(p)}
            disabled={loading}
            className="h-[32px] px-3 rounded-full text-[13px] cursor-pointer disabled:opacity-50"
            style={{ backgroundColor: 'var(--ztd-panel)', border: '1px solid var(--ztd-line)', color: 'var(--ztd-ink)' }}
          >
            {p}
          </button>
        ))}
      </div>

      {result && (
        <div className="bento-sub p-4 space-y-2.5" data-testid="qa-answer">
          <div className="text-[13px]" style={{ color: 'var(--ztd-muted)' }}>Q. {asked}</div>

          {failed ? (
            <p className="text-[14px]" style={{ color: 'var(--ztd-ink)' }}>
              AI 답변을 만들지 못했어요
              {result.error_code ? ` (${ERROR_LABEL[result.error_code] || result.error_code})` : ''}. 잠시 후 다시 시도하거나 아래 우선 확인 목록을 참고해 주세요.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status="in_progress" label="AI 답변" />
                <span className="text-[13px]" style={{ color: 'var(--ztd-muted)' }}>
                  {result.source === 'live'
                    ? `실시간 AI 응답 (${result.latency_ms ?? 0}ms${result.model ? ` · ${result.model}` : ''})`
                    : 'Liner Model API 응답(저장본)'}
                </span>
                {result.source === 'cache' && (
                  <button
                    type="button"
                    onClick={() => ask(asked, true)}
                    disabled={loading}
                    className="text-[12px] underline cursor-pointer disabled:opacity-50"
                    style={{ color: 'var(--ztd-muted)' }}
                  >
                    새로 생성
                  </button>
                )}
              </div>
              <p
                className="text-[15px] leading-[24px] whitespace-pre-wrap"
                style={{ color: result.content.answer.trim() === QA_NOT_KNOWN ? 'var(--ztd-muted)' : 'var(--ztd-ink)' }}
              >
                {answerText}
              </p>
              {referenced.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px]" style={{ color: 'var(--ztd-muted)' }}>언급한 거래처</span>
                  {referenced.map(a => (
                    <button
                      key={a.customer_key}
                      type="button"
                      onClick={() => onOpenCustomer(a.customer_key)}
                      className="h-[28px] px-3 rounded-full text-[13px] font-medium cursor-pointer"
                      style={{ backgroundColor: 'var(--ztd-lift)', border: '1px solid var(--ztd-line)', color: 'var(--ztd-ink)' }}
                    >
                      {a.display_name}
                    </button>
                  ))}
                </div>
              )}
              <p className="text-[12px]" style={{ color: 'var(--ztd-muted)' }}>
                거래 이력만으로 이탈을 확정할 수 없어요. 판단과 연락은 대표님이 직접 하세요.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
