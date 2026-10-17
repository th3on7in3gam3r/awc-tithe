import React, { useState } from 'react';
import { useChurch } from '../context/ChurchContext';
import { AppPortalMode } from '../types';
import {
  Moon,
  Sun,
  ShieldCheck,
  Menu,
  X,
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
  const { staffPortalRole, isMfaVerified, darkMode, toggleDarkMode } = useChurch();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
    { id: 'give', label: 'Give' },
    { id: 'my-giving', label: 'My giving' },
  ];

  const adminNavItems = [
    { id: 'admin', label: 'Dashboard' },
  ];

  const isAdmin = portalMode === 'admin' && isMfaVerified;

  const portalSwitch = (
    <div
      className="inline-flex items-center rounded-full border border-[rgba(233,201,121,0.35)] p-0.5"
      role="group"
      aria-label="Portal switch"
    >
      <button
        type="button"
        onClick={handleSelectDonorPortal}
        aria-pressed={!isAdmin}
        className={`inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-[12px] font-semibold tracking-[0.04em] transition-colors ${
          !isAdmin ? 'bg-awc-gold text-awc-wine-deep' : 'text-awc-on-wine-muted hover:text-awc-on-wine'
        }`}
      >
        <Users className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="hidden sm:inline">Donor</span>
        <span className="sm:hidden">Donor</span>
      </button>
      <button
        type="button"
        onClick={handleSelectStaffPortal}
        aria-pressed={isAdmin}
        className={`inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-[12px] font-semibold tracking-[0.04em] transition-colors ${
          isAdmin ? 'bg-awc-gold text-awc-wine-deep' : 'text-awc-on-wine-muted hover:text-awc-on-wine'
        }`}
      >
        <Lock className="h-3.5 w-3.5" aria-hidden="true" />
        Staff
      </button>
    </div>
  );

  const navItems = isAdmin ? adminNavItems : publicNavItems;

  return (
    <header className="no-print sticky top-0 z-40 w-full bg-awc-wine text-awc-on-wine border-b border-[rgba(201,154,62,0.35)]">
      <div className="mx-auto flex h-[72px] max-w-[1440px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-10">
        <button
          onClick={() => setActiveTab(isAdmin ? 'admin' : 'give')}
          className="group flex shrink-0 items-center gap-3 text-left"
          aria-label="AWC Tithe home"
        >
          <img
            src="/images/awc-logo.png"
            alt=""
            className="h-11 w-11 rounded-full border border-[rgba(201,154,62,0.6)] bg-white object-contain sm:h-12 sm:w-12"
          />
          <span className="flex flex-col leading-tight">
            <span className="font-serif-display text-[19px] font-semibold sm:text-[21px]">Anointed Worship Center</span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-awc-on-wine-muted">
              {isAdmin ? 'Stewardship Console' : 'Online Giving'}
            </span>
          </span>
        </button>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
          {navItems.map((item) => {
            const on = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                aria-current={on ? 'page' : undefined}
                className={`min-h-11 border-b-2 px-3.5 text-[15px] transition-colors ${
                  on
                    ? 'border-awc-gold-soft font-semibold text-awc-on-wine'
                    : 'border-transparent font-medium text-awc-on-wine-muted hover:text-awc-on-wine'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <div className="hidden sm:block">{portalSwitch}</div>

          {isAdmin && (
            <div className="hidden items-center gap-1.5 rounded-full border border-[rgba(233,201,121,0.35)] px-3 py-1.5 text-xs font-medium sm:flex">
              <ShieldCheck className="h-3.5 w-3.5 text-awc-gold" aria-hidden="true" />
              <span className="capitalize">{staffPortalRole || 'staff'}</span>
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
            </div>
          )}

          <button
            onClick={toggleDarkMode}
            aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            className="flex h-11 w-11 items-center justify-center rounded-full text-awc-on-wine-muted transition-colors hover:bg-white/10 hover:text-awc-on-wine"
          >
            {darkMode ? <Sun className="h-[18px] w-[18px] text-awc-gold" /> : <Moon className="h-[18px] w-[18px]" />}
          </button>

          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="flex h-11 w-11 items-center justify-center rounded-full text-awc-on-wine md:hidden"
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="border-t border-[rgba(233,201,121,0.2)] px-4 pb-4 pt-2 md:hidden">
          <nav className="flex flex-col" aria-label="Main">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id);
                  setMobileMenuOpen(false);
                }}
                aria-current={activeTab === item.id ? 'page' : undefined}
                className={`min-h-12 text-left text-base ${
                  activeTab === item.id ? 'font-semibold text-awc-gold' : 'font-medium text-awc-on-wine-muted'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>
          <div className="mt-3 sm:hidden">{portalSwitch}</div>
        </div>
      )}
    </header>
  );
};
