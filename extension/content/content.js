/**
 * BehaviorAnalysisEngine - Content Script
 * Injected into social media pages to analyze scrolling behavior
 */

(() => {
  'use strict';

  // ============================================
  // Context Validity Check
  // ============================================
  let contextValid = true;

  function isContextValid() {
    try {
      // This will throw if context is invalidated
      return chrome.runtime?.id != null;
    } catch {
      return false;
    }
  }

  function safeSendMessage(message) {
    if (!contextValid) return Promise.resolve();
    try {
      return chrome.runtime.sendMessage(message).catch((err) => {
        if (err.message?.includes('Extension context invalidated')) {
          contextValid = false;
          console.log('[BehaviorEngine] Extension context invalidated, stopping...');
          // Visible in the DOM too: a console line in one of many tabs is not
          // something a participant or a researcher checking a session will see.
          try { document.documentElement.setAttribute('data-attention-engine', 'orphaned'); } catch {}
          cleanup();
        }
      });
    } catch (err) {
      if (err.message?.includes('Extension context invalidated')) {
        contextValid = false;
        try { document.documentElement.setAttribute('data-attention-engine', 'orphaned'); } catch {}
        cleanup();
      }
      return Promise.resolve();
    }
  }

  function cleanup() {
    if (engine?.timer) {
      engine.stop();
    }
    if (floatingIndicator) {
      floatingIndicator.remove();
      floatingIndicator = null;
    }
    hideRecordControlBubble();
    hideAnnotationReminder();
  }

  // ============================================
  // Configuration Constants
  // ============================================
  const CONFIG = {
    SAMPLING_RATE_MS: 100,
    BASELINE_WINDOW_SIZE: 300,
    STAIRCASE_WINDOW_SIZE: 20,
    NOISE_THRESHOLD_PX: 20,
    MAX_VALID_SPEED_PX: 2000,
    MIN_HUMAN_VARIABILITY: 50,
    ZOMBIE_Z_THRESHOLD: 1.2,     // Lowered: easier to enter zombie
    READING_Z_UPPER: 0.6,        // Narrowed: harder to enter reading
    READING_Z_LOWER: -0.8,       // Narrowed reading range
    STAIRCASE_DENSITY_MIN: 0.45  // Raised: reading requires more stops
  };

  // ============================================
  // BehaviorAnalysisEngine Class
  // ============================================
  class BehaviorAnalysisEngine {
    constructor() {
      this.lastScrollTop = window.scrollY;
      this.lastTime = Date.now();
      this.timer = null;
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
        stopDensity: 0,
        scrollTop: 0,
        pageHeight: 0,
        activeSpeedMean: 0,
        avgPauseDuration: 0
      };
      
      // Statistics
      this.sessionStats = {
        startTime: Date.now(),
        stateHistory: [],
        zombieTime: 0,
        readingTime: 0,
        idleTime: 0,
        navigatingTime: 0,
        lastStateChange: Date.now()
      };
      
      // Recording throttle
      this.lastRecordDataSent = 0;

      // Pause duration tracking
      this.pauseStartTime = null;        // Timestamp when current pause started (null = moving)
      this.recentPauseDurations = [];    // Last 5 completed pause durations (ms)
      this.deviceType = 'UNKNOWN';       // 'MOUSE' | 'TOUCHPAD' | 'UNKNOWN'

      // Mouse inactivity tracking (for READING → IDLE after 30s no mouse activity)
      this.lastMouseActivityTime = Date.now();
    }

    getState() { return this.currentState; }
    getMetrics() { return { ...this.metrics }; }
    getStats() { return { ...this.sessionStats }; }

    start() {
      if (this.timer) return;
      this.timer = setInterval(() => this.tick(), CONFIG.SAMPLING_RATE_MS);
      console.log('[BehaviorEngine] 啟動滾動行為分析');
    }

    stop() {
      if (this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    }

    reset() {
      this.activeSpeedHistory = [];
      this.recentRawHistory = [];
      this.currentState = 'IDLE';
      this.pendingState = 'IDLE';
      this.stabilityCounter = 0;
      this.metrics = { currentSpeed: 0, meanSpeed: 0, stdDev: 0, effectiveSigma: 0, zScore: 0, stopDensity: 0, scrollTop: 0, pageHeight: 0, activeSpeedMean: 0, avgPauseDuration: 0 };
      this.sessionStats = {
        startTime: Date.now(),
        stateHistory: [],
        zombieTime: 0,
        readingTime: 0,
        idleTime: 0,
        navigatingTime: 0,
        lastStateChange: Date.now()
      };
      this.lastScrollTop = window.scrollY;
      this.lastTime = Date.now();
      this.pauseStartTime = null;
      this.recentPauseDurations = [];
      this.lastMouseActivityTime = Date.now();
    }

    tick() {
      // Check if extension context is still valid
      if (!contextValid || !isContextValid()) {
        contextValid = false;
        this.stop();
        console.log('[BehaviorEngine] Context invalidated, engine stopped');
        return;
      }

      const now = Date.now();
      const currentScrollTop = window.scrollY;
      const timeDiff = now - this.lastTime;
      
      // Skip if no time passed
      if (timeDiff === 0) return;
      
      // Prevent abnormally large timeDiff (e.g., if tab was inactive)
      const clampedTimeDiff = Math.min(timeDiff, 200); // Max 200ms

      const distance = Math.abs(currentScrollTop - this.lastScrollTop);
      const instantSpeed = (distance / clampedTimeDiff) * 1000;

      // Set currentSpeed IMMEDIATELY so it's always up to date
      this.metrics.currentSpeed = instantSpeed;
      this.metrics.scrollTop = currentScrollTop;
      this.metrics.pageHeight = document.documentElement.scrollHeight;

      this.updateBuffers(instantSpeed);
      this.calculateStatistics(instantSpeed);
      const stopDensity = this.calculateStopDensity();
      this.metrics.stopDensity = stopDensity;

      // Track pause duration between scrolls, and mouse activity time on scroll
      if (instantSpeed >= CONFIG.NOISE_THRESHOLD_PX) {
        this.lastMouseActivityTime = now;
      }
      if (instantSpeed < CONFIG.NOISE_THRESHOLD_PX) {
        if (this.pauseStartTime === null) this.pauseStartTime = now;
      } else {
        if (this.pauseStartTime !== null) {
          const pd = now - this.pauseStartTime;
          this.recentPauseDurations.push(pd);
          if (this.recentPauseDurations.length > 5) this.recentPauseDurations.shift();
          this.pauseStartTime = null;
        }
      }
      const avgPauseDuration = this.recentPauseDurations.length > 0
        ? this.recentPauseDurations.reduce((a, b) => a + b, 0) / this.recentPauseDurations.length
        : 0;
      this.metrics.avgPauseDuration = avgPauseDuration;

      const activeSpeeds = this.recentRawHistory.filter(s => s > 0);
      this.metrics.activeSpeedMean = activeSpeeds.length > 0
        ? activeSpeeds.reduce((a, b) => a + b, 0) / activeSpeeds.length
        : 0;

      const rawState = this.determineRawState(instantSpeed, this.metrics.zScore, stopDensity, distance);
      this.applyHysteresis(rawState);

      // Update scroll position tracking IMMEDIATELY after calculations
      // This must happen before any async operations to prevent timing issues
      this.lastScrollTop = currentScrollTop;
      this.lastTime = now;
    }

    updateBuffers(speed) {
      this.recentRawHistory.push(speed);
      if (this.recentRawHistory.length > CONFIG.STAIRCASE_WINDOW_SIZE) {
        this.recentRawHistory.shift();
      }

      if (speed > CONFIG.NOISE_THRESHOLD_PX && speed < CONFIG.MAX_VALID_SPEED_PX) {
        this.activeSpeedHistory.push(speed);
        if (this.activeSpeedHistory.length > CONFIG.BASELINE_WINDOW_SIZE) {
          this.activeSpeedHistory.shift();
        }
      }
    }

    calculateStatistics(currentSpeed) {
      const n = this.activeSpeedHistory.length;
      if (n < 10) {
        this.metrics.meanSpeed = 0;
        this.metrics.stdDev = 1;
        this.metrics.zScore = 0;
        this.metrics.currentSpeed = currentSpeed;
        return;
      }

      const sum = this.activeSpeedHistory.reduce((a, b) => a + b, 0);
      const mean = sum / n;
      const sumSqDiff = this.activeSpeedHistory.reduce((a, b) => a + Math.pow(b - mean, 2), 0);
      const stdDev = Math.sqrt(sumSqDiff / n);
      const effectiveSigma = Math.max(stdDev, CONFIG.MIN_HUMAN_VARIABILITY);
      const zScore = (currentSpeed - mean) / effectiveSigma;

      this.metrics.currentSpeed = currentSpeed;
      this.metrics.meanSpeed = mean;
      this.metrics.stdDev = stdDev;
      this.metrics.effectiveSigma = effectiveSigma;
      this.metrics.zScore = zScore;
    }

    calculateStopDensity() {
      if (this.recentRawHistory.length === 0) return 0;
      const stopCount = this.recentRawHistory.filter(s => s < CONFIG.NOISE_THRESHOLD_PX).length;
      return stopCount / this.recentRawHistory.length;
    }

    determineRawState(speed, zScore, stopDensity, distance = 0) {
      // Flick detection: single tick scrolled more than one full screen → immediate zombie
      if (distance >= window.innerHeight) {
        return 'SCANNING_ZOMBIE';
      }

      const activeCount = this.recentRawHistory.filter(s => s >= CONFIG.NOISE_THRESHOLD_PX).length;
      const hasRecentActivity = activeCount >= 2;
      const currentPauseDuration = this.pauseStartTime !== null ? Date.now() - this.pauseStartTime : 0;
      const avgPause = this.metrics.avgPauseDuration;

      // MOUSE PATH: classify by pause duration between scrolls
      // Key insight: zombie = short pauses (<1s), reading = long pauses (>1.5s)
      if (this.deviceType === 'MOUSE') {
        // A long ongoing pause always indicates reading, regardless of history
        if (currentPauseDuration > 1500) {
          return 'READING_FLOW';
        }
        // With enough pause history, classify by average pause duration
        if (this.recentPauseDurations.length >= 2) {
          if (avgPause > 1500) {
            return 'READING_FLOW';
          }
          if (avgPause < 1000) {
            return 'SCANNING_ZOMBIE';
          }
          // Gray zone (1000–1500ms): fall through to standard logic
        }
      }

      // STANDARD PATH (touchpad, unknown, or mouse gray zone)

      // 1. IDLE Check
      if (speed < CONFIG.NOISE_THRESHOLD_PX) {
        if (stopDensity >= 0.8 && !hasRecentActivity) {
          return 'IDLE';
        }
        return 'IDLE';
      }

      // Early exit from READING_FLOW
      if (this.currentState === 'READING_FLOW') {
        if (stopDensity < 0.4 || zScore > 0.4) {
          return 'NAVIGATING';
        }
      }

      // 2. ZOMBIE Check
      const hasEnoughData = this.recentRawHistory.length >= 8;
      if (hasEnoughData) {
        if (zScore > CONFIG.ZOMBIE_Z_THRESHOLD && stopDensity < 0.25) {
          return 'SCANNING_ZOMBIE';
        }
        if (stopDensity < 0.15) {
          return 'SCANNING_ZOMBIE';
        }
      }

      // 3. READING Check
      if (zScore >= CONFIG.READING_Z_LOWER && zScore <= CONFIG.READING_Z_UPPER) {
        if (stopDensity >= CONFIG.STAIRCASE_DENSITY_MIN && stopDensity < 0.85) {
          return 'READING_FLOW';
        }
      }

      return 'NAVIGATING';
    }

    applyHysteresis(newState) {
      let effectiveState = newState;
      // Maintain READING_FLOW while mouse is still active (move/click/scroll within 30s)
      // If mouse has been completely inactive for 30s, allow transition to IDLE
      if (newState === 'IDLE' && this.currentState === 'READING_FLOW') {
        const mouseInactiveDuration = Date.now() - this.lastMouseActivityTime;
        if (mouseInactiveDuration < 30000) {
          effectiveState = 'READING_FLOW';
        }
      }

      if (effectiveState !== this.currentState) {
        if (this.pendingState === effectiveState) {
          this.stabilityCounter++;
          // Require fewer ticks (2) when exiting READING_FLOW to reduce stickiness
          const requiredStability = (this.currentState === 'READING_FLOW') ? 2 : 3;
          if (this.stabilityCounter >= requiredStability) {
            // Update time stats
            const now = Date.now();
            const duration = now - this.sessionStats.lastStateChange;
            switch (this.currentState) {
              case 'SCANNING_ZOMBIE': this.sessionStats.zombieTime += duration; break;
              case 'READING_FLOW': this.sessionStats.readingTime += duration; break;
              case 'IDLE': this.sessionStats.idleTime += duration; break;
              case 'NAVIGATING': this.sessionStats.navigatingTime += duration; break;
            }
            this.sessionStats.lastStateChange = now;
            
            this.currentState = effectiveState;
            this.stabilityCounter = 0;
            this.onStateChange(this.currentState);
          }
        } else {
          this.pendingState = effectiveState;
          this.stabilityCounter = 0;
        }
      } else {
        this.stabilityCounter = 0;
        this.pendingState = effectiveState;
      }
    }

    onStateChange(newState) {
      if (!contextValid) return;
      
      this.sessionStats.stateHistory.push({
        state: newState,
        timestamp: Date.now()
      });
      
      // Recording: Track segments. Skip when:
      //   - not recording / paused (timestamps must stay aligned with the video)
      //   - this tab isn't the active one (background only collects from the
      //     focused tab to avoid overlapping segments across tabs)
      if (isRecording && !isRecordingPaused && isTabActive && recordingStartTime) {
        const elapsed = getRecordingElapsed();

        // End previous segment
        if (currentSegmentStart !== null) {
          const segmentDuration = elapsed - currentSegmentStart;
          if (segmentDuration >= MIN_SEGMENT_DURATION_MS) {
            safeSendMessage({
              type: 'RECORD_SEGMENT',
              segment: {
                startTime: currentSegmentStart,
                endTime: elapsed,
                state: currentSegmentState,
                url: window.location.href,
                label: null,
                clickCount: segmentClickCount
              }
            });
          }
          segmentClickCount = 0;
        }

        // Start new segment
        currentSegmentStart = elapsed;
        currentSegmentState = newState;
      }
      
      // Send to background script (safely)
      safeSendMessage({
        type: 'STATE_CHANGE',
        state: newState,
        metrics: { ...this.metrics },
        stats: this.getStats()
      });
      
      // Update floating indicator
      updateFloatingIndicator(newState);
    }
  }

  // ============================================
  // Floating Indicator UI
  // ============================================
  let floatingIndicator = null;

  function createFloatingIndicator() {
    if (floatingIndicator) return;

    floatingIndicator = document.createElement('div');
    floatingIndicator.id = 'behavior-analysis-indicator';
    floatingIndicator.innerHTML = `
      <div class="bae-inner">
        <div class="bae-icon"></div>
        <div class="bae-label">IDLE</div>
      </div>
    `;
    document.body.appendChild(floatingIndicator);
  }

  function updateFloatingIndicator(state) {
    if (!floatingIndicator) return;
    
    const label = floatingIndicator.querySelector('.bae-label');
    const inner = floatingIndicator.querySelector('.bae-inner');
    
    // Remove all state classes
    inner.classList.remove('state-IDLE', 'state-READING_FLOW', 'state-SCANNING_ZOMBIE', 'state-NAVIGATING');
    inner.classList.add(`state-${state}`);
    
    // Update label
    const stateLabels = {
      'IDLE': '閒置',
      'READING_FLOW': '閱讀中',
      'SCANNING_ZOMBIE': '⚠️ 無意識滾動',
      'NAVIGATING': '瀏覽中'
    };
    label.textContent = stateLabels[state] || state;
    
    // Animate on zombie state
    if (state === 'SCANNING_ZOMBIE') {
      floatingIndicator.classList.add('warning');
    } else {
      floatingIndicator.classList.remove('warning');
    }
  }

  function hideFloatingIndicator() {
    if (floatingIndicator) {
      floatingIndicator.style.display = 'none';
    }
  }

  function showFloatingIndicator() {
    if (floatingIndicator) {
      floatingIndicator.style.display = 'block';
    }
  }

  // ============================================
  // Recording Control Bubble (no timer; pause/resume + stop)
  // ============================================
  let recordControlBubble = null;
  let recordBubblePaused = false;

  // SVG icon strings — kept inline to avoid extra resource fetching
  const ICON_PAUSE = '<svg viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';
  const ICON_PLAY  = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
  const ICON_STOP  = '<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';

  function showRecordControlBubble() {
    if (recordControlBubble) return;
    recordControlBubble = document.createElement('div');
    recordControlBubble.id = 'behavior-record-bubble';
    recordControlBubble.innerHTML = `
      <div class="brb-inner">
        <div class="brb-dot"></div>
        <span class="brb-label">錄製中</span>
        <button class="brb-btn brb-pause" type="button" title="暫停錄製">${ICON_PAUSE}</button>
        <button class="brb-btn brb-stop" type="button" title="停止錄製">${ICON_STOP}</button>
      </div>
    `;
    document.body.appendChild(recordControlBubble);

    const pauseBtn = recordControlBubble.querySelector('.brb-pause');
    const stopBtn  = recordControlBubble.querySelector('.brb-stop');

    pauseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      safeSendMessage({ type: 'TOGGLE_RECORDING_PAUSE' });
    });

    stopBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm('確定要結束本次錄製嗎？')) {
        safeSendMessage({ type: 'STOP_RECORDING_FROM_PAGE' });
      }
    });

    makeBubbleDraggable(recordControlBubble);
  }

  function hideRecordControlBubble() {
    if (recordControlBubble) {
      recordControlBubble.remove();
      recordControlBubble = null;
    }
    recordBubblePaused = false;
  }

  function updateRecordControlBubble(paused) {
    recordBubblePaused = paused;
    if (!recordControlBubble) return;
    const root  = recordControlBubble;
    const btn   = root.querySelector('.brb-pause');
    const label = root.querySelector('.brb-label');
    if (paused) {
      root.classList.add('paused');
      btn.innerHTML = ICON_PLAY;
      btn.title = '繼續錄製';
      label.textContent = '已暫停';
    } else {
      root.classList.remove('paused');
      btn.innerHTML = ICON_PAUSE;
      btn.title = '暫停錄製';
      label.textContent = '錄製中';
    }
  }

  function makeBubbleDraggable(el) {
    let dragging = false;
    let startX = 0, startY = 0;
    let startLeft = 0, startTop = 0;

    el.addEventListener('mousedown', (e) => {
      // Don't drag when clicking buttons
      if (e.target.closest('button')) return;
      dragging = true;
      el.classList.add('dragging');
      const rect = el.getBoundingClientRect();
      startX = e.clientX; startY = e.clientY;
      startLeft = rect.left; startTop = rect.top;
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX, dy = e.clientY - startY;
      const newLeft = Math.max(8, Math.min(window.innerWidth - el.offsetWidth - 8, startLeft + dx));
      const newTop  = Math.max(8, Math.min(window.innerHeight - el.offsetHeight - 8, startTop + dy));
      el.style.left  = newLeft + 'px';
      el.style.top   = newTop + 'px';
      el.style.right = 'auto';
    });

    document.addEventListener('mouseup', () => {
      if (dragging) {
        dragging = false;
        el.classList.remove('dragging');
      }
    });
  }

  // ============================================
  // Annotation Reminder Bubble (after recording completes)
  // ============================================
  let annotationReminder = null;

  function showAnnotationReminder() {
    if (annotationReminder) annotationReminder.remove();
    annotationReminder = document.createElement('div');
    annotationReminder.id = 'behavior-annotation-reminder';
    annotationReminder.innerHTML = `
      <div class="bar-inner">
        <span class="bar-emoji">🎉</span>
        <div class="bar-text">
          <div class="bar-title">錄製完成！</div>
          <div class="bar-sub">前往標註介面開始標註</div>
        </div>
        <button class="bar-go" type="button">前往標註 →</button>
        <button class="bar-close" type="button" title="關閉">×</button>
      </div>
    `;
    document.body.appendChild(annotationReminder);

    annotationReminder.querySelector('.bar-go').addEventListener('click', (e) => {
      e.stopPropagation();
      safeSendMessage({ type: 'OPEN_ANNOTATION_TAB' });
      hideAnnotationReminder();
    });

    annotationReminder.querySelector('.bar-close').addEventListener('click', (e) => {
      e.stopPropagation();
      hideAnnotationReminder();
    });
  }

  function hideAnnotationReminder() {
    if (annotationReminder) {
      annotationReminder.remove();
      annotationReminder = null;
    }
  }

  // ============================================
  // Recording State
  // ============================================
  let isRecording = false;
  let isRecordingPaused = false;
  let recordingPauseStart = null;
  let recordingTotalPausedMs = 0;
  let recordingStartTime = null;
  let currentSegmentStart = null;
  let currentSegmentState = 'IDLE';
  let segmentClickCount = 0;
  // Whether THIS tab is currently the focused one. Background acts as the
  // "traffic cop" and tells us via TAB_ACTIVATED / TAB_DEACTIVATED. Only the
  // active tab is allowed to push segments / mouse events into the unified
  // cross-page timeline, so we never get overlapping segments from multiple
  // tabs running their own engines in parallel.
  let isTabActive = true;
  const MIN_SEGMENT_DURATION_MS = 1000;

  // Effective recording elapsed (excludes paused intervals) — keeps segment
  // timestamps aligned with the video file (which is also paused/resumed).
  function getRecordingElapsed() {
    if (!recordingStartTime) return 0;
    let elapsed = Date.now() - recordingStartTime;
    elapsed -= recordingTotalPausedMs;
    if (isRecordingPaused && recordingPauseStart) {
      elapsed -= (Date.now() - recordingPauseStart);
    }
    return Math.max(0, elapsed);
  }

  // ============================================
  // Mouse Event Tracking for Recording
  // ============================================
  function setupMouseTracking() {
    // Throttle mouse move events
    let lastMouseMove = 0;
    const MOUSE_THROTTLE_MS = 100;

    // Helper: only forward mouse events to background when we are the active
    // tab and recording (avoids cross-tab data pollution in the timeline).
    const canForwardMouse = () =>
      isRecording && !isRecordingPaused && isTabActive && contextValid;

    document.addEventListener('mousemove', (e) => {
      // Always update mouse activity time (not just during recording)
      engine.lastMouseActivityTime = Date.now();

      if (!canForwardMouse()) return;
      const now = Date.now();
      if (now - lastMouseMove < MOUSE_THROTTLE_MS) return;
      lastMouseMove = now;

      safeSendMessage({
        type: 'MOUSE_EVENT',
        eventType: 'move',
        x: e.clientX,
        y: e.clientY,
      });
    });

    document.addEventListener('wheel', (e) => {
      if (!canForwardMouse()) return;
      safeSendMessage({
        type: 'MOUSE_EVENT',
        eventType: 'wheel',
        x: e.clientX,
        y: e.clientY,
        deltaX: e.deltaX,
        deltaY: e.deltaY,
      });
    });

    document.addEventListener('click', (e) => {
      // Always update mouse activity time
      engine.lastMouseActivityTime = Date.now();
      // Only count clicks for the segment when we're the active recording tab
      if (isRecording && !isRecordingPaused && isTabActive) segmentClickCount++;

      if (!canForwardMouse()) return;
      safeSendMessage({
        type: 'MOUSE_EVENT',
        eventType: 'click',
        x: e.clientX,
        y: e.clientY,
        button: e.button,
      });
    });

    document.addEventListener('mousedown', (e) => {
      if (!canForwardMouse()) return;
      safeSendMessage({
        type: 'MOUSE_EVENT',
        eventType: 'mousedown',
        x: e.clientX,
        y: e.clientY,
        button: e.button,
      });
    });

    document.addEventListener('mouseup', (e) => {
      if (!canForwardMouse()) return;
      safeSendMessage({
        type: 'MOUSE_EVENT',
        eventType: 'mouseup',
        x: e.clientX,
        y: e.clientY,
        button: e.button,
      });
    });
  }

  // ============================================
  // Initialize
  // ============================================
  const engine = new BehaviorAnalysisEngine();
  let isEnabled = true;

  // Check if context is valid before initializing
  if (!isContextValid()) {
    console.log('[BehaviorEngine] Extension context not valid, aborting initialization');
    return;
  }

  console.log('[BehaviorEngine] Starting initialization...');

  // Helper function to start the engine
  function initializeEngine(showIndicator = true) {
    console.log('[BehaviorEngine] Initializing engine...');
    try {
      createFloatingIndicator();
      if (!showIndicator) {
        hideFloatingIndicator();
      }
      engine.start();
      setupMouseTracking();

      // Device type detection: distinguish mouse wheel from touchpad
      // deltaMode === 1 (DOM_DELTA_LINE) or large pixel delta → mouse wheel
      // deltaMode === 0 with small delta → touchpad
      window.addEventListener('wheel', (e) => {
        engine.lastMouseActivityTime = Date.now();
        const absY = Math.abs(e.deltaY);
        if (e.deltaMode === 1 || (e.deltaMode === 0 && absY > 60)) {
          engine.deviceType = 'MOUSE';
        } else if (e.deltaMode === 0 && absY < 30) {
          engine.deviceType = 'TOUCHPAD';
        }
      }, { passive: true });

      console.log('[BehaviorEngine] Engine started successfully');
    } catch (err) {
      console.error('[BehaviorEngine] Error starting engine:', err);
    }
  }

  // Load settings and start
  try {
    chrome.storage.sync.get(['enabled', 'showIndicator'], (result) => {
      if (chrome.runtime.lastError) {
        console.warn('[BehaviorEngine] Storage error:', chrome.runtime.lastError);
        // Start with defaults
        initializeEngine(true);
        return;
      }
      
      if (!contextValid) return;
      
      isEnabled = result.enabled !== false; // Default to true
      const showIndicator = result.showIndicator !== false; // Default to true
      
      if (isEnabled) {
        initializeEngine(showIndicator);
      }
    });
  } catch (err) {
    console.error('[BehaviorEngine] Failed to access storage:', err);
    // Fallback: start with defaults
    initializeEngine(true);
  }

  // Check if recording is already in progress
  try {
    chrome.storage.local.get(['isRecording', 'recordingStartTime', 'recordingPaused'], (result) => {
      if (chrome.runtime.lastError) {
        console.warn('[BehaviorEngine] Local storage error:', chrome.runtime.lastError);
        return;
      }
      if (result.isRecording) {
        isRecording = true;
        recordingStartTime = result.recordingStartTime || Date.now();
        // Don't assume we own the open segment — background drives that via
        // TAB_ACTIVATED. A late-joining tab stays passive until promoted.
        isTabActive = false;
        currentSegmentStart = null;
        currentSegmentState = engine.getState();
        console.log('[BehaviorEngine] Joined ongoing recording session (passive) at', Date.now() - recordingStartTime, 'ms');
        showRecordControlBubble();
        updateRecordControlBubble(!!result.recordingPaused);
      }
    });
  } catch (err) {
    console.warn('[BehaviorEngine] Could not check recording state:', err);
  }

  // Listen for messages from popup/background
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!contextValid) {
      sendResponse({ error: 'Context invalidated' });
      return;
    }
    
    switch (message.type) {
      case 'GET_STATUS':
        sendResponse({
          state: engine.getState(),
          metrics: engine.getMetrics(),
          stats: engine.getStats(),
          isRunning: !!engine.timer
        });
        break;
        
      case 'TOGGLE_ENGINE':
        if (message.enabled) {
          createFloatingIndicator();
          showFloatingIndicator();
          engine.start();
          isEnabled = true;
        } else {
          engine.stop();
          hideFloatingIndicator();
          isEnabled = false;
        }
        sendResponse({ success: true });
        break;
        
      case 'TOGGLE_INDICATOR':
        if (message.show) {
          showFloatingIndicator();
        } else {
          hideFloatingIndicator();
        }
        sendResponse({ success: true });
        break;
        
      case 'RESET_STATS':
        engine.reset();
        updateFloatingIndicator('IDLE');
        sendResponse({ success: true });
        break;
        
      case 'RECORDING_STARTED':
        isRecording = true;
        isRecordingPaused = false;
        recordingPauseStart = null;
        recordingTotalPausedMs = 0;
        recordingStartTime = Date.now();
        // Default to inactive — background will explicitly send TAB_ACTIVATED
        // to the focused tab. Best-effort guess from page visibility so that
        // if the message is delayed we still capture data on the right tab.
        isTabActive = (document.visibilityState === 'visible' && document.hasFocus());
        currentSegmentStart = isTabActive ? 0 : null;
        currentSegmentState = engine.getState();
        segmentClickCount = 0;
        console.log('[BehaviorEngine] Recording mode activated, initial state:', currentSegmentState, 'active?', isTabActive);
        showRecordControlBubble();
        updateRecordControlBubble(false);
        hideAnnotationReminder();
        sendResponse({ success: true });
        break;

      case 'TAB_ACTIVATED':
        // Promoted to active tab — open a fresh segment at the current elapsed.
        if (isRecording && !isRecordingPaused && !isTabActive) {
          isTabActive = true;
          // Prefer the boundary the background stamped, so this segment starts
          // exactly where the outgoing tab's segment ends.
          currentSegmentStart = typeof message.at === 'number' ? message.at : getRecordingElapsed();
          currentSegmentState = engine.getState();
          segmentClickCount = 0;
          console.log('[BehaviorEngine] Tab activated mid-recording, new segment from', currentSegmentStart);
        } else {
          isTabActive = true;
        }
        sendResponse({ success: true });
        break;

      case 'TAB_DEACTIVATED':
        // Demoted to background — finalize the current segment so it doesn't
        // overlap with whatever the next active tab will open.
        if (isRecording && !isRecordingPaused && isTabActive && currentSegmentStart !== null) {
          // Close on the background's stamped boundary, not this tab's own
          // clock: by now this tab is losing focus and being throttled, so its
          // reading would land after the next tab already opened its segment.
          const elapsed = typeof message.at === 'number' ? message.at : getRecordingElapsed();
          const segmentDuration = elapsed - currentSegmentStart;
          if (segmentDuration >= MIN_SEGMENT_DURATION_MS) {
            safeSendMessage({
              type: 'RECORD_SEGMENT',
              segment: {
                startTime: currentSegmentStart,
                endTime: elapsed,
                state: currentSegmentState,
                url: window.location.href,
                label: null,
                clickCount: segmentClickCount,
              },
            });
          }
          segmentClickCount = 0;
          currentSegmentStart = null;
        }
        isTabActive = false;
        sendResponse({ success: true });
        break;

      case 'RECORDING_PAUSED':
        if (isRecording && !isRecordingPaused) {
          isRecordingPaused = true;
          recordingPauseStart = Date.now();

          // Close current open segment up to the pause boundary so we don't lose data.
          // Only the active tab has an open segment to close.
          if (isTabActive && currentSegmentStart !== null) {
            const elapsed = getRecordingElapsed();
            const segmentDuration = elapsed - currentSegmentStart;
            if (segmentDuration >= MIN_SEGMENT_DURATION_MS) {
              safeSendMessage({
                type: 'RECORD_SEGMENT',
                segment: {
                  startTime: currentSegmentStart,
                  endTime: elapsed,
                  state: currentSegmentState,
                  url: window.location.href,
                  label: null,
                  clickCount: segmentClickCount,
                },
              });
            }
            segmentClickCount = 0;
            currentSegmentStart = null;
          }
        }
        updateRecordControlBubble(true);
        sendResponse({ success: true });
        break;

      case 'RECORDING_RESUMED':
        if (isRecording && isRecordingPaused) {
          if (recordingPauseStart) {
            recordingTotalPausedMs += Date.now() - recordingPauseStart;
            recordingPauseStart = null;
          }
          isRecordingPaused = false;
          // Only the active tab opens a fresh segment on resume.
          if (isTabActive) {
            currentSegmentStart = getRecordingElapsed();
            currentSegmentState = engine.getState();
          }
        }
        updateRecordControlBubble(false);
        sendResponse({ success: true });
        break;

      case 'SHOW_ANNOTATION_REMINDER':
        showAnnotationReminder();
        sendResponse({ success: true });
        break;

      case 'RECORDING_STOPPED':
        // Finalize last segment before stopping (only the active tab owns one).
        if (isRecording && !isRecordingPaused && isTabActive && currentSegmentStart !== null && recordingStartTime) {
          const elapsed = getRecordingElapsed();
          const segmentDuration = elapsed - currentSegmentStart;
          if (segmentDuration >= MIN_SEGMENT_DURATION_MS) {
            safeSendMessage({
              type: 'RECORD_SEGMENT',
              segment: {
                startTime: currentSegmentStart,
                endTime: elapsed,
                state: currentSegmentState,
                url: window.location.href,
                label: null,
                clickCount: segmentClickCount
              }
            });
          }
        }
        isRecording = false;
        isRecordingPaused = false;
        recordingPauseStart = null;
        recordingTotalPausedMs = 0;
        recordingStartTime = null;
        currentSegmentStart = null;
        currentSegmentState = 'IDLE';
        segmentClickCount = 0;
        isTabActive = true;
        console.log('[BehaviorEngine] Recording mode deactivated');
        hideRecordControlBubble();
        sendResponse({ success: true });
        break;
    }
    return true; // Keep channel open for async response
  });

  // Periodic stats update to background
  // More frequent when recording to capture state changes
  // Stats update interval with proper throttling
  let lastStatsUpdate = 0;
  setInterval(() => {
    if (!contextValid) return;
    if (isEnabled && engine.timer) {
      const now = Date.now();
      const updateInterval = isRecording ? 500 : 1000; // Slower when recording to reduce load
      
      if (now - lastStatsUpdate >= updateInterval) {
        lastStatsUpdate = now;
        safeSendMessage({
          type: 'STATS_UPDATE',
          state: engine.getState(),
          metrics: engine.getMetrics(),
          stats: engine.getStats()
        });
      }
    }
  }, 100); // Check interval - actual sending is throttled by lastStatsUpdate

  console.log('[BehaviorEngine] Content script 已載入');
})();
