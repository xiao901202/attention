/**
 * Popup Script - Handles UI updates and user interactions
 */

// DOM Elements
const mainToggle = document.getElementById('mainToggle');
const indicatorToggle = document.getElementById('indicatorToggle');
const stateCard = document.getElementById('stateCard');
const stateIcon = document.getElementById('stateIcon');
const stateValue = document.getElementById('stateValue');
const speedValue = document.getElementById('speedValue');
const zscoreValue = document.getElementById('zscoreValue');
const densityValue = document.getElementById('densityValue');
const meanValue = document.getElementById('meanValue');
const readingTime = document.getElementById('readingTime');
const zombieTime = document.getElementById('zombieTime');
const readingBar = document.getElementById('readingBar');
const zombieBar = document.getElementById('zombieBar');
const focusRatio = document.getElementById('focusRatio');
const resetBtn = document.getElementById('resetBtn');
const notActiveOverlay = document.getElementById('notActiveOverlay');

// Recording Elements
const btnStartRecord = document.getElementById('btnStartRecord');
const btnAnnotate = document.getElementById('btnAnnotate');

// State icons
const stateIcons = {
  'IDLE': '💤',
  'READING_FLOW': '📖',
  'SCANNING_ZOMBIE': '🧟',
  'NAVIGATING': '🧭'
};

const stateLabels = {
  'IDLE': '閒置',
  'READING_FLOW': '專注閱讀',
  'SCANNING_ZOMBIE': '無意識滾動',
  'NAVIGATING': '瀏覽中'
};

// Format time (ms to M:SS)
function formatTime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

// Update UI with current state
function updateUI(data) {
  if (!data) return;

  const { state, metrics, stats } = data;

  // Update state display
  stateCard.className = `state-card state-${state}`;
  stateIcon.textContent = stateIcons[state] || '❓';
  stateValue.textContent = stateLabels[state] || state;

  // Update metrics
  if (metrics) {
    speedValue.textContent = Math.round(metrics.currentSpeed);
    zscoreValue.textContent = metrics.zScore.toFixed(2);
    densityValue.textContent = Math.round(metrics.stopDensity * 100);
    meanValue.textContent = Math.round(metrics.meanSpeed);
  }

  // Update stats
  if (stats) {
    readingTime.textContent = formatTime(stats.readingTime);
    zombieTime.textContent = formatTime(stats.zombieTime);

    // Calculate bar widths
    const totalActive = stats.readingTime + stats.zombieTime;
    if (totalActive > 0) {
      const readingPct = (stats.readingTime / totalActive) * 100;
      const zombiePct = (stats.zombieTime / totalActive) * 100;
      readingBar.style.width = `${readingPct}%`;
      zombieBar.style.width = `${zombiePct}%`;
      focusRatio.textContent = `${Math.round(readingPct)}%`;
    } else {
      readingBar.style.width = '0%';
      zombieBar.style.width = '0%';
      focusRatio.textContent = '--%';
    }
  }
}

// Query current tab for status
async function queryCurrentTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab || !tab.url) {
      showNotActive();
      return;
    }

    // Check if URL is a valid web page (not chrome://, about:, etc.)
    const isValidUrl = tab.url.startsWith('http://') || tab.url.startsWith('https://');
    
    if (!isValidUrl) {
      showNotActive();
      return;
    }

    hideNotActive();

    // Get status from content script
    chrome.tabs.sendMessage(tab.id, { type: 'GET_STATUS' }, (response) => {
      if (chrome.runtime.lastError) {
        console.log('Content script not ready:', chrome.runtime.lastError.message);
        // Try to show UI anyway - content script may just need to load
        return;
      }
      updateUI(response);
    });
  } catch (error) {
    console.error('Error querying tab:', error);
    showNotActive();
  }
}

function showNotActive() {
  notActiveOverlay.classList.add('show');
}

function hideNotActive() {
  notActiveOverlay.classList.remove('show');
}

// Initialize
async function init() {
  // Load saved settings
  const settings = await chrome.storage.sync.get(['enabled', 'showIndicator']);
  mainToggle.checked = settings.enabled !== false;
  indicatorToggle.checked = settings.showIndicator !== false;

  // Query current tab
  queryCurrentTab();

  // Check recording state
  await updateRecordingUI();

  // Listen for updates from content script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'STATE_CHANGE' || message.type === 'STATS_UPDATE') {
      updateUI({
        state: message.state,
        metrics: message.metrics,
        stats: message.stats
      });
    }
  });
}

// Recording Functions
async function updateRecordingUI() {
  const data = await chrome.storage.local.get(['hasRecordingData']);
  btnAnnotate.disabled = !data.hasRecordingData;
}

function openRecorderPage() {
  // Open recorder page in new tab
  chrome.tabs.create({ url: chrome.runtime.getURL('recorder/recorder.html') });
}

function openAnnotationPage() {
  chrome.tabs.create({ url: chrome.runtime.getURL('annotation/dist/index.html') });
}

// Event Listeners
mainToggle.addEventListener('change', async () => {
  const enabled = mainToggle.checked;
  await chrome.storage.sync.set({ enabled });
  
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_ENGINE', enabled });
  }
});

indicatorToggle.addEventListener('change', async () => {
  const show = indicatorToggle.checked;
  await chrome.storage.sync.set({ showIndicator: show });
  
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_INDICATOR', show });
  }
});

resetBtn.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    chrome.tabs.sendMessage(tab.id, { type: 'RESET_STATS' }, (response) => {
      if (response && response.success) {
        // Reset UI
        speedValue.textContent = '0';
        zscoreValue.textContent = '0.00';
        densityValue.textContent = '0';
        meanValue.textContent = '0';
        readingTime.textContent = '0:00';
        zombieTime.textContent = '0:00';
        readingBar.style.width = '0%';
        zombieBar.style.width = '0%';
        focusRatio.textContent = '--%';
        stateCard.className = 'state-card state-IDLE';
        stateIcon.textContent = '💤';
        stateValue.textContent = '閒置';
      }
    });
  }
});

// Recording button listeners
btnStartRecord.addEventListener('click', () => {
  openRecorderPage();
});

btnAnnotate.addEventListener('click', () => {
  openAnnotationPage();
});

// VLM Test page
const openVLMTest = document.getElementById('openVLMTest');
if (openVLMTest) {
  openVLMTest.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('vlm-test/vlm-test.html') });
    window.close();
  });
}

// Start
init();

// Refresh data periodically while popup is open
setInterval(queryCurrentTab, 1000);
