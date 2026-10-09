import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildStatusData, slugify } from "../src/transform.ts";
import type {
  GithubIssue,
  HistoryEntry,
  SourceComponent,
  SummaryEntry,
  TransformInput,
} from "../src/types.ts";

const siteRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(siteRoot, "..");
const fixtureMode = process.argv.includes("--fixture");

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
}

function unquote(value: string): string {
  return value.trim().replace(/^['"]|['"]$/g, "");
}

function parseComponents(yaml: string): SourceComponent[] {
  const components: SourceComponent[] = [];
  let current: Partial<SourceComponent> | null = null;

  for (const line of yaml.split("\n")) {
    const name = line.match(/^\s*-\s+name:\s*(.+)$/);
    if (name?.[1]) {
      if (current?.name && current.url) {
        components.push({ name: current.name, url: current.url, slug: slugify(current.name) });
      }
      current = { name: unquote(name[1]) };
      continue;
    }
    const url = line.match(/^\s+url:\s*(.+)$/);
    if (url?.[1] && current) current.url = unquote(url[1]);
  }

  if (current?.name && current.url) {
    components.push({ name: current.name, url: current.url, slug: slugify(current.name) });
  }
  return components;
}

function parseHistory(yaml: string): HistoryEntry {
  const result: HistoryEntry = {};
  const fields: Array<keyof HistoryEntry> = [
    "status",
    "code",
    "responseTime",
    "lastUpdated",
    "startTime",
  ];
  for (const field of fields) {
    const match = yaml.match(new RegExp(`^${field}:\\s*(.+)$`, "m"));
    if (!match?.[1]) continue;
    const value = unquote(match[1]);
    if (field === "code" || field === "responseTime") result[field] = Number(value);
    else result[field] = value;
  }
  return result;
}

async function loadRepositoryInput(): Promise<TransformInput> {
  const config = await readFile(resolve(repositoryRoot, ".upptimerc.yml"), "utf8");
  const components = parseComponents(config);
  const summaries = await readJson<SummaryEntry[]>(resolve(repositoryRoot, "history/summary.json"), []);
  const issues = await readJson<GithubIssue[]>(resolve(siteRoot, ".generated/issues.json"), []);
  const histories: Record<string, HistoryEntry> = {};

  for (const component of components) {
    try {
      histories[component.slug] = parseHistory(
        await readFile(resolve(repositoryRoot, "history", `${component.slug}.yml`), "utf8"),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }

    const responseBadge = await readJson<{ message?: string } | null>(
      resolve(repositoryRoot, "api", component.slug, "response-time-day.json"),
      null,
    );
    const responseTime = responseBadge?.message ? Number.parseFloat(responseBadge.message) : Number.NaN;
    const summary = summaries.find((item) =>
      item.slug === component.slug || slugify(item.name ?? "") === component.slug,
    );
    if (Number.isFinite(responseTime)) {
      if (summary && !Number.isFinite(summary.timeDay)) summary.timeDay = responseTime;
      else if (!summary) summaries.push({ slug: component.slug, timeDay: responseTime });
    }
  }

  return { components, summaries, histories, issues };
}

function xml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function atomFeed(data: ReturnType<typeof buildStatusData>): string {
  const entries = [
    ...data.incidents.map((item) => ({
      id: `incidente-${item.id}`,
      title: item.title,
      updated: item.resolvedAt ?? item.startedAt,
      summary: `${item.stateLabel}${item.component ? `: ${item.component}` : ""}`,
      url: item.url,
    })),
    ...data.maintenance.map((item) => ({
      id: `manutencao-${item.id}`,
      title: item.title,
      updated: item.startsAt ?? data.generatedAt,
      summary: item.stateLabel,
      url: item.url,
    })),
  ].sort((a, b) => b.updated.localeCompare(a.updated));

  const rendered = entries.map((entry) => `  <entry>
    <id>tag:status.sentinexrisk.com,2026:${xml(entry.id)}</id>
    <title>${xml(entry.title)}</title>
    <updated>${xml(entry.updated)}</updated>
    <summary>${xml(entry.summary)}</summary>${entry.url ? `
    <link href="${xml(entry.url)}" />` : ""}
  </entry>`).join("\n");

  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>https://status.sentinexrisk.com/</id>
  <title>Status da Sentinex Risk Crypto</title>
  <updated>${xml(data.generatedAt)}</updated>
  <link rel="self" href="https://status.sentinexrisk.com/feed.xml" />
  <link href="https://status.sentinexrisk.com/" />
${rendered}
</feed>
`;
}

async function run(): Promise<void> {
  const input = fixtureMode
    ? await readJson<TransformInput>(resolve(siteRoot, "fixtures/status-input.json"), {
        components: [], summaries: [], histories: {}, issues: [],
      })
    : await loadRepositoryInput();
  const data = buildStatusData(input);
  const publicDirectory = resolve(siteRoot, "public");
  await mkdir(publicDirectory, { recursive: true });
  await Promise.all([
    writeFile(resolve(publicDirectory, "data.json"), `${JSON.stringify(data, null, 2)}\n`, "utf8"),
    writeFile(resolve(publicDirectory, "feed.xml"), atomFeed(data), "utf8"),
  ]);

  const generatedFiles = await readdir(publicDirectory);
  if (!generatedFiles.includes("CNAME")) throw new Error("O arquivo CNAME não foi encontrado.");
}

await run();
