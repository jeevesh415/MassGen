import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import SetupPage from './pages/SetupPage';
import ArtifactTester from './pages/ArtifactTester';
import './styles/globals.css';

// Simple routing based on URL path with first-time setup detection
function Router() {
  const path = window.location.pathname;
  const [checkingSetup, setCheckingSetup] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);

  // Check if first-time setup is needed (only on root path)
  useEffect(() => {
    // Skip check if already on setup page or if URL has wizard=open (returning from setup)
    if (path === '/setup' || path === '/setup/') {
      setCheckingSetup(false);
      return;
    }

    // Skip redirect if wizard=open param is present (user finished setup and returned)
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('wizard') === 'open') {
      setCheckingSetup(false);
      return;
    }

    // Check setup status from API
    fetch('/api/setup/status')
      .then(res => res.json())
      .then(data => {
        if (data.needs_setup) {
          setNeedsSetup(true);
        }
        setCheckingSetup(false);
      })
      .catch(() => {
        // On error, proceed to app
        setCheckingSetup(false);
      });
  }, [path]);

  // Route to setup page explicitly
  if (path === '/setup' || path === '/setup/') {
    return <SetupPage />;
  }

  // Route to artifact tester page
  if (path === '/artifact-tester' || path === '/artifact-tester/') {
    return <ArtifactTester />;
  }

  // Show loading while checking setup status
  if (checkingSetup) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  // Redirect to setup if first-time user (skip for v2 — AppShell handles it)
  if (needsSetup) {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('v') !== '2') {
      window.location.href = '/setup';
      return (
        <div className="min-h-screen bg-gray-900 flex items-center justify-center">
          <div className="text-gray-400">Redirecting to setup...</div>
        </div>
      );
    }
  }

  // Default to main app
  return <App />;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Router />
  </React.StrictMode>
);
