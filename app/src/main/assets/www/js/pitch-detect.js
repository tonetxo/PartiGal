// Pitch Detection & Signal Processing

App.processWhistle = async function(rawBuffer, sourceType) {
    // PRE-PROCESSING: Filtering & Compression to clean up mic noise
    // We use OfflineAudioContext to render the audio through filters "instantly"
    const offlineCtx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(
        1, rawBuffer.length, rawBuffer.sampleRate
    );

    const source = offlineCtx.createBufferSource();
    source.buffer = rawBuffer;

    // 1. Highpass Filter (Remove wind/breath rumble below 600Hz)
    const highpass = offlineCtx.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = 600;

    // 2. Lowpass Filter (Remove hiss/clicks above 4000Hz)
    const lowpass = offlineCtx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 4000;

    // 3. Compressor (Even out dynamics)
    const compressor = offlineCtx.createDynamicsCompressor();
    compressor.threshold.value = -50;
    compressor.knee.value = 40;
    compressor.ratio.value = 12;
    compressor.attack.value = 0;
    compressor.release.value = 0.25;

    // Chain: Source -> HP -> LP -> Compressor -> Destination
    source.connect(highpass);
    highpass.connect(lowpass);
    lowpass.connect(compressor);
    compressor.connect(offlineCtx.destination);

    source.start(0);

    // Render the filtered audio
    const filteredBuffer = await offlineCtx.startRendering();
    
    // NOW PROCESS DATA
    let data = new Float32Array(filteredBuffer.getChannelData(0));

    // Normalization (Post-Filter)
    let maxPeak = 0;
    for (let i = 0; i < data.length; i++) {
        if (Math.abs(data[i]) > maxPeak) maxPeak = Math.abs(data[i]);
    }
    
    // Aggressive boost for weak mobile signals
    if (maxPeak > 0.001) {
        const factor = 0.95 / maxPeak;
        for (let i = 0; i < data.length; i++) {
            data[i] *= factor;
        }
    }

    const sr = filteredBuffer.sampleRate;
    const step = 512, win = 2048, frames = [];
    
    // Thresholds optimized for FILTERED audio
    // We can be slightly stricter now that noise is gone to avoid false positives
    const silenceThresh = 0.03; 
    const yinTolerance = 0.40; // Generous tolerance for whistle waveform

    for (let i = 0; i < data.length; i += step) {
        const chunk = data.slice(i, i + win);
        if (chunk.length < win) break;
        const freq = App.getYin(chunk, sr, silenceThresh, yinTolerance);
        frames.push(freq > 0 ? Math.round(69 + 12 * Math.log2(freq / 440)) : null);
    }

    // APPLY MEDIAN FILTER TO FRAMES (Remove erratic blips)
    const filteredFrames = [];
    for (let i = 0; i < frames.length; i++) {
        const window = [];
        for (let j = -2; j <= 2; j++) {
            if (frames[i + j] !== undefined && frames[i + j] !== null) {
                window.push(frames[i + j]);
            }
        }
        if (window.length > 0) {
            window.sort((a, b) => a - b);
            filteredFrames.push(window[Math.floor(window.length / 2)]);
        } else {
            filteredFrames.push(null);
        }
    }

    return App.aggregateNotes(filteredFrames, step / sr);
};

App.getYin = function(buf, sr, thresh, tolerance) {
    let rms = 0;
    for(let i=0; i<buf.length; i++) rms += buf[i]*buf[i];
    
    if (Math.sqrt(rms/buf.length) < thresh) return -1;
    
    let size = Math.floor(buf.length / 2), df = new Float32Array(size);
    for (let t = 0; t < size; t++) {
        for (let i = 0; i < size; i++) {
            let d = buf[i] - buf[i+t];
            df[t] += d*d;
        }
    }
    let cmndf = new Float32Array(size); cmndf[0] = 1; let sum = 0;
    for (let t = 1; t < size; t++) {
        sum += df[t];
        cmndf[t] = df[t] / ((1/t) * sum);
    }
    
    for (let t = 1; t < size; t++) { if (cmndf[t] < tolerance) return sr / t; }
    return -1;
};

App.aggregateNotes = function(frames, frameDur) {
    const spb = 60 / App.bpm;
    const noteGroups = [];
    let current = null;

    // 1. INITIAL AGGREGATION (Fuzzy Matching)
    frames.forEach((midi, i) => {
        if (midi === null) {
            if (current) {
                noteGroups.push(current);
                current = null;
            }
            return;
        }

        if (current) {
            // Fuzzy match: +/- 1 semitone tolerance
            if (Math.abs(midi - current.avgMidi) <= 1) {
                current.endIndex = i;
                const count = (current.endIndex - current.startIndex);
                current.avgMidi = (current.avgMidi * count + midi) / (count + 1);
            } else {
                noteGroups.push(current);
                current = { startIndex: i, endIndex: i, avgMidi: midi };
            }
        } else {
            current = { startIndex: i, endIndex: i, avgMidi: midi };
        }
    });
    if (current) noteGroups.push(current);

    // 2. GAP FILLING (Merge fragmented notes)
    const mergedGroups = [];
    if (noteGroups.length > 0) {
        mergedGroups.push(noteGroups[0]);
        
        for (let i = 1; i < noteGroups.length; i++) {
            const prev = mergedGroups[mergedGroups.length - 1];
            const curr = noteGroups[i];
            
            const gapFrames = curr.startIndex - prev.endIndex;
            const gapTime = gapFrames * frameDur;
            
            // Merge if same pitch AND gap < 0.3s
            if (Math.abs(Math.round(prev.avgMidi) - Math.round(curr.avgMidi)) <= 1 && gapTime < 0.3) {
                prev.endIndex = curr.endIndex; 
            } else {
                mergedGroups.push(curr);
            }
        }
    }

    // 3. CONVERT TO EVENTS
    const events = [];
    let lastEnd = 0;

    mergedGroups.forEach(g => {
        const startTime = g.startIndex * frameDur;
        const endTime = g.endIndex * frameDur;
        const dur = endTime - startTime;
        const finalMidi = Math.round(g.avgMidi);

        if (dur > 0.1) { 
            const silence = startTime - lastEnd;
            if (silence > 0.1) {
                let sb = Math.round((silence / spb) * 4) / 4;
                if (sb >= 0.25) events.push({ midi: null, beats: sb });
            }
            
            let nb = Math.round((dur / spb) * 4) / 4;
            if (nb < 0.25) nb = 0.25;
            
            events.push({ midi: finalMidi, beats: nb });
            lastEnd = endTime; 
        }
    });

    return events;
};