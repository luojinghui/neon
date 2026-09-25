import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import { cross, normalize } from './meshes';

type V3 = [number, number, number];
export function faceTriangles(edges: readonly { start: number; end: number }[]) {
  const triangles: number[][] = [];
  for (let i = 0; i + 2 < edges.length; i += 3) {
    const [a, b, c] = edges.slice(i, i + 3);
    if (a.end === b.start && b.end === c.start && c.end === a.start) triangles.push([a.start, b.start, c.start]);
  }
  return triangles;
}

/** Actual face vertices, smooth normals and a face-local UV space shared by every character. */
export function buildFaceMesh(face: NormalizedLandmark[], triangles: number[][], aspect: number) {
  const point = (i: number): V3 => [face[i].x * 2 - 1, 1 - face[i].y * 2, -face[i].z * 2];
  const origin = point(1), right = normalize([face[263].x - face[33].x, -(face[263].y - face[33].y) / aspect, -(face[263].z - face[33].z)]);
  const up = normalize([face[10].x - face[152].x, -(face[10].y - face[152].y) / aspect, -(face[10].z - face[152].z)]);
  const width = Math.max(.001, Math.hypot(face[454].x - face[234].x, (face[454].y - face[234].y) / aspect) * 2);
  const local = (p: V3) => {
    const delta = [p[0] - origin[0], (p[1] - origin[1]) / aspect, p[2] - origin[2]];
    return [delta.reduce((sum, n, i) => sum + n * right[i], 0) / width, delta.reduce((sum, n, i) => sum + n * up[i], 0) / width];
  };
  const features = new Float32Array([[33,133,159,145], [362,263,386,374], [61,291,0,17]].flatMap(ids => {
    const points = ids.map(i => local(point(i)));
    const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
    return [(Math.min(...xs)+Math.max(...xs))/2, (Math.min(...ys)+Math.max(...ys))/2, Math.max(.02,(Math.max(...xs)-Math.min(...xs))*.58), Math.max(.025,(Math.max(...ys)-Math.min(...ys))*.65)];
  }));
  const normals: V3[] = face.map(() => [0,0,0]);
  for (const ids of triangles) {
    const [a,b,c] = ids.map(point);
    const normal = cross([b[0]-a[0],(b[1]-a[1])/aspect,b[2]-a[2]], [c[0]-a[0],(c[1]-a[1])/aspect,c[2]-a[2]]);
    for (const id of ids) for (let axis = 0; axis < 3; axis++) normals[id][axis] += normal[axis];
  }
  const vertices: number[] = [];
  for (const ids of triangles) for (const id of ids) {
    const p = point(id);
    vertices.push(...p, ...normalize(normals[id]), ...local(p));
  }
  return { vertices: new Float32Array(vertices), features };
}
