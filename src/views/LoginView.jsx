import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Loader2, X } from 'lucide-react';
import {
  loginOrganization,
  requestPasswordReset,
  fetchConversations,
  fetchConnections,
  fetchModels,
  fetchCatalog,
  fetchExploreSuggestions,
  fetchCredits,
} from '../services/api';

export default function LoginView({ setView, onLoginSuccess }) {
  const [email, setEmail] = useState('');
  const [orgName, setOrgName] = useState('');
  const [role, setRole] = useState('Finance / Accounts');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState('');
  const [error, setError] = useState(null);
  const [resetNotice, setResetNotice] = useState('');
  const [resetBusy, setResetBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const sendResetLink = async () => {
    setError(null);
    setResetNotice('');
    if (!email.trim() || !email.includes('@')) {
      setError('Enter your email above, then choose "Forgot password?".');
      return;
    }
    setResetBusy(true);
    try {
      const reply = await requestPasswordReset(email.trim());
      setResetNotice(reply.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setResetBusy(false);
    }
  };

  // Auto-detect organization domain from email
  const getDetectedOrg = () => {
    if (orgName.trim()) return orgName.trim();
    if (email.includes('@')) {
      const domainPart = email.split('@')[1];
      if (domainPart && domainPart.includes('.')) {
        const orgSlug = domainPart.split('.')[0];
        return `${orgSlug.charAt(0).toUpperCase() + orgSlug.slice(1)} Analytics`;
      }
    }
    return '';
  };

  const detectedOrg = getDetectedOrg();

  const performWarmup = async (session) => {
    setLoadingStage('Authenticating session credentials...');
    await new Promise((r) => setTimeout(r, 200));

    setLoadingStage('Loading recent chats & workspace state...');
    const [conversations, connections] = await Promise.all([
      fetchConversations({ force: true }).catch(() => []),
      fetchConnections({ force: true }).catch(() => []),
      fetchModels().catch(() => ({ models: [] })),
      fetchCredits().catch(() => ({ credits: 0 })),
    ]);

    setLoadingStage('Connecting database schema catalogs...');
    const defaultConn = connections.find((c) => c.is_default) || connections[0];
    if (defaultConn?.id) {
      await Promise.all([
        fetchCatalog(defaultConn.id, { force: true }).catch(() => null),
        fetchExploreSuggestions(defaultConn.id, { force: true }).catch(() => ({ suggestions: [] })),
      ]);
    }

    setLoadingStage('Launching AI workspace...');
    await new Promise((r) => setTimeout(r, 250));
  };

  const handleEmailSignIn = async (e) => {
    e.preventDefault();
    if (!email.trim() || !email.includes('@')) {
      setError('Please enter a valid organization work email.');
      return;
    }
    setIsLoading(true);
    setError(null);
    setLoadingStage('Connecting to SlayQL engine...');

    try {
      const session = await loginOrganization({
        email: email.trim(),
        organization_name: detectedOrg,
        password,
        role,
        is_reviewer: false,
      });
      await performWarmup(session);
      if (onLoginSuccess) onLoginSuccess(session);
      setView('demo');
    } catch (err) {
      setError(err.message || 'Sign in failed.');
    } finally {
      setIsLoading(false);
      setLoadingStage('');
    }
  };

  const handleReviewerSignIn = async () => {
    setIsLoading(true);
    setError(null);
    setLoadingStage('Authenticating reviewer access...');

    try {
      const session = await loginOrganization({
        is_reviewer: true,
      });
      await performWarmup(session);
      if (onLoginSuccess) onLoginSuccess(session);
      setView('demo');
    } catch (err) {
      setError(err.message || 'Reviewer sign in failed.');
    } finally {
      setIsLoading(false);
      setLoadingStage('');
    }
  };

  return (
    <div className="flex min-h-[100dvh] bg-white text-slate-900">
      {/* Left: the campus image and what SlayQL does (a slim banner on small screens) */}
      <aside className="relative hidden w-[46%] overflow-hidden lg:block">
        <img src="/landing/hero-section.webp" alt="" className="absolute inset-0 h-full w-full object-cover object-[62%_40%]" />
        <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(180deg,rgba(15,23,42,0.05)_0%,rgba(15,23,42,0.25)_45%,rgba(30,27,75,0.88)_100%)]" />
        <div className="relative flex h-full flex-col justify-between p-10 text-white">
          <button
            type="button"
            onClick={() => setView('landing')}
            className="inline-flex w-fit items-center gap-2 rounded-xl bg-white/85 px-3.5 py-2 text-sm font-semibold text-slate-800 shadow-sm backdrop-blur transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to home
          </button>
          <div>
            <p className="text-4xl font-semibold leading-tight tracking-[-0.03em] text-balance">Ask your data anything. Know when to trust it.</p>
            <ul className="mt-8 space-y-3 text-base text-indigo-50">
              {['Every answer checked against your data', 'Asks when a question has two meanings', 'Read-only: nothing is written back'].map((t) => (
                <li key={t} className="flex items-center gap-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-400/90 text-slate-900"><Check className="h-3.5 w-3.5" aria-hidden="true" /></span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </aside>

      {/* Right: demo access and sign-in */}
      <main className="flex flex-1 flex-col">
        <div className="relative h-40 overflow-hidden lg:hidden">
          <img src="/landing/hero-section-960.webp" alt="" className="h-full w-full object-cover object-[70%_40%]" />
          <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-white via-white/30 to-transparent" />
          <button
            type="button"
            onClick={() => setView('landing')}
            className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-xl bg-white/90 px-3 py-1.5 text-sm font-semibold text-slate-800 shadow-sm"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
          </button>
        </div>

        <div className="flex flex-1 items-center justify-center px-5 py-10 sm:px-10">
          <div className="w-full max-w-md">
            <div className="flex items-center gap-3">
              <img src="/SlayQLlogo.png" alt="" className="h-11 w-11 rounded-xl object-contain shadow-sm" />
              <span className="slayql-logo text-2xl tracking-tight"><span className="slay">Slay</span><span className="ql">QL</span></span>
            </div>
            <h1 className="mt-8 text-3xl font-semibold tracking-[-0.03em] text-slate-950 sm:text-4xl">Try SlayQL</h1>
            <p className="mt-2 text-slate-600">Open the demo workspace, or sign in with your work email.</p>

            {isLoading && (
              <div className="mt-6 rounded-2xl border border-indigo-100 bg-indigo-50/80 p-4" role="status" aria-live="polite">
                <div className="flex items-center gap-3">
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-indigo-600" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-indigo-950">Preparing your workspace</p>
                    <p className="truncate text-xs text-indigo-700">{loadingStage || 'Starting...'}</p>
                  </div>
                </div>
                <div className="mt-3 h-1 overflow-hidden rounded-full bg-indigo-100">
                  <div className="h-full w-1/2 animate-[login-progress_1.4s_ease-in-out_infinite] rounded-full bg-indigo-600" />
                </div>
              </div>
            )}

            {error && (
              <div className="mt-6 flex items-start justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-3.5 text-sm text-rose-800" role="alert">
                <span>{error}</span>
                <button type="button" onClick={() => setError(null)} aria-label="Dismiss" className="shrink-0 rounded-md p-0.5 text-rose-700 hover:bg-rose-100">
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            )}

            {/* Primary: the demo workspace */}
            <button
              type="button"
              onClick={handleReviewerSignIn}
              disabled={isLoading}
              className="group mt-8 flex w-full items-center justify-between gap-4 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 p-5 text-left text-white shadow-[0_18px_40px_-18px_rgba(79,70,229,0.8)] transition hover:brightness-110 active:scale-[0.99] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
            >
              <span>
                <span className="block text-base font-semibold">Open the demo workspace</span>
                <span className="mt-0.5 block text-sm text-indigo-100">Sample data, nothing to set up</span>
              </span>
              <ArrowRight className="h-5 w-5 shrink-0 transition-transform group-hover:translate-x-1" aria-hidden="true" />
            </button>

            <div className="my-8 flex items-center gap-4 text-xs font-medium text-slate-400">
              <span className="h-px flex-1 bg-slate-200" />
              or sign in
              <span className="h-px flex-1 bg-slate-200" />
            </div>

            <form onSubmit={handleEmailSignIn} className="space-y-5">
              <div>
                <label htmlFor="login-email" className="block text-sm font-medium text-slate-800">Work email</label>
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  autoComplete="email"
                  required
                  disabled={isLoading}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder-slate-400 transition focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/15"
                />
                {detectedOrg && (
                  <p className="mt-2 text-xs text-slate-500">Workspace: <span className="font-semibold text-slate-800">{detectedOrg}</span></p>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label htmlFor="login-password" className="block text-sm font-medium text-slate-800">Password</label>
                  <button type="button" onClick={sendResetLink} disabled={resetBusy || isLoading} className="text-xs font-semibold text-indigo-600 hover:underline disabled:opacity-50">
                    {resetBusy ? 'Sending...' : 'Forgot password?'}
                  </button>
                </div>
                <div className="relative mt-1.5">
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    autoComplete="current-password"
                    minLength={8}
                    required
                    disabled={isLoading}
                    className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-4 pr-16 text-sm text-slate-900 placeholder-slate-400 transition focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/15"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                <p className="mt-1.5 text-xs text-slate-500">First time? The password you enter becomes yours.</p>
                {resetNotice && <p className="mt-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-800" role="status">{resetNotice}</p>}
              </div>

              <div>
                <label htmlFor="login-role" className="block text-sm font-medium text-slate-800">Job title</label>
                <select
                  id="login-role"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  disabled={isLoading}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 transition focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/15"
                >
                  <option value="Finance / Accounts">Finance / Accounts</option>
                  <option value="Senior Data Analyst">Data analyst</option>
                  <option value="Product Manager">Manager / business user</option>
                  <option value="Lead Data Architect">Data architect</option>
                  <option value="VP of Engineering">Engineering lead</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={isLoading || !email.trim() || password.length < 8}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-slate-800 active:scale-[0.99] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <>Sign in <ArrowRight className="h-4 w-4" aria-hidden="true" /></>}
              </button>
            </form>

            <p className="mt-8 text-xs leading-relaxed text-slate-500">
              The first person from an organisation becomes its owner and can give analysts access. Connections are read-only.
            </p>
          </div>
        </div>

        <footer className="px-5 pb-6 text-center text-xs text-slate-400 sm:px-10">© 2026 SlayQL. Monash University Malaysia Final Year Project.</footer>
      </main>
    </div>
  );
}
