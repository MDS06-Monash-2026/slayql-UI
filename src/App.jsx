import React, { useState, useEffect } from 'react';
import LandingView from './views/LandingView';
import LiveDemoView from './views/LiveDemoView';
import LoginView from './views/LoginView';
import OnboardingView from './views/OnboardingView';
import DashboardView from './views/DashboardView';
import ProfileView from './views/ProfileView';
import DatabaseCenterView from './views/DatabaseCenterView';
import { getStoredSession, logout, setStoredSession } from './services/api';

export default function App() {
  const [view, setView] = useState('landing'); // 'landing' | 'login' | 'demo' | 'onboarding' | 'dashboard'
  const [session, setSession] = useState(() => getStoredSession());
  const [activeDatabase, setActiveDatabase] = useState('sqlite_demo');

  const handleDatabaseConnect = (dbName) => {
    setActiveDatabase(dbName);
  };

  const handleTryDemoClick = () => {
    if (session && session.user) {
      setView('demo');
    } else {
      setView('login');
    }
  };

  const handleLogout = async () => {
    await logout();
    setSession(null);
    setView('landing');
  };

  const handleSessionUpdate = (updatedSession) => {
    setSession(updatedSession);
    setStoredSession(updatedSession);
  };

  return (
    <>
      {view === 'landing' && (
        <LandingView 
          setView={(target) => {
            if (target === 'demo') {
              handleTryDemoClick();
            } else {
              setView(target);
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
          setView={setView}
          onLoginSuccess={(newSession) => {
            setSession(newSession);
            setView('demo');
          }}
        />
      )}
      {view === 'demo' && (
        session ? (
          <LiveDemoView
            setView={setView}
            session={session}
            onLogout={handleLogout}
            onSessionUpdate={handleSessionUpdate}
          />
        ) : (
          <LoginView
            setView={setView}
            onLoginSuccess={(newSession) => {
              setSession(newSession);
              setView('demo');
            }}
          />
        )
      )}
      {view === 'onboarding' && (
        <OnboardingView 
          setView={setView} 
          onDatabaseConnect={handleDatabaseConnect} 
        />
      )}
      {view === 'dashboard' && (
        <DashboardView 
          setView={setView} 
          activeDatabase={activeDatabase} 
          setActiveDatabase={handleDatabaseConnect}
        />
      )}
      {view === 'profile' && session && (
        <ProfileView setView={setView} session={session} onSessionUpdate={handleSessionUpdate} onLogout={handleLogout} />
      )}
      {view === 'databases' && session && (
        <DatabaseCenterView setView={setView} session={session} />
      )}
    </>
  );
}
