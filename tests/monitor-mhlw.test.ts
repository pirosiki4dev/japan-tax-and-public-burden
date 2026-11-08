import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { loadRepository } from "../src/data/repository.ts";
import { validateRepository } from "../src/data/validate-repository.ts";
import type { RepositoryData } from "../src/domain/repository.ts";
import type { PublishedDocument, PublishedSources } from "../src/domain/types.generated.ts";
import type { Fetcher } from "../src/monitor/http.ts";
import { GitHubIssues, markersIn, type PlannedIssue } from "../src/monitor/issues.ts";
import { compareDocuments } from "../src/monitor/mhlw/monitor.ts";
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
const reviewedDocuments = (): PublishedDocument[] => PDF_IDS.map((id, i) => ({ title: TITLES[i]!, url: pdfUrl(id), sha256: sha256(pdfBytes(id)) }));

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

async function monitorData(documents: PublishedDocument[] = reviewedDocuments()): Promise<RepositoryData> {
  const { data, errors } = await loadRepository(VALID_REPO, SCHEMA_DIR);
  assert.deepEqual(errors, []);
  data.sources.sources = [{ source_id: SOURCE_ID, name: "厚生労働省「雇用保険料率について」", base_url: PAGE_URL, rate_limit: "テスト用", request_interval_ms: 0, enabled: true }];
  data.publishedSources = [{ source_id: SOURCE_ID, documents, reviewed_at: "2026-11-08T09:00:00+09:00" }];
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

test("compareDocuments distinguishes added, removed, title and content changes", () => {
  const [a, b, c] = reviewedDocuments();
  const changes = compareDocuments([{ ...a!, title: "新しい題名" }, { ...b!, sha256: "f".repeat(64) }, { title: "新資料", url: `${ORIGIN}/content/new.pdf`, sha256: "e".repeat(64) }], [a!, b!, c!]);
  assert.deepEqual(changes.map((change) => [change.kind, change.document.url]), [
    ["title_changed", a!.url], ["content_changed", b!.url], ["added", `${ORIGIN}/content/new.pdf`], ["removed", c!.url]
  ]);
});

test("no issue is created when the page and its documents match the reviewed state", async () => {
  const { fetcher, requested } = siteFetcher();
  const { tracker, created } = fakeGitHub();
  const result = await run(await monitorData(), fetcher, tracker);
  assert.deepEqual(result.sources, [{ source_id: SOURCE_ID, status: "monitored", summary: { documents: 6, added: 0, removed: 0, title_changed: 0, content_changed: 0, failed: 0 } }]);
  assert.deepEqual(created, []);
  assert.deepEqual(requested, [PAGE_URL, ...PDF_IDS.map(pdfUrl)]);
});

test("a new document, a replaced file, and a removed document produce one change issue with related burdens", async () => {
  const reviewed = reviewedDocuments().slice(1);
  reviewed[0]!.sha256 = "0".repeat(64);
  reviewed.push({ title: "令和２年度の雇用保険料率について", url: pdfUrl("000000001"), sha256: "1".repeat(64) });
  const { fetcher } = siteFetcher();
  const { tracker, created } = fakeGitHub();
  const result = await run(await monitorData(reviewed), fetcher, tracker);
  assert.equal(created.length, 1);
  const [issue] = created;
  assert.match(issue!.key, new RegExp(`^${SOURCE_ID} change [0-9a-f]{16}$`));
  assert.match(issue!.title, /^\[公表資料の変化\]/);
  for (const expected of [`| 掲載された | ${TITLES[0]} | ${pdfUrl(PDF_IDS[0]!)} |`, `| ファイルが変わった（変更前: \`${"0".repeat(64)}\`） |`, "| 掲載されなくなった | 令和２年度の雇用保険料率について |",
    "- nt-000001 ", PAGE_URL, DETECTED_AT, `        sha256: "${sha256(pdfBytes(PDF_IDS[0]!))}"`]) {
    assert.ok(issue!.body.includes(expected), `missing ${expected}\n${issue!.body}`);
  }
  assert.equal(result.sources[0]!.summary!.added, 1);

  // 同じ状態の未完了のIssueがあれば作成しない
  const again = fakeGitHub(new Set([issue!.key]));
  const second = await run(await monitorData(reviewed), siteFetcher().fetcher, again.tracker);
  assert.deepEqual(again.created, []);
  assert.deepEqual(second.skipped.map((skipped) => skipped.key), [issue!.key]);
});

test("fetch failures and page structure changes are reported separately from document changes", async () => {
  const cases: [string, Record<string, () => Response>, string, RegExp][] = [
    ["page not found", { [PAGE_URL]: () => new Response("", { status: 404 }) }, "fetch_failed", /ページが見つからない/],
    ["server error", { [PAGE_URL]: () => new Response("", { status: 503 }) }, "fetch_failed", /HTTP 503/],
    ["document not found", { [pdfUrl(PDF_IDS[2]!)]: () => new Response("", { status: 404 }) }, "fetch_failed", /掲載資料「令和6年度/],
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
    assert.match(created[0]!.body, /掲載資料の変化の検知ではない/, label);
  }
});

test("published sources must reference configured sources, be sorted, and have unique document URLs", async () => {
  const document = await readFixture<PublishedSources>("data/published-sources.yaml");
  const entry = document.published_sources[0]!;
  document.published_sources = [{ ...entry, source_id: "zz-unknown" }, entry];
  entry.documents.push({ ...entry.documents[0]! });
  const { errors } = await validateRepository(await copyRepository({ "data/published-sources.yaml": document }), { asOf: "2026-11-01", schemaDir: SCHEMA_DIR });
  for (const expected of ["zz-unknown: unknown source_id", "example-source must come after zz-unknown", "duplicate document url https://example.com/content/r8.pdf"]) {
    assert.ok(errors.some((error) => error.includes(expected)), `${expected}\n${errors.join("\n")}`);
  }
});

test("the repository's reviewed state of the MHLW page matches the saved page", async () => {
  const { data } = await loadRepository(ROOT, SCHEMA_DIR);
  const source = data.sources.sources.find((candidate) => candidate.source_id === SOURCE_ID)!;
  const published = data.publishedSources.find((candidate) => candidate.source_id === SOURCE_ID)!;
  assert.deepEqual(published.documents.map(({ title, url }) => ({ title, url })), documentLinks(await pageHtml(), source.base_url));
});
