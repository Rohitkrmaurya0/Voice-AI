// Local Storage Keys
const STORAGE_KEYS = {
  API_KEY: 'aura_voice_gemini_key',
  TOPIC: 'aura_voice_custom_topic',
  MODEL: 'aura_voice_gemini_model'
};

// Default States
let apiKey = localStorage.getItem(STORAGE_KEYS.API_KEY) || '';
let userTopic = localStorage.getItem(STORAGE_KEYS.TOPIC) || 'General Assistant (Kuch Bhi Puchhein)';
let selectedModel = localStorage.getItem(STORAGE_KEYS.MODEL) || 'gemini-3.5-flash-lite';

let activeMediaStream = null;
let speechRecognizer = null;
let isCallActive = false;
let isMicMuted = false;
let isAISpeaking = false;
let callDuration = 0;
let timerInterval = null;
let ttsHeartbeat = null;

// DOM Selectors
const homeScreen = document.getElementById('home-screen');
const callScreen = document.getElementById('call-screen');
const configModal = document.getElementById('config-modal');

const displayTopic = document.getElementById('display-topic');
const callTopicIndicator = document.getElementById('call-topic-indicator');
const callDurationEl = document.getElementById('call-duration');
const callStatusPill = document.getElementById('call-status-pill');
const callAuraContainer = document.getElementById('call-aura-container');

const boxUser = document.getElementById('box-user');
const boxAI = document.getElementById('box-ai');
const lblUserState = document.getElementById('lbl-user-state');
const lblAIState = document.getElementById('lbl-ai-state');

const btnCallNow = document.getElementById('btn-call-now');
const btnEndCall = document.getElementById('btn-end-call');
const btnMuteMic = document.getElementById('btn-mute-mic');
const btnOpenConfig = document.getElementById('btn-open-config');
const btnCloseConfig = document.getElementById('btn-close-config');
const btnSaveConfig = document.getElementById('btn-save-config');

const cfgApiKey = document.getElementById('cfg-api-key');
const cfgTopic = document.getElementById('cfg-topic');
const cfgModel = document.getElementById('cfg-model');

// --- Initialization ---
function initApp() {
  updateTopicDisplays();
  if (!apiKey) {
    openConfigModal();
  }
}
initApp();

function updateTopicDisplays() {
  displayTopic.textContent = userTopic;
  callTopicIndicator.textContent = userTopic;
}

// --- Settings Handlers ---
function openConfigModal() {
  cfgApiKey.value = apiKey;
  cfgTopic.value = userTopic;
  cfgModel.value = selectedModel;
  configModal.classList.add('active');
}

btnOpenConfig.addEventListener('click', openConfigModal);
btnCloseConfig.addEventListener('click', () => configModal.classList.remove('active'));

btnSaveConfig.addEventListener('click', () => {
  const enteredKey = cfgApiKey.value.trim();
  const enteredTopic = cfgTopic.value.trim() || 'General Assistant';
  const enteredModel = cfgModel.value;

  if (!enteredKey) {
    alert('Kripya apni Gemini API Key daalein!');
    return;
  }

  apiKey = enteredKey;
  userTopic = enteredTopic;
  selectedModel = enteredModel;

  localStorage.setItem(STORAGE_KEYS.API_KEY, apiKey);
  localStorage.setItem(STORAGE_KEYS.TOPIC, userTopic);
  localStorage.setItem(STORAGE_KEYS.MODEL, selectedModel);

  updateTopicDisplays();
  configModal.classList.remove('active');
});

// --- Dynamic Prompt Generator ---
function buildDynamicSystemInstruction() {
  return `You are an authentic, smart, and friendly voice-calling AI Assistant.
Specialized Topic/Role defined by user: "${userTopic}".

Rules for voice call conversation:
1. Speak in polite, conversational Hindi or Hinglish (as natural as a human speaking on a phone call).
2. Keep every reply concise (strictly 1 to 2 short sentences, maximum 25 words).
3. Directly answer the question or assist regarding the topic.
4. End with 1 short, engaging question to keep the conversation flowing.
5. Do not use asterisks, markdown, emojis, or bullet points because this will be spoken out loud.`;
}

// --- Start Voice Call ---
btnCallNow.addEventListener('click', async () => {
  if (!apiKey) {
    alert('Pehle apni Gemini API Key enter karein!');
    openConfigModal();
    return;
  }

  try {
    // Single persistent audio permission request
    activeMediaStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    });

    startCallView();
  } catch (err) {
    alert('Microphone permission zaroori hai voice call ke liye: ' + err.message);
  }
});

function startCallView() {
  isCallActive = true;
  homeScreen.classList.remove('active');
  callScreen.classList.add('active');

  callDuration = 0;
  callDurationEl.textContent = '00:00';
  timerInterval = setInterval(() => {
    callDuration++;
    const m = String(Math.floor(callDuration / 60)).padStart(2, '0');
    const s = String(callDuration % 60).padStart(2, '0');
    callDurationEl.textContent = `${m}:${s}`;
  }, 1000);

  initContinuousSpeechRecognizer();

  // Initial Natural Greeting based on Topic
  callStatusPill.textContent = 'Assistant bol raha hai...';
  callStatusPill.className = 'status-badge speaking';
  setTurnState('ai_speaking');

  const greeting = `Namaste! Main aapka AI assistant hoon. Aaj hum "${userTopic}" ke baare me baat karenge. Aap kya poochna chahte hain?`;
  speakNaturalSpokenVoice(greeting);
}

// --- Speech Recognition (Continuous Native Browser STT) ---
function initContinuousSpeechRecognizer() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    alert('Aapke browser me Web Speech API supported nahi hai. Kripya Chrome use karein.');
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

    // User paused/finished speaking -> Switch to AI Thinking
    setTurnState('ai_thinking');
    callStatusPill.textContent = 'AI soch raha hai...';
    callStatusPill.className = 'status-badge';

    const aiResponse = await queryGeminiDirect(transcript);
    if (isCallActive) {
      callStatusPill.textContent = 'Assistant bol raha hai...';
      callStatusPill.className = 'status-badge speaking';
      setTurnState('ai_speaking');
      speakNaturalSpokenVoice(aiResponse);
    }
  };

  speechRecognizer.onerror = (e) => {
    if (e.error !== 'no-speech' && isCallActive) {
      console.warn('Speech engine:', e.error);
    }
  };

  speechRecognizer.onend = () => {
    // Auto-revive without triggering browser prompt
    if (isCallActive && !isAISpeaking) {
      try { speechRecognizer.start(); } catch (err) {}
    }
  };

  try {
    speechRecognizer.start();
  } catch (err) {}
}

// --- Gemini API Query ---
async function queryGeminiDirect(userQuery) {
  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${apiKey}`;
    const payload = {
      systemInstruction: { parts: [{ text: buildDynamicSystemInstruction() }] },
      contents: [{ role: 'user', parts: [{ text: userQuery }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 90 }
    };

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (data.candidates && data.candidates[0].content.parts[0].text) {
      return data.candidates[0].content.parts[0].text.replace(/[\*\#\_]/g, '').trim();
    }
    return 'Maaf kijiyega, aapki baat clear nahi aayi. Kya aap dobara bol sakte hain?';
  } catch (err) {
    return 'Connection me thodi dikkat aayi. Aap ek baar dobara poochhenge?';
  }
}

// --- Natural Voice Output (SpeechSynthesis) ---
function speakNaturalSpokenVoice(text) {
  if (!('speechSynthesis' in window) || !isCallActive) return;

  window.speechSynthesis.cancel();
  isAISpeaking = true;

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'hi-IN';
  utterance.rate = 0.95;
  utterance.pitch = 1.0;

  // Best Indian Hindi/English Voice Selection
  const voices = window.speechSynthesis.getVoices();
  const naturalVoice = voices.find(v => v.lang.includes('hi') || v.name.includes('Google हिन्दी') || v.name.includes('Swara') || v.name.includes('India'));
  if (naturalVoice) utterance.voice = naturalVoice;

  // Heartbeat to prevent Chrome cutoff
  clearInterval(ttsHeartbeat);
  ttsHeartbeat = setInterval(() => {
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.pause();
      window.speechSynthesis.resume();
    }
  }, 3500);

  utterance.onend = () => {
    clearInterval(ttsHeartbeat);
    if (!isCallActive) return;

    isAISpeaking = false;
    setTurnState('user_speaking');
    callStatusPill.textContent = 'Aapki baari hai, boliye...';
    callStatusPill.className = 'status-badge listening';

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

// --- Mutual Exclusive Turn State Management ---
function setTurnState(state) {
  if (state === 'ai_speaking') {
    boxAI.className = 'dock-card active-ai';
    boxUser.className = 'dock-card';
    lblAIState.textContent = 'Bol raha hai...';
    lblUserState.textContent = 'Aap sun rahe hain';
    callAuraContainer.classList.add('speaking');
  } else if (state === 'ai_thinking') {
    boxAI.className = 'dock-card';
    boxUser.className = 'dock-card';
    lblAIState.textContent = 'Soch raha hai...';
    lblUserState.textContent = 'Rukein...';
    callAuraContainer.classList.remove('speaking');
  } else if (state === 'user_speaking') {
    boxAI.className = 'dock-card';
    boxUser.className = 'dock-card active-user';
    lblAIState.textContent = 'Sun raha hai...';
    lblUserState.textContent = 'Boliye...';
    callAuraContainer.classList.remove('speaking');
  }
}

// --- Controls: Mic Mute / Hangup ---
btnMuteMic.addEventListener('click', () => {
  isMicMuted = !isMicMuted;
  if (isMicMuted) {
    btnMuteMic.querySelector('.btn-icon-wrapper').style.background = '#ff3b30';
    btnMuteMic.querySelector('label').textContent = 'Muted';
  } else {
    btnMuteMic.querySelector('.btn-icon-wrapper').style.background = '#1f2c34';
    btnMuteMic.querySelector('label').textContent = 'Mic';
  }
});

btnEndCall.addEventListener('click', terminateActiveCall);

function terminateActiveCall() {
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
