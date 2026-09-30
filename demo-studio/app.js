// ─────────────────────────────────────────────────────────────────────────────
// Monevo Demo Studio & Video Generator Engine
// ─────────────────────────────────────────────────────────────────────────────

let storyboardData = null;
let currentTime = 0;
let totalDuration = 27.0; // seconds for full onboarding + voice mode switch + voice reply + receipt + report
let isPlaying = false;
let playbackSpeed = 1.0;
let animationFrameId = null;
let lastTimestamp = null;
let activeRenderedScenes = new Set();
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;

// Feature toggles
let autoInspectReceipt = true;
let viewerCurrentlyOpen = false;

// ── Web Audio API Synthetic WhatsApp Sound Effects & TTS ─────────────────────
const AudioFX = {
  ctx: null,
  init() {
    if (!this.ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContext();
    }
  },
  playSendPop() {
    try {
      this.init();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(580, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(780, this.ctx.currentTime + 0.06);
      gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.08);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.08);
    } catch (e) {
      console.warn('AudioFX error:', e);
    }
  },
  playReceiveChime() {
    try {
      this.init();
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      [880, 1174].forEach((freq, i) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t + i * 0.07);
        gain.gain.setValueAtTime(0.12, t + i * 0.07);
        gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.07 + 0.18);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(t + i * 0.07);
        osc.stop(t + i * 0.07 + 0.18);
      });
    } catch (e) {
      console.warn('AudioFX error:', e);
    }
  },
  speakMonevoVoice(rawText) {
    if (!('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      // Clean HTML tags and symbols for natural speech
      let clean = rawText
        .replace(/<[^>]*>/g, '')
        .replace(/₦\s*([\d,]+)/g, '$1 naira')
        .replace(/\$\s*([\d,]+)/g, '$1 dollars')
        .replace(/\+/g, 'plus ')
        .replace(/REC-[A-Z0-9-]+/gi, 'verified receipt')
        .trim();

      const utterance = new SpeechSynthesisUtterance(clean);
      utterance.rate = 1.05;
      utterance.pitch = 1.02;

      // Select natural English voice if available
      const voices = window.speechSynthesis.getVoices();
      const preferred = voices.find(v => v.lang.startsWith('en') && (v.name.includes('Samantha') || v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Siri')));
      if (preferred) utterance.voice = preferred;

      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.warn('Speech synthesis error:', err);
    }
  }
};

// ── Default Storyboard State ──────────────────────────────────────────────────
const DEFAULT_STORYBOARD = {
  config: {
    botName: "Monevo AI",
    botStatus: "online",
    userName: "Japheth Adamu",
    currency: "NGN",
    currencySymbol: "₦"
  },
  scenes: [
    {
      id: 1,
      time: 0.5,
      type: "user_text",
      text: "Hi",
      timestamp: "09:38",
      status: "read"
    },
    {
      id: 2,
      time: 1.5,
      type: "bot_message",
      body: "Welcome to <b>Monevo</b>! 👋 I'm your WhatsApp AI financial assistant.<br><br>Before we begin, are you using me for:<br><br><b>1. Personal finances</b><br><b>2. Business finances</b>",
      interactiveButtons: ["1. Personal", "2. Business"],
      timestamp: "09:38"
    },
    {
      id: 3,
      time: 3.0,
      type: "user_text",
      text: "1. Personal finances",
      timestamp: "09:38",
      status: "read"
    },
    {
      id: 4,
      time: 3.9,
      type: "bot_message",
      body: "What's your name?",
      timestamp: "09:38"
    },
    {
      id: 5,
      time: 4.8,
      type: "user_text",
      text: "Japheth Adamu",
      timestamp: "09:39",
      status: "read"
    },
    {
      id: 6,
      time: 5.6,
      type: "bot_message",
      body: "What currency do you normally use?",
      timestamp: "09:39"
    },
    {
      id: 7,
      time: 6.5,
      type: "user_text",
      text: "NGN (₦)",
      timestamp: "09:39",
      status: "read"
    },
    {
      id: 8,
      time: 7.5,
      type: "bot_message",
      body: "You're all set. 🎉<br><br>You can now send voice notes or text to record income, track expenses, check balances, and generate instant receipts!",
      timestamp: "09:39"
    },
    {
      id: 9,
      time: 9.2,
      type: "user_text",
      text: "Switch to voice mode",
      timestamp: "09:40",
      status: "read"
    },
    {
      id: 10,
      time: 10.3,
      type: "bot_message",
      body: "✅ <b>Voice response mode enabled!</b><br>I will now reply with voice notes.",
      timestamp: "09:40"
    },
    {
      id: 11,
      time: 11.8,
      type: "user_voice_note",
      audioDuration: "0:04",
      transcript: "Paid 15,000 Naira for groceries at Ikeja market",
      timestamp: "09:41",
      status: "read"
    },
    {
      id: 12,
      time: 13.0,
      type: "processing_indicator",
      text: "🎙️ AssemblyAI transcribing voice note..."
    },
    {
      id: 13,
      time: 14.1,
      type: "processing_indicator",
      text: "⚡ Groq categorizing transaction..."
    },
    {
      id: 14,
      time: 15.2,
      type: "bot_voice_note",
      audioDuration: "0:04",
      voiceSpeech: "I've recorded your expense of 15,000 naira for groceries at Ikeja supermarket.",
      transcript: "I've recorded your expense of ₦15,000.00 for Groceries at Ikeja Supermarket.",
      timestamp: "09:41"
    },
    {
      id: 15,
      time: 16.5,
      type: "bot_receipt_card",
      image: "assets/sample-receipt.png",
      caption: "Monevo Verified Receipt #REC-20260930-8E4A",
      filesize: "142 KB · PNG",
      timestamp: "09:41"
    },
    {
      id: 16,
      time: 20.0,
      type: "user_voice_note",
      audioDuration: "0:03",
      transcript: "How much balance I get left this week? Send my report.",
      timestamp: "09:42",
      status: "read"
    },
    {
      id: 17,
      time: 21.3,
      type: "processing_indicator",
      text: "📊 Monevo compiling weekly intelligence..."
    },
    {
      id: 18,
      time: 22.6,
      type: "bot_voice_note",
      audioDuration: "0:05",
      voiceSpeech: "You have 122,550 naira net remaining this week. Delivering your weekly chart.",
      transcript: "You have ₦122,550.00 net remaining this week (+32% vs last week). Delivering your full weekly chart:",
      timestamp: "09:42"
    },
    {
      id: 19,
      time: 24.0,
      type: "bot_report_card",
      image: "assets/sample-report.png",
      caption: "Weekly Financial Intelligence Report",
      filesize: "168 KB · PNG",
      timestamp: "09:42"
    }
  ]
};

// ── Initialization ────────────────────────────────────────────────────────────
async function init() {
  try {
    const res = await fetch('storyboard.json');
    if (res.ok) {
      storyboardData = await res.json();
    } else {
      storyboardData = DEFAULT_STORYBOARD;
    }
  } catch (err) {
    storyboardData = DEFAULT_STORYBOARD;
  }

  // Calculate total duration from last scene + margin
  if (storyboardData.scenes && storyboardData.scenes.length > 0) {
    const lastScene = storyboardData.scenes[storyboardData.scenes.length - 1];
    totalDuration = Math.max(26.0, lastScene.time + 2.5);
  }

  // Load custom saved overrides if present
  const saved = localStorage.getItem('monevo_demo_custom_storyboard_v4');
  if (saved) {
    try {
      storyboardData = JSON.parse(saved);
    } catch (e) {}
  }

  setupEventListeners();
  populateCustomizerForm();
  updateHeaderDetails();
  updateModeButtonsUI();
  renderTimeline(0);
}

// ── UI Listeners ──────────────────────────────────────────────────────────────
function setupEventListeners() {
  const playBtn = document.getElementById('playBtn');
  const restartBtn = document.getElementById('restartBtn');
  const speedSelect = document.getElementById('speedSelect');
  const scrubber = document.getElementById('sliderTrack');
  const toggleDrawerBtn = document.getElementById('toggleDrawerBtn');
  const closeDrawerBtn = document.getElementById('closeDrawerBtn');
  const recordBtn = document.getElementById('recordBtn');
  const saveConfigBtn = document.getElementById('saveConfigBtn');
  const resetConfigBtn = document.getElementById('resetConfigBtn');
  const voiceModeBtn = document.getElementById('voiceModeBtn');
  const inspectModeBtn = document.getElementById('inspectModeBtn');
  const closeViewerBtn = document.getElementById('closeViewerBtn');
  const downloadViewerDocBtn = document.getElementById('downloadViewerDocBtn');

  playBtn.addEventListener('click', togglePlay);
  restartBtn.addEventListener('click', restart);

  speedSelect.addEventListener('change', (e) => {
    playbackSpeed = parseFloat(e.target.value);
  });

  scrubber.addEventListener('click', (e) => {
    const rect = scrubber.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, clickX / rect.width));
    seekTo(pct * totalDuration);
  });

  toggleDrawerBtn.addEventListener('click', () => {
    document.getElementById('customizerDrawer').classList.toggle('open');
  });

  closeDrawerBtn.addEventListener('click', () => {
    document.getElementById('customizerDrawer').classList.remove('open');
  });

  recordBtn.addEventListener('click', toggleRecording);

  saveConfigBtn.addEventListener('click', saveCustomConfig);
  resetConfigBtn.addEventListener('click', resetConfig);

  if (voiceModeBtn) {
    voiceModeBtn.addEventListener('click', () => {
      alert("In this demo scenario, the user switches to Voice Mode natively at 00:09 by typing 'Switch to voice mode', and Monevo returns audio voice notes!");
    });
  }

  if (inspectModeBtn) {
    inspectModeBtn.addEventListener('click', () => {
      autoInspectReceipt = !autoInspectReceipt;
      updateModeButtonsUI();
    });
  }

  if (closeViewerBtn) {
    closeViewerBtn.addEventListener('click', closeInPhoneViewer);
  }

  if (downloadViewerDocBtn) {
    downloadViewerDocBtn.addEventListener('click', () => {
      const src = document.getElementById('viewerImage').src;
      if (src) {
        const a = document.createElement('a');
        a.href = src;
        a.download = 'monevo_verified_document.png';
        a.click();
      }
    });
  }

  if ('speechSynthesis' in window) {
    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.getVoices();
    };
  }
}

function updateModeButtonsUI() {
  const voiceBtn = document.getElementById('voiceModeBtn');
  const inspectBtn = document.getElementById('inspectModeBtn');

  if (voiceBtn) {
    voiceBtn.innerHTML = '🎙️ Voice Mode Demo: ACTIVE';
    voiceBtn.classList.add('btn-toggle-active');
  }

  if (inspectBtn) {
    if (autoInspectReceipt) {
      inspectBtn.innerHTML = '🔍 Auto-View Receipt: ON';
      inspectBtn.classList.add('btn-toggle-active');
    } else {
      inspectBtn.innerHTML = '🔍 Auto-View Receipt: OFF';
      inspectBtn.classList.remove('btn-toggle-active');
    }
  }
}

function updateHeaderDetails() {
  document.getElementById('contactName').textContent = storyboardData.config.botName;
  document.getElementById('contactStatus').textContent = storyboardData.config.botStatus;
}

// ── In-Phone Native Media Viewer Controls ─────────────────────────────────────
function openInPhoneViewer(src, title, timestamp) {
  const viewer = document.getElementById('inPhoneViewer');
  const img = document.getElementById('viewerImage');
  const titleEl = document.getElementById('viewerTitle');
  const timeEl = document.getElementById('viewerTimestamp');

  img.src = src;
  titleEl.textContent = title || 'Document';
  timeEl.textContent = `Today at ${timestamp || '09:41'}`;
  viewer.classList.add('active');
  viewerCurrentlyOpen = true;
}

function closeInPhoneViewer() {
  const viewer = document.getElementById('inPhoneViewer');
  viewer.classList.remove('active');
  viewerCurrentlyOpen = false;
}

// ── Playback Controls ─────────────────────────────────────────────────────────
function togglePlay() {
  AudioFX.init();
  if (isPlaying) {
    pause();
  } else {
    play();
  }
}

function play() {
  if (currentTime >= totalDuration) {
    seekTo(0);
  }
  isPlaying = true;
  document.getElementById('playBtn').innerHTML = '⏸️';
  lastTimestamp = performance.now();
  animationFrameId = requestAnimationFrame(playbackLoop);
}

function pause() {
  isPlaying = false;
  document.getElementById('playBtn').innerHTML = '▶️';
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
}

function restart() {
  pause();
  closeInPhoneViewer();
  seekTo(0);
  play();
}

function seekTo(targetTime) {
  currentTime = Math.max(0, Math.min(totalDuration, targetTime));
  renderTimeline(currentTime);
}

function playbackLoop(timestamp) {
  if (!isPlaying) return;
  const delta = (timestamp - lastTimestamp) / 1000;
  lastTimestamp = timestamp;

  currentTime += delta * playbackSpeed;

  // Auto-Inspect receipt window during playback (17.3s -> 19.6s)
  if (autoInspectReceipt) {
    if (currentTime >= 17.2 && currentTime <= 19.5) {
      if (!viewerCurrentlyOpen) {
        openInPhoneViewer('assets/sample-receipt.png', 'Receipt #REC-20260930-8E4A', '09:41');
      }
    } else if (currentTime > 19.5 && viewerCurrentlyOpen) {
      closeInPhoneViewer();
    }
  }

  if (currentTime >= totalDuration) {
    currentTime = totalDuration;
    renderTimeline(currentTime);
    pause();
    if (isRecording) {
      stopRecording();
    }
    return;
  }

  renderTimeline(currentTime);
  animationFrameId = requestAnimationFrame(playbackLoop);
}

// ── Timeline Rendering Engine ─────────────────────────────────────────────────
function renderTimeline(time) {
  const pct = (time / totalDuration) * 100;
  document.getElementById('sliderFill').style.width = `${pct}%`;
  document.getElementById('timeCounter').textContent = `${formatTime(time)} / ${formatTime(totalDuration)}`;

  const chatBody = document.getElementById('chatBody');

  const activeScenes = storyboardData.scenes.filter(s => s.time <= time);

  // If time went backwards (scrubbing back), clear and redraw
  if (activeScenes.length < activeRenderedScenes.size) {
    chatBody.innerHTML = '<div class="wa-date-pill">Today</div>';
    activeRenderedScenes.clear();
    closeInPhoneViewer();
  }

  // Render newly unlocked scenes
  activeScenes.forEach(scene => {
    if (!activeRenderedScenes.has(scene.id)) {
      renderSceneElement(scene, chatBody);
      activeRenderedScenes.add(scene.id);
      
      // Sound FX and Voice
      if (Math.abs(time - scene.time) < 0.28) {
        if (scene.type === 'user_text' || scene.type === 'user_voice_note') {
          AudioFX.playSendPop();
        } else if (scene.type === 'bot_message' || scene.type === 'bot_voice_note' || scene.type.includes('card')) {
          AudioFX.playReceiveChime();
          // Speak Monevo's voice note audio
          if (scene.type === 'bot_voice_note' && scene.voiceSpeech) {
            AudioFX.speakMonevoVoice(scene.voiceSpeech);
          }
        }
      }
    }
  });

  // Auto scroll to bottom when viewer is closed
  if (!viewerCurrentlyOpen) {
    chatBody.scrollTop = chatBody.scrollHeight;
  }
}

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ── DOM Scene Element Builder ─────────────────────────────────────────────────
function renderSceneElement(scene, container) {
  // Clear processing indicators before adding real messages
  if (scene.type !== 'processing_indicator') {
    const existingPills = container.querySelectorAll('.processing-pill');
    existingPills.forEach(p => p.remove());
  }

  if (scene.type === 'user_text') {
    const bubble = document.createElement('div');
    bubble.className = 'wa-bubble user';
    bubble.innerHTML = `
      <div>${scene.text}</div>
      <div class="wa-meta">
        <span>${scene.timestamp}</span>
        <span class="wa-ticks">✓✓</span>
      </div>
    `;
    container.appendChild(bubble);
  } else if (scene.type === 'user_voice_note') {
    const bubble = document.createElement('div');
    bubble.className = 'wa-bubble user';
    bubble.innerHTML = `
      <div class="vn-container">
        <div class="vn-avatar-circle">
          <span class="avatar-char">${storyboardData.config.userName.charAt(0)}</span>
          <div class="vn-mic-badge">🎙️</div>
        </div>
        <div class="vn-body">
          <div class="vn-waveform-wrap">
            ${generateWaveformHtml()}
          </div>
          <div class="vn-sub">
            <span>${scene.audioDuration}</span>
          </div>
        </div>
      </div>
      <div class="vn-transcript-pill">
        <span class="ai-tag">Transcribed</span>
        <span>"${scene.transcript}"</span>
      </div>
      <div class="wa-meta">
        <span>${scene.timestamp}</span>
        <span class="wa-ticks">✓✓</span>
      </div>
    `;
    container.appendChild(bubble);
  } else if (scene.type === 'processing_indicator') {
    const existingPill = container.querySelector('.processing-pill');
    if (existingPill) existingPill.remove();

    const pill = document.createElement('div');
    pill.className = 'processing-pill';
    pill.innerHTML = `
      <div class="typing-dots">
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
      </div>
      <span>${scene.text}</span>
    `;
    container.appendChild(pill);
  } else if (scene.type === 'bot_message') {
    const bubble = document.createElement('div');
    bubble.className = 'wa-bubble bot';

    let buttonsHtml = '';
    if (scene.interactiveButtons && Array.isArray(scene.interactiveButtons)) {
      buttonsHtml = `
        <div class="wa-interactive-btns">
          ${scene.interactiveButtons.map(btn => `<div class="wa-action-btn">${btn}</div>`).join('')}
        </div>
      `;
    }

    bubble.innerHTML = `
      <div>${scene.body}</div>
      ${buttonsHtml}
      <div class="wa-meta">
        <span>${scene.timestamp}</span>
      </div>
    `;
    container.appendChild(bubble);
  } else if (scene.type === 'bot_voice_note') {
    // Monevo Returned Voice Note Component
    const bubble = document.createElement('div');
    bubble.className = 'wa-bubble bot vn';
    bubble.innerHTML = `
      <div class="vn-container">
        <div class="vn-avatar-circle" style="background: linear-gradient(135deg, #1A6EFF, #00A884);">
          <span class="avatar-char" style="font-weight:800; font-size:16px;">M</span>
          <div class="vn-mic-badge" style="background: #00A884;">🎙️</div>
        </div>
        <div class="vn-body">
          <div class="vn-waveform-wrap">
            ${generateWaveformHtml(true)}
          </div>
          <div class="vn-sub">
            <span style="color:#00A884; font-weight:600;">${scene.audioDuration} · Monevo Voice Note</span>
          </div>
        </div>
      </div>
      <div class="vn-transcript-pill" style="margin-top:6px;">
        <span class="ai-tag" style="background:rgba(0,168,132,0.25); color:#4ADE80; font-weight:700;">Monevo Voice</span>
        <span>"${scene.transcript}"</span>
      </div>
      <div class="wa-meta">
        <span>${scene.timestamp}</span>
      </div>
    `;
    container.appendChild(bubble);
  } else if (scene.type === 'bot_receipt_card' || scene.type === 'bot_report_card') {
    const card = document.createElement('div');
    card.className = 'wa-card-wrap';
    card.innerHTML = `
      <div class="card-image-box" onclick="openInPhoneViewer('${scene.image}', '${scene.caption}', '${scene.timestamp}')" title="Click to view full document in phone">
        <img src="${scene.image}" alt="${scene.caption}">
      </div>
      <div class="card-caption-bar">
        <span class="card-caption-title">${scene.caption}</span>
        <span class="card-file-size" style="color:#00A884; font-weight:600; cursor:pointer;" onclick="openInPhoneViewer('${scene.image}', '${scene.caption}', '${scene.timestamp}')">👁️ View</span>
      </div>
      <div class="wa-meta" style="margin-top:2px;">
        <span>${scene.timestamp}</span>
      </div>
    `;
    container.appendChild(card);
  }
}

function generateWaveformHtml(isBot = false) {
  const heights = [8, 14, 22, 12, 18, 25, 16, 20, 10, 15, 24, 18, 12, 22, 16, 10, 14, 20, 8];
  return heights.map((h, i) => {
    const isPlayed = i < 11;
    return `<div class="vn-bar ${isPlayed ? 'played' : ''}" style="height:${h}px; ${isBot && isPlayed ? 'background:#00A884;' : ''}"></div>`;
  }).join('');
}

// ── High-Quality Video Recording (MediaRecorder) ──────────────────────────────
async function toggleRecording() {
  AudioFX.init();
  if (isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
}

async function startRecording() {
  const recordBtn = document.getElementById('recordBtn');
  const stage = document.getElementById('deviceStage');

  try {
    const stream = stage.captureStream ? stage.captureStream(60) : null;
    
    if (!stream) {
      alert("Tip: You can use your Mac screen recorder (Cmd+Shift+5) focused on the device frame for flawless 4K video recording!");
      return;
    }

    recordedChunks = [];
    mediaRecorder = new MediaRecorder(stream, {
      mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm',
      videoBitsPerSecond: 8000000
    });

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunks.push(e.data);
    };

    mediaRecorder.onstop = exportRecordedVideo;

    mediaRecorder.start();
    isRecording = true;
    recordBtn.classList.add('recording');
    recordBtn.innerHTML = '⏹️ Stop Recording';

    // Auto restart and play smoothly
    restart();
  } catch (err) {
    console.error('Recording error:', err);
    alert('Browser video capture initialized. You can also use Mac screen recorder Cmd+Shift+5 for pristine 4K video recording!');
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  isRecording = false;
  const recordBtn = document.getElementById('recordBtn');
  recordBtn.classList.remove('recording');
  recordBtn.innerHTML = '🎥 Record & Export Video';
}

function exportRecordedVideo() {
  const blob = new Blob(recordedChunks, { type: 'video/webm' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `monevo_full_demo_with_voice_${Date.now()}.webm`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }, 100);
}

// ── Customizer Form Population & Saving ───────────────────────────────────────
function populateCustomizerForm() {
  document.getElementById('editBotName').value = storyboardData.config.botName;
  document.getElementById('editUserName').value = storyboardData.config.userName;
  document.getElementById('editUserGreeting').value = storyboardData.scenes.find(s => s.id === 1)?.text || 'Hi';
  document.getElementById('editProfileChoice').value = storyboardData.scenes.find(s => s.id === 3)?.text || '1. Personal finances';
  document.getElementById('editVoice1').value = storyboardData.scenes.find(s => s.id === 11)?.transcript || '';
  document.getElementById('editBotReply1').value = storyboardData.scenes.find(s => s.id === 14)?.transcript || '';
  document.getElementById('editVoice2').value = storyboardData.scenes.find(s => s.id === 16)?.transcript || '';
  document.getElementById('editBotReply2').value = storyboardData.scenes.find(s => s.id === 18)?.transcript || '';
}

function saveCustomConfig() {
  storyboardData.config.botName = document.getElementById('editBotName').value;
  storyboardData.config.userName = document.getElementById('editUserName').value;

  const s1 = storyboardData.scenes.find(s => s.id === 1);
  if (s1) s1.text = document.getElementById('editUserGreeting').value;

  const s3 = storyboardData.scenes.find(s => s.id === 3);
  if (s3) s3.text = document.getElementById('editProfileChoice').value;

  const s5 = storyboardData.scenes.find(s => s.id === 5);
  if (s5) s5.text = storyboardData.config.userName;

  const s11 = storyboardData.scenes.find(s => s.id === 11);
  if (s11) s11.transcript = document.getElementById('editVoice1').value;

  const s14 = storyboardData.scenes.find(s => s.id === 14);
  if (s14) {
    s14.transcript = document.getElementById('editBotReply1').value;
    s14.voiceSpeech = document.getElementById('editBotReply1').value;
  }

  const s16 = storyboardData.scenes.find(s => s.id === 16);
  if (s16) s16.transcript = document.getElementById('editVoice2').value;

  const s18 = storyboardData.scenes.find(s => s.id === 18);
  if (s18) {
    s18.transcript = document.getElementById('editBotReply2').value;
    s18.voiceSpeech = document.getElementById('editBotReply2').value;
  }

  localStorage.setItem('monevo_demo_custom_storyboard_v4', JSON.stringify(storyboardData));
  updateHeaderDetails();
  seekTo(currentTime);
  alert('Custom storyboard saved! Your edits will be reflected in the video preview.');
}

function resetConfig() {
  localStorage.removeItem('monevo_demo_custom_storyboard_v4');
  storyboardData = JSON.parse(JSON.stringify(DEFAULT_STORYBOARD));
  populateCustomizerForm();
  updateHeaderDetails();
  seekTo(0);
  alert('Reset to default Monevo demo configuration.');
}

window.addEventListener('DOMContentLoaded', init);
