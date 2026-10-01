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
  const { selectedReceipt, setSelectedReceipt } = useChurch();

  const handleSelectFundToGive = (_fundId: string) => {
    setPortalMode('public');
    setActiveTab('give');
  };

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    if (tab === 'admin' || tab === 'api-docs') {
      setPortalMode('admin');
    } else {
      setPortalMode('public');
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      {/* Dynamic Header with Public vs Admin Separation */}
      <Navbar
        portalMode={portalMode}
        setPortalMode={setPortalMode}
        activeTab={activeTab}
        setActiveTab={handleTabChange}
        onOpenMfaModal={() => setIsMfaModalOpen(true)}
      />

      <main className="flex-1">
        {/* Public Congregant Portal Views */}
        {portalMode === 'public' && (
          <>
            {activeTab === 'give' && <DonorPortal />}
            {activeTab === 'funds' && <MinistriesView onSelectFundToGive={handleSelectFundToGive} />}
            {activeTab === 'my-giving' && <DonorSelfService />}
          </>
        )}

        {/* Church Staff Stewardship Admin Console Views */}
        {portalMode === 'admin' && (
          <>
            {activeTab === 'admin' && <AdminDashboard />}
            {activeTab === 'api-docs' && <ApiDocumentation />}
          </>
        )}
      </main>

      <Footer
        portalMode={portalMode}
        setPortalMode={setPortalMode}
        setActiveTab={handleTabChange}
      />

      {/* Tax Deductible Official Receipt Modal */}
      <TaxReceiptModal
        donation={selectedReceipt}
        onClose={() => setSelectedReceipt(null)}
      />

      {/* MFA Challenge Modal */}
      <MfaModal
        isOpen={isMfaModalOpen}
        onClose={() => setIsMfaModalOpen(false)}
      />

      {/* Real-time Push Notification Alerts */}
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
