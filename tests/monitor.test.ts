import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { loadRepository } from "../src/data/repository.ts";
import type { RepositoryData } from "../src/domain/repository.ts";
import type { Burden } from "../src/domain/types.generated.ts";
import { EgovClient } from "../src/monitor/egov/client.ts";
import { compareProvision, type LawCheck } from "../src/monitor/egov/detect.ts";
import { locate, parseElm, textOf, type LawNode } from "../src/monitor/egov/law-text.ts";
import { monitorEgov } from "../src/monitor/egov/monitor.ts";
import { failureKey, revisionKey } from "../src/monitor/egov/report.ts";
import type { Fetcher } from "../src/monitor/http.ts";
import { GitHubIssues, markersIn, type PlannedIssue } from "../src/monitor/issues.ts";
import { EGOV_SOURCE_ID, runMonitor } from "../src/monitor/run.ts";
import { ROOT, SCHEMA_DIR, VALID_REPO } from "./helpers.ts";

const FIXTURES = join(ROOT, "tests/fixtures/egov");
const BASE = "https://egov.example.test/api/2/";
const L1 = "999AC0000000001";
const L2 = "999AC0000000002";
const M1 = "999M60000000001";
const REVIEWED = `${L1}_20250401_000000000000000`;
const CURRENT = `${L1}_20270401_508AC0000000997`;
const DETECTED_AT = "2026-11-08T09:00:00+09:00";

const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const fixture = async (name: string): Promise<unknown> => JSON.parse(await readFile(join(FIXTURES, name), "utf8"));

/** fixture の応答を返す fetch。外部通信はしない。 */
function fixtureFetcher(overrides: Record<string, () => Response | Promise<Response>> = {}): { fetcher: Fetcher; requested: string[] } {
  const requested: string[] = [];
  const fetcher: Fetcher = async (input) => {
    const url = String(input);
    requested.push(url);
    for (const [prefix, respond] of Object.entries(overrides)) if (url.startsWith(BASE + prefix)) return respond();
    const revisions = /law_revisions\/(\w+)$/.exec(url);
    if (revisions) return json(await fixture(`law_revisions-${revisions[1]}.json`).catch(() => ({ code: "404001" })), 200);
    const data = /law_data\/(\w+)\?/.exec(url);
    if (data) return fixture(`law_data-${data[1]}.json`).then((body) => json(body), () => json({ code: "404004" }, 404));
    throw new Error(`unexpected request: ${url}`);
  };
  return { fetcher, requested };
}

/** 法令の監視に使う正本。fixture の正本に、附則・別表を出現順の番号で指す負担項目を加える。 */
async function monitorData(): Promise<RepositoryData> {
  const { data, errors } = await loadRepository(VALID_REPO, SCHEMA_DIR);
  assert.deepEqual(errors, []);
  data.sources.sources = [{ source_id: "egov-law-api", name: "e-Gov法令API", base_url: BASE, rate_limit: "テスト用", request_interval_ms: 0, enabled: true }];
  const template = data.burdens.find((burden) => burden.burden_id === "nt-000001")!;
  const extra: Burden = structuredClone(template);
  extra.burden_id = "nt-000009";
  extra.name = "例示税（附則と別表）";
  extra.versions = [structuredClone(template.versions[0]!)];
  extra.versions[0]!.version_id = "nt-000009-v1";
  extra.versions[0]!.provisions = [
    { law_id: L1, elm: "SupplProvision[2]-Article_1", article: "令和七年法律第九百九十六号附則第一条", role: "value" },
    { law_id: L1, elm: "AppdxTable[1]", article: "別表第一", role: "value" }
  ];
  data.burdens.push(extra);
  return data;
}

/** GitHub REST API の代わりに、未完了のIssueの目印を返し、作成したIssueを記録する GitHubIssues。 */
function fakeGitHub(open: Set<string> = new Set()): { tracker: GitHubIssues; created: PlannedIssue[] } {
  const created: PlannedIssue[] = [];
  const fetcher: Fetcher = async (_input, init) => {
    if (init?.method === "POST") {
      const { title, body } = JSON.parse(init.body as string) as { title: string; body: string };
      created.push({ key: markersIn(body)[0]!, title, body });
      return json({ html_url: `https://github.example.test/issues/${created.length}` }, 201);
    }
    return json([...open].map((key) => ({ body: `<!-- monitor: ${key} -->` })));
  };
  return { tracker: new GitHubIssues({ repository: "o/r", token: "t", api: "https://api.example.test", fetcher }), created };
}

const noSleep = async (): Promise<void> => {};
const byLaw = (checks: LawCheck[], lawId: string): LawCheck => checks.find((check) => check.source.law_id === lawId)!;

test("parseElm reads numbered, indexed, and plain parts", () => {
  assert.deepEqual(parseElm("SupplProvision[843]-Article_15_2-Paragraph_1"), [{ tag: "SupplProvision", index: 843 }, { tag: "Article", num: "15_2" }, { tag: "Paragraph", num: "1" }]);
  assert.deepEqual(parseElm("MainProvision"), [{ tag: "MainProvision" }]);
  assert.throws(() => parseElm("Article-1"), /unsupported elm part/);
});

test("locate finds articles through chapters and indexed supplementary provisions", async () => {
  const root = (await fixture(`law_data-${REVIEWED}.json`) as { law_full_text: LawNode }).law_full_text;
  assert.match(textOf(locate(root, "MainProvision-Article_3-Paragraph_1")!), /百分の十とする/);
  assert.match(textOf(locate(root, "SupplProvision-Article_1")!), /公布の日から施行する/);
  assert.match(textOf(locate(root, "SupplProvision[2]-Article_1")!), /百分の五/);
  assert.match(textOf(locate(root, "AppdxTable[1]")!), /別表第一/);
  assert.equal(locate(root, "MainProvision-Article_9"), undefined);
});

test("compareProvision detects text changes, removals, and index shifts", async () => {
  const reviewed = (await fixture(`law_data-${REVIEWED}.json`) as { law_full_text: LawNode }).law_full_text;
  const current = (await fixture(`law_data-${CURRENT}.json`) as { law_full_text: LawNode }).law_full_text;
  assert.equal(compareProvision(reviewed, current, "MainProvision-Article_3").status, "changed");
  assert.equal(compareProvision(reviewed, current, "MainProvision-Article_3_2").status, "unchanged");
  assert.equal(compareProvision(reviewed, current, "MainProvision-Article_4").status, "missing");
  assert.equal(compareProvision(reviewed, current, "MainProvision-Article_9").status, "not_in_reviewed");
  assert.deepEqual(compareProvision(reviewed, current, "SupplProvision[2]-Article_1"), { elm: "SupplProvision[2]-Article_1", status: "shifted", newElm: "SupplProvision[3]-Article_1", textChanged: false });
  assert.equal(compareProvision(reviewed, current, "AppdxTable[1]").status, "unchanged");
  assert.equal(compareProvision(undefined, current, "MainProvision-Article_3").status, "not_compared");
});

test("only laws whose current revision differs from the reviewed revision become amendment issues", async () => {
  const { fetcher } = fixtureFetcher({ [`law_revisions/${M1}`]: () => json({ revisions: [{ law_revision_id: `${M1}_20200401_000000000000000`, current_revision_status: "CurrentEnforced", amendment_law_id: null, amendment_law_num: null, amendment_promulgate_date: null, amendment_enforcement_date: "2020-04-01" }] }) });
  const { tracker, created } = fakeGitHub();
  const result = await runMonitor({ data: await monitorData(), detectedAt: DETECTED_AT, fetcher, sleep: noSleep, tracker });

  assert.deepEqual(result.sources, [{ source_id: EGOV_SOURCE_ID, status: "monitored", summary: { laws: 3, unchanged: 2, revised: 1, failed: 0 } }]);
  const { checks } = await monitorEgov((await monitorData()).sources.sources[0]!, { data: await monitorData(), detectedAt: DETECTED_AT, fetcher, sleep: noSleep });
  assert.equal(byLaw(checks, L1).kind, "revised");
  assert.equal(byLaw(checks, L2).kind, "unchanged");
  assert.equal(byLaw(checks, M1).kind, "unchanged");
  assert.equal(created.length, 1);
  const [issue] = created;
  assert.equal(issue!.key, revisionKey(EGOV_SOURCE_ID, L1, CURRENT));
  assert.deepEqual(markersIn(issue!.body), [revisionKey(EGOV_SOURCE_ID, L1, CURRENT)]);
  assert.match(issue!.title, /^\[改正検知\] 例示税法（999AC0000000001）/);
  for (const expected of [REVIEWED, CURRENT, `${L1}_20260401_507AC0000000996`, "https://example.com/laws/999AC0000000001", `${BASE}law_revisions/${L1}`, DETECTED_AT,
    "| `MainProvision-Article_3` | 本文が変わった | nt-000001、nt-000002 |", "| `MainProvision-Article_4` | 現在施行中の版に見つからない | nt-000003 |",
    "新しい指定: `SupplProvision[3]-Article_1`、本文は変わらない"]) {
    assert.ok(issue!.body.includes(expected), `missing ${expected}\n${issue!.body}`);
  }
  // 施行前の版はまだ検知しない
  assert.ok(!issue!.body.includes(`${L1}_20280401_508AC0000000998`), issue!.body);
});

test("no issue is created while an open issue for the same law and revision exists", async () => {
  const { fetcher } = fixtureFetcher({ [`law_revisions/${M1}`]: () => json({ code: "404001" }, 404) });
  const { tracker, created } = fakeGitHub(new Set([revisionKey(EGOV_SOURCE_ID, L1, CURRENT)]));
  const result = await runMonitor({ data: await monitorData(), detectedAt: DETECTED_AT, fetcher, sleep: noSleep, tracker });
  assert.deepEqual(result.skipped.map((issue) => issue.key), [revisionKey(EGOV_SOURCE_ID, L1, CURRENT)]);
  assert.deepEqual(created.map((issue) => issue.key), [failureKey(EGOV_SOURCE_ID, M1, "fetch_failed")]);
});

test("fetch failures and format changes are reported separately from amendments", async () => {
  const cases: [string, () => Response, string, RegExp][] = [
    ["HTTP error", () => json({ message: "error" }, 503), "fetch_failed", /HTTP 503/],
    ["not found", () => json({ code: "404001" }, 404), "fetch_failed", /HTTP 404/],
    ["missing revisions", () => json({ items: [] }), "unexpected_format", /revisions の配列がない/],
    ["missing fields", () => json({ revisions: [{ law_revision_id: "x" }] }), "unexpected_format", /必要な項目/],
    ["no current revision", () => json({ revisions: [] }), "unexpected_format", /CurrentEnforced/],
    ["not JSON", () => new Response("<html>", { status: 200 }), "unexpected_format", /JSONとして解析できない/]
  ];
  for (const [label, respond, kind, message] of cases) {
    const { fetcher } = fixtureFetcher({ [`law_revisions/${M1}`]: respond });
    const { tracker, created } = fakeGitHub();
    await runMonitor({ data: await monitorData(), detectedAt: DETECTED_AT, fetcher, sleep: noSleep, tracker, lawIds: [M1] });
    assert.equal(created.length, 1, label);
    const [issue] = created;
    assert.equal(issue!.key, failureKey(EGOV_SOURCE_ID, M1, kind), label);
    assert.match(issue!.title, /^\[監視エラー\]/, label);
    assert.match(issue!.body, message, label);
    assert.match(issue!.body, /改正の検知ではない/, label);
  }
});

test("network errors are retried before being reported", async () => {
  let calls = 0;
  const { fetcher } = fixtureFetcher({ [`law_revisions/${L2}`]: () => { calls++; if (calls < 3) throw new TypeError("fetch failed"); return json({ revisions: [{ law_revision_id: `${L2}_20200401_000000000000000`, current_revision_status: "CurrentEnforced", amendment_law_id: null, amendment_law_num: null, amendment_promulgate_date: null, amendment_enforcement_date: null }] }); } });
  const result = await runMonitor({ data: await monitorData(), detectedAt: DETECTED_AT, fetcher, sleep: noSleep, lawIds: [L2] });
  assert.equal(calls, 3);
  assert.equal(result.sources[0]!.summary!.unchanged, 1);
});

test("requests keep the configured interval", async () => {
  let clock = 0;
  const waits: number[] = [];
  const { fetcher } = fixtureFetcher();
  const client = new EgovClient({ baseUrl: BASE, intervalMs: 1000, fetcher, now: () => clock, sleep: async (ms: number) => { waits.push(ms); clock += ms; } });
  await client.revisions(L1);
  clock += 300;
  await client.revisions(L2);
  assert.deepEqual(waits, [700]);
});

test("a dry run creates no issues and the API base URL comes from config/sources.yaml", async () => {
  const { fetcher, requested } = fixtureFetcher({ [`law_revisions/${M1}`]: () => json({ code: "404001" }, 404) });
  const result = await runMonitor({ data: await monitorData(), detectedAt: DETECTED_AT, fetcher, sleep: noSleep });
  assert.equal(result.planned.length, 2);
  assert.deepEqual(result.created, []);
  assert.ok(requested.every((url) => url.startsWith(BASE)), requested.join("\n"));
});

test("each enabled source in config/sources.yaml is monitored, and sources without a monitor are reported", async () => {
  const data = await monitorData();
  data.sources.sources.push(
    { source_id: "example-page", name: "例示の公表ページ", base_url: "https://page.example.test/", rate_limit: "テスト用", request_interval_ms: 0, enabled: true },
    { source_id: "example-disabled", name: "無効な巡回先", base_url: "https://disabled.example.test/", rate_limit: "テスト用", request_interval_ms: 0, enabled: false }
  );
  const { fetcher, requested } = fixtureFetcher({ [`law_revisions/${M1}`]: () => json({ code: "404001" }, 404) });
  const logs: string[] = [];
  const result = await runMonitor({ data, detectedAt: DETECTED_AT, fetcher, sleep: noSleep, log: (message) => logs.push(message) });
  assert.deepEqual(result.sources.map(({ source_id, status }) => ({ source_id, status })), [
    { source_id: "egov-law-api", status: "monitored" },
    { source_id: "example-page", status: "not_implemented" },
    { source_id: "example-disabled", status: "disabled" }
  ]);
  assert.ok(requested.every((url) => url.startsWith(BASE)), requested.join("\n"));
  assert.ok(logs.some((line) => line.includes("example-page: 監視の処理が未実装")), logs.join("\n"));

  const only = await runMonitor({ data, detectedAt: DETECTED_AT, fetcher, sleep: noSleep, sourceIds: ["example-page"] });
  assert.deepEqual(only.sources, [{ source_id: "example-page", status: "not_implemented" }]);
  assert.deepEqual(only.planned, []);
});

test("source and law filters are validated", async () => {
  const data = await monitorData();
  const { fetcher } = fixtureFetcher();
  await assert.rejects(runMonitor({ data, detectedAt: DETECTED_AT, fetcher, sourceIds: ["missing-source"] }), /config\/sources.yaml にない source_id: missing-source/);
  await assert.rejects(runMonitor({ data, detectedAt: DETECTED_AT, fetcher, lawIds: ["999AC0000000099"] }), /data\/legal-sources.yaml にない law_id/);
  data.sources.sources[0]!.enabled = false;
  await assert.rejects(runMonitor({ data, detectedAt: DETECTED_AT, fetcher, lawIds: [L1] }), /有効な egov-law-api/);
  const result = await runMonitor({ data, detectedAt: DETECTED_AT, fetcher });
  assert.deepEqual(result.sources, [{ source_id: "egov-law-api", status: "disabled" }]);
});

test("GitHubIssues reads markers from open issues only and creates issues by POST", async () => {
  const calls: { url: string; method: string; body?: string }[] = [];
  const page = (n: number) => Array.from({ length: n }, (_, i) => ({ body: `<!-- monitor: revision A ${i} -->` }));
  const fetcher: Fetcher = async (input, init) => {
    const url = String(input);
    calls.push({ url, method: init?.method ?? "GET", body: init?.body as string | undefined });
    if (init?.method === "POST") return json({ html_url: "https://github.com/o/r/issues/1" }, 201);
    if (url.endsWith("page=1")) return json([...page(99), { body: "<!-- monitor: revision PR -->", pull_request: {} }]);
    return json([{ body: "<!-- monitor: failure B fetch_failed -->" }, { body: null }]);
  };
  const github = new GitHubIssues({ repository: "o/r", token: "t", api: "https://api.example.test", fetcher });
  const keys = await github.openIssueKeys();
  assert.equal(keys.size, 100);
  assert.ok(keys.has("failure B fetch_failed"));
  assert.ok(!keys.has("revision PR"));
  assert.equal(await github.create({ key: "k", title: "t", body: "b" }), "https://github.com/o/r/issues/1");
  assert.deepEqual(calls.map((call) => `${call.method} ${call.url}`), [
    "GET https://api.example.test/repos/o/r/issues?state=open&per_page=100&page=1",
    "GET https://api.example.test/repos/o/r/issues?state=open&per_page=100&page=2",
    "POST https://api.example.test/repos/o/r/issues"
  ]);
  assert.deepEqual(JSON.parse(calls[2]!.body!), { title: "t", body: "b" });
});

test("the monitor workflow runs daily at 6:00 JST and manually, read-only for contents, and limited to issues", async () => {
  const workflow = await readFile(join(ROOT, ".github/workflows/monitor.yml"), "utf8");
  assert.match(workflow, /^permissions:\n  contents: read\n  issues: write\n\n/m);
  assert.match(workflow, /^on:\n  schedule:\n    - cron: "0 21 \* \* \*"\n  workflow_dispatch:\n/m, "定期実行の時刻の変更はユーザーの判断で行う（#171）");
  assert.match(workflow, /DRY_RUN: \$\{\{ github\.event_name == 'workflow_dispatch' && inputs\.dry_run \|\| 'false' \}\}/, "定期実行はIssueを作成する");
  assert.doesNotMatch(workflow, /contents: write|git push/);
});

test("source-specific monitors build URLs from config and data, not from literals", async () => {
  const { readdir } = await import("node:fs/promises");
  for (const name of ["egov", "mhlw"]) {
    const directory = join(ROOT, "src/monitor", name);
    for (const file of await readdir(directory)) {
      const source = await readFile(join(directory, file), "utf8");
      assert.doesNotMatch(source, /https?:\/\//, `${name}/${file} must not contain URLs (AGENTS.md)`);
    }
  }
});
