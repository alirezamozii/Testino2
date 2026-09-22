"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";

export interface XYLine {
  label?: string;
  points: [number, number][];
  color?: string;
  dashed?: boolean;
  strokeWidth?: number;
  labelPosition?: "start" | "end" | "mid" | "smart";
}

export interface XYRegion {
  label?: string;
  points: [number, number][];
  color?: string;
  opacity?: number;
}

export interface XYPoint {
  label: string;
  x: number;
  y: number;
  highlight?: boolean;
  color?: string;
  labelDirection?: "top" | "bottom" | "left" | "right" | "top-right" | "top-left" | "bottom-right" | "bottom-left";
}

export interface XYArrow {
  label?: string;
  from: [number, number];
  to: [number, number];
  color?: string;
}

export interface XYCoordinateChartProps {
  xRange?: [number, number];
  yRange?: [number, number];
  xLabel?: string;
  yLabel?: string;
  lines?: XYLine[];
  regions?: XYRegion[];
  points?: XYPoint[];
  arrows?: XYArrow[];
  caption?: string;
  className?: string;
}

export function XYCoordinateChart({
  xRange = [0, 14],
  yRange = [0, 14],
  xLabel = "x₁",
  yLabel = "x₂",
  lines = [],
  regions = [],
  points = [],
  arrows = [],
  caption,
  className,
}: XYCoordinateChartProps) {
  // SVG Canvas dimensions - spacious and well-proportioned
  const width = 640;
  const height = 450;
  const padLeft = 60;
  const padRight = 50;
  const padTop = 45;
  const padBottom = 48;

  const [xMin, xMax] = xRange;
  const [yMin, yMax] = yRange;

  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const toSvgX = (x: number) => padLeft + ((x - xMin) / (xMax - xMin || 1)) * plotW;
  const toSvgY = (y: number) => height - padBottom - ((y - yMin) / (yMax - yMin || 1)) * plotH;

  // Compute ticks
  const { xTicks, yTicks } = useMemo(() => {
    const calcTicks = (min: number, max: number) => {
      const span = max - min;
      let step = 1;
      if (span > 30) step = 10;
      else if (span > 15) step = 5;
      else if (span > 8) step = 2;
      else step = 1;

      const ticks: number[] = [];
      for (let v = Math.ceil(min); v <= Math.floor(max); v += step) {
        ticks.push(v);
      }
      return ticks;
    };

    return {
      xTicks: calcTicks(xMin, xMax),
      yTicks: calcTicks(yMin, yMax),
    };
  }, [xMin, xMax, yMin, yMax]);

  return (
    <div
      className={cn(
        "xy-chart-card my-5 rounded-3xl border-2 border-[var(--line-strong)] bg-[var(--surface)] p-4 sm:p-6 shadow-[5px_5px_0px_var(--neo-shadow)] transition-all",
        className
      )}
      dir="ltr"
    >
      {/* Header bar with Persian metadata */}
      {caption && (
        <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2 border-b-2 border-[var(--line)] pb-3 text-right" dir="rtl">
          <div className="flex items-center gap-2.5">
            <span className="flex h-3 w-3 items-center justify-center rounded-full bg-emerald-500 ring-4 ring-emerald-500/20" />
            <h4 className="text-xs sm:text-sm font-black text-[var(--ink)] leading-snug">{caption}</h4>
          </div>
          <span className="rounded-xl bg-[var(--surface-2)] px-2.5 py-1 text-[11px] font-black text-[var(--muted)] border border-[var(--line)] shadow-xs">
            تحقیق در عملیات • روش ترسیمی
          </span>
        </div>
      )}

      {/* SVG Canvas Area */}
      <div className="relative w-full overflow-x-auto select-none no-scrollbar flex justify-center bg-[var(--surface)] rounded-2xl">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full max-w-[640px] h-auto drop-shadow-xs font-sans"
          style={{ minWidth: "320px" }}
        >
          <defs>
            {/* Axis arrow marker */}
            <marker
              id="axis-arrow-head"
              viewBox="0 0 10 10"
              refX="6"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto"
            >
              <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="currentColor" className="text-[var(--ink)]" />
            </marker>

            {/* Gradient Vector arrow marker */}
            <marker
              id="vector-gradient-arrow"
              viewBox="0 0 10 10"
              refX="7"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto"
            >
              <path d="M 0 1 L 9 5 L 0 9 z" fill="#ea580c" />
            </marker>

            {/* Feasible Region Gradient Fill */}
            <linearGradient id="feasible-region-grad" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.32" />
              <stop offset="100%" stopColor="#059669" stopOpacity="0.18" />
            </linearGradient>

            {/* Subtle Diagonal Hatching */}
            <pattern id="clean-hatch" width="10" height="10" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
              <line x1="0" y1="0" x2="0" y2="10" stroke="#059669" strokeWidth="1.2" strokeOpacity="0.25" />
            </pattern>

            {/* Halo filter for high-legibility text over lines */}
            <filter id="text-halo" x="-20%" y="-20%" width="140%" height="140%">
              <feMorphology in="SourceAlpha" result="DILATED" operator="dilate" radius="2.5" />
              <feFlood floodColor="var(--surface, #ffffff)" result="COLOR" />
              <feComposite in="COLOR" in2="DILATED" operator="in" result="OUTLINE" />
              <feMerge>
                <feMergeNode in="OUTLINE" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* 1. Subtle Background Grid */}
          <g className="grid-lines" opacity="0.4">
            {xTicks.map((val) => {
              const sx = toSvgX(val);
              return (
                <line
                  key={`x-grid-${val}`}
                  x1={sx}
                  y1={padTop}
                  x2={sx}
                  y2={height - padBottom}
                  stroke="currentColor"
                  strokeDasharray="2 3"
                  className="text-[var(--line)]"
                />
              );
            })}
            {yTicks.map((val) => {
              const sy = toSvgY(val);
              return (
                <line
                  key={`y-grid-${val}`}
                  x1={padLeft}
                  y1={sy}
                  x2={width - padRight}
                  y2={sy}
                  stroke="currentColor"
                  strokeDasharray="2 3"
                  className="text-[var(--line)]"
                />
              );
            })}
          </g>

          {/* 2. Feasible Region Polygon (Clear, Beautiful, Unobstructed) */}
          {regions.map((reg, idx) => {
            const polyPoints = reg.points.map(([x, y]) => `${toSvgX(x)},${toSvgY(y)}`).join(" ");
            const regColor = reg.color || "#10b981";

            // Centroid for label
            const avgX = reg.points.reduce((acc, p) => acc + p[0], 0) / reg.points.length;
            const avgY = reg.points.reduce((acc, p) => acc + p[1], 0) / reg.points.length;

            return (
              <g key={`region-${idx}`}>
                {/* Gradient solid fill */}
                <polygon
                  points={polyPoints}
                  fill="url(#feasible-region-grad)"
                  stroke={regColor}
                  strokeWidth="2.5"
                  strokeLinejoin="round"
                  strokeDasharray="5 3"
                />
                {/* Diagonal subtle hatch overlay */}
                <polygon points={polyPoints} fill="url(#clean-hatch)" />

                {/* Elegant Centered Region Watermark Label (No bulky opaque box) */}
                {reg.label && (
                  <g transform={`translate(${toSvgX(avgX * 0.9)}, ${toSvgY(avgY * 0.9)})`}>
                    <text
                      textAnchor="middle"
                      dominantBaseline="central"
                      className="text-xs font-black fill-emerald-800 dark:fill-emerald-200 pointer-events-none"
                      style={{ direction: "rtl", letterSpacing: "0.02em", paintOrder: "stroke fill", stroke: "var(--surface, #ffffff)", strokeWidth: "3px", strokeLinejoin: "round" }}
                    >
                      {reg.label}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* 3. Coordinate Axes with Clean Ticks */}
          <g className="axes text-[var(--ink)]">
            {/* X-Axis */}
            <line
              x1={padLeft}
              y1={toSvgY(0)}
              x2={width - padRight + 16}
              y2={toSvgY(0)}
              stroke="currentColor"
              strokeWidth="2.5"
              markerEnd="url(#axis-arrow-head)"
            />
            {/* Y-Axis */}
            <line
              x1={toSvgX(0)}
              y1={height - padBottom}
              x2={toSvgX(0)}
              y2={padTop - 14}
              stroke="currentColor"
              strokeWidth="2.5"
              markerEnd="url(#axis-arrow-head)"
            />

            {/* Axis Titles (x1, x2) */}
            <text
              x={width - padRight + 20}
              y={toSvgY(0) + 4}
              className="text-sm font-black fill-[var(--ink)]"
              textAnchor="start"
              dominantBaseline="central"
              style={{ paintOrder: "stroke fill", stroke: "var(--surface, #ffffff)", strokeWidth: "3px", strokeLinejoin: "round" }}
            >
              {xLabel}
            </text>
            <text
              x={toSvgX(0)}
              y={padTop - 22}
              className="text-sm font-black fill-[var(--ink)]"
              textAnchor="middle"
              dominantBaseline="central"
              style={{ paintOrder: "stroke fill", stroke: "var(--surface, #ffffff)", strokeWidth: "3px", strokeLinejoin: "round" }}
            >
              {yLabel}
            </text>

            {/* Tick Marks & Numbers on X-Axis */}
            {xTicks.map((val) => {
              if (val === 0) return null;
              const hasPoint = points.some((p) => Math.abs(p.x - val) < 0.3 && Math.abs(p.y) < 0.3);
              const sx = toSvgX(val);
              const sy = toSvgY(0);
              return (
                <g key={`x-tick-${val}`}>
                  <line x1={sx} y1={sy - 4} x2={sx} y2={sy + 4} stroke="currentColor" strokeWidth="1.8" />
                  {!hasPoint && (
                    <text
                      x={sx}
                      y={sy + 18}
                      textAnchor="middle"
                      className="text-[11px] font-bold fill-[var(--muted)] font-mono"
                      style={{ paintOrder: "stroke fill", stroke: "var(--surface, #ffffff)", strokeWidth: "3px", strokeLinejoin: "round" }}
                    >
                      {val}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Tick Marks & Numbers on Y-Axis */}
            {yTicks.map((val) => {
              if (val === 0) return null;
              const hasPoint = points.some((p) => Math.abs(p.x) < 0.3 && Math.abs(p.y - val) < 0.3);
              const sx = toSvgX(0);
              const sy = toSvgY(val);
              return (
                <g key={`y-tick-${val}`}>
                  <line x1={sx - 4} y1={sy} x2={sx + 4} y2={sy} stroke="currentColor" strokeWidth="1.8" />
                  {!hasPoint && (
                    <text
                      x={sx - 10}
                      y={sy + 4}
                      textAnchor="end"
                      className="text-[11px] font-bold fill-[var(--muted)] font-mono"
                      style={{ paintOrder: "stroke fill", stroke: "var(--surface, #ffffff)", strokeWidth: "3px", strokeLinejoin: "round" }}
                    >
                      {val}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Origin (0,0) */}
            {!points.some((p) => Math.abs(p.x) < 0.3 && Math.abs(p.y) < 0.3) && (
              <text
                x={toSvgX(0) - 10}
                y={toSvgY(0) + 16}
                className="text-[11px] font-bold fill-[var(--muted)] font-mono"
                textAnchor="end"
                style={{ paintOrder: "stroke fill", stroke: "var(--surface, #ffffff)", strokeWidth: "3px", strokeLinejoin: "round" }}
              >
                0
              </text>
            )}
          </g>

          {/* 4. Constraint Lines (Placing labels smart near outer margins to NEVER collide) */}
          {lines.map((line, idx) => {
            const polyPoints = line.points.map(([x, y]) => `${toSvgX(x)},${toSvgY(y)}`).join(" ");
            const lineColor = line.color || (idx === 0 ? "#2563eb" : idx === 1 ? "#7c3aed" : "#0891b2");
            const isDashed = line.dashed ?? false;
            const strokeW = line.strokeWidth || 2.5;

            // Smart label placement:
            // Instead of putting label in the congested center, place it near the outer margin!
            const sortedByDistance = [...line.points].sort((a, b) => (b[0] * b[0] + b[1] * b[1]) - (a[0] * a[0] + a[1] * a[1]));
            const outerPt = sortedByDistance[0] || [0, 0];
            const isNearYAxis = outerPt[0] <= 1;
            const isNearXAxis = outerPt[1] <= 1;

            let labelX = toSvgX(outerPt[0]);
            let labelY = toSvgY(outerPt[1]);
            let anchor: "start" | "end" | "middle" = "middle";

            if (line.labelPosition === "start" && line.points.length >= 1) {
              labelX = toSvgX(line.points[0][0] + 0.5);
              labelY = toSvgY(line.points[0][1] - 0.5);
              anchor = "start";
            } else if (line.labelPosition === "end" && line.points.length >= 1) {
              const last = line.points[line.points.length - 1];
              labelX = toSvgX(last[0] - 0.5);
              labelY = toSvgY(last[1] + 0.8);
              anchor = "end";
            } else if (line.labelPosition === "mid" && line.points.length >= 2) {
              const midX = (line.points[0][0] + line.points[1][0]) / 2;
              const midY = (line.points[0][1] + line.points[1][1]) / 2;
              labelX = toSvgX(midX + 0.3);
              labelY = toSvgY(midY + 0.5);
              anchor = "start";
            } else if (isNearYAxis) {
              // At the top of y-axis: shift right slightly
              labelX = toSvgX(outerPt[0] + 0.8);
              labelY = toSvgY(outerPt[1] - 0.4);
              anchor = "start";
            } else if (isNearXAxis) {
              // Near the x-axis intercept: shift up and left
              labelX = toSvgX(outerPt[0] - 1.8);
              labelY = toSvgY(outerPt[1] + 1.2);
              anchor = "middle";
            } else {
              // General line: offset outward
              labelX = toSvgX(outerPt[0]);
              labelY = toSvgY(outerPt[1] + 0.6);
              anchor = "middle";
            }

            return (
              <g key={`line-${idx}`}>
                <polyline
                  points={polyPoints}
                  stroke={lineColor}
                  strokeWidth={strokeW}
                  strokeDasharray={isDashed ? "6 4" : undefined}
                  strokeLinecap="round"
                />
                {line.label && (
                  <text
                    x={labelX}
                    y={labelY}
                    textAnchor={anchor}
                    dominantBaseline="central"
                    className="text-[11px] font-black"
                    fill={lineColor}
                    style={{ paintOrder: "stroke fill", stroke: "var(--surface, #ffffff)", strokeWidth: "4px", strokeLinejoin: "round" }}
                  >
                    {line.label}
                  </text>
                )}
              </g>
            );
          })}

          {/* 5. Objective Vector Arrows (Gradient ∇Z) */}
          {arrows.map((arr, idx) => {
            const x1 = toSvgX(arr.from[0]);
            const y1 = toSvgY(arr.from[1]);
            const x2 = toSvgX(arr.to[0]);
            const y2 = toSvgY(arr.to[1]);
            const arrColor = arr.color || "#ea580c";

            return (
              <g key={`arrow-${idx}`}>
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={arrColor}
                  strokeWidth="2.8"
                  markerEnd="url(#vector-gradient-arrow)"
                />
                {arr.label && (
                  <text
                    x={x2 + 8}
                    y={y2 - 6}
                    className="text-[11px] font-black fill-[#ea580c]"
                    style={{ paintOrder: "stroke fill", stroke: "var(--surface, #ffffff)", strokeWidth: "3px", strokeLinejoin: "round" }}
                  >
                    {arr.label}
                  </text>
                )}
              </g>
            );
          })}

          {/* 6. Extreme Points / Vertices (Smart Directional Offsets - Zero Overlap) */}
          {points.map((pt, idx) => {
            const px = toSvgX(pt.x);
            const py = toSvgY(pt.y);
            const isHighlight = pt.highlight ?? false;
            const ptColor = pt.color || (isHighlight ? "#10b981" : "#1e40af");

            // Compute smart directional offset so labels NEVER collide
            let dx = 10;
            let dy = -8;
            let textAnchor: "start" | "end" | "middle" = "start";

            if (pt.labelDirection) {
              switch (pt.labelDirection) {
                case "top":
                  dx = 0; dy = -14; textAnchor = "middle"; break;
                case "bottom":
                  dx = 0; dy = 18; textAnchor = "middle"; break;
                case "left":
                  dx = -12; dy = 4; textAnchor = "end"; break;
                case "right":
                  dx = 12; dy = 4; textAnchor = "start"; break;
                case "top-left":
                  dx = -12; dy = -12; textAnchor = "end"; break;
                case "top-right":
                  dx = 12; dy = -12; textAnchor = "start"; break;
                case "bottom-left":
                  dx = -12; dy = 16; textAnchor = "end"; break;
                case "bottom-right":
                  dx = 12; dy = 16; textAnchor = "start"; break;
              }
            } else if (pt.x <= 0.1 && pt.y <= 0.1) {
              // Origin - place down and left
              dx = -12;
              dy = 18;
              textAnchor = "end";
            } else if (pt.y <= 0.1) {
              // On X-axis - place below
              dx = 0;
              dy = 22;
              textAnchor = "middle";
            } else if (pt.x <= 0.1) {
              // On Y-axis - place to the left of the axis
              dx = -14;
              dy = 4;
              textAnchor = "end";
            } else if (isHighlight) {
              // Highlighted / Optimal Point - top-right
              dx = 14;
              dy = -14;
              textAnchor = "start";
            } else {
              // Interior points
              dx = 12;
              dy = 2;
              textAnchor = "start";
            }

            return (
              <g key={`point-${idx}`} className="transition-all">
                {/* Pulsating beacon ring for optimal vertex */}
                {isHighlight && (
                  <>
                    <circle
                      cx={px}
                      cy={py}
                      r="14"
                      fill={ptColor}
                      fillOpacity="0.25"
                      className="animate-ping"
                    />
                    <circle
                      cx={px}
                      cy={py}
                      r="9"
                      fill="none"
                      stroke={ptColor}
                      strokeWidth="2"
                      strokeDasharray="3 2"
                    />
                  </>
                )}

                {/* Point circle */}
                <circle
                  cx={px}
                  cy={py}
                  r={isHighlight ? "6" : "4.5"}
                  fill={isHighlight ? "#10b981" : "var(--surface)"}
                  stroke={ptColor}
                  strokeWidth={isHighlight ? "3" : "2"}
                />

                {/* Point Label - Optimal point gets a sleek badge, others get halo text */}
                {isHighlight ? (
                  <g transform={`translate(${px + dx}, ${py + dy - 2})`}>
                    <rect
                      x="-6"
                      y="-12"
                      width={pt.label.length * 8 + 14}
                      height="22"
                      rx="7"
                      fill="#10b981"
                      className="shadow-sm"
                    />
                    <text
                      x={pt.label.length * 4 + 1}
                      y="0"
                      textAnchor="middle"
                      dominantBaseline="central"
                      className="text-[11px] font-black fill-white"
                    >
                      {pt.label}
                    </text>
                  </g>
                ) : (
                  <text
                    x={px + dx}
                    y={py + dy}
                    textAnchor={textAnchor}
                    dominantBaseline="central"
                    className="text-[11px] font-black fill-[var(--ink)]"
                    style={{ paintOrder: "stroke fill", stroke: "var(--surface, #ffffff)", strokeWidth: "3px", strokeLinejoin: "round" }}
                  >
                    {pt.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Modern, Structured Legend below graph */}
      {(lines.length > 0 || points.length > 0 || regions.length > 0) && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3 border-t-2 border-[var(--line)] pt-3 text-xs" dir="rtl">
          {lines.map((l, i) => (
            <div
              key={`legend-l-${i}`}
              className="flex items-center gap-2 rounded-xl bg-[var(--surface-2)]/60 px-3 py-1.5 border border-[var(--line)]"
            >
              <span
                className="h-2 w-5 rounded-full"
                style={{
                  backgroundColor: l.color || (i === 0 ? "#2563eb" : i === 1 ? "#7c3aed" : "#0891b2"),
                }}
              />
              <span className="text-[var(--ink)] font-black text-[11px]">{l.label || `خط ${i + 1}`}</span>
            </div>
          ))}

          {regions.length > 0 && (
            <div className="flex items-center gap-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 px-3 py-1.5 border border-emerald-300 dark:border-emerald-800">
              <span className="h-3.5 w-3.5 rounded-sm border-2 border-dashed border-emerald-600 bg-emerald-500/30" />
              <span className="text-emerald-900 dark:text-emerald-100 font-black text-[11px]">ناحیه موجه (چندضلعی محدب)</span>
            </div>
          )}

          {points.some((p) => p.highlight) && (
            <div className="flex items-center gap-2 rounded-xl bg-emerald-500 text-white px-3 py-1.5 shadow-sm">
              <span className="h-2.5 w-2.5 rounded-full bg-white animate-pulse" />
              <span className="font-black text-[11px]">
                {points.find((p) => p.highlight)?.label || "نقطه بهینه"}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
