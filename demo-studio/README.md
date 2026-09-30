# Monevo Demo Video Studio 🎬

A video simulator and presentation studio designed to showcase **Monevo** with the visual polish and aesthetic of [whatsapp_flows_demo.mp4](file:///Users/japheth/Documents/monevo/whatsapp_flows_demo.mp4).

---

## 🌟 Key Features

1. **iPhone 16 Pro Floating Mockup**:
   - Metallic titanium chassis with curved bezels, Dynamic Island, and glass reflections.
   - Centered on a dark vignette studio backdrop (`#06080D` → `#131B2E`).
2. **Authentic WhatsApp Dark Theme**:
   - Chat wallpaper, verified business badge, timestamps, and double blue checkmarks (`✓✓`).
   - Animated voice note bubbles with audio waveforms and transcription pills.
   - Dynamic processing pills (*"🎙️ Transcribing with AssemblyAI..."* → *"⚡ Categorizing with Groq..."*).
3. **Monevo's Real Financial Artifacts**:
   - Includes real pure-white SVGs & PNGs generated directly from Monevo's [receiptTemplate.ts](file:///Users/japheth/Documents/monevo/src/services/receipts/receiptTemplate.ts) and [reportTemplate.ts](file:///Users/japheth/Documents/monevo/src/services/analytics/reportTemplate.ts).
4. **Synthetic Web Audio Sound FX**:
   - Built-in audio synthesis for WhatsApp outgoing send pop and incoming message chimes.
5. **Interactive Customizer & Storyboard Editor**:
   - Change user name, bot name, currency (`₦`, `$`, `£`, `€`), voice transcripts, or bot responses directly in the UI.
   - Edit [storyboard.json](file:///Users/japheth/Documents/monevo/demo-studio/storyboard.json) to adjust scene timing.

---

## 🚀 How to Launch the Studio

You can open `index.html` directly in any web browser, or run a local static server:

```bash
# Option 1: Direct open on Mac
open demo-studio/index.html

# Option 2: Using npx serve (recommended)
npx serve demo-studio

# Option 3: Using Python
python3 -m http.server 8080 --directory demo-studio
```

---

## 🎥 Recording & Exporting for Video Editors

### 1. One-Click In-Browser Recording
1. Click the **🎥 Record & Download Video** button in the top bar.
2. The studio automatically rewinds to `00:00`, plays the storyboard at 60fps, and compiles the video.
3. When playback ends, your browser will automatically download `monevo_demo_showcase_<timestamp>.webm`.

### 2. High-Res Screen Recording (Mac Native 4K)
For hackathon-grade 4K quality:
1. Press `Cmd + Shift + 5` on your Mac.
2. Select **"Record Selected Portion"** and drag the box tightly around the floating phone or the whole centered stage.
3. Hit **Record** on your Mac, click **▶️ Play** in the studio.
4. Stop recording when the report appears.

---

## ✂️ Importing Anywhere to Make Edits

| Video Editor | How to Import & Edit |
|---|---|
| **CapCut** | Drag the exported video into CapCut. Add your own voiceover audio track over the voice note sections. Add zoom-in keyframes when the receipt appears! |
| **Premiere Pro / After Effects** | Import the video as a main layer. The background is a clean dark vignette, making it easy to add motion graphics, text callouts, or company logos around the phone. |
| **DaVinci Resolve / Final Cut** | Drop onto a 1080×1920 (Vertical Reel/TikTok/Short) or 1920×1080 (Landscape presentation) timeline. |
| **Figma / Canva** | The assets folder (`demo-studio/assets/`) contains raw high-resolution PNGs of the **Transaction Receipt** and **Weekly Intelligence Report** ready to drop into slide decks or pitch decks. |

---

## 🛠️ Customizing the Scenario

You can adjust the scenario by clicking **⚙️ Customize Script & Data** in the top bar, or by editing [demo-studio/storyboard.json](file:///Users/japheth/Documents/monevo/demo-studio/storyboard.json):

```json
{
  "config": {
    "botName": "Monevo AI",
    "userName": "Japheth Adamu",
    "currency": "NGN",
    "currencySymbol": "₦"
  },
  "scenes": [
    {
      "id": 1,
      "time": 0.5,
      "type": "user_voice_note",
      "transcript": "Paid 15,000 Naira for groceries at Ikeja market"
    }
  ]
}
```
