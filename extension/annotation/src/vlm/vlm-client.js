const VLM_CONFIG = {
  serverUrl: 'http://140.112.41.111:8899',
  apiKey: '',
};

const VALID_DENSITY = ['High', 'Low'];
const VALID_AROUSAL = ['High', 'Neutral', 'Low'];
const VALID_PLATFORM = ['Facebook', 'Instagram', 'Twitter', 'YouTube', 'TikTok', 'Reddit', 'Other'];
const VALID_CONTENT_TYPE = ['long_text', 'short_text', 'image_post', 'video', 'meme', 'mixed'];
const VALID_SENTIMENT = ['positive', 'negative', 'mixed', 'neutral', 'none'];

export function getFallbackResult() {
  return {
    topic: '你剛才看的內容',
    topic_detail: '',
    platform: 'Other',
    content_type: 'mixed',
    information_density: 'Low',
    information_density_reason: 'VLM fallback',
    emotional_arousal: 'Neutral',
    emotional_arousal_reason: 'VLM fallback',
    has_comments_visible: false,
    comment_sentiment: 'none',
    visual_elements: '',
    text_snippets: '',
    comment_highlight: '',
  };
}

function validateAndFix(result) {
  return {
    topic: result.topic || '你剛才看的內容',
    topic_detail: result.topic_detail || '',
    platform: VALID_PLATFORM.includes(result.platform) ? result.platform : 'Other',
    content_type: VALID_CONTENT_TYPE.includes(result.content_type) ? result.content_type : 'mixed',
    information_density: VALID_DENSITY.includes(result.information_density)
      ? result.information_density : 'Low',
    information_density_reason: result.information_density_reason || '',
    emotional_arousal: VALID_AROUSAL.includes(result.emotional_arousal)
      ? result.emotional_arousal : 'Neutral',
    emotional_arousal_reason: result.emotional_arousal_reason || '',
    has_comments_visible: typeof result.has_comments_visible === 'boolean'
      ? result.has_comments_visible : false,
    comment_sentiment: VALID_SENTIMENT.includes(result.comment_sentiment)
      ? result.comment_sentiment : 'none',
    visual_elements: result.visual_elements || '',
    text_snippets: result.text_snippets || '',
    comment_highlight: result.comment_highlight || '',
  };
}

async function callVLM(imageBlob) {
  const formData = new FormData();
  formData.append('file', imageBlob, 'screenshot.jpg');
  // prompt 由 server 端統一管理，不再自帶

  const response = await fetch(`${VLM_CONFIG.serverUrl}/api/analyze-social-upload`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${VLM_CONFIG.apiKey}` },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`VLM API error: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

export async function safeAnalyze(imageBlob, { retries = 2 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await callVLM(imageBlob);
      console.log(`%c[VLM] Attempt ${attempt + 1} — API Response`, 'color: #22c55e; font-weight: bold');
      console.log(result);

      // server 直接回傳結構化的 analysis 物件，不需要自己解析 JSON
      const analysis = result.analysis;
      if (!analysis || typeof analysis !== 'object') {
        throw new Error('Server response missing analysis field');
      }

      const validated = validateAndFix(analysis);
      console.log(`%c[VLM] Parsed Result`, 'color: #22c55e; font-weight: bold');
      console.table({
        topic: validated.topic,
        topic_detail: validated.topic_detail,
        platform: validated.platform,
        content_type: validated.content_type,
        information_density: validated.information_density,
        emotional_arousal: validated.emotional_arousal,
        has_comments_visible: validated.has_comments_visible,
        comment_sentiment: validated.comment_sentiment,
        visual_elements: validated.visual_elements,
        text_snippets: validated.text_snippets,
        comment_highlight: validated.comment_highlight,
      });
      return validated;
    } catch (err) {
      console.warn(`[VLM] Attempt ${attempt + 1} failed:`, err);
      if (attempt === retries) return getFallbackResult();
    }
  }
  return getFallbackResult();
}

export function extractFrame(videoEl, timeSec, cropRect) {
  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      videoEl.removeEventListener('seeked', onSeeked);
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (cropRect) {
          canvas.width = cropRect.width;
          canvas.height = cropRect.height;
          ctx.drawImage(videoEl, cropRect.x, cropRect.y, cropRect.width, cropRect.height, 0, 0, cropRect.width, cropRect.height);
        } else {
          canvas.width = videoEl.videoWidth || 1280;
          canvas.height = videoEl.videoHeight || 720;
          ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
        }
        canvas.toBlob((blob) => {
          blob ? resolve(blob) : reject(new Error('Canvas toBlob returned null'));
        }, 'image/jpeg', 0.85);
      } catch (err) {
        reject(err);
      }
    };
    videoEl.addEventListener('seeked', onSeeked);
    videoEl.currentTime = timeSec;
  });
}

export async function extractMultiFrame(videoEl, startTimeMs, endTimeMs, cropRect) {
  const dur = endTimeMs - startTimeMs;
  const percentages = [0.2, 0.5, 0.8];
  const timesSec = percentages.map(p => (startTimeMs + dur * p) / 1000);

  const frameBitmaps = [];
  for (const t of timesSec) {
    const blob = await extractFrame(videoEl, t, cropRect);
    const bitmap = await createImageBitmap(blob);
    frameBitmaps.push(bitmap);
  }

  const frameW = frameBitmaps[0].width;
  const frameH = frameBitmaps[0].height;
  const gap = 4;
  const totalW = frameW * 3 + gap * 2;

  const canvas = document.createElement('canvas');
  canvas.width = totalW;
  canvas.height = frameH;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, totalW, frameH);

  frameBitmaps.forEach((bmp, i) => {
    ctx.drawImage(bmp, i * (frameW + gap), 0, frameW, frameH);
    bmp.close();
  });

  ctx.font = `bold ${Math.max(14, Math.round(frameH * 0.03))}px sans-serif`;
  ctx.textAlign = 'center';
  percentages.forEach((p, i) => {
    const x = i * (frameW + gap) + frameW / 2;
    const label = `${Math.round(p * 100)}%`;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x - 30, 4, 60, 22);
    ctx.fillStyle = '#fff';
    ctx.fillText(label, x, 21);
  });

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      blob ? resolve(blob) : reject(new Error('Multi-frame toBlob returned null'));
    }, 'image/jpeg', 0.85);
  });
}