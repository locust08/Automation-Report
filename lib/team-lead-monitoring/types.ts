export type MonitoringModule = "search_term" | "placement";
export type MonitoringPriority = "critical" | "high" | "medium" | "normal";

export interface MonitoringEscalation {
  id: string;
  note: string;
  escalatedByEmail: string;
  createdAt: string;
  resolvedAt: string | null;
}

export interface MonitoringItem {
  key: string;
  module: MonitoringModule;
  sourceId: string;
  accountId: string;
  accountName: string;
  item: string;
  campaign: string;
  spend: number;
  conversions: number;
  priority: MonitoringPriority;
  status: string;
  statusLabel: string;
  lastDecision: string | null;
  updatedAt: string;
  waitingSince: string;
  href: string;
  escalation: MonitoringEscalation | null;
}

export interface MonitoringActivity {
  id: string;
  module: MonitoringModule | "escalation";
  accountId: string;
  accountName: string;
  item: string;
  action: string;
  actorEmail: string;
  occurredAt: string;
  resultingStatus: string;
}

export interface TeamLeadMonitoringPayload {
  summary: {
    pendingFirstReview: number;
    pendingApproval: number;
    returned: number;
    approved: number;
    negativeOrRejected: number;
    escalated: number;
    failed: number;
  };
  accounts: Array<{ id: string; name: string }>;
  items: MonitoringItem[];
  generatedAt: string;
}

