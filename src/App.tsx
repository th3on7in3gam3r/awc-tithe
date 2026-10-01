import React, { useState } from 'react';
import { ChurchProvider, useChurch } from './context/ChurchContext';
import { Navbar } from './components/Navbar';
import { DonorPortal } from './components/DonorPortal';
import { DonorSelfService } from './components/DonorSelfService';
import { MinistriesView } from './components/MinistriesView';
import { AdminDashboard } from './components/AdminDashboard';
import { ApiDocumentation } from './components/ApiDocumentation';
import { TaxReceiptModal } from './components/TaxReceiptModal';
import { MfaModal } from './components/MfaModal';
import { ToastContainer } from './components/ToastContainer';
import { Footer } from './components/Footer';
import { AppPortalMode } from './types';

function MainApp() {
  const [portalMode, setPortalMode] = useState<AppPortalMode>('public');
  const [activeTab, setActiveTab] = useState<string>('give');
  const [isMfaModalOpen, setIsMfaModalOpen] = useState(false);
  const [donorPortalEmail, setDonorPortalEmail] = useState<string | undefined>(undefined);
  const { selectedReceipt, setSelectedReceipt, isMfaVerified, resetMfa } = useChurch();

  const handleSelectFundToGive = (_fundId: string) => {
    setPortalMode('public');
    setActiveTab('give');
  };

  const handleTabChange = (tab: string) => {
    // Staff routes only when already unlocked — never bounce members into admin via tab id alone
    if (tab === 'admin' || tab === 'api-docs') {
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
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
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
            {activeTab === 'give' && <DonorPortal onViewMyGiving={handleViewMyGiving} />}
            {activeTab === 'funds' && <MinistriesView onSelectFundToGive={handleSelectFundToGive} />}
            {activeTab === 'my-giving' && (
              <DonorSelfService
                initialEmail={donorPortalEmail}
                onConsumedInitialEmail={() => setDonorPortalEmail(undefined)}
              />
            )}
            {(activeTab === 'admin' || activeTab === 'api-docs') && (
              <div className="mx-auto max-w-lg px-4 py-16 text-center">
                <p className="font-serif-display text-xl font-bold text-slate-900 dark:text-white">
                  Staff Portal is locked
                </p>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                  An invite or access code from church leadership is required. Members cannot enter.
                </p>
                <button
                  type="button"
                  onClick={() => setIsMfaModalOpen(true)}
                  className="mt-6 rounded-lg px-4 py-2 text-xs font-bold uppercase tracking-wider text-white"
                  style={{ backgroundColor: '#4A0404' }}
                >
                  Enter invite code
                </button>
              </div>
            )}
          </>
        )}

        {staffUnlocked && (
          <>
            {activeTab === 'admin' && <AdminDashboard />}
            {activeTab === 'api-docs' && <ApiDocumentation />}
          </>
        )}
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
      <MainApp />
    </ChurchProvider>
  );
}
