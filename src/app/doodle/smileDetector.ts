type SmileFrame = {
  hasFace: boolean;
  smileScore: number;
};

export type SmileDetector = {
  detect(video: HTMLVideoElement): SmileFrame;
  close(): void;
};

const MEDIAPIPE_VERSION = '0.10.35';
const WASM_ROOT = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

export async function createSmileDetector(): Promise<SmileDetector> {
  const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
  const vision = await FilesetResolver.forVisionTasks(WASM_ROOT);
  let landmarker;
  try {
    landmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
      outputFaceBlendshapes: true,
      runningMode: 'VIDEO',
      numFaces: 1
    });
  } catch {
    landmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' },
      outputFaceBlendshapes: true,
      runningMode: 'VIDEO',
      numFaces: 1
    });
  }

  return {
    detect(video) {
      const result = landmarker.detectForVideo(video, performance.now());
      const categories = result.faceBlendshapes?.[0]?.categories || [];
      const left = categories.find((item) => item.categoryName === 'mouthSmileLeft')?.score || 0;
      const right = categories.find((item) => item.categoryName === 'mouthSmileRight')?.score || 0;
      return { hasFace: Boolean(result.faceLandmarks?.length), smileScore: (left + right) / 2 };
    },
    close() {
      landmarker.close();
    }
  };
}
