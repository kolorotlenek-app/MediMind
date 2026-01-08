
import React, { useState, useEffect, useCallback } from 'react';
import { 
  TherapySettings, 
  TherapySchedule, 
  DosageStage,
  Dose
} from './types';
import { 
  DEFAULT_DOSAGE_STAGES, 
  APP_STORAGE_KEY 
} from './constants';
import { 
  generateSchedule, 
  calculateTotalDaysFromPills 
} from './services/scheduleGenerator';
import AlarmSystem from './components/AlarmSystem';
import { supabase } from './utils/supabase';
import { User } from '@supabase/supabase-js';
import { 
  Calendar, 
  Settings2, 
  Download, 
  Pill, 
  Clock,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Plus,
  Trash2,
  List,
  Save,
  Power,
  CheckCircle2,
  LayoutGrid,
  Minimize2,
  Maximize2,
  LogIn,
  LogOut,
  User as UserIcon,
  Cloud,
  CloudOff,
  Activity,
  ShieldCheck,
  Zap,
  Fingerprint,
  Cross,
  Lock,
  Smartphone,
  Info,
  Dna,
  Stethoscope
} from 'lucide-react';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [settings, setSettings] = useState<TherapySettings>({
    startDate: new Date().toISOString().split('T')[0],
    medicationName: '',
    totalDays: 25,
    wakeTime: '08:00',
    sleepTime: '22:00',
    dosageStages: [...DEFAULT_DOSAGE_STAGES]
  });

  const [schedules, setSchedules] = useState<TherapySchedule[]>([]);
  const [currentGeneration, setCurrentGeneration] = useState<TherapySchedule | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [pendingTimes, setPendingTimes] = useState<Record<number, string>>({});
  const [collapsedDays, setCollapsedDays] = useState<Record<number, boolean>>({});

  // 1. Authentication Lifecycle
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) setShowAuthModal(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // 2. Data Synchronization Logic
  const fetchCloudSchedules = useCallback(async (userId: string) => {
    setSyncing(true);
    try {
      const { data, error } = await supabase
        .from('schedules')
        .select('*')
        .eq('user_id', userId);
      
      if (error) throw error;
      if (data) {
        setSchedules(data.map(item => ({
          ...item.content,
          id: item.id,
          isActive: item.is_active,
          user_id: item.user_id
        })));
      }
    } catch (e) {
      console.error("Cloud fetch failed:", e);
    } finally {
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      fetchCloudSchedules(user.id);
    } else {
      const saved = localStorage.getItem(APP_STORAGE_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setSchedules(Array.isArray(parsed) ? parsed : []);
        } catch (e) { console.error(e); }
      }
    }
  }, [user, fetchCloudSchedules]);

  const saveToStorageAndCloud = async (newList: TherapySchedule[]) => {
    setSchedules(newList);
    localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(newList));

    if (user) {
      setSyncing(true);
      try {
        for (const schedule of newList) {
          await supabase.from('schedules').upsert({
            id: schedule.id.includes('preview') ? undefined : schedule.id,
            user_id: user.id,
            is_active: schedule.isActive,
            content: schedule,
            medication_name: schedule.settings.medicationName
          });
        }
      } catch (e) {
        console.error("Sync failed:", e);
      } finally {
        setSyncing(false);
      }
    }
  };

  const handleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin
      }
    });
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSchedules([]);
    localStorage.removeItem(APP_STORAGE_KEY);
  };

  const getProgress = useCallback((s: TherapySchedule) => {
    if (!s.days || s.days.length === 0) return 0;
    const nowTimestamp = new Date().setHours(23, 59, 59, 999);
    const passed = s.days.filter(d => new Date(d.date).getTime() <= nowTimestamp).length;
    return Math.min(100, Math.round((passed / s.days.length) * 100));
  }, []);

  const handlePreview = (e: React.FormEvent) => {
    e.preventDefault();
    let finalTotalDays = settings.totalDays;
    if (settings.pillsInPackage && settings.pillsInPackage > 0) {
      finalTotalDays = calculateTotalDaysFromPills(settings.pillsInPackage, settings.dosageStages);
    }
    const newSchedule: TherapySchedule = {
      id: 'preview-' + Date.now(),
      isActive: true,
      settings: { ...settings, totalDays: finalTotalDays },
      days: generateSchedule({ ...settings, totalDays: finalTotalDays })
    };
    setCurrentGeneration(newSchedule);
    setCollapsedDays({});
    setTimeout(() => {
      document.getElementById('preview-section')?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const handleSaveToMyPlans = () => {
    if (!user) {
      setShowAuthModal(true);
      return;
    }
    if (!currentGeneration) return;
    const finalSchedule = { ...currentGeneration, id: Date.now().toString(), user_id: user?.id };
    const newList = [finalSchedule, ...schedules];
    saveToStorageAndCloud(newList);
    setCurrentGeneration(null);
  };

  const handleDeleteSchedule = (id: string) => {
    const newList = schedules.filter(s => s.id !== id);
    saveToStorageAndCloud(newList);
    if (user) {
      supabase.from('schedules').delete().eq('id', id).then();
    }
  };

  const handleToggleActive = (id: string) => {
    const newList = schedules.map(s => s.id === id ? { ...s, isActive: !s.isActive } : s);
    saveToStorageAndCloud(newList);
  };

  const toggleDayCollapse = (dayIdx: number) => {
    setCollapsedDays(prev => ({ ...prev, [dayIdx]: !prev[dayIdx] }));
  };

  const toggleAllDays = (collapse: boolean) => {
    if (!currentGeneration) return;
    const newState: Record<number, boolean> = {};
    currentGeneration.days.forEach((_, idx) => { newState[idx] = collapse; });
    setCollapsedDays(newState);
  };

  const inputClasses = "w-full bg-slate-50 text-slate-900 border border-slate-200 rounded-lg p-3 focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none transition-all font-medium mono text-sm";

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 selection:bg-indigo-100">
      {/* Auth Terminal Modal */}
      {showAuthModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-xl animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] overflow-hidden shadow-2xl border-4 border-slate-800 relative">
            <div className="absolute top-0 right-0 p-4">
              <button onClick={() => setShowAuthModal(false)} className="text-slate-400 hover:text-slate-900 transition-colors">
                <Minimize2 className="w-6 h-6" />
              </button>
            </div>
            <div className="p-10 text-center">
              <div className="inline-flex p-5 bg-indigo-600 rounded-[2rem] shadow-xl shadow-indigo-200 mb-8 border border-indigo-400/30">
                <ShieldCheck className="w-12 h-12 text-white" />
              </div>
              <h3 className="text-3xl font-black text-slate-900 tracking-tighter uppercase mb-2">Terminal Dostępu</h3>
              <p className="text-slate-500 font-medium mb-10 text-sm leading-relaxed px-4">
                Wymagana autoryzacja do zapisu harmonogramów w chmurze [CLOUD_SYNC]. Wybierz metodę weryfikacji tożsamości.
              </p>
              
              <button 
                onClick={handleLogin}
                className="w-full flex items-center justify-center gap-4 bg-white border-2 border-slate-200 py-4 px-8 rounded-2xl font-black hover:bg-slate-50 hover:border-slate-300 transition-all shadow-lg active:scale-95 group"
              >
                <img src="https://www.gstatic.com/images/branding/product/1x/gsa_512dp.png" className="w-6 h-6 group-hover:scale-110 transition-transform" alt="Google" />
                <span className="text-slate-800 uppercase tracking-widest text-sm">Zaloguj przez Google</span>
              </button>
              
              <div className="mt-10 pt-8 border-t border-slate-100 flex flex-col items-center gap-4">
                <div className="flex gap-4 opacity-30 grayscale">
                  <Fingerprint className="w-5 h-5" />
                  <Lock className="w-5 h-5" />
                  <Smartphone className="w-5 h-5" />
                </div>
                <p className="text-[10px] mono text-slate-400 uppercase tracking-[0.2em]">Data Protection Standard AES-256</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Laboratory Header */}
      <header className="bg-slate-900 text-white py-6 px-6 shadow-2xl relative overflow-hidden border-b-2 border-indigo-500">
        <div className="absolute inset-0 opacity-20 pointer-events-none">
          <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500 rounded-full blur-[100px] -mr-40 -mt-40"></div>
          <div className="absolute top-0 left-0 w-full h-full" style={{ backgroundImage: 'radial-gradient(circle, #4f46e5 1px, transparent 1px)', backgroundSize: '40px 40px', opacity: 0.1 }}></div>
        </div>
        
        <div className="container mx-auto flex flex-col md:flex-row items-center justify-between gap-6 relative z-10">
          <div className="flex items-center gap-4">
            <div className="p-4 bg-indigo-600 rounded-3xl shadow-lg shadow-indigo-500/30 border border-indigo-400/30 group cursor-pointer hover:rotate-6 transition-transform">
              <Dna className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-tighter flex items-center gap-2">
                LAB-TERMINAL <span className="text-indigo-400 font-light px-2 py-0.5 bg-indigo-950 rounded text-xs border border-indigo-800 mono tracking-normal">MED_PROTO_3.5</span>
              </h1>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-[10px] mono text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                  <Activity className="w-3 h-3 text-emerald-400" /> STATUS: OPERATIONAL
                </span>
                <span className="text-[10px] mono text-slate-400 uppercase tracking-widest flex items-center gap-1.5 border-l border-slate-700 pl-3">
                  {user ? (
                    <Cloud className={`w-3 h-3 ${syncing ? 'animate-pulse text-indigo-400' : 'text-emerald-400'}`} />
                  ) : (
                    <CloudOff className="w-3 h-3 text-amber-400" />
                  )}
                  {user ? 'SYNCHRONIZED' : 'LOCAL_ONLY'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {user ? (
              <div className="flex items-center gap-4 bg-slate-800/60 p-2 pr-5 rounded-2xl border border-slate-700 backdrop-blur-md">
                <div className="w-11 h-11 rounded-xl bg-indigo-500 flex items-center justify-center overflow-hidden border-2 border-slate-700 shadow-inner">
                  {user.user_metadata.avatar_url ? (
                    <img src={user.user_metadata.avatar_url} alt="User" />
                  ) : (
                    <UserIcon className="w-6 h-6 text-white" />
                  )}
                </div>
                <div className="hidden sm:block">
                  <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-0.5">Authorized User</p>
                  <p className="text-xs font-bold text-white truncate max-w-[140px] mono">{user.email}</p>
                </div>
                <button onClick={handleLogout} className="ml-2 p-2 hover:bg-red-500/20 rounded-lg transition-colors group">
                  <LogOut className="w-5 h-5 text-slate-400 group-hover:text-red-400" />
                </button>
              </div>
            ) : (
              <button 
                onClick={() => setShowAuthModal(true)}
                className="flex items-center gap-3 bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3.5 rounded-2xl font-black transition-all shadow-lg active:scale-95 text-sm border-b-4 border-indigo-800 uppercase tracking-tighter"
              >
                <LogIn className="w-5 h-5" />
                System Login
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-grow container mx-auto px-4 py-12 space-y-16 max-w-6xl relative">
        {/* Geometric decoration */}
        <div className="absolute top-40 left-0 w-full pointer-events-none opacity-[0.03]">
          <div className="grid grid-cols-6 gap-20">
            {Array.from({length: 12}).map((_, i) => (
              <div key={i} className="aspect-square border-4 border-slate-900 rounded-full flex items-center justify-center">
                <div className="w-1/2 h-1/2 border border-slate-900 rotate-45"></div>
              </div>
            ))}
          </div>
        </div>

        {/* Dashboard: Active Protocols */}
        {schedules.length > 0 && (
          <section className="space-y-8 relative z-10">
            <div className="flex items-center justify-between px-2">
              <h2 className="text-xs font-black text-slate-400 uppercase tracking-[0.4em] flex items-center gap-3">
                <div className="w-2 h-2 bg-indigo-500 rounded-full animate-ping"></div>
                Baza Aktywnych Protokołów [{schedules.length}]
              </h2>
              <div className="h-px bg-slate-200 flex-grow mx-6 opacity-30"></div>
              <div className="flex items-center gap-3 text-[10px] mono text-slate-300 font-bold uppercase">
                <ShieldCheck className="w-4 h-4 text-emerald-500" /> Secure_Storage_v3
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {schedules.map((s) => (
                <div key={s.id} className={`bg-white rounded-[2rem] p-8 border-2 transition-all shadow-sm flex flex-col relative overflow-hidden group hover:shadow-xl ${s.isActive ? 'border-indigo-100 ring-8 ring-indigo-50/30' : 'border-slate-100 grayscale-[0.5] opacity-80'}`}>
                  {/* Hexagon Pattern Overlay */}
                  <div className="absolute top-0 right-0 w-24 h-24 opacity-[0.02] pointer-events-none translate-x-12 -translate-y-12">
                    <LayoutGrid className="w-full h-full" />
                  </div>

                  <div className="flex justify-between items-start mb-6">
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] mono text-slate-400 mb-2 flex items-center gap-2">
                        <span className="w-2 h-2 bg-indigo-600 rotate-45"></span> UID_{s.id.slice(-6).toUpperCase()}
                      </div>
                      <h3 className="font-black text-slate-900 text-2xl truncate uppercase tracking-tighter leading-none">{s.settings.medicationName || 'PROTO_UNNAMED'}</h3>
                    </div>
                    <button 
                      onClick={() => handleToggleActive(s.id)}
                      className={`p-4 rounded-2xl transition-all border-2 ${s.isActive ? 'bg-indigo-600 border-indigo-500 text-white shadow-xl shadow-indigo-200' : 'bg-slate-100 border-slate-200 text-slate-400'}`}
                    >
                      <Power className="w-6 h-6" />
                    </button>
                  </div>
                  
                  <div className="mt-auto space-y-6">
                    <div className="bg-slate-50/80 rounded-2xl p-5 border border-slate-100 relative overflow-hidden">
                      <div className="flex justify-between text-[10px] font-black text-slate-500 uppercase mb-3 tracking-widest">
                        <span className="flex items-center gap-2"><Zap className="w-3 h-3 text-amber-500" /> Analiza Postępu</span>
                        <span>{getProgress(s)}%</span>
                      </div>
                      <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden shadow-inner">
                        <div className="h-full bg-indigo-500 transition-all duration-1000 ease-out relative" style={{ width: `${getProgress(s)}%` }}>
                          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-[shimmer_2s_infinite]"></div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3">
                      <button 
                        onClick={() => { setCurrentGeneration(s); setCollapsedDays({}); }}
                        className="flex-1 text-[11px] font-black py-4 bg-slate-900 text-white rounded-2xl hover:bg-slate-800 transition-all uppercase tracking-[0.2em] shadow-lg border-b-4 border-slate-700 active:border-b-0 active:translate-y-1"
                      >
                        Terminal Podglądu
                      </button>
                      <button 
                        onClick={() => handleDeleteSchedule(s.id)}
                        className="p-4 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-all border border-slate-100 hover:border-red-200 flex items-center justify-center"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Configuration Terminal */}
        <section className="bg-white rounded-[3rem] shadow-2xl border border-slate-200 overflow-hidden relative z-10">
          <div className="absolute top-0 right-0 p-12 opacity-[0.03] pointer-events-none rotate-12 scale-150">
            <Stethoscope className="w-64 h-64" />
          </div>
          <div className="absolute top-0 left-0 w-3 h-full bg-indigo-600"></div>
          
          <div className="p-12 md:p-16">
            <div className="mb-14 flex items-start justify-between">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                    <Cross className="w-4 h-4 text-indigo-600" />
                  </div>
                  <span className="text-xs font-black text-indigo-500 uppercase tracking-[0.3em] mono">Diagnostic_Unit_Alpha</span>
                </div>
                <h2 className="text-4xl font-black text-slate-900 tracking-tighter uppercase leading-none">
                  Parametryzacja Dawki
                </h2>
                <p className="text-slate-500 font-medium text-sm mt-3 flex items-center gap-2">
                  <Info className="w-4 h-4 text-slate-300" /> Wprowadź dane kliniczne dla algorytmu generującego.
                </p>
              </div>
              <div className="hidden lg:flex flex-col items-end text-[10px] mono text-slate-300 font-bold uppercase tracking-widest leading-loose text-right">
                <span>LAB_ID: L-992-SIG</span>
                <span>SYSTEM_V: 3.5.0-C</span>
                <span>ENCR: AES_GCM_256</span>
              </div>
            </div>
            
            <form onSubmit={handlePreview} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
              <div className="space-y-4">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 ml-1">
                  <Pill className="w-3.5 h-3.5" /> Nazwa Farmaceutyku
                </label>
                <div className="relative">
                  <input 
                    type="text" 
                    className={inputClasses}
                    placeholder="NP. CIPROFLOXACIN"
                    value={settings.medicationName}
                    onChange={e => setSettings({...settings, medicationName: e.target.value.toUpperCase()})}
                    required
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[8px] mono text-indigo-400 font-bold">DRUG_NAME</div>
                </div>
              </div>

              <div className="space-y-4">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 ml-1">
                  <Calendar className="w-3.5 h-3.5" /> Start_Timestamp
                </label>
                <input 
                  type="date" 
                  className={inputClasses}
                  value={settings.startDate}
                  onChange={e => setSettings({...settings, startDate: e.target.value})}
                  required
                />
              </div>

              <div className="space-y-4">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 ml-1">
                  <List className="w-3.5 h-3.5" /> Okres Terapii (Dni)
                </label>
                <div className="relative">
                  <input 
                    type="number" 
                    className={inputClasses}
                    value={settings.totalDays}
                    onChange={e => setSettings({...settings, totalDays: parseInt(e.target.value) || 0})}
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[8px] mono text-indigo-400 font-bold">DAY_COUNT</div>
                </div>
              </div>

              <div className="space-y-4">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 ml-1">
                  <LayoutGrid className="w-3.5 h-3.5" /> Jednostki Opakowania
                </label>
                <input 
                  type="number" 
                  className={inputClasses}
                  placeholder="TOTAL_UNITS"
                  value={settings.pillsInPackage || ''}
                  onChange={e => setSettings({...settings, pillsInPackage: parseInt(e.target.value) || undefined})}
                />
              </div>

              <div className="space-y-4">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 ml-1">
                  <Zap className="w-3.5 h-3.5 text-amber-500" /> Sensor: Pobudka
                </label>
                <input 
                  type="time" 
                  className={inputClasses}
                  value={settings.wakeTime}
                  onChange={e => setSettings({...settings, wakeTime: e.target.value})}
                />
              </div>

              <div className="space-y-4">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 ml-1">
                  <Clock className="w-3.5 h-3.5 text-indigo-500" /> Sensor: Spoczynek
                </label>
                <input 
                  type="time" 
                  className={inputClasses}
                  value={settings.sleepTime}
                  onChange={e => setSettings({...settings, sleepTime: e.target.value})}
                />
              </div>

              <div className="lg:col-span-3 pt-12 border-t border-slate-100 flex flex-col sm:flex-row gap-8">
                <button 
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="flex items-center justify-center gap-4 px-10 py-5 text-slate-600 bg-white font-black border-2 border-slate-200 rounded-3xl hover:bg-slate-50 transition-all shadow-md text-xs uppercase tracking-[0.2em] mono"
                >
                  <Settings2 className="w-4 h-4" />
                  Konfiguracja Etapów
                  {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                <button 
                  type="submit"
                  className="flex-1 bg-indigo-600 text-white font-black py-5 px-12 rounded-3xl shadow-2xl shadow-indigo-200 hover:bg-indigo-700 active:scale-[0.98] transition-all flex items-center justify-center gap-4 text-xl tracking-tighter uppercase border-b-6 border-indigo-800"
                >
                  <Activity className="w-7 h-7" />
                  Uruchom Proces Generacji
                </button>
              </div>
            </form>

            {showAdvanced && (
              <div className="mt-14 p-10 bg-slate-900 rounded-[2.5rem] border border-slate-800 space-y-8 animate-in slide-in-from-top-6 duration-700 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-48 h-48 opacity-10 pointer-events-none translate-x-12 -translate-y-12 bg-indigo-500 rotate-45 blur-3xl group-hover:opacity-20 transition-opacity"></div>
                <div className="flex justify-between items-center relative z-10">
                  <h3 className="font-black text-white text-xs uppercase tracking-[0.4em] flex items-center gap-3">
                    <Fingerprint className="w-5 h-5 text-indigo-400" /> Tablica Interwałów Klinicznych
                  </h3>
                  <button onClick={() => setSettings({...settings, dosageStages: [...DEFAULT_DOSAGE_STAGES]})} className="text-[10px] font-black flex items-center gap-2 text-indigo-400 hover:text-white transition-colors bg-white/5 px-6 py-3 rounded-full border border-white/10 uppercase tracking-widest">
                    <RotateCcw className="w-4 h-4" /> Resetuj Ustawienia
                  </button>
                </div>
                <div className="overflow-x-auto rounded-3xl border border-white/5 relative z-10 bg-black/20">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-white/5 text-slate-400 border-b border-white/10">
                      <tr>
                        <th className="py-5 px-8 font-black uppercase tracking-widest">Domena Dni</th>
                        <th className="py-5 px-8 font-black uppercase tracking-widest">Δ Interval (h)</th>
                        <th className="py-5 px-8 font-black uppercase tracking-widest">Max_Dawki/24h</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {settings.dosageStages.map((stage, idx) => (
                        <tr key={idx} className="hover:bg-white/5 transition-colors">
                          <td className="py-5 px-8">
                            <input type="text" className="w-28 p-2.5 bg-transparent border border-white/10 rounded-lg font-bold text-white mono focus:border-indigo-500 outline-none transition-all" value={stage.period} onChange={e => {
                               const ns = [...settings.dosageStages];
                               ns[idx] = {...ns[idx], period: e.target.value};
                               setSettings({...settings, dosageStages: ns});
                            }} />
                          </td>
                          <td className="py-5 px-8">
                            <input type="number" step="0.5" className="w-24 p-2.5 bg-transparent border border-white/10 rounded-lg font-bold text-white mono focus:border-indigo-500 outline-none transition-all" value={stage.interval} onChange={e => {
                               const ns = [...settings.dosageStages];
                               ns[idx] = {...ns[idx], interval: parseFloat(e.target.value)};
                               setSettings({...settings, dosageStages: ns});
                            }} />
                          </td>
                          <td className="py-5 px-8">
                            <input type="number" className="w-24 p-2.5 bg-transparent border border-white/10 rounded-lg font-bold text-white mono focus:border-indigo-500 outline-none transition-all" value={stage.maxDoses} onChange={e => {
                               const ns = [...settings.dosageStages];
                               ns[idx] = {...ns[idx], maxDoses: parseInt(e.target.value)};
                               setSettings({...settings, dosageStages: ns});
                            }} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Verification & Preview Section */}
        {currentGeneration && (
          <section id="preview-section" className="space-y-10 animate-in fade-in slide-in-from-bottom-10 duration-1000">
            <div className="bg-white rounded-[4rem] p-12 md:p-16 shadow-3xl border-4 border-indigo-50 relative overflow-hidden">
              <div className="absolute top-0 left-0 bg-emerald-500 text-white text-[10px] font-black px-10 py-3 rounded-br-3xl uppercase tracking-[0.3em] shadow-xl flex items-center gap-3 z-10">
                <CheckCircle2 className="w-4 h-4" /> Protokół Zweryfikowany
              </div>
              
              <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-12 mb-16 mt-8">
                <div>
                  <h2 className="text-5xl font-black text-slate-900 tracking-[ -0.05em ] uppercase leading-[0.85]">{currentGeneration.settings.medicationName || 'NOWA TERAPIA'}</h2>
                  <div className="flex flex-wrap items-center gap-6 mt-8">
                    <div className="bg-slate-50 px-5 py-2.5 rounded-2xl border border-slate-100 flex items-center gap-3">
                       <ShieldCheck className="w-5 h-5 text-indigo-500" />
                       <span className="text-[11px] font-black text-slate-600 uppercase tracking-widest mono">STATUS: VALIDATED</span>
                    </div>
                    <div className="bg-slate-50 px-5 py-2.5 rounded-2xl border border-slate-100 flex items-center gap-3">
                       <LayoutGrid className="w-5 h-5 text-slate-400" />
                       <span className="text-[11px] font-black text-slate-600 uppercase tracking-widest mono">DURATION: {currentGeneration.settings.totalDays}D</span>
                    </div>
                    <div className="bg-slate-50 px-5 py-2.5 rounded-2xl border border-slate-100 flex items-center gap-3">
                       <Cross className="w-5 h-5 text-red-400" />
                       <span className="text-[11px] font-black text-slate-600 uppercase tracking-widest mono">SIG: PER_PROTO</span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-5">
                  <button 
                    onClick={() => setCurrentGeneration(null)}
                    className="px-10 py-5 font-black text-slate-400 hover:text-red-500 border-2 border-slate-100 rounded-3xl transition-all uppercase text-xs tracking-widest hover:border-red-100"
                  >
                    Odrzuć_Zapis
                  </button>
                  <button 
                    onClick={handleSaveToMyPlans}
                    className="bg-emerald-600 text-white px-12 py-5 rounded-3xl font-black shadow-2xl shadow-emerald-200 hover:bg-emerald-700 active:scale-95 transition-all flex items-center gap-4 text-lg uppercase border-b-6 border-emerald-900 tracking-tighter"
                  >
                    <Save className="w-6 h-6" />
                    Zapisz Protokół
                  </button>
                </div>
              </div>

              {/* Lab Control UI */}
              <div className="flex flex-col lg:flex-row items-center justify-between mb-12 bg-slate-900 p-7 rounded-[2.5rem] border-b-4 border-indigo-700 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent"></div>
                <div className="flex items-center gap-4 text-indigo-400 font-black text-xs uppercase tracking-[0.4em] mb-6 lg:mb-0 mono">
                  <div className="p-2 bg-indigo-500/10 rounded-lg">
                    <Activity className="w-5 h-5" />
                  </div>
                  System_Display_Management
                </div>
                <div className="flex flex-wrap gap-4">
                  <button 
                    onClick={() => toggleAllDays(true)}
                    className="flex items-center gap-3 px-6 py-3.5 bg-white/5 border border-white/10 rounded-2xl text-[10px] font-black text-slate-300 hover:text-white hover:bg-white/10 transition-all uppercase tracking-[0.2em] mono"
                  >
                    <Minimize2 className="w-4 h-4" />
                    Collapse_All
                  </button>
                  <button 
                    onClick={() => toggleAllDays(false)}
                    className="flex items-center gap-3 px-6 py-3.5 bg-white/5 border border-white/10 rounded-2xl text-[10px] font-black text-slate-300 hover:text-white hover:bg-white/10 transition-all uppercase tracking-[0.2em] mono"
                  >
                    <Maximize2 className="w-4 h-4" />
                    Expand_All
                  </button>
                </div>
              </div>

              {/* Day Timeline */}
              <div className="flex overflow-x-auto pb-10 gap-6 no-scrollbar mb-12 border-b border-slate-100">
                {currentGeneration.days.map((day, idx) => (
                  <button 
                    key={idx} 
                    onClick={() => {
                      document.getElementById(`day-card-${idx}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      if (collapsedDays[idx]) toggleDayCollapse(idx);
                    }}
                    className="flex-shrink-0 w-36 p-8 rounded-[2.5rem] border-2 border-slate-100 text-center bg-slate-50 hover:border-indigo-400 hover:bg-white transition-all shadow-sm group relative overflow-hidden"
                  >
                    <div className="text-[10px] font-black uppercase text-slate-400 mb-3 group-hover:text-indigo-400 transition-colors mono tracking-widest">D_{day.day.toString().padStart(2, '0')}</div>
                    <div className="text-4xl font-black text-slate-800 tracking-tighter leading-none mb-1">{new Date(day.date).getDate()}</div>
                    <div className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">{new Date(day.date).toLocaleDateString('pl-PL', { month: 'short' })}</div>
                    <div className="absolute bottom-0 left-0 w-full h-1.5 bg-transparent group-hover:bg-indigo-500 transition-all"></div>
                  </button>
                ))}
              </div>

              {/* Day Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
                {currentGeneration.days.map((day, dayIdx) => {
                  const isCollapsed = collapsedDays[dayIdx];
                  return (
                    <div 
                      key={dayIdx} 
                      id={`day-card-${dayIdx}`}
                      className={`relative p-10 rounded-[3rem] border-2 transition-all duration-700 flex flex-col group bg-white shadow-sm overflow-hidden ${isCollapsed ? 'border-slate-100 bg-slate-50/30 ring-0' : 'border-indigo-100 hover:border-indigo-200 ring-8 ring-transparent hover:ring-indigo-50/50'}`}
                    >
                      {/* Geometric Lab Symbol */}
                      {!isCollapsed && (
                        <div className="absolute top-0 right-0 w-20 h-20 bg-indigo-50/60 -translate-y-10 translate-x-10 rotate-45 pointer-events-none border border-indigo-100/50"></div>
                      )}
                      
                      <div className="flex justify-between items-start mb-4">
                        <div onClick={() => toggleDayCollapse(dayIdx)} className="cursor-pointer flex-1">
                          <h4 className="font-black text-slate-900 flex items-center gap-3 text-2xl tracking-tighter uppercase">
                            ETAP_{day.day.toString().padStart(2, '0')}
                            {isCollapsed && <span className="text-[9px] mono bg-indigo-100 text-indigo-600 px-3 py-1.5 rounded-xl uppercase font-black">{day.doses.length} DAWEK</span>}
                          </h4>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2 mt-1">
                            <Calendar className="w-3.5 h-3.5" /> {new Date(day.date).toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' })}
                          </p>
                        </div>
                        <button 
                          onClick={() => toggleDayCollapse(dayIdx)}
                          className={`p-4 rounded-2xl transition-all border-2 ${isCollapsed ? 'bg-slate-100 border-slate-100 text-slate-400 rotate-180' : 'bg-indigo-50 border-indigo-100 text-indigo-600 shadow-md shadow-indigo-100'}`}
                        >
                          <ChevronUp className="w-6 h-6" />
                        </button>
                      </div>

                      <div className={`transition-all duration-700 overflow-hidden ${isCollapsed ? 'max-h-0 opacity-0' : 'max-h-[1200px] opacity-100 mt-8'}`}>
                        <div className="space-y-5 flex-grow">
                          {day.doses.map((dose) => (
                            <div key={dose.id} className="flex items-center gap-5 p-5 rounded-[1.5rem] bg-slate-50 border-2 border-transparent focus-within:border-indigo-200 focus-within:bg-white transition-all shadow-sm relative group/item">
                              <div className="p-3 bg-white rounded-xl border border-slate-100 shadow-sm group-focus-within/item:bg-indigo-600 group-focus-within/item:text-white transition-colors">
                                <Clock className="w-5 h-5" />
                              </div>
                              <input 
                                type="time" 
                                className="bg-transparent border-none p-0 text-2xl font-black text-slate-800 focus:ring-0 outline-none w-28 mono tracking-tight"
                                value={dose.time}
                                onChange={(e) => {
                                  const newList = [...currentGeneration.days];
                                  const d = { ...newList[dayIdx] };
                                  const [h, m] = e.target.value.split(':').map(Number);
                                  d.doses = d.doses.map(ds => ds.id === dose.id ? { ...ds, time: e.target.value, timeMinutes: h*60+m } : ds);
                                  newList[dayIdx] = d;
                                  setCurrentGeneration({...currentGeneration, days: newList});
                                }}
                              />
                              <div className="hidden lg:block absolute right-16 top-1/2 -translate-y-1/2 text-[8px] mono text-slate-300 uppercase font-black tracking-widest opacity-0 group-hover/item:opacity-100 transition-opacity">DOSE_SIG</div>
                              <button 
                                onClick={() => {
                                  const newList = [...currentGeneration.days];
                                  const d = { ...newList[dayIdx] };
                                  d.doses = d.doses.filter(ds => ds.id !== dose.id);
                                  newList[dayIdx] = d;
                                  setCurrentGeneration({...currentGeneration, days: newList});
                                }}
                                className="ml-auto p-3 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                              >
                                <Trash2 className="w-5 h-5" />
                              </button>
                            </div>
                          ))}
                        </div>

                        <div className="mt-10 pt-8 border-t border-slate-100 flex items-center gap-4">
                          <div className="relative flex-1">
                            <input 
                              type="time" 
                              className="w-full bg-white border-2 border-slate-100 rounded-[1.25rem] py-4 px-5 text-sm font-black focus:ring-2 focus:ring-indigo-500 outline-none mono tracking-widest"
                              value={pendingTimes[dayIdx] || "12:00"}
                              onChange={(e) => setPendingTimes(prev => ({ ...prev, [dayIdx]: e.target.value }))}
                            />
                            <div className="absolute right-5 top-1/2 -translate-y-1/2 text-[8px] mono text-slate-300 pointer-events-none uppercase font-black">NEW_ENTRY</div>
                          </div>
                          <button 
                            onClick={() => {
                              const time = pendingTimes[dayIdx] || "12:00";
                              const [h,m] = time.split(':').map(Number);
                              const newList = [...currentGeneration.days];
                              const d = { ...newList[dayIdx] };
                              d.doses = [...d.doses, { id: Math.random().toString(36).substr(2,9), time, timeMinutes: h*60+m }].sort((a,b) => a.timeMinutes - b.timeMinutes);
                              newList[dayIdx] = d;
                              setCurrentGeneration({...currentGeneration, days: newList});
                            }}
                            className="p-4 bg-slate-900 text-white rounded-[1.25rem] shadow-xl hover:bg-slate-800 transition-all active:scale-90 border-b-4 border-slate-700"
                          >
                            <Plus className="w-6 h-6" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}
      </main>

      <footer className="bg-slate-900 border-t-8 border-indigo-600 py-32 px-6 text-center mt-32 relative overflow-hidden">
        {/* Background Grids */}
        <div className="absolute inset-0 opacity-[0.05] pointer-events-none">
           <div className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '100px 100px' }}></div>
           <div className="absolute top-1/4 left-1/4 w-96 h-96 border-4 border-white rounded-full"></div>
           <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] border-2 border-white rotate-45"></div>
        </div>

        <div className="max-w-5xl mx-auto space-y-12 relative z-10">
          <div className="flex flex-col md:flex-row items-center justify-center gap-10">
            <div className="p-6 bg-white/5 rounded-[3rem] border border-white/10 backdrop-blur-xl shadow-2xl relative">
              <div className="absolute -top-2 -right-2 w-4 h-4 bg-emerald-500 rounded-full animate-pulse shadow-lg shadow-emerald-500/50"></div>
              <Dna className="w-16 h-16 text-indigo-400" />
            </div>
            <div className="text-left space-y-2">
              <h3 className="text-3xl font-black text-white tracking-tight uppercase leading-none">
                LAB-TERMINAL INFRASTRUCTURE
              </h3>
              <p className="text-slate-500 font-bold text-[10px] uppercase tracking-[0.5em] flex items-center gap-3">
                <ShieldCheck className="w-4 h-4 text-emerald-500" /> CLINICAL-GRADE MONITORING SYSTEM
              </p>
              <div className="h-1 w-20 bg-indigo-500 mt-4"></div>
            </div>
          </div>
          
          <p className="text-slate-400 font-medium max-w-2xl mx-auto leading-relaxed text-base">
            System zarządza protokołami terapeutycznymi z wykorzystaniem szyfrowania AES-256 oraz synchronizacji Supabase [SQL_CLOUD]. Integralność danych jest monitorowana w czasie rzeczywistym.
          </p>
          
          <div className="flex justify-center gap-20 pt-12 border-t border-white/5">
            <div className="flex flex-col items-center gap-3 group cursor-default">
              <span className="text-5xl font-black text-white mono group-hover:text-indigo-400 transition-colors">{schedules.length}</span>
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] mono">Active_Nodes</span>
            </div>
            <div className="w-px h-20 bg-white/10 hidden sm:block"></div>
            <div className="flex flex-col items-center gap-3 group cursor-default">
              <span className="text-5xl font-black text-indigo-400 mono group-hover:text-white transition-colors">{schedules.filter(s => s.isActive).length}</span>
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] mono">Active_Alerts</span>
            </div>
          </div>
          
          <div className="pt-16 flex flex-wrap justify-center gap-6 opacity-30 grayscale hover:grayscale-0 transition-all duration-700">
             <div className="px-6 py-3 border border-white/20 rounded-xl font-mono text-[9px] text-white flex items-center gap-3 uppercase tracking-widest bg-white/5">
               <div className="w-2 h-2 bg-indigo-400 rounded-sm rotate-45"></div> Protocol Sync V3
             </div>
             <div className="px-6 py-3 border border-white/20 rounded-xl font-mono text-[9px] text-white flex items-center gap-3 uppercase tracking-widest bg-white/5">
               <div className="w-2 h-2 bg-indigo-400 rounded-sm rotate-45"></div> Supabase Auth Node
             </div>
             <div className="px-6 py-3 border border-white/20 rounded-xl font-mono text-[9px] text-white flex items-center gap-3 uppercase tracking-widest bg-white/5">
               <div className="w-2 h-2 bg-indigo-400 rounded-sm rotate-45"></div> Realtime DB Hook
             </div>
          </div>
        </div>
      </footer>

      <AlarmSystem schedules={schedules} />
    </div>
  );
};

export default App;
