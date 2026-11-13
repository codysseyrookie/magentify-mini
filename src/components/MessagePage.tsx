import React, { useMemo } from 'react';
import { ChartCard, BarChart, formatCurrency } from 'ztd-charts';
import {
  Assessment,
  CleanTransaction,
  DraftRecord,
  TouchpointRecord,
} from '../types';
import { MessageTone, renderPlaceholders } from '../llm';
import { StatusBadge, VipBadge } from './StatusBadge';
import { FollowupSuggest } from './FollowupSuggest';

interface MessagePageProps {
  assessments: Assessment[];
  priorityList: Assessment[];
  currentAssessment: Assessment | null;
  cleanRows: CleanTransaction[];
  selectedKey: string;
  bulkQueue: string[];
  contactName: string;
  activeTab: 'email' | 'call';
  tone: MessageTone;
  currentEmailDraft: DraftRecord | null;
  currentCallDraft: DraftRecord | null;
  emailSubject: string;
  emailBody: string;
  isGeneratingEmail: boolean;
  demoMode: boolean;
  includeNews: boolean;
  newsQuery: string;
  isNewsLoading: boolean;
  onIncludeNewsChange: (v: boolean) => void;
  onNewsQueryChange: (q: string) => void;
  isGeneratingCall: boolean;
  touchDate: string;
  touchChannel: 'email' | 'phone' | 'other';
  touchOutcome: TouchpointRecord['outcome'];
  touchNote: string;
  hasNextDate: boolean;
  nextContactDate: string;
  selectedDraftId: number | null;
  touchHistory: TouchpointRecord[];
  onSelectCustomer: (key: string) => void;
  onNextCustomer: () => void;
  onBackToCustomers: () => void;
  onToggleFlags: (vip: boolean, projectBased: boolean) => void;
  onContactNameChange: (name: string) => void;
  onTabChange: (tab: 'email' | 'call') => void;
  onToneChange: (tone: MessageTone) => void;
  onGenerateEmail: (forceLive: boolean) => void;
  onGenerateCall: (forceLive: boolean) => void;
  onEmailSubjectChange: (s: string) => void;
  onEmailBodyChange: (b: string) => void;
  onSaveEditedEmail: () => void;
  onCopyMessage: (text: string) => void;
  onQuickMarkContacted: () => void;
  onOpenMailApp: () => void;
  onOpenGmailWeb: () => void;
  onTouchDateChange: (d: string) => void;
  onTouchChannelChange: (c: 'email' | 'phone' | 'other') => void;
  onTouchOutcomeChange: (o: TouchpointRecord['outcome']) => void;
  onTouchNoteChange: (n: string) => void;
  onHasNextDateChange: (v: boolean) => void;
  onNextContactDateChange: (d: string) => void;
  onSelectedDraftIdChange: (id: number | null) => void;
  onSaveTouchpoint: (e: React.FormEvent) => void;
}

const TONES: MessageTone[] = ['정중하게', '친근하게', '간단하게'];

export function MessagePage({
  assessments,
  priorityList,
  currentAssessment,
  cleanRows,
  selectedKey,
  bulkQueue,
  contactName,
  activeTab,
  tone,
  currentEmailDraft,
  currentCallDraft,
  emailSubject,
  emailBody,
  isGeneratingEmail,
  demoMode,
  includeNews,
  newsQuery,
  isNewsLoading,
  onIncludeNewsChange,
  onNewsQueryChange,
  isGeneratingCall,
  touchDate,
  touchChannel,
  touchOutcome,
  touchNote,
  hasNextDate,
  nextContactDate,
  selectedDraftId,
  touchHistory,
  onSelectCustomer,
  onNextCustomer,
  onBackToCustomers,
  onToggleFlags,
  onContactNameChange,
  onTabChange,
  onToneChange,
  onGenerateEmail,
  onGenerateCall,
  onEmailSubjectChange,
  onEmailBodyChange,
  onSaveEditedEmail,
  onCopyMessage,
  onQuickMarkContacted,
  onOpenMailApp,
  onOpenGmailWeb,
  onTouchDateChange,
  onTouchChannelChange,
  onTouchOutcomeChange,
  onTouchNoteChange,
  onHasNextDateChange,
  onNextContactDateChange,
  onSelectedDraftIdChange,
  onSaveTouchpoint,
}: MessagePageProps) {
  const intervalChartData = useMemo(() => {
    if (!currentAssessment) return [];
    const recent = (currentAssessment.intervals || []).slice(-6);
    const data = recent.map((val, idx) => ({
      label: `${recent.length - idx}회 전`,
      days: val,
    }));
    data.push({
      label: '최근 공백',
      days: currentAssessment.gap_days,
    });
    return data;
  }, [currentAssessment]);

  const chartAnnotations = useMemo(() => {
    if (!currentAssessment?.median_interval) return [];
    return [
      {
        type: 'line' as const,
        y: Math.round(currentAssessment.median_interval),
        label: `평소 ${Math.round(currentAssessment.median_interval)}일`,
      },
    ];
  }, [currentAssessment]);

  const recentTxns = useMemo(() => {
    if (!currentAssessment) return [];
    return cleanRows
      .filter(r => r.customer_key === currentAssessment.customer_key)
      .slice(-10)
      .reverse();
  }, [cleanRows, currentAssessment]);

  if (!currentAssessment) {
    return (
      <div className="bento-card text-center py-16">
        <p className="text-[16px]" style={{ color: 'var(--ztd-muted)' }}>
          먼저 거래 내역을 불러와 주세요.
        </p>
      </div>
    );
  }

  const queueSource = bulkQueue.length > 0 ? bulkQueue : priorityList.map(p => p.customer_key);
  const queueIndex = queueSource.indexOf(currentAssessment.customer_key);
  const hasNextInQueue = queueSource.length > 1;

  return (
    <div className="space-y-4">
      {/* Top Workflow Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bento-enter">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onBackToCustomers}
            className="h-[44px] px-4 rounded-full text-[14px] font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            style={{
              backgroundColor: 'var(--ztd-panel)',
              border: '1px solid var(--ztd-line)',
              color: 'var(--ztd-ink)',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }} aria-hidden="true">
              arrow_back
            </span>
            <span>거래처 목록</span>
          </button>

          <select
            value={selectedKey}
            onChange={(e) => onSelectCustomer(e.target.value)}
            aria-label="문안 작성할 거래처 선택"
            className="h-[44px] px-4 rounded-full text-[15px] font-semibold cursor-pointer"
            style={{
              backgroundColor: 'var(--ztd-panel)',
              border: '1px solid var(--ztd-line)',
              color: 'var(--ztd-ink)',
            }}
          >
            {assessments.map(a => (
              <option key={a.customer_key} value={a.customer_key}>
                {a.display_name} {a.vip ? '· VIP' : ''} ({a.gap_days}일 공백)
              </option>
            ))}
          </select>

          <StatusBadge status={currentAssessment.status} />
          {currentAssessment.vip && <VipBadge />}
        </div>

        <div className="flex items-center gap-2">
          {bulkQueue.length > 0 && queueIndex >= 0 && (
            <span className="text-[13px] font-medium tabular-nums px-3" style={{ color: 'var(--ztd-muted)' }}>
              선택 작업 {queueIndex + 1} / {bulkQueue.length}
            </span>
          )}
          {hasNextInQueue && (
            <button
              type="button"
              onClick={onNextCustomer}
              className="h-[44px] px-4 rounded-full text-[14px] font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              style={{
                backgroundColor: 'var(--ztd-panel)',
                border: '1px solid var(--ztd-line)',
                color: 'var(--ztd-ink)',
              }}
            >
              <span>다음 거래처</span>
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }} aria-hidden="true">
                arrow_forward
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Main 2-Column Bento: Left Customer Summary (5 cols) + Right Message Editor (7 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* LEFT: Customer Summary & Evidence */}
        <div className="lg:col-span-5 space-y-4">
          {/* Customer Summary Bento */}
          <div className="bento-card bento-enter space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h1 className="text-[24px] leading-[32px] font-bold" style={{ color: 'var(--ztd-ink)' }}>
                  {currentAssessment.display_name}
                </h1>
                <p className="text-[14px] mt-0.5" style={{ color: 'var(--ztd-muted)' }}>
                  거래일 수 {currentAssessment.txn_days}일 · 신뢰도{' '}
                  {currentAssessment.confidence === 'high'
                    ? '높음'
                    : currentAssessment.confidence === 'medium'
                    ? '보통'
                    : '부족'}
                </p>
              </div>
              <span
                className="text-[12px] font-mono px-2.5 py-1 rounded-full"
                style={{ backgroundColor: 'var(--ztd-lift)', color: 'var(--ztd-muted)' }}
              >
                {currentAssessment.alias}
              </span>
            </div>

            {/* VIP / Project checkboxes */}
            <div className="flex flex-wrap items-center gap-4 pt-1">
              <label className="inline-flex items-center gap-2 text-[14px] font-medium cursor-pointer" style={{ color: 'var(--ztd-ink)' }}>
                <input
                  type="checkbox"
                  checked={currentAssessment.vip}
                  onChange={(e) => onToggleFlags(e.target.checked, currentAssessment.project_based)}
                  className="w-4 h-4 rounded accent-[var(--ztd-ink)]"
                />
                <span>VIP 거래처</span>
              </label>

              <label className="inline-flex items-center gap-2 text-[14px] font-medium cursor-pointer" style={{ color: 'var(--ztd-ink)' }}>
                <input
                  type="checkbox"
                  checked={currentAssessment.project_based}
                  onChange={(e) => onToggleFlags(currentAssessment.vip, e.target.checked)}
                  className="w-4 h-4 rounded accent-[var(--ztd-ink)]"
                />
                <span>비정기 프로젝트성</span>
              </label>
            </div>

            {/* 2x2 Key Stats in --ztd-lift sub-blocks */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="bento-sub p-3.5">
                <div className="text-[13px]" style={{ color: 'var(--ztd-muted)' }}>마지막 거래일</div>
                <div className="text-[18px] font-bold font-mono tabular-nums mt-1" style={{ color: 'var(--ztd-ink)' }}>
                  {currentAssessment.last_date}
                </div>
              </div>
              <div className="bento-sub p-3.5">
                <div className="text-[13px]" style={{ color: 'var(--ztd-muted)' }}>미접촉 기간</div>
                <div className="text-[20px] font-bold tabular-nums mt-1" style={{ color: 'var(--status-risk-text)' }}>
                  {currentAssessment.gap_days}일
                </div>
              </div>
              <div className="bento-sub p-3.5">
                <div className="text-[13px]" style={{ color: 'var(--ztd-muted)' }}>평소 주문 주기</div>
                <div className="text-[18px] font-bold tabular-nums mt-1" style={{ color: 'var(--ztd-ink)' }}>
                  {currentAssessment.median_interval ? `${Math.round(currentAssessment.median_interval)}일` : '-'}
                </div>
              </div>
              <div className="bento-sub p-3.5">
                <div className="text-[13px]" style={{ color: 'var(--ztd-muted)' }}>주기 대비 배수</div>
                <div className="text-[18px] font-bold tabular-nums mt-1" style={{ color: 'var(--ztd-accent-text)' }}>
                  {currentAssessment.ratio ? `${currentAssessment.ratio}배` : '-'}
                </div>
              </div>
            </div>

            {/* Check Questions & Safety Statement */}
            <div className="bento-sub p-4 space-y-2.5">
              <div className="text-[14px] font-semibold flex items-center gap-1.5" style={{ color: 'var(--ztd-ink)' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--ztd-accent-text)' }} aria-hidden="true">
                  checklist
                </span>
                연락 전 확인 질문
              </div>
              <ul className="space-y-1.5 text-[14px] leading-[20px]" style={{ color: 'var(--ztd-muted)' }}>
                {currentAssessment.questions.map((q, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: 'var(--ztd-accent)' }} />
                    <span>{q}</span>
                  </li>
                ))}
              </ul>
              <div
                className="pt-2.5 mt-2 border-t text-[13px] font-medium flex items-center gap-1.5"
                style={{ borderColor: 'var(--ztd-line)', color: 'var(--ztd-muted)' }}
              >
                <span className="material-symbols-outlined shrink-0" style={{ fontSize: '16px' }} aria-hidden="true">
                  info
                </span>
                거래 이력만으로 이탈을 확정할 수 없습니다.
              </div>
            </div>
          </div>

          {/* Interval History Chart */}
          <div className="ztd-chart-wrapper bento-enter" style={{ animationDelay: '60ms' }}>
            <ChartCard
              number="01"
              title="주문 간격 이력"
              subtitle="평소 주기와 최근 공백 일수 비교"
              takeaway={
                currentAssessment.ratio
                  ? `평소 ${Math.round(currentAssessment.median_interval || 0)}일 주기 대비 ${currentAssessment.gap_days}일(${currentAssessment.ratio}배) 경과했어요.`
                  : `총 거래일 ${currentAssessment.txn_days}일 데이터를 기반으로 표시해요.`
              }
              accent="공백"
              level="basic"
              replay
            >
              {intervalChartData.length > 0 ? (
                <BarChart
                  data={intervalChartData}
                  x="label"
                  y="days"
                  highlight="최근 공백"
                  unit="일"
                  locale="ko-KR"
                  height={200}
                  annotations={chartAnnotations}
                />
              ) : (
                <div className="h-[200px] flex items-center justify-center text-[14px]" style={{ color: 'var(--ztd-muted)' }}>
                  간격을 계산할 거래 데이터가 부족해요.
                </div>
              )}
            </ChartCard>
          </div>

          {/* Recent 10 Transactions */}
          <div className="bento-card bento-enter space-y-3" style={{ animationDelay: '100ms' }}>
            <div className="flex items-center justify-between">
              <h2 className="text-[16px] font-semibold" style={{ color: 'var(--ztd-ink)' }}>
                최근 거래 내역
              </h2>
              <span className="text-[13px]" style={{ color: 'var(--ztd-muted)' }}>
                최대 10건
              </span>
            </div>
            <div className="overflow-x-auto max-h-60">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b" style={{ borderColor: 'var(--ztd-line)', color: 'var(--ztd-muted)' }}>
                    <th className="py-2 px-2 text-[13px] font-semibold">거래일</th>
                    <th className="py-2 px-2 text-[13px] font-semibold">품목</th>
                    <th className="py-2 px-2 text-[13px] font-semibold text-right">금액</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: 'var(--ztd-line2)' }}>
                  {recentTxns.map((r, i) => (
                    <tr key={i} className="h-[40px]">
                      <td className="py-1.5 px-2 text-[13px] font-mono tabular-nums whitespace-nowrap" style={{ color: 'var(--ztd-muted)' }}>
                        {r.date}
                      </td>
                      <td className="py-1.5 px-2 text-[13px] truncate max-w-[140px]" style={{ color: 'var(--ztd-ink)' }}>
                        {r.item || '-'}
                      </td>
                      <td className="py-1.5 px-2 text-[13px] tabular-nums text-right whitespace-nowrap" style={{ color: 'var(--ztd-ink)' }}>
                        {r.amount ? formatCurrency(r.amount, { locale: 'ko-KR' }) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* RIGHT: Message Editor (§6-7) + Contact Log */}
        <div className="lg:col-span-7 space-y-4">
          {/* Message Editor Card */}
          <div className="bento-card bento-enter space-y-5" style={{ animationDelay: '40ms' }}>
            {/* Top Controls: Channel Pill Tabs + Tone Pill Toggle (§6-7) */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Channel Pill Switch */}
              <div
                className="inline-flex p-1 rounded-full"
                style={{ backgroundColor: 'var(--ztd-lift)', border: '1px solid var(--ztd-line)' }}
                role="tablist"
                aria-label="문안 유형 선택"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'email'}
                  onClick={() => onTabChange('email')}
                  className="h-[36px] px-4 rounded-full text-[14px] font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                  style={{
                    backgroundColor: activeTab === 'email' ? 'var(--ztd-ink)' : 'transparent',
                    color: activeTab === 'email' ? 'var(--ztd-on-ink)' : 'var(--ztd-muted)',
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }} aria-hidden="true">mail</span>
                  이메일 초안
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'call'}
                  onClick={() => onTabChange('call')}
                  className="h-[36px] px-4 rounded-full text-[14px] font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                  style={{
                    backgroundColor: activeTab === 'call' ? 'var(--ztd-ink)' : 'transparent',
                    color: activeTab === 'call' ? 'var(--ztd-on-ink)' : 'var(--ztd-muted)',
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }} aria-hidden="true">call</span>
                  통화 가이드
                </button>
              </div>

              {/* Tone Pill Toggle */}
              <div className="flex items-center gap-1.5" role="group" aria-label="문안 톤 선택">
                {TONES.map((t) => {
                  const active = tone === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => onToneChange(t)}
                      className="h-[36px] px-3.5 rounded-full text-[13px] font-semibold transition-colors cursor-pointer"
                      style={{
                        backgroundColor: active ? 'var(--ztd-tint)' : 'var(--ztd-lift)',
                        color: active ? 'var(--ztd-accent-text)' : 'var(--ztd-muted)',
                      }}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Contact Name + Generate Row */}
            <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-end">
              <div className="flex-1">
                <label className="block text-[13px] font-medium mb-1.5" style={{ color: 'var(--ztd-muted)' }}>
                  담당자명 (선택 · 입력 시 본문에 바로 반영돼요)
                </label>
                <input
                  type="text"
                  value={contactName}
                  onChange={(e) => onContactNameChange(e.target.value)}
                  placeholder="예: 김철수 과장 (비워두면 [담당자명] 유지)"
                  className="w-full h-[44px] rounded-full px-4 text-[14px]"
                  style={{
                    backgroundColor: 'var(--ztd-lift)',
                    border: '1px solid var(--ztd-line)',
                    color: 'var(--ztd-ink)',
                  }}
                />
              </div>

              {activeTab === 'email' ? (
                <button
                  type="button"
                  onClick={() => onGenerateEmail(false)}
                  disabled={isGeneratingEmail}
                  className="h-[44px] px-5 rounded-full font-semibold text-[14px] inline-flex items-center justify-center gap-1.5 transition-opacity hover:opacity-90 cursor-pointer disabled:opacity-50 shrink-0"
                  style={{ backgroundColor: 'var(--ztd-ink)', color: 'var(--ztd-on-ink)' }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }} aria-hidden="true">auto_awesome</span>
                  <span>{isGeneratingEmail ? '작성 중...' : '이메일 초안 생성'}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onGenerateCall(false)}
                  disabled={isGeneratingCall}
                  className="h-[44px] px-5 rounded-full font-semibold text-[14px] inline-flex items-center justify-center gap-1.5 transition-opacity hover:opacity-90 cursor-pointer disabled:opacity-50 shrink-0"
                  style={{ backgroundColor: 'var(--ztd-ink)', color: 'var(--ztd-on-ink)' }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }} aria-hidden="true">auto_awesome</span>
                  <span>{isGeneratingCall ? '작성 중...' : '통화 가이드 생성'}</span>
                </button>
              )}
            </div>

            {/* EMAIL EDITOR TAB */}
            {activeTab === 'email' && (
              <div className="space-y-4">
                {/* 업종 동향 (Liner Search API) */}
                <div className="bento-sub p-4 space-y-3" data-testid="news-panel">
                  <label className="flex flex-wrap items-center gap-2 text-[14px] font-semibold cursor-pointer" style={{ color: 'var(--ztd-ink)' }}>
                    <input
                      type="checkbox"
                      checked={includeNews}
                      onChange={(e) => onIncludeNewsChange(e.target.checked)}
                      className="w-4 h-4 rounded cursor-pointer accent-[var(--ztd-ink)]"
                    />
                    <span>업종 동향 포함</span>
                    <span className="text-[12px] font-normal" style={{ color: 'var(--ztd-muted)' }}>
                      Liner Search로 최근 소식을 찾아 연락 계기로 한 문장만 반영해요
                    </span>
                  </label>

                  {includeNews && (
                    <div>
                      <input
                        type="text"
                        value={newsQuery}
                        maxLength={60}
                        onChange={(e) => onNewsQueryChange(e.target.value)}
                        aria-label="업종 동향 검색어"
                        className="w-full h-[40px] rounded-full px-4 text-[14px]"
                        style={{ backgroundColor: 'var(--ztd-lift)', border: '1px solid var(--ztd-line)', color: 'var(--ztd-ink)' }}
                      />
                      <p className="text-[12px] mt-1.5" style={{ color: 'var(--ztd-muted)' }}>
                        검색어만 외부(Liner)로 전송돼요. 거래처명이나 개인정보는 넣지 마세요.
                      </p>
                    </div>
                  )}

                  {isNewsLoading && (
                    <p className="text-[13px]" style={{ color: 'var(--ztd-muted)' }}>업종 동향을 찾는 중...</p>
                  )}

                  {currentEmailDraft?.news && currentEmailDraft.news.length > 0 && (
                    <div className="space-y-2" data-testid="news-chips">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[13px] font-semibold" style={{ color: 'var(--ztd-ink)' }}>참고한 업계 소식</span>
                        <StatusBadge
                          status="in_progress"
                          label={currentEmailDraft.news_source === 'live' ? '실시간 Liner Search 응답' : 'Liner Search API 응답(저장본)'}
                        />
                        <span className="text-[12px]" style={{ color: 'var(--ztd-muted)' }}>제목만 참고했고, 내용은 사실 확인 전이에요</span>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        {currentEmailDraft.news.map((n) => (
                          <a
                            key={n.url}
                            href={n.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 rounded-2xl px-3.5 py-2 text-[13px] transition-opacity hover:opacity-80"
                            style={{ backgroundColor: 'var(--ztd-lift)', border: '1px solid var(--ztd-line)', color: 'var(--ztd-ink)' }}
                          >
                            <span className="font-mono text-[12px]" style={{ color: 'var(--ztd-muted)' }}>{n.hostname}</span>
                            <span className="font-mono text-[12px]" style={{ color: 'var(--ztd-muted)' }}>{n.date}</span>
                            <span className="font-medium">{n.title}</span>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {currentEmailDraft ? (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <StatusBadge status="in_progress" label="AI 초안" />
                        <span className="text-[13px]" style={{ color: 'var(--ztd-muted)' }}>
                          {currentEmailDraft.source === 'live'
                            ? `실시간 AI 응답${currentEmailDraft.model ? ` (${currentEmailDraft.model})` : ''}`
                            : currentEmailDraft.source === 'cache'
                            ? 'Liner Model API 응답(저장본)'
                            : '안전한 기본 템플릿'}
                        </span>
                      </div>
                      <span className="text-[13px]" style={{ color: 'var(--ztd-muted)' }}>
                        가격·납기·할인 약속 없음
                      </span>
                    </div>

                    <div>
                      <label className="block text-[13px] font-medium mb-1.5" style={{ color: 'var(--ztd-muted)' }}>
                        이메일 제목
                      </label>
                      <input
                        type="text"
                        value={emailSubject}
                        onChange={(e) => onEmailSubjectChange(e.target.value)}
                        className="w-full h-[44px] rounded-full px-4 text-[15px] font-semibold"
                        style={{
                          backgroundColor: 'var(--ztd-lift)',
                          border: '1px solid var(--ztd-line)',
                          color: 'var(--ztd-ink)',
                        }}
                      />
                    </div>

                    <div>
                      <label className="block text-[13px] font-medium mb-1.5" style={{ color: 'var(--ztd-muted)' }}>
                        이메일 본문 (자유롭게 수정하세요)
                      </label>
                      <textarea
                        rows={7}
                        value={emailBody}
                        onChange={(e) => onEmailBodyChange(e.target.value)}
                        className="w-full rounded-[14px] p-4 text-[16px] leading-[24px]"
                        style={{
                          backgroundColor: 'var(--ztd-lift)',
                          border: '1px solid var(--ztd-line)',
                          color: 'var(--ztd-ink)',
                        }}
                      />
                    </div>

                    {/* Quick Email Client Launch */}
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={onOpenMailApp}
                        className="h-[38px] px-3.5 rounded-full text-[13px] font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                        style={{ backgroundColor: 'var(--ztd-lift)', border: '1px solid var(--ztd-line)', color: 'var(--ztd-ink)' }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>mail</span>
                        기본 메일 앱 열기
                      </button>
                      <button
                        type="button"
                        onClick={onOpenGmailWeb}
                        className="h-[38px] px-3.5 rounded-full text-[13px] font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                        style={{ backgroundColor: 'var(--ztd-lift)', border: '1px solid var(--ztd-line)', color: 'var(--ztd-ink)' }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>open_in_new</span>
                        Gmail 웹으로 열기
                      </button>
                    </div>

                    {/* Bottom Action Bar (§6-7): [복사] (Primary) · [다시 생성] (Secondary) · [수정본 저장] · [연락 완료로 표시] (Ghost) */}
                    <div
                      className="pt-4 border-t flex flex-wrap items-center justify-between gap-2.5"
                      style={{ borderColor: 'var(--ztd-line)' }}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onCopyMessage(`제목: ${emailSubject}\n\n${emailBody}`)}
                          className="h-[44px] px-5 rounded-full font-semibold text-[14px] inline-flex items-center gap-2 transition-opacity hover:opacity-90 cursor-pointer"
                          style={{ backgroundColor: 'var(--ztd-ink)', color: 'var(--ztd-on-ink)' }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '18px' }} aria-hidden="true">content_copy</span>
                          복사
                        </button>

                        <button
                          type="button"
                          onClick={() => onGenerateEmail(true)}
                          disabled={isGeneratingEmail}
                          className="h-[44px] px-4 rounded-full font-semibold text-[14px] inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                          style={{ backgroundColor: 'var(--ztd-lift)', border: '1px solid var(--ztd-line)', color: 'var(--ztd-ink)' }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '17px' }} aria-hidden="true">sync</span>
                          다시 생성
                        </button>

                        <button
                          type="button"
                          onClick={onSaveEditedEmail}
                          className="h-[44px] px-4 rounded-full font-semibold text-[14px] inline-flex items-center gap-1.5 cursor-pointer"
                          style={{ backgroundColor: 'var(--ztd-lift)', border: '1px solid var(--ztd-line)', color: 'var(--ztd-ink)' }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '17px' }} aria-hidden="true">save</span>
                          수정본 저장
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={onQuickMarkContacted}
                        className="h-[44px] px-4 rounded-full font-semibold text-[14px] inline-flex items-center gap-1.5 hover:bg-[var(--ztd-lift)] transition-colors cursor-pointer"
                        style={{ color: 'var(--status-ok-text)' }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '18px' }} aria-hidden="true">check_circle</span>
                        연락 완료로 표시
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="bento-sub p-8 text-center space-y-2">
                    <p className="text-[15px] font-medium" style={{ color: 'var(--ztd-ink)' }}>
                      {currentAssessment.display_name}에 보낼 안부 이메일 초안을 만들어볼까요?
                    </p>
                    <p className="text-[14px]" style={{ color: 'var(--ztd-muted)' }}>
                      선택한 톤({tone})에 맞춰 부담 없는 안부 문안을 생성해 드립니다. 발송은 대표님이 직접 진행합니다.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* CALL GUIDE TAB */}
            {activeTab === 'call' && (
              <div className="space-y-4">
                {currentCallDraft ? (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <StatusBadge status="in_progress" label="AI 통화 가이드" />
                        <span className="text-[13px]" style={{ color: 'var(--ztd-muted)' }}>
                          {currentCallDraft.source === 'live'
                            ? `실시간 AI 응답${currentCallDraft.model ? ` (${currentCallDraft.model})` : ''}`
                            : currentCallDraft.source === 'cache'
                            ? 'Liner Model API 응답(저장본)'
                            : '안전한 기본 템플릿'}
                        </span>
                      </div>
                    </div>

                    <div className="bento-sub p-5 space-y-4">
                      <div>
                        <div className="text-[13px] font-semibold mb-1" style={{ color: 'var(--ztd-muted)' }}>통화 목적</div>
                        <p className="text-[16px] leading-[24px] font-medium" style={{ color: 'var(--ztd-ink)' }}>
                          {renderPlaceholders(currentCallDraft.original_json?.purpose || '', currentAssessment.display_name, contactName)}
                        </p>
                      </div>

                      <div>
                        <div className="text-[13px] font-semibold mb-1" style={{ color: 'var(--ztd-muted)' }}>첫 인사</div>
                        <div
                          className="p-3.5 rounded-[14px] text-[16px] leading-[24px]"
                          style={{ backgroundColor: 'var(--ztd-panel)', border: '1px solid var(--ztd-line)', color: 'var(--ztd-ink)' }}
                        >
                          "{renderPlaceholders(currentCallDraft.original_json?.opening || '', currentAssessment.display_name, contactName)}"
                        </div>
                      </div>

                      <div>
                        <div className="text-[13px] font-semibold mb-1.5" style={{ color: 'var(--ztd-muted)' }}>확인 질문</div>
                        <ul className="space-y-1.5 text-[15px] leading-[22px]" style={{ color: 'var(--ztd-ink)' }}>
                          {(currentCallDraft.original_json?.questions || []).map((q: string, idx: number) => (
                            <li key={idx} className="flex items-start gap-2">
                              <span className="mt-2 w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: 'var(--ztd-accent)' }} />
                              <span>{renderPlaceholders(q, currentAssessment.display_name, contactName)}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div>
                        <div className="text-[13px] font-semibold mb-1" style={{ color: 'var(--ztd-muted)' }}>다음 단계 제안</div>
                        <p className="text-[15px] leading-[22px]" style={{ color: 'var(--ztd-ink)' }}>
                          {renderPlaceholders(currentCallDraft.original_json?.next_step || '', currentAssessment.display_name, contactName)}
                        </p>
                      </div>
                    </div>

                    <div
                      className="pt-4 border-t flex flex-wrap items-center justify-between gap-2.5"
                      style={{ borderColor: 'var(--ztd-line)' }}
                    >
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const txt = `목적: ${currentCallDraft.original_json?.purpose}\n첫인사: ${renderPlaceholders(currentCallDraft.original_json?.opening || '', currentAssessment.display_name, contactName)}\n질문: ${(currentCallDraft.original_json?.questions || []).join(', ')}\n다음단계: ${currentCallDraft.original_json?.next_step}`;
                            onCopyMessage(txt);
                          }}
                          className="h-[44px] px-5 rounded-full font-semibold text-[14px] inline-flex items-center gap-2 transition-opacity hover:opacity-90 cursor-pointer"
                          style={{ backgroundColor: 'var(--ztd-ink)', color: 'var(--ztd-on-ink)' }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '18px' }} aria-hidden="true">content_copy</span>
                          복사
                        </button>

                        <button
                          type="button"
                          onClick={() => onGenerateCall(true)}
                          disabled={isGeneratingCall}
                          className="h-[44px] px-4 rounded-full font-semibold text-[14px] inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                          style={{ backgroundColor: 'var(--ztd-lift)', border: '1px solid var(--ztd-line)', color: 'var(--ztd-ink)' }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '17px' }} aria-hidden="true">sync</span>
                          다시 생성
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={onQuickMarkContacted}
                        className="h-[44px] px-4 rounded-full font-semibold text-[14px] inline-flex items-center gap-1.5 hover:bg-[var(--ztd-lift)] transition-colors cursor-pointer"
                        style={{ color: 'var(--status-ok-text)' }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '18px' }} aria-hidden="true">check_circle</span>
                        연락 완료로 표시
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="bento-sub p-8 text-center space-y-2">
                    <p className="text-[15px] font-medium" style={{ color: 'var(--ztd-ink)' }}>
                      전화 통화 전에 참고할 1분 통화 가이드를 준비할까요?
                    </p>
                    <p className="text-[14px]" style={{ color: 'var(--ztd-muted)' }}>
                      부담 없는 첫 인사부터 확인 질문, 통화 후 기록 체크리스트까지 정리해 드립니다.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Contact Record Form & History Card */}
          <div className="bento-card bento-enter space-y-5" style={{ animationDelay: '80ms' }}>
            <div>
              <h2 className="text-[16px] leading-[24px] font-semibold" style={{ color: 'var(--ztd-ink)' }}>
                접촉 결과 및 다음 연락일 기록
              </h2>
              <p className="text-[14px] leading-[20px]" style={{ color: 'var(--ztd-muted)' }}>
                연락 결과를 남기면 대시보드와 후속 조치 일정에 즉시 반영돼요
              </p>
            </div>

            <form onSubmit={onSaveTouchpoint} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[13px] font-medium mb-1.5" style={{ color: 'var(--ztd-muted)' }}>
                    접촉 일자
                  </label>
                  <input
                    type="date"
                    value={touchDate}
                    onChange={(e) => onTouchDateChange(e.target.value)}
                    className="w-full h-[44px] rounded-full px-4 text-[14px] tabular-nums"
                    style={{ backgroundColor: 'var(--ztd-lift)', border: '1px solid var(--ztd-line)', color: 'var(--ztd-ink)' }}
                  />
                </div>

                <div>
                  <label className="block text-[13px] font-medium mb-1.5" style={{ color: 'var(--ztd-muted)' }}>
                    접촉 채널
                  </label>
                  <select
                    value={touchChannel}
                    onChange={(e) => onTouchChannelChange(e.target.value as any)}
                    className="w-full h-[44px] rounded-full px-4 text-[14px]"
                    style={{ backgroundColor: 'var(--ztd-lift)', border: '1px solid var(--ztd-line)', color: 'var(--ztd-ink)' }}
                  >
                    <option value="email">이메일</option>
                    <option value="phone">전화</option>
                    <option value="other">기타</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[13px] font-medium mb-1.5" style={{ color: 'var(--ztd-muted)' }}>
                    접촉 결과
                  </label>
                  <select
                    value={touchOutcome}
                    onChange={(e) => onTouchOutcomeChange(e.target.value as any)}
                    className="w-full h-[44px] rounded-full px-4 text-[14px]"
                    style={{ backgroundColor: 'var(--ztd-lift)', border: '1px solid var(--ztd-line)', color: 'var(--ztd-ink)' }}
                  >
                    <option value="waiting_reply">회신 대기</option>
                    <option value="planned">연락 예정</option>
                    <option value="contacted">연락 완료</option>
                    <option value="quote_requested">견적 요청</option>
                    <option value="reorder_confirmed">재주문 확인</option>
                    <option value="on_hold">거래 보류</option>
                    <option value="not_needed">연락 불필요</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[13px] font-medium mb-1.5" style={{ color: 'var(--ztd-muted)' }}>
                  접촉 메모
                </label>
                <input
                  type="text"
                  maxLength={500}
                  value={touchNote}
                  onChange={(e) => onTouchNoteChange(e.target.value)}
                  placeholder="예: 담당자 안부 이메일 발송 완료, 차주 일정 확인 예정"
                  className="w-full h-[44px] rounded-full px-4 text-[14px]"
                  style={{ backgroundColor: 'var(--ztd-lift)', border: '1px solid var(--ztd-line)', color: 'var(--ztd-ink)' }}
                />
                {/* 메모 -> 후속 조치 제안 (Liner Model API) */}
                <div className="mt-2.5">
                  <FollowupSuggest
                    memo={touchNote}
                    contactDate={touchDate}
                    customerName={currentAssessment?.display_name ?? ''}
                    contactName={contactName}
                    demoMode={demoMode}
                    onUsePresetMemo={onTouchNoteChange}
                    onApply={(c) => {
                      onTouchOutcomeChange(c.outcome);
                      if (c.channel) onTouchChannelChange(c.channel);
                      if (c.next_contact_date) {
                        onHasNextDateChange(true);
                        onNextContactDateChange(c.next_contact_date);
                      } else {
                        onHasNextDateChange(false);
                      }
                    }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                <div>
                  <label className="inline-flex items-center gap-2 text-[14px] font-medium cursor-pointer mb-1.5" style={{ color: 'var(--ztd-ink)' }}>
                    <input
                      type="checkbox"
                      checked={hasNextDate}
                      onChange={(e) => onHasNextDateChange(e.target.checked)}
                      className="w-4 h-4 rounded accent-[var(--ztd-ink)]"
                    />
                    <span>다음 연락 예정일 지정</span>
                  </label>
                  {hasNextDate && (
                    <input
                      type="date"
                      value={nextContactDate}
                      onChange={(e) => onNextContactDateChange(e.target.value)}
                      className="w-full h-[44px] rounded-full px-4 text-[14px] tabular-nums"
                      style={{ backgroundColor: 'var(--ztd-lift)', border: '1px solid var(--ztd-line)', color: 'var(--ztd-ink)' }}
                    />
                  )}
                </div>

                <div>
                  <label className="block text-[13px] font-medium mb-1.5" style={{ color: 'var(--ztd-muted)' }}>
                    사용한 초안 (선택)
                  </label>
                  <select
                    value={selectedDraftId ?? ''}
                    onChange={(e) => onSelectedDraftIdChange(e.target.value ? Number(e.target.value) : null)}
                    className="w-full h-[44px] rounded-full px-4 text-[14px]"
                    style={{ backgroundColor: 'var(--ztd-lift)', border: '1px solid var(--ztd-line)', color: 'var(--ztd-ink)' }}
                  >
                    <option value="">(선택 안 함)</option>
                    {currentEmailDraft && (
                      <option value={currentEmailDraft.id}>이메일 초안 #{currentEmailDraft.id}</option>
                    )}
                    {currentCallDraft && (
                      <option value={currentCallDraft.id}>통화 가이드 #{currentCallDraft.id}</option>
                    )}
                  </select>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  className="h-[44px] px-6 rounded-full font-semibold text-[14px] inline-flex items-center gap-2 transition-opacity hover:opacity-90 cursor-pointer"
                  style={{ backgroundColor: 'var(--ztd-ink)', color: 'var(--ztd-on-ink)' }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }} aria-hidden="true">save</span>
                  접촉 기록 저장
                </button>
              </div>
            </form>

            {/* History Table */}
            <div className="pt-4 border-t space-y-2.5" style={{ borderColor: 'var(--ztd-line)' }}>
              <h3 className="text-[14px] font-semibold" style={{ color: 'var(--ztd-ink)' }}>
                최근 접촉 이력
              </h3>
              {touchHistory.length === 0 ? (
                <div className="bento-sub p-4 text-center text-[14px]" style={{ color: 'var(--ztd-muted)' }}>
                  아직 저장된 접촉 이력이 없어요.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b" style={{ borderColor: 'var(--ztd-line)', color: 'var(--ztd-muted)' }}>
                        <th className="py-2 px-2 text-[13px] font-semibold">접촉일</th>
                        <th className="py-2 px-2 text-[13px] font-semibold">채널</th>
                        <th className="py-2 px-2 text-[13px] font-semibold">결과</th>
                        <th className="py-2 px-2 text-[13px] font-semibold">메모</th>
                        <th className="py-2 px-2 text-[13px] font-semibold">다음 연락일</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y" style={{ borderColor: 'var(--ztd-line2)' }}>
                      {touchHistory.map((h) => (
                        <tr key={h.id} className="h-[44px]">
                          <td className="py-2 px-2 text-[13px] font-mono tabular-nums whitespace-nowrap" style={{ color: 'var(--ztd-muted)' }}>
                            {h.contact_date}
                          </td>
                          <td className="py-2 px-2 text-[14px]" style={{ color: 'var(--ztd-ink)' }}>
                            {h.channel === 'email' ? '이메일' : h.channel === 'phone' ? '전화' : '기타'}
                          </td>
                          <td className="py-2 px-2">
                            <StatusBadge
                              status={h.outcome === 'contacted' || h.outcome === 'reorder_confirmed' ? 'contacted' : h.outcome === 'on_hold' ? 'hold' : 'in_progress'}
                              label={
                                {
                                  planned: '연락 예정',
                                  contacted: '연락 완료',
                                  waiting_reply: '회신 대기',
                                  quote_requested: '견적 요청',
                                  reorder_confirmed: '재주문 확인',
                                  on_hold: '거래 보류',
                                  not_needed: '연락 불필요',
                                }[h.outcome] || h.outcome
                              }
                            />
                          </td>
                          <td className="py-2 px-2 text-[14px] max-w-[180px] truncate" style={{ color: 'var(--ztd-muted)' }}>
                            {h.note || '-'}
                          </td>
                          <td className="py-2 px-2 text-[13px] font-mono tabular-nums whitespace-nowrap" style={{ color: 'var(--ztd-ink)' }}>
                            {h.next_contact_date || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
