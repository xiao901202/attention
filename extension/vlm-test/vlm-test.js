/**
 * VLM Model Testing Dashboard
 * ============================
 * Upload a video → extract frames → send to VLM API → compare results across models
 */

// ============================================
// State
// ============================================
let videoFile = null;
let videoUrl = null;
let allResults = {};  // { modelName: [ { timeSec, thumbUrl, response, error } ] }
let activeModel = null;
let isAnalyzing = false;

// ============================================
// DOM Elements
// ============================================
const els = {
  apiServer: document.getElementById('apiServer'),
  apiKey: document.getElementById('apiKey'),
  modelInput: document.getElementById('modelInput'),
  frameInterval: document.getElementById('frameInterval'),
  promptInput: document.getElementById('promptInput'),
  uploadZone: document.getElementById('uploadZone'),
  videoFile: document.getElementById('videoFile'),
  videoPreviewWrap: document.getElementById('videoPreviewWrap'),
  videoPreview: document.getElementById('videoPreview'),
  videoInfo: document.getElementById('videoInfo'),
  btnAnalyze: document.getElementById('btnAnalyze'),
  btnClear: document.getElementById('btnClear'),
  btnExport: document.getElementById('btnExport'),
  statusText: document.getElementById('statusText'),
  progressWrap: document.getElementById('progressWrap'),
  progressFill: document.getElementById('progressFill'),
  resultsSection: document.getElementById('resultsSection'),
  resultsTabs: document.getElementById('resultsTabs'),
  resultsGrid: document.getElementById('resultsGrid'),
  multiFrameToggle: document.getElementById('multiFrameToggle'),
};

// ============================================
// Utility
// ============================================
function formatTimeSec(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function setStatus(text) {
  els.statusText.textContent = text;
}

function setProgress(pct) {
  els.progressFill.style.width = pct + '%';
}

// ============================================
// Video Upload
// ============================================
els.uploadZone.addEventListener('click', () => els.videoFile.click());

els.uploadZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  els.uploadZone.classList.add('dragover');
});

els.uploadZone.addEventListener('dragleave', () => {
  els.uploadZone.classList.remove('dragover');
});

els.uploadZone.addEventListener('drop', (e) => {
  e.preventDefault();
  els.uploadZone.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('video/')) {
    loadVideo(file);
  }
});

els.videoFile.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) loadVideo(file);
});

function loadVideo(file) {
  videoFile = file;
  if (videoUrl) URL.revokeObjectURL(videoUrl);
  videoUrl = URL.createObjectURL(file);

  els.videoPreview.src = videoUrl;
  els.uploadZone.style.display = 'none';
  els.videoPreviewWrap.style.display = 'block';
  els.btnAnalyze.disabled = true; // wait for metadata
  setStatus('⏳ 載入影片中...');

  els.videoPreview.onloadedmetadata = () => {
    const dur = els.videoPreview.duration;
    if (isFinite(dur) && dur > 0) {
      onVideoDurationReady(file, dur);
    } else {
      // WebM from MediaRecorder often has Infinity duration
      // Force browser to calculate real duration by seeking to end
      setStatus('⏳ 正在計算影片時長（WebM 修正中）...');
      els.videoPreview.currentTime = 1e10; // seek to a huge time
      els.videoPreview.onseeked = () => {
        els.videoPreview.onseeked = null;
        const realDur = els.videoPreview.duration;
        if (isFinite(realDur) && realDur > 0) {
          els.videoPreview.currentTime = 0; // reset to beginning
          onVideoDurationReady(file, realDur);
        } else {
          setStatus('⚠️ 無法讀取影片時長，請嘗試其他格式');
        }
      };
    }
  };
}

function onVideoDurationReady(file, dur) {
  els.btnAnalyze.disabled = false;
  const mb = (file.size / (1024 * 1024)).toFixed(1);
  els.videoInfo.textContent = `${file.name} | ${formatTimeSec(dur)} | ${mb} MB`;
  setStatus(`✅ 影片已載入: ${formatTimeSec(dur)} (${mb} MB)`);
}

// ============================================
// Frame Extraction
// ============================================
function extractFrame(videoEl, timeSec) {
  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      videoEl.removeEventListener('seeked', onSeeked);
      try {
        const canvas = document.createElement('canvas');
        canvas.width = videoEl.videoWidth || 1280;
        canvas.height = videoEl.videoHeight || 720;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          if (blob) {
            const thumbUrl = URL.createObjectURL(blob);
            resolve({ blob, thumbUrl });
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
 * Extract 3 frames at 20%, 50%, 80% within a time window,
 * stitch them horizontally (left→right = early→mid→late).
 * Returns { blob, thumbUrl }.
 */
async function extractMultiFrame(videoEl, windowStartSec, windowEndSec) {
  const duration = windowEndSec - windowStartSec;
  const percentages = [0.2, 0.5, 0.8];
  const times = percentages.map(p => windowStartSec + duration * p);

  const frameBitmaps = [];
  for (const t of times) {
    const { blob } = await extractFrame(videoEl, t);
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
      if (blob) {
        const thumbUrl = URL.createObjectURL(blob);
        resolve({ blob, thumbUrl });
      } else {
        reject(new Error('Multi-frame toBlob returned null'));
      }
    }, 'image/jpeg', 0.85);
  });
}

// ============================================
// VLM API Call
// ============================================
async function callVLM(imageBlob, model, prompt) {
  const serverUrl = els.apiServer.value.trim().replace(/\/$/, '');
  const apiKey = els.apiKey.value.trim();

  const formData = new FormData();
  formData.append('file', imageBlob, 'screenshot.jpg');
  formData.append('prompt', prompt);
  formData.append('model', model);

  const headers = {};
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

  const response = await fetch(`${serverUrl}/api/describe-upload`, {
    method: 'POST',
    headers,
    body: formData
  });

  if (!response.ok) {
    throw new Error(`API ${response.status}: ${response.statusText}`);
  }

  const result = await response.json();
  return result.response || JSON.stringify(result);
}

// ============================================
// Analysis Pipeline
// ============================================
async function startAnalysis() {
  if (isAnalyzing || !videoFile) return;
  isAnalyzing = true;
  els.btnAnalyze.disabled = true;

  const models = els.modelInput.value.split(',').map(m => m.trim()).filter(m => m);
  if (models.length === 0) {
    alert('請輸入至少一個模型名稱');
    isAnalyzing = false;
    els.btnAnalyze.disabled = false;
    return;
  }

  const interval = parseInt(els.frameInterval.value) || 10;
  const prompt = els.promptInput.value;
  const video = els.videoPreview;
  const duration = video.duration;

  if (!isFinite(duration) || duration <= 0) {
    alert('⚠️ 影片時長無效，請等待影片完全載入後再試。');
    isAnalyzing = false;
    els.btnAnalyze.disabled = false;
    return;
  }

  // Calculate frame times
  const frameTimes = [];
  for (let t = 0; t < duration; t += interval) {
    frameTimes.push(t);
    if (frameTimes.length > 1000) break; // safety cap
  }
  // Also include the midpoint if only one frame
  if (frameTimes.length === 0) {
    frameTimes.push(duration / 2);
  }

  const totalOps = models.length * frameTimes.length;
  let completed = 0;

  els.progressWrap.style.display = 'block';
  setProgress(0);

  // Extract frames (single or multi-frame mode)
  const multiFrameMode = els.multiFrameToggle && els.multiFrameToggle.checked;
  const modeLabel = multiFrameMode ? '三幀拼接' : '單幀';
  setStatus(`🖼️ 擷取 ${frameTimes.length} 組畫面 (${modeLabel})...`);
  const frames = [];
  for (let i = 0; i < frameTimes.length; i++) {
    try {
      let frame;
      if (multiFrameMode) {
        const winStart = frameTimes[i];
        const winEnd = (i + 1 < frameTimes.length) ? frameTimes[i + 1] : duration;
        frame = await extractMultiFrame(video, winStart, winEnd);
      } else {
        frame = await extractFrame(video, frameTimes[i]);
      }
      frames.push({ timeSec: frameTimes[i], ...frame });
    } catch (err) {
      console.error(`Frame extraction failed at ${frameTimes[i]}s:`, err);
      frames.push({ timeSec: frameTimes[i], blob: null, thumbUrl: null, error: err.message });
    }
  }

  // Run VLM for each model
  for (const model of models) {
    if (!allResults[model]) allResults[model] = [];

    setStatus(`🤖 使用 ${model} 分析中...`);

    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      const entry = {
        timeSec: frame.timeSec,
        thumbUrl: frame.thumbUrl,
        model,
        response: null,
        error: null,
        latencyMs: 0,
      };

      if (!frame.blob) {
        entry.error = frame.error || 'Frame extraction failed';
      } else {
        try {
          const t0 = performance.now();
          entry.response = await callVLM(frame.blob, model, prompt);
          entry.latencyMs = Math.round(performance.now() - t0);
        } catch (err) {
          entry.error = err.message;
          console.error(`VLM error for ${model} at ${frame.timeSec}s:`, err);
        }
      }

      allResults[model].push(entry);
      completed++;
      setProgress((completed / totalOps) * 100);
      setStatus(`🤖 ${model}: ${i + 1}/${frames.length} (${completed}/${totalOps} total)`);
    }
  }

  setStatus(`✅ 分析完成！共 ${totalOps} 個推論。`);
  setProgress(100);

  isAnalyzing = false;
  els.btnAnalyze.disabled = false;
  els.btnClear.disabled = false;
  els.btnExport.disabled = false;

  // Render results
  renderResults(models);
}

// ============================================
// Rendering
// ============================================
function renderResults(models) {
  els.resultsSection.style.display = 'block';

  // Tabs
  if (models.length > 1) {
    // Multi-model: show "Compare" + individual model tabs
    els.resultsTabs.innerHTML = `
      <button class="model-tab active" data-model="__compare__">🔀 比較模式</button>
      ${models.map(m => `<button class="model-tab" data-model="${m}">${m}</button>`).join('')}
    `;
    activeModel = '__compare__';
  } else {
    // Single model: just show results
    els.resultsTabs.innerHTML = `
      <button class="model-tab active" data-model="${models[0]}">${models[0]}</button>
    `;
    activeModel = models[0];
  }

  // Tab click handlers
  els.resultsTabs.querySelectorAll('.model-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      els.resultsTabs.querySelectorAll('.model-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeModel = tab.dataset.model;
      renderResultsContent();
    });
  });

  renderResultsContent();
}

function renderResultsContent() {
  const grid = els.resultsGrid;

  if (activeModel === '__compare__') {
    renderCompareMode(grid);
  } else {
    renderSingleModel(grid, activeModel);
  }
}

function renderSingleModel(grid, model) {
  const results = allResults[model] || [];
  grid.innerHTML = results.map(r => `
    <div class="result-card">
      ${r.thumbUrl ? `<img class="result-thumbnail" src="${r.thumbUrl}" alt="Frame at ${formatTimeSec(r.timeSec)}">` : ''}
      <div class="result-body">
        <div class="result-time">⏱ ${formatTimeSec(r.timeSec)} ${r.latencyMs ? `(${r.latencyMs}ms)` : ''}</div>
        <div class="result-model-tag">${r.model}</div>
        ${r.error
          ? `<div class="result-error">❌ ${r.error}</div>`
          : `<div class="result-text">${escapeHtml(r.response)}</div>`
        }
      </div>
    </div>
  `).join('');
}

function renderCompareMode(grid) {
  // Group by timeSec
  const timeMap = {};
  for (const [model, results] of Object.entries(allResults)) {
    for (const r of results) {
      const key = r.timeSec.toFixed(1);
      if (!timeMap[key]) timeMap[key] = { timeSec: r.timeSec, thumbUrl: r.thumbUrl, models: {} };
      timeMap[key].models[model] = r;
      if (r.thumbUrl && !timeMap[key].thumbUrl) timeMap[key].thumbUrl = r.thumbUrl;
    }
  }

  const sortedTimes = Object.keys(timeMap).sort((a, b) => parseFloat(a) - parseFloat(b));

  grid.innerHTML = sortedTimes.map(key => {
    const group = timeMap[key];
    const models = Object.entries(group.models);
    return `
      <div class="compare-group">
        <div class="compare-header">
          ${group.thumbUrl ? `<img class="compare-thumb" src="${group.thumbUrl}">` : ''}
          <div class="compare-time">⏱ ${formatTimeSec(group.timeSec)}</div>
        </div>
        <div class="compare-results">
          ${models.map(([model, r]) => `
            <div class="compare-result">
              <div class="result-model-tag">${model} ${r.latencyMs ? `(${r.latencyMs}ms)` : ''}</div>
              ${r.error
                ? `<div class="result-error">❌ ${r.error}</div>`
                : `<div class="result-text">${escapeHtml(r.response)}</div>`
              }
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================
// Export
// ============================================
function exportResults() {
  const exportData = {
    exportTime: new Date().toISOString(),
    config: {
      server: els.apiServer.value,
      models: els.modelInput.value.split(',').map(m => m.trim()),
      prompt: els.promptInput.value,
      frameInterval: parseInt(els.frameInterval.value),
    },
    results: allResults,
  };

  const json = JSON.stringify(exportData, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `vlm_comparison_${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ============================================
// Event Listeners
// ============================================
els.btnAnalyze.addEventListener('click', startAnalysis);
els.btnClear.addEventListener('click', () => {
  allResults = {};
  els.resultsGrid.innerHTML = '';
  els.resultsTabs.innerHTML = '';
  els.resultsSection.style.display = 'none';
  els.btnClear.disabled = true;
  els.btnExport.disabled = true;
  setProgress(0);
  els.progressWrap.style.display = 'none';
  setStatus('結果已清除');
});
els.btnExport.addEventListener('click', exportResults);

// ============================================
// Lightbox
// ============================================
const lightbox = {
  overlay: document.getElementById('lightboxOverlay'),
  img: document.getElementById('lightboxImg'),
  caption: document.getElementById('lightboxCaption'),
  close: document.getElementById('lightboxClose'),
};

function openLightbox(src, captionText) {
  lightbox.img.src = src;
  lightbox.caption.textContent = captionText || '';
  lightbox.overlay.classList.add('active');
}

function closeLightbox() {
  lightbox.overlay.classList.remove('active');
  lightbox.img.src = '';
}

lightbox.close.addEventListener('click', (e) => {
  e.stopPropagation();
  closeLightbox();
});

lightbox.overlay.addEventListener('click', (e) => {
  // Close if clicking the overlay background, not the image itself
  if (e.target === lightbox.overlay || e.target === lightbox.overlay.querySelector('.lightbox-content')) {
    closeLightbox();
  }
});

// Close lightbox on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeLightbox();
});

// Delegate click events on result thumbnails
els.resultsGrid.addEventListener('click', (e) => {
  const thumb = e.target.closest('.result-thumbnail, .compare-thumb');
  if (thumb) {
    const src = thumb.src;
    const alt = thumb.alt || '';
    // Try to find the time label nearby
    const card = thumb.closest('.result-card, .compare-group');
    let caption = '';
    if (card) {
      const timeEl = card.querySelector('.result-time, .compare-time');
      if (timeEl) caption = timeEl.textContent.trim();
    }
    openLightbox(src, caption || alt);
  }
});

console.log('🧪 VLM Test Dashboard loaded');
