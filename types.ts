
export interface DosageStage {
  period: string; // e.g., "1-3"
  interval: number; // in hours
  maxDoses: number;
}

export interface Dose {
  time: string; // HH:mm
  timeMinutes: number;
  id: string;
}

export interface DaySchedule {
  day: number;
  date: string; // ISO format
  doses: Dose[];
  stage: DosageStage;
}

export interface TherapySettings {
  startDate: string;
  medicationName: string;
  totalDays: number;
  pillsInPackage?: number;
  wakeTime: string;
  sleepTime: string;
  dosageStages: DosageStage[];
}

export interface TherapySchedule {
  id: string;
  user_id?: string;
  isActive: boolean;
  settings: TherapySettings;
  days: DaySchedule[];
}
