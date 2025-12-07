'use client';

import { useTheme } from '@/store/ThemeContext';
import { useEffect, useState } from 'react';

interface ColorOption {
  name: string;
  value: string;
  bgClass: string;
}

export const ThemeSwitcher = () => {
  const { themeColor, themeMode, setThemeColor, setThemeMode } = useTheme();
  const [isOpen, setIsOpen] = useState(false);

  const colorOptions: ColorOption[] = [
    { name: '蓝色', value: 'blue', bgClass: 'bg-blue-500' },
    { name: '绿色', value: 'green', bgClass: 'bg-green-500' },
    { name: '紫色', value: 'purple', bgClass: 'bg-purple-500' },
    { name: '红色', value: 'red', bgClass: 'bg-red-500' },
    { name: '琥珀', value: 'amber', bgClass: 'bg-amber-500' },
    { name: '耀黑', value: 'black', bgClass: 'bg-gray-900' }
  ];

  // Close the dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.theme-switcher')) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="theme-switcher fixed top-4 right-4 z-50">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center justify-center w-10 h-10 rounded-full shadow-md ${colorOptions.find((c) => c.value === themeColor)?.bgClass} text-white`}
        title="主题设置"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
          <path d="M12 2.25a.75.75 0 01.75.75v2.25a.75.75 0 01-1.5 0V3a.75.75 0 01.75-.75zM7.5 12a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM18.894 6.166a.75.75 0 00-1.06-1.06l-1.591 1.59a.75.75 0 101.06 1.061l1.591-1.59zM21.75 12a.75.75 0 01-.75.75h-2.25a.75.75 0 010-1.5H21a.75.75 0 01.75.75zM17.834 18.894a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 10-1.061 1.06l1.59 1.591zM12 18a.75.75 0 01.75.75V21a.75.75 0 01-1.5 0v-2.25A.75.75 0 0112 18zM7.758 17.303a.75.75 0 00-1.061-1.06l-1.591 1.59a.75.75 0 001.06 1.061l1.591-1.59zM6 12a.75.75 0 01-.75.75H3a.75.75 0 010-1.5h2.25A.75.75 0 016 12zM6.697 7.757a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 00-1.061 1.06l1.59 1.591z" />
        </svg>
      </button>

      {isOpen && (
        <div
          className={`absolute right-0 mt-2 p-4 rounded-lg shadow-lg ${
            themeMode === 'dark' ? 'bg-gray-800 text-white' : 'bg-white text-gray-800'
          } border border-gray-200 dark:border-gray-700`}
        >
          <div className="mb-4">
            <p className="text-sm font-medium mb-2">主题颜色</p>
            <div className="flex space-x-2">
              {colorOptions.map((color) => (
                <button
                  key={color.value}
                  className={`w-6 h-6 rounded-full ${color.bgClass} ${themeColor === color.value ? 'ring-2 ring-offset-2 ring-gray-400' : ''}`}
                  onClick={() => setThemeColor(color.value as any)}
                  title={color.name}
                />
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm font-medium mb-2">主题模式</p>
            <div className="flex">
              <button
                className={`px-3 py-1 rounded-l-lg ${
                  themeMode === 'light' ? 'bg-primary text-white dark:bg-primary dark:text-white' : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                }`}
                onClick={() => setThemeMode('light')}
              >
                浅色
              </button>
              <button
                className={`px-3 py-1 rounded-r-lg ${
                  themeMode === 'dark' ? 'bg-primary text-white dark:bg-primary dark:text-white' : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                }`}
                onClick={() => setThemeMode('dark')}
              >
                深色
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
