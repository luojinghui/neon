import { visionFileset, visionModel } from '../visionRuntime';
import { PortraitRenderer } from './renderer';

export type PortraitAnalysis = { renderer: PortraitRenderer | null; faceCount: number; segmented: boolean; message: string };

export async function analyzePortrait(source: HTMLCanvasElement): Promise<PortraitAnalysis> {
  let renderer: PortraitRenderer;
  try { renderer = new PortraitRenderer(source); } catch { return { renderer: null, faceCount: 0, segmented: false, message: '此设备暂不支持人像特效，可继续设计和保存卡片' }; }
  const failures: string[] = [];
  try { await renderer.prepareStickers(); } catch { failures.push('贴纸暂时无法加载'); }
  try {
    const { FaceLandmarker, ImageSegmenter } = await import('@mediapipe/tasks-vision');
    const vision = await visionFileset();
    try {
      const modelAssetBuffer = await visionModel('face_landmarker.task');
      const options = { baseOptions: { modelAssetBuffer, delegate: 'GPU' as const }, runningMode: 'IMAGE' as const, numFaces: 3 };
      const landmarker = await FaceLandmarker.createFromOptions(vision, options).catch(() => FaceLandmarker.createFromOptions(vision, { ...options, baseOptions: { modelAssetBuffer, delegate: 'CPU' } }));
      try { renderer.faces = landmarker.detect(source).faceLandmarks; } finally { landmarker.close(); }
    } catch { failures.push('人脸定位暂不可用'); }
    try {
      const modelAssetBuffer = await visionModel('selfie_multiclass.tflite');
      const segmenter = await ImageSegmenter.createFromOptions(vision, { canvas: renderer.canvas, baseOptions: { modelAssetBuffer, delegate: 'GPU' }, runningMode: 'IMAGE', outputConfidenceMasks: true, outputCategoryMask: false });
      try { segmenter.segment(source, result => renderer.captureMask(result)); } finally { segmenter.close(); }
    } catch { failures.push('肤色与轮廓检测暂不可用'); }
  } catch { failures.push('人像资源暂时无法加载'); }
  return { renderer, faceCount: renderer.faces.length, segmented: renderer.segmented, message: failures.length ? `${failures.join('，')}，其他卡片功能仍可使用` : renderer.faces.length ? `已找到 ${renderer.faces.length} 张脸，开始你的角色搭配` : '没有找到正脸，换张自拍即可添加卡通贴纸' };
}
