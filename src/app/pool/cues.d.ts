export interface CueStyle {
  id: string;
  name: string;
  shaft: string;
  tip: string;
  butt: string;
}

export const CUE_STYLES: CueStyle[];
export function cueStyle(id: string): CueStyle;
