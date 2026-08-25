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
  Compass,
  ChevronRight,
  ChevronsUpDown,
  Settings,
  ShieldCheck,
} from 'lucide-react';

import ModelSelector from '../components/demo/ModelSelector';
import ThinkingEffortSelector, { THINKING_EFFORT_LEVELS } from '../components/demo/ThinkingEffortSelector';
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
import SignOutModal from '../components/demo/SignOutModal';
import EmptyChatState from '../components/demo/EmptyChatState';

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
  const isSqlQuery = payload.is_sql_query !== false;
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
    <div className="py-4 space-y-3">
      <div className={isSqlQuery
        ? ''
        : 'rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sky-950 shadow-sm dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-100'}
      >
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
      </div>
      {isSqlQuery && payload.reasoning && (
        <details className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
          <summary className="cursor-pointer font-semibold text-slate-600">Reasoning output</summary>
          <p className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap leading-relaxed text-slate-500">{payload.reasoning}</p>
        </details>
      )}
      {isSqlQuery && <AgentStreamPanel events={payload.stream_events || []} />}
      {message.sql && (
        <SqlEditorPanel sql={message.sql} isExecuting={false} />
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
  );
}

const DEFAULT_EXPLORE_SUGGESTIONS = [
  { label: 'Top revenue drivers', prompt: 'Show top 10 customers ranked by total spend this year with order counts.' },
  { label: 'Customer retention', prompt: 'Which customers made repeat purchases in the last 90 days?' },
  { label: 'Product breakdown', prompt: 'List all product categories with their total revenue and unit volume.' },
  { label: 'Order trends', prompt: 'Show monthly order totals and average transaction value over the past 12 months.' },
];

function isLikelySqlTurn(text) {
  const normalized = String(text || '').toLowerCase();
  return /\b(show|list|get|find|give me|how many|count|sum|average|avg|total|compare|summarize|breakdown|top|bottom|trend|revenue|sales|orders|customers|users|products)\b/.test(normalized)
    || /^(and|also|now|then|what about|how about|only|same|those|them|it|that)\b/.test(normalized.trim());
}

export default function LiveDemoView({ setView, session, onLogout, onSessionUpdate }) {
  // --- Infrastructure & Metadata State ---
  const [models, setModels] = useState([]);
  const [selectedModelId, setSelectedModelId] = useState('deepseek/deepseek-v4-flash');
  const [thinkingEffort, setThinkingEffort] = useState(() => {
    try {
      const stored = localStorage.getItem('slayql_thinking_effort');
      return THINKING_EFFORT_LEVELS.some((level) => level.id === stored) ? stored : 'minimal';
    } catch {
      return 'minimal';
    }
  });
  const [connections, setConnections] = useState([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState(null);
  const [catalog, setCatalog] = useState(null);
  const [exploreSuggestions, setExploreSuggestions] = useState(DEFAULT_EXPLORE_SUGGESTIONS);
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
  const [explorePopOpen, setExplorePopOpen] = useState(false);
  const [explorePopPosition, setExplorePopPosition] = useState({ top: 0, left: 0 });
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
  const [activeIsSqlQuery, setActiveIsSqlQuery] = useState(null);
  const [activeStreamEvents, setActiveStreamEvents] = useState([]);
  const [activeResultTab, setActiveResultTab] = useState('chart'); // 'chart' | 'table'
  const [composerFocused, setComposerFocused] = useState(false);

  const activeStreamRef = useRef(null);
  const chatBottomRef = useRef(null);
  const composerRef = useRef(null);
  const exploreButtonRef = useRef(null);
  const explorePopTimeoutRef = useRef(null);
  const exploreRequestRef = useRef(0);
  const catalogRequestRef = useRef(0);
  const selectedConnectionRef = useRef(selectedConnectionId);

  const handleExploreMouseEnter = useCallback(() => {
    if (explorePopTimeoutRef.current) {
      clearTimeout(explorePopTimeoutRef.current);
    }
    if (exploreButtonRef.current) {
      const rect = exploreButtonRef.current.getBoundingClientRect();
      setExplorePopPosition({
        top: Math.max(16, rect.top - 8),
        left: rect.right + 8,
      });
    }
    setExplorePopOpen(true);
  }, []);

  const handleExploreMouseLeave = useCallback(() => {
    explorePopTimeoutRef.current = setTimeout(() => {
      setExplorePopOpen(false);
    }, 180);
  }, []);

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

  useEffect(() => {
    try {
      localStorage.setItem('slayql_thinking_effort', thinkingEffort);
    } catch {
      // Storage can be unavailable in private or embedded contexts.
    }
  }, [thinkingEffort]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setSidebarOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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
      if (catalogRequestRef.current === requestId) {
        setCatalog(null);
        setErrorMessage(err.message || 'The selected database catalog is unavailable.');
      }
      console.warn('Catalog load error:', err);
    }
  }, []);

  const loadExploreSuggestions = useCallback(async (connId) => {
    const requestId = ++exploreRequestRef.current;
    if (!connId) {
      setExploreSuggestions(DEFAULT_EXPLORE_SUGGESTIONS);
      setExploreLoading(false);
      return;
    }
    setExploreLoading(true);
    try {
      const data = await fetchExploreSuggestions(connId);
      if (exploreRequestRef.current === requestId) {
        if (Array.isArray(data?.suggestions) && data.suggestions.length > 0) {
          setExploreSuggestions(data.suggestions);
        } else {
          setExploreSuggestions(DEFAULT_EXPLORE_SUGGESTIONS);
        }
      }
    } catch (err) {
      if (exploreRequestRef.current === requestId) {
        setExploreSuggestions(DEFAULT_EXPLORE_SUGGESTIONS);
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
    setActiveIsSqlQuery(null);
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
      setActiveIsSqlQuery(null);
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
    setActiveIsSqlQuery(isLikelySqlTurn(queryText));
    setActiveStreamEvents([]);
    setActiveResultTab('chart');

    try {
      const runData = await createAgentRun({
        question: queryText,
        modelId: selectedModelId,
        connectionId: selectedConnectionId,
        conversationId,
        thinkingEffort,
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
          } else if (type === 'intent.validator_completed') {
            if (typeof payload.is_sql_query === 'boolean') {
              setActiveIsSqlQuery(payload.is_sql_query);
            }
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
            if (typeof payload.is_sql_query === 'boolean') setActiveIsSqlQuery(payload.is_sql_query);
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
  }, [inputPrompt, isRunning, selectedModelId, selectedConnectionId, conversationId, thinkingEffort, loadConversationThread, loadExploreSuggestions, loadHistory, onSessionUpdate, session]);

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
        className={`fixed inset-y-0 left-0 md:relative bg-[#f1f4f9]/95 border-r border-slate-200/80 flex flex-col justify-between transition-all duration-300 ease-[cubic-bezier(0.2,0,0,1)] z-30 overflow-hidden ${
          sidebarOpen
            ? 'w-64 min-w-[16rem] max-w-[16rem] opacity-100 translate-x-0'
            : 'w-0 min-w-0 max-w-0 opacity-0 -translate-x-full md:translate-x-0 border-r-0 pointer-events-none'
        }`}
      >
        <div className="w-64 min-w-[16rem] flex flex-col h-full overflow-hidden">
          {/* Header with Brand — text-only serif logo */}
          <div className="px-4 py-3.5 border-b border-slate-200/60 flex items-center justify-between">
            <div className="flex items-center">
              <span className="slayql-logo text-2xl tracking-tight">
                <span className="slay">Slay</span><span className="ql">QL</span>
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 transition-all duration-200 hover:scale-105 active:scale-95"
              title="Close sidebar (Ctrl+B)"
              aria-label="Close sidebar"
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

              {/* Explore Button */}
              <button
                ref={exploreButtonRef}
                type="button"
                onClick={() => {
                  if (explorePopOpen) {
                    setExplorePopOpen(false);
                  } else {
                    handleExploreMouseEnter();
                  }
                }}
                onMouseEnter={handleExploreMouseEnter}
                onMouseLeave={handleExploreMouseLeave}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-200/60 transition-all"
              >
                <Sparkles className="w-3.5 h-3.5 text-slate-500" />
                <span className="flex-1 text-left">Explore</span>
                <span className="text-[10px] text-slate-400 font-mono">{exploreSuggestions.length}</span>
              </button>
            </div>

            {/* History List — fixed height, scrollable */}
            <div className="pt-3 border-t border-slate-200/60">
              <div className="flex items-center justify-between px-2 pb-1">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Recent chats</p>
                {historyList.length > 0 && <span className="text-[10px] text-slate-400">{historyList.length}</span>}
              </div>
              <div className="max-h-[260px] overflow-y-auto space-y-0.5 pr-0.5">
              {historyList.length === 0 ? (
                <p className="text-[11px] text-slate-400 px-2 py-1">No queries yet</p>
              ) : (
                historyList.map((hist) => (
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
          </div>

          {/* User Profile Pill Card — Clean: Pic + Name + PRO */}
          <div className="live-demo-profile p-2.5 border-t border-slate-200/60 relative">
            <button
              type="button"
              onClick={() => setProfileOpen(!profileOpen)}
              className="w-full p-2 rounded-2xl border border-slate-200/80 hover:border-slate-300 bg-slate-100/70 hover:bg-slate-200/70 transition-all text-left group flex items-center gap-3 shadow-2xs"
            >
              {/* Profile Pic / Avatar */}
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-600 text-white font-bold text-sm flex items-center justify-center shadow-xs overflow-hidden shrink-0">
                {session?.user?.avatar_data_url ? (
                  <img src={session.user.avatar_data_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  avatarInitials
                )}
              </div>

              {/* Name & PRO Badge */}
              <div className="flex-1 min-w-0 flex items-center justify-between gap-1.5">
                <p className="text-xs sm:text-[13px] font-extrabold tracking-tight truncate profile-name-shimmer">
                  {userName}
                </p>
                <span className="shrink-0 text-[9px] font-extrabold tracking-wider px-1.5 py-0.5 rounded-md bg-indigo-50 text-indigo-600 border border-indigo-200/80 uppercase">
                  PRO
                </span>
              </div>

              <ChevronDown className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform ${profileOpen ? 'rotate-180 text-indigo-600' : 'group-hover:text-slate-600'}`} />
            </button>

            {profileOpen && (
              <div className="live-demo-profile-menu absolute bottom-20 left-2.5 right-2.5 rounded-2xl bg-white border border-slate-200 shadow-xl z-50 p-2 space-y-1.5 slide-in-up">
                {/* Header Card */}
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1 pr-2">
                      <p className="text-xs font-bold text-slate-900 truncate">{userName}</p>
                      <p className="text-[10px] text-slate-500 truncate">{session?.user?.email || 'enterprise@slayql.internal'}</p>
                    </div>
                    <span className="text-[9px] font-extrabold tracking-wider px-2 py-0.5 rounded-full bg-indigo-600 text-white shadow-2xs shrink-0">
                      ENTERPRISE
                    </span>
                  </div>

                  {/* Credits Balance Micro-Bar */}
                  <div className="flex items-center justify-between pt-1.5 border-t border-slate-200/60 text-[11px]">
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-600">
                      <Coins className="w-3.5 h-3.5 text-amber-500" />
                      Credits Balance
                    </span>
                    <span className="font-mono text-xs font-bold text-slate-900">
                      {creditBalance.toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Navigation Links */}
                <div className="space-y-0.5 pt-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setProfileOpen(false);
                      setView('profile');
                    }}
                    className="w-full text-left px-2.5 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 rounded-xl transition-all flex items-center gap-2.5"
                  >
                    <UserRound className="w-3.5 h-3.5 text-slate-400" />
                    <span>Profile settings</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setProfileOpen(false);
                      setView('databases');
                    }}
                    className="w-full text-left px-2.5 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 rounded-xl transition-all flex items-center gap-2.5"
                  >
                    <Database className="w-3.5 h-3.5 text-slate-400" />
                    <span>Database management</span>
                  </button>

                  <div className="px-2.5 py-1.5 flex items-center justify-between text-[10px] text-slate-400">
                    <span>Appearance</span>
                    <span className="font-semibold text-slate-500">{theme === 'light' ? 'Light' : 'Dark'}</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setTheme((current) => current === 'light' ? 'dark' : 'light')}
                    className="w-full text-left px-2.5 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 rounded-xl transition-all flex items-center gap-2.5"
                  >
                    {theme === 'light' ? <Moon className="w-3.5 h-3.5 text-slate-400" /> : <Sun className="w-3.5 h-3.5 text-amber-500" />}
                    <span>{theme === 'light' ? 'Use dark appearance' : 'Use light appearance'}</span>
                  </button>
                </div>

                {/* Sign Out Action */}
                <div className="pt-1 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => {
                      setProfileOpen(false);
                      setSignOutOpen(true);
                    }}
                    className="w-full text-left px-2.5 py-2 text-xs font-medium text-red-600 hover:bg-red-50 rounded-xl transition-all flex items-center gap-2.5"
                  >
                    <LogOut className="w-3.5 h-3.5 text-red-500" />
                    <span>Sign out</span>
                  </button>
                </div>
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
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200/80 hover:border-slate-300 bg-white shadow-2xs transition-all duration-200 mr-1.5 flex items-center justify-center animate-scale-in hover:scale-105 active:scale-95"
                title="Open Sidebar (Ctrl+B)"
                aria-label="Open Sidebar"
              >
                <PanelLeftOpen className="w-4 h-4 text-slate-600 hover:text-indigo-600 transition-colors" />
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
                        title={c.status === 'error' ? (c.catalog_error || 'Database file is unavailable on this deployment.') : `${c.name} (${c.table_count ?? 0} tables)`}
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
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${c.status === 'error' ? 'bg-red-500' : 'bg-emerald-500'}`} />
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
              isDark={theme === 'dark'}
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
        <main className={`flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 bg-[#f7f9fc] flex flex-col ${messages.length === 0 && !isRunning ? 'justify-center items-center py-0' : 'py-6'}`}>
          <div className={`max-w-3xl lg:max-w-4xl mx-auto space-y-6 w-full ${messages.length === 0 && !isRunning ? 'flex flex-col justify-center items-center my-auto' : 'pb-8'}`}>
            {/* Empty Conversation Welcome State */}
            {messages.length === 0 && !isRunning && (
              <EmptyChatState />
            )}

            {/* Conversation Messages */}
            {messages.map((msg) => (
              <div key={msg.id} className="w-full">
                {msg.sender === 'user' ? (
                  <div className="flex justify-end py-2">
                    <div className="user-chat-bubble text-left bg-slate-900 text-white dark:bg-[#20242d] dark:text-slate-100 dark:border dark:border-[#323844] px-4 py-3 rounded-2xl rounded-tr-xs text-sm leading-relaxed shadow-xs max-w-xl">
                      {msg.content}
                    </div>
                  </div>
                ) : (
                  <ConversationAssistantMessage message={msg} isDark={theme === 'dark'} />
                )}
              </div>
            ))}

            {/* Active SlayQL Agent Turn */}
            {(isRunning || activeAnswer || activeSql || activeRows.length > 0 || Object.keys(activeStages).length > 0) && (
              <div className="w-full space-y-3 animate-fade-in-up">
                <div className="flex-1 space-y-3 min-w-0">
                    {activeIsSqlQuery !== false && isRunning && (
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                        <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">Thinking…</span>
                      </div>
                    )}

                    {/* Thinking Process */}
                    {activeIsSqlQuery !== false && (
                      <>
                        <SlayQLTraceTimeline
                          stages={activeStages}
                          activeStageKey={activeStageKey}
                          isRunning={isRunning}
                          tokenUsage={activeTokenUsage}
                          reasoning={activeReasoning}
                        />
                        <AgentStreamPanel events={activeStreamEvents} isRunning={isRunning} />
                      </>
                    )}

                    {activeAnswer && (
                      <div className={activeIsSqlQuery === false
                        ? 'rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sky-950 shadow-sm dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-100'
                        : ''}
                      >
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">{activeAnswer}</p>
                      </div>
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
                    {activeIsSqlQuery !== false && (activeRows.length > 0 || isRunning) && (
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
            )}

            {/* Error Message */}
            {errorMessage && (
              <div className="w-full p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 text-xs flex items-center justify-between">
                <span>{errorMessage}</span>
                <button onClick={() => setErrorMessage(null)} className="text-red-700 dark:text-red-300 font-bold hover:underline">
                  Dismiss
                </button>
              </div>
            )}

            <div ref={chatBottomRef} />
          </div>
        </main>

        {/* ─── Floating Minimalist Prompt Composer (Claude Desktop / AI Studio Style) ─── */}
        <footer className="live-demo-composer-footer px-4 pb-4 pt-2 sm:px-6 lg:px-8 sm:pb-6 z-20">
          <div className="max-w-3xl lg:max-w-4xl mx-auto w-full">
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
                <div className="flex items-center gap-2 text-[11px] text-slate-500 font-medium min-w-0">
                  <button
                    type="button"
                    onClick={() => setCatalogOpen(true)}
                    className="w-7 h-7 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 flex items-center justify-center transition-colors shrink-0"
                    title="Add schema context"
                    aria-label="Add schema context"
                  >
                    <Paperclip className="w-3.5 h-3.5" />
                  </button>
                  <Database className="w-3 h-3 text-indigo-600 shrink-0" />
                  <span className="truncate max-w-[130px] sm:max-w-[170px]">{activeConnection.name}</span>
                  <span className="text-slate-300">•</span>
                  <span className="font-mono text-slate-400 truncate max-w-[100px] sm:max-w-[140px]">{selectedModel.name}</span>
                </div>

                <div className="flex items-center gap-2.5 shrink-0">
                  <ThinkingEffortSelector
                    value={thinkingEffort}
                    onChange={setThinkingEffort}
                    disabled={isRunning}
                  />
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

      {/* Explore Pop-up Hanging to the Right of Sidebar */}
      {explorePopOpen && (
        <div
          className="fixed z-50 w-64 sm:w-72 rounded-xl bg-white border border-slate-200 shadow-xl p-1.5 space-y-0.5 slide-in-up text-left"
          style={{
            top: explorePopPosition.top,
            left: explorePopPosition.left,
          }}
          onMouseEnter={() => {
            if (explorePopTimeoutRef.current) clearTimeout(explorePopTimeoutRef.current);
            setExplorePopOpen(true);
          }}
          onMouseLeave={handleExploreMouseLeave}
        >
          {/* Header */}
          <div className="px-2 py-1 flex items-center justify-between border-b border-slate-100">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Explore</p>
            {exploreLoading && <Loader2 className="w-3 h-3 text-indigo-500 animate-spin" />}
          </div>

          {/* List of Questions */}
          <div className="space-y-0.5 max-h-72 overflow-y-auto pt-1">
            {exploreSuggestions.map((item, idx) => (
              <button
                key={`${item.label}-${idx}`}
                type="button"
                onClick={() => {
                  setExplorePopOpen(false);
                  handleSendQuery(item.prompt);
                }}
                disabled={isRunning}
                className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-100 hover:text-indigo-600 transition-all flex items-center gap-2 group truncate disabled:opacity-50"
                title={item.prompt}
              >
                <Sparkles className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0 group-hover:scale-110 transition-transform" />
                <span className="truncate">{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

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
      <SignOutModal
        isOpen={signOutOpen}
        onClose={() => setSignOutOpen(false)}
        onConfirm={onLogout}
        user={session?.user}
        creditBalance={creditBalance}
      />
    </div>
  );
}
