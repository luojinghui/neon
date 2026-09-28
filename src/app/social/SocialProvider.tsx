'use client';

import { useEffect } from 'react';
import { connectSocial } from './client';

export function SocialProvider() {
  useEffect(() => connectSocial(), []);
  return null;
}
