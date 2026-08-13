import React, { lazy, Suspense, useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
 
  Cpu, 
  Terminal, 
  RefreshCw, 
  Database, 
  Lock, 
  Unlock, 
  Coins, 
  Package, 
  ShoppingCart, 
  Dices, 
  Check, 
  TrendingUp, 
  Sparkles, 
  Clock, 
  Play, 
  ChevronDown,
  Menu,
  Plus, 
  Trash, 
  AlertCircle, 
  HelpCircle,
  Lightbulb,
  Zap,
  Flame,
  Award,
  X,
  Settings2,
  Layers
} from 'lucide-react';

import { Card, CardHeader, CardTitle, CardContent } from './components/ui/Card';
import { Badge } from './components/ui/Badge';
import { StatusIndicator } from './components/ui/StatusIndicator';
import { Button } from './components/ui/Button';
import { Gatekeeper } from './components/Gatekeeper';
import { SideNavbar } from './components/SideNavbar';
import { EnginePipeline } from './components/EnginePipeline';
import { BackgroundCosmos } from './components/CosmicVisuals';
import { LegalFooterLinks } from './components/LegalFooterLinks';
import { LegalAcceptanceGate } from './components/LegalAcceptanceGate';
import { useAuthSession } from './auth/useAuthSession';
import {
  acquireProviderToken,
  providerAvailability,
} from './auth/providerIdentity';
import {
  fetchAdvisorConfig,
  fetchCreditBalance,
  fetchEngineStatus,
  fetchRecentIntelligence,
  type EngineStatusResponse,
  type RecentIntelligenceEntry,
} from './api/backendData';
import {
  advisorForecastPreparationMessage,
  advisorHeaderDrawLabel,
  isAdvisorHistoricalAnalysisAvailable,
  type AdvisorLifecycleContract,
} from './api/advisorLifecycle';
import { fetchPlatformLegalStatus } from './api/legal';
import { LEGAL_ACCEPTANCE_REQUIRED_EVENT } from './api/apiClient';
import { installPaymentReconciliation } from './api/paymentReconciliation';
import { initializeSupportChat } from './support/crisp';

const LazyLumaAdvisor = lazy(() => import('./components/LumaAdvisor').then(
  ({ LumaAdvisor }) => ({ default: LumaAdvisor }),
));
const LazyAnalyticsLedger = lazy(() => import('./components/AnalyticsLedger').then(
  ({ AnalyticsLedger }) => ({ default: AnalyticsLedger }),
));
const LazyCreditStore = lazy(() => import('./components/CreditStore').then(
  ({ CreditStore }) => ({ default: CreditStore }),
));
const LazyControlCenter = lazy(() => import('./components/ControlCenter').then(
  ({ ControlCenter }) => ({ default: ControlCenter }),
));

function ViewLoadingFallback({ label }: { label: string }) {
  return (
    <div
      className="flex h-full min-h-64 w-full items-center justify-center bg-transparent"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-3 rounded-xl border border-border-subtle bg-canvas-elevated/80 px-5 py-4 text-sm text-text-secondary backdrop-blur-md">
        <RefreshCw className="h-4 w-4 animate-spin text-accent-cyan" aria-hidden="true" />
        <span>{label}</span>
      </div>
    </div>
  );
}

const intelligenceImageSources: Record<RecentIntelligenceEntry['image_key'], string> = {
  'luma-release': '/logo-1.webp',
};

function intelligenceReleaseDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Date unavailable';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Europe/Vienna',
  }).format(parsed);
}

class ViewErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    console.warn('A workspace section could not be loaded.');
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="flex h-full min-h-64 w-full items-center justify-center px-6">
        <div className="max-w-md rounded-2xl border border-status-error/30 bg-surface-primary p-6 text-center shadow-subtle">
          <AlertCircle className="mx-auto mb-3 h-7 w-7 text-status-error" aria-hidden="true" />
          <h2 className="text-lg font-medium text-text-primary">This section could not be loaded</h2>
          <p className="mt-2 text-sm text-text-secondary">
            Refresh the workspace to load the current application version.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 rounded-xl border border-accent-cyan/40 px-5 py-2.5 text-sm font-medium text-accent-cyan transition-colors hover:bg-accent-cyan/10 focus:outline-none focus:ring-2 focus:ring-accent-cyan"
          >
            Refresh workspace
          </button>
        </div>
      </div>
    );
  }
}

function initialWorkspaceTab(): 'home' | 'advisor' | 'analytics' | 'shop' | 'settings' {
  if (typeof window === 'undefined') return 'home';
  const url = new URL(window.location.href);
  if (url.searchParams.get('open') !== 'credits') return 'home';
  url.searchParams.delete('open');
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  return 'shop';
}

export default function App() {
  const authSession = useAuthSession();
  const isLogged = authSession.status === 'authenticated';
  const [legalAccessState, setLegalAccessState] = useState<
    'idle' | 'loading' | 'required' | 'accepted' | 'error'
  >('idle');
  const [legalStatusError, setLegalStatusError] = useState<string | null>(null);
  const [legalStatusReload, setLegalStatusReload] = useState(0);
  const workspaceUnlocked = isLogged && legalAccessState === 'accepted';
  useEffect(() => {
    const controller = new AbortController();
    if (!isLogged) {
      setLegalAccessState('idle');
      setLegalStatusError(null);
      return () => controller.abort();
    }

    setLegalAccessState('loading');
    setLegalStatusError(null);
    fetchPlatformLegalStatus(controller.signal)
      .then((status) => {
        if (controller.signal.aborted) return;
        setLegalAccessState(
          status.acceptance_required ? 'required' : 'accepted',
        );
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        console.warn('The policy acknowledgement status could not be loaded.');
        setLegalStatusError('The policy acknowledgement service is unavailable.');
        setLegalAccessState('error');
      });
    return () => controller.abort();
  }, [isLogged, legalStatusReload]);

  useEffect(() => {
    if (!isLogged) return undefined;
    const recheckLegalStatus = () => {
      setLegalAccessState('loading');
      setLegalStatusReload((value) => value + 1);
    };
    window.addEventListener(
      LEGAL_ACCEPTANCE_REQUIRED_EVENT,
      recheckLegalStatus,
    );
    return () => window.removeEventListener(
      LEGAL_ACCEPTANCE_REQUIRED_EVENT,
      recheckLegalStatus,
    );
  }, [isLogged]);
  const [isProModeActive, setIsProModeActive] = useState(false);
  const completeSessionLogout = () => {
    authSession.logout();
    setIsProModeActive(false);
  };
  const confirmSessionLogout = () => {
    if (!window.confirm('Sign out of LUMA Quant?')) return;
    completeSessionLogout();
  };
  useEffect(() => {
    if (!authSession.lumaProAvailable && isProModeActive) {
      setIsProModeActive(false);
    }
  }, [authSession.lumaProAvailable, isProModeActive]);

  // --- GAMEPLAY BALANCES STATE ---
  const [credits, setCredits] = useState<number | null>(null);
  const [standardAnalysisCredits, setStandardAnalysisCredits] = useState(175);
  const [advisorLifecycle, setAdvisorLifecycle] = useState<AdvisorLifecycleContract | null>(null);
  const activeForecastDraw = advisorLifecycle?.active_forecast_draw ?? null;
  const forecastDrawLabel = advisorHeaderDrawLabel(advisorLifecycle);
  const forecastPreparationMessage = advisorForecastPreparationMessage(advisorLifecycle);
  const historicalAnalysisAvailable = isAdvisorHistoricalAnalysisAvailable(advisorLifecycle);
  const [engineStatus, setEngineStatus] = useState<EngineStatusResponse | null>(null);
  const [intelligence, setIntelligence] = useState<RecentIntelligenceEntry[]>([]);
  const [intelligenceState, setIntelligenceState] = useState<
    'idle' | 'loading' | 'ready' | 'unavailable'
  >('idle');
  const [countdown, setCountdown] = useState<string | null>(null);
  const [cutoffDeadlineMs, setCutoffDeadlineMs] = useState<number | null>(null);
  const [controlCenterTab, setControlCenterTab] = useState<'profile'|'ledger'>('profile');
  const workspaceLoadRevisionRef = useRef(0);

  useEffect(() => {
    if (!workspaceUnlocked) {
      return undefined;
    }
    return installPaymentReconciliation();
  }, [workspaceUnlocked]);

  useEffect(() => {
    if (!workspaceUnlocked) {
      return undefined;
    }
    return initializeSupportChat(
      import.meta.env.VITE_CRISP_WEBSITE_ID
        || '00000000-0000-0000-0000-000000000000',
    );
  }, [workspaceUnlocked]);
  const [activeTab, setActiveTab] = useState<
    'home' | 'advisor' | 'analytics' | 'shop' | 'settings'
  >(initialWorkspaceTab);
  const advisorProThemeActive = (
    workspaceUnlocked && isProModeActive && activeTab === 'advisor'
  );

  useEffect(() => {
    const portalThemeClass = 'theme-pro-portals';
    document.body.classList.toggle(
      portalThemeClass,
      advisorProThemeActive,
    );
    return () => {
      document.body.classList.remove(portalThemeClass);
    };
  }, [advisorProThemeActive]);

  // Load initial balance
  useEffect(() => {
    const controller = new AbortController();
    if (!workspaceUnlocked) {
      setCredits(null);
      setStandardAnalysisCredits(175);
      setAdvisorLifecycle(null);
      setEngineStatus(null);
      setIntelligence([]);
      setIntelligenceState('idle');
      return () => controller.abort();
    }

    setIntelligenceState('loading');
    const loadWorkspaceState = async () => {
      const revision = ++workspaceLoadRevisionRef.current;
      const [
        balanceResult,
        configResult,
        engineResult,
        intelligenceResult,
      ] = await Promise.allSettled([
        fetchCreditBalance(controller.signal),
        fetchAdvisorConfig(controller.signal),
        fetchEngineStatus(controller.signal),
        fetchRecentIntelligence(controller.signal),
      ]);
      if (
        controller.signal.aborted
        || revision !== workspaceLoadRevisionRef.current
      ) return;
      setCredits(balanceResult.status === 'fulfilled' ? balanceResult.value : null);
      setAdvisorLifecycle(
        configResult.status === 'fulfilled' ? configResult.value : null,
      );
      if (configResult.status === 'fulfilled') {
        const configuredCredits = Number(
          configResult.value.standard_preset.estimated_credits,
        );
        setStandardAnalysisCredits(
          Number.isFinite(configuredCredits) && configuredCredits > 0
            ? configuredCredits
            : 175,
        );
      }
      setEngineStatus(
        engineResult.status === 'fulfilled' ? engineResult.value : null,
      );
      if (engineResult.status === 'fulfilled') {
        const status = engineResult.value;
        const pendingDeadline = status.lifecycle_status === 'WAITING_FOR_SPRINTSTATE'
          && status.pending_cutoff_at
          ? Date.parse(status.pending_cutoff_at)
          : Number.NaN;
        setCutoffDeadlineMs(
          Number.isFinite(pendingDeadline)
            ? pendingDeadline
            : Date.now() + (status.remaining_seconds * 1_000),
        );
      } else {
        setCutoffDeadlineMs(null);
      }
      if (intelligenceResult.status === 'fulfilled') {
        setIntelligence(intelligenceResult.value.items);
        setIntelligenceState('ready');
      } else {
        setIntelligence([]);
        setIntelligenceState('unavailable');
      }
    };
    void loadWorkspaceState();
    const reloadWorkspaceState = () => void loadWorkspaceState();
    const refreshTimer = window.setInterval(loadWorkspaceState, 60_000);
    window.addEventListener('luma:credits-changed', reloadWorkspaceState);
    return () => {
      workspaceLoadRevisionRef.current += 1;
      controller.abort();
      window.clearInterval(refreshTimer);
      window.removeEventListener('luma:credits-changed', reloadWorkspaceState);
    };
  }, [workspaceUnlocked]);

  const engineStatusLabel = engineStatus === null
    ? 'Engine unavailable'
    : engineStatus.lifecycle_status === 'WAITING_FOR_SPRINTSTATE'
      ? `Engine ${engineStatus.pending_pipeline_status?.replaceAll('_', ' ') ?? 'awaiting SprintState'} · Draw ${engineStatus.pending_draw_id ?? 'next'} preparing`
      : `Engine ${engineStatus.pipeline_status.replaceAll('_', ' ')}`;

  // Server-anchored draw cutoff countdown. It never invents a new deadline.
  useEffect(() => {
    if (cutoffDeadlineMs === null) {
      setCountdown(null);
      return;
    }
    const updateCountdown = () => {
      const remaining = Math.max(
        0,
        Math.ceil((cutoffDeadlineMs - Date.now()) / 1_000),
      );
      const hours = Math.floor(remaining / 3_600);
      const minutes = Math.floor((remaining % 3_600) / 60);
      const seconds = remaining % 60;
      setCountdown(
        [hours, minutes, seconds]
          .map((value) => String(value).padStart(2, '0'))
          .join(':'),
      );
    };
    updateCountdown();
    const timer = window.setInterval(updateCountdown, 1_000);
    return () => window.clearInterval(timer);
  }, [cutoffDeadlineMs]);

  return (
    <div className={`h-[100dvh] w-full fixed inset-0 bg-canvas text-slate-100 flex flex-col font-sans selection:bg-cyan-950 selection:text-cyan-400 antialiased overflow-hidden py-0 px-0 ${advisorProThemeActive ? "theme-pro" : ""}`} id="master-luma-shell">

      {/* STUNNING HIGH-FIDELITY SPACE BACKGROUND */}
      <BackgroundCosmos isLogged={isLogged} />

      {/* INNER SCREEN CONTAINER (Scrollable application) */}
      <div className="flex-1 overflow-hidden relative z-10 flex flex-col w-full h-full bg-transparent">
          <AnimatePresence mode="wait">
            {authSession.status === 'restoring' ? (
              <motion.div
                key="session-restore"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="z-10 flex h-full w-full items-center justify-center"
              >
                <div className="rounded-2xl border border-white/10 bg-[#0B0F19]/80 px-8 py-6 font-mono text-xs uppercase tracking-widest text-cyan-300 backdrop-blur-xl">
                  Restoring secure session…
                </div>
              </motion.div>
            ) : !isLogged ? (
              // ==================== LOCK SCREEN INTERACTIVE LOGIN ====================
              <Gatekeeper
                key="gatekeeper"
                acquireProviderToken={acquireProviderToken}
                providerAvailability={providerAvailability}
                onAuthenticated={async (tokens) => {
                  await authSession.establishSession(tokens);
                }}
              />
            ) : legalAccessState === 'idle' || legalAccessState === 'loading' ? (
              <motion.div
                key="legal-status"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="z-10 flex h-full w-full items-center justify-center"
              >
                <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#0B0F19]/85 px-7 py-5 font-mono text-xs uppercase tracking-widest text-cyan-300 backdrop-blur-xl">
                  <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Checking policy acknowledgement…
                </div>
              </motion.div>
            ) : legalAccessState === 'required' ? (
              <LegalAcceptanceGate
                key="legal-acceptance"
                onAccepted={() => setLegalAccessState('accepted')}
                onLogout={confirmSessionLogout}
              />
            ) : legalAccessState === 'error' ? (
              <motion.div
                key="legal-error"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="z-10 flex h-full w-full items-center justify-center px-5"
              >
                <div className="w-full max-w-lg rounded-2xl border border-red-400/30 bg-[#0B0F19]/95 p-7 text-center backdrop-blur-xl">
                  <AlertCircle className="mx-auto h-7 w-7 text-red-300" aria-hidden="true" />
                  <h1 className="mt-4 text-xl font-semibold text-white">
                    Policy status unavailable
                  </h1>
                  <p className="mt-3 text-sm leading-6 text-slate-400">
                    {legalStatusError ?? 'The acknowledgement status could not be verified.'}
                    {' '}Workspace functions remain locked until verification succeeds.
                  </p>
                  <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
                    <button
                      type="button"
                      onClick={() => setLegalStatusReload((value) => value + 1)}
                      className="btn-cyber-glass min-h-[44px] rounded-xl px-5 text-sm text-cyan-200"
                    >
                      Retry
                    </button>
                    <button
                      type="button"
                      onClick={confirmSessionLogout}
                      className="min-h-[44px] rounded-xl border border-white/10 px-5 text-sm text-slate-300 hover:bg-white/5"
                    >
                      Sign out
                    </button>
                  </div>
                </div>
              </motion.div>
            ) : (
          // ==================== MAIN FULL-STACK GAMIFIED WORKSPACE ====================
          <motion.div
            key="dashboard"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex-1 flex flex-col-reverse md:flex-row z-10 relative overflow-hidden h-full w-full"
            id="workspace-viewport"
          >
            <SideNavbar 
              activeTab={activeTab as any} 
              setActiveTab={setActiveTab} 
              credits={credits} 
              onOpenLedger={() => setActiveTab('shop')}
              onLogout={completeSessionLogout}
            />

            
            {/* MAIN CORE DOCK DISPLAY */}
            <main className="relative z-10 min-w-0 flex-1 flex flex-col overflow-hidden w-full h-full bg-transparent" id="main-display-panel">
              {/* GLOBAL STATUS HEADER */}
              <header className="flex-shrink-0 h-14 md:h-16 w-full px-4 md:px-8 flex items-center justify-between border-b border-border-subtle bg-canvas-elevated/50 backdrop-blur-md z-40">
                <div className="flex items-center gap-4">
                  <span className="text-xs font-mono text-text-muted uppercase hidden md:inline-block">
                    {engineStatusLabel}
                  </span>
                </div>
                <div className="flex items-center gap-3 md:gap-6">
                  {/* Credit Count Badge */}
                  <button 
                    onClick={() => setActiveTab('shop')}
                    className="group flex items-center gap-2 rounded-lg border border-cyan-300/25 bg-gradient-to-r from-slate-950 via-cyan-950/70 to-blue-950 px-3 py-1.5 text-text-primary shadow-sm transition-all duration-200 hover:border-cyan-300/45 hover:from-cyan-950 hover:to-blue-900"
                    title="Click to view credit store"
                  >
                    <img src="/credits.webp" alt="Credits" className="w-4 h-4 object-contain group-hover:scale-110 transition-transform" />
                    <span className="text-xs font-mono font-medium text-text-primary">
                      {credits !== null ? credits.toLocaleString() : '...'} Credits
                    </span>
                  </button>

                  <div className="w-px h-4 bg-border-subtle hidden md:block"></div>

                  {/* Draw ID and cutoff come from the authenticated backend. */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-text-muted uppercase">
                      {forecastDrawLabel}
                    </span>
                  </div>
                  <div className="w-px h-4 bg-border-subtle hidden md:block"></div>
                  <div className="flex items-center gap-2">
                    <div
                      className={`h-2 w-2 rounded-full ${
                        engineStatus === null
                          ? 'bg-status-error'
                          : 'bg-accent-cyan animate-pulse'
                      }`}
                    />
                    <span
                      className={`text-xs font-mono uppercase ${
                        engineStatus === null
                          ? 'text-status-error'
                          : 'text-accent-cyan'
                      }`}
                    >
                      {countdown ?? 'CUTOFF UNAVAILABLE'}
                    </span>
                  </div>
                </div>
              </header>

              {/* SCROLLABLE MAIN CONTENT */}
              <div className="flex-1 overflow-y-auto w-full h-full scrollbar-none relative bg-content-scrim">

              <AnimatePresence mode="wait">
                              {/* ==================== TAB 1: HOME PANEL ==================== */}
                {activeTab === 'home' && (
                  <motion.div
                    key="tab-home"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.4 }}
                    className="flex flex-col w-full h-full bg-transparent"
                  >

                    {/* Main Canvas */}
                    <div className="flex-1 p-4 md:p-8 overflow-y-auto pb-24 md:pb-8">
                      <div className="max-w-5xl mx-auto flex flex-col gap-8">
                        
                        {/* A. CURRENT DRAW HERO */}
                        <section className="w-full rounded-2xl bg-canvas-elevated border border-border-subtle p-6 md:p-10 relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-subtle">
                          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(0,240,255,0.08),transparent_50%)] pointer-events-none" />
                          
                          <div className="flex flex-col gap-4 relative z-10 w-full md:w-auto">
                            <div className="flex items-center gap-3">
                              <Badge variant="cyan">
                                {forecastDrawLabel}
                              </Badge>
                              <StatusIndicator
                                status={engineStatus === null ? 'error' : 'active'}
                                showLabel
                                label={engineStatusLabel}
                              />
                            </div>
                            <div>
                              <h1 className="text-3xl md:text-4xl font-display font-medium text-text-primary tracking-tight">
                                Next Cutoff in{' '}
                                <span className="text-accent-cyan">
                                  {countdown ?? 'unavailable'}
                                </span>
                              </h1>
                              <p className="text-text-secondary mt-2 max-w-lg text-sm md:text-base leading-relaxed">
                                {forecastPreparationMessage
                                  ?? (engineStatus !== null && activeForecastDraw !== null
                                    ? 'The server contract is ready for the active forecast.'
                                    : 'The active forecast is currently unavailable. Reload the workspace before starting an analysis.')}
                              </p>
                            </div>
                          </div>

                          <div className="relative z-10 flex-shrink-0 w-full md:w-auto mt-4 md:mt-0">
                            <Button 
                              size="lg" 
                              onClick={() => setActiveTab('advisor')}
                              disabled={
                                engineStatus === null
                                || (activeForecastDraw === null && !historicalAnalysisAvailable)
                              }
                              className="w-full md:w-auto px-8 py-6 text-base font-bold tracking-wide relative overflow-hidden group btn-cyber-gradient"
                            >
                              <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.2)_50%,transparent_75%)] bg-[length:250%_250%,100%_100%] group-hover:animate-shine pointer-events-none" />
                              <Sparkles className="w-5 h-5 mr-2 relative z-10" />
                              <span className="relative z-10">
                                {activeForecastDraw === null && historicalAnalysisAvailable
                                  ? 'Open Historical Analysis'
                                  : 'Start Analysis for Next Cutoff'}
                              </span>
                            </Button>
                          </div>
                        </section>

                        {/* B. LIVE PIPELINE */}
                        <section className="w-full">
                          <EnginePipeline countdown={countdown} />
                        </section>

                        {/* C & D: NEWS INTELLIGENCE & QUICK ACTIONS */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                          
                          {/* C. NEWS INTELLIGENCE */}
                          <Card className="flex flex-col h-full bg-surface-primary border-border-subtle shadow-none">
                            <CardHeader className="pb-4 border-b border-border-subtle/50">
                              <div className="flex items-center gap-2">
                                <Lightbulb className="w-5 h-5 text-accent-magenta" />
                                <CardTitle className="text-lg">News Intelligence</CardTitle>
                              </div>
                            </CardHeader>
                            <CardContent className="flex-1 flex flex-col pt-6">
                              {intelligenceState === 'loading' ? (
                                <div className="flex-1 flex items-center justify-center py-10 text-sm text-text-muted">
                                  Loading workspace intelligence…
                                </div>
                              ) : intelligenceState === 'unavailable' ? (
                                <div className="flex-1 flex flex-col items-center justify-center py-10 px-4 text-center border border-dashed border-border-subtle rounded-xl bg-surface-secondary/30">
                                  <AlertCircle className="mb-4 h-8 w-8 text-status-warning" />
                                  <p className="text-text-primary font-medium mb-1">Intelligence unavailable</p>
                                  <p className="text-sm text-text-muted max-w-[280px]">
                                    The workspace activity feed could not be loaded.
                                  </p>
                                </div>
                              ) : intelligence.length === 0 ? (
                                <div className="flex-1 flex flex-col items-center justify-center py-10 px-4 text-center border border-dashed border-border-subtle rounded-xl bg-surface-secondary/30">
                                  <Database className="mb-4 h-8 w-8 text-text-muted" />
                                  <p className="text-text-primary font-medium mb-1">No recent activity</p>
                                  <p className="text-sm text-text-muted max-w-[280px]">
                                    Published release notes will appear here when they are provided by the LUMA backend.
                                  </p>
                                </div>
                              ) : (
                                <ol className="flex flex-col gap-3">
                                  {intelligence.map((entry) => (
                                    <li
                                      key={entry.id}
                                      className="grid grid-cols-[48px_1fr] gap-3 rounded-xl border border-border-subtle bg-surface-secondary/30 p-4"
                                    >
                                      <img
                                        src={intelligenceImageSources[entry.image_key]}
                                        alt="LUMA release"
                                        loading="lazy"
                                        className="h-12 w-12 rounded-lg border border-white/10 bg-[#060b15] object-cover"
                                      />
                                      <div className="min-w-0">
                                        <h4 className="text-sm font-medium text-text-primary">
                                          {entry.title}
                                        </h4>
                                        <p className="mt-1 text-sm leading-relaxed text-text-secondary">
                                          {entry.body}
                                        </p>
                                        <div className="mt-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-text-muted">
                                          <span>Release date</span>
                                          <time dateTime={entry.release_date}>
                                            {intelligenceReleaseDate(entry.release_date)}
                                          </time>
                                        </div>
                                      </div>
                                    </li>
                                  ))}
                                </ol>
                              )}
                            </CardContent>
                          </Card>

                          {/* D. QUICK ACTIONS */}
                          <div className="flex flex-col gap-4">
                             <div className="flex items-center gap-2 mb-2 px-1">
                               <Zap className="w-5 h-5 text-text-muted" />
                               <h3 className="text-lg font-display font-medium text-text-primary">Quick Actions</h3>
                             </div>
                             
                             <button 
                               onClick={() => setActiveTab('advisor')}
                               className="group flex items-start gap-4 rounded-xl border border-slate-700/70 bg-[#09111f] p-5 text-left shadow-sm transition-all duration-200 ease-luma hover:border-cyan-400/35 hover:bg-[#0b1828]"
                             >
                               <div className="w-12 h-12 rounded-xl bg-accent-cyan/10 flex items-center justify-center flex-shrink-0 group-hover:scale-105 group-hover:bg-accent-cyan/20 transition-all duration-200">
                                 <Settings2 className="w-6 h-6 text-accent-cyan" />
                               </div>
                               <div className="flex flex-col pt-1">
                                 <span className="text-text-primary font-medium group-hover:text-accent-cyan transition-colors">Configure Advisor</span>
                                 <span className="text-sm text-text-secondary mt-1 leading-snug">Choose server-provided tone, layers and quality controls.</span>
                               </div>
                             </button>

                             <button 
                               onClick={() => setActiveTab('analytics')}
                               className="group mt-2 flex items-start gap-4 rounded-xl border border-slate-700/70 bg-[#09111f] p-5 text-left shadow-sm transition-all duration-200 ease-luma hover:border-cyan-400/35 hover:bg-[#0b1828]"
                             >
                               <div className="w-12 h-12 rounded-xl bg-accent-magenta/10 flex items-center justify-center flex-shrink-0 group-hover:scale-105 group-hover:bg-accent-magenta/20 transition-all duration-200">
                                 <Layers className="w-6 h-6 text-accent-magenta" />
                               </div>
                               <div className="flex flex-col pt-1">
                                 <span className="text-text-primary font-medium group-hover:text-accent-magenta transition-colors">Analytics Ledger</span>
                                 <span className="text-sm text-text-secondary mt-1 leading-snug">Review historical draw data and fold evaluations.</span>
                               </div>
                             </button>
                          </div>

                        </div>
                      </div>
                    </div>
</motion.div>
                )}
                {activeTab === 'advisor' && (
                  <motion.div
                    key="tab-builder"
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -15 }}
                    className="w-full h-full flex flex-col"
                  >
                    {/* LUMA ADVISOR */}
                    <ViewErrorBoundary>
                      <Suspense fallback={<ViewLoadingFallback label="Loading Advisor…" />}>
                        <LazyLumaAdvisor
                        credits={credits}
                        onNavigateToStore={() => setActiveTab("shop")}
                        isProModeActive={isProModeActive}
                        setIsProModeActive={setIsProModeActive}
                        lumaProAvailable={authSession.lumaProAvailable}
                        lumaProUnavailableReason={
                          authSession.lumaProUnavailableReason
                          ?? authSession.capabilityError
                        }
                        />
                      </Suspense>
                    </ViewErrorBoundary>

                  </motion.div>
                )}

                {activeTab === 'analytics' && (
                  <motion.div
                    key="tab-analytics"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.4 }}
                    className="flex flex-col w-full h-full bg-transparent"
                  >
                    <ViewErrorBoundary>
                      <Suspense fallback={<ViewLoadingFallback label="Loading Analytics…" />}>
                        <LazyAnalyticsLedger ownerSub={authSession.claims?.sub ?? ''} />
                      </Suspense>
                    </ViewErrorBoundary>
                  </motion.div>
                )}

                {activeTab === 'shop' && (
                  <motion.div
                    key="tab-shop"
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    className="w-full h-full animate-fade-in bg-transparent"
                  >
                    <ViewErrorBoundary>
                      <Suspense fallback={<ViewLoadingFallback label="Loading Credit Store…" />}>
                        <LazyCreditStore
                        credits={credits}
                        standardAnalysisCredits={standardAnalysisCredits}
                        onNavigateToHistory={() => { setControlCenterTab('ledger'); setActiveTab('settings'); }}
                        onCreditsChanged={(balance) => {
                          if (typeof balance === 'number' && Number.isFinite(balance)) {
                            workspaceLoadRevisionRef.current += 1;
                            setCredits(balance);
                            return;
                          }
                          window.dispatchEvent(new Event('luma:credits-changed'));
                        }}
                        />
                      </Suspense>
                    </ViewErrorBoundary>
                  </motion.div>
                )}
                {activeTab === "settings" && (
                  <motion.div
                    key="tab-settings"
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    className="w-full flex-col gap-6 items-start animate-fade-in"
                  >
                    <div className="w-full">
                       <ViewErrorBoundary>
                         <Suspense fallback={<ViewLoadingFallback label="Loading Control Center…" />}>
                           <LazyControlCenter credits={credits} initialTab={controlCenterTab} />
                         </Suspense>
                       </ViewErrorBoundary>
                    </div>
                  </motion.div>
                )}

              </AnimatePresence>
            </div>
            </main>
          </motion.div>
        )}
      </AnimatePresence>

      </div> {/* closing INNER SCREEN CONTAINER */}

      {/* SWISS MODERN MINIMALIST BOTTOM FOOTER DETAIL */}
      <footer className="shrink-0 border-t border-border-subtle bg-canvas text-text-muted py-4 px-6 font-mono text-[10px] text-center flex flex-col md:flex-row justify-between items-center gap-2 w-full select-none z-50 opacity-80">
        <div className="flex items-center gap-2">
          <Database className="w-3.5 h-3.5 text-indigo-500 animate-pulse" />
          <span>LUMA Quant Intelligence Studio © 2026</span>
        </div>
        <LegalFooterLinks />
        <div>
          <span>
            {!isLogged
              ? 'Secure authentication gateway'
              : !workspaceUnlocked
                ? 'Legal acknowledgement required'
                : engineStatusLabel}
          </span>
        </div>
      </footer>
    </div>
  );
}
