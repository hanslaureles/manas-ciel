# 💠 Manas: Ciel — Telepathic Voice Intelligence & Multi-Modal HUD

> **Low-latency, autonomous voice copilot with streaming Thought Acceleration DSP, live meteorology sensors, real-time web intelligence, and cyberpunk SVG mandala Web HUD.**  
> Built for local consumer GPU silicon (AMD Radeon RX 6600 XT via Vulkan / Ollama) with cloud fallback.

---

## ⚡ Key Highlights
- **Sub-350ms Time-to-First-Audio-Chunk:** Synthesizes phonemes concurrently as the LLM streams tokens, achieving ~850ms total conversational turnaround.
- **Thought Acceleration DSP:** Audio frequency filter (+5Hz pitch, 1.25x playback rate) for high-density, crystalline articulation.
- **Sensory Perception Layer:** Real-time atmospheric telemetry (`wttr.in`) and live web intelligence search (`ddgs`) with grounded citations.
- **Zero-Subservience Persona:** Autonomous analytical partner inspired by the *Manas: Ciel* archetype (Tensura). Never uses "Master" or sycophantic filler.
- **Cyberpunk Web HUD:** Authentic procedural SVG mandala visualizer with dual-concentric counter-rotating rings and Web Audio API waveform reactive bins on `http://localhost:8000`.

---

## 🏗️ Architecture

```
[Operator Input]
       │
       ▼
┌────────────────────────────────────────────────────────┐
│            Manas: Ciel Orchestration Core              │
│               (ciel_server.py :8000)                  │
├──────────────────────────┬─────────────────────────────┤
│   Sensory Layer          │   Inference Engine          │
│   - wttr.in Meteorology  │   - Local Ollama (Vulkan)   │
│   - DuckDuckGo Search    │   - Groq LPUs Acceleration  │
│   - 8-turn Context Buffer│                             │
└──────────────────────────┴─────────────────────────────┘
       │
       ▼
┌────────────────────────────────────────────────────────┐
│             Thought Acceleration DSP                   │
│ - Edge-TTS Streaming: ja-JP-Nanami / en-US-Aria        │
│ - DSP: +5Hz Pitch, 1.25x Conversational Tempo          │
└────────────────────────────────────────────────────────┘
       │
       ▼
┌────────────────────────────────────────────────────────┐
│            Cyberpunk Reactive Web HUD                  │
│ - SVG Counter-Rotating Mandala Visualizer              │
│ - Web Audio API Frequency Analysis & Waveform          │
│ - Bidirectional WebSocket Telemetry Streaming          │
└────────────────────────────────────────────────────────┘
```

---

## 🚀 Quickstart

1. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

2. **Launch the server:**
   ```bash
   python ciel_server.py
   ```

3. **Open the Web HUD:**
   Navigate to `http://localhost:8000` in any modern browser.

---

## 👨‍💻 Author

**Hans Aaron Laureles**  
*Applied AI Engineer & Full-Stack Builder*  
- Portfolio: [hanslaureles.vercel.app](https://hanslaureles.vercel.app/)  
- GitHub: [@hanslaureles](https://github.com/hanslaureles)  
- LinkedIn: [linkedin.com/in/hanslaureles](https://linkedin.com/in/hanslaureles)

---

## 📄 License

MIT License — see [LICENSE](LICENSE).
