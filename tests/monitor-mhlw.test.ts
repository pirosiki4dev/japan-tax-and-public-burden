import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { loadRepository } from "../src/data/repository.ts";
import { validateRepository } from "../src/data/validate-repository.ts";
import type { RepositoryData } from "../src/domain/repository.ts";
import type { LegalSources, PublishedDocument } from "../src/domain/types.generated.ts";
import type { Fetcher } from "../src/monitor/http.ts";
import { GitHubIssues, markersIn, type PlannedIssue } from "../src/monitor/issues.ts";
import { documentLinks } from "../src/monitor/mhlw/page.ts";
import { MHLW_EMPLOYMENT_INSURANCE_RATE_SOURCE_ID as SOURCE_ID, runMonitor } from "../src/monitor/run.ts";
import { copyRepository, readFixture, ROOT, SCHEMA_DIR, VALID_REPO } from "./helpers.ts";

const PAGE_URL = "https://www.mhlw.example.test/stf/seisakunitsuite/bunya/0000108634.html";
const ORIGIN = "https://www.mhlw.example.test";
const DETECTED_AT = "2026-11-08T18:00:00+09:00";
const PDF_IDS = ["001692566", "001401966", "001211914", "001050206", "000921550", "000739455"];
const TITLES = ["令和８年度の雇用保険料率について［352KB］", "令和7年度の雇用保険料率について［342KB］", "令和6年度の雇用保険料率について［98KB］", "令和５年度の雇用保険料率について［316KB］", "令和４年度の雇用保険料率について［110KB］", "令和３年度の雇用保険料率について［106KB］"];

const pageHtml = (): Promise<string> => readFile(join(ROOT, "tests/fixtures/mhlw/employment-insurance-rate.html"), "utf8");
const pdfBytes = (id: string): Uint8Array => new TextEncoder().encode(`%PDF-1.7 fixture ${id}`);
const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");
const pdfUrl = (id: string): string => `${ORIGIN}/content/${id}.pdf`;
const LATEST_SHA256 = sha256(pdfBytes(PDF_IDS[0]!));
const reviewedDocument = (overrides: Partial<PublishedDocument> = {}): PublishedDocument => ({
  source_id: SOURCE_ID, title: "令和８（2026）年度 雇用保険料率のご案内", reviewed_sha256: LATEST_SHA256, reviewed_at: "2026-11-08T09:00:00+09:00", source_url: pdfUrl(PDF_IDS[0]!), ...overrides
});

/** 保存したページと架空のPDFを返す fetch。外部通信はしない。 */
function siteFetcher(overrides: Record<string, () => Response | Promise<Response>> = {}): { fetcher: Fetcher; requested: string[] } {
  const requested: string[] = [];
  const fetcher: Fetcher = async (input) => {
    const url = String(input);
    requested.push(url);
    if (overrides[url]) return overrides[url]!();
    if (url === PAGE_URL) return new Response(await pageHtml(), { status: 200, headers: { "Content-Type": "text/html" } });
    const id = /\/content\/(\d+)\.pdf$/.exec(url)?.[1];
    if (id && PDF_IDS.includes(id)) return new Response(pdfBytes(id), { status: 200, headers: { "Content-Type": "application/pdf" } });
    return new Response("not found", { status: 404 });
  };
  return { fetcher, requested };
}

async function monitorData(reviewed: PublishedDocument[] = [reviewedDocument()]): Promise<RepositoryData> {
  const { data, errors } = await loadRepository(VALID_REPO, SCHEMA_DIR);
  assert.deepEqual(errors, []);
  data.sources.sources = [{ source_id: SOURCE_ID, name: "厚生労働省「雇用保険料率について」", base_url: PAGE_URL, rate_limit: "テスト用", request_interval_ms: 0, enabled: true }];
  data.publishedDocuments = reviewed;
  data.burdens[0]!.source_urls = [...data.burdens[0]!.source_urls, PAGE_URL];
  return data;
}

function fakeGitHub(open: Set<string> = new Set()): { tracker: GitHubIssues; created: PlannedIssue[] } {
  const created: PlannedIssue[] = [];
  const fetcher: Fetcher = async (_input, init) => {
    if (init?.method === "POST") {
      const { title, body } = JSON.parse(init.body as string) as { title: string; body: string };
      created.push({ key: markersIn(body)[0]!, title, body });
      return new Response(JSON.stringify({ html_url: `https://github.example.test/issues/${created.length}` }), { status: 201 });
    }
    return new Response(JSON.stringify([...open].map((key) => ({ body: `<!-- monitor: ${key} -->` }))), { status: 200 });
  };
  return { tracker: new GitHubIssues({ repository: "o/r", token: "t", api: "https://api.example.test", fetcher }), created };
}

const noSleep = async (): Promise<void> => {};
const run = async (data: RepositoryData, fetcher: Fetcher, tracker?: GitHubIssues) => runMonitor({ data, detectedAt: DETECTED_AT, fetcher, sleep: noSleep, tracker });

test("documentLinks reads the PDF links in the main content of the saved MHLW page", async () => {
  const links = documentLinks(await pageHtml(), PAGE_URL);
  assert.deepEqual(links, PDF_IDS.map((id, i) => ({ title: TITLES[i], url: pdfUrl(id) })));
});

test("documentLinks ignores links outside the main content and non-PDF links, and reports a missing main content", () => {
  const html = `<a href="/content/header.pdf">ヘッダー</a><div class="l-contentMain"><a data-icon="pdf" href="/content/1.pdf">資料&amp;一覧<span>［1KB］</span></a><a href="/other.html">別ページ</a><!-- /.l-contentMain --></div><a href="/content/footer.pdf">フッター</a>`;
  assert.deepEqual(documentLinks(html, PAGE_URL), [{ title: "資料&一覧［1KB］", url: `${ORIGIN}/content/1.pdf` }]);
  assert.equal(documentLinks("<html><body>no main</body></html>", PAGE_URL), undefined);
});

test("only the page and its latest document are fetched, and no issue is created when the SHA-256 matches", async () => {
  const { fetcher, requested } = siteFetcher();
  const { tracker, created } = fakeGitHub();
  const result = await run(await monitorData(), fetcher, tracker);
  assert.deepEqual(result.sources, [{ source_id: SOURCE_ID, status: "monitored", summary: { changed: 0, failed: 0 } }]);
  assert.deepEqual(created, []);
  assert.deepEqual(requested, [PAGE_URL, pdfUrl(PDF_IDS[0]!)]);
});

test("a new latest document produces one change issue with related burdens, and is not duplicated while open", async () => {
  const reviewed = [reviewedDocument({ title: "令和７（2025）年度 雇用保険料率のご案内", reviewed_sha256: sha256(pdfBytes(PDF_IDS[1]!)), source_url: pdfUrl(PDF_IDS[1]!) })];
  const { tracker, created } = fakeGitHub();
  const result = await run(await monitorData(reviewed), siteFetcher().fetcher, tracker);
  assert.equal(created.length, 1);
  const [issue] = created;
  assert.equal(issue!.key, `${SOURCE_ID} change ${LATEST_SHA256.slice(0, 16)}`);
  assert.match(issue!.title, /^\[公表資料の変化\]/);
  for (const expected of ["| 変化 | 新しい資料が掲載された |", `| 最新の資料 | ${TITLES[0]}、${pdfUrl(PDF_IDS[0]!)} |`, `\`${LATEST_SHA256}\``, `\`${reviewed[0]!.reviewed_sha256}\``,
    "- nt-000001 ", PAGE_URL, DETECTED_AT, "`published_documents`"]) {
    assert.ok(issue!.body.includes(expected), `missing ${expected}\n${issue!.body}`);
  }
  assert.equal(result.sources[0]!.summary!.changed, 1);

  // 同じ最新の資料について未完了のIssueがあれば作成しない
  const again = fakeGitHub(new Set([issue!.key]));
  const second = await run(await monitorData(reviewed), siteFetcher().fetcher, again.tracker);
  assert.deepEqual(again.created, []);
  assert.deepEqual(second.skipped.map((skipped) => skipped.key), [issue!.key]);
});

test("a file replaced at the same URL and a missing reviewed document are reported as changes", async () => {
  for (const [reviewed, expected] of [
    [[reviewedDocument({ reviewed_sha256: "0".repeat(64) })], "| 変化 | 同じURLの資料のファイルが差し替えられた |"],
    [[], "| 変化 | 確認済みの資料が未登録 |"]
  ] as const) {
    const { tracker, created } = fakeGitHub();
    await run(await monitorData([...reviewed]), siteFetcher().fetcher, tracker);
    assert.equal(created.length, 1, expected);
    assert.ok(created[0]!.body.includes(expected), `missing ${expected}\n${created[0]!.body}`);
  }
});

test("fetch failures and page structure changes are reported separately from document changes", async () => {
  const cases: [string, Record<string, () => Response>, string, RegExp][] = [
    ["page not found", { [PAGE_URL]: () => new Response("", { status: 404 }) }, "fetch_failed", /ページが見つからない/],
    ["server error", { [PAGE_URL]: () => new Response("", { status: 503 }) }, "fetch_failed", /HTTP 503/],
    ["latest document not found", { [pdfUrl(PDF_IDS[0]!)]: () => new Response("", { status: 404 }) }, "fetch_failed", /最新の資料「令和８年度/],
    ["main content missing", { [PAGE_URL]: () => new Response("<html><body>メンテナンス中</body></html>") }, "unexpected_format", /l-contentMain/],
    ["no documents", { [PAGE_URL]: () => new Response(`<div class="l-contentMain"><p>準備中</p><!-- /.l-contentMain --></div>`) }, "unexpected_format", /PDF）へのリンクがない/]
  ];
  for (const [label, overrides, kind, message] of cases) {
    const { tracker, created } = fakeGitHub();
    await run(await monitorData(), siteFetcher(overrides).fetcher, tracker);
    assert.equal(created.length, 1, label);
    assert.equal(created[0]!.key, `${SOURCE_ID} failure ${kind}`, label);
    assert.match(created[0]!.title, /^\[監視エラー\]/, label);
    assert.match(created[0]!.body, message, label);
    assert.match(created[0]!.body, /公表資料の変化の検知ではない/, label);
  }
});

test("published documents must reference configured sources, be sorted, and have one entry per source", async () => {
  const document = await readFixture<LegalSources>("data/legal-sources.yaml");
  const entry = document.published_documents![0]!;
  document.published_documents = [{ ...entry, source_id: "zz-unknown" }, entry, { ...entry }];
  const { errors } = await validateRepository(await copyRepository({ "data/legal-sources.yaml": document }), { asOf: "2026-11-01", schemaDir: SCHEMA_DIR });
  for (const expected of ["zz-unknown: unknown source_id", "example-source must come after zz-unknown", "duplicate published_documents source_id example-source"]) {
    assert.ok(errors.some((error) => error.includes(expected)), `${expected}\n${errors.join("\n")}`);
  }
});

test("the repository records the latest document of the saved MHLW page, and burdens cite it", async () => {
  const { data } = await loadRepository(ROOT, SCHEMA_DIR);
  const source = data.sources.sources.find((candidate) => candidate.source_id === SOURCE_ID)!;
  const reviewed = data.publishedDocuments.find((candidate) => candidate.source_id === SOURCE_ID)!;
  assert.equal(reviewed.source_url, documentLinks(await pageHtml(), source.base_url)![0]!.url);
  assert.ok(data.burdens.some((burden) => burden.versions.some((version) => version.source_urls.includes(reviewed.source_url))));
});
