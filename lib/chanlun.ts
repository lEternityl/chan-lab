export type Bar = {
  index: number;
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type Fractal = {
  id: number;
  kind: "top" | "bottom";
  price: number;
  stdIndex: number;
  structureIndex: number;
  structureAt: string;
  confirmedIndex: number;
  confirmedAt: string;
  tradeIndex: number | null;
};

export type Component = {
  id: number;
  direction: "up" | "down";
  startPrice: number;
  endPrice: number;
  low: number;
  high: number;
  startIndex: number;
  endIndex: number;
  structureAt: string;
  confirmedIndex: number;
  confirmedAt: string;
};

export type Center = {
  id: number;
  source: "strokes" | "segments";
  baseStartPos: number;
  baseEndPos: number;
  extensionEndPos: number;
  ZD: number;
  ZG: number;
  GG: number;
  DD: number;
  startIndex: number;
  endIndex: number;
  structureIndex: number;
  structureAt: string;
  confirmedIndex: number;
  confirmedAt: string;
};

export type MacdRow = { diff: number; dea: number; hist: number };

export type Divergence = {
  id: number;
  kind: "top" | "bottom";
  direction: "up" | "down";
  centerId: number;
  aComponentPos: number;
  componentPos: number;
  areaA: number;
  areaC: number;
  areaRatio: number;
  zeroAxisDistance: number;
  structureIndex: number;
  structureAt: string;
  confirmedIndex: number;
  confirmedAt: string;
};

export type Event = {
  id: number;
  type: "B1" | "B2" | "B3" | "S1" | "S2" | "S3";
  side: "buy" | "sell";
  centerId: number | null;
  componentId: number;
  level: "笔级代理" | "线段级候选";
  confidence: "中" | "低";
  centerZD: number | null;
  centerZG: number | null;
  price: number;
  structureIndex: number;
  structureAt: string;
  confirmedIndex: number;
  confirmedAt: string;
  tradeIndex: number | null;
  earliestTradeAt: string | null;
  reason: string;
};

export type ChanAnalysis = {
  bars: Bar[];
  fractals: Fractal[];
  strokes: Component[];
  segments: Component[];
  centers: Center[];
  macd: MacdRow[];
  divergences: Divergence[];
  events: Event[];
  parameters: {
    minStrokeGap: number;
    divergenceRatio: number;
    centerSource: "strokes" | "segments";
  };
};

type StandardBar = Bar & {
  stdIndex: number;
  origStart: number;
  origEnd: number;
  endTimestamp: string;
};

function contains(a: StandardBar, b: StandardBar) {
  return a.high >= b.high && a.low <= b.low;
}

function normalizeInclusions(bars: Bar[]): StandardBar[] {
  const output: StandardBar[] = [];
  let direction = 0;

  for (const raw of bars) {
    const current: StandardBar = {
      ...raw,
      stdIndex: output.length,
      origStart: raw.index,
      origEnd: raw.index,
      endTimestamp: raw.timestamp,
    };
    if (!output.length) {
      output.push(current);
      continue;
    }

    const last = output[output.length - 1];
    if (!contains(last, current) && !contains(current, last)) {
      if (current.high > last.high && current.low > last.low) direction = 1;
      else if (current.high < last.high && current.low < last.low) direction = -1;
      else if (current.close !== last.close) direction = current.close > last.close ? 1 : -1;
      current.stdIndex = output.length;
      output.push(current);
      continue;
    }

    if (direction === 0 && output.length >= 2) {
      const previous = output[output.length - 2];
      if (last.high > previous.high && last.low > previous.low) direction = 1;
      else if (last.high < previous.high && last.low < previous.low) direction = -1;
    }
    if (direction === 0 && current.close !== last.close) {
      direction = current.close > last.close ? 1 : -1;
    }
    if (direction === 0) direction = 1;

    last.high = direction > 0 ? Math.max(last.high, current.high) : Math.min(last.high, current.high);
    last.low = direction > 0 ? Math.max(last.low, current.low) : Math.min(last.low, current.low);
    last.close = current.close;
    last.volume += current.volume;
    last.origEnd = current.origEnd;
    last.endTimestamp = current.endTimestamp;
  }
  return output.map((bar, index) => ({ ...bar, stdIndex: index }));
}

function findFractals(standard: StandardBar[], bars: Bar[]): Fractal[] {
  const output: Fractal[] = [];
  for (let i = 1; i < standard.length - 1; i += 1) {
    const [left, middle, right] = [standard[i - 1], standard[i], standard[i + 1]];
    let kind: Fractal["kind"] | null = null;
    let price = 0;
    if (
      middle.high > left.high &&
      middle.high > right.high &&
      middle.low > left.low &&
      middle.low > right.low
    ) {
      kind = "top";
      price = middle.high;
    } else if (
      middle.low < left.low &&
      middle.low < right.low &&
      middle.high < left.high &&
      middle.high < right.high
    ) {
      kind = "bottom";
      price = middle.low;
    }
    if (!kind) continue;
    const confirmedIndex = right.origEnd;
    output.push({
      id: output.length + 1,
      kind,
      price,
      stdIndex: i,
      structureIndex: middle.origEnd,
      structureAt: middle.endTimestamp,
      confirmedIndex,
      confirmedAt: right.endTimestamp,
      tradeIndex: confirmedIndex + 1 < bars.length ? confirmedIndex + 1 : null,
    });
  }
  return output;
}

function buildStrokes(fractals: Fractal[], minGap: number): Component[] {
  const pivots: Fractal[] = [];
  for (const fractal of fractals) {
    const last = pivots[pivots.length - 1];
    if (!last) {
      pivots.push(fractal);
      continue;
    }
    if (fractal.kind === last.kind) {
      const moreExtreme = fractal.kind === "top" ? fractal.price > last.price : fractal.price < last.price;
      if (moreExtreme) pivots[pivots.length - 1] = fractal;
      continue;
    }
    const priceValid = last.kind === "bottom" ? fractal.price > last.price : fractal.price < last.price;
    if (fractal.stdIndex - last.stdIndex >= minGap && priceValid) pivots.push(fractal);
  }

  return pivots.slice(0, -1).map((start, index) => {
    const end = pivots[index + 1];
    return {
      id: index + 1,
      direction: start.kind === "bottom" ? "up" : "down",
      startPrice: start.price,
      endPrice: end.price,
      low: Math.min(start.price, end.price),
      high: Math.max(start.price, end.price),
      startIndex: start.structureIndex,
      endIndex: end.structureIndex,
      structureAt: end.structureAt,
      confirmedIndex: end.confirmedIndex,
      confirmedAt: end.confirmedAt,
    };
  });
}

function buildSegments(strokes: Component[]): Component[] {
  const segments: Component[] = [];
  let i = 0;
  while (i + 2 < strokes.length) {
    const group = strokes.slice(i, i + 3);
    const overlapLow = Math.max(...group.map((item) => item.low));
    const overlapHigh = Math.min(...group.map((item) => item.high));
    if (overlapLow <= overlapHigh && group[0].direction === group[2].direction) {
      const start = group[0];
      const end = group[2];
      segments.push({
        id: segments.length + 1,
        direction: start.direction,
        startPrice: start.startPrice,
        endPrice: end.endPrice,
        low: Math.min(...group.map((item) => item.low)),
        high: Math.max(...group.map((item) => item.high)),
        startIndex: start.startIndex,
        endIndex: end.endIndex,
        structureAt: end.structureAt,
        confirmedIndex: end.confirmedIndex,
        confirmedAt: end.confirmedAt,
      });
      i += 3;
    } else i += 1;
  }
  return segments;
}

function buildCenters(components: Component[], source: Center["source"]): Center[] {
  const centers: Center[] = [];
  let i = 0;
  while (i + 2 < components.length) {
    const triple = components.slice(i, i + 3);
    const ZD = Math.max(...triple.map((item) => item.low));
    const ZG = Math.min(...triple.map((item) => item.high));
    if (ZD > ZG) {
      i += 1;
      continue;
    }
    let extensionEndPos = i + 2;
    let cursor = i + 3;
    while (cursor < components.length && components[cursor].low <= ZG && components[cursor].high >= ZD) {
      extensionEndPos = cursor;
      cursor += 1;
    }
    const members = components.slice(i, extensionEndPos + 1);
    const baseEnd = triple[2];
    centers.push({
      id: centers.length + 1,
      source,
      baseStartPos: i,
      baseEndPos: i + 2,
      extensionEndPos,
      ZD,
      ZG,
      GG: Math.max(...members.map((item) => item.high)),
      DD: Math.min(...members.map((item) => item.low)),
      startIndex: triple[0].startIndex,
      endIndex: members[members.length - 1].endIndex,
      structureIndex: baseEnd.endIndex,
      structureAt: baseEnd.structureAt,
      confirmedIndex: baseEnd.confirmedIndex,
      confirmedAt: baseEnd.confirmedAt,
    });
    // An extended center is one same-level structure. The next scan may share
    // its final component as a connector, but must not restart inside it.
    i = extensionEndPos;
  }
  return centers;
}

function ema(values: number[], period: number) {
  const alpha = 2 / (period + 1);
  const result = [values[0]];
  for (const value of values.slice(1)) result.push(alpha * value + (1 - alpha) * result[result.length - 1]);
  return result;
}

function calculateMacd(bars: Bar[]): MacdRow[] {
  const closes = bars.map((bar) => bar.close);
  const fast = ema(closes, 12);
  const slow = ema(closes, 26);
  const diff = fast.map((value, index) => value - slow[index]);
  const dea = ema(diff, 9);
  return diff.map((value, index) => ({ diff: value, dea: dea[index], hist: 2 * (value - dea[index]) }));
}

function componentArea(component: Component, macd: MacdRow[]) {
  return macd.slice(component.startIndex, component.endIndex + 1).reduce((sum, row) => {
    return sum + (component.direction === "up" ? Math.max(row.hist, 0) : Math.max(-row.hist, 0));
  }, 0);
}

function centerTrendDirection(left: Center, right: Center): Component["direction"] | null {
  if (left.ZD > right.ZG) return "down";
  if (left.ZG < right.ZD) return "up";
  return null;
}

function findDivergences(
  centers: Center[],
  components: Component[],
  macd: MacdRow[],
  ratioLimit: number,
): Divergence[] {
  const output: Divergence[] = [];
  let chainStart = 0;
  while (chainStart + 1 < centers.length) {
    const direction = centerTrendDirection(centers[chainStart], centers[chainStart + 1]);
    if (!direction) {
      chainStart += 1;
      continue;
    }

    // A trend is a maximal chain of at least two same-direction,
    // non-overlapping same-level centers. Its A leg connects the first two
    // centers; its C leg may also be the component that finishes and leaves
    // the last center, so neither leg is required to sit wholly outside it.
    let chainEnd = chainStart + 1;
    while (
      chainEnd + 1 < centers.length &&
      centerTrendDirection(centers[chainEnd], centers[chainEnd + 1]) === direction
    ) {
      chainEnd += 1;
    }

    const first = centers[chainStart];
    const second = centers[chainStart + 1];
    const last = centers[chainEnd];
    let aPos = -1;
    for (let position = first.baseEndPos; position <= second.baseStartPos; position += 1) {
      if (components[position]?.direction === direction) {
        aPos = position;
        break;
      }
    }

    const cCandidates: number[] = [];
    if (aPos >= 0) {
      const a = components[aPos];
      for (let position = last.baseEndPos; position <= last.extensionEndPos; position += 1) {
        const component = components[position];
        if (!component || component.direction !== direction) continue;
        const leavesCenter = direction === "down" ? component.endPrice < last.ZD : component.endPrice > last.ZG;
        const newExtreme = direction === "down" ? component.endPrice < a.endPrice : component.endPrice > a.endPrice;
        if (leavesCenter && newExtreme) cCandidates.push(position);
      }
    }

    if (aPos >= 0 && cCandidates.length) {
      const cPos = cCandidates.reduce((selected, position) => {
        if (direction === "down") {
          return components[position].endPrice < components[selected].endPrice ? position : selected;
        }
        return components[position].endPrice > components[selected].endPrice ? position : selected;
      });
      const a = components[aPos];
      const c = components[cPos];
      const areaA = componentArea(a, macd);
      const areaC = componentArea(c, macd);
      if (areaA > 0 && areaC > 0 && areaC / areaA < ratioLimit) {
        const zeroAxisRows = macd.slice(a.endIndex, c.startIndex + 1);
        const zeroAxisDistance = zeroAxisRows.length
          ? Math.min(...zeroAxisRows.flatMap((row) => [Math.abs(row.diff), Math.abs(row.dea)]))
          : Number.POSITIVE_INFINITY;
        output.push({
          id: output.length + 1,
          kind: direction === "up" ? "top" : "bottom",
          direction,
          centerId: last.id,
          aComponentPos: aPos,
          componentPos: cPos,
          areaA,
          areaC,
          areaRatio: areaC / areaA,
          zeroAxisDistance,
          structureIndex: c.endIndex,
          structureAt: c.structureAt,
          confirmedIndex: c.confirmedIndex,
          confirmedAt: c.confirmedAt,
        });
      }
    }
    chainStart = chainEnd;
  }
  return output;
}

function makeEvent(
  type: Event["type"],
  component: Component,
  bars: Bar[],
  center: Center | null,
  source: Center["source"],
  reason: string,
): Event {
  const tradeIndex = component.confirmedIndex + 1 < bars.length ? component.confirmedIndex + 1 : null;
  return {
    id: 0,
    type,
    side: type.startsWith("B") ? "buy" : "sell",
    centerId: center?.id ?? null,
    componentId: component.id,
    level: source === "strokes" ? "笔级代理" : "线段级候选",
    confidence: source === "strokes" ? "中" : "低",
    centerZD: center?.ZD ?? null,
    centerZG: center?.ZG ?? null,
    price: component.endPrice,
    structureIndex: component.endIndex,
    structureAt: component.structureAt,
    confirmedIndex: component.confirmedIndex,
    confirmedAt: component.confirmedAt,
    tradeIndex,
    earliestTradeAt: tradeIndex === null ? null : bars[tradeIndex].timestamp,
    reason,
  };
}

function findEvents(
  divergences: Divergence[],
  centers: Center[],
  components: Component[],
  bars: Bar[],
  source: Center["source"],
): Event[] {
  const events: Event[] = [];
  for (const divergence of divergences) {
    const c = components[divergence.componentPos];
    const center = centers.find((item) => item.id === divergence.centerId) ?? null;
    const firstType: Event["type"] = c.direction === "up" ? "S1" : "B1";
    events.push(makeEvent(
      firstType,
      c,
      bars,
      center,
      source,
      `同级别 A-B-C 趋势背驰候选（MACD 面积比 ${divergence.areaRatio.toFixed(2)}）`,
    ));
    const second = components[divergence.componentPos + 2];
    if (!second) continue;
    if (firstType === "B1" && second.direction === "down" && second.endPrice > c.endPrice) {
      events.push(makeEvent("B2", second, bars, center, source, "一买后首次回调未创新低候选"));
    } else if (firstType === "S1" && second.direction === "up" && second.endPrice < c.endPrice) {
      events.push(makeEvent("S2", second, bars, center, source, "一卖后首次回抽未创新高候选"));
    }
  }

  for (const center of centers) {
    // A third point must use the immediate retest after a departure. Scan only
    // the center's own evolution; do not skip ahead to an unrelated oscillation.
    for (let leavePos = center.baseEndPos; leavePos <= center.extensionEndPos; leavePos += 1) {
      const leave = components[leavePos];
      const retest = components[leavePos + 1];
      if (!retest) break;
      if (
        leave.direction === "up" &&
        leave.endPrice > center.ZG &&
        retest.direction === "down" &&
        retest.endPrice > center.ZG
      ) {
        events.push(makeEvent("B3", retest, bars, center, source, "向上离开后的首次回试不回中枢候选"));
        break;
      }
      if (
        leave.direction === "down" &&
        leave.endPrice < center.ZD &&
        retest.direction === "up" &&
        retest.endPrice < center.ZD
      ) {
        events.push(makeEvent("S3", retest, bars, center, source, "向下离开后的首次回抽不回中枢候选"));
        break;
      }
    }
  }

  const unique = new Map<string, Event>();
  for (const event of events) {
    const key = `${event.type}-${event.structureIndex}`;
    const previous = unique.get(key);
    if (!previous || (event.centerId ?? -1) > (previous.centerId ?? -1)) unique.set(key, event);
  }
  return [...unique.values()]
    .sort((a, b) => a.confirmedIndex - b.confirmedIndex || a.type.localeCompare(b.type))
    .map((event, index) => ({ ...event, id: index + 1 }));
}

export function analyzeChanlun(
  input: Omit<Bar, "index">[] | Bar[],
  options: Partial<ChanAnalysis["parameters"]> = {},
): ChanAnalysis {
  if (input.length < 12) throw new Error("至少需要 12 根有效 K 线");
  const bars = input.map((bar, index) => ({ ...bar, index }));
  const parameters = {
    minStrokeGap: options.minStrokeGap ?? 4,
    divergenceRatio: options.divergenceRatio ?? 0.8,
    centerSource: options.centerSource ?? ("strokes" as const),
  };
  const standard = normalizeInclusions(bars);
  const fractals = findFractals(standard, bars);
  const strokes = buildStrokes(fractals, parameters.minStrokeGap);
  const segments = buildSegments(strokes);
  const components = parameters.centerSource === "segments" ? segments : strokes;
  const centers = buildCenters(components, parameters.centerSource);
  const macd = calculateMacd(bars);
  const divergences = findDivergences(centers, components, macd, parameters.divergenceRatio);
  const events = findEvents(divergences, centers, components, bars, parameters.centerSource);
  return { bars, fractals, strokes, segments, centers, macd, divergences, events, parameters };
}
