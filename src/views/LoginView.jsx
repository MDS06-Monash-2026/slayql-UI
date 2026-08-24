import React, { useState } from 'react';
import {
  Building2,
  Mail,
  Shield,
  ArrowRight,
  Sparkles,
  Lock,
  CheckCircle2,
  ChevronRight,
  Zap,
  UserCheck,
  Globe,
  Loader2,
  ArrowLeft,
} from 'lucide-react';
import { loginOrganization } from '../services/api';

export default function LoginView({ setView, onLoginSuccess }) {
  const [email, setEmail] = useState('');
  const [orgName, setOrgName] = useState('');
  const [role, setRole] = useState('Data Architect');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

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

  const handleEmailSignIn = async (e) => {
    e.preventDefault();
    if (!email.trim() || !email.includes('@')) {
      setError('Please enter a valid organization work email.');
      return;
    }
    setIsLoading(true);
    setError(null);

    try {
      const session = await loginOrganization({
        email: email.trim(),
        organization_name: detectedOrg,
        role,
        is_reviewer: false,
      });
      if (onLoginSuccess) onLoginSuccess(session);
      setView('demo');
    } catch (err) {
      setError(err.message || 'Sign in failed.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReviewerSignIn = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const session = await loginOrganization({
        is_reviewer: true,
      });
      if (onLoginSuccess) onLoginSuccess(session);
      setView('demo');
    } catch (err) {
      setError(err.message || 'Reviewer sign in failed.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between relative overflow-hidden text-slate-900">
      {/* Background Ambience */}
      <div className="hero-grid-bg absolute inset-0 pointer-events-none opacity-40" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-gradient-to-b from-indigo-100/60 via-blue-50/40 to-transparent rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <header className="relative z-10 px-6 py-6 max-w-7xl mx-auto w-full flex items-center justify-between">
        <button
          onClick={() => setView('landing')}
          className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 text-xs font-semibold px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 shadow-sm transition-all"
        >
          <ArrowLeft className="w-4 h-4 text-slate-500" />
          <span>Back to Landing</span>
        </button>

        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span className="text-[11px] font-medium text-slate-500">SOC 2 Type II Isolated Environment</span>
        </div>
      </header>

      {/* Main Form Center */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-4 sm:px-6 py-8">
        <div className="max-w-md w-full space-y-6">
          {/* Brand Header */}
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl overflow-hidden shadow-md mx-auto mb-3">
              <img src="/SlayQLlogo.png" alt="SlayQL Logo" className="w-full h-full object-contain" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
              Sign In to Your Workspace
            </h1>
            <p className="text-xs sm:text-sm text-slate-500">
              Access the live SlayQL cognitive engine and schema explorer.
            </p>
          </div>

          {/* Login Card */}
          <div className="bg-white border border-slate-200/90 rounded-3xl shadow-xl shadow-slate-200/50 p-6 sm:p-8 space-y-6">
            {error && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center justify-between">
                <span>{error}</span>
                <button onClick={() => setError(null)} className="text-red-700 font-bold hover:underline">
                  ✕
                </button>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleEmailSignIn} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Work Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    required
                    disabled={isLoading}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                  />
                </div>
              </div>

              {detectedOrg && (
                <div className="p-3 rounded-xl bg-indigo-50/70 border border-indigo-100 flex items-center justify-between slide-in-up">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-indigo-600" />
                    <div>
                      <p className="text-[10px] uppercase font-bold text-indigo-600">Workspace</p>
                      <p className="text-xs font-bold text-slate-800">{detectedOrg}</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    Auto-matched
                  </span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Your Role
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  disabled={isLoading}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                >
                  <option value="Lead Data Architect">Lead Data Architect</option>
                  <option value="VP of Engineering">VP of Engineering</option>
                  <option value="Senior Data Analyst">Senior Data Analyst</option>
                  <option value="Product Manager">Product Manager / Business User</option>
                  <option value="Workspace Owner">Workspace Owner</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={isLoading || !email.trim()}
                className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-200 transition-all"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <span>Continue with Organization Email</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            {/* Divider */}
            <div className="relative flex items-center justify-center">
              <div className="border-t border-slate-200 w-full" />
              <span className="bg-white px-3 text-[10px] uppercase font-bold text-slate-400 absolute">
                OR
              </span>
            </div>

            {/* One-Click Reviewer Access Card */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-amber-500" />
                    <h3 className="text-xs font-bold text-slate-900">Instant Reviewer Access</h3>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Single-click demo login with pre-configured tenant & data.
                  </p>
                </div>
                <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                  1-Click
                </span>
              </div>

              <button
                type="button"
                onClick={handleReviewerSignIn}
                disabled={isLoading}
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-md transition-all"
              >
                <UserCheck className="w-4 h-4 text-indigo-400" />
                <span>Enter Reviewer Demo Workspace</span>
              </button>
            </div>
          </div>

          {/* Footer Security Badges */}
          <div className="flex items-center justify-center gap-4 text-[11px] text-slate-400">
            <div className="flex items-center gap-1">
              <Lock className="w-3.5 h-3.5 text-emerald-600" />
              <span>TLS 1.3 KMS Encryption</span>
            </div>
            <span>•</span>
            <div className="flex items-center gap-1">
              <Shield className="w-3.5 h-3.5 text-indigo-600" />
              <span>Read-Only Sandbox</span>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 py-4 text-center text-[11px] text-slate-400 border-t border-slate-200/60 bg-white/50">
        © 2026 SlayQL AI. All rights reserved. Enterprise terms and privacy policies apply.
      </footer>
    </div>
  );
}
