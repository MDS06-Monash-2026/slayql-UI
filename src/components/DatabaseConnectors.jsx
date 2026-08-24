import React, { useState } from 'react';
import { Lock, Check, X, Database, ScanSearch, Brain, MessageSquareText, BarChart3, ArrowRight } from 'lucide-react';
import { DB_CONNECTORS } from '../mock/mockData';

const FLOW_STEPS = [
  { icon: Database, label: 'Connect Database' },
  { icon: ScanSearch, label: 'Schema Analysis' },
  { icon: Brain, label: 'AI Exploration' },
  { icon: MessageSquareText, label: 'Natural Language Query' },
  { icon: BarChart3, label: 'Visualization' },
];

export default function DatabaseConnectors({ onConnected }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedDb, setSelectedDb] = useState(null);
  const [host, setHost] = useState('');
  const [port, setPort] = useState('');
  const [connectingState, setConnectingState] = useState('idle'); // idle | connecting | success
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  const steps = [
    'Resolving host reachability',
    'Authenticating database credentials',
    'Indexing catalog schema schemas',
    'Warming database connection pools'
  ];

  const handleConnectClick = (db) => {
    setSelectedDb(db);
    setHost('');
    setPort(db.port);
    setConnectingState('idle');
    setCurrentStepIndex(0);
    setModalOpen(true);
  };

  const handleTestAndConnect = async () => {
    if (!host) {
      alert('Please enter a host name');
      return;
    }
    setConnectingState('connecting');

    // Run simulated steps
    for (let i = 0; i < steps.length; i++) {
      setCurrentStepIndex(i);
      await new Promise(r => setTimeout(r, 700));
    }

    setConnectingState('success');
    if (onConnected) {
      onConnected(selectedDb.name);
    }
  };

  return (
    <section id="connectors" className="py-20 lg:py-28 bg-white border-t border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 px-3 py-1 mb-4 rounded-full border border-slate-300 bg-white text-slate-600 text-xs font-semibold uppercase tracking-wider shadow-sm">
            <span className="inline-block w-2 h-2 rounded-full bg-slate-400"></span>
            Integration
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-slate-900">
            Connect Your Database
          </h2>
          <p className="mt-4 text-lg text-slate-500 max-w-2xl mx-auto">
            Schema indexing happens automatically once a connection is established — no manual mapping required.
          </p>
        </div>

        {/* Flow diagram */}
        <div className="flex flex-wrap items-center justify-center gap-2 mb-14">
          {FLOW_STEPS.map((step, idx) => {
            const Icon = step.icon;
            return (
              <React.Fragment key={idx}>
                <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white shadow-sm">
                  <Icon className="w-4 h-4 text-indigo-600" />
                  <span className="text-xs font-semibold text-slate-700">{step.label}</span>
                </div>
                {idx < FLOW_STEPS.length - 1 && <ArrowRight className="w-4 h-4 text-slate-300" />}
              </React.Fragment>
            );
          })}
        </div>

        {/* Database Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {DB_CONNECTORS.map((db, idx) => (
            <div key={idx} className="db-card rounded-2xl border border-slate-200 bg-white p-6 hover:border-indigo-200 hover:shadow-xl hover:shadow-indigo-50 transition-all duration-300">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center font-bold text-indigo-700 text-lg">
                    {db.label}
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">{db.name}</h3>
                    <p className="text-xs text-slate-500">Port {db.port}</p>
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded-md text-xs font-semibold ${db.native ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-indigo-50 border border-indigo-200 text-indigo-700'}`}>
                  {db.native ? 'Native' : 'Premium'}
                </span>
              </div>
              <p className="text-sm text-slate-500 mb-5 leading-relaxed">{db.desc}</p>
              <button 
                onClick={() => handleConnectClick(db)}
                className="connect-btn w-full py-2.5 bg-slate-900 hover:bg-slate-700 text-white text-sm font-semibold rounded-lg transition-all"
              >
                Connect
              </button>
            </div>
          ))}
        </div>

      </div>

      {/* Connection Modal Simulator */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-200 bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold text-lg">
                  {selectedDb?.label}
                </div>
                <div>
                  <h2 className="font-bold text-slate-900 text-base">Connect to {selectedDb?.name}</h2>
                  <p className="text-xs text-slate-500">Configure credentials for schema indexing</p>
                </div>
              </div>
              <button 
                onClick={() => setModalOpen(false)}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form View */}
            {connectingState === 'idle' && (
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">Host / Endpoint</label>
                    <input 
                      type="text" 
                      value={host}
                      onChange={(e) => setHost(e.target.value)}
                      className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="db.example.com" 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">Port</label>
                    <input 
                      type="text" 
                      value={port}
                      onChange={(e) => setPort(e.target.value)}
                      className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Database Name</label>
                  <input 
                    type="text" 
                    className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="production_db" 
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">Username</label>
                    <input 
                      type="text" 
                      className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="slayql_user" 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">Password</label>
                    <input 
                      type="password" 
                      className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="••••••••" 
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-indigo-50 border border-indigo-100">
                  <div className="flex items-center gap-2 text-xs text-indigo-700">
                    <Lock className="w-3.5 h-3.5" />
                    <span>Connection encrypted via TLS 1.3</span>
                  </div>
                  <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                    <input type="checkbox" className="rounded border-slate-300 text-indigo-600" defaultChecked /> SSL
                  </label>
                </div>
                <div className="pt-2 flex gap-3">
                  <button 
                    onClick={handleTestAndConnect}
                    className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl transition-all shadow-md shadow-indigo-100"
                  >
                    Test & Connect
                  </button>
                  <button 
                    onClick={() => setModalOpen(false)}
                    className="px-5 py-3 border border-slate-200 text-slate-700 text-sm font-medium rounded-xl hover:bg-slate-50 transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Connecting State */}
            {connectingState === 'connecting' && (
              <div className="p-8 text-center">
                <div className="mx-auto w-12 h-12 rounded-full border-4 border-indigo-100 border-t-indigo-600 animate-spin mb-5"></div>
                <h3 className="font-semibold text-slate-900 mb-1">Establishing Connection…</h3>
                <p className="text-sm text-slate-500">Connecting database host {host}...</p>
                <div className="mt-5 space-y-2 text-left max-w-xs mx-auto">
                  {steps.map((step, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-xs">
                      <div className={`w-2.5 h-2.5 rounded-full ${idx < currentStepIndex ? 'bg-emerald-500' : idx === currentStepIndex ? 'bg-indigo-500 animate-pulse' : 'bg-slate-200'}`}></div>
                      <span className={idx === currentStepIndex ? 'text-indigo-600 font-semibold' : idx < currentStepIndex ? 'text-slate-800' : 'text-slate-400'}>
                        {step}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Success State */}
            {connectingState === 'success' && (
              <div className="p-8 text-center">
                <div className="w-16 h-16 mx-auto rounded-full bg-emerald-100 border-2 border-emerald-300 flex items-center justify-center mb-5">
                  <Check className="w-7 h-7 text-emerald-600" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-1">Connection Successful!</h3>
                <p className="text-sm text-slate-500 mb-5">
                  <span className="font-medium text-slate-700">{selectedDb?.name}</span> is now connected and catalog schema has been indexed.
                </p>
                <div className="grid grid-cols-3 gap-3 mb-6">
                  <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-center">
                    <div className="text-xl font-bold text-emerald-700">48</div>
                    <div className="text-xs text-emerald-600">Tables</div>
                  </div>
                  <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-center">
                    <div className="text-xl font-bold text-blue-700">312</div>
                    <div className="text-xs text-blue-600">Columns</div>
                  </div>
                  <div className="p-3 rounded-lg bg-indigo-50 border border-indigo-200 text-center">
                    <div className="text-xl font-bold text-indigo-700">23</div>
                    <div className="text-xs text-indigo-600">Relations</div>
                  </div>
                </div>
                <button 
                  onClick={() => setModalOpen(false)}
                  className="w-full py-3 bg-slate-900 hover:bg-slate-700 text-white text-sm font-bold rounded-xl transition-all"
                >
                  Close Modal
                </button>
              </div>
            )}

          </div>
        </div>
      )}
    </section>
  );
}
