import React, { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useNavigate, useLocation } from 'react-router-dom';
import { ChurchProvider, useChurch } from './context/ChurchContext';
import { Navbar } from './components/Navbar';
import { DonorPortal } from './components/DonorPortal';
import { DonorSelfService } from './components/DonorSelfService';
import { AdminDashboard } from './components/AdminDashboard';
import { TaxReceiptModal } from './components/TaxReceiptModal';
import { MfaModal } from './components/MfaModal';
import { ToastContainer } from './components/ToastContainer';
import { Footer } from './components/Footer';
import { AppPortalMode } from './types';
import PrivacyPage from './pages/PrivacyPage';
import TermsPage from './pages/TermsPage';
import RefundPolicyPage from './pages/RefundPolicyPage';

/** Old Ministries & Goals URLs → Give home. */
function LegacyMinistriesRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate('/', { replace: true });
  }, [navigate]);
  return null;
}

function MainApp() {
  const location = useLocation();
  const [portalMode, setPortalMode] = useState<AppPortalMode>('public');
  const [activeTab, setActiveTab] = useState<string>('give');
  const [isMfaModalOpen, setIsMfaModalOpen] = useState(false);
  const [donorPortalEmail, setDonorPortalEmail] = useState<string | undefined>(undefined);
  const { selectedReceipt, setSelectedReceipt, isMfaVerified, resetMfa } = useChurch();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.has('staffInvite')) {
      setActiveTab('admin');
      setIsMfaModalOpen(true);
    }
    const tab = params.get('tab');
    if (
      tab === 'funds' ||
      tab === 'ministries' ||
      tab === 'goals' ||
      tab === 'api-docs' ||
      tab === 'my-giving'
    ) {
      setActiveTab(tab === 'my-giving' ? 'my-giving' : 'give');
      params.delete('tab');
      const qs = params.toString();
      window.history.replaceState(null, '', qs ? `/?${qs}` : '/');
    }
  }, [location.search]);

  const handleTabChange = (tab: string) => {
    if (tab === 'funds' || tab === 'ministries' || tab === 'goals' || tab === 'api-docs') {
      setPortalMode('public');
      setActiveTab('give');
      return;
    }
    if (tab === 'admin') {
      if (!isMfaVerified) {
        setIsMfaModalOpen(true);
        return;
      }
      setPortalMode('admin');
      setActiveTab(tab);
      return;
    }
    setPortalMode('public');
    setActiveTab(tab);
  };

  const handleEnterDonorPortal = () => {
    if (portalMode === 'admin') {
      resetMfa();
    }
    setPortalMode('public');
    setActiveTab('my-giving');
  };

  const handleRequestStaffPortal = () => {
    if (isMfaVerified) {
      setPortalMode('admin');
      setActiveTab('admin');
      return;
    }
    setIsMfaModalOpen(true);
  };

  const handleStaffAccessGranted = () => {
    setPortalMode('admin');
    setActiveTab('admin');
  };

  const handleViewMyGiving = (email: string) => {
    setDonorPortalEmail(email.trim().toLowerCase());
    setPortalMode('public');
    setActiveTab('my-giving');
  };

  const staffUnlocked = portalMode === 'admin' && isMfaVerified;

  return (
    <div className="min-h-screen flex flex-col bg-[#F7F4EF] dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      <Navbar
        portalMode={portalMode}
        setPortalMode={setPortalMode}
        activeTab={activeTab}
        setActiveTab={handleTabChange}
        onOpenMfaModal={handleRequestStaffPortal}
        onEnterDonorPortal={handleEnterDonorPortal}
      />

      <main className="flex-1">
        {!staffUnlocked && (
          <>
            {(activeTab === 'give' || activeTab === 'funds') && (
              <DonorPortal onViewMyGiving={handleViewMyGiving} />
            )}
            {activeTab === 'my-giving' && (
              <DonorSelfService
                initialEmail={donorPortalEmail}
                onConsumedInitialEmail={() => setDonorPortalEmail(undefined)}
              />
            )}
            {activeTab === 'admin' && (
              <div className="mx-auto max-w-lg px-4 py-16 text-center">
                <p className="font-serif-display text-xl font-bold text-slate-900 dark:text-white">
                  Staff Portal is locked
                </p>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                  Staff sign in with their invited email address. Donor accounts do not grant staff access.
                </p>
                <button
                  type="button"
                  onClick={() => setIsMfaModalOpen(true)}
                  className="mt-6 rounded-lg px-4 py-2 text-xs font-bold uppercase tracking-wider text-white"
                  style={{ backgroundColor: '#4A0404' }}
                >
                  Staff sign in
                </button>
              </div>
            )}
          </>
        )}

        {staffUnlocked && activeTab === 'admin' && <AdminDashboard />}
      </main>

      <Footer
        portalMode={staffUnlocked ? 'admin' : 'public'}
        setPortalMode={setPortalMode}
        setActiveTab={handleTabChange}
        onRequestStaffPortal={handleRequestStaffPortal}
        onEnterDonorPortal={handleEnterDonorPortal}
      />

      <TaxReceiptModal
        donation={selectedReceipt}
        onClose={() => setSelectedReceipt(null)}
      />

      <MfaModal
        isOpen={isMfaModalOpen}
        onClose={() => setIsMfaModalOpen(false)}
        onAccessGranted={handleStaffAccessGranted}
      />

      <ToastContainer />
    </div>
  );
}

export default function App() {
  return (
    <ChurchProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/refund-policy" element={<RefundPolicyPage />} />
          <Route path="/funds" element={<LegacyMinistriesRedirect />} />
          <Route path="/ministries" element={<LegacyMinistriesRedirect />} />
          <Route path="/goals" element={<LegacyMinistriesRedirect />} />
          <Route path="/" element={<MainApp />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ChurchProvider>
  );
}
