import type { EnterprisePackagingPlannerState } from './enterprisePackagingPlannerStore';
import { readSupabaseMemberSessionToken } from './memberAuth';
import type { PersonalBoxCatalogItem } from './personalBoxCatalog';
import { CONTAINER_MEMBER_API_URL, supabasePublicHeaders } from './supabaseConfig';

export const MEMBER_APP_STATE_SCHEMA_VERSION = 1;

export type MemberCloudData = {
  plannerState: EnterprisePackagingPlannerState | null;
  personalBoxes: PersonalBoxCatalogItem[];
  appState: Record<string, string>;
  schemaVersion: number;
  updatedAt?: string;
};

type MemberCloudApiResponse = {
  ok?: boolean;
  data?: {
    plannerState?: EnterprisePackagingPlannerState | null;
    personalBoxes?: PersonalBoxCatalogItem[];
    appState?: Record<string, unknown>;
    schemaVersion?: number;
    updatedAt?: string;
  } | null;
  updatedAt?: string;
  error?: string;
};

function sessionHeaders() {
  const token = readSupabaseMemberSessionToken();
  if (!token) throw new Error('member_auth_required');
  return supabasePublicHeaders({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  });
}

function normalizeAppState(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
}

async function memberDataRequest(payload: Record<string, unknown>) {
  const response = await fetch(CONTAINER_MEMBER_API_URL, {
    method: 'POST',
    headers: sessionHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({})) as MemberCloudApiResponse;
  if (!response.ok || !data.ok) throw new Error(data.error || `member_data_http_${response.status}`);
  return data;
}

export async function fetchMemberCloudData(): Promise<MemberCloudData | null> {
  const result = await memberDataRequest({ action: 'get_data' });
  if (!result.data) return null;
  const schemaVersion = typeof result.data.schemaVersion === 'number' && Number.isInteger(result.data.schemaVersion)
    ? result.data.schemaVersion
    : MEMBER_APP_STATE_SCHEMA_VERSION;
  return {
    plannerState: result.data.plannerState ?? null,
    personalBoxes: Array.isArray(result.data.personalBoxes) ? result.data.personalBoxes : [],
    appState: normalizeAppState(result.data.appState),
    schemaVersion,
    updatedAt: result.data.updatedAt,
  };
}

export async function saveMemberCloudData(data: Omit<MemberCloudData, 'updatedAt'>): Promise<string | undefined> {
  const result = await memberDataRequest({
    action: 'save_data',
    plannerState: data.plannerState,
    personalBoxes: data.personalBoxes,
    appState: data.appState,
    schemaVersion: data.schemaVersion,
  });
  return result.updatedAt;
}
