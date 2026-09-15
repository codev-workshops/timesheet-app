import { useContext } from 'react';
import { FeatureFlagsContext, type FeatureFlagsContextType } from '../contexts/FeatureFlagsContextValue';

export const useFeatureFlags = (): FeatureFlagsContextType => {
  const context = useContext(FeatureFlagsContext);
  if (context === undefined) {
    throw new Error('useFeatureFlags must be used within a FeatureFlagsProvider');
  }
  return context;
};
