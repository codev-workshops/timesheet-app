import { createContext } from 'react';
import { type FeatureFlags } from '../types/api';

export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  darkMode: false,
  csvExport: false,
  pdfReports: false,
};

export interface FeatureFlagsContextType {
  features: FeatureFlags;
  isLoading: boolean;
}

export const FeatureFlagsContext = createContext<FeatureFlagsContextType | undefined>(undefined);
