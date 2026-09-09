/**
 * Context-Aware Annotation Dashboard
 * ===================================
 * 1. Extracts 3 frames (20%/50%/80%) from each READING_FLOW segment,
 *    stitches them horizontally, and sends the composite to VLM
 * 2. VLM analyzes the temporal progression of content
 * 3. Dynamically renders annotation panel with VLM-generated labels
 * 4. Collects agency, cognitive_load, final_state per segment
 */

// ============================================
// VLM Configuration
// ============================================
const VLM_CONFIG = {
  serverUrl: 'http://140.112.41.111:8899',
  apiKey: '',
  model: 'gemini-3-flash-preview',
  prompt: `這張圖片由左到右是同一段閱讀期間的三個時間點截圖（20%、50%、80%），請綜合這三張畫面描述使用者在這段時間閱讀的內容，包括文字和圖片。`
};

const DEFAULT_VLM_RESULT = {
  content_summary: '（無法辨識畫面內容）',
  agency_1: '完全被動，被內容牽著走',
  agency_5: '完全主動，有明確目的',
  load_1: '幾乎不需要思考',
  load_5: '非常燒腦，需要高度專注',
  emo_flow: '專注投入，持續學習且有收穫',
  emo_restorative: '輕鬆瀏覽，心情放鬆恢復',
  emo_zombie: '無意識滑動，停不下來',
  emo_rabbit_hole: '越陷越深，感到焦慮不安'
};

// ============================================
// IndexedDB
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

async function getRecording(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ============================================
// State
// ============================================
let segments = [];
let scrollData = [];
let mouseData = [];
let duration = 180000;
let currentSegmentIndex = -1;
let videoBlob = null;
let cropRect = null; // { x, y, width, height } in video pixels; null = full video

// VLM results keyed by segment index
let vlmResults = {};

// Current annotation state for active segment
let currentAnnotation = {
  agency: 3,
  load: 3,
  selectedEmotion: null // 'emo_flow' | 'emo_restorative' | 'emo_zombie' | 'emo_rabbit_hole'
};

// Wizard state
let wizardMode = false;
let wizardSegmentIndices = []; // indices of READING_FLOW segments that need annotation
let wizardCurrentStep = 0; // current step in the wizard (0-based)
let wizardLoopEnabled = true; // loop video for the current segment
let wizardAnnotation = { agency: 3, load: 3, selectedEmotion: null };

const EMOTION_STATE_MAP = {
  emo_flow: 'Deep Flow',
  emo_restorative: 'Restorative',
  emo_zombie: 'Zombie Scrolling',
  emo_rabbit_hole: 'Rabbit Hole'
};

// ============================================
// DOM Elements
// ============================================
const elements = {
  // Processing overlay
  processingOverlay: document.getElementById('processingOverlay'),
  processingStatus: document.getElementById('processingStatus'),
  processingThumbnail: document.getElementById('processingThumbnail'),
  progressFill: document.getElementById('progressFill'),
  progressText: document.getElementById('progressText'),

  // Wizard
  wizardOverlay: document.getElementById('wizardOverlay'),
  overviewApp: document.getElementById('overviewApp'),
  wizardProgressText: document.getElementById('wizardProgressText'),
  wizardProgressFill: document.getElementById('wizardProgressFill'),
  wizardVideo: document.getElementById('wizardVideo'),
  wizardPlayPause: document.getElementById('wizardPlayPause'),
  wizardTimeDisplay: document.getElementById('wizardTimeDisplay'),
  wizardLoopBtn: document.getElementById('wizardLoopBtn'),
  wizardContextThumb: document.getElementById('wizardContextThumb'),
  wizardContextSummary: document.getElementById('wizardContextSummary'),
  wizardSegmentChip: document.getElementById('wizardSegmentChip'),
  wizardChipState: document.getElementById('wizardChipState'),
  wizardChipTime: document.getElementById('wizardChipTime'),
  wizardAgencySlider: document.getElementById('wizardAgencySlider'),
  wizardAgencyValue: document.getElementById('wizardAgencyValue'),
  wizardAgencyLabel1: document.getElementById('wizardAgencyLabel1'),
  wizardAgencyLabel5: document.getElementById('wizardAgencyLabel5'),
  wizardLoadSlider: document.getElementById('wizardLoadSlider'),
  wizardLoadValue: document.getElementById('wizardLoadValue'),
  wizardLoadLabel1: document.getElementById('wizardLoadLabel1'),
  wizardLoadLabel5: document.getElementById('wizardLoadLabel5'),
  wizardQuadrantGrid: document.getElementById('wizardQuadrantGrid'),
  wizardEmoFlowDesc: document.getElementById('wizardEmoFlowDesc'),
  wizardEmoRestDesc: document.getElementById('wizardEmoRestDesc'),
  wizardEmoZombieDesc: document.getElementById('wizardEmoZombieDesc'),
  wizardEmoRabbitDesc: document.getElementById('wizardEmoRabbitDesc'),
  wizardPrev: document.getElementById('wizardPrev'),
  wizardSkipSeg: document.getElementById('wizardSkipSeg'),
  wizardNext: document.getElementById('wizardNext'),
  wizardDots: document.getElementById('wizardDots'),
  btnSkipToOverview: document.getElementById('btnSkipToOverview'),

  // Video
  videoPlayer: document.getElementById('videoPlayer'),
  videoOverlay: document.getElementById('videoOverlay'),
  btnPlayPause: document.getElementById('btnPlayPause'),
  currentTime: document.getElementById('currentTime'),
  totalTime: document.getElementById('totalTime'),
  seekBar: document.getElementById('seekBar'),
  timelineTrack: document.getElementById('timelineTrack'),
  timelineEnd: document.getElementById('timelineEnd'),
  playhead: document.getElementById('playhead'),
  mouseCount: document.getElementById('mouseCount'),
  mouseCanvas: document.getElementById('mouseCanvas'),

  // Segments
  segmentsList: document.getElementById('segmentsList'),
  totalCount: document.getElementById('totalCount'),
  pendingCount: document.getElementById('pendingCount'),
  labeledCount: document.getElementById('labeledCount'),

  // Annotation panel
  annotationPanel: document.getElementById('annotationPanel'),
  contextArea: document.getElementById('contextArea'),
  contextThumbWrap: document.getElementById('contextThumbWrap'),
  contextThumbnail: document.getElementById('contextThumbnail'),
  contextSummary: document.getElementById('contextSummary'),
  panelTime: document.getElementById('panelTime'),

  // Sliders
  agencySlider: document.getElementById('agencySlider'),
  agencyValue: document.getElementById('agencyValue'),
  agencyLabel1: document.getElementById('agencyLabel1'),
  agencyLabel5: document.getElementById('agencyLabel5'),
  loadSlider: document.getElementById('loadSlider'),
  loadValue: document.getElementById('loadValue'),
  loadLabel1: document.getElementById('loadLabel1'),
  loadLabel5: document.getElementById('loadLabel5'),

  // Quadrant
  quadrantGrid: document.getElementById('quadrantGrid'),
  emoFlowDesc: document.getElementById('emoFlowDesc'),
  emoRestDesc: document.getElementById('emoRestDesc'),
  emoZombieDesc: document.getElementById('emoZombieDesc'),
  emoRabbitDesc: document.getElementById('emoRabbitDesc'),

  // Actions
  btnSkip: document.getElementById('btnSkip'),
  btnConfirm: document.getElementById('btnConfirm'),

  // Export
  btnExportCSV: document.getElementById('btnExportCSV'),
  btnNewRecording: document.getElementById('btnNewRecording'),
  btnDownloadVideo: document.getElementById('btnDownloadVideo'),
  btnVLMTest: document.getElementById('btnVLMTest'),
  btnStartRecording: document.getElementById('btnStartRecording'),
  summaryModal: document.getElementById('summaryModal'),
  emptyState: document.getElementById('emptyState'),
  summaryTotal: document.getElementById('summaryTotal'),
  summaryDeepFlow: document.getElementById('summaryDeepFlow'),
  summaryRabbitHole: document.getElementById('summaryRabbitHole'),
  summaryRestorative: document.getElementById('summaryRestorative'),
  csvPreview: document.getElementById('csvPreview'),
  btnDownloadCSV: document.getElementById('btnDownloadCSV'),
  btnCloseSummary: document.getElementById('btnCloseSummary'),
  closeSummaryModal: document.getElementById('closeSummaryModal'),
};

// ============================================
// Utility Functions
// ============================================
function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

const stateLabelsMap = {
  'READING_FLOW': '📖 閱讀',
  'SCANNING_ZOMBIE': '🧟 無意識',
  'NAVIGATING': '🧭 瀏覽',
  'IDLE': '💤 閒置'
};

const MIN_READING_DURATION_MS = 3000;

function needsAnnotation(segment) {
  const duration = segment.endTime - segment.startTime;
  return segment.state === 'READING_FLOW' && !segment.annotated && duration >= MIN_READING_DURATION_MS;
}

// ============================================
// Frame Extraction
// ============================================
/**
 * Extract a frame from the video at the given time.
 * If cropRect is set, only the cropped region is captured.
 */
function extractFrame(videoEl, timeSec) {
  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      videoEl.removeEventListener('seeked', onSeeked);
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        if (cropRect) {
          // Draw only the cropped region
          canvas.width = cropRect.width;
          canvas.height = cropRect.height;
          ctx.drawImage(
            videoEl,
            cropRect.x, cropRect.y, cropRect.width, cropRect.height,
            0, 0, cropRect.width, cropRect.height
          );
        } else {
          // Draw full frame
          canvas.width = videoEl.videoWidth || 1280;
          canvas.height = videoEl.videoHeight || 720;
          ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
        }

        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Canvas toBlob returned null'));
          }
        }, 'image/jpeg', 0.85);
      } catch (err) {
        reject(err);
      }
    };

    videoEl.addEventListener('seeked', onSeeked);
    videoEl.currentTime = timeSec;
  });
}

// ============================================
// Multi-Frame Extraction (20% / 50% / 80%)
// ============================================
/**
 * Extract 3 frames at 20%, 50%, 80% of the segment duration,
 * stitch them horizontally (left→right = early→mid→late).
 * Returns a single JPEG Blob.
 */
async function extractMultiFrame(videoEl, startTimeMs, endTimeMs) {
  const duration = endTimeMs - startTimeMs;
  const percentages = [0.2, 0.5, 0.8];
  const timesSec = percentages.map(p => (startTimeMs + duration * p) / 1000);

  const frameBitmaps = [];
  for (const t of timesSec) {
    const blob = await extractFrame(videoEl, t);
    const bitmap = await createImageBitmap(blob);
    frameBitmaps.push(bitmap);
  }

  const frameW = frameBitmaps[0].width;
  const frameH = frameBitmaps[0].height;
  const gap = 4;
  const totalW = frameW * 3 + gap * 2;

  const canvas = document.createElement('canvas');
  canvas.width = totalW;
  canvas.height = frameH;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, totalW, frameH);

  frameBitmaps.forEach((bmp, i) => {
    const x = i * (frameW + gap);
    ctx.drawImage(bmp, x, 0, frameW, frameH);
    bmp.close();
  });

  // Draw timestamp labels
  ctx.font = `bold ${Math.max(14, Math.round(frameH * 0.03))}px sans-serif`;
  ctx.textAlign = 'center';
  percentages.forEach((p, i) => {
    const x = i * (frameW + gap) + frameW / 2;
    const label = `${Math.round(p * 100)}%`;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x - 30, 4, 60, 22);
    ctx.fillStyle = '#fff';
    ctx.fillText(label, x, 21);
  });

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      blob ? resolve(blob) : reject(new Error('Multi-frame toBlob returned null'));
    }, 'image/jpeg', 0.85);
  });
}

// ============================================
// VLM API
// ============================================
async function callVLM(imageBlob) {
  const formData = new FormData();
  formData.append('file', imageBlob, 'screenshot.jpg');
  formData.append('prompt', VLM_CONFIG.prompt);
  formData.append('model', VLM_CONFIG.model);

  const response = await fetch(`${VLM_CONFIG.serverUrl}/api/describe-upload`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${VLM_CONFIG.apiKey}`
    },
    body: formData
  });

  if (!response.ok) {
    throw new Error(`VLM API error: ${response.status} ${response.statusText}`);
  }

  const result = await response.json();
  console.log('[VLM] Raw response:', result.response);
  return parseVLMResponse(result.response);
}

function parseVLMResponse(text) {
  try {
    // Try to extract JSON from the response text
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      // Merge with defaults for any missing fields
      return { ...DEFAULT_VLM_RESULT, ...parsed };
    }
  } catch (e) {
    console.warn('[VLM] Failed to parse JSON response:', e, '\nRaw:', text);
  }
  // Return defaults if parsing fails
  return { ...DEFAULT_VLM_RESULT, content_summary: text.slice(0, 100) || DEFAULT_VLM_RESULT.content_summary };
}

// ============================================
// Processing Pipeline
// ============================================
function showProcessingOverlay() {
  elements.processingOverlay.classList.remove('hidden');
}

function hideProcessingOverlay() {
  elements.processingOverlay.classList.add('hidden');
}

function updateProgress(current, total, statusText) {
  const pct = total > 0 ? (current / total) * 100 : 0;
  elements.progressFill.style.width = `${pct}%`;
  elements.progressText.textContent = `${current} / ${total} 片段`;
  if (statusText) {
    elements.processingStatus.textContent = statusText;
  }
}

async function processGreenSegments() {
  const greenIndices = segments
    .map((s, i) => ({ ...s, index: i }))
    .filter(s => s.state === 'READING_FLOW' && (s.endTime - s.startTime) >= MIN_READING_DURATION_MS);

  if (greenIndices.length === 0) {
    console.log('[Process] No READING_FLOW segments found, skipping VLM analysis');
    hideProcessingOverlay();
    showOverview();
    return;
  }

  showProcessingOverlay();
  updateProgress(0, greenIndices.length, '等待影片就緒...');

  // Wait for video to be seekable
  const video = elements.videoPlayer;
  if (video.readyState < 2) {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Video load timeout'));
      }, 15000);
      video.addEventListener('loadeddata', () => {
        clearTimeout(timeout);
        resolve();
      }, { once: true });
    }).catch(err => {
      console.warn('[Process] Video not ready, using defaults:', err.message);
      // Set defaults for all green segments
      greenIndices.forEach(seg => {
        vlmResults[seg.index] = { ...DEFAULT_VLM_RESULT };
      });
      hideProcessingOverlay();
      renderSegments();
      startWizard();
      return;
    });
  }

  console.log(`[Process] Processing ${greenIndices.length} READING_FLOW segments`);

  for (let i = 0; i < greenIndices.length; i++) {
    const seg = greenIndices[i];
    const segLabel = `片段 ${i + 1}/${greenIndices.length}`;
    updateProgress(i, greenIndices.length, `🖼️ 擷取畫面: ${segLabel} (${formatTime(seg.startTime)} - ${formatTime(seg.endTime)})`);

    try {
      // Extract 3 frames (20%/50%/80%) stitched horizontally
      console.log(`[Process] Extracting multi-frame (20%/50%/80%) for segment ${seg.index} [${(seg.startTime/1000).toFixed(1)}s - ${(seg.endTime/1000).toFixed(1)}s]`);
      
      const frameBlob = await extractMultiFrame(video, seg.startTime, seg.endTime);

      // Show thumbnail preview
      const thumbUrl = URL.createObjectURL(frameBlob);
      elements.processingThumbnail.src = thumbUrl;
      elements.processingThumbnail.classList.add('visible');

      // Call VLM API
      updateProgress(i, greenIndices.length, `🤖 AI 分析中: ${segLabel}...`);
      const vlmResult = await callVLM(frameBlob);
      vlmResult.thumbnailUrl = thumbUrl;

      vlmResults[seg.index] = vlmResult;
      console.log(`[Process] Segment ${seg.index} VLM result:`, vlmResult.content_summary);

    } catch (err) {
      console.error(`[Process] Failed for segment ${seg.index}:`, err);
      vlmResults[seg.index] = { ...DEFAULT_VLM_RESULT };
    }
  }

  updateProgress(greenIndices.length, greenIndices.length, '✅ 分析完成！');

  // Auto-save VLM results to file
  saveVLMResults(greenIndices);

  // Brief delay to show completion
  await new Promise(r => setTimeout(r, 800));
  hideProcessingOverlay();

  // Re-render UI with VLM data
  renderSegments();

  // Start wizard mode for step-by-step annotation
  startWizard();
}

/**
 * Save all VLM inference results to a JSON file for reference
 */
function saveVLMResults(greenIndices) {
  try {
    const exportData = {
      exportTime: new Date().toISOString(),
      model: VLM_CONFIG.model,
      totalSegments: segments.length,
      analyzedSegments: greenIndices.length,
      results: greenIndices.map(seg => ({
        segmentIndex: seg.index,
        startTime: formatTime(seg.startTime),
        endTime: formatTime(seg.endTime),
        startMs: seg.startTime,
        endMs: seg.endTime,
        state: seg.state,
        vlm: vlmResults[seg.index] || null
      }))
    };

    const json = JSON.stringify(exportData, null, 2);
    downloadFile(`vlm_results_${Date.now()}.json`, json, 'application/json');
    console.log('[VLM] Results saved to file');
  } catch (err) {
    console.error('[VLM] Failed to save results:', err);
  }
}

function autoSelectFirstPending() {
  const firstPending = segments.findIndex(s => needsAnnotation(s));
  if (firstPending !== -1) {
    selectSegment(firstPending);
    seekTo(segments[firstPending].startTime);
  }
}

// ============================================
// Data Loading
// ============================================
async function loadData() {
  try {
    console.log('[Annotation] Loading data...');

    const storageData = await chrome.storage.local.get([
      'currentRecordingId',
      'recordingSegments',
      'recordingData',
      'recordingMouseData',
      'recordingDuration',
      'recordingActualDuration',
      'hasRecordingData',
      'recordingCropRect'
    ]);

    console.log('[Annotation] Storage data:', {
      hasData: storageData.hasRecordingData,
      recordingId: storageData.currentRecordingId,
      segmentsCount: storageData.recordingSegments?.length,
      dataCount: storageData.recordingData?.length,
      mouseCount: storageData.recordingMouseData?.length,
    });

    if (!storageData.hasRecordingData || !storageData.currentRecordingId) {
      console.log('[Annotation] No recording data found');
      elements.emptyState.classList.add('show');
      hideProcessingOverlay();
      return;
    }

    // Load crop rect
    cropRect = storageData.recordingCropRect || null;
    console.log('[Annotation] Crop rect:', cropRect);

    // Load video from IndexedDB
    try {
      const recording = await getRecording(storageData.currentRecordingId);
      console.log('[Annotation] Recording from IndexedDB:', recording ? 'found' : 'not found');

      // Also check cropRect from IndexedDB recording metadata
      if (recording && recording.cropRect && !cropRect) {
        cropRect = recording.cropRect;
      }

      if (recording && recording.videoBlob) {
        videoBlob = recording.videoBlob;
        console.log('[Annotation] Video blob size:', videoBlob.size);

        const videoUrl = URL.createObjectURL(videoBlob);
        elements.videoPlayer.src = videoUrl;

        elements.videoPlayer.onloadeddata = () => {
          console.log('[Annotation] Video loaded successfully');
          elements.videoOverlay.classList.add('hidden');
          // Show crop overlay on video if crop rect exists
          if (cropRect) {
            showVideoCropOverlay();
          }
        };

        elements.videoPlayer.onerror = (e) => {
          console.error('[Annotation] Video error:', elements.videoPlayer.error);
          elements.videoOverlay.querySelector('p').textContent = '影片載入失敗';
        };
      } else {
        console.log('[Annotation] No video blob in recording');
        elements.videoOverlay.querySelector('p').textContent = '無影片資料';
      }
    } catch (dbErr) {
      console.error('[Annotation] IndexedDB error:', dbErr);
      elements.videoOverlay.querySelector('p').textContent = '無法讀取影片';
    }

    // Load data
    segments = storageData.recordingSegments || [];
    scrollData = storageData.recordingData || [];
    mouseData = storageData.recordingMouseData || [];

    // Calculate duration
    let calculatedDuration = storageData.recordingActualDuration || storageData.recordingDuration || 0;
    if (segments.length > 0) {
      const maxEndTime = Math.max(...segments.map(s => s.endTime || 0));
      if (maxEndTime > 0) calculatedDuration = Math.max(calculatedDuration, maxEndTime);
    }
    if (scrollData.length > 0) {
      const maxScrollTime = Math.max(...scrollData.map(d => d.t || 0));
      if (maxScrollTime > 0) calculatedDuration = Math.max(calculatedDuration, maxScrollTime);
    }
    duration = calculatedDuration > 0 ? calculatedDuration : 180000;

    console.log('[Annotation] Loaded:', {
      segments: segments.length,
      scrollData: scrollData.length,
      mouseData: mouseData.length,
      duration,
    });

    // Update static UI
    elements.timelineEnd.textContent = formatTime(duration);
    elements.totalTime.textContent = formatTime(duration);
    elements.mouseCount.textContent = `${mouseData.length} events`;

    // Render base UI
    renderTimeline();
    renderSegments();
    renderMousePreview();
    updateStats();

    // Start VLM processing pipeline
    await processGreenSegments();

  } catch (err) {
    console.error('[Annotation] Error loading data:', err);
    elements.emptyState.classList.add('show');
    hideProcessingOverlay();
  }
}

// ============================================
// Video Crop Overlay
// ============================================
function showVideoCropOverlay() {
  if (!cropRect) return;
  const video = elements.videoPlayer;
  const vw = video.videoWidth || 1920;
  const vh = video.videoHeight || 1080;

  // Create overlay element
  let overlay = document.getElementById('videoCropOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'videoCropOverlay';
    overlay.className = 'video-crop-overlay';
    const container = video.closest('.video-container');
    if (container) container.appendChild(overlay);
  }

  overlay.style.left = (cropRect.x / vw * 100) + '%';
  overlay.style.top = (cropRect.y / vh * 100) + '%';
  overlay.style.width = (cropRect.width / vw * 100) + '%';
  overlay.style.height = (cropRect.height / vh * 100) + '%';
  overlay.style.display = 'block';
  overlay.title = `裁切區域: ${cropRect.width} × ${cropRect.height} px`;
}

// ============================================
// Timeline Rendering
// ============================================
function renderTimeline() {
  elements.timelineTrack.innerHTML = '<div class="timeline-playhead" id="playhead"></div>';

  segments.forEach((segment, index) => {
    const left = (segment.startTime / duration) * 100;
    const width = Math.max(((segment.endTime - segment.startTime) / duration) * 100, 0.5);

    const segmentEl = document.createElement('div');
    segmentEl.className = `timeline-segment ${segment.state}`;
    segmentEl.style.left = `${left}%`;
    segmentEl.style.width = `${width}%`;
    segmentEl.dataset.index = index;
    segmentEl.title = `${formatTime(segment.startTime)} - ${formatTime(segment.endTime)} [${segment.state}]`;

    segmentEl.addEventListener('click', () => {
      selectSegment(index);
      seekTo(segment.startTime);
    });

    elements.timelineTrack.appendChild(segmentEl);
  });
}

function updatePlayhead(timeMs) {
  const percent = (timeMs / duration) * 100;
  const playhead = document.getElementById('playhead');
  if (playhead) playhead.style.left = `${percent}%`;
}

// ============================================
// Segments List
// ============================================
function renderSegments() {
  if (segments.length === 0) {
    elements.segmentsList.innerHTML = `
      <div style="text-align: center; padding: 40px; color: var(--text-muted);">
        沒有偵測到任何行為片段
      </div>`;
    return;
  }

  elements.segmentsList.innerHTML = segments.map((segment, i) => {
    const isSelected = i === currentSegmentIndex;
    const durationSec = ((segment.endTime - segment.startTime) / 1000).toFixed(1);
    const stateLabel = stateLabelsMap[segment.state] || segment.state;
    const hasVLM = vlmResults[i] !== undefined;

    let badges = '';
    if (segment.annotated) {
      const stateText = segment.final_state || '已標註';
      badges = `<span class="segment-badge done">✓ ${stateText}</span>`;
    } else if (segment.state === 'READING_FLOW') {
      badges = hasVLM
        ? '<span class="segment-badge ai">🤖 待標註</span>'
        : '<span class="segment-badge pending">待標註</span>';
    }

    return `
      <div class="segment-item ${isSelected ? 'selected' : ''} ${segment.annotated ? 'labeled' : ''} state-${segment.state}"
           data-index="${i}">
        <div class="segment-color ${segment.state}"></div>
        <div class="segment-info">
          <div class="segment-time">${formatTime(segment.startTime)} - ${formatTime(segment.endTime)}</div>
          <div class="segment-duration">${durationSec} 秒 · ${stateLabel}</div>
        </div>
        <div class="segment-badges">${badges}</div>
      </div>`;
  }).join('');

  // Click listeners
  elements.segmentsList.querySelectorAll('.segment-item').forEach(item => {
    item.addEventListener('click', () => {
      const index = parseInt(item.dataset.index);
      selectSegment(index);
      seekTo(segments[index].startTime);
    });
  });
}

// ============================================
// Select Segment & Update Panel
// ============================================
function selectSegment(index) {
  currentSegmentIndex = index;
  const segment = segments[index];

  // Reset annotation state
  currentAnnotation = {
    agency: segment.agency || 3,
    load: segment.cognitive_load || 3,
    selectedEmotion: segment.selectedEmotion || null
  };

  // Update timeline highlight
  document.querySelectorAll('.timeline-segment').forEach(el => {
    el.classList.toggle('selected', parseInt(el.dataset.index) === index);
  });

  // Update panel time
  elements.panelTime.textContent = `${formatTime(segment.startTime)} - ${formatTime(segment.endTime)}`;

  // Update dynamic panel based on VLM data
  const vlm = vlmResults[index] || DEFAULT_VLM_RESULT;

  // Context area
  if (vlm.thumbnailUrl) {
    elements.contextThumbnail.src = vlm.thumbnailUrl;
    elements.contextThumbnail.classList.add('visible');
  } else {
    elements.contextThumbnail.classList.remove('visible');
  }
  elements.contextSummary.textContent = vlm.content_summary;

  // Agency slider
  elements.agencySlider.value = currentAnnotation.agency;
  elements.agencyValue.textContent = currentAnnotation.agency;
  elements.agencyLabel1.textContent = `1: ${vlm.agency_1}`;
  elements.agencyLabel1.title = vlm.agency_1;
  elements.agencyLabel5.textContent = `5: ${vlm.agency_5}`;
  elements.agencyLabel5.title = vlm.agency_5;

  // Load slider
  elements.loadSlider.value = currentAnnotation.load;
  elements.loadValue.textContent = currentAnnotation.load;
  elements.loadLabel1.textContent = `1: ${vlm.load_1}`;
  elements.loadLabel1.title = vlm.load_1;
  elements.loadLabel5.textContent = `5: ${vlm.load_5}`;
  elements.loadLabel5.title = vlm.load_5;

  // Quadrant descriptions
  elements.emoFlowDesc.textContent = vlm.emo_flow;
  elements.emoRestDesc.textContent = vlm.emo_restorative;
  elements.emoZombieDesc.textContent = vlm.emo_zombie;
  elements.emoRabbitDesc.textContent = vlm.emo_rabbit_hole;

  // Quadrant selection state
  elements.quadrantGrid.querySelectorAll('.quad-card').forEach(card => {
    card.classList.toggle('selected', card.dataset.value === currentAnnotation.selectedEmotion);
  });

  // Update confirm button state
  updateConfirmButton();

  // Highlight in segments list
  renderSegments();

  // Scroll segment into view
  const selectedItem = elements.segmentsList.querySelector(`.segment-item[data-index="${index}"]`);
  if (selectedItem) {
    selectedItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function updateConfirmButton() {
  const canSubmit = currentAnnotation.selectedEmotion !== null;
  elements.btnConfirm.disabled = !canSubmit;
}

// ============================================
// Slider & Quadrant Interaction
// ============================================
elements.agencySlider.addEventListener('input', () => {
  currentAnnotation.agency = parseInt(elements.agencySlider.value);
  elements.agencyValue.textContent = currentAnnotation.agency;
});

elements.loadSlider.addEventListener('input', () => {
  currentAnnotation.load = parseInt(elements.loadSlider.value);
  elements.loadValue.textContent = currentAnnotation.load;
});

elements.quadrantGrid.addEventListener('click', (e) => {
  const card = e.target.closest('.quad-card');
  if (!card) return;

  currentAnnotation.selectedEmotion = card.dataset.value;

  elements.quadrantGrid.querySelectorAll('.quad-card').forEach(c => {
    c.classList.toggle('selected', c === card);
  });

  updateConfirmButton();
});

// ============================================
// Submit & Navigation
// ============================================
function updateStats() {
  const total = segments.filter(s => s.state === 'READING_FLOW').length;
  const pending = segments.filter(s => needsAnnotation(s)).length;
  const labeled = segments.filter(s => s.state === 'READING_FLOW' && s.annotated).length;

  if (elements.totalCount) elements.totalCount.textContent = total;
  elements.pendingCount.textContent = pending;
  elements.labeledCount.textContent = labeled;
}

elements.btnConfirm.addEventListener('click', () => {
  if (currentSegmentIndex < 0 || !currentAnnotation.selectedEmotion) return;

  const segment = segments[currentSegmentIndex];
  const emotionValue = currentAnnotation.selectedEmotion;

  // Save annotation data on the segment
  segment.annotated = true;
  segment.agency = currentAnnotation.agency;
  segment.cognitive_load = currentAnnotation.load;
  segment.selectedEmotion = emotionValue;
  segment.final_state = EMOTION_STATE_MAP[emotionValue] || emotionValue;

  console.log('[Annotation] Saved:', {
    index: currentSegmentIndex,
    agency: segment.agency,
    cognitive_load: segment.cognitive_load,
    final_state: segment.final_state
  });

  // Persist to storage
  chrome.storage.local.set({ recordingSegments: segments });

  // Move to next pending segment
  const nextIndex = segments.findIndex((s, i) => i > currentSegmentIndex && needsAnnotation(s));
  if (nextIndex !== -1) {
    selectSegment(nextIndex);
    seekTo(segments[nextIndex].startTime);
  } else {
    // Check if there are any remaining before current
    const anyRemaining = segments.findIndex(s => needsAnnotation(s));
    if (anyRemaining !== -1) {
      selectSegment(anyRemaining);
      seekTo(segments[anyRemaining].startTime);
    } else {
      // All done!
      showSummary();
    }
  }

  updateStats();
  renderSegments();
});

elements.btnSkip.addEventListener('click', () => {
  const nextIndex = segments.findIndex((s, i) => i > currentSegmentIndex && needsAnnotation(s));
  if (nextIndex !== -1) {
    selectSegment(nextIndex);
    seekTo(segments[nextIndex].startTime);
  }
});

// ============================================
// Mouse Preview
// ============================================
function renderMousePreview() {
  const canvas = elements.mouseCanvas;
  const ctx = canvas.getContext('2d');

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  canvas.style.width = rect.width + 'px';
  canvas.style.height = rect.height + 'px';

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (mouseData.length === 0) return;

  const wheelEvents = mouseData.filter(e => e.type === 'wheel');
  if (wheelEvents.length === 0) return;

  const maxDelta = Math.max(...wheelEvents.map(e => Math.abs(e.deltaY)), 1);
  const displayWidth = rect.width;
  const displayHeight = rect.height;

  const gradient = ctx.createLinearGradient(0, 0, 0, displayHeight);
  gradient.addColorStop(0, '#22c55e');
  gradient.addColorStop(1, 'rgba(34, 197, 94, 0.3)');
  ctx.fillStyle = gradient;

  wheelEvents.forEach(event => {
    const x = (event.t / duration) * displayWidth;
    const height = (Math.abs(event.deltaY) / maxDelta) * (displayHeight - 10);
    ctx.fillRect(x, displayHeight - height, 4, height);
  });

  canvas.onclick = (e) => {
    const r = canvas.getBoundingClientRect();
    const clickX = e.clientX - r.left;
    const clickTime = (clickX / r.width) * duration;
    const nearbyEvents = wheelEvents.filter(evt => Math.abs(evt.t - clickTime) < 1000).slice(0, 10);
    if (nearbyEvents.length > 0) showMouseDataModal(nearbyEvents);
  };

  canvas.style.cursor = 'pointer';
  canvas.title = '點擊查看滑鼠事件詳情';
}

function showMouseDataModal(events) {
  const modal = document.createElement('div');
  modal.className = 'mouse-data-modal';
  modal.innerHTML = `
    <div class="mouse-data-content">
      <div class="mouse-data-header">
        <h3>🖱️ 滑鼠事件詳情</h3>
        <button class="close-modal">✕</button>
      </div>
      <div class="mouse-data-table">
        <table>
          <thead>
            <tr><th>時間</th><th>類型</th><th>X</th><th>Y</th><th>ΔX</th><th>ΔY</th></tr>
          </thead>
          <tbody>
            ${events.map(e => `
              <tr>
                <td>${formatTime(e.t)}</td><td>${e.type}</td>
                <td>${e.x || '-'}</td><td>${e.y || '-'}</td>
                <td>${e.deltaX || '-'}</td><td>${e.deltaY || '-'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <div class="mouse-data-footer">
        <p style="font-size: 12px; color: var(--text-muted); margin: 0;">
          💡 使用右上角「匯出 CSV」下載完整滑鼠數據
        </p>
      </div>
    </div>`;
  document.body.appendChild(modal);

  modal.querySelector('.close-modal').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
}

// ============================================
// Video Controls
// ============================================
function seekTo(timeMs) {
  elements.videoPlayer.currentTime = timeMs / 1000;
}

elements.btnPlayPause.addEventListener('click', () => {
  if (elements.videoPlayer.paused) {
    elements.videoPlayer.play();
    elements.btnPlayPause.textContent = '⏸️';
  } else {
    elements.videoPlayer.pause();
    elements.btnPlayPause.textContent = '▶️';
  }
});

elements.videoPlayer.addEventListener('timeupdate', () => {
  const currentMs = elements.videoPlayer.currentTime * 1000;
  elements.currentTime.textContent = formatTime(currentMs);
  elements.seekBar.value = (currentMs / duration) * 100;
  updatePlayhead(currentMs);
});

elements.videoPlayer.addEventListener('loadedmetadata', () => {
  const rawDur = elements.videoPlayer.duration;
  console.log('[Annotation] Video metadata loaded, raw duration:', rawDur);
  if (isFinite(rawDur) && rawDur > 0) {
    applyVideoDuration(rawDur * 1000);
  } else {
    // WebM from MediaRecorder often reports Infinity duration
    console.log('[Annotation] Duration is Infinity, seeking to fix...');
    elements.videoPlayer.currentTime = 1e10;
    elements.videoPlayer.addEventListener('seeked', function onFixSeek() {
      elements.videoPlayer.removeEventListener('seeked', onFixSeek);
      const fixedDur = elements.videoPlayer.duration;
      console.log('[Annotation] Fixed duration:', fixedDur);
      if (isFinite(fixedDur) && fixedDur > 0) {
        elements.videoPlayer.currentTime = 0;
        applyVideoDuration(fixedDur * 1000);
      }
    });
  }
});

function applyVideoDuration(videoDurationMs) {
  duration = videoDurationMs;
  elements.totalTime.textContent = formatTime(duration);
  elements.timelineEnd.textContent = formatTime(duration);
  renderTimeline();
  renderMousePreview();
}

elements.seekBar.addEventListener('input', () => {
  const timeMs = (elements.seekBar.value / 100) * duration;
  seekTo(timeMs);
});

elements.timelineTrack.addEventListener('click', (e) => {
  if (e.target === elements.timelineTrack || e.target.id === 'playhead') {
    const rect = elements.timelineTrack.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const timeMs = percent * duration;
    seekTo(timeMs);
  }
});

// ============================================
// Export
// ============================================
function generateSegmentsCSV() {
  const header = 'start_ms,end_ms,start_fmt,end_fmt,state,agency,cognitive_load,final_state,content_summary,duration_sec';
  const rows = segments.map((s, i) => {
    const dur = ((s.endTime - s.startTime) / 1000).toFixed(2);
    const vlm = vlmResults[i];
    const summary = (vlm ? vlm.content_summary : '').replace(/,/g, '；');
    return `${s.startTime},${s.endTime},${formatTime(s.startTime)},${formatTime(s.endTime)},${s.state},${s.agency || ''},${s.cognitive_load || ''},${s.final_state || ''},${summary},${dur}`;
  });
  return [header, ...rows].join('\n');
}

function generateScrollCSV() {
  if (scrollData.length === 0) return '';
  const header = 'timestamp_ms,scroll_top,speed,z_score,stop_density,mean_speed,active_speed_mean,page_height,state';
  const rows = scrollData.map(d =>
    `${d.t},${d.scrollTop || 0},${d.speed},${d.zScore},${d.stopDensity},${d.meanSpeed},${d.activeSpeedMean || 0},${d.pageHeight || 0},${d.state}`
  );
  return [header, ...rows].join('\n');
}

function generateMouseCSV() {
  if (mouseData.length === 0) return '';
  const header = 'timestamp_ms,type,x,y,deltaX,deltaY,button';
  const rows = mouseData.map(d =>
    `${d.t},${d.type},${d.x || ''},${d.y || ''},${d.deltaX || ''},${d.deltaY || ''},${d.button || ''}`
  );
  return [header, ...rows].join('\n');
}

function generateVLMJSON() {
  const entries = Object.entries(vlmResults);
  if (entries.length === 0) return null;
  const data = {
    exportTime: new Date().toISOString(),
    model: VLM_CONFIG.model,
    results: entries.map(([idx, vlm]) => {
      const seg = segments[parseInt(idx)];
      return {
        segmentIndex: parseInt(idx),
        startTime: seg ? formatTime(seg.startTime) : '',
        endTime: seg ? formatTime(seg.endTime) : '',
        state: seg ? seg.state : '',
        annotation: seg ? { agency: seg.agency, cognitive_load: seg.cognitive_load, final_state: seg.final_state } : null,
        vlm_response: {
          content_summary: vlm.content_summary,
          agency_1: vlm.agency_1,
          agency_5: vlm.agency_5,
          load_1: vlm.load_1,
          load_5: vlm.load_5,
          emo_flow: vlm.emo_flow,
          emo_restorative: vlm.emo_restorative,
          emo_zombie: vlm.emo_zombie,
          emo_rabbit_hole: vlm.emo_rabbit_hole
        }
      };
    })
  };
  return JSON.stringify(data, null, 2);
}

function showSummary() {
  const readingSegments = segments.filter(s => s.state === 'READING_FLOW');
  const total = readingSegments.length;
  const deepFlow = readingSegments.filter(s => s.final_state === 'Deep Flow').length;
  const rabbitHole = readingSegments.filter(s => s.final_state === 'Rabbit Hole').length;
  const restorative = readingSegments.filter(s => s.final_state === 'Restorative').length;

  elements.summaryTotal.textContent = total;
  elements.summaryDeepFlow.textContent = deepFlow;
  elements.summaryRabbitHole.textContent = rabbitHole;
  elements.summaryRestorative.textContent = restorative;

  const csvContent = generateSegmentsCSV();
  elements.csvPreview.textContent = csvContent.split('\n').slice(0, 12).join('\n') + '\n...';

  elements.summaryModal.classList.add('active');
}

function downloadAllCSV() {
  const timestamp = Date.now();

  const segmentsCSV = generateSegmentsCSV();
  downloadFile(`segments_${timestamp}.csv`, segmentsCSV);

  setTimeout(() => {
    const scrollCSV = generateScrollCSV();
    if (scrollCSV) downloadFile(`scroll_data_${timestamp}.csv`, scrollCSV);
  }, 300);

  setTimeout(() => {
    const mouseCSV = generateMouseCSV();
    if (mouseCSV) downloadFile(`mouse_data_${timestamp}.csv`, mouseCSV);
  }, 600);

  // VLM results JSON
  setTimeout(() => {
    const vlmJson = generateVLMJSON();
    if (vlmJson) downloadFile(`vlm_results_${timestamp}.json`, vlmJson, 'application/json');
  }, 900);

  setTimeout(() => {
    alert('✅ 已匯出 4 個檔案：\n\n1. segments_*.csv - 行為片段與標註\n2. scroll_data_*.csv - 滾動數據\n3. mouse_data_*.csv - 滑鼠數據\n4. vlm_results_*.json - AI 推論結果');
  }, 1100);
}

function downloadFile(filename, content, mimeType = 'text/csv') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ============================================
// Wizard System
// ============================================
function startWizard() {
  // Collect READING_FLOW segment indices
  wizardSegmentIndices = segments
    .map((s, i) => i)
    .filter(i => segments[i].state === 'READING_FLOW');

  if (wizardSegmentIndices.length === 0) {
    console.log('[Wizard] No READING_FLOW segments to annotate, going to overview');
    showOverview();
    return;
  }

  wizardMode = true;
  wizardCurrentStep = 0;

  // Share video source with wizard video player
  if (videoBlob) {
    const wizardVideoUrl = URL.createObjectURL(videoBlob);
    elements.wizardVideo.src = wizardVideoUrl;
  }

  // Render dots
  renderWizardDots();

  // Show wizard
  elements.wizardOverlay.classList.add('active');
  if (elements.overviewApp) elements.overviewApp.style.display = 'none';

  // Load first segment
  loadWizardStep(0);
}

function renderWizardDots() {
  elements.wizardDots.innerHTML = wizardSegmentIndices.map((segIdx, step) => {
    const seg = segments[segIdx];
    let cls = 'wizard-dot';
    if (step === wizardCurrentStep) cls += ' active';
    if (seg.annotated) cls += ' completed';
    return `<div class="${cls}" data-step="${step}" title="${formatTime(seg.startTime)} - ${formatTime(seg.endTime)}"></div>`;
  }).join('');

  elements.wizardDots.querySelectorAll('.wizard-dot').forEach(dot => {
    dot.addEventListener('click', () => {
      const step = parseInt(dot.dataset.step);
      loadWizardStep(step);
    });
  });
}

function loadWizardStep(step) {
  if (step < 0 || step >= wizardSegmentIndices.length) return;

  wizardCurrentStep = step;
  const segIdx = wizardSegmentIndices[step];
  const seg = segments[segIdx];
  const vlm = vlmResults[segIdx] || DEFAULT_VLM_RESULT;
  const durationSec = ((seg.endTime - seg.startTime) / 1000).toFixed(1);

  // Reset wizard annotation
  wizardAnnotation = {
    agency: seg.agency || 3,
    load: seg.cognitive_load || 3,
    selectedEmotion: seg.selectedEmotion || null
  };

  // Progress
  const totalSteps = wizardSegmentIndices.length;
  elements.wizardProgressText.textContent = `片段 ${step + 1} / ${totalSteps}`;
  elements.wizardProgressFill.style.width = ((step + 1) / totalSteps * 100) + '%';

  // Step indicator
  const stepNumberEl = document.getElementById('wizardStepNumber');
  if (stepNumberEl) stepNumberEl.textContent = `STEP ${step + 1}`;

  // Segment meta
  elements.wizardChipState.textContent = `📖 READING_FLOW`;
  elements.wizardChipTime.textContent = `${formatTime(seg.startTime)} - ${formatTime(seg.endTime)} (${durationSec}s)`;

  // Time display
  elements.wizardTimeDisplay.textContent = `${formatTime(seg.startTime)} - ${formatTime(seg.endTime)}`;

  // Context summary (prominent)
  elements.wizardContextSummary.textContent = vlm.content_summary;

  // Hidden thumbnail (for data)
  if (vlm.thumbnailUrl) {
    elements.wizardContextThumb.src = vlm.thumbnailUrl;
  }

  // Agency slider
  elements.wizardAgencySlider.value = wizardAnnotation.agency;
  elements.wizardAgencyValue.textContent = wizardAnnotation.agency;
  elements.wizardAgencyLabel1.textContent = vlm.agency_1;
  elements.wizardAgencyLabel5.textContent = vlm.agency_5;

  // Load slider
  elements.wizardLoadSlider.value = wizardAnnotation.load;
  elements.wizardLoadValue.textContent = wizardAnnotation.load;
  elements.wizardLoadLabel1.textContent = vlm.load_1;
  elements.wizardLoadLabel5.textContent = vlm.load_5;

  // Quadrant descriptions
  elements.wizardEmoFlowDesc.textContent = vlm.emo_flow;
  elements.wizardEmoRestDesc.textContent = vlm.emo_restorative;
  elements.wizardEmoZombieDesc.textContent = vlm.emo_zombie;
  elements.wizardEmoRabbitDesc.textContent = vlm.emo_rabbit_hole;

  // Quadrant selection
  elements.wizardQuadrantGrid.querySelectorAll('.quad-card').forEach(card => {
    card.classList.toggle('selected', card.dataset.value === wizardAnnotation.selectedEmotion);
  });

  // Button states
  elements.wizardPrev.disabled = (step === 0);
  updateWizardNextButton();

  // Seek video to segment start
  const startSec = seg.startTime / 1000;
  if (elements.wizardVideo.readyState >= 2) {
    elements.wizardVideo.currentTime = startSec;
    elements.wizardVideo.play().catch(() => {});
  } else {
    elements.wizardVideo.addEventListener('loadeddata', function onLoad() {
      elements.wizardVideo.removeEventListener('loadeddata', onLoad);
      elements.wizardVideo.currentTime = startSec;
      elements.wizardVideo.play().catch(() => {});
    });
  }

  // Update dots
  renderWizardDots();
}

function updateWizardNextButton() {
  elements.wizardNext.disabled = !wizardAnnotation.selectedEmotion;
}

function wizardSubmitCurrent() {
  if (!wizardAnnotation.selectedEmotion) return;

  const segIdx = wizardSegmentIndices[wizardCurrentStep];
  const seg = segments[segIdx];

  seg.annotated = true;
  seg.agency = wizardAnnotation.agency;
  seg.cognitive_load = wizardAnnotation.load;
  seg.selectedEmotion = wizardAnnotation.selectedEmotion;
  seg.final_state = EMOTION_STATE_MAP[wizardAnnotation.selectedEmotion] || wizardAnnotation.selectedEmotion;

  console.log('[Wizard] Submitted segment:', segIdx, seg.final_state);

  // Persist
  chrome.storage.local.set({ recordingSegments: segments });

  // Move to next step
  if (wizardCurrentStep < wizardSegmentIndices.length - 1) {
    loadWizardStep(wizardCurrentStep + 1);
  } else {
    // All done!
    wizardComplete();
  }
}

function wizardComplete() {
  console.log('[Wizard] All segments annotated!');
  elements.wizardVideo.pause();
  showOverview();
  // Show summary after brief delay
  setTimeout(() => showSummary(), 500);
}

function showOverview() {
  wizardMode = false;
  elements.wizardOverlay.classList.remove('active');
  elements.wizardVideo.pause();
  if (elements.overviewApp) elements.overviewApp.style.display = 'flex';

  // Sync overview data
  renderSegments();
  updateStats();
  renderTimeline();
}

// Wizard event: video loop
elements.wizardVideo.addEventListener('timeupdate', () => {
  if (!wizardMode || !wizardLoopEnabled) return;
  const segIdx = wizardSegmentIndices[wizardCurrentStep];
  if (segIdx === undefined) return;
  const seg = segments[segIdx];
  const endSec = seg.endTime / 1000;
  const startSec = seg.startTime / 1000;
  if (elements.wizardVideo.currentTime >= endSec) {
    elements.wizardVideo.currentTime = startSec;
  }
});

// Wizard play/pause
elements.wizardPlayPause.addEventListener('click', () => {
  if (elements.wizardVideo.paused) {
    elements.wizardVideo.play();
    elements.wizardPlayPause.textContent = '⏸️';
  } else {
    elements.wizardVideo.pause();
    elements.wizardPlayPause.textContent = '▶️';
  }
});

// Wizard loop toggle
elements.wizardLoopBtn.addEventListener('click', () => {
  wizardLoopEnabled = !wizardLoopEnabled;
  elements.wizardLoopBtn.classList.toggle('active', wizardLoopEnabled);
});
elements.wizardLoopBtn.classList.add('active'); // default on

// Wizard slider events
elements.wizardAgencySlider.addEventListener('input', () => {
  wizardAnnotation.agency = parseInt(elements.wizardAgencySlider.value);
  elements.wizardAgencyValue.textContent = wizardAnnotation.agency;
});

elements.wizardLoadSlider.addEventListener('input', () => {
  wizardAnnotation.load = parseInt(elements.wizardLoadSlider.value);
  elements.wizardLoadValue.textContent = wizardAnnotation.load;
});

// Wizard quadrant click
elements.wizardQuadrantGrid.addEventListener('click', (e) => {
  const card = e.target.closest('.quad-card');
  if (!card) return;
  wizardAnnotation.selectedEmotion = card.dataset.value;
  elements.wizardQuadrantGrid.querySelectorAll('.quad-card').forEach(c => {
    c.classList.toggle('selected', c === card);
  });
  updateWizardNextButton();
});

// Wizard navigation buttons
elements.wizardPrev.addEventListener('click', () => {
  if (wizardCurrentStep > 0) {
    loadWizardStep(wizardCurrentStep - 1);
  }
});

elements.wizardSkipSeg.addEventListener('click', () => {
  if (wizardCurrentStep < wizardSegmentIndices.length - 1) {
    loadWizardStep(wizardCurrentStep + 1);
  } else {
    // Last segment, skip to overview
    showOverview();
  }
});

elements.wizardNext.addEventListener('click', () => {
  wizardSubmitCurrent();
});

// Skip to overview button
elements.btnSkipToOverview.addEventListener('click', () => {
  showOverview();
});

// ============================================
// Overview Event Listeners
// ============================================
elements.btnExportCSV.addEventListener('click', showSummary);
elements.btnDownloadCSV.addEventListener('click', downloadAllCSV);
elements.btnCloseSummary.addEventListener('click', () => elements.summaryModal.classList.remove('active'));
elements.closeSummaryModal.addEventListener('click', () => elements.summaryModal.classList.remove('active'));

elements.btnNewRecording.addEventListener('click', () => {
  window.location.href = chrome.runtime.getURL('recorder/recorder.html');
});

elements.btnDownloadVideo.addEventListener('click', async () => {
  if (!videoBlob) {
    alert('⚠️ 沒有可下載的影片資料');
    return;
  }
  try {
    const url = URL.createObjectURL(videoBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `recording_${Date.now()}.webm`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('[Annotation] Download video error:', err);
    alert('下載失敗: ' + err.message);
  }
});

elements.btnVLMTest.addEventListener('click', () => {
  window.open(chrome.runtime.getURL('vlm-test/vlm-test.html'), '_blank');
});

elements.btnStartRecording.addEventListener('click', () => {
  window.location.href = chrome.runtime.getURL('recorder/recorder.html');
});

// ============================================
// Initialize
// ============================================
loadData();
console.log('✏️ Context-Aware Annotation Dashboard loaded');
