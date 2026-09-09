/**
 * Recorder Page Script
 * =====================
 * Handles screen recording with optional crop region selection.
 * 
 * KEY DESIGN: Always records the FULL screen stream.
 * The crop rectangle is stored as metadata and applied during
 * playback/analysis on the annotation page.
 * This avoids black-frame issues caused by canvas pipelines
 * being throttled when the tab is in the background.
 */

// ============================================
// IndexedDB for storing large video blobs
// ============================================
const DB_NAME = 'BehaviorRecorderDB';
const DB_VERSION = 1;
const STORE_NAME = 'recordings';

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
}

async function saveRecording(id, data) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put({ id, ...data });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// ============================================
// State
// ============================================
const state = {
  isRecording: false,
  isPaused: false,
  pauseStartMs: null,
  totalPausedMs: 0,
  recordingStartTime: null,
  recordDuration: 180000,
  mediaStream: null,
  mediaRecorder: null,
  recordedChunks: [],
  timerInterval: null,
  cropRect: null, // { x, y, width, height } in video pixels; null = full screen

  // Streaming VLM pipeline
  frameBuffer: [],            // [{ tMs, bitmap }]  tMs = ms since recordingStartTime
  frameBufferMax: 500,        // ~250s at 2fps
  frameGrabActive: false,
  lastGrabMs: 0,
  grabIntervalMs: 500,        // target 2fps

  vlmQueue: [],               // [{ startTime, endTime, state, url }]
  vlmRunning: false,
  precomputed: [],            // [{ startTime, endTime, vlm, survey }]
  precomputedCount: 0,
  // Fixed-question review runs locally; legacy VLM/LLM generation is disabled.
  streamingEnabled: false,
};

// ============================================
// VLM / LLM Streaming Pipeline (standalone, no imports)
// ============================================
const STREAM_API = {
  serverUrl: 'http://140.112.41.111:8899',
  apiKey: '',
  vlmEndpoint: '/api/analyze-social-upload',
  llmEndpoint: '/api/generate-survey',
  timeoutMs: 60000,
};

const VALID_PLATFORM = ['Facebook', 'Instagram', 'Twitter', 'YouTube', 'TikTok', 'Reddit', 'Other'];
const VALID_DENSITY = ['High', 'Low'];
const VALID_AROUSAL = ['High', 'Neutral', 'Low'];
const VALID_CONTENT_TYPE = ['long_text', 'short_text', 'image_post', 'video', 'meme', 'mixed'];
const VALID_SENTIMENT = ['positive', 'negative', 'mixed', 'neutral', 'none'];

function vlmFallback() {
  return {
    topic: '你剛才看的內容', topic_detail: '', platform: 'Other', content_type: 'mixed',
    information_density: 'Low', information_density_reason: 'VLM fallback',
    emotional_arousal: 'Neutral', emotional_arousal_reason: 'VLM fallback',
    has_comments_visible: false, comment_sentiment: 'none',
    visual_elements: '', text_snippets: '', comment_highlight: '',
  };
}

function validateVlm(r) {
  return {
    topic: r.topic || '你剛才看的內容',
    topic_detail: r.topic_detail || '',
    platform: VALID_PLATFORM.includes(r.platform) ? r.platform : 'Other',
    content_type: VALID_CONTENT_TYPE.includes(r.content_type) ? r.content_type : 'mixed',
    information_density: VALID_DENSITY.includes(r.information_density) ? r.information_density : 'Low',
    information_density_reason: r.information_density_reason || '',
    emotional_arousal: VALID_AROUSAL.includes(r.emotional_arousal) ? r.emotional_arousal : 'Neutral',
    emotional_arousal_reason: r.emotional_arousal_reason || '',
    has_comments_visible: typeof r.has_comments_visible === 'boolean' ? r.has_comments_visible : false,
    comment_sentiment: VALID_SENTIMENT.includes(r.comment_sentiment) ? r.comment_sentiment : 'none',
    visual_elements: r.visual_elements || '',
    text_snippets: r.text_snippets || '',
    comment_highlight: r.comment_highlight || '',
  };
}

async function callVlmApi(imageBlob) {
  const formData = new FormData();
  formData.append('file', imageBlob, 'screenshot.jpg');
  const resp = await fetch(`${STREAM_API.serverUrl}${STREAM_API.vlmEndpoint}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${STREAM_API.apiKey}` },
    body: formData,
  });
  if (!resp.ok) throw new Error(`VLM ${resp.status}`);
  const data = await resp.json();
  if (!data.analysis) throw new Error('VLM missing analysis');
  return validateVlm(data.analysis);
}

async function callLlmApi(vlmAnalysis) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), STREAM_API.timeoutMs);
  try {
    const resp = await fetch(`${STREAM_API.serverUrl}${STREAM_API.llmEndpoint}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STREAM_API.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ vlm_analysis: vlmAnalysis }),
      signal: controller.signal,
    });
    if (!resp.ok) throw new Error(`LLM ${resp.status}`);
    return await resp.json();
  } finally {
    clearTimeout(t);
  }
}

function extractSurveyFromLlm(obj) {
  if (obj?.survey && typeof obj.survey === 'object') return obj.survey;
  if (obj?.step1) return obj;
  if (typeof obj?.response === 'string') {
    const m = obj.response.match(/\{[\s\S]*\}/);
    if (m) {
      const inner = JSON.parse(m[0]);
      return inner.survey || inner;
    }
  }
  throw new Error('Cannot extract survey');
}

function normalizeLlmSurvey(o, isFallback = false) {
  const pick = (step) => ({
    question: o[step]?.question || '',
    reframe: o[step]?.reframe || o[step]?.question || '',
    option_a: o[step]?.option_a || {},
    option_b: o[step]?.option_b || {},
    option_c: o[step]?.option_c || {},
    option_d: o[step]?.option_d || {},
  });
  const s1 = pick('step1'), s2 = pick('step2'), s3 = pick('step3');
  return {
    step1_question: s1.question, step1_reframe: s1.reframe,
    step1_options: {
      A: { title: s1.option_a.title || '', description: s1.option_a.desc || '', baseScore: 1 },
      B: { title: s1.option_b.title || '', description: s1.option_b.desc || '', baseScore: -1 },
    },
    step2_question: s2.question, step2_reframe: s2.reframe,
    step2_options: {
      A: { title: s2.option_a.title || '', description: s2.option_a.desc || '', baseScore: 1 },
      B: { title: s2.option_b.title || '', description: s2.option_b.desc || '', baseScore: -1 },
    },
    step3_question: s3.question, step3_reframe: s3.reframe,
    step3_options: {
      A: { title: s3.option_a.title || '', description: s3.option_a.desc || '', quadrant: 'Q1' },
      B: { title: s3.option_b.title || '', description: s3.option_b.desc || '', quadrant: 'Q2' },
      C: { title: s3.option_c.title || '', description: s3.option_c.desc || '', quadrant: 'Q3' },
      D: { title: s3.option_d.title || '', description: s3.option_d.desc || '', quadrant: 'Q4' },
    },
    _isFallback: isFallback,
    _llmRaw: o,
  };
}

// Crop interaction state
const cropState = {
  box: { left: 5, top: 5, width: 90, height: 90 }, // percentages of container
  dragging: false,
  resizing: null,
  startMouse: { x: 0, y: 0 },
  startBox: { left: 0, top: 0, width: 0, height: 0 },
};

// ============================================
// DOM Elements
// ============================================
const elements = {
  phaseSetup: document.getElementById('phaseSetup'),
  phaseCrop: document.getElementById('phaseCrop'),
  phaseRecording: document.getElementById('phaseRecording'),
  phaseProcessing: document.getElementById('phaseProcessing'),
  recordDuration: document.getElementById('recordDuration'),
  btnStart: document.getElementById('btnStart'),
  btnStop: document.getElementById('btnStop'),
  previewVideo: document.getElementById('previewVideo'),
  recordingTimer: document.getElementById('recordingTimer'),
  metricState: document.getElementById('metricState'),
  metricSpeed: document.getElementById('metricSpeed'),
  metricMouseEvents: document.getElementById('metricMouseEvents'),
  metricDataPoints: document.getElementById('metricDataPoints'),
  recCropIndicator: document.getElementById('recCropIndicator'),
  cropNote: document.getElementById('cropNote'),
  aiPrecomputeCount: document.getElementById('aiPrecomputeCount'),
  // Crop phase
  cropPreviewWrap: document.getElementById('cropPreviewWrap'),
  cropPreview: document.getElementById('cropPreview'),
  cropBox: document.getElementById('cropBox'),
  cropSizeLabel: document.getElementById('cropSizeLabel'),
  btnSkipCrop: document.getElementById('btnSkipCrop'),
  btnConfirmCrop: document.getElementById('btnConfirmCrop'),
};

// ============================================
// Utility
// ============================================
function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

// ============================================
// Crop Phase: UI Interaction
// ============================================
function resetCropBox() {
  cropState.box = { left: 5, top: 5, width: 90, height: 90 };
  updateCropBoxUI();
}

function updateCropBoxUI() {
  const box = elements.cropBox;
  box.style.left = cropState.box.left + '%';
  box.style.top = cropState.box.top + '%';
  box.style.width = cropState.box.width + '%';
  box.style.height = cropState.box.height + '%';
  updateCropSizeLabel();
}

function updateCropSizeLabel() {
  const track = state.mediaStream?.getVideoTracks()[0];
  if (!track) return;
  const settings = track.getSettings();
  const vw = settings.width || 1920;
  const vh = settings.height || 1080;
  const cropW = Math.round((cropState.box.width / 100) * vw);
  const cropH = Math.round((cropState.box.height / 100) * vh);
  elements.cropSizeLabel.textContent = `${cropW} × ${cropH}`;
}

function setupCropInteraction() {
  elements.cropPreviewWrap.addEventListener('mousedown', onCropMouseDown);
  document.addEventListener('mousemove', onCropMouseMove);
  document.addEventListener('mouseup', onCropMouseUp);
}

function teardownCropInteraction() {
  elements.cropPreviewWrap.removeEventListener('mousedown', onCropMouseDown);
  document.removeEventListener('mousemove', onCropMouseMove);
  document.removeEventListener('mouseup', onCropMouseUp);
}

function onCropMouseDown(e) {
  const handle = e.target.closest('.crop-handle');
  const box = e.target.closest('#cropBox');
  if (!handle && !box) return;

  cropState.startMouse = { x: e.clientX, y: e.clientY };
  cropState.startBox = { ...cropState.box };

  if (handle) {
    cropState.resizing = handle.dataset.pos;
  } else {
    cropState.dragging = true;
  }
  e.preventDefault();
}

function onCropMouseMove(e) {
  if (!cropState.dragging && !cropState.resizing) return;

  const rect = elements.cropPreviewWrap.getBoundingClientRect();
  const dx = ((e.clientX - cropState.startMouse.x) / rect.width) * 100;
  const dy = ((e.clientY - cropState.startMouse.y) / rect.height) * 100;
  const sb = cropState.startBox;
  const minSize = 10;

  if (cropState.dragging) {
    cropState.box.left = clamp(sb.left + dx, 0, 100 - sb.width);
    cropState.box.top = clamp(sb.top + dy, 0, 100 - sb.height);
  } else if (cropState.resizing) {
    switch (cropState.resizing) {
      case 'se':
        cropState.box.width = clamp(sb.width + dx, minSize, 100 - sb.left);
        cropState.box.height = clamp(sb.height + dy, minSize, 100 - sb.top);
        break;
      case 'sw': {
        const newW = clamp(sb.width - dx, minSize, sb.left + sb.width);
        cropState.box.left = sb.left + sb.width - newW;
        cropState.box.width = newW;
        cropState.box.height = clamp(sb.height + dy, minSize, 100 - sb.top);
        break;
      }
      case 'ne': {
        cropState.box.width = clamp(sb.width + dx, minSize, 100 - sb.left);
        const newH = clamp(sb.height - dy, minSize, sb.top + sb.height);
        cropState.box.top = sb.top + sb.height - newH;
        cropState.box.height = newH;
        break;
      }
      case 'nw': {
        const newW = clamp(sb.width - dx, minSize, sb.left + sb.width);
        cropState.box.left = sb.left + sb.width - newW;
        cropState.box.width = newW;
        const newH = clamp(sb.height - dy, minSize, sb.top + sb.height);
        cropState.box.top = sb.top + sb.height - newH;
        cropState.box.height = newH;
        break;
      }
    }
  }
  updateCropBoxUI();
}

function onCropMouseUp() {
  cropState.dragging = false;
  cropState.resizing = null;
}

// ============================================
// Crop Phase: Actions
// ============================================
function skipCrop() {
  state.cropRect = null;
  teardownCropInteraction();
  elements.phaseCrop.style.display = 'none';
  beginRecording();
}

function confirmCrop() {
  const track = state.mediaStream.getVideoTracks()[0];
  const settings = track.getSettings();
  const vw = settings.width || 1920;
  const vh = settings.height || 1080;

  state.cropRect = {
    x: Math.round((cropState.box.left / 100) * vw),
    y: Math.round((cropState.box.top / 100) * vh),
    width: Math.round((cropState.box.width / 100) * vw),
    height: Math.round((cropState.box.height / 100) * vh),
  };
  console.log('✂️ Crop rect (video pixels):', state.cropRect);

  teardownCropInteraction();
  elements.phaseCrop.style.display = 'none';
  beginRecording();
}

// ============================================
// Frame Buffer (2 FPS capture while recording)
// ============================================
async function captureCurrentFrame() {
  const video = elements.previewVideo;
  if (!video || video.readyState < 2) return null;
  const vw = video.videoWidth, vh = video.videoHeight;
  if (!vw || !vh) return null;
  try {
    const bitmap = await createImageBitmap(video);
    return bitmap;
  } catch (err) {
    return null;
  }
}

function pushFrame(tMs, bitmap) {
  state.frameBuffer.push({ tMs, bitmap });
  while (state.frameBuffer.length > state.frameBufferMax) {
    const old = state.frameBuffer.shift();
    try { old.bitmap.close(); } catch {}
  }
}

function clearFrameBuffer() {
  state.frameBuffer.forEach(f => { try { f.bitmap.close(); } catch {} });
  state.frameBuffer = [];
}

function startFrameGrabbing() {
  state.frameGrabActive = true;
  state.lastGrabMs = -Infinity;

  // Use rVFC when available; fall back to setInterval for safety
  const video = elements.previewVideo;
  const hasRvfc = typeof video.requestVideoFrameCallback === 'function';

  if (hasRvfc) {
    const onFrame = async () => {
      if (!state.frameGrabActive || !state.isRecording || state.isPaused) return;
      const t = getRecorderElapsed();
      if (t - state.lastGrabMs >= state.grabIntervalMs) {
        state.lastGrabMs = t;
        const bmp = await captureCurrentFrame();
        if (bmp) pushFrame(t, bmp);
      }
      if (state.frameGrabActive && state.isRecording && !state.isPaused) {
        video.requestVideoFrameCallback(onFrame);
      }
    };
    video.requestVideoFrameCallback(onFrame);
  }

  // Always also run setInterval as a safety net (background tabs may throttle it,
  // but rVFC alone can stall when the <video> element is hidden)
  state.grabIntervalHandle = setInterval(async () => {
    if (!state.frameGrabActive || !state.isRecording || state.isPaused) return;
    const t = getRecorderElapsed();
    if (t - state.lastGrabMs >= state.grabIntervalMs) {
      state.lastGrabMs = t;
      const bmp = await captureCurrentFrame();
      if (bmp) pushFrame(t, bmp);
    }
  }, 500);
}

function stopFrameGrabbing() {
  state.frameGrabActive = false;
  if (state.grabIntervalHandle) {
    clearInterval(state.grabIntervalHandle);
    state.grabIntervalHandle = null;
  }
}

function findClosestFrame(targetTMs) {
  if (state.frameBuffer.length === 0) return null;
  let best = state.frameBuffer[0], bestDist = Math.abs(best.tMs - targetTMs);
  for (const f of state.frameBuffer) {
    const d = Math.abs(f.tMs - targetTMs);
    if (d < bestDist) { best = f; bestDist = d; }
  }
  return best;
}

async function stitchSegmentFrames(segment) {
  const dur = segment.endTime - segment.startTime;
  const pcts = [0.2, 0.5, 0.8];
  const targets = pcts.map(p => segment.startTime + dur * p);
  const picks = targets.map(t => findClosestFrame(t)).filter(Boolean);
  if (picks.length === 0) throw new Error('no frames in buffer');

  // Apply crop if defined
  const cr = state.cropRect;
  const sample = picks[0].bitmap;
  const srcW = cr ? cr.width : sample.width;
  const srcH = cr ? cr.height : sample.height;
  const gap = 4;
  const totalW = srcW * picks.length + gap * (picks.length - 1);

  const canvas = document.createElement('canvas');
  canvas.width = totalW;
  canvas.height = srcH;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, totalW, srcH);

  picks.forEach((f, i) => {
    if (cr) {
      ctx.drawImage(f.bitmap, cr.x, cr.y, cr.width, cr.height, i * (srcW + gap), 0, srcW, srcH);
    } else {
      ctx.drawImage(f.bitmap, i * (srcW + gap), 0, srcW, srcH);
    }
  });

  ctx.font = `bold ${Math.max(14, Math.round(srcH * 0.03))}px sans-serif`;
  ctx.textAlign = 'center';
  picks.forEach((_, i) => {
    const x = i * (srcW + gap) + srcW / 2;
    const label = `${Math.round(pcts[i] * 100)}%`;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x - 30, 4, 60, 22);
    ctx.fillStyle = '#fff';
    ctx.fillText(label, x, 21);
  });

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('toBlob failed')),
      'image/jpeg', 0.85);
  });
}

// ============================================
// Streaming Queue: VLM → LLM per segment
// ============================================
function enqueueStreamingSegment(segment) {
  if (!state.streamingEnabled) return;
  if (segment.state !== 'READING_FLOW') return;
  const dur = segment.endTime - segment.startTime;
  if (dur < 2000) return;
  const dup = state.vlmQueue.some(s => s.startTime === segment.startTime && s.endTime === segment.endTime)
    || state.precomputed.some(s => s.startTime === segment.startTime && s.endTime === segment.endTime);
  if (dup) return;
  state.vlmQueue.push(segment);
  console.log('[Stream] queued segment', segment.startTime, '→', segment.endTime, 'queue len:', state.vlmQueue.length);
  if (!state.vlmRunning) processStreamingQueue();
}

async function processStreamingQueue() {
  state.vlmRunning = true;
  while (state.vlmQueue.length > 0 && state.isRecording) {
    const seg = state.vlmQueue.shift();
    try {
      await processSegmentStreaming(seg);
    } catch (err) {
      console.warn('[Stream] segment failed:', err);
    }
  }
  state.vlmRunning = false;
}

async function processSegmentStreaming(segment) {
  console.log(`[Stream] Processing ${segment.startTime}-${segment.endTime} (buffer: ${state.frameBuffer.length} frames)`);
  let frameBlob;
  try {
    frameBlob = await stitchSegmentFrames(segment);
  } catch (err) {
    console.warn('[Stream] stitch failed, skipping:', err);
    return;
  }

  let vlm;
  try {
    vlm = await callVlmApi(frameBlob);
  } catch (err) {
    console.warn('[Stream] VLM failed, using fallback:', err);
    vlm = vlmFallback();
  }

  let survey;
  try {
    const raw = await callLlmApi(vlm);
    const isFallback = !!raw.is_fallback;
    const data = extractSurveyFromLlm(raw);
    survey = normalizeLlmSurvey(data, isFallback);
  } catch (err) {
    console.warn('[Stream] LLM failed, leaving survey null:', err);
    survey = null;
  }

  const record = { startTime: segment.startTime, endTime: segment.endTime, vlm, survey };
  state.precomputed.push(record);
  state.precomputedCount++;
  updatePrecomputeUI();

  try {
    await chrome.storage.local.set({ streamingPrecomputed: state.precomputed });
  } catch (err) {
    console.warn('[Stream] storage set failed:', err);
  }
  console.log(`[Stream] Done ${segment.startTime}-${segment.endTime} (total precomputed: ${state.precomputedCount})`);
}

function updatePrecomputeUI() {
  if (elements.aiPrecomputeCount) {
    elements.aiPrecomputeCount.textContent = String(state.precomputedCount);
  }
}

// ============================================
// Recording Logic
// ============================================
async function startRecording() {
  try {
    state.mediaStream = await navigator.mediaDevices.getDisplayMedia({
      video: { cursor: 'always', displaySurface: 'monitor' },
      audio: false,
    });

    // Show crop phase
    elements.phaseSetup.style.display = 'none';
    elements.phaseCrop.style.display = 'flex';
    elements.cropPreview.srcObject = state.mediaStream;

    // If user stops sharing during crop phase, go back to setup
    state.mediaStream.getVideoTracks()[0].onended = () => {
      if (!state.isRecording) {
        elements.phaseCrop.style.display = 'none';
        elements.phaseSetup.style.display = 'flex';
      }
    };

    resetCropBox();
    setupCropInteraction();
    elements.cropPreview.onloadedmetadata = () => updateCropSizeLabel();

  } catch (err) {
    console.error('Error starting recording:', err);
    alert('無法開始錄製。請確保允許螢幕分享權限。');
  }
}

/**
 * Begin the actual recording.
 * ALWAYS records the full screen stream — never uses a canvas pipeline.
 * Crop rect is saved as metadata and applied during annotation/analysis.
 */
function beginRecording() {
  // Always record the full, original stream
  const recordStream = state.mediaStream;
  elements.previewVideo.srcObject = recordStream;

  // Show crop indicator overlay on preview if crop is set
  if (state.cropRect) {
    showRecordingCropOverlay();
    elements.cropNote.style.display = 'block';
  }

  // Setup MediaRecorder
  let mimeType = 'video/webm;codecs=vp9';
  if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/webm;codecs=vp8';
  if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/webm';

  state.mediaRecorder = new MediaRecorder(recordStream, { mimeType });

  state.recordedChunks = [];
  state.mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) state.recordedChunks.push(e.data);
  };
  state.mediaRecorder.onstop = () => processRecording();

  state.mediaRecorder.start(1000);

  state.isRecording = true;
  state.recordingStartTime = Date.now();
  state.recordDuration = parseInt(elements.recordDuration.value) * 1000;

  // Reset streaming pipeline state
  clearFrameBuffer();
  state.vlmQueue = [];
  state.precomputed = [];
  state.precomputedCount = 0;
  updatePrecomputeUI();
  chrome.storage.local.set({ streamingPrecomputed: [] });

  const recordingId = Date.now().toString();

  chrome.runtime.sendMessage({
    type: 'START_RECORDING',
    duration: state.recordDuration,
    recordingId: recordingId
  });
  chrome.storage.local.set({ currentRecordingId: recordingId });

  // Also save crop rect to storage so annotation page can use it
  chrome.storage.local.set({ recordingCropRect: state.cropRect });

  elements.phaseRecording.style.display = 'flex';

  state.mediaStream.getVideoTracks()[0].onended = () => {
    if (state.isRecording) stopRecording();
  };

  startUITimer();
  chrome.runtime.onMessage.addListener(handleStatsUpdate);

  // Start grabbing frames for streaming VLM pipeline once <video> is playing
  const startGrabs = () => {
    if (!state.streamingEnabled || state.frameGrabActive) return;
    startFrameGrabbing();
  };
  if (elements.previewVideo.readyState >= 2) {
    startGrabs();
  } else {
    elements.previewVideo.addEventListener('loadeddata', startGrabs, { once: true });
  }
}

/**
 * Show the crop rectangle as a green overlay on the recording preview.
 * This is purely visual — shows the user where the VLM analysis area is.
 */
function showRecordingCropOverlay() {
  const track = state.mediaStream.getVideoTracks()[0];
  const settings = track.getSettings();
  const vw = settings.width || 1920;
  const vh = settings.height || 1080;
  const cr = state.cropRect;

  const indicator = elements.recCropIndicator;
  indicator.style.display = 'block';
  indicator.style.left = (cr.x / vw * 100) + '%';
  indicator.style.top = (cr.y / vh * 100) + '%';
  indicator.style.width = (cr.width / vw * 100) + '%';
  indicator.style.height = (cr.height / vh * 100) + '%';
}

function handleStatsUpdate(message) {
  if (message.type === 'RECORDING_STATS') {
    elements.metricState.textContent = message.state || 'IDLE';
    elements.metricSpeed.textContent = Math.round(message.speed || 0);
    elements.metricMouseEvents.textContent = message.mouseEvents || 0;
    elements.metricDataPoints.textContent = message.dataPoints || 0;
  }
  if (message.type === 'RECORDING_COMPLETE') {
    if (state.isRecording) stopRecording();
  }
  if (message.type === 'STREAMING_SEGMENT' && message.segment) {
    enqueueStreamingSegment(message.segment);
  }
  if (message.type === 'RECORDER_PAUSE_TOGGLE') {
    if (message.paused) pauseRecording();
    else resumeRecording();
  }
  if (message.type === 'STOP_RECORDING_REQUEST') {
    if (state.isRecording) stopRecording();
  }
}

// Effective elapsed for the recorder page (excludes paused intervals)
function getRecorderElapsed() {
  if (!state.recordingStartTime) return 0;
  let elapsed = Date.now() - state.recordingStartTime;
  elapsed -= (state.totalPausedMs || 0);
  if (state.isPaused && state.pauseStartMs) {
    elapsed -= (Date.now() - state.pauseStartMs);
  }
  return Math.max(0, elapsed);
}

function startUITimer() {
  state.timerInterval = setInterval(() => {
    if (!state.isRecording) return;
    const elapsed = getRecorderElapsed();
    const tag = state.isPaused ? '（已暫停）' : '';
    elements.recordingTimer.textContent = `${formatTime(elapsed)} / ${formatTime(state.recordDuration)}${tag}`;
    if (!state.isPaused && elapsed >= state.recordDuration) stopRecording();
  }, 200);
}

function pauseRecording() {
  if (!state.isRecording || state.isPaused) return;
  state.isPaused = true;
  state.pauseStartMs = Date.now();
  if (state.mediaRecorder && state.mediaRecorder.state === 'recording') {
    try { state.mediaRecorder.pause(); } catch (err) { console.warn('mediaRecorder.pause failed', err); }
  }
  stopFrameGrabbing();
  console.log('[Recorder] paused');
}

function resumeRecording() {
  if (!state.isRecording || !state.isPaused) return;
  if (state.pauseStartMs) {
    state.totalPausedMs += Date.now() - state.pauseStartMs;
    state.pauseStartMs = null;
  }
  state.isPaused = false;
  if (state.mediaRecorder && state.mediaRecorder.state === 'paused') {
    try { state.mediaRecorder.resume(); } catch (err) { console.warn('mediaRecorder.resume failed', err); }
  }
  if (state.streamingEnabled) startFrameGrabbing();
  console.log('[Recorder] resumed');
}

function stopRecording() {
  if (!state.isRecording) return;
  state.isRecording = false;

  if (state.timerInterval) {
    clearInterval(state.timerInterval);
    state.timerInterval = null;
  }

  // Stop streaming pipeline
  stopFrameGrabbing();

  chrome.runtime.sendMessage({ type: 'STOP_RECORDING' });

  if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
    state.mediaRecorder.stop();
  }
  if (state.mediaStream) {
    state.mediaStream.getTracks().forEach(track => track.stop());
  }

  elements.phaseRecording.style.display = 'none';
  elements.phaseProcessing.style.display = 'flex';
}

async function processRecording() {
  try {
    const videoBlob = new Blob(state.recordedChunks, { type: 'video/webm' });
    console.log('Video blob:', videoBlob.size, 'bytes');

    const { currentRecordingId } = await chrome.storage.local.get(['currentRecordingId']);

    await saveRecording(currentRecordingId, {
      videoBlob,
      duration: state.recordDuration,
      actualDuration: Date.now() - state.recordingStartTime,
      timestamp: new Date().toISOString(),
      cropRect: state.cropRect || null,
    });

    console.log('Video saved to IndexedDB (crop:', state.cropRect ? 'yes' : 'none', ')');
    await chrome.storage.local.set({ hasRecordingData: true });

    chrome.notifications.create('recording-complete', {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('../icons/icon128.png'),
      title: '螢幕錄製完成',
      message: '已成功儲存錄製影片，正在開啟標註介面...',
    });

    await new Promise(resolve => setTimeout(resolve, 500));
    window.location.href = chrome.runtime.getURL('annotation/dist/index.html');

  } catch (err) {
    console.error('Error processing recording:', err);
    alert('處理錄製資料時發生錯誤: ' + err.message);
  }
}

// ============================================
// Event Listeners
// ============================================
elements.btnStart.addEventListener('click', startRecording);
elements.btnStop.addEventListener('click', stopRecording);
elements.btnSkipCrop.addEventListener('click', skipCrop);
elements.btnConfirmCrop.addEventListener('click', confirmCrop);

console.log('🎬 Recorder page loaded');
