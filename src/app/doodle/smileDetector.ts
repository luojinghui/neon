import { visionFileset, visionModel } from './visionRuntime';

type SmileFrame = {
  hasFace: boolean;
  smileScore: number;
};

export type SmileDetector = {
  detect(video: HTMLVideoElement): SmileFrame;
  close(): void;
};

export async function createSmileDetector(): Promise<SmileDetector> {
  const { FaceLandmarker } = await import('@mediapipe/tasks-vision');
  const [vision, modelAssetBuffer] = await Promise.all([visionFileset(), visionModel('face_landmarker.task')]);
  let landmarker;
  try {
    landmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetBuffer, delegate: 'GPU' },
      outputFaceBlendshapes: true,
      runningMode: 'VIDEO',
      numFaces: 1
    });
  } catch {
    landmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetBuffer, delegate: 'CPU' },
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
