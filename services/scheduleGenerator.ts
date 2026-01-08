
import { TherapySettings, DaySchedule, Dose, DosageStage } from '../types';

export function calculateTotalDaysFromPills(pillsCount: number, stages: DosageStage[]): number {
  let pillsUsed = 0;
  let days = 0;
  while (pillsUsed < pillsCount && days < 1000) { // Safety break
    days++;
    const stage = findStageForDay(days, stages);
    pillsUsed += stage.maxDoses;
  }
  return days;
}

function findStageForDay(day: number, stages: DosageStage[]): DosageStage {
  for (const stage of stages) {
    const [start, end] = stage.period.split('-').map(Number);
    if (day >= start && day <= end) return stage;
  }
  return stages[stages.length - 1];
}

export function generateSchedule(settings: TherapySettings): DaySchedule[] {
  const { startDate, totalDays, wakeTime, sleepTime, dosageStages } = settings;
  const start = new Date(startDate);
  
  const [wakeH, wakeM] = wakeTime.split(':').map(Number);
  const [sleepH, sleepM] = sleepTime.split(':').map(Number);
  
  const wakeTotalMin = wakeH * 60 + wakeM;
  let sleepTotalMin = sleepH * 60 + sleepM;
  
  // Handle cross-midnight sleep time
  if (sleepTotalMin <= wakeTotalMin) {
    sleepTotalMin += 24 * 60; 
  }
  
  const days: DaySchedule[] = [];

  for (let d = 1; d <= totalDays; d++) {
    const currentDate = new Date(start);
    currentDate.setDate(start.getDate() + d - 1);
    
    const stage = findStageForDay(d, dosageStages);
    const doses: Dose[] = [];
    
    const intervalMin = Math.round(stage.interval * 60);
    
    // Improved logic: Start at wake time and add strictly by interval
    // but stop if we hit maxDoses or sleepTime.
    // This is more clinically accurate than "spreading" doses to fit the wake window.
    for (let i = 0; i < stage.maxDoses; i++) {
      const currentDoseMin = wakeTotalMin + (i * intervalMin);
      
      // If the dose time exceeds sleep time, we stop adding doses for this day
      // (Except for the very first dose which must happen at wake time)
      if (i > 0 && currentDoseMin > sleepTotalMin) {
        break;
      }
      
      const normalizedMin = currentDoseMin % (24 * 60);
      const h = Math.floor(normalizedMin / 60);
      const m = Math.floor(normalizedMin % 60);
      const timeStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
      
      doses.push(createDose(timeStr, normalizedMin));
    }

    days.push({
      day: d,
      date: currentDate.toISOString(),
      doses,
      stage
    });
  }

  return days;
}

function createDose(time: string, timeMinutes: number): Dose {
  return {
    id: Math.random().toString(36).substr(2, 9),
    time,
    timeMinutes
  };
}
