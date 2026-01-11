// UI Manager & Event Handling

App.initUI = function () {
    const ids = [
        'audio-input', 'file-label', 'score-output', 'bpm-input', 'bpm-val',
        'play-btn', 'download-midi', 'merge-input', 'drop-zone', 'retranscribe-btn',
        'ai-status', 'ai-status-text', 'ai-panel', 'ai-title', 'ai-genre',
        'btn-extend', 'btn-lyrics', 'lyrics-card', 'ai-lyrics-content',
        'theme-toggle', 'record-btn', 'record-text', 'record-icon',
        'mic-level-bar', 'upload-state-content', 'recording-state-content',
        'btn-variation', 'btn-critique', 'critique-card', 'ai-critique-content',
        'api-key-input', 'model-select', 'custom-model-input',
        'composer-prompt', 'btn-compose', 'btn-test-connection',
        'btn-save-prompt', 'prompt-library-select', 'offline-mode-check'
    ];

    // Map IDs to App.dom
    ids.forEach(id => {
        const camelCase = id.replace(/-([a-z])/g, g => g[1].toUpperCase());
        App.dom[camelCase] = document.getElementById(id);
    });

    // Load saved API Key
    const savedKey = localStorage.getItem('gemini_api_key');
    if (savedKey) {
        App.apiKey = savedKey;
        if (App.dom.apiKeyInput) App.dom.apiKeyInput.value = savedKey;
    }

    // Load saved Model Selection
    const savedModel = localStorage.getItem('gemini_model');
    if (savedModel) {
        App.currentModel = savedModel;
        if (App.dom.modelSelect) App.dom.modelSelect.value = savedModel;
    }

    // Load saved Custom Model
    const savedCustomModel = localStorage.getItem('gemini_custom_model');
    if (savedCustomModel) {
        App.customModel = savedCustomModel;
        if (App.dom.customModelInput) App.dom.customModelInput.value = savedCustomModel;
    }

    // Load saved Offline Mode
    const savedOffline = localStorage.getItem('is_offline');
    if (savedOffline === 'true') {
        App.isOffline = true;
        if (App.dom.offlineModeCheck) App.dom.offlineModeCheck.checked = true;
    }

    App.setupHandlers();
    App.initAudio();
};

App.setupHandlers = function () {
    // API Key Handler
    if (App.dom.apiKeyInput) {
        App.dom.apiKeyInput.oninput = (e) => {
            const key = e.target.value.trim();
            App.apiKey = key;
            localStorage.setItem('gemini_api_key', key);
        };
    }

    if (App.dom.modelSelect) {
        App.dom.modelSelect.onchange = (e) => {
            App.currentModel = e.target.value;
            localStorage.setItem('gemini_model', App.currentModel);
        };
    }

    if (App.dom.customModelInput) {
        App.dom.customModelInput.oninput = (e) => {
            App.customModel = e.target.value.trim();
            localStorage.setItem('gemini_custom_model', App.customModel);
        };
    }

    if (App.dom.bpmInput) {
        App.dom.bpmInput.oninput = (e) => {
            App.bpm = parseInt(e.target.value, 10);
            if (App.dom.bpmVal) App.dom.bpmVal.textContent = App.bpm + " BPM";
        };
    }

    if (App.dom.mergeInput) {
        App.dom.mergeInput.oninput = (e) => {
            App.mergeThreshold = parseInt(e.target.value, 10);
        };
    }

    if (App.dom.themeToggle) App.dom.themeToggle.onclick = App.toggleTheme;

    if (App.dom.offlineModeCheck) {
        App.dom.offlineModeCheck.onchange = (e) => {
            App.isOffline = e.target.checked;
            localStorage.setItem('is_offline', App.isOffline);
        };
    }

    if (App.dom.btnCompose) App.dom.btnCompose.onclick = App.composeArrangement;
    if (App.dom.btnExtend) App.dom.btnExtend.onclick = App.extendMelody;
    if (App.dom.btnLyrics) App.dom.btnLyrics.onclick = App.generateLyrics;
    if (App.dom.btnVariation) App.dom.btnVariation.onclick = App.generateVariation;
    if (App.dom.btnCritique) App.dom.btnCritique.onclick = App.analyzePerformance;
    if (App.dom.btnTestConnection) App.dom.btnTestConnection.onclick = App.testConnection;
    if (App.dom.btnSavePrompt) App.dom.btnSavePrompt.onclick = App.saveCurrentPrompt;

    App.dom.audioInput.onchange = (e) => App.handleFile(e.target.files[0]);

    App.dom.retranscribeBtn.onclick = () => {
        if (App.lastBuffer) {
            App.processAndRender(App.lastBuffer, App.lastSourceType);
        }
    };

    App.dom.playBtn.onclick = App.playAudio;
    App.dom.downloadMidi.onclick = App.saveMidi;

    // Handler de grabación
    App.dom.recordBtn.onclick = App.toggleRecording;

    const dz = App.dom.dropZone;
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(evt => {
        dz.addEventListener(evt, e => { e.preventDefault(); e.stopPropagation(); });
    });
    dz.addEventListener('dragover', () => {
        if (!App.isRecording) dz.classList.add('drag-active');
    });
    dz.addEventListener('dragleave', () => dz.classList.remove('drag-active'));
    dz.addEventListener('drop', e => {
        dz.classList.remove('drag-active');
        if (!App.isRecording) App.handleFile(e.dataTransfer.files[0]);
    });

    // Prompt Library Dropdown Handler
    if (App.dom.promptLibrarySelect) {
        App.dom.promptLibrarySelect.onchange = (e) => {
            const selectedPrompt = e.target.value;
            if (selectedPrompt && App.dom.composerPrompt) {
                App.dom.composerPrompt.value = selectedPrompt;
            }
        };
    }

    // Load Prompt Library into Dropdown
    App.renderPromptLibrary();
};

// --- Prompt Library Functions ---

App.saveCurrentPrompt = function () {
    const prompt = App.dom.composerPrompt ? App.dom.composerPrompt.value.trim() : '';
    if (!prompt) {
        alert('Escribe un prompt antes de gardalo.');
        return;
    }

    try {
        let savedPrompts = JSON.parse(localStorage.getItem('saved_prompts') || '[]');
        if (!savedPrompts.includes(prompt)) {
            savedPrompts.unshift(prompt);
            // Limit to 20 saved prompts
            if (savedPrompts.length > 20) savedPrompts.pop();
            localStorage.setItem('saved_prompts', JSON.stringify(savedPrompts));
            App.renderPromptLibrary();
            alert('✅ Prompt gardado.');
        } else {
            alert('Este prompt xa está gardado.');
        }
    } catch (e) {
        console.error('Error saving prompt:', e);
    }
};

App.renderPromptLibrary = function () {
    const select = App.dom.promptLibrarySelect;
    if (!select) return;

    try {
        const savedPrompts = JSON.parse(localStorage.getItem('saved_prompts') || '[]');

        // Clear all options except the first placeholder
        select.innerHTML = '<option value="">-- Prompts gardados --</option>';

        savedPrompts.forEach((prompt) => {
            const option = document.createElement('option');
            option.value = prompt;
            // Truncate for display
            option.textContent = prompt.length > 40 ? prompt.substring(0, 37) + '...' : prompt;
            select.appendChild(option);
        });
    } catch (e) {
        console.error('Error rendering prompt library:', e);
    }
};

App.checkTheme = function () {
    if (localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
};

App.toggleTheme = function () {
    document.documentElement.classList.toggle('dark');
    if (document.documentElement.classList.contains('dark')) {
        localStorage.theme = 'dark';
    } else {
        localStorage.theme = 'light';
    }
    if (App.notesData.length > 0) App.renderScore(App.notesData);
};