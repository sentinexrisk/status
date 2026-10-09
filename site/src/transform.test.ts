import { describe, expect, it } from "vitest";
import { buildStatusData, formatInSaoPaulo } from "./transform";
import type { TransformInput } from "./types";

const component = { name: "API KYT", slug: "api-kyt", url: "https://api.crypto.sentinexrisk.com/livez" };

function input(overrides: Partial<TransformInput> = {}): TransformInput {
  return {
    now: "2026-10-09T15:30:00.000Z",
    components: [component],
    summaries: [{ slug: "api-kyt", timeDay: 91, dailyMinutesDown: {} }],
    histories: {
      "api-kyt": {
        status: "up",
        code: 200,
        responseTime: 88,
        startTime: "2026-10-08T03:00:00.000Z",
        lastUpdated: "2026-10-09T15:25:00.000Z",
      },
    },
    issues: [],
    ...overrides,
  };
}

describe("buildStatusData", () => {
  it("marca como sem dado um dia fora da cobertura", () => {
    const result = buildStatusData(input());
    expect(result.components[0]?.days[0]).toMatchObject({ uptime: null, state: "no-data" });
    expect(result.components[0]?.days.at(-1)?.state).toBe("operational");
  });

  it("separa incidentes abertos e resolvidos com suas atualizações", () => {
    const issues = [
      {
        number: 1,
        title: "API KYT está indisponível",
        state: "open",
        created_at: "2026-10-09T12:00:00.000Z",
        labels: [{ name: "status" }],
        comments_data: [{ body: "Investigação em andamento.", created_at: "2026-10-09T12:20:00.000Z" }],
      },
      {
        number: 2,
        title: "API KYT está indisponível",
        state: "closed",
        created_at: "2026-10-08T12:00:00.000Z",
        closed_at: "2026-10-08T12:30:00.000Z",
        labels: [{ name: "status" }],
      },
    ];
    const result = buildStatusData(input({ issues }));
    expect(result.incidents.map((incident) => incident.state)).toEqual(["open", "resolved"]);
    expect(result.incidents[0]?.updates).toHaveLength(2);
    expect(result.incidents[1]?.updates.at(-1)?.kind).toBe("resolved");
  });

  it("classifica o conjunto como indisponível quando o componente está fora", () => {
    const histories = { ...input().histories, "api-kyt": { ...input().histories["api-kyt"], status: "down" } };
    const result = buildStatusData(input({ histories }));
    expect(result.components[0]?.state).toBe("outage");
    expect(result.overall).toMatchObject({ state: "outage", label: "Indisponibilidade" });
  });

  it("formata datas no fuso de America/Sao_Paulo", () => {
    expect(formatInSaoPaulo("2026-10-09T00:30:00.000Z")).toContain("08/10/2026");
    expect(formatInSaoPaulo("2026-10-09T00:30:00.000Z")).toContain("21:30 BRT");
  });
});
