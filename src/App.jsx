import React, { useState } from 'react';
import LandingView from './views/LandingView';
import OnboardingView from './views/OnboardingView';
import DashboardView from './views/DashboardView';

export default function App() {
  const [view, setView] = useState('landing'); // landing | onboarding | dashboard
  const [activeDatabase, setActiveDatabase] = useState('local_postgres_demo');

  const handleDatabaseConnect = (dbName) => {
    setActiveDatabase(dbName);
  };

  return (
    <>
      {view === 'landing' && (
        <LandingView 
          setView={setView} 
          onDatabaseConnect={(dbName) => {
            handleDatabaseConnect(dbName);
            setView('dashboard');
          }} 
        />
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
    </>
  );
}
