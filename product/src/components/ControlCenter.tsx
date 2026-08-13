import apiClient from '@/src/api/apiClient';
import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { UnifiedCreditBalance } from './UnifiedCreditBalance';
import { LumaLabs } from './LumaLabs';
import { Switch } from './ui/Switch';
import {
  AlertTriangle,
  Check,
  History,
  Lightbulb,
  Loader2,
  Scale,
  Shield,
} from 'lucide-react';
import {
  fetchAllCreditLedger,
  type CreditHistoryEntry,
} from '../api/backendData';
import { LegalCenter } from './LegalCenter';

type Tab = 'profile' | 'ledger' | 'labs' | 'legal';

interface UserProfile {
  display_name: string;
  email: string;
}

interface ControlCenterProps {
  credits: number | null;
  initialTab?: Tab;
}

export const ControlCenter = ({ credits, initialTab = 'profile' }: ControlCenterProps) => {
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [displayNameInput, setDisplayNameInput] = useState('');
  const [isProfileLoading, setIsProfileLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  
  const [transactions, setTransactions] = useState<CreditHistoryEntry[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [ledgerError, setLedgerError] = useState<string | null>(null);
  
  useEffect(() => {
    const fetchProfile = async () => {
      setIsProfileLoading(true);
      setProfileError(null);
      try {
        const res = await apiClient.get('/api/v1/profile/me');
        if ((res.status >= 200 && res.status < 300)) {
          const data = res.data;
          setProfile(data);
          setDisplayNameInput(data.display_name || '');
        } else {
          throw new Error('API failed');
        }
      } catch {
        setProfile(null);
        setDisplayNameInput('');
        setProfileError('Profile data are currently unavailable.');
      } finally {
        setIsProfileLoading(false);
      }
    };
    fetchProfile();
  }, []);



  useEffect(() => {
    if (activeTab === 'ledger') {
      const fetchLedger = async () => {
        setIsLoadingHistory(true);
        setLedgerError(null);
        try {
          const ledger = await fetchAllCreditLedger();
          setTransactions(ledger.entries);
        } catch {
          setTransactions([]);
          setLedgerError('Credit history is currently unavailable.');
        } finally {
          setIsLoadingHistory(false);
        }
      };
      void fetchLedger();
    }
  }, [activeTab]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedName = displayNameInput.trim();
    if (isProfileLoading || !profile || !normalizedName) {
      return;
    }
    setIsSaving(true);
    setSaveSuccess(false);
    setProfileError(null);
    
    try {
      const res = await apiClient.patch('/api/v1/profile/me', { display_name: normalizedName });
      if (!(res.status >= 200 && res.status < 300)) throw new Error('API failed');
      
      setProfile(prev => prev ? { ...prev, display_name: normalizedName } : null);
      setDisplayNameInput(normalizedName);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch {
      setProfileError('Profile changes could not be saved.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-6rem)] w-full flex-col bg-transparent md:flex-row">
      
      {/* Sidebar (Master) */}
      <div className="flex w-full flex-shrink-0 flex-col border-b border-white/5 py-4 md:w-52 md:border-b-0 md:border-r md:py-8">
        <nav className="flex gap-2 overflow-x-auto px-4 md:flex-col">
          <button
            onClick={() => setActiveTab('profile')}
            className={`flex shrink-0 items-center gap-3 rounded-xl px-4 py-3 transition-all duration-300 ${activeTab === 'profile' ? 'bg-white/10 text-white font-medium' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}
          >
            <Shield className="w-4 h-4" />
            <span className="font-sans text-sm">Profile & Security</span>
          </button>
          
          <button
            onClick={() => setActiveTab('ledger')}
            className={`flex shrink-0 items-center gap-3 rounded-xl px-4 py-3 transition-all duration-300 ${activeTab === 'ledger' ? 'bg-white/10 text-white font-medium' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}
          >
            <History className="w-4 h-4" />
            <span className="font-sans text-sm">Credit Ledger</span>
          </button>

          <button
            onClick={() => setActiveTab('labs')}
            className={`flex shrink-0 items-center gap-3 rounded-xl px-4 py-3 transition-all duration-300 ${activeTab === 'labs' ? 'bg-white/10 text-white font-medium' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}
          >
            <Lightbulb className="h-4 w-4" />
            <span className="font-sans text-sm">LUMA Labs</span>
          </button>

          <button
            onClick={() => setActiveTab('legal')}
            className={`flex shrink-0 items-center gap-3 rounded-xl px-4 py-3 transition-all duration-300 ${activeTab === 'legal' ? 'bg-white/10 text-white font-medium' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}
          >
            <Scale className="h-4 w-4" />
            <span className="font-sans text-sm">Legal &amp; Privacy</span>
          </button>
        </nav>
      </div>

      {/* Content Area (Detail) */}
      <div className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-8 lg:p-12">
        
        {/* VIEW: Profile & Security */}
        {activeTab === 'profile' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl">
            <h2 className="text-white text-3xl font-display font-medium mb-10">Profile & Security</h2>
            {profileError && (
              <div className="mb-6 rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-300">
                {profileError}
              </div>
            )}
            
            <form
              onSubmit={handleUpdateProfile}
              aria-busy={isProfileLoading || isSaving}
              className="flex flex-col gap-8 mb-12"
            >
              <div className="flex flex-col gap-2">
                <label
                  htmlFor="control-center-email"
                  className="text-slate-500 font-sans text-xs uppercase tracking-widest"
                >
                  Communication Node
                </label>
                <input 
                  id="control-center-email"
                  type="email" 
                  value={profile?.email || ''} 
                  readOnly
                  disabled
                  className="w-full bg-transparent border-b border-white/10 py-3 text-slate-400 font-mono text-sm focus:outline-none cursor-not-allowed opacity-70"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label
                  htmlFor="control-center-display-name"
                  className="text-slate-500 font-sans text-xs uppercase tracking-widest"
                >
                  Display Name
                </label>
                <input 
                  id="control-center-display-name"
                  type="text" 
                  value={displayNameInput}
                  onChange={(e) => setDisplayNameInput(e.target.value)}
                  disabled={isProfileLoading || !profile || isSaving}
                  className="w-full bg-transparent border-b border-white/20 py-3 text-white font-mono text-sm focus:outline-none focus:border-cyan-400 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>

              <div>
                <button 
                  type="submit" 
                  disabled={
                    isSaving
                    || isProfileLoading
                    || !profile
                    || !displayNameInput.trim()
                  }
                  className="flex items-center justify-center gap-2 btn-cyber-gradient px-6 py-3 rounded-xl font-sans text-sm font-medium transition-all active:scale-95 disabled:opacity-50"
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin text-cyan-400" /> : (saveSuccess ? <Check className="w-4 h-4 text-cyan-400" /> : null)}
                  {isProfileLoading
                    ? 'Loading profile…'
                    : isSaving
                      ? 'Saving…'
                      : saveSuccess
                        ? 'Saved'
                        : 'Save Changes'}
                </button>
              </div>
            </form>

            <div className="flex items-center justify-between py-6 border-y border-white/5 mb-12">
              <div className="flex flex-col gap-1">
                <span className="text-white font-sans font-medium text-base">Quantum Biometric Lock (2FA)</span>
                <span className="text-slate-500 font-sans text-sm max-w-sm">
                  Two-factor authentication is not available in the current backend contract.
                </span>
              </div>
              
              <Switch
                checked={false}
                disabled
                aria-label="Quantum Biometric Lock (2FA) unavailable"
              />
            </div>

            <div className="border border-red-900/30 bg-red-950/10 rounded-2xl p-8 relative overflow-hidden group">
              <h4 className="text-red-400 font-display font-medium mb-2 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Danger Zone
              </h4>
              <p className="text-slate-400 font-sans text-sm mb-6 max-w-md">
                Account deletion is not exposed by the current backend contract.
                Contact support if you need an account-deletion request.
              </p>
              <button
                type="button"
                disabled
                className="w-full max-w-md cursor-not-allowed rounded-xl border border-red-900/50 bg-red-950/50 px-6 py-3 font-sans text-sm font-medium text-red-200 opacity-50"
              >
                Account deletion unavailable
              </button>
            </div>

          </motion.div>
        )}

        {/* VIEW: Credit Ledger */}
        {activeTab === 'ledger' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-4xl">
            <div className="flex items-center justify-between mb-10">
              <div>
                <h2 className="text-white text-3xl font-display font-medium mb-2">Credit Ledger</h2>
                <p className="text-slate-500 font-sans text-sm">Transaction history and usage logs.</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="text-[10px] font-sans text-slate-500 uppercase tracking-widest font-medium">Balance</span>
                <UnifiedCreditBalance credits={credits} />
              </div>
            </div>
            
            {isLoadingHistory ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-6 h-6 text-cyan-400 animate-spin" />
              </div>
            ) : (
              <div className="w-full overflow-x-auto border border-white/5 rounded-2xl bg-black/20">
                <table className="w-full min-w-[760px] text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/5 text-[11px] font-sans text-slate-500 font-medium bg-white/[0.02]">
                      <th className="py-4 px-6 font-normal">Date</th>
                      <th className="py-4 px-6 font-normal">Transaction Hash</th>
                      <th className="py-4 px-6 font-normal">Description</th>
                      <th className="py-4 px-6 font-normal text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {transactions.map((tx) => (
                      <tr key={tx.id} className="hover:bg-white/[0.02] transition-colors group">
                        <td className="py-4 px-6 align-middle">
                          <span className="text-sm font-sans text-slate-400 group-hover:text-slate-300 transition-colors">
                            {new Date(tx.created_at).toLocaleDateString('en-GB')} {new Date(tx.created_at).toLocaleTimeString('en-GB', {hour: '2-digit', minute:'2-digit'})}
                          </span>
                        </td>
                        <td className="py-4 px-6 align-middle">
                          <span className="text-xs font-mono text-slate-500">
                            {tx.ref ?? tx.related_resource_id ?? tx.id}
                          </span>
                        </td>
                        <td className="py-4 px-6 align-middle">
                          <span className="text-sm font-sans text-slate-300 group-hover:text-white transition-colors">
                            {tx.label}
                          </span>
                        </td>
                        <td className="py-4 px-6 align-middle text-right">
                          <div className="flex items-center justify-end gap-2 font-mono text-sm tracking-wide">
                            {tx.direction === 'CREDIT' ? (
                              <>
                                <span className="text-[#00f0ff] text-lg font-bold leading-none">+</span>
                                <span className="text-green-400">{Math.abs(Number(tx.delta)).toFixed(2)} CR</span>
                              </>
                            ) : (
                              <>
                                <span className="text-[#FF15F3]/80 text-lg font-bold leading-none">-</span>
                                <span className="text-[#FF15F3]">{Math.abs(Number(tx.delta)).toFixed(2)} CR</span>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {transactions.length === 0 && (
                   <div className="py-12 text-center text-slate-500 font-sans text-sm">
                     {ledgerError ? `Ledger unavailable: ${ledgerError}` : 'No transactions found.'}
                   </div>
                )}
              </div>
            )}
          </motion.div>
        )}

        <motion.div
          hidden={activeTab !== 'labs'}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <LumaLabs />
        </motion.div>

        {activeTab === 'legal' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <LegalCenter embedded />
          </motion.div>
        )}
      </div>
    </div>
  );
};
