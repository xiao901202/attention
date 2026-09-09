// Historical binary/AI-generated workflow. Not imported by the current application.
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import ProcessingPage from './pages/ProcessingPage';
import Step0Trigger from './pages/Step0Trigger';
import Step1Agency from './pages/Step1Agency';
import Step2Load from './pages/Step2Load';
import Step3Verify from './pages/Step3Verify';
import ResultPage from './pages/ResultPage';
import OverviewPage from './pages/OverviewPage';
import HouseProgress from './components/HouseProgress';
import { computeAnnotation } from './engine/scorer';
import { getStep3Policy, recordAnnotation } from './engine/step3-policy';
import { buildSurvey } from './engine/template-engine';
import { saveAnnotation, saveSession } from './store';

const PAGES = {
  PROCESSING: 'processing',
  STEP0: 'step0',
  STEP1: 'step1',
  STEP2: 'step2',
  STEP3: 'step3',
  RESULT: 'result',
  OVERVIEW: 'overview',
};

export default function App() {
  const [page, setPage] = useState(PAGES.PROCESSING);
  const [segments, setSegments] = useState([]);
  const [scrollData, setScrollData] = useState([]);
  const [mouseData, setMouseData] = useState([]);
  const [vlmResults, setVlmResults] = useState({});
  const [duration, setDuration] = useState(180000);
  const [videoBlob, setVideoBlob] = useState(null);
  const [cropRect, setCropRect] = useState(null);
  const [readingIndices, setReadingIndices] = useState([]);
  const [currentSegIdx, setCurrentSegIdx] = useState(0);
  const [surveyResults, setSurveyResults] = useState({});

  const [survey, setSurvey] = useState(null);
  const [step3Policy, setStep3Policy] = useState({ showStep3: true, phase: 1 });
  const [annotationResult, setAnnotationResult] = useState(null);

  const allAnnotationsRef = useRef([]);
  const sessionSavedRef = useRef(false);

  // Mutable ref for step answers — written directly in callbacks, no render-timing dependency
  const draft = useRef({ step1: null, step2: null });

  // Latest-value ref for data that finalize reads
  const dataRef = useRef({});
  dataRef.current = { step3Policy, readingIndices, currentSegIdx, segments, vlmResults, surveyResults, survey };

  useEffect(() => {
    getStep3Policy().then(setStep3Policy);
  }, []);

  const saveCurrentSession = useCallback(async () => {
    if (sessionSavedRef.current) return;
    sessionSavedRef.current = true;
    const { segments: segs, vlmResults: vlm, surveyResults: sr } = dataRef.current;
    try {
      await saveSession({
        session_id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        segments: segs,
        scrollData,
        mouseData,
        vlmResults: vlm,
        surveyResults: sr,
        duration,
        annotations: allAnnotationsRef.current,
      });
      console.log('[Session] auto-saved to IndexedDB');
    } catch (err) {
      console.error('[Session] save failed:', err);
    }
  }, [scrollData, mouseData, duration]);

  const goToOverview = useCallback(() => {
    saveCurrentSession();
    setPage(PAGES.OVERVIEW);
  }, [saveCurrentSession]);

  const currentVlm = () => {
    if (readingIndices.length === 0) return null;
    return vlmResults[readingIndices[currentSegIdx]] || null;
  };

  const currentSegment = () => {
    if (readingIndices.length === 0) return null;
    return segments[readingIndices[currentSegIdx]] || null;
  };

  const handleProcessingComplete = useCallback((data) => {
    setSegments(data.segments);
    setScrollData(data.scrollData);
    setMouseData(data.mouseData);
    setVlmResults(data.vlmResults);
    setSurveyResults(data.surveyResults || {});
    setDuration(data.duration);
    setVideoBlob(data.videoBlob);
    setCropRect(data.cropRect);
    const indices = data.segments
      .map((s, i) => i)
      .filter(i => {
        const seg = data.segments[i];
        return seg.state === 'READING_FLOW' && (seg.endTime - seg.startTime) >= 2000;
      });
    setReadingIndices(indices);

    if (indices.length === 0) {
      // No readable segments — save session directly from processing data
      sessionSavedRef.current = true;
      saveSession({
        session_id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        segments: data.segments,
        scrollData: data.scrollData,
        mouseData: data.mouseData,
        vlmResults: data.vlmResults,
        surveyResults: data.surveyResults || {},
        duration: data.duration,
        annotations: [],
      }).catch(err => console.error('[Session] save failed:', err));
      setPage(PAGES.OVERVIEW);
    } else {
      setCurrentSegIdx(0);
      const idx = indices[0];
      const llmSurvey = data.surveyResults?.[idx];
      const vlm = data.vlmResults[idx];
      setSurvey(llmSurvey || (vlm ? buildSurvey(vlm) : null));
      setPage(PAGES.STEP0);
    }
  }, []);

  const startAnnotation = useCallback(() => {
    draft.current = { step1: null, step2: null };
    setPage(PAGES.STEP1);
  }, []);

  const finalize = useCallback(async (step1, step2, step3Option, step3Confidence) => {
    const { step3Policy: policy, readingIndices: ri, currentSegIdx: csi, segments: segs, vlmResults: vlm, surveyResults: sr, survey: currentSurvey } = dataRef.current;

    const s1 = { option: step1.option, confidence: step1.confidence };
    const s2 = { option: step2.option, confidence: step2.confidence };
    const s3 = step3Option ? { option: step3Option, confidence: step3Confidence } : null;

    console.log('[Scorer] step1 confidence:', s1.confidence, 'step2 confidence:', s2.confidence);

    const result = computeAnnotation(s1, s2, s3, policy);
    setAnnotationResult(result);

    const segIndex = ri[csi];
    const seg = segs[segIndex];
    const vlmData = vlm[segIndex];
    const segSurvey = sr[segIndex] || currentSurvey;

    const annotation = {
      annotation_id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      url: seg?.url || '',
      platform: vlmData?.platform || 'Other',
      vlm: vlmData || {},
      llm: {
        is_fallback: segSurvey?._isFallback ?? true,
        generated_survey: segSurvey ? { step1: { question: segSurvey.step1_question, reframe: segSurvey.step1_reframe }, step2: { question: segSurvey.step2_question, reframe: segSurvey.step2_reframe }, step3: { question: segSurvey.step3_question, reframe: segSurvey.step3_reframe } } : {},
      },
      label: result.label,
      weight: result.weight,
      step3_diagnostic: result.step3_diagnostic,
      mouse_features: {},
      segment: { startTime: seg?.startTime, endTime: seg?.endTime },
    };

    allAnnotationsRef.current.push(annotation);
    await saveAnnotation(annotation);

    const updatedSegments = [...segs];
    updatedSegments[segIndex] = {
      ...updatedSegments[segIndex],
      annotated: true,
      x_coordinate: result.label.x_coordinate,
      y_coordinate: result.label.y_coordinate,
      computed_quadrant: result.label.computed_quadrant,
      confidence_x: result.weight.confidence_x,
      confidence_y: result.weight.confidence_y,
      confidence_avg: result.weight.confidence_avg,
      consistency_bonus: result.weight.consistency_bonus,
      final_sample_weight: result.weight.final_sample_weight,
      final_state: result.label.computed_quadrant,
    };
    setSegments(updatedSegments);

    if (policy.showStep3 && s3) {
      await recordAnnotation(result.step3_diagnostic.is_consistent);
      const newPolicy = await getStep3Policy();
      setStep3Policy(newPolicy);
    }

    setPage(PAGES.RESULT);
  }, []);

  const handleStep1Complete = useCallback((option, confidence) => {
    draft.current.step1 = { option, confidence };
    setPage(PAGES.STEP2);
  }, []);

  const handleStep2Complete = useCallback((option, confidence) => {
    draft.current.step2 = { option, confidence };
    const policy = dataRef.current.step3Policy;
    if (policy.showStep3) {
      setPage(PAGES.STEP3);
    } else {
      finalize(draft.current.step1, draft.current.step2, null, null);
    }
  }, [finalize]);

  const handleStep3Complete = useCallback((option, confidence) => {
    finalize(draft.current.step1, draft.current.step2, option, confidence);
  }, [finalize]);

  const handleNextSegment = useCallback(() => {
    const { currentSegIdx: csi, readingIndices: ri, vlmResults: vlm, surveyResults: sr } = dataRef.current;
    const nextIdx = csi + 1;
    if (nextIdx < ri.length) {
      setCurrentSegIdx(nextIdx);
      const segIdx = ri[nextIdx];
      const llmSurvey = sr[segIdx];
      const vlmData = vlm[segIdx];
      setSurvey(llmSurvey || (vlmData ? buildSurvey(vlmData) : null));
      draft.current = { step1: null, step2: null };
      setAnnotationResult(null);
      setPage(PAGES.STEP0);
    } else {
      goToOverview();
    }
  }, [goToOverview]);

  const totalSteps = step3Policy.showStep3 ? 3 : 2;

  const annotatedCount = segments.filter(s => s.annotated).length;
  const totalAnnotatable = readingIndices.length;
  const showHouseProgress = totalAnnotatable > 0
    && page !== PAGES.PROCESSING
    && page !== PAGES.OVERVIEW;

  const pageProps = {
    segments, scrollData, mouseData, vlmResults, surveyResults, duration, videoBlob, cropRect,
    readingIndices, currentSegIdx, totalSteps,
    survey, step3Policy, annotationResult,
    allAnnotations: allAnnotationsRef.current,
    currentVlm: currentVlm(),
    currentSegment: currentSegment(),
  };

  return (
    <div className="app-root">
      <AnimatePresence mode="wait">
        {page === PAGES.PROCESSING && (
          <ProcessingPage key="processing" onComplete={handleProcessingComplete} />
        )}
        {page === PAGES.STEP0 && (
          <Step0Trigger key="step0" {...pageProps} onStart={startAnnotation} />
        )}
        {page === PAGES.STEP1 && (
          <Step1Agency key="step1" {...pageProps} onComplete={handleStep1Complete} onBack={() => setPage(PAGES.STEP0)} />
        )}
        {page === PAGES.STEP2 && (
          <Step2Load key="step2" {...pageProps} onComplete={handleStep2Complete} onBack={() => setPage(PAGES.STEP1)} />
        )}
        {page === PAGES.STEP3 && (
          <Step3Verify key="step3" {...pageProps} onComplete={handleStep3Complete} onBack={() => setPage(PAGES.STEP2)} />
        )}
        {page === PAGES.RESULT && (
          <ResultPage key="result" {...pageProps} onNext={handleNextSegment} onOverview={goToOverview} />
        )}
        {page === PAGES.OVERVIEW && (
          <OverviewPage key="overview" {...pageProps} />
        )}
      </AnimatePresence>

      {showHouseProgress && (
        <HouseProgress annotatedCount={annotatedCount} total={totalAnnotatable} />
      )}
    </div>
  );
}
