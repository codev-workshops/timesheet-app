import { createContext } from 'react';
import { type PaletteMode } from '@mui/material';

export const COLOR_MODE_STORAGE_KEY = 'colorMode';

export interface ColorModeContextType {
  mode: PaletteMode;
  toggleColorMode: () => void;
  setMode: (mode: PaletteMode) => void;
}

export const ColorModeContext = createContext<ColorModeContextType | undefined>(undefined);
