import { buildSurvey } from '../engine/template-engine';

const LLM_CONFIG = {
  serverUrl: 'http://140.112.41.111:8899',
  apiKey: '',
  timeoutMs: 60000,
};

async function callLLM(vlmAnalysis) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LLM_CONFIG.timeoutMs);

  try {
    const response = await fetch(`${LLM_CONFIG.serverUrl}/api/generate-survey`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LLM_CONFIG.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        vlm_analysis: vlmAnalysis,          // 修正 key 名稱
        // prompt 由 server 端統一管理，不再自帶
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`LLM API error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function extractSurveyData(obj) {
  if (obj.survey && typeof obj.survey === 'object') return obj.survey;
  if (obj.step1) return obj;
  if (typeof obj.response === 'string') {
    const m = obj.response.match(/\{[\s\S]*\}/);
    if (m) {
      const inner = JSON.parse(m[0]);
      return inner.survey || inner;
    }
  }
  throw new Error('Cannot extract survey data from LLM response');
}

function validateLLMOutput(parsed) {
  if (!parsed || typeof parsed !== 'object') throw new Error('LLM output is not an object');

  for (const step of ['step1', 'step2', 'step3']) {
    if (!parsed[step]) throw new Error(`Missing ${step}`);
    if (!parsed[step].question || typeof parsed[step].question !== 'string') {
      throw new Error(`${step}.question missing or invalid`);
    }
    if (!parsed[step].option_a?.title) throw new Error(`${step}.option_a.title missing`);
    if (!parsed[step].option_b?.title) throw new Error(`${step}.option_b.title missing`);
  }

  if (!parsed.step3.option_c?.title) throw new Error('step3.option_c.title missing');
  if (!parsed.step3.option_d?.title) throw new Error('step3.option_d.title missing');

  return parsed;
}

function normalizeLLMSurvey(llmOutput) {
  return {
    step1_question: llmOutput.step1.question,
    step1_reframe: llmOutput.step1.reframe || llmOutput.step1.question,
    step1_options: {
      A: { title: llmOutput.step1.option_a.title, description: llmOutput.step1.option_a.desc || '', baseScore: 1 },
      B: { title: llmOutput.step1.option_b.title, description: llmOutput.step1.option_b.desc || '', baseScore: -1 },
    },
    step2_question: llmOutput.step2.question,
    step2_reframe: llmOutput.step2.reframe || llmOutput.step2.question,
    step2_options: {
      A: { title: llmOutput.step2.option_a.title, description: llmOutput.step2.option_a.desc || '', baseScore: 1 },
      B: { title: llmOutput.step2.option_b.title, description: llmOutput.step2.option_b.desc || '', baseScore: -1 },
    },
    step3_question: llmOutput.step3.question,
    step3_reframe: llmOutput.step3.reframe || llmOutput.step3.question,
    step3_options: {
      A: { title: llmOutput.step3.option_a.title, description: llmOutput.step3.option_a.desc || '', quadrant: 'Q1' },
      B: { title: llmOutput.step3.option_b.title, description: llmOutput.step3.option_b.desc || '', quadrant: 'Q2' },
      C: { title: llmOutput.step3.option_c.title, description: llmOutput.step3.option_c.desc || '', quadrant: 'Q3' },
      D: { title: llmOutput.step3.option_d.title, description: llmOutput.step3.option_d.desc || '', quadrant: 'Q4' },
    },
    _isFallback: false,
    _llmRaw: llmOutput,
  };
}

export async function safeLLMGenerate(vlmResult, { retries = 2 } = {}) {
  console.log(`%c[LLM] Input — VLM Result sent to LLM`, 'color: #6366f1; font-weight: bold');
  console.log(JSON.stringify(vlmResult, null, 2));

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const apiResult = await callLLM(vlmResult);
      console.log(`%c[LLM] Attempt ${attempt + 1} — API Response`, 'color: #6366f1; font-weight: bold');
      console.log(apiResult);

      // server 回傳 is_fallback 時直接使用 fallback
      if (apiResult.is_fallback) {
        console.warn(`%c[LLM] Server returned fallback`, 'color: #f59e0b; font-weight: bold');
        const surveyData = extractSurveyData(apiResult);
        const validated = validateLLMOutput(surveyData);
        const normalized = normalizeLLMSurvey(validated);
        normalized._isFallback = true;
        normalized._llmModel = apiResult.model;
        normalized._llmDurationMs = apiResult.total_duration_ms || null;
        return normalized;
      }

      const surveyData = extractSurveyData(apiResult);
      console.log(`%c[LLM] Extracted survey data`, 'color: #6366f1');
      console.log(surveyData);

      const validated = validateLLMOutput(surveyData);
      const normalized = normalizeLLMSurvey(validated);
      normalized._llmModel = apiResult.model || 'unknown';
      normalized._llmDurationMs = apiResult.total_duration_ms || null;

      console.log(`%c[LLM] Generated Survey (success)`, 'color: #6366f1; font-weight: bold');
      console.log('Step1:', normalized.step1_question);
      console.log('  reframe:', normalized.step1_reframe);
      console.log('  A:', normalized.step1_options?.A?.title, '—', normalized.step1_options?.A?.description);
      console.log('  B:', normalized.step1_options?.B?.title, '—', normalized.step1_options?.B?.description);
      console.log('Step2:', normalized.step2_question);
      console.log('  reframe:', normalized.step2_reframe);
      console.log('  A:', normalized.step2_options?.A?.title, '—', normalized.step2_options?.A?.description);
      console.log('  B:', normalized.step2_options?.B?.title, '—', normalized.step2_options?.B?.description);
      console.log('Step3:', normalized.step3_question);
      console.log('  A:', normalized.step3_options?.A?.title);
      console.log('  B:', normalized.step3_options?.B?.title);
      console.log('  C:', normalized.step3_options?.C?.title);
      console.log('  D:', normalized.step3_options?.D?.title);
      console.log('_isFallback:', normalized._isFallback);

      return normalized;
    } catch (err) {
      console.warn(`%c[LLM] Attempt ${attempt + 1} failed`, 'color: #ef4444; font-weight: bold', err);
      if (attempt === retries) {
        console.warn(`%c[LLM] All attempts failed — using template fallback`, 'color: #f59e0b; font-weight: bold');
        const fallback = buildSurvey(vlmResult);
        console.log('[LLM] Fallback survey:', fallback.step1_question);
        return fallback;
      }
    }
  }
  return buildSurvey(vlmResult);
}