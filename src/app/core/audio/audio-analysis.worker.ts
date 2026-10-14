import { analyzeChannels, type AudioAnalysisRequest, type AudioAnalysisResponse } from '@axe/core/audio/audio-analysis';

interface WorkerScope {
  addEventListener(type: 'message', listener: (event: MessageEvent<AudioAnalysisRequest>) => void): void;
  postMessage(message: AudioAnalysisResponse): void;
}

const scope = self as unknown as WorkerScope;

scope.addEventListener('message', (event) => {
  const { id, channels, sampleRate } = event.data;
  let result: AudioAnalysisResponse['result'];
  try {
    result = analyzeChannels(channels, sampleRate);
  } catch {
    result = null;
  }
  scope.postMessage({ id, result });
});
