# PartiGal

**PartiGal** is a hybrid Android application that serves as an AI-powered music composition tool. It combines a native Android shell with a sophisticated web-based audio processing engine.

## Project Structure

### Android Native (`app/src/main/java`)
*   **Language:** Kotlin & C++
*   **Entry Point:** `MainActivity.kt`
    *   Initializes a full-screen `WebView`.
    *   Bridges Android permissions (Record Audio) to the Web environment via `WebChromeClient`.
*   **Native Lib:** `native-lib.cpp` (Currently loaded but logic is primarily in JS).

### Web Engine (`app/src/main/assets/www`)
The core logic has been refactored from a single HTML file into a modular architecture:

*   **`index.html`**: The UI skeleton.
*   **`css/`**:
    *   `styles.css`: Custom styling and animations.
*   **`js/`**:
    *   `app.js`: Global state management (`window.App`) and configuration.
    *   `audio-engine.js`: Web Audio API implementation, recording handling, and visualization.
    *   `pitch-detect.js`: Audio signal processing (YIN algorithm) for whistle-to-MIDI conversion.
    *   `score-render.js`: VexFlow implementation for rendering music notation.
    *   `gemini-api.js`: Interface with Google's Gemini API for creative features.
    *   `ui-manager.js`: DOM manipulation and event listeners.

## Building and Running

### Prerequisites
*   **Gemini API Key:** You must populate the `apiKey` variable in `app/src/main/assets/www/js/app.js` for AI features to work.

### Commands
```bash
# Build Debug APK
./gradlew assembleDebug

# Install and Run on Device
./gradlew installDebug
```

## Development Notes

*   **Permissions:** The app handles both Android Runtime Permissions and WebRTC permissions (inside WebView).
*   **Debugging:** To debug the WebView content, connect the device via USB, open Chrome on your desktop, and navigate to `chrome://inspect`.