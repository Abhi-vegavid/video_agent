import { useEffect, useState } from "react";

export const useAudioAnalyser = (stream) => {
  const [volume, setVolume] = useState(0);

  useEffect(() => {
    if (!stream) {
      setVolume(0);
      return;
    }

    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;

    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    let raf;

    const update = () => {
     analyser.getByteFrequencyData(dataArray);

let sum = 0;
for (let i = 0; i < dataArray.length; i++) {
  sum += dataArray[i];
}

const avg = sum / dataArray.length / 255;

setVolume(avg);

      raf = requestAnimationFrame(update);
    };

    update();

    return () => {
      cancelAnimationFrame(raf);
      audioContext.close();
    };
  }, [stream]);

  return volume;
};