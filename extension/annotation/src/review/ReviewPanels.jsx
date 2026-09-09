import React from 'react';
import { INSTRUMENT, MISSING_REASONS } from './instrument';
import { canSubmit, isAnswer } from './model';

export const ACTIVITY = { reading: '有閱讀這則內容', browsing: '主要在滑動或找內容', other: '在做其他事情', wrong_segment: '片段有誤／不是這則內容' };
export const RECALL = { yes: '能回想當時的情況', no: '無法回想', prefer_not_to_answer: '這一段不想回答' };

export function House() {
  return <svg className="completion-house" viewBox="0 0 180 130" aria-hidden="true">
    <path d="M15 116h150" stroke="#cbd5e1" strokeWidth="3" strokeLinecap="round"/>
    <path d="M49 58h82v58H49z" fill="#eef2ff" stroke="#4f46e5" strokeWidth="2"/>
    <path d="M37 60 90 17l53 43" fill="none" stroke="#4f46e5" strokeWidth="6" strokeLinejoin="round" strokeLinecap="round"/>
    <path d="M105 27V16h13v23" fill="#c7d2fe"/><rect x="83" y="82" width="20" height="34" rx="3" fill="#4f46e5"/>
    <rect x="60" y="73" width="14" height="17" rx="2" fill="#fff" stroke="#818cf8" strokeWidth="2"/>
    <rect x="111" y="73" width="12" height="17" rx="2" fill="#fff" stroke="#818cf8" strokeWidth="2"/>
    <circle cx="148" cy="41" r="12" fill="#f1d79d"/>
  </svg>;
}

function Choices({ legend, options, value, onChange, name }) {
  return <fieldset className="choice-field"><legend>{legend}</legend><div className="choice-list">
    {Object.entries(options).map(([key, label]) => <label key={key} className={`choice-row ${value === key ? 'selected' : ''}`}>
      <input type="radio" name={name} value={key} checked={value === key} onChange={() => onChange(key)}/><span>{label}</span>
    </label>)}
  </div></fieldset>;
}

export function answerText(item, answer) {
  if (!answer) return '尚未回答';
  if (answer.value === null) return MISSING_REASONS[answer.missing_reason];
  return `${answer.value} / 7${answer.value === 1 ? ` · ${item.low}` : answer.value === 7 ? ` · ${item.high}` : ''}`;
}

export function GatePanel({ title, draft, changeDraft, proceed }) {
  return <><div className="eyebrow">先確認這一段</div>{title('當時，你正在做什麼？')}<p className="panel-description">請依原瀏覽時的情況選擇。片段抓錯或想不起來，也可以直接記錄。</p>
    <Choices legend="當時的主要活動" options={ACTIVITY} name="activity" value={draft.activity} onChange={activity => changeDraft(d => ({ ...d, activity }))}/>
    {draft.activity === 'reading' && <Choices legend="現在能否回想當時的情況？" options={RECALL} name="recall" value={draft.recall} onChange={recall => changeDraft(d => ({ ...d, recall }))}/>}
    <div className="panel-actions"><button className="button primary" disabled={!draft.activity || (draft.activity === 'reading' && !draft.recall)} onClick={proceed}>{draft.activity === 'reading' && draft.recall === 'yes' ? '開始回答' : draft.activity ? '記錄並略過這段' : '繼續'} <span aria-hidden="true">→</span></button></div>
  </>;
}

export function QuestionPanel({ title, itemIndex, draft, setAnswer, navigate }) {
  const item = INSTRUMENT.items[itemIndex];
  const answer = draft.answers[item.id];
  return <><div className="question-step"><span className="eyebrow">{itemIndex < 4 ? '原先的了解程度' : '當次瀏覽的經驗'}</span><span>第 {itemIndex + 1} / {INSTRUMENT.items.length} 題</span></div>
    <progress className="item-progress" aria-label="本段題目位置" value={itemIndex + 1} max={INSTRUMENT.items.length}/>
    <div className="reference-prompt">{itemIndex < 4 ? INSTRUMENT.x_prompt : INSTRUMENT.y_prompt}</div>
    {title(item.text)}
    <fieldset className="rating-field"><legend className="sr-only">{item.low}至{item.high}，七點量尺</legend>
      <div className="scale-endpoints"><span>1 · {item.low}</span><span>7 · {item.high}</span></div>
      <div className="rating-options">{Array.from({ length: 7 }, (_, i) => i + 1).map(value => <label key={value} className={`rating-option ${answer?.value === value ? 'selected' : ''}`}><input type="radio" name={`answer-${item.id}`} checked={answer?.value === value} onChange={() => setAnswer(item.id, value)} aria-label={`${value}${value === 1 ? `，${item.low}` : value === 7 ? `，${item.high}` : ''}`}/><span>{value}</span><span className="rating-dot" aria-hidden="true"/></label>)}</div>
    </fieldset>
    <p className="selection-summary" role="status">{answer ? `已選：${answerText(item, answer)}` : '請選擇最符合的程度。選取後不會自動前進。'}</p>
    <fieldset className="missing-field"><legend>如果無法評分</legend><div className="missing-options">{Object.entries(MISSING_REASONS).map(([key, label]) => <label key={key} className={answer?.missing_reason === key ? 'selected' : ''}><input type="radio" name={`answer-${item.id}`} checked={answer?.missing_reason === key} onChange={() => setAnswer(item.id, null, key)}/><span>{label}</span></label>)}</div></fieldset>
    <div className="panel-actions"><button className="button secondary" onClick={() => navigate(itemIndex === 0 ? 'gate' : 'question', Math.max(0, itemIndex - 1))}>上一題</button><button className="button primary" disabled={!isAnswer(answer)} onClick={() => navigate(itemIndex === 7 ? 'check' : 'question', Math.min(7, itemIndex + 1))}>{itemIndex === 7 ? '檢查本段答案' : '下一題'} <span aria-hidden="true">→</span></button></div>
  </>;
}

export function CheckPanel({ title, draft, navigate, submit }) {
  return <><div className="eyebrow">最後確認</div>{title('這些回答符合你的經驗嗎？')}<p className="panel-description">可以逐題修改。確認並儲存成功後，會直接接續下一段；最後一段則顯示本次紀錄。</p>
    <div className="check-list">{INSTRUMENT.items.map((item, i) => <div className="check-item" key={item.id}><div><span className="check-label">第 {i + 1} 題 · {i < 4 ? `${item.low} → ${item.high}` : '當次瀏覽'}</span><p>{item.text}</p><strong>{answerText(item, draft.answers[item.id])}</strong></div><button className="text-button" aria-label={`修改第 ${i + 1} 題`} onClick={() => navigate('question', i)}>修改</button></div>)}</div>
    <div className="panel-actions"><button className="button secondary" onClick={() => navigate('question', 7)}>返回作答</button><button className="button primary" disabled={!canSubmit(draft)} onClick={submit}>確認並保存這段</button></div>
  </>;
}
