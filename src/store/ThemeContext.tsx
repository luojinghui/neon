'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

type ThemeColor = 'blue' | 'green' | 'purple' | 'red' | 'amber';
type ThemeMode = 'light' | 'dark';

interface ThemeContextType {
  themeColor: ThemeColor;
  themeMode: ThemeMode;
  setThemeColor: (color: ThemeColor) => void;
  setThemeMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeColor, setThemeColor] = useState<ThemeColor>('blue');
  const [themeMode, setThemeMode] = useState<ThemeMode>('light');

  useEffect(() => {
    // Load theme settings from localStorage
    const savedColor = localStorage.getItem('themeColor') as ThemeColor;
    const savedMode = localStorage.getItem('themeMode') as ThemeMode;

    if (savedColor) {
      setThemeColor(savedColor);
      document.documentElement.setAttribute('data-theme', savedColor);
    }

    if (savedMode) {
      setThemeMode(savedMode);
      if (savedMode === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setThemeMode('dark');
      document.documentElement.classList.add('dark');
    }
  }, []);

  useEffect(() => {
    // Save theme settings to localStorage
    localStorage.setItem('themeColor', themeColor);
    localStorage.setItem('themeMode', themeMode);

    // Apply data-theme attribute to html
    document.documentElement.setAttribute('data-theme', themeColor);

    // Apply dark mode class to html
    if (themeMode === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [themeColor, themeMode]);

  return <ThemeContext.Provider value={{ themeColor, themeMode, setThemeColor, setThemeMode }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
