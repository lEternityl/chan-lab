"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import ChanChart, { type Layers } from "./ChanChart";
import { analyzeChanlun, type Bar, type ChanAnalysis, type Event } from "@/lib/chanlun";

type MarketData = {
  symbol: string;
  name: string;
  market: string;
  period: "day" | "week" | "month";
  adjustment: string;
  bars: Bar[];
};

const PERIODS = [
  { value: "day", label: "日线" },
  { value: "week", label: "周线" },
  { value: "month", label: "月线" },
] as const;

const EVENT_NAMES: Record<Event["type"], string> = {
  B1: "一类买点",
  B2: "二类买点",
  B3: "三类买点",
  S1: "一类卖点",
  S2: "二类卖点",
  S3: "三类卖点",
};

function price(value?: number) {
  if (value === undefined || !Number.isFinite(value)) return "—";
  return value >= 100 ? value.toFixed(2) : value.toFixed(3);
}

function LoadingView() {
  return (
    <div className="loading-view" aria-live="polite">
      <div className="loading-orbit"><span /><span /><span /></div>
      <p>正在计算包含关系、分型、笔与中枢…</p>
    </div>
  );
}

function Fact({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="fact">
      <span>{label}</span>
      <strong style={accent ? { color: accent } : undefined}>{value}</strong>
    </div>
  );
}

export default function Home() {
  const [query, setQuery] = useState("600519");
  const [period, setPeriod] = useState<MarketData["period"]>("day");
  const [years, setYears] = useState(2);
  const [market, setMarket] = useState<MarketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [minStrokeGap, setMinStrokeGap] = useState(5);
  const [divergenceRatio, setDivergenceRatio] = useState(0.8);
  const [centerSource, setCenterSource] = useState<"strokes" | "segments">("strokes");
  const [layers, setLayers] = useState<Layers>({ strokes: true, centers: true, fractals: true, events: true });

  async function loadMarket(symbol: string, nextPeriod = period, nextYears = years) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        `/api/market?symbol=${encodeURIComponent(symbol)}&period=${nextPeriod}&years=${nextYears}`,
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "行情获取失败");
      setMarket(payload as MarketData);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "行情获取失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadMarket("600519", "day", 2), 0);
    return () => window.clearTimeout(initialLoad);
    // Initial default analysis only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const analysis = useMemo<ChanAnalysis | null>(() => {
    if (!market) return null;
    return analyzeChanlun(market.bars, { minStrokeGap, divergenceRatio, centerSource });
  }, [market, minStrokeGap, divergenceRatio, centerSource]);

  const eventStability = useMemo(() => {
    const counts = new Map<string, number>();
    if (!market) return counts;
    for (const gap of [3, 4, 5]) {
      const sample = analyzeChanlun(market.bars, { minStrokeGap: gap, divergenceRatio, centerSource });
      for (const event of sample.events) {
        const key = `${event.type}-${event.structureAt}`;
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }
    return counts;
  }, [market, divergenceRatio, centerSource]);

  const latest = market?.bars.at(-1);
  const previous = market?.bars.at(-2);
  const change = latest && previous ? latest.close - previous.close : 0;
  const changePercent = latest && previous ? (change / previous.close) * 100 : 0;
  const latestCenter = analysis?.centers.at(-1);
  const latestEvent = analysis?.events.at(-1);
  const latestEvents = latestEvent && analysis
    ? analysis.events.filter((event) => event.structureIndex === latestEvent.structureIndex && event.price === latestEvent.price)
    : [];
  const latestStability = latestEvents.length
    ? Math.min(...latestEvents.map((event) => eventStability.get(`${event.type}-${event.structureAt}`) || 0))
    : 0;
  const associatedCenters = [...new Set(latestEvents.flatMap((event) => event.centerId === null
    ? []
    : [`#${event.centerId} [${price(event.centerZD ?? undefined)}, ${price(event.centerZG ?? undefined)}]`]))];
  const centerState = latest && latestCenter
    ? latest.close > latestCenter.ZG
      ? "价格位于中枢上方"
      : latest.close < latestCenter.ZD
        ? "价格位于中枢下方"
        : "价格处于中枢内部"
    : "尚未形成有效中枢";
  const stateTone = latest && latestCenter
    ? latest.close > latestCenter.ZG
      ? "positive"
      : latest.close < latestCenter.ZD
        ? "negative"
        : "neutral"
    : "neutral";

  function submit(event: FormEvent) {
    event.preventDefault();
    void loadMarket(query);
  }

  function switchPeriod(next: MarketData["period"]) {
    setPeriod(next);
    void loadMarket(query, next, years);
  }

  function switchYears(next: number) {
    setYears(next);
    void loadMarket(query, period, next);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">缠</span>
          <div>
            <h1>缠镜 <em>CHAN LAB</em></h1>
            <p>可审计的市场结构分析台</p>
          </div>
        </div>

        <form className="search-form" onSubmit={submit}>
          <label htmlFor="stock-code">股票代码</label>
          <div className="search-box">
            <span className="search-icon">⌕</span>
            <input
              id="stock-code"
              inputMode="numeric"
              value={query}
              maxLength={9}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="输入 6 位沪深 A 股代码"
              aria-label="输入 6 位沪深 A 股代码"
            />
            <button type="submit" disabled={loading}>{loading ? "分析中" : "开始分析"}</button>
          </div>
        </form>

        <div className="header-meta">
          <span className="live-dot" />
          <span>行情接入正常</span>
          <small>{latest?.timestamp || "等待数据"}</small>
        </div>
      </header>

      <section className="workspace">
        <aside className="side-panel">
          <section className="quote-card panel">
            <div className="eyebrow">当前标的</div>
            <div className="symbol-line">
              <div>
                <h2>{market?.name || "—"}</h2>
                <span>{market ? `${market.market} · ${market.symbol}` : "加载中"}</span>
              </div>
              <span className="period-pill">{PERIODS.find((item) => item.value === period)?.label}</span>
            </div>
            <div className="quote-line">
              <strong>{price(latest?.close)}</strong>
              {latest ? (
                <span className={change >= 0 ? "rise" : "fall"}>
                  {change >= 0 ? "+" : ""}{price(change)} · {changePercent >= 0 ? "+" : ""}{changePercent.toFixed(2)}%
                </span>
              ) : null}
            </div>
            <div className="quote-subline">
              <span>高 {price(latest?.high)}</span>
              <span>低 {price(latest?.low)}</span>
              <span>{market?.adjustment || "—"}</span>
            </div>
          </section>

          <section className="panel structure-panel">
            <div className="panel-heading">
              <div>
                <span className="section-index">01</span>
                <h3>结构快照</h3>
              </div>
              <span className={`status-chip ${stateTone}`}>{centerState}</span>
            </div>
            <div className="facts-grid">
              <Fact label="已确认分型" value={analysis?.fractals.length || 0} />
              <Fact label="笔候选" value={analysis?.strokes.length || 0} accent="#f6cc3d" />
              <Fact label="线段候选" value={analysis?.segments.length || 0} />
              <Fact label="中枢候选" value={analysis?.centers.length || 0} accent="#46d9ff" />
            </div>
            <div className="center-box">
              <div className="center-title">
                <span>最近中枢</span>
                <small>{latestCenter ? `${latestCenter.confirmedAt} 确认` : "未形成"}</small>
              </div>
              <div className="center-range">
                <span>ZD</span><strong>{price(latestCenter?.ZD)}</strong>
                <i />
                <span>ZG</span><strong>{price(latestCenter?.ZG)}</strong>
              </div>
            </div>
          </section>

          <section className="panel signal-panel">
            <div className="panel-heading">
              <div>
                <span className="section-index">02</span>
                <h3>最近结构事件</h3>
              </div>
              <span className="candidate-tag">候选</span>
            </div>
            {latestEvent ? (
              <div className="latest-signal">
                <span className={`signal-badge ${latestEvent.side}`}>{latestEvents.map((event) => event.type).join("/")}</span>
                <div>
                  <strong>{latestEvents.length > 1
                    ? `${latestEvents.map((event) => EVENT_NAMES[event.type]).join(" / ")}重叠`
                    : EVENT_NAMES[latestEvent.type]}</strong>
                  <p>{latestEvents.map((event) => event.reason).join("；")}</p>
                  <p>{latestEvent.level} · 置信度{latestEvent.confidence} · 参数稳定度 {latestStability}/3
                    {associatedCenters.length ? ` · 关联中枢 ${associatedCenters.join(" / ")}` : ""}</p>
                </div>
                <b>{price(latestEvent.price)}</b>
              </div>
            ) : (
              <div className="empty-signal">当前参数下暂无完整买卖点候选</div>
            )}
            <dl className="signal-times">
              <div><dt>结构时点</dt><dd>{latestEvent?.structureAt || "—"}</dd></div>
              <div><dt>确认时点</dt><dd>{latestEvent?.confirmedAt || "—"}</dd></div>
              <div><dt>最早执行</dt><dd>{latestEvent?.earliestTradeAt || "无下一根 K 线"}</dd></div>
            </dl>
          </section>

          <details className="panel settings-panel">
            <summary>
              <span><b>03</b> 工程口径</span>
              <small>调整参数</small>
            </summary>
            <label>
              <span>最小笔间距 <b>{minStrokeGap}</b></span>
              <input type="range" min="3" max="5" value={minStrokeGap} onChange={(e) => setMinStrokeGap(Number(e.target.value))} />
            </label>
            <label>
              <span>背驰面积阈值 <b>{divergenceRatio.toFixed(2)}</b></span>
              <input type="range" min="0.7" max="0.9" step="0.1" value={divergenceRatio} onChange={(e) => setDivergenceRatio(Number(e.target.value))} />
            </label>
            <label>
              <span>中枢构件</span>
              <select value={centerSource} onChange={(e) => setCenterSource(e.target.value as "strokes" | "segments")}>
                <option value="strokes">笔（默认）</option>
                <option value="segments">线段候选</option>
              </select>
            </label>
          </details>
        </aside>

        <section className="main-panel">
          <div className="chart-card panel">
            <div className="chart-header">
              <div>
                <div className="eyebrow">价格结构 / PRICE STRUCTURE</div>
                <h2>{market ? `${market.name} ${market.symbol}` : "市场结构分析"}</h2>
                <p>{market?.bars[0]?.timestamp || "—"} — {latest?.timestamp || "—"} · 仅展示已确认结构</p>
              </div>
              <div className="chart-controls">
                <div className="segmented" aria-label="K 线周期">
                  {PERIODS.map((item) => (
                    <button key={item.value} className={period === item.value ? "active" : ""} onClick={() => switchPeriod(item.value)} disabled={loading}>
                      {item.label}
                    </button>
                  ))}
                </div>
                <select value={years} onChange={(e) => switchYears(Number(e.target.value))} aria-label="分析区间" disabled={loading}>
                  <option value={1}>近 1 年</option>
                  <option value={2}>近 2 年</option>
                  <option value={3}>近 3 年</option>
                  <option value={5}>近 5 年</option>
                </select>
              </div>
            </div>

            <div className="layer-bar">
              <div className="legend">
                <span><i className="candle-up" />上涨</span>
                <span><i className="candle-down" />下跌</span>
              </div>
              <div className="layer-toggles">
                {([
                  ["strokes", "笔"],
                  ["centers", "中枢"],
                  ["fractals", "分型"],
                  ["events", "买卖点"],
                ] as const).map(([key, label]) => (
                  <button
                    key={key}
                    className={layers[key] ? "on" : ""}
                    aria-pressed={layers[key]}
                    onClick={() => setLayers((current) => ({ ...current, [key]: !current[key] }))}
                  >
                    <i />{label}
                  </button>
                ))}
              </div>
            </div>

            {error ? (
              <div className="error-view" role="alert">
                <span>!</span>
                <h3>暂时无法完成分析</h3>
                <p>{error}</p>
                <button onClick={() => void loadMarket(query)}>重新尝试</button>
              </div>
            ) : loading || !analysis ? <LoadingView /> : <ChanChart analysis={analysis} layers={layers} />}
          </div>

          <div className="insight-grid">
            <section className="panel narrative-card">
              <div className="panel-heading">
                <div><span className="section-index">04</span><h3>当下结构解释</h3></div>
              </div>
              <div className="path-list">
                <div className="path continuation">
                  <span>延续路径</span>
                  <p>{latestCenter
                    ? `价格若持续站稳 ZG ${price(latestCenter.ZG)} 之上，并形成不回中枢的首次回试，才满足向上离开确认条件。`
                    : "等待至少三个连续下级别构件形成稳定重叠区间。"}</p>
                </div>
                <div className="path failure">
                  <span>失效路径</span>
                  <p>{latestCenter
                    ? `若重新进入 [${price(latestCenter.ZD)}, ${price(latestCenter.ZG)}]，则离开中枢的假设失效，重新按震荡延伸处理。`
                    : "末端分型尚未确认时不提前定义转折，继续等待右侧 K 线。"}</p>
                </div>
              </div>
            </section>

            <section className="panel events-card">
              <div className="panel-heading">
                <div><span className="section-index">05</span><h3>事件审计轨迹</h3></div>
                <small>{analysis?.events.length || 0} 个候选</small>
              </div>
              {analysis?.events.length ? (
                <div className="event-table-wrap">
                  <table>
                    <thead><tr><th>类型</th><th>层级 / 稳定度</th><th>结构时点</th><th>确认时点</th><th>价格</th></tr></thead>
                    <tbody>
                      {[...analysis.events].reverse().slice(0, 7).map((item) => (
                        <tr key={item.id}>
                          <td><span className={`table-event ${item.side}`}>{item.type}</span>{EVENT_NAMES[item.type]}</td>
                          <td>{item.level} · {eventStability.get(`${item.type}-${item.structureAt}`) || 0}/3</td>
                          <td>{item.structureAt}</td>
                          <td>{item.confirmedAt}</td>
                          <td>{price(item.price)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <div className="empty-table">当前区间内未识别到稳定的买卖点候选</div>}
            </section>
          </div>
        </section>
      </section>

      <footer>
        <p>结构事实 → 工程解释 → 操作条件 → 失效条件</p>
        <span>第三方前复权行情可能延迟。本工具用于结构研究，不构成投资建议；线段、中枢与买卖点均为参数化工程候选。</span>
      </footer>
    </main>
  );
}
