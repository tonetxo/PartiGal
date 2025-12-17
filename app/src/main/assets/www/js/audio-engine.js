// Audio Engine: Recording, Playback, and File Handling

App.initAudio = function() {
    App.currentSynth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'sine' },
        envelope: { attack: 0.1, release: 1.2 }
    }).toDestination();
};

App.handleFile = async function(file) {
    if (!file) return;
    App.dom.fileLabel.textContent = file.name.length > 20 ? file.name.substring(0, 18) + "..." : file.name;
    
    if (!App.audioCtx) App.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    try {
        if (App.audioCtx.state === 'suspended') await App.audioCtx.resume();
        const buffer = await App.audioCtx.decodeAudioData(await file.arrayBuffer());
        App.lastBuffer = buffer;
        App.lastSourceType = 'file'; 
        App.processAndRender(buffer, 'file');
    } catch (e) {
        console.error(e);
        alert("Error procesando el audio.");
    }
};

App.processAndRender = async function(buffer, sourceType) {
    App.dom.aiStatus.classList.remove('hidden');
    App.dom.aiStatusText.textContent = sourceType === 'mic' ? "Filtrando y analizando..." : "Procesando archivo...";
    
    App.dom.lyricsCard.classList.add('hidden');
    App.dom.critiqueCard.classList.add('hidden');
    App.dom.aiPanel.classList.add('hidden');

    // Give UI a moment to update
    setTimeout(async () => {
        try {
            App.notesData = await App.processWhistle(buffer, sourceType);
            
            if (App.notesData.length > 0) {
                App.renderScore(App.notesData);
                [App.dom.playBtn, App.dom.downloadMidi, App.dom.retranscribeBtn, App.dom.btnExtend, App.dom.btnLyrics, App.dom.btnVariation, App.dom.btnCritique].forEach(b => b.disabled = false);
                App.triggerIAAnalysis();
            } else {
                const msg = sourceType === 'mic' 
                    ? "No se detectaron notas claras. Intenta silbar más fuerte."
                    : "El archivo parece vacío o demasiado silencioso.";
                alert(msg);
                App.dom.aiStatus.classList.add('hidden');
            }
        } catch (e) {
            console.error("Error processing audio:", e);
            alert("Error al procesar el audio.");
            App.dom.aiStatus.classList.add('hidden');
        }
    }, 50);
};

App.toggleRecording = async function() {
    if (!App.isRecording) {
        // START RECORDING
        try {
            if (!App.audioCtx) App.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            if (App.audioCtx.state === 'suspended') {
                await App.audioCtx.resume();
            }

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            const source = App.audioCtx.createMediaStreamSource(stream);
            const analyser = App.audioCtx.createAnalyser();
            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.8;
            source.connect(analyser);
            
            App.mediaRecorder = new MediaRecorder(stream);
            App.audioChunks = [];

            App.mediaRecorder.ondataavailable = event => App.audioChunks.push(event.data);

            App.mediaRecorder.onstop = async () => {
                cancelAnimationFrame(App.vuAnimationFrame);
                
                App.dom.uploadStateContent.classList.remove('hidden');
                App.dom.recordingStateContent.classList.add('hidden');
                App.dom.dropZone.classList.remove('recording-box');
                App.dom.recordBtn.classList.remove('recording-btn-active');
                App.dom.recordText.textContent = "Grabar Silbido";
                App.dom.recordIcon.textContent = "🎤";
                
                if(App.dom.micLevelBar) App.dom.micLevelBar.style.width = '0%';

                const audioBlob = new Blob(App.audioChunks, { type: 'audio/webm' });
                const arrayBuffer = await audioBlob.arrayBuffer();
                
                try {
                    const buffer = await App.audioCtx.decodeAudioData(arrayBuffer);
                    App.lastBuffer = buffer;
                    App.lastSourceType = 'mic';
                    App.dom.fileLabel.textContent = "Grabación de micrófono";
                    App.processAndRender(buffer, 'mic');
                } catch (e) {
                    console.error(e);
                    alert("Error procesando audio. ¿Estaba muy bajo?");
                }
                
                stream.getTracks().forEach(track => track.stop());
            };

            App.isRecording = true;
            App.visualizeVolume(analyser);
            App.mediaRecorder.start();
            
            App.dom.uploadStateContent.classList.add('hidden');
            App.dom.recordingStateContent.classList.remove('hidden');
            App.dom.dropZone.classList.add('recording-box');
            App.dom.recordBtn.classList.add('recording-btn-active');
            App.dom.recordText.textContent = "Detener";
            App.dom.recordIcon.textContent = "⏹️";
            
        } catch (err) {
            console.error("Error micrófono:", err);
            App.isRecording = false; 
            alert("No se pudo iniciar la grabación. Verifica los permisos del micrófono.");
        }
    } else {
        if (App.mediaRecorder && App.mediaRecorder.state !== 'inactive') {
            App.mediaRecorder.stop();
        }
        App.isRecording = false; 
    }
};

App.visualizeVolume = function(analyser) {
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    
    const draw = () => {
        if (!App.isRecording) return;
        
        App.vuAnimationFrame = requestAnimationFrame(draw);
        analyser.getByteTimeDomainData(dataArray); 
        
        let sum = 0;
        for(let i = 0; i < dataArray.length; i++) {
            const x = (dataArray[i] - 128) / 128; 
            sum += x * x;
        }
        const rms = Math.sqrt(sum / dataArray.length);
        const db = 20 * Math.log10(Math.max(rms, 0.0001)); 
        
        const minDb = -50;
        const maxDb = -5;
        
        let percent = ((db - minDb) / (maxDb - minDb)) * 100;
        percent = Math.max(0, Math.min(100, percent));
        
        if (App.dom.micLevelBar) {
            App.dom.micLevelBar.style.width = `${percent}%`;
            
            if (percent > 95) { 
                App.dom.micLevelBar.classList.remove('bg-emerald-500');
                App.dom.micLevelBar.classList.add('bg-red-500');
            } else {
                App.dom.micLevelBar.classList.remove('bg-red-500');
                App.dom.micLevelBar.classList.add('bg-emerald-500');
            }
        }
    };
    draw();
};

App.playAudio = function() {
    Tone.start(); 
    const now = Tone.now();
    const spb = 60 / App.bpm; 
    let t = 0;
    
    App.notesData.forEach(ev => {
        if (ev.midi) {
            App.currentSynth.triggerAttackRelease(
                Tone.Frequency(ev.midi, "midi").toFrequency(), 
                ev.beats * spb * 0.9, 
                now + t
            );
        }
        t += ev.beats * spb;
    });
};

App.saveMidi = function() {
    const track = new MidiWriter.Track();
    track.addEvent(new MidiWriter.ProgramChangeEvent({instrument: 1}));
    
    App.notesData.forEach(ev => {
        if (!ev.midi) {
            track.addEvent(new MidiWriter.WaitEvent({ duration: App.beatsToVex(ev.beats) }));
        } else {
            const pitchInfo = App.midiToName(ev.midi);
            const pitch = (pitchInfo.n + (pitchInfo.a || '')).toUpperCase() + pitchInfo.o;
            track.addEvent(new MidiWriter.NoteEvent({ 
                pitch: [pitch], 
                duration: App.beatsToVex(ev.beats) 
            }));
        }
    });
    
    const write = new MidiWriter.Writer(track);
    const link = document.createElement('a'); 
    link.href = write.dataUri(); 
    link.download = `AudioScore-${App.currentTitle.replace(/\s+/g, '-')}.mid`; 
    link.click();
};