import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, ShieldCheck, Users } from 'lucide-react';
import { fetchMembers, updateMemberRole } from '../services/api';

const ROLE_HELP = {
  owner: 'Manages who has access, plus everything an analyst can do',
  analyst: 'Approves business definitions and works the review queue',
  viewer: 'Asks questions, flags answers and builds reports',
};

/** Who is in the organisation and what they may do. Owners can change roles. */
export default function TeamAccessPanel({ accessRole }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const canView = accessRole === 'owner' || accessRole === 'analyst';

  const load = useCallback(async () => {
    if (!canView) return;
    try {
      setData(await fetchMembers());
    } catch (err) {
      setError(err.message);
    }
  }, [canView]);

  useEffect(() => { load(); }, [load]);

  const change = async (userId, role) => {
    setBusy(userId);
    setError('');
    try {
      await updateMemberRole(userId, role);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  };

  return (
    <section className="mt-8 pt-8 border-t border-slate-200">
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center"><Users className="w-5 h-5" /></span>
        <div>
          <h2 className="text-sm font-bold text-slate-900">Team and access</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Your access: <b className="capitalize">{accessRole || 'viewer'}</b>. {ROLE_HELP[accessRole || 'viewer']}.
          </p>
        </div>
      </div>

      {!canView ? (
        <p className="mt-4 text-xs text-slate-600">Ask an owner of your organisation if you need analyst access.</p>
      ) : !data ? (
        <p className="mt-4 flex items-center gap-2 text-xs text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading members...</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-slate-500 border-b border-slate-200">
                <th className="py-2 pr-3 font-semibold">Name</th>
                <th className="py-2 pr-3 font-semibold">Email</th>
                <th className="py-2 pr-3 font-semibold">Title</th>
                <th className="py-2 font-semibold">Access</th>
              </tr>
            </thead>
            <tbody>
              {data.members.map((member) => (
                <tr key={member.user_id} className="border-b border-slate-100">
                  <td className="py-2 pr-3 font-semibold text-slate-800">{member.name}</td>
                  <td className="py-2 pr-3 text-slate-600">{member.email}</td>
                  <td className="py-2 pr-3 text-slate-500">{member.title}</td>
                  <td className="py-2">
                    {accessRole === 'owner' ? (
                      <span className="inline-flex items-center gap-2">
                        <select
                          value={member.access_role}
                          disabled={Boolean(busy)}
                          onChange={(e) => change(member.user_id, e.target.value)}
                          aria-label={`Access for ${member.name}`}
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
                        >
                          <option value="owner">Owner</option>
                          <option value="analyst">Analyst</option>
                          <option value="viewer">Viewer</option>
                        </select>
                        {busy === member.user_id && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 capitalize text-slate-700">
                        {member.access_role !== 'viewer' && <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />}{member.access_role}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-[11px] text-slate-500">
            New colleagues join as viewers when they first sign in with their work email. An organisation always keeps at least one owner.
          </p>
        </div>
      )}
      {error && <p className="mt-3 text-xs text-rose-600">{error}</p>}
    </section>
  );
}
