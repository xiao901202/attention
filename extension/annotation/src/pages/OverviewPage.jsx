import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { QUADRANT_NAMES } from '../engine/scorer';
import { getAllSessions, clearSessions } from '../store';

function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// Human-readable timestamp safe for filenames: 20260415_143022
function fileTimestamp(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

const STATE_LABELS = {
  READING_FLOW: '📖 閱讀',
  SCANNING_ZOMBIE: '🧟 無意識',
  NAVIGATING: '🧭 瀏覽',
  IDLE: '💤 閒置',
};

const STATE_COLORS = {
  READING_FLOW: '#22c55e',
  SCANNING_ZOMBIE: '#ef4444',
  NAVIGATING: '#f59e0b',
  IDLE: '#94a3b8',
};

export default function OverviewPage({
  segments, scrollData, mouseData, vlmResults, surveyResults, duration, videoBlob,
}) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [sessionCount, setSessionCount] = useState(0);

  useEffect(() => {
    getAllSessions().then(s => setSessionCount(s.length)).catch(() => {});
  }, []);

  useEffect(() => {
    if (videoBlob && videoRef.current) {
      const url = URL.createObjectURL(videoBlob);
      videoRef.current.src = url;
      return () => URL.revokeObjectURL(url);
    }
  }, [videoBlob]);

  useEffect(() => { renderMouseCanvas(); }, [mouseData, duration]);

  function renderMouseCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, rect.width, rect.height);
    const wheelEvents = (mouseData || []).filter(e => e.type === 'wheel');
    if (wheelEvents.length === 0) return;
    const maxDelta = Math.max(...wheelEvents.map(e => Math.abs(e.deltaY)), 1);
    const gradient = ctx.createLinearGradient(0, 0, 0, rect.height);
    gradient.addColorStop(0, '#22c55e');
    gradient.addColorStop(1, 'rgba(34, 197, 94, 0.3)');
    ctx.fillStyle = gradient;
    wheelEvents.forEach(event => {
      const x = (event.t / duration) * rect.width;
      const height = (Math.abs(event.deltaY) / maxDelta) * (rect.height - 10);
      ctx.fillRect(x, rect.height - height, 4, height);
    });
  }

  function handleVideoTimeUpdate() {
    if (videoRef.current) setCurrentTime(videoRef.current.currentTime * 1000);
  }

  function togglePlay() {
    if (!videoRef.current) return;
    if (videoRef.current.paused) { videoRef.current.play(); setPlaying(true); }
    else { videoRef.current.pause(); setPlaying(false); }
  }

  function seekTo(ms) { if (videoRef.current) videoRef.current.currentTime = ms / 1000; }

  const readingSegs = segments.filter(s => s.state === 'READING_FLOW');
  const annotatedSegs = readingSegs.filter(s => s.annotated);
  const quadrantCounts = { Q1: 0, Q2: 0, Q3: 0, Q4: 0 };
  annotatedSegs.forEach(s => {
    if (s.computed_quadrant && quadrantCounts[s.computed_quadrant] !== undefined)
      quadrantCounts[s.computed_quadrant]++;
  });

  function generateSegmentsCSV() {
    const header = 'start_ms,end_ms,start_fmt,end_fmt,state,x_coordinate,y_coordinate,computed_quadrant,confidence_x,confidence_y,confidence_avg,consistency_bonus,final_sample_weight,is_llm_fallback,duration_sec';
    const rows = segments.map((s, i) => {
      const dur = ((s.endTime - s.startTime) / 1000).toFixed(2);
      const sr = surveyResults?.[i];
      const isFallback = sr ? (sr._isFallback ?? true) : '';
      return `${s.startTime},${s.endTime},${formatTime(s.startTime)},${formatTime(s.endTime)},${s.state},${s.x_coordinate ?? ''},${s.y_coordinate ?? ''},${s.computed_quadrant ?? ''},${s.confidence_x ?? ''},${s.confidence_y ?? ''},${s.confidence_avg ?? ''},${s.consistency_bonus ?? ''},${s.final_sample_weight ?? ''},${isFallback},${dur}`;
    });
    return [header, ...rows].join('\n');
  }

  function generateScrollCSV() {
    if (!scrollData.length) return '';
    const header = 'timestamp_ms,scroll_top,speed,z_score,stop_density,mean_speed,active_speed_mean,page_height,state';
    return [header, ...scrollData.map(d =>
      `${d.t},${d.scrollTop || 0},${d.speed},${d.zScore},${d.stopDensity},${d.meanSpeed},${d.activeSpeedMean || 0},${d.pageHeight || 0},${d.state}`
    )].join('\n');
  }

  function generateMouseCSV() {
    if (!mouseData.length) return '';
    const header = 'timestamp_ms,type,x,y,deltaX,deltaY,button';
    return [header, ...mouseData.map(d =>
      `${d.t},${d.type},${d.x || ''},${d.y || ''},${d.deltaX || ''},${d.deltaY || ''},${d.button || ''}`
    )].join('\n');
  }

  function generateVLMJSON() {
    const entries = Object.entries(vlmResults || {});
    if (entries.length === 0) return null;
    return JSON.stringify({
      exportTime: new Date().toISOString(),
      results: entries.map(([idx, vlm]) => {
        const segIdx = parseInt(idx);
        const seg = segments[segIdx];
        const sr = surveyResults?.[segIdx];
        return {
          segmentIndex: segIdx,
          startTime: seg ? formatTime(seg.startTime) : '',
          endTime: seg ? formatTime(seg.endTime) : '',
          vlm,
          llm: {
            is_fallback: sr?._isFallback ?? true,
            generated_survey: sr ? {
              step1: { question: sr.step1_question, reframe: sr.step1_reframe },
              step2: { question: sr.step2_question, reframe: sr.step2_reframe },
              step3: { question: sr.step3_question, reframe: sr.step3_reframe },
            } : null,
          },
          annotation: seg?.annotated ? {
            x_coordinate: seg.x_coordinate, y_coordinate: seg.y_coordinate,
            computed_quadrant: seg.computed_quadrant,
            confidence_x: seg.confidence_x,
            confidence_y: seg.confidence_y,
            confidence_avg: seg.confidence_avg,
            consistency_bonus: seg.consistency_bonus,
            final_sample_weight: seg.final_sample_weight,
          } : null,
        };
      }),
    }, null, 2);
  }

  function downloadFile(filename, content, mime = 'text/csv') {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  function handleExportAll() {
    const ts = fileTimestamp();
    downloadFile(`segments_${ts}.csv`, generateSegmentsCSV());
    setTimeout(() => { const sc = generateScrollCSV(); if (sc) downloadFile(`scroll_data_${ts}.csv`, sc); }, 300);
    setTimeout(() => { const mc = generateMouseCSV(); if (mc) downloadFile(`mouse_data_${ts}.csv`, mc); }, 600);
    setTimeout(() => { const vj = generateVLMJSON(); if (vj) downloadFile(`vlm_results_${ts}.json`, vj, 'application/json'); }, 900);
  }

  function handleDownloadVideo() {
    if (!videoBlob) return;
    downloadFile(`recording_${fileTimestamp()}.webm`, videoBlob, 'video/webm');
  }

  async function handleBatchExport() {
    try {
      const sessions = await getAllSessions();
      if (sessions.length === 0) return;
      const ts = fileTimestamp();

      // Merge all sessions into combined CSVs
      const segHeader = 'session_id,session_time,start_ms,end_ms,start_fmt,end_fmt,state,x_coordinate,y_coordinate,computed_quadrant,confidence_x,confidence_y,confidence_avg,consistency_bonus,final_sample_weight,is_llm_fallback,duration_sec';
      const segRows = sessions.flatMap(sess =>
        (sess.segments || []).map((s, i) => {
          const dur = ((s.endTime - s.startTime) / 1000).toFixed(2);
          const sr = sess.surveyResults?.[i];
          const isFallback = sr ? (sr._isFallback ?? true) : '';
          return `${sess.session_id},${sess.timestamp},${s.startTime},${s.endTime},${formatTime(s.startTime)},${formatTime(s.endTime)},${s.state},${s.x_coordinate ?? ''},${s.y_coordinate ?? ''},${s.computed_quadrant ?? ''},${s.confidence_x ?? ''},${s.confidence_y ?? ''},${s.confidence_avg ?? ''},${s.consistency_bonus ?? ''},${s.final_sample_weight ?? ''},${isFallback},${dur}`;
        })
      );
      downloadFile(`all_segments_${ts}.csv`, [segHeader, ...segRows].join('\n'));

      // Scroll data
      const scrollHeader = 'session_id,session_time,timestamp_ms,scroll_top,speed,z_score,stop_density,mean_speed,active_speed_mean,page_height,state';
      const scrollRows = sessions.flatMap(sess =>
        (sess.scrollData || []).map(d =>
          `${sess.session_id},${sess.timestamp},${d.t},${d.scrollTop || 0},${d.speed},${d.zScore},${d.stopDensity},${d.meanSpeed},${d.activeSpeedMean || 0},${d.pageHeight || 0},${d.state}`
        )
      );
      if (scrollRows.length) {
        setTimeout(() => downloadFile(`all_scroll_data_${ts}.csv`, [scrollHeader, ...scrollRows].join('\n')), 300);
      }

      // Mouse data
      const mouseHeader = 'session_id,session_time,timestamp_ms,type,x,y,deltaX,deltaY,button';
      const mouseRows = sessions.flatMap(sess =>
        (sess.mouseData || []).map(d =>
          `${sess.session_id},${sess.timestamp},${d.t},${d.type},${d.x || ''},${d.y || ''},${d.deltaX || ''},${d.deltaY || ''},${d.button || ''}`
        )
      );
      if (mouseRows.length) {
        setTimeout(() => downloadFile(`all_mouse_data_${ts}.csv`, [mouseHeader, ...mouseRows].join('\n')), 600);
      }

      // VLM + annotations JSON
      const allResults = sessions.map(sess => ({
        session_id: sess.session_id,
        timestamp: sess.timestamp,
        duration: sess.duration,
        vlmResults: Object.entries(sess.vlmResults || {}).map(([idx, vlm]) => {
          const segIdx = parseInt(idx);
          const seg = sess.segments[segIdx];
          const sr = sess.surveyResults?.[segIdx];
          return {
            segmentIndex: segIdx,
            startTime: seg ? formatTime(seg.startTime) : '',
            endTime: seg ? formatTime(seg.endTime) : '',
            vlm,
            llm: {
              is_fallback: sr?._isFallback ?? true,
              generated_survey: sr ? {
                step1: { question: sr.step1_question, reframe: sr.step1_reframe },
                step2: { question: sr.step2_question, reframe: sr.step2_reframe },
                step3: { question: sr.step3_question, reframe: sr.step3_reframe },
              } : null,
            },
            annotation: seg?.annotated ? {
              x_coordinate: seg.x_coordinate, y_coordinate: seg.y_coordinate,
              computed_quadrant: seg.computed_quadrant,
              confidence_x: seg.confidence_x,
              confidence_y: seg.confidence_y,
              confidence_avg: seg.confidence_avg,
              consistency_bonus: seg.consistency_bonus,
              final_sample_weight: seg.final_sample_weight,
            } : null,
          };
        }),
        annotations: sess.annotations || [],
      }));
      setTimeout(() => downloadFile(`all_vlm_results_${ts}.json`, JSON.stringify({ exportTime: new Date().toISOString(), sessions: allResults }, null, 2), 'application/json'), 900);
    } catch (err) {
      console.error('[BatchExport] failed:', err);
    }
  }

  async function handleClearSessions() {
    if (!confirm('確定要清除所有已累積的標註記錄嗎？')) return;
    await clearSessions();
    setSessionCount(0);
  }

  return (
    <motion.div
      className="overview-page"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="overview-page__header">
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>✏️ 行為片段標註總覽</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* Quadrant summary inline */}
          {Object.entries(QUADRANT_NAMES).map(([key, q]) => (
            <span key={key} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 13 }}>
              {q.emoji}<strong>{quadrantCounts[key]}</strong>
            </span>
          ))}
          <span style={{ width: 1, height: 20, background: 'var(--border-light)', margin: '0 4px' }} />
          <button className="btn-outline" onClick={handleDownloadVideo} style={{ padding: '8px 14px', fontSize: 13 }}>
            📹 影片
          </button>
          <button className="btn-primary" onClick={handleExportAll} style={{ padding: '8px 14px', fontSize: 13 }}>
            📥 本次匯出
          </button>
          <span style={{ width: 1, height: 20, background: 'var(--border-light)', margin: '0 4px' }} />
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>已累積 {sessionCount} 次</span>
          <button className="btn-primary" onClick={handleBatchExport} disabled={sessionCount === 0} style={{ padding: '8px 14px', fontSize: 13, opacity: sessionCount === 0 ? 0.5 : 1 }}>
            📦 全部匯出
          </button>
          <button className="btn-outline" onClick={handleClearSessions} disabled={sessionCount === 0} style={{ padding: '8px 14px', fontSize: 13, opacity: sessionCount === 0 ? 0.5 : 1 }}>
            🗑️ 清除
          </button>
        </div>
      </div>

      <div className="overview-page__body">
        <div className="overview-page__left">
          {/* Video */}
          <div className="card" style={{ padding: 0, overflow: 'hidden', flexShrink: 0 }}>
            <video
              ref={videoRef} style={{ width: '100%', display: 'block', maxHeight: '40vh' }}
              onTimeUpdate={handleVideoTimeUpdate} playsInline
            />
            <div style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 8, borderTop: '1px solid var(--border-light)' }}>
              <button onClick={togglePlay} style={{ background: 'none', border: 'none', fontSize: 16, cursor: 'pointer' }}>
                {playing ? '⏸️' : '▶️'}
              </button>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>
          </div>

          {/* Timeline */}
          <div className="card" style={{ padding: 10, flexShrink: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>📊 行為時間軸</div>
            <div style={{ position: 'relative', height: 22, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
              {segments.map((seg, i) => {
                const left = (seg.startTime / duration) * 100;
                const width = Math.max(((seg.endTime - seg.startTime) / duration) * 100, 0.5);
                return (
                  <div key={i} onClick={() => seekTo(seg.startTime)}
                    title={`${formatTime(seg.startTime)} - ${formatTime(seg.endTime)} [${seg.state}]`}
                    style={{
                      position: 'absolute', left: `${left}%`, width: `${width}%`, height: '100%',
                      background: STATE_COLORS[seg.state] || '#ccc', cursor: 'pointer', opacity: 0.8,
                    }}
                  />
                );
              })}
              <div style={{
                position: 'absolute', left: `${(currentTime / duration) * 100}%`,
                top: 0, bottom: 0, width: 2, background: '#1e293b', zIndex: 2, transition: 'left 0.1s',
              }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
              <span>00:00</span><span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Mouse */}
          <div className="card" style={{ padding: 10, flexShrink: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
              🖱️ 滑鼠 <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>({mouseData.length})</span>
            </div>
            <canvas ref={canvasRef} style={{ width: '100%', height: 60, display: 'block' }} />
          </div>
        </div>

        {/* Right: segment list */}
        <div className="overview-page__right">
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6, flexShrink: 0 }}>
            📋 片段列表
            <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 8, fontSize: 13 }}>
              {annotatedSegs.length}/{readingSegs.length} 已標註
            </span>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {segments.map((seg, i) => {
              const durSec = ((seg.endTime - seg.startTime) / 1000).toFixed(1);
              const q = seg.computed_quadrant ? QUADRANT_NAMES[seg.computed_quadrant] : null;
              return (
                <div key={i} onClick={() => seekTo(seg.startTime)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '7px 4px',
                    borderBottom: '1px solid var(--border-light)', cursor: 'pointer', fontSize: 13,
                  }}
                >
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%', background: STATE_COLORS[seg.state], flexShrink: 0,
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{formatTime(seg.startTime)} - {formatTime(seg.endTime)}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                      {durSec}s · {STATE_LABELS[seg.state] || seg.state}
                    </div>
                  </div>
                  {q && <span style={{ fontSize: 12, color: 'var(--primary-solid)', fontWeight: 600 }}>{q.emoji} {q.name}</span>}
                  {seg.final_sample_weight != null && (
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>w:{seg.final_sample_weight.toFixed(2)}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
