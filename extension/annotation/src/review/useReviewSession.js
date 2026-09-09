import { useCallback, useEffect, useRef, useState } from 'react';
import { saveReviewSession } from '../store';

export default function useReviewSession() {
  const [session, setSession] = useState(null);
  const [saveState, setSaveState] = useState('idle');
  const [saveError, setSaveError] = useState('');
  const [commitPending, setCommitPending] = useState(false);
  const committing = useRef(false);
  const current = useRef(null);
  const queue = useRef(Promise.resolve());
  const pending = useRef(0);
  const failed = useRef(false);
  const committedRevision = useRef(0);

  const initialize = useCallback((value, persisted = false) => {
    current.current = value; committedRevision.current = persisted ? value.revision : 0;
    committing.current = false; setCommitPending(false);
    failed.current = false; setSaveError(''); setSession(value); setSaveState(persisted ? 'saved' : 'idle');
  }, []);

  const persist = useCallback(value => {
    pending.current++; setSaveState('saving'); setSaveError('');
    const operation = queue.current.catch(() => {}).then(async () => {
      await saveReviewSession(value, committedRevision.current);
      committedRevision.current = value.revision;
    });
    queue.current = operation;
    operation.then(() => {
      pending.current--; failed.current = false;
      if (value.session_id === current.current?.session_id && value.revision === current.current?.revision) {
        setSession(value); setSaveState('saved');
        committing.current = false; setCommitPending(false);
      }
    }, error => {
      pending.current--; failed.current = true;
      if (value.session_id === current.current?.session_id && value.revision === current.current?.revision) { setSaveState('error'); setSaveError(error.message || '儲存失敗，請重試。'); }
    });
    return operation;
  }, []);

  const update = useCallback((transform, { waitForSave = false } = {}) => {
    // A submission (or failed submission awaiting retry) cannot be changed or
    // submitted twice while its annotation and next cursor are being committed.
    if (committing.current) return current.current;
    const previous = current.current;
    const next = { ...transform(previous), revision: previous.revision + 1, updated_at: new Date().toISOString() };
    current.current = next;
    if (waitForSave) { committing.current = true; setCommitPending(true); }
    else setSession(next);
    // Keep the current form visible until the whole transaction succeeds.
    persist(next).catch(() => {});
    return next;
  }, [persist]);

  const retry = useCallback(() => persist(current.current).catch(() => {}), [persist]);
  const latest = useCallback(() => current.current, []);

  useEffect(() => {
    const warn = event => { if (pending.current || failed.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  return { session, initialize, update, saveState, saveError, retry, commitPending, latest };
}
