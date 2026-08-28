import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Camera, Coins, Database, Loader2, LogOut, Moon, Save, Sun, UserRound } from 'lucide-react';
import ConfirmationModal from '../components/demo/ConfirmationModal';
import { addCredits, fetchCredits, fetchProfile, updateProfile, uploadProfileAvatar } from '../services/api';

export default function ProfileView({ setView, session, onSessionUpdate, onLogout }) {
  const [theme, setTheme] = useState(() => localStorage.getItem('slayql_theme') || 'light');
  const [profile, setProfile] = useState(session?.user || null);
  const [form, setForm] = useState({ name: '', role: '', organization_name: '', bio: '', timezone: 'Asia/Kuala_Lumpur' });
  const [credits, setCredits] = useState({ balance: session?.user?.credits || 0, transactions: [] });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [addingCredits, setAddingCredits] = useState(false);
  const [notice, setNotice] = useState('');
  const [signOutOpen, setSignOutOpen] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    localStorage.setItem('slayql_theme', theme);
  }, [theme]);

  useEffect(() => {
    Promise.all([fetchProfile(), fetchCredits()]).then(([profileData, creditData]) => {
      setProfile(profileData);
      setForm({
        name: profileData.name || '',
        role: profileData.role || '',
        organization_name: profileData.organization_name || '',
        bio: profileData.bio || '',
        timezone: profileData.timezone || 'Asia/Kuala_Lumpur',
      });
      setCredits(creditData);
    }).catch((error) => setNotice(error.message));
  }, []);

  const syncProfile = (nextProfile) => {
    setProfile(nextProfile);
    onSessionUpdate?.({ ...session, user: nextProfile, organization: { ...session.organization, name: nextProfile.organization_name } });
  };

  const handleSave = async (event) => {
    event.preventDefault();
    setSaving(true);
    setNotice('');
    try {
      const updated = await updateProfile(form);
      syncProfile(updated);
      setNotice('Profile updated.');
    } catch (error) {
      setNotice(error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAvatar = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setNotice('');
    try {
      const updated = await uploadProfileAvatar(file);
      syncProfile(updated);
      setNotice('Profile photo updated.');
    } catch (error) {
      setNotice(error.message);
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const handleAddCredits = async () => {
    setAddingCredits(true);
    try {
      const next = await addCredits(100);
      setCredits(next);
      const updated = { ...profile, credits: next.balance };
      syncProfile(updated);
      setNotice('Credits added.');
    } catch (error) {
      setNotice(error.message);
    } finally {
      setAddingCredits(false);
    }
  };

  const inputClass = 'w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10';

  return (
    <div className={`live-demo-shell theme-${theme} min-h-screen flex bg-[#f7f9fc] text-slate-900`}>
      <aside className={`hidden md:flex w-64 shrink-0 flex-col border-r ${theme === 'dark' ? 'bg-[#151924] border-slate-800' : 'bg-white border-slate-200'}`}>
        <button onClick={() => setView('demo')} className="h-20 px-4 border-b border-slate-200/60 flex items-center gap-3 text-left">
          <div className="w-12 h-12 rounded-xl overflow-hidden bg-white p-1 shadow-sm"><img src="/SlayQLlogo.png" alt="SlayQL" className="w-full h-full object-contain" /></div>
          <span className="text-base font-bold text-slate-900">SlayQL</span>
        </button>
        <nav className="p-3 space-y-1">
          <button onClick={() => setView('demo')} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-200/60"><ArrowLeft className="w-4 h-4" />Back to chat</button>
          <button className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-700"><UserRound className="w-4 h-4" />Profile</button>
          <button onClick={() => setView('databases')} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-200/60"><Database className="w-4 h-4" />Data sources</button>
        </nav>
        <div className="mt-auto p-3 border-t border-slate-200 live-demo-profile">
          <button onClick={() => setSignOutOpen(true)} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-red-600 hover:bg-red-50"><LogOut className="w-4 h-4" />Sign out</button>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <header className="h-16 px-4 sm:px-8 flex items-center justify-between border-b border-slate-200 bg-white/95">
          <div className="flex items-center gap-3"><button onClick={() => setView('demo')} className="md:hidden w-9 h-9 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100"><ArrowLeft className="w-4 h-4" /></button><div className="md:hidden w-10 h-10 rounded-lg overflow-hidden bg-white p-1"><img src="/SlayQLlogo.png" alt="SlayQL" className="w-full h-full object-contain" /></div><div><h1 className="text-base font-bold text-slate-900">Profile and credits</h1><p className="text-[11px] text-slate-500">Manage your identity and workspace usage</p></div></div>
          <button onClick={() => setTheme((value) => value === 'light' ? 'dark' : 'light')} className="w-9 h-9 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-slate-600" title="Change appearance">{theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}</button>
        </header>

        <div className="max-w-5xl mx-auto px-4 sm:px-8 py-8 space-y-8">
          <section className="flex flex-col sm:flex-row sm:items-center gap-5 pb-8 border-b border-slate-200">
            <button type="button" onClick={() => fileRef.current?.click()} className="relative w-24 h-24 rounded-full bg-indigo-600 text-white flex items-center justify-center text-2xl font-bold overflow-hidden ring-4 ring-white shadow-md group" title="Upload profile photo">
              {profile?.avatar_data_url ? <img src={profile.avatar_data_url} alt="Profile" className="w-full h-full object-cover" /> : profile?.avatar_initials || 'U'}
              <span className="absolute inset-0 bg-slate-950/55 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"><Camera className="w-5 h-5" /></span>
              {uploading && <span className="absolute inset-0 bg-slate-950/65 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin" /></span>}
            </button>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={handleAvatar} className="sr-only" />
            <div><h2 className="text-xl font-bold text-slate-900">{profile?.name || 'Your profile'}</h2><p className="text-sm text-slate-500">{profile?.email}</p><p className="text-[11px] text-slate-400 mt-1">PNG, JPEG, or WebP. Maximum 2 MB.</p></div>
          </section>

          <div className="grid lg:grid-cols-[1fr_320px] gap-8 items-start">
            <form onSubmit={handleSave} className="space-y-5">
              <div><h2 className="text-sm font-bold text-slate-900">Personal information</h2><p className="text-xs text-slate-500 mt-1">Used across your workspace and shared database access.</p></div>
              <div className="grid sm:grid-cols-2 gap-4"><label className="text-xs font-bold text-slate-700">Name<input className={`${inputClass} mt-1.5`} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label><label className="text-xs font-bold text-slate-700">Role<input className={`${inputClass} mt-1.5`} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} /></label></div>
              <label className="block text-xs font-bold text-slate-700">Organization<input className={`${inputClass} mt-1.5`} value={form.organization_name} onChange={(e) => setForm({ ...form, organization_name: e.target.value })} /></label>
              <label className="block text-xs font-bold text-slate-700">Bio<textarea rows={4} className={`${inputClass} mt-1.5 resize-none`} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} placeholder="Your responsibilities and data interests" /></label>
              <label className="block text-xs font-bold text-slate-700">Timezone<select className={`${inputClass} mt-1.5`} value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })}><option>Asia/Kuala_Lumpur</option><option>UTC</option><option>America/New_York</option><option>Europe/London</option><option>Asia/Singapore</option></select></label>
              <div className="flex items-center gap-3"><button disabled={saving} className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold inline-flex items-center gap-2 disabled:opacity-50">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}Save changes</button>{notice && <span className="text-xs text-slate-500">{notice}</span>}</div>
            </form>

            <section className="border-l-0 lg:border-l border-slate-200 lg:pl-8 space-y-5">
              <div className="flex items-center justify-between"><div><p className="text-xs font-bold text-slate-500 uppercase">Available credits</p><p className="text-3xl font-bold text-slate-900 mt-1">{credits.balance?.toLocaleString()}</p></div><div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center"><Coins className="w-5 h-5" /></div></div>
              <p className="text-xs leading-5 text-slate-500">Each AI query uses one workspace credit. Database browsing and catalog inspection are free.</p>
              <button onClick={handleAddCredits} disabled={addingCredits} className="w-full py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:border-indigo-300 disabled:opacity-50">{addingCredits ? 'Adding...' : 'Add 100 demo credits'}</button>
              <div className="pt-4 border-t border-slate-200"><p className="text-xs font-bold text-slate-700 mb-3">Recent usage</p><div className="space-y-3 max-h-64 overflow-y-auto">{credits.transactions?.length ? credits.transactions.map((item) => <div key={item.id} className="flex justify-between gap-3 text-[11px]"><div><p className="font-semibold text-slate-700">{item.reason}</p><p className="text-slate-400">{new Date(item.created_at).toLocaleDateString()}</p></div><span className={item.amount > 0 ? 'text-emerald-600 font-bold' : 'text-slate-600 font-bold'}>{item.amount > 0 ? '+' : ''}{item.amount}</span></div>) : <p className="text-xs text-slate-400">No credit activity yet.</p>}</div></div>
            </section>
          </div>
        </div>
      </main>

      <ConfirmationModal isOpen={signOutOpen} title="Sign out of SlayQL?" message="Your profile and database connections will remain saved for your next session." confirmLabel="Sign out" onCancel={() => setSignOutOpen(false)} onConfirm={onLogout} />
    </div>
  );
}
