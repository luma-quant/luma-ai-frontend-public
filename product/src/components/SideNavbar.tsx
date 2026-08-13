import React, { useState, useSyncExternalStore } from 'react';
import { Eye, Cpu, BrainCircuit, MessageSquare, ShoppingCart, Settings, Activity, ChevronLeft, ChevronRight, LogOut } from 'lucide-react';
import { CreditCrystal, QuantumLogo } from './CosmicVisuals';
import {
  getSupportUnread,
  openSupportChat,
  subscribeSupportUnread,
} from '../support/crisp';

interface SideNavbarProps {
  onLogout: () => void;
  activeTab: 'home' | 'advisor' | 'analytics' | 'shop' | 'settings';
  setActiveTab: (
    tab: 'home' | 'advisor' | 'analytics' | 'shop' | 'settings'
  ) => void;
  credits: number | null;
  onOpenLedger?: () => void;
}

import { UnifiedCreditBalance } from './UnifiedCreditBalance';

export const SideNavbar = ({ activeTab, setActiveTab, credits, onLogout, onOpenLedger }: SideNavbarProps) => {
  const [logoutConfirmationOpen, setLogoutConfirmationOpen] = useState(false);
  const supportUnread = useSyncExternalStore(
    subscribeSupportUnread,
    getSupportUnread,
    () => false,
  );
  const [isCollapsed, setIsCollapsed] = useState(() => {
    const saved = localStorage.getItem('luma_sidebar_collapsed');
    return saved === 'true';
  });

  const toggleCollapse = () => {
    setIsCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('luma_sidebar_collapsed', String(next));
      return next;
    });
  };

  const pipelineSteps = [
    { id: 'home', label: 'Engine', description: 'Monitor live data stream', icon: <Activity className="w-4 h-4" /> },
    { id: 'advisor', label: 'LUMA', description: 'Configure & Run Analysis', icon: <Cpu className="w-4 h-4" /> },
    { id: 'analytics', label: 'Analytics', description: 'Model outcomes & history', icon: <BrainCircuit className="w-4 h-4" /> },
  ] as const;

  const utilities = [
    { id: 'settings', label: 'System', icon: <Settings className="w-4 h-4" /> },
    { id: 'support', label: 'Support', icon: <MessageSquare className="w-4 h-4" /> },
    { id: 'logout', label: 'Logout', icon: <LogOut className="w-4 h-4" /> },
  ] as const;

  return (
    <>
      {/* Desktop Sidebar */}
      <nav className={`hidden md:flex ${isCollapsed ? 'w-[80px]' : 'w-[280px]'} h-full bg-surface-primary border-r border-border-subtle flex-col flex-shrink-0 z-50 transition-all duration-300 relative`}>
        {/* Header / Logo & Collapse Toggle */}
        {isCollapsed ? (
          <div className="py-6 mb-2 flex flex-col items-center justify-center gap-3 w-full">
            <div className="flex items-center justify-center w-full" title="LUMA Quant">
              <QuantumLogo className="w-12 h-12 shrink-0" glowing />
            </div>
            <button
              onClick={toggleCollapse}
              className="p-1.5 rounded-md border border-border-subtle bg-surface-secondary text-text-muted hover:text-text-primary hover:border-border-active transition-all focus:outline-none shrink-0"
              title="Expand Sidebar"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="py-6 mb-2 flex items-center justify-between px-6 w-full">
            <div className="flex items-center gap-3 min-w-0">
              <QuantumLogo className="w-12 h-12 shrink-0" glowing />
              <span className="text-text-primary font-sans font-medium tracking-wide truncate">
                LUMA Quant
              </span>
            </div>
            <button
              onClick={toggleCollapse}
              className="p-1.5 rounded-md border border-border-subtle bg-surface-secondary text-text-muted hover:text-text-primary hover:border-border-active transition-all focus:outline-none shrink-0"
              title="Collapse Sidebar"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Intelligence Pipeline */}
        <div className={`flex flex-col w-full ${isCollapsed ? 'px-2' : 'px-4'} flex-1 transition-all duration-300`}>
          {!isCollapsed ? (
            <span className="px-2 text-sm font-sans font-medium text-text-muted mb-4">Pipeline</span>
          ) : (
            <div className="w-full border-t border-border-subtle/30 my-4" />
          )}
          
          <div className="flex flex-col relative gap-1">
            {/* Connecting line */}
            {!isCollapsed && <div className="absolute left-[23px] top-6 bottom-8 w-px bg-border-subtle z-0" />}
            
            {pipelineSteps.map((step, index) => {
              const isActive = activeTab === step.id;
              // Determine if a previous step is active, to highlight the line
              const isPast = pipelineSteps.findIndex(s => s.id === activeTab) >= index;
              
              return (
                <button
                  key={step.id}
                  onClick={() => setActiveTab(step.id as any)}
                  className={`flex ${isCollapsed ? 'justify-center py-3' : 'items-start gap-4 px-2 py-3'} transition-all duration-300 w-full rounded-xl focus-visible:outline-none group relative z-10 text-left`}
                >
                  <div className={"w-8 h-8 rounded-full flex items-center justify-center shrink-0 border transition-colors " + (
                    isActive ? "bg-accent-cyan/10 border-accent-cyan/30 text-accent-cyan shadow-glow-sm" : 
                    isPast ? "bg-surface-secondary border-accent-cyan/20 text-accent-cyan/70" :
                    "bg-surface-secondary border-border-subtle text-text-muted group-hover:text-text-primary"
                  )}>
                    {step.icon}
                  </div>
                  
                  {!isCollapsed && (
                    <div className="flex flex-col pt-1">
                      <span className={"text-base font-sans transition-colors " + (isActive ? "text-text-primary font-medium" : "text-text-secondary group-hover:text-text-primary")}>
                        {step.label}
                      </span>
                      <span className={"text-xs font-sans transition-colors " + (isActive ? "text-text-secondary" : "text-text-muted")}>
                        {step.description}
                      </span>
                    </div>
                  )}

                  {isCollapsed && (
                    <div className="absolute left-16 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-[#121620] border border-white/20 rounded-lg text-text-primary text-xs font-sans font-medium shadow-2xl pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-50 whitespace-nowrap">
                      {step.label}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {!isCollapsed ? (
            <span className="px-2 text-sm font-sans font-medium text-text-muted mt-8 mb-4">Utilities</span>
          ) : (
            <div className="w-full border-t border-border-subtle/30 my-4 mt-6" />
          )}
          
          <div className="flex flex-col gap-1">
            {utilities.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  aria-label={
                    tab.id === 'support' && supportUnread
                      ? 'Support — new message'
                      : tab.label
                  }
                  onClick={() => {
                    if (tab.id === 'logout') {
                      setLogoutConfirmationOpen(true);
                    } else if (tab.id === 'support') {
                      openSupportChat();
                    } else {
                      setActiveTab(tab.id as any);
                    }
                  }}
                  className={`flex items-center transition-all duration-200 w-full py-3 rounded-lg focus-visible:outline-none group relative z-10 ${
                    isCollapsed ? "justify-center" : "gap-3 px-4"
                  } ${
                    isActive ? "bg-surface-secondary text-text-primary font-medium" : "text-text-secondary hover:text-text-primary hover:bg-surface-secondary/50"
                  }`}
                >
                  <div className={`relative ${isActive ? "text-text-primary" : "text-text-muted"}`}>
                    {tab.icon}
                    {tab.id === 'support' && supportUnread && (
                      <span
                        className="absolute -right-1.5 -top-1.5 h-2.5 w-2.5 rounded-full border-2 border-surface-primary bg-accent-cyan shadow-glow-sm"
                        aria-hidden="true"
                      />
                    )}
                  </div>
                  {!isCollapsed && <span className="text-sm font-sans">{tab.label}</span>}
                  {!isCollapsed && tab.id === 'support' && supportUnread && (
                    <span className="ml-auto rounded-full border border-accent-cyan/30 bg-accent-cyan/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-accent-cyan">
                      New
                    </span>
                  )}

                  {isCollapsed && (
                    <div className="absolute left-16 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-[#121620] border border-white/20 rounded-lg text-text-primary text-xs font-sans font-medium shadow-2xl pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-50 whitespace-nowrap">
                      {tab.label}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Bottom Actions */}
        <div className={`pb-6 w-full pt-4 mt-auto transition-all duration-300 ${isCollapsed ? 'px-2' : 'px-4'}`}>
          {/* Credits Ledger */}
          <div 
            className={`group relative flex cursor-pointer items-center justify-between rounded-xl border border-cyan-300/20 bg-gradient-to-r from-slate-950/80 via-cyan-950/55 to-blue-950/70 p-4 transition-all hover:border-cyan-300/40 hover:from-cyan-950/80 hover:to-blue-900/70 focus:outline-none ${isCollapsed ? 'w-12 h-12 justify-center p-0 mx-auto' : ''}`} 
            onClick={onOpenLedger} 
            tabIndex={0} 
            role="button"
          >
            <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'}`}>
              <img src="/credits.webp" alt="Credits" className="w-5 h-5 object-contain" />
              {!isCollapsed && (
                <span className="text-sm font-sans text-text-primary font-medium">Credits Shop</span>
              )}
            </div>
            {isCollapsed && (
              <div className="absolute left-16 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-[#121620] border border-white/20 rounded-lg text-text-primary text-xs font-sans font-medium shadow-2xl pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-50 whitespace-nowrap">
                Credits Shop
              </div>
            )}
          </div>
          
          {!isCollapsed && (
            <div className="mt-4 flex justify-between items-center px-2 pointer-events-none">
              <span className="text-[10px] font-mono text-text-muted">WORKSPACE SESSION</span>
              <span className="text-[10px] font-mono text-accent-cyan">AUTHENTICATED</span>
            </div>
          )}
        </div>
      </nav>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden w-full h-16 bg-surface-primary border-t border-border-subtle flex items-center justify-around z-50 flex-shrink-0 pb-[env(safe-area-inset-bottom)]">
        {[...pipelineSteps, ...utilities].map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              aria-label={
                tab.id === 'support' && supportUnread
                  ? 'Support — new message'
                  : tab.label
              }
              onClick={() => {
                if (tab.id === 'logout') {
                  setLogoutConfirmationOpen(true);
                } else if (tab.id === 'support') {
                  openSupportChat();
                } else {
                  setActiveTab(tab.id as any);
                }
              }}
              className={"flex flex-col items-center justify-center gap-1 w-full h-full transition-colors " + (
                isActive ? "text-accent-cyan" : "text-text-muted hover:text-text-primary"
              )}
            >
              <div className="relative">
                {tab.icon}
                {tab.id === 'support' && supportUnread && (
                  <span
                    className="absolute -right-1.5 -top-1.5 h-2.5 w-2.5 rounded-full border-2 border-surface-primary bg-accent-cyan shadow-glow-sm"
                    aria-hidden="true"
                  />
                )}
              </div>
              <span className="text-[10px] font-sans font-medium">{tab.label}</span>
              {tab.id === 'support' && supportUnread && (
                <span className="sr-only">New support message</span>
              )}
            </button>
          );
        })}
      </nav>

      {logoutConfirmationOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-[#020713]/80 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="logout-confirmation-title"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) {
              setLogoutConfirmationOpen(false);
            }
          }}
        >
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0b1322] p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-400/25 bg-cyan-400/10 text-cyan-300">
                <LogOut className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <h2 id="logout-confirmation-title" className="text-lg font-semibold text-white">
                  Sign out of LUMA Quant?
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-slate-400">
                  Your secure workspace session will end on this device.
                </p>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setLogoutConfirmationOpen(false)}
                className="min-h-[44px] rounded-xl border border-white/10 px-4 text-sm font-medium text-slate-300 transition-colors hover:border-white/20 hover:bg-white/5 hover:text-white focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
              >
                Stay signed in
              </button>
              <button
                type="button"
                onClick={() => {
                  setLogoutConfirmationOpen(false);
                  onLogout();
                }}
                className="min-h-[44px] rounded-xl border border-red-400/30 bg-red-500/10 px-4 text-sm font-medium text-red-200 transition-colors hover:border-red-300/50 hover:bg-red-500/20 focus:outline-none focus:ring-2 focus:ring-red-400/40"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
