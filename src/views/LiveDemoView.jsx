import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Sparkles,
  Database,
  Layers,
  Table2,
  BarChart3,
  Bookmark,
  ChevronDown,
  Plus,
  MessageSquare,
  Paperclip,
  Moon,
  Sun,
  PanelLeftClose,
  PanelLeftOpen,
  ArrowUp,
  XCircle,
  Trash2,
  Coins,
  UserRound,
  LogOut,
  Loader2,
  Flag,
  Check,
} from 'lucide-react';

import ModelSelector from '../components/demo/ModelSelector';
import SlayQLTraceTimeline from '../components/demo/SlayQLTraceTimeline';
import AgentStreamPanel, { normalizeStreamEvent } from '../components/demo/AgentStreamPanel';
import SqlEditorPanel from '../components/demo/SqlEditorPanel';
import VisualizationStudio from '../components/demo/VisualizationStudio';
import DataTablePanel from '../components/demo/DataTablePanel';
import CatalogDrawer from '../components/demo/CatalogDrawer';
import SavedQueriesDrawer from '../components/demo/SavedQueriesDrawer';
import AddConnectionModal from '../components/demo/AddConnectionModal';
import AddTableModal from '../components/demo/AddTableModal';
import ConfirmationModal from '../components/demo/ConfirmationModal';

import {
  fetchModels,
  fetchConnections,
  fetchCatalog,
  fetchExploreSuggestions,
  createAgentRun,
  cancelAgentRun,
  executeCustomSql,
  fetchSavedQueries,
  saveQuery,
  fetchConversations,
  fetchConversation,
  deleteConversation,
  reportChatMessage,
} from '../services/api';
import { connectRunEventStream } from '../services/sse';

function ConversationAssistantMessage({ message, isDark = false }) {
  const payload = message.payload || {};
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  const columns = Array.isArray(payload.columns) ? payload.columns : [];
  const [reportState, setReportState] = useState('idle');

  const handleReport = async () => {
    if (!message.id || reportState === 'sending' || reportState === 'reported') return;
    setReportState('sending');
    try {
      await reportChatMessage(message.id);
      setReportState('reported');
    } catch (error) {
      setReportState('error');
    }
  };

  return (
    <div className="flex items-start gap-3 py-3">
      <div className="w-9 h-9 rounded-lg overflow-hidden flex items-center justify-center flex-shrink-0">
        <img src="/SlayQLlogo.png" alt="SlayQL" className="w-full h-full object-contain" />
      </div>
      <div className="min-w-0 flex-1 space-y-3">
        <p className="text-xs font-semibold text-slate-800">SlayQL</p>
        <p className="text-sm leading-relaxed text-slate-700 whitespace-pre-wrap">{message.content}</p>
        {payload.reasoning && (
          <details className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
            <summary className="cursor-pointer font-semibold text-slate-600">Reasoning output</summary>
            <p className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap leading-relaxed text-slate-500">{payload.reasoning}</p>
          </details>
        )}
        <AgentStreamPanel events={payload.stream_events || []} />
        {message.sql && (
          <pre className="max-h-64 overflow-auto rounded-lg bg-slate-950 p-3 text-xs leading-relaxed text-slate-100 font-mono whitespace-pre-wrap">
            <code>{message.sql}</code>
          </pre>
        )}
        {payload.chart && rows.length > 0 && (
          <VisualizationStudio
            rows={rows}
            columns={columns}
            columnTypes={Array.isArray(payload.column_types) ? payload.column_types : []}
            chartRecommendation={payload.chart}
            recommendation={payload.chart}
            isLoading={false}
            isDark={isDark}
          />
        )}
        {columns.length > 0 && (
          <div className="overflow-auto rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-50 text-slate-500">
                <tr>{columns.map((column) => <th key={column} className="px-3 py-2 text-left font-semibold whitespace-nowrap">{column}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {rows.slice(0, 8).map((row, rowIndex) => (
                  <tr key={rowIndex}>{columns.map((column, columnIndex) => <td key={`${column}-${columnIndex}`} className="px-3 py-2 whitespace-nowrap">{String(row[columnIndex] ?? '')}</td>)}</tr>
                ))}
              </tbody>
            </table>
            <div className="border-t border-slate-100 px-3 py-1.5 text-[10px] text-slate-400">
              {payload.row_count ?? rows.length} rows{payload.is_truncated ? ' (limited)' : ''}
            </div>
          </div>
        )}
        {payload.reportable !== false && (
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleReport}
              disabled={reportState === 'sending' || reportState === 'reported'}
              title="Report this response"
              className={`inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium transition-colors disabled:cursor-default ${
                reportState === 'reported'
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
              }`}
            >
              {reportState === 'reported' ? <Check className="h-3.5 w-3.5" /> : <Flag className="h-3.5 w-3.5" />}
              {reportState === 'sending' ? 'Reporting...' : reportState === 'reported' ? 'Reported' : 'Report'}
            </button>
            {reportState === 'error' && (
              <span className="text-[11px] text-red-600">Could not send report. Try again.</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function LiveDemoView({ setView, session, onLogout, onSessionUpdate }) {
  // --- Infrastructure & Metadata State ---
  const [models, setModels] = useState([]);
  const [selectedModelId, setSelectedModelId] = useState('deepseek/deepseek-v4-flash');
  const [connections, setConnections] = useState([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState(null);
  const [catalog, setCatalog] = useState(null);
  const [exploreSuggestions, setExploreSuggestions] = useState([]);
  const [exploreLoading, setExploreLoading] = useState(false);
  const [savedQueries, setSavedQueries] = useState([]);
  const [historyList, setHistoryList] = useState([]);
  const [deletingHistoryId, setDeletingHistoryId] = useState(null);
  const [historyDeleteTarget, setHistoryDeleteTarget] = useState(null);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [creditBalance, setCreditBalance] = useState(session?.user?.credits ?? 0);

  // --- Layout State ---
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [savedQueriesOpen, setSavedQueriesOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [addConnectionOpen, setAddConnectionOpen] = useState(false);
  const [addTableOpen, setAddTableOpen] = useState(false);
  const [dbDropdownOpen, setDbDropdownOpen] = useState(false);
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('slayql_theme') || 'light';
    } catch {
      return 'light';
    }
  });

  const userName = session?.user?.name || 'Enterprise Reviewer';
  const userRole = session?.user?.role || 'Lead Architect';
  const avatarInitials = session?.user?.avatar_initials || 'ER';

  // --- Conversational Turns State ---
  const [messages, setMessages] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [inputPrompt, setInputPrompt] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [currentRunId, setCurrentRunId] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);

  // Active turn stream outputs
  const [activeStages, setActiveStages] = useState({});
  const [activeStageKey, setActiveStageKey] = useState(null);
  const [activeSql, setActiveSql] = useState('');
  const [activeChecks, setActiveChecks] = useState([]);
  const [activeColumns, setActiveColumns] = useState([]);
  const [activeColumnTypes, setActiveColumnTypes] = useState([]);
  const [activeRows, setActiveRows] = useState([]);
  const [activeIsTruncated, setActiveIsTruncated] = useState(false);
  const [activeExecutionTimeMs, setActiveExecutionTimeMs] = useState(0);
  const [activeChartRecommendation, setActiveChartRecommendation] = useState(null);
  const [activeTokenUsage, setActiveTokenUsage] = useState(null);
  const [activeReasoning, setActiveReasoning] = useState('');
  const [activeAnswer, setActiveAnswer] = useState('');
  const [activeStreamEvents, setActiveStreamEvents] = useState([]);
  const [activeResultTab, setActiveResultTab] = useState('chart'); // 'chart' | 'table'
  const [composerFocused, setComposerFocused] = useState(false);

  const activeStreamRef = useRef(null);
  const chatBottomRef = useRef(null);
  const composerRef = useRef(null);
  const exploreRequestRef = useRef(0);
  const catalogRequestRef = useRef(0);
  const selectedConnectionRef = useRef(selectedConnectionId);

  useEffect(() => {
    selectedConnectionRef.current = selectedConnectionId;
  }, [selectedConnectionId]);

  useEffect(() => {
    try {
      localStorage.setItem('slayql_theme', theme);
    } catch {
      // Storage can be unavailable in private or embedded contexts.
    }
  }, [theme]);

  // --- Data Fetching ---
  const loadCatalog = useCallback(async (connId) => {
    const requestId = ++catalogRequestRef.current;
    setCatalog(null);
    if (!connId) {
      return;
    }
    try {
      const cat = await fetchCatalog(connId);
      if (catalogRequestRef.current === requestId) setCatalog(cat);
    } catch (err) {
      console.warn('Catalog load error:', err);
    }
  }, []);

  const loadExploreSuggestions = useCallback(async (connId) => {
    const requestId = ++exploreRequestRef.current;
    setExploreSuggestions([]);
    if (!connId) {
      setExploreLoading(false);
      return;
    }
    setExploreLoading(true);
    try {
      const data = await fetchExploreSuggestions(connId);
      if (exploreRequestRef.current === requestId) {
        setExploreSuggestions(Array.isArray(data.suggestions) ? data.suggestions : []);
      }
    } catch (err) {
      if (exploreRequestRef.current === requestId) {
        setExploreSuggestions([]);
      }
      console.warn('Explore suggestions load error:', err);
    } finally {
      if (exploreRequestRef.current === requestId) {
        setExploreLoading(false);
      }
    }
  }, []);

  const loadConnections = useCallback(async () => {
    try {
      const conns = await fetchConnections();
      setConnections(conns);
      setSelectedConnectionId((current) => {
        if (conns.some((connection) => connection.id === current)) return current;
        return (conns.find((connection) => connection.is_default) || conns[0])?.id || null;
      });
    } catch (err) {
      console.warn('Connections load error:', err);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const hist = await fetchConversations();
      setHistoryList(hist);
    } catch (err) {
      console.warn('History load error:', err);
    }
  }, []);

  useEffect(() => {
    async function init() {
      try {
        const [modelsData, connsData, savedData] = await Promise.all([
          fetchModels(),
          fetchConnections(),
          fetchSavedQueries(),
        ]);
        setModels(modelsData);
        setConnections(connsData);
        setSavedQueries(savedData);
        if (modelsData.length > 0 && !selectedModelId) {
          setSelectedModelId(modelsData[0].id);
        }
        const defaultConnection = connsData.find((connection) => connection.is_default) || connsData[0];
        if (defaultConnection) {
          setSelectedConnectionId(defaultConnection.id);
          await Promise.all([
            loadCatalog(defaultConnection.id),
            loadExploreSuggestions(defaultConnection.id),
          ]);
        } else {
          await Promise.all([loadCatalog(null), loadExploreSuggestions(null)]);
        }
        await loadHistory();
      } catch (err) {
        console.warn('Init error:', err);
      }
    }
    init();
  }, [loadCatalog, loadExploreSuggestions, loadHistory]);

  const activeConnection = connections.find((c) => c.id === selectedConnectionId) || {
    id: null,
    name: 'No data source',
    engine: null,
    table_count: 0,
  };

  const selectedModel = models.find((m) => m.id === selectedModelId) || {
    name: 'DeepSeek V4 Flash',
    provider: 'DeepSeek',
  };

  useEffect(() => {
    // New user turns should be visible; streamed stage updates must not move
    // the reader's viewport while they inspect the current step.
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const formatHistoryDate = (value) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const now = new Date();
    return date.toDateString() === now.toDateString()
      ? date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
      : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const handleNewThread = () => {
    if (activeStreamRef.current) activeStreamRef.current.close();
    setMessages([]);
    setConversationId(null);
    setInputPrompt('');
    setIsRunning(false);
    setCurrentRunId(null);
    setErrorMessage(null);
    setActiveStages({});
    setActiveStageKey(null);
    setActiveSql('');
    setActiveChecks([]);
    setActiveColumns([]);
    setActiveColumnTypes([]);
    setActiveRows([]);
    setActiveChartRecommendation(null);
    setActiveReasoning('');
    setActiveAnswer('');
    setActiveStreamEvents([]);
    if (composerRef.current) composerRef.current.style.height = '';
  };

  const handleComposerChange = (event) => {
    setInputPrompt(event.target.value);
    event.target.style.height = 'auto';
    event.target.style.height = `${Math.min(event.target.scrollHeight, 180)}px`;
  };

  const handleDeleteHistory = async (historyItem) => {
    setDeletingHistoryId(historyItem.id);
    try {
      await deleteConversation(historyItem.id);
      setHistoryList((current) => current.filter((item) => item.id !== historyItem.id));
      if (historyItem.id === conversationId) handleNewThread();
      setHistoryDeleteTarget(null);
    } catch (err) {
      setErrorMessage(err.message || 'Failed to delete chat history.');
    } finally {
      setDeletingHistoryId(null);
    }
  };

  const loadConversationThread = useCallback(async (id) => {
    if (!id) return;
    setErrorMessage(null);
    try {
      const thread = await fetchConversation(id);
      if (activeStreamRef.current) activeStreamRef.current.close();
      setConversationId(thread.id);
      setMessages((thread.messages || []).map((message) => ({
        ...message,
        sender: message.role,
        createdAt: new Date(message.created_at),
      })));
      if (thread.selected_model_id) setSelectedModelId(thread.selected_model_id);
      if (thread.connection_id && thread.connection_id !== selectedConnectionRef.current) {
        setSelectedConnectionId(thread.connection_id);
        await Promise.all([loadCatalog(thread.connection_id), loadExploreSuggestions(thread.connection_id)]);
      }
      setCurrentRunId(null);
      setActiveStages({});
      setActiveStageKey(null);
      setActiveSql('');
      setActiveChecks([]);
      setActiveColumns([]);
      setActiveColumnTypes([]);
      setActiveRows([]);
      setActiveChartRecommendation(null);
      setActiveReasoning('');
      setActiveAnswer('');
      setActiveStreamEvents([]);
    } catch (err) {
      setErrorMessage(err.message || 'Failed to load conversation.');
    }
  }, [loadCatalog, loadExploreSuggestions]);

  // --- Send Query ---
  const handleSendQuery = useCallback(async (promptToRun) => {
    const queryText = (promptToRun || inputPrompt).trim();
    if (!queryText || isRunning) return;
    if (!selectedConnectionId) {
      setErrorMessage('Add and select a data source before running SQL generation.');
      return;
    }

    const userMsg = { id: `user_${Date.now()}`, sender: 'user', content: queryText, createdAt: new Date() };
    setMessages((prev) => [...prev, userMsg]);
    setInputPrompt('');
    if (composerRef.current) composerRef.current.style.height = '';
    setIsRunning(true);
    setErrorMessage(null);

    // Reset active stream states
    setActiveStages({});
    setActiveStageKey(null);
    setActiveSql('');
    setActiveChecks([]);
    setActiveColumns([]);
    setActiveColumnTypes([]);
    setActiveRows([]);
    setActiveChartRecommendation(null);
    setActiveTokenUsage(null);
    setActiveReasoning('');
    setActiveAnswer('');
    setActiveStreamEvents([]);
    setActiveResultTab('chart');

    try {
      const runData = await createAgentRun({
        question: queryText,
        modelId: selectedModelId,
        connectionId: selectedConnectionId,
        conversationId,
      });

      const runId = runData.run_id;
      setCurrentRunId(runId);
      setConversationId(runData.conversation_id);
      if (typeof runData.credits_remaining === 'number') {
        setCreditBalance(runData.credits_remaining);
        onSessionUpdate?.({ ...session, user: { ...session.user, credits: runData.credits_remaining } });
      }
      setHistoryList((current) => [
        {
          id: runData.conversation_id,
          prompt: queryText,
          selected_model_id: selectedModelId,
          model_id: selectedModelId,
          connection_id: selectedConnectionId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        ...current.filter((item) => item.id !== runData.conversation_id),
      ]);

      if (activeStreamRef.current) activeStreamRef.current.close();

      activeStreamRef.current = connectRunEventStream(runId, {
        onEvent: (event, eventType) => {
          const evt =
            typeof event === 'object' && event !== null
              ? event
              : typeof eventType === 'object' && eventType !== null
              ? eventType
              : { type: typeof event === 'string' ? event : eventType, payload: {} };

          const stage = evt.stage;
          const type = evt.type || eventType || (typeof event === 'string' ? event : '');
          const payload = evt.payload || {};
          setActiveStreamEvents((current) => [
            ...current,
            normalizeStreamEvent(evt, type),
          ].slice(-240));

          if (stage) {
            setActiveStageKey(stage);
            setActiveStages((prev) => ({
              ...prev,
              [stage]: {
                stage,
                status:
                  type === 'stage.started' ||
                  type === 'provider.request_started' ||
                  type === 'agent.repair_started' ||
                  type === 'intent.validator_started' ||
                  type === 'sql.semantic_validation_started' ||
                  type === 'visualization.agent_started' ||
                  type === 'execution.started'
                    ? 'in_progress'
                    : type === 'stage.completed' ||
                  type === 'sql.validation_completed' ||
                  type === 'execution.completed' ||
                  type === 'provider.completed' ||
                  type === 'intent.validator_completed' ||
                  type === 'sql.semantic_validation_completed' ||
                  type === 'visualization.agent_completed' ||
                  type === 'visualization.recommended' ||
                  type === 'visualization.not_recommended' ||
                  type === 'run.completed'
                    ? 'completed'
                    : type === 'stage.failed' || type === 'execution.failed' || type === 'run.failed'
                    ? 'failed'
                    : prev[stage]?.status === 'completed'
                    ? 'completed'
                    : 'in_progress',
                duration_ms: payload?.duration_ms ?? payload?.latency_ms ?? prev[stage]?.duration_ms,
                evidence: payload?.summary
                  ? [...(prev[stage]?.evidence || []), { ...payload, summary: payload.summary }]
                  : payload?.evidence || prev[stage]?.evidence || [],
                title: payload?.title || payload?.label || prev[stage]?.title,
              },
            }));
          }

          if (type === 'provider.usage_finalized' && payload?.usage) {
            setActiveTokenUsage(payload.usage);
          } else if (type === 'provider.completed' && payload?.token_usage) {
            setActiveTokenUsage(payload.token_usage);
          } else if (type === 'provider.reasoning_delta' || type === 'provider.reasoning_detail') {
            setActiveReasoning((current) => `${current}${payload.delta || ''}`.slice(-12000));
          } else if (type === 'assistant.delta') {
            setActiveAnswer((current) => `${current}${payload.delta || ''}`);
          } else if (type === 'sql.candidate_ready' || type === 'sql.ready') {
            if (payload.sql) setActiveSql(payload.sql);
          } else if (type === 'sql.validation_check') {
            const checkItem = payload.check || payload;
            setActiveChecks((prev) => [...prev, checkItem]);
          } else if (type === 'sql.validation_completed') {
            if (payload.sanitized_sql) setActiveSql(payload.sanitized_sql);
          } else if (type === 'execution.columns') {
            setActiveColumns(payload.columns || []);
            setActiveColumnTypes(payload.column_types || payload.types || []);
          } else if (type === 'execution.rows') {
            if (payload.offset === 0) {
              setActiveRows(payload.rows || []);
            } else {
              setActiveRows((prev) => [...prev, ...(payload.rows || [])]);
            }
          } else if (type === 'execution.completed') {
            setActiveIsTruncated(payload.is_truncated || false);
            setActiveExecutionTimeMs(payload.execution_time_ms || 0);
          } else if (type === 'visualization.recommended') {
            setActiveChartRecommendation(payload.chart);
            setActiveResultTab('chart');
          } else if (type === 'visualization.not_recommended') {
            setActiveChartRecommendation(null);
            setActiveResultTab('table');
          } else if (type === 'run.completed') {
            setActiveAnswer(payload.answer || '');
            setActiveSql(payload.sql || '');
            setActiveColumns(payload.columns || []);
            setActiveColumnTypes(payload.column_types || []);
            setActiveRows(payload.rows || []);
            setActiveIsTruncated(Boolean(payload.is_truncated));
            setActiveChartRecommendation(payload.chart || null);
          } else if (type === 'run.failed') {
            setErrorMessage(payload.error || 'Execution failed');
            setIsRunning(false);
          }
        },
        onComplete: async (_type, event) => {
          setIsRunning(false);
          setActiveStageKey(null);
          await loadHistory();
          const completedConversationId = event?.conversation_id || runData.conversation_id;
          await loadConversationThread(completedConversationId);
          if (selectedConnectionRef.current === selectedConnectionId) {
            loadExploreSuggestions(selectedConnectionId);
          }
        },
        onError: (err) => {
          console.warn('Stream error:', err);
          setIsRunning(false);
        },
      });
    } catch (err) {
      setErrorMessage(err.message || 'Failed to initialize agent run.');
      setIsRunning(false);
    }
  }, [inputPrompt, isRunning, selectedModelId, selectedConnectionId, conversationId, loadConversationThread, loadExploreSuggestions, loadHistory, onSessionUpdate, session]);

  const handleCancelRun = async () => {
    if (currentRunId) {
      await cancelAgentRun(currentRunId);
      if (activeStreamRef.current) activeStreamRef.current.close();
      setIsRunning(false);
      setActiveStageKey(null);
    }
  };

  const handleExecuteEditedSql = async (editedSql) => {
    if (!editedSql.trim()) return;
    setIsRunning(true);
    setErrorMessage(null);

    try {
      const res = await executeCustomSql(currentRunId || 'custom_run', editedSql, selectedConnectionId);
      setActiveSql(res.validation.sanitized_sql);
      setActiveChecks(res.validation.checks || []);
      setActiveColumns(res.result.columns || []);
      setActiveColumnTypes(res.result.column_types || []);
      setActiveRows(res.result.rows || []);
      setActiveExecutionTimeMs(res.result.execution_time_ms || 0);
      setActiveIsTruncated(res.result.is_truncated || false);
      if (res.result.chart_recommendation) {
        setActiveChartRecommendation(res.result.chart_recommendation);
        setActiveResultTab('chart');
      } else {
        setActiveResultTab('table');
      }
    } catch (err) {
      setErrorMessage(err.message || 'Error executing custom SQL.');
    } finally {
      setIsRunning(false);
    }
  };

  const handleSaveQuery = async (querySql) => {
    try {
      const promptToSave = messages[messages.length - 1]?.content || 'Custom Query';
      const saved = await saveQuery({
        name: `Query - ${promptToSave.slice(0, 30)}...`,
        description: promptToSave,
        prompt: promptToSave,
        sql: querySql,
      });
      setSavedQueries((prev) => [saved, ...prev]);
      alert('Query saved to Enterprise Saved Queries library!');
    } catch (err) {
      alert('Failed to save query.');
    }
  };

  return (
    <div className={`live-demo-shell theme-${theme} min-h-screen bg-[#f5f7fb] flex overflow-hidden text-slate-900 font-sans`}>
      {sidebarOpen && <button type="button" onClick={() => setSidebarOpen(false)} className="md:hidden fixed inset-0 z-20 bg-slate-950/30" aria-label="Close sidebar overlay" />}
      {/* ─── Minimalist Left Sidebar (Claude Desktop / AI Studio Style) ─── */}
      <aside
        className={`fixed inset-y-0 left-0 md:relative bg-[#f1f4f9]/95 border-r border-slate-200/80 flex flex-col justify-between transition-all duration-200 z-30 ${
          sidebarOpen ? 'w-60 min-w-[240px]' : 'w-0 min-w-0 -translate-x-full overflow-hidden'
        }`}
      >
        <div className="flex flex-col h-full overflow-hidden">
          {/* Header with Brand */}
          <div className="px-4 py-3.5 border-b border-slate-200/60 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-12 h-12 rounded-xl overflow-hidden shadow-xs flex items-center justify-center bg-white p-1">
                <img src="/SlayQLlogo.png" alt="SlayQL Logo" className="w-full h-full object-contain" />
              </div>
              <div className="min-w-0">
                <span className="text-sm font-bold text-slate-900 tracking-tight block">SlayQL</span>
              </div>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60"
              title="Close sidebar"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          </div>

          {/* New Query Action Button */}
          <div className="p-3">
            <button
              onClick={handleNewThread}
              className="w-full inline-flex items-center gap-2 px-3 py-2 bg-white hover:bg-slate-100 text-slate-800 font-semibold text-xs rounded-xl border border-slate-200/90 shadow-2xs transition-all"
            >
              <Plus className="w-3.5 h-3.5 text-indigo-600" />
              <span>New Query</span>
            </button>
          </div>

          {/* Navigation & History */}
          <div className="flex-1 overflow-y-auto px-3 py-1 space-y-3">
            {/* Quick Tools */}
            <div className="space-y-0.5">
              <button
                onClick={() => setView('databases')}
                className="db-center-cta w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-bold text-white transition-all shadow-sm"
              >
                <Database className="w-4 h-4 text-indigo-200" />
                <span className="flex-1 text-left">AI Database Lab</span>
                <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-white/15 text-indigo-100">NEW</span>
              </button>

              <button
                onClick={() => setCatalogOpen(true)}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-200/60 transition-all"
              >
                <Layers className="w-3.5 h-3.5 text-slate-500" />
                <span className="flex-1 text-left">Schema Catalog</span>
                <span className="text-[10px] text-slate-400 font-mono">
                  {catalog ? Object.keys(catalog.tables || {}).length : 0}
                </span>
              </button>

              <button
                onClick={() => setSavedQueriesOpen(true)}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-200/60 transition-all"
              >
                <Bookmark className="w-3.5 h-3.5 text-slate-500" />
                <span className="flex-1 text-left">Saved Queries</span>
                <span className="text-[10px] text-slate-400 font-mono">{savedQueries.length}</span>
              </button>

              <button
                onClick={() => setAddTableOpen(true)}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-200/60 transition-all"
              >
                <Plus className="w-3.5 h-3.5 text-slate-500" />
                <span className="flex-1 text-left">Create Table</span>
              </button>
            </div>

            <div className="space-y-0.5 pt-3">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-2 pb-1">Explore</p>
              {selectedConnectionId && exploreLoading && (
                <div className="h-8 px-2.5 flex items-center gap-2 text-[10px] text-slate-400">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Planning next questions</span>
                </div>
              )}
              {selectedConnectionId && !exploreLoading && exploreSuggestions.map((item) => (
                <button
                  key={`${item.label}-${item.prompt}`}
                  onClick={() => handleSendQuery(item.prompt)}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] text-slate-600 hover:text-indigo-700 hover:bg-indigo-50/70 transition-all flex items-center gap-2 truncate"
                >
                  <Sparkles className="w-3 h-3 text-indigo-400 flex-shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              ))}
            </div>

            {/* History List */}
            <div className="space-y-0.5 pt-3 border-t border-slate-200/60">
              <div className="flex items-center justify-between px-2 pb-1">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Recent chats</p>
                {historyList.length > 0 && <span className="text-[10px] text-slate-400">{historyList.length}</span>}
              </div>
              {historyList.length === 0 ? (
                <p className="text-[11px] text-slate-400 px-2 py-1">No queries yet</p>
              ) : (
                historyList.slice(0, 8).map((hist) => (
                  <div key={hist.id} className="group relative rounded-lg hover:bg-slate-200/60 focus-within:bg-slate-200/60 transition-colors">
                    <button
                      type="button"
                      onClick={() => loadConversationThread(hist.id)}
                      disabled={isRunning}
                      className="w-full text-left pl-2.5 pr-8 py-2 rounded-lg text-xs text-slate-600 hover:text-slate-900 transition-all flex items-start gap-2"
                    >
                    <MessageSquare className="w-3 h-3 text-slate-400 flex-shrink-0 mt-0.5" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{hist.prompt}</span>
                      <span className="flex items-center gap-1.5 mt-0.5 text-[10px] text-slate-400">
                        <span>{formatHistoryDate(hist.updated_at || hist.created_at)}</span>
                        {hist.model_id && <><span>·</span><span className="truncate">{hist.model_id.split('/').pop()}</span></>}
                      </span>
                    </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setHistoryDeleteTarget(hist)}
                      disabled={deletingHistoryId === hist.id}
                      className="absolute right-1.5 top-1.5 w-6 h-6 flex items-center justify-center rounded-md text-slate-400 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 hover:text-red-600 hover:bg-red-50 focus:opacity-100 transition-all disabled:opacity-50"
                      title="Delete chat"
                      aria-label={`Delete ${hist.prompt}`}
                    >
                      <Trash2 className={`w-3.5 h-3.5 ${deletingHistoryId === hist.id ? 'animate-pulse' : ''}`} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* User Profile Menu */}
          <div className="live-demo-profile p-3 border-t border-slate-200/60 relative">
            <button
              onClick={() => setProfileOpen(!profileOpen)}
              className="w-full flex items-center gap-2 p-1.5 rounded-xl hover:bg-slate-200/60 transition-all text-left"
            >
              <div className="w-8 h-8 rounded-full bg-indigo-600 text-white font-bold text-[10px] flex items-center justify-center shadow-2xs overflow-hidden">
                {session?.user?.avatar_data_url ? <img src={session.user.avatar_data_url} alt="" className="w-full h-full object-cover" /> : avatarInitials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-800 truncate">{userName}</p>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {profileOpen && (
              <div className="live-demo-profile-menu absolute bottom-14 left-3 right-3 rounded-xl bg-white border border-slate-200 shadow-xl z-50 p-1.5 slide-in-up">
                <div className="p-2 border-b border-slate-100 mb-1">
                  <p className="text-xs font-bold text-slate-900">{userName}</p>
                  <p className="text-[10px] text-slate-500">{userRole}</p>
                </div>
                <div className="px-2.5 py-2 mb-1 rounded-lg bg-slate-50 flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-slate-600"><Coins className="w-3.5 h-3.5 text-amber-500" />Credits</span>
                  <span className="text-xs font-bold text-slate-900">{creditBalance.toLocaleString()}</span>
                </div>
                <button type="button" onClick={() => { setProfileOpen(false); setView('profile'); }} className="w-full text-left px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 rounded-lg transition-all flex items-center gap-2"><UserRound className="w-3.5 h-3.5" />Profile settings</button>
                <button type="button" onClick={() => { setProfileOpen(false); setView('databases'); }} className="w-full text-left px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 rounded-lg transition-all flex items-center gap-2"><Database className="w-3.5 h-3.5" />Database management</button>
                <div className="px-2.5 py-1.5 flex items-center justify-between text-[10px] text-slate-400">
                  <span>Appearance</span>
                  <span className="font-semibold text-slate-500">{theme === 'light' ? 'Light' : 'Dark'}</span>
                </div>
                <button
                  onClick={() => {
                    setProfileOpen(false);
                    setSignOutOpen(true);
                  }}
                  className="w-full text-left px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg transition-all flex items-center gap-2"
                >
                  <LogOut className="w-3.5 h-3.5" />Sign out
                </button>
                <button
                  type="button"
                  onClick={() => setTheme((current) => current === 'light' ? 'dark' : 'light')}
                  className="w-full text-left px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 rounded-lg transition-all flex items-center gap-2"
                >
                  {theme === 'light' ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
                  {theme === 'light' ? 'Use dark appearance' : 'Use light appearance'}
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* ─── Main Chat Area ─── */}
      <div className="flex-1 min-w-0 flex flex-col h-screen overflow-hidden bg-[#f7f9fc]">
        {/* Top Minimalist Header */}
        <header className="min-h-14 border-b border-slate-200/70 px-4 sm:px-6 flex items-center justify-between gap-4 z-20 bg-white/95 backdrop-blur-sm">
          <div className="flex items-center gap-2 min-w-0">
            {!sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 transition-all mr-1"
                title="Open Sidebar"
              >
                <PanelLeftOpen className="w-4 h-4" />
              </button>
            )}

            {/* Database Selector Pill */}
            <div className="relative">
              <button
                onClick={() => setDbDropdownOpen(!dbDropdownOpen)}
                disabled={isRunning}
                className="h-11 inline-flex items-center gap-2.5 px-2.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200/90 text-xs font-medium text-slate-700 transition-all shadow-sm"
              >
                <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${selectedConnectionId ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}><Database className="w-3.5 h-3.5" /></span>
                <span className="text-left leading-tight">
                  <span className={`block text-[9px] font-semibold ${selectedConnectionId ? 'text-emerald-600' : 'text-slate-400'}`}>{selectedConnectionId ? `Connected / ${activeConnection.engine}` : 'Not connected'}</span>
                  <span className="block truncate max-w-[82px] sm:max-w-[155px] text-slate-900 font-bold">{activeConnection.name}</span>
                </span>
                <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${dbDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {dbDropdownOpen && (
                <div className="absolute left-0 mt-1.5 w-64 rounded-xl bg-white border border-slate-200 shadow-xl z-50 p-1.5 slide-in-up">
                  <div className="space-y-0.5">
                    {connections.length === 0 && <p className="px-2.5 py-2 text-xs text-slate-500">No data sources added</p>}
                    {connections.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => {
                          if (c.id !== selectedConnectionId) handleNewThread();
                          setSelectedConnectionId(c.id);
                          loadCatalog(c.id);
                          loadExploreSuggestions(c.id);
                          setDbDropdownOpen(false);
                        }}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between transition-all ${
                          selectedConnectionId === c.id
                            ? 'bg-indigo-50 text-indigo-900 font-semibold'
                            : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <span className="truncate">{c.name}</span>
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                      </button>
                    ))}
                  </div>

                  <div className="mt-1 pt-1 border-t border-slate-100 flex flex-col gap-0.5">
                    <button onClick={() => { setDbDropdownOpen(false); setView('databases'); }} className="w-full inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 rounded-lg transition-all"><Layers className="w-3 h-3 text-slate-500" /><span>Manage data sources</span></button>
                    {selectedConnectionId && (
                      <button
                        onClick={() => {
                          setDbDropdownOpen(false);
                          setAddTableOpen(true);
                        }}
                        className="w-full inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Create New Table</span>
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setDbDropdownOpen(false);
                        setAddConnectionOpen(true);
                      }}
                      className="w-full inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 rounded-lg transition-all"
                    >
                      <Database className="w-3 h-3 text-slate-500" />
                      <span>Add Database Connection</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Model Selector in Top Bar */}
            <ModelSelector
              models={models}
              selectedModelId={selectedModelId}
              onSelectModel={setSelectedModelId}
              disabled={isRunning}
            />
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              onClick={() => setCatalogOpen(true)}
              className="text-xs font-medium text-slate-600 hover:text-slate-900 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 transition-all flex items-center gap-1.5"
              title="Open schema catalog"
            >
              <Layers className="w-3.5 h-3.5 text-slate-500" />
              <span className="hidden sm:inline">Catalog</span>
            </button>
          </div>
        </header>

        {/* ─── Conversational Thread ─── */}
        <main className="flex-1 overflow-y-auto px-4 sm:px-8 lg:px-12 py-6 space-y-6 bg-[#f7f9fc]">
          {/* Empty Conversation Welcome State (Google AI Studio / Claude Desktop style) */}
          {messages.length === 0 && !isRunning && (
            <div className="max-w-2xl mx-auto text-center py-12 sm:py-20 space-y-7 animate-fade-in-up">
              <div className="space-y-3">
                <div className="w-28 h-28 rounded-3xl bg-indigo-50 border border-indigo-100 mx-auto flex items-center justify-center p-3 shadow-sm">
                  <img src="/SlayQLlogo.png" alt="SlayQL Logo" className="w-full h-full object-contain" />
                </div>
                <div className="space-y-1.5">
                  <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
                    What can I help you explore?
                  </h1>
                  <p className="text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
                    Ask about your data in plain language. I’ll find the right tables, explain the path, and return a validated query.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Conversation Messages */}
          {messages.map((msg) => (
            <div key={msg.id} className="w-full mx-auto">
              {msg.sender === 'user' ? (
                <div className="flex items-start gap-3 justify-end py-2">
                  <div className="max-w-xl space-y-1 text-right">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">You</p>
                    <div className="user-chat-bubble inline-block text-left bg-slate-100 text-slate-900 px-4 py-3 rounded-2xl rounded-tr-md text-sm leading-relaxed shadow-xs">
                      {msg.content}
                    </div>
                  </div>
                  <div className="w-7 h-7 rounded-full bg-indigo-600 text-white font-bold text-[10px] flex items-center justify-center flex-shrink-0 mt-5 shadow-sm">
                    {avatarInitials}
                  </div>
                </div>
              ) : (
                <ConversationAssistantMessage message={msg} isDark={theme === 'dark'} />
              )}
            </div>
          ))}

          {/* Active SlayQL Agent Turn */}
          {(isRunning || activeSql || activeRows.length > 0 || Object.keys(activeStages).length > 0) && (
            <div className="w-full mx-auto space-y-3 animate-fade-in-up">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg overflow-hidden flex items-center justify-center flex-shrink-0 mt-0.5">
                  <img src="/SlayQLlogo.png" alt="SlayQL" className="w-full h-full object-contain" />
                </div>

                <div className="flex-1 space-y-3 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-800">SlayQL</span>
                    {isRunning ? (
                      <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-indigo-600">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                        Working through your request
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        Query ready
                      </span>
                    )}
                  </div>

                  {/* Minimalist Thinking Process Toggle */}
                  <SlayQLTraceTimeline
                    stages={activeStages}
                    activeStageKey={activeStageKey}
                    isRunning={isRunning}
                    tokenUsage={activeTokenUsage}
                    reasoning={activeReasoning}
                  />

                  <AgentStreamPanel events={activeStreamEvents} isRunning={isRunning} />

                  {activeAnswer && (
                    <p className="text-sm leading-relaxed text-slate-700 whitespace-pre-wrap">{activeAnswer}</p>
                  )}

                  {/* Generated SQL Code Block */}
                  {activeSql && (
                    <SqlEditorPanel
                      sql={activeSql}
                      validationChecks={activeChecks}
                      onExecuteEditedSql={handleExecuteEditedSql}
                      onSaveQuery={handleSaveQuery}
                      isExecuting={isRunning}
                    />
                  )}

                  {/* Results Studio (Chart / Table) */}
                  {(activeRows.length > 0 || isRunning) && (
                    <div className="rounded-2xl border border-slate-200/90 bg-white p-4 space-y-3 shadow-xs">
                      {/* Minimalist Tabs Header */}
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setActiveResultTab('chart')}
                            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                              activeResultTab === 'chart'
                                ? 'bg-slate-900 text-white'
                                : 'text-slate-600 hover:bg-slate-100'
                            }`}
                          >
                            <BarChart3 className="w-3.5 h-3.5" />
                            <span>Chart</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setActiveResultTab('table')}
                            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                              activeResultTab === 'table'
                                ? 'bg-slate-900 text-white'
                                : 'text-slate-600 hover:bg-slate-100'
                            }`}
                          >
                            <Table2 className="w-3.5 h-3.5" />
                            <span>Table ({activeRows.length})</span>
                          </button>
                        </div>

                        {activeRows.length > 0 && (
                          <div className="text-[11px] text-slate-400 font-mono">
                            <span>{activeRows.length} rows</span> • <span>{activeExecutionTimeMs}ms</span>
                            {activeIsTruncated && <span className="text-amber-600 font-semibold ml-1">(limit 200)</span>}
                          </div>
                        )}
                      </div>

                      {/* Display View */}
                      {activeResultTab === 'chart' ? (
                        <VisualizationStudio
                          rows={activeRows}
                          columns={activeColumns}
                          columnTypes={activeColumnTypes}
                          chartRecommendation={activeChartRecommendation}
                          recommendation={activeChartRecommendation}
                          isLoading={isRunning}
                          isDark={theme === 'dark'}
                        />
                      ) : (
                        <DataTablePanel
                          columns={activeColumns}
                          columnTypes={activeColumnTypes}
                          rows={activeRows}
                          isTruncated={activeIsTruncated}
                          executionTimeMs={activeExecutionTimeMs}
                          isLoading={isRunning}
                          isDark={theme === 'dark'}
                        />
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Error Message */}
          {errorMessage && (
            <div className="w-full mx-auto p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center justify-between">
              <span>{errorMessage}</span>
              <button onClick={() => setErrorMessage(null)} className="text-red-700 font-bold hover:underline">
                Dismiss
              </button>
            </div>
          )}

          <div ref={chatBottomRef} />
        </main>

        {/* ─── Floating Minimalist Prompt Composer (Claude Desktop / AI Studio Style) ─── */}
        <footer className="live-demo-composer-footer px-4 pb-4 pt-2 sm:px-8 lg:px-12 sm:pb-6 z-20">
          <div className="w-full mx-auto">
            <div className="flex items-center justify-between px-1 mb-2">
              <span className="text-[10px] text-slate-400">Natural language to safe, executable SQL</span>
              <span className="hidden sm:inline text-[10px] text-slate-400">{isRunning ? 'Streaming response' : 'Ready when you are'}</span>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendQuery();
              }}
              className={`composer-card relative bg-white border rounded-2xl p-2.5 transition-all shadow-sm ${composerFocused ? 'composer-focused border-indigo-300 ring-4 ring-indigo-50/80 shadow-md' : 'border-slate-200 hover:border-slate-300'}`}
            >
              <textarea
                ref={composerRef}
                rows={2}
                value={inputPrompt}
                onChange={handleComposerChange}
                onFocus={() => setComposerFocused(true)}
                onBlur={() => setComposerFocused(false)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendQuery();
                  }
                }}
                placeholder="Ask anything about your connected data..."
                className="w-full max-h-[180px] min-h-[52px] px-2 py-1 bg-transparent text-sm text-slate-900 placeholder-slate-400 outline-none resize-none leading-relaxed font-sans"
              />

              <div className="flex items-center justify-between pt-1.5 px-1 border-t border-slate-200/50">
                <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium">
                  <button
                    type="button"
                    onClick={() => setCatalogOpen(true)}
                    className="w-7 h-7 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 flex items-center justify-center transition-colors"
                    title="Add schema context"
                    aria-label="Add schema context"
                  >
                    <Paperclip className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setSavedQueriesOpen(true)}
                    className="w-7 h-7 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 flex items-center justify-center transition-colors"
                    title="Browse saved queries"
                    aria-label="Browse saved queries"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                  <Database className="w-3 h-3 text-indigo-600" />
                  <span className="truncate max-w-[150px]">{activeConnection.name}</span>
                  <span className="text-slate-300">•</span>
                  <span className="font-mono text-slate-400">{selectedModel.name}</span>
                </div>

                <div>
                  {isRunning ? (
                    <button
                      type="button"
                      onClick={handleCancelRun}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-700 font-semibold text-xs rounded-lg border border-red-200 transition-all"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Stop</span>
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={!inputPrompt.trim() || !selectedConnectionId}
                      className="w-7 h-7 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-20 text-white flex items-center justify-center transition-all shadow-xs"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </form>
          </div>
        </footer>
      </div>

      {/* ─── Modals / Drawers ─── */}
      <CatalogDrawer
        isOpen={catalogOpen}
        onClose={() => setCatalogOpen(false)}
        catalog={catalog}
        onOpenAddTable={() => {
          setCatalogOpen(false);
          setAddTableOpen(true);
        }}
        onOpenAddConnection={() => {
          setCatalogOpen(false);
          setAddConnectionOpen(true);
        }}
      />

      <SavedQueriesDrawer
        isOpen={savedQueriesOpen}
        onClose={() => setSavedQueriesOpen(false)}
        savedQueries={savedQueries}
        onRunQuery={(qPrompt) => {
          handleSendQuery(qPrompt);
        }}
      />

      <AddConnectionModal
        isOpen={addConnectionOpen}
        onClose={() => setAddConnectionOpen(false)}
        onConnectionAdded={async (newConn) => {
          handleNewThread();
          await loadConnections();
          setSelectedConnectionId(newConn.id);
          await Promise.all([
            loadCatalog(newConn.id),
            loadExploreSuggestions(newConn.id),
          ]);
        }}
      />

      <AddTableModal
        isOpen={addTableOpen}
        onClose={() => setAddTableOpen(false)}
        connectionId={selectedConnectionId}
        onTableCreated={async (newCatalog) => {
          if (newCatalog) setCatalog(newCatalog);
          await loadConnections();
          await loadCatalog(selectedConnectionId);
        }}
      />

      <ConfirmationModal
        isOpen={Boolean(historyDeleteTarget)}
        title="Delete this chat?"
        message={`"${historyDeleteTarget?.prompt || 'This chat'}" will be permanently removed from recent chats.`}
        confirmLabel="Delete chat"
        onCancel={() => setHistoryDeleteTarget(null)}
        onConfirm={() => handleDeleteHistory(historyDeleteTarget)}
        isWorking={Boolean(deletingHistoryId)}
      />
      <ConfirmationModal
        isOpen={signOutOpen}
        title="Sign out of SlayQL?"
        message="Your profile, credits, chats, and database connections will remain saved for your next session."
        confirmLabel="Sign out"
        onCancel={() => setSignOutOpen(false)}
        onConfirm={onLogout}
      />
    </div>
  );
}
