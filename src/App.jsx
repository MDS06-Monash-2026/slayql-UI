import React, { useState, useEffect } from 'react';
import LandingView from './views/LandingView';
import LiveDemoView from './views/LiveDemoView';
import LoginView from './views/LoginView';
import OnboardingView from './views/OnboardingView';
import DashboardView from './views/DashboardView';
import ProfileView from './views/ProfileView';
import DatabaseCenterView from './views/DatabaseCenterView';
import WorkspaceWarmupOverlay from './components/common/WorkspaceWarmupOverlay';
import {
  fetchSession,
  getStoredSession,
  logout,
  setStoredSession,
  loginOrganization,
  fetchConversations,
  fetchConnections,
  fetchModels,
  fetchCatalog,
  fetchExploreSuggestions,
  fetchCredits,
} from './services/api';

const SLUG_TO_VIEW = {
  '': 'landing',
  '/': 'landing',
  '/landing': 'landing',
  '/login': 'login',
  '/app': 'demo',
  '/demo': 'demo',
  '/live-demo': 'demo',
  '/database-lab': 'databases',
  '/database-lab/workbench': 'databases',
  '/database-lab/tables': 'databases',
  '/database-lab/relationships': 'databases',
  '/database-lab/dashboard': 'databases',
  '/database-lab/health': 'databases',
  '/database-lab/er-diagram': 'databases',
  '/database-lab/ai-report-studio': 'databases',
  '/databases': 'databases',
  '/lab': 'databases',
  '/ai-database-lab': 'databases',
  '/profile': 'profile',
  '/onboarding': 'onboarding',
  '/dashboard': 'dashboard',
};

const VIEW_TO_SLUG = {
  landing: '/',
  login: '/login',
  demo: '/app',
  databases: '/database-lab',
  profile: '/profile',
  onboarding: '/onboarding',
  dashboard: '/dashboard',
};

function getViewFromLocation() {
  const hash = window.location.hash.replace(/^#\/?/, '/');
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  const target = (hash || path).toLowerCase();
  if (target.startsWith('/database-lab') || target.startsWith('/databases') || target.startsWith('/lab') || target.startsWith('/ai-database-lab')) {
    return 'databases';
  }
  if (target.startsWith('/app') || target.startsWith('/demo') || target.startsWith('/live-demo')) {
    return 'demo';
  }
  if (target.startsWith('/profile')) {
    return 'profile';
  }
  if (target.startsWith('/login')) {
    return 'login';
  }
  if (target.startsWith('/onboarding')) {
    return 'onboarding';
  }
  if (target.startsWith('/dashboard')) {
    return 'dashboard';
  }
  return SLUG_TO_VIEW[hash] || SLUG_TO_VIEW[path] || 'landing';
}

export default function App() {
  const [view, setView] = useState(() => getViewFromLocation());
  const [session, setSession] = useState(() => getStoredSession());
  const [activeDatabase, setActiveDatabase] = useState('sqlite_demo');
  const [isWarmingUp, setIsWarmingUp] = useState(false);
  const [warmupStage, setWarmupStage] = useState('');
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('slayql_theme') || 'light';
    } catch {
      return 'light';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('slayql_theme', theme);
      if (theme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    } catch {}
  }, [theme]);

  const changeView = (targetView, replace = false) => {
    setView(targetView);
    const targetSlug = VIEW_TO_SLUG[targetView] || (targetView.startsWith('/') ? targetView : `/${targetView}`);
    if (window.location.pathname !== targetSlug) {
      try {
        if (replace) {
          window.history.replaceState({ view: targetView }, '', targetSlug);
        } else {
          window.history.pushState({ view: targetView }, '', targetSlug);
        }
      } catch {
        // Fallback for sandboxed browser contexts
      }
    }
  };

  useEffect(() => {
    const handlePopState = () => {
      const current = getViewFromLocation();
      setView(current);
    };
    window.addEventListener('popstate', handlePopState);
    window.addEventListener('hashchange', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('hashchange', handlePopState);
    };
  }, []);

  // Ensure session persistence across refresh on /app, /database-lab, /profile
  useEffect(() => {
    let active = true;
    const currentSession = getStoredSession();
    if (!currentSession && (view === 'demo' || view === 'databases' || view === 'profile')) {
      loginOrganization({ is_reviewer: true }).then((reviewerSession) => {
        if (!active) return;
        setSession(reviewerSession);
        setStoredSession(reviewerSession);
      }).catch(() => {});
    } else if (currentSession) {
      fetchSession().then((persistedSession) => {
        if (!active) return;
        if (persistedSession) {
          setSession(persistedSession);
          setStoredSession(persistedSession);
        }
      }).catch(() => {});
    }

    return () => { active = false; };
  }, [view]);

  const handleDatabaseConnect = (dbName) => {
    setActiveDatabase(dbName);
  };

  const handleTryDemoClick = async () => {
    setIsWarmingUp(true);
    setWarmupStage('Connecting demo reviewer credentials...');

    try {
      let activeSession = session;
      if (!activeSession || !activeSession.user) {
        activeSession = await loginOrganization({ is_reviewer: true });
        setSession(activeSession);
        setStoredSession(activeSession);
      }

      setWarmupStage('Loading recent chats & workspace state...');
      const [conversations, connections] = await Promise.all([
        fetchConversations({ force: true }).catch(() => []),
        fetchConnections({ force: true }).catch(() => []),
        fetchModels().catch(() => ({ models: [] })),
        fetchCredits().catch(() => ({ credits: 0 })),
      ]);

      setWarmupStage('Connecting database schema catalogs...');
      const defaultConn = connections.find((c) => c.is_default) || connections[0];
      if (defaultConn?.id) {
        await Promise.all([
          fetchCatalog(defaultConn.id, { force: true }).catch(() => null),
          fetchExploreSuggestions(defaultConn.id, { force: true }).catch(() => ({ suggestions: [] })),
        ]);
      }

      setWarmupStage('Launching AI workspace...');
      await new Promise((r) => setTimeout(r, 200));
      changeView('demo');
    } catch (err) {
      console.warn('Demo auto-launch fallback to login view:', err);
      changeView('login');
    } finally {
      setIsWarmingUp(false);
      setWarmupStage('');
    }
  };

  const handleLogout = async () => {
    await logout();
    setSession(null);
    changeView('landing');
  };

  const handleSessionUpdate = (updatedSession) => {
    setSession(updatedSession);
    setStoredSession(updatedSession);
  };

  return (
    <>
      {isWarmingUp && <WorkspaceWarmupOverlay stage={warmupStage} />}

      {view === 'landing' && (
        <LandingView 
          setView={(target) => {
            if (target === 'demo') {
              handleTryDemoClick();
            } else {
              changeView(target);
            }
          }}
          onDatabaseConnect={(dbName) => {
            handleDatabaseConnect(dbName);
            handleTryDemoClick();
          }}
        />
      )}
      {view === 'login' && (
        <LoginView
          setView={changeView}
          onLoginSuccess={(newSession) => {
            setSession(newSession);
            changeView('demo');
          }}
        />
      )}
      {view === 'demo' && (
        <LiveDemoView
          setView={changeView}
          session={session}
          onLogout={handleLogout}
          onSessionUpdate={handleSessionUpdate}
          theme={theme}
          setTheme={setTheme}
        />
      )}
      {view === 'onboarding' && (
        <OnboardingView 
          setView={changeView} 
          onDatabaseConnect={handleDatabaseConnect} 
        />
      )}
      {view === 'dashboard' && (
        <DashboardView 
          setView={changeView} 
          activeDatabase={activeDatabase} 
          setActiveDatabase={handleDatabaseConnect}
        />
      )}
      {view === 'profile' && (
        <ProfileView setView={changeView} session={session} onSessionUpdate={handleSessionUpdate} onLogout={handleLogout} theme={theme} setTheme={setTheme} />
      )}
      {view === 'databases' && (
        <DatabaseCenterView setView={changeView} session={session} theme={theme} setTheme={setTheme} />
      )}
    </>
  );
}
