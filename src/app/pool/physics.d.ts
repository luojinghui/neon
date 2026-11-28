export interface Ball {
  id: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
  wx: number;
  wy: number;
  wz: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
  pocketed: boolean;
  offTable?: boolean;
}

export interface Shot {
  angle: number;
  speed: number;
  offsetX?: number;
  offsetY?: number;
  elevation?: number;
}

export interface BallSample {
  id: number;
  x: number;
  z: number;
  pocketed: boolean;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
}

export interface ShotSample {
  t: number;
  balls: BallSample[];
}

export interface Simulation {
  balls: Ball[];
  samples: ShotSample[];
  pocketed: number[];
  cushions: number[];
  offTable: number[];
  firstContact: number | null;
  contact: { x: number; z: number } | null;
  cutAngle: number | null;
  separation: number | null;
  frozen: boolean;
}

export const BALL_RADIUS: number;
export const BALL_DIAMETER: number;
export const BALL_MASS: number;
export const TABLE_LENGTH: number;
export const TABLE_WIDTH: number;
export const HALF_LENGTH: number;
export const HALF_WIDTH: number;

export function createBall(id: number, x: number, z: number): Ball;
export function cloneBall(ball: Ball): Ball;
export function strike(ball: Ball, shot: Shot): void;
export function powerToSpeed(power: number): number;
export function resolveBallCollision(a: Ball, b: Ball, params?: { restitution?: number; friction?: number }): boolean;
export function simulateShot(balls: Ball[], options?: {
  shot?: Shot;
  dt?: number;
  maxTime?: number;
  sampleDt?: number;
}): Simulation;
