import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the finished Chan Lab dashboard", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>缠镜 Chan Lab｜A 股缠论结构分析台<\/title>/i);
  assert.match(html, /缠镜/);
  assert.match(html, /可审计的市场结构分析台/);
  assert.match(html, /股票代码/);
  assert.match(html, /仅展示已确认结构/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("ships the analysis contract and social preview", async () => {
  const [algorithm, page, packageJson] = await Promise.all([
    readFile(new URL("../lib/chanlun.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    access(new URL("../public/og.png", import.meta.url)),
    access(new URL("../public/favicon.png", import.meta.url)),
  ]);
  assert.match(algorithm, /confirmedIndex/);
  assert.match(algorithm, /earliestTradeAt/);
  assert.match(algorithm, /extensionEndPos/);
  assert.match(page, /不构成投资建议/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});
