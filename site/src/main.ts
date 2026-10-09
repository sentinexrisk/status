import "./styles.css";
import { formatInSaoPaulo, TIME_ZONE } from "./transform";
import type {
  ComponentStatus,
  Incident,
  Maintenance,
  ServiceState,
  StatusData,
} from "./types";

const app = document.querySelector<HTMLDivElement>("#app");

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function statusBadge(state: ServiceState, label: string): HTMLSpanElement {
  const badge = element("span", `status-badge status-${state}`);
  const symbol = element("span", "status-symbol", state === "operational" ? "✓" : state === "outage" ? "×" : state === "degraded" ? "!" : "?");
  symbol.setAttribute("aria-hidden", "true");
  badge.append(symbol, document.createTextNode(label));
  badge.setAttribute("aria-label", `Estado: ${label}`);
  return badge;
}

function clockText(date: Date): string {
  const time = new Intl.DateTimeFormat("pt-BR", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
  const zone = new Intl.DateTimeFormat("pt-BR", {
    timeZone: TIME_ZONE,
    timeZoneName: "longOffset",
  }).formatToParts(date).find((part) => part.type === "timeZoneName")?.value.replace("GMT", "UTC") ?? "UTC-03:00";
  return `${time} ${zone}`;
}

function createHeader(data: StatusData): HTMLElement {
  const header = element("header", "site-header");
  const brand = element("div", "brand");
  const mark = element("span", "brand-mark", "S");
  mark.setAttribute("aria-hidden", "true");
  const brandText = element("div", "brand-text");
  brandText.append(element("strong", "brand-name", "Sentinex Risk"), element("span", "brand-product", "Crypto status"));
  brand.append(mark, brandText);

  const timeBox = element("div", "time-box");
  const clock = element("time", "live-clock", clockText(new Date()));
  const zone = element("span", "time-caption", "Horário de Brasília");
  timeBox.append(clock, zone);
  window.setInterval(() => { clock.textContent = clockText(new Date()); }, 1000);

  const feed = element("a", "feed-link", "Assinar atualizações");
  feed.href = data.feedUrl;
  feed.setAttribute("type", "application/atom+xml");
  header.append(brand, timeBox, feed);
  return header;
}

function createOverall(data: StatusData): HTMLElement {
  const section = element("section", `overall overall-${data.overall.state}`);
  section.setAttribute("aria-labelledby", "estado-geral");
  const copy = element("div", "overall-copy");
  const eyebrow = element("p", "eyebrow", "Estado geral");
  const heading = element("h1", "overall-title", data.overall.label);
  heading.id = "estado-geral";
  copy.append(eyebrow, heading, element("p", "overall-detail", data.overall.detail));
  section.append(copy, statusBadge(data.overall.state, data.overall.label));
  return section;
}

function dayBar(component: ComponentStatus): HTMLElement {
  const wrapper = element("div", "availability");
  const labels = element("div", "availability-labels");
  labels.append(element("span", "availability-caption", "Disponibilidade nos últimos 90 dias"), element("span", "availability-legend", "90 dias"));
  const scroller = element("div", "availability-scroll");
  const days = element("div", "day-grid");
  days.setAttribute("role", "group");
  days.setAttribute("aria-label", `Disponibilidade diária de ${component.name}`);
  for (const day of component.days) {
    const button = element("button", `day-segment day-${day.state}`);
    button.type = "button";
    button.dataset.tooltip = day.label;
    button.setAttribute("aria-label", day.label);
    days.append(button);
  }
  scroller.append(days);
  wrapper.append(labels, scroller);
  return wrapper;
}

function componentCard(component: ComponentStatus): HTMLElement {
  const card = element("article", "component-card");
  const header = element("div", "component-header");
  const heading = element("h3", "component-name", component.name);
  header.append(heading, statusBadge(component.state, component.stateLabel));

  const metrics = element("dl", "component-metrics");
  const responseTerm = element("dt", "metric-label", "Resposta recente");
  const responseValue = element("dd", "metric-value", component.responseLabel);
  const checkedTerm = element("dt", "metric-label", "Última verificação");
  const checkedValue = element(
    "dd",
    "metric-value metric-date",
    component.lastUpdated ? formatInSaoPaulo(component.lastUpdated) : "sem dado",
  );
  metrics.append(responseTerm, responseValue, checkedTerm, checkedValue);
  card.append(header, metrics, dayBar(component));
  return card;
}

function createComponents(data: StatusData): HTMLElement {
  const section = element("section", "section-block");
  section.setAttribute("aria-labelledby", "servicos");
  const intro = element("div", "section-heading");
  const heading = element("h2", "section-title", "Serviços monitorados");
  heading.id = "servicos";
  intro.append(heading, element("p", "section-note", "Atualização automática a cada cinco minutos"));
  const list = element("div", "component-list");
  data.components.forEach((component) => list.append(componentCard(component)));
  section.append(intro, list);
  return section;
}

function timeline(incident: Incident): HTMLElement {
  const list = element("ol", "timeline");
  for (const update of incident.updates) {
    const item = element("li", `timeline-item timeline-${update.kind}`);
    const marker = element("span", "timeline-marker");
    marker.setAttribute("aria-hidden", "true");
    const content = element("div", "timeline-content");
    const date = element("time", "timeline-date", formatInSaoPaulo(update.date));
    date.dateTime = update.date;
    content.append(date, element("p", "timeline-text", update.text));
    item.append(marker, content);
    list.append(item);
  }
  return list;
}

function incidentItem(incident: Incident): HTMLElement {
  const article = element("article", "incident-item");
  const headingRow = element("div", "incident-heading");
  const titleGroup = element("div");
  const title = element("h3", "incident-title", incident.title);
  const meta = element("p", "incident-meta", incident.component ?? "Serviço não identificado");
  titleGroup.append(title, meta);
  headingRow.append(titleGroup, statusBadge(incident.state === "open" ? "degraded" : "operational", incident.stateLabel));
  article.append(headingRow, timeline(incident));
  if (incident.url) {
    const link = element("a", "detail-link", "Ver registro completo");
    link.href = incident.url;
    link.target = "_blank";
    link.rel = "noreferrer";
    article.append(link);
  }
  return article;
}

function createIncidents(data: StatusData): HTMLElement {
  const section = element("section", "section-block history-section");
  section.setAttribute("aria-labelledby", "incidentes");
  const intro = element("div", "section-heading");
  const heading = element("h2", "section-title", "Histórico de incidentes");
  heading.id = "incidentes";
  intro.append(heading, element("p", "section-note", "Registros e atualizações operacionais"));
  const list = element("div", "incident-list");
  if (data.incidents.length === 0) list.append(element("p", "empty-state", "Nenhum incidente registrado."));
  else data.incidents.forEach((incident) => list.append(incidentItem(incident)));
  section.append(intro, list);
  return section;
}

function maintenanceItem(item: Maintenance): HTMLElement {
  const article = element("article", "maintenance-item");
  const head = element("div", "maintenance-head");
  head.append(element("h3", "maintenance-title", item.title), statusBadge(item.state === "active" ? "degraded" : item.state === "completed" ? "operational" : "unknown", item.stateLabel));
  const schedule = element("p", "maintenance-schedule");
  if (item.startsAt && item.endsAt) schedule.textContent = `${formatInSaoPaulo(item.startsAt)} até ${formatInSaoPaulo(item.endsAt)}`;
  else schedule.textContent = "Janela sem dado";
  const affected = element("p", "maintenance-affected", item.affected.length ? `Serviços: ${item.affected.join(", ")}` : "Serviços afetados: sem dado");
  article.append(head, schedule, affected, element("p", "maintenance-description", item.description));
  return article;
}

function createMaintenance(data: StatusData): HTMLElement {
  const section = element("section", "section-block");
  section.setAttribute("aria-labelledby", "manutencoes");
  const intro = element("div", "section-heading");
  const heading = element("h2", "section-title", "Manutenção programada");
  heading.id = "manutencoes";
  intro.append(heading, element("p", "section-note", "Janelas planejadas e impacto esperado"));
  const list = element("div", "maintenance-list");
  const visible = data.maintenance.filter((item) => item.state !== "completed").slice(0, 5);
  if (visible.length === 0) list.append(element("p", "empty-state", "Nenhuma manutenção programada."));
  else visible.forEach((item) => list.append(maintenanceItem(item)));
  section.append(intro, list);
  return section;
}

function createFooter(data: StatusData): HTMLElement {
  const footer = element("footer", "site-footer");
  const generated = element("p", "generated-at", `Dados consolidados em ${formatInSaoPaulo(data.generatedAt)}`);
  const company = element("p", "company-name", "Sentinex Risk Technologies");
  footer.append(generated, company);
  return footer;
}

function render(data: StatusData): void {
  if (!app) return;
  const shell = element("div", "shell");
  const main = element("main", "main-content");
  main.id = "conteudo";
  main.append(createOverall(data), createComponents(data), createIncidents(data), createMaintenance(data));
  shell.append(createHeader(data), main, createFooter(data));
  app.replaceChildren(shell);
}

function renderError(): void {
  if (!app) return;
  const shell = element("main", "shell error-shell");
  shell.id = "conteudo";
  shell.append(
    element("p", "eyebrow", "Estado geral"),
    element("h1", "overall-title", "Não foi possível carregar os dados"),
    element("p", "overall-detail", "Tente novamente em alguns instantes."),
  );
  const retry = element("button", "retry-button", "Tentar novamente");
  retry.type = "button";
  retry.addEventListener("click", () => window.location.reload());
  shell.append(retry);
  app.replaceChildren(shell);
}

async function start(): Promise<void> {
  try {
    const response = await fetch("./data.json", { cache: "no-cache" });
    if (!response.ok) throw new Error(`Falha ao carregar dados: ${response.status}`);
    render(await response.json() as StatusData);
  } catch (error) {
    console.error("Falha ao iniciar a página de status.", error);
    renderError();
  }
}

void start();
