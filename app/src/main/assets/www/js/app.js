// Global Application State
window.App = {
    // Audio Context & State
    audioCtx: null,
    lastBuffer: null,
    lastSourceType: 'file', // 'file' or 'mic'
    isRecording: false,

    // Data
    notesData: [],       // The main melody (whistled or loaded)
    arrangementData: null, // The complex multi-track arrangement from AI

    // Settings
    bpm: 120,
    mergeThreshold: 6,

    // Recording
    mediaRecorder: null,
    audioChunks: [],
    vuAnimationFrame: null,

    // Playback
    currentSynth: null,

    // AI Metadata
    currentTitle: "Sin título",
    currentGenre: "Desconocido",
    apiKey: "", // To be populated or injected
    currentModel: "gemini-3-flash-preview", // Default model
    customModel: "", // User override

    // DOM Cache
    dom: {}
};

// Initialize on Load
document.addEventListener('DOMContentLoaded', () => {
    App.initUI();
    App.checkTheme();

    // Window Resize Handler for Score Redraw
    window.addEventListener('resize', () => {
        if (App.notesData.length > 0) App.renderScore(App.notesData);
    });
});