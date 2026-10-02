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
  BookOpen,
} from 'lucide-react';

import ModelSelector from '../components/demo/ModelSelector';
import ThinkingEffortSelector, { THINKING_EFFORT_LEVELS } from '../components/demo/ThinkingEffortSelector';
import RunSteps from '../components/demo/RunSteps';
import AgentStreamPanel, { normalizeStreamEvent } from '../components/demo/AgentStreamPanel';
import SqlEditorPanel from '../components/demo/SqlEditorPanel';
import VisualizationStudio from '../components/demo/VisualizationStudio';
import DataTablePanel from '../components/demo/DataTablePanel';
import MarkdownContent from '../components/common/MarkdownContent';
import CatalogDrawer from '../components/demo/CatalogDrawer';
import SavedQueriesDrawer from '../components/demo/SavedQueriesDrawer';
import AddConnectionModal from '../components/demo/AddConnectionModal';
import AddTableModal from '../components/demo/AddTableModal';
import ConfirmationModal from '../components/demo/ConfirmationModal';
import SignOutModal from '../components/demo/SignOutModal';
import ReportModal from '../components/demo/ReportModal';
import AssistantTablePreview from '../components/demo/AssistantTablePreview';
import TrustPanel from '../components/trust/TrustPanel';
import AnalystAnswers from '../components/trust/AnalystAnswers';
import AppSidebar from '../components/demo/AppSidebar';
import EmptyChatState from '../components/demo/EmptyChatState';

import {
  fetchModels,
  fetchConnections,
  fetchCatalog,
  fetchExploreSuggestions,
  cancelAgentRun,
  executeCustomSql,
  fetchSavedQueries,
  saveQuery,
  fetchConversations,
  fetchConversation,
  deleteConversation,
  reportChatMessage,
} from '../services/api';
import { connectNewRunEventStream } from '../services/sse';

function normalizeDraftSql(value) {
  return value
    .replace(/^\s*```(?:sql)?\s*/i, '')
    .replace(/\s*```\s*$/i, '');
}

const ConversationAssistantMessage = React.memo(function ConversationAssistantMessage({ message, isDark = false, canApprove = false }) {
  const payload = message.payload || {};
  const isSqlQuery = payload.is_sql_query !== false;
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  const columns = Array.isArray(payload.columns) ? payload.columns : [];
  const [reportState, setReportState] = useState('idle');
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const tableContainerRef = useRef(null);

  const handleScrollToTable = useCallback(() => {
    if (tableContainerRef.current) {
      tableContainerRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, []);

  const handleSubmitReport = async ({ category, note }) => {
    if (!message.id) return;
    setReportState('sending');
    try {
      await reportChatMessage(message.id, { category, note });
      setReportState('reported');
    } catch (error) {
      setReportState('error');
      throw error;
    }
  };

  return (
    <div className="py-4 space-y-3">
      {isSqlQuery && <RunSteps events={(payload.stream_events || []).map((e) => normalizeStreamEvent(e))} sql={message.sql} isDark={isDark} />}
      <div className="ai-response-text">
        <MarkdownContent content={message.content} isDark={isDark} />
      </div>
      {payload.verification && (
        <TrustPanel
          verification={payload.verification}
          dataSent={payload.data_sent}
          runId={String(message.id || '').replace(/^msg_/, '')}
          isDark={isDark}
          canApprove={canApprove}
        />
      )}
      {isSqlQuery && payload.reasoning && (
        <details
          className={`rounded-xl border px-3.5 py-2 text-xs transition-all ${
            isDark
              ? 'border-indigo-900/60 bg-[#161a29] text-slate-200'
              : 'border-indigo-100/80 bg-gradient-to-br from-indigo-50/60 to-purple-50/40 text-slate-700'
          }`}
        >
          <summary
            className={`cursor-pointer font-semibold ${
              isDark ? 'text-indigo-400 hover:text-indigo-300' : 'text-indigo-600 hover:text-indigo-700'
            }`}
          >
            Reasoning output
          </summary>
          <p
            className={`mt-2 whitespace-pre-wrap leading-relaxed font-mono text-[11px] ${
              isDark ? 'text-slate-300' : 'text-slate-600'
            }`}
          >
            {payload.reasoning}
          </p>
        </details>
      )}
      {payload.chart && rows.length > 0 && !['clarify', 'handoff'].includes(payload.verification?.outcome) && (
        <VisualizationStudio
          rows={rows}
          columns={columns}
          columnTypes={Array.isArray(payload.column_types) ? payload.column_types : []}
          chartRecommendation={payload.chart}
          recommendation={payload.chart}
          isLoading={false}
          isDark={isDark}
          onSwitchToTable={columns.length > 0 ? handleScrollToTable : undefined}
        />
      )}
      {/* A single number is already shown as the headline; the table would only repeat it. */}
      {/* A query that returns fixed text instead of reading data has no result worth showing. */}
      {columns.length > 0 && !(payload.verification?.findings || []).some((f) => /does not read any data/i.test(f.title || '')) && !(rows.length === 1 && payload.chart?.type === 'kpi' && !['clarify', 'handoff'].includes(payload.verification?.outcome)) && (
        <div ref={tableContainerRef}>
          {['clarify', 'handoff'].includes(payload.verification?.outcome) && (
            <p className={`mb-1.5 text-[11px] font-medium ${isDark ? 'text-amber-300' : 'text-amber-700'}`}>
              Unconfirmed result, shown for reference only.
            </p>
          )}
          <AssistantTablePreview
            columns={columns}
            rows={rows}
            rowCount={payload.row_count}
            isTruncated={payload.is_truncated}
            isDark={isDark}
          />
        </div>
      )}
      {message.sql && (
        <SqlEditorPanel sql={message.sql} isExecuting={false} isDark={isDark} />
      )}
      {payload.reportable !== false && (
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => {
              if (reportState !== 'reported' && reportState !== 'sending') {
                setReportModalOpen(true);
              }
            }}
            disabled={reportState === 'sending' || reportState === 'reported'}
            title={reportState === 'reported' ? 'Sent to the analyst review queue' : 'Flag this answer for an analyst to review'}
            className={`inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-medium transition-colors disabled:cursor-default ${
              reportState === 'reported'
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-900/60 font-semibold'
                : reportState === 'sending'
                ? 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800/80 dark:hover:text-slate-200'
            }`}
          >
            {reportState === 'reported' ? (
              <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            ) : reportState === 'sending' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Flag className="h-3.5 w-3.5" />
            )}
            {reportState === 'sending' ? 'Sending...' : reportState === 'reported' ? 'Sent to review' : 'Flag this number'}
          </button>
          {reportState === 'error' && (
            <span className="text-[11px] text-red-600 dark:text-red-400">Could not send report. Try again.</span>
          )}

          <ReportModal
            isOpen={reportModalOpen}
            onClose={() => setReportModalOpen(false)}
            message={message}
            onSubmit={handleSubmitReport}
            isDark={isDark}
          />
        </div>
      )}
    </div>
  );
});

// v2: the default moved to three compared queries, the setting the evaluation measured.
const EFFORT_STORAGE_KEY = 'slayql_thinking_effort_v2';

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

export default function LiveDemoView({ setView, session, onLogout, onSessionUpdate, theme: propTheme, setTheme: propSetTheme }) {
  // --- Infrastructure & Metadata State ---
  const [models, setModels] = useState([]);
  // Empty until the server's model list arrives; the first model is the default.
  const [selectedModelId, setSelectedModelId] = useState('');
  const [thinkingEffort, setThinkingEffort] = useState(() => {
    try {
      const stored = localStorage.getItem(EFFORT_STORAGE_KEY);
      return THINKING_EFFORT_LEVELS.some((level) => level.id === stored) ? stored : 'medium';
    } catch {
      return 'medium';
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
  // Like other chat apps: closed by default on phones; on larger screens the last choice is remembered.
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === 'undefined') return true;
    if (!window.matchMedia('(min-width: 768px)').matches) return false;
    return localStorage.getItem('slayql_sidebar_open') !== 'false';
  });
  useEffect(() => {
    if (window.matchMedia('(min-width: 768px)').matches) localStorage.setItem('slayql_sidebar_open', String(sidebarOpen));
  }, [sidebarOpen]);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [savedQueriesOpen, setSavedQueriesOpen] = useState(false);
  const [explorePopOpen, setExplorePopOpen] = useState(false);
  const [explorePopPosition, setExplorePopPosition] = useState({ top: 0, left: 0 });
  const [profileOpen, setProfileOpen] = useState(false);
  const [addConnectionOpen, setAddConnectionOpen] = useState(false);
  const [addTableOpen, setAddTableOpen] = useState(false);
  const [dbDropdownOpen, setDbDropdownOpen] = useState(false);
  const dbDropdownRef = useRef(null);
  // The data-source menu closes on an outside click or Escape, like the model menu.
  useEffect(() => {
    if (!dbDropdownOpen) return undefined;
    const onDown = (e) => { if (dbDropdownRef.current && !dbDropdownRef.current.contains(e.target)) setDbDropdownOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setDbDropdownOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [dbDropdownOpen]);
  const [localTheme, setLocalTheme] = useState(() => {
    try {
      return localStorage.getItem('slayql_theme') || 'light';
    } catch {
      return 'light';
    }
  });
  const theme = propTheme || localTheme;
  const setTheme = propSetTheme || setLocalTheme;

  const userName = session?.user?.name || 'Enterprise Reviewer';
  const userRole = session?.user?.role || 'Lead Architect';
  const canReview = ['owner', 'analyst'].includes(session?.user?.access_role);
  const avatarInitials = session?.user?.avatar_initials || 'ER';

  const [messages, setMessages] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [loadingThreadId, setLoadingThreadId] = useState(null);
  const [inputPrompt, setInputPrompt] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [currentRunId, setCurrentRunId] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);

  const threadCacheRef = useRef(new Map());

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
  const [activeThinkingLabel, setActiveThinkingLabel] = useState('');
  const [activeStartedAt, setActiveStartedAt] = useState(null);
  const [composerFocused, setComposerFocused] = useState(false);

  const activeStreamRef = useRef(null);
  const activeStreamEventsRef = useRef([]);
  const historyRefreshTimeoutRef = useRef(null);
  const chatBottomRef = useRef(null);
  const composerRef = useRef(null);
  const exploreButtonRef = useRef(null);
  const explorePopTimeoutRef = useRef(null);
  const exploreRequestRef = useRef(0);
  const catalogRequestRef = useRef(0);
  const selectedConnectionRef = useRef(selectedConnectionId);
  const reasoningScrollRef = useRef(null);

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
      localStorage.setItem(EFFORT_STORAGE_KEY, thinkingEffort);
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

  useEffect(() => () => {
    activeStreamRef.current?.close();
    if (historyRefreshTimeoutRef.current) {
      window.clearTimeout(historyRefreshTimeoutRef.current);
    }
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

  // On a direct visit the reviewer sign-in finishes after this view mounts, so
  // load workspace data once a session token exists, and again if it changes.
  const sessionToken = session?.token || null;
  useEffect(() => {
    if (!sessionToken) return undefined;
    let active = true;
    async function init() {
      try {
        // Saved queries load on their own so they never hold up the database view.
        fetchSavedQueries()
          .then((saved) => { if (active) setSavedQueries(saved); })
          .catch(() => {});
        const [modelsResult, connsResult] = await Promise.allSettled([
          fetchModels(),
          fetchConnections(),
        ]);
        if (!active) return;
        const modelsData = modelsResult.status === 'fulfilled' ? modelsResult.value : [];
        const connsData = connsResult.status === 'fulfilled' ? connsResult.value : [];
        if (modelsResult.status === 'fulfilled') setModels(modelsData);
        if (connsResult.status === 'fulfilled') setConnections(connsData);
        if (modelsData.length > 0 && !selectedModelId) {
          setSelectedModelId(modelsData[0].id);
        }
        const defaultConnection = connsData.find((connection) => connection.is_default) || connsData[0];
        if (defaultConnection) {
          setSelectedConnectionId(defaultConnection.id);
          // Structure, suggestions and chat history load together (all usually cached by the warm-up).
          await Promise.all([
            loadCatalog(defaultConnection.id),
            loadExploreSuggestions(defaultConnection.id),
            loadHistory(),
          ]);
        } else {
          await Promise.all([loadCatalog(null), loadExploreSuggestions(null), loadHistory()]);
        }
      } catch (err) {
        console.warn('Init error:', err);
      }
    }
    init();
    return () => { active = false; };
  }, [sessionToken, loadCatalog, loadExploreSuggestions, loadHistory]);

  const activeConnection = connections.find((c) => c.id === selectedConnectionId) || {
    id: null,
    name: 'No data source',
    engine: null,
    table_count: 0,
  };



  const selectedModel = models.find((m) => m.id === selectedModelId) || models[0] || {
    name: 'Default model',
    provider: 'AI model',
  };

  useEffect(() => {
    // New user turns should be visible; streamed stage updates must not move
    // the reader's viewport while they inspect the current step.
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-scroll reasoning panel as tokens stream in
  useEffect(() => {
    const el = reasoningScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [activeReasoning]);

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
    activeStreamRef.current = null;
    activeStreamEventsRef.current = [];
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
    setActiveIsTruncated(false);
    setActiveExecutionTimeMs(0);
    setActiveChartRecommendation(null);
    setActiveTokenUsage(null);
    setActiveReasoning('');
    setActiveAnswer('');
    setActiveIsSqlQuery(null);
    setActiveStreamEvents([]);
    setActiveThinkingLabel('');
    setActiveStartedAt(null);
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
    if (id === conversationId && !loadingThreadId) return;
    setErrorMessage(null);

    // 1. Instant optimistic selection (0ms latency visual feedback)
    setConversationId(id);
    setLoadingThreadId(id);

    // 2. Immediately terminate any active stream & clear ephemeral state
    if (activeStreamRef.current) activeStreamRef.current.close();
    activeStreamRef.current = null;
    activeStreamEventsRef.current = [];

    setCurrentRunId(null);
    setActiveStages({});
    setActiveStageKey(null);
    setActiveSql('');
    setActiveChecks([]);
    setActiveColumns([]);
    setActiveColumnTypes([]);
    setActiveRows([]);
    setActiveIsTruncated(false);
    setActiveExecutionTimeMs(0);
    setActiveChartRecommendation(null);
    setActiveTokenUsage(null);
    setActiveReasoning('');
    setActiveAnswer('');
    setActiveIsSqlQuery(null);
    setActiveStreamEvents([]);
    setActiveThinkingLabel('');
    setActiveStartedAt(null);

    // 3. Instant Cache Hit (SWR pattern)
    const cached = threadCacheRef.current.get(id);
    if (cached) {
      setMessages(cached.messages);
      if (cached.selected_model_id) setSelectedModelId(cached.selected_model_id);
      if (cached.connection_id && cached.connection_id !== selectedConnectionRef.current) {
        setSelectedConnectionId(cached.connection_id);
        loadCatalog(cached.connection_id).catch(() => {});
        loadExploreSuggestions(cached.connection_id).catch(() => {});
      }
      setLoadingThreadId(null);
    } else {
      // Clear previous messages so user doesn't see old thread contents during fetch
      setMessages([]);
    }

    try {
      const thread = await fetchConversation(id);
      const formattedMessages = (thread.messages || []).map((message) => ({
        ...message,
        sender: message.role,
        createdAt: new Date(message.created_at),
      }));

      // Cache thread in memory for instantaneous subsequent clicks
      threadCacheRef.current.set(id, {
        ...thread,
        messages: formattedMessages,
      });

      setMessages(formattedMessages);
      if (thread.selected_model_id) setSelectedModelId(thread.selected_model_id);
      if (thread.connection_id && thread.connection_id !== selectedConnectionRef.current) {
        setSelectedConnectionId(thread.connection_id);
        loadCatalog(thread.connection_id).catch(() => {});
        loadExploreSuggestions(thread.connection_id).catch(() => {});
      }
    } catch (err) {
      if (!cached) {
        setErrorMessage(err.message || 'Failed to load conversation.');
      }
    } finally {
      setLoadingThreadId(null);
    }
  }, [conversationId, loadingThreadId, loadCatalog, loadExploreSuggestions]);

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
    // Wait for the orchestrator to delegate to the SQL agent before showing
    // the detailed SQL/reasoning workspace.
    setActiveIsSqlQuery(null);
    activeStreamEventsRef.current = [];
    setActiveStreamEvents([]);
    setActiveStartedAt(Date.now());
    setActiveResultTab('chart');
    setActiveThinkingLabel('');

    try {
      let runData = null;
      let runId = null;
      if (activeStreamRef.current) activeStreamRef.current.close();

      const stream = connectNewRunEventStream({
        question: queryText,
        modelId: selectedModelId,
        connectionId: selectedConnectionId,
        conversationId,
        thinkingEffort,
      }, {
        onCreated: (createdRunData) => {
          runData = createdRunData;
          runId = createdRunData.run_id;
          setCurrentRunId(runId);
          setConversationId(createdRunData.conversation_id);
          if (createdRunData.initial_answer) {
            setActiveAnswer(createdRunData.initial_answer);
            setActiveIsSqlQuery(createdRunData.initial_is_sql_query !== false);
          }
          if (typeof createdRunData.credits_remaining === 'number') {
            setCreditBalance(createdRunData.credits_remaining);
            onSessionUpdate?.({
              ...session,
              user: { ...session.user, credits: createdRunData.credits_remaining },
            });
          }
          setHistoryList((current) => [
            {
              id: createdRunData.conversation_id,
              prompt: queryText,
              selected_model_id: selectedModelId,
              model_id: selectedModelId,
              connection_id: selectedConnectionId,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            ...current.filter((item) => item.id !== createdRunData.conversation_id),
          ]);
        },
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
          const nextStreamEvents = [
            ...activeStreamEventsRef.current,
            normalizeStreamEvent(evt, type),
          ].slice(-240);
          activeStreamEventsRef.current = nextStreamEvents;
          setActiveStreamEvents(nextStreamEvents);

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
                  type === 'execution.started' ||
                  type === 'orchestrator.tool_call.started'
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
                  type === 'orchestrator.tool_call.completed' ||
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

          if (type === 'provider.content_delta' && payload?.phase === 'sql') {
            setActiveIsSqlQuery(true);
            setActiveThinkingLabel('Drafting SQL\u2026');
            setActiveSql((current) => normalizeDraftSql(`${current}${payload.delta || ''}`));
          } else if (type === 'provider.usage_finalized' && payload?.usage) {
            setActiveTokenUsage(payload.usage);
          } else if ((type === 'provider.completed' || type === 'orchestrator.provider.completed') && payload?.token_usage) {
            setActiveTokenUsage(payload.token_usage);
          } else if (
            type === 'provider.reasoning_delta' ||
            type === 'provider.reasoning_detail' ||
            type === 'orchestrator.reasoning_delta'
          ) {
            setActiveReasoning((current) => `${current}${payload.delta || ''}`.slice(-12000));
          } else if (type === 'intent.validator_started') {
            setActiveThinkingLabel('Classifying your question\u2026');
          } else if (type === 'intent.validator_completed') {
            if (typeof payload.is_sql_query === 'boolean') {
              if (!payload.is_sql_query) {
                setActiveIsSqlQuery(false);
                setActiveThinkingLabel('Generating response\u2026');
              } else {
                setActiveThinkingLabel('Selecting the SQL agent\u2026');
              }
            }
          } else if (type === 'orchestrator.tool_call.started') {
            if (payload.tool === 'sql_agent') {
              setActiveIsSqlQuery(true);
              setActiveThinkingLabel('SQL agent is working\u2026');
            } else {
              setActiveIsSqlQuery(false);
              setActiveThinkingLabel('Reading the verified catalog\u2026');
            }
          } else if (type === 'provider.request_started') {
            setActiveThinkingLabel('Generating response\u2026');
          } else if (type === 'assistant.delta' || type === 'orchestrator.response_delta') {
            setActiveThinkingLabel('');
            setActiveAnswer((current) => {
              const delta = payload.delta || '';
              return payload.mode === 'local_heuristic' && current === delta ? current : `${current}${delta}`;
            });
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
        onComplete: (_type, event) => {
          const terminalPayload = event?.payload && typeof event.payload === 'object'
            ? event.payload
            : {};
          const completedConversationId = event?.conversation_id || runData?.conversation_id;
          const terminalStatus = terminalPayload.status
            || (_type === 'run.completed' ? 'success' : _type === 'run.cancelled' ? 'cancelled' : 'failed');
          const content = terminalPayload.answer
            || terminalPayload.error
            || (_type === 'run.cancelled'
              ? 'This run was cancelled before it completed.'
              : 'The agent run failed before it produced a response.');
          const finalPayload = {
            ...terminalPayload,
            status: terminalStatus,
            is_sql_query: terminalPayload.is_sql_query ?? false,
            stream_events: activeStreamEventsRef.current,
          };

          setMessages((current) => {
            const assistantMessage = {
              id: `msg_${runId}`,
              conversation_id: completedConversationId,
              role: 'assistant',
              sender: 'assistant',
              content,
              sql: terminalPayload.sql || null,
              payload: finalPayload,
              created_at: new Date().toISOString(),
              createdAt: new Date(),
            };
            return [
              ...current.filter((message) => message.id !== assistantMessage.id),
              assistantMessage,
            ];
          });

          setIsRunning(false);
          setCurrentRunId(null);
          setActiveStageKey(null);
          setActiveStages({});
          setActiveSql('');
          setActiveChecks([]);
          setActiveColumns([]);
          setActiveColumnTypes([]);
          setActiveRows([]);
          setActiveIsTruncated(false);
          setActiveExecutionTimeMs(0);
          setActiveChartRecommendation(null);
          setActiveTokenUsage(null);
          setActiveReasoning('');
          setActiveAnswer('');
          setActiveIsSqlQuery(null);
          setActiveThinkingLabel('');
          setActiveStartedAt(null);
          setActiveStreamEvents([]);
          activeStreamEventsRef.current = [];
          activeStreamRef.current = null;

          if (historyRefreshTimeoutRef.current) {
            window.clearTimeout(historyRefreshTimeoutRef.current);
          }
          historyRefreshTimeoutRef.current = window.setTimeout(() => {
            historyRefreshTimeoutRef.current = null;
            loadHistory();
          }, 1000);
        },
        onError: (err) => {
          console.warn('Stream error:', err);
          setErrorMessage(err.message || 'The agent stream failed.');
          setIsRunning(false);
        },
      });
      activeStreamRef.current = stream;
      await stream.started;
    } catch (err) {
      setErrorMessage(err.message || 'Failed to initialize agent run.');
      setIsRunning(false);
    }
  }, [inputPrompt, isRunning, selectedModelId, selectedConnectionId, conversationId, thinkingEffort, loadHistory, onSessionUpdate, session]);

  const handleCancelRun = async () => {
    if (currentRunId) {
      await cancelAgentRun(currentRunId);
    }
    if (activeStreamRef.current) activeStreamRef.current.close();
    setIsRunning(false);
    setActiveStageKey(null);
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
      <AppSidebar
        theme={theme}
        setTheme={setTheme}
        open={sidebarOpen}
        setOpen={setSidebarOpen}
        session={session}
        userName={userName}
        avatarInitials={avatarInitials}
        creditBalance={creditBalance}
        canReview={canReview}
        onNewChat={handleNewThread}
        setView={setView}
        onOpenCatalog={() => setCatalogOpen(true)}
        tableCount={catalog ? Object.keys(catalog.tables || {}).length : 0}
        onOpenSaved={() => setSavedQueriesOpen(true)}
        savedCount={savedQueries.length}
        exploreRef={exploreButtonRef}
        exploreCount={exploreSuggestions.length}
        onExploreEnter={handleExploreMouseEnter}
        onExploreLeave={handleExploreMouseLeave}
        onExploreToggle={() => (explorePopOpen ? setExplorePopOpen(false) : handleExploreMouseEnter())}
        history={historyList}
        activeId={conversationId}
        onOpenChat={loadConversationThread}
        loadingId={loadingThreadId}
        onDeleteChat={setHistoryDeleteTarget}
        deletingId={deletingHistoryId}
        isRunning={isRunning}
        profileOpen={profileOpen}
        setProfileOpen={setProfileOpen}
        onSignOut={() => setSignOutOpen(true)}
      />

      {/* ─── Main Chat Area ─── */}
      <div className="flex-1 min-w-0 flex flex-col h-screen overflow-hidden bg-[#f7f9fc]">
        {/* Top Minimalist Header */}
        <header className="min-h-14 border-b border-slate-200/70 px-4 sm:px-6 flex items-center justify-between gap-4 z-20 bg-white/95 backdrop-blur-sm">
          <div className="flex items-center gap-2 min-w-0">
            {!sidebarOpen && (
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="md:hidden p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200/80 hover:border-slate-300 bg-white shadow-2xs transition-all duration-200 mr-1.5 flex items-center justify-center animate-scale-in hover:scale-105 active:scale-95"
                title="Open Sidebar (Ctrl+B)"
                aria-label="Open Sidebar"
              >
                <PanelLeftOpen className="w-4 h-4 text-slate-600 hover:text-indigo-600 transition-colors" />
              </button>
            )}

            {/* Database Selector Pill */}
            <div className="relative" ref={dbDropdownRef}>
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
                <div className={`absolute left-0 z-50 mt-2 w-72 rounded-2xl border p-1.5 shadow-[0_24px_60px_-20px_rgba(15,23,42,0.45)] slide-in-up ${theme === 'dark' ? 'border-slate-700 bg-[#171c2b]' : 'border-slate-200 bg-white'}`}>
                  <p className={`px-2.5 pb-1 pt-1.5 text-[11px] font-medium ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>Data sources</p>
                  <div className="space-y-0.5">
                    {connections.length === 0 && <p className={`px-2.5 py-2 text-xs ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>No data sources added</p>}
                    {connections.map((c) => {
                      const selected = selectedConnectionId === c.id;
                      const failed = c.status === 'error';
                      return (
                        <button
                          key={c.id}
                          title={failed ? (c.catalog_error || 'Database file is unavailable on this deployment.') : c.name}
                          onClick={() => {
                            if (c.id !== selectedConnectionId) handleNewThread();
                            setSelectedConnectionId(c.id);
                            loadCatalog(c.id);
                            loadExploreSuggestions(c.id);
                            setDbDropdownOpen(false);
                          }}
                          className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition ${
                            selected
                              ? theme === 'dark' ? 'bg-indigo-500/15' : 'bg-indigo-50'
                              : theme === 'dark' ? 'hover:bg-white/5' : 'hover:bg-slate-50'
                          }`}
                        >
                          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${failed ? 'bg-rose-500/10 text-rose-500' : theme === 'dark' ? 'bg-emerald-400/10 text-emerald-300' : 'bg-emerald-50 text-emerald-700'}`}>
                            <Database className="h-4 w-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className={`block truncate text-[13px] font-medium ${selected ? (theme === 'dark' ? 'text-indigo-200' : 'text-indigo-900') : (theme === 'dark' ? 'text-slate-100' : 'text-slate-800')}`}>{c.name}</span>
                            <span className={`block truncate text-[11px] ${failed ? 'text-rose-500' : theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
                              {failed ? 'Unavailable' : [c.engine, typeof c.table_count === 'number' ? `${c.table_count} tables` : null].filter(Boolean).join(' · ')}
                            </span>
                          </span>
                          {selected && <Check className={`h-4 w-4 shrink-0 ${theme === 'dark' ? 'text-indigo-300' : 'text-indigo-600'}`} />}
                        </button>
                      );
                    })}
                  </div>

                  <div className={`mt-1.5 flex flex-col gap-0.5 border-t pt-1.5 ${theme === 'dark' ? 'border-slate-700' : 'border-slate-100'}`}>
                    {[
                      { icon: Layers, label: 'Manage data sources', action: () => setView('databases') },
                      { icon: Database, label: 'Add database connection', action: () => setAddConnectionOpen(true) },
                    ].filter(Boolean).map(({ icon: Icon, label, action }) => (
                      <button
                        key={label}
                        onClick={() => { setDbDropdownOpen(false); action(); }}
                        className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition ${theme === 'dark' ? 'text-slate-200 hover:bg-white/5' : 'text-slate-700 hover:bg-slate-50'}`}
                      >
                        <Icon className={`h-4 w-4 ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`} />
                        <span>{label}</span>
                      </button>
                    ))}
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
            {/* Thread Loading Skeleton (Zero-lag transition) */}
            {loadingThreadId && messages.length === 0 && (
              <div className="w-full space-y-5 py-4 animate-pulse">
                <div className="flex justify-end">
                  <div className={`w-3/5 h-11 rounded-2xl rounded-tr-xs ${theme === 'dark' ? 'bg-slate-800/80' : 'bg-indigo-100/70'}`} />
                </div>
                <div className="space-y-3">
                  <div className={`w-3/4 h-4 rounded-md ${theme === 'dark' ? 'bg-slate-800/60' : 'bg-slate-200/80'}`} />
                  <div className={`w-full h-28 rounded-xl ${theme === 'dark' ? 'bg-slate-800/40' : 'bg-slate-200/50'}`} />
                  <div className={`w-1/2 h-4 rounded-md ${theme === 'dark' ? 'bg-slate-800/60' : 'bg-slate-200/80'}`} />
                </div>
              </div>
            )}

            {/* Empty Conversation Welcome State */}
            {messages.length === 0 && !isRunning && !loadingThreadId && (
              <EmptyChatState />
            )}

            {/* Conversation Messages */}
            {messages.map((msg) => (
              <div key={msg.id} className="w-full">
                {msg.sender === 'user' ? (
                  <div className="flex justify-end py-2">
                    <div className="user-chat-bubble px-4 py-3 rounded-2xl rounded-tr-sm text-sm leading-relaxed shadow-sm max-w-xl text-left">
                      {msg.content}
                    </div>
                  </div>
                ) : (
                  <ConversationAssistantMessage message={msg} isDark={theme === 'dark'} canApprove={canReview} />
                )}
              </div>
            ))}

            {/* Active SlayQL Agent Turn */}
            {(isRunning || activeAnswer || activeSql || activeRows.length > 0 || Object.keys(activeStages).length > 0) && (
              <div className="w-full space-y-3 animate-fade-in-up">
                <div className="flex-1 space-y-3 min-w-0">
                    {activeIsSqlQuery === true && isRunning && (
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                        <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">Thinking…</span>
                      </div>
                    )}

                    {/* Thinking Process */}
                    {activeIsSqlQuery === true && (
                      <>
                        <RunSteps events={activeStreamEvents} isRunning={isRunning} sql={activeSql} isDark={theme === 'dark'} />
                      </>
                    )}

                    {activeIsSqlQuery !== true && isRunning && !activeAnswer && (
                      <div className="space-y-3">
                        <div className="thinking-status-row">
                          <span className="thinking-dot" />
                          <span className="thinking-label">
                            {activeThinkingLabel || 'Understanding your question\u2026'}
                          </span>
                        </div>
                        {activeReasoning && (
                          <div className="reasoning-stream-panel">
                            <div className="reasoning-stream-header">
                              <span className="reasoning-stream-orb" />
                              <span>Reasoning</span>
                            </div>
                            <div className="reasoning-stream-body" ref={reasoningScrollRef}>
                              {activeReasoning}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {activeAnswer && (
                      <div className="space-y-2">
                        <div className="ai-response-text">
                          <MarkdownContent content={activeAnswer} isDark={theme === 'dark'} />
                        </div>
                        {activeIsSqlQuery === false && activeReasoning && (
                          <details className="reasoning-collapsed">
                            <summary className="reasoning-collapsed-summary">View reasoning</summary>
                            <div className="reasoning-collapsed-body">{activeReasoning}</div>
                          </details>
                        )}
                      </div>
                    )}

                    {/* Generated SQL Code Block */}
                    {activeIsSqlQuery === true && activeSql && (
                      <SqlEditorPanel
                        sql={activeSql}
                        validationChecks={activeChecks}
                        onExecuteEditedSql={handleExecuteEditedSql}
                        onSaveQuery={handleSaveQuery}
                        isExecuting={isRunning}
                      />
                    )}

                    {/* Results Studio (Chart / Table) */}
                    {activeIsSqlQuery === true && (activeRows.length > 0 || isRunning) && (
                      <div className="rounded-2xl border border-slate-200/90 bg-white p-4 space-y-3 shadow-xs">
                        {/* Minimalist Tabs Header */}
                        <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setActiveResultTab('chart')}
                              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                                activeResultTab === 'chart'
                                  ? 'bg-indigo-600 text-white shadow-xs'
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
                                  ? 'bg-indigo-600 text-white shadow-xs'
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
                            onSwitchToTable={() => setActiveResultTab('table')}
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
                    isDark={theme === 'dark'}
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
