import React, { useState } from 'react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { ShieldCheck, Server, Key, ArrowRight, ArrowLeft, Loader2, Database } from 'lucide-react';

export default function OnboardingView({ setView, onDatabaseConnect }) {
  const [step, setStep] = useState(1);
  const [orgName, setOrgName] = useState('');
  const [region, setRegion] = useState('aws-us-east-1');
  const [dbType, setDbType] = useState('PostgreSQL');
  const [host, setHost] = useState('');
  const [username, setUsername] = useState('');
  const [indexing, setIndexing] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleNextStep = () => {
    if (step === 1 && !orgName.trim()) {
      alert('Please enter your organization name.');
      return;
    }
    if (step === 2 && !host.trim()) {
      alert('Please enter your database host endpoint.');
      return;
    }
    setStep(step + 1);
  };

  const handlePrevStep = () => {
    setStep(step - 1);
  };

  const startClusterIndexing = () => {
    setIndexing(true);
    setProgress(0);

    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(() => {
            setIndexing(false);
            if (onDatabaseConnect) onDatabaseConnect(dbType);
            setView('dashboard');
          }, 600);
          return 100;
        }
        return prev + 10;
      });
    }, 250);
  };

  return (
    <div class="min-h-screen bg-slate-50 flex flex-col justify-between pt-16">
      <Navbar setView={setView} currentView="onboarding" />

      <main class="flex-1 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div class="max-w-xl w-full bg-white rounded-2xl border border-slate-200 shadow-xl p-8 space-y-6">
          
          {/* Steps Breadcrumb */}
          <div class="flex items-center justify-between pb-4 border-b border-slate-100">
            {[1, 2, 3].map((s) => (
              <div key={s} class="flex items-center gap-2">
                <div class={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${step === s ? 'bg-indigo-600 text-white' : step > s ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                  {step > s ? '✓' : s}
                </div>
                <span class={`text-xs font-semibold hidden sm:inline ${step === s ? 'text-slate-900' : 'text-slate-400'}`}>
                  {s === 1 ? 'Cluster Configuration' : s === 2 ? 'Database Credentials' : 'Catalog Indexing'}
                </span>
              </div>
            ))}
          </div>

          {/* Step 1: Cluster Setup */}
          {step === 1 && (
            <div class="space-y-4">
              <div>
                <h2 class="text-xl font-bold text-slate-900">Provision Your SlayQL Cluster</h2>
                <p class="text-xs text-slate-500 mt-1">Deploy an isolated schema analyzer endpoint in your preferred cloud provider.</p>
              </div>
              <div class="space-y-3">
                <div>
                  <label class="block text-xs font-semibold text-slate-700 mb-1">Organization / Tenant Name</label>
                  <input 
                    type="text" 
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    class="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" 
                    placeholder="MyCorp Analytics" 
                  />
                </div>
                <div>
                  <label class="block text-xs font-semibold text-slate-700 mb-1">Deployment Region</label>
                  <select 
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                    class="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  >
                    <option value="aws-us-east-1">Amazon AWS — us-east-1 (N. Virginia)</option>
                    <option value="gcp-us-central1">Google Cloud Platform — us-central1 (Iowa)</option>
                    <option value="azure-westus2">Microsoft Azure — westus2 (Washington)</option>
                  </select>
                </div>
              </div>
              <div class="pt-2 flex justify-end">
                <button 
                  onClick={handleNextStep}
                  class="inline-flex items-center gap-1.5 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg shadow-md"
                >
                  <span>Next Step</span>
                  <ArrowRight class="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Database Connection */}
          {step === 2 && (
            <div class="space-y-4">
              <div>
                <h2 class="text-xl font-bold text-slate-900">Configure Database Source</h2>
                <p class="text-xs text-slate-500 mt-1">Credentials are encrypted with end-to-end KMS. Write access is not required.</p>
              </div>
              <div class="space-y-3">
                <div>
                  <label class="block text-xs font-semibold text-slate-700 mb-1">Database Engine</label>
                  <select 
                    value={dbType}
                    onChange={(e) => setDbType(e.target.value)}
                    class="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  >
                    <option value="PostgreSQL">PostgreSQL (v12+)</option>
                    <option value="MySQL">MySQL (v8.0+)</option>
                    <option value="Snowflake">Snowflake Data Cloud</option>
                    <option value="Oracle">Oracle Database</option>
                  </select>
                </div>
                <div>
                  <label class="block text-xs font-semibold text-slate-700 mb-1">Host Endpoint Address</label>
                  <input 
                    type="text" 
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
                    class="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" 
                    placeholder="db.mycorp.internal" 
                  />
                </div>
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="block text-xs font-semibold text-slate-700 mb-1">Username</label>
                    <input 
                      type="text" 
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      class="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" 
                      placeholder="slayql_read" 
                    />
                  </div>
                  <div>
                    <label class="block text-xs font-semibold text-slate-700 mb-1">Password</label>
                    <input 
                      type="password" 
                      class="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" 
                      placeholder="••••••••" 
                    />
                  </div>
                </div>
              </div>
              <div class="pt-2 flex justify-between">
                <button 
                  onClick={handlePrevStep}
                  class="inline-flex items-center gap-1.5 px-4 py-2.5 border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50"
                >
                  <ArrowLeft class="w-4 h-4" />
                  <span>Back</span>
                </button>
                <button 
                  onClick={handleNextStep}
                  class="inline-flex items-center gap-1.5 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg shadow-md"
                >
                  <span>Next Step</span>
                  <ArrowRight class="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Indexing */}
          {step === 3 && (
            <div class="space-y-4">
              <div>
                <h2 class="text-xl font-bold text-slate-900">Initialize Schema Indexing</h2>
                <p class="text-xs text-slate-500 mt-1">We will scan tables, foreign keys, constraints, and business glossary labels.</p>
              </div>

              {!indexing ? (
                <div class="space-y-4">
                  <div class="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
                    <div class="flex items-center justify-between text-xs text-slate-600">
                      <span>Deployment Host:</span>
                      <span class="font-mono font-semibold">{host}</span>
                    </div>
                    <div class="flex items-center justify-between text-xs text-slate-600">
                      <span>Cluster Region:</span>
                      <span class="font-semibold uppercase">{region}</span>
                    </div>
                    <div class="flex items-center justify-between text-xs text-slate-600">
                      <span>Database Engine:</span>
                      <span class="font-semibold">{dbType}</span>
                    </div>
                  </div>
                  <div class="pt-2 flex justify-between">
                    <button 
                      onClick={handlePrevStep}
                      class="inline-flex items-center gap-1.5 px-4 py-2.5 border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50"
                    >
                      <ArrowLeft class="w-4 h-4" />
                      <span>Back</span>
                    </button>
                    <button 
                      onClick={startClusterIndexing}
                      class="inline-flex items-center gap-1.5 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg shadow-md"
                    >
                      <Database class="w-4 h-4" />
                      <span>Initialize Cluster</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div class="text-center py-6 space-y-4">
                  <Loader2 class="w-10 h-10 text-indigo-600 animate-spin mx-auto" />
                  <div>
                    <h4 class="text-sm font-bold text-slate-800">Scaffolding query nodes...</h4>
                    <p class="text-xs text-slate-400 mt-0.5">Indexing catalog keys ({progress}%)</p>
                  </div>
                  <div class="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div class="bg-indigo-600 h-2 transition-all duration-300" style={{ width: `${progress}%` }}></div>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </main>

      <Footer setView={setView} />
    </div>
  );
}
