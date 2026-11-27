export type AtmospherePeriod = 'dawn' | 'noon' | 'afternoon' | 'dusk' | 'night';

export interface Atmosphere {
  period: AtmospherePeriod;
  periodLabel: string;
  isNight: boolean;
  headline: string;
  placeholder: string;
}

export function getAtmosphere(hour: number, name?: string): Atmosphere;
