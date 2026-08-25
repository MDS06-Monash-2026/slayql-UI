import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Database,
  FileUp,
  Info,
  Loader2,
  LockKeyhole,
  Plus,
  Server,
  Snowflake,
  Upload,
  X,
} from 'lucide-react';
import { createConnection, testConnection, uploadConnection } from '../../services/api';

const PROVIDERS = [
  { id: 'postgresql', label: 'PostgreSQL', hint: 'Neon, RDS, or self-hosted' },
  { id: 'supabase', label: 'Supabase', hint: 'Use the direct database credentials' },
  { id: 'mysql', label: 'MySQL', hint: 'RDS, PlanetScale, or self-hosted' },
  { id: 'snowflake', label: 'Snowflake', hint: 'Warehouse account and role' },
];

const SAMPLE_DATABASES = [
  {
    id: 'adventureworks',
    name: 'AdventureWorks',
    filename: 'AdventureWorks-sqlite.db',
    path: '/AdventureWorks-sqlite.db',
    detail: '12 tables / sales, customers, products, and orders',
  },
  {
    id: 'enterprise',
    name: 'Enterprise Sample',
    filename: 'enterprise.db',
    path: '/enterprise.db',
    detail: '44 tables / finance, HR, CRM, support, and operations',
  },
];

const initialCredentials = { host: '', port: '', database: '', username: '', password: '', sslmode: 'require', account: '', warehouse: '', schema: '', role: '', private_key: '', auth_json: '' };

export default function AddConnectionModal({ isOpen, onClose, onConnectionAdded }) {
  const [mode, setMode] = useState('upload');
  const [name, setName] = useState('');
  const [provider, setProvider] = useState('postgresql');
  const [credentials, setCredentials] = useState(initialCredentials);
  const [file, setFile] = useState(null);
  const [selectedSample, setSelectedSample] = useState(null);
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setMode('upload');
      setName('');
      setProvider('postgresql');
      setCredentials(initialCredentials);
      setFile(null);
      setSelectedSample(null);
      setDescription('');
      setTestResult(null);
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const updateCredential = (key, value) => setCredentials((current) => ({ ...current, [key]: value }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    setTestResult(null);
    if (!name.trim()) return setError('Give this data source a name.');
    if (mode === 'upload' && !file) return setError('Choose a SQLite database file to upload.');
    if (mode === 'sample' && !selectedSample) return setError('Choose a sample database.');
    if (mode === 'direct' && provider !== 'snowflake' && (!credentials.host || !credentials.database || !credentials.username || !credentials.password)) {
      return setError('Host, database, username, and password are required.');
    }
    if (mode === 'direct' && provider === 'snowflake' && !credentials.auth_json && (!credentials.account || !credentials.database || !credentials.username || (!credentials.password && !credentials.private_key))) {
      return setError('Snowflake account, database, username, and a password or private key are required.');
    }

    setIsSubmitting(true);
    try {
      let created;
      if (mode === 'upload') {
        created = await uploadConnection({ name: name.trim(), file, description: description.trim() });
      } else if (mode === 'sample') {
        const sampleResponse = await fetch(selectedSample.path);
        if (!sampleResponse.ok) throw new Error('Could not load the selected sample database.');
        const sampleBlob = await sampleResponse.blob();
        const sampleFile = new File([sampleBlob], selectedSample.filename, { type: 'application/x-sqlite3' });
        created = await uploadConnection({
          name: name.trim(),
          file: sampleFile,
          description: description.trim() || selectedSample.detail,
        });
      } else {
        created = await createConnection({
            name: name.trim(),
            provider,
            mode,
            description: description.trim(),
            credentials: Object.fromEntries(Object.entries(credentials).filter(([, value]) => value !== '')),
          });
      }
      const result = await testConnection(created.id);
      setTestResult(result);
      if (result.status !== 'healthy') throw new Error(result.message || 'Connection test failed.');
      onConnectionAdded?.(created);
      onClose();
    } catch (err) {
      setError(err.message || 'Could not connect to this data source.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClass = 'w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500';
  const labelClass = 'block text-[11px] font-bold text-slate-700 mb-1.5';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="relative w-full max-w-xl max-h-[92vh] overflow-y-auto bg-white rounded-3xl shadow-2xl border border-slate-200 slide-in-up">
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-white/95 backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-100"><Database className="w-4 h-4" /></div>
            <div><h2 className="text-sm font-bold text-slate-900">Add data source</h2><p className="text-[11px] text-slate-500">Choose a managed copy or a secure direct connection</p></div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100"><X className="w-4 h-4" /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2"><AlertCircle className="w-4 h-4 shrink-0" />{error}</div>}
          <div className="grid grid-cols-3 gap-2 p-1 bg-slate-100 rounded-xl">
            <button type="button" onClick={() => setMode('upload')} className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-bold ${mode === 'upload' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'}`}><Upload className="w-3.5 h-3.5" />Managed upload</button>
            <button type="button" onClick={() => setMode('sample')} className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-bold ${mode === 'sample' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'}`}><Database className="w-3.5 h-3.5" />Samples</button>
            <button type="button" onClick={() => setMode('direct')} className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-bold ${mode === 'direct' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'}`}><Server className="w-3.5 h-3.5" />Connect directly</button>
          </div>

          <div><label className={labelClass}>Display name</label><input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Finance warehouse" className={inputClass} /></div>

          {mode === 'upload' ? (
            <div>
              <label className={labelClass}>SQLite database file</label>
              <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 hover:border-indigo-400 hover:bg-indigo-50/40">
                <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-indigo-600"><FileUp className="w-5 h-5" /></div>
                <div className="min-w-0"><p className="text-xs font-bold text-slate-800 truncate">{file?.name || 'Choose a .db, .sqlite, or .sqlite3 file'}</p><p className="text-[10px] text-slate-500">A managed copy is stored on the API volume and checked for integrity.</p></div>
                <input type="file" accept=".db,.sqlite,.sqlite3,application/x-sqlite3" className="sr-only" onChange={(event) => setFile(event.target.files?.[0] || null)} />
              </label>
            </div>
          ) : mode === 'sample' ? (
            <div>
              <label className={labelClass}>Sample database</label>
              <div className="grid sm:grid-cols-2 gap-2">
                {SAMPLE_DATABASES.map((sample) => {
                  const selected = selectedSample?.id === sample.id;
                  return (
                    <button
                      key={sample.id}
                      type="button"
                      onClick={() => {
                        setSelectedSample(sample);
                        setName(sample.name);
                      }}
                      className={`min-h-24 p-3 rounded-xl border text-left transition ${selected ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-500/10' : 'border-slate-200 bg-slate-50 hover:border-slate-300'}`}
                    >
                      <span className="flex items-center gap-2 text-xs font-bold text-slate-800"><Database className={`w-4 h-4 ${selected ? 'text-indigo-600' : 'text-slate-400'}`} />{sample.name}</span>
                      <span className="block mt-2 text-[10px] leading-4 text-slate-500">{sample.detail}</span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-[10px] text-slate-500">Selecting a sample creates a private managed copy for this account.</p>
            </div>
          ) : (
            <>
              <div><label className={labelClass}>Provider</label><div className="grid grid-cols-2 gap-2">{PROVIDERS.map((item) => <button key={item.id} type="button" onClick={() => setProvider(item.id)} className={`text-left rounded-xl border px-3 py-2.5 transition ${provider === item.id ? 'border-indigo-500 bg-indigo-50/60 ring-2 ring-indigo-500/10' : 'border-slate-200 hover:border-slate-300'}`}><p className="text-xs font-bold text-slate-800 flex items-center gap-1.5">{item.id === 'snowflake' ? <Snowflake className="w-3.5 h-3.5 text-sky-600" /> : <Database className="w-3.5 h-3.5 text-indigo-500" />}{item.label}</p><p className="text-[10px] text-slate-500 mt-0.5">{item.hint}</p></button>)}</div></div>
              {provider === 'snowflake' ? <div className="grid grid-cols-2 gap-3"><div><label className={labelClass}>Account identifier</label><input value={credentials.account} onChange={(e) => updateCredential('account', e.target.value)} placeholder="org-account" className={inputClass} /></div><div><label className={labelClass}>Warehouse</label><input value={credentials.warehouse} onChange={(e) => updateCredential('warehouse', e.target.value)} placeholder="ANALYTICS_WH" className={inputClass} /></div></div> : <div className="grid grid-cols-[1fr_100px] gap-3"><div><label className={labelClass}>Host</label><input value={credentials.host} onChange={(e) => updateCredential('host', e.target.value)} placeholder={provider === 'supabase' ? 'db.project.supabase.co' : 'db.example.com'} className={inputClass} /></div><div><label className={labelClass}>Port</label><input value={credentials.port} onChange={(e) => updateCredential('port', e.target.value)} placeholder={provider === 'mysql' ? '3306' : '5432'} className={inputClass} /></div></div>}
              <div className="grid grid-cols-2 gap-3"><div><label className={labelClass}>Database</label><input value={credentials.database} onChange={(e) => updateCredential('database', e.target.value)} placeholder="analytics" className={inputClass} /></div><div><label className={labelClass}>Username</label><input value={credentials.username} onChange={(e) => updateCredential('username', e.target.value)} placeholder="read_only_user" className={inputClass} /></div></div>
              <div><label className={labelClass}>{provider === 'snowflake' && credentials.private_key ? 'Password (optional)' : provider === 'snowflake' ? 'Password or private key' : 'Password'}</label><input type="password" value={credentials.password} onChange={(e) => updateCredential('password', e.target.value)} placeholder="Stored encrypted" className={inputClass} /></div>
              {provider === 'snowflake' && <div><label className={labelClass}>Private key (optional)</label><textarea value={credentials.private_key} onChange={(e) => updateCredential('private_key', e.target.value)} placeholder="Paste a PEM private key when password auth is disabled" rows={3} className={`${inputClass} font-mono`} /></div>}
              {provider === 'snowflake' && <div><label className={labelClass}>Provider auth JSON (optional)</label><textarea value={credentials.auth_json} onChange={(e) => updateCredential('auth_json', e.target.value)} placeholder='{"account":"org-account","user":"read_only_user","private_key":"-----BEGIN PRIVATE KEY----- ..."}' rows={3} className={`${inputClass} font-mono`} /></div>}
              <div className="grid grid-cols-2 gap-3"><div><label className={labelClass}>Schema {provider === 'snowflake' ? '' : '(optional)'}</label><input value={credentials.schema} onChange={(e) => updateCredential('schema', e.target.value)} placeholder={provider === 'snowflake' ? 'PUBLIC' : 'public'} className={inputClass} /></div><div><label className={labelClass}>Role {provider === 'snowflake' ? '(optional)' : ''}</label><input value={credentials.role} onChange={(e) => updateCredential('role', e.target.value)} placeholder="ANALYST" className={inputClass} /></div></div>
              {provider !== 'snowflake' && <div><label className={labelClass}>TLS mode</label><select value={credentials.sslmode} onChange={(e) => updateCredential('sslmode', e.target.value)} className={inputClass}><option value="require">Require encrypted TLS</option><option value="verify-full">Verify certificate</option></select></div>}
              <div className="flex items-start gap-2 rounded-xl bg-indigo-50/70 border border-indigo-100 p-3 text-[10px] text-indigo-900"><LockKeyhole className="w-4 h-4 shrink-0 text-indigo-600" /><span>Credentials are encrypted before storage and are only used server-side for read-only catalog and query operations.</span></div>
              {provider === 'supabase' && <div className="flex items-start gap-2 text-[10px] text-slate-500"><Info className="w-3.5 h-3.5 shrink-0" />Use your Supabase database password from Project Settings. The anon/publishable API key is not a SQL database credential.</div>}
            </>
          )}

          <div><label className={labelClass}>Description <span className="font-normal text-slate-400">(optional)</span></label><input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this source used for?" className={inputClass} /></div>
          {testResult && <div className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${testResult.status === 'healthy' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'}`}>{testResult.status === 'healthy' ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertCircle className="w-4 h-4 text-red-600" />}{testResult.message}</div>}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2"><button type="button" onClick={onClose} className="px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl">Cancel</button><button type="submit" disabled={isSubmitting} className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-md shadow-indigo-100 disabled:opacity-50">{isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}<span>{isSubmitting ? 'Securing connection…' : 'Add & verify'}</span></button></div>
        </form>
      </div>
    </div>
  );
}
