// VexFlow Score Rendering

App.renderScore = function (events) {
    App.dom.scoreOutput.innerHTML = '';

    const containerWidth = App.dom.scoreOutput.clientWidth || 800;
    const padding = 20;
    const availableWidth = containerWidth - (padding * 2);

    let stavesPerRow = 1;
    if (availableWidth > 1100) stavesPerRow = 3;
    else if (availableWidth > 700) stavesPerRow = 2;

    const staveWidth = Math.floor(availableWidth / stavesPerRow);

    const { Renderer, Stave, StaveNote, Voice, Formatter, Accidental, Beam } = Vex.Flow;

    const renderer = new Renderer(App.dom.scoreOutput, Renderer.Backends.SVG);
    const context = renderer.getContext();

    const isDark = document.documentElement.classList.contains('dark');
    const mainColor = isDark ? '#f1f5f9' : '#1e293b';

    context.setFont("Inter", 12, "").setBackgroundFillStyle(isDark ? "#1e293b" : "#ffffff");
    context.setFillStyle(mainColor);
    context.setStrokeStyle(mainColor);

    let measures = [], currentM = [], currentSum = 0;

    events.forEach((ev, idx) => {
        let rem = 4 - currentSum;
        let actual = Math.min(ev.beats, rem);

        if (actual <= 0) {
            measures.push([...currentM]);
            currentM = []; currentSum = 0; rem = 4;
            actual = Math.min(ev.beats, rem);
        }

        const info = ev.midi ? App.midiToName(ev.midi) : { n: "b", o: "4", a: null, r: true };
        const noteKeys = info.r ? ["b/4"] : [`${info.n}/${info.o}`];

        const sn = new StaveNote({
            keys: noteKeys,
            duration: App.beatsToVex(actual) + (info.r ? "r" : ""),
            stem_direction: -1
        });

        sn.setStyle({ fillStyle: mainColor, strokeStyle: mainColor });

        if (info.a && !info.r) sn.addModifier(new Accidental(info.a));
        currentM.push(sn);
        currentSum += actual;

        if (idx === events.length - 1 && currentSum > 0) {
            while (currentSum < 4) {
                let fill = Math.min(4 - currentSum, 1);
                if (4 - currentSum >= 1) fill = 1;
                else fill = 0.5;

                const filler = new StaveNote({ keys: ["b/4"], duration: App.beatsToVex(fill) + "r", stem_direction: -1 });
                filler.setStyle({ fillStyle: mainColor, strokeStyle: mainColor });
                currentM.push(filler);
                currentSum += fill;
            }
            measures.push([...currentM]);
        } else if (currentSum >= 4) {
            measures.push([...currentM]);
            currentM = []; currentSum = 0;
        }
    });
    if (currentM.length > 0 && currentSum < 4) measures.push(currentM);

    const rowHeight = 150;
    const totalRows = Math.ceil(measures.length / stavesPerRow);
    renderer.resize(containerWidth, totalRows * rowHeight + 50);

    measures.forEach((m, i) => {
        const row = Math.floor(i / stavesPerRow);
        const col = i % stavesPerRow;

        // Align strictly to the left (x=0 relative to column)
        const x = col * staveWidth;
        const y = row * rowHeight + 20;

        const stave = new Stave(x, y, staveWidth);

        if (i === 0 || col === 0) {
            stave.addClef("treble").addTimeSignature("4/4");
            stave.setBegBarType(Vex.Flow.Barline.type.SINGLE);
        }

        if (i === measures.length - 1) {
            stave.setEndBarType(Vex.Flow.Barline.type.END);
        } else if (col === stavesPerRow - 1) {
            stave.setEndBarType(Vex.Flow.Barline.type.SINGLE);
        }

        stave.setContext(context).draw();

        try {
            const voice = new Voice({ num_beats: 4, beat_value: 4 }).setMode(Voice.Mode.SOFT);
            voice.addTickables(m);

            const startX = stave.getNoteStartX();
            const availableVoiceWidth = (stave.getX() + stave.getWidth()) - startX - 20;

            new Formatter().joinVoices([voice]).format([voice], availableVoiceWidth);

            const beams = Beam.generateBeams(m, {
                groups: [new Vex.Flow.Fraction(1, 4)],
                stem_direction: -1
            });

            beams.forEach(b => b.setStyle({ fillStyle: mainColor, strokeStyle: mainColor }));

            voice.draw(context, stave);
            beams.forEach(b => b.setContext(context).draw());
        } catch (e) {
            console.warn("Error rendering measure", i, e);
        }
    });

    // Enable/Disable UI Controls based on content
    const hasNotes = events.length > 0;
    if (App.dom.btnCompose) App.dom.btnCompose.disabled = !hasNotes;
    if (App.dom.btnExtend) App.dom.btnExtend.disabled = !hasNotes;
    if (App.dom.btnVariation) App.dom.btnVariation.disabled = !hasNotes;
    if (App.dom.btnCritique) App.dom.btnCritique.disabled = !hasNotes;
    if (App.dom.btnLyrics) App.dom.btnLyrics.disabled = !hasNotes;
    if (App.dom.playBtn) App.dom.playBtn.disabled = !hasNotes;
    if (App.dom.downloadMidi) App.dom.downloadMidi.disabled = !hasNotes;
    if (App.dom.retranscribeBtn) App.dom.retranscribeBtn.disabled = !hasNotes;
};

App.beatsToVex = function (b) {
    const map = { 4: "w", 2: "h", 1: "q", 0.5: "8" };
    return map[b] || "16";
};

App.midiToName = function (m) {
    const names = ["c", "c#", "d", "d#", "e", "f", "f#", "g", "g#", "a", "a#", "b"];
    const n = names[m % 12];
    return { n: n.replace('#', ''), o: Math.floor(m / 12) - 1, a: n.includes('#') ? '#' : null };
};