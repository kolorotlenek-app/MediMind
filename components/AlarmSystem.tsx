
import React, { useEffect, useRef, useState } from 'react';
import { TherapySchedule } from '../types';

interface AlarmSystemProps {
  schedules: TherapySchedule[];
}

const AlarmSystem: React.FC<AlarmSystemProps> = ({ schedules }) => {
  const [isNotificationsEnabled, setIsNotificationsEnabled] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const lastCheckedMinute = useRef<number>(-1);

  useEffect(() => {
    if (Notification.permission === 'granted') {
      setIsNotificationsEnabled(true);
    }
  }, []);

  const requestPermission = async () => {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      setIsNotificationsEnabled(true);
      new Notification("System aktywny", { body: "Będziesz otrzymywać przypomnienia o lekach dla wszystkich aktywnych planów." });
    }
    // Initialize audio context on user gesture
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
  };

  const playBeep = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    const ctx = audioContextRef.current;
    if (ctx.state === 'suspended') ctx.resume();

    const playTone = (time: number, freq: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, time);
      gain.gain.setValueAtTime(0.1, time);
      gain.gain.exponentialRampToValueAtTime(0.01, time + 0.1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(time);
      osc.stop(time + 0.1);
    };

    // Digital beep-beep-beep pattern
    const now = ctx.currentTime;
    playTone(now, 1000);
    playTone(now + 0.2, 1000);
    playTone(now + 0.4, 1000);
  };

  useEffect(() => {
    const interval = setInterval(() => {
      const activeSchedules = schedules.filter(s => s.isActive);
      if (activeSchedules.length === 0) return;

      const now = new Date();
      const currentMinute = now.getHours() * 60 + now.getMinutes();

      if (currentMinute !== lastCheckedMinute.current) {
        lastCheckedMinute.current = currentMinute;
        checkDoses(now, currentMinute, activeSchedules);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [schedules]);

  const checkDoses = (now: Date, currentTotalMinutes: number, activeSchedules: TherapySchedule[]) => {
    const todayStr = now.toISOString().split('T')[0];
    
    activeSchedules.forEach(schedule => {
      const todaySchedule = schedule.days.find(d => d.date.startsWith(todayStr));
      if (todaySchedule) {
        const activeDose = todaySchedule.doses.find(dose => dose.timeMinutes === currentTotalMinutes);
        if (activeDose) {
          triggerAlarm(activeDose.time, schedule.settings.medicationName);
        }
      }
    });
  };

  const triggerAlarm = (time: string, medName: string) => {
    playBeep();
    const title = `💊 Czas na lek: ${medName || 'Bez nazwy'}`;
    const body = `Godzina: ${time}. Proszę przyjąć wyznaczoną dawkę.`;

    if (isNotificationsEnabled) {
      new Notification(title, { body, icon: 'https://cdn-icons-png.flaticon.com/512/3028/3028551.png' });
    }
    // Simple alert as fallback and to ensure user interaction
    alert(`${title}\n${body}`);
  };

  return (
    <div className="bg-white border-t border-slate-200 p-4 sticky bottom-0 z-50 flex items-center justify-between shadow-2xl">
      <div className="flex items-center gap-3">
        <div className={`w-3 h-3 rounded-full ${isNotificationsEnabled ? 'bg-green-500 animate-pulse' : 'bg-red-400'}`}></div>
        <div className="flex flex-col">
          <span className="text-sm font-bold text-slate-700">
            {isNotificationsEnabled ? 'System Alarmowy Aktywny' : 'Powiadomienia Wyłączone'}
          </span>
          <span className="text-[10px] text-slate-500 uppercase tracking-tight font-semibold">
            Monitorowanie {schedules.filter(s => s.isActive).length} aktywnych planów
          </span>
        </div>
      </div>
      <div className="flex gap-2">
        {!isNotificationsEnabled && (
          <button
            onClick={requestPermission}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-xs font-bold transition-all shadow-md active:scale-95"
          >
            WŁĄCZ ALARMY
          </button>
        )}
        <button
          onClick={playBeep}
          className="text-indigo-600 hover:bg-indigo-50 px-3 py-2 rounded-lg text-xs font-bold transition-colors border border-indigo-100"
        >
          TEST SYGNAŁU
        </button>
      </div>
    </div>
  );
};

export default AlarmSystem;
