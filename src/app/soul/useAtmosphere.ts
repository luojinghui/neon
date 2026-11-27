'use client';

import { useEffect, useState } from 'react';
import { getAtmosphere, type Atmosphere } from '@/lib/atmosphere';

export function useAtmosphere(name = ''): Atmosphere {
  const [atmosphere, setAtmosphere] = useState<Atmosphere>(() => getAtmosphere(new Date().getHours(), name));

  useEffect(() => {
    const update = () => setAtmosphere(getAtmosphere(new Date().getHours(), name));
    update();
    const timer = window.setInterval(update, 60_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') update();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [name]);

  return atmosphere;
}
