// UI Manager & Event Handling

App.initUI = function() {
    const ids = [
        'audio-input', 'file-label', 'score-output', 'bpm-input', 'bpm-val', 
        'play-btn', 'download-midi', 'merge-input', 'drop-zone', 'retranscribe-btn', 
        'ai-status', 'ai-status-text', 'ai-panel', 'ai-title', 'ai-genre',
        'btn-extend', 'btn-lyrics', 'lyrics-card', 'ai-lyrics-content',
        'theme-toggle', 'record-btn', 'record-text', 'record-icon',
        'mic-level-bar', 'upload-state-content', 'recording-state-content',
        'btn-variation', 'btn-critique', 'critique-card', 'ai-critique-content',
        'api-key-input', 'model-select', 'custom-model-input',
        'composer-prompt', 'btn-compose'
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
        if(App.dom.apiKeyInput) App.dom.apiKeyInput.value = savedKey;
    }

    // Load saved Model Selection
    const savedModel = localStorage.getItem('gemini_model');
    if (savedModel) {
        App.currentModel = savedModel;
        if(App.dom.modelSelect) App.dom.modelSelect.value = savedModel;
    }

    // Load saved Custom Model
    const savedCustomModel = localStorage.getItem('gemini_custom_model');
    if (savedCustomModel) {
        App.customModel = savedCustomModel;
        if(App.dom.customModelInput) App.dom.customModelInput.value = savedCustomModel;
    }

    App.setupHandlers();
    App.initAudio();
};

App.setupHandlers = function() {
    // API Key Handler
    App.dom.apiKeyInput.oninput = (e) => {
        const key = e.target.value.trim();
        App.apiKey = key;
        localStorage.setItem('gemini_api_key', key);
    };

    // Model Selector Handler
    App.dom.modelSelect.onchange = (e) => {
        App.currentModel = e.target.value;
        localStorage.setItem('gemini_model', App.currentModel);
    };

    // Custom Model Input Handler
    App.dom.customModelInput.oninput = (e) => {
        App.customModel = e.target.value.trim();
        localStorage.setItem('gemini_custom_model', App.customModel);
    };

    App.dom.bpmInput.oninput = (e) => {
        App.bpm = parseInt(e.target.value);
        App.dom.bpmVal.textContent = App.bpm + " BPM";
    };
    
    App.dom.mergeInput.oninput = (e) => { 
        App.mergeThreshold = parseInt(e.target.value);
    };
    
    App.dom.themeToggle.onclick = App.toggleTheme;

    App.dom.btnCompose.onclick = App.composeArrangement;
    App.dom.btnExtend.onclick = App.extendMelody;
    App.dom.btnLyrics.onclick = App.generateLyrics;
    App.dom.btnVariation.onclick = App.generateVariation;
    App.dom.btnCritique.onclick = App.analyzePerformance;

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
        if(!App.isRecording) dz.classList.add('drag-active');
    });
    dz.addEventListener('dragleave', () => dz.classList.remove('drag-active'));
    dz.addEventListener('drop', e => {
        dz.classList.remove('drag-active');
        if(!App.isRecording) App.handleFile(e.dataTransfer.files[0]);
    });
};

App.checkTheme = function() {
    if (localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
};

App.toggleTheme = function() {
    document.documentElement.classList.toggle('dark');
    if (document.documentElement.classList.contains('dark')) {
        localStorage.theme = 'dark';
    } else {
        localStorage.theme = 'light';
    }
    if (App.notesData.length > 0) App.renderScore(App.notesData);
};