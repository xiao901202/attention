import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { safeAnalyze, extractMultiFrame } from '../vlm/vlm-client';
import { safeLLMGenerate } from '../vlm/llm-client';
import { getRecording } from '../store';

export default function ProcessingPage({ onComplete }) {
  const [status, setStatus] = useState('載入錄製資料中...');
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [thumbnailUrl, setThumbnailUrl] = useState(null);
  const videoRef = useRef(null);

  useEffect(() => {
    processData();
  }, []);

  function findPrecomputedFor(segment, precomputed) {
    if (!precomputed || precomputed.length === 0) return null;
    const segDur = segment.endTime - segment.startTime;
    if (segDur <= 0) return null;
    let best = null;
    let bestOverlap = 0;
    for (const p of precomputed) {
      const overlap = Math.max(0, Math.min(segment.endTime, p.endTime) - Math.max(segment.startTime, p.startTime));
      if (overlap <= 0) continue;
      const pDur = p.endTime - p.startTime;
      const ratio = overlap / Math.min(segDur, pDur || segDur);
      if (ratio >= 0.5 && overlap > bestOverlap) {
        best = p;
        bestOverlap = overlap;
      }
    }
    return best;
  }

  async function processData() {
    try {
      const storageData = await chrome.storage.local.get([
        'currentRecordingId', 'recordingSegments', 'recordingData',
        'recordingMouseData', 'recordingDuration', 'recordingActualDuration',
        'hasRecordingData', 'recordingCropRect', 'streamingPrecomputed',
      ]);

      const precomputed = Array.isArray(storageData.streamingPrecomputed) ? storageData.streamingPrecomputed : [];
      if (precomputed.length > 0) {
        console.log(`[Processing] Found ${precomputed.length} pre-computed segments from streaming pipeline`);
      }

      if (!storageData.hasRecordingData || !storageData.currentRecordingId) {
        setStatus('找不到錄製資料');
        onComplete({
          segments: [], scrollData: [], mouseData: [],
          vlmResults: {}, surveyResults: {}, duration: 180000, videoBlob: null, cropRect: null,
        });
        return;
      }

      const segments = storageData.recordingSegments || [];
      const scrollData = storageData.recordingData || [];
      const mouseData = storageData.recordingMouseData || [];
      const cropRect = storageData.recordingCropRect || null;

      let duration = storageData.recordingActualDuration || storageData.recordingDuration || 180000;
      if (segments.length > 0) {
        const maxEnd = Math.max(...segments.map(s => s.endTime || 0));
        if (maxEnd > 0) duration = Math.max(duration, maxEnd);
      }

      let videoBlob = null;
      let recording = null;
      try {
        recording = await getRecording(storageData.currentRecordingId);
        if (recording?.videoBlob) videoBlob = recording.videoBlob;
      } catch (e) {
        console.warn('[Processing] IndexedDB error:', e);
      }

      const MIN_READING_DURATION_MS = 2000;
      const greenIndices = segments
        .map((s, i) => ({ ...s, index: i }))
        .filter(s => s.state === 'READING_FLOW' && (s.endTime - s.startTime) >= MIN_READING_DURATION_MS);

      if (greenIndices.length === 0 || !videoBlob) {
        onComplete({ segments, scrollData, mouseData, vlmResults: {}, surveyResults: {}, duration, videoBlob, cropRect });
        return;
      }

      setTotal(greenIndices.length);

      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.src = URL.createObjectURL(videoBlob);
      videoRef.current = video;

      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Video load timeout')), 15000);
        video.addEventListener('loadeddata', () => { clearTimeout(timeout); resolve(); }, { once: true });
        video.load();
      });

      const vlmResults = {};
      const surveyResults = {};

      for (let i = 0; i < greenIndices.length; i++) {
        const seg = greenIndices[i];
        setProgress(i);

        const precomputedHit = findPrecomputedFor(seg, precomputed);
        if (precomputedHit && precomputedHit.vlm) {
          setStatus(`使用預分析結果：片段 ${i + 1}/${greenIndices.length}`);
          try {
            const frameBlob = await extractMultiFrame(video, seg.startTime, seg.endTime, cropRect);
            const thumbUrl = URL.createObjectURL(frameBlob);
            setThumbnailUrl(thumbUrl);
            const vlmResult = { ...precomputedHit.vlm, thumbnailUrl: thumbUrl };
            vlmResults[seg.index] = vlmResult;
            surveyResults[seg.index] = precomputedHit.survey || null;
            console.log(`[Processing] Segment ${seg.index} used precomputed result`);
            continue;
          } catch (err) {
            console.warn(`[Processing] thumbnail extraction failed for precomputed segment, falling back:`, err);
          }
        }

        setStatus(`擷取畫面：片段 ${i + 1}/${greenIndices.length}`);

        try {
          const frameBlob = await extractMultiFrame(video, seg.startTime, seg.endTime, cropRect);
          const thumbUrl = URL.createObjectURL(frameBlob);
          setThumbnailUrl(thumbUrl);

          setStatus(`VLM 分析中：片段 ${i + 1}/${greenIndices.length}...`);
          const vlmResult = await safeAnalyze(frameBlob);
          vlmResult.thumbnailUrl = thumbUrl;
          vlmResults[seg.index] = vlmResult;

          setStatus(`LLM 生成問卷中：片段 ${i + 1}/${greenIndices.length}...`);
          const survey = await safeLLMGenerate(vlmResult);
          surveyResults[seg.index] = survey;
        } catch (err) {
          console.error(`[Processing] Segment ${seg.index} failed:`, err);
          vlmResults[seg.index] = null;
          surveyResults[seg.index] = null;
        }
      }

      setProgress(greenIndices.length);
      setStatus('分析完成！');

      chrome.notifications.create('vlm-complete', {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/icon128.png'),
        title: 'VLM 分析完成',
        message: `已完成 ${greenIndices.length} 個片段的 AI 情境分析，即將開始標註。`,
      });

      await new Promise(r => setTimeout(r, 600));
      onComplete({ segments, scrollData, mouseData, vlmResults, surveyResults, duration, videoBlob, cropRect });

    } catch (err) {
      console.error('[Processing] Error:', err);
      setStatus('處理失敗: ' + err.message);
    }
  }

  const pct = total > 0 ? (progress / total) * 100 : 0;

  return (
    <motion.div
      className="page-container"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{ justifyContent: 'center', alignItems: 'center' }}
    >
      <div className="card" style={{ textAlign: 'center', padding: '48px 32px', width: '100%' }}>
        <div className="processing-spinner" />
        <h2 style={{ fontSize: 20, marginBottom: 8 }}>🤖 AI 情境分析中</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 4 }}>{status}</p>
        {thumbnailUrl && (
          <img
            src={thumbnailUrl}
            alt="Preview"
            style={{ maxWidth: '100%', borderRadius: 8, marginBottom: 16, border: '1px solid var(--border-light)' }}
          />
        )}

        <div style={{ background: 'var(--progress-bg)', borderRadius: 4, height: 6, overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            background: 'var(--primary-gradient)',
            borderRadius: 4,
            width: `${pct}%`,
            transition: 'width 0.3s',
          }} />
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6 }}>
          {progress} / {total} 片段
        </p>
      </div>
    </motion.div>
  );
}
