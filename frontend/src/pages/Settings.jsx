import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Settings as SettingsIcon, Save, Clock, ShieldAlert } from 'lucide-react';
import Card from '../components/Card';
import Button from '../components/Button';
import Loader from '../components/Loader';
import client from '../api/client'; // Direct import of your axios instance

export default function Settings() {
  const [mode, setMode] = useState('once');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // 1. Fetch current settings on load
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        // Assuming you have a settings endpoint. If not, this will gracefully fallback.
        const res = await client.get('/settings');
        const data = res.data?.data || res.data || [];
        const attMode = data.find((s) => s.key === 'attendance_mode');
        if (attMode) setMode(attMode.value);
      } catch (err) {
        console.warn('Settings API not found, using default settings.');
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  // 2. Save settings
  const handleSave = async () => {
    setSaving(true);
    try {
      // We upsert the setting
      await client.patch('/settings', { key: 'attendance_mode', value: mode });
      toast.success('Attendance settings updated successfully!');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loader />;

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2 text-slate-800 dark:text-slate-100">
          <SettingsIcon className="w-6 h-6 text-brand-600" /> System Settings
        </h1>
        <p className="text-slate-500 mt-1">Manage global application configurations.</p>
      </div>

      <Card className="p-6">
        <div className="flex items-start gap-3 border-b border-slate-200 dark:border-slate-700 pb-4 mb-4">
          <Clock className="w-5 h-5 text-brand-600 mt-0.5" />
          <div>
            <h3 className="font-semibold text-lg">Attendance Configuration</h3>
            <p className="text-sm text-slate-500">Choose how attendance is tracked in your school.</p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Option 1: Once a day */}
          <label 
            className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-colors ${
              mode === 'once' 
                ? 'border-brand-500 bg-brand-50/50 dark:bg-brand-500/10' 
                : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50'
            }`}
          >
            <input 
              type="radio" 
              name="attendance_mode" 
              value="once" 
              checked={mode === 'once'} 
              onChange={() => setMode('once')}
              className="mt-1 w-4 h-4 text-brand-600 focus:ring-brand-500"
            />
            <div>
              <div className="font-semibold text-slate-800 dark:text-slate-200">Once a Day</div>
              <div className="text-sm text-slate-500 mt-1">
                Teachers mark attendance one time per day. The system will not ask for Morning or Afternoon sessions.
              </div>
            </div>
          </label>

          {/* Option 2: Twice a day */}
          <label 
            className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-colors ${
              mode === 'twice' 
                ? 'border-brand-500 bg-brand-50/50 dark:bg-brand-500/10' 
                : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50'
            }`}
          >
            <input 
              type="radio" 
              name="attendance_mode" 
              value="twice" 
              checked={mode === 'twice'} 
              onChange={() => setMode('twice')}
              className="mt-1 w-4 h-4 text-brand-600 focus:ring-brand-500"
            />
            <div>
              <div className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                Twice a Day (Morning & Afternoon) 
                <span className="badge badge-green text-[10px]">Recommended for High Schools</span>
              </div>
              <div className="text-sm text-slate-500 mt-1">
                Teachers will have a dropdown to select <strong>Morning</strong> or <strong>Afternoon</strong> when marking attendance. Both sessions are tracked independently.
              </div>
            </div>
          </label>
        </div>

        {/* Warning for changing settings mid-year */}
        <div className="mt-6 flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 rounded-lg text-sm">
          <ShieldAlert className="w-5 h-5 shrink-0" />
          <p>
            <strong>Note:</strong> Changing this setting will not delete existing attendance records. If you switch to "Twice a day", previous records will be treated as "Full Day" records.
          </p>
        </div>

        <div className="mt-6 flex justify-end">
          <Button onClick={handleSave} loading={saving} icon={Save} className="bg-brand-600 hover:bg-brand-700">
            Save Settings
          </Button>
        </div>
      </Card>
    </div>
  );
}
