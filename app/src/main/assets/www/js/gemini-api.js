// Gemini AI Integration

App.callGemini = async function(prompt) {
    // WARNING: In a real app, do not expose API Keys in client-side code.
    // Ideally, this should be a call to your backend or a Firebase function.
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${App.apiKey}`;
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
            throw new Error(`Error API: ${response.status}`);
        }

        const json = await response.json();
        
        const candidate = json.candidates?.[0];
        if (!candidate?.content?.parts?.[0]?.text) {
            if (candidate?.finishReason === 'SAFETY') {
                throw new Error("Contenido bloqueado por filtros de seguridad.");
            }
            throw new Error("Respuesta vacía de la IA.");
        }

        let text = candidate.content.parts[0].text;
        text = text.replace(/^```json\s*/i, '').replace(/\s*```$/, '');

        return JSON.parse(text);

    } catch(e) {
        console.error("Gemini Error:", e);
        throw e;
    }
};

App.triggerIAAnalysis = async function() {
    if(App.notesData.length < 3) return;
    
    App.dom.aiStatus.classList.remove('hidden');
    App.dom.aiStatusText.textContent = "Gemini identificando estilo...";

    const melody = App.notesData.slice(0, 15).map(n => n.midi ? App.midiToName(n.midi).n : "silencio").join(",");
    const prompt = `Actúa como un musicólogo experto. Analiza esta secuencia de notas: ${melody}. 
    Responde con un JSON exacto: {"titulo": "Un título creativo y corto en español", "genero": "Género musical (ej: Jazz, Folk, Pop)"}`;
    
    try {
        const data = await App.callGemini(prompt);
        
        App.dom.aiPanel.classList.remove('hidden');
        App.dom.aiTitle.textContent = data.titulo;
        App.dom.aiGenre.textContent = data.genero;
        
        App.currentTitle = data.titulo;
        App.currentGenre = data.genero;

    } catch(e) {
        console.log("Error IA:", e);
        App.dom.aiStatusText.textContent = "Error de conexión con IA";
        setTimeout(() => App.dom.aiStatus.classList.add('hidden'), 2000);
    } finally { 
        if (!App.dom.aiStatusText.textContent.includes("Error")) {
            App.dom.aiStatus.classList.add('hidden'); 
        }
    }
};

App.extendMelody = async function() {
    if(App.notesData.length === 0) return;

    App.dom.aiStatus.classList.remove('hidden');
    App.dom.aiStatusText.textContent = "Gemini componiendo...";
    App.dom.btnExtend.disabled = true;

    const contextNotes = App.notesData.slice(-10); 
    const prompt = `Eres un compositor experto. Continúa la siguiente melodía (formato JSON array de objetos {midi, beats}).
    
    Contexto (últimas notas): ${JSON.stringify(contextNotes)}
    Estilo deseado: ${App.currentGenre}.
    
    TAREA: Genera 8 a 12 notas nuevas que sigan el flujo musical de forma natural.
    REGLAS:
    1. Devuelve SOLO un JSON Array válido: [{"midi": 60, "beats": 1}, ...].
    2. 'midi' debe ser un entero entre 50 y 90.
    3. 'beats' debe ser 0.25, 0.5, 1, o 2.
    4. Intenta resolver la frase musical. 
    `;

    try {
        const newNotes = await App.callGemini(prompt);
        
        if(Array.isArray(newNotes)) {
            App.notesData = [...App.notesData, ...newNotes];
            App.renderScore(App.notesData);
            App.dom.scoreOutput.scrollLeft = App.dom.scoreOutput.scrollWidth;
        }
    } catch(e) {
        console.error(e);
        App.dom.aiStatusText.textContent = "Error al componer";
        setTimeout(() => App.dom.aiStatus.classList.add('hidden'), 2000);
    } finally {
        if (!App.dom.aiStatusText.textContent.includes("Error")) {
            App.dom.aiStatus.classList.add('hidden');
        }
        App.dom.btnExtend.disabled = false;
    }
};

App.generateVariation = async function() {
    if(App.notesData.length === 0) return;

    App.dom.aiStatus.classList.remove('hidden');
    App.dom.aiStatusText.textContent = "Gemini reimaginando...";
    App.dom.btnVariation.disabled = true;

    const prompt = `Eres un arreglista musical experto. Toma esta melodía completa: ${JSON.stringify(App.notesData)} y reescríbela ligeramente para cambiar su estilo. 
    
    Elige un estilo al azar (Jazz, Barroco, Minimalista, etc) y adapta el ritmo y las notas.
    Mantén la duración total aproximada.
    
    REGLAS:
    1. Devuelve SOLO un JSON Array válido: [{"midi": 60, "beats": 1}, ...].
    2. 'midi' debe ser un entero entre 50 y 90.
    3. 'beats' debe ser 0.25, 0.5, 1, o 2.
    `;

    try {
        const newNotes = await App.callGemini(prompt);
        
        if(Array.isArray(newNotes)) {
            App.notesData = newNotes;
            App.renderScore(App.notesData);
            alert("¡Estilo variado aplicado!");
        }
    } catch(e) {
        console.error(e);
        App.dom.aiStatusText.textContent = "Error al variar";
        setTimeout(() => App.dom.aiStatus.classList.add('hidden'), 2000);
    } finally {
        if (!App.dom.aiStatusText.textContent.includes("Error")) {
            App.dom.aiStatus.classList.add('hidden');
        }
        App.dom.btnVariation.disabled = false;
    }
};

App.analyzePerformance = async function() {
    App.dom.aiStatus.classList.remove('hidden');
    App.dom.aiStatusText.textContent = "El profesor está escuchando...";
    App.dom.btnCritique.disabled = true;

    const prompt = `Actúa como un profesor de música de conservatorio amable pero exigente. Analiza esta secuencia de notas: ${JSON.stringify(App.notesData)}. 
    
    Dame una evaluación en español de máximo 40 palabras.
    Comenta sobre:
    1. Variedad rítmica.
    2. Rango tonal.
    3. Una sugerencia constructiva.
    
    Devuelve un JSON exacto: {"critique": "Tu texto aquí..."}`;

    try {
        const data = await App.callGemini(prompt);
        App.dom.critiqueCard.classList.remove('hidden');
        App.dom.aiCritiqueContent.textContent = data.critique;
    } catch(e) {
        console.error(e);
        App.dom.aiStatusText.textContent = "Error al analizar";
        setTimeout(() => App.dom.aiStatus.classList.add('hidden'), 2000);
    } finally {
        if (!App.dom.aiStatusText.textContent.includes("Error")) {
            App.dom.aiStatus.classList.add('hidden');
        }
        App.dom.btnCritique.disabled = false;
    }
};

App.generateLyrics = async function() {
    App.dom.aiStatus.classList.remove('hidden');
    App.dom.aiStatusText.textContent = "Gemini escribiendo letra...";
    App.dom.btnLyrics.disabled = true;

    const prompt = `Eres un letrista de canciones profesional. Escribe una estrofa corta (4 líneas) en español para una canción titulada "${App.currentTitle}" del género "${App.currentGenre}".
    
    La letra debe encajar rítmicamente con una melodía alegre/melancólica según el título.
    Devuelve un JSON exacto: {"lyrics": "línea 1\nlínea 2\nlínea 3\nlínea 4"}`;

    try {
        const data = await App.callGemini(prompt);
        App.dom.lyricsCard.classList.remove('hidden');
        App.dom.aiLyricsContent.textContent = data.lyrics;
    } catch(e) {
        console.error(e);
        App.dom.aiStatusText.textContent = "Error al escribir letra";
        setTimeout(() => App.dom.aiStatus.classList.add('hidden'), 2000);
    } finally {
        if (!App.dom.aiStatusText.textContent.includes("Error")) {
            App.dom.aiStatus.classList.add('hidden');
        }
        App.dom.btnLyrics.disabled = false;
    }
};
