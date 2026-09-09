/**
 * Background Service Worker
 * Handles badge updates, cross-tab communication, and recording state management
 */

// Badge colors for different states
const BADGE_COLORS = {
  'IDLE': '#8b949e',
  'READING_FLOW': '#3fb950',
  'SCANNING_ZOMBIE': '#f85149',
  'NAVIGATING': '#d29922'
};

// Recording state
let recordingState = {
  isRecording: false,
  isPaused: false,
  pauseStartTime: null,
  totalPausedMs: 0,
  startTime: null,
  duration: null,
  recordingId: null,
  interval: null,
  scrollData: [],
  mouseData: [],
  segments: [],
  lastState: 'IDLE',
  dataPointCount: 0,
  mouseEventCount: 0,
  // Grace window after stopRecording() during which late RECORD_SEGMENT
  // messages from content scripts (their final segment) are still accepted.
  acceptSegmentsUntil: 0,
};

// Currently focused tab — single source of truth for the unified "user
// behaviour" timeline. Segments / mouse / scroll data are only collected from
// this tab; on tab switch we hand off cleanly so segments don't overlap and
// the timeline stays continuous across pages.
let activeTabId = null;

// Effective elapsed time (excludes paused intervals)
function getEffectiveElapsed() {
  if (!recordingState.startTime) return 0;
  let elapsed = Date.now() - recordingState.startTime;
  elapsed -= (recordingState.totalPausedMs || 0);
  if (recordingState.isPaused && recordingState.pauseStartTime) {
    elapsed -= (Date.now() - recordingState.pauseStartTime);
  }
  return Math.max(0, elapsed);
}

const MIN_SEGMENT_DURATION_MS = 1000; // Reduced to capture shorter segments
const STREAMING_MIN_READING_MS = 2000;

// Forward READING_FLOW segments to extension pages (recorder.js) for
// streaming VLM pre-analysis while the recording is still in progress.
function forwardStreamingSegment(segment) {
  if (!segment) return;
  if (segment.state !== 'READING_FLOW') return;
  const dur = (segment.endTime || 0) - (segment.startTime || 0);
  if (dur < STREAMING_MIN_READING_MS) return;
  chrome.runtime.sendMessage({
    type: 'STREAMING_SEGMENT',
    segment: {
      startTime: segment.startTime,
      endTime: segment.endTime,
      state: segment.state,
      url: segment.url || '',
    },
  }).catch(() => {});
}

// Listen for messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const fromActiveTab = !!sender.tab && sender.tab.id === activeTabId;

  // State change from content script — used to update the per-tab badge and
  // to track the engine state of the focused tab. Segments themselves come
  // exclusively from RECORD_SEGMENT (content.js is the single source of truth).
  if (message.type === 'STATE_CHANGE') {
    updateBadgeForState(message, sender);
    if (recordingState.isRecording && !recordingState.isPaused && fromActiveTab) {
      recordingState.lastState = message.state || recordingState.lastState;
    }
  }

  // Stats update from content script
  if (message.type === 'STATS_UPDATE') {
    // Forward to popup if open (always — popup shows current tab's metrics)
    chrome.runtime.sendMessage(message).catch(() => {});

    // Only collect from the currently focused tab to keep a single coherent
    // timeline. Other tabs' engines keep running locally but we ignore them.
    if (recordingState.isRecording && !recordingState.isPaused && fromActiveTab) {
      if (message.metrics) {
        collectScrollData(message);
      }
      if (message.state) {
        recordingState.lastState = message.state;
      }
    }
  }

  // Recording controls from recorder page
  if (message.type === 'START_RECORDING') {
    startRecording(message.duration, message.recordingId);
    sendResponse({ success: true });
  }

  if (message.type === 'STOP_RECORDING') {
    stopRecording();
    sendResponse({ success: true });
  }

  // Pause/resume requested from content-script bubble (running in any tab)
  if (message.type === 'TOGGLE_RECORDING_PAUSE') {
    togglePauseRecording();
    sendResponse({ success: true, paused: recordingState.isPaused });
  }

  // Stop requested from content-script bubble
  if (message.type === 'STOP_RECORDING_FROM_PAGE') {
    // Forward to recorder page so it can finalize the MediaRecorder + saving
    chrome.runtime.sendMessage({ type: 'STOP_RECORDING_REQUEST' }).catch(() => {});
    sendResponse({ success: true });
  }

  // Open / focus the annotation tab (triggered by reminder bubble)
  if (message.type === 'OPEN_ANNOTATION_TAB') {
    focusAnnotationTab();
    sendResponse({ success: true });
  }

  // Mouse data from content script (only from active tab, skip while paused)
  if (message.type === 'MOUSE_EVENT') {
    if (recordingState.isRecording && !recordingState.isPaused && fromActiveTab) {
      collectMouseData(message);
    }
  }

  // Segment data from content script
  // Accepted when (a) recording from the active tab, OR (b) within the brief
  // post-stop grace window (so the active tab's final segment isn't dropped).
  if (message.type === 'RECORD_SEGMENT') {
    const inGrace = !recordingState.isRecording && Date.now() < recordingState.acceptSegmentsUntil;
    const allowedDuringRecording = recordingState.isRecording && !recordingState.isPaused && fromActiveTab;
    if (message.segment && (allowedDuringRecording || (inGrace && fromActiveTab))) {
      console.log('[Background] Received segment:', message.segment);
      recordingState.segments.push(message.segment);
      forwardStreamingSegment(message.segment);
    }
  }

  return true;
});

// ============================================
// Active tab tracking — drives the cross-page unified timeline
// ============================================
chrome.tabs.onActivated.addListener(({ tabId }) => {
  handleTabFocusChange(tabId);
});

chrome.windows.onFocusChanged.addListener((windowId) => {
  // Ignore "focus left Chrome entirely" — keep the previous active tab so a
  // brief alt-tab away doesn't fragment the segment.
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;
  chrome.tabs.query({ active: true, windowId }, (tabs) => {
    if (tabs[0]) handleTabFocusChange(tabs[0].id);
  });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === activeTabId) {
    activeTabId = null;
  }
});

function handleTabFocusChange(newTabId) {
  if (!newTabId || newTabId === activeTabId) return;
  const oldTabId = activeTabId;
  activeTabId = newTabId;

  if (!recordingState.isRecording) return;

  // Hand off cleanly: tell the previous tab to finalize its open segment,
  // then tell the new tab to open a fresh segment at the current elapsed.
  if (oldTabId) {
    chrome.tabs.sendMessage(oldTabId, { type: 'TAB_DEACTIVATED' }).catch(() => {});
  }
  chrome.tabs.sendMessage(newTabId, { type: 'TAB_ACTIVATED' }).catch(() => {});
}

function togglePauseRecording() {
  if (!recordingState.isRecording) return;
  if (recordingState.isPaused) {
    // Resume
    if (recordingState.pauseStartTime) {
      recordingState.totalPausedMs += Date.now() - recordingState.pauseStartTime;
    }
    recordingState.pauseStartTime = null;
    recordingState.isPaused = false;
    chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
    chrome.action.setBadgeText({ text: 'REC' });
    broadcastToAllTabs({ type: 'RECORDING_RESUMED' });
    chrome.runtime.sendMessage({ type: 'RECORDER_PAUSE_TOGGLE', paused: false }).catch(() => {});
  } else {
    recordingState.isPaused = true;
    recordingState.pauseStartTime = Date.now();
    chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' });
    chrome.action.setBadgeText({ text: 'PSE' });
    broadcastToAllTabs({ type: 'RECORDING_PAUSED' });
    chrome.runtime.sendMessage({ type: 'RECORDER_PAUSE_TOGGLE', paused: true }).catch(() => {});
  }
  chrome.storage.local.set({ recordingPaused: recordingState.isPaused }).catch(() => {});
}

// Find and focus the annotation tab (or recorder tab that will redirect to annotation)
function focusAnnotationTab() {
  const annotationUrl = chrome.runtime.getURL('annotation/dist/index.html');
  const recorderUrl = chrome.runtime.getURL('recorder/recorder.html');
  chrome.tabs.query({}, (tabs) => {
    const match = tabs.find(t => t.url && (t.url.startsWith(annotationUrl) || t.url.startsWith(recorderUrl)));
    if (match) {
      chrome.tabs.update(match.id, { active: true }).catch(() => {});
      if (match.windowId !== undefined) {
        chrome.windows.update(match.windowId, { focused: true }).catch(() => {});
      }
    } else {
      chrome.tabs.create({ url: annotationUrl }).catch(() => {});
    }
  });
}

// Update per-tab badge based on the latest state from a content script.
// Segment construction is intentionally not done here — content.js owns it
// to avoid duplicate / overlapping segments from multiple sources.
function updateBadgeForState(message, sender) {
  const { state } = message;
  if (!sender.tab || recordingState.isRecording) return;

  chrome.action.setBadgeBackgroundColor({
    color: BADGE_COLORS[state] || '#8b949e',
    tabId: sender.tab.id,
  });
  chrome.action.setBadgeText({
    text: state === 'SCANNING_ZOMBIE' ? '!' : '',
    tabId: sender.tab.id,
  });
}

// Collect scroll data
function collectScrollData(message) {
  if (!recordingState.isRecording || recordingState.isPaused) return;

  const elapsed = getEffectiveElapsed();
  const { metrics, state } = message;

  recordingState.scrollData.push({
    t: elapsed,
    scrollTop: metrics.scrollTop || 0,
    speed: metrics.currentSpeed?.toFixed(2) || '0',
    zScore: metrics.zScore?.toFixed(4) || '0',
    stopDensity: metrics.stopDensity?.toFixed(4) || '0',
    meanSpeed: metrics.meanSpeed?.toFixed(2) || '0',
    activeSpeedMean: metrics.activeSpeedMean?.toFixed(2) || '0',
    pageHeight: metrics.pageHeight || 0,
    state: state || 'IDLE',
  });

  recordingState.dataPointCount++;

  // Limit data to prevent memory issues
  if (recordingState.scrollData.length > 20000) {
    recordingState.scrollData = recordingState.scrollData.slice(-15000);
  }
}

// Collect mouse data
function collectMouseData(message) {
  if (!recordingState.isRecording || recordingState.isPaused) return;

  const elapsed = getEffectiveElapsed();
  
  recordingState.mouseData.push({
    t: elapsed,
    type: message.eventType,
    x: message.x,
    y: message.y,
    deltaX: message.deltaX,
    deltaY: message.deltaY,
    button: message.button,
  });

  recordingState.mouseEventCount++;

  // Limit data
  if (recordingState.mouseData.length > 50000) {
    recordingState.mouseData = recordingState.mouseData.slice(-40000);
  }
}

// Start recording
async function startRecording(duration, recordingId) {
  console.log('[Background] Starting recording:', { duration, recordingId });

  recordingState = {
    isRecording: true,
    isPaused: false,
    pauseStartTime: null,
    totalPausedMs: 0,
    startTime: Date.now(),
    duration: duration,
    recordingId: recordingId,
    interval: null,
    scrollData: [],
    mouseData: [],
    segments: [],
    lastState: 'IDLE',
    dataPointCount: 0,
    mouseEventCount: 0,
    acceptSegmentsUntil: 0,
  };

  // Save state
  await chrome.storage.local.set({
    isRecording: true,
    recordingPaused: false,
    recordingStartTime: recordingState.startTime,
    recordingDuration: duration,
    currentRecordingId: recordingId,
  });

  // Set recording badge
  chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
  chrome.action.setBadgeText({ text: 'REC' });

  // Notify all content scripts to start recording mode
  broadcastToAllTabs({ type: 'RECORDING_STARTED', duration });

  // Pick the focused tab as the initial active tab and tell it to open the
  // first segment immediately (so we don't lose the moments before the user
  // makes the first state-changing action).
  chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
    if (tabs[0] && tabs[0].id) {
      activeTabId = tabs[0].id;
      chrome.tabs.sendMessage(activeTabId, { type: 'TAB_ACTIVATED' }).catch(() => {});
    }
  });

  // Start stats broadcast interval
  recordingState.interval = setInterval(() => {
    const elapsed = getEffectiveElapsed();

    // Send stats to recorder page
    chrome.runtime.sendMessage({
      type: 'RECORDING_STATS',
      state: recordingState.lastState,
      speed: 0,
      mouseEvents: recordingState.mouseEventCount,
      dataPoints: recordingState.dataPointCount,
      paused: recordingState.isPaused,
    }).catch(() => {});

    // Check if effective recording time is up (paused time excluded)
    if (!recordingState.isPaused && elapsed >= duration) {
      stopRecording();
      chrome.runtime.sendMessage({ type: 'RECORDING_COMPLETE' }).catch(() => {});
    }
  }, 500);
}

// Merge adjacent segments with the same state
function mergeAdjacentSegments(segments) {
  if (segments.length === 0) return segments;
  
  const merged = [];
  let current = { ...segments[0] };
  
  for (let i = 1; i < segments.length; i++) {
    const next = segments[i];
    
    // If same state and close in time (within 500ms gap), merge
    if (next.state === current.state && (next.startTime - current.endTime) < 500) {
      current.endTime = next.endTime;
    } else {
      merged.push(current);
      current = { ...next };
    }
  }
  
  merged.push(current);
  
  console.log('[Background] Merged segments:', {
    before: segments.length,
    after: merged.length
  });
  
  return merged;
}

// Stop recording
async function stopRecording() {
  if (!recordingState.isRecording) return;

  console.log('[Background] Stopping recording');

  // If we stop while paused, accumulate the final pause window before computing elapsed
  if (recordingState.isPaused && recordingState.pauseStartTime) {
    recordingState.totalPausedMs += Date.now() - recordingState.pauseStartTime;
    recordingState.pauseStartTime = null;
  }

  // Clear interval
  if (recordingState.interval) {
    clearInterval(recordingState.interval);
    recordingState.interval = null;
  }

  const elapsed = getEffectiveElapsed();

  // Open a short grace window so the active tab's RECORDING_STOPPED-triggered
  // final RECORD_SEGMENT message can still be accepted after we flip the flag.
  recordingState.acceptSegmentsUntil = Date.now() + 600;
  recordingState.isRecording = false;

  // Notify all content scripts (active tab will push its final segment now)
  broadcastToAllTabs({ type: 'RECORDING_STOPPED' });

  // Wait briefly for in-flight final segments to arrive, then merge + save.
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Sort by start time before merging — segments come from a single tab at a
  // time but tab handoffs can in theory interleave a few ms.
  recordingState.segments.sort((a, b) => (a.startTime || 0) - (b.startTime || 0));

  // Merge adjacent segments with same state
  const mergedSegments = mergeAdjacentSegments(recordingState.segments);

  // Save all collected data
  await chrome.storage.local.set({
    isRecording: false,
    hasRecordingData: true,
    recordingSegments: mergedSegments,
    recordingData: recordingState.scrollData.slice(-10000),
    recordingMouseData: recordingState.mouseData.slice(-20000),
    recordingDuration: recordingState.duration,
    recordingActualDuration: elapsed,
  });

  console.log('[Background] Recording saved:', {
    segments: mergedSegments.length,
    scrollData: recordingState.scrollData.length,
    mouseData: recordingState.mouseData.length,
  });

  // Reset badge
  chrome.action.setBadgeText({ text: '' });

  // Show annotation reminder in the active tab after a short delay so the
  // recorder page has time to redirect to the annotation UI in its own tab.
  setTimeout(() => {
    chrome.tabs.query({ active: true }, (tabs) => {
      tabs.forEach(t => {
        if (t.id) chrome.tabs.sendMessage(t.id, { type: 'SHOW_ANNOTATION_REMINDER' }).catch(() => {});
      });
    });
  }, 1500);

  // Reset state
  recordingState.isPaused = false;
  recordingState.totalPausedMs = 0;
  recordingState.pauseStartTime = null;
  recordingState.acceptSegmentsUntil = 0;
  chrome.storage.local.set({ recordingPaused: false }).catch(() => {});
}

// Broadcast to all tabs
function broadcastToAllTabs(message) {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, message).catch(() => {});
      }
    });
  });
}

// Installation handler
chrome.runtime.onInstalled.addListener(details => {
  // Updating/reloading the extension must not erase the latest recording metadata
  // or reset the user's preferences before they reopen the new review interface.
  if (details.reason !== 'install') return;
  chrome.action.setBadgeBackgroundColor({ color: '#8b949e' });
  chrome.action.setBadgeText({ text: '' });

  chrome.storage.sync.set({
    enabled: true,
    showIndicator: true
  });

  chrome.storage.local.set({
    isRecording: false,
    hasRecordingData: false,
    recordingData: [],
    recordingSegments: [],
    recordingMouseData: [],
  });

  console.log('[BehaviorEngine] Extension installed');
});

// Handle tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && !recordingState.isRecording) {
    chrome.action.setBadgeText({ text: '', tabId });
  }
});
