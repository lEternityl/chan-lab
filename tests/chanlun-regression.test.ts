import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { analyzeChanlun, type Bar } from "../lib/chanlun";

async function loadFixture(file = "601899-day-1y.json") {
  const raw = await readFile(new URL(`./fixtures/${file}`, import.meta.url), "utf8");
  return JSON.parse(raw) as { bars: Bar[] };
}

test("601899 identifies the 24.42 trend-divergence low without future data", async () => {
  const { bars } = await loadFixture();
  const analysis = analyzeChanlun(bars, {
    minStrokeGap: 5,
    divergenceRatio: 0.8,
    centerSource: "strokes",
  });

  const firstBuy = analysis.events.find((event) => event.type === "B1" && event.structureAt === "2026-07-01");
  assert.ok(firstBuy);
  assert.equal(firstBuy.price, 24.42);
  assert.equal(firstBuy.confirmedAt, "2026-07-02");
  assert.equal(firstBuy.earliestTradeAt, "2026-07-03");
  assert.match(firstBuy.reason, /A-B-C.*0\.38/);

  const divergence = analysis.divergences.find((item) => item.structureAt === "2026-07-01");
  assert.ok(divergence);
  assert.equal(divergence.aComponentPos, 9);
  assert.equal(divergence.componentPos, 15);
  assert.ok(divergence.areaRatio < 0.8);
});

test("601899 keeps B2/B3 overlap and does not reuse overlapping centers", async () => {
  const { bars } = await loadFixture();
  const analysis = analyzeChanlun(bars, {
    minStrokeGap: 5,
    divergenceRatio: 0.8,
    centerSource: "strokes",
  });

  const augustTypes = analysis.events
    .filter((event) => event.structureAt === "2026-08-04" && event.price === 31.69)
    .map((event) => event.type)
    .sort();
  assert.deepEqual(augustTypes, ["B2", "B3"]);
  assert.equal(analysis.events.some((event) => event.type === "B3" && event.structureAt === "2025-11-24"), false);
  assert.equal(analysis.events.some((event) => event.type === "B3" && event.structureAt === "2026-04-29"), false);

  for (let index = 1; index < analysis.centers.length; index += 1) {
    assert.ok(analysis.centers[index - 1].extensionEndPos <= analysis.centers[index].baseStartPos);
  }
  assert.equal(analysis.centers.at(-1)?.confirmedAt, "2026-08-18");
});

test("the 24.42 bottom remains structural across stroke-gap sensitivity", async () => {
  const { bars } = await loadFixture();
  const samples = [3, 4, 5].map((minStrokeGap) => analyzeChanlun(bars, {
    minStrokeGap,
    divergenceRatio: 0.8,
    centerSource: "strokes",
  }));

  for (const sample of samples) {
    assert.ok(sample.fractals.some((item) => item.kind === "bottom" && item.structureAt === "2026-07-01" && item.price === 24.42));
    assert.ok(sample.strokes.some((item) => item.direction === "down" && item.structureAt === "2026-07-01" && item.endPrice === 24.42));
  }
  assert.equal(samples.filter((sample) => sample.events.some((event) => event.type === "B1" && event.structureAt === "2026-07-01")).length, 1);
});

test("000426 finds the 26.30 B1 when C also finishes the last center", async () => {
  const { bars } = await loadFixture("000426-day-1y.json");
  const samples = [3, 4, 5].map((minStrokeGap) => analyzeChanlun(bars, {
    minStrokeGap,
    divergenceRatio: 0.8,
    centerSource: "strokes",
  }));

  for (const sample of samples) {
    const firstBuy = sample.events.find((event) => event.type === "B1" && event.structureAt === "2026-07-20");
    assert.ok(firstBuy);
    assert.equal(firstBuy.price, 26.3);
    assert.equal(firstBuy.confirmedAt, "2026-07-21");
    assert.equal(firstBuy.earliestTradeAt, "2026-07-22");
  }

  const strict = samples[2];
  const divergence = strict.divergences.find((item) => item.structureAt === "2026-07-20");
  assert.ok(divergence);
  assert.equal(divergence.aComponentPos, 8);
  assert.equal(divergence.componentPos, 12);
  assert.ok(divergence.areaRatio < 0.32);
  assert.equal(strict.centers[1].ZD > strict.centers[2].ZG, true);
});
