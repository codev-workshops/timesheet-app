import { useContext } from 'react';
import { ColorModeContext, type ColorModeContextType } from '../contexts/ColorModeContextValue';

export const useColorMode = (): ColorModeContextType => {
  const context = useContext(ColorModeContext);
  if (context === undefined) {
    throw new Error('useColorMode must be used within a ColorModeProvider');
  }
  return context;
};
