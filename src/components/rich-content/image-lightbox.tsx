"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  X,
  Maximize2,
  Minimize2,
  Sliders,
  Sparkles,
} from "lucide-react";

export const MIN_SCALE = 0.2; // 20%
export const MAX_SCALE = 8.0; // 800%

export const PRESETS = [
  { label: "برازش", value: 1.0, isFit: true },
  { label: "۱۰۰٪", value: 1.0, isFit: false },
  { label: "۱۵۰٪", value: 1.5, isFit: false },
  { label: "۲۰۰٪", value: 2.0, isFit: false },
  { label: "۳۰۰٪", value: 3.0, isFit: false },
  { label: "۵۰۰٪", value: 5.0, isFit: false },
];

export function clampScale(scale: number, minScale = MIN_SCALE, maxScale = MAX_SCALE): number {
  return Math.min(Math.max(scale, minScale), maxScale);
}

export function calculateFocalPointZoom({
  currentScale,
  currentPos,
  targetScale,
  focalPoint,
  minScale = MIN_SCALE,
  maxScale = MAX_SCALE,
}: {
  currentScale: number;
  currentPos: { x: number; y: number };
  targetScale: number;
  focalPoint: { x: number; y: number };
  minScale?: number;
  maxScale?: number;
}): { nextScale: number; nextPos: { x: number; y: number } } {
  const nextScale = clampScale(targetScale, minScale, maxScale);
  if (currentScale === 0) return { nextScale, nextPos: currentPos };

  const ratio = nextScale / currentScale;
  const nextX = focalPoint.x - (focalPoint.x - currentPos.x) * ratio;
  const nextY = focalPoint.y - (focalPoint.y - currentPos.y) * ratio;

  return {
    nextScale,
    nextPos: { x: nextX, y: nextY },
  };
}

export function calculatePinchTransform({
  initialScale,
  initialDistance,
  currentDistance,
  initialPos,
  currentMidpoint,
  initialMidpoint,
  containerCenter,
  minScale = MIN_SCALE,
  maxScale = MAX_SCALE,
}: {
  initialScale: number;
  initialDistance: number;
  currentDistance: number;
  initialPos: { x: number; y: number };
  currentMidpoint: { x: number; y: number };
  initialMidpoint: { x: number; y: number };
  containerCenter: { x: number; y: number };
  minScale?: number;
  maxScale?: number;
}): { nextScale: number; nextPos: { x: number; y: number } } {
  if (initialDistance <= 0) {
    return { nextScale: initialScale, nextPos: initialPos };
  }

  const pinchFactor = currentDistance / initialDistance;
  const nextScale = clampScale(initialScale * pinchFactor, minScale, maxScale);

  const initialFocalX = initialMidpoint.x - containerCenter.x;
  const initialFocalY = initialMidpoint.y - containerCenter.y;
  const currentFocalX = currentMidpoint.x - containerCenter.x;
  const currentFocalY = currentMidpoint.y - containerCenter.y;

  const ratio = nextScale / initialScale;

  const nextX = currentFocalX - (initialFocalX - initialPos.x) * ratio;
  const nextY = currentFocalY - (initialFocalY - initialPos.y) * ratio;

  return {
    nextScale,
    nextPos: { x: nextX, y: nextY },
  };
}

interface ImageLightboxProps {
  src: string;
  alt?: string;
  onClose: () => void;
}

export function ImageLightbox({ src, alt, onClose }: ImageLightboxProps) {
  const [scale, setScale] = useState<number>(1.0);
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isInteracting, setIsInteracting] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [showSlider, setShowSlider] = useState<boolean>(false);
  const [showHint, setShowHint] = useState<boolean>(true);

  // Refs for tracking mutable values without re-triggering effects during 60fps gestures
  const containerRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const scaleRef = useRef(scale);
  const posRef = useRef(position);

  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);

  useEffect(() => {
    posRef.current = position;
  }, [position]);

  // Touch tracking refs
  const touchStateRef = useRef<{
    touchCount: number;
    startX: number;
    startY: number;
    initialPosX: number;
    initialPosY: number;
    initialDistance: number;
    initialScale: number;
    midpointX: number;
    midpointY: number;
    lastTapTime: number;
    lastTapX: number;
    lastTapY: number;
  }>({
    touchCount: 0,
    startX: 0,
    startY: 0,
    initialPosX: 0,
    initialPosY: 0,
    initialDistance: 0,
    initialScale: 1,
    midpointX: 0,
    midpointY: 0,
    lastTapTime: 0,
    lastTapX: 0,
    lastTapY: 0,
  });

  // Mouse dragging refs
  const mouseDragRef = useRef<{
    isDragging: boolean;
    startX: number;
    startY: number;
    initialPosX: number;
    initialPosY: number;
    hasMoved: boolean;
  }>({
    isDragging: false,
    startX: 0,
    startY: 0,
    initialPosX: 0,
    initialPosY: 0,
    hasMoved: false,
  });

  // Hide initial interaction hint after 3.5 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowHint(false);
    }, 3500);
    return () => clearTimeout(timer);
  }, []);

  // Listen to native fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  // Core Focal-Point Zoom calculation:
  // Zooms towards (clientX, clientY) keeping the point under the cursor/midpoint stationary.
  const zoomAtPoint = useCallback((newScale: number, clientX: number, clientY: number) => {
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const focalPoint = {
      x: clientX - (rect.left + rect.width / 2),
      y: clientY - (rect.top + rect.height / 2),
    };

    const { nextScale, nextPos } = calculateFocalPointZoom({
      currentScale: scaleRef.current,
      currentPos: posRef.current,
      targetScale: newScale,
      focalPoint,
      minScale: MIN_SCALE,
      maxScale: MAX_SCALE,
    });

    setScale(nextScale);
    setPosition(nextPos);
  }, []);

  // Center-based step zoom for toolbar buttons
  const stepZoom = useCallback((factor: number) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    zoomAtPoint(scaleRef.current * factor, centerX, centerY);
  }, [zoomAtPoint]);

  // Reset to default fit
  const handleReset = useCallback(() => {
    setScale(1.0);
    setPosition({ x: 0, y: 0 });
  }, []);

  // Set predefined zoom level
  const setPreset = useCallback((targetScale: number) => {
    if (targetScale === 1.0) {
      setScale(1.0);
      setPosition({ x: 0, y: 0 });
    } else {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      zoomAtPoint(targetScale, rect.left + rect.width / 2, rect.top + rect.height / 2);
    }
  }, [zoomAtPoint]);

  // Fullscreen toggle handler
  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        if (modalRef.current?.requestFullscreen) {
          await modalRef.current.requestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        }
      }
    } catch {
      // Ignored if fullscreen rejected by browser permissions
    }
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        stepZoom(1.25);
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        stepZoom(0.8);
      } else if (e.key === "0") {
        e.preventDefault();
        handleReset();
      } else if (e.key.toLowerCase() === "f") {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.key.startsWith("Arrow")) {
        e.preventDefault();
        const step = 40;
        setPosition((prev) => {
          if (e.key === "ArrowUp") return { ...prev, y: prev.y + step };
          if (e.key === "ArrowDown") return { ...prev, y: prev.y - step };
          if (e.key === "ArrowLeft") return { ...prev, x: prev.x + step };
          if (e.key === "ArrowRight") return { ...prev, x: prev.x - step };
          return prev;
        });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, stepZoom, handleReset, toggleFullscreen]);

  // Mouse wheel and Trackpad pinch event listener (with passive: false to prevent background scroll)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      setShowHint(false);

      // Laptop trackpad pinch sets ctrlKey: true and continuous small deltaY
      // Mouse wheel produces stepped deltaY (~100)
      const isTrackpadPinch = e.ctrlKey;
      const zoomFactor = isTrackpadPinch
        ? Math.exp(-e.deltaY * 0.01)
        : Math.exp(-e.deltaY * 0.002);

      const targetScale = scaleRef.current * zoomFactor;
      zoomAtPoint(targetScale, e.clientX, e.clientY);
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      container.removeEventListener("wheel", handleWheel);
    };
  }, [zoomAtPoint]);

  // Touch and Multi-Touch (Pinch & Pan) Gesture listener (with passive: false)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleTouchStart = (e: TouchEvent) => {
      setShowHint(false);
      const touches = e.touches;
      const state = touchStateRef.current;
      state.touchCount = touches.length;

      if (touches.length === 1) {
        const touch = touches[0];
        state.startX = touch.clientX;
        state.startY = touch.clientY;
        state.initialPosX = posRef.current.x;
        state.initialPosY = posRef.current.y;
        setIsInteracting(true);

        // Double-tap detection (<300ms and <25px movement)
        const now = Date.now();
        const timeDiff = now - state.lastTapTime;
        const distDiff = Math.hypot(touch.clientX - state.lastTapX, touch.clientY - state.lastTapY);

        if (timeDiff < 300 && distDiff < 25) {
          e.preventDefault();
          // Toggle between Fit (1.0) and 2.5x zoom at tapped point
          if (scaleRef.current <= 1.15) {
            zoomAtPoint(2.5, touch.clientX, touch.clientY);
          } else {
            handleReset();
          }
          state.lastTapTime = 0;
        } else {
          state.lastTapTime = now;
          state.lastTapX = touch.clientX;
          state.lastTapY = touch.clientY;
        }
      } else if (touches.length >= 2) {
        // Multi-touch pinch start
        e.preventDefault();
        const t0 = touches[0];
        const t1 = touches[1];
        state.initialDistance = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
        state.initialScale = scaleRef.current;
        state.initialPosX = posRef.current.x;
        state.initialPosY = posRef.current.y;
        state.midpointX = (t0.clientX + t1.clientX) / 2;
        state.midpointY = (t0.clientY + t1.clientY) / 2;
        setIsInteracting(true);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault(); // Stop native page scroll/zoom in webviews and mobile browsers
      const touches = e.touches;
      const state = touchStateRef.current;

      if (touches.length === 1 && state.touchCount === 1) {
        // Single finger pan
        const touch = touches[0];
        const dx = touch.clientX - state.startX;
        const dy = touch.clientY - state.startY;
        setPosition({
          x: state.initialPosX + dx,
          y: state.initialPosY + dy,
        });
      } else if (touches.length >= 2) {
        // Two-finger pinch and pan
        const t0 = touches[0];
        const t1 = touches[1];
        const currentDist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
        const currentMidX = (t0.clientX + t1.clientX) / 2;
        const currentMidY = (t0.clientY + t1.clientY) / 2;

        const containerRect = container.getBoundingClientRect();
        const containerCenter = {
          x: containerRect.left + containerRect.width / 2,
          y: containerRect.top + containerRect.height / 2,
        };

        const { nextScale, nextPos } = calculatePinchTransform({
          initialScale: state.initialScale,
          initialDistance: state.initialDistance,
          currentDistance: currentDist,
          initialPos: { x: state.initialPosX, y: state.initialPosY },
          currentMidpoint: { x: currentMidX, y: currentMidY },
          initialMidpoint: { x: state.midpointX, y: state.midpointY },
          containerCenter,
          minScale: MIN_SCALE,
          maxScale: MAX_SCALE,
        });

        setScale(nextScale);
        setPosition(nextPos);
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      const touches = e.touches;
      const state = touchStateRef.current;
      state.touchCount = touches.length;

      if (touches.length === 1) {
        // Finger lifted from pinch; seamlessly resume 1-finger panning without jumps
        const touch = touches[0];
        state.startX = touch.clientX;
        state.startY = touch.clientY;
        state.initialPosX = posRef.current.x;
        state.initialPosY = posRef.current.y;
      } else if (touches.length === 0) {
        setIsInteracting(false);
      }
    };

    container.addEventListener("touchstart", handleTouchStart, { passive: false });
    container.addEventListener("touchmove", handleTouchMove, { passive: false });
    container.addEventListener("touchend", handleTouchEnd, { passive: false });
    container.addEventListener("touchcancel", handleTouchEnd, { passive: false });

    return () => {
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("touchmove", handleTouchMove);
      container.removeEventListener("touchend", handleTouchEnd);
      container.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, [zoomAtPoint, handleReset]);

  // Mouse drag & pan handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only main left click
    e.preventDefault();
    setShowHint(false);

    mouseDragRef.current = {
      isDragging: true,
      startX: e.clientX,
      startY: e.clientY,
      initialPosX: posRef.current.x,
      initialPosY: posRef.current.y,
      hasMoved: false,
    };
    setIsInteracting(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const drag = mouseDragRef.current;
      if (!drag.isDragging) return;

      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;

      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        drag.hasMoved = true;
      }

      setPosition({
        x: drag.initialPosX + dx,
        y: drag.initialPosY + dy,
      });
    };

    const handleMouseUp = () => {
      if (mouseDragRef.current.isDragging) {
        mouseDragRef.current.isDragging = false;
        setIsInteracting(false);
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  // Mouse Double Click to quick zoom in/out
  const handleDoubleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (scale <= 1.15) {
      zoomAtPoint(2.5, e.clientX, e.clientY);
    } else {
      handleReset();
    }
  };

  // Slider change handler
  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    zoomAtPoint(val, rect.left + rect.width / 2, rect.top + rect.height / 2);
  };

  const currentPercent = Math.round(scale * 100);

  return (
    <div
      ref={modalRef}
      data-modal="true"
      role="dialog"
      aria-modal="true"
      aria-label="مشاهده تصویر بزرگ شده"
      className="modal-overlay fixed inset-0 z-[99999] bg-black/92 backdrop-blur-md flex flex-col items-center justify-between select-none overflow-hidden animate-in fade-in duration-200"
    >
      {/* Top Floating Control Bar */}
      <header
        className="w-full max-w-4xl px-3 pt-3 pb-1 flex flex-col gap-2 z-20 shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between bg-[var(--surface)] text-[var(--ink)] px-3 py-2 rounded-2xl border-2 border-[var(--line-strong)] shadow-[3px_3px_0px_var(--neo-shadow)]">
          {/* Image title / Alt tag */}
          <div className="flex items-center gap-2 min-w-0 pr-1">
            <span className="text-xs font-black truncate max-w-[130px] sm:max-w-xs text-[var(--ink)]">
              {alt || "تصویر ضمیمه"}
            </span>
            <span className="hidden md:inline-block px-2 py-0.5 rounded-full text-[10px] font-black bg-[var(--surface-2)] text-[var(--muted)] border border-[var(--line)]">
              {currentPercent}%
            </span>
          </div>

          {/* Center Zoom Controls */}
          <div className="flex items-center gap-1 sm:gap-1.5">
            {/* Zoom In Button */}
            <button
              type="button"
              onClick={() => stepZoom(1.25)}
              className="p-1.5 sm:p-2 rounded-xl hover:bg-[var(--surface-2)] active:scale-95 transition text-[var(--ink)] cursor-pointer"
              title="بزرگ‌نمایی (+)"
              aria-label="بزرگ‌نمایی"
            >
              <ZoomIn size={18} />
            </button>

            {/* Percentage Badge & Quick Slider Toggle */}
            <button
              type="button"
              onClick={() => setShowSlider((prev) => !prev)}
              className={`px-2 py-1 rounded-xl text-xs font-mono font-black border transition-all cursor-pointer flex items-center gap-1 ${
                showSlider
                  ? "bg-[var(--testino-orange)] text-white border-[var(--testino-orange)] shadow-inner"
                  : "bg-[var(--surface-2)] hover:bg-[var(--surface-2)]/80 text-[var(--ink)] border-[var(--line)]"
              }`}
              title="تغییر پیوسته درصد زوم"
            >
              <span>{currentPercent}%</span>
              <Sliders size={12} className="opacity-70" />
            </button>

            {/* Zoom Out Button */}
            <button
              type="button"
              onClick={() => stepZoom(0.8)}
              className="p-1.5 sm:p-2 rounded-xl hover:bg-[var(--surface-2)] active:scale-95 transition text-[var(--ink)] cursor-pointer"
              title="کوچک‌نمایی (-)"
              aria-label="کوچک‌نمایی"
            >
              <ZoomOut size={18} />
            </button>

            {/* Reset / Fit to Screen Button */}
            <button
              type="button"
              onClick={handleReset}
              className={`p-1.5 sm:p-2 rounded-xl hover:bg-[var(--surface-2)] active:scale-95 transition cursor-pointer ${
                scale === 1.0 && position.x === 0 && position.y === 0
                  ? "text-[var(--muted)] opacity-60"
                  : "text-[var(--testino-orange)] font-bold"
              }`}
              title="اندازه متناسب صفحه (Fit) / کلید 0"
              aria-label="بازنشانی اندازه"
            >
              <RotateCcw size={17} />
            </button>
          </div>

          {/* Right Action Icons: Fullscreen & Close */}
          <div className="flex items-center gap-1 sm:gap-1.5 pl-1">
            <button
              type="button"
              onClick={toggleFullscreen}
              className="p-1.5 sm:p-2 rounded-xl hover:bg-[var(--surface-2)] text-[var(--ink)] transition cursor-pointer"
              title={isFullscreen ? "خروج از تمام‌صفحه (F)" : "تمام‌صفحه (F)"}
              aria-label="تمام‌صفحه"
            >
              {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>

            <div className="h-4 w-[1px] bg-[var(--line)] mx-0.5" />

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 sm:p-2 rounded-xl bg-red-100 hover:bg-red-200 dark:bg-red-950 dark:hover:bg-red-900 text-red-600 transition cursor-pointer active:scale-95"
              title="بستن (Esc)"
              aria-label="بستن"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Dynamic Zoom Slider & Preset Chips Bar */}
        {(showSlider || scale !== 1.0) && (
          <div className="flex flex-wrap items-center justify-between gap-2 bg-[var(--surface)] text-[var(--ink)] px-3 py-1.5 rounded-2xl border-2 border-[var(--line-strong)] shadow-[2px_2px_0px_var(--neo-shadow)] animate-in slide-in-from-top-1 duration-150">
            {/* Quick Preset Buttons */}
            <div className="flex items-center gap-1 overflow-x-auto py-0.5 no-scrollbar">
              <span className="text-[10px] font-black text-[var(--muted)] pl-1 whitespace-nowrap">
                پریست:
              </span>
              {PRESETS.map((preset) => {
                const isSelected =
                  preset.isFit
                    ? scale === 1.0 && position.x === 0 && position.y === 0
                    : Math.abs(scale - preset.value) < 0.05;

                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => setPreset(preset.value)}
                    className={`px-2 py-0.5 rounded-lg text-[11px] font-black transition cursor-pointer whitespace-nowrap ${
                      isSelected
                        ? "bg-[var(--testino-orange)] text-white shadow-sm"
                        : "bg-[var(--surface-2)] hover:bg-[var(--line)]/30 text-[var(--ink-soft)]"
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>

            {/* Continuous Range Slider */}
            <div className="flex items-center gap-2 flex-1 min-w-[140px] max-w-[240px] mr-auto">
              <span className="text-[10px] font-mono text-[var(--muted)]">20%</span>
              <input
                type="range"
                min={MIN_SCALE}
                max={MAX_SCALE}
                step={0.05}
                value={scale}
                onChange={handleSliderChange}
                className="w-full h-1.5 bg-[var(--surface-2)] rounded-lg appearance-none cursor-pointer accent-[var(--testino-orange)]"
                title="لغزنده زوم داینامیک"
              />
              <span className="text-[10px] font-mono text-[var(--muted)]">800%</span>
            </div>
          </div>
        )}
      </header>

      {/* Main Interactive Pan-Zoom Canvas */}
      <main
        ref={containerRef}
        className="flex-1 w-full h-full relative flex items-center justify-center overflow-hidden touch-none"
        onMouseDown={handleMouseDown}
        style={{
          cursor: isInteracting ? "grabbing" : scale > 1.0 ? "grab" : "zoom-in",
          touchAction: "none",
        }}
        onClick={(e) => {
          // If clicked directly on the dark backdrop without dragging, close
          if (e.target === e.currentTarget && !mouseDragRef.current.hasMoved) {
            onClose();
          }
        }}
      >
        <div
          className="relative max-w-full max-h-full flex items-center justify-center pointer-events-none"
          style={{
            transform: `translate3d(${position.x}px, ${position.y}px, 0px) scale(${scale})`,
            transformOrigin: "center center",
            transition: isInteracting ? "none" : "transform 0.18s cubic-bezier(0.16, 1, 0.3, 1)",
            willChange: "transform",
          }}
        >
          <img
            src={src}
            alt={alt || "تصویر"}
            draggable={false}
            onDoubleClick={handleDoubleClick}
            className="max-h-[82vh] max-w-[94vw] sm:max-h-[86vh] sm:max-w-[90vw] object-contain rounded-xl sm:rounded-2xl border-2 border-white/20 shadow-2xl bg-white/95 pointer-events-auto select-none"
          />
        </div>
      </main>

      {/* Bottom Floating Hints & Shortcuts Pill */}
      {showHint && (
        <footer
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-20 pointer-events-none px-4 py-2 rounded-2xl bg-black/80 backdrop-blur-md text-white border border-white/15 text-[11px] font-medium shadow-2xl flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-300"
        >
          <Sparkles size={14} className="text-amber-400 shrink-0" />
          <span>
            چرخ ماوس یا پینچ: زوم در نقطه دلخواه • کشیدن: جابه‌جایی • دابل‌کلیک: زوم سریع
          </span>
        </footer>
      )}
    </div>
  );
}
