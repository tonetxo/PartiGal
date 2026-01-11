// Pitch Detection & Signal Processing

App.processWhistle = async function (rawBuffer, sourceType) {
    // PRE-PROCESSING: Filtering & Compression to clean up mic noise
    // We use OfflineAudioContext to render the audio through filters "instantly"
    const offlineCtx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(
        1, rawBuffer.length, rawBuffer.sampleRate
    );

    const source = offlineCtx.createBufferSource();
    source.buffer = rawBuffer;

    // 1. Highpass Filter (Remove wind/breath rumble below 200Hz)
    const highpass = offlineCtx.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = 200;

    // 2. Lowpass Filter (Whistling can go high, up to 5-6kHz)
    const lowpass = offlineCtx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 6000;

    // 3. Soft Compressor (Avoid crushing the signal too much)
    const compressor = offlineCtx.createDynamicsCompressor();
    compressor.threshold.value = -30;
    compressor.knee.value = 30;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.01;
    compressor.release.value = 0.1;

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
    const ANALYSIS_STEP = 512;
    const ANALYSIS_WINDOW = 2048;
    const frames = [];

    // Thresholds optimized for FILTERED audio
    // We can be slightly stricter now that noise is gone to avoid false positives
    const silenceThresh = 0.01; // More sensitivity for weak whistles
    const yinTolerance = 0.25; // Balanced tolerance

    for (let i = 0; i < data.length; i += ANALYSIS_STEP) {
        const chunk = data.slice(i, i + ANALYSIS_WINDOW);
        if (chunk.length < ANALYSIS_WINDOW) break;
        const freq = App.getYin(chunk, sr, silenceThresh, yinTolerance);
        // Do not round here! Aggregate with float for better precision
        frames.push(freq > 0 ? (69 + 12 * Math.log2(freq / 440)) : null);
    }

    // APPLY MEDIAN FILTER TO FRAMES (Remove erratic blips)
    const filteredFrames = [];
    for (let i = 0; i < frames.length; i++) {
        const window = [];
        for (let j = -1; j <= 1; j++) { // Smaller window (3) to avoid smearing
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

    return App.aggregateNotes(filteredFrames, ANALYSIS_STEP / sr);
};

App.getYin = function (buf, sr, thresh, tolerance) {
    let rms = 0;
    for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i];

    if (Math.sqrt(rms / buf.length) < thresh) return -1;

    let size = Math.floor(buf.length / 2), df = new Float32Array(size);
    for (let t = 0; t < size; t++) {
        for (let i = 0; i < size; i++) {
            let d = buf[i] - buf[i + t];
            df[t] += d * d;
        }
    }
    let cmndf = new Float32Array(size); cmndf[0] = 1; let sum = 0;
    for (let t = 1; t < size; t++) {
        sum += df[t];
        cmndf[t] = df[t] / ((1 / t) * sum);
    }

    for (let t = 1; t < size; t++) {
        if (cmndf[t] < tolerance) {
            // Found a candidate, find the local minimum for better accuracy
            // Search for the minimum in the next few samples to refine the pitch
            let minVal = cmndf[t];
            let minIdx = t;
            for (let j = t + 1; j < size && j < t + 10; j++) { // Search up to 10 samples ahead
                if (cmndf[j] < minVal) {
                    minVal = cmndf[j];
                    minIdx = j;
                }
            }
            return sr / minIdx;
        }
    }
    return -1;
};

App.aggregateNotes = function (frames, frameDur) {
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
            // Tighter match: +/- 0.5 semitone to avoid merging distinct notes (like semitones)
            if (Math.abs(midi - current.avgMidi) < 0.5) {
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

            // Stricter: Only merge and fill gaps if it's REALLY the same note
            if (Math.abs(prev.avgMidi - curr.avgMidi) < 0.4 && gapTime < 0.2) {
                prev.endIndex = curr.endIndex;
            } else {
                mergedGroups.push(curr);
            }
        }
    }

    // 3. CONVERT TO EVENTS
    const events = [];
    let lastEnd = 0;

    // Use mergeThreshold (1-12) to filter out short blips
    // Default is 6, we'll map it to a duration threshold (0.01 to 0.2 seconds)
    const minNoteDuration = (App.mergeThreshold || 6) * 0.02;

    mergedGroups.forEach(g => {
        const startTime = g.startIndex * frameDur;
        const endTime = g.endIndex * frameDur;
        const dur = endTime - startTime;
        const finalMidi = Math.round(g.avgMidi);

        if (dur > minNoteDuration) {
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