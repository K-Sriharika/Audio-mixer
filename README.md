# <img width="48" height="48" alt="image" src="https://github.com/user-attachments/assets/d3061021-c033-4db4-b85f-591cc5bc1136" /> VoiceFront — Dialogue Booster

> **Real-time voice/dialogue booster for any video or song in your browser.**  
> Boost dialogue, cut background music, or strip vocals for karaoke — all live, no uploads, no servers.

---

![VoiceFront popup screenshot](https://github.com/user-attachments/assets/4768b407-c6e0-4677-97ce-5ccc4e2dcaeb)

---

## How it works

Most professionally mixed films and songs place the lead voice dead-**centre** in the stereo field, while music and ambience are spread **wide** (left and right). VoiceFront exploits this:

1. It captures your tab's audio in real time via Chrome's tab capture API
2. An **AudioWorklet** runs a live FFT on every 512-sample hop
3. For each frequency bin it checks: *do the left and right channels match?* → centre = voice. *Do they differ?* → panned = music
4. Two gain-controlled outputs are mixed back together — the **Voice** and **Background** sliders let you balance them however you like

Everything runs inside the browser. No AI models, no cloud, no latency.

---

### 🎬 See it in action

https://github.com/user-attachments/assets/4bea47b7-9f7e-48f8-902b-123e90334225

---

## Install

1. Click the green **Code** button above → **Download ZIP** → unzip
2. Open Chrome → `chrome://extensions`
3. Enable **Developer mode** (toggle, top-right)
4. Click **Load unpacked** → select the `chrome-extension` folder

The VoiceFront icon appears in your Chrome toolbar.

---

## Usage

1. Play a stereo video or song in any tab (YouTube, Netflix, Prime, Hotstar, Spotify…)
2. Click the **VoiceFront** toolbar icon
3. Click **▶ Start**
4. Adjust the sliders:

| Slider | What it does |
|---|---|
| 🎙 **Voice** | Volume of the isolated dialogue / vocals |
| 🎵 **Background** | Volume of the music / ambience |
| 🎯 **Sharpness** | How tightly the voice is isolated — higher = cleaner split but more artefacts |

**Quick presets:**
- Background → 0 % : hear voice only
- Voice → 0 % : karaoke / instrumental
- Both → 100 % : original audio unchanged

The engine keeps running even after you close the popup. Click **⏹ Stop** to end it.

---

## Project structure

```
chrome-extension/
├── manifest.json          Extension config (MV3)
├── popup.html / popup.js  Control panel UI
├── background.js          Service worker — tab capture & routing
├── offscreen.html/.js     Hidden page that hosts the audio engine
└── separator-worklet.js   Real-time FFT stereo-masking engine
```

There is also an experimental offline AI pipeline (`index.html` + `main.py` + `modal_demucs.py`) that uses Meta's **Demucs** model for higher-quality separation. It requires uploading a file and a GPU backend — not real-time, but studio-grade output.

---

## Limitations

- Requires **stereo** audio — mono sources have no L/R difference to exploit
- Works best when the voice is **centre-panned** (true for most commercially mixed content)
- Heavy reverb, babble, or off-centre vocals reduce separation quality
- For studio-quality separation use the offline Demucs backend

---

## Tech

Web Audio API · AudioWorklet · real-time STFT · stereo panning masks (ADRess-style) · Chrome Manifest V3 · Python / FastAPI · Modal (serverless GPU) · Meta Demucs

---

## License

MIT License © 2026 Sriharika K

See [LICENSE](LICENSE) for full terms.
