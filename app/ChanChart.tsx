"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChanAnalysis } from "@/lib/chanlun";

export type Layers = {
  strokes: boolean;
  centers: boolean;
  fractals: boolean;
  events: boolean;
};

type Props = {
  analysis: ChanAnalysis;
  layers: Layers;
};

const COLORS = {
  grid: "rgba(150, 174, 185, .12)",
  axis: "rgba(183, 199, 207, .62)",
  up: "#f05252",
  down: "#19b66b",
  yellow: "#f6cc3d",
  cyan: "#46d9ff",
  white: "#e8f0f2",
  orange: "#ff9f43",
};

function compact(value: number) {
  if (Math.abs(value) >= 100) return value.toFixed(2);
  if (Math.abs(value) >= 10) return value.toFixed(3);
  return value.toFixed(4);
}

function drawTriangle(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  direction: "up" | "down",
  color: string,
) {
  const size = 5;
  context.beginPath();
  if (direction === "down") {
    context.moveTo(x - size, y - size);
    context.lineTo(x + size, y - size);
    context.lineTo(x, y + size);
  } else {
    context.moveTo(x - size, y + size);
    context.lineTo(x + size, y + size);
    context.lineTo(x, y - size);
  }
  context.closePath();
  context.fillStyle = color;
  context.fill();
}

export default function ChanChart({ analysis, layers }: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 900, height: 590 });
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const bars = analysis.bars;

  useEffect(() => {
    const element = wrapperRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: Math.max(320, entry.contentRect.width), height: Math.max(470, entry.contentRect.height) });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const geometry = useMemo(() => {
    const left = size.width < 600 ? 12 : 52;
    const right = size.width < 600 ? 48 : 70;
    const top = 24;
    const bottom = 24;
    const gap = 32;
    const priceHeight = Math.round((size.height - top - bottom - gap) * 0.7);
    const macdTop = top + priceHeight + gap;
    const macdHeight = size.height - macdTop - bottom;
    const plotWidth = size.width - left - right;
    return { left, right, top, bottom, gap, priceHeight, macdTop, macdHeight, plotWidth };
  }, [size]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !bars.length) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(size.width * dpr);
    canvas.height = Math.round(size.height * dpr);
    canvas.style.width = `${size.width}px`;
    canvas.style.height = `${size.height}px`;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, size.width, size.height);

    const { left, right, top, priceHeight, macdTop, macdHeight, plotWidth } = geometry;
    const highs = bars.map((bar) => bar.high);
    const lows = bars.map((bar) => bar.low);
    let priceMin = Math.min(...lows);
    let priceMax = Math.max(...highs);
    const pricePadding = (priceMax - priceMin || 1) * 0.08;
    priceMin -= pricePadding;
    priceMax += pricePadding;
    const xFor = (index: number) => left + (index + 0.5) * (plotWidth / bars.length);
    const yForPrice = (price: number) => top + ((priceMax - price) / (priceMax - priceMin)) * priceHeight;

    context.font = "11px ui-monospace, SFMono-Regular, Menlo, monospace";
    context.lineWidth = 1;
    context.setLineDash([3, 4]);
    for (let row = 0; row <= 5; row += 1) {
      const y = top + (row / 5) * priceHeight;
      context.strokeStyle = COLORS.grid;
      context.beginPath();
      context.moveTo(left, y);
      context.lineTo(size.width - right, y);
      context.stroke();
      const price = priceMax - (row / 5) * (priceMax - priceMin);
      context.fillStyle = COLORS.axis;
      context.textAlign = "left";
      context.fillText(compact(price), size.width - right + 9, y + 4);
    }

    const tickCount = size.width < 650 ? 4 : 7;
    for (let tick = 0; tick < tickCount; tick += 1) {
      const index = Math.round((tick / (tickCount - 1)) * (bars.length - 1));
      const x = xFor(index);
      context.strokeStyle = COLORS.grid;
      context.beginPath();
      context.moveTo(x, top);
      context.lineTo(x, size.height - geometry.bottom);
      context.stroke();
      context.fillStyle = COLORS.axis;
      context.textAlign = tick === 0 ? "left" : tick === tickCount - 1 ? "right" : "center";
      context.fillText(bars[index].timestamp.slice(2), x, size.height - 6);
    }
    context.setLineDash([]);

    if (layers.centers) {
      for (const center of analysis.centers) {
        const startX = xFor(center.startIndex);
        const endX = xFor(center.endIndex);
        const yTop = yForPrice(center.ZG);
        const yBottom = yForPrice(center.ZD);
        context.fillStyle = "rgba(35, 190, 230, .09)";
        context.fillRect(startX, yTop, Math.max(2, endX - startX), yBottom - yTop);
        context.strokeStyle = "rgba(70, 217, 255, .8)";
        context.setLineDash([5, 4]);
        context.strokeRect(startX, yTop, Math.max(2, endX - startX), yBottom - yTop);
        context.setLineDash([]);
        if (endX - startX > 56) {
          context.fillStyle = COLORS.cyan;
          context.textAlign = "left";
          context.fillText(`中枢 ${center.id}`, startX + 5, yTop - 6);
        }
      }
    }

    const step = plotWidth / bars.length;
    const bodyWidth = Math.max(1, Math.min(9, step * 0.65));
    for (let index = 0; index < bars.length; index += 1) {
      const bar = bars[index];
      const color = bar.close >= bar.open ? COLORS.up : COLORS.down;
      const x = xFor(index);
      const bodyTop = yForPrice(Math.max(bar.open, bar.close));
      const bodyBottom = yForPrice(Math.min(bar.open, bar.close));
      context.strokeStyle = color;
      context.fillStyle = color;
      context.beginPath();
      context.moveTo(x, yForPrice(bar.high));
      context.lineTo(x, yForPrice(bar.low));
      context.stroke();
      context.fillRect(x - bodyWidth / 2, bodyTop, bodyWidth, Math.max(1.2, bodyBottom - bodyTop));
    }

    if (layers.strokes && analysis.strokes.length) {
      context.strokeStyle = COLORS.yellow;
      context.lineWidth = size.width < 600 ? 1.2 : 1.6;
      context.beginPath();
      context.moveTo(xFor(analysis.strokes[0].startIndex), yForPrice(analysis.strokes[0].startPrice));
      for (const stroke of analysis.strokes) {
        context.lineTo(xFor(stroke.endIndex), yForPrice(stroke.endPrice));
      }
      context.stroke();
    }

    if (layers.fractals && step > 2.1) {
      for (const fractal of analysis.fractals) {
        const isTop = fractal.kind === "top";
        const y = yForPrice(fractal.price) + (isTop ? -9 : 9);
        drawTriangle(context, xFor(fractal.structureIndex), y, isTop ? "down" : "up", isTop ? COLORS.up : COLORS.down);
      }
    }

    if (layers.events) {
      const eventGroups = new Map<string, typeof analysis.events>();
      for (const event of analysis.events) {
        const key = `${event.structureIndex}-${event.price}-${event.side}`;
        const group = eventGroups.get(key) || [];
        group.push(event);
        eventGroups.set(key, group);
      }
      for (const group of eventGroups.values()) {
        const event = group[0];
        const x = xFor(event.structureIndex);
        const y = yForPrice(event.price);
        context.beginPath();
        context.arc(x, y, 7, 0, Math.PI * 2);
        context.fillStyle = "rgba(5, 11, 13, .88)";
        context.fill();
        context.strokeStyle = event.side === "buy" ? "#51e093" : "#ff6b6b";
        context.lineWidth = 2;
        context.stroke();
        context.fillStyle = event.side === "buy" ? "#51e093" : "#ff6b6b";
        context.font = "bold 10px ui-monospace, monospace";
        context.textAlign = "center";
        context.fillText(group.map((item) => item.type).join("/"), x, y + (event.side === "buy" ? 20 : -13));
      }
    }

    const macdRows = analysis.macd;
    const macdMax = Math.max(0.01, ...macdRows.flatMap((row) => [Math.abs(row.hist), Math.abs(row.diff), Math.abs(row.dea)]));
    const macdZero = macdTop + macdHeight / 2;
    const yForMacd = (value: number) => macdZero - (value / macdMax) * (macdHeight * 0.43);
    context.strokeStyle = "rgba(157, 176, 185, .25)";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(left, macdZero);
    context.lineTo(size.width - right, macdZero);
    context.stroke();
    context.fillStyle = COLORS.axis;
    context.textAlign = "left";
    context.font = "11px ui-monospace, monospace";
    context.fillText("MACD 12 · 26 · 9", left, macdTop - 9);
    context.fillText("0", size.width - right + 9, macdZero + 4);

    for (let index = 0; index < macdRows.length; index += 1) {
      const row = macdRows[index];
      const y = yForMacd(row.hist);
      context.fillStyle = row.hist >= 0 ? "rgba(240, 82, 82, .82)" : "rgba(25, 182, 107, .82)";
      context.fillRect(xFor(index) - bodyWidth / 2, Math.min(y, macdZero), bodyWidth, Math.max(1, Math.abs(macdZero - y)));
    }
    for (const [key, color] of [["diff", COLORS.white], ["dea", COLORS.yellow]] as const) {
      context.strokeStyle = color;
      context.lineWidth = 1.2;
      context.beginPath();
      macdRows.forEach((row, index) => {
        const x = xFor(index);
        const y = yForMacd(row[key]);
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.stroke();
    }

    if (hoverIndex !== null) {
      const bar = bars[hoverIndex];
      const x = xFor(hoverIndex);
      const y = yForPrice(bar.close);
      context.strokeStyle = "rgba(229, 239, 242, .45)";
      context.lineWidth = 1;
      context.setLineDash([4, 4]);
      context.beginPath();
      context.moveTo(x, top);
      context.lineTo(x, size.height - geometry.bottom);
      context.moveTo(left, y);
      context.lineTo(size.width - right, y);
      context.stroke();
      context.setLineDash([]);
    }
  }, [analysis, bars, geometry, hoverIndex, layers, size]);

  const tooltip = hoverIndex === null ? null : bars[hoverIndex];
  const tooltipLeft = hoverIndex === null ? 0 : geometry.left + ((hoverIndex + 0.5) * geometry.plotWidth) / bars.length;

  return (
    <div
      className="chart-stage"
      ref={wrapperRef}
      onPointerMove={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        const localX = event.clientX - bounds.left;
        if (localX < geometry.left || localX > size.width - geometry.right) {
          setHoverIndex(null);
          return;
        }
        const index = Math.floor(((localX - geometry.left) / geometry.plotWidth) * bars.length);
        setHoverIndex(Math.max(0, Math.min(bars.length - 1, index)));
      }}
      onPointerLeave={() => setHoverIndex(null)}
    >
      <canvas ref={canvasRef} aria-label="缠论 K 线结构与 MACD 图" role="img" />
      {tooltip ? (
        <div
          className={`chart-tooltip ${tooltipLeft > size.width * 0.68 ? "tooltip-left" : ""}`}
          style={{ left: tooltipLeft }}
        >
          <strong>{tooltip.timestamp}</strong>
          <span>开 {compact(tooltip.open)}</span>
          <span>高 {compact(tooltip.high)}</span>
          <span>低 {compact(tooltip.low)}</span>
          <span>收 {compact(tooltip.close)}</span>
        </div>
      ) : null}
    </div>
  );
}
