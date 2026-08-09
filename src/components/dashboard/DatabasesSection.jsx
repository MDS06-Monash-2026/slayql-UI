import React, { useState } from 'react';
import { Database, UploadCloud, CheckCircle2 } from 'lucide-react';

const DB_OPTIONS = [
  {
    id: 'sqlite',
    name: 'SQLite',
    icon: Database,
    desc: 'Use a local SQLite database for quick experimentation and development.',
    color: 'bg-slate-600',
  },
  {
    id: 'bigquery',
    name: 'BigQuery',
    icon: Database,
    desc: 'Connect to Google BigQuery and query your cloud data.',
    color: 'bg-blue-500',
  },
  {
    id: 'snowflake',
    name: 'Snowflake',
    icon: Database,
    desc: 'Connect to Snowflake for enterprise-scale data warehousing.',
    color: 'bg-sky-400',
  },
];

function DbCard({ option, isSelected, onSelect }) {
  const Icon = option.icon;
  return (
    <div
      onClick={() => onSelect(option.id)}
      className={[
        'relative p-5 rounded-xl border-2 transition-all cursor-pointer bg-white group',
        isSelected
          ? 'border-indigo-600 shadow-md shadow-indigo-100'
          : 'border-slate-200 hover:border-indigo-300 hover:shadow-sm',
      ].join(' ')}
    >
      <div className="flex items-start gap-4">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${option.color}`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-bold text-slate-800">{option.name}</h3>
          <p className="mt-1 text-xs text-slate-500 leading-relaxed">{option.desc}</p>
        </div>
      </div>
      
      <div className="mt-4 flex items-center justify-end">
        {isSelected ? (
          <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-600">
            <CheckCircle2 className="w-4 h-4" />
            Connected
          </div>
        ) : (
          <span className="text-xs font-semibold text-slate-400 group-hover:text-indigo-600 transition-colors">
            Connect →
          </span>
        )}
      </div>
    </div>
  );
}

export default function DatabasesSection({ activeDatabase, onConnect }) {
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    // In a real app, handle file upload here
    alert("Database upload simulated.");
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 animate-fade-in-up">
      
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-slate-900">Databases</h2>
        <p className="text-sm text-slate-500 mt-1">
          Select a database connection or upload your own to start querying.
        </p>
      </div>

      <div className="space-y-8">
        
        {/* Connect a Database */}
        <section>
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Connect a Database</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {DB_OPTIONS.map(opt => (
              <DbCard
                key={opt.id}
                option={opt}
                isSelected={activeDatabase === opt.id || (activeDatabase === 'spider2_sqlite_demo' && opt.id === 'sqlite')}
                onSelect={onConnect}
              />
            ))}
          </div>
        </section>

        {/* Bring Your Own Data */}
        <section>
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Bring Your Own Data</h3>
          
          <div
            className={[
              'relative border-2 border-dashed rounded-xl p-8 text-center transition-all bg-white',
              dragActive 
                ? 'border-indigo-500 bg-indigo-50' 
                : 'border-slate-300 hover:border-indigo-400 hover:bg-slate-50'
            ].join(' ')}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <UploadCloud className="w-6 h-6 text-slate-400" />
            </div>
            <h3 className="text-base font-bold text-slate-800">Upload Your Database</h3>
            <p className="mt-1 text-sm text-slate-500 max-w-sm mx-auto">
              Upload a supported database file (.sqlite, .db) and start querying your own data immediately.
            </p>
            <div className="mt-6">
              <label className="inline-flex items-center justify-center px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg cursor-pointer transition-colors shadow-sm">
                Browse Files
                <input type="file" className="hidden" accept=".sqlite,.db" onChange={() => alert("Upload simulated")} />
              </label>
              <p className="mt-3 text-[10px] text-slate-400 font-mono">Max size: 50MB (SQLite only)</p>
            </div>
          </div>
        </section>

      </div>
      <div className="h-12" />
    </div>
  );
}
