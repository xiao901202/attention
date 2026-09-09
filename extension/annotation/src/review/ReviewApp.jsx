import React, { useEffect, useRef, useState } from 'react';
import { INSTRUMENT, instrumentSnapshot } from './instrument';
import { completeSegment, createReview, emptyDraft, exportReview, withAnswer } from './model';
import { loadSource } from './source';
import { getAllAnnotations, getAllReviewSessions, getAllSessions, getRecording, getReviewSession } from '../store';
import ReviewMedia from './ReviewMedia';
import useReviewSession from './useReviewSession';
import { CheckPanel, GatePanel, House, QuestionPanel } from './ReviewPanels';

const SAVE_LABELS = { idle: '尚未開始', saving: '儲存中…', saved: '已儲存在本機', error: '尚未儲存成功' };
function download(name, value) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function ReviewApp() {
  const { session, initialize, update, saveState, saveError, retry, commitPending, latest } = useReviewSession();
  const [source, setSource] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [history, setHistory] = useState(null);
  const [historyError, setHistoryError] = useState('');
  const [historyLoading, setHistoryLoading] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(() => { try { return localStorage.getItem('review-reduce-motion') === 'true'; } catch { return false; } });
  const heading = useRef(null);
  const retryButton = useRef(null);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const input = await loadSource();
        if (cancelled) return;
        setSource(input);
        if (input) {
          const instrument = await instrumentSnapshot();
          const created = createReview(input, instrument);
          const saved = await getReviewSession(input.resumeSessionId || created.session_id);
          if (saved && (saved.schema_version !== 2 || saved.instrument?.sha256 !== instrument.sha256)) throw new Error('這筆草稿的題本版本不同，請保留備份並以對應版本開啟。');
          if (!cancelled) initialize(saved || created, !!saved);
        }
      } catch (error) { if (!cancelled) setLoadError(error.message || '載入失敗，請重試。'); }
      finally { if (!cancelled) setLoading(false); }
    }
    init(); return () => { cancelled = true; };
  }, [initialize]);

  const cursor = session?.cursor;
  const segmentIndex = session?.candidates[cursor.segment];
  const draft = session?.drafts[segmentIndex] || emptyDraft();
  const annotations = Object.values(session?.annotations || {});
  const answered = annotations.filter(a => a.outcome === 'answered').length;
  const skipped = annotations.filter(a => a.outcome === 'skipped').length;
  const completed = answered + skipped;
  const isWorking = ['gate', 'question', 'check'].includes(cursor?.stage);
  const safeToLeave = saveState === 'saved';

  useEffect(() => {
    const target = heading.current;
    target?.focus({ preventScroll: true });
    const rect = target?.getBoundingClientRect();
    if (rect && (rect.top < 0 || rect.bottom > innerHeight)) target.scrollIntoView({ block: 'start', behavior: 'auto' });
  }, [cursor?.stage, cursor?.segment, cursor?.item, !!history]);
  useEffect(() => {
    if (saveState !== 'error') return;
    retryButton.current?.focus({ preventScroll: true });
    retryButton.current?.scrollIntoView({ block: 'nearest', behavior: 'auto' });
  }, [saveState]);
  function navigate(stage, itemIndex = cursor.item) { update(s => ({ ...s, cursor: { ...s.cursor, stage, item: itemIndex } })); }
  function changeDraft(transform) { update(s => ({ ...s, drafts: { ...s.drafts, [segmentIndex]: transform(s.drafts[segmentIndex] || emptyDraft()) } })); }
  function mediaEvent(event) { if (isWorking) changeDraft(d => ({ ...d, media_events: [...d.media_events, event] })); }
  function pause() { update(s => ({ ...s, resume_cursor: s.cursor, cursor: { ...s.cursor, stage: 'paused' } })); }
  function proceedGate() {
    if (draft.activity === 'reading' && draft.recall === 'yes') navigate('question', 0);
    else update(s => completeSegment(s, 'skipped', draft.activity === 'reading' ? draft.recall === 'no' ? 'cannot_recall' : 'prefer_not_to_answer' : draft.activity), { waitForSave: true });
  }
  async function showHistory() {
    setHistoryLoading(true); setHistoryError('');
    try {
      const [reviews, legacy] = await Promise.all([getAllReviewSessions(), getAllSessions()]);
      setHistory({ reviews: reviews.sort((a, b) => b.updated_at.localeCompare(a.updated_at)), legacyCount: legacy.length });
    } catch (error) { setHistoryError(error.message); }
    finally { setHistoryLoading(false); }
  }
  function exportCurrent() { download(`review_${source.demo ? 'demo_' : ''}${new Date().toISOString().slice(0, 10)}.json`, { ...exportReview(latest()), local_save_state: saveState }); }
  async function resumeReview(record) {
    setHistoryLoading(true); setHistoryError('');
    try {
      const instrument = await instrumentSnapshot();
      // Re-read so a history list cannot restore a stale revision from another tab.
      const saved = await getReviewSession(record.session_id);
      if (saved?.instrument.sha256 !== instrument.sha256) throw new Error('請用對應題本版本開啟這筆紀錄；目前仍可下載備份。');
      const demo = saved.collection_mode === 'interface_demo';
      const recording = demo ? null : await getRecording(saved.recording_id);
      setSource({ ...saved, demo, recordingId: saved.recording_id, videoBlob: recording?.videoBlob || null });
      const url = new URL(location.href); url.searchParams.delete('demo'); url.searchParams.set('review', saved.session_id);
      window.history.replaceState({}, '', url);
      initialize(saved, true); setHistory(null);
    } catch (error) { setHistoryError(error.message); }
    finally { setHistoryLoading(false); }
  }
  const title = text => <h1 ref={heading} tabIndex={-1} className="panel-title">{text}</h1>;

  return <div className={`review-app ${reduceMotion ? 'reduce-motion' : ''}`}>
    <a className="skip-link" href="#review-main">跳至主要內容</a>
    <header className="review-header"><div className="brand"><span className="brand-mark" aria-hidden="true">↶</span><div><strong>片刻回顧</strong><span>回到內容，記下當時的經驗</span></div></div>
      <div className="header-actions"><label className="motion-toggle"><input type="checkbox" checked={reduceMotion} onChange={e => { setReduceMotion(e.target.checked); try { localStorage.setItem('review-reduce-motion', String(e.target.checked)); } catch {} }}/><span>減少動畫</span></label>
        <button className="text-button" onClick={showHistory} disabled={historyLoading || saveState === 'saving' || saveState === 'error'}>{historyLoading ? '載入紀錄…' : '本機紀錄'}</button></div>
    </header>
    <div className="review-context"><span className="draft-badge">{source?.demo ? '操作示例' : '題本審閱版'}</span><span>固定題目草案，尚待研究審查</span>
      {session && <span className={`save-indicator ${saveState}`} role="status" aria-live="polite"><span aria-hidden="true">{saveState === 'saved' ? '✓' : saveState === 'error' ? '!' : '·'}</span> {SAVE_LABELS[saveState]}</span>}
    </div>
    {saveState === 'error' && <div className="save-error" role="alert"><div><strong>這次變更還沒有儲存成功。</strong><p>{saveError} 請先留在此頁。</p></div><button ref={retryButton} className="button secondary" onClick={retry}>重試儲存</button><button className="text-button" onClick={exportCurrent}>下載目前草稿</button></div>}
    {historyError && <div className="inline-error" role="alert">{historyError}</div>}
    <main id="review-main" tabIndex={-1}>
      {loading ? <section className="standalone-panel"><div className="loading-mark" aria-hidden="true"/>{title('正在載入本機資料')}<p role="status">準備錄製片段與固定題本…</p></section>
      : loadError && !history ? <section className="standalone-panel">{title('暫時無法載入')}<p role="alert">{loadError}</p><div className="action-row"><button className="button primary" onClick={() => location.reload()}>重新載入</button><button className="button secondary" onClick={() => { location.search = ''; }}>返回最新錄製資料</button></div></section>
      : history ? <section className="standalone-panel history-panel"><div className="eyebrow">這台裝置上的紀錄</div>{title('本機回顧紀錄')}<p>保留原始答案與題本版本。示例及審閱資料分別標示。</p>
        {!history.reviews.length && <p className="empty-history">目前還沒有新版回顧紀錄。</p>}
        <div className="history-list">{history.reviews.map(s => <article key={s.session_id}><div><strong>{s.collection_mode === 'interface_demo' ? '操作示例' : '題本審閱'}</strong><p>{new Date(s.updated_at).toLocaleString('zh-TW')} · {Object.keys(s.annotations).length} / {s.candidates.length} 段<br/>題本 {s.instrument.version}{s.instrument.version !== INSTRUMENT.version ? ' · 舊版答案保留，可下載原始紀錄' : ''}</p></div><div className="history-actions"><button className="text-button" disabled={historyLoading || s.instrument.version !== INSTRUMENT.version} onClick={() => resumeReview(s)}>{s.instrument.version === INSTRUMENT.version ? '開啟紀錄' : '舊版題本'}</button><button className="button secondary" onClick={() => download(`review_${s.instrument.version}_${s.updated_at.slice(0, 10)}.json`, exportReview(s))}>下載紀錄</button></div></article>)}</div>
        {history.legacyCount > 0 && <div className="legacy-note"><p>另有 {history.legacyCount} 筆舊版紀錄，原資料已保留。</p><button className="text-button" onClick={async () => { try { const [sessions, annotations] = await Promise.all([getAllSessions(), getAllAnnotations()]); download('legacy_annotation_backup.json', { kind: 'legacy-backup', sessions, annotations }); } catch (e) { setHistoryError(e.message); } }}>下載舊版備份</button></div>}
        <button className="button primary" onClick={() => setHistory(null)}>返回回顧</button>
      </section>
      : !session ? <section className="standalone-panel welcome-panel"><span className="eyebrow">從一段內容開始</span>{title('讓當時的經驗，有跡可循。')}<p>錄製結束後，回到原片段，依序記下你的經驗。你也可以先用示例熟悉這個流程。</p>
        <div className="welcome-steps"><div><b>01</b><strong>確認原片段</strong><span>找到當時看到的內容</span></div><div><b>02</b><strong>記下經驗</strong><span>依自己的情況回答</span></div><div><b>03</b><strong>檢查與保存</strong><span>可返回修改、稍後接續</span></div></div>
        <button className="button primary" onClick={() => { location.search = '?demo=1'; }}>先試用操作示例 <span aria-hidden="true">→</span></button><p className="caption">目前沒有可載入的錄製資料。</p>
      </section>
      : cursor.stage === 'intro' ? <section className="standalone-panel welcome-panel"><span className="eyebrow">準備開始</span>{title(source.demo ? '先用示例，熟悉回顧流程。' : '回看片段，記下當時的經驗。')}
        <p>本次有 <strong>{session.candidates.length} 段</strong>待確認內容。每段先確認當時的活動，再回答 8 題固定草案；沒有標準答案，也不限作答時間。</p>
        <div className="welcome-steps"><div><b>01</b><strong>先確認</strong><span>看原片段，回想當時</span></div><div><b>02</b><strong>再回答</strong><span>選好後按「下一題」</span></div><div><b>03</b><strong>可更正</strong><span>返回改答，或暫存休息</span></div></div>
        <div className="instruction-note"><strong>不確定時，可以如實保留。</strong><p>無法回想、不適用或不想回答都有獨立選項。選取後不會自動跳題；答案會保存在這台裝置。</p></div>
        {source.demo && <p className="caption">此示例使用虛構內容，結果標記為示例，不是研究資料。</p>}
        <div className="action-row"><button className="button primary" onClick={() => navigate(session.candidates.length ? 'gate' : 'done', 0)}>{session.candidates.length ? '開始確認第一段' : '查看本次紀錄'} <span aria-hidden="true">→</span></button></div>
      </section>
      : cursor.stage === 'paused' ? <section className="standalone-panel completion-panel"><House/>{title('先休息一下。')}<p>{safeToLeave ? '目前進度已保存在本機。重新開啟這次錄製資料後，可以從這裡接續。' : '正在保存目前進度，完成後再離開。'}</p><button className="button primary" disabled={!safeToLeave} onClick={() => update(s => ({ ...s, cursor: s.resume_cursor }))}>繼續回顧</button></section>
      : cursor.stage === 'done' ? <section className="standalone-panel completion-panel"><span className="eyebrow">本次回顧</span>
        {title(safeToLeave ? '本次回顧已完成。' : '正在保存本次回顧。')}
        <p>{!session.candidates.length ? '這次沒有符合目前候選規則的片段。原始紀錄仍可下載；這不代表沒有閱讀。' : '所有片段都已處理。你可以查看或下載這次的紀錄。'}</p>
        <div className="completion-stats"><div><strong>{answered}</strong><span>已回答片段</span></div><div><strong>{skipped}</strong><span>已略過片段</span></div><div><strong>{Math.max(0, session.candidates.length - completed)}</strong><span>尚待回顧</span></div></div>
        <div className="action-row centered"><button className="button secondary" disabled={!safeToLeave} onClick={showHistory}>查看本機紀錄</button><button className="button primary" disabled={!safeToLeave} onClick={exportCurrent}>下載本次紀錄</button></div>
        <p className="caption">{SAVE_LABELS[saveState]} · {source.demo ? '操作示例' : '審閱草案資料'}，不計算舊版象限分數</p>
      </section>
      : <div className="workspace-shell">
        <div className="workspace-top"><div><span className="eyebrow">本次回顧</span><h2>第 {cursor.segment + 1} 段 <span>/ {session.candidates.length} 段</span></h2></div><div className="session-progress"><span>{completed} / {session.candidates.length} 段已記錄</span><progress aria-label="本次片段進度" value={completed} max={session.candidates.length}/></div><button className="text-button" disabled={commitPending} onClick={pause}>暫存並休息</button></div>
        <div className="review-workspace">
          <ReviewMedia source={source} segment={session.segments[segmentIndex]} segmentNumber={cursor.segment + 1} onEvent={mediaEvent} disabled={commitPending} pauseKey={`${cursor.stage}:${cursor.item}:${commitPending}`}/>
          <section className="question-panel" aria-label="片段作答" aria-busy={commitPending && saveState === 'saving'}><fieldset className="panel-content panel-lock" disabled={commitPending} key={`${cursor.stage}:${cursor.item}`}>
            {cursor.stage === 'gate' ? <GatePanel title={title} draft={draft} changeDraft={changeDraft} proceed={proceedGate}/>
            : cursor.stage === 'question' ? <QuestionPanel title={title} itemIndex={cursor.item} draft={draft} setAnswer={(id, value, missing) => changeDraft(d => withAnswer(d, id, value, missing))} navigate={navigate}/>
            : <CheckPanel title={title} draft={draft} navigate={navigate} submit={() => update(s => completeSegment(s, 'answered'), { waitForSave: true })}/>}
          </fieldset>{commitPending && <p className="commit-status" role="status">{saveState === 'error' ? '本段尚未儲存成功。請使用上方「重試儲存」接續。' : '正在儲存本段，完成後會自動接續。'}</p>}</section>
        </div>
      </div>}
    </main>
    <footer className="review-footer"><span>依自己的經驗回答，隨時可以暫停。</span><span>題本 {INSTRUMENT.version} · 資料保存在本機</span></footer>
  </div>;
}
