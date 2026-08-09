import React from 'react';
import { Sparkles, User, Zap } from 'lucide-react';
import QueryInputPanel from './QueryInputPanel';
import ReasoningTrace from './ReasoningTrace';
import SqlResultPanel from './SqlResultPanel';
import { SSE_STEPS } from '../../mock/mockData';
import { formatRelativeTime } from '../../lib/api/history';

function ChatBubble({ role, content, isSlayQL = false }) {
  return (
    <div className="flex items-start gap-4 py-4 animate-fade-in-up">
      {/* Avatar */}
      <div className={[
        'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white',
        isSlayQL ? 'bg-gradient-to-br from-indigo-500 to-blue-600' : 'bg-slate-300'
      ].join(' ')}>
        {isSlayQL ? <Zap className="w-4 h-4" /> : <User className="w-4 h-4" />}
      </div>
      
      {/* Message */}
      <div className="flex-1 min-w-0 pt-1">
        <p className="text-sm font-semibold text-slate-800 mb-1">
          {isSlayQL ? 'SlayQL' : 'You'}
        </p>
        <div className="text-sm text-slate-700 leading-relaxed font-medium">
          {content}
        </div>
      </div>
    </div>
  );
}

export default function WorkspaceHome({
  userName = 'Jane',
  dbStatus,
  queryInput,
  setQueryInput,
  submittedPrompt,
  queryState,
  currentDataset,
  currentStepIndex,
  traceVisible,
  traceComplete,
  handleSubmit,
  handleClear,
  handleExecute,
  handleRegenerate,
  onManageDatabases,
  setActiveDatabase,
}) {
  const isIdle = queryState === 'idle';
  const isGenerating = queryState === 'generating';
  const isResultsReady = queryState === 'generated' || queryState === 'executing' || queryState === 'success' || queryState === 'error';

  return (
    <div className="flex flex-col h-full bg-slate-50 relative">
      
      {/* ── Main Scrollable Area ───────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto pb-32">
        
        {/* ── State 1: Idle (Minimal Welcome) ── */}
        {isIdle && (
          <div className="h-full flex flex-col items-center justify-center animate-fade-in-up px-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-100 flex items-center justify-center mb-6">
               <Zap className="w-6 h-6 text-indigo-600" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 mb-2">
              Ask your database anything.
            </h1>
            <p className="text-sm text-slate-500 max-w-sm text-center mb-8">
              Turn natural language into SQL and explore your data effortlessly.
            </p>
            
            <div className="w-full">
              <QueryInputPanel
                value={queryInput}
                onChange={setQueryInput}
                onSubmit={handleSubmit}
                queryState={queryState}
                dbStatus={dbStatus}
                onManageDatabases={onManageDatabases}
                setActiveDatabase={setActiveDatabase}
              />
            </div>
          </div>
        )}

        {/* ── State 2 & 3: Chat / Split Screen ── */}
        {!isIdle && (
          <div className={[
            'w-full max-w-[1400px] mx-auto px-4 sm:px-6 py-8',
            isResultsReady ? 'grid grid-cols-1 lg:grid-cols-12 gap-8' : 'max-w-3xl'
          ].join(' ')}>
            
            {/* Left Column: Conversation */}
            <div className={[
              'space-y-6',
              isResultsReady ? 'lg:col-span-5 xl:col-span-4' : 'w-full'
            ].join(' ')}>
              
              {/* User Prompt */}
              {submittedPrompt && (
                <ChatBubble role="user" content={submittedPrompt} />
              )}

              {/* SlayQL Reasoning */}
              {traceVisible && (
                <div className="flex items-start gap-4 animate-fade-in-up">
                   <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center text-white">
                     <Zap className="w-4 h-4" />
                   </div>
                   <div className="flex-1 min-w-0 pt-1">
                     <p className="text-sm font-semibold text-slate-800 mb-2">SlayQL</p>
                     
                     <ReasoningTrace
                       steps={SSE_STEPS}
                       currentStepIndex={currentStepIndex}
                       dataset={currentDataset}
                       isDone={traceComplete}
                     />

                     {traceComplete && currentDataset?.sql && (
                       <p className="mt-4 text-sm text-slate-600">
                         I generated a query to answer your question. See the results panel for the SQL and data.
                       </p>
                     )}
                   </div>
                </div>
              )}
            </div>

            {/* Right Column: SQL & Results (Only shown when ready) */}
            {isResultsReady && currentDataset && (
              <div className="lg:col-span-7 xl:col-span-8 space-y-6">
                <SqlResultPanel
                  dataset={currentDataset}
                  queryState={queryState}
                  onExecute={handleExecute}
                  onRegenerate={handleRegenerate}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Fixed Bottom Input Area (Only when not idle) ───────────────────── */}
      {!isIdle && (
        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-slate-50 via-slate-50 to-transparent pt-10 pb-6 px-4">
          <QueryInputPanel
            value={queryInput}
            onChange={setQueryInput}
            onSubmit={handleSubmit}
            queryState={queryState}
            dbStatus={dbStatus}
            onManageDatabases={onManageDatabases}
            setActiveDatabase={setActiveDatabase}
          />
        </div>
      )}
      
    </div>
  );
}
