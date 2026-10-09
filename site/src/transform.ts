import type {
  ComponentStatus,
  DayAvailability,
  GithubIssue,
  HistoryEntry,
  Incident,
  Maintenance,
  ServiceState,
  SourceComponent,
  StatusData,
  SummaryEntry,
  TimelineEntry,
  TransformInput,
} from "./types";

export const TIME_ZONE = "America/Sao_Paulo" as const;

const dateKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TIME_ZONE,
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function dateKey(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = dateKeyFormatter.formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function formatInSaoPaulo(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "sem dado";
  return `${dateTimeFormatter.format(date).replaceAll(".", "")} BRT`;
}

function formatDay(value: string): string {
  const date = new Date(`${value}T12:00:00Z`);
  return dateFormatter.format(date).replaceAll(".", "");
}

function clockParts(now: Date): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((item) => item.type === type)?.value ?? 0);
  return { hour: get("hour"), minute: get("minute") };
}

function recentDateKeys(now: Date, count = 90): string[] {
  const today = dateKey(now);
  const cursor = new Date(`${today}T12:00:00Z`);
  const days: string[] = [];
  for (let index = count - 1; index >= 0; index -= 1) {
    const day = new Date(cursor);
    day.setUTCDate(day.getUTCDate() - index);
    days.push(day.toISOString().slice(0, 10));
  }
  return days;
}

function buildDays(
  summary: SummaryEntry | undefined,
  history: HistoryEntry | undefined,
  now: Date,
): DayAvailability[] {
  const start = history?.startTime ? dateKey(history.startTime) : "";
  const end = history?.lastUpdated ? dateKey(history.lastUpdated) : "";
  const startClock = history?.startTime ? clockParts(new Date(history.startTime)) : { hour: 0, minute: 0 };
  const endClock = history?.lastUpdated ? clockParts(new Date(history.lastUpdated)) : { hour: 23, minute: 59 };
  const hasCoverage = Boolean(summary?.dailyMinutesDown && start && end);

  return recentDateKeys(now).map((day) => {
    if (!hasCoverage || day < start || day > end) {
      return { date: day, uptime: null, state: "no-data", label: `${formatDay(day)}: sem dado` };
    }

    const startMinute = day === start ? startClock.hour * 60 + startClock.minute : 0;
    const endMinute = day === end ? endClock.hour * 60 + endClock.minute : 1439;
    const denominator = Math.max(1, endMinute - startMinute + 1);
    const rawDown = summary?.dailyMinutesDown?.[day] ?? 0;
    const down = Math.max(0, Math.min(denominator, Number(rawDown)));
    const uptime = Math.max(0, Math.min(100, ((denominator - down) / denominator) * 100));
    const state = uptime === 100 ? "operational" : uptime === 0 ? "outage" : "degraded";
    return {
      date: day,
      uptime: Number(uptime.toFixed(2)),
      state,
      label: `${formatDay(day)}: ${uptime.toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}% de disponibilidade`,
    };
  });
}

function stateFromHistory(history: HistoryEntry | undefined): ServiceState {
  if (!history?.status) return "unknown";
  return history.status.toLowerCase() === "up" ? "operational" : "outage";
}

function stateLabel(state: ServiceState): string {
  if (state === "operational") return "Operacional";
  if (state === "degraded") return "Instabilidade";
  if (state === "outage") return "Indisponível";
  return "Sem dado";
}

function buildComponents(input: TransformInput, now: Date): ComponentStatus[] {
  return input.components.map((component) => {
    const summary = input.summaries.find((item) =>
      item.slug === component.slug || slugify(item.name ?? "") === component.slug,
    );
    const history = input.histories[component.slug];
    const state = stateFromHistory(history);
    const responseCandidate = summary?.timeDay ?? history?.responseTime;
    const responseTime = Number.isFinite(responseCandidate) ? Number(responseCandidate) : null;

    return {
      ...component,
      state,
      stateLabel: stateLabel(state),
      statusCode: Number.isFinite(history?.code) ? Number(history?.code) : null,
      responseTime,
      responseLabel: responseTime === null ? "sem dado" : `${responseTime} ms`,
      lastUpdated: history?.lastUpdated ?? null,
      days: buildDays(summary, history, now),
    };
  });
}

function labelsOf(issue: GithubIssue): string[] {
  return (issue.labels ?? []).map((label) =>
    (typeof label === "string" ? label : label.name ?? "").toLowerCase(),
  );
}

function cleanText(value: string | undefined): string {
  if (!value) return "";
  return value
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isMaintenance(issue: GithubIssue): boolean {
  const searchable = `${issue.title ?? ""} ${labelsOf(issue).join(" ")}`.toLowerCase();
  return searchable.includes("maintenance") || searchable.includes("manutenção");
}

function isIncident(issue: GithubIssue): boolean {
  if (issue.pull_request || isMaintenance(issue)) return false;
  const searchable = `${issue.title ?? ""} ${labelsOf(issue).join(" ")}`.toLowerCase();
  return ["status", "incident", "incidente", "is down", "indisponível", "degraded"]
    .some((term) => searchable.includes(term));
}

function matchComponent(issue: GithubIssue, components: SourceComponent[]): SourceComponent | undefined {
  const title = slugify(issue.title ?? "");
  return components.find((component) => title.includes(component.slug));
}

function issueUpdates(issue: GithubIssue): TimelineEntry[] {
  const updates: TimelineEntry[] = [];
  const initial = cleanText(issue.body);
  if (issue.created_at) {
    updates.push({
      date: issue.created_at,
      text: initial || "Investigação iniciada.",
      kind: "opened",
    });
  }
  for (const comment of issue.comments_data ?? []) {
    const text = cleanText(comment.body);
    if (text && comment.created_at) updates.push({ date: comment.created_at, text, kind: "update" });
  }
  if (issue.closed_at) {
    updates.push({ date: issue.closed_at, text: "Operação restabelecida.", kind: "resolved" });
  }
  return updates.sort((a, b) => a.date.localeCompare(b.date));
}

function buildIncidents(issues: GithubIssue[], components: SourceComponent[]): Incident[] {
  return issues
    .filter(isIncident)
    .map((issue) => {
      const component = matchComponent(issue, components);
      const resolved = issue.state === "closed" || Boolean(issue.closed_at);
      return {
        id: issue.number,
        title: issue.title?.trim() || `Incidente ${issue.number}`,
        state: resolved ? "resolved" as const : "open" as const,
        stateLabel: resolved ? "Resolvido" : "Em investigação",
        component: component?.name ?? null,
        url: issue.html_url ?? null,
        startedAt: issue.created_at ?? issue.updated_at ?? new Date(0).toISOString(),
        resolvedAt: issue.closed_at ?? null,
        updates: issueUpdates(issue),
      };
    })
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

function metadataDate(body: string | undefined, field: "start" | "end"): string | null {
  const match = body?.match(new RegExp(`^${field}:\\s*(.+)$`, "mi"));
  if (!match?.[1]) return null;
  const date = new Date(match[1].trim());
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function affectedComponents(body: string | undefined, components: SourceComponent[]): string[] {
  const match = body?.match(/^expectedDown:\s*(.+)$/mi);
  if (!match?.[1]) return [];
  const slugs = match[1].split(",").map((item) => slugify(item.trim()));
  return components.filter((component) => slugs.includes(component.slug)).map((component) => component.name);
}

function buildMaintenance(
  issues: GithubIssue[],
  components: SourceComponent[],
  now: Date,
): Maintenance[] {
  return issues
    .filter((issue) => !issue.pull_request && isMaintenance(issue))
    .map((issue) => {
      const startsAt = metadataDate(issue.body, "start");
      const endsAt = metadataDate(issue.body, "end");
      const closed = issue.state === "closed" || Boolean(issue.closed_at);
      const active = Boolean(startsAt && endsAt && new Date(startsAt) <= now && now <= new Date(endsAt));
      const state = closed || Boolean(endsAt && new Date(endsAt) < now)
        ? "completed" as const
        : active ? "active" as const : "scheduled" as const;
      const stateLabel = state === "completed" ? "Concluída" : state === "active" ? "Em andamento" : "Programada";
      return {
        id: issue.number,
        title: issue.title?.trim() || `Manutenção ${issue.number}`,
        state,
        stateLabel,
        startsAt,
        endsAt,
        affected: affectedComponents(issue.body, components),
        description: cleanText(issue.body) || "Sem detalhes adicionais.",
        url: issue.html_url ?? null,
      };
    })
    .sort((a, b) => (b.startsAt ?? "").localeCompare(a.startsAt ?? ""));
}

function overallStatus(components: ComponentStatus[], incidents: Incident[]): StatusData["overall"] {
  const unavailable = components.filter((component) => component.state === "outage").length;
  const unknown = components.filter((component) => component.state === "unknown").length;
  const openIncidents = incidents.filter((incident) => incident.state === "open").length;

  if (components.length > 0 && unavailable === components.length) {
    return { state: "outage", label: "Indisponibilidade", detail: "Todos os serviços monitorados estão indisponíveis." };
  }
  if (unavailable > 0 || openIncidents > 0) {
    return { state: "degraded", label: "Instabilidade parcial", detail: "Um ou mais serviços exigem atenção." };
  }
  if (components.length === 0 || unknown > 0) {
    return { state: "unknown", label: "Monitoramento parcial", detail: "Ainda não há dados para todos os serviços." };
  }
  return { state: "operational", label: "Todos operacionais", detail: "Nenhuma indisponibilidade identificada." };
}

export function buildStatusData(input: TransformInput): StatusData {
  const now = new Date(input.now ?? new Date().toISOString());
  if (Number.isNaN(now.getTime())) throw new Error("Data de geração inválida.");
  const components = buildComponents(input, now);
  const incidents = buildIncidents(input.issues, input.components);
  return {
    generatedAt: now.toISOString(),
    timeZone: TIME_ZONE,
    overall: overallStatus(components, incidents),
    components,
    incidents,
    maintenance: buildMaintenance(input.issues, input.components, now),
    feedUrl: "/feed.xml",
  };
}
