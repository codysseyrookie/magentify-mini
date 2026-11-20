import { gapTakeaway } from '../analysis';
import React, { useMemo } from 'react';
import { ChartCard, BarChart, DonutChart, formatCurrency } from 'ztd-charts';
import { Assessment, BriefingContent, LlmResult, SummaryCounts, TouchpointRecord } from '../types';
import { StatusBadge, VipBadge } from './StatusBadge';
import { QaPanel } from './QaPanel';

interface OverviewPageProps {
  assessments: Assessment[];
  priorityList: Assessment[];
  summary: SummaryCounts;
  refDate: string;
  fileName: string;
  briefing: LlmResult<BriefingContent> | null;
  isBriefingLoading: boolean;
  touchpoints: TouchpointRecord[];
  draftCustomerKeys: Set<string>;
  weeklyGoal: number;
  demoMode: boolean;
  recencyWarning: { maxDate: string; diffDays: number } | null;
  onGenerateBriefing: (forceLive: boolean) => void;
  onOpenCustomer: (customerKey: string) => void;
  onNavigatePriorityList: () => void;
  onNavigateImport: () => void;
  onNavigateCustomers: () => void;
}

export function OverviewPage({
  assessments,
  priorityList,
  summary,
  refDate,
  fileName,
  briefing,
  isBriefingLoading,
  touchpoints,
  draftCustomerKeys,
  weeklyGoal,
  demoMode,
  recencyWarning,
  onGenerateBriefing,
  onOpenCustomer,
  onNavigatePriorityList,
  onNavigateImport,
  onNavigateCustomers,
}: OverviewPageProps) {
  const contactedKeys = useMemo(() => {
    const s = new Set<string>();
    for (const t of touchpoints) {
      if (t.outcome !== 'on_hold' && t.outcome !== 'not_needed') {
        s.add(t.customer_key);
      }
    }
    return s;
  }, [touchpoints]);

  const pendingDraftCount = useMemo(() => {
    return priorityList.filter(a => !draftCustomerKeys.has(a.customer_key) && !contactedKeys.has(a.customer_key)).length;
  }, [priorityList, draftCustomerKeys, contactedKeys]);

  const completedCount = contactedKeys.size;
  const goalPct = Math.min(100, Math.round((completedCount / Math.max(1, weeklyGoal)) * 100));
  const goalReached = completedCount >= weeklyGoal;

  const gapChartData = useMemo(() => {
    return priorityList
      .filter(a => a.status === 'high_risk' || a.status === 'risk' || a.status === 'attention')
      .slice(0, 6)
      .map(a => ({
        name: a.display_name,
        gap_days: a.gap_days,
      }));
  }, [priorityList]);

  const gapHighlight = gapChartData.length > 0 ? gapChartData[0].name : undefined;

  const statusDonutData = useMemo(() => {
    return [
      { label: '연락 필요', value: summary.high_risk + summary.risk },
      { label: '관심 필요', value: summary.attention },
      { label: '정상 관리', value: summary.normal },
      { label: '보류/제외', value: summary.hold },
    ].filter(d => d.value > 0);
  }, [summary]);

  const statusHighlight = useMemo(() => {
    if (summary.high_risk + summary.risk > 0) return '연락 필요';
    if (summary.attention > 0) return '관심 필요';
    return '정상 관리';
  }, [summary]);

  const topTarget = priorityList[0] || assessments[0] || null;

  // Empty State (§6-8)
  if (assessments.length === 0) {
    return (
      <div className="bento-card bento-enter flex flex-col items-center justify-center text-center py-20 px-6">
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center mb-4"
          style={{ backgroundColor: 'var(--ztd-tint)', color: 'var(--ztd-accent-text)' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '28px' }} aria-hidden="true">
            upload_file
          </span>
        </div>
        <h2 className="text-[24px] leading-[32px] font-bold mb-2" style={{ color: 'var(--ztd-ink)' }}>
          거래 내역을 가져오면 뜸해진 거래처를 찾아드려요
        </h2>
        <p className="text-[16px] leading-[24px] mb-6 max-w-md" style={{ color: 'var(--ztd-muted)' }}>
          CSV 또는 XLSX 파일을 올리면 평소 발주 주기를 계산해 지금 연락할 거래처를 바로 정리해 드립니다.
        </p>
        <button
          onClick={onNavigateImport}
          className="h-[44px] px-6 rounded-full font-semibold text-[15px] inline-flex items-center gap-2 transition-opacity hover:opacity-90 cursor-pointer"
          style={{ backgroundColor: 'var(--ztd-ink)', color: 'var(--ztd-on-ink)' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }} aria-hidden="true">
            add
          </span>
          파일 가져오기
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Greeting Header (§3, §5) */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-2 bento-enter">
        <div>
          <h1
            className="text-[28px] sm:text-[32px] leading-[36px] sm:leading-[40px] font-bold tracking-tight"
            style={{ color: 'var(--ztd-ink)' }}
          >
            좋은 아침이에요, 대표님
          </h1>
          <div className="flex flex-wrap items-center gap-3 mt-1.5">
            <p className="text-[16px] leading-[24px]" style={{ color: 'var(--ztd-muted)' }}>
              오늘 연락할 거래처를 확인해보세요.
            </p>
            <span
              className="inline-flex items-center gap-1.5 text-[13px] font-medium px-2.5 py-0.5 rounded-full"
              style={{ backgroundColor: 'var(--ztd-panel)', border: '1px solid var(--ztd-line)', color: 'var(--ztd-muted)' }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '14px', color: 'var(--ztd-accent-text)' }} aria-hidden="true">
                shield_lock
              </span>
              이 기기 안에서 안전하게 처리 중
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={onNavigateImport}
            className="h-[44px] px-4 rounded-full font-semibold text-[14px] inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            style={{
              backgroundColor: 'var(--ztd-panel)',
              border: '1px solid var(--ztd-line)',
              color: 'var(--ztd-ink)',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }} aria-hidden="true">
              upload_file
            </span>
            <span>파일 가져오기</span>
          </button>

          {topTarget && (
            <button
              onClick={() => onOpenCustomer(topTarget.customer_key)}
              className="h-[44px] px-5 rounded-full font-semibold text-[14px] inline-flex items-center gap-2 transition-opacity hover:opacity-90 cursor-pointer"
              style={{ backgroundColor: 'var(--ztd-ink)', color: 'var(--ztd-on-ink)' }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }} aria-hidden="true">
                edit_note
              </span>
              <span>문안 만들기</span>
            </button>
          )}
        </div>
      </div>

      {/* Recency Warning if applicable */}
      {recencyWarning && (
        <div
          className="bento-card flex items-center gap-3 py-3.5 px-5 bento-enter"
          style={{ backgroundColor: 'var(--status-attention-bg)', borderColor: 'transparent' }}
        >
          <span className="material-symbols-outlined shrink-0" style={{ color: 'var(--status-attention-text)' }} aria-hidden="true">
            schedule
          </span>
          <p className="text-[14px] leading-[20px] font-medium" style={{ color: 'var(--status-attention-text)' }}>
            최근 거래일(<span className="font-mono">{recencyWarning.maxDate}</span>)과 기준일(
            <span className="font-mono">{refDate}</span>)의 차이가 {recencyWarning.diffDays}일이에요. 설정에서 기준일을 조정할 수 있어요.
          </p>
        </div>
      )}

      {/* Top Bento Row: 2x2 KPIs (5 cols) + BarChart (7 cols) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        {/* 2x2 KPI Bento */}
        <div className="xl:col-span-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Card 1: THE ONE HIGHLIGHT CARD (§6-1) */}
          <button
            type="button"
            onClick={onNavigatePriorityList}
            className="bento-card bento-enter text-left flex flex-col justify-between transition-transform hover:-translate-y-0.5 cursor-pointer"
            style={{
              backgroundColor: 'var(--ztd-accent)',
              borderColor: 'var(--ztd-accent)',
              color: 'var(--ztd-on-accent)',
              animationDelay: '0ms',
            }}
          >
            <div className="flex items-center justify-between gap-2 w-full">
              <span className="text-[14px] font-semibold opacity-90">연락 필요 거래처</span>
              <span
                className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                style={{ backgroundColor: 'rgba(20, 23, 27, 0.1)' }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }} aria-hidden="true">
                  arrow_outward
                </span>
              </span>
            </div>
            <div className="my-3">
              <div className="text-[32px] leading-[40px] font-bold tabular-nums">
                {priorityList.length}곳
              </div>
            </div>
            <div className="text-[13px] leading-[16px] font-medium opacity-85">
              고위험 {summary.high_risk} · 위험 {summary.risk} · 관심 {summary.attention}
            </div>
          </button>

          {/* Card 2: Total Customers */}
          <button
            type="button"
            onClick={onNavigateCustomers}
            className="bento-card bento-enter text-left flex flex-col justify-between transition-colors hover:border-[var(--ztd-neutral-strong)] cursor-pointer"
            style={{ animationDelay: '40ms' }}
          >
            <div className="flex items-center justify-between gap-2 w-full">
              <span className="text-[14px] font-medium" style={{ color: 'var(--ztd-muted)' }}>
                전체 거래처
              </span>
              <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--ztd-muted)' }} aria-hidden="true">
                domain
              </span>
            </div>
            <div className="my-3">
              <div className="text-[32px] leading-[40px] font-bold tabular-nums" style={{ color: 'var(--ztd-ink)' }}>
                {assessments.length}곳
              </div>
            </div>
            <div className="text-[13px] leading-[16px]" style={{ color: 'var(--ztd-muted)' }}>
              정상 {summary.normal}곳 · 보류 {summary.hold}곳
            </div>
          </button>

          {/* Card 3: Drafts Pending */}
          <div
            className="bento-card bento-enter flex flex-col justify-between"
            style={{ animationDelay: '80ms' }}
          >
            <div className="flex items-center justify-between gap-2 w-full">
              <span className="text-[14px] font-medium" style={{ color: 'var(--ztd-muted)' }}>
                문안 작성 대기
              </span>
              <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--ztd-muted)' }} aria-hidden="true">
                drafts
              </span>
            </div>
            <div className="my-3">
              <div className="text-[32px] leading-[40px] font-bold tabular-nums" style={{ color: 'var(--ztd-ink)' }}>
                {pendingDraftCount}곳
              </div>
            </div>
            <div className="flex items-center">
              <StatusBadge status="in_progress" label={pendingDraftCount > 0 ? '초안 준비 필요' : '준비 완료'} />
            </div>
          </div>

          {/* Card 4: Contacted this cycle */}
          <div
            className="bento-card bento-enter flex flex-col justify-between"
            style={{ animationDelay: '120ms' }}
          >
            <div className="flex items-center justify-between gap-2 w-full">
              <span className="text-[14px] font-medium" style={{ color: 'var(--ztd-muted)' }}>
                이번 달 연락 완료
              </span>
              <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--ztd-muted)' }} aria-hidden="true">
                task_alt
              </span>
            </div>
            <div className="my-3">
              <div className="text-[32px] leading-[40px] font-bold tabular-nums" style={{ color: 'var(--ztd-ink)' }}>
                {completedCount}곳
              </div>
            </div>
            <div className="flex items-center">
              <StatusBadge status="contacted" label={`목표 ${weeklyGoal}곳 중 ${goalPct}%`} />
            </div>
          </div>
        </div>

        {/* Chart Card: Gap comparison */}
        <div className="xl:col-span-7 ztd-chart-wrapper bento-enter" style={{ animationDelay: '80ms' }}>
          <ChartCard
            number="01"
            title="연락이 뜸해진 거래처 공백 비교"
            subtitle="우선 확인이 필요한 거래처의 최근 미접촉 기간"
            takeaway={gapTakeaway(priorityList)}
            accent="공백"
            level="basic"
            replay
          >
            {gapChartData.length > 0 ? (
              <BarChart
                data={gapChartData}
                x="name"
                y="gap_days"
                highlight={gapHighlight}
                unit="일"
                locale="ko-KR"
                height={240}
                annotations={[
                  {
                    type: 'line',
                    y: 30,
                    label: '기준 30일',
                  },
                ]}
              />
            ) : (
              <div className="h-[240px] flex items-center justify-center text-[14px]" style={{ color: 'var(--ztd-muted)' }}>
                표시할 지연 거래처가 없어요.
              </div>
            )}
          </ChartCard>
        </div>
      </div>

      {/* Middle Bento Row: Weekly Goal + Sub-blocks (5 cols) & Weekly Briefing + Donut (7 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left: Weekly Goal + Sub-list blocks + Donut */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          {/* Progress Card (§6-4) + Sub-list blocks (§6-5) */}
          <div className="bento-card bento-enter space-y-5" style={{ animationDelay: '120ms' }}>
            <div>
              <div className="flex items-center justify-between gap-2 mb-3">
                <h2 className="text-[16px] leading-[24px] font-semibold" style={{ color: 'var(--ztd-ink)' }}>
                  이번 주 연락 목표
                </h2>
                <span className="text-[14px] font-semibold tabular-nums" style={{ color: 'var(--ztd-accent-text)' }}>
                  {goalPct}%
                </span>
              </div>

              {/* Progress bar: 10px height, 999px radius */}
              <div
                className="w-full h-[10px] rounded-full overflow-hidden"
                style={{ backgroundColor: 'var(--ztd-neutral-soft)' }}
                role="progressbar"
                aria-valuenow={completedCount}
                aria-valuemin={0}
                aria-valuemax={weeklyGoal}
              >
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${goalPct}%`,
                    backgroundColor: goalReached ? 'var(--ztd-accent3)' : 'var(--ztd-accent)',
                  }}
                />
              </div>

              <div className="flex items-center justify-between mt-2.5 text-[14px] tabular-nums" style={{ color: 'var(--ztd-muted)' }}>
                <span>{completedCount}곳 연락 완료 / 목표 {weeklyGoal}곳</span>
                <span>{goalReached ? '목표 달성!' : `${Math.max(0, weeklyGoal - completedCount)}곳 남음`}</span>
              </div>
            </div>

            {/* Sub-list blocks (Wallets style 3-col mini cards inside --ztd-lift, 14px radius) */}
            <div className="grid grid-cols-3 gap-2.5">
              <div className="bento-sub p-3.5 flex flex-col justify-between gap-2">
                <span className="text-[13px] font-medium truncate" style={{ color: 'var(--ztd-muted)' }}>
                  불러온 원장
                </span>
                <div className="text-[14px] font-semibold truncate" style={{ color: 'var(--ztd-ink)' }} title={fileName}>
                  {fileName.replace(/\.(csv|xlsx|xls)$/i, '')}
                </div>
                <div className="inline-flex items-center gap-1.5 text-[12px] font-medium" style={{ color: 'var(--status-ok-text)' }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--ztd-accent3)' }} />
                  활성
                </div>
              </div>

              <div className="bento-sub p-3.5 flex flex-col justify-between gap-2">
                <span className="text-[13px] font-medium" style={{ color: 'var(--ztd-muted)' }}>
                  분석 기준일
                </span>
                <div className="text-[14px] font-semibold font-mono tabular-nums" style={{ color: 'var(--ztd-ink)' }}>
                  {refDate}
                </div>
                <div className="inline-flex items-center gap-1.5 text-[12px] font-medium" style={{ color: 'var(--ztd-muted)' }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--ztd-accent)' }} />
                  기준 적용
                </div>
              </div>

              <div className="bento-sub p-3.5 flex flex-col justify-between gap-2">
                <span className="text-[13px] font-medium" style={{ color: 'var(--ztd-muted)' }}>
                  정상 거래처
                </span>
                <div className="text-[14px] font-semibold tabular-nums" style={{ color: 'var(--ztd-ink)' }}>
                  {summary.normal}곳
                </div>
                <div className="inline-flex items-center gap-1.5 text-[12px] font-medium" style={{ color: 'var(--status-ok-text)' }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--ztd-accent3)' }} />
                  안정 주기
                </div>
              </div>
            </div>
          </div>

          {/* DonutChart Card */}
          <div className="ztd-chart-wrapper bento-enter" style={{ animationDelay: '160ms' }}>
            <ChartCard
              number="02"
              title="거래처 상태 분포"
              subtitle="평소 발주 주기 대비 최근 공백 비율"
              takeaway={`전체 ${assessments.length}곳 중 ${summary.risk + summary.high_risk}곳이 우선 연락 대상이에요.`}
              accent="분포"
              level="basic"
              replay
            >
              <DonutChart
                data={statusDonutData}
                label="label"
                value="value"
                highlight={statusHighlight}
                centerLabel="전체 거래처"
                unit="곳"
                locale="ko-KR"
                height={200}
              />
            </ChartCard>
          </div>
        </div>

        {/* Right: Weekly Briefing Card */}
        <div className="lg:col-span-7 bento-card bento-enter flex flex-col justify-between space-y-4" style={{ animationDelay: '160ms' }}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[16px] leading-[24px] font-semibold" style={{ color: 'var(--ztd-ink)' }}>
                이번 주 브리핑
              </h2>
              <p className="text-[14px] leading-[20px]" style={{ color: 'var(--ztd-muted)' }}>
                우선 연락 대상과 권장 소통 방식을 요약했어요
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => onGenerateBriefing(false)}
                disabled={isBriefingLoading}
                className="h-[40px] px-4 rounded-full font-semibold text-[14px] inline-flex items-center gap-1.5 transition-opacity hover:opacity-90 cursor-pointer disabled:opacity-50"
                style={{ backgroundColor: 'var(--ztd-ink)', color: 'var(--ztd-on-ink)' }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '17px' }} aria-hidden="true">
                  auto_awesome
                </span>
                <span>{isBriefingLoading ? '정리하는 중...' : '브리핑 생성'}</span>
              </button>
              <button
                onClick={() => onGenerateBriefing(true)}
                disabled={isBriefingLoading}
                className="h-[40px] px-3.5 rounded-full font-semibold text-[14px] inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                style={{
                  backgroundColor: 'var(--ztd-lift)',
                  border: '1px solid var(--ztd-line)',
                  color: 'var(--ztd-ink)',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '17px' }} aria-hidden="true">
                  sync
                </span>
                <span>새로 생성</span>
              </button>
            </div>
          </div>

          {briefing ? (
            <div className="space-y-3 flex-1">
              <div
                className="bento-sub p-4 flex flex-wrap items-center justify-between gap-2"
                style={{ borderLeft: '3px solid var(--ztd-accent)' }}
              >
                <h3 className="text-[16px] font-semibold" style={{ color: 'var(--ztd-ink)' }}>
                  {briefing.content.headline}
                </h3>
                <span className="status-badge status-badge--progress">
                  <span className="status-badge-dot" aria-hidden="true" />
                  {briefing.source === 'live'
                    ? `실시간 AI 응답 (${briefing.latency_ms ?? 0}ms${briefing.model ? ` · ${briefing.model}` : ''})`
                    : briefing.source === 'cache'
                    ? 'Liner Model API 응답(저장본)'
                    : '기본 템플릿'}
                </span>
              </div>

              <div className="space-y-2.5">
                {briefing.content.items.map((item, idx) => {
                  const cust = assessments.find(a => a.alias === item.id);
                  const dispName = cust ? cust.display_name : item.id;
                  return (
                    <div
                      key={idx}
                      onClick={() => cust && onOpenCustomer(cust.customer_key)}
                      className="bento-sub p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors hover:brightness-97 cursor-pointer"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[15px] font-semibold" style={{ color: 'var(--ztd-ink)' }}>
                            {dispName}
                          </span>
                          <span
                            className="text-[12px] font-mono px-2 py-0.5 rounded-full"
                            style={{ backgroundColor: 'var(--ztd-panel)', color: 'var(--ztd-muted)', border: '1px solid var(--ztd-line)' }}
                          >
                            {item.id}
                          </span>
                          {cust?.vip && <VipBadge />}
                        </div>
                        <p className="text-[14px] leading-[20px]" style={{ color: 'var(--ztd-muted)' }}>
                          {item.reason}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <StatusBadge
                          status="in_progress"
                          label={item.action === 'email' ? '이메일 권장' : '통화 권장'}
                        />
                        <span
                          className="text-[13px] font-medium px-2.5 py-1 rounded-full"
                          style={{ backgroundColor: 'var(--ztd-panel)', color: 'var(--ztd-muted)', border: '1px solid var(--ztd-line)' }}
                        >
                          {item.tone}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {briefing.content.caution && (
                <div className="flex items-center gap-2 pt-2 text-[14px]" style={{ color: 'var(--ztd-muted)' }}>
                  <span className="material-symbols-outlined shrink-0" style={{ fontSize: '18px' }} aria-hidden="true">
                    info
                  </span>
                  <span>{briefing.content.caution}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="bento-sub flex-1 flex flex-col items-center justify-center text-center p-8">
              <span className="material-symbols-outlined mb-2" style={{ fontSize: '32px', color: 'var(--ztd-muted)' }} aria-hidden="true">
                article
              </span>
              <p className="text-[15px] font-medium mb-1" style={{ color: 'var(--ztd-ink)' }}>
                이번 주 우선 연락 전략을 한눈에 정리해보세요
              </p>
              <p className="text-[14px] max-w-md" style={{ color: 'var(--ztd-muted)' }}>
                상단의 '브리핑 생성'을 누르면 거래 패턴을 종합해 연락 순서와 안부 어조를 제안해 드려요.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 질문하기 (Liner Model API) */}
      <QaPanel assessments={assessments} summary={summary} demoMode={demoMode} onOpenCustomer={onOpenCustomer} />

      {/* Bottom Bento: Priority Customers Quick Table */}
      <div className="bento-card bento-enter space-y-4" style={{ animationDelay: '200ms' }}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-[16px] leading-[24px] font-semibold" style={{ color: 'var(--ztd-ink)' }}>
              지금 연락할 거래처
            </h2>
            <p className="text-[14px] leading-[20px]" style={{ color: 'var(--ztd-muted)' }}>
              평소 발주 주기 대비 공백이 길어진 순서로 정리했어요
            </p>
          </div>
          <button
            onClick={onNavigateCustomers}
            className="h-[40px] px-4 rounded-full font-semibold text-[14px] inline-flex items-center gap-1 transition-colors cursor-pointer"
            style={{ backgroundColor: 'var(--ztd-lift)', color: 'var(--ztd-ink)' }}
          >
            <span>전체 목록 ({assessments.length}곳)</span>
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }} aria-hidden="true">
              arrow_forward
            </span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b" style={{ borderColor: 'var(--ztd-line)', color: 'var(--ztd-muted)' }}>
                <th className="py-3 px-3 text-[13px] font-semibold">거래처</th>
                <th className="py-3 px-3 text-[13px] font-semibold">마지막 거래일</th>
                <th className="py-3 px-3 text-[13px] font-semibold">미접촉 기간</th>
                <th className="py-3 px-3 text-[13px] font-semibold text-right">평균 거래액</th>
                <th className="py-3 px-3 text-[13px] font-semibold">상태</th>
                <th className="py-3 px-3 text-[13px] font-semibold text-right">빠른 작업</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: 'var(--ztd-line2)' }}>
              {(priorityList.length > 0 ? priorityList.slice(0, 5) : assessments.slice(0, 5)).map((a) => (
                <tr
                  key={a.customer_key}
                  onClick={() => onOpenCustomer(a.customer_key)}
                  className="group h-[52px] transition-colors hover:bg-[var(--ztd-lift)] cursor-pointer"
                >
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-bold shrink-0"
                        style={{ backgroundColor: 'var(--ztd-lift)', color: 'var(--ztd-ink)' }}
                      >
                        {a.display_name.slice(0, 1)}
                      </span>
                      <span className="text-[14px] font-semibold whitespace-nowrap" style={{ color: 'var(--ztd-ink)' }}>
                        {a.display_name}
                      </span>
                      {a.vip && <VipBadge />}
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-[14px] tabular-nums whitespace-nowrap" style={{ color: 'var(--ztd-muted)' }}>
                    {a.last_date.replace(/-/g, '. ')}.
                  </td>
                  <td className="py-2.5 px-3 text-[14px] font-semibold tabular-nums whitespace-nowrap" style={{ color: 'var(--ztd-ink)' }}>
                    {a.gap_days}일
                    {a.ratio ? (
                      <span className="ml-1.5 text-[13px] font-normal" style={{ color: 'var(--ztd-muted)' }}>
                        ({a.ratio}배)
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2.5 px-3 text-[14px] tabular-nums text-right whitespace-nowrap" style={{ color: 'var(--ztd-ink)' }}>
                    {a.avg_amount ? formatCurrency(a.avg_amount, { locale: 'ko-KR' }) : '-'}
                  </td>
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    <StatusBadge status={contactedKeys.has(a.customer_key) ? 'contacted' : a.status} />
                  </td>
                  <td className="py-2.5 px-3 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenCustomer(a.customer_key);
                      }}
                      className="h-[36px] px-3.5 rounded-full text-[13px] font-semibold inline-flex items-center gap-1 opacity-90 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 transition-opacity cursor-pointer"
                      style={{ backgroundColor: 'var(--ztd-panel)', border: '1px solid var(--ztd-line)', color: 'var(--ztd-ink)' }}
                    >
                      문안 만들기
                      <span className="material-symbols-outlined" style={{ fontSize: '15px' }} aria-hidden="true">
                        arrow_forward
                      </span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
