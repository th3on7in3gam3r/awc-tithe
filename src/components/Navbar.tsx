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
  ArrowLeft,
  Globe,
} from 'lucide-react';

interface NavbarProps {
  portalMode: AppPortalMode;
  setPortalMode: (mode: AppPortalMode) => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onOpenMfaModal: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  portalMode,
  setPortalMode,
  activeTab,
  setActiveTab,
  onOpenMfaModal,
}) => {
  const { currentRole, switchRole, isMfaVerified, darkMode, toggleDarkMode, offlineGifts } = useChurch();
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

  const handleEnterAdminConsole = () => {
    setPortalMode('admin');
    setActiveTab('admin');
    if (currentRole === 'donor') {
      switchRole('admin');
    }
    if (!isMfaVerified) {
      onOpenMfaModal();
    }
  };

  const handleExitToPublicWebsite = () => {
    setPortalMode('public');
    setActiveTab('give');
  };

  const publicNavItems = [
    { id: 'give', label: 'Give Now' },
    { id: 'funds', label: 'Ministries & Goals' },
  ];

  const adminNavItems = [
    { id: 'admin', label: 'Dashboard' },
    { id: 'api-docs', label: 'API Docs' },
  ];

  const isAdmin = portalMode === 'admin';

  return (
    <header className="no-print sticky top-0 z-40 w-full bg-white border-b border-slate-200 shadow-sm">
      <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8 gap-4">
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
            <span className="block text-lg sm:text-xl font-extrabold tracking-tight" style={{ color: '#4A0404' }}>
              AWC {isAdmin ? 'VAULT' : 'TITHE'}
            </span>
            <span className="hidden sm:block text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400 -mt-0.5">
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
                activeTab === item.id ? '' : 'text-slate-500 hover:text-[#4A0404]'
              }`}
              style={activeTab === item.id ? { color: '#4A0404' } : undefined}
            >
              {item.label}
              {activeTab === item.id && (
                <span className="block h-0.5 mt-1 rounded-full" style={{ backgroundColor: '#D4AF37' }} />
              )}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          {!isAdmin ? (
            <button
              onClick={handleEnterAdminConsole}
              className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 text-[11px] font-bold uppercase tracking-[0.12em] rounded-lg shadow-sm transition-colors"
              style={{ backgroundColor: '#D4AF37', color: '#4A0404' }}
            >
              <Lock className="h-3.5 w-3.5" />
              Staff Login
            </button>
          ) : (
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

              <div className="relative">
                <button
                  onClick={() => setRoleDropdownOpen(!roleDropdownOpen)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                >
                  <ShieldCheck className="h-3.5 w-3.5" style={{ color: '#4A0404' }} />
                  <span className="capitalize">{currentRole}</span>
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: isMfaVerified ? '#10b981' : '#D4AF37' }}
                  />
                  <ChevronDown className="h-3 w-3 text-slate-400" />
                </button>
                {roleDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-52 rounded-lg border border-slate-200 bg-white py-1.5 shadow-xl z-50">
                    <div
                      className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em]"
                      style={{ color: '#D4AF37' }}
                    >
                      Staff Role
                    </div>
                    {(['admin', 'pastor', 'bookkeeper', 'auditor'] as UserRole[]).map((r) => (
                      <button
                        key={r}
                        onClick={() => handleRoleSelect(r)}
                        className={`w-full flex items-center justify-between px-3 py-1.5 text-xs text-left capitalize ${
                          currentRole === r ? 'font-semibold' : 'text-slate-600 hover:bg-slate-50'
                        }`}
                        style={
                          currentRole === r
                            ? { color: '#4A0404', backgroundColor: 'rgba(74,4,4,0.06)' }
                            : undefined
                        }
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button
                onClick={handleExitToPublicWebsite}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-lg border border-slate-200 text-slate-600 hover:text-[#4A0404] hover:border-[#4A0404]/40"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Public Site</span>
              </button>
            </>
          )}

          <button
            onClick={toggleDarkMode}
            aria-label="Toggle dark mode"
            className="p-1.5 rounded-md text-slate-500 hover:text-[#4A0404] hover:bg-slate-100"
          >
            {darkMode ? <Sun className="h-4 w-4" style={{ color: '#D4AF37' }} /> : <Moon className="h-4 w-4" />}
          </button>

          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-1.5 md:hidden text-slate-600"
            aria-label="Open mobile menu"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="md:hidden border-t border-slate-200 bg-white px-4 pt-2 pb-4">
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
            {!isAdmin ? (
              <button
                onClick={() => {
                  handleEnterAdminConsole();
                  setMobileMenuOpen(false);
                }}
                className="mt-2 inline-flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-bold uppercase tracking-[0.12em] rounded-lg"
                style={{ backgroundColor: '#D4AF37', color: '#4A0404' }}
              >
                <Lock className="h-3.5 w-3.5" />
                Staff Login
              </button>
            ) : (
              <button
                onClick={() => {
                  handleExitToPublicWebsite();
                  setMobileMenuOpen(false);
                }}
                className="mt-2 flex items-center gap-1.5 text-xs font-semibold py-1"
                style={{ color: '#4A0404' }}
              >
                <Globe className="h-3.5 w-3.5" />
                Return to Public Site
              </button>
            )}
          </nav>
        </div>
      )}
    </header>
  );
};
