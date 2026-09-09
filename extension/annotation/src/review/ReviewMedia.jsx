import React, { useEffect, useRef, useState } from 'react';

export function formatTime(ms = 0) {
  const seconds = Math.floor(ms / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export default function ReviewMedia({ source, segment, segmentNumber, onEvent, pauseKey, disabled = false }) {
  const video = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false);
  const start = (segment?.startTime || 0) / 1000;
  const end = (segment?.endTime || 0) / 1000;
  const eventRef = useRef(onEvent);
  const attached = useRef(false);
  eventRef.current = onEvent;

  function locate() {
    const v = video.current;
    if (!v) return;
    v.pause();
    if (Number.isFinite(v.duration) && start >= v.duration) {
      setError('這段時間超出影片長度。你可以回報片段有誤。'); setReady(false); return;
    }
    v.currentTime = start;
    setTime(start); setReady(true); setError('');
  }

  useEffect(() => {
    if (!source.videoBlob || !video.current) return;
    const v = video.current;
    attached.current = true;
    const url = URL.createObjectURL(source.videoBlob);
    v.src = url; v.load();
    return () => { attached.current = false; v.pause(); v.removeAttribute('src'); v.load(); URL.revokeObjectURL(url); };
  }, [source.videoBlob]);

  useEffect(() => {
    setExpanded(false);
    if (video.current?.readyState >= 1) locate();
  }, [start, end]);

  // Questions share this player. Changing a question pauses rather than remounts/replays it.
  useEffect(() => { video.current?.pause(); }, [pauseKey]);

  async function play(restart = false) {
    const v = video.current;
    if (!v || !ready || disabled) return;
    if (restart || v.currentTime >= end - 0.05) v.currentTime = start;
    try { await v.play(); setError(''); }
    catch { setError('影片尚未成功播放，請再按一次播放。'); }
  }

  function record(type) {
    if (!attached.current) return;
    eventRef.current?.({ type, video_time_ms: Math.round((video.current?.currentTime || start) * 1000), at: new Date().toISOString() });
  }

  return <aside className={`review-media ${expanded ? 'media-expanded' : ''}`} aria-label="原片段回顧">
    <div className="media-heading"><span className="eyebrow">回顧原片段</span><span className="time-chip">{formatTime(segment?.startTime)} — {formatTime(segment?.endTime)}</span></div>
    {source.demo ? <div className="demo-post">
      <div className="demo-author"><span className="demo-avatar" aria-hidden="true">葉</span><div><strong>生活觀察筆記</strong><span>介面示例 · 第 {segmentNumber} 段</span></div></div>
      <div className="demo-landscape" aria-hidden="true"><span className="sun"/><span className="tree tree-one"/><span className="tree tree-two"/><span className="park-path"/></div>
      <h3>城市裡的一小片樹蔭</h3>
      <p>今天換了一條路回家。街角有一排樹，樹下放著兩張長椅，有人停下來休息，也有人繼續往前走。</p>
      <p>同一條街，在不同的時間經過，好像會注意到不同的事情。</p>
      <div className="demo-note">這是操作示例，並非你的真實瀏覽紀錄。</div>
    </div> : source.videoBlob ? <>
      <div className="review-video-wrap"><video ref={video} muted playsInline preload="metadata"
        aria-label="錄製片段" onLoadedMetadata={locate}
        onError={() => { setReady(false); setError('無法讀取影片。請確認錄影檔是否完整，或回報片段有誤。'); }}
        onPlay={() => { setPlaying(true); record('play'); }} onPause={() => { setPlaying(false); record('pause'); }}
        onTimeUpdate={() => {
          const v = video.current;
          if (v.currentTime >= end) { v.pause(); if (v.currentTime > end + 0.05) v.currentTime = end; }
          setTime(v.currentTime);
        }} /></div>
      <div className="media-controls">
        <input aria-label="片段播放位置" type="range" min={start} max={end} step="0.1" disabled={!ready || disabled}
          value={Math.max(start, Math.min(end, time))} onChange={e => { video.current.currentTime = +e.target.value; setTime(+e.target.value); record('seek'); }} />
        <div className="media-button-row"><button type="button" className="button secondary" disabled={!ready || disabled} onClick={() => playing ? video.current.pause() : play()}>{playing ? '暫停' : '播放片段'}</button>
          <button type="button" className="text-button" disabled={!ready || disabled} onClick={() => play(true)}>從頭重播</button>
          <span className="media-clock">{formatTime(time * 1000)}</span>
          <button type="button" className="text-button" disabled={disabled} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? '縮回畫面' : '放大畫面'}</button></div>
      </div>
    </> : <div className="missing-video"><strong>這次沒有可讀取的影片</strong><p>如果無法確認原片段，請選「無法回想」或「片段有誤」。</p></div>}
    {error && <p className="inline-error" role="alert">{error}</p>}
    <div className="media-reminder"><span aria-hidden="true">↶</span><p>回想當時的經驗。<br/><span>以原瀏覽時的情況回答，不以重看後的新想法作答。</span></p></div>
  </aside>;
}
