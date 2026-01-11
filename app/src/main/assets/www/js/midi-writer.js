// Simple MIDI Writer (Embedded)
// Covers: Track, NoteEvent, WaitEvent, ProgramChangeEvent, Writer.dataUri

(function (root) {

    function stringToBytes(str) {
        return str.split('').map(c => c.charCodeAt(0));
    }

    function durationToTicks(d) {
        // 128 ticks per quarter note (4)
        const map = { '1': 512, '2': 256, '4': 128, '8': 64, '16': 32 };
        return map[d] || 128;
    }

    function numberToBytes(number, bytes) {
        let arr = [];
        for (let i = bytes - 1; i >= 0; i--) {
            arr.push((number >> (8 * i)) & 0xFF);
        }
        return arr;
    }

    function variableLength(number) {
        let buffer = [];
        let value = number;
        if (value > 0x0FFFFFFF) throw new Error("Var length too big");

        let i = value & 0x7F;
        while ((value >>= 7)) {
            i <<= 8;
            i |= ((value & 0x7F) | 0x80);
        }
        while (true) {
            buffer.push(i & 0xFF);
            if (i & 0x80) i >>= 8;
            else break;
        }
        return buffer;
    }

    class Track {
        constructor() {
            this.events = [];
        }
        addEvent(event) { this.events.push(event); return this; }
        addTrackName(name) { return this; } // Ignored in simple version
        toBytes() {
            let trackData = [];
            this.events.forEach(e => trackData.push(...e.toBytes()));
            // End of Track
            trackData.push(0x00, 0xFF, 0x2F, 0x00);

            let head = stringToBytes("MTrk");
            let len = numberToBytes(trackData.length, 4);
            return [...head, ...len, ...trackData];
        }
    }

    class Writer {
        constructor(tracks) {
            this.tracks = tracks || [];
        }
        dataUri() {
            let header = [
                ...stringToBytes("MThd"),
                ...numberToBytes(6, 4),
                ...numberToBytes(1, 2), // Format 1 (Multi-track)
                ...numberToBytes(this.tracks.length, 2),
                ...numberToBytes(128, 2) // Ticks per beat
            ];

            let data = [...header];
            this.tracks.forEach(t => data.push(...t.toBytes()));

            let binary = "";
            let bytes = new Uint8Array(data);
            for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
            return "data:audio/midi;base64," + btoa(binary);
        }
    }

    class NoteEvent {
        constructor(fields) {
            this.pitch = fields.pitch; // ['C4'] or ['C4', 'E4']
            this.duration = fields.duration; // '1', '2', '4', '8', '16'
            this.channel = 1;
            this.velocity = 100;
        }
        toBytes() {
            let durTicks = durationToTicks(this.duration);
            let bytes = [];

            // Note On
            this.pitch.forEach(p => {
                let midi = this.noteToMidi(p);
                bytes.push(0x00, 0x90, midi, this.velocity); // Delta 0
            });

            // Note Off (Wait for duration)
            this.pitch.forEach((p, i) => {
                let midi = this.noteToMidi(p);
                // Only first Note Off has delta time, others 0 (chord)
                let delta = (i === 0) ? variableLength(durTicks) : [0x00];
                bytes.push(...delta, 0x80, midi, 0x40);
            });

            return bytes;
        }

        noteToMidi(n) {
            // "C#4"
            let note = n.slice(0, -1);
            let oct = parseInt(n.slice(-1));
            const notes = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
            let idx = notes.indexOf(note);
            if (idx === -1) idx = notes.indexOf(note.replace('H', '')); // Typo fix
            return (oct + 1) * 12 + idx;
        }
    }

    class WaitEvent {
        constructor(fields) {
            this.duration = fields.duration;
        }
        toBytes() {
            // A wait event in MIDI is just a delta time before the NEXT event.
            // Using a dummy CC to consume time in this simplified implementation.
            let ticks = durationToTicks(this.duration);
            return [...variableLength(ticks), 0xB0, 123, 0]; // CC All Notes Off (safe dummy)
        }
    }

    class ProgramChangeEvent {
        constructor(fields) {
            this.instrument = fields.instrument || 1;
        }
        toBytes() {
            return [0x00, 0xC0, this.instrument];
        }
    }

    root.MidiWriter = {
        Track, Writer, NoteEvent, WaitEvent, ProgramChangeEvent
    };

})(window);