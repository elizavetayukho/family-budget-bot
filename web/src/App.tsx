import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { api } from './lib/api';
import ToastContainer from './components/ToastContainer';
import NavBar from './components/NavBar';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Onboarding from './pages/Onboarding';
import Dashboard from './pages/Dashboard';
import Jars from './pages/Jars';
import Budget from './pages/Budget';
import History from './pages/History';
import Account from './pages/Account';
import Analytics from './pages/Analytics';

function AppRoutes() {
  const { user, loading } = useAuth();
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user) { setOnboardingComplete(null); return; }
    api.get<{ onboardingComplete: boolean }>('/dashboard/setup-status')
      .then(r => setOnboardingComplete(r.onboardingComplete))
      .catch(() => setOnboardingComplete(true));
  }, [user]);

  if (loading) return null;
  if (user && onboardingComplete === null) return null;

  // Admin hasn't completed onboarding — redirect to wizard
  if (user?.role === 'ADMIN' && onboardingComplete === false) {
    return (
      <Routes>
        <Route path="/onboarding" element={<Onboarding onComplete={() => setOnboardingComplete(true)} />} />
        <Route path="*" element={<Navigate to="/onboarding" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/onboarding" element={
        <ProtectedRoute><Onboarding onComplete={() => setOnboardingComplete(true)} /></ProtectedRoute>
      } />
      <Route path="/*" element={
        <ProtectedRoute>
          <div className="min-h-screen flex flex-col">
            <NavBar />
            <main className="flex-1 pb-16 sm:pb-0">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/jars" element={<Jars />} />
                <Route path="/budget" element={<Budget />} />
                <Route path="/history" element={<History />} />
                <Route path="/account" element={<Account />} />
                <Route path="/analytics" element={<Analytics />} />
              </Routes>
            </main>
          </div>
        </ProtectedRoute>
      } />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <AppRoutes />
          <ToastContainer />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
