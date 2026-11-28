import type { Ball, Shot, Simulation } from './physics';

export type BallGroup = 'solid' | 'stripe' | null;
export type Placement = 'kitchen' | 'table' | null;

export interface GameState {
  balls: Ball[];
  phase: 'aim' | 'choice' | 'over';
  current: number;
  breaker: number;
  open: boolean;
  groups: [BallGroup, BallGroup];
  ballInHand: Placement;
  isBreak: boolean;
  breakWarning: boolean;
  message: string;
  winner: number | null;
  choice: { kind: 'break' | 'break-eight' } | null;
}

export const HEAD_SPOT: number;
export const KITCHEN_LINE: number;
export const NAMES: string[];

export function playerName(index: number): string;
export function createGame(): GameState;
export function canPlace(state: GameState, x: number, z: number): boolean;
export function placeCue(state: GameState, x: number, z: number): GameState;
export function resolveShot(state: GameState, outcome: Partial<Simulation> & { balls?: Ball[] }): GameState;
export function choose(state: GameState, option: string): GameState;
export function playShot(state: GameState, shot: Shot): { state: GameState; simulation: Simulation | null };
