import React, { useState, useEffect, useMemo } from 'react';
import {
  FileText,
  BarChart3,
  Building2,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Sparkles,
  RefreshCw,
  Copy,
  Check,
  Send,
  Phone,
  ArrowRight,
  ArrowLeft,
  Upload,
  Info,
  ShieldAlert,
  Star,
  Layers,
  ChevronRight,
  Filter,
  Trash2,
  Download,
  Mail,
  ExternalLink,
  Search,
  Key,
  X
} from 'lucide-react';
import {
  Assessment,
  CleanTransaction,
  ColumnMapping,
  QualityResult,
  BriefingContent,
  EmailDraftContent,
  CallGuideContent,
  DraftRecord,
  TouchpointRecord,
  LlmResult,
  AssessmentStatus
} from './types';
import { DEMO_CSV_DATA, parseCSV, parseExcelBuffer, downloadCSV } from './demoData';
import {
  suggestMapping,
  buildClean,
  analyze,
  prioritize,
  summarize,
  normalizeKey
} from './analysis';
import {
  generateBriefing,
  generateEmail,
  generateCallGuide,
  renderPlaceholders
} from './llm';
import {
  getFlags,
  setFlag,
  getSetting,
  setSetting,
  saveDraft,
  updateDraftText,
  latestDraft,
  addTouchpoint,
  listTouchpoints,
  getFollowups,
  resetDemo
} from './storage';

export default function App() {
  // Navigation
  const [page, setPage] = useState<'dashboard' | 'data' | 'customer'>('dashboard');

  // Global settings & parameters
  const [refDate, setRefDate] = useState<string>(() => getSetting('ref_date', '2026-11-30'));
  const [demoMode, setDemoMode] = useState<boolean>(true);
  const [apiKey, setApiKey] = useState<string>(() => getSetting('liner_api_key', ''));
  const [showKeyModal, setShowKeyModal] = useState<boolean>(false);
  const [tempApiKey, setTempApiKey] = useState<string>('');

  // Data state
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string>('demo_transactions.csv');
  const [mapping, setMapping] = useState<ColumnMapping>({
    customer: '거래처',
    date: '거래일자',
    amount: '금액',
    item: '품목',
  });
  const [quality, setQuality] = useState<QualityResult | null>(null);
  const [cleanRows, setCleanRows] = useState<CleanTransaction[]>([]);

  // Selected customer for Screen 3
  const [selectedKey, setSelectedKey] = useState<string>('대성정밀');

  // Customer Flags
  const [flags, setFlagsState] = useState(() => getFlags());

  // Briefing state
  const [briefing, setBriefing] = useState<LlmResult<BriefingContent> | null>(null);
  const [isBriefingLoading, setIsBriefingLoading] = useState<boolean>(false);

  // Customer Detail Screen States
  const [contactName, setContactName] = useState<string>('');
  const [currentEmailDraft, setCurrentEmailDraft] = useState<DraftRecord | null>(null);
  const [currentCallDraft, setCurrentCallDraft] = useState<DraftRecord | null>(null);
  const [emailSubject, setEmailSubject] = useState<string>('');
  const [emailBody, setEmailBody] = useState<string>('');
  const [isGeneratingEmail, setIsGeneratingEmail] = useState<boolean>(false);
  const [isGeneratingCall, setIsGeneratingCall] = useState<boolean>(false);
  const [copiedType, setCopiedType] = useState<string | null>(null);
  const [saveDraftFeedback, setSaveDraftFeedback] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'email' | 'call'>('email');

  // Touchpoint Form
  const [touchDate, setTouchDate] = useState<string>(refDate);
  const [touchChannel, setTouchChannel] = useState<'email' | 'phone' | 'other'>('email');
  const [touchOutcome, setTouchOutcome] = useState<TouchpointRecord['outcome']>('waiting_reply');
  const [touchNote, setTouchNote] = useState<string>('');
  const [hasNextDate, setHasNextDate] = useState<boolean>(true);
  const [nextContactDate, setNextContactDate] = useState<string>('2026-12-07');
  const [selectedDraftId, setSelectedDraftId] = useState<number | null>(null);
  const [touchSuccessMsg, setTouchSuccessMsg] = useState<string | null>(null);

  // Search & Filter state for Dashboard
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'priority' | 'risk_only' | 'vip' | 'normal' | 'hold'>('all');

  // Reset confirmation
  const [resetConfirmed, setResetConfirmed] = useState<boolean>(false);

  // Initial load of demo data
  useEffect(() => {
    loadDemoData(refDate);
  }, []);

  // Update touchDate when refDate changes
  useEffect(() => {
    setTouchDate(refDate);
  }, [refDate]);

  function loadDemoData(currentRefDate: string) {
    const { headers: parsedHeaders, rows: parsedRows } = parseCSV(DEMO_CSV_DATA);
    setHeaders(parsedHeaders);
    setRawRows(parsedRows);
    setFileName('demo_transactions.csv');

    const suggested = suggestMapping(parsedHeaders);
    const effectiveMapping = {
      customer: suggested.customer || '거래처',
      date: suggested.date || '거래일자',
      amount: suggested.amount || '금액',
      item: suggested.item || '품목',
    };
    setMapping(effectiveMapping);

    const q = buildClean(parsedRows, effectiveMapping, currentRefDate);
    setQuality(q);
    setCleanRows(q.clean_rows);
  }

  // Handle file upload supporting both CSV and XLSX / XLS
  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const lowerName = file.name.toLowerCase();
    setFileName(file.name);

    if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
      // Binary Excel Reader
      const reader = new FileReader();
      reader.onload = (event) => {
        const buffer = event.target?.result as ArrayBuffer;
        if (!buffer) return;
        try {
          const { headers: parsedHeaders, rows: parsedRows } = parseExcelBuffer(buffer);
          setHeaders(parsedHeaders);
          setRawRows(parsedRows);

          const suggested = suggestMapping(parsedHeaders);
          setMapping(suggested);

          if (suggested.customer && suggested.date) {
            const q = buildClean(parsedRows, suggested, refDate);
            setQuality(q);
            setCleanRows(q.clean_rows);
          }
        } catch (err: any) {
          alert(`엑셀 파일 처리 중 오류가 발생했습니다: ${err.message}`);
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      // CSV Reader
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        if (!text) return;

        const { headers: parsedHeaders, rows: parsedRows } = parseCSV(text);
        setHeaders(parsedHeaders);
        setRawRows(parsedRows);

        const suggested = suggestMapping(parsedHeaders);
        setMapping(suggested);

        try {
          if (suggested.customer && suggested.date) {
            const q = buildClean(parsedRows, suggested, refDate);
            setQuality(q);
            setCleanRows(q.clean_rows);
          }
        } catch (err: any) {
          console.error(err);
        }
      };
      reader.readAsText(file, 'utf-8');
    }
  }

  // Execute Analysis button in Data Registration screen
  function handleExecuteAnalysis() {
    if (!mapping.customer || !mapping.date) return;
    try {
      const q = buildClean(rawRows, mapping, refDate);
      setQuality(q);
      setCleanRows(q.clean_rows);
      setPage('dashboard');
    } catch (err: any) {
      alert(err.message || '분석 중 오류가 발생했습니다.');
    }
  }

  // Assessments computed from cleanRows, flags, refDate
  const assessments = useMemo(() => {
    return analyze(cleanRows, flags, refDate);
  }, [cleanRows, flags, refDate]);

  const summary = useMemo(() => {
    return summarize(assessments);
  }, [assessments]);

  const priorityList = useMemo(() => {
    return prioritize(assessments);
  }, [assessments]);

  // Filtered and searched assessments for Dashboard
  const displayedAssessments = useMemo(() => {
    let list = assessments;

    if (statusFilter === 'priority') {
      list = priorityList;
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
      list = list.filter(a =>
        a.display_name.toLowerCase().includes(q) ||
        a.alias.toLowerCase().includes(q)
      );
    }

    return list;
  }, [assessments, priorityList, statusFilter, searchQuery]);

  const customerNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const a of assessments) {
      map[a.customer_key] = a.display_name;
    }
    return map;
  }, [assessments]);

  const followupsList = useMemo(() => {
    return getFollowups(refDate, customerNameMap);
  }, [refDate, customerNameMap]);

  // Selected assessment object for Screen 3
  const currentAssessment = useMemo(() => {
    return assessments.find(a => a.customer_key === selectedKey) || assessments[0] || null;
  }, [assessments, selectedKey]);

  // Load existing drafts and touchpoints when selected customer changes
  useEffect(() => {
    if (!currentAssessment) return;
    const emDraft = latestDraft(currentAssessment.customer_key, 'email');
    setCurrentEmailDraft(emDraft);
    if (emDraft) {
      const subj = renderPlaceholders(emDraft.original_json?.subject || '', currentAssessment.display_name, contactName);
      const bdy = renderPlaceholders(emDraft.edited_text || emDraft.original_json?.body || '', currentAssessment.display_name, contactName);
      setEmailSubject(subj);
      setEmailBody(bdy);
    } else {
      setEmailSubject('');
      setEmailBody('');
    }

    const clDraft = latestDraft(currentAssessment.customer_key, 'call');
    setCurrentCallDraft(clDraft);
    setTouchSuccessMsg(null);
  }, [currentAssessment, contactName]);

  // Recency check banner
  const recencyWarning = useMemo(() => {
    if (!assessments.length) return null;
    const allDates = assessments.map(a => a.last_date).filter(Boolean);
    if (!allDates.length) return null;
    const maxDateStr = allDates.sort().reverse()[0];
    const ms1 = new Date(refDate + 'T00:00:00Z').getTime();
    const ms2 = new Date(maxDateStr + 'T00:00:00Z').getTime();
    const diffDays = Math.round((ms1 - ms2) / (1000 * 60 * 60 * 24));
    if (diffDays > 30) {
      return { maxDate: maxDateStr, diffDays };
    }
    return null;
  }, [assessments, refDate]);

  // Handlers for LLM Generation
  async function handleGenerateBriefing(forceLive: boolean = false) {
    setIsBriefingLoading(true);
    try {
      const res = await generateBriefing(priorityList, summary, { demoMode, forceLive, apiKey });
      setBriefing(res);
    } catch (e) {
      console.error(e);
    } finally {
      setIsBriefingLoading(false);
    }
  }

  async function handleGenerateEmailDraft(forceLive: boolean = false) {
    if (!currentAssessment) return;
    setIsGeneratingEmail(true);
    try {
      const res = await generateEmail(currentAssessment, { demoMode, forceLive, apiKey });
      const saved = saveDraft(currentAssessment.customer_key, 'email', res.source, res.content, refDate);
      setCurrentEmailDraft(saved);
      setEmailSubject(renderPlaceholders(res.content.subject, currentAssessment.display_name, contactName));
      setEmailBody(renderPlaceholders(res.content.body, currentAssessment.display_name, contactName));
    } catch (e) {
      console.error(e);
    } finally {
      setIsGeneratingEmail(false);
    }
  }

  async function handleGenerateCallGuide(forceLive: boolean = false) {
    if (!currentAssessment) return;
    setIsGeneratingCall(true);
    try {
      const res = await generateCallGuide(currentAssessment, { demoMode, forceLive, apiKey });
      const saved = saveDraft(currentAssessment.customer_key, 'call', res.source, res.content, refDate);
      setCurrentCallDraft(saved);
    } catch (e) {
      console.error(e);
    } finally {
      setIsGeneratingCall(false);
    }
  }

  function handleSaveEditedEmail() {
    if (!currentEmailDraft) return;
    updateDraftText(currentEmailDraft.id, emailBody);
    setSaveDraftFeedback('수정본이 저장되었습니다.');
    setTimeout(() => setSaveDraftFeedback(null), 3000);
  }

  function handleCopyText(text: string, type: string) {
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2500);
  }

  // Mailto and Gmail Web opener
  function handleOpenMailApp() {
    if (!emailSubject && !emailBody) return;
    const mailtoUrl = `mailto:?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
    window.location.href = mailtoUrl;
  }

  function handleOpenGmailWeb() {
    if (!emailSubject && !emailBody) return;
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
    window.open(gmailUrl, '_blank', 'noopener,noreferrer');
  }

  // Export CSV functions
  function handleExportAnalysisCSV() {
    let csv = '거래처명,식별자,상태,VIP여부,프로젝트성,최근거래일,공백일수,평소주기(일),주기대비배수,신뢰도,총거래일수,평균금액(원)\n';
    for (const a of assessments) {
      const statusMap = {
        high_risk: '고위험 후보',
        risk: '이탈 위험 후보',
        attention: '관심 필요',
        normal: '정상 관리',
        hold: '판단 보류',
      };
      csv += `"${a.display_name}","${a.alias}","${statusMap[a.status] || a.status}","${a.vip ? 'Y' : 'N'}","${a.project_based ? 'Y' : 'N'}","${a.last_date}",${a.gap_days},${a.median_interval ? Math.round(a.median_interval) : ''},${a.ratio || ''},"${a.confidence || ''}",${a.txn_days},${a.avg_amount || ''}\n`;
    }
    downloadCSV(`magentify_analysis_${refDate}.csv`, csv);
  }

  function handleExportTouchpointsCSV() {
    const list = getFollowups(refDate, customerNameMap);
    let csv = '거래처명,접촉일자,채널,결과,다음연락예정일,상태,접촉메모\n';
    for (const t of list) {
      const channelText = t.channel === 'email' ? '이메일' : t.channel === 'phone' ? '전화' : '기타';
      const outcomeText = {
        planned: '연락 예정',
        contacted: '연락 완료',
        waiting_reply: '회신 대기',
        quote_requested: '견적 요청',
        reorder_confirmed: '재주문 확인',
        on_hold: '거래 보류',
        not_needed: '연락 불필요',
      }[t.outcome] || t.outcome;

      csv += `"${t.display_name}","${t.contact_date}","${channelText}","${outcomeText}","${t.next_contact_date || ''}","${t.followup_status}","${(t.note || '').replace(/"/g, '""')}"\n`;
    }
    downloadCSV(`magentify_touchpoints_${refDate}.csv`, csv);
  }

  function handleSaveTouchpoint(e: React.FormEvent) {
    e.preventDefault();
    if (!currentAssessment) return;
    if (hasNextDate && nextContactDate && nextContactDate < touchDate) {
      alert('다음 연락일은 접촉 일자 이후여야 합니다.');
      return;
    }

    addTouchpoint({
      customer_key: currentAssessment.customer_key,
      draft_id: selectedDraftId,
      contact_date: touchDate,
      channel: touchChannel,
      outcome: touchOutcome,
      note: touchNote,
      next_contact_date: hasNextDate ? nextContactDate : null,
    });

    setTouchSuccessMsg(`접촉 기록이 성공적으로 저장되었습니다. (다음 연락일: ${hasNextDate && nextContactDate ? nextContactDate : '없음'})`);
    setTouchNote('');
  }

  function handleResetDemo() {
    resetDemo();
    setRefDate('2026-11-30');
    setSetting('ref_date', '2026-11-30');
    setFlagsState(getFlags());
    loadDemoData('2026-11-30');
    setBriefing(null);
    setResetConfirmed(false);
    setPage('dashboard');
  }

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-800 font-sans">
      {/* ------------------------------------------------------------- */}
      {/* SIDEBAR                                                       */}
      {/* ------------------------------------------------------------- */}
      <aside className="w-72 bg-white border-r border-slate-200 flex flex-col shrink-0">
        {/* Header / Logo */}
        <div className="p-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-xs">
              <svg width="24" height="24" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect width="48" height="48" rx="10" fill="#2563EB" />
                <path d="M14 34V20L24 14L34 20V34H14Z" fill="#93C5FD" />
                <path d="M20 34V26H28V34H20Z" fill="#1D4ED8" />
                <circle cx="34" cy="14" r="5" fill="#F59E0B" />
              </svg>
            </div>
            <div>
              <h1 className="font-extrabold text-slate-900 text-lg tracking-tight">Magentify Mini</h1>
              <p className="text-xs text-slate-500 font-medium">제조업 거래 주기 & 이상 감지</p>
            </div>
          </div>
        </div>

        {/* Sidebar Controls */}
        <div className="p-5 flex-1 space-y-6 overflow-y-auto">
          {/* LLM Status Badge & API Key Config */}
          <div className="space-y-2">
            {apiKey.trim() ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-emerald-800 text-xs font-bold">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Liner/Gemini API 연결됨</span>
                  </div>
                  <button
                    onClick={() => {
                      setTempApiKey(apiKey);
                      setShowKeyModal(true);
                    }}
                    className="text-[10px] text-emerald-700 underline font-semibold"
                  >
                    수정
                  </button>
                </div>
                <div className="text-[11px] text-emerald-700 mt-1 pl-6">
                  실시간 라이브 생성 활성화
                </div>
              </div>
            ) : (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-amber-800 text-xs font-bold">
                    <Info className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>기본 템플릿 (폴백 모드)</span>
                  </div>
                  <button
                    onClick={() => {
                      setTempApiKey('');
                      setShowKeyModal(true);
                    }}
                    className="text-[10px] text-amber-800 underline font-bold"
                  >
                    키 등록
                  </button>
                </div>
                <div className="text-[11px] text-amber-700 mt-1 pl-6">
                  API 키 없이도 안전하게 검증 동작
                </div>
              </div>
            )}
          </div>

          {/* Reference Date Picker */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              분석 기준일
            </label>
            <div className="relative">
              <input
                type="date"
                value={refDate}
                onChange={(e) => {
                  const val = e.target.value;
                  setRefDate(val);
                  setSetting('ref_date', val);
                }}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              기준일에 따라 거래처별 공백 일수와 배수가 재계산됩니다.
            </p>
          </div>

          {/* Demo Mode Toggle */}
          <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg">
            <div>
              <div className="text-xs font-bold text-slate-800">데모 모드</div>
              <div className="text-[11px] text-slate-500">응답 캐시 우선 활용</div>
            </div>
            <button
              type="button"
              onClick={() => setDemoMode(!demoMode)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                demoMode ? 'bg-blue-600' : 'bg-slate-300'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  demoMode ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Navigation Menu */}
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
              화면 바로가기
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setPage('dashboard')}
                className={`flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg text-xs font-bold transition-colors ${
                  page === 'dashboard'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                대시보드
              </button>
              <button
                onClick={() => setPage('data')}
                className={`flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg text-xs font-bold transition-colors ${
                  page === 'data'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                데이터 등록
              </button>
            </div>
          </div>

          {/* Demo Reset Section */}
          <div className="pt-4 border-t border-slate-100">
            <div className="text-xs font-bold text-slate-700 mb-2">시연 환경 관리</div>
            <label className="flex items-center gap-2 text-xs text-slate-600 mb-3 cursor-pointer">
              <input
                type="checkbox"
                checked={resetConfirmed}
                onChange={(e) => setResetConfirmed(e.target.checked)}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span>초기화 확인 (접촉·초안 삭제)</span>
            </label>
            <button
              onClick={handleResetDemo}
              disabled={!resetConfirmed}
              className={`w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-bold transition-colors ${
                resetConfirmed
                  ? 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100'
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
              }`}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              데모 리셋 (126행)
            </button>
          </div>
        </div>

        {/* Footer info */}
        <div className="p-4 border-t border-slate-100 text-[11px] text-slate-400 text-center">
          Magentify Mini v1.2 · 로컬 에이전트
        </div>
      </aside>

      {/* ------------------------------------------------------------- */}
      {/* MAIN CONTENT AREA                                             */}
      {/* ------------------------------------------------------------- */}
      <main className="flex-1 overflow-y-auto p-8">
        {/* ========================================================= */}
        {/* SCREEN 1: DATA REGISTRATION                                */}
        {/* ========================================================= */}
        {page === 'data' && (
          <div className="max-w-6xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div>
                <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
                  <FileText className="w-7 h-7 text-blue-600" />
                  거래 데이터 등록 및 품질 검사
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                  CSV 또는 엑셀(XLSX/XLS) 거래 원장을 업로드하고 데이터 정합성과 품질 5종을 확인합니다.
                </p>
              </div>
            </div>

            {/* Actions Grid: Demo Load + File Upload */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col justify-between">
                <div>
                  <h3 className="font-bold text-slate-900 text-sm mb-1 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    데모 원클릭 불러오기
                  </h3>
                  <p className="text-xs text-slate-500 mb-4">
                    12개 가상 거래처의 126행 거래 내역(중복, 음수, 날짜 오류 포함)을 즉시 로드합니다.
                  </p>
                </div>
                <button
                  onClick={() => {
                    loadDemoData(refDate);
                    alert('데모 거래 데이터(126행)를 불러왔습니다.');
                  }}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors shadow-xs"
                >
                  <Upload className="w-4 h-4" />
                  데모 파일 불러오기 (126행)
                </button>
              </div>

              <div className="md:col-span-2 bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
                <h3 className="font-bold text-slate-900 text-sm mb-1 flex items-center gap-2">
                  <Upload className="w-4 h-4 text-blue-600" />
                  새 파일 업로드 (CSV 또는 XLSX / XLS 지원)
                </h3>
                <p className="text-xs text-slate-500 mb-3">
                  제조 거래 원장 엑셀 파일(`.xlsx`, `.xls`) 또는 `.csv` 파일을 드래그하여 바로 분석할 수 있습니다.
                </p>
                <label className="border-2 border-dashed border-slate-200 hover:border-blue-400 rounded-lg p-5 flex flex-col items-center justify-center cursor-pointer bg-slate-50 hover:bg-blue-50/40 transition-colors">
                  <Upload className="w-6 h-6 text-slate-400 mb-1" />
                  <span className="text-xs font-bold text-slate-700">파일 선택 (CSV 또는 XLSX 엑셀)</span>
                  <span className="text-[11px] text-slate-400 mt-0.5">최대 5,000행 자동 파싱 지원</span>
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls,.txt"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            {/* Current Loaded File Details */}
            {rawRows.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-6">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-4 text-xs font-semibold text-slate-600">
                    <span className="bg-blue-50 text-blue-800 border border-blue-200 px-2.5 py-1 rounded-md font-mono font-bold">
                      {fileName}
                    </span>
                    <span>총 행 수: <strong className="text-slate-900">{rawRows.length.toLocaleString()}행</strong></span>
                    <span>열 수: <strong className="text-slate-900">{headers.length}개</strong></span>
                  </div>
                </div>

                {/* Top 5 rows preview */}
                <div>
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2.5">
                    🔍 원본 데이터 상위 5행 미리보기
                  </h4>
                  <div className="overflow-x-auto border border-slate-200 rounded-lg">
                    <table className="w-full text-left text-xs text-slate-700">
                      <thead className="bg-slate-100 text-slate-600 border-b border-slate-200 font-bold">
                        <tr>
                          {headers.map(h => (
                            <th key={h} className="px-4 py-2.5">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono">
                        {rawRows.slice(0, 5).map((row, i) => (
                          <tr key={i} className="hover:bg-slate-50">
                            {headers.map(h => (
                              <td key={h} className="px-4 py-2 font-sans">{row[h] || '-'}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Column Mapping Section */}
                <div>
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2.5">
                    컬럼 자동 인식 및 매핑 확인
                  </h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-800 mb-1">
                        거래처 열 <span className="text-rose-500 font-normal">(필수)</span>
                      </label>
                      <select
                        value={mapping.customer || ''}
                        onChange={(e) => setMapping(prev => ({ ...prev, customer: e.target.value || null }))}
                        className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-medium focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">(선택 안 됨)</option>
                        {headers.map(h => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-800 mb-1">
                        거래일자 열 <span className="text-rose-500 font-normal">(필수)</span>
                      </label>
                      <select
                        value={mapping.date || ''}
                        onChange={(e) => setMapping(prev => ({ ...prev, date: e.target.value || null }))}
                        className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-medium focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">(선택 안 됨)</option>
                        {headers.map(h => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        금액 열 (선택)
                      </label>
                      <select
                        value={mapping.amount || ''}
                        onChange={(e) => setMapping(prev => ({ ...prev, amount: e.target.value || null }))}
                        className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-medium focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">(선택 안 됨)</option>
                        {headers.map(h => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        품목 열 (선택)
                      </label>
                      <select
                        value={mapping.item || ''}
                        onChange={(e) => setMapping(prev => ({ ...prev, item: e.target.value || null }))}
                        className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-medium focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">(선택 안 됨)</option>
                        {headers.map(h => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Quality Result Cards */}
                {quality && (
                  <div className="space-y-4 pt-3 border-t border-slate-100">
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      품질 검사 결과 (5종 검증)
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
                        <div className="text-xs font-bold text-emerald-800">정상 거래</div>
                        <div className="text-2xl font-black text-emerald-600 my-1">{quality.counts.ok}</div>
                        <div className="text-[11px] text-emerald-700">분석 반영 행</div>
                      </div>
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
                        <div className="text-xs font-bold text-amber-800">완전 중복</div>
                        <div className="text-2xl font-black text-amber-600 my-1">{quality.counts.duplicate}</div>
                        <div className="text-[11px] text-amber-700">첫 행만 유지</div>
                      </div>
                      <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-center">
                        <div className="text-xs font-bold text-rose-800">취소 후보 (음수)</div>
                        <div className="text-2xl font-black text-rose-600 my-1">{quality.counts.negative}</div>
                        <div className="text-[11px] text-rose-700">분석 제외</div>
                      </div>
                      <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 text-center">
                        <div className="text-xs font-bold text-indigo-800">날짜 변환 오류</div>
                        <div className="text-2xl font-black text-indigo-600 my-1">{quality.counts.invalid}</div>
                        <div className="text-[11px] text-indigo-700">분석 제외</div>
                      </div>
                      <div className="bg-slate-100 border border-slate-200 rounded-xl p-4 text-center">
                        <div className="text-xs font-bold text-slate-700">미래 날짜</div>
                        <div className="text-2xl font-black text-slate-600 my-1">{quality.counts.future}</div>
                        <div className="text-[11px] text-slate-500">분석 제외</div>
                      </div>
                    </div>

                    {/* Excluded issues table */}
                    {quality.issues.length > 0 && (
                      <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                        <div className="text-xs font-bold text-slate-800 mb-2 flex items-center gap-1.5">
                          <AlertTriangle className="w-4 h-4 text-amber-500" />
                          분석에서 제외된 행 목록 ({quality.issues.length}건)
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs text-slate-600">
                            <thead className="bg-slate-200/60 font-bold text-slate-700">
                              <tr>
                                <th className="px-3 py-1.5">행 번호</th>
                                <th className="px-3 py-1.5">거래처</th>
                                <th className="px-3 py-1.5">거래일자</th>
                                <th className="px-3 py-1.5">제외 사유</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200/50">
                              {quality.issues.map((iss, i) => (
                                <tr key={i} className="hover:bg-slate-100">
                                  <td className="px-3 py-1.5 font-mono">{iss.source_row}</td>
                                  <td className="px-3 py-1.5 font-semibold text-slate-800">{iss.customer || '-'}</td>
                                  <td className="px-3 py-1.5 font-mono">{iss.date || '-'}</td>
                                  <td className="px-3 py-1.5 text-rose-600 font-medium">{iss.reason}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Similar names warning */}
                    {quality.similar_pairs.length > 0 && (
                      <div className="space-y-2">
                        {quality.similar_pairs.map(([p1, p2], idx) => (
                          <div key={idx} className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-900 flex items-center gap-2">
                            <Info className="w-4 h-4 text-blue-600 shrink-0" />
                            <span>
                              유사 거래처명 감지: <strong>'{p1}'</strong> ↔ <strong>'{p2}'</strong> (원장 표기 차이일 수 있으나 원본 무결성을 위해 개별 분석을 진행합니다)
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Execute Button */}
                <div className="pt-2">
                  <button
                    onClick={handleExecuteAnalysis}
                    disabled={!mapping.customer || !mapping.date}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-extrabold text-sm py-3 px-6 rounded-xl flex items-center justify-center gap-2 transition-colors shadow-xs"
                  >
                    <span>🚀 분석 실행 및 대시보드로 이동</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* SCREEN 2: DASHBOARD                                        */}
        {/* ========================================================= */}
        {page === 'dashboard' && (
          <div className="max-w-6xl mx-auto space-y-6">
            {/* Recency warning */}
            {recencyWarning && (
              <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 flex items-center gap-3 text-amber-900 text-xs">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                <div>
                  <strong>데이터가 오래되었습니다:</strong> 파일 내 최신 거래일(
                  <span className="font-mono">{recencyWarning.maxDate}</span>)과 분석 기준일(
                  <span className="font-mono">{refDate}</span>)의 차이가 {recencyWarning.diffDays}일입니다.
                </div>
              </div>
            )}

            {/* Top Dashboard Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-200 gap-3">
              <div>
                <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
                  <BarChart3 className="w-7 h-7 text-blue-600" />
                  거래처 주문 주기 & 이탈 위험 대시보드
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  분석 기준일: <strong className="text-slate-800">{refDate}</strong> · 총 관리 거래처: <strong className="text-slate-800">{assessments.length}곳</strong>
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportAnalysisCSV}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 px-3 py-2 rounded-lg transition-colors border border-slate-200 shadow-xs"
                >
                  <Download className="w-3.5 h-3.5 text-blue-600" />
                  분석 결과 CSV 다운로드
                </button>
                <button
                  onClick={() => setPage('data')}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-2 rounded-lg transition-colors border border-blue-200"
                >
                  <Layers className="w-3.5 h-3.5" />
                  데이터 다시 올리기
                </button>
              </div>
            </div>

            {/* 5 Summary Metric Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div
                onClick={() => setStatusFilter(statusFilter === 'normal' ? 'all' : 'normal')}
                className={`cursor-pointer bg-white border rounded-xl p-4 shadow-xs text-center border-t-4 border-t-emerald-500 transition-all ${
                  statusFilter === 'normal' ? 'ring-2 ring-emerald-500 border-emerald-500' : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="text-xs font-bold text-slate-500">정상 관리</div>
                <div className="text-3xl font-black text-emerald-600 my-1">{summary.normal}</div>
                <div className="text-[11px] text-slate-400">정기 범위 (≤1.5배)</div>
              </div>

              <div
                onClick={() => setStatusFilter(statusFilter === 'risk_only' ? 'all' : 'risk_only')}
                className={`cursor-pointer bg-white border rounded-xl p-4 shadow-xs text-center border-t-4 border-t-amber-500 transition-all ${
                  statusFilter === 'risk_only' ? 'ring-2 ring-amber-500 border-amber-500' : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="text-xs font-bold text-slate-500">관심 필요</div>
                <div className="text-3xl font-black text-amber-600 my-1">{summary.attention}</div>
                <div className="text-[11px] text-slate-400">흐름 확인 (1.5~2.0배)</div>
              </div>

              <div
                onClick={() => setStatusFilter(statusFilter === 'risk_only' ? 'all' : 'risk_only')}
                className={`cursor-pointer bg-white border rounded-xl p-4 shadow-xs text-center border-t-4 border-t-rose-500 transition-all ${
                  statusFilter === 'risk_only' ? 'ring-2 ring-rose-500 border-rose-500' : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="text-xs font-bold text-slate-500">이탈 위험 후보</div>
                <div className="text-3xl font-black text-rose-600 my-1">{summary.risk}</div>
                <div className="text-[11px] text-slate-400">우선 연락 (2.0~3.0배)</div>
              </div>

              <div
                onClick={() => setStatusFilter(statusFilter === 'risk_only' ? 'all' : 'risk_only')}
                className={`cursor-pointer bg-white border rounded-xl p-4 shadow-xs text-center border-t-4 border-t-purple-600 transition-all ${
                  statusFilter === 'risk_only' ? 'ring-2 ring-purple-600 border-purple-600' : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="text-xs font-bold text-slate-500">고위험 후보</div>
                <div className="text-3xl font-black text-purple-600 my-1">{summary.high_risk}</div>
                <div className="text-[11px] text-slate-400">대표 직접 확인 (≥3.0배)</div>
              </div>

              <div
                onClick={() => setStatusFilter(statusFilter === 'hold' ? 'all' : 'hold')}
                className={`cursor-pointer bg-white border rounded-xl p-4 shadow-xs text-center border-t-4 border-t-slate-400 transition-all ${
                  statusFilter === 'hold' ? 'ring-2 ring-slate-500 border-slate-500' : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="text-xs font-bold text-slate-500">판단 보류</div>
                <div className="text-3xl font-black text-slate-600 my-1">{summary.hold}</div>
                <div className="text-[11px] text-slate-400">데이터 부족/프로젝트성</div>
              </div>
            </div>

            {/* Weekly Briefing Card */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-blue-100 text-blue-700">
                    <FileText className="w-4 h-4" />
                  </div>
                  <h3 className="font-extrabold text-slate-900 text-base">이번 주 브리핑</h3>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleGenerateBriefing(false)}
                    disabled={isBriefingLoading}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-2 px-3.5 rounded-lg flex items-center gap-1.5 transition-colors shadow-xs"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{isBriefingLoading ? '작성 중...' : '이번 주 브리핑 생성'}</span>
                  </button>
                  <button
                    onClick={() => handleGenerateBriefing(true)}
                    disabled={isBriefingLoading}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs py-2 px-3 rounded-lg flex items-center gap-1.5 transition-colors border border-slate-200"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>새로 생성 (Live)</span>
                  </button>
                </div>
              </div>

              {/* Briefing Content Display */}
              {briefing ? (
                <div className="border-l-4 border-blue-600 pl-4 py-1 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-slate-900 text-sm">{briefing.content.headline}</h4>
                    <span className="text-[11px] font-semibold bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md border border-blue-200">
                      {briefing.source === 'live'
                        ? `Liner/Gemini API 응답 (${briefing.latency_ms || 500}ms)`
                        : briefing.source === 'cache'
                        ? 'Liner Model API 응답(저장본)'
                        : '기본 템플릿(폴백)'}
                    </span>
                  </div>

                  <div className="space-y-2">
                    {briefing.content.items.map((item, idx) => {
                      const cust = assessments.find(a => a.alias === item.id);
                      const dispName = cust ? cust.display_name : item.id;
                      return (
                        <div key={idx} className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-extrabold text-slate-900">{dispName}</span>
                              <span className="text-[10px] font-mono bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded">
                                {item.id}
                              </span>
                            </div>
                            <div className="text-slate-600 mt-1">{item.reason}</div>
                          </div>
                          <div className="shrink-0 flex items-center gap-1.5">
                            <span className="bg-indigo-50 text-indigo-700 border border-indigo-200 font-bold px-2 py-0.5 rounded text-[11px]">
                              {item.action === 'email' ? '✉️ 이메일 권장' : '📞 통화 권장'}
                            </span>
                            <span className="bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded text-[11px]">
                              {item.tone}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {briefing.content.caution && (
                    <div className="text-[11px] text-slate-400 pt-2 border-t border-dashed border-slate-200 flex items-center gap-1.5">
                      <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{briefing.content.caution}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-6 text-center text-xs text-slate-500">
                  위 <strong className="text-slate-700">"이번 주 브리핑 생성"</strong> 버튼을 누르면 Liner Model API가 거래 패턴 데이터를 종합하여 이번 주 우선 연락 대상과 안부 전략을 1페이지 브리핑으로 정리합니다.
                </div>
              )}
            </div>

            {/* Filter and Search Bar */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                {/* Search input */}
                <div className="relative flex-1 max-w-sm">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="거래처명 또는 식별자(C01...) 검색"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Filter pills */}
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="text-slate-400 mr-1 text-[11px] flex items-center gap-1">
                    <Filter className="w-3 h-3" /> 필터:
                  </span>
                  <button
                    onClick={() => setStatusFilter('all')}
                    className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                      statusFilter === 'all'
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                    }`}
                  >
                    전체 ({assessments.length})
                  </button>
                  <button
                    onClick={() => setStatusFilter('priority')}
                    className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                      statusFilter === 'priority'
                        ? 'bg-rose-600 text-white'
                        : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200'
                    }`}
                  >
                    우선 확인 ({priorityList.length})
                  </button>
                  <button
                    onClick={() => setStatusFilter('risk_only')}
                    className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                      statusFilter === 'risk_only'
                        ? 'bg-purple-600 text-white'
                        : 'bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200'
                    }`}
                  >
                    이탈위험 ({summary.risk + summary.high_risk})
                  </button>
                  <button
                    onClick={() => setStatusFilter('vip')}
                    className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                      statusFilter === 'vip'
                        ? 'bg-amber-600 text-white'
                        : 'bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200'
                    }`}
                  >
                    VIP만 보기
                  </button>
                  <button
                    onClick={() => setStatusFilter('normal')}
                    className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                      statusFilter === 'normal'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200'
                    }`}
                  >
                    정상 ({summary.normal})
                  </button>
                </div>
              </div>

              {/* Priority & Filtered Accounts Table */}
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-600 font-bold border-b border-slate-200">
                    <tr>
                      <th className="px-3.5 py-2.5 text-center w-12 whitespace-nowrap">순위</th>
                      <th className="px-4 py-2.5 whitespace-nowrap">거래처</th>
                      <th className="px-3.5 py-2.5 whitespace-nowrap">상태</th>
                      <th className="px-3.5 py-2.5 font-mono whitespace-nowrap">최근 거래일</th>
                      <th className="px-3.5 py-2.5 font-mono whitespace-nowrap">공백</th>
                      <th className="px-3.5 py-2.5 font-mono whitespace-nowrap">평소 간격</th>
                      <th className="px-3.5 py-2.5 font-mono whitespace-nowrap">배수</th>
                      <th className="px-3.5 py-2.5 whitespace-nowrap">신뢰도</th>
                      <th className="px-4 py-2.5 text-center w-36 min-w-[120px] whitespace-nowrap">조치</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {displayedAssessments.map((a, idx) => (
                      <tr key={a.customer_key} className="hover:bg-slate-50 transition-colors">
                        <td className="px-3.5 py-3 text-center font-bold text-slate-400 whitespace-nowrap">
                          {idx + 1}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-slate-900 text-sm whitespace-nowrap">{a.display_name}</span>
                            {a.vip && (
                              <span className="bg-amber-100 text-amber-800 border border-amber-300 text-[10px] font-extrabold px-1.5 py-0.2 rounded whitespace-nowrap">
                                VIP
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3.5 py-3 whitespace-nowrap">
                          {a.status === 'high_risk' && (
                            <span className="bg-purple-50 text-purple-800 border border-purple-200 font-bold px-2 py-0.5 rounded text-[11px] whitespace-nowrap">
                              고위험 후보
                            </span>
                          )}
                          {a.status === 'risk' && (
                            <span className="bg-rose-50 text-rose-800 border border-rose-200 font-bold px-2 py-0.5 rounded text-[11px] whitespace-nowrap">
                              이탈 위험 후보
                            </span>
                          )}
                          {a.status === 'attention' && (
                            <span className="bg-amber-50 text-amber-800 border border-amber-200 font-bold px-2 py-0.5 rounded text-[11px] whitespace-nowrap">
                              관심 필요
                            </span>
                          )}
                          {a.status === 'normal' && (
                            <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold px-2 py-0.5 rounded text-[11px] whitespace-nowrap">
                              정상 관리
                            </span>
                          )}
                          {a.status === 'hold' && (
                            <span className="bg-slate-100 text-slate-700 border border-slate-200 font-bold px-2 py-0.5 rounded text-[11px] whitespace-nowrap">
                              판단 보류
                            </span>
                          )}
                        </td>
                        <td className="px-3.5 py-3 font-mono text-slate-600 whitespace-nowrap">
                          {a.last_date}
                        </td>
                        <td className="px-3.5 py-3 font-mono text-rose-600 font-bold whitespace-nowrap">
                          {a.gap_days}일
                        </td>
                        <td className="px-3.5 py-3 font-mono text-slate-600 whitespace-nowrap">
                          {a.median_interval ? `${Math.round(a.median_interval)}일` : '-'}
                        </td>
                        <td className="px-3.5 py-3 font-mono font-black text-slate-900 whitespace-nowrap">
                          {a.ratio ? `${a.ratio}배` : '-'}
                        </td>
                        <td className="px-3.5 py-3 text-slate-600 whitespace-nowrap">
                          {a.confidence === 'high' ? '높음' : a.confidence === 'medium' ? '보통' : '-'}
                        </td>
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <button
                            onClick={() => {
                              setSelectedKey(a.customer_key);
                              setPage('customer');
                            }}
                            className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-1.5 px-3.5 rounded-lg inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors shadow-xs min-w-[96px]"
                          >
                            <span className="whitespace-nowrap">문안 준비</span>
                            <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Follow-up Schedule Table */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-sky-600" />
                  후속 조치 예정 현황
                </h3>
                {followupsList.length > 0 && (
                  <button
                    onClick={handleExportTouchpointsCSV}
                    className="text-xs text-slate-600 hover:text-slate-900 font-semibold flex items-center gap-1"
                  >
                    <Download className="w-3.5 h-3.5" /> CSV 내보내기
                  </button>
                )}
              </div>

              {followupsList.length === 0 ? (
                <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-5 text-center">
                  현재 등록된 후속 조치 일정이 없습니다. 거래처 상세 화면에서 접촉 기록 및 다음 연락일을 등록하세요.
                </div>
              ) : (
                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 text-slate-600 font-bold border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-2.5">거래처</th>
                        <th className="px-3.5 py-2.5">상태</th>
                        <th className="px-3.5 py-2.5 font-mono">다음 연락일</th>
                        <th className="px-3.5 py-2.5">최근 접촉</th>
                        <th className="px-4 py-2.5">메모</th>
                        <th className="px-4 py-2.5 text-center w-24">바로가기</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {followupsList.map(fu => {
                        const channelText = fu.channel === 'email' ? '이메일' : fu.channel === 'phone' ? '전화' : '기타';
                        const outcomeText = {
                          planned: '연락 예정',
                          contacted: '연락 완료',
                          waiting_reply: '회신 대기',
                          quote_requested: '견적 요청',
                          reorder_confirmed: '재주문 확인',
                          on_hold: '거래 보류',
                          not_needed: '연락 불필요',
                        }[fu.outcome] || fu.outcome;

                        return (
                          <tr key={fu.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-3 font-bold text-slate-900">
                              {fu.display_name}
                            </td>
                            <td className="px-3.5 py-3">
                              {fu.followup_status === '후속 조치 필요' ? (
                                <span className="bg-rose-100 text-rose-800 font-bold px-2 py-0.5 rounded text-[11px]">
                                  후속 조치 필요
                                </span>
                              ) : (
                                <span className="bg-sky-100 text-sky-800 font-bold px-2 py-0.5 rounded text-[11px]">
                                  예정
                                </span>
                              )}
                            </td>
                            <td className="px-3.5 py-3 font-mono font-bold text-slate-900">
                              {fu.next_contact_date}
                            </td>
                            <td className="px-3.5 py-3 text-slate-600">
                              {channelText} / {outcomeText}
                            </td>
                            <td className="px-4 py-3 text-slate-500 max-w-xs truncate">
                              {fu.note || '-'}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <button
                                onClick={() => {
                                  setSelectedKey(fu.customer_key);
                                  setPage('customer');
                                }}
                                className="text-blue-600 hover:text-blue-800 font-bold text-xs hover:underline"
                              >
                                상세 보기
                              </button>
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
        )}

        {/* ========================================================= */}
        {/* SCREEN 3: CUSTOMER DETAIL & MESSAGE PREPARATION           */}
        {/* ========================================================= */}
        {page === 'customer' && currentAssessment && (
          <div className="max-w-6xl mx-auto space-y-6">
            {/* Top Selector & Navigation */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-200 gap-4">
              <div className="flex-1 max-w-md">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  분석할 거래처 선택 ({assessments.length}곳 중 선택)
                </label>
                <select
                  value={selectedKey}
                  onChange={(e) => setSelectedKey(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-blue-500 shadow-xs"
                >
                  {assessments.map(a => (
                    <option key={a.customer_key} value={a.customer_key}>
                      {a.display_name} {a.vip ? '(VIP) ' : ''}[{a.status}]
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={() => setPage('dashboard')}
                className="inline-flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs py-2.5 px-4 rounded-xl transition-colors border border-slate-200"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                대시보드로 돌아가기
              </button>
            </div>

            {/* Customer Title & Flags */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2.5">
                  <h2 className="text-2xl font-black text-slate-900 tracking-tight">
                    {currentAssessment.display_name}
                  </h2>
                  {currentAssessment.vip && (
                    <span className="bg-amber-100 text-amber-800 border border-amber-300 text-xs font-extrabold px-2 py-0.5 rounded-md flex items-center gap-1">
                      <Star className="w-3 h-3 fill-amber-600" /> VIP 거래처
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4 mt-3">
                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={currentAssessment.vip}
                      onChange={(e) => {
                        const updated = setFlag(
                          currentAssessment.customer_key,
                          currentAssessment.display_name,
                          e.target.checked,
                          currentAssessment.project_based
                        );
                        setFlagsState(updated);
                      }}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span>VIP 거래처 지정</span>
                  </label>

                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={currentAssessment.project_based}
                      onChange={(e) => {
                        const updated = setFlag(
                          currentAssessment.customer_key,
                          currentAssessment.display_name,
                          currentAssessment.vip,
                          e.target.checked
                        );
                        setFlagsState(updated);
                      }}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span>비정기 프로젝트성 거래처</span>
                  </label>
                </div>
              </div>

              <div>
                {currentAssessment.status === 'high_risk' && (
                  <span className="bg-purple-100 text-purple-900 border border-purple-200 text-sm font-extrabold px-3 py-1.5 rounded-lg">
                    🚨 고위험 후보
                  </span>
                )}
                {currentAssessment.status === 'risk' && (
                  <span className="bg-rose-100 text-rose-900 border border-rose-200 text-sm font-extrabold px-3 py-1.5 rounded-lg">
                    ⚠️ 이탈 위험 후보
                  </span>
                )}
                {currentAssessment.status === 'attention' && (
                  <span className="bg-amber-100 text-amber-900 border border-amber-200 text-sm font-extrabold px-3 py-1.5 rounded-lg">
                    👀 관심 필요
                  </span>
                )}
                {currentAssessment.status === 'normal' && (
                  <span className="bg-emerald-100 text-emerald-900 border border-emerald-200 text-sm font-extrabold px-3 py-1.5 rounded-lg">
                    ✅ 정상 관리
                  </span>
                )}
                {currentAssessment.status === 'hold' && (
                  <span className="bg-slate-200 text-slate-800 border border-slate-300 text-sm font-extrabold px-3 py-1.5 rounded-lg">
                    ⏸️ 판단 보류
                  </span>
                )}
              </div>
            </div>

            {/* 5 Numerical Metric Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs text-center">
                <div className="text-xs font-bold text-slate-500">최근 거래일</div>
                <div className="text-base font-extrabold text-slate-800 font-mono my-1">
                  {currentAssessment.last_date}
                </div>
                <div className="text-[11px] text-slate-400">최근 발주 일자</div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs text-center">
                <div className="text-xs font-bold text-slate-500">공백 일수</div>
                <div className="text-2xl font-black text-rose-600 font-mono my-1">
                  {currentAssessment.gap_days}일
                </div>
                <div className="text-[11px] text-slate-400">기준일 대비 경과</div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs text-center">
                <div className="text-xs font-bold text-slate-500">평소 주문 주기</div>
                <div className="text-2xl font-black text-slate-800 font-mono my-1">
                  {currentAssessment.median_interval ? `${Math.round(currentAssessment.median_interval)}일` : '-'}
                </div>
                <div className="text-[11px] text-slate-400">간격 중앙값</div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs text-center">
                <div className="text-xs font-bold text-slate-500">주기 대비 배수</div>
                <div className="text-2xl font-black text-purple-600 font-mono my-1">
                  {currentAssessment.ratio ? `${currentAssessment.ratio}배` : '-'}
                </div>
                <div className="text-[11px] text-slate-400">공백 / 평소 간격</div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs text-center">
                <div className="text-xs font-bold text-slate-500">분석 신뢰도</div>
                <div className="text-base font-extrabold text-blue-600 my-1">
                  {currentAssessment.confidence === 'high'
                    ? '높음 (10회+)'
                    : currentAssessment.confidence === 'medium'
                    ? '보통 (5~9회)'
                    : '부족'}
                </div>
                <div className="text-[11px] text-slate-400">총 거래일 수 {currentAssessment.txn_days}일</div>
              </div>
            </div>

            {/* Questions Box & Warning Statement */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <div className="font-bold text-slate-900 text-xs mb-2 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-blue-600" />
                대표 확인 질문 (연락 전 점검사항)
              </div>
              <ul className="list-disc list-inside text-xs text-slate-600 space-y-1 pl-1">
                {currentAssessment.questions.map((q, idx) => (
                  <li key={idx}>{q}</li>
                ))}
              </ul>
              <div className="mt-3 pt-2.5 border-t border-dashed border-slate-300 text-[11px] font-bold text-slate-500 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                거래 이력만으로 이탈을 확정할 수 없습니다.
              </div>
            </div>

            {/* Interval History Visual & Recent 10 Transactions */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
                <h4 className="font-bold text-slate-900 text-xs mb-3 flex items-center gap-1.5">
                  <BarChart3 className="w-4 h-4 text-blue-600" />
                  거래일별 간격 추이 (일 단위)
                </h4>
                {currentAssessment.intervals.length > 0 ? (
                  <div>
                    <div className="flex items-end gap-2 h-32 pt-4 px-2 border-b border-slate-200">
                      {currentAssessment.intervals.map((inv, idx) => {
                        const maxVal = Math.max(...currentAssessment.intervals, 40);
                        const heightPct = Math.min(100, Math.max(15, (inv / maxVal) * 100));
                        return (
                          <div key={idx} className="flex-1 flex flex-col items-center gap-1 group relative">
                            <span className="text-[9px] font-mono text-slate-500">{inv}d</span>
                            <div
                              style={{ height: `${heightPct}%` }}
                              className="w-full bg-blue-500 hover:bg-blue-600 rounded-t-sm transition-all"
                            />
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex justify-between items-center text-[11px] text-slate-400 mt-2">
                      <span>평소 간격(중앙값): {currentAssessment.median_interval ? `${Math.round(currentAssessment.median_interval)}일` : '-'}</span>
                      <span>최근 {currentAssessment.intervals.length}회 거래 주기</span>
                    </div>
                  </div>
                ) : (
                  <div className="h-32 flex items-center justify-center text-xs text-slate-400">
                    거래일 수가 부족하여 간격 차트를 표시할 수 없습니다.
                  </div>
                )}
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
                <h4 className="font-bold text-slate-900 text-xs mb-3 flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-slate-600" />
                  최근 거래 내역 (최대 10건)
                </h4>
                <div className="overflow-x-auto border border-slate-200 rounded-lg max-h-48">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 text-slate-600 font-bold sticky top-0 border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-2">거래일</th>
                        <th className="px-3 py-2">금액</th>
                        <th className="px-3 py-2">품목</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono">
                      {cleanRows
                        .filter(r => r.customer_key === currentAssessment.customer_key)
                        .slice(0, 10)
                        .map((r, i) => (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="px-3 py-1.5">{r.date}</td>
                            <td className="px-3 py-1.5 font-sans font-medium text-slate-800">
                              {r.amount.toLocaleString()}원
                            </td>
                            <td className="px-3 py-1.5 font-sans text-slate-600">{r.item || '-'}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Message Preparation Tabs (Email Draft & Call Guide) */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                  <Send className="w-4 h-4 text-blue-600" />
                  맞춤형 연락 문안 준비 (발송은 사용자가 직접 수행)
                </h3>
              </div>

              {/* Tabs selector */}
              <div className="flex border-b border-slate-200">
                <button
                  onClick={() => setActiveTab('email')}
                  className={`flex items-center gap-2 px-5 py-2.5 text-xs font-bold border-b-2 transition-colors ${
                    activeTab === 'email'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Send className="w-3.5 h-3.5" />
                  이메일 초안
                </button>
                <button
                  onClick={() => setActiveTab('call')}
                  className={`flex items-center gap-2 px-5 py-2.5 text-xs font-bold border-b-2 transition-colors ${
                    activeTab === 'call'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Phone className="w-3.5 h-3.5" />
                  통화 가이드
                </button>
              </div>

              {/* TAB 1: EMAIL DRAFT */}
              {activeTab === 'email' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        담당자명 (선택)
                      </label>
                      <input
                        type="text"
                        placeholder="예: 김철수 과장 (비워둘 시 [담당자명] 유지)"
                        value={contactName}
                        onChange={(e) => setContactName(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-medium focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => handleGenerateEmailDraft(false)}
                        disabled={isGeneratingEmail}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-2.5 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-colors shadow-xs"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>{isGeneratingEmail ? '작성 중...' : '이메일 초안 생성'}</span>
                      </button>

                      <button
                        onClick={() => handleGenerateEmailDraft(true)}
                        disabled={isGeneratingEmail}
                        className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs py-2.5 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-colors border border-slate-200"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Live</span>
                      </button>
                    </div>
                  </div>

                  {currentEmailDraft && (
                    <div className="space-y-4 pt-2">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="bg-blue-100 text-blue-800 font-extrabold px-2.5 py-0.5 rounded-md">
                          AI 초안
                        </span>
                        <span className="bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 rounded-md text-[11px]">
                          {currentEmailDraft.source === 'live'
                            ? 'Liner/Gemini API 응답'
                            : currentEmailDraft.source === 'cache'
                            ? 'Liner Model API 응답(저장본)'
                            : '기본 템플릿(폴백)'}
                        </span>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          메일 제목
                        </label>
                        <input
                          type="text"
                          value={emailSubject}
                          onChange={(e) => setEmailSubject(e.target.value)}
                          className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          메일 본문 (수정 가능)
                        </label>
                        <textarea
                          rows={6}
                          value={emailBody}
                          onChange={(e) => setEmailBody(e.target.value)}
                          className="w-full bg-white border border-slate-300 rounded-lg p-3 text-xs text-slate-800 leading-relaxed font-sans focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={handleSaveEditedEmail}
                            className="bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs py-2 px-4 rounded-lg flex items-center gap-1.5 transition-colors"
                          >
                            <span>💾 수정본 저장</span>
                          </button>
                          {saveDraftFeedback && (
                            <span className="text-xs text-emerald-600 font-bold">
                              {saveDraftFeedback}
                            </span>
                          )}
                        </div>

                        {/* Mailto & Gmail Quick Actions */}
                        <div className="flex items-center gap-2">
                          <button
                            onClick={handleOpenMailApp}
                            className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs py-2 px-3 rounded-lg flex items-center gap-1.5 transition-colors border border-slate-200"
                            title="기본 메일 클라이언트(Outlook 등)로 새 메일 열기"
                          >
                            <Mail className="w-3.5 h-3.5 text-blue-600" />
                            <span>기본 메일 앱 열기</span>
                          </button>
                          <button
                            onClick={handleOpenGmailWeb}
                            className="bg-red-50 hover:bg-red-100 text-red-700 font-bold text-xs py-2 px-3 rounded-lg flex items-center gap-1.5 transition-colors border border-red-200"
                            title="웹 브라우저에서 Gmail 작성창 바로 열기"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>Gmail 웹으로 열기</span>
                          </button>
                        </div>
                      </div>

                      {/* One click copy box */}
                      <div className="bg-slate-900 text-slate-100 rounded-xl p-4 relative font-mono text-xs">
                        <div className="flex justify-between items-center mb-2 pb-2 border-b border-slate-800 text-[11px] text-slate-400">
                          <span>원클릭 복사 영역 (메일 프로그램에 붙여넣기)</span>
                          <button
                            onClick={() => handleCopyText(`제목: ${emailSubject}\n\n${emailBody}`, 'email')}
                            className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold px-2.5 py-1 rounded flex items-center gap-1.5 transition-colors"
                          >
                            {copiedType === 'email' ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                                <span className="text-emerald-400">복사 완료!</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" />
                                <span>본문 복사</span>
                              </>
                            )}
                          </button>
                        </div>
                        <div className="whitespace-pre-wrap leading-relaxed text-slate-200 font-sans">
                          <strong className="text-white font-mono">제목:</strong> {emailSubject}
                          {'\n\n'}
                          {emailBody}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: CALL GUIDE */}
              {activeTab === 'call' && (
                <div className="space-y-4">
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleGenerateCallGuide(false)}
                      disabled={isGeneratingCall}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-2.5 px-4 rounded-lg flex items-center gap-1.5 transition-colors shadow-xs"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>{isGeneratingCall ? '작성 중...' : '통화 가이드 생성'}</span>
                    </button>

                    <button
                      onClick={() => handleGenerateCallGuide(true)}
                      disabled={isGeneratingCall}
                      className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs py-2.5 px-3 rounded-lg flex items-center gap-1.5 transition-colors border border-slate-200"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Live</span>
                    </button>
                  </div>

                  {currentCallDraft && (
                    <div className="space-y-4 pt-2">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="bg-blue-100 text-blue-800 font-extrabold px-2.5 py-0.5 rounded-md">
                          AI 초안
                        </span>
                        <span className="bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 rounded-md text-[11px]">
                          {currentCallDraft.source === 'live'
                            ? 'Liner/Gemini API 응답'
                            : currentCallDraft.source === 'cache'
                            ? 'Liner Model API 응답(저장본)'
                            : '기본 템플릿(폴백)'}
                        </span>
                      </div>

                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4 text-xs">
                        <div>
                          <div className="font-bold text-slate-900 mb-1">🎯 통화 목적</div>
                          <div className="text-slate-600">
                            {renderPlaceholders(currentCallDraft.original_json?.purpose || '', currentAssessment.display_name)}
                          </div>
                        </div>

                        <div>
                          <div className="font-bold text-slate-900 mb-1">👋 첫 인사 가이드</div>
                          <div className="bg-white border border-slate-200 rounded-lg p-3 text-slate-800 italic">
                            "{renderPlaceholders(currentCallDraft.original_json?.opening || '', currentAssessment.display_name)}"
                          </div>
                        </div>

                        <div>
                          <div className="font-bold text-slate-900 mb-1">❓ 주요 확인 질문</div>
                          <ul className="list-disc list-inside text-slate-600 space-y-1 pl-1">
                            {(currentCallDraft.original_json?.questions || []).map((q: string, idx: number) => (
                              <li key={idx}>{renderPlaceholders(q, currentAssessment.display_name)}</li>
                            ))}
                          </ul>
                        </div>

                        <div>
                          <div className="font-bold text-slate-900 mb-1">➡️ 다음 단계 제안</div>
                          <div className="text-slate-600">
                            {renderPlaceholders(currentCallDraft.original_json?.next_step || '', currentAssessment.display_name)}
                          </div>
                        </div>

                        <div>
                          <div className="font-bold text-slate-900 mb-1">📝 통화 후 기록 체크리스트</div>
                          <ul className="list-disc list-inside text-slate-500 space-y-1 pl-1">
                            {(currentCallDraft.original_json?.after_call || []).map((it: string, idx: number) => (
                              <li key={idx}>{it}</li>
                            ))}
                          </ul>
                        </div>
                      </div>

                      <div className="bg-slate-900 text-slate-100 rounded-xl p-4 relative font-mono text-xs">
                        <div className="flex justify-between items-center mb-2 pb-2 border-b border-slate-800 text-[11px] text-slate-400">
                          <span>통화 요약 가이드 복사</span>
                          <button
                            onClick={() => {
                              const callText = `목적: ${currentCallDraft.original_json?.purpose}\n첫인사: ${currentCallDraft.original_json?.opening}\n질문: ${(currentCallDraft.original_json?.questions || []).join(', ')}\n다음단계: ${currentCallDraft.original_json?.next_step}`;
                              handleCopyText(callText, 'call');
                            }}
                            className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold px-2.5 py-1 rounded flex items-center gap-1.5 transition-colors"
                          >
                            {copiedType === 'call' ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                                <span className="text-emerald-400">복사 완료!</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" />
                                <span>가이드 복사</span>
                              </>
                            )}
                          </button>
                        </div>
                        <div className="whitespace-pre-wrap font-sans text-slate-300">
                          <strong>첫인사:</strong> "{renderPlaceholders(currentCallDraft.original_json?.opening || '', currentAssessment.display_name)}"
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Contact Record Form */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-4">
              <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                <FileText className="w-4 h-4 text-emerald-600" />
                거래처 접촉 결과 기록
              </h3>

              <form onSubmit={handleSaveTouchpoint} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      접촉 일자
                    </label>
                    <input
                      type="date"
                      value={touchDate}
                      onChange={(e) => setTouchDate(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-medium focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      접촉 채널
                    </label>
                    <select
                      value={touchChannel}
                      onChange={(e) => setTouchChannel(e.target.value as any)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-medium focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="email">이메일</option>
                      <option value="phone">전화</option>
                      <option value="other">기타</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      접촉 결과
                    </label>
                    <select
                      value={touchOutcome}
                      onChange={(e) => setTouchOutcome(e.target.value as any)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-medium focus:ring-2 focus:ring-blue-500"
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
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    접촉 메모 (최대 500자)
                  </label>
                  <input
                    type="text"
                    maxLength={500}
                    placeholder="예: 담당자 부재로 메일 발송 완료, 차주 화요일 일정 재확인 예정"
                    value={touchNote}
                    onChange={(e) => setTouchNote(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-medium focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                  <div>
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer mb-1.5">
                      <input
                        type="checkbox"
                        checked={hasNextDate}
                        onChange={(e) => setHasNextDate(e.target.checked)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span>다음 연락 예정일 지정</span>
                    </label>
                    {hasNextDate && (
                      <input
                        type="date"
                        value={nextContactDate}
                        onChange={(e) => setNextContactDate(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-medium focus:ring-2 focus:ring-blue-500"
                      />
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      사용한 초안 (선택)
                    </label>
                    <select
                      value={selectedDraftId ?? ''}
                      onChange={(e) => setSelectedDraftId(e.target.value ? Number(e.target.value) : null)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-medium focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">(선택 안 함)</option>
                      {currentEmailDraft && (
                        <option value={currentEmailDraft.id}>
                          이메일 초안 #{currentEmailDraft.id}
                        </option>
                      )}
                    </select>
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-2.5 px-4 rounded-xl transition-colors shadow-xs"
                >
                  💾 접촉 기록 저장
                </button>

                {touchSuccessMsg && (
                  <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs p-3 rounded-lg font-bold">
                    {touchSuccessMsg}
                  </div>
                )}
              </form>

              {/* History Table */}
              <div className="pt-4 border-t border-slate-100">
                <h4 className="font-bold text-slate-800 text-xs mb-2">
                  📜 접촉 이력 내역 (최신순)
                </h4>
                {listTouchpoints(currentAssessment.customer_key).length === 0 ? (
                  <div className="text-slate-400 text-xs py-3 text-center bg-slate-50 rounded-lg">
                    아직 저장된 접촉 이력이 없습니다.
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-slate-200 rounded-lg">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100 text-slate-600 font-bold border-b border-slate-200">
                        <tr>
                          <th className="px-3 py-2">접촉일</th>
                          <th className="px-3 py-2">채널</th>
                          <th className="px-3 py-2">결과</th>
                          <th className="px-4 py-2">메모</th>
                          <th className="px-3 py-2 font-mono">다음 연락일</th>
                          <th className="px-3 py-2 text-slate-400">기록 시각</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {listTouchpoints(currentAssessment.customer_key).map((h) => (
                          <tr key={h.id} className="hover:bg-slate-50">
                            <td className="px-3 py-2 font-mono">{h.contact_date}</td>
                            <td className="px-3 py-2 font-semibold">
                              {h.channel === 'email' ? '이메일' : h.channel === 'phone' ? '전화' : '기타'}
                            </td>
                            <td className="px-3 py-2">
                              <span className="bg-slate-100 text-slate-700 font-semibold px-2 py-0.5 rounded text-[11px]">
                                {{
                                  planned: '연락 예정',
                                  contacted: '연락 완료',
                                  waiting_reply: '회신 대기',
                                  quote_requested: '견적 요청',
                                  reorder_confirmed: '재주문 확인',
                                  on_hold: '거래 보류',
                                  not_needed: '연락 불필요',
                                }[h.outcome] || h.outcome}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-slate-700 max-w-xs truncate">{h.note || '-'}</td>
                            <td className="px-3 py-2 font-mono font-bold text-slate-900">
                              {h.next_contact_date || '-'}
                            </td>
                            <td className="px-3 py-2 text-slate-400 text-[11px] font-mono">{h.created_at}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ------------------------------------------------------------- */}
      {/* API KEY CONFIG MODAL                                          */}
      {/* ------------------------------------------------------------- */}
      {showKeyModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
                  <Key className="w-5 h-5" />
                </div>
                <h3 className="font-extrabold text-slate-900 text-base">LLM API 키 설정</h3>
              </div>
              <button
                onClick={() => setShowKeyModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              <strong>Liner Router API 키</strong> 또는 <strong>Google Gemini API 키</strong>를 등록하면 실시간 라이브 문안 및 주간 브리핑 생성이 가능해집니다. 키가 비어있어도 안전한 기본 템플릿(폴백 모드)으로 모든 시연을 완주할 수 있습니다.
            </p>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                API 키 입력
              </label>
              <input
                type="password"
                placeholder="sk-liner-... 또는 AIzaSy..."
                value={tempApiKey}
                onChange={(e) => setTempApiKey(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-xs font-mono text-slate-900 focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => {
                  setTempApiKey('');
                  setApiKey('');
                  setSetting('liner_api_key', '');
                  setShowKeyModal(false);
                }}
                className="px-3 py-2 text-xs font-bold text-slate-500 hover:text-slate-700"
              >
                키 삭제 (폴백 모드 전환)
              </button>
              <button
                onClick={() => {
                  setApiKey(tempApiKey.trim());
                  setSetting('liner_api_key', tempApiKey.trim());
                  setShowKeyModal(false);
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-2 px-4 rounded-lg shadow-xs"
              >
                저장하기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
