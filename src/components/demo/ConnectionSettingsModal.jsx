import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Database,
  FileUp,
  Loader2,
  Save,
  Server,
  Upload,
  X,
} from 'lucide-react';
import { replaceConnectionFile, updateConnection } from '../../services/api';

const EMPTY_CREDENTIALS = {
  host: '',
  port: '',
  database: '',
  username: '',
  password: '',
  sslmode: '',
  account: '',
  warehouse: '',
  schema: '',
  role: '',
  private_key: '',
  auth_json: '',
};

export default function ConnectionSettingsModal({ connection, isOpen, onClose, onUpdated, theme = 'light' }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [connectionString, setConnectionString] = useState('');
  const [credentials, setCredentials] = useState(EMPTY_CREDENTIALS);
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const isDark = theme === 'dark';
  const isSqlite = connection?.engine === 'sqlite';
  const provider = connection?.provider || connection?.engine || '';

  useEffect(() => {
    if (!isOpen || !connection) return;
    setName(connection.name || '');
    setDescription(connection.description || '');
    setConnectionString('');
    setCredentials(EMPTY_CREDENTIALS);
    setFile(null);
    setError('');
  }, [connection, isOpen]);

  if (!isOpen || !connection) return null;

  const updateCredential = (key, value) => {
    setCredentials((current) => ({ ...current, [key]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    if (isSqlite && !file) {
      setError('Choose an updated SQLite database file.');
      return;
    }
    if (!isSqlite && !name.trim()) {
      setError('Database name is required.');
      return;
    }

    setSaving(true);
    try {
      const result = isSqlite
        ? await replaceConnectionFile(connection.id, file)
        : await updateConnection(connection.id, {
            name: name.trim(),
            description: description.trim(),
            connection_string: connectionString.trim(),
            credentials: Object.fromEntries(
              Object.entries(credentials).filter(([, value]) => value !== ''),
            ),
          });
      await onUpdated?.(result);
      onClose();
    } catch (err) {
      setError(err.message || 'Could not update this data source.');
    } finally {
      setSaving(false);
    }
  };

  const panelClass = isDark
    ? 'bg-[#151a23] border-slate-700 text-slate-100'
    : 'bg-white border-slate-200 text-slate-900';
  const mutedClass = isDark ? 'text-slate-400' : 'text-slate-500';
  const labelClass = `block mb-1.5 text-[11px] font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`;
  const inputClass = `w-full h-9 px-3 rounded-lg border text-xs outline-none transition-colors ${
    isDark
      ? 'bg-slate-900 border-slate-700 text-slate-100 placeholder-slate-600 focus:border-indigo-500'
      : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400 focus:bg-white focus:border-indigo-500'
  }`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="connection-settings-title"
        className={`w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-xl border shadow-2xl ${panelClass}`}
      >
        <div className={`sticky top-0 z-10 flex items-center justify-between gap-3 px-5 py-4 border-b ${isDark ? 'bg-[#151a23]/95 border-slate-800' : 'bg-white/95 border-slate-100'} backdrop-blur`}>
          <div className="flex min-w-0 items-center gap-3">
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${isDark ? 'bg-indigo-950 text-indigo-300' : 'bg-indigo-50 text-indigo-600'}`}>
              {isSqlite ? <Database className="h-4 w-4" /> : <Server className="h-4 w-4" />}
            </div>
            <div className="min-w-0">
              <h2 id="connection-settings-title" className="truncate text-sm font-bold">
                {isSqlite ? 'Replace database file' : 'Edit connection'}
              </h2>
              <p className={`truncate text-[10px] capitalize ${mutedClass}`}>{connection.name} / {provider}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`flex h-8 w-8 items-center justify-center rounded-lg ${isDark ? 'text-slate-400 hover:bg-slate-800 hover:text-white' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'}`}
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          {error && (
            <div className={`flex items-start gap-2 rounded-lg border p-3 text-xs ${isDark ? 'bg-rose-950/40 border-rose-800 text-rose-200' : 'bg-rose-50 border-rose-200 text-rose-700'}`}>
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {isSqlite ? (
            <div>
              <label className={labelClass}>SQLite database file</label>
              <label className={`flex cursor-pointer items-center gap-3 rounded-lg border border-dashed px-4 py-5 transition-colors ${
                isDark
                  ? 'bg-slate-900/70 border-slate-700 hover:border-indigo-500'
                  : 'bg-slate-50 border-slate-300 hover:bg-indigo-50/40 hover:border-indigo-400'
              }`}>
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${isDark ? 'bg-slate-800 text-indigo-300' : 'bg-white text-indigo-600 border border-slate-200'}`}>
                  <FileUp className="h-4 w-4" />
                </div>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-bold">{file?.name || 'Choose updated file'}</span>
                  <span className={`mt-0.5 block text-[10px] ${mutedClass}`}>.db, .sqlite, or .sqlite3</span>
                </span>
                <input
                  type="file"
                  accept=".db,.sqlite,.sqlite3,application/x-sqlite3"
                  className="sr-only"
                  onChange={(event) => setFile(event.target.files?.[0] || null)}
                />
              </label>
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>Display name</label>
                  <input className={inputClass} value={name} onChange={(event) => setName(event.target.value)} />
                </div>
                <div>
                  <label className={labelClass}>Description</label>
                  <input className={inputClass} value={description} onChange={(event) => setDescription(event.target.value)} />
                </div>
              </div>

              <div>
                <label className={labelClass}>Connection URL</label>
                <input
                  type="password"
                  className={inputClass}
                  value={connectionString}
                  onChange={(event) => setConnectionString(event.target.value)}
                  placeholder="Keep current URL"
                />
              </div>

              {provider === 'snowflake' ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div><label className={labelClass}>Account</label><input className={inputClass} value={credentials.account} onChange={(event) => updateCredential('account', event.target.value)} placeholder="Keep current" /></div>
                  <div><label className={labelClass}>Warehouse</label><input className={inputClass} value={credentials.warehouse} onChange={(event) => updateCredential('warehouse', event.target.value)} placeholder="Keep current" /></div>
                </div>
              ) : (
                <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-3">
                  <div><label className={labelClass}>Host</label><input className={inputClass} value={credentials.host} onChange={(event) => updateCredential('host', event.target.value)} placeholder="Keep current" /></div>
                  <div><label className={labelClass}>Port</label><input className={inputClass} value={credentials.port} onChange={(event) => updateCredential('port', event.target.value)} placeholder="Current" /></div>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <div><label className={labelClass}>Database</label><input className={inputClass} value={credentials.database} onChange={(event) => updateCredential('database', event.target.value)} placeholder="Keep current" /></div>
                <div><label className={labelClass}>Username</label><input className={inputClass} value={credentials.username} onChange={(event) => updateCredential('username', event.target.value)} placeholder="Keep current" /></div>
                <div><label className={labelClass}>Password</label><input type="password" className={inputClass} value={credentials.password} onChange={(event) => updateCredential('password', event.target.value)} placeholder="Keep current" /></div>
                <div><label className={labelClass}>Schema</label><input className={inputClass} value={credentials.schema} onChange={(event) => updateCredential('schema', event.target.value)} placeholder="Keep current" /></div>
              </div>

              {provider === 'snowflake' ? (
                <>
                  <div><label className={labelClass}>Role</label><input className={inputClass} value={credentials.role} onChange={(event) => updateCredential('role', event.target.value)} placeholder="Keep current" /></div>
                  <div><label className={labelClass}>Private key</label><textarea className={`${inputClass} h-20 py-2 font-mono`} value={credentials.private_key} onChange={(event) => updateCredential('private_key', event.target.value)} placeholder="Keep current" /></div>
                </>
              ) : (
                <div>
                  <label className={labelClass}>TLS mode</label>
                  <select className={inputClass} value={credentials.sslmode} onChange={(event) => updateCredential('sslmode', event.target.value)}>
                    <option value="">Keep current</option>
                    <option value="require">Require TLS</option>
                    <option value="verify-full">Verify certificate</option>
                  </select>
                </div>
              )}
            </>
          )}

          <div className={`flex items-center justify-end gap-2 border-t pt-4 ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
            <button
              type="button"
              onClick={onClose}
              className={`h-9 rounded-lg px-3 text-xs font-semibold ${isDark ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 text-xs font-bold text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : isSqlite ? <Upload className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
              <span>{saving ? 'Verifying...' : isSqlite ? 'Replace file' : 'Save & verify'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
