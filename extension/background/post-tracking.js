/* Additive, independent encounter telemetry. All times use the recording clock. */
class PostTimeline {
  constructor(recordingId) {
    // Schema 2 changed what mouse counters mean: they now cover the whole time a
    // post is dominant, wherever the cursor is, not only activity over the post.
    // Schema 3 changed what a permalink-quality `id` contains: a salted
    // fingerprint instead of the URL, which named the author's account.
    // Earlier records are not comparable on those fields and are never rescaled.
    this.data = { schema_version: 3, recording_id: recordingId,
      post_identity: 'salted-fingerprint-when-permalink; raw permalink local-only and stripped on export',
      method: 'dominant-visible-facebook-post-v2', clock: 'background-effective-elapsed-ms',
      semantics: 'foreground dominant visible region; not verified reading or psychological state',
      mouse_attribution: 'dominant-post-during-encounter; cursor position recorded, not required',
      selection: 'largest viewport-clipped area; center hit-test; minimum 150x80 CSS pixels',
      heartbeat_ms: 250, maximum_tail_ms: 750, posts: {}, encounters: [],
      link_events: [], external_visits: [], mouse_samples: [], dropped_mouse_samples: 0,
      // Viewport position and scale over time. A crop derived from one of these
      // is only valid until the next entry.
      geometry: [],
      diagnostics: { schema_version: 1, context_requests: 0, received: {}, rejected: {},
        accepted_samples: 0, selected_samples: 0, selection_reasons: {},
        focus_sync: { version: 1, checks: 0, focused_checks: 0, unfocused_checks: 0,
          errors: 0, corrections: 0, events: 0, stale_results: 0 } } };
    this.current = null; this.external = null; this.last = 0; this.point = null;
  }
  close(t, reason) {
    if (this.current) {
      const end = Math.max(this.last, Math.min(t, this.last + 750));
      this.current.end_ms = end;
      this.current.dwell_ms = end - this.current.start_ms;
      this.current.end_reason = reason;
    }
    this.current = null; this.point = null;
  }
  sample(t, tabId, documentId, post) {
    const key = post ? `${tabId}:${documentId}:${post.id}` : null;
    if (this.current && (this.current.key !== key || t - this.last > 750)) {
      this.close(t, t - this.last > 750 ? 'heartbeat_gap' : 'post_changed');
    }
    if (!post) { this.close(t, 'no_visible_post'); return; }
    this.data.posts[post.id] = post;
    if (!this.current) {
      this.current = { id: `encounter-${this.data.encounters.length + 1}`, key,
        post_id: post.id, tab_id: tabId, document_id: documentId,
        start_ms: t, end_ms: t, dwell_ms: 0, mouse_moves: 0, mouse_moves_inside: 0, clicks: 0,
        start_rect: post.rect || null, end_rect: post.rect || null,
        wheel_events: 0, wheel_abs_y: 0, wheel_abs_y_by_mode: { pixel: 0, line: 0, page: 0 },
        mouse_distance_px: 0, mouse_distance_px_inside: 0,
        movement_time_ms: 0, end_reason: null };
      this.data.encounters.push(this.current);
    }
    this.last = t; this.current.end_ms = t;
    this.current.end_rect = post.rect || null;
    this.current.dwell_ms = t - this.current.start_ms;
  }
  mouse(t, postId, event) {
    const c = this.current;
    if (!c || c.post_id !== postId || t - this.last > 750) return;
    if (!['move', 'click', 'wheel'].includes(event.kind)) return;
    const sample = { t, encounter_id: c.id, post_id: postId, ...event };
    if (event.kind === 'move') {
      c.mouse_moves++;
      if (event.inside) c.mouse_moves_inside++;
      if (this.point && t > this.point.t && t - this.point.t < 500) {
        const step = Math.hypot(event.x - this.point.x, event.y - this.point.y);
        c.mouse_distance_px += step;
        // Only a step whose both ends were over the post counts as movement on it.
        if (event.inside && this.point.inside) c.mouse_distance_px_inside += step;
        c.movement_time_ms += t - this.point.t;
      }
      this.point = { t, x: event.x, y: event.y, inside: !!event.inside };
    } else if (event.kind === 'click') c.clicks++;
    else {
      c.wheel_events++;
      const mode = ['pixel', 'line', 'page'][event.delta_mode];
      if (mode) c.wheel_abs_y_by_mode[mode] += Math.abs(event.delta_y || 0);
      // Legacy convenience total is pixel-only; unlike units must not be added.
      if (event.delta_mode === 0) c.wheel_abs_y += Math.abs(event.delta_y || 0);
    }
    if (this.data.mouse_samples.length < 20000) this.data.mouse_samples.push(sample);
    else this.data.dropped_mouse_samples++;
  }
  leaveExternal(t, reason) {
    if (this.external) {
      this.external.end_ms = t;
      this.external.duration_ms = t - this.external.start_ms;
      this.external.end_reason = reason;
      this.external = null;
    }
  }
  enterExternal(t, tabId, link) {
    if (this.external?.tab_id === tabId && this.external.link_event_id === link.id) return;
    this.close(t, 'external_visit'); this.leaveExternal(t, 'tab_changed');
    this.external = { link_event_id: link.id, origin_post_id: link.post_id,
      tab_id: tabId, start_ms: t, end_ms: t, duration_ms: 0 };
    this.data.external_visits.push(this.external);
  }
  finish(t) {
    this.close(t, 'recording_stopped'); this.leaveExternal(t, 'recording_stopped');
    this.data.duration_ms = t;
    this.data.post_dwell_ms = this.data.encounters.reduce((n, e) => n + e.dwell_ms, 0);
    this.data.linked_external_ms = this.data.external_visits.reduce((n, e) => n + e.duration_ms, 0);
    this.data.unattributed_ms = Math.max(0, t - this.data.post_dwell_ms - this.data.linked_external_ms);
    return this.data;
  }
}

// A permalink identifies a post by its author's account handle, so using the
// raw URL as the analysis key would put a third party's identity in every
// record. The content script fingerprints it with this salt before the URL
// leaves the page. The salt stays in local storage and is never exported, so
// the fingerprint cannot be matched back against a list of candidate handles.
let identitySalt = null;
async function loadIdentitySalt() {
  if (identitySalt) return identitySalt;
  try {
    const stored = await chrome.storage.local.get('postIdentitySalt');
    if (typeof stored?.postIdentitySalt === 'string' && stored.postIdentitySalt.length >= 32) {
      identitySalt = stored.postIdentitySalt;
      return identitySalt;
    }
  } catch (_) { /* fall through to generate */ }
  const bytes = typeof crypto !== 'undefined' && crypto.getRandomValues
    ? [...crypto.getRandomValues(new Uint8Array(16))]
    : [...Array(16)].map(() => Math.floor(Math.random() * 256));
  identitySalt = bytes.map(b => b.toString(16).padStart(2, '0')).join('');
  try { await chrome.storage.local.set({ postIdentitySalt: identitySalt }); } catch (_) {}
  return identitySalt;
}

function installPostTracking(context) {
  let timeline = new PostTimeline(null), focused = false, focusedWindowId = null;
  let focusTimer = null, focusRevision = 0, focusPending = null;
  // Runtime-only freshness of the last accepted heartbeat. Deliberately kept out
  // of timeline.data so the exported record stays byte-identical to schema 1.
  let acceptedAt = null, acceptedWall = null;
  const destinations = new Map(), opener = new Map(), documents = new Map(), tabURLs = new Map();
  const fb = url => { try { return /(^|\.)facebook\.com$/.test(new URL(url).hostname); } catch { return false; } };
  const safeURL = url => { try { const u = new URL(url); return /^https?:$/.test(u.protocol) ? u.origin + u.pathname : null; } catch { return null; } };
  // Distinguish query-selected articles without persisting raw query strings.
  // This is an identity fingerprint, not cryptographic anonymization.
  const urlKey = url => {
    const u = new URL(url); let hash = 14695981039346656037n;
    for (const char of u.origin + u.pathname + u.search) hash = BigInt.asUintN(64, (hash ^ BigInt(char.codePointAt(0))) * 1099511628211n);
    return hash.toString(16);
  };
  const now = () => context().elapsed;
  const enabled = () => context().running && !context().paused && focused;
  function boundary(reason) { timeline.close(now(), reason); timeline.leaveExternal(now(), reason); }
  function activate(tabId) {
    boundary('tab_changed');
    if (enabled() && destinations.has(tabId)) timeline.enterExternal(now(), tabId, destinations.get(tabId));
  }
  function applyFocus(windowId, reason) {
    const next = windowId !== null;
    if (focused !== next || focusedWindowId !== windowId) {
      boundary(reason);
      focused = next;
      focusedWindowId = windowId;
      if (next) {
        const revision = focusRevision, target = timeline;
        chrome.tabs.query({ active: true, windowId }, tabs => {
          if (chrome.runtime.lastError || revision !== focusRevision || target !== timeline || !enabled()) return;
          const tabId = tabs[0]?.id;
          if (focusedWindowId === windowId && tabId === context().activeTabId && destinations.has(tabId)) {
            timeline.enterExternal(now(), tabId, destinations.get(tabId));
          }
        });
      }
    }
  }
  function syncFocus() {
    if (!context().running || focusPending !== null) return;
    const revision = focusRevision, target = timeline;
    const token = {}; focusPending = token;
    const diagnostic = target.data.diagnostics.focus_sync;
    diagnostic.checks++;
    const complete = (win, error) => {
      if (focusPending === token) focusPending = null;
      // A later focus event, stop, or new recording invalidates this answer.
      if (revision !== focusRevision || target !== timeline || !context().running) {
        if (target === timeline && context().running) diagnostic.stale_results++;
        return;
      }
      if (error || !win) {
        diagnostic.errors++;
        applyFocus(null, 'focus_query_failed');
        return;
      }
      // getLastFocused also returns a window when Chrome is in the background.
      // Only its explicit focused flag is evidence of foreground presence.
      const id = win.focused === true && Number.isInteger(win.id) ? win.id : null;
      diagnostic[id === null ? 'unfocused_checks' : 'focused_checks']++;
      if (focused !== (id !== null) || focusedWindowId !== id) diagnostic.corrections++;
      applyFocus(id, 'focus_reconciled');
    };
    try {
      chrome.windows.getLastFocused({}, win => complete(win, chrome.runtime.lastError));
    } catch (_) { complete(null, true); }
  }
  // Read-only collection-side status. Counters, ids and focus belief only:
  // never post content, URLs, identities or any attention inference. This
  // reports what the collector currently believes, which is NOT an operating
  // system foreground observation and must not be presented as one.
  function status() {
    const c = context(), d = timeline.data.diagnostics;
    return {
      schema_version: 1,
      observed_at: Date.now(),
      focus_evidence: 'chrome.windows.getLastFocused().focused',
      running: c.running, paused: c.paused,
      recording_id: c.running ? c.recordingId : null,
      timeline_recording_id: timeline.data.recording_id,
      elapsed_ms: c.running ? c.elapsed : null,
      focused, focused_window_id: focusedWindowId,
      focus_poll_active: focusTimer !== null, focus_query_in_flight: focusPending !== null,
      active_tab_id: c.activeTabId,
      accepted_samples: d.accepted_samples, selected_samples: d.selected_samples,
      last_accepted_sample_ms: acceptedAt,
      last_accepted_sample_age_ms: acceptedWall === null ? null : Date.now() - acceptedWall,
      received: { ...d.received }, rejected: { ...d.rejected },
      selection_reasons: { ...d.selection_reasons },
      focus_sync: { ...d.focus_sync },
    };
  }
  chrome.runtime.onMessage.addListener((m, sender, respond) => {
    if (!m.type?.startsWith('POST_')) return;
    const c = context();
    if (m.type === 'POST_CONTEXT') {
      if (sender.tab && !(sender.frameId > 0) && fb(sender.url || sender.tab.url)) {
        if (c.running) timeline.data.diagnostics.context_requests++;
        documents.set(sender.tab.id, sender.documentId || m.document_id);
        tabURLs.set(sender.tab.id, sender.url || sender.tab.url);
      }
      // Answered asynchronously so the salt is in hand before the content
      // script can fingerprint anything.
      loadIdentitySalt().then(salt => {
        const now = context();
        respond({ recording_id: now.running && !now.paused ? now.recordingId : null, identity_salt: salt });
      }).catch(() => respond({ recording_id: null, identity_salt: null }));
      return true;
    }
    if (m.type === 'POST_STATUS') { respond(status()); return; }
    // Bounded counters distinguish missing messages, foreground rejection and
    // failed DOM selection. Never include page text, URLs or identities here.
    if (!c.running || sender.frameId > 0 || !sender.tab || !fb(sender.url || sender.tab.url)) return;
    const diagnostic = timeline.data.diagnostics;
    const increment = (map, key) => { map[key] = (map[key] || 0) + 1; };
    if (!['POST_SAMPLE', 'POST_HIDDEN', 'POST_MOUSE', 'POST_LINK'].includes(m.type)) return;
    increment(diagnostic.received, m.type);
    const reject = reason => increment(diagnostic.rejected, reason);
    if (m.recording_id !== c.recordingId) { reject('recording_mismatch'); return; }
    if (c.paused) { reject('paused'); return; }
    if (!focused) { reject('browser_unfocused'); return; }
    if (sender.tab.windowId !== undefined && sender.tab.windowId !== focusedWindowId) {
      reject('background_window'); return;
    }
    if (sender.tab.id !== c.activeTabId) { reject('inactive_tab'); return; }
    const doc = sender.documentId || m.document_id;
    if (documents.get(sender.tab.id) !== doc) { reject('document_mismatch'); return; }
    if (!fb(tabURLs.get(sender.tab.id))) { reject('navigated_away'); return; }
    if (m.type === 'POST_SAMPLE') {
      diagnostic.accepted_samples++;
      if (m.geometry && timeline.data.geometry.length < 500) {
        timeline.data.geometry.push({ t: now(), ...m.geometry });
      }
      acceptedAt = now(); acceptedWall = Date.now();
      if (m.post) diagnostic.selected_samples++;
      const reason = ['selected', 'document_hidden', 'document_unfocused', 'outside_viewport_or_occluded', 'no_candidate'].includes(m.selection_reason)
        ? m.selection_reason : 'unspecified';
      increment(diagnostic.selection_reasons, reason);
      timeline.leaveExternal(now(), 'facebook_return'); destinations.delete(sender.tab.id);
      timeline.sample(now(), sender.tab.id, doc, m.post);
    } else if (m.type === 'POST_HIDDEN') timeline.close(now(), 'page_hidden');
    else if (m.type === 'POST_MOUSE') {
      if (timeline.current?.document_id === doc) timeline.mouse(now(), m.post_id, m.event);
    } else if (m.type === 'POST_LINK' && safeURL(m.destination) && !fb(m.destination)) {
      timeline.data.posts[m.post.id] = m.post;
      timeline.data.link_events.push({ id: `link-${timeline.data.link_events.length + 1}`,
        t: now(), wall_time: Date.now(), post_id: m.post.id,
        encounter_id: timeline.current?.post_id === m.post.id ? timeline.current.id : null,
        origin_tab_id: sender.tab.id, document_id: doc, destination: safeURL(m.destination),
        destination_key: urlKey(m.destination), match_method: 'origin_path_query_fnv1a64',
        open_mode: m.open_mode, status: 'click_only', confirmation: null });
    }
  });
  chrome.tabs.onCreated.addListener(tab => {
    if (tab.openerTabId !== undefined) opener.set(tab.id, tab.openerTabId);
    if (tab.url || tab.pendingUrl) navigate(tab.id, tab.url || tab.pendingUrl);
  });
  function navigate(tabId, url) {
    if (!context().running) return;
    const destination = safeURL(url);
    if (!destination) return;
    tabURLs.set(tabId, url);
    const existing = destinations.get(tabId);
    if (existing?.destination_key === urlKey(url)) return;
    if (tabId === context().activeTabId) boundary('navigation');
    // A subsequent navigation has no automatically inferred relation to the post.
    destinations.delete(tabId);
    if (fb(url)) return;
    const link = [...timeline.data.link_events].reverse().find(l => l.status === 'click_only'
      && Date.now() - l.wall_time < 10000 && l.destination_key === urlKey(url)
      && (l.origin_tab_id === tabId || opener.get(tabId) === l.origin_tab_id));
    if (link) {
      link.status = 'navigation_confirmed'; link.destination_tab_id = tabId;
      link.confirmation = link.origin_tab_id === tabId ? 'same_tab_url_match' : 'opener_and_url_match';
      destinations.set(tabId, link);
      if (enabled() && tabId === context().activeTabId) timeline.enterExternal(now(), tabId, link);
    }
  }
  chrome.tabs.onUpdated.addListener((tabId, change) => {
    if (change.url) navigate(tabId, change.url);
    else if (change.status === 'loading' && tabId === context().activeTabId) timeline.close(now(), 'page_loading');
  });
  chrome.tabs.onRemoved.addListener(tabId => {
    if (timeline.current?.tab_id === tabId || timeline.external?.tab_id === tabId) boundary('tab_closed');
    destinations.delete(tabId); opener.delete(tabId); documents.delete(tabId); tabURLs.delete(tabId);
  });
  chrome.windows.onFocusChanged.addListener(id => {
    focusRevision++; focusPending = null;
    if (context().running) timeline.data.diagnostics.focus_sync.events++;
    applyFocus(id === chrome.windows.WINDOW_ID_NONE ? null : id, 'window_focus_changed');
  });
  return {
    start() {
      clearInterval(focusTimer); focusRevision++; focusPending = null;
      focused = false; focusedWindowId = null;
      acceptedAt = null; acceptedWall = null;
      timeline = new PostTimeline(context().recordingId); destinations.clear(); opener.clear();
      syncFocus(); focusTimer = setInterval(syncFocus, 500);
    },
    activate, boundary, status,
    resume() {
      focusRevision++; focusPending = null;
      applyFocus(null, 'focus_resume_check'); syncFocus();
      if (enabled() && destinations.has(context().activeTabId)) timeline.enterExternal(now(), context().activeTabId, destinations.get(context().activeTabId));
    },
    finish() {
      clearInterval(focusTimer); focusTimer = null; focusRevision++; focusPending = null;
      return timeline.finish(now());
    },
  };
}
