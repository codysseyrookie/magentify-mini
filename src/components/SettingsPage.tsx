import React, { useState } from 'react';
import { StatusBadge } from './StatusBadge';
import { ApiUsagePanel } from './ApiUsagePanel';

interface SettingsPageProps {
  refDate: string;
  weeklyGoal: number;
  demoMode: boolean;
  themeMode: 'light' | 'dark';
  serverLlmStatus: { configured: boolean; provider: string };
  onRefDateChange: (d: string) => void;
  onWeeklyGoalChange: (n: number) => void;
  onDemoModeChange: (v: boolean) => void;
  onThemeModeChange: (t: 'light' | 'dark') => void;
  onExportAnalysisCSV: () => void;
  onExportTouchpointsCSV: () => void;
  onResetDemo: () => void;
}

export function SettingsPage({
  refDate,
  weeklyGoal,
  demoMode,
  themeMode,
  serverLlmStatus,
  onRefDateChange,
  onWeeklyGoalChange,
  onDemoModeChange,
  onThemeModeChange,
  onExportAnalysisCSV,
  onExportTouchpointsCSV,
  onResetDemo,
}: SettingsPageProps) {
  const [resetConfirmed, setResetConfirmed] = useState(false);

  return (
    <div className="space-y-4">
      <div className="bento-enter">
        <h1 className="text-[24px] leading-[32px] font-bold" style={{ color: 'var(--ztd-ink)' }}>
          설정
        </h1>
        <p className="text-[14px] leading-[20px] mt-0.5" style={{ color: 'var(--ztd-muted)' }}>
          분석 기준일, 목표 건수, 화면 테마와 데모 환경을 관리해요
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Analysis & Goal Settings */}
        <div className="lg:col-span-6 bento-card bento-enter space-y-5" style={{ animationDelay: '40ms' }}>
          <h2 className="text-[16px] leading-[24px] font-semibold" style={{ color: 'var(--ztd-ink)' }}>
            분석 및 목표 기준
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block text-[14px] font-medium mb-1.5" style={{ color: 'var(--ztd-ink)' }}>
                분석 기준일
              </label>
              <input
                type="date"
                value={refDate}
                onChange={(e) => onRefDateChange(e.target.value)}
                className="w-full h-[44px] rounded-full px-4 text-[14px] tabular-nums"
                style={{ backgroundColor: 'var(--ztd-lift)', border: '1px solid var(--ztd-line)', color: 'var(--ztd-ink)' }}
              />
              <p className="text-[13px] mt-1.5" style={{ color: 'var(--ztd-muted)' }}>
                기준일에 맞춰 거래처별 미접촉 기간과 주기 대비 배수가 다시 계산돼요.
              </p>
            </div>

            <div>
              <label className="block text-[14px] font-medium mb-1.5" style={{ color: 'var(--ztd-ink)' }}>
                이번 주 연락 목표 (곳)
              </label>
              <input
                type="number"
                min={1}
                max={50}
                value={weeklyGoal}
                onChange={(e) => onWeeklyGoalChange(Math.max(1, Number(e.target.value) || 1))}
                className="w-full h-[44px] rounded-full px-4 text-[14px] tabular-nums"
                style={{ backgroundColor: 'var(--ztd-lift)', border: '1px solid var(--ztd-line)', color: 'var(--ztd-ink)' }}
              />
            </div>
          </div>
        </div>

        {/* Appearance & AI Runtime */}
        <div className="lg:col-span-6 bento-card bento-enter space-y-5" style={{ animationDelay: '80ms' }}>
          <h2 className="text-[16px] leading-[24px] font-semibold" style={{ color: 'var(--ztd-ink)' }}>
            화면 테마 및 문안 엔진
          </h2>

          {/* Light / Dark Theme Switch */}
          <div className="bento-sub p-4 flex items-center justify-between gap-3">
            <div>
              <div className="text-[14px] font-semibold" style={{ color: 'var(--ztd-ink)' }}>화면 모드</div>
              <div className="text-[13px]" style={{ color: 'var(--ztd-muted)' }}>
                {themeMode === 'light' ? '라이트 모드 (기본 스카이)' : '다크 모드 (잉크 블랙 · 라임)'}
              </div>
            </div>
            <div
              className="inline-flex p-1 rounded-full"
              style={{ backgroundColor: 'var(--ztd-panel)', border: '1px solid var(--ztd-line)' }}
            >
              <button
                type="button"
                onClick={() => onThemeModeChange('light')}
                className="h-[34px] px-3.5 rounded-full text-[13px] font-semibold cursor-pointer"
                style={{
                  backgroundColor: themeMode === 'light' ? 'var(--ztd-ink)' : 'transparent',
                  color: themeMode === 'light' ? 'var(--ztd-on-ink)' : 'var(--ztd-muted)',
                }}
              >
                라이트
              </button>
              <button
                type="button"
                onClick={() => onThemeModeChange('dark')}
                className="h-[34px] px-3.5 rounded-full text-[13px] font-semibold cursor-pointer"
                style={{
                  backgroundColor: themeMode === 'dark' ? 'var(--ztd-ink)' : 'transparent',
                  color: themeMode === 'dark' ? 'var(--ztd-on-ink)' : 'var(--ztd-muted)',
                }}
              >
                다크
              </button>
            </div>
          </div>

          {/* Demo Mode Cache Switch */}
          <div className="bento-sub p-4 flex items-center justify-between gap-3">
            <div>
              <div className="text-[14px] font-semibold" style={{ color: 'var(--ztd-ink)' }}>데모 모드 (응답 캐시 우선)</div>
              <div className="text-[13px]" style={{ color: 'var(--ztd-muted)' }}>
                저장된 캐시 응답을 먼저 사용하고 필요할 때만 실시간 호출해요
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={demoMode}
              aria-label="데모 모드 전환"
              onClick={() => onDemoModeChange(!demoMode)}
              className="relative inline-flex h-7 w-12 shrink-0 rounded-full transition-colors cursor-pointer"
              style={{ backgroundColor: demoMode ? 'var(--ztd-ink)' : 'var(--ztd-neutral)' }}
            >
              <span
                className="inline-block h-5 w-5 rounded-full transition-transform mt-1"
                style={{
                  backgroundColor: 'var(--ztd-on-ink)',
                  transform: demoMode ? 'translateX(24px)' : 'translateX(4px)',
                }}
              />
            </button>
          </div>

          {/* Server LLM Status */}
          <div className="bento-sub p-4 flex items-center justify-between gap-3">
            <div>
              <div className="text-[14px] font-semibold" style={{ color: 'var(--ztd-ink)' }}>AI 문안 생성 엔진</div>
              <div className="text-[13px]" style={{ color: 'var(--ztd-muted)' }}>
                {serverLlmStatus.configured
                  ? `서버 연결 활성 (${serverLlmStatus.provider === 'gemini' ? 'Gemini 3.8 Flash' : 'Liner Model API'})`
                  : '안전한 검증 템플릿 & 캐시 모드'}
              </div>
            </div>
            <StatusBadge status={serverLlmStatus.configured ? 'contacted' : 'in_progress'} label={serverLlmStatus.configured ? '연결됨' : '로컬 템플릿'} />
          </div>
        </div>

        {/* Liner API 호출 현황 */}
        <ApiUsagePanel />

        {/* Export & Demo Reset */}
        <div className="lg:col-span-12 bento-card bento-enter flex flex-col md:flex-row md:items-center justify-between gap-4" style={{ animationDelay: '120ms' }}>
          <div className="space-y-1">
            <h2 className="text-[16px] leading-[24px] font-semibold" style={{ color: 'var(--ztd-ink)' }}>
              데이터 내보내기 및 시연 초기화
            </h2>
            <p className="text-[14px]" style={{ color: 'var(--ztd-muted)' }}>
              분석 결과와 접촉 기록을 CSV로 내려받거나 데모 데이터(126행) 상태로 되돌릴 수 있어요.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={onExportAnalysisCSV}
              className="h-[44px] px-4 rounded-full text-[14px] font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              style={{ backgroundColor: 'var(--ztd-lift)', border: '1px solid var(--ztd-line)', color: 'var(--ztd-ink)' }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>download</span>
              분석 결과 CSV
            </button>
            <button
              type="button"
              onClick={onExportTouchpointsCSV}
              className="h-[44px] px-4 rounded-full text-[14px] font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              style={{ backgroundColor: 'var(--ztd-lift)', border: '1px solid var(--ztd-line)', color: 'var(--ztd-ink)' }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>download</span>
              접촉 이력 CSV
            </button>
          </div>
        </div>

        {/* Demo Reset Confirmation Block */}
        <div className="lg:col-span-12 bento-card bento-enter flex flex-col sm:flex-row sm:items-center justify-between gap-4" style={{ animationDelay: '160ms' }}>
          <label className="inline-flex items-center gap-2.5 text-[14px] font-medium cursor-pointer" style={{ color: 'var(--ztd-ink)' }}>
            <input
              type="checkbox"
              checked={resetConfirmed}
              onChange={(e) => setResetConfirmed(e.target.checked)}
              className="w-4 h-4 rounded accent-[var(--ztd-ink)]"
            />
            <span>초기화 확인 (작성한 초안과 접촉 기록을 모두 지우고 기본 126행 데모 상태로 복원해요)</span>
          </label>

          <button
            type="button"
            disabled={!resetConfirmed}
            onClick={() => {
              onResetDemo();
              setResetConfirmed(false);
            }}
            className="h-[44px] px-5 rounded-full text-[14px] font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            style={{
              backgroundColor: resetConfirmed ? 'var(--status-risk-bg)' : 'var(--ztd-lift)',
              color: resetConfirmed ? 'var(--status-risk-text)' : 'var(--ztd-muted)',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>restart_alt</span>
            데모 리셋
          </button>
        </div>
      </div>
    </div>
  );
}
