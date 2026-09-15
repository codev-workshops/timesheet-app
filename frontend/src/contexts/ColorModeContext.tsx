import React, { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { type PaletteMode } from '@mui/material';
import {
  COLOR_MODE_STORAGE_KEY,
  ColorModeContext,
  type ColorModeContextType,
} from './ColorModeContextValue';

interface ColorModeProviderProps {
  children: ReactNode;
}

function readStoredMode(): PaletteMode {
  const stored = localStorage.getItem(COLOR_MODE_STORAGE_KEY);
  return stored === 'dark' ? 'dark' : 'light';
}

export const ColorModeProvider: React.FC<ColorModeProviderProps> = ({ children }) => {
  const [mode, setMode] = useState<PaletteMode>(readStoredMode);

  useEffect(() => {
    localStorage.setItem(COLOR_MODE_STORAGE_KEY, mode);
  }, [mode]);

  const toggleColorMode = useCallback(() => {
    setMode((prev) => (prev === 'light' ? 'dark' : 'light'));
  }, []);

  const value = useMemo<ColorModeContextType>(
    () => ({ mode, toggleColorMode, setMode }),
    [mode, toggleColorMode]
  );

  return <ColorModeContext.Provider value={value}>{children}</ColorModeContext.Provider>;
};
