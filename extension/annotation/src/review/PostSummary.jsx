import React from 'react';

const seconds = ms => `${((ms || 0) / 1000).toFixed(1)} 秒`;
const percent = (part, whole) => (whole > 0 ? `${Math.round(100 * part / whole)}%` : '—');

export default function PostSummary({ data }) {
  // Schema 2 and 3 only redefined what the mouse counters cover and what a
  // permalink id contains; the shape this panel reads is unchanged.
  if (!data || ![1, 2, 3].includes(data.schema_version)) return null;
  // Schema 1 counted mouse activity only while the cursor was over the post, so
  // its numbers are not comparable with later records and the inside columns do
  // not exist at all. Say so rather than showing blanks that look like zeroes.
  const attributesOffPost = data.schema_version >= 2;
  const rows = Object.values(data.posts).map((post, i) => {
    const encounters = data.encounters.filter(e => e.post_id === post.id);
    const links = data.link_events.filter(e => e.post_id === post.id);
    const sum = key => encounters.reduce((total, e) => total + (e[key] || 0), 0);
    return { post, number: i + 1, encounters, links,
      dwell: sum('dwell_ms'), moves: sum('mouse_moves'), movesInside: sum('mouse_moves_inside'),
      clicks: sum('clicks'), wheel: sum('wheel_events'),
      distance: sum('mouse_distance_px'), distanceInside: sum('mouse_distance_px_inside'),
      movementTime: sum('movement_time_ms') };
  }).sort((a, b) => b.dwell - a.dwell);

  const totalDwell = rows.reduce((n, r) => n + r.dwell, 0);
  const totalMovement = rows.reduce((n, r) => n + r.movementTime, 0);
  const withoutMovement = rows.filter(r => r.moves === 0);

  return <>{!data.encounters.length && <div className="instruction-note" role="alert">
    <strong>這次沒有收集到逐貼文資料。</strong>
    <p>若這次有瀏覽 Facebook 貼文，請先保留下載檔並檢查收集功能；本次紀錄不能用來分析貼文停留或貼文內滑鼠活動。資料已儲存不代表收集完整，也不代表沒有閱讀。</p>
  </div>}<details className="post-summary">
    <summary>本次貼文接觸紀錄 · {rows.length} 則</summary>
    <p>記錄前景畫面中主要可見的 Facebook 貼文，不代表已閱讀或理解。外站時間另計；未辨識的時間保留。</p>
    <p>貼文 {seconds(data.post_dwell_ms)} · 已連結外站 {seconds(data.linked_external_ms)} · 其他／未歸屬 {seconds(data.unattributed_ms)}</p>

    <div className="post-summary-stats">
      <div><strong>{seconds(totalMovement)}</strong><span>滑鼠實際移動的時間<br/>（佔接觸時間 {percent(totalMovement, totalDwell)}）</span></div>
      <div><strong>{withoutMovement.length}</strong><span>完全沒有滑鼠移動的貼文<br/>（其中 {withoutMovement.filter(r => r.wheel > 0).length} 則仍有滾輪）</span></div>
    </div>

    <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', textAlign: 'left', borderSpacing: '12px' }}>
      <caption>各則貼文的累計接觸與操作，依接觸時間排序</caption>
      <thead><tr>
        <th scope="col">貼文</th>
        <th scope="col">接觸時間／次數</th>
        <th scope="col">滾輪</th>
        <th scope="col">移動{attributesOffPost && <><br/><small>（在貼文上）</small></>}</th>
        <th scope="col">移動距離{attributesOffPost && <><br/><small>（在貼文上）</small></>}</th>
        <th scope="col">點擊</th>
        <th scope="col">外部連結</th>
      </tr></thead>
      <tbody>{rows.map(r => <tr key={r.post.id}>
        <th scope="row">{r.post.permalink
          ? <a href={r.post.permalink} target="_blank" rel="noreferrer">貼文 {r.number}</a>
          : `貼文 ${r.number}（暫時識別）`}</th>
        <td>{seconds(r.dwell)}／{r.encounters.length} 次</td>
        <td>{r.wheel}</td>
        <td>{r.moves}{attributesOffPost && <small>（{r.movesInside}）</small>}</td>
        <td>{Math.round(r.distance)} px{attributesOffPost && <small>（{Math.round(r.distanceInside)}）</small>}</td>
        <td>{r.clicks}</td>
        <td>{r.links.length} 次點擊，{r.links.filter(l => l.status === 'navigation_confirmed').length} 次確認開啟</td>
      </tr>)}</tbody>
    </table></div>

    {attributesOffPost
      ? <p className="caption">滑鼠活動歸屬於當下主要可見的貼文，游標不在該貼文上時一樣記錄；括號內是實際發生在貼文範圍內的部分。停留時間是貼文在畫面上的時間，不是視線停留的時間。</p>
      : <p className="caption">這是舊版紀錄（schema {data.schema_version}），當時只在游標位於貼文上時才記錄滑鼠活動，數字與新版紀錄不可直接比較。</p>}
    <p className="caption">移動以約 100 毫秒取樣；完整時間段、座標、滾輪及外站紀錄包含在下載檔。暫時識別無法保證跨頁重認。</p>
    {data.dropped_mouse_samples > 0 && <p role="status">滑鼠原始樣本已達上限，另有 {data.dropped_mouse_samples} 筆未保存；累計特徵仍持續更新。</p>}
  </details></>;
}
