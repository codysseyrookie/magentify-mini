import { CustomerFlag, DraftRecord, TouchpointRecord } from './types';

const STORAGE_KEYS = {
  FLAGS: 'magentify_customer_flags',
  SETTINGS: 'magentify_settings',
  DRAFTS: 'magentify_drafts',
  TOUCHPOINTS: 'magentify_touchpoints',
};

export function seedDemoFlags(): Record<string, CustomerFlag> {
  const defaults: Record<string, CustomerFlag> = {
    '대성정밀': {
      customer_key: '대성정밀',
      display_name: '대성정밀',
      vip: true,
      project_based: false,
      updated_at: new Date().toISOString(),
    },
    '미래산업': {
      customer_key: '미래산업',
      display_name: '미래산업',
      vip: true,
      project_based: false,
      updated_at: new Date().toISOString(),
    },
    '바른설비': {
      customer_key: '바른설비',
      display_name: '바른설비',
      vip: false,
      project_based: true,
      updated_at: new Date().toISOString(),
    },
  };
  localStorage.setItem(STORAGE_KEYS.FLAGS, JSON.stringify(defaults));
  return defaults;
}

export function getFlags(): Record<string, CustomerFlag> {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.FLAGS);
    if (!raw) {
      return seedDemoFlags();
    }
    return JSON.parse(raw);
  } catch {
    return seedDemoFlags();
  }
}

export function setFlag(
  customerKey: string,
  displayName: string,
  vip: boolean,
  projectBased: boolean
): Record<string, CustomerFlag> {
  const flags = getFlags();
  flags[customerKey] = {
    customer_key: customerKey,
    display_name: displayName,
    vip,
    project_based: projectBased,
    updated_at: new Date().toISOString(),
  };
  localStorage.setItem(STORAGE_KEYS.FLAGS, JSON.stringify(flags));
  return flags;
}

export function getSetting(key: string, defaultValue: string = ''): string {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (!raw) return defaultValue;
    const settings = JSON.parse(raw);
    return settings[key] !== undefined ? settings[key] : defaultValue;
  } catch {
    return defaultValue;
  }
}

export function setSetting(key: string, value: string): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    const settings = raw ? JSON.parse(raw) : {};
    settings[key] = value;
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  } catch {
    // Ignore error
  }
}

export function getDrafts(): DraftRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.DRAFTS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveDraft(
  customerKey: string,
  kind: 'email' | 'call',
  source: 'live' | 'cache' | 'fallback',
  content: any,
  refDate: string
): DraftRecord {
  const drafts = getDrafts();
  const nextId = drafts.length > 0 ? Math.max(...drafts.map(d => d.id)) + 1 : 1;
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

  const newDraft: DraftRecord = {
    id: nextId,
    customer_key: customerKey,
    kind,
    source,
    original_json: content,
    edited_text: kind === 'email' ? (content?.body || '') : '',
    ref_date: refDate,
    created_at: now,
    updated_at: now,
  };

  drafts.unshift(newDraft);
  localStorage.setItem(STORAGE_KEYS.DRAFTS, JSON.stringify(drafts));
  return newDraft;
}

export function updateDraftText(draftId: number, editedText: string): void {
  const drafts = getDrafts();
  const draft = drafts.find(d => d.id === draftId);
  if (draft) {
    draft.edited_text = editedText;
    draft.updated_at = new Date().toISOString().replace('T', ' ').slice(0, 19);
    localStorage.setItem(STORAGE_KEYS.DRAFTS, JSON.stringify(drafts));
  }
}

export function latestDraft(customerKey: string, kind: 'email' | 'call'): DraftRecord | null {
  const drafts = getDrafts();
  const match = drafts.find(d => d.customer_key === customerKey && d.kind === kind);
  return match || null;
}

export function getTouchpoints(): TouchpointRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.TOUCHPOINTS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function addTouchpoint(data: {
  customer_key: string;
  draft_id: number | null;
  contact_date: string;
  channel: 'email' | 'phone' | 'other';
  outcome: 'planned' | 'contacted' | 'waiting_reply' | 'quote_requested' | 'reorder_confirmed' | 'on_hold' | 'not_needed';
  note: string;
  next_contact_date: string | null;
}): TouchpointRecord {
  const touchpoints = getTouchpoints();
  const nextId = touchpoints.length > 0 ? Math.max(...touchpoints.map(t => t.id)) + 1 : 1;
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

  const newTouch: TouchpointRecord = {
    id: nextId,
    customer_key: data.customer_key,
    draft_id: data.draft_id,
    contact_date: data.contact_date,
    channel: data.channel,
    outcome: data.outcome,
    note: data.note,
    next_contact_date: data.next_contact_date,
    created_at: now,
  };

  touchpoints.unshift(newTouch);
  localStorage.setItem(STORAGE_KEYS.TOUCHPOINTS, JSON.stringify(touchpoints));
  return newTouch;
}

export function listTouchpoints(customerKey: string): TouchpointRecord[] {
  const touchpoints = getTouchpoints();
  return touchpoints.filter(t => t.customer_key === customerKey);
}

export function getFollowups(refDate: string, customerNames: Record<string, string>): TouchpointRecord[] {
  const touchpoints = getTouchpoints();
  // Find the latest touchpoint for each customer
  const latestByCust = new Map<string, TouchpointRecord>();
  for (const t of touchpoints) {
    if (!latestByCust.has(t.customer_key)) {
      latestByCust.set(t.customer_key, t);
    }
  }

  const results: TouchpointRecord[] = [];
  for (const t of latestByCust.values()) {
    if (t.next_contact_date && t.next_contact_date.trim() !== '') {
      const followupStatus: '후속 조치 필요' | '예정' =
        t.next_contact_date < refDate ? '후속 조치 필요' : '예정';
      results.push({
        ...t,
        display_name: customerNames[t.customer_key] || t.customer_key,
        followup_status: followupStatus,
      });
    }
  }

  // Sort by next_contact_date asc
  results.sort((a, b) => (a.next_contact_date || '').localeCompare(b.next_contact_date || ''));
  return results;
}

export function resetDemo(): void {
  localStorage.removeItem(STORAGE_KEYS.TOUCHPOINTS);
  localStorage.removeItem(STORAGE_KEYS.DRAFTS);
  seedDemoFlags();
  setSetting('ref_date', '2026-11-30');
}
