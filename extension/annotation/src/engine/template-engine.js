const TEMPLATES = {
  step1: {
    question: {
      high_arousal: (topic) => `剛剛你在看「${topic}」，這是你自己想看的嗎？`,
      neutral:      (topic) => `剛剛你在看「${topic}」，這比較像是哪一種情況？`,
      low_arousal:  (topic) => `剛剛看到的「${topic}」，你原本就想看嗎？`,
    },
    reframe: {
      high_arousal: (topic) => `換個方式問：你是怎麼發現這個「${topic}」的？`,
      neutral:      () => `換個方式問：如果動態牆沒推這則，你會自己去找嗎？`,
      low_arousal:  () => `換個方式問：你平常會主動搜尋這類內容嗎？`,
    },
  },
  step2: {
    question: {
      high_density: '看這些內容的時候，你的腦袋運作狀態比較接近？',
      low_density:  '瀏覽的時候，你的注意力大概是什麼狀態？',
    },
    reframe: {
      high_density: '換個方式問：如果現在要你複述內容重點，你做得到嗎？',
      low_density:  '換個方式問：剛才的內容，你現在還記得多少？',
    },
  },
};

const STEP1_OPTIONS = {
  A: {
    title: '我本來就想看的',
    description: '這個主題我一直有在關注，或是我主動搜尋、點進來的。',
    baseScore: 1,
  },
  B: {
    title: '滑到就停下來了',
    description: '本來沒打算看這個，是動態牆推給我、或標題吸引我停下來的。',
    baseScore: -1,
  },
};

const STEP2_OPTIONS = {
  high_density: {
    A: {
      title: '有在認真理解',
      description: '我有在思考內容的邏輯，試著理解或消化這些資訊。',
      baseScore: 1,
    },
    B: {
      title: '看了但沒真的在想',
      description: '眼睛有在看，但腦袋沒有跟上，資訊進去又出來了。',
      baseScore: -1,
    },
  },
  low_density: {
    A: {
      title: '有稍微動腦',
      description: '不算很專心，但也不是完全放空，有在接收內容。',
      baseScore: 1,
    },
    B: {
      title: '幾乎沒在想',
      description: '就是輕鬆掃過去，幾乎不需要用到腦力。',
      baseScore: -1,
    },
  },
};

const STEP3_OPTIONS = {
  A: { title: '蠻充實的', description: '覺得有學到東西，或是解決了心中的疑問。', quadrant: 'Q1' },
  B: { title: '蠻放鬆的', description: '心情不錯，看完覺得輕鬆或會心一笑。', quadrant: 'Q2' },
  C: { title: '有點煩', description: '覺得資訊太多、情緒被攪動，或是有種說不上來的焦慮。', quadrant: 'Q3' },
  D: { title: '沒什麼感覺', description: '就是在滑而已，沒有特別的情緒或想法。', quadrant: 'Q4' },
};

export function buildSurvey(vlmResult) {
  const arousalKey = vlmResult.emotional_arousal === 'High' ? 'high_arousal'
    : vlmResult.emotional_arousal === 'Low' ? 'low_arousal' : 'neutral';
  const densityKey = vlmResult.information_density === 'High' ? 'high_density' : 'low_density';
  const topic = vlmResult.topic || '你剛才看的內容';

  return {
    step1_question: TEMPLATES.step1.question[arousalKey](topic),
    step1_reframe:  TEMPLATES.step1.reframe[arousalKey](topic),
    step2_question: TEMPLATES.step2.question[densityKey],
    step2_reframe:  TEMPLATES.step2.reframe[densityKey],
    step1_options: STEP1_OPTIONS,
    step2_options: STEP2_OPTIONS[densityKey],
    step3_options: STEP3_OPTIONS,
    step3_question: '準備往下滑的這個瞬間，最接近你的狀態是？',
    step3_reframe: '換個方式問：如果要用一個詞描述剛才的閱讀體驗，你會選？',
    _isFallback: true,
  };
}

export const getFallbackSurvey = buildSurvey;
