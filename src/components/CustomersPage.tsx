import React, { useMemo, useState } from 'react';
import { Sparkline, formatCurrency } from 'ztd-charts';
import { Assessment, SummaryCounts, TouchpointRecord } from '../types';
import { StatusBadge, VipBadge } from './StatusBadge';

export type CustomerFilterType = 'all' | 'priority' | 'risk_only' | 'vip' | 'normal' | 'hold';

interface CustomersPageProps {
  assessments: Assessment[];
  priorityList: Assessment[];
  summary: SummaryCounts;
  statusFilter: CustomerFilterType;
  searchQuery: string;
  touchpoints: TouchpointRecord[];
  followupsList: TouchpointRecord[];
  onFilterChange: (filter: CustomerFilterType) => void;
  onSearchChange: (q: string) => void;
  onOpenCustomer: (customerKey: string) => void;
  onBulkCreateMessages: (customerKeys: string[]) => void;
  onToggleVip: (customerKey: string, displayName: string, nextVip: boolean, projectBased: boolean) => void;
  onToggleHold: (customerKey: string, displayName: string, vip: boolean, nextProjectBased: boolean) => void;
  onExportAnalysisCSV: () => void;
  onExportTouchpointsCSV: () => void;
}

export function CustomersPage({
  assessments,
  priorityList,
  summary,
  statusFilter,
  searchQuery,
  touchpoints,
  followupsList,
  onFilterChange,
  onSearchChange,
  onOpenCustomer,
  onBulkCreateMessages,
  onToggleVip,
  onToggleHold,
  onExportAnalysisCSV,
  onExportTouchpointsCSV,
}: CustomersPageProps) {
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [sortOrder, setSortOrder] = useState<'gap_desc' | 'priority' | 'ratio_desc'>('gap_desc');
  const [openMenuKey, setOpenMenuKey] = useState<string | null>(null);

  const contactedKeys = useMemo(() => {
    const s = new Set<string>();
    for (const t of touchpoints) {
      if (t.outcome !== 'on_hold' && t.outcome !== 'not_needed') {
        s.add(t.customer_key);
      }
    }
    return s;
  }, [touchpoints]);

  const filteredList = useMemo(() => {
    let list = [...assessments];

    if (statusFilter === 'priority') {
      list = [...priorityList];
    } else if (statusFilter === 'risk_only') {
      list = list.filter(a => a.status === 'risk' || a.status === 'high_risk');
    } else if (statusFilter === 'vip') {
      list = list.filter(a => a.vip);
    } else if (statusFilter === 'normal') {
      list = list.filter(a => a.status === 'normal');
    } else if (statusFilter === 'hold') {
      list = list.filter(a => a.status === 'hold');
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        a =>
          a.display_name.toLowerCase().includes(q) ||
          a.alias.toLowerCase().includes(q)
      );
    }

    if (sortOrder === 'gap_desc') {
      list.sort((a, b) => b.gap_days - a.gap_days);
    } else if (sortOrder === 'priority') {
      list.sort((a, b) => b.priority_score - a.priority_score || b.gap_days - a.gap_days);
    } else {
      list.sort((a, b) => (b.ratio ?? 0) - (a.ratio ?? 0));
    }

    return list;
  }, [assessments, priorityList, statusFilter, searchQuery, sortOrder]);

  const allVisibleSelected =
    filteredList.length > 0 && filteredList.every(a => selectedKeys.includes(a.customer_key));

  function toggleSelectAll() {
    if (allVisibleSelected) {
      setSelectedKeys([]);
    } else {
      setSelectedKeys(filteredList.map(a => a.customer_key));
    }
  }

  function toggleSelectOne(key: string) {
    setSelectedKeys(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  }

  const filterChips: { id: CustomerFilterType; label: string }[] = [
    { id: 'all', label: `전체 ${assessments.length}` },
    { id: 'priority', label: `연락 필요 ${priorityList.length}` },
    { id: 'risk_only', label: `이탈 위험 ${summary.risk + summary.high_risk}` },
    { id: 'vip', label: 'VIP' },
    { id: 'normal', label: `정상 ${summary.normal}` },
    { id: 'hold', label: `보류 ${summary.hold}` },
  ];

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bento-enter">
        <div>
          <h1 className="text-[24px] leading-[32px] font-bold" style={{ color: 'var(--ztd-ink)' }}>
            거래처 목록
          </h1>
          <p className="text-[14px] leading-[20px] mt-0.5" style={{ color: 'var(--ztd-muted)' }}>
            미접촉 기간이 긴 순서대로 확인하고 바로 연락 문안을 작성하세요
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onExportAnalysisCSV}
            className="h-[44px] px-4 rounded-full text-[14px] font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            style={{
              backgroundColor: 'var(--ztd-panel)',
              border: '1px solid var(--ztd-line)',
              color: 'var(--ztd-ink)',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }} aria-hidden="true">
              download
            </span>
            <span>CSV 내보내기</span>
          </button>
        </div>
      </div>

      {/* Main Recent-Activities Style Bento Card */}
      <div className="bento-card bento-enter space-y-4" style={{ animationDelay: '40ms' }}>
        {/* Search & Filter Toolbar */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 flex-1">
            {/* Full-round 44px search input */}
            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <span
                className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ fontSize: '18px', color: 'var(--ztd-muted)' }}
                aria-hidden="true"
              >
                search
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="거래처명 또는 식별자(C01) 검색"
                aria-label="거래처 검색"
                className="w-full h-[44px] rounded-full pl-10 pr-10 text-[14px] transition-colors"
                style={{
                  backgroundColor: 'var(--ztd-lift)',
                  border: '1px solid var(--ztd-line)',
                  color: 'var(--ztd-ink)',
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => onSearchChange('')}
                  aria-label="검색어 지우기"
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center hover:bg-[var(--ztd-neutral-soft)] cursor-pointer"
                  style={{ color: 'var(--ztd-muted)' }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>close</span>
                </button>
              )}
            </div>

            {/* Sort Select Pill */}
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as any)}
              aria-label="정렬 기준"
              className="h-[44px] px-4 rounded-full text-[14px] font-medium cursor-pointer"
              style={{
                backgroundColor: 'var(--ztd-lift)',
                border: '1px solid var(--ztd-line)',
                color: 'var(--ztd-ink)',
              }}
            >
              <option value="gap_desc">미접촉 기간순</option>
              <option value="priority">우선순위순</option>
              <option value="ratio_desc">주기 대비 배수순</option>
            </select>
          </div>

          {/* Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="거래처 상태 필터">
            {filterChips.map((chip) => {
              const active = statusFilter === chip.id;
              return (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => onFilterChange(chip.id)}
                  className="h-[36px] px-3.5 rounded-full text-[13px] font-semibold transition-colors cursor-pointer"
                  style={{
                    backgroundColor: active ? 'var(--ztd-ink)' : 'var(--ztd-lift)',
                    color: active ? 'var(--ztd-on-ink)' : 'var(--ztd-muted)',
                  }}
                >
                  {chip.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Bulk Action Bar when rows checked */}
        {selectedKeys.length > 0 && (
          <div
            className="bento-sub px-4 py-2.5 flex flex-wrap items-center justify-between gap-3"
            style={{ backgroundColor: 'var(--ztd-tint)' }}
          >
            <span className="text-[14px] font-semibold" style={{ color: 'var(--ztd-accent-text)' }}>
              {selectedKeys.length}곳 선택됨
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedKeys([])}
                className="h-[36px] px-3.5 rounded-full text-[13px] font-medium cursor-pointer"
                style={{ color: 'var(--ztd-muted)' }}
              >
                선택 해제
              </button>
              <button
                type="button"
                onClick={() => onBulkCreateMessages(selectedKeys)}
                className="h-[36px] px-4 rounded-full text-[13px] font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                style={{ backgroundColor: 'var(--ztd-ink)', color: 'var(--ztd-on-ink)' }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }} aria-hidden="true">
                  edit_note
                </span>
                선택한 {selectedKeys.length}곳 문안 만들기
              </button>
            </div>
          </div>
        )}

        {/* Desktop Table (>= 768px) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b" style={{ borderColor: 'var(--ztd-line)', color: 'var(--ztd-muted)' }}>
                <th className="py-3 px-2 w-10">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleSelectAll}
                    aria-label="전체 선택"
                    className="w-4 h-4 rounded cursor-pointer accent-[var(--ztd-ink)]"
                  />
                </th>
                <th className="py-3 px-3 text-[13px] font-semibold">거래처</th>
                <th className="py-3 px-3 text-[13px] font-semibold">간격 추세</th>
                <th className="py-3 px-3 text-[13px] font-semibold">마지막 거래일</th>
                <th className="py-3 px-3 text-[13px] font-semibold">미접촉 기간</th>
                <th className="py-3 px-3 text-[13px] font-semibold text-right">평균 거래액</th>
                <th className="py-3 px-3 text-[13px] font-semibold">상태</th>
                <th className="py-3 px-3 text-[13px] font-semibold text-right w-40">작업</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: 'var(--ztd-line2)' }}>
              {filteredList.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-[14px]" style={{ color: 'var(--ztd-muted)' }}>
                    조건에 맞는 거래처가 없어요. 검색어나 필터를 변경해 보세요.
                  </td>
                </tr>
              ) : (
                filteredList.map((a) => {
                  const isChecked = selectedKeys.includes(a.customer_key);
                  const isContacted = contactedKeys.has(a.customer_key);
                  const sparkData = [...a.intervals.slice(-6), a.gap_days].map((val, idx) => ({
                    x: idx + 1,
                    y: val,
                  }));

                  return (
                    <tr
                      key={a.customer_key}
                      onClick={() => onOpenCustomer(a.customer_key)}
                      className="group h-[52px] transition-colors cursor-pointer"
                      style={{
                        backgroundColor: isChecked ? 'var(--ztd-lift)' : undefined,
                      }}
                    >
                      <td className="py-2 px-2" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleSelectOne(a.customer_key)}
                          aria-label={`${a.display_name} 선택`}
                          className="w-4 h-4 rounded cursor-pointer accent-[var(--ztd-ink)]"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-2.5">
                          <span
                            className="w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-bold shrink-0"
                            style={{ backgroundColor: 'var(--ztd-lift)', color: 'var(--ztd-ink)' }}
                          >
                            {a.display_name.slice(0, 1)}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-[14px] font-semibold whitespace-nowrap" style={{ color: 'var(--ztd-ink)' }}>
                              {a.display_name}
                            </span>
                            {a.vip && <VipBadge />}
                          </div>
                        </div>
                      </td>
                      <td className="py-2 px-3 w-[108px]">
                        {sparkData.length >= 2 ? (
                          <div className="w-[84px] h-[28px] flex items-center">
                            <Sparkline
                              data={sparkData}
                              x="x"
                              y="y"
                              variant="area"
                              showValue={false}
                              width={84}
                              height={28}
                              tooltip={false}
                              locale="ko-KR"
                            />
                          </div>
                        ) : (
                          <span className="text-[13px]" style={{ color: 'var(--ztd-muted)' }}>-</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-[14px] tabular-nums whitespace-nowrap" style={{ color: 'var(--ztd-muted)' }}>
                        {a.last_date.replace(/-/g, '. ')}.
                      </td>
                      <td className="py-2 px-3 text-[14px] font-semibold tabular-nums whitespace-nowrap" style={{ color: 'var(--ztd-ink)' }}>
                        {a.gap_days}일
                        {a.ratio ? (
                          <span className="ml-1.5 text-[13px] font-normal" style={{ color: 'var(--ztd-muted)' }}>
                            ({a.ratio}배)
                          </span>
                        ) : null}
                      </td>
                      <td className="py-2 px-3 text-[14px] tabular-nums text-right whitespace-nowrap" style={{ color: 'var(--ztd-ink)' }}>
                        {a.avg_amount ? formatCurrency(a.avg_amount, { locale: 'ko-KR' }) : '-'}
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap">
                        <StatusBadge status={isContacted ? 'contacted' : a.status} />
                      </td>
                      <td className="py-2 px-3 text-right whitespace-nowrap relative" onClick={(e) => e.stopPropagation()}>
                        <div className="inline-flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => onOpenCustomer(a.customer_key)}
                            className="h-[34px] px-3 rounded-full text-[13px] font-semibold opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity cursor-pointer"
                            style={{
                              backgroundColor: 'var(--ztd-panel)',
                              border: '1px solid var(--ztd-line)',
                              color: 'var(--ztd-ink)',
                            }}
                          >
                            문안 만들기
                          </button>
                          <button
                            type="button"
                            onClick={() => setOpenMenuKey(openMenuKey === a.customer_key ? null : a.customer_key)}
                            aria-label={`${a.display_name} 추가 작업`}
                            className="w-9 h-9 rounded-full inline-flex items-center justify-center hover:bg-[var(--ztd-lift)] cursor-pointer"
                            style={{ color: 'var(--ztd-muted)' }}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>more_horiz</span>
                          </button>
                        </div>

                        {openMenuKey === a.customer_key && (
                          <div
                            className="floating-surface absolute right-3 top-12 z-20 w-44 rounded-2xl p-1.5 text-left"
                            role="menu"
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setOpenMenuKey(null);
                                onOpenCustomer(a.customer_key);
                              }}
                              className="w-full px-3 py-2 text-[13px] font-medium rounded-xl text-left hover:bg-[var(--ztd-lift)] flex items-center gap-2 cursor-pointer"
                              style={{ color: 'var(--ztd-ink)' }}
                            >
                              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>edit_note</span>
                              문안 작성 열기
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setOpenMenuKey(null);
                                onToggleVip(a.customer_key, a.display_name, !a.vip, a.project_based);
                              }}
                              className="w-full px-3 py-2 text-[13px] font-medium rounded-xl text-left hover:bg-[var(--ztd-lift)] flex items-center gap-2 cursor-pointer"
                              style={{ color: 'var(--ztd-ink)' }}
                            >
                              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>star</span>
                              {a.vip ? 'VIP 해제' : 'VIP 지정'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setOpenMenuKey(null);
                                onToggleHold(a.customer_key, a.display_name, a.vip, !a.project_based);
                              }}
                              className="w-full px-3 py-2 text-[13px] font-medium rounded-xl text-left hover:bg-[var(--ztd-lift)] flex items-center gap-2 cursor-pointer"
                              style={{ color: 'var(--ztd-ink)' }}
                            >
                              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>pause_circle</span>
                              {a.project_based ? '정기 분석 포함' : '보류/프로젝트성 전환'}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Card List (< 768px) */}
        <div className="md:hidden space-y-2.5">
          {filteredList.map((a) => {
            const isContacted = contactedKeys.has(a.customer_key);
            return (
              <div
                key={a.customer_key}
                onClick={() => onOpenCustomer(a.customer_key)}
                className="bento-sub p-4 space-y-3 cursor-pointer"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[15px] font-semibold" style={{ color: 'var(--ztd-ink)' }}>
                      {a.display_name}
                    </span>
                    {a.vip && <VipBadge />}
                  </div>
                  <StatusBadge status={isContacted ? 'contacted' : a.status} />
                </div>
                <div className="flex items-center justify-between text-[14px] tabular-nums" style={{ color: 'var(--ztd-muted)' }}>
                  <span>미접촉 {a.gap_days}일</span>
                  <span>{a.avg_amount ? formatCurrency(a.avg_amount, { locale: 'ko-KR' }) : '-'}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Follow-up Schedule Card */}
      <div className="bento-card bento-enter space-y-4" style={{ animationDelay: '80ms' }}>
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-[16px] leading-[24px] font-semibold" style={{ color: 'var(--ztd-ink)' }}>
              후속 조치 예정 현황
            </h2>
            <p className="text-[14px] leading-[20px]" style={{ color: 'var(--ztd-muted)' }}>
              문안 발송 후 지정한 다음 연락 예정일 목록이에요
            </p>
          </div>
          {followupsList.length > 0 && (
            <button
              type="button"
              onClick={onExportTouchpointsCSV}
              className="h-[38px] px-3.5 rounded-full text-[13px] font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              style={{
                backgroundColor: 'var(--ztd-lift)',
                border: '1px solid var(--ztd-line)',
                color: 'var(--ztd-ink)',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>download</span>
              접촉 이력 CSV
            </button>
          )}
        </div>

        {followupsList.length === 0 ? (
          <div className="bento-sub p-6 text-center text-[14px]" style={{ color: 'var(--ztd-muted)' }}>
            아직 등록된 후속 조치 일정이 없어요. 문안 화면에서 연락 결과를 기록하면 이곳에 표시됩니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b" style={{ borderColor: 'var(--ztd-line)', color: 'var(--ztd-muted)' }}>
                  <th className="py-2.5 px-3 text-[13px] font-semibold">거래처</th>
                  <th className="py-2.5 px-3 text-[13px] font-semibold">상태</th>
                  <th className="py-2.5 px-3 text-[13px] font-semibold">다음 연락일</th>
                  <th className="py-2.5 px-3 text-[13px] font-semibold">최근 접촉</th>
                  <th className="py-2.5 px-3 text-[13px] font-semibold">메모</th>
                  <th className="py-2.5 px-3 text-[13px] font-semibold text-right">열기</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: 'var(--ztd-line2)' }}>
                {followupsList.map((fu) => {
                  const channelText = fu.channel === 'email' ? '이메일' : fu.channel === 'phone' ? '전화' : '기타';
                  const outcomeText =
                    {
                      planned: '연락 예정',
                      contacted: '연락 완료',
                      waiting_reply: '회신 대기',
                      quote_requested: '견적 요청',
                      reorder_confirmed: '재주문 확인',
                      on_hold: '거래 보류',
                      not_needed: '연락 불필요',
                    }[fu.outcome] || fu.outcome;

                  return (
                    <tr
                      key={fu.id}
                      onClick={() => onOpenCustomer(fu.customer_key)}
                      className="h-[52px] hover:bg-[var(--ztd-lift)] cursor-pointer transition-colors"
                    >
                      <td className="py-2.5 px-3 text-[14px] font-semibold" style={{ color: 'var(--ztd-ink)' }}>
                        {fu.display_name}
                      </td>
                      <td className="py-2.5 px-3">
                        <StatusBadge
                          status={fu.followup_status === '후속 조치 필요' ? 'followup_due' : 'followup_planned'}
                        />
                      </td>
                      <td className="py-2.5 px-3 text-[14px] font-mono tabular-nums font-medium" style={{ color: 'var(--ztd-ink)' }}>
                        {fu.next_contact_date}
                      </td>
                      <td className="py-2.5 px-3 text-[14px]" style={{ color: 'var(--ztd-muted)' }}>
                        {channelText} · {outcomeText}
                      </td>
                      <td className="py-2.5 px-3 text-[14px] max-w-xs truncate" style={{ color: 'var(--ztd-muted)' }}>
                        {fu.note || '-'}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <span className="text-[13px] font-semibold" style={{ color: 'var(--ztd-accent-text)' }}>
                          상세 보기
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
