import React from 'react';
import TrustBadge from './TrustBadge';
import EvidencePanel from './EvidencePanel';
import ClarifyOptions from './ClarifyOptions';

// Outcome, evidence and (for ambiguous questions) the interpretations to choose from.
export default function TrustPanel({ verification, dataSent, runId, isDark = false }) {
  if (!verification) return null;
  const approved = Boolean(verification.verified_query || (verification.definitions_used || []).length);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <TrustBadge
          outcome={verification.outcome}
          probability={verification.probability}
          threshold={verification.threshold}
          approved={approved}
          isDark={isDark}
        />
      </div>
      {verification.outcome === 'clarify' && (
        <ClarifyOptions runId={runId} options={verification.clarify_options || []} isDark={isDark} />
      )}
      <EvidencePanel
        verification={verification}
        dataSent={dataSent}
        isDark={isDark}
        defaultOpen={verification.outcome === 'handoff' || verification.outcome === 'caveat'}
      />
    </div>
  );
}
