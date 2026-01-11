// Gemini AI Integration (Direct API Key)

App.callGemini = async function (prompt) {
    // OFFLINE MODE FALLBACK
    if (App.isOffline) {
        console.log("Offline Mode Active: Generating mock response...");
        return App.generateOfflineResponse(prompt);
    }

    if (!App.apiKey || App.apiKey.length < 5) {
        alert("⚠️ Por favor, introduce unha API Key válida en Axustes.");
        throw new Error("Missing API Key");
    }

    // Prioridad: Custom Input > Selector > Default
    const model = App.customModel || App.currentModel || "gemini-3-flash-preview";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${App.apiKey}`;

    console.log(`Calling API [${model}]...`);

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { responseMimeType: "application/json" }
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("API Error:", errorText);

            if (response.status === 404) {
                alert(`Erro 404: O modelo "${model}" non está dispoñible. Usa 'gemini-1.5-flash' ou revisa o ID do modelo personalizado.`);
            } else if (response.status === 429) {
                alert("Erro 429: Cota superada. Agarda un minuto ou cambia a un modelo máis lixeiro coma 'gemini-1.5-flash-8b'.");
            } else if (response.status === 403) {
                alert("Erro 403: API Key non válida ou sen permisos para este modelo.");
            } else {
                alert(`Erro ${response.status}: ${response.statusText}`);
            }
            throw new Error(`API Error ${response.status}`);
        }

        const json = await response.json();

        const candidate = json.candidates?.[0];
        if (!candidate?.content?.parts?.[0]?.text) {
            if (candidate?.finishReason === 'SAFETY') {
                throw new Error("Contenido bloqueado por seguridad.");
            }
            throw new Error("Respuesta vacía de la IA.");
        }

        let text = candidate.content.parts[0].text;
        text = text.replace(/^```json\s*/i, '').replace(/\s*```$/, '');

        try {
            return JSON.parse(text);
        } catch (parseError) {
            console.error("JSON inválido de Gemini:", text);
            throw new Error("A IA devolveu un formato inesperado ou mal formado. Inténtao de novo.");
        }

    } catch (e) {
        console.error("Gemini Logic Error:", e);
        throw e;
    }
};

App.testConnection = async function () {
    if (!App.apiKey) return alert("Primero introduce una API Key.");

    App.dom.aiStatus.classList.remove('hidden');
    App.dom.aiStatusText.textContent = "Probando conexión...";

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${App.apiKey}`);
        const data = await response.json();

        if (data.models) {
            const names = data.models.map(m => m.name.replace('models/', '')).filter(n => n.includes('gemini'));
            alert(`✅ Conexión Exitosa.\n\nModelos dispoñibles:\n${names.join('\n')}`);
            console.log("Available Models:", names);
        } else {
            alert("⚠️ Conexión establecida pero non se atoparon modelos. ¿A túa API Key ten permisos?");
            console.error("No models found:", data);
        }
    } catch (e) {
        alert(`❌ Erro de Conexión: ${e.message}`);
    } finally {
        App.dom.aiStatus.classList.add('hidden');
    }
};

// --- Business Logic Functions ---

App.composeArrangement = async function () {
    console.log("Composing arrangement..."); // Debug log
    if (App.notesData.length === 0) {
        alert("⚠️ Primeiro debes gravar ou cargar unha melodía.");
        return;
    }

    const userPrompt = App.dom.composerPrompt.value.trim();
    if (!userPrompt) {
        alert("Por favor, escribe unha descrición para o arranxo (ex: 'Estilo Jazz').");
        return;
    }

    App.dom.aiStatus.classList.remove('hidden');
    App.dom.aiStatusText.textContent = "Gemini orquestrando...";
    App.dom.btnCompose.disabled = true;

    // Simplify melody for token efficiency
    const seedMelody = App.notesData.map(n => ({ m: n.midi, b: n.beats }));

    const prompt = `Actúa como un compositor e arranxista experto.
    
    Teño esta melodía semente (Main Melody): ${JSON.stringify(seedMelody)}
    
    TAREA: Crea un arranxo musical completo baseado nesta descrición: "${userPrompt}".
    
    REGLAS:
    1. Devuelve un objeto JSON con una lista de "tracks".
    2. Cada track debe tener "instrument" (nombre string) y "notes" (array).
    3. El formato de nota es {"midi": 60, "beats": 1, "startTime": 0}. ¡IMPORTANTE: Usa "startTime" (en beats) para polifonía!
    4. Incluye la melodía original en uno de los tracks (puedes variarla).
    5. Añade acompañamiento (bajo, acordes, batería, contrapunto) según el estilo pedido.
    6. Duración total: aprox 8-16 compases.
    
    Formato JSON esperado:
    {
      "tracks": [
        { "instrument": "piano", "notes": [{"midi":60, "beats":1, "startTime":0}, ...] },
        { "instrument": "bass", "notes": [...] },
        { "instrument": "drums", "notes": [...] } // Para drums usa midi general (36=kick, 38=snare, 42=hh)
      ]
    }`;

    try {
        const result = await App.callGemini(prompt);

        if (result && result.tracks) {
            App.arrangementData = result;

            // Extract melody track for score rendering (first track or one named 'melody'/'piano')
            const melodyTrack = result.tracks.find(t =>
                t.instrument.toLowerCase().includes('melody') ||
                t.instrument.toLowerCase().includes('piano') ||
                t.instrument.toLowerCase().includes('melodía')
            ) || result.tracks[0];

            if (melodyTrack && melodyTrack.notes) {
                // Convert arrangement format to simple notesData format for score rendering
                // Sort by startTime to get sequential order
                const sortedNotes = [...melodyTrack.notes].sort((a, b) => (a.startTime || 0) - (b.startTime || 0));

                // Convert to simple {midi, beats} format
                const simpleNotes = sortedNotes.map(n => ({
                    midi: n.midi,
                    beats: n.beats || 1
                }));

                App.notesData = simpleNotes;
                App.renderScore(simpleNotes);
            }

            alert(`¡Arranxo composto!\n\nPistas xeradas: ${result.tracks.map(t => t.instrument).join(', ')}.\n\nDálle a PLAY para escoitar.`);

            // Highlight play button
            App.dom.playBtn.classList.add('animate-pulse');
            setTimeout(() => App.dom.playBtn.classList.remove('animate-pulse'), 2000);
        } else {
            throw new Error("Formato JSON incorrecto");
        }
    } catch (e) {
        App.dom.aiStatusText.textContent = "Erro ao arranxar";
        console.error(e);
        setTimeout(() => App.dom.aiStatus.classList.add('hidden'), 2000);
    } finally {
        if (!App.dom.aiStatusText.textContent.includes("Error")) {
            App.dom.aiStatus.classList.add('hidden');
        }
        App.dom.btnCompose.disabled = false;
    }
};

App.triggerIAAnalysis = async function () {
    if (App.notesData.length < 3) return;

    App.dom.aiStatus.classList.remove('hidden');
    App.dom.aiStatusText.textContent = "Gemini identificando estilo...";

    const melody = App.notesData.slice(0, 15).map(n => n.midi ? App.midiToName(n.midi).n : "silencio").join(",");
    const prompt = `Actúa como un musicólogo experto. Analiza esta secuencia de notas: ${melody}. 
    Responde cun JSON exacto: {"titulo": "Un título creativo e curto en galego", "genero": "Xénero musical (ex: Jazz, Folk, Pop)"}`;

    try {
        const data = await App.callGemini(prompt);

        App.dom.aiPanel.classList.remove('hidden');
        App.dom.aiTitle.textContent = data.titulo || "Título IA";
        App.dom.aiGenre.textContent = data.genero || "Experimental";

        App.currentTitle = data.titulo;
        App.currentGenre = data.genero;

    } catch (e) {
        App.dom.aiStatusText.textContent = "Erro IA (ver consola)";
        setTimeout(() => App.dom.aiStatus.classList.add('hidden'), 3000);
    } finally {
        if (!App.dom.aiStatusText.textContent.includes("Error")) {
            App.dom.aiStatus.classList.add('hidden');
        }
    }
};

App.extendMelody = async function () {
    if (App.notesData.length === 0) return;

    App.dom.aiStatus.classList.remove('hidden');
    App.dom.aiStatusText.textContent = "Gemini compoñendo...";
    App.dom.btnExtend.disabled = true;

    const contextNotes = App.notesData.slice(-10);
    const prompt = `Eres un compositor experto. Continúa la siguiente melodía (formato JSON array de objetos {midi, beats}).
    
    Contexto (últimas notas): ${JSON.stringify(contextNotes)}
    Estilo desexado: ${App.currentGenre}.
    
    TAREA: Xera de 8 a 12 notas novas que sigan o fluxo musical de forma natural.
    REGLAS:
    1. Devuelve SOLO un JSON Array válido: [{"midi": 60, "beats": 1}, ...].
    2. 'midi' debe ser un entero entre 50 y 90.
    3. 'beats' debe ser 0.25, 0.5, 1, o 2.
    `;

    try {
        const newNotes = await App.callGemini(prompt);

        if (Array.isArray(newNotes)) {
            App.notesData = [...App.notesData, ...newNotes];
            App.renderScore(App.notesData);
            App.dom.scoreOutput.scrollLeft = App.dom.scoreOutput.scrollWidth;
        }
    } catch (e) {
        App.dom.aiStatusText.textContent = "Erro ao compoñer";
        setTimeout(() => App.dom.aiStatus.classList.add('hidden'), 2000);
    } finally {
        if (!App.dom.aiStatusText.textContent.includes("Error")) {
            App.dom.aiStatus.classList.add('hidden');
        }
        App.dom.btnExtend.disabled = false;
    }
};

App.generateVariation = async function () {
    if (App.notesData.length === 0) return;

    App.dom.aiStatus.classList.remove('hidden');
    App.dom.aiStatusText.textContent = "Gemini reimaxinando...";
    App.dom.btnVariation.disabled = true;

    const prompt = `Eres un arranxista musical experto. Toma esta melodía completa: ${JSON.stringify(App.notesData)} e reescríbea lixeiramente para cambiar o seu estilo.
    
    Escolle un estilo ao chou (Jazz, Barroco, Minimalista, etc) e adapta o ritmo e as notas.
    Mantén a duración total aproximada.
    
    REGLAS:
    1. Devuelve SOLO un JSON Array válido: [{"midi": 60, "beats": 1}, ...].
    `;

    try {
        const newNotes = await App.callGemini(prompt);

        if (Array.isArray(newNotes)) {
            App.notesData = newNotes;
            App.renderScore(App.notesData);
        }
    } catch (e) {
        App.dom.aiStatusText.textContent = "Erro ao variar";
        setTimeout(() => App.dom.aiStatus.classList.add('hidden'), 2000);
    } finally {
        if (!App.dom.aiStatusText.textContent.includes("Error")) {
            App.dom.aiStatus.classList.add('hidden');
        }
        App.dom.btnVariation.disabled = false;
    }
};

App.analyzePerformance = async function () {
    App.dom.aiStatus.classList.remove('hidden');
    App.dom.aiStatusText.textContent = "O profesor está escoitando...";
    App.dom.btnCritique.disabled = true;

    const prompt = `Actúa como un profesor de música de conservatorio amable pero esixente. Analiza esta secuencia de notas: ${JSON.stringify(App.notesData)}.
    
    Dáme unha avaliación en galego de máximo 40 palabras.
    Comenta sobre:
    1. Variedade rítmica.
    2. Rango tonal.
    3. Unha suxestión constructiva.
    
    Devolve un JSON exacto: {"critique": "O teu texto aquí..."}`;

    try {
        const data = await App.callGemini(prompt);
        App.dom.critiqueCard.classList.remove('hidden');
        App.dom.aiCritiqueContent.textContent = data.critique || data.text || "Sen crítica dispoñible.";
    } catch (e) {
        App.dom.aiStatusText.textContent = "Erro ao analizar";
        setTimeout(() => App.dom.aiStatus.classList.add('hidden'), 2000);
    } finally {
        if (!App.dom.aiStatusText.textContent.includes("Error")) {
            App.dom.aiStatus.classList.add('hidden');
        }
        App.dom.btnCritique.disabled = false;
    }
};

App.generateLyrics = async function () {
    App.dom.aiStatus.classList.remove('hidden');
    App.dom.aiStatusText.textContent = "Gemini escribindo letra...";
    App.dom.btnLyrics.disabled = true;

    const prompt = `Eres un letrista de cancións profesional. Escribe unha estrofa curta (4 liñas) en galego para unha canción titulada "${App.currentTitle}" do xénero "${App.currentGenre}".
    
    La letra debe encajar rítmicamente con una melodía alegre/melancólica según el título.
    Devolve un JSON exacto: {"lyrics": "liña 1\nliña 2\nliña 3\nliña 4"}`;

    try {
        const data = await App.callGemini(prompt);
        App.dom.lyricsCard.classList.remove('hidden');
        App.dom.aiLyricsContent.textContent = data.lyrics || "Erro xerando letra.";
    } catch (e) {
        App.dom.aiStatusText.textContent = "Erro ao escribir letra";
        setTimeout(() => App.dom.aiStatus.classList.add('hidden'), 2000);
    } finally {
        if (!App.dom.aiStatusText.textContent.includes("Error")) {
            App.dom.aiStatus.classList.add('hidden');
        }
        App.dom.btnLyrics.disabled = false;
    }
};

// --- Offline Mode Helpers ---

App.generateOfflineResponse = function (prompt) {
    const p = prompt.toLowerCase();

    // 1. ARRANGEMENT (SATB 4 Voices)
    if (p.includes("arranxo") || p.includes("tracks")) {
        const tracks = [
            { instrument: "Soprano (Melodía)", interval: 0 },
            { instrument: "Contralto", interval: -4 }, // approx major third down
            { instrument: "Tenor", interval: -7 },    // fifth down
            { instrument: "Baixo", interval: -12 }      // octave down
        ];

        return {
            tracks: tracks.map(t => ({
                instrument: t.instrument,
                notes: App.notesData.map((n, i) => {
                    // Accumulate beats for startTime
                    let startTime = 0;
                    for (let j = 0; j < i; j++) startTime += App.notesData[j].beats;

                    return {
                        midi: n.midi ? (n.midi + t.interval) : null,
                        beats: n.beats,
                        startTime: startTime
                    };
                }).filter(n => n.midi !== null)
            }))
        };
    }

    // 2. ANALYSIS
    if (p.includes("analiza esta secuencia") || p.includes("musicólogo")) {
        return {
            titulo: "Melodía Algorítmica",
            genero: "Exercicio Coral"
        };
    }

    // 3. VARIATION
    if (p.includes("variación") || p.includes("reescríbela")) {
        return App.notesData.map(n => ({
            midi: n.midi ? (n.midi + (Math.random() > 0.5 ? 2 : -2)) : null,
            beats: n.beats
        })).filter(n => n.midi !== null);
    }

    // 4. EXTEND
    if (p.includes("continúa") || p.includes("notas nuevas")) {
        const lastMidi = App.notesData[App.notesData.length - 1]?.midi || 60;
        return Array.from({ length: 8 }, () => ({
            midi: lastMidi + Math.floor(Math.random() * 5 - 2),
            beats: 0.5
        }));
    }

    // 5. LYRICS
    if (p.includes("letrista") || p.includes("estrofa")) {
        return {
            lyrics: "No silencio da noite,\na melodía comeza a soar.\nSen cables nin conexións,\na música volve a brillar."
        };
    }

    // Default Fallback
    return { text: "Modo Offline Activo. Non hai conexión coa API." };
};