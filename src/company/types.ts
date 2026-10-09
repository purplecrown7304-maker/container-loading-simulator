import type { CargoItem, ContainerSpec, LoadingResult } from '../engine/types';

export type CompanyRole = 'owner' | 'admin' | 'planner' | 'approver' | 'viewer';
export type CompanySpace = { id: string; name: string; role: CompanyRole };
export type CompanyMember = { member_id: string; display_name: string; role: CompanyRole };
export type Snapshot = {
  schemaVersion: 1;
  mode: 'boxes' | 'pallets';
  capturedAt: string;
  container: ContainerSpec;
  cargo: CargoItem[];
  result?: LoadingResult;
  equipment?: { id: string; name: string };
  recordedVerification?: { status: 'passed' | 'failed' | 'review'; testedAt: string };
};
export type Plan = {
  id: string; title: string; status: 'draft' | 'submitted' | 'approved' | 'changes_requested';
  revision: number; snapshot: Snapshot; created_by: string; submitted_by: string | null;
  updated_at: string;
};
export type CompanyEvent = { id: string; plan_id: string | null; action: string; actor_name: string; created_at: string; comment: string | null };
export type PlanSummary = Omit<Plan, 'snapshot'>;
export type CompanyDetail = { space: CompanySpace; members: CompanyMember[]; plans: PlanSummary[]; events: CompanyEvent[]; planOffset: number; hasMorePlans: boolean };
