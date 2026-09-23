import React, { useState } from 'react';

// Shown once, the first time someone opens the review page. It teaches the
// mechanics only: how to start a recording, how the answering works, and how to
// hand the file over. It deliberately gives no example answers and no reading of
// what a high or low rating would mean, because anything like that would prime
// the self-report this study exists to collect.
//
// Every animation here is decorative. The guide reads the same with motion off,
// and the .reduce-motion class plus prefers-reduced-motion stop all of it.
export const GUIDE_VERSION = 'guide-20260922.1';

function RecordArt() {
  return <svg className="guide-art" viewBox="0 0 220 132" role="img" aria-label="瀏覽器視窗中的頁面向上捲動，工具列上的錄製標記持續閃爍">
    <rect x="8" y="10" width="204" height="112" rx="10" fill="#fff" stroke="#cbd5e1"/>
    <rect x="8" y="10" width="204" height="22" rx="10" fill="#f1f5f9"/>
    <rect x="8" y="24" width="204" height="8" fill="#f1f5f9"/>
    <circle cx="22" cy="21" r="3.2" fill="#cbd5e1"/><circle cx="33" cy="21" r="3.2" fill="#cbd5e1"/>
    <g className="guide-rec"><circle cx="188" cy="21" r="5" fill="#ef4444"/><rect x="176" y="16" width="26" height="10" rx="5" fill="#ef4444" opacity=".18"/></g>
    <clipPath id="guide-viewport"><rect x="16" y="38" width="188" height="78" rx="6"/></clipPath>
    <g clipPath="url(#guide-viewport)"><g className="guide-feed">
      {[0, 1, 2, 3].map(i => <g key={i} transform={`translate(0 ${i * 52})`}>
        <rect x="58" y="40" width="104" height="44" rx="5" fill="#eef2ff" stroke="#c7d2fe"/>
        <rect x="66" y="47" width="42" height="5" rx="2.5" fill="#a5b4fc"/>
        <rect x="66" y="58" width="88" height="4" rx="2" fill="#dbe2f5"/>
        <rect x="66" y="66" width="70" height="4" rx="2" fill="#dbe2f5"/>
      </g>)}
    </g></g>
    <rect x="16" y="38" width="38" height="78" rx="6" fill="#f8fafc" stroke="#e2e8f0"/>
    <rect x="166" y="38" width="38" height="78" rx="6" fill="#f8fafc" stroke="#e2e8f0"/>
  </svg>;
}

function AnswerArt() {
  return <svg className="guide-art" viewBox="0 0 220 132" role="img" aria-label="一題五點量尺，選項依序被點亮">
    <rect x="8" y="10" width="204" height="112" rx="10" fill="#fff" stroke="#cbd5e1"/>
    <rect x="24" y="26" width="120" height="6" rx="3" fill="#cbd5e1"/>
    <rect x="24" y="40" width="86" height="5" rx="2.5" fill="#e2e8f0"/>
    <text x="24" y="66" fontSize="9" fill="#64748b">1</text>
    <text x="188" y="66" fontSize="9" fill="#64748b" textAnchor="end">5</text>
    {[0, 1, 2, 3, 4].map(i => <g key={i} className="guide-option" style={{ '--i': i }}>
      <rect x={24 + i * 34} y={72} width={28} height={28} rx="7" fill="#fff" stroke="#94a3b8"/>
      <circle cx={38 + i * 34} cy={86} r="4.5" fill="#cbd5e1"/>
    </g>)}
    <rect x="24" y="108" width="74" height="7" rx="3.5" fill="#eef2ff" stroke="#c7d2fe"/>
    <text x="30" y="114.5" fontSize="6" fill="#4f46e5">無法回想</text>
  </svg>;
}

function ExportArt() {
  return <svg className="guide-art" viewBox="0 0 220 132" role="img" aria-label="一份紀錄檔案存到這台電腦">
    <rect x="8" y="10" width="204" height="112" rx="10" fill="#fff" stroke="#cbd5e1"/>
    <g className="guide-file">
      <rect x="86" y="26" width="48" height="58" rx="6" fill="#eef2ff" stroke="#818cf8"/>
      <rect x="95" y="38" width="30" height="4" rx="2" fill="#a5b4fc"/>
      <rect x="95" y="48" width="24" height="4" rx="2" fill="#c7d2fe"/>
      <rect x="95" y="58" width="28" height="4" rx="2" fill="#c7d2fe"/>
      <path d="M110 68v10m0 0-5-5m5 5 5-5" stroke="#4f46e5" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
    </g>
    <path d="M74 98h72" stroke="#cbd5e1" strokeWidth="2.5" strokeLinecap="round"/>
    <path d="M74 98v8a4 4 0 0 0 4 4h64a4 4 0 0 0 4-4v-8" fill="none" stroke="#cbd5e1" strokeWidth="2.5"/>
    <text x="110" y="122" fontSize="8" fill="#64748b" textAnchor="middle">存在這台電腦</text>
  </svg>;
}

const STEPS = [
  { key: 'record', label: '錄製', art: RecordArt, title: '先錄一段平常的瀏覽。',
    points: [
      ['從擴充功能圖示按「開始錄製」。', '瀏覽器會問要分享哪個畫面，選「整個螢幕畫面」再按「分享」——這是瀏覽器的安全機制，每次都會問。'],
      ['接著就照你平常的方式瀏覽。', '不用刻意慢慢滑，也不用把滑鼠移到貼文上；平常怎麼看就怎麼看。'],
      ['錄製中，擴充功能圖示會顯示紅色 REC。', '要結束時回到錄製頁按「停止」，就會自動跳到這個回顧頁。'],
    ] },
  { key: 'answer', label: '標註作答', art: AnswerArt, title: '回看片段，記下當時的經驗。',
    points: [
      ['每段先確認當時在做什麼，再回答固定的題目。', '題目每次都一樣，不會因為貼文內容而改變。'],
      ['答案是 1 到 5 的量尺，兩端各有文字說明。', '沒有標準答案，也不限作答時間。選了不會自動跳到下一題，可以改。'],
      ['想不起來就選「無法回想」。', '「不適用」「不想回答」也各有獨立選項。這些不會被當成低分，空白比猜測有用。'],
    ] },
  { key: 'export', label: '匯出', art: ExportArt, title: '完成後把紀錄交出來。',
    points: [
      ['全部片段處理完，在完成頁按「下載本次紀錄」。', '中途想休息可以先暫存，之後回到這頁接續。'],
      ['檔案會存在這台電腦，再交給研究者。', '沒有自動上傳，也不會傳到任何伺服器。'],
      ['這個檔案不包含錄影畫面。', '裡面是你的答案和每段的時間資訊。'],
    ] },
];

export default function FirstRunGuide({ onDone, onSkip }) {
  const [index, setIndex] = useState(0);
  const step = STEPS[index];
  const last = index === STEPS.length - 1;
  const Art = step.art;
  return <section className="standalone-panel guide-panel" aria-labelledby="guide-heading">
    <div className="guide-track" aria-label={`共 ${STEPS.length} 步，目前第 ${index + 1} 步`}>
      {STEPS.map((s, i) => <button key={s.key} type="button"
        className={`guide-tab ${i === index ? 'current' : ''} ${i < index ? 'done' : ''}`}
        aria-current={i === index ? 'step' : undefined} onClick={() => setIndex(i)}>
        <span>{String(i + 1).padStart(2, '0')}</span>{s.label}
      </button>)}
    </div>
    <div className="guide-body" key={step.key}>
      <Art/>
      <div>
        <span className="eyebrow">第一次使用</span>
        <h1 id="guide-heading">{step.title}</h1>
        <ul className="guide-points">{step.points.map(([lead, detail]) => <li key={lead}>
          <strong>{lead}</strong><span>{detail}</span>
        </li>)}</ul>
      </div>
    </div>
    <div className="panel-actions">
      <button className="text-button" onClick={onSkip}>略過教學</button>
      <div className="guide-next">
        {index > 0 && <button className="button secondary" onClick={() => setIndex(index - 1)}>上一步</button>}
        <button className="button primary" onClick={() => (last ? onDone() : setIndex(index + 1))}>
          {last ? '開始回顧' : '下一步'} <span aria-hidden="true">→</span>
        </button>
      </div>
    </div>
  </section>;
}
