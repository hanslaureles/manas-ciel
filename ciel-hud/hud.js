/* ==============================================================================
   CIEL — HUD INTERACTIVE JAVASCRIPT CONTROLLER
   Handles WebSockets, Live Agent Lighting, Audio Playback, and Voice Recording
   ============================================================================== */

document.addEventListener("DOMContentLoaded", () => {
  // DOM Elements
  const reactorWrapper = document.querySelector(".reactor-wrapper");
  const missionText = document.getElementById("missionText");
  const missionElapsed = document.getElementById("missionElapsed");
  const cielDialogueText = document.getElementById("cielDialogueText");
  const cielAudioPlayer = document.getElementById("cielAudioPlayer");
  const audioReplayBtn = document.getElementById("audioReplayBtn");

  // Ensure Ciel's voice starts at 30% volume
  if (cielAudioPlayer) {
    cielAudioPlayer.volume = 0.30;
  }
  const commandForm = document.getElementById("commandForm");
  const commandInput = document.getElementById("commandInput");
  const voiceBtn = document.getElementById("voiceBtn");
  const statusPill = document.getElementById("statusPill");
  const ramPill = document.getElementById("ramPill");
  const cpuPill = document.getElementById("cpuPill");
  const memoryPill = document.getElementById("memoryPill");
  const speedPill = document.getElementById("speedPill");
  const stampLeft = document.getElementById("stampLeft");
  const stampRight = document.getElementById("stampRight");
  const clearMemoryBtn = document.getElementById("clearMemoryBtn");
  const advisoryPill = document.getElementById("advisoryPill");
  const advisoryPillVal = document.getElementById("advisoryPillVal");
  const cielSuggestionToast = document.getElementById("cielSuggestionToast");
  const suggAgent = document.getElementById("suggAgent");
  const suggCategory = document.getElementById("suggCategory");
  const suggTitle = document.getElementById("suggTitle");
  const suggDesc = document.getElementById("suggDesc");
  const suggActBtn = document.getElementById("suggActBtn");
  const suggCloseBtn = document.getElementById("suggCloseBtn");
  const suggDismissBtn = document.getElementById("suggDismissBtn");

  let activeSuggestions = [];
  let currentSuggestion = null;
  let suggestionDismissed = false;

  let ws = null;
  let missionStartTime = 0;
  let missionTimerInterval = null;
  let stampFlickerInterval = null;
  let mediaRecorder = null;
  let audioChunks = [];
  let isRecording = false;

  function startStampFlicker() {
    if (stampFlickerInterval) return;
    stampFlickerInterval = setInterval(() => {
      const r1 = Math.floor(10000 + Math.random() * 90000);
      const r2 = Math.floor(1000000 + Math.random() * 9000000);
      const r3 = Math.floor(10000 + Math.random() * 90000);
      if (stampLeft) stampLeft.textContent = `[0${r1} 0${r2} - ${r3}]`;
      if (stampRight) stampRight.textContent = `[${r3} - 1100${r2}]`;
    }, 100);
  }

  function stopStampFlicker() {
    clearInterval(stampFlickerInterval);
    stampFlickerInterval = null;
    if (stampLeft) stampLeft.textContent = "[00906 0301977 - 16969]";
    if (stampRight) stampRight.textContent = "[26961 - 1100301977]";
  }

  // --- 1. WebSocket Setup & Event Handling ---
  function connectWebSocket() {
    const wsUrl = (location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/ws";
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      statusPill.textContent = "● ACTIVE";
      statusPill.className = "pill-val status-online";
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleSwarmEvent(msg);
      } catch (err) {
        console.error("Error parsing WS message:", err);
      }
    };

    ws.onclose = () => {
      statusPill.textContent = "○ RECONNECTING";
      statusPill.className = "pill-val";
      setTimeout(connectWebSocket, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }

  function handleSwarmEvent(ev) {
    switch (ev.type) {
      case "ciel_connected":
        console.log("Ciel linked:", ev.message);
        break;

      case "ciel_state":
        updateReactorState(ev.state, ev.message);
        break;

      case "plan_formed":
        missionText.textContent = ev.summary || "Coordinating subordinate agents...";
        // Reset all agent dock items and flyouts to standby
        document.querySelectorAll(".agent-dock-item, .agent-flyout-card").forEach(c => {
          c.classList.remove("active", "done");
        });
        document.querySelectorAll(".flyout-badge").forEach(b => {
          b.textContent = "STANDBY";
        });
        break;

      case "agent_state":
        handleAgentState(ev.agent, ev.status, ev.task, ev.result);
        break;

      case "ciel_complete":
        finalizeMission(ev);
        break;

      case "ciel_suggestion":
        handleSuggestionsUpdate(ev.suggestions);
        break;
    }
  }

  function updateReactorState(state, message) {
    if (missionText && message) {
      missionText.textContent = message;
    }

    if (state === "analyzing" || state === "synthesizing") {
      if (reactorWrapper) {
        reactorWrapper.className = "reactor-wrapper busy";
      }
      startStampFlicker();
    } else if (state === "speaking") {
      if (reactorWrapper) {
        reactorWrapper.className = "reactor-wrapper speaking";
      }
      stopStampFlicker();
    } else {
      if (reactorWrapper) {
        reactorWrapper.className = "reactor-wrapper";
      }
      stopStampFlicker();
    }
  }

  function handleAgentState(agentId, status, task, result) {
    const card = document.getElementById(`card-${agentId}`);
    const dockItem = document.getElementById(`dock-${agentId}`);
    const badge = document.getElementById(`badge-status-${agentId}`);
    const taskElem = document.getElementById(`task-${agentId}`);

    if (!dockItem && !card) return;

    if (status === "active") {
      if (dockItem) {
        dockItem.classList.add("active");
        dockItem.classList.remove("done");
      }
      if (card) {
        card.classList.add("active");
        card.classList.remove("done");
      }
      if (badge) badge.textContent = "EXECUTING";
      if (taskElem && task) taskElem.textContent = task;
    } else if (status === "done") {
      if (dockItem) {
        dockItem.classList.remove("active");
        dockItem.classList.add("done");
      }
      if (card) {
        card.classList.remove("active");
        card.classList.add("done");
      }
      if (badge) badge.textContent = "VERIFIED";
      if (taskElem && result) taskElem.textContent = result;
    }
  }

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatMarkdown(text) {
    if (!text) return "";
    let html = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    // Code blocks ```lang ... ```
    html = html.replace(/```([a-z0-9_-]*)\n([\s\S]*?)```/gim, (m, lang, code) => {
      return `<pre class="md-pre"><code class="md-code-block">${code.trim()}</code></pre>`;
    });

    // Headers
    html = html.replace(/^### (.*$)/gim, '<h4 class="md-h4">$1</h4>');
    html = html.replace(/^## (.*$)/gim, '<h3 class="md-h3">$1</h3>');
    html = html.replace(/^# (.*$)/gim, '<h2 class="md-h2">$1</h2>');

    // Bold and italic
    html = html.replace(/\*\*\*(.*?)\*\*\*/gim, '<strong><em>$1</em></strong>');
    html = html.replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>');
    html = html.replace(/\*(.*?)\*/gim, '<em>$1</em>');

    // Inline code
    html = html.replace(/`([^`]+)`/gim, '<code class="md-code">$1</code>');

    // Markdown links [text](url)
    html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gim, '<a href="$2" target="_blank" rel="noopener noreferrer" class="md-link">$1</a>');

    // Bullet lists (- or *)
    html = html.replace(/^\s*[-*]\s+(.*$)/gim, '<li class="md-li">$1</li>');
    html = html.replace(/((?:<li class="md-li">.*?<\/li>\s*)+)/gims, '<ul class="md-ul">$1</ul>');

    // Paragraphs
    const blocks = html.split(/\n\n+/);
    return blocks.map(block => {
      const trimmed = block.trim();
      if (!trimmed) return "";
      if (trimmed.startsWith('<h') || trimmed.startsWith('<ul') || trimmed.startsWith('<pre')) {
        return trimmed;
      }
      return `<p class="md-p">${trimmed.replace(/\n/g, '<br>')}</p>`;
    }).join('');
  }

  function finalizeMission(data) {
    clearInterval(missionTimerInterval);
    if (reactorWrapper) {
      reactorWrapper.className = "reactor-wrapper";
    }
    stopStampFlicker();

    if (data.elapsed_ms) {
      missionElapsed.textContent = `${data.elapsed_ms}ms`;
      speedPill.textContent = `${data.elapsed_ms}ms`;
    }

    if (cielDialogueText) {
      let contentHtml = "";

      const spokenEn = (data.english_voice || "").trim();
      const spokenJa = (data.japanese_voice || "").trim();
      const fullReply = (data.reply || "").trim();

      // 1. Spoken Vocal Callout Card
      if (spokenEn || spokenJa) {
        contentHtml += `
          <div class="ciel-vocal-card">
            <div class="vocal-tag">
              <span class="vocal-pulse"></span>
              <span class="vocal-label">VOCAL SYNTHESIS</span>
            </div>
            ${spokenEn ? `<div class="vocal-text-en">“${escapeHtml(spokenEn)}”</div>` : ""}
            ${spokenJa ? `<div class="vocal-text-ja">「${escapeHtml(spokenJa.replace(/^「|」$/g, ''))}」</div>` : ""}
          </div>
        `;
      }

      // 2. Full Intelligence Dossier / Report Body
      if (fullReply) {
        if ((spokenEn || spokenJa) && fullReply.length > 0) {
          contentHtml += `
            <div class="ciel-report-divider">
              <span class="divider-line"></span>
              <span class="divider-label">INTELLIGENCE DOSSIER</span>
              <span class="divider-line"></span>
            </div>
          `;
        }
        contentHtml += `<div class="ciel-report-body">${formatMarkdown(fullReply)}</div>`;
      } else if (!contentHtml) {
        contentHtml = `<em>"Notice: Mission completed."</em>`;
      }

      cielDialogueText.innerHTML = contentHtml;
    }

    if (data.audio_url) {
      cielAudioPlayer.volume = 0.30;
      cielAudioPlayer.src = data.audio_url;
      cielAudioPlayer.play().catch(e => console.log("Audio autoplay prevented by browser:", e));
      audioReplayBtn.style.display = "inline-flex";
    }
  }

  // --- 2. Telemetry Poller ---
  async function fetchTelemetry() {
    try {
      const res = await fetch("/api/telemetry");
      if (!res.ok) return;
      const data = await res.json();
      if (data.vitals) {
        if (data.vitals.ram_used_gb) {
          ramPill.textContent = `${data.vitals.ram_used_gb} / ${data.vitals.ram_total_gb} GB`;
        }
        if (data.vitals.cpu_pct !== undefined) {
          cpuPill.textContent = `${data.vitals.cpu_pct}%`;
        }
      }
      if (memoryPill && data.memory_turns !== undefined) {
        memoryPill.textContent = `${data.memory_turns} TURNS`;
      }
    } catch (e) {
      // Ignore background fetch error
    }
    fetchSuggestions();
  }

  async function fetchSuggestions() {
    try {
      const res = await fetch("/api/suggestions");
      if (!res.ok) return;
      const data = await res.json();
      if (data.suggestions) {
        handleSuggestionsUpdate(data.suggestions);
      }
    } catch (e) {}
  }

  function handleSuggestionsUpdate(suggestions) {
    activeSuggestions = Array.isArray(suggestions) ? suggestions : [];
    if (!advisoryPill || !cielSuggestionToast) return;

    if (activeSuggestions.length === 0) {
      advisoryPill.style.display = "none";
      cielSuggestionToast.style.display = "none";
      return;
    }

    advisoryPill.style.display = "flex";
    if (advisoryPillVal) {
      advisoryPillVal.textContent = `✦ ${activeSuggestions.length} ADVISORY`;
    }

    if (suggestionDismissed) return;

    currentSuggestion = activeSuggestions[0];
    if (suggAgent) suggAgent.textContent = (currentSuggestion.agent || "CIEL").toUpperCase();
    if (suggCategory) suggCategory.textContent = (currentSuggestion.category || "RECOMMENDATION").toUpperCase();
    if (suggTitle) suggTitle.textContent = currentSuggestion.title;
    if (suggDesc) suggDesc.textContent = currentSuggestion.description;
    if (suggActBtn) suggActBtn.textContent = currentSuggestion.action_label || "Execute";

    cielSuggestionToast.style.display = "block";
    cielSuggestionToast.classList.remove("dismissing");
  }

  function dismissSuggestion() {
    suggestionDismissed = true;
    if (cielSuggestionToast) {
      cielSuggestionToast.classList.add("dismissing");
      setTimeout(() => {
        cielSuggestionToast.style.display = "none";
      }, 250);
    }
  }

  if (suggCloseBtn) suggCloseBtn.addEventListener("click", dismissSuggestion);
  if (suggDismissBtn) suggDismissBtn.addEventListener("click", dismissSuggestion);
  if (suggActBtn) {
    suggActBtn.addEventListener("click", () => {
      if (currentSuggestion && currentSuggestion.action_prompt) {
        dismissSuggestion();
        sendCommand(currentSuggestion.action_prompt);
      }
    });
  }

  if (advisoryPill) {
    advisoryPill.addEventListener("click", () => {
      suggestionDismissed = false;
      if (activeSuggestions.length > 0) {
        handleSuggestionsUpdate(activeSuggestions);
      } else {
        fetchSuggestions();
      }
    });
  }

  setInterval(fetchTelemetry, 6000);
  fetchTelemetry();

  // --- Auto-expanding Textarea Input ---
  function adjustTextareaHeight() {
    if (!commandInput) return;
    commandInput.style.height = "auto";
    const newHeight = Math.min(commandInput.scrollHeight, 160);
    commandInput.style.height = `${newHeight}px`;
    commandInput.style.overflowY = commandInput.scrollHeight > 160 ? "auto" : "hidden";
  }

  if (commandInput) {
    commandInput.addEventListener("input", adjustTextareaHeight);
    commandInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendCommand();
      }
    });
  }

  // --- 3. Chat Command Submission ---
  async function sendCommand(promptText) {
    const prompt = (promptText || (commandInput ? commandInput.value : "") || "").trim();
    if (!prompt) return;

    if (commandInput) {
      commandInput.value = "";
      adjustTextareaHeight();
    }
    if (missionText) {
      missionText.textContent = `"${prompt}"`;
    }
    missionStartTime = performance.now();
    if (missionElapsed) {
      missionElapsed.textContent = "0.0ms";
    }

    clearInterval(missionTimerInterval);
    missionTimerInterval = setInterval(() => {
      const elapsed = Math.round(performance.now() - missionStartTime);
      if (missionElapsed) missionElapsed.textContent = `${elapsed}ms`;
    }, 50);

    // Reset subordinate agents to standby
    document.querySelectorAll(".agent-dock-item, .agent-flyout-card").forEach(c => {
      c.classList.remove("active", "done");
    });
    document.querySelectorAll(".flyout-badge").forEach(b => {
      b.textContent = "STANDBY";
    });

    updateReactorState("analyzing", "Analyzing prompt...");
    if (cielDialogueText) {
      cielDialogueText.innerHTML = '<em style="color: var(--ciel-gold); opacity: 0.85;">✦ Calculating... Thought Acceleration active</em>';
    }

    // Send via REST API
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt })
      });
      const data = await res.json();
      finalizeMission(data);
    } catch (err) {
      clearInterval(missionTimerInterval);
      if (missionText) missionText.textContent = "Error communicating with Ciel";
      if (reactorWrapper) reactorWrapper.className = "reactor-wrapper";
      if (cielDialogueText) cielDialogueText.textContent = `Communication fault: ${err.message}`;
    }
  }

  if (commandForm) {
    commandForm.addEventListener("submit", (e) => {
      e.preventDefault();
      sendCommand();
    });
  }

  // Replay Audio
  if (audioReplayBtn) {
    audioReplayBtn.addEventListener("click", () => {
      if (cielAudioPlayer && cielAudioPlayer.src) {
        cielAudioPlayer.volume = 0.30;
        cielAudioPlayer.currentTime = 0;
        cielAudioPlayer.play();
        if (reactorWrapper) reactorWrapper.className = "reactor-wrapper speaking";
        cielAudioPlayer.onended = () => {
          if (reactorWrapper) reactorWrapper.className = "reactor-wrapper";
        };
      }
    });
  }

  if (cielAudioPlayer) {
    cielAudioPlayer.onended = () => {
      if (reactorWrapper) reactorWrapper.className = "reactor-wrapper";
    };
  }

  // Preset Chips
  document.querySelectorAll(".trigger-chip").forEach(btn => {
    btn.addEventListener("click", () => {
      const p = btn.getAttribute("data-prompt");
      if (p) sendCommand(p);
    });
  });

  // Reset Memory Button
  if (clearMemoryBtn) {
    clearMemoryBtn.addEventListener("click", async () => {
      try {
        const res = await fetch("/api/memory/clear", { method: "POST" });
        if (res.ok) {
          if (memoryPill) memoryPill.textContent = "0 TURNS";
          if (cielDialogueText) {
            cielDialogueText.innerHTML = '<em style="color: var(--ciel-gold); opacity: 0.9;">Notice: Working memory buffer has been reset to zero turns.</em>';
          }
          if (missionText) {
            missionText.textContent = "Memory buffer reset (0 turns)";
          }
        }
      } catch (err) {
        console.error("Failed to reset memory buffer:", err);
      }
    });
  }

  // Hugging Face Raphael Model Voice Demo
  const demoRaphaelBtn = document.getElementById("demoRaphaelBtn");
  if (demoRaphaelBtn) {
    demoRaphaelBtn.addEventListener("click", () => {
      if (cielAudioPlayer) {
        cielAudioPlayer.volume = 0.30;
        cielAudioPlayer.src = "/audio/demo_raphael.mp3";
        cielAudioPlayer.currentTime = 0;
        cielAudioPlayer.play().catch(e => console.log("Audio play note:", e));
        if (reactorWrapper) reactorWrapper.className = "reactor-wrapper speaking";
        if (cielDialogueText) {
          cielDialogueText.textContent = "Notice: Unique Skill 'Great Sage' has evolved into Ultimate Skill, Raphael.";
        }
        if (audioReplayBtn) audioReplayBtn.style.display = "inline-flex";
        cielAudioPlayer.onended = () => {
          if (reactorWrapper) reactorWrapper.className = "reactor-wrapper";
        };
      }
    });
  }

  // --- 4. Voice Recording via Microphone ---
  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunks = [];
      mediaRecorder = new MediaRecorder(stream);

      // Connect live mic stream to concentric rings visualizer
      if (typeof window._cielConnectMic === "function") {
        window._cielConnectMic(stream);
      }

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        if (typeof window._cielDisconnectMic === "function") {
          window._cielDisconnectMic();
        }

        const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
        const formData = new FormData();
        formData.append("file", audioBlob, "ciel_voice_input.webm");

        if (voiceBtn) {
          voiceBtn.classList.remove("recording");
          voiceBtn.classList.add("transcribing");
          voiceBtn.title = "Transcribing voice via Whisper Turbo...";
        }
        updateReactorState("analyzing", "Transcribing voice via Whisper Turbo...");

        try {
          const res = await fetch("/api/transcribe", {
            method: "POST",
            body: formData
          });
          const data = await res.json();
          if (data && data.text) {
            if (commandInput) {
              commandInput.value = data.text;
              adjustTextareaHeight();
            }
            sendCommand(data.text);
          } else if (data && data.error) {
            console.error("Transcribe error:", data.error);
            if (cielDialogueText) {
              cielDialogueText.innerHTML = `<em style="color: var(--ciel-gold); opacity: 0.9;">Notice: Voice transcription error: ${data.error}</em>`;
            }
            updateReactorState("ready", "Awaiting command...");
          }
        } catch (err) {
          console.error("Transcribe failed:", err);
          if (cielDialogueText) {
            cielDialogueText.innerHTML = '<em style="color: var(--ciel-gold); opacity: 0.9;">Notice: Voice transcription network error. Awaiting instruction.</em>';
          }
          updateReactorState("ready", "Awaiting command...");
        } finally {
          if (voiceBtn) {
            voiceBtn.classList.remove("transcribing");
            voiceBtn.title = "Hold Space or Click to Speak";
          }
          isRecording = false;
        }
      };

      mediaRecorder.start();
      isRecording = true;
      if (voiceBtn) {
        voiceBtn.classList.add("recording");
        voiceBtn.title = "Listening to input...";
      }
      updateReactorState("analyzing", "Listening to voice input...");
      if (cielDialogueText) {
        cielDialogueText.innerHTML = '<em style="color: var(--ciel-gold); opacity: 0.85;">✦ Listening... Speak your instruction</em>';
      }
    } catch (err) {
      console.warn("Microphone access declined or unavailable:", err);
      if (cielDialogueText) {
        cielDialogueText.innerHTML = '<em style="color: var(--ciel-gold); opacity: 0.9;">Notice: Microphone input was not detected or permitted. Please check browser microphone permissions or type your command.</em>';
      }
      updateReactorState("ready", "Awaiting command...");
      if (voiceBtn) {
        voiceBtn.classList.remove("recording", "transcribing");
      }
      isRecording = false;
    }
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
      mediaRecorder.stream.getTracks().forEach(t => t.stop());
    }
    if (typeof window._cielDisconnectMic === "function") {
      window._cielDisconnectMic();
    }
  }

  // Click & hold on Voice Button
  voiceBtn.addEventListener("mousedown", (e) => {
    e.preventDefault();
    startRecording();
  });

  window.addEventListener("mouseup", () => {
    if (isRecording) stopRecording();
  });

  // Spacebar hold to talk
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" && e.target !== commandInput && !isRecording) {
      e.preventDefault();
      startRecording();
    }
  });

  window.addEventListener("keyup", (e) => {
    if (e.code === "Space" && isRecording) {
      e.preventDefault();
      stopRecording();
    }
  });

  // --- 8. Ambient Magicule Particle Generator ---
  function initMagicules() {
    const container = document.getElementById("magiculeParticles");
    if (!container) return;
    const count = 22;
    for (let i = 0; i < count; i++) {
      const dot = document.createElement("div");
      const isGold = Math.random() > 0.45;
      dot.className = `magicule-dot ${isGold ? "magicule-gold" : "magicule-emerald"}`;
      const size = Math.floor(Math.random() * 8) + 4; // 4px to 12px
      dot.style.width = `${size}px`;
      dot.style.height = `${size}px`;
      dot.style.left = `${Math.random() * 100}%`;
      const duration = (Math.random() * 9 + 9).toFixed(1); // 9s to 18s
      const delay = (Math.random() * 10).toFixed(1);
      dot.style.animationDuration = `${duration}s`;
      dot.style.animationDelay = `-${delay}s`;
      container.appendChild(dot);
    }
  }

  // --- 9. Real-Time Dual Concentric Neon Rings Voice Visualizer (Cyan to Magenta Gradient) ---
  function initDualNeonRingsVisualizer() {
    const canvas = document.getElementById("voiceVisualizer") || document.getElementById("polarVisualizer");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let audioCtx = null;
    let analyser = null;
    let audioSource = null;
    let micSource = null;
    let freqData = null;

    function initAudioContext() {
      if (audioCtx) return;
      try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContextClass();
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256; // 128 frequency bins
        analyser.smoothingTimeConstant = 0.78;
        freqData = new Uint8Array(analyser.frequencyBinCount);

        if (cielAudioPlayer) {
          audioSource = audioCtx.createMediaElementSource(cielAudioPlayer);
          audioSource.connect(analyser);
          analyser.connect(audioCtx.destination);
        }
      } catch (err) {
        console.warn("Web Audio initialized with synthetic fallback:", err);
      }
    }

    // Expose helpers for microphone live reactivity
    window._cielConnectMic = (stream) => {
      initAudioContext();
      if (audioCtx && analyser && stream) {
        try {
          if (micSource) {
            micSource.disconnect();
          }
          micSource = audioCtx.createMediaStreamSource(stream);
          micSource.connect(analyser);
        } catch (e) {
          console.warn("Could not bind mic to visualizer:", e);
        }
      }
    };

    window._cielDisconnectMic = () => {
      if (micSource) {
        try {
          micSource.disconnect();
        } catch (e) {}
        micSource = null;
      }
    };

    // Unlock AudioContext on interaction or audio playback
    const unlockAudio = () => {
      initAudioContext();
      if (audioCtx && audioCtx.state === "suspended") {
        audioCtx.resume();
      }
    };
    window.addEventListener("click", unlockAudio, { once: false });
    window.addEventListener("keydown", unlockAudio, { once: false });
    if (cielAudioPlayer) {
      cielAudioPlayer.addEventListener("play", unlockAudio);
    }

    const cx = 250;
    const cy = 250;
    const baseOuterR = 196;
    const baseInnerR = 120;
    let smoothedOuterPulse = 0;
    let smoothedInnerPulse = 0;
    let smoothedGlow = 1.0;

    function render(timestamp) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const isAudioPlaying = Boolean(
        (cielAudioPlayer &&
        !cielAudioPlayer.paused &&
        !cielAudioPlayer.ended &&
        cielAudioPlayer.currentTime > 0) ||
        isRecording
      );

      let avgVol = 0;
      let bassVol = 0;
      let midVol = 0;
      let trebleVol = 0;

      if (analyser && isAudioPlaying) {
        analyser.getByteFrequencyData(freqData);
        let sum = 0;
        let bSum = 0;
        let mSum = 0;
        let tSum = 0;
        for (let i = 0; i < freqData.length; i++) {
          const val = freqData[i];
          sum += val;
          if (i >= 1 && i < 10) bSum += val;       // Bass (~40-250Hz)
          else if (i >= 10 && i < 38) mSum += val; // Mids (~250-1800Hz - vocal fundamental)
          else if (i >= 38 && i < 85) tSum += val; // Treble (~1800-5000Hz - vocal sibilance)
        }
        avgVol = (sum / freqData.length) / 255.0;
        bassVol = (bSum / 9) / 255.0;
        midVol = (mSum / 28) / 255.0;
        trebleVol = (tSum / 47) / 255.0;
      } else if (isAudioPlaying) {
        // Synthetic harmonic wave fallback
        avgVol = 0.35 + 0.25 * Math.sin(timestamp * 0.012);
        bassVol = 0.3 + 0.2 * Math.cos(timestamp * 0.008);
        midVol = 0.35 + 0.25 * Math.sin(timestamp * 0.015);
        trebleVol = 0.25 + 0.2 * Math.cos(timestamp * 0.018);
      }

      // Smooth volume expansions
      const targetOuterPulse = isAudioPlaying ? (avgVol * 18 + trebleVol * 12) : Math.sin(timestamp * 0.0018) * 2.2;
      const targetInnerPulse = isAudioPlaying ? (bassVol * 15 + midVol * 10) : Math.cos(timestamp * 0.0022) * 1.8;
      const targetGlow = isAudioPlaying ? (1.0 + avgVol * 0.75) : 1.0;

      smoothedOuterPulse += (targetOuterPulse - smoothedOuterPulse) * (isAudioPlaying ? 0.32 : 0.08);
      smoothedInnerPulse += (targetInnerPulse - smoothedInnerPulse) * (isAudioPlaying ? 0.32 : 0.08);
      smoothedGlow += (targetGlow - smoothedGlow) * 0.22;

      const currentOuterR = Math.max(150, baseOuterR + smoothedOuterPulse);
      const currentInnerR = Math.max(85, baseInnerR + smoothedInnerPulse);

      // Ciel's Sacred Solar Gold & Luminous Amber Palette
      const cielGoldGrad = ctx.createLinearGradient(0, cy - currentOuterR - 20, 0, cy + currentOuterR + 20);
      cielGoldGrad.addColorStop(0.00, "#FFF9D2"); // Warm Incandescent White-Gold
      cielGoldGrad.addColorStop(0.25, "#FFE082"); // Sacred Celestial Gold
      cielGoldGrad.addColorStop(0.55, "#FFD54F"); // Luminous Solar Gold
      cielGoldGrad.addColorStop(0.80, "#FFB300"); // Warm Amber Gold
      cielGoldGrad.addColorStop(1.00, "#FF8F00"); // Deep Solar Amber

      function drawRing(radius, isOuterRing) {
        const points = 160;
        const pts = [];

        for (let i = 0; i <= points; i++) {
          const angle = (i / points) * Math.PI * 2;
          let disp = 0;

          if (isAudioPlaying) {
            if (freqData && freqData.length > 0) {
              const binIdx = Math.min(Math.floor((i % (points / 2)) * (freqData.length / (points / 2))), freqData.length - 1);
              const fVal = freqData[binIdx] / 255.0;
              const wave1 = Math.sin(angle * (isOuterRing ? 4 : 5) + timestamp * (isOuterRing ? 0.006 : -0.008)) * (isOuterRing ? 7.0 : 6.0) * fVal;
              const wave2 = Math.cos(angle * (isOuterRing ? 6 : 3) - timestamp * 0.005) * 3.0 * fVal;
              disp = wave1 + wave2;
            } else {
              disp = Math.sin(angle * 4 + timestamp * 0.008) * 4.5 * avgVol;
            }
          } else {
            // Calm subtle idle ripple
            disp = Math.sin(angle * 3 + timestamp * 0.0016) * 1.0;
          }

          const r = radius + disp;
          pts.push({
            x: cx + Math.cos(angle) * r,
            y: cy + Math.sin(angle) * r
          });
        }

        function traceRingPath() {
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length; i++) {
            ctx.lineTo(pts[i].x, pts[i].y);
          }
          ctx.closePath();
        }

        // Pass 1: Soft Ambient Glow (Reduced by 50% for subtle elegance)
        ctx.save();
        traceRingPath();
        ctx.strokeStyle = cielGoldGrad;
        ctx.lineWidth = isOuterRing ? 12 : 9;
        ctx.shadowColor = isOuterRing ? "rgba(255, 224, 130, 0.6)" : "rgba(255, 179, 0, 0.5)";
        ctx.shadowBlur = (isAudioPlaying ? 20 : 12) * smoothedGlow;
        ctx.globalAlpha = isAudioPlaying ? 0.32 : 0.20;
        ctx.stroke();
        ctx.restore();

        // Pass 2: Refined Solar Tube
        ctx.save();
        traceRingPath();
        ctx.strokeStyle = cielGoldGrad;
        ctx.lineWidth = isOuterRing ? 4.5 : 3.5;
        ctx.shadowColor = "#FFB300";
        ctx.shadowBlur = (isAudioPlaying ? 10 : 6) * smoothedGlow;
        ctx.globalAlpha = isAudioPlaying ? 0.48 : 0.36;
        ctx.stroke();
        ctx.restore();

        // Pass 3: Soft Ivory Core Stroke (Non-glaring, serene white-gold core)
        ctx.save();
        traceRingPath();
        ctx.strokeStyle = "#FFFDF0";
        ctx.lineWidth = isOuterRing ? 2.0 : 1.6;
        ctx.shadowColor = "#FFE082";
        ctx.shadowBlur = isAudioPlaying ? 4 : 2;
        ctx.globalAlpha = 0.72;
        ctx.stroke();
        ctx.restore();
      }

      // Render Outer Ring then Inner Ring
      drawRing(currentOuterR, true);
      drawRing(currentInnerR, false);

      requestAnimationFrame(render);
    }

    requestAnimationFrame(render);
  }

  // Startup
  initMagicules();
  initDualNeonRingsVisualizer();
  connectWebSocket();
});
