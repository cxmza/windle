import { QUALITY } from './scene-tokens';

/**
 * Adaptive quality, decline-only. Replaces drei PerformanceMonitor, whose `flipflops` counter also counts INCLINES:
 * a healthy 75 Hz GPU "inclined" every 2.5 s and hit `onFallback` ~10 s after the first frame, permanently dropping
 * DPR 1.75 -> 1 and transmission on every desktop run (perf/opportunities.md #1).
 *
 * Policy: average fps over 1 s windows, excluding hitches (single frames > QUALITY.hitch: tab switch, GC, shader
 * compile — they say nothing about throughput). Only `sustain` consecutive slow windows step quality down one level;
 * a good window resets the count, so oscillation never degrades. After a step, `settle` windows are ignored.
 * Never steps back up.
 */
export class QualityGovernor {
  step = 0;
  private time = 0;
  private frames = 0;
  private slow = 0;
  private settle: number = QUALITY.settle;

  private readonly maxStep: number;

  constructor(maxStep: number) {
    this.maxStep = maxStep;
  }

  /** Feed one frame delta (s). Returns true when quality should step down to `this.step`. */
  tick(delta: number): boolean {
    if (!(delta > 0) || delta > QUALITY.hitch) return false;
    this.time += delta;
    this.frames++;
    if (this.time < QUALITY.window) return false;
    const fps = this.frames / this.time;
    this.time = 0;
    this.frames = 0;
    if (this.settle > 0) {
      this.settle--;
      return false;
    }
    this.slow = fps < QUALITY.slowFps ? this.slow + 1 : 0;
    if (this.slow < QUALITY.sustain || this.step >= this.maxStep) return false;
    this.step++;
    this.slow = 0;
    this.settle = QUALITY.settle;
    return true;
  }
}
