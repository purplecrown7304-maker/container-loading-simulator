import type { EnterprisePackagingPlannerState } from './enterprisePackagingPlannerStore';
import { readSupabaseMemberSessionToken } from './memberAuth';
import type { PersonalBoxCatalogItem } from './personalBoxCatalog';
import { CONTAINER_MEMBER_API_URL, supabasePublicHeaders } from './supabaseConfig';

export type MemberCloudData = {
  plannerState: EnterprisePackagingPlannerState | null;
  personalBoxes: PersonalBoxCatalogItem[];
  updatedAt?: string;
};

type MemberCloudApiResponse = {
  ok?: boolean;
  data?: {
    plannerState?: EnterprisePackagingPlannerState | null;
    personalBoxes?: PersonalBoxCatalogItem[];
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
  return {
    plannerState: result.data.plannerState ?? null,
    personalBoxes: Array.isArray(result.data.personalBoxes) ? result.data.personalBoxes : [],
    updatedAt: result.data.updatedAt,
  };
}

export async function saveMemberCloudData(data: Omit<MemberCloudData, 'updatedAt'>): Promise<string | undefined> {
  const result = await memberDataRequest({
    action: 'save_data',
    plannerState: data.plannerState,
    personalBoxes: data.personalBoxes,
  });
  return result.updatedAt;
}
