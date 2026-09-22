import { getRecording, getReviewSession } from '../store';

export function demoSource() {
  return {
    demo: true, recordingId: 'demo-20260909', duration: 72000, videoBlob: null,
    segments: [
      { startTime: 8000, endTime: 23000, state: 'READING_FLOW', url: '' },
      { startTime: 31000, endTime: 49000, state: 'READING_FLOW', url: '' },
      { startTime: 55000, endTime: 68000, state: 'READING_FLOW', url: '' },
    ],
    scrollData: [], mouseData: [],
  };
}

export async function loadSource() {
  const params = new URLSearchParams(location.search);
  if (params.has('review')) {
    const saved = await getReviewSession(params.get('review'));
    if (!saved) throw new Error('這台裝置找不到指定紀錄。請從本機紀錄選擇，或返回最新錄製資料。');
    const demo = saved.collection_mode === 'interface_demo';
    const recording = demo ? null : await getRecording(saved.recording_id);
    return { ...saved, resumeSessionId: saved.session_id, demo, recordingId: saved.recording_id, videoBlob: recording?.videoBlob || null };
  }
  if (params.get('demo') === '1') return demoSource();
  if (!globalThis.chrome?.storage?.local) return null;
  const data = await chrome.storage.local.get(['currentRecordingId', 'hasRecordingData', 'recordingSegments',
    'recordingData', 'recordingMouseData', 'recordingActualDuration', 'recordingDuration', 'recordingCropRect', 'recordingPostTracking']);
  if (!data.hasRecordingData || !data.currentRecordingId) return null;
  const recording = await getRecording(data.currentRecordingId);
  return {
    demo: false, recordingId: data.currentRecordingId,
    segments: data.recordingSegments || [], scrollData: data.recordingData || [],
    mouseData: data.recordingMouseData || [], duration: data.recordingActualDuration || data.recordingDuration || 0,
    cropRect: data.recordingCropRect || null, videoBlob: recording?.videoBlob || null,
    postTracking: data.recordingPostTracking?.recording_id === data.currentRecordingId ? data.recordingPostTracking : null,
  };
}
