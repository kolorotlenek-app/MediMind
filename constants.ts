
import { DosageStage } from './types';

export const DEFAULT_DOSAGE_STAGES: DosageStage[] = [
  { period: '1-3', interval: 2, maxDoses: 6 },
  { period: '4-12', interval: 2.5, maxDoses: 5 },
  { period: '13-16', interval: 3, maxDoses: 4 },
  { period: '17-20', interval: 5, maxDoses: 3 },
  { period: '21-25', interval: 12, maxDoses: 2 }
];

export const APP_STORAGE_KEY = 'medication_therapy_schedule';
