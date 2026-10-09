export type ServiceState = "operational" | "degraded" | "outage" | "unknown";
export type DayState = Exclude<ServiceState, "unknown"> | "no-data";

export interface SourceComponent {
  name: string;
  slug: string;
  url: string;
}

export interface SummaryEntry {
  name?: string;
  slug?: string;
  status?: string;
  time?: number;
  timeDay?: number;
  dailyMinutesDown?: Record<string, number>;
}

export interface HistoryEntry {
  status?: string;
  code?: number;
  responseTime?: number;
  lastUpdated?: string;
  startTime?: string;
}

export interface GithubLabel {
  name?: string;
}

export interface GithubComment {
  body?: string;
  created_at?: string;
  updated_at?: string;
}

export interface GithubIssue {
  number: number;
  title?: string;
  body?: string;
  state?: string;
  html_url?: string;
  created_at?: string;
  updated_at?: string;
  closed_at?: string | null;
  labels?: Array<GithubLabel | string>;
  comments_data?: GithubComment[];
  pull_request?: unknown;
}

export interface DayAvailability {
  date: string;
  uptime: number | null;
  state: DayState;
  label: string;
}

export interface ComponentStatus extends SourceComponent {
  state: ServiceState;
  stateLabel: string;
  statusCode: number | null;
  responseTime: number | null;
  responseLabel: string;
  lastUpdated: string | null;
  days: DayAvailability[];
}

export interface TimelineEntry {
  date: string;
  text: string;
  kind: "opened" | "update" | "resolved";
}

export interface Incident {
  id: number;
  title: string;
  state: "open" | "resolved";
  stateLabel: string;
  component: string | null;
  url: string | null;
  startedAt: string;
  resolvedAt: string | null;
  updates: TimelineEntry[];
}

export interface Maintenance {
  id: number;
  title: string;
  state: "scheduled" | "active" | "completed";
  stateLabel: string;
  startsAt: string | null;
  endsAt: string | null;
  affected: string[];
  description: string;
  url: string | null;
}

export interface StatusData {
  generatedAt: string;
  timeZone: "America/Sao_Paulo";
  overall: {
    state: ServiceState;
    label: string;
    detail: string;
  };
  components: ComponentStatus[];
  incidents: Incident[];
  maintenance: Maintenance[];
  feedUrl: string;
}

export interface TransformInput {
  components: SourceComponent[];
  summaries: SummaryEntry[];
  histories: Record<string, HistoryEntry | undefined>;
  issues: GithubIssue[];
  now?: string;
}
