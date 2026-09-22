import { useEffect, useState } from 'react';

export default function useLatestRecording() {
  const [latest, setLatest] = useState(null);
  useEffect(() => {
    const storage = globalThis.chrome?.storage;
    if (!storage?.local) return;
    let disposed = false, sequence = 0;
    const refresh = async () => {
      const request = ++sequence;
      try {
        const data = await storage.local.get(['currentRecordingId', 'hasRecordingData']);
        if (!disposed && request === sequence) setLatest({ id: data.currentRecordingId, ready: !!data.hasRecordingData });
      } catch { if (!disposed && request === sequence) setLatest(null); }
    };
    const changed = (changes, area) => {
      if (area === 'local' && ('currentRecordingId' in changes || 'hasRecordingData' in changes)) refresh();
    };
    storage.onChanged?.addListener(changed);
    window.addEventListener('focus', refresh);
    refresh();
    return () => {
      disposed = true;
      storage.onChanged?.removeListener(changed);
      window.removeEventListener('focus', refresh);
    };
  }, []);
  return latest;
}
