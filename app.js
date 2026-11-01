// State & Storage Keys
const STORAGE_KEYS = {
  PIN: 'aarogya_security_pin',
  API_KEY: 'aarogya_gemini_key',
  MODEL: 'aarogya_gemini_model'
};

// Acupressure System Persona
const SYSTEM_PROMPT = `You are Dr. Aarogya, a gentle, wise female Indian acupressure and reflexology doctor. 
- You speak in polite, warm, conversational Hindi (or Hinglish). 
- Always respond in 1 to 2 small, comforting sentences (under 25 words).
- Immediately suggest the exact practical acupressure point (e.g., LI4/Hegu for headache, PC6/Neiguan for acidity/nausea, Yin Tang for stress/insomnia, ST36 for fatigue).
- Always end with 1 short natural conversational question to ask if they found the point.
- Never give long medical lectures. Talk naturally like a real phone call.`;

let currentPin = localStorage.getItem(STORAGE_KEYS.PIN) || '1234';
let apiKey = localStorage.getItem(STORAGE_KEYS.API_KEY) || '';
let selectedModel = localStorage.getItem(STORAGE_KEYS.MODEL) || 'gemini-3.5-flash-lite';

let activeMediaStream = null;
let speechRecognizer = null;
let isCallActive = false;
let isMicMuted = false;
let isAISpeaking = false;
let callDuration = 0;
let timerInterval = null;
let ttsHeartbeat = null;

// DOM Elements
const pinScreen = document.getElementById('pin-screen');
const homeScreen = document.getElementById('home-screen');
const callScreen = document.getElementById('call-screen');
const settingsModal = document.getElementById('settings-modal');

const pinInput = document.getElementById('pin-input');
const pinError = document.getElementById('pin-error');
const btnUnlock = document.getElementById('btn-unlock');

const btnStartCall = document.getElementById('btn-start-call');
const btnHangup = document.getElementById('btn-hangup');
const btnToggleMic = document.getElementById('btn-toggle-mic');
const micIcon = document.getElementById('mic-icon');
const callTimer = document.getElementById('call-timer');
const callStatus = document.getElementById('call-status');
const callAvatarWrap = document.getElementById('call-avatar-wrap');

const boxUser = document.getElementById('box-user');
const boxAI = document.getElementById('box-ai');
const textUserState = document.getElementById('text-user-state');
const textAIState = document.getElementById('text-ai-state');

// Settings Elements
const btnOpenSettings = document.getElementById('btn-open-settings');
const btnCloseSettings = document.getElementById('btn-close-settings');
const btnSaveSettings = document.getElementById('btn-save-settings');
const inputApiKey = document.getElementById('input-api-key');
const selectModel = document.getElementById('select-model');
const inputNewPin = document.getElementById('input-new-pin');

// --- 1. PIN Security Logic ---
btnUnlock.addEventListener('click', () => {
  const entered = pinInput.value.trim();
  if (entered === currentPin) {
    pinError.textContent = '';
    pinScreen.classList.remove('active');
    homeScreen.classList.add('active');
    checkApiKeySetup();
  } else {
    pinError.textContent = 'अमान्य PIN! कृपया सही 4-अंकों का PIN दर्ज करें।';
    pinInput.value = '';
    pinInput.focus();
  }
});

pinInput.addEventListener('keyup', (e) => {
  if (e.key === 'Enter') btnUnlock.click();
});

function checkApiKeySetup() {
  if (!apiKey) {
    settingsModal.classList.add('active');
  }
}

// Settings Modal Handlers
btnOpenSettings.addEventListener('click', () => {
  inputApiKey.value = apiKey;
  selectModel.value = selectedModel;
  inputNewPin.value = currentPin;
  settingsModal.classList.add('active');
});

btnCloseSettings.addEventListener('click', () => {
  settingsModal.classList.remove('active');
});

btnSaveSettings.addEventListener('click', () => {
  const newKey = inputApiKey.value.trim();
  const newMod = selectModel.value;
  const newP = inputNewPin.value.trim();

  if (newP && newP.length === 4) {
    currentPin = newP;
    localStorage.setItem(STORAGE_KEYS.PIN, newP);
  }

  apiKey = newKey;
  selectedModel = newMod;
  localStorage.setItem(STORAGE_KEYS.API_KEY, newKey);
  localStorage.setItem(STORAGE_KEYS.MODEL, newMod);

  settingsModal.classList.remove('active');
  alert('सेटिंग्स सुरक्षित रूप से सेव हो गईं!');
});

// --- 2. Call Handlers & Persistent Mic ---
btnStartCall.addEventListener('click', async () => {
  if (!apiKey) {
    alert('कृपया पहले सेटिंग्स में जाकर अपनी Gemini API Key दर्ज करें!');
    settingsModal.classList.add('active');
    return;
  }

  try {
    // Single persistent audio permission request before starting call screen
    activeMediaStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    });

    initCallInterface();
  } catch (err) {
    alert('माइक्रोफोन अनुमति आवश्यक है: ' + err.message);
  }
});

function initCallInterface() {
  isCallActive = true;
  homeScreen.classList.remove('active');
  callScreen.classList.add('active');

  callDuration = 0;
  callTimer.textContent = '00:00';
  timerInterval = setInterval(() => {
    callDuration++;
    const m = String(Math.floor(callDuration / 60)).padStart(2, '0');
    const s = String(callDuration % 60).padStart(2, '0');
    callTimer.textContent = `${m}:${s}`;
  }, 1000);

  setupSpeechRecognition();

  // AI speaks first greeting
  callStatus.textContent = 'डॉ. आरोग्य बोल रही हैं...';
  setTurnState('ai_speaking');
  speakNaturalDoctorVoice('नमस्ते! मैं डॉ. आरोग्य हूँ। आपको शरीर में कहाँ दर्द या परेशानी महसूस हो रही है?');
}

// Web Speech Recognition (Single Continuous Pipeline)
function setupSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    alert('आपके ब्राउज़र में Web Speech API उपलब्ध नहीं है। कृपया Chrome उपयोग करें।');
    return;
  }

  speechRecognizer = new SpeechRecognition();
  speechRecognizer.lang = 'hi-IN';
  speechRecognizer.continuous = true;
  speechRecognizer.interimResults = false;

  speechRecognizer.onresult = async (event) => {
    if (isAISpeaking || isMicMuted || !isCallActive) return;

    const transcript = event.results[event.results.length - 1][0].transcript.trim();
    if (!transcript) return;

    // User finished speaking, transfer to AI
    setTurnState('ai_thinking');
    callStatus.textContent = 'डॉ. आरोग्य सोच रही हैं...';

    const reply = await queryGeminiAPI(transcript);
    if (isCallActive) {
      callStatus.textContent = 'डॉ. आरोग्य बोल रही हैं...';
      setTurnState('ai_speaking');
      speakNaturalDoctorVoice(reply);
    }
  };

  speechRecognizer.onerror = (e) => {
    if (e.error !== 'no-speech' && isCallActive) {
      console.warn('Speech Engine Notice:', e.error);
    }
  };

  speechRecognizer.onend = () => {
    // Auto-restart quietly without reprompting permission
    if (isCallActive && !isAISpeaking) {
      try { speechRecognizer.start(); } catch (err) {}
    }
  };

  try {
    speechRecognizer.start();
  } catch (e) {}
}

// --- 3. Gemini Flash-Lite API Query ---
async function queryGeminiAPI(userText) {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${apiKey}`;
    const payload = {
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: userText }] }],
      generationConfig: { temperature: 0.6, maxOutputTokens: 80 }
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (data.candidates && data.candidates[0].content.parts[0].text) {
      return data.candidates[0].content.parts[0].text.replace(/[\*\#\_]/g, '').trim();
    }
    return 'माफ़ कीजियेगा, क्या आप अपना दर्द एक बार फिर बता सकते हैं?';
  } catch (err) {
    return 'आपकी आवाज़ साफ़ नहीं आ पाई। सिर या पेट में कहाँ तकलीफ़ है?';
  }
}

// --- 4. Natural Voice Playback & Turn Management ---
function speakNaturalDoctorVoice(text) {
  if (!('speechSynthesis' in window) || !isCallActive) return;

  window.speechSynthesis.cancel();
  isAISpeaking = true;

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'hi-IN';
  utterance.rate = 0.93;
  utterance.pitch = 1.0;

  // Best Indian Hindi Voice Selection
  const voices = window.speechSynthesis.getVoices();
  const hiVoice = voices.find(v => v.lang.includes('hi') || v.name.includes('Google हिन्दी') || v.name.includes('Swara'));
  if (hiVoice) utterance.voice = hiVoice;

  // Keep-alive heartbeat against Android Chrome audio cutoff
  clearInterval(ttsHeartbeat);
  ttsHeartbeat = setInterval(() => {
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.pause();
      window.speechSynthesis.resume();
    }
  }, 4000);

  utterance.onend = () => {
    clearInterval(ttsHeartbeat);
    if (!isCallActive) return;

    isAISpeaking = false;
    setTurnState('user_speaking');
    callStatus.textContent = 'आपकी बारी है, बोलिए...';

    // Safely resume listening
    if (speechRecognizer) {
      try { speechRecognizer.start(); } catch (e) {}
    }
  };

  utterance.onerror = () => {
    clearInterval(ttsHeartbeat);
    isAISpeaking = false;
    setTurnState('user_speaking');
  };

  window.speechSynthesis.speak(utterance);
}

// State Machine UI Sync
function setTurnState(state) {
  if (state === 'ai_speaking') {
    boxAI.className = 'turn-box active';
    boxUser.className = 'turn-box';
    textAIState.textContent = 'बोल रही हैं...';
    textUserState.textContent = 'आप सुन रहे हैं...';
    callAvatarWrap.classList.add('active');
  } else if (state === 'ai_thinking') {
    boxAI.className = 'turn-box';
    boxUser.className = 'turn-box';
    textAIState.textContent = 'विचार कर रही हैं...';
    textUserState.textContent = 'रुकें...';
    callAvatarWrap.classList.remove('active');
  } else if (state === 'user_speaking') {
    boxAI.className = 'turn-box';
    boxUser.className = 'turn-box active-user';
    textAIState.textContent = 'सुन रही हैं...';
    textUserState.textContent = 'आप बोल रहे हैं...';
    callAvatarWrap.classList.remove('active');
  }
}

// Mic Mute Toggle
btnToggleMic.addEventListener('click', () => {
  isMicMuted = !isMicMuted;
  if (isMicMuted) {
    micIcon.textContent = '🔇';
    btnToggleMic.style.background = '#ea4335';
  } else {
    micIcon.textContent = '🎤';
    btnToggleMic.style.background = '#202c33';
  }
});

// --- 5. Clean Hangup & Immediate Mic Hardware Release ---
btnHangup.addEventListener('click', terminateCall);

function terminateCall() {
  isCallActive = false;
  isAISpeaking = false;

  clearInterval(timerInterval);
  clearInterval(ttsHeartbeat);

  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }

  if (speechRecognizer) {
    try { speechRecognizer.stop(); } catch (e) {}
    speechRecognizer = null;
  }

  // Turn off hardware microphone track (removes browser red recording dot immediately)
  if (activeMediaStream) {
    activeMediaStream.getTracks().forEach(track => track.stop());
    activeMediaStream = null;
  }

  callScreen.classList.remove('active');
  homeScreen.classList.add('active');
}
