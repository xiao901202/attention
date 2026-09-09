/**
 * BehaviorAnalysisEngine.ts
 * Core logic for distinguishing Reading vs. Scanning using Robust Z-Score and Stop Density.
 * 
 * @version 2.0.0
 * @description Browser extension module to classify user attention states on social media feeds
 *              based strictly on Scroll Dynamics.
 * 
 * Target States:
 * - IDLE: No movement
 * - READING_FLOW: "Staircase" scroll pattern (Scroll -> Stop to read -> Scroll)
 * - SCANNING_ZOMBIE: Continuous, smooth scrolling with no significant stops OR abnormally high speed
 * - NAVIGATING: Transition states
 */

export type AttentionState = 'IDLE' | 'READING_FLOW' | 'SCANNING_ZOMBIE' | 'NAVIGATING';

export interface AnalysisMetrics {
  currentSpeed: number;
  meanSpeed: number;     // From baseline
  stdDev: number;        // From baseline
  effectiveSigma: number;// After min-variability fix
  zScore: number;
  stopDensity: number;   // 0.0 to 1.0
}

// Configuration Constants
const CONFIG = {
  SAMPLING_RATE_MS: 100,          // 10Hz sampling rate
  BASELINE_WINDOW_SIZE: 300,      // 300 samples = 30 seconds active history
  STAIRCASE_WINDOW_SIZE: 20,      // 20 samples = 2 seconds recent history
  NOISE_THRESHOLD_PX: 15,         // Speeds below this are considered "stopped"
  MAX_VALID_SPEED_PX: 2000,       // Speeds above this do not affect baseline
  MIN_HUMAN_VARIABILITY: 50,      // Minimum StdDev to prevent Z-score instability
  ZOMBIE_Z_THRESHOLD: 1.5,        // Z-score threshold for detecting zombie scrolling
  READING_Z_UPPER: 0.8,           // Upper Z-score bound for reading state
  READING_Z_LOWER: -1.0,          // Lower Z-score bound for reading state
  STAIRCASE_DENSITY_MIN: 0.3      // Must be stopped 30% of the time to qualify as Reading
} as const;

export class BehaviorAnalysisEngine {
  private lastScrollTop: number = 0;
  private lastTime: number = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  // History Buffers
  // Stores ONLY valid active speeds for baseline calculation
  private activeSpeedHistory: number[] = [];
  // Stores ALL recent speeds (including zeros) for pattern detection (Stop Density)
  private recentRawHistory: number[] = [];

  // State Machine
  private currentState: AttentionState = 'IDLE';
  private pendingState: AttentionState = 'IDLE';
  private stabilityCounter: number = 0; // Hysteresis counter

  // Public metrics for debugging/visualization
  public metrics: AnalysisMetrics = {
    currentSpeed: 0,
    meanSpeed: 0,
    stdDev: 0,
    effectiveSigma: 0,
    zScore: 0,
    stopDensity: 0
  };

  constructor() {
    this.lastScrollTop = window.scrollY;
    this.lastTime = Date.now();
  }

  /**
   * Get the current attention state
   */
  public getState(): AttentionState {
    return this.currentState;
  }

  /**
   * Get current metrics snapshot
   */
  public getMetrics(): AnalysisMetrics {
    return { ...this.metrics };
  }

  /**
   * Start the analysis engine
   */
  public start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), CONFIG.SAMPLING_RATE_MS);
    console.log("[BehaviorEngine] Started");
  }

  /**
   * Stop the analysis engine
   */
  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    console.log("[BehaviorEngine] Stopped");
  }

  /**
   * Reset all history and state
   */
  public reset(): void {
    this.activeSpeedHistory = [];
    this.recentRawHistory = [];
    this.currentState = 'IDLE';
    this.pendingState = 'IDLE';
    this.stabilityCounter = 0;
    this.metrics = {
      currentSpeed: 0,
      meanSpeed: 0,
      stdDev: 0,
      effectiveSigma: 0,
      zScore: 0,
      stopDensity: 0
    };
    this.lastScrollTop = window.scrollY;
    this.lastTime = Date.now();
    console.log("[BehaviorEngine] Reset");
  }

  /**
   * Main Loop: Runs every 100ms
   */
  private tick(): void {
    const now = Date.now();
    const currentScrollTop = window.scrollY;
    const timeDiff = now - this.lastTime;

    if (timeDiff === 0) return;

    // 1. Calculate Instant Speed (px/s)
    const distance = Math.abs(currentScrollTop - this.lastScrollTop);
    const instantSpeed = (distance / timeDiff) * 1000;

    // 2. Update History Buffers (With filters)
    this.updateBuffers(instantSpeed);

    // 3. Compute Robust Statistics (Z-Score)
    this.calculateStatistics(instantSpeed);

    // 4. Compute Staircase Factor (Stop Density)
    const stopDensity = this.calculateStopDensity();
    this.metrics.stopDensity = stopDensity;

    // 5. Determine Raw State
    const rawState = this.determineRawState(instantSpeed, this.metrics.zScore, stopDensity);

    // 6. Apply Hysteresis (Prevent flickering)
    this.applyHysteresis(rawState);

    // Update references
    this.lastScrollTop = currentScrollTop;
    this.lastTime = now;
  }

  /**
   * Updates history buffers with robust filtering
   * 
   * Buffer A (recentRawHistory): Stores ALL speeds for Stop Density calculation
   * Buffer B (activeSpeedHistory): Stores ONLY valid active speeds for baseline
   * 
   * Filters applied to Buffer B:
   * - Fix 1: Zero-Inflation -> Ignore IDLE speeds (< NOISE_THRESHOLD_PX)
   * - Fix 2: Baseline Pollution -> Ignore Extreme speeds (> MAX_VALID_SPEED_PX)
   */
  private updateBuffers(speed: number): void {
    // Buffer A: Raw History (for Stop Density) - Keep everything
    this.recentRawHistory.push(speed);
    if (this.recentRawHistory.length > CONFIG.STAIRCASE_WINDOW_SIZE) {
      this.recentRawHistory.shift();
    }

    // Buffer B: Active Speed History (for Baseline) - Apply Filters
    if (speed > CONFIG.NOISE_THRESHOLD_PX && speed < CONFIG.MAX_VALID_SPEED_PX) {
      this.activeSpeedHistory.push(speed);
      if (this.activeSpeedHistory.length > CONFIG.BASELINE_WINDOW_SIZE) {
        this.activeSpeedHistory.shift();
      }
    }
  }

  /**
   * Calculates Mean, StdDev and Z-Score with Stabilizers
   * 
   * Formula: Z_t = (v_t - μ) / σ_effective
   * 
   * Stabilization:
   * - Cold Start: Returns neutral values when insufficient data
   * - Zero-Sigma Protection: σ_effective = max(σ_calculated, MIN_HUMAN_VARIABILITY)
   */
  private calculateStatistics(currentSpeed: number): void {
    const n = this.activeSpeedHistory.length;

    // Cold Start Handling
    if (n < 10) {
      this.metrics.meanSpeed = 0;
      this.metrics.stdDev = 1;
      this.metrics.zScore = 0;
      this.metrics.currentSpeed = currentSpeed;
      return;
    }

    // Calculate Mean
    const sum = this.activeSpeedHistory.reduce((a, b) => a + b, 0);
    const mean = sum / n;

    // Calculate StdDev
    const sumSqDiff = this.activeSpeedHistory.reduce((a, b) => a + Math.pow(b - mean, 2), 0);
    const stdDev = Math.sqrt(sumSqDiff / n);

    // Fix 3: Minimum Variability Protection (Epsilon)
    // Prevents Z-score explosion when variance is near zero
    const effectiveSigma = Math.max(stdDev, CONFIG.MIN_HUMAN_VARIABILITY);

    // Calculate Z-Score
    // We use effectiveSigma as the divisor
    const zScore = (currentSpeed - mean) / effectiveSigma;

    this.metrics.currentSpeed = currentSpeed;
    this.metrics.meanSpeed = mean;
    this.metrics.stdDev = stdDev;
    this.metrics.effectiveSigma = effectiveSigma;
    this.metrics.zScore = zScore;
  }

  /**
   * Calculates the density of "Stops" in the recent timeframe
   * 
   * StopDensity = Count(v_i < NOISE_THRESHOLD) / WindowSize
   * 
   * High Stop Density = User stops frequently (Reading)
   * Low Stop Density = Continuous movement (Scanning)
   */
  private calculateStopDensity(): number {
    if (this.recentRawHistory.length === 0) return 0;

    // Count how many samples in the short window are "stopped"
    const stopCount = this.recentRawHistory.filter(s => s < CONFIG.NOISE_THRESHOLD_PX).length;
    return stopCount / this.recentRawHistory.length;
  }

  /**
   * Classification Logic (v2.1 - Mouse Wheel Support)
   * 
   * Decision Tree:
   * 1. IDLE: Speed < NOISE_THRESHOLD
   * 2. HIGH STOP DENSITY PATH (Mouse Wheel / Discrete Scrolling):
   *    - If Stop Density >= 0.6: User is frequently pausing
   *    - This takes priority because mouse wheel produces high instantaneous speeds
   *      but the rhythm (pause-scroll-pause) indicates reading behavior
   * 3. SCANNING_ZOMBIE: 
   *    - Case A: Z-score > ZOMBIE_Z_THRESHOLD AND Stop Density < 0.4
   *    - Case B: Stop Density < 0.1 (never stops, smooth scrolling)
   * 4. READING_FLOW:
   *    - Z-score within normal range (READING_Z_LOWER to READING_Z_UPPER)
   *    - AND Stop Density >= STAIRCASE_DENSITY_MIN (frequent pauses)
   * 5. NAVIGATING: Default transition state
   */
  private determineRawState(speed: number, zScore: number, stopDensity: number): AttentionState {
    // 0. Early exit from READING_FLOW: prevent absorbing state
    // If currently reading but behavior shifts (less stops + faster speed), exit early
    if (this.currentState === 'READING_FLOW') {
      if (stopDensity < 0.35 && zScore > 0.3) {
        return 'NAVIGATING';
      }
    }

    // 1. HIGH STOP DENSITY PATH - Mouse Wheel / Discrete Scrolling Support
    // PRIORITY: Check this BEFORE IDLE check!
    // Key insight: Mouse wheel produces HIGH instantaneous speed but HIGH stop density
    // Because each wheel "click" is a burst of movement followed by reading pause
    // When stop density is very high, treat as READING even if current tick is stopped
    if (stopDensity >= 0.6) {
      // Very high stop density = user pauses frequently = READING behavior
      // Regardless of how fast each individual scroll burst is
      return 'READING_FLOW';
    }

    // 2. IDLE Check - only after ruling out high stop density reading pattern
    if (speed < CONFIG.NOISE_THRESHOLD_PX) return 'IDLE';

    // 3. ZOMBIE Check (only when stop density is reasonably low)
    // Case A: Speed is abnormally fast AND user doesn't pause much
    // Added stopDensity < 0.4 condition to prevent false positives from mouse wheel
    if (zScore > CONFIG.ZOMBIE_Z_THRESHOLD && stopDensity < 0.4) {
      return 'SCANNING_ZOMBIE';
    }

    // Case B: Speed is normal, BUT user never stops (Smooth Scrolling)
    // Low Stop Density means continuous movement = Scanning
    if (stopDensity < 0.1) return 'SCANNING_ZOMBIE';

    // 4. READING Check (medium stop density range: 0.3 ~ 0.6)
    // Condition: Speed is within normal range AND there are frequent stops (Staircase)
    if (zScore > CONFIG.READING_Z_LOWER && zScore < CONFIG.READING_Z_UPPER) {
      if (stopDensity >= CONFIG.STAIRCASE_DENSITY_MIN) {
        return 'READING_FLOW';
      }
    }

    // 5. Default Transition
    return 'NAVIGATING';
  }

  /**
   * Hysteresis to prevent flickering
   * 
   * Rules:
   * - Short IDLEs during READING_FLOW are treated as the "Stop" phase of reading
   * - State change requires 3 consecutive ticks (300ms) of the same new state
   */
  private applyHysteresis(newState: AttentionState): void {
    // Treat short IDLEs as part of READING_FLOW (the "Stop" phase of Reading)
    let effectiveState = newState;
    if (newState === 'IDLE' && this.currentState === 'READING_FLOW') {
      effectiveState = 'READING_FLOW';
    }

    if (effectiveState !== this.currentState) {
      if (this.pendingState === effectiveState) {
        this.stabilityCounter++;
        // Require fewer ticks (2) when exiting READING_FLOW to reduce stickiness
        const requiredStability = (this.currentState === 'READING_FLOW') ? 2 : 3;
        if (this.stabilityCounter >= requiredStability) {
          this.currentState = effectiveState;
          this.stabilityCounter = 0;
          this.onStateChange(this.currentState);
        }
      } else {
        this.pendingState = effectiveState;
        this.stabilityCounter = 0;
      }
    } else {
      // Reset if signal matches current state
      this.stabilityCounter = 0;
      this.pendingState = effectiveState;
    }
  }

  /**
   * State change callback - dispatches custom event
   */
  private onStateChange(newState: AttentionState): void {
    // Dispatch event for UI or other modules
    console.log(`[BehaviorEngine] State: ${newState}`, this.metrics);
    window.dispatchEvent(new CustomEvent('attention-state-change', {
      detail: { state: newState, metrics: { ...this.metrics } }
    }));
  }
}

// Export CONFIG for external access if needed
export { CONFIG as BehaviorAnalysisConfig };
