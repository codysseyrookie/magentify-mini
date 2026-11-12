export interface RawRow {
  source_row: number;
  [key: string]: any;
}

export interface CleanTransaction {
  source_row: number;
  customer: string;
  customer_key: string;
  date: string; // YYYY-MM-DD
  amount: number;
  item: string;
}

export interface QualityIssue {
  source_row: number;
  customer: string;
  date: string;
  reason: string;
}

export interface QualityResult {
  clean_rows: CleanTransaction[];
  issues: QualityIssue[];
  counts: {
    ok: number;
    duplicate: number;
    negative: number;
    invalid: number;
    future: number;
  };
  similar_pairs: [string, string][];
}

export type AssessmentStatus = 'normal' | 'attention' | 'risk' | 'high_risk' | 'hold';

export interface Assessment {
  customer_key: string;
  display_name: string;
  alias: string; // C01...
  txn_days: number;
  first_date: string;
  last_date: string;
  gap_days: number;
  median_interval: number | null;
  ratio: number | null;
  status: AssessmentStatus;
  hold_reason: 'insufficient_data' | 'project_based' | 'invalid_interval' | null;
  confidence: 'high' | 'medium' | null;
  vip: boolean;
  project_based: boolean;
  priority_score: number;
  intervals: number[];
  avg_amount: number | null;
  reasons: string[];
  questions: string[];
}

export interface SummaryCounts {
  normal: number;
  attention: number;
  risk: number;
  high_risk: number;
  hold: number;
}

export interface ColumnMapping {
  customer: string | null;
  date: string | null;
  amount: string | null;
  item: string | null;
}

export interface BriefingItem {
  id: string; // alias like C01
  reason: string;
  action: 'email' | 'call';
  tone: '정중' | '가벼운 안부';
}

export interface BriefingContent {
  headline: string;
  items: BriefingItem[];
  caution: string;
}

export interface EmailDraftContent {
  subject: string;
  body: string;
  check_questions: string[];
}

export interface CallGuideContent {
  purpose: string;
  opening: string;
  questions: string[];
  next_step: string;
  after_call: string[];
}

export interface LlmResult<T = any> {
  content: T;
  source: 'live' | 'cache' | 'fallback';
  latency_ms: number | null;
  error_code: string | null;
}

export interface DraftRecord {
  id: number;
  customer_key: string;
  kind: 'email' | 'call';
  source: 'live' | 'cache' | 'fallback';
  original_json: any;
  edited_text: string;
  ref_date: string;
  created_at: string;
  updated_at: string;
}

export interface TouchpointRecord {
  id: number;
  customer_key: string;
  draft_id: number | null;
  contact_date: string;
  channel: 'email' | 'phone' | 'other';
  outcome: 'planned' | 'contacted' | 'waiting_reply' | 'quote_requested' | 'reorder_confirmed' | 'on_hold' | 'not_needed';
  note: string;
  next_contact_date: string | null;
  created_at: string;
  display_name?: string;
  followup_status?: '후속 조치 필요' | '예정';
}

export interface CustomerFlag {
  customer_key: string;
  display_name: string;
  vip: boolean;
  project_based: boolean;
  updated_at: string;
}
