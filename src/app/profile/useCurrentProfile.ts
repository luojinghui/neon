'use client';

import { useEffect, useState } from 'react';
import { ensureCurrentProfile, PROFILE_CHANGED_EVENT } from './client';
import type { PublicProfile } from './types';

export function useCurrentProfile() {
  const [profile, setProfile] = useState<PublicProfile | null>(null);

  useEffect(() => {
    let active = true;
    let profileChanged = false;

    const handleProfileChanged = (event: Event) => {
      const changed = (event as CustomEvent<PublicProfile>).detail;
      if (changed) {
        profileChanged = true;
        setProfile(changed);
      }
    };

    window.addEventListener(PROFILE_CHANGED_EVENT, handleProfileChanged);
    void ensureCurrentProfile()
      .then((current) => {
        if (active && !profileChanged) setProfile(current);
      })
      .catch(() => undefined);

    return () => {
      active = false;
      window.removeEventListener(PROFILE_CHANGED_EVENT, handleProfileChanged);
    };
  }, []);

  return profile;
}
