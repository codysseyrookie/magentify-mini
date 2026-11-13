import React, { useState } from 'react';
import { ColumnMapping, QualityResult } from '../types';
import { StatusBadge } from './StatusBadge';

interface ImportPageProps {
  fileName: string;
  rawRows: Record<string, string>[];
  headers: string[];
  mapping: ColumnMapping;
  quality: QualityResult | null;
  uploadError: string | null;
  onLoadDemo: () => void;
  onFileSelected: (file: File) => void;
  onMappingChange: (next: ColumnMapping) => void;
  onExecuteAnalysis: () => void;
}

export function ImportPage({
  fileName,
  rawRows,
  headers,
  mapping,
  quality,
  uploadError,
  onLoadDemo,
  onFileSelected,
  onMappingChange,
  onExecuteAnalysis,
}: ImportPageProps) {
  const [isDragging, setIsDragging] = useState(false);

  function handleDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      onFileSelected(file);
    }
  }

  const missingMappingMessage =
    rawRows.length > 0 && !mapping.customer
      ? '거래처 열을 찾지 못했어요. 아래에서 거래처 열 이름을 선택해주세요.'
      : rawRows.length > 0 && !mapping.date
      ? '날짜 열을 찾지 못했어요. 아래에서 거래일자 열 이름을 선택해주세요.'
      : null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bento-enter">
        <div>
          <h1 className="text-[24px] leading-[32px] font-bold" style={{ color: 'var(--ztd-ink)' }}>
            거래 내역 가져오기
          </h1>
          <p className="text-[14px] leading-[20px] mt-0.5" style={{ color: 'var(--ztd-muted)' }}>
            CSV 또는 XLSX 파일을 올리면 열 자동 매핑과 5종 데이터 품질 검사를 바로 실행해요
          </p>
        </div>

        <button
          type="button"
          onClick={onLoadDemo}
          className="h-[44px] px-5 rounded-full font-semibold text-[14px] inline-flex items-center gap-2 transition-colors cursor-pointer shrink-0"
          style={{
            backgroundColor: 'var(--ztd-panel)',
            border: '1px solid var(--ztd-line)',
            color: 'var(--ztd-ink)',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--ztd-accent-text)' }} aria-hidden="true">
            auto_awesome
          </span>
          데모 파일 불러오기 (126행)
        </button>
      </div>

      {/* Dropzone Card (§6-6) */}
      <div className="bento-card bento-enter space-y-3" style={{ animationDelay: '40ms' }}>
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className="flex flex-col items-center justify-center text-center py-12 px-6 cursor-pointer transition-colors"
          style={{
            border: `2px dashed ${isDragging ? 'var(--ztd-accent)' : 'var(--ztd-neutral-strong)'}`,
            borderRadius: '18px',
            backgroundColor: isDragging ? 'var(--ztd-tint)' : 'var(--ztd-lift)',
          }}
        >
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center mb-3"
            style={{ backgroundColor: 'var(--ztd-panel)', border: '1px solid var(--ztd-line)', color: 'var(--ztd-accent-text)' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '24px' }} aria-hidden="true">
              cloud_upload
            </span>
          </div>
          <p className="text-[16px] leading-[24px] font-semibold mb-1" style={{ color: 'var(--ztd-ink)' }}>
            CSV 또는 XLSX 파일을 끌어다 놓으세요
          </p>
          <p className="text-[14px] mb-5" style={{ color: 'var(--ztd-muted)' }}>
            최대 5,000행 · UTF-8 / CP949 인코딩 자동 지원
          </p>
          <span
            className="h-[44px] px-6 rounded-full font-semibold text-[14px] inline-flex items-center gap-2"
            style={{ backgroundColor: 'var(--ztd-ink)', color: 'var(--ztd-on-ink)' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }} aria-hidden="true">folder_open</span>
            파일 선택
          </span>
          <input
            type="file"
            accept=".csv,.xlsx,.xls,.txt"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onFileSelected(file);
            }}
            className="hidden"
          />
        </label>

        {/* Local processing privacy assurance (§7-7) */}
        <div className="flex items-center justify-center gap-1.5 text-[14px]" style={{ color: 'var(--ztd-muted)' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '16px', color: 'var(--ztd-accent-text)' }} aria-hidden="true">
            lock
          </span>
          <span>파일은 이 기기에서만 처리돼요</span>
        </div>

        {/* Helpful error line (§6-6) */}
        {(uploadError || missingMappingMessage) && (
          <div
            className="bento-sub px-4 py-3 flex items-center gap-2 text-[14px] font-medium"
            style={{ backgroundColor: 'var(--status-risk-bg)', color: 'var(--status-risk-text)' }}
          >
            <span className="material-symbols-outlined shrink-0" style={{ fontSize: '18px' }} aria-hidden="true">
              error_outline
            </span>
            <span>{uploadError || missingMappingMessage}</span>
          </div>
        )}
      </div>

      {/* Preview, Mapping & Quality Results */}
      {rawRows.length > 0 && (
        <div className="bento-card bento-enter space-y-6" style={{ animationDelay: '80ms' }}>
          {/* File Summary Row */}
          <div
            className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b"
            style={{ borderColor: 'var(--ztd-line)' }}
          >
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge status="in_progress" label={fileName} />
              <span className="text-[14px] tabular-nums" style={{ color: 'var(--ztd-muted)' }}>
                총 <strong style={{ color: 'var(--ztd-ink)' }}>{rawRows.length.toLocaleString()}행</strong> · {headers.length}개 열
              </span>
            </div>

            <button
              type="button"
              onClick={onExecuteAnalysis}
              disabled={!mapping.customer || !mapping.date}
              className="h-[44px] px-6 rounded-full font-semibold text-[14px] inline-flex items-center gap-2 transition-opacity hover:opacity-90 cursor-pointer disabled:opacity-40"
              style={{ backgroundColor: 'var(--ztd-accent)', color: 'var(--ztd-on-accent)' }}
            >
              <span>분석 결과 확인하기</span>
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }} aria-hidden="true">
                arrow_forward
              </span>
            </button>
          </div>

          {/* Column Auto Mapping Preview */}
          <div className="space-y-3">
            <div>
              <h2 className="text-[16px] font-semibold" style={{ color: 'var(--ztd-ink)' }}>
                열 자동 매핑 확인
              </h2>
              <p className="text-[14px]" style={{ color: 'var(--ztd-muted)' }}>
                자동으로 찾은 열 이름이에요. 다르면 직접 고칠 수 있어요.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-[13px] font-medium mb-1.5" style={{ color: 'var(--ztd-ink)' }}>
                  거래처 열 <span style={{ color: 'var(--status-risk-text)' }}>*</span>
                </label>
                <select
                  value={mapping.customer || ''}
                  onChange={(e) => onMappingChange({ ...mapping, customer: e.target.value || null })}
                  className="w-full h-[44px] rounded-full px-4 text-[14px]"
                  style={{ backgroundColor: 'var(--ztd-lift)', border: '1px solid var(--ztd-line)', color: 'var(--ztd-ink)' }}
                >
                  <option value="">선택해주세요</option>
                  {headers.map(h => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[13px] font-medium mb-1.5" style={{ color: 'var(--ztd-ink)' }}>
                  거래일자 열 <span style={{ color: 'var(--status-risk-text)' }}>*</span>
                </label>
                <select
                  value={mapping.date || ''}
                  onChange={(e) => onMappingChange({ ...mapping, date: e.target.value || null })}
                  className="w-full h-[44px] rounded-full px-4 text-[14px]"
                  style={{ backgroundColor: 'var(--ztd-lift)', border: '1px solid var(--ztd-line)', color: 'var(--ztd-ink)' }}
                >
                  <option value="">선택해주세요</option>
                  {headers.map(h => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[13px] font-medium mb-1.5" style={{ color: 'var(--ztd-muted)' }}>
                  금액 열 (선택)
                </label>
                <select
                  value={mapping.amount || ''}
                  onChange={(e) => onMappingChange({ ...mapping, amount: e.target.value || null })}
                  className="w-full h-[44px] rounded-full px-4 text-[14px]"
                  style={{ backgroundColor: 'var(--ztd-lift)', border: '1px solid var(--ztd-line)', color: 'var(--ztd-ink)' }}
                >
                  <option value="">(사용 안 함)</option>
                  {headers.map(h => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[13px] font-medium mb-1.5" style={{ color: 'var(--ztd-muted)' }}>
                  품목 열 (선택)
                </label>
                <select
                  value={mapping.item || ''}
                  onChange={(e) => onMappingChange({ ...mapping, item: e.target.value || null })}
                  className="w-full h-[44px] rounded-full px-4 text-[14px]"
                  style={{ backgroundColor: 'var(--ztd-lift)', border: '1px solid var(--ztd-line)', color: 'var(--ztd-ink)' }}
                >
                  <option value="">(사용 안 함)</option>
                  {headers.map(h => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Quality 5 Checks */}
          {quality && (
            <div className="space-y-4 pt-4 border-t" style={{ borderColor: 'var(--ztd-line)' }}>
              <h2 className="text-[16px] font-semibold" style={{ color: 'var(--ztd-ink)' }}>
                5종 품질 검사 결과
              </h2>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="bento-sub p-4 space-y-1">
                  <div className="text-[13px]" style={{ color: 'var(--ztd-muted)' }}>정상 거래</div>
                  <div className="text-[24px] font-bold tabular-nums" style={{ color: 'var(--status-ok-text)' }}>
                    {quality.counts.ok}행
                  </div>
                  <div className="text-[13px]" style={{ color: 'var(--ztd-muted)' }}>분석 반영</div>
                </div>
                <div className="bento-sub p-4 space-y-1">
                  <div className="text-[13px]" style={{ color: 'var(--ztd-muted)' }}>완전 중복</div>
                  <div className="text-[24px] font-bold tabular-nums" style={{ color: 'var(--status-attention-text)' }}>
                    {quality.counts.duplicate}건
                  </div>
                  <div className="text-[13px]" style={{ color: 'var(--ztd-muted)' }}>첫 행 유지</div>
                </div>
                <div className="bento-sub p-4 space-y-1">
                  <div className="text-[13px]" style={{ color: 'var(--ztd-muted)' }}>취소 후보</div>
                  <div className="text-[24px] font-bold tabular-nums" style={{ color: 'var(--status-risk-text)' }}>
                    {quality.counts.negative}건
                  </div>
                  <div className="text-[13px]" style={{ color: 'var(--ztd-muted)' }}>음수 제외</div>
                </div>
                <div className="bento-sub p-4 space-y-1">
                  <div className="text-[13px]" style={{ color: 'var(--ztd-muted)' }}>날짜 오류</div>
                  <div className="text-[24px] font-bold tabular-nums" style={{ color: 'var(--status-risk-text)' }}>
                    {quality.counts.invalid}건
                  </div>
                  <div className="text-[13px]" style={{ color: 'var(--ztd-muted)' }}>분석 제외</div>
                </div>
                <div className="bento-sub p-4 space-y-1">
                  <div className="text-[13px]" style={{ color: 'var(--ztd-muted)' }}>미래 날짜</div>
                  <div className="text-[24px] font-bold tabular-nums" style={{ color: 'var(--ztd-ink)' }}>
                    {quality.counts.future}건
                  </div>
                  <div className="text-[13px]" style={{ color: 'var(--ztd-muted)' }}>기준일 이후</div>
                </div>
              </div>

              {/* Excluded Issues */}
              {quality.issues.length > 0 && (
                <div className="bento-sub p-4 space-y-2.5">
                  <div className="text-[14px] font-semibold" style={{ color: 'var(--ztd-ink)' }}>
                    제외된 행 ({quality.issues.length}건)
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b" style={{ borderColor: 'var(--ztd-line)', color: 'var(--ztd-muted)' }}>
                          <th className="py-2 px-2 text-[13px] font-semibold">행</th>
                          <th className="py-2 px-2 text-[13px] font-semibold">거래처</th>
                          <th className="py-2 px-2 text-[13px] font-semibold">날짜</th>
                          <th className="py-2 px-2 text-[13px] font-semibold">사유</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y" style={{ borderColor: 'var(--ztd-line2)' }}>
                        {quality.issues.map((iss, i) => (
                          <tr key={i} className="h-[40px]">
                            <td className="py-1.5 px-2 text-[13px] font-mono tabular-nums" style={{ color: 'var(--ztd-muted)' }}>
                              {iss.source_row}
                            </td>
                            <td className="py-1.5 px-2 text-[14px] font-medium" style={{ color: 'var(--ztd-ink)' }}>
                              {iss.customer || '-'}
                            </td>
                            <td className="py-1.5 px-2 text-[13px] font-mono" style={{ color: 'var(--ztd-muted)' }}>
                              {iss.date || '-'}
                            </td>
                            <td className="py-1.5 px-2 text-[14px]" style={{ color: 'var(--status-risk-text)' }}>
                              {iss.reason}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Similar Customer Name Warnings */}
              {quality.similar_pairs.length > 0 && (
                <div className="space-y-2">
                  {quality.similar_pairs.map(([p1, p2], idx) => (
                    <div
                      key={idx}
                      className="bento-sub px-4 py-3 flex items-center gap-2 text-[14px]"
                      style={{ backgroundColor: 'var(--ztd-tint)', color: 'var(--ztd-accent-text)' }}
                    >
                      <span className="material-symbols-outlined shrink-0" style={{ fontSize: '18px' }} aria-hidden="true">
                        info
                      </span>
                      <span>
                        유사한 거래처 이름이 있어요: <strong>'{p1}'</strong> ↔ <strong>'{p2}'</strong> (원본 보존을 위해 자동 병합하지 않고 따로 분석해요)
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Top 5 Rows Preview */}
          <div className="space-y-2.5 pt-4 border-t" style={{ borderColor: 'var(--ztd-line)' }}>
            <h2 className="text-[16px] font-semibold" style={{ color: 'var(--ztd-ink)' }}>
              원본 데이터 미리보기 (상위 5행)
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b" style={{ borderColor: 'var(--ztd-line)', color: 'var(--ztd-muted)' }}>
                    {headers.map(h => (
                      <th key={h} className="py-2.5 px-3 text-[13px] font-semibold whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: 'var(--ztd-line2)' }}>
                  {rawRows.slice(0, 5).map((row, i) => (
                    <tr key={i} className="h-[44px]">
                      {headers.map(h => (
                        <td key={h} className="py-2 px-3 text-[14px] whitespace-nowrap" style={{ color: 'var(--ztd-ink)' }}>
                          {row[h] || '-'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
