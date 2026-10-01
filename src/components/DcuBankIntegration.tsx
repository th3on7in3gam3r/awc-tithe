import React, { useState } from 'react';
import { useChurch } from '../context/ChurchContext';
import {
  Building2,
  ShieldCheck,
  CheckCircle2,
  RefreshCw,
  Lock,
  ArrowRight,
  ExternalLink,
  Sliders,
  DollarSign,
  AlertCircle,
  Clock,
  Landmark,
  Key,
  Database,
  ArrowDownRight,
  Check,
  Zap,
} from 'lucide-react';

export const DcuBankIntegration: React.FC = () => {
  const { config, dcuDeposits, relinkDcuFinancialConnections, toggleAutoReconcile, addNotification } = useChurch();
  const { dcuBank, awcDcb } = config;

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showStripeFcModal, setShowStripeFcModal] = useState(false);
  const [modalStep, setModalStep] = useState<'intro' | 'credentials' | 'otp' | 'accounts' | 'success'>('intro');
  const [dcuMemberId, setDcuMemberId] = useState('98172948');
  const [dcuPassword, setDcuPassword] = useState('••••••••••••');
  const [otpCode, setOtpCode] = useState('829104');
  const [selectedAccount, setSelectedAccount] = useState<'checking' | 'savings'>('checking');
  const [isConnectingFc, setIsConnectingFc] = useState(false);

  // Settings
  const [autoReconcile, setAutoReconcile] = useState(dcuBank.autoReconcileEnabled ?? true);
  const [autoGenerateVouchers, setAutoGenerateVouchers] = useState(true);
  const [settlementSchedule, setSettlementSchedule] = useState(dcuBank.settlementSchedule || 'daily_auto_deposit');
  const [toleranceThreshold, setToleranceThreshold] = useState('5.00');

  const handleToggleAutoReconcile = (val: boolean) => {
    setAutoReconcile(val);
    toggleAutoReconcile(val);
  };

  const handleManualRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setIsRefreshing(false);
      relinkDcuFinancialConnections({
        lastFinancialConnectionsSync: new Date().toISOString(),
      });
      addNotification(
        'success',
        'DCU Balances Refreshed',
        'Stripe Financial Connections synced latest cleared balances from DCU Credit Union.'
      );
    }, 1100);
  };

  const startStripeFinancialConnections = () => {
    setModalStep('intro');
    setShowStripeFcModal(true);
  };

  const handleCompleteFinancialConnections = () => {
    setIsConnectingFc(true);
    setTimeout(() => {
      setIsConnectingFc(false);
      relinkDcuFinancialConnections({
        status: 'active',
        financialConnectionsStatus: 'linked',
        stripeFinancialConnectionsAccountId: `fca_${Math.random().toString(36).substring(2, 12)}Live`,
        stripeFinancialConnectionsSessionId: `fcsess_${Math.random().toString(36).substring(2, 16)}`,
        lastFinancialConnectionsSync: new Date().toISOString(),
        liveAvailableBalance: 408320.0,
        liveCurrentBalance: 412850.0,
      });
      setShowStripeFcModal(false);
      setModalStep('intro');
    }, 1200);
  };

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-r from-slate-950 via-slate-900 to-church-burgundy-dark p-6 sm:p-8 text-white shadow-xl">
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="max-w-2xl space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/20 px-2.5 py-0.5 text-[10px] font-mono font-semibold text-emerald-300">
                <CheckCircle2 className="h-3 w-3" />
                <span>Stripe Financial Connections Linked</span>
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-blue-500/40 bg-blue-500/20 px-2.5 py-0.5 text-[10px] font-mono font-semibold text-blue-300">
                <Landmark className="h-3 w-3" />
                <span>NCUA Insured #68390</span>
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-church-gold/40 bg-church-gold/20 px-2.5 py-0.5 text-[10px] font-mono font-semibold text-church-gold-light">
                <Zap className="h-3 w-3" />
                <span>Continuous AWC DCB Sync</span>
              </span>
            </div>

            <h2 className="font-serif-display text-2xl sm:text-3xl font-bold tracking-tight text-white">
              Church Bank Integration: DCU Credit Union
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Securely authenticate the church's depository accounts at <strong>DCU Credit Union (Digital Federal Credit Union)</strong> via 
              <strong> Stripe Financial Connections</strong>. This bridge unlocks instant account balance reads, real-time incoming ACH and Plaid wire transaction ingestion, and automated matching with the 
              <strong> AWC Digital Contribution Book (AWC DCB)</strong>.
            </p>
          </div>

          {/* Action CTAs */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleManualRefresh}
              disabled={isRefreshing}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-600 bg-slate-800/80 px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-700 transition-all disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>{isRefreshing ? 'Refreshing...' : 'Refresh DCU Feeds'}</span>
            </button>

            <button
              onClick={startStripeFinancialConnections}
              className="inline-flex items-center gap-2 rounded-xl bg-church-burgundy-light hover:bg-church-burgundy-light px-4 py-2.5 text-xs font-semibold text-white shadow-md transition-all"
            >
              <Building2 className="h-4 w-4" />
              <span>Link / Reconnect DCU Account</span>
            </button>
          </div>
        </div>

        {/* Live Balance & Credential Strip */}
        <div className="mt-8 pt-6 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800/80">
            <span className="text-[10px] uppercase text-slate-400 block font-medium">Institution &amp; Routing</span>
            <strong className="text-white text-xs block mt-0.5 font-semibold">DCU Credit Union</strong>
            <span className="font-mono text-[10px] text-church-gold-light block">Routing (ABA): {dcuBank.routingNumber}</span>
          </div>

          <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800/80">
            <span className="text-[10px] uppercase text-slate-400 block font-medium">Operating Checking</span>
            <strong className="text-white font-mono text-xs block mt-0.5">Checking {dcuBank.accountNumberMask}</strong>
            <span className="text-[10px] text-emerald-400">Direct Deposit Rail Active</span>
          </div>

          <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800/80">
            <span className="text-[10px] uppercase text-slate-400 block font-medium">Live Available Balance</span>
            <strong className="font-mono text-base font-bold text-emerald-400 block mt-0.5">
              ${(dcuBank.liveAvailableBalance || 408320.0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </strong>
            <span className="text-[10px] text-slate-400">Current: ${(dcuBank.liveCurrentBalance || 412850.0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
          </div>

          <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800/80">
            <span className="text-[10px] uppercase text-slate-400 block font-medium">Stripe FC Account Token</span>
            <strong className="font-mono text-[11px] text-slate-200 block truncate mt-0.5">
              {dcuBank.stripeFinancialConnectionsAccountId || 'fca_1P82Dcu8492Live'}
            </strong>
            <span className="text-[10px] text-slate-400">Session: {dcuBank.stripeFinancialConnectionsSessionId?.slice(0, 16) || 'fcsess_1N0xDCU8492'}...</span>
          </div>
        </div>
      </div>

      {/* Main Grid: Depository Details & Automated Reconciliation Configuration */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Column: Stripe Financial Connections Details & Security (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400">
                  <Landmark className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-serif-display text-sm font-bold text-slate-900 dark:text-white">
                    DCU Credit Union Depository Link
                  </h3>
                  <p className="text-[11px] text-slate-500">Stripe Financial Connections API</p>
                </div>
              </div>
              <span className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 rounded border border-emerald-200 dark:border-emerald-800">
                Connected
              </span>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">Financial Institution</span>
                <span className="font-medium text-slate-900 dark:text-white">{dcuBank.institutionName}</span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">Account Type</span>
                <span className="font-medium text-slate-900 dark:text-white capitalize">Commercial {dcuBank.accountType}</span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">Routing Number (Fedwire / ACH)</span>
                <span className="font-mono text-slate-900 dark:text-white">{dcuBank.routingNumber}</span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">Account Mask</span>
                <span className="font-mono text-slate-900 dark:text-white">{dcuBank.accountNumberMask}</span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">Plaid Integration Link</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">Direct Inflow Enabled</span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">Last Telemetry Ping</span>
                <span className="font-mono text-slate-600 dark:text-slate-300">
                  {new Date(dcuBank.lastFinancialConnectionsSync || Date.now()).toLocaleTimeString()}
                </span>
              </div>
            </div>

            <div className="pt-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3.5 border border-slate-200 dark:border-slate-700/80 text-xs space-y-1.5">
              <div className="flex items-center gap-1.5 text-slate-800 dark:text-slate-200 font-semibold">
                <Lock className="h-3.5 w-3.5 text-church-gold-dark" />
                <span>Financial Connections Security</span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                Stripe Financial Connections establishes an encrypted tokenized session with Digital Federal Credit Union (DCU). Raw online banking credentials are never stored on church servers.
              </p>
            </div>

            <button
              onClick={startStripeFinancialConnections}
              className="w-full py-2 px-3 text-xs font-semibold text-church-burgundy dark:text-church-gold-light bg-church-gold/10 hover:bg-church-gold/15 dark:bg-church-burgundy/40 dark:hover:bg-church-burgundy/60 rounded-xl border border-church-gold/30 dark:border-church-gold/50 transition-colors flex items-center justify-center gap-1.5"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Re-Authenticate DCU Credentials</span>
            </button>
          </div>

          {/* NCUA & Settlement Compliance Badge */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                  Federal Credit Union Stewardship
                </h4>
                <p className="text-[11px] text-slate-500">Charter #68390 · Direct ACH Settlement</p>
              </div>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Tithes and offerings processed via Stripe Card, Plaid Bank Link, and ACH auto-clear into Anointed Worship Center's DCU Credit Union operating accounts with daily sweeps at 11:59 PM EST.
            </p>
          </div>
        </div>

        {/* Right Column: Automated Reconciliation Controls with AWC DCB (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-church-gold/10 dark:bg-church-burgundy/40 text-church-burgundy dark:text-church-gold">
                  <Sliders className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-serif-display text-sm font-bold text-slate-900 dark:text-white">
                    AWC Digital Contribution Book (AWC DCB) Automation
                  </h3>
                  <p className="text-[11px] text-slate-500">Automate Matching Between DCU Deposits &amp; AWC DCB Records</p>
                </div>
              </div>
              <span className="text-[10px] font-mono text-slate-500">Target Book: {awcDcb.bookId}</span>
            </div>

            {/* Automation Toggles */}
            <div className="space-y-4">
              
              {/* Toggle 1: Continuous Reconciliation */}
              <div className="flex items-start justify-between gap-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60">
                <div className="space-y-1">
                  <span className="text-xs font-bold text-slate-900 dark:text-white block">
                    Automate Continuous Bank Reconciliation
                  </span>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    Continuously poll Stripe Financial Connections for incoming DCU Credit Union settled deposits and match them against AWC DCB voucher receipts.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleAutoReconcile(!autoReconcile)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    autoReconcile ? 'bg-church-burgundy' : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      autoReconcile ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Toggle 2: Auto-Generate AWC DCB Vouchers for Plaid Direct Transfers */}
              <div className="flex items-start justify-between gap-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60">
                <div className="space-y-1">
                  <span className="text-xs font-bold text-slate-900 dark:text-white block">
                    Auto-Generate AWC DCB Vouchers for Plaid Transfers
                  </span>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    When congregation members send contributions via Plaid directly into DCU Credit Union, automatically log matching vouchers in AWC DCB with their assigned Envelope Number.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAutoGenerateVouchers(!autoGenerateVouchers)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    autoGenerateVouchers ? 'bg-church-burgundy' : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      autoGenerateVouchers ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Setting 3: Settlement Sweep Timing */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900 dark:text-white">
                    DCU Credit Union Batch Settlement Schedule
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">Stripe Payout Protocol</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSettlementSchedule('daily_auto_deposit')}
                    className={`py-2 px-3 text-xs font-medium rounded-lg border text-left transition-all ${
                      settlementSchedule === 'daily_auto_deposit'
                        ? 'border-church-gold bg-church-gold/10 text-church-burgundy-dark font-semibold dark:border-church-gold dark:bg-church-burgundy/30 dark:text-church-gold-light'
                        : 'border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-850 dark:text-slate-300'
                    }`}
                  >
                    <span className="block font-bold">Daily 11:59 PM Sweep</span>
                    <span className="text-[10px] text-slate-500">Auto-clears into DCU Checking</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSettlementSchedule('weekly_batch')}
                    className={`py-2 px-3 text-xs font-medium rounded-lg border text-left transition-all ${
                      settlementSchedule === 'weekly_batch'
                        ? 'border-church-gold bg-church-gold/10 text-church-burgundy-dark font-semibold dark:border-church-gold dark:bg-church-burgundy/30 dark:text-church-gold-light'
                        : 'border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-850 dark:text-slate-300'
                    }`}
                  >
                    <span className="block font-bold">Weekly Monday Batch</span>
                    <span className="text-[10px] text-slate-500">Aggregated Sunday Offerings</span>
                  </button>
                </div>
              </div>

              {/* Setting 4: Variance Tolerance */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 flex items-center justify-between gap-4">
                <div>
                  <span className="text-xs font-bold text-slate-900 dark:text-white block">
                    Processor Fee Tolerance Threshold
                  </span>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Auto-flag reconciliation variance if gross donation differs from DCU net deposit by more than:
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-xs font-mono text-slate-500">$</span>
                  <input
                    type="text"
                    value={toleranceThreshold}
                    onChange={(e) => setToleranceThreshold(e.target.value)}
                    className="w-16 px-2 py-1 text-xs font-mono rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-right"
                  />
                </div>
              </div>

              {/* Webhook Endpoint Display */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 dark:text-white">
                    Stripe Financial Connections Webhook Endpoint
                  </span>
                  <span className="px-1.5 py-0.5 text-[10px] font-mono bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 rounded">
                    Active (200 OK)
                  </span>
                </div>
                <div className="p-2 bg-slate-900 text-church-gold-light font-mono text-[11px] rounded-lg break-all">
                  https://api.gracecommunity.church/v1/webhooks/stripe-financial-connections
                </div>
                <p className="text-[10px] text-slate-500">
                  Subscribed events: <code>financial_connections.account.refreshed_balance</code>, <code>financial_connections.account.created</code>, <code>payment_intent.succeeded</code>.
                </p>
              </div>

            </div>
          </div>
        </div>

      </div>

      {/* Recent DCU Statements Feed */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="font-serif-display text-sm font-bold text-slate-900 dark:text-white">
              Recent DCU Credit Union Incoming Bank Transactions (Statement Feed)
            </h3>
            <p className="text-[11px] text-slate-500">
              Direct deposit ledger streamed via Stripe Financial Connections
            </p>
          </div>
          <span className="text-xs text-slate-500 font-mono">
            {dcuDeposits.length} Records Streamed
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 text-[11px] text-slate-500 uppercase tracking-wider dark:bg-slate-800/60">
              <tr>
                <th className="px-4 py-3 font-medium">Trace # &amp; Date</th>
                <th className="px-4 py-3 font-medium">Bank Transaction Description</th>
                <th className="px-4 py-3 font-medium">Instrument</th>
                <th className="px-4 py-3 font-medium">AWC DCB Linkage</th>
                <th className="px-4 py-3 font-medium text-right">Settled Amount</th>
                <th className="px-4 py-3 font-medium text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-sans">
              {dcuDeposits.map((dep) => (
                <tr key={dep.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                  <td className="px-4 py-3 font-mono">
                    <span className="font-bold text-slate-900 dark:text-white block">{dep.dcuTraceNumber}</span>
                    <span className="text-[10px] text-slate-400 block">{new Date(dep.date).toLocaleDateString()}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium text-slate-800 dark:text-slate-200 block">{dep.description}</span>
                    <span className="text-[10px] text-slate-400 font-mono block">Batch: {dep.batchReference}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                      {dep.type === 'plaid_bank_transfer' ? 'Plaid Instant ACH' : dep.type === 'card_batch_settlement' ? 'Stripe Card Batch' : 'DCU Direct Wire'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {dep.matchedAwcVoucherId ? (
                      <span className="font-mono text-church-burgundy dark:text-church-gold font-semibold flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                        <span>{dep.matchedAwcVoucherId}</span>
                      </span>
                    ) : (
                      <span className="text-[10px] text-church-gold-dark dark:text-church-gold font-medium">
                        Pending AWC DCB Match
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                    +${dep.amount.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                      Cleared
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Stripe Financial Connections Interactive Link Modal */}
      {showStripeFcModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
            
            {/* Modal Top Bar */}
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded bg-church-gold-dark text-white flex items-center justify-center font-bold text-xs">
                  S
                </div>
                <span className="text-xs font-bold tracking-tight">Stripe Financial Connections</span>
              </div>
              <button
                onClick={() => setShowStripeFcModal(false)}
                className="text-slate-400 hover:text-white text-xs font-semibold"
              >
                ✕
              </button>
            </div>

            {/* Modal Body Based on Step */}
            <div className="p-6 space-y-4">
              {modalStep === 'intro' && (
                <div className="space-y-4 text-center">
                  <div className="mx-auto h-12 w-12 rounded-2xl bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-400 flex items-center justify-center">
                    <Landmark className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="font-serif-display text-base font-bold text-slate-900 dark:text-white">
                      Link DCU Credit Union Depository
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">
                      Digital Federal Credit Union (DCU) · Routing 211370545
                    </p>
                  </div>
                  <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl text-left text-xs space-y-2 text-slate-600 dark:text-slate-300">
                    <div className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                      <span>Stream bank deposits straight into AWC DCB</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                      <span>Verify checking balances in real-time</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                      <span>Direct Plaid member contributions to church checking</span>
                    </div>
                  </div>
                  <button
                    onClick={() => setModalStep('credentials')}
                    className="w-full py-2.5 px-4 bg-church-burgundy hover:bg-church-burgundy-light text-white text-xs font-bold rounded-xl shadow transition-all flex items-center justify-center gap-1.5"
                  >
                    <span>Authenticate with DCU</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {modalStep === 'credentials' && (
                <div className="space-y-4">
                  <div className="text-center">
                    <span className="text-[10px] uppercase font-bold text-church-gold-dark block">DCU Member Online Banking</span>
                    <h3 className="font-serif-display text-sm font-bold text-slate-900 dark:text-white">
                      Enter DCU Commercial Credentials
                    </h3>
                  </div>
                  <div className="space-y-3 text-xs">
                    <div>
                      <label className="block text-[11px] text-slate-500 uppercase tracking-wider mb-1">
                        DCU Member Number
                      </label>
                      <input
                        type="text"
                        value={dcuMemberId}
                        onChange={(e) => setDcuMemberId(e.target.value)}
                        className="w-full px-3 py-2 font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 dark:text-white text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-500 uppercase tracking-wider mb-1">
                        Access Code / Password
                      </label>
                      <input
                        type="password"
                        value={dcuPassword}
                        onChange={(e) => setDcuPassword(e.target.value)}
                        className="w-full px-3 py-2 font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 dark:text-white text-xs"
                      />
                    </div>
                  </div>
                  <button
                    onClick={() => setModalStep('otp')}
                    className="w-full py-2.5 px-4 bg-church-burgundy hover:bg-church-burgundy-light text-white text-xs font-bold rounded-xl shadow transition-all"
                  >
                    Send DCU Verification Code
                  </button>
                </div>
              )}

              {modalStep === 'otp' && (
                <div className="space-y-4 text-center">
                  <div className="mx-auto h-10 w-10 rounded-full bg-church-gold/15 dark:bg-church-burgundy-dark/60 text-church-burgundy dark:text-church-gold-light flex items-center justify-center">
                    <Lock className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-serif-display text-sm font-bold text-slate-900 dark:text-white">
                      DCU Two-Factor Security
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">
                      Enter the 6-digit code sent to Church Treasurer phone (•••-•••-0198)
                    </p>
                  </div>
                  <input
                    type="text"
                    value={otpCode}
                    maxLength={6}
                    onChange={(e) => setOtpCode(e.target.value)}
                    className="w-36 mx-auto px-3 py-2 font-mono text-center tracking-widest text-base font-bold rounded-lg border border-church-gold/40 dark:border-church-gold bg-white dark:bg-slate-800 dark:text-white"
                  />
                  <button
                    onClick={() => setModalStep('accounts')}
                    className="w-full py-2.5 px-4 bg-church-burgundy hover:bg-church-burgundy-light text-white text-xs font-bold rounded-xl shadow transition-all"
                  >
                    Confirm Code &amp; Select Accounts
                  </button>
                </div>
              )}

              {modalStep === 'accounts' && (
                <div className="space-y-4">
                  <div className="text-center">
                    <h3 className="font-serif-display text-sm font-bold text-slate-900 dark:text-white">
                      Select DCU Account to Link
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Grant Stripe read &amp; direct deposit settlement permissions
                    </p>
                  </div>
                  <div className="space-y-2 text-xs">
                    <label
                      onClick={() => setSelectedAccount('checking')}
                      className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                        selectedAccount === 'checking'
                          ? 'border-church-gold/50 bg-church-gold/10 dark:bg-church-burgundy/40 dark:border-church-gold'
                          : 'border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      <div>
                        <strong className="block text-slate-900 dark:text-white">Primary Church Operating Checking</strong>
                        <span className="text-[10px] text-slate-500 font-mono">Account: *******8492</span>
                      </div>
                      <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">$412,850.00</span>
                    </label>

                    <label
                      onClick={() => setSelectedAccount('savings')}
                      className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                        selectedAccount === 'savings'
                          ? 'border-church-gold/50 bg-church-gold/10 dark:bg-church-burgundy/40 dark:border-church-gold'
                          : 'border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      <div>
                        <strong className="block text-slate-900 dark:text-white">Faith Horizon Building Money Market</strong>
                        <span className="text-[10px] text-slate-500 font-mono">Account: *******1104</span>
                      </div>
                      <span className="font-mono font-bold text-slate-600 dark:text-slate-300">$189,400.00</span>
                    </label>
                  </div>

                  <button
                    onClick={handleCompleteFinancialConnections}
                    disabled={isConnectingFc}
                    className="w-full py-2.5 px-4 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold rounded-xl shadow transition-all flex items-center justify-center gap-1.5"
                  >
                    {isConnectingFc ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        <span>Verifying Token with DCU...</span>
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4" />
                        <span>Authorize Stripe Financial Connections</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* Modal Footer Note */}
            <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-800 text-[10px] text-slate-400 text-center flex items-center justify-center gap-1">
              <ShieldCheck className="h-3 w-3 text-emerald-600" />
              <span>256-Bit Encrypted OAuth Session · DCU Member Direct Integration</span>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
