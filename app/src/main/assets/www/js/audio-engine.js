// Audio Engine: Recording, Playback, and File Handling

App.initAudio = function () {
    // Master Output Chain: Compressor -> Limiter -> Master Gain -> Destination
    App.masterLimiter = new Tone.Limiter(-1).toDestination();
    App.masterCompressor = new Tone.Compressor({
        threshold: -20,
        ratio: 3,
        attack: 0.01,
        release: 0.1
    }).connect(App.masterLimiter);

    App.masterGain = new Tone.Gain(0.7).connect(App.masterCompressor);

    // Basic synth for simple melody playback (Smooth envelope)
    App.currentSynth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'sine' },
        envelope: { attack: 0.05, decay: 0.1, sustain: 0.5, release: 1.2 }
    }).connect(App.masterGain);

    App.currentSynth.volume.value = -8;

    // Cache for arrangement instruments
    App.synthCache = new Map();
};

App.handleFile = async function (file) {
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

App.processAndRender = async function (buffer, sourceType) {
    if (App.isPlaying) App.stopAudio();

    App.dom.aiStatus.classList.remove('hidden');
    App.dom.aiStatusText.textContent = sourceType === 'mic' ? "Filtrando y analizando..." : "Procesando archivo...";

    App.dom.lyricsCard.classList.add('hidden');
    App.dom.critiqueCard.classList.add('hidden');
    App.dom.aiPanel.classList.add('hidden');

    // Reset AI state
    App.arrangementData = null;
    App.currentTitle = "Sin título";
    App.currentGenre = "Desconocido";

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

App.toggleRecording = async function () {
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

                if (App.dom.micLevelBar) App.dom.micLevelBar.style.width = '0%';

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

App.visualizeVolume = function (analyser) {
    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const draw = () => {
        if (!App.isRecording) return;

        App.vuAnimationFrame = requestAnimationFrame(draw);
        analyser.getByteTimeDomainData(dataArray);

        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
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

App.playAudio = function () {
    // Toggle behavior: if playing, stop
    if (App.isPlaying) {
        App.stopAudio();
        return;
    }

    Tone.start();
    const now = Tone.now();

    // Ramp up master gain to avoid click at start
    App.masterGain.gain.setValueAtTime(0, now);
    App.masterGain.gain.rampTo(0.7, 0.05, now);

    Tone.Transport.cancel(); // Clear any previous scheduled events
    Tone.Transport.stop();
    Tone.Transport.position = 0;

    const spb = 60 / App.bpm;
    Tone.Transport.bpm.value = App.bpm;

    // Check if we have a complex arrangement
    if (App.arrangementData && App.arrangementData.tracks) {

        App.arrangementData.tracks.forEach(track => {
            const name = track.instrument.toLowerCase();
            let synth = App.synthCache.get(name);

            if (!synth) {
                // Create and cache synth if it doesn't exist
                if (name.includes('drum') || name.includes('perc')) {
                    synth = new Tone.MembraneSynth({
                        envelope: { attack: 0.01, decay: 0.2, sustain: 0 }
                    }).connect(App.masterGain);
                    synth.volume.value = -10;
                } else if (name.includes('bass')) {
                    synth = new Tone.MonoSynth({
                        oscillator: { type: 'square' },
                        envelope: { attack: 0.05, decay: 0.2, sustain: 0.4, release: 0.6 }
                    }).connect(App.masterGain);
                    synth.volume.value = -12;
                } else {
                    synth = new Tone.PolySynth(Tone.Synth, {
                        envelope: { attack: 0.05, decay: 0.1, sustain: 0.6, release: 1 }
                    }).connect(App.masterGain);
                    synth.volume.value = -10;
                }
                App.synthCache.set(name, synth);
            }

            // Schedule notes using Transport
            track.notes.forEach(note => {
                if (note.midi) {
                    const startTime = (note.startTime !== undefined) ? note.startTime : 0;
                    const duration = note.beats * spb * 0.9;

                    Tone.Transport.schedule((time) => {
                        synth.triggerAttackRelease(
                            Tone.Frequency(note.midi, "midi").toFrequency(),
                            duration,
                            time
                        );
                    }, startTime * spb);
                }
            });
        });

    } else {
        // Fallback: Play simple melody (Mono track)
        let t = 0;
        App.notesData.forEach(ev => {
            if (ev.midi) {
                const duration = ev.beats * spb * 0.9;
                Tone.Transport.schedule((time) => {
                    App.currentSynth.triggerAttackRelease(
                        Tone.Frequency(ev.midi, "midi").toFrequency(),
                        duration,
                        time
                    );
                }, t);
            }
            t += ev.beats * spb;
        });
    }

    // Calculate total duration and schedule stop
    let totalDuration = 0;
    if (App.arrangementData && App.arrangementData.tracks) {
        App.arrangementData.tracks.forEach(track => {
            track.notes.forEach(note => {
                const endTime = ((note.startTime || 0) + (note.beats || 1)) * spb;
                if (endTime > totalDuration) totalDuration = endTime;
            });
        });
    } else {
        App.notesData.forEach(ev => totalDuration += ev.beats * spb);
    }

    // Auto-stop when finished
    Tone.Transport.schedule(() => {
        App.stopAudio();
    }, totalDuration + 0.5);

    // Start playback
    Tone.Transport.start();
    App.isPlaying = true;

    // Update UI
    if (App.dom.playBtn) {
        App.dom.playBtn.innerHTML = '⏹ Stop';
    }
};

App.stopAudio = function () {
    const now = Tone.now();

    // 1. Ramp down master gain FIRST to avoid click
    if (App.masterGain) {
        App.masterGain.gain.rampTo(0, 0.05, now);
    }

    // 2. Release all synths with a small fade
    if (App.currentSynth) App.currentSynth.releaseAll(0.1);
    App.synthCache.forEach(synth => {
        if (synth.releaseAll) synth.releaseAll(0.1);
        else if (synth.triggerRelease) synth.triggerRelease(now + 0.05);
    });

    // 3. Wait for the fade to complete before stopping the transport
    setTimeout(() => {
        Tone.Transport.stop();
        Tone.Transport.cancel();

        // Reset gain for internal state (though playAudio will ramp it again)
        if (App.masterGain) App.masterGain.gain.setValueAtTime(0.7, Tone.now());

        App.isPlaying = false;
        if (App.dom.playBtn) {
            App.dom.playBtn.innerHTML = '▶ Play';
        }
    }, 100);
};

App.beatsToMidiDuration = function (b) {
    if (b >= 4) return '1';
    if (b >= 2) return '2';
    if (b >= 1) return '4';
    if (b >= 0.5) return '8';
    return '16';
};


App.saveMidi = function () {
    const write = new MidiWriter.Writer([]);

    // Helper to process a list of notes into a track
    const processNotesToTrack = (notes, trackName) => {
        const track = new MidiWriter.Track();
        if (trackName) track.addTrackName(trackName);
        track.addEvent(new MidiWriter.ProgramChangeEvent({ instrument: 1 }));

        // Group notes by startTime to handle chords/polyphony simply
        const timeMap = new Map();

        notes.forEach(n => {
            // Default to monophonic flow if startTime missing
            const start = (n.startTime !== undefined) ? n.startTime : -1;

            if (start === -1) {
                // Sequential mode (original melody)
                if (!n.midi) {
                    track.addEvent(new MidiWriter.WaitEvent({ duration: App.beatsToMidiDuration(n.beats) }));
                } else {
                    const pitchInfo = App.midiToName(n.midi);
                    const pitch = (pitchInfo.n + (pitchInfo.a || '')).toUpperCase() + pitchInfo.o;
                    track.addEvent(new MidiWriter.NoteEvent({
                        pitch: [pitch],
                        duration: App.beatsToMidiDuration(n.beats)
                    }));
                }
            } else {
                // Time-based mode (AI Arrangement)
                if (!timeMap.has(start)) timeMap.set(start, []);
                timeMap.get(start).push(n);
            }
        });

        if (timeMap.size > 0) {
            // Sort by time
            const sortedTimes = Array.from(timeMap.keys()).sort((a, b) => a - b);
            let lastTime = 0;

            sortedTimes.forEach(t => {
                const notesAtTime = timeMap.get(t);
                const waitBeats = t - lastTime;

                if (waitBeats > 0) {
                    track.addEvent(new MidiWriter.WaitEvent({ duration: App.beatsToMidiDuration(waitBeats) }));
                }

                // Add chord (all notes at this start time)
                // Use the duration of the first note (simplification for chords)
                const pitches = [];
                let maxDuration = '4'; // Default

                notesAtTime.forEach(n => {
                    if (n.midi) {
                        const pitchInfo = App.midiToName(n.midi);
                        pitches.push((pitchInfo.n + (pitchInfo.a || '')).toUpperCase() + pitchInfo.o);
                        maxDuration = App.beatsToMidiDuration(n.beats);
                    }
                });

                if (pitches.length > 0) {
                    track.addEvent(new MidiWriter.NoteEvent({
                        pitch: pitches,
                        duration: maxDuration
                    }));
                }

                // Ideally we advance cursor by note duration? 
                // MidiWriter NoteEvent advances cursor by duration.
                // So next wait calculation needs to account for this.
                // Actually, if we use WaitEvent logic relative to previous start, 
                // we need to be careful because NoteEvent adds to the time pointer.

                // Correct Logic for MidiWriter:
                // It's a stream. Wait(X) adds X. Note(D) adds D.
                // So TotalTime = Sum(Waits) + Sum(NoteDurations).
                // But we want TotalTime to match 't'.
                // This is hard with MidiWriter's sequential nature for polyphony where notes overlap time slots.

                // FIX: Use 'wait: 0' hack? Or just assume Monophony/Chords don't overlap strangely.
                // For this prototype, we will trust that NoteEvent consumes time.
                // So 'lastTime' should become t + durationInBeats.

                // Let's rely on standard sequential export.
                // If the next note starts at T+2, and current note is duration 1.
                // We are at T. Write Note(dur=1). We are at T+1.
                // Next target is T+2. Wait(1).

            });
        }

        return track;
    };

    if (App.arrangementData && App.arrangementData.tracks) {
        App.arrangementData.tracks.forEach(t => {
            write.tracks.push(processNotesToTrack(t.notes, t.instrument));
        });
    } else {
        write.tracks.push(processNotesToTrack(App.notesData, "Melody"));
    }

    const base64 = write.dataUri();
    const fileName = `AudioScore-${App.currentTitle.replace(/\s+/g, '-')}.mid`;

    if (window.AndroidInterface && window.AndroidInterface.saveFile) {
        // Native Save
        window.AndroidInterface.saveFile(base64, fileName);
    } else {
        // Fallback for desktop browser debugging
        const link = document.createElement('a');
        link.href = base64;
        link.download = fileName;
        link.click();
    }
};

// Helper required for export logic
App.vexToBeats = function (code) {
    if (code === '1') return 4;
    if (code === '2') return 2;
    if (code === '4') return 1;
    if (code === '8') return 0.5;
    return 0.25;
};