import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ThemeProvider } from 'ztd-charts';
import {
  Assessment,
  CleanTransaction,
  ColumnMapping,
  QualityResult,
  BriefingContent,
  DraftRecord,
  TouchpointRecord,
  LlmResult,
  NewsItem,
} from './types';
import { DEFAULT_NEWS_QUERY, fetchNews } from './news';
import { DEMO_CSV_DATA, parseCSV, parseExcelBuffer, downloadCSV } from './demoData';
import {
  suggestMapping,
  buildClean,
  analyze,
  prioritize,
  summarize,
} from './analysis';
import {
  MessageTone,
  generateBriefing,
  generateEmail,
  generateCallGuide,
  renderPlaceholders,
} from './llm';
import {
  getFlags,
  setFlag,
  getSetting,
  setSetting,
  saveDraft,
  updateDraftText,
  latestDraft,
  getDrafts,
  addTouchpoint,
  deleteTouchpoint,
  getTouchpoints,
  listTouchpoints,
  getFollowups,
  resetDemo,
} from './storage';
import { OverviewPage } from './components/OverviewPage';
import { CustomersPage, CustomerFilterType } from './components/CustomersPage';
import { MessagePage } from './components/MessagePage';
import { ImportPage } from './components/ImportPage';
import { SettingsPage } from './components/SettingsPage';

type NavTab = 'overview' | 'customers' | 'message' | 'import' | 'settings';

interface ToastState {
  id: number;
  message: string;
  undoLabel?: string;
  onUndo?: () => void;
}

const NAV_ITEMS: { id: NavTab; label: string; icon: string }[] = [
  { id: 'overview', label: '개요', icon: 'grid_view' },
  { id: 'customers', label: '거래처', icon: 'groups' },
  { id: 'message', label: '문안', icon: 'edit_note' },
  { id: 'import', label: '가져오기', icon: 'upload_file' },
  { id: 'settings', label: '설정', icon: 'settings' },
];

export default function App() {
  // Navigation & Theme
  const [activeNav, setActiveNav] = useState<NavTab>('overview');
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>(() =>
    getSetting('theme_mode', 'light') === 'dark' ? 'dark' : 'light'
  );

  // Global settings & parameters
  const [refDate, setRefDate] = useState<string>(() => getSetting('ref_date', '2026-11-30'));
  const [weeklyGoal, setWeeklyGoal] = useState<number>(() => {
    const val = Number(getSetting('weekly_goal', '5'));
    return isNaN(val) || val < 1 ? 5 : val;
  });
  const [demoMode, setDemoMode] = useState<boolean>(true);
  const [serverLlmStatus, setServerLlmStatus] = useState<{ configured: boolean; provider: string }>({
    configured: false,
    provider: 'fallback',
  });

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
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Selected customer & bulk workflow queue
  const [selectedKey, setSelectedKey] = useState<string>('대성정밀');
  const [bulkQueue, setBulkQueue] = useState<string[]>([]);

  // Flags & Storage revision counter for instant UI reactivity
  const [flags, setFlagsState] = useState(() => getFlags());
  const [storageTick, setStorageTick] = useState<number>(0);

  // Briefing state
  const [briefing, setBriefing] = useState<LlmResult<BriefingContent> | null>(null);
  const [isBriefingLoading, setIsBriefingLoading] = useState<boolean>(false);

  // Customer Message Editor state
  const [contactName, setContactName] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'email' | 'call'>('email');
  const [tone, setTone] = useState<MessageTone>('정중하게');
  const [currentEmailDraft, setCurrentEmailDraft] = useState<DraftRecord | null>(null);
  const [currentCallDraft, setCurrentCallDraft] = useState<DraftRecord | null>(null);
  const [emailSubject, setEmailSubject] = useState<string>('');
  const [emailBody, setEmailBody] = useState<string>('');
  const [isGeneratingEmail, setIsGeneratingEmail] = useState<boolean>(false);
  const [includeNews, setIncludeNews] = useState<boolean>(false);
  const [newsQuery, setNewsQuery] = useState<string>(DEFAULT_NEWS_QUERY);
  const [isNewsLoading, setIsNewsLoading] = useState<boolean>(false);
  const [isGeneratingCall, setIsGeneratingCall] = useState<boolean>(false);

  // Touchpoint Form
  const [touchDate, setTouchDate] = useState<string>(refDate);
  const [touchChannel, setTouchChannel] = useState<'email' | 'phone' | 'other'>('email');
  const [touchOutcome, setTouchOutcome] = useState<TouchpointRecord['outcome']>('waiting_reply');
  const [touchNote, setTouchNote] = useState<string>('');
  const [hasNextDate, setHasNextDate] = useState<boolean>(true);
  const [nextContactDate, setNextContactDate] = useState<string>('2026-12-07');
  const [selectedDraftId, setSelectedDraftId] = useState<number | null>(null);

  // Customers Search & Filter
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<CustomerFilterType>('all');

  // Popovers, Modals & Toast
  const [showNotifPopover, setShowNotifPopover] = useState<boolean>(false);
  const [showHelpModal, setShowHelpModal] = useState<boolean>(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  // Sync theme attribute on document root
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', themeMode);
    setSetting('theme_mode', themeMode);
  }, [themeMode]);

  // Initial load of demo data and server LLM status
  useEffect(() => {
    loadDemoData(refDate);
    fetch('/api/llm/status')
      .then(r => r.json())
      .then(data => setServerLlmStatus(data))
      .catch(() => setServerLlmStatus({ configured: false, provider: 'fallback' }));
  }, []);

  useEffect(() => {
    setTouchDate(refDate);
  }, [refDate]);

  // Esc closes modals/popovers
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setShowHelpModal(false);
        setShowNotifPopover(false);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  function showToast(message: string, undo?: { label?: string; onUndo: () => void }) {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    const id = Date.now();
    setToast({
      id,
      message,
      undoLabel: undo ? (undo.label || '실행 취소') : undefined,
      onUndo: undo?.onUndo,
    });
    toastTimerRef.current = window.setTimeout(() => {
      setToast(curr => (curr?.id === id ? null : curr));
    }, 3200);
  }

  function loadDemoData(currentRefDate: string) {
    setUploadError(null);
    const { headers: parsedHeaders, rows: parsedRows } = parseCSV(DEMO_CSV_DATA);
    setHeaders(parsedHeaders);
    setRawRows(parsedRows);
    setFileName('demo_transactions.csv');

    const suggested = suggestMapping(parsedHeaders);
    const effectiveMapping: ColumnMapping = {
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

  function handleFileSelected(file: File) {
    setUploadError(null);
    const lowerName = file.name.toLowerCase();
    setFileName(file.name);

    if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
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
            showToast(`${file.name} 파일을 불러왔어요.`);
          } else {
            setQuality(null);
          }
        } catch (err: any) {
          setUploadError(`엑셀 파일을 읽지 못했어요. 파일 형식을 확인해주세요. (${err.message || ''})`);
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        if (!text) return;

        try {
          const { headers: parsedHeaders, rows: parsedRows } = parseCSV(text);
          setHeaders(parsedHeaders);
          setRawRows(parsedRows);

          const suggested = suggestMapping(parsedHeaders);
          setMapping(suggested);

          if (suggested.customer && suggested.date) {
            const q = buildClean(parsedRows, suggested, refDate);
            setQuality(q);
            setCleanRows(q.clean_rows);
            showToast(`${file.name} 파일을 불러왔어요.`);
          } else {
            setQuality(null);
          }
        } catch (err: any) {
          setUploadError(`CSV 파일을 읽지 못했어요. UTF-8 또는 CP949 파일인지 확인해주세요.`);
        }
      };
      reader.readAsText(file, 'utf-8');
    }
  }

  function handleMappingChange(nextMapping: ColumnMapping) {
    setMapping(nextMapping);
    setUploadError(null);
    if (nextMapping.customer && nextMapping.date && nextMapping.customer !== nextMapping.date) {
      try {
        const q = buildClean(rawRows, nextMapping, refDate);
        setQuality(q);
        setCleanRows(q.clean_rows);
      } catch (err: any) {
        setUploadError(err.message || '열 매핑을 다시 확인해주세요.');
      }
    }
  }

  function handleExecuteAnalysis() {
    if (!mapping.customer || !mapping.date) {
      setUploadError('거래처 열과 거래일자 열을 모두 선택해주세요.');
      return;
    }
    if (mapping.customer === mapping.date) {
      setUploadError('거래처 열과 거래일자 열은 서로 다른 열이어야 해요.');
      return;
    }
    try {
      const q = buildClean(rawRows, mapping, refDate);
      setQuality(q);
      setCleanRows(q.clean_rows);
      setActiveNav('overview');
      showToast('분석을 완료했어요.');
    } catch (err: any) {
      setUploadError(err.message || '분석 중 문제가 발생했어요. 열 선택을 확인해주세요.');
    }
  }

  const assessments = useMemo(() => {
    return analyze(cleanRows, flags, refDate);
  }, [cleanRows, flags, refDate]);

  const summary = useMemo(() => {
    return summarize(assessments);
  }, [assessments]);

  const priorityList = useMemo(() => {
    return prioritize(assessments);
  }, [assessments]);

  const customerNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const a of assessments) {
      map[a.customer_key] = a.display_name;
    }
    return map;
  }, [assessments]);

  const allTouchpoints = useMemo(() => {
    void storageTick;
    return getTouchpoints();
  }, [storageTick]);

  const draftCustomerKeys = useMemo(() => {
    void storageTick;
    const drafts = getDrafts();
    return new Set(drafts.map(d => d.customer_key));
  }, [storageTick]);

  const followupsList = useMemo(() => {
    void storageTick;
    return getFollowups(refDate, customerNameMap);
  }, [refDate, customerNameMap, storageTick]);

  const currentAssessment = useMemo(() => {
    return assessments.find(a => a.customer_key === selectedKey) || assessments[0] || null;
  }, [assessments, selectedKey]);

  const currentTouchHistory = useMemo(() => {
    void storageTick;
    if (!currentAssessment) return [];
    return listTouchpoints(currentAssessment.customer_key);
  }, [currentAssessment, storageTick]);

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
  }, [currentAssessment, contactName]);

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

  async function handleGenerateBriefing(forceLive: boolean = false) {
    setIsBriefingLoading(true);
    try {
      const res = await generateBriefing(priorityList, summary, { demoMode, forceLive });
      setBriefing(res);
    } catch (e) {
      console.error(e);
    } finally {
      setIsBriefingLoading(false);
    }
  }

  async function handleGenerateEmailDraft(forceLive: boolean = false, overrideTone?: MessageTone) {
    if (!currentAssessment) return;
    const activeTone = overrideTone || tone;
    setIsGeneratingEmail(true);
    try {
      // 업종 동향: 체크했을 때만 Liner Search를 쓴다(데모 모드는 저장본 우선). 실패하면 동향 없이 작성한다.
      let news: NewsItem[] = [];
      let newsSource: 'live' | 'cache' | null = null;
      if (includeNews) {
        setIsNewsLoading(true);
        const nr = await fetchNews(newsQuery, { demoMode, forceLive });
        setIsNewsLoading(false);
        if (nr.items.length > 0 && nr.source !== 'none') {
          news = nr.items;
          newsSource = nr.source;
        } else {
          showToast('업종 동향을 가져오지 못해 동향 없이 작성했어요.');
        }
      }
      const res = await generateEmail(currentAssessment, { demoMode, forceLive, tone: activeTone, news });
      const usedNews = res.source !== 'fallback' ? news : [];
      const saved = saveDraft(currentAssessment.customer_key, 'email', res.source, res.content, refDate, {
        model: res.source === 'live' ? res.model ?? null : null,
        news: usedNews,
        news_source: newsSource,
      });
      setStorageTick(t => t + 1);
      setCurrentEmailDraft(saved);
      setEmailSubject(renderPlaceholders(res.content.subject, currentAssessment.display_name, contactName));
      setEmailBody(renderPlaceholders(res.content.body, currentAssessment.display_name, contactName));
    } catch (e) {
      console.error(e);
    } finally {
      setIsGeneratingEmail(false);
    }
  }

  async function handleGenerateCallGuide(forceLive: boolean = false, overrideTone?: MessageTone) {
    if (!currentAssessment) return;
    const activeTone = overrideTone || tone;
    setIsGeneratingCall(true);
    try {
      const res = await generateCallGuide(currentAssessment, { demoMode, forceLive, tone: activeTone });
      const saved = saveDraft(currentAssessment.customer_key, 'call', res.source, res.content, refDate, {
        model: res.source === 'live' ? res.model ?? null : null,
      });
      setStorageTick(t => t + 1);
      setCurrentCallDraft(saved);
    } catch (e) {
      console.error(e);
    } finally {
      setIsGeneratingCall(false);
    }
  }

  function handleToneChange(nextTone: MessageTone) {
    setTone(nextTone);
    if (activeTab === 'email' && currentEmailDraft) {
      handleGenerateEmailDraft(false, nextTone);
    } else if (activeTab === 'call' && currentCallDraft) {
      handleGenerateCallGuide(false, nextTone);
    }
  }

  function handleSaveEditedEmail() {
    if (!currentEmailDraft) return;
    updateDraftText(currentEmailDraft.id, emailBody);
    setStorageTick(t => t + 1);
    showToast('수정본을 저장했어요.');
  }

  function handleCopyMessage(text: string) {
    navigator.clipboard.writeText(text);
    showToast('문안을 복사했어요');
  }

  function handleQuickMarkContacted() {
    if (!currentAssessment) return;
    const created = addTouchpoint({
      customer_key: currentAssessment.customer_key,
      draft_id: currentEmailDraft?.id || currentCallDraft?.id || null,
      contact_date: refDate,
      channel: activeTab === 'email' ? 'email' : 'phone',
      outcome: 'contacted',
      note: '문안 편집기에서 연락 완료로 표시',
      next_contact_date: null,
    });
    setStorageTick(t => t + 1);

    const custName = currentAssessment.display_name;
    showToast(`${custName} 연락 완료로 표시했어요.`, {
      label: '실행 취소',
      onUndo: () => {
        deleteTouchpoint(created.id);
        setStorageTick(t => t + 1);
      },
    });
  }

  function handleSaveTouchpoint(e: React.FormEvent) {
    e.preventDefault();
    if (!currentAssessment) return;
    if (hasNextDate && nextContactDate && nextContactDate < touchDate) {
      showToast('다음 연락일은 접촉 일자 이후로 선택해주세요.');
      return;
    }

    const created = addTouchpoint({
      customer_key: currentAssessment.customer_key,
      draft_id: selectedDraftId,
      contact_date: touchDate,
      channel: touchChannel,
      outcome: touchOutcome,
      note: touchNote,
      next_contact_date: hasNextDate ? nextContactDate : null,
    });
    setStorageTick(t => t + 1);
    setTouchNote('');

    showToast('접촉 기록을 저장했어요.', {
      label: '실행 취소',
      onUndo: () => {
        deleteTouchpoint(created.id);
        setStorageTick(t => t + 1);
      },
    });
  }

  function handleToggleFlags(customerKey: string, displayName: string, nextVip: boolean, nextProject: boolean) {
    const prevFlag = flags[customerKey] || { vip: false, project_based: false };
    const updated = setFlag(customerKey, displayName, nextVip, nextProject);
    setFlagsState(updated);

    if (nextProject !== prevFlag.project_based) {
      showToast(
        nextProject ? `${displayName}을(를) 보류/프로젝트성으로 바꿨어요.` : `${displayName}을(를) 정기 분석에 포함했어요.`,
        {
          label: '실행 취소',
          onUndo: () => {
            const reverted = setFlag(customerKey, displayName, prevFlag.vip, prevFlag.project_based);
            setFlagsState(reverted);
          },
        }
      );
    }
  }

  function handleOpenCustomer(customerKey: string) {
    setSelectedKey(customerKey);
    setActiveNav('message');
  }

  function handleBulkCreateMessages(keys: string[]) {
    if (keys.length === 0) return;
    setBulkQueue(keys);
    setSelectedKey(keys[0]);
    setActiveNav('message');
    showToast(`선택한 ${keys.length}곳의 문안 작성을 시작해요.`);
  }

  function handleNextCustomer() {
    const queue = bulkQueue.length > 0 ? bulkQueue : priorityList.map(p => p.customer_key);
    if (queue.length <= 1) return;
    const idx = queue.indexOf(selectedKey);
    const nextIdx = idx >= 0 ? (idx + 1) % queue.length : 0;
    setSelectedKey(queue[nextIdx]);
  }

  function handleOpenMailApp() {
    if (!emailSubject && !emailBody) return;
    window.location.href = `mailto:?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
  }

  function handleOpenGmailWeb() {
    if (!emailSubject && !emailBody) return;
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
    window.open(gmailUrl, '_blank', 'noopener,noreferrer');
  }

  function handleExportAnalysisCSV() {
    let csv = '거래처명,식별자,상태,VIP여부,프로젝트성,최근거래일,공백일수,평소주기(일),주기대비배수,신뢰도,총거래일수,평균금액(원)\n';
    for (const a of assessments) {
      const statusMap = {
        high_risk: '고위험 후보',
        risk: '연락 필요',
        attention: '관심 필요',
        normal: '정상 관리',
        hold: '보류/제외',
      };
      csv += `"${a.display_name}","${a.alias}","${statusMap[a.status] || a.status}","${a.vip ? 'Y' : 'N'}","${a.project_based ? 'Y' : 'N'}","${a.last_date}",${a.gap_days},${a.median_interval ? Math.round(a.median_interval) : ''},${a.ratio || ''},"${a.confidence || ''}",${a.txn_days},${a.avg_amount || ''}\n`;
    }
    downloadCSV(`magentify_analysis_${refDate}.csv`, csv);
  }

  function handleExportTouchpointsCSV() {
    let csv = '거래처명,접촉일자,채널,결과,다음연락예정일,상태,접촉메모\n';
    for (const t of followupsList) {
      const channelText = t.channel === 'email' ? '이메일' : t.channel === 'phone' ? '전화' : '기타';
      const outcomeText =
        {
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

  function handleResetDemo() {
    resetDemo();
    setRefDate('2026-11-30');
    setSetting('ref_date', '2026-11-30');
    setWeeklyGoal(5);
    setSetting('weekly_goal', '5');
    setFlagsState(getFlags());
    loadDemoData('2026-11-30');
    setBriefing(null);
    setBulkQueue([]);
    setStorageTick(t => t + 1);
    setActiveNav('overview');
    showToast('데모 데이터(126행) 상태로 초기화했어요.');
  }

  const dueFollowupCount = followupsList.filter(f => f.followup_status === '후속 조치 필요').length;

  return (
    <ThemeProvider theme={themeMode} locale="ko-KR" paint>
      <div
        className="min-h-screen flex flex-col"
        style={{ backgroundColor: 'var(--app-canvas)', color: 'var(--ztd-ink)' }}
      >
        {/* ----------------------------------------------------------- */}
        {/* TOP PILL NAVIGATION HEADER (§5)                             */}
        {/* ----------------------------------------------------------- */}
        <header className="sticky top-0 z-30 px-4 md:px-6 pt-4 pb-2">
          <div className="max-w-[1280px] mx-auto flex items-center justify-between gap-3">
            {/* Left Brand Logo */}
            <button
              type="button"
              onClick={() => setActiveNav('overview')}
              className="inline-flex items-center gap-2.5 h-[44px] px-3 rounded-full cursor-pointer transition-opacity hover:opacity-85 shrink-0"
              aria-label="Magentify Mini 홈으로 이동"
            >
              <span
                className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-[15px]"
                style={{ backgroundColor: 'var(--ztd-ink)', color: 'var(--ztd-on-ink)' }}
              >
                M
              </span>
              <span className="font-bold text-[16px] tracking-tight hidden sm:inline" style={{ color: 'var(--ztd-ink)' }}>
                Magentify Mini
              </span>
            </button>

            {/* Center Pill Nav */}
            <nav
              aria-label="주 메뉴"
              className="hidden md:flex items-center p-1 rounded-full"
              style={{ backgroundColor: 'var(--ztd-panel)', border: '1px solid var(--ztd-line)' }}
            >
              {NAV_ITEMS.map((item) => {
                const active = activeNav === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveNav(item.id)}
                    aria-current={active ? 'page' : undefined}
                    className="h-[38px] px-4 rounded-full text-[14px] font-semibold transition-colors cursor-pointer"
                    style={{
                      backgroundColor: active ? 'var(--ztd-ink)' : 'transparent',
                      color: active ? 'var(--ztd-on-ink)' : 'var(--ztd-muted)',
                    }}
                  >
                    {item.label}
                  </button>
                );
              })}
            </nav>

            {/* Right Utility Pills: Search · Notifications · Theme/Profile */}
            <div className="flex items-center gap-2 relative shrink-0">
              <button
                type="button"
                onClick={() => {
                  setStatusFilter('all');
                  setActiveNav('customers');
                }}
                aria-label="거래처 검색"
                title="거래처 검색"
                className="w-[44px] h-[44px] rounded-full flex items-center justify-center transition-colors cursor-pointer"
                style={{ backgroundColor: 'var(--ztd-panel)', border: '1px solid var(--ztd-line)', color: 'var(--ztd-ink)' }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '20px' }} aria-hidden="true">
                  search
                </span>
              </button>

              <button
                type="button"
                onClick={() => setShowNotifPopover(!showNotifPopover)}
                aria-label="후속 조치 알림"
                title="후속 조치 알림"
                className="relative w-[44px] h-[44px] rounded-full flex items-center justify-center transition-colors cursor-pointer"
                style={{ backgroundColor: 'var(--ztd-panel)', border: '1px solid var(--ztd-line)', color: 'var(--ztd-ink)' }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '20px' }} aria-hidden="true">
                  notifications
                </span>
                {(dueFollowupCount > 0 || priorityList.length > 0) && (
                  <span
                    className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full"
                    style={{ backgroundColor: 'var(--ztd-accent2)' }}
                  />
                )}
              </button>

              <button
                type="button"
                onClick={() => setThemeMode(themeMode === 'light' ? 'dark' : 'light')}
                aria-label={themeMode === 'light' ? '다크 모드로 전환' : '라이트 모드로 전환'}
                title={themeMode === 'light' ? '다크 모드로 전환' : '라이트 모드로 전환'}
                className="h-[44px] pl-1.5 pr-3.5 rounded-full inline-flex items-center gap-2 transition-colors cursor-pointer"
                style={{ backgroundColor: 'var(--ztd-panel)', border: '1px solid var(--ztd-line)', color: 'var(--ztd-ink)' }}
              >
                <span
                  className="w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-bold"
                  style={{ backgroundColor: 'var(--ztd-tint)', color: 'var(--ztd-accent-text)' }}
                >
                  대표
                </span>
                <span className="material-symbols-outlined hidden sm:inline" style={{ fontSize: '18px', color: 'var(--ztd-muted)' }} aria-hidden="true">
                  {themeMode === 'light' ? 'dark_mode' : 'light_mode'}
                </span>
              </button>

              {/* Notifications Popover */}
              {showNotifPopover && (
                <div
                  className="floating-surface absolute right-0 top-14 w-80 rounded-[18px] p-4 z-40 space-y-3"
                  role="dialog"
                  aria-label="연락 예정 알림"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[14px] font-semibold" style={{ color: 'var(--ztd-ink)' }}>
                      오늘의 연락 알림
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowNotifPopover(false)}
                      aria-label="알림 닫기"
                      className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[var(--ztd-lift)] cursor-pointer"
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>close</span>
                    </button>
                  </div>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {followupsList.length === 0 ? (
                      <p className="text-[14px] py-3 text-center" style={{ color: 'var(--ztd-muted)' }}>
                        예정된 후속 연락 일정이 없어요.
                      </p>
                    ) : (
                      followupsList.slice(0, 4).map((fu) => (
                        <button
                          key={fu.id}
                          type="button"
                          onClick={() => {
                            setShowNotifPopover(false);
                            handleOpenCustomer(fu.customer_key);
                          }}
                          className="w-full text-left bento-sub p-3 hover:brightness-97 transition-all cursor-pointer"
                        >
                          <div className="flex items-center justify-between text-[14px] font-semibold" style={{ color: 'var(--ztd-ink)' }}>
                            <span>{fu.display_name}</span>
                            <span className="font-mono text-[13px]" style={{ color: 'var(--ztd-accent-text)' }}>
                              {fu.next_contact_date}
                            </span>
                          </div>
                          <div className="text-[13px] mt-0.5 truncate" style={{ color: 'var(--ztd-muted)' }}>
                            {fu.followup_status} · {fu.note || '후속 연락 확인'}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* ----------------------------------------------------------- */}
        {/* WORKSPACE: LEFT ICON RAIL (64px) + MAIN BENTO CONTENT       */}
        {/* ----------------------------------------------------------- */}
        <div className="flex-1 w-full max-w-[1280px] mx-auto px-4 md:px-6 pt-3 pb-24 md:pb-10 flex gap-5">
          {/* Left Icon Rail (>= 768px) (§5) */}
          <aside
            aria-label="빠른 이동 레일"
            className="hidden md:flex flex-col items-center justify-between w-[64px] shrink-0 py-3 rounded-[999px] self-start sticky top-24 min-h-[520px]"
            style={{ backgroundColor: 'var(--ztd-panel)', border: '1px solid var(--ztd-line)' }}
          >
            <div className="flex flex-col items-center gap-2">
              {NAV_ITEMS.map((item) => {
                const active = activeNav === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveNav(item.id)}
                    aria-label={item.label}
                    title={item.label}
                    className="w-[44px] h-[44px] rounded-full flex items-center justify-center transition-colors cursor-pointer"
                    style={{
                      backgroundColor: active ? 'var(--ztd-ink)' : 'transparent',
                      color: active ? 'var(--ztd-on-ink)' : 'var(--ztd-muted)',
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '20px' }} aria-hidden="true">
                      {item.icon}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-col items-center gap-2 pt-4 border-t" style={{ borderColor: 'var(--ztd-line2)' }}>
              <button
                type="button"
                onClick={() => setShowHelpModal(true)}
                aria-label="사용 방법 도움말"
                title="사용 방법 도움말"
                className="w-[44px] h-[44px] rounded-full flex items-center justify-center hover:bg-[var(--ztd-lift)] transition-colors cursor-pointer"
                style={{ color: 'var(--ztd-muted)' }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '20px' }} aria-hidden="true">
                  help_outline
                </span>
              </button>
              <button
                type="button"
                onClick={() => setActiveNav('settings')}
                aria-label="설정 및 리셋"
                title="설정 및 리셋"
                className="w-[44px] h-[44px] rounded-full flex items-center justify-center hover:bg-[var(--ztd-lift)] transition-colors cursor-pointer"
                style={{ color: 'var(--ztd-muted)' }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '20px' }} aria-hidden="true">
                  logout
                </span>
              </button>
            </div>
          </aside>

          {/* Main View Area */}
          <main className="flex-1 min-w-0">
            {activeNav === 'overview' && (
              <OverviewPage
                assessments={assessments}
                priorityList={priorityList}
                summary={summary}
                refDate={refDate}
                fileName={fileName}
                briefing={briefing}
                isBriefingLoading={isBriefingLoading}
                touchpoints={allTouchpoints}
                draftCustomerKeys={draftCustomerKeys}
                weeklyGoal={weeklyGoal}
                recencyWarning={recencyWarning}
                onGenerateBriefing={handleGenerateBriefing}
                onOpenCustomer={handleOpenCustomer}
                onNavigatePriorityList={() => {
                  setStatusFilter('priority');
                  setActiveNav('customers');
                }}
                onNavigateImport={() => setActiveNav('import')}
                onNavigateCustomers={() => {
                  setStatusFilter('all');
                  setActiveNav('customers');
                }}
              />
            )}

            {activeNav === 'customers' && (
              <CustomersPage
                assessments={assessments}
                priorityList={priorityList}
                summary={summary}
                statusFilter={statusFilter}
                searchQuery={searchQuery}
                touchpoints={allTouchpoints}
                followupsList={followupsList}
                onFilterChange={setStatusFilter}
                onSearchChange={setSearchQuery}
                onOpenCustomer={handleOpenCustomer}
                onBulkCreateMessages={handleBulkCreateMessages}
                onToggleVip={(key, name, nextVip, proj) => handleToggleFlags(key, name, nextVip, proj)}
                onToggleHold={(key, name, vip, nextProj) => handleToggleFlags(key, name, vip, nextProj)}
                onExportAnalysisCSV={handleExportAnalysisCSV}
                onExportTouchpointsCSV={handleExportTouchpointsCSV}
              />
            )}

            {activeNav === 'message' && (
              <MessagePage
                assessments={assessments}
                priorityList={priorityList}
                currentAssessment={currentAssessment}
                cleanRows={cleanRows}
                selectedKey={selectedKey}
                bulkQueue={bulkQueue}
                contactName={contactName}
                activeTab={activeTab}
                tone={tone}
                currentEmailDraft={currentEmailDraft}
                currentCallDraft={currentCallDraft}
                emailSubject={emailSubject}
                emailBody={emailBody}
                isGeneratingEmail={isGeneratingEmail}
                includeNews={includeNews}
                newsQuery={newsQuery}
                isNewsLoading={isNewsLoading}
                onIncludeNewsChange={setIncludeNews}
                onNewsQueryChange={setNewsQuery}
                isGeneratingCall={isGeneratingCall}
                touchDate={touchDate}
                touchChannel={touchChannel}
                touchOutcome={touchOutcome}
                touchNote={touchNote}
                hasNextDate={hasNextDate}
                nextContactDate={nextContactDate}
                selectedDraftId={selectedDraftId}
                touchHistory={currentTouchHistory}
                onSelectCustomer={setSelectedKey}
                onNextCustomer={handleNextCustomer}
                onBackToCustomers={() => setActiveNav('customers')}
                onToggleFlags={(vip, proj) =>
                  currentAssessment &&
                  handleToggleFlags(currentAssessment.customer_key, currentAssessment.display_name, vip, proj)
                }
                onContactNameChange={setContactName}
                onTabChange={setActiveTab}
                onToneChange={handleToneChange}
                onGenerateEmail={(live) => handleGenerateEmailDraft(live)}
                onGenerateCall={(live) => handleGenerateCallGuide(live)}
                onEmailSubjectChange={setEmailSubject}
                onEmailBodyChange={setEmailBody}
                onSaveEditedEmail={handleSaveEditedEmail}
                onCopyMessage={handleCopyMessage}
                onQuickMarkContacted={handleQuickMarkContacted}
                onOpenMailApp={handleOpenMailApp}
                onOpenGmailWeb={handleOpenGmailWeb}
                onTouchDateChange={setTouchDate}
                onTouchChannelChange={setTouchChannel}
                onTouchOutcomeChange={setTouchOutcome}
                onTouchNoteChange={setTouchNote}
                onHasNextDateChange={setHasNextDate}
                onNextContactDateChange={setNextContactDate}
                onSelectedDraftIdChange={setSelectedDraftId}
                onSaveTouchpoint={handleSaveTouchpoint}
              />
            )}

            {activeNav === 'import' && (
              <ImportPage
                fileName={fileName}
                rawRows={rawRows}
                headers={headers}
                mapping={mapping}
                quality={quality}
                uploadError={uploadError}
                onLoadDemo={() => {
                  loadDemoData(refDate);
                  showToast('데모 거래 데이터(126행)를 불러왔어요.');
                }}
                onFileSelected={handleFileSelected}
                onMappingChange={handleMappingChange}
                onExecuteAnalysis={handleExecuteAnalysis}
              />
            )}

            {activeNav === 'settings' && (
              <SettingsPage
                refDate={refDate}
                weeklyGoal={weeklyGoal}
                demoMode={demoMode}
                themeMode={themeMode}
                serverLlmStatus={serverLlmStatus}
                onRefDateChange={(d) => {
                  setRefDate(d);
                  setSetting('ref_date', d);
                  if (rawRows.length > 0 && mapping.customer && mapping.date) {
                    const q = buildClean(rawRows, mapping, d);
                    setQuality(q);
                    setCleanRows(q.clean_rows);
                  }
                }}
                onWeeklyGoalChange={(n) => {
                  setWeeklyGoal(n);
                  setSetting('weekly_goal', String(n));
                }}
                onDemoModeChange={setDemoMode}
                onThemeModeChange={setThemeMode}
                onExportAnalysisCSV={handleExportAnalysisCSV}
                onExportTouchpointsCSV={handleExportTouchpointsCSV}
                onResetDemo={handleResetDemo}
              />
            )}
          </main>
        </div>

        {/* ----------------------------------------------------------- */}
        {/* MOBILE BOTTOM TAB BAR (< 768px) (§5)                        */}
        {/* ----------------------------------------------------------- */}
        <nav
          aria-label="모바일 하단 메뉴"
          className="md:hidden fixed bottom-0 inset-x-0 z-30 px-3 py-2 flex items-center justify-around"
          style={{ backgroundColor: 'var(--ztd-panel)', borderTop: '1px solid var(--ztd-line)' }}
        >
          {NAV_ITEMS.map((item) => {
            const active = activeNav === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveNav(item.id)}
                className="min-w-[48px] h-[44px] px-2.5 rounded-full flex flex-col items-center justify-center gap-0.5 cursor-pointer"
                style={{
                  backgroundColor: active ? 'var(--ztd-ink)' : 'transparent',
                  color: active ? 'var(--ztd-on-ink)' : 'var(--ztd-muted)',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }} aria-hidden="true">
                  {item.icon}
                </span>
                <span className="text-[11px] font-semibold leading-none">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* ----------------------------------------------------------- */}
        {/* HELP MODAL (§10 Esc close)                                  */}
        {/* ----------------------------------------------------------- */}
        {showHelpModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-modal-title"
          >
            <div className="floating-surface w-full max-w-md rounded-[18px] p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 id="help-modal-title" className="text-[18px] font-bold" style={{ color: 'var(--ztd-ink)' }}>
                  3단계 사용 안내
                </h2>
                <button
                  type="button"
                  onClick={() => setShowHelpModal(false)}
                  aria-label="닫기"
                  className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-[var(--ztd-lift)] cursor-pointer"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>close</span>
                </button>
              </div>
              <ol className="space-y-3 text-[15px] leading-[22px]" style={{ color: 'var(--ztd-muted)' }}>
                <li>
                  <strong style={{ color: 'var(--ztd-ink)' }}>1. 파일 가져오기</strong> — CSV 또는 XLSX 거래 원장을 올리면 기기 안에서 바로 품질 검사와 주기 분석을 마칩니다.
                </li>
                <li>
                  <strong style={{ color: 'var(--ztd-ink)' }}>2. 거래처 확인</strong> — 평소 주기 대비 연락이 뜸해진 거래처를 공백 기간 순으로 확인합니다.
                </li>
                <li>
                  <strong style={{ color: 'var(--ztd-ink)' }}>3. 문안 복사 &amp; 기록</strong> — 톤을 골라 문안을 다듬고 복사한 뒤, 연락 완료로 표시하면 다음 거래처로 이어집니다.
                </li>
              </ol>
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowHelpModal(false)}
                  className="h-[44px] px-5 rounded-full font-semibold text-[14px] cursor-pointer"
                  style={{ backgroundColor: 'var(--ztd-ink)', color: 'var(--ztd-on-ink)' }}
                >
                  확인했어요
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ----------------------------------------------------------- */}
        {/* BOTTOM CENTER TOAST (§6-8, aria-live="polite", 3s)         */}
        {/* ----------------------------------------------------------- */}
        <div
          aria-live="polite"
          className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none"
        >
          {toast && (
            <div
              key={toast.id}
              className="pointer-events-auto h-[44px] px-5 rounded-full flex items-center gap-3 text-[14px] font-medium"
              style={{
                backgroundColor: 'var(--ztd-ink)',
                color: 'var(--ztd-on-ink)',
                boxShadow: 'var(--app-shadow-float)',
              }}
            >
              <span>{toast.message}</span>
              {toast.onUndo && (
                <button
                  type="button"
                  onClick={() => {
                    toast.onUndo?.();
                    setToast(null);
                  }}
                  className="font-bold underline underline-offset-2 cursor-pointer"
                  style={{ color: 'var(--ztd-accent)' }}
                >
                  {toast.undoLabel || '실행 취소'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </ThemeProvider>
  );
}
