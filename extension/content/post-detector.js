/* Facebook DOM adapters are heuristic. No post text or image is collected.
 * A post's permalink names its author's account, so the analysis identifier is a
 * salted fingerprint computed here, before the URL leaves the page. The raw
 * permalink is kept only so the person reviewing can reopen their own post; the
 * export strips it. */
(() => {
  if (!/(^|\.)facebook\.com$/.test(location.hostname)) return;
  // Non-sensitive DOM build marker for verifying a refreshed content script.
  document.documentElement.setAttribute('data-attention-post-detector', '2');
  document.documentElement.setAttribute('data-attention-post-diagnostics', '1');
  document.documentElement.setAttribute('data-attention-post-identity', '1');
  const documentId = crypto.randomUUID();
  const roots = '[role="feed"] [role="article"], [data-pagelet^="FeedUnit"], [role="main"] [role="article"], [role="main"] [data-virtualized]';
  const profileSelector = '[data-ad-rendering-role="profile_name"]';
  const messageSelector = '[data-ad-rendering-role="story_message"]';
  const actionSelector = '[data-ad-rendering-role="like_button"], [data-ad-rendering-role="comment_button"]';
  const identities = new WeakMap(); let nextId = 0, recordingId = null, current = null;
  // Ephemeral comparison only: never export author/body text or these hints.
  const textToggles = new WeakMap();
  function comparableBody(root) {
    const body = root.querySelector(messageSelector)?.cloneNode(true);
    if (!body) return '';
    body.querySelectorAll('button, [role="button"]').forEach(el => el.remove());
    return (body.textContent || '').replace(/\s+/g, ' ').trim().replace(/[.\u2026]+$/, '').trim();
  }
  function profileKey(root) {
    const profile = root.querySelector(profileSelector);
    return `${profile?.textContent || ''}|${profile?.querySelector('a[href]')?.getAttribute('href') || ''}`;
  }
  function sameTextToggle(root) {
    const hint = textToggles.get(root);
    if (!hint || performance.now() > hint.until || profileKey(root) !== hint.profile) return false;
    const text = comparableBody(root);
    return Math.min(text.length, hint.text.length) >= 20
      && (text.startsWith(hint.text) || hint.text.startsWith(text));
  }
  let lastMove = 0, lastSample = -Infinity, pending = false, timer = null, identitySalt = null;
  const send = m => { try { chrome.runtime.sendMessage({ ...m, recording_id: recordingId, document_id: documentId }).catch(() => {}); } catch {} };
  function permalink(root) {
    const owner = root.matches('[role="article"]') ? root : root.querySelector('[role="article"]');
    for (const a of root.querySelectorAll('a[href]')) {
      // Ignore a nested shared post's permalink; its identity is not the outer post.
      const article = a.closest('[role="article"]');
      if (article && article !== owner) continue;
      try {
        const u = new URL(a.href);
        if (!/(^|\.)facebook\.com$/.test(u.hostname)) continue;
        if (/\/posts\/[^/]+/.test(u.pathname) || /\/permalink\/[^/]+/.test(u.pathname)) return `https://www.facebook.com${u.pathname.replace(/\/$/, '')}`;
        if (u.pathname === '/permalink.php' && u.searchParams.has('story_fbid')) return `https://www.facebook.com/permalink.php?story_fbid=${encodeURIComponent(u.searchParams.get('story_fbid'))}&id=${encodeURIComponent(u.searchParams.get('id') || '')}`;
      } catch {}
    }
    return null;
  }
  // FNV-1a 64 over salt + URL. An identity fingerprint, not cryptographic
  // anonymisation: it is unguessable only while the salt stays on this machine.
  function permalinkKey(url) {
    let hash = 14695981039346656037n;
    for (const char of `${identitySalt}|${url}`) {
      hash = BigInt.asUintN(64, (hash ^ BigInt(char.codePointAt(0))) * 1099511628211n);
    }
    return hash.toString(16).padStart(16, '0');
  }
  function metadata(root) {
    // Without a salt a fingerprint would be reversible by dictionary, so fail
    // closed to the document-scoped identity rather than store a weak one.
    const url = identitySalt ? permalink(root) : null;
    const r = root.getBoundingClientRect();
    const visibleArea = Math.max(0, Math.min(innerWidth, r.right) - Math.max(0, r.left))
      * Math.max(0, Math.min(innerHeight, r.bottom) - Math.max(0, r.top));
    let id = identities.get(root);
    if (!id) { id = `local:${documentId}:${++nextId}`; identities.set(root, id); }
    return { id: url ? `permalink:${permalinkKey(url)}` : id,
      // Local only, so the reviewer can reopen their own post. exportReview
      // strips this before any record leaves the machine.
      permalink: url,
      permalink_form: url ? (url.includes('/permalink.php') ? 'permalink_php' : 'user_posts') : null,
      identity_quality: url ? 'permalink' : 'document_element_only',
      identity_policy: 'explicit-text-toggle-v1',
      rect: { left: r.left, top: r.top, width: r.width, height: r.height },
      viewport: { width: innerWidth, height: innerHeight },
      visible_fraction: r.width * r.height > 0 ? visibleArea / (r.width * r.height) : 0,
      detector_adapter: root.hasAttribute('data-virtualized') ? 'virtualized-semantic-v2' : 'article-feedunit-v2' };
  }
  function candidates() {
    const all = [...document.querySelectorAll(roots)].filter(el => {
      if (el.getAttribute('aria-busy') === 'true') return false;
      if (el.hasAttribute('data-virtualized')) {
        // Observed on the real desktop feed: posts have no article/feed role.
        // Stories, friend suggestions and placeholders share this wrapper too.
        return el.querySelectorAll(profileSelector).length === 1
          && !!el.querySelector(actionSelector)
          && !!el.querySelector(`${messageSelector}, img, video`);
      }
      // Facebook also uses role=article for otherwise empty loading skeletons.
      return !!el.querySelector(`a[href], ${messageSelector}`);
    });
    return all.filter(el => !all.some(parent => parent !== el && parent.contains(el)));
  }
  // Where this viewport sits inside the captured screen, so a frame of the
  // recording can be cropped to the post column without anyone drawing a box.
  // Sent only when it changes: moving or resizing the window, or changing zoom,
  // invalidates any crop derived earlier, and a single calibration would go
  // silently stale.
  let lastGeometry = null;
  function geometry() {
    const border = Math.max(0, (outerWidth - innerWidth) / 2);
    return {
      viewport_x: Math.round(screenX + border),
      viewport_y: Math.round(screenY + (outerHeight - innerHeight - border)),
      viewport_width: innerWidth, viewport_height: innerHeight,
      device_pixel_ratio: devicePixelRatio,
      screen_width: screen.width, screen_height: screen.height,
    };
  }
  function geometryIfChanged() {
    const next = geometry();
    const key = JSON.stringify(next);
    if (key === lastGeometry) return null;
    lastGeometry = key;
    return next;
  }
  let selectionReason = 'not_sampled';
  function select() {
    if (document.visibilityState !== 'visible') { selectionReason = 'document_hidden'; return null; }
    if (!document.hasFocus()) { selectionReason = 'document_unfocused'; return null; }
    let best = null, score = 0;
    const available = candidates();
    selectionReason = available.length ? 'outside_viewport_or_occluded' : 'no_candidate';
    for (const root of available) {
      const r = root.getBoundingClientRect();
      const left = Math.max(0, r.left), right = Math.min(innerWidth, r.right);
      const top = Math.max(0, r.top), bottom = Math.min(innerHeight, r.bottom);
      if (right - left < 150 || bottom - top < 80) continue;
      const x = (left + right) / 2, y = (top + bottom) / 2;
      const hit = document.elementFromPoint(x, y);
      if (!hit || !root.contains(hit)) continue;
      const area = (right - left) * (bottom - top);
      if (area > score) { score = area; best = { root, post: metadata(root) }; }
    }
    if (best) selectionReason = 'selected';
    return best;
  }
  function sample() {
    pending = false; if (!recordingId) return;
    if (performance.now() - lastSample < 150) return;
    lastSample = performance.now();
    current = select();
    const changed = geometryIfChanged();
    send({ type: 'POST_SAMPLE', post: current?.post || null, selection_reason: selectionReason,
      ...(changed ? { geometry: changed } : {}) });
  }
  function schedule() { if (!pending && recordingId) { pending = true; requestAnimationFrame(sample); } }
  async function sync() {
    try {
      const c = await chrome.runtime.sendMessage({ type: 'POST_CONTEXT', document_id: documentId });
      recordingId = c?.recording_id || null;
      if (!recordingId) lastGeometry = null;
      if (typeof c?.identity_salt === 'string' && c.identity_salt) identitySalt = c.identity_salt;
      clearInterval(timer); timer = recordingId ? setInterval(sample, 250) : null;
      if (recordingId) sample();
    } catch { recordingId = null; clearInterval(timer); }
  }
  chrome.runtime.onMessage.addListener(m => {
    if (['RECORDING_STARTED', 'RECORDING_RESUMED', 'TAB_ACTIVATED'].includes(m.type)) sync();
    if (['RECORDING_STOPPED', 'RECORDING_PAUSED'].includes(m.type)) { recordingId = null; clearInterval(timer); current = null; }
  });
  addEventListener('scroll', schedule, { passive: true, capture: true });
  addEventListener('resize', schedule, { passive: true });
  const observer = new MutationObserver(records => {
    // If a virtualized element changes without a permalink, conservatively split its identity.
    for (const r of records) {
      const el = r.target.nodeType === 1 ? r.target : r.target.parentElement;
      const root = el?.closest(roots);
      if (!root || !identities.has(root) || permalink(root)) continue;
      if (root.hasAttribute('data-virtualized')) {
        // Reaction counters and live media controls do not identify a new post.
        const identityNode = `${profileSelector}, ${messageSelector}`;
        const contentChanged = el.closest(identityNode)
          || [...r.addedNodes, ...r.removedNodes].some(n => n.nodeType === 1
            && (n.matches(identityNode) || n.querySelector(identityNode)));
        if (contentChanged && !sameTextToggle(root)) { identities.delete(root); textToggles.delete(root); }
      } else identities.delete(root);
    }
    schedule();
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  function hidden() { current = null; if (recordingId) send({ type: 'POST_HIDDEN' }); }
  addEventListener('pagehide', hidden); addEventListener('blur', hidden);
  addEventListener('focus', () => { sync(); schedule(); });
  addEventListener('pageshow', sync);
  document.addEventListener('visibilitychange', () => document.hidden ? hidden() : sync());
  // Mouse activity is attributed to the post that is dominant at that moment,
  // wherever the cursor happens to be. A cursor parked beside the post is an
  // observation about how this person reads, not a reason to record nothing.
  // `inside` and `over_post` keep the old distinction available for analysis.
  function mouse(e, kind) {
    if (!recordingId || !current || !document.hasFocus() || document.hidden) return;
    if (!(e.target instanceof Element)) return;
    if (kind === 'move' && performance.now() - lastMove < 100) return;
    if (kind === 'move') lastMove = performance.now();
    const r = current.root.getBoundingClientRect();
    const inside = current.root.contains(e.target);
    const other = !inside && !!e.target.closest(roots);
    // Not clamped: a position outside 0..1 is where the cursor actually was.
    const relative = (value, origin, size) => (size > 0 ? (value - origin) / size : null);
    send({ type: 'POST_MOUSE', post_id: current.post.id, event: { kind,
      x: e.clientX, y: e.clientY,
      relative_x: relative(e.clientX, r.left, r.width),
      relative_y: relative(e.clientY, r.top, r.height),
      inside, over_post: inside ? 'current' : other ? 'other' : 'none',
      delta_y: kind === 'wheel' ? e.deltaY : 0, delta_mode: kind === 'wheel' ? e.deltaMode : 0 } });
  }
  document.addEventListener('mousemove', e => mouse(e, 'move'), { passive: true, capture: true });
  document.addEventListener('wheel', e => mouse(e, 'wheel'), { passive: true, capture: true });
  function click(e) {
    // Only a real expansion/collapse control inside the post body can authorize
    // continuity. Similar text changes from virtualization remain separate.
    const control = e.target instanceof Element ? e.target.closest('button, [role="button"]') : null;
    if (e.button === 0 && control && /^(See more|See less|查看更多|顯示較少|显示更多|收起)$/i.test(control.textContent.trim())) {
      const root = control.closest(roots);
      if (root?.hasAttribute('data-virtualized') && root.querySelector(messageSelector)?.contains(control)) {
        textToggles.set(root, { until: performance.now() + 1500, profile: profileKey(root), text: comparableBody(root) });
      }
    }
    mouse(e, 'click');
    if (!recordingId || !document.hasFocus() || document.hidden || ![0, 1].includes(e.button)) return;
    const a = e.target instanceof Element ? e.target.closest('a[href]') : null;
    if (!a || a.hasAttribute('download')) return;
    const root = candidates().find(el => el.contains(a)); if (!root) return;
    try {
      let u = new URL(a.href);
      if (/(^|\.)facebook\.com$/.test(u.hostname) && u.pathname === '/l.php' && u.searchParams.has('u')) u = new URL(u.searchParams.get('u'));
      if (!/^https?:$/.test(u.protocol) || /(^|\.)facebook\.com$/.test(u.hostname)) return;
      send({ type: 'POST_LINK', post: metadata(root), destination: u.href,
        open_mode: e.button === 1 || e.ctrlKey || e.metaKey || e.shiftKey || a.target === '_blank' ? 'new_context_requested' : 'same_tab_requested' });
    } catch {}
  }
  document.addEventListener('click', click, true); document.addEventListener('auxclick', click, true);
  sync();
})();
