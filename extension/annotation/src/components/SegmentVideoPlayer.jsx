import React, { useEffect, useRef, useState, useCallback } from 'react';

export default function SegmentVideoPlayer({ videoBlob, segment }) {
  const videoRef = useRef(null);
  const modalVideoRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [modalPlaying, setModalPlaying] = useState(false);
  const [enlarged, setEnlarged] = useState(false);
  const [scrubValue, setScrubValue] = useState(0);
  const [modalScrubValue, setModalScrubValue] = useState(0);
  const scrubbing = useRef(false);
  const modalScrubbing = useRef(false);

  useEffect(() => {
    if (!videoBlob || !videoRef.current) return;
    const url = URL.createObjectURL(videoBlob);
    videoRef.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [videoBlob]);

  useEffect(() => {
    if (!videoRef.current || !segment) return;
    const startSec = segment.startTime / 1000;
    const seekAndPlay = () => {
      videoRef.current.currentTime = startSec;
      videoRef.current.play().catch(() => {});
      setPlaying(true);
    };
    if (videoRef.current.readyState >= 2) {
      seekAndPlay();
    } else {
      videoRef.current.addEventListener('loadeddata', seekAndPlay, { once: true });
    }
  }, [segment, videoBlob]);

  // Main video timeupdate + loop
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !segment) return;
    const endSec = segment.endTime / 1000;
    const startSec = segment.startTime / 1000;
    const duration = endSec - startSec;
    const handleTime = () => {
      if (v.currentTime >= endSec) v.currentTime = startSec;
      if (!scrubbing.current && duration > 0) {
        const pct = ((v.currentTime - startSec) / duration) * 100;
        setScrubValue(Math.max(0, Math.min(100, pct)));
      }
    };
    v.addEventListener('timeupdate', handleTime);
    return () => v.removeEventListener('timeupdate', handleTime);
  }, [segment]);

  // Modal video setup + timeupdate + loop
  useEffect(() => {
    if (!enlarged || !modalVideoRef.current || !videoBlob) return;
    const url = URL.createObjectURL(videoBlob);
    const mv = modalVideoRef.current;
    mv.src = url;
    const startSec = segment.startTime / 1000;
    const endSec = segment.endTime / 1000;
    const duration = endSec - startSec;
    mv.addEventListener('loadeddata', () => {
      mv.currentTime = startSec;
      mv.play().catch(() => {});
      setModalPlaying(true);
    }, { once: true });
    const handleTime = () => {
      if (mv.currentTime >= endSec) mv.currentTime = startSec;
      if (!modalScrubbing.current && duration > 0) {
        const pct = ((mv.currentTime - startSec) / duration) * 100;
        setModalScrubValue(Math.max(0, Math.min(100, pct)));
      }
    };
    mv.addEventListener('timeupdate', handleTime);
    return () => {
      mv.removeEventListener('timeupdate', handleTime);
      URL.revokeObjectURL(url);
    };
  }, [enlarged, videoBlob, segment]);

  // Reset modal state when closed
  useEffect(() => {
    if (!enlarged) {
      setModalPlaying(false);
      setModalScrubValue(0);
    }
  }, [enlarged]);

  // ESC to close modal
  useEffect(() => {
    if (!enlarged) return;
    const onKey = (e) => { if (e.key === 'Escape') setEnlarged(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enlarged]);

  const toggle = useCallback(() => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
      setPlaying(true);
    } else {
      videoRef.current.pause();
      setPlaying(false);
    }
  }, []);

  const toggleModal = useCallback(() => {
    if (!modalVideoRef.current) return;
    if (modalVideoRef.current.paused) {
      modalVideoRef.current.play();
      setModalPlaying(true);
    } else {
      modalVideoRef.current.pause();
      setModalPlaying(false);
    }
  }, []);

  const handleScrubChange = useCallback((e) => {
    const pct = Number(e.target.value);
    setScrubValue(pct);
    if (!videoRef.current || !segment) return;
    const startSec = segment.startTime / 1000;
    const endSec = segment.endTime / 1000;
    videoRef.current.currentTime = startSec + (pct / 100) * (endSec - startSec);
  }, [segment]);

  const handleModalScrubChange = useCallback((e) => {
    const pct = Number(e.target.value);
    setModalScrubValue(pct);
    if (!modalVideoRef.current || !segment) return;
    const startSec = segment.startTime / 1000;
    const endSec = segment.endTime / 1000;
    modalVideoRef.current.currentTime = startSec + (pct / 100) * (endSec - startSec);
  }, [segment]);

  const formatMs = (ms) => {
    const s = Math.floor(ms / 1000);
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };

  const formatSec = (sec) => {
    const s = Math.floor(sec);
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };

  if (!videoBlob || !segment) return null;

  const startSec = segment.startTime / 1000;
  const endSec = segment.endTime / 1000;
  const currentSec = startSec + (scrubValue / 100) * (endSec - startSec);
  const modalCurrentSec = startSec + (modalScrubValue / 100) * (endSec - startSec);

  const scrubTrack = (pct) =>
    `linear-gradient(to right, #7c3aed ${pct}%, rgba(255,255,255,0.2) ${pct}%)`;

  return (
    <>
      <div className="svp">
        <video ref={videoRef} muted playsInline />
        <div className="svp-scrubber-wrap">
          <span className="svp-scrub-time">{formatSec(currentSec)}</span>
          <input
            className="svp-scrubber"
            type="range" min="0" max="100" step="0.1"
            value={scrubValue}
            style={{ background: scrubTrack(scrubValue) }}
            onMouseDown={() => { scrubbing.current = true; }}
            onMouseUp={() => { scrubbing.current = false; }}
            onTouchStart={() => { scrubbing.current = true; }}
            onTouchEnd={() => { scrubbing.current = false; }}
            onChange={handleScrubChange}
          />
          <span className="svp-scrub-time">{formatMs(segment.endTime)}</span>
        </div>
        <div className="svp-bar">
          <button className="svp-btn" onClick={toggle}>{playing ? '⏸' : '▶️'}</button>
          <span className="svp-time">
            {formatMs(segment.startTime)} – {formatMs(segment.endTime)}
          </span>
          <span className="svp-loop">🔁 循環播放</span>
          <button className="svp-enlarge" onClick={() => setEnlarged(true)} title="放大檢視">
            🔍 放大
          </button>
        </div>
      </div>

      {enlarged && (
        <div className="svp-modal-overlay" onClick={() => setEnlarged(false)}>
          <div className="svp-modal" onClick={e => e.stopPropagation()}>
            <video ref={modalVideoRef} muted playsInline autoPlay />
            <div className="svp-scrubber-wrap svp-modal-scrubber">
              <span className="svp-scrub-time">{formatSec(modalCurrentSec)}</span>
              <input
                className="svp-scrubber"
                type="range" min="0" max="100" step="0.1"
                value={modalScrubValue}
                style={{ background: scrubTrack(modalScrubValue) }}
                onMouseDown={() => { modalScrubbing.current = true; }}
                onMouseUp={() => { modalScrubbing.current = false; }}
                onTouchStart={() => { modalScrubbing.current = true; }}
                onTouchEnd={() => { modalScrubbing.current = false; }}
                onChange={handleModalScrubChange}
              />
              <span className="svp-scrub-time">{formatMs(segment.endTime)}</span>
            </div>
            <div className="svp-modal-bar">
              <button className="svp-btn svp-modal-playbtn" onClick={toggleModal}>
                {modalPlaying ? '⏸' : '▶️'}
              </button>
              <span className="svp-time">
                {formatMs(segment.startTime)} – {formatMs(segment.endTime)}
              </span>
              <button className="svp-modal-close" onClick={() => setEnlarged(false)}>
                ✕ 關閉 <kbd>Esc</kbd>
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .svp {
          border-radius: 14px;
          overflow: hidden;
          background: #1a1a2e;
          margin-bottom: 12px;
          position: relative;
        }
        .svp video {
          width: 100%;
          display: block;
          max-height: 200px;
          object-fit: contain;
          background: #0f172a;
        }
        .svp-scrubber-wrap {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 14px 2px;
          background: rgba(0,0,0,0.4);
        }
        .svp-scrubber {
          flex: 1;
          height: 4px;
          -webkit-appearance: none;
          appearance: none;
          border-radius: 2px;
          cursor: pointer;
          outline: none;
        }
        .svp-scrubber::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: #7c3aed;
          cursor: pointer;
          box-shadow: 0 0 4px rgba(124,58,237,0.6);
          transition: transform 0.1s;
        }
        .svp-scrubber::-webkit-slider-thumb:hover {
          transform: scale(1.3);
        }
        .svp-scrubber::-webkit-slider-runnable-track {
          height: 4px;
          border-radius: 2px;
        }
        .svp-scrub-time {
          font-family: monospace;
          font-size: 11px;
          color: #94a3b8;
          min-width: 38px;
          text-align: center;
        }
        .svp-bar {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 14px;
          background: rgba(0,0,0,0.3);
          color: #cbd5e1;
          font-size: 12px;
        }
        .svp-btn {
          background: none;
          border: none;
          font-size: 18px;
          cursor: pointer;
          padding: 2px 6px;
        }
        .svp-time { font-family: monospace; font-size: 14px; }
        .svp-loop { font-size: 13px; opacity: 0.6; }
        .svp-enlarge {
          margin-left: auto;
          background: rgba(255,255,255,0.1);
          border: 1px solid rgba(255,255,255,0.2);
          color: #e2e8f0;
          padding: 6px 14px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 14px;
          font-family: var(--font-family);
          transition: background 0.15s;
        }
        .svp-enlarge:hover { background: rgba(255,255,255,0.2); }

        .svp-modal-overlay {
          position: fixed;
          inset: 0;
          z-index: 9999;
          background: rgba(0,0,0,0.85);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
        }
        .svp-modal {
          width: 95vw;
          max-width: 1400px;
          border-radius: 12px;
          overflow: hidden;
          background: #000;
          box-shadow: 0 24px 80px rgba(0,0,0,0.5);
        }
        .svp-modal video {
          width: 100%;
          display: block;
          max-height: 75vh;
          object-fit: contain;
          background: #000;
        }
        .svp-modal-scrubber {
          background: rgba(0,0,0,0.6) !important;
          padding: 8px 20px 4px !important;
        }
        .svp-modal-bar {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 20px;
          background: #1e293b;
          color: #cbd5e1;
        }
        .svp-modal-playbtn {
          font-size: 22px;
          color: #e2e8f0;
        }
        .svp-modal-close {
          margin-left: auto;
          background: rgba(255,255,255,0.1);
          border: 1px solid rgba(255,255,255,0.2);
          color: #e2e8f0;
          padding: 8px 18px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 14px;
          font-family: var(--font-family);
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .svp-modal-close:hover { background: rgba(255,255,255,0.2); }
        .svp-modal-close kbd {
          padding: 2px 6px;
          background: rgba(255,255,255,0.15);
          border-radius: 4px;
          font-size: 12px;
          font-family: monospace;
        }
      `}</style>
    </>
  );
}
