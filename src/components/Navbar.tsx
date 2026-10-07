import React, { useState } from 'react';
import { useChurch } from '../context/ChurchContext';
import { UserRole, AppPortalMode } from '../types';
import {
  Moon,
  Sun,
  ShieldCheck,
  Wifi,
  WifiOff,
  Menu,
  X,
  ChevronDown,
  Lock,
  Users,
} from 'lucide-react';

interface NavbarProps {
  portalMode: AppPortalMode;
  setPortalMode: (mode: AppPortalMode) => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onOpenMfaModal: () => void;
  onEnterDonorPortal: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  portalMode,
  activeTab,
  setActiveTab,
  onOpenMfaModal,
  onEnterDonorPortal,
}) => {
  const { currentRole, switchRole, isMfaVerified, darkMode, toggleDarkMode, offlineGifts } =
    useChurch();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);

  const pendingOfflineCount = offlineGifts.filter((g) => !g.synced).length;

  const handleRoleSelect = (role: UserRole) => {
    switchRole(role);
    setRoleDropdownOpen(false);
    if (role === 'admin' && !isMfaVerified) {
      onOpenMfaModal();
    }
  };

  const handleSelectDonorPortal = () => {
    onEnterDonorPortal();
    setMobileMenuOpen(false);
  };

  const handleSelectStaffPortal = () => {
    if (portalMode === 'admin' && isMfaVerified) {
      setActiveTab('admin');
      setMobileMenuOpen(false);
      return;
    }
    // Do not enter admin until invite/code succeeds
    onOpenMfaModal();
    setMobileMenuOpen(false);
  };

  const publicNavItems = [
    { id: 'give', label: 'Give Now' },
    { id: 'funds', label: 'Ministries & Goals' },
    { id: 'my-giving', label: 'My Giving' },
  ];

  const adminNavItems = [
    { id: 'admin', label: 'Dashboard' },
    { id: 'api-docs', label: 'API Docs' },
  ];

  const isAdmin = portalMode === 'admin' && isMfaVerified;

  const portalSwitch = (
    <div
      className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-700 dark:bg-slate-800"
      role="group"
      aria-label="Portal switch"
    >
      <button
        type="button"
        onClick={handleSelectDonorPortal}
        className={`inline-flex items-center gap-1.5 rounded-md px-2.5 sm:px-3 py-1.5 text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.1em] transition-colors ${
          !isAdmin
            ? 'bg-white text-[#4A0404] shadow-sm dark:bg-slate-900 dark:text-[#D4AF37]'
            : 'text-slate-500 hover:text-[#4A0404] dark:hover:text-[#D4AF37]'
        }`}
      >
        <Users className="h-3.5 w-3.5" />
        <span className="hidden xs:inline sm:inline">Donor Portal</span>
        <span className="sm:hidden">Donor</span>
      </button>
      <button
        type="button"
        onClick={handleSelectStaffPortal}
        className={`inline-flex items-center gap-1.5 rounded-md px-2.5 sm:px-3 py-1.5 text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.1em] transition-colors ${
          isAdmin
            ? 'shadow-sm'
            : 'text-slate-500 hover:text-[#4A0404] dark:hover:text-[#D4AF37]'
        }`}
        style={
          isAdmin
            ? { backgroundColor: '#D4AF37', color: '#4A0404' }
            : undefined
        }
      >
        <Lock className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Staff Portal</span>
        <span className="sm:hidden">Staff</span>
      </button>
    </div>
  );

  return (
    <header className="no-print sticky top-0 z-40 w-full bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 shadow-sm">
      <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8 gap-3 sm:gap-4">
        <button
          onClick={() => setActiveTab(isAdmin ? 'admin' : 'give')}
          className="flex items-center gap-3 text-left group shrink-0"
          aria-label="AWC Tithe home"
        >
          <img
            src="/images/awc-logo.png"
            alt="Anointed Worship Center"
            className="h-12 w-12 sm:h-14 sm:w-14 rounded-full object-contain bg-white shadow-sm border border-[#D4AF37]/40"
          />
          <div className="text-left">
            <span className="block text-lg sm:text-xl font-extrabold tracking-tight text-[#4A0404] dark:text-[#F4CF67]">
              AWC {isAdmin ? 'VAULT' : 'TITHE'}
            </span>
            <span className="hidden sm:block text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500 -mt-0.5">
              {isAdmin ? 'Stewardship Console' : 'Anointed Worship Center'}
            </span>
          </div>
        </button>

        <nav className="hidden md:flex items-center gap-6">
          {(isAdmin ? adminNavItems : publicNavItems).map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors ${
                activeTab === item.id
                  ? 'text-[#4A0404] dark:text-[#F4CF67]'
                  : 'text-slate-500 hover:text-[#4A0404] dark:text-slate-400 dark:hover:text-[#F4CF67]'
              }`}
            >
              {item.label}
              {activeTab === item.id && (
                <span className="block h-0.5 mt-1 rounded-full" style={{ backgroundColor: '#D4AF37' }} />
              )}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <div className="hidden sm:block">{portalSwitch}</div>

          {isAdmin && (
            <>
              {pendingOfflineCount > 0 ? (
                <button
                  onClick={() => setActiveTab('admin')}
                  className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border animate-pulse"
                  style={{ color: '#4A0404', backgroundColor: 'rgba(212,175,55,0.2)', borderColor: '#D4AF37' }}
                >
                  <WifiOff className="h-3.5 w-3.5" />
                  {pendingOfflineCount} Offline
                </button>
              ) : (
                <span className="hidden lg:flex items-center gap-1 text-xs text-slate-500">
                  <Wifi className="h-3.5 w-3.5 text-emerald-600" />
                  Live Sync
                </span>
              )}

              <div className="relative hidden sm:block">
                <button
                  onClick={() => setRoleDropdownOpen(!roleDropdownOpen)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <ShieldCheck className="h-3.5 w-3.5 text-[#4A0404] dark:text-[#F4CF67]" />
                  <span className="capitalize">
                    {currentRole === 'first_lady' ? 'First Lady' : currentRole}
                  </span>
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: isMfaVerified ? '#10b981' : '#D4AF37' }}
                  />
                  <ChevronDown className="h-3 w-3 text-slate-400" />
                </button>
                {roleDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-52 rounded-lg border border-slate-200 bg-white py-1.5 shadow-xl z-50 dark:border-slate-700 dark:bg-slate-900">
                    <div
                      className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em]"
                      style={{ color: '#D4AF37' }}
                    >
                      Staff Role
                    </div>
                    {(
                      [
                        { id: 'admin' as UserRole, label: 'Admin' },
                        { id: 'first_lady' as UserRole, label: 'First Lady' },
                        { id: 'pastor' as UserRole, label: 'Pastor' },
                        { id: 'bookkeeper' as UserRole, label: 'Bookkeeper' },
                        { id: 'auditor' as UserRole, label: 'Auditor' },
                      ]
                    ).map((r) => (
                      <button
                        key={r.id}
                        onClick={() => handleRoleSelect(r.id)}
                        className={`w-full flex items-center justify-between px-3 py-1.5 text-xs text-left ${
                          currentRole === r.id
                            ? 'font-semibold text-[#4A0404] dark:text-[#F4CF67] bg-[rgba(74,4,4,0.06)] dark:bg-[rgba(212,175,55,0.12)]'
                            : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'
                        }`}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          <button
            onClick={toggleDarkMode}
            aria-label="Toggle dark mode"
            className="p-1.5 rounded-md text-slate-500 hover:text-[#4A0404] hover:bg-slate-100 dark:text-slate-400 dark:hover:text-[#F4CF67] dark:hover:bg-slate-800"
          >
            {darkMode ? <Sun className="h-4 w-4" style={{ color: '#D4AF37' }} /> : <Moon className="h-4 w-4" />}
          </button>

          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-1.5 md:hidden text-slate-600 dark:text-slate-300"
            aria-label="Open mobile menu"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="md:hidden border-t border-slate-200 bg-white px-4 pt-2 pb-4 dark:border-slate-800 dark:bg-slate-950">
          <div className="mb-3 sm:hidden flex justify-center">{portalSwitch}</div>
          <nav className="flex flex-col space-y-1">
            {(isAdmin ? adminNavItems : publicNavItems).map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id);
                  setMobileMenuOpen(false);
                }}
                className="py-2.5 text-left text-[12px] font-semibold uppercase tracking-[0.14em]"
                style={{ color: activeTab === item.id ? '#4A0404' : '#64748b' }}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
};
