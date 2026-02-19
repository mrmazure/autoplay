export const Waveform = {
    async generate(audioBlob, samples = 1000) {
        if (!audioBlob) return null;
        try {
            const arrayBuffer = await audioBlob.arrayBuffer();
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

            const rawData = audioBuffer.getChannelData(0); // Use first channel
            const blockSize = Math.floor(rawData.length / samples);
            const data = new Float32Array(samples);

            for (let i = 0; i < samples; i++) {
                let sum = 0;
                for (let j = 0; j < blockSize; j++) {
                    sum += Math.abs(rawData[blockSize * i + j]);
                }
                data[i] = sum / blockSize;
            }

            // Normalize
            const max = Math.max(...data);
            const normalized = data.map(v => v / max);

            return normalized;
        } catch (e) {
            console.error("Waveform generation failed", e);
            return null;
        }
    }
};
