import React, { useState, useRef, useEffect, useMemo } from 'react';
import { UploadCloud, FileText, Zap, RefreshCw, AlertCircle, FileSpreadsheet, Loader2, Sparkles, Settings2, X, ChevronRight, Activity, CheckCircle2, AlertTriangle, Play, Info, Clock } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from './ui/Popover';
import { Slider } from './ui/Slider';
import { Switch } from './ui/Switch';
import { motion, AnimatePresence } from 'motion/react';

import { RunSummaryPanel } from "./RunSummary";
import {
  createAdvisorRun,
  downloadAdvisorReportPdf,
  fetchActiveAdvisorRun,
  fetchAdvisorAvailability,
  fetchAdvisorCsvPreview,
  fetchAdvisorConfig,
  fetchAdvisorQuote,
  fetchAdvisorRun,
  uploadAdvisorCsv,
  type AdvisorAvailabilityResponse,
  type AdvisorAnalysisScope,
  type AdvisorConfigResponse,
  type AdvisorQuoteResponse,
  type AdvisorRunCreateRequest,
  type AdvisorRunResponse,
  type AdvisorUploadPreviewResponse,
} from '../api/backendData';
import {
  ADVISOR_PROMPT_STORAGE_KEY,
  AdvisorRunSubmissionPendingError,
  canReconstructAdvisorSubmission,
  clearAdvisorRetrySnapshot,
  clearAdvisorRunRetryNotBefore,
  clearCurrentAdvisorRun,
  persistCurrentAdvisorRun,
  persistAdvisorRunRetryNotBefore,
  readAdvisorRetrySnapshot,
  readAdvisorRunRetryNotBefore,
  readCurrentAdvisorRun,
  resumePendingAdvisorRun,
  submitPendingAdvisorRun,
  type AdvisorRetrySnapshot,
  type PendingAdvisorRun,
} from '../api/advisorRunRecovery';
import {
  ADVISOR_RELEASE_NOT_READY_MESSAGE,
  AdvisorUserFacingError,
  advisorCapabilityMessage,
  advisorErrorMessage,
  advisorRunSubmissionRetryAfterMs,
  isAdvisorBusinessConflict,
  isAdvisorRunAlreadyActive,
  isAdvisorReleaseReadinessCode,
  isAdvisorReleaseReadinessConflict,
} from '../api/advisorErrors';
import { AdvisorQuoteConflictGuard } from '../api/advisorQuoteGuard';
import {
  advisorIssueResultBelongsToActiveRun,
  hasReportedAdvisorIssue,
  markAdvisorIssueReported,
  reportAdvisorIssue,
} from '../api/advisorIssueReporting';
import {
  filterAvailableAdvisorLayers,
  normalizeAdvisorLayerSelection,
} from '../api/advisorCapabilities';
import { advisorProgressView } from '../api/advisorProgress';
import {
  advisorAnalysisBoundaryDraw,
  advisorHistoricalHistoryEnd,
  advisorForecastPreparationMessage,
  isAdvisorAnalysisScopeBlocked,
  isAdvisorForecastAnalysisAvailable,
  isAdvisorHistoricalAnalysisAvailable,
  resolveAdvisorAnalysisScope,
} from '../api/advisorLifecycle';
import { AdvisorReportView } from './AdvisorReportView';

const ACTIVE_ADVISOR_RUN_STATUSES = new Set([
  'QUEUED',
  'QUERYING',
  'GENERATING',
  'QA_REVIEW',
]);

type AdvisorErrorPresentation = 'terminal' | 'cooldown' | 'request';
type AdvisorIssueReportState = 'idle' | 'submitting' | 'reported' | 'error';

interface AdvisorIssueReportUiState {
  runId: string | null;
  state: AdvisorIssueReportState;
  error: string | null;
}

function formatAdvisorRetryCountdown(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.ceil(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return minutes > 0
    ? `${minutes}:${seconds.toString().padStart(2, '0')}`
    : `${seconds}s`;
}

function isRetryableAdvisorPollError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('response' in error)) {
    return true;
  }
  const status = Number(
    (error as { response?: { status?: unknown } }).response?.status,
  );
  return !Number.isFinite(status)
    || status === 408
    || status === 425
    || status === 429
    || status >= 500;
}

function isDefinitivelyMissingAdvisorRun(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('response' in error)) {
    return false;
  }
  return Number(
    (error as { response?: { status?: unknown } }).response?.status,
  ) === 404;
}

function isStrictlyNewerAdvisorRun(
  candidate: AdvisorRunResponse,
  baseline: AdvisorRunResponse,
): boolean {
  if (candidate.id === baseline.id) return false;
  const candidateCreatedAt = Date.parse(candidate.created_at);
  const baselineCreatedAt = Date.parse(baseline.created_at);
  return Number.isFinite(candidateCreatedAt)
    && Number.isFinite(baselineCreatedAt)
    && candidateCreatedAt > baselineCreatedAt;
}

function waitForAdvisorPoll(
  signal: AbortSignal,
  delayMs = 2_000,
): Promise<void> {
  return new Promise((resolve) => {
    const finish = () => {
      signal.removeEventListener('abort', handleAbort);
      resolve();
    };
    const timer = window.setTimeout(finish, delayMs);
    const handleAbort = () => {
      window.clearTimeout(timer);
      finish();
    };
    signal.addEventListener('abort', handleAbort, { once: true });
  });
}

export async function pollAdvisorRun(
  initialRun: AdvisorRunResponse,
  signal: AbortSignal,
  onUpdate?: (run: AdvisorRunResponse) => void,
): Promise<AdvisorRunResponse> {
  let run = initialRun;
  let retryDelayMs = 2_000;
  onUpdate?.(run);
  while (ACTIVE_ADVISOR_RUN_STATUSES.has(run.status) && !signal.aborted) {
    await waitForAdvisorPoll(signal, retryDelayMs);
    if (signal.aborted) return run;
    try {
      run = await fetchAdvisorRun(run.id, signal);
      retryDelayMs = 2_000;
      onUpdate?.(run);
    } catch (pollError) {
      if (signal.aborted) return run;
      if (!isRetryableAdvisorPollError(pollError)) throw pollError;
      // The server owns the terminal state. A transient network/CDN/API failure
      // must not turn an active, credit-reserved run into a false UI failure.
      retryDelayMs = Math.min(retryDelayMs * 2, 15_000);
    }
  }
  return run;
}

const EditableNumber = ({ value, onChange, min, max, className, disabled }: any) => {
  const [localVal, setLocalVal] = useState(value.toString());

  useEffect(() => {
    setLocalVal(value.toString());
  }, [value]);

  const handleBlur = () => {
    let parsed = parseInt(localVal, 10);
    if (isNaN(parsed)) parsed = min;
    parsed = Math.max(min, Math.min(max, parsed));
    setLocalVal(parsed.toString());
    onChange(parsed);
  };

  const handleKeyDown = (e: any) => {
    if (e.key === "Enter") {
      e.target.blur();
    }
  };

  return (
    <input
      type="text"
      value={localVal}
      onChange={e => setLocalVal(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      disabled={disabled}
      className={className}
    />
  );
};

interface LumaAdvisorProps {
  credits: number | null;
  onNavigateToStore?: () => void;
  isProModeActive?: boolean;
  setIsProModeActive?: (value: boolean) => void;
  lumaProAvailable?: boolean;
  lumaProUnavailableReason?: string | null;
}

export const LumaAdvisor = ({
  credits,
  onNavigateToStore,
  isProModeActive = false,
  setIsProModeActive,
  lumaProAvailable = false,
  lumaProUnavailableReason = null,
}: LumaAdvisorProps) => {
  const [prompt, setPrompt] = useState(() => {
    try {
      return localStorage.getItem(ADVISOR_PROMPT_STORAGE_KEY) || '';
    } catch {
      return '';
    }
  });
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadedCsv, setUploadedCsv] = useState<AdvisorUploadPreviewResponse | null>(null);
  const [isCsvUploading, setIsCsvUploading] = useState(false);
  const [csvUploadError, setCsvUploadError] = useState<string | null>(null);

  // Layout State
  const [isMobileSettingsOpen, setIsMobileSettingsOpen] = useState(false);
  const [advisorConfig, setAdvisorConfig] = useState<AdvisorConfigResponse | null>(null);
  const [advisorAvailability, setAdvisorAvailability] = useState<AdvisorAvailabilityResponse | null>(null);
  const [analysisScope, setAnalysisScope] = useState<AdvisorAnalysisScope>('forecast');
  const [capabilityError, setCapabilityError] = useState<string | null>(null);
  const [capabilityRefreshRevision, setCapabilityRefreshRevision] = useState(0);

  // Settings Panel State
  const [horizonStart, setHorizonStart] = useState(() => {
    try {
      const stored = localStorage.getItem('luma_horizon_start');
      return stored ? parseInt(stored, 10) : 1;
    } catch {
      return 1;
    }
  });
  const [horizonEnd, setHorizonEnd] = useState(() => {
    try {
      const stored = localStorage.getItem('luma_horizon_end');
      return stored ? parseInt(stored, 10) : 1;
    } catch {
      return 1;
    }
  });
  const [tone, setTone] = useState(() => {
    try {
      return localStorage.getItem('luma_tone') || 'standard';
    } catch {
      return 'standard';
    }
  }); // Standard | Expert | Analytical | Exploratory
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [isAssetsInfoOpen, setIsAssetsInfoOpen] = useState(false);
  const [isRulesInfoOpen, setIsRulesInfoOpen] = useState(false);
  const [isHorizonInfoOpen, setIsHorizonInfoOpen] = useState(false);
  const [isPresetsInfoOpen, setIsPresetsInfoOpen] = useState(false);
  
  // Tag grids
  const [activeAssets, setActiveAssets] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('luma_active_assets');
      return stored
        ? normalizeAdvisorLayerSelection(JSON.parse(stored))
        : [];
    } catch {
      return [];
    }
  });

  const assetTags = advisorConfig?.signal_layers ?? [];
  const historyMin = advisorConfig?.earliest_history_draw ?? 1;
  const historyMax = advisorHistoricalHistoryEnd(advisorConfig) ?? historyMin;
  const signalHistoryMin = advisorConfig?.earliest_signal_history_draw
    ?? historyMin;
  const effectiveProAvailable = Boolean(
    advisorConfig?.luma_pro.available ?? lumaProAvailable,
  );
  const rawProUnavailableReason =
    advisorConfig?.luma_pro.unavailable_reason ?? lumaProUnavailableReason;
  const effectiveProUnavailableReason = rawProUnavailableReason
    ? advisorCapabilityMessage(
        rawProUnavailableReason,
        'LUMA Pro is temporarily unavailable.',
      )
    : null;
  const deepEvidenceAvailable = Boolean(
    advisorConfig?.deep_evidence?.available,
  );
  const deepEvidenceUnavailableReason =
    advisorConfig?.deep_evidence?.unavailable_reason ?? null;
  const layerAvailability = new Map(
    (advisorAvailability?.layers ?? []).map((layer) => [layer.layer_id, layer]),
  );
  const forecastAnalysisAvailable = isAdvisorForecastAnalysisAvailable(advisorConfig);
  const historicalAnalysisAvailable = isAdvisorHistoricalAnalysisAvailable(advisorConfig);
  const advisorScopeBlocked = isAdvisorAnalysisScopeBlocked(
    advisorConfig,
    analysisScope,
  );
  const forecastPreparationMessage = advisorForecastPreparationMessage(advisorConfig);
  const standardPresetAvailable = Boolean(
    analysisScope === 'forecast' && forecastAnalysisAvailable,
  );
  const standardPresetRequiresForecast = Boolean(
    analysisScope !== 'forecast' && forecastAnalysisAvailable,
  );
  const standardPresetUnavailableMessage = standardPresetAvailable
    ? null
    : forecastPreparationMessage
      ? `${forecastPreparationMessage}. This preset unlocks with the active release.`
      : standardPresetRequiresForecast
        ? 'Switch to Forecast Analysis to use this preset.'
        : 'This preset requires an active forecast release.';
  const advisorScopeBlockedMessage = advisorScopeBlocked
    ? analysisScope === 'forecast'
      ? forecastPreparationMessage ?? 'Forecast analysis is temporarily unavailable.'
      : 'Historical analysis is temporarily unavailable.'
    : null;

  useEffect(() => {
    const controller = new AbortController();
    const loadCapabilities = async () => {
      setCapabilityError(null);
      try {
        const config = await fetchAdvisorConfig(controller.signal);
        const resolvedScope = resolveAdvisorAnalysisScope(config, analysisScope);
        const latestHistoryEndDraw = advisorHistoricalHistoryEnd(config);
        const historyEndDraw = resolvedScope === 'historical'
          && latestHistoryEndDraw !== null
          ? Math.min(
              latestHistoryEndDraw,
              Math.max(config.earliest_history_draw, horizonEnd),
            )
          : latestHistoryEndDraw;
        const forecastDraw = resolvedScope === 'forecast'
          ? config.active_forecast_draw
          : null;
        const availability = historyEndDraw === null
          ? null
          : await fetchAdvisorAvailability({
              analysis_scope: resolvedScope,
              forecast_draw: forecastDraw,
              history_end_draw: historyEndDraw,
            }, controller.signal);
        const expectedBoundaryDraw = advisorAnalysisBoundaryDraw(
          config,
          resolvedScope,
        );
        if (
          availability !== null
          && (
            availability.analysis_scope !== resolvedScope
            || availability.history_end_draw !== historyEndDraw
            || availability.forecast_draw !== expectedBoundaryDraw
          )
        ) {
          throw new Error('Advisor capability boundary mismatch.');
        }
        if (controller.signal.aborted) return;
        setAnalysisScope(resolvedScope);
        setAdvisorConfig(config);
        setAdvisorAvailability(availability);

        const max = latestHistoryEndDraw ?? config.earliest_history_draw;
        setHorizonStart((current) => Math.min(
          max,
          Math.max(config.earliest_history_draw, current),
        ));
        setHorizonEnd((current) => {
          if (resolvedScope === 'forecast') return max;
          let candidate = current;
          try {
            const stored = window.localStorage.getItem('luma_horizon_end');
            candidate = stored === null ? max : Number.parseInt(stored, 10);
          } catch {
            candidate = max;
          }
          return Number.isFinite(candidate)
            ? Math.min(max, Math.max(config.earliest_history_draw, candidate))
            : max;
        });
        setTone((current) => (
          config.tones.some((option) => option.id === current.toLowerCase())
            ? current.toLowerCase()
            : 'standard'
        ));
        setActiveAssets((current) => filterAvailableAdvisorLayers(
          current,
          config.signal_layers,
          availability?.layers,
        ));
        setQaAudit((current) => (
          config.quality_controls.find((item) => item.id === 'QA_AUDIT')?.available
            ? current
            : false
        ));
        setToxicPairs((current) => (
          config.quality_controls.find(
            (item) => item.id === 'TOXIC_PAIR_EXCLUSION',
          )?.available
            ? current
            : false
        ));
        setRecentShadow((current) => (
          config.quality_controls.find(
            (item) => item.id === 'RECENT_SHADOW_SYNC',
          )?.available && availability?.recent_shadow_available
            ? current
            : false
        ));
      } catch (loadError) {
        if (controller.signal.aborted) return;
        setAdvisorConfig(null);
        setAdvisorAvailability(null);
        setCapabilityError(advisorErrorMessage(
          loadError,
          'Advisor capabilities are currently unavailable.',
        ));
      }
    };
    void loadCapabilities();
    return () => controller.abort();
  }, [analysisScope, capabilityRefreshRevision, horizonEnd]);

  useEffect(() => {
    if (advisorConfig?.lifecycle_status !== 'WAITING_FOR_NEXT_RELEASE') {
      return undefined;
    }

    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible') {
        setCapabilityRefreshRevision((current) => current + 1);
      }
    };
    const timer = window.setInterval(refreshIfVisible, 60_000);
    document.addEventListener('visibilitychange', refreshIfVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshIfVisible);
    };
  }, [advisorConfig?.lifecycle_status]);

  useEffect(() => {
    if (!effectiveProAvailable && isProModeActive) {
      setIsProModeActive?.(false);
    }
  }, [effectiveProAvailable, isProModeActive, setIsProModeActive]);

  // Toggles
  const [qaAudit, setQaAudit] = useState(() => {
    try {
      const stored = localStorage.getItem('luma_qa_audit');
      return stored ? JSON.parse(stored) === true : false;
    } catch {
      return false;
    }
  });
  const [toxicPairs, setToxicPairs] = useState(() => {
    try {
      const stored = localStorage.getItem('luma_toxic_pairs');
      return stored ? JSON.parse(stored) === true : false;
    } catch {
      return false;
    }
  });
  const [recentShadow, setRecentShadow] = useState(() => {
    try {
      const stored = localStorage.getItem('luma_recent_shadow');
      return stored ? JSON.parse(stored) === true : false;
    } catch {
      return false;
    }
  });
  const [deepEvidence, setDeepEvidence] = useState(() => {
    try {
      const stored = localStorage.getItem('luma_deep_evidence');
      return stored ? JSON.parse(stored) === true : false;
    } catch {
      return false;
    }
  });
  const effectiveDeepEvidence = deepEvidenceAvailable && deepEvidence;

  useEffect(() => {
    if (advisorConfig !== null && !deepEvidenceAvailable && deepEvidence) {
      setDeepEvidence(false);
    }
  }, [advisorConfig, deepEvidenceAvailable, deepEvidence]);

  useEffect(() => {
    try {
      localStorage.setItem(ADVISOR_PROMPT_STORAGE_KEY, prompt);
    } catch (e) {
      console.warn(e);
    }
  }, [prompt]);

  useEffect(() => {
    try {
      localStorage.setItem('luma_horizon_start', horizonStart.toString());
    } catch (e) {
      console.warn(e);
    }
  }, [horizonStart]);

  useEffect(() => {
    try {
      localStorage.setItem('luma_horizon_end', horizonEnd.toString());
    } catch (e) {
      console.warn(e);
    }
  }, [horizonEnd]);

  useEffect(() => {
    try {
      localStorage.setItem('luma_tone', tone);
    } catch (e) {
      console.warn(e);
    }
  }, [tone]);

  useEffect(() => {
    try {
      localStorage.setItem('luma_active_assets', JSON.stringify(activeAssets));
    } catch (e) {
      console.warn(e);
    }
  }, [activeAssets]);

  useEffect(() => {
    try {
      localStorage.setItem('luma_qa_audit', JSON.stringify(qaAudit));
    } catch (e) {
      console.warn(e);
    }
  }, [qaAudit]);

  useEffect(() => {
    try {
      localStorage.setItem('luma_toxic_pairs', JSON.stringify(toxicPairs));
    } catch (e) {
      console.warn(e);
    }
  }, [toxicPairs]);

  useEffect(() => {
    try {
      localStorage.setItem('luma_recent_shadow', JSON.stringify(recentShadow));
    } catch (e) {
      console.warn(e);
    }
  }, [recentShadow]);

  useEffect(() => {
    try {
      localStorage.setItem('luma_deep_evidence', JSON.stringify(deepEvidence));
    } catch (e) {
      console.warn(e);
    }
  }, [deepEvidence]);

  const [isGenerating, setIsGenerating] = useState(false);
  const [isRestoringRun, setIsRestoringRun] = useState(true);
  const [report, setReport] = useState<string | null>(null);
  const [isReportPdfDownloading, setIsReportPdfDownloading] = useState(false);
  const [reportPdfError, setReportPdfError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorPresentation, setErrorPresentation] = useState<
    AdvisorErrorPresentation | null
  >(null);
  const [advisorQuote, setAdvisorQuote] = useState<AdvisorQuoteResponse | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [isQuoteLoading, setIsQuoteLoading] = useState(false);
  const [activeRun, setActiveRun] = useState<AdvisorRunResponse | null>(null);
  const activeRunIdRef = useRef<string | null>(null);
  activeRunIdRef.current = activeRun?.id ?? null;
  const [retrySnapshot, setRetrySnapshot] = useState<AdvisorRetrySnapshot | null>(null);
  const [failureRecoveryRunId, setFailureRecoveryRunId] = useState<string | null>(null);
  const [failureAction, setFailureAction] = useState<'refresh' | 'retry' | null>(null);
  const [issueReportUi, setIssueReportUi] = useState<
    AdvisorIssueReportUiState
  >({ runId: null, state: 'idle', error: null });
  const quoteConflictGuardRef = useRef(new AdvisorQuoteConflictGuard());
  const runActionInFlightRef = useRef(true);
  const runAbortControllerRef = useRef<AbortController | null>(null);
  const [runRetryNotBeforeMs, setRunRetryNotBeforeMs] = useState<number | null>(() => {
    try {
      return readAdvisorRunRetryNotBefore(window.localStorage);
    } catch {
      return null;
    }
  });
  const runRetryNotBeforeRef = useRef<number | null>(runRetryNotBeforeMs);
  const [runCooldownClockMs, setRunCooldownClockMs] = useState(() => Date.now());

  const registerAdvisorRunCooldown = (
    submissionError: unknown,
    updateUi = true,
  ): number | null => {
    const nowMs = Date.now();
    const retryAfterMs = advisorRunSubmissionRetryAfterMs(
      submissionError,
      nowMs,
    );
    if (retryAfterMs === null || retryAfterMs <= 0) return null;
    let retryNotBeforeMs = nowMs + retryAfterMs;
    try {
      retryNotBeforeMs = persistAdvisorRunRetryNotBefore(
        window.localStorage,
        retryAfterMs,
        () => nowMs,
      ) ?? retryNotBeforeMs;
    } catch {
      // The in-memory deadline still protects this tab when storage is blocked.
    }
    if (updateUi) {
      runRetryNotBeforeRef.current = retryNotBeforeMs;
      setRunRetryNotBeforeMs(retryNotBeforeMs);
      setRunCooldownClockMs(nowMs);
    }
    return retryNotBeforeMs;
  };

  const synchronizeAdvisorRunCooldown = (): number | null => {
    const nowMs = Date.now();
    let persistedRetryNotBefore: number | null = null;
    try {
      persistedRetryNotBefore = readAdvisorRunRetryNotBefore(
        window.localStorage,
        () => nowMs,
      );
    } catch {
      // Fall back to the current tab's in-memory deadline.
    }
    const retryNotBeforeMs = Math.max(
      runRetryNotBeforeRef.current ?? 0,
      persistedRetryNotBefore ?? 0,
    );
    if (retryNotBeforeMs <= nowMs) {
      runRetryNotBeforeRef.current = null;
      setRunRetryNotBeforeMs(null);
      try {
        clearAdvisorRunRetryNotBefore(
          window.localStorage,
          retryNotBeforeMs || undefined,
        );
      } catch {
        // Expired browser state is harmless when storage is blocked.
      }
      return null;
    }
    runRetryNotBeforeRef.current = retryNotBeforeMs;
    setRunRetryNotBeforeMs(retryNotBeforeMs);
    setRunCooldownClockMs(nowMs);
    return retryNotBeforeMs;
  };

  const guardAdvisorRunCooldown = (): boolean => {
    const retryNotBeforeMs = synchronizeAdvisorRunCooldown();
    if (retryNotBeforeMs === null) return false;
    const seconds = Math.ceil((retryNotBeforeMs - Date.now()) / 1_000);
    setError(
      `The Advisor is cooling down. Retry available in ${formatAdvisorRetryCountdown(seconds)}.`,
    );
    setErrorPresentation('cooldown');
    return true;
  };

  useEffect(() => {
    if (runRetryNotBeforeMs === null) return undefined;
    const updateCooldown = () => {
      const nowMs = Date.now();
      if (nowMs >= runRetryNotBeforeMs) {
        try {
          const latestRetryNotBeforeMs = readAdvisorRunRetryNotBefore(
            window.localStorage,
            () => nowMs,
          );
          if (latestRetryNotBeforeMs !== null) {
            runRetryNotBeforeRef.current = latestRetryNotBeforeMs;
            setRunRetryNotBeforeMs(latestRetryNotBeforeMs);
            setRunCooldownClockMs(nowMs);
            return;
          }
        } catch {
          // Fall back to the current tab's in-memory deadline.
        }
        let cleared = true;
        try {
          cleared = clearAdvisorRunRetryNotBefore(
            window.localStorage,
            runRetryNotBeforeMs,
          );
        } catch {
          // Expired browser state is harmless when storage is blocked.
        }
        if (!cleared) {
          try {
            const latestRetryNotBeforeMs = readAdvisorRunRetryNotBefore(
              window.localStorage,
              () => nowMs,
            );
            if (latestRetryNotBeforeMs !== null) {
              runRetryNotBeforeRef.current = latestRetryNotBeforeMs;
              setRunRetryNotBeforeMs(latestRetryNotBeforeMs);
              setRunCooldownClockMs(nowMs);
              return;
            }
          } catch {
            // The click-time guard will re-read storage before any mutation.
          }
        }
        runRetryNotBeforeRef.current = null;
        setRunRetryNotBeforeMs(null);
        setRunCooldownClockMs(nowMs);
        return;
      }
      setRunCooldownClockMs(nowMs);
    };
    updateCooldown();
    const timer = window.setInterval(updateCooldown, 1_000);
    return () => window.clearInterval(timer);
  }, [runRetryNotBeforeMs]);

  const runRetryAfterSeconds = runRetryNotBeforeMs === null
    ? 0
    : Math.max(
        0,
        Math.ceil((runRetryNotBeforeMs - runCooldownClockMs) / 1_000),
      );
  const runRetryBlocked = runRetryAfterSeconds > 0;
  const runRetryCountdown = runRetryBlocked
    ? formatAdvisorRetryCountdown(runRetryAfterSeconds)
    : null;
  const runRetryCooldownLabel = runRetryCountdown
    ? `Retry available in ${runRetryCountdown}`
    : null;

  useEffect(() => {
    if (!activeRun || activeRun.status !== 'FAILED') {
      setIssueReportUi({ runId: null, state: 'idle', error: null });
      return;
    }
    let state: AdvisorIssueReportState = 'idle';
    try {
      state = hasReportedAdvisorIssue(window.localStorage, activeRun.id)
        ? 'reported'
        : 'idle';
    } catch {
      state = 'idle';
    }
    setIssueReportUi({ runId: activeRun.id, state, error: null });
  }, [activeRun?.id, activeRun?.status]);

  const applyAdvisorSubmissionSnapshot = (
    request: AdvisorRunCreateRequest,
  ) => {
    setAnalysisScope(request.analysis_scope);
    setPrompt(request.custom_prompt ?? '');
    if (request.history_start_draw !== null) {
      setHorizonStart(request.history_start_draw);
    }
    setHorizonEnd(request.history_end_draw);
    setTone(request.tone);
    setActiveAssets(normalizeAdvisorLayerSelection(request.signal_layers));
    setQaAudit(request.quality_controls.qa_audit);
    setToxicPairs(request.quality_controls.toxic_pair_exclusion);
    setRecentShadow(request.quality_controls.recent_shadow_sync);
    setIsProModeActive?.(request.luma_pro);
    setDeepEvidence(request.deep_evidence === true);
  };

  const applyAdvisorRunSnapshot = (run: AdvisorRunResponse) => {
    setAnalysisScope(run.analysis_scope);
    setActiveRun(run);
    setHorizonStart(run.history_start_draw ?? run.history_end_draw);
    setHorizonEnd(run.history_end_draw);
    setTone(run.tone);
    setActiveAssets(normalizeAdvisorLayerSelection(run.signal_layers));
    setQaAudit(run.quality_controls.qa_audit);
    setToxicPairs(run.quality_controls.toxic_pair_exclusion);
    setRecentShadow(run.quality_controls.recent_shadow_sync);
    setIsProModeActive?.(run.luma_pro);
    setDeepEvidence(run.deep_evidence === true);
  };

  const presentAdvisorRun = (run: AdvisorRunResponse) => {
    applyAdvisorRunSnapshot(run);
    if (run.status === 'COMPLETED') {
      clearCurrentAdvisorRun(window.localStorage, run.id);
      clearAdvisorRetrySnapshot(window.localStorage, run.id);
      setRetrySnapshot(null);
      setFailureRecoveryRunId(null);
      // Advisor uploads are single-use. The backend keeps the consumed upload
      // bound to the immutable completed report, so a new analysis must start
      // with a fresh upload instead of silently reusing the old upload ID.
      setSelectedFile(null);
      setUploadedCsv(null);
      setCsvUploadError(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (!run.report_markdown) {
        setReport(null);
        setError('The completed Advisor run has no report content.');
        setErrorPresentation('request');
        return;
      }
      setReport(run.report_markdown);
      setError(null);
      setErrorPresentation(null);
      window.dispatchEvent(new Event('luma:credits-changed'));
      return;
    }
    if (run.status === 'FAILED') {
      const storedRetry = readAdvisorRetrySnapshot(
        window.localStorage,
        run.id,
      );
      setRetrySnapshot(storedRetry);
      setFailureRecoveryRunId(storedRetry ? run.id : null);
      if (storedRetry) {
        applyAdvisorSubmissionSnapshot(storedRetry.request);
      }
      setReport(null);
      setError(advisorErrorMessage(
        new Error(run.status_code ?? 'ANALYSIS_FAILED'),
        'The analysis could not be completed. Any reserved credits were returned.',
      ));
      setErrorPresentation('terminal');
      window.dispatchEvent(new Event('luma:credits-changed'));
      return;
    }
    setFailureRecoveryRunId(null);
    setReport(null);
    setError(null);
    setErrorPresentation(null);
    setIsGenerating(true);
  };

  useEffect(() => {
    const controller = new AbortController();
    runAbortControllerRef.current?.abort();
    runAbortControllerRef.current = controller;
    runActionInFlightRef.current = true;

    const restoreRun = async () => {
      setIsRestoringRun(true);
      try {
        let run: AdvisorRunResponse | null = null;
        const saved = readCurrentAdvisorRun(window.localStorage);
        if (saved) {
          try {
            const restored = await fetchAdvisorRun(
              saved.run_id,
              controller.signal,
            );
            run = restored;
            if (!ACTIVE_ADVISOR_RUN_STATUSES.has(restored.status)) {
              try {
                const newerActiveRun = await fetchActiveAdvisorRun(
                  controller.signal,
                );
                if (
                  newerActiveRun
                  && isStrictlyNewerAdvisorRun(newerActiveRun, restored)
                ) {
                  run = newerActiveRun;
                }
              } catch {
                if (controller.signal.aborted) return;
                // The saved terminal run remains authoritative when the
                // optional newer-run lookup is temporarily unavailable.
                console.warn('Newer Advisor run lookup failed.');
              }
            }
          } catch (restoreError) {
            if (controller.signal.aborted) return;
            if (!isDefinitivelyMissingAdvisorRun(restoreError)) {
              throw restoreError;
            }
            clearCurrentAdvisorRun(window.localStorage, saved.run_id);
          }
        }
        if (run === null) {
          try {
            run = await resumePendingAdvisorRun(
              window.localStorage,
              createAdvisorRun,
            );
          } catch (pendingError) {
            if (!isAdvisorRunAlreadyActive(pendingError)) throw pendingError;
            run = await fetchActiveAdvisorRun(controller.signal);
          }
        }
        if (run === null) {
          run = await fetchActiveAdvisorRun(controller.signal);
        }
        if (run === null || controller.signal.aborted) return;
        persistCurrentAdvisorRun(window.localStorage, run.id);
        const storedRetry = readAdvisorRetrySnapshot(
          window.localStorage,
          run.id,
        );
        setRetrySnapshot(storedRetry);
        if (storedRetry) {
          applyAdvisorSubmissionSnapshot(storedRetry.request);
        }
        if (ACTIVE_ADVISOR_RUN_STATUSES.has(run.status)) {
          setIsGenerating(true);
          run = await pollAdvisorRun(
            run,
            controller.signal,
            applyAdvisorRunSnapshot,
          );
        }
        if (!controller.signal.aborted) presentAdvisorRun(run);
      } catch (restoreError) {
        const retryNotBeforeMs = registerAdvisorRunCooldown(
          restoreError,
          !controller.signal.aborted,
        );
        if (!controller.signal.aborted) {
          console.warn('Advisor run restoration failed.');
          setError(
            restoreError instanceof AdvisorRunSubmissionPendingError
              ? restoreError.message
              : advisorErrorMessage(
                  restoreError,
                  'The saved analysis could not be restored. Please try again.',
                ),
          );
          setErrorPresentation(
            retryNotBeforeMs === null ? 'request' : 'cooldown',
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsGenerating(false);
          setIsRestoringRun(false);
          runActionInFlightRef.current = false;
        }
      }
    };

    void restoreRun();
    return () => {
      runAbortControllerRef.current?.abort();
      runAbortControllerRef.current = null;
      runActionInFlightRef.current = false;
    };
  }, []);

  const effectiveActiveAssets = useMemo(
    () => filterAvailableAdvisorLayers(
      activeAssets,
      advisorConfig?.signal_layers,
      advisorAvailability?.layers,
    ),
    [activeAssets, advisorAvailability, advisorConfig],
  );
  const qaAvailable = Boolean(
    advisorConfig?.quality_controls.find(
      (item) => item.id === 'QA_AUDIT',
    )?.available,
  );
  const toxicPairsAvailable = Boolean(
    analysisScope === 'forecast'
    &&
    advisorConfig?.quality_controls.find(
      (item) => item.id === 'TOXIC_PAIR_EXCLUSION',
    )?.available,
  );
  const recentShadowAvailable = Boolean(
    analysisScope === 'forecast'
    &&
    advisorConfig?.quality_controls.find(
      (item) => item.id === 'RECENT_SHADOW_SYNC',
    )?.available && advisorAvailability?.recent_shadow_available,
  );
  const activeRulesCount = [
    qaAvailable && (qaAudit || (effectiveProAvailable && isProModeActive)),
    toxicPairsAvailable && toxicPairs,
    recentShadowAvailable && recentShadow,
  ].filter(Boolean).length;
  const advisorRequest = useMemo<AdvisorRunCreateRequest | null>(() => {
    if (!advisorConfig?.enabled || advisorScopeBlocked) {
      return null;
    }
    const requestBoundaryDraw = advisorAnalysisBoundaryDraw(
      advisorConfig,
      analysisScope,
    );
    if (requestBoundaryDraw === null) {
      return null;
    }
    return {
      upload_id: uploadedCsv?.status === 'READY' ? uploadedCsv.upload_id : null,
      analysis_scope: analysisScope,
      forecast_draw: requestBoundaryDraw,
      history_start_draw: horizonStart,
      history_end_draw: horizonEnd,
      tone: tone.toLowerCase() as AdvisorRunCreateRequest['tone'],
      luma_pro: Boolean(effectiveProAvailable && isProModeActive),
      ...(advisorConfig.deep_evidence
        ? { deep_evidence: effectiveDeepEvidence }
        : {}),
      signal_layers: effectiveActiveAssets,
      quality_controls: {
        qa_audit: Boolean(
          qaAvailable
          && (qaAudit || (effectiveProAvailable && isProModeActive)),
        ),
        toxic_pair_exclusion: Boolean(
          toxicPairsAvailable && toxicPairs,
        ),
        recent_shadow_sync: Boolean(
          recentShadowAvailable && recentShadow,
        ),
      },
      custom_prompt: prompt.trim() || null,
    };
  }, [
    analysisScope,
    advisorConfig,
    advisorScopeBlocked,
    effectiveProAvailable,
    effectiveActiveAssets,
    horizonEnd,
    horizonStart,
    isProModeActive,
    effectiveDeepEvidence,
    prompt,
    qaAvailable,
    qaAudit,
    recentShadowAvailable,
    recentShadow,
    tone,
    toxicPairsAvailable,
    toxicPairs,
    uploadedCsv,
  ]);
  const pricingRequest = useMemo<AdvisorRunCreateRequest | null>(() => (
    advisorRequest
      ? { ...advisorRequest, custom_prompt: null }
      : null
  ), [
    advisorRequest?.analysis_scope,
    advisorRequest?.forecast_draw,
    advisorRequest?.history_start_draw,
    advisorRequest?.history_end_draw,
    advisorRequest?.luma_pro,
    advisorRequest?.deep_evidence,
    advisorRequest?.quality_controls.qa_audit,
    advisorRequest?.quality_controls.recent_shadow_sync,
    advisorRequest?.quality_controls.toxic_pair_exclusion,
    advisorRequest?.signal_layers.join(','),
    advisorRequest?.tone,
    advisorRequest?.upload_id,
  ]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      if (isGenerating || isRestoringRun) return;
      setAdvisorQuote(null);
      setQuoteError(null);
      setIsQuoteLoading(false);
      if (advisorScopeBlockedMessage) {
        quoteConflictGuardRef.current.clear();
        return;
      }
      if (selectedFile && uploadedCsv?.status !== 'READY') {
        setQuoteError(
          csvUploadError
          ?? (isCsvUploading
            ? 'Uploading and validating CSV...'
            : 'The selected CSV is not ready.'),
        );
        return;
      }
      if (!pricingRequest || !advisorAvailability?.base_contract_available) {
        quoteConflictGuardRef.current.clear();
        const availabilityWarning = advisorAvailability?.warnings[0];
        setQuoteError(
          capabilityError
          ?? (isAdvisorReleaseReadinessCode(availabilityWarning)
            ? ADVISOR_RELEASE_NOT_READY_MESSAGE
            : null)
          ?? advisorCapabilityMessage(
            availabilityWarning,
            'Advisor pricing is currently unavailable.',
          )
          ?? 'Advisor pricing is currently unavailable.',
        );
        return;
      }
      const blockedMessage =
        quoteConflictGuardRef.current.prepare(pricingRequest);
      if (blockedMessage !== null) {
        setQuoteError(blockedMessage);
        return;
      }
      setIsQuoteLoading(true);
      try {
        const quote = await fetchAdvisorQuote(pricingRequest, controller.signal);
        quoteConflictGuardRef.current.clear();
        setAdvisorQuote(quote);
      } catch (requestError) {
        if (!controller.signal.aborted) {
          if (isAdvisorRunAlreadyActive(requestError)) {
            const runController = new AbortController();
            runAbortControllerRef.current?.abort();
            runAbortControllerRef.current = runController;
            runActionInFlightRef.current = true;
            setError(null);
            setErrorPresentation(null);
            setQuoteError(null);
            setIsGenerating(true);
            try {
              let activeRun = await fetchActiveAdvisorRun(runController.signal);
              if (activeRun === null) {
                throw new AdvisorUserFacingError(
                  'The active analysis could not be restored. Please retry.',
                );
              }
              persistCurrentAdvisorRun(window.localStorage, activeRun.id);
              activeRun = await pollAdvisorRun(
                activeRun,
                runController.signal,
                applyAdvisorRunSnapshot,
              );
              if (!runController.signal.aborted) presentAdvisorRun(activeRun);
            } catch (restoreError) {
              if (!runController.signal.aborted) {
                setError(advisorErrorMessage(
                  restoreError,
                  'The active analysis could not be restored. Please retry.',
                ));
                setErrorPresentation('request');
              }
            } finally {
              if (!runController.signal.aborted) setIsGenerating(false);
              if (runAbortControllerRef.current === runController) {
                runAbortControllerRef.current = null;
              }
              runActionInFlightRef.current = false;
            }
            return;
          }
          const releaseNotReady =
            isAdvisorReleaseReadinessConflict(requestError);
          const message = releaseNotReady
            ? ADVISOR_RELEASE_NOT_READY_MESSAGE
            : advisorErrorMessage(
                requestError,
                'Advisor pricing is currently unavailable.',
              );
          if (isAdvisorBusinessConflict(requestError)) {
            quoteConflictGuardRef.current.block(pricingRequest, message);
          }
          setQuoteError(message);
        }
      } finally {
        if (!controller.signal.aborted) setIsQuoteLoading(false);
      }
    }, 350);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [
    advisorAvailability,
    capabilityError,
    advisorScopeBlockedMessage,
    csvUploadError,
    isCsvUploading,
    isGenerating,
    isRestoringRun,
    pricingRequest,
    selectedFile,
    uploadedCsv,
  ]);

  const handleRetryQuote = () => {
    quoteConflictGuardRef.current.clear();
    setAdvisorQuote(null);
    setQuoteError(null);
    setIsQuoteLoading(true);
    setCapabilityRefreshRevision((current) => current + 1);
  };

  const advisorRunBusy = isGenerating || isRestoringRun;
  const lockedRun = advisorRunBusy ? activeRun : null;
  const summaryDrawCount = lockedRun?.history_draw_count
    ?? Math.max(1, horizonEnd - horizonStart + 1);
  const summaryAnalysisScope = lockedRun?.analysis_scope ?? analysisScope;
  const summaryTone = lockedRun?.tone ?? tone;
  const summaryLayerCount = lockedRun?.signal_layers.length
    ?? effectiveActiveAssets.length;
  const summaryRuleCount = lockedRun
    ? Object.values(lockedRun.quality_controls).filter(Boolean).length
    : activeRulesCount;
  const summaryProMode = lockedRun?.luma_pro
    ?? (effectiveProAvailable && isProModeActive);
  const summaryDeepEvidence = lockedRun?.deep_evidence
    ?? effectiveDeepEvidence;
  const summaryQuotedCost = lockedRun
    ? Number(lockedRun.quoted_credits)
    : (advisorQuote ? Number(advisorQuote.total_credits) : null);
  const runProgress = advisorProgressView(
    activeRun?.status,
    activeRun?.progress_percent,
  );
  const processState = advisorRunBusy ? 'run' : (report ? 'reveal' : 'configure');

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (advisorRunBusy || advisorScopeBlocked) return;
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const selectCsvFile = (file: File) => {
    setUploadedCsv(null);
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setSelectedFile(null);
      setCsvUploadError('Choose a CSV file. Other file types are not supported.');
      return;
    }
    if (file.size === 0) {
      setSelectedFile(null);
      setCsvUploadError(
        'This CSV is empty. Add a header row and at least one data row, then upload it again.',
      );
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setCsvUploadError(null);
    setSelectedFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (advisorRunBusy || advisorScopeBlocked) return;
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      selectCsvFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (advisorRunBusy || advisorScopeBlocked) return;
    if (e.target.files && e.target.files[0]) {
      selectCsvFile(e.target.files[0]);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    if (!selectedFile) {
      setIsCsvUploading(false);
      return () => controller.abort();
    }
    if (!advisorConfig) return () => controller.abort();
    if (advisorScopeBlocked) {
      setIsCsvUploading(false);
      return () => controller.abort();
    }
    if (!advisorConfig.csv_upload.available) {
      setUploadedCsv(null);
      setCsvUploadError(
        advisorCapabilityMessage(
          advisorConfig.csv_upload.unavailable_reason,
          'CSV upload is currently unavailable.',
        ),
      );
      return () => controller.abort();
    }

    const upload = async () => {
      setUploadedCsv(null);
      setCsvUploadError(null);
      setIsCsvUploading(true);
      try {
        let preview = await uploadAdvisorCsv(selectedFile, controller.signal);
        for (
          let attempt = 0;
          attempt < 30 && ['UPLOADED', 'VALIDATING'].includes(preview.status);
          attempt += 1
        ) {
          await new Promise((resolve) => window.setTimeout(resolve, 1_000));
          preview = await fetchAdvisorCsvPreview(
            preview.upload_id,
            controller.signal,
          );
        }
        if (controller.signal.aborted) return;
        setUploadedCsv(preview);
        if (preview.status !== 'READY') {
          setCsvUploadError(
            advisorCapabilityMessage(
              preview.rejection_code,
              preview.status === 'REJECTED'
                ? 'The CSV was rejected during validation.'
                : `CSV upload ended with status ${preview.status}.`,
            ),
          );
        }
      } catch (uploadError) {
        if (!controller.signal.aborted) {
      setCsvUploadError(
        advisorErrorMessage(uploadError, 'CSV upload failed.'),
      );
        }
      } finally {
        if (!controller.signal.aborted) setIsCsvUploading(false);
      }
    };
    void upload();
    return () => controller.abort();
  }, [advisorConfig, advisorScopeBlocked, selectedFile]);

  useEffect(() => {
    const activeUploadId = activeRun
      && ACTIVE_ADVISOR_RUN_STATUSES.has(activeRun.status)
      ? activeRun.upload_id
      : null;
    const restoredUploadId = activeUploadId
      ?? retrySnapshot?.request.upload_id
      ?? null;
    if (!restoredUploadId || selectedFile) return;

    const controller = new AbortController();
    const restorePreview = async () => {
      setCsvUploadError(null);
      setIsCsvUploading(true);
      try {
        let preview = await fetchAdvisorCsvPreview(
          restoredUploadId,
          controller.signal,
        );
        for (
          let attempt = 0;
          attempt < 30 && ['UPLOADED', 'VALIDATING'].includes(preview.status);
          attempt += 1
        ) {
          await new Promise((resolve) => window.setTimeout(resolve, 1_000));
          preview = await fetchAdvisorCsvPreview(
            restoredUploadId,
            controller.signal,
          );
        }
        if (controller.signal.aborted) return;
        setUploadedCsv(preview);
        if (['REJECTED', 'DELETED'].includes(preview.status)) {
          setCsvUploadError(advisorCapabilityMessage(
            preview.rejection_code,
            'The saved CSV is no longer available. Upload it again before retrying.',
          ));
        }
      } catch (previewError) {
        if (!controller.signal.aborted) {
          setUploadedCsv(null);
          setCsvUploadError(advisorErrorMessage(
            previewError,
            'The saved CSV could not be restored. Upload it again before retrying.',
          ));
        }
      } finally {
        if (!controller.signal.aborted) setIsCsvUploading(false);
      }
    };
    void restorePreview();
    return () => controller.abort();
  }, [
    activeRun?.upload_id,
    activeRun?.status,
    retrySnapshot?.request.upload_id,
    selectedFile,
  ]);

  const toggleTag = (tag: string) => {
    setActiveAssets(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  };

  const performGeneration = async (
    payloadOverride?: Partial<AdvisorRunCreateRequest>,
    exactSubmission?: AdvisorRunCreateRequest,
  ) => {
    if (runActionInFlightRef.current) return;
    if (guardAdvisorRunCooldown()) return;
    runActionInFlightRef.current = true;
    const controller = new AbortController();
    runAbortControllerRef.current?.abort();
    runAbortControllerRef.current = controller;
    setIsGenerating(true);
    setReport(null);
    setError(null);
    setErrorPresentation(null);
    setIsMobileSettingsOpen(false);

    try {
      let run: AdvisorRunResponse | null = null;
      const saved = readCurrentAdvisorRun(window.localStorage);
      if (saved) {
        try {
          const restored = await fetchAdvisorRun(
            saved.run_id,
            controller.signal,
          );
          if (ACTIVE_ADVISOR_RUN_STATUSES.has(restored.status)) {
            run = restored;
          }
        } catch (restoreError) {
          if (controller.signal.aborted) return;
          if (!isDefinitivelyMissingAdvisorRun(restoreError)) {
            throw restoreError;
          }
          clearCurrentAdvisorRun(window.localStorage, saved.run_id);
        }
      }
      if (run === null) {
        run = await resumePendingAdvisorRun(
          window.localStorage,
          createAdvisorRun,
        );
      }
      if (run === null) {
        const activeRun = await fetchActiveAdvisorRun(controller.signal);
        if (activeRun !== null) {
          persistCurrentAdvisorRun(window.localStorage, activeRun.id);
          run = activeRun;
        }
      }
      if (run === null) {
        const submissionScope = exactSubmission?.analysis_scope
          ?? advisorRequest?.analysis_scope
          ?? analysisScope;
        if (
          !advisorConfig?.enabled
          || isAdvisorAnalysisScopeBlocked(advisorConfig, submissionScope)
        ) {
          throw new AdvisorUserFacingError(
            capabilityError ?? advisorScopeBlockedMessage
            ?? 'The selected Advisor analysis mode is unavailable.',
          );
        }
        if (!advisorAvailability?.base_contract_available) {
          throw new AdvisorUserFacingError(
            advisorCapabilityMessage(
              advisorAvailability?.warnings[0],
              'The Advisor base contract is currently unavailable.',
            ),
          );
        }
        if (
          !exactSubmission
          && selectedFile
          && payloadOverride?.upload_id !== null
          && uploadedCsv?.status !== 'READY'
        ) {
          throw new AdvisorUserFacingError(
            csvUploadError
            ?? (isCsvUploading
              ? 'CSV upload is still being validated.'
              : 'CSV upload is not ready.'),
          );
        }

        if (!advisorRequest) {
          throw new AdvisorUserFacingError(
            'The Advisor request cannot be built for the selected analysis mode.',
          );
        }
        if (
          exactSubmission?.upload_id
          && (
            uploadedCsv?.upload_id !== exactSubmission.upload_id
            || uploadedCsv.status !== 'READY'
          )
        ) {
          throw new AdvisorUserFacingError(
            csvUploadError
            ?? 'The saved CSV is not ready. Upload it again before retrying.',
          );
        }
        const baseRequest: AdvisorRunCreateRequest = exactSubmission
          ? {
              ...exactSubmission,
              quote_id: null,
              signal_layers: [...exactSubmission.signal_layers],
              quality_controls: { ...exactSubmission.quality_controls },
            }
          : {
              ...advisorRequest,
              ...payloadOverride,
            };
        const unavailableSelectedLayer = baseRequest.signal_layers.find(
          (id) => !layerAvailability.get(id)?.available,
        );
        if (unavailableSelectedLayer) {
          throw new AdvisorUserFacingError(
            advisorCapabilityMessage(
              layerAvailability.get(unavailableSelectedLayer)?.reason,
              'A selected signal layer is unavailable.',
            ),
          );
        }
        const quote = await fetchAdvisorQuote(baseRequest, controller.signal);
        if (!quote.can_run) {
          throw new AdvisorUserFacingError(
            `Insufficient credits: ${quote.missing_credits} CR missing.`,
          );
        }
        const pending: PendingAdvisorRun = {
          version: 1,
          idempotency_key: crypto.randomUUID(),
          request: {
            ...baseRequest,
            quote_id: quote.quote_id,
          },
          saved_at: new Date().toISOString(),
        };
        run = await submitPendingAdvisorRun(
          window.localStorage,
          pending,
          createAdvisorRun,
        );
      }

      persistCurrentAdvisorRun(window.localStorage, run.id);
      setRetrySnapshot(readAdvisorRetrySnapshot(
        window.localStorage,
        run.id,
      ));
      run = await pollAdvisorRun(
        run,
        controller.signal,
        applyAdvisorRunSnapshot,
      );
      if (controller.signal.aborted) return;
      presentAdvisorRun(run);
    } catch (err) {
      if (isAdvisorRunAlreadyActive(err) && !controller.signal.aborted) {
        try {
          let activeRun = await fetchActiveAdvisorRun(controller.signal);
          if (activeRun === null) {
            throw new AdvisorUserFacingError(
              'The active analysis could not be restored. Please retry.',
            );
          }
          persistCurrentAdvisorRun(window.localStorage, activeRun.id);
          activeRun = await pollAdvisorRun(
            activeRun,
            controller.signal,
            applyAdvisorRunSnapshot,
          );
          if (!controller.signal.aborted) presentAdvisorRun(activeRun);
          return;
        } catch (restoreError) {
          if (!controller.signal.aborted) {
            setError(advisorErrorMessage(
              restoreError,
              'The active analysis could not be restored. Please retry.',
            ));
            setErrorPresentation('request');
          }
          return;
        }
      }
      if (controller.signal.aborted) return;
      const retryNotBeforeMs = registerAdvisorRunCooldown(
        err,
        !controller.signal.aborted,
      );
      console.warn('Advisor API request failed.');
      setError(
        err instanceof AdvisorRunSubmissionPendingError
          ? err.message
          : advisorErrorMessage(
              err,
              'The Advisor is currently unavailable.',
            ),
      );
      setErrorPresentation(
        retryNotBeforeMs === null ? 'request' : 'cooldown',
      );
    } finally {
      if (!controller.signal.aborted) setIsGenerating(false);
      if (runAbortControllerRef.current === controller) {
        runAbortControllerRef.current = null;
      }
      runActionInFlightRef.current = false;
    }
  };

  const handleGenerate = () => performGeneration();

  const handleDownloadReportPdf = async () => {
    if (
      !activeRun
      || activeRun.status !== 'COMPLETED'
      || activeRun.pdf_status !== 'ready'
      || isReportPdfDownloading
    ) {
      return;
    }
    setIsReportPdfDownloading(true);
    setReportPdfError(null);
    try {
      const pdf = await downloadAdvisorReportPdf(activeRun.id);
      const objectUrl = URL.createObjectURL(pdf);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      const reportBoundary = activeRun.analysis_scope === 'forecast'
        ? `D${activeRun.forecast_draw}`
        : `Historical_D${activeRun.history_end_draw}`;
      anchor.download = `LUMA_Advisor_${reportBoundary}_${activeRun.id}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
    } catch (downloadError) {
      setReportPdfError(advisorErrorMessage(
        downloadError,
        'PDF could not be downloaded.',
      ));
    } finally {
      setIsReportPdfDownloading(false);
    }
  };

  const canRecoverFailedSubmission = Boolean(
    error
    && activeRun?.status === 'FAILED'
    && failureRecoveryRunId === activeRun.id
    && canReconstructAdvisorSubmission(
      retrySnapshot,
      failureRecoveryRunId,
      uploadedCsv,
    ),
  );
  const isTerminalAdvisorFailure = Boolean(
    error
    && errorPresentation === 'terminal'
    && activeRun?.status === 'FAILED',
  );
  const isAdvisorCooldownNotice = Boolean(
    error && errorPresentation === 'cooldown',
  );
  const activeIssueReportUi = issueReportUi.runId === activeRun?.id
    ? issueReportUi
    : { runId: activeRun?.id ?? null, state: 'idle' as const, error: null };

  const handleReportAdvisorIssue = async () => {
    if (
      !isTerminalAdvisorFailure
      || !activeRun
      || activeIssueReportUi.state === 'submitting'
      || activeIssueReportUi.state === 'reported'
    ) {
      return;
    }
    const runId = activeRun.id;
    setIssueReportUi({ runId, state: 'submitting', error: null });
    try {
      await reportAdvisorIssue(runId);
      try {
        markAdvisorIssueReported(window.localStorage, runId);
      } catch {
        // The in-memory acknowledgement still prevents duplicate clicks in
        // this tab. The backend remains the authoritative idempotency guard.
      }
      if (!advisorIssueResultBelongsToActiveRun(
        runId,
        activeRunIdRef.current,
      )) {
        return;
      }
      setIssueReportUi({ runId, state: 'reported', error: null });
    } catch {
      if (!advisorIssueResultBelongsToActiveRun(
        runId,
        activeRunIdRef.current,
      )) {
        return;
      }
      setIssueReportUi({
        runId,
        state: 'error',
        error: 'The issue could not be reported. Please try again.',
      });
    }
  };

  const handleRefreshStatus = async () => {
    if (
      !canRecoverFailedSubmission
      || !failureRecoveryRunId
      || runActionInFlightRef.current
    ) {
      return;
    }
    runActionInFlightRef.current = true;
    const controller = new AbortController();
    runAbortControllerRef.current?.abort();
    runAbortControllerRef.current = controller;
    setFailureAction('refresh');
    try {
      const currentBeforeRefresh = readCurrentAdvisorRun(window.localStorage);
      let refreshRunId = currentBeforeRefresh?.run_id
        && currentBeforeRefresh.run_id !== failureRecoveryRunId
        ? currentBeforeRefresh.run_id
        : failureRecoveryRunId;
      let run = await fetchAdvisorRun(
        refreshRunId,
        controller.signal,
      );
      const currentAfterRefresh = readCurrentAdvisorRun(window.localStorage);
      if (
        currentAfterRefresh?.run_id
        && currentAfterRefresh.run_id !== refreshRunId
      ) {
        refreshRunId = currentAfterRefresh.run_id;
        run = await fetchAdvisorRun(refreshRunId, controller.signal);
      } else {
        persistCurrentAdvisorRun(window.localStorage, run.id);
      }
      if (ACTIVE_ADVISOR_RUN_STATUSES.has(run.status)) {
        setError(null);
        setErrorPresentation(null);
        setIsGenerating(true);
        run = await pollAdvisorRun(
          run,
          controller.signal,
          applyAdvisorRunSnapshot,
        );
      }
      if (!controller.signal.aborted) presentAdvisorRun(run);
    } catch (refreshError) {
      if (!controller.signal.aborted) {
        setError(advisorErrorMessage(
          refreshError,
          'The analysis status could not be refreshed. Please try again.',
        ));
        setErrorPresentation('request');
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsGenerating(false);
        setFailureAction(null);
      }
      if (runAbortControllerRef.current === controller) {
        runAbortControllerRef.current = null;
      }
      runActionInFlightRef.current = false;
    }
  };

  const handleReviewSettings = () => {
    if (!canRecoverFailedSubmission || !retrySnapshot) return;
    applyAdvisorSubmissionSnapshot(retrySnapshot.request);
    if (activeRun) setHorizonEnd(activeRun.history_end_draw);
    setIsMobileSettingsOpen(true);
  };

  const handleRetryAnalysis = () => {
    if (
      !canRecoverFailedSubmission
      || !retrySnapshot
      || failureAction !== null
      || runActionInFlightRef.current
      || guardAdvisorRunCooldown()
    ) {
      return;
    }
    setFailureAction('retry');
    void performGeneration(undefined, retrySnapshot.request)
      .finally(() => setFailureAction(null));
  };

  const handlePresetGenerate = () => {
    if (!standardPresetAvailable || guardAdvisorRunCooldown()) return;
    setTone('standard');
    setQaAudit(false);
    setToxicPairs(false);
    setRecentShadow(false);
    setDeepEvidence(false);
    setActiveAssets([]);
    setSelectedFile(null);
    setUploadedCsv(null);
    setIsProModeActive?.(false);
    performGeneration({
      tone: 'standard',
      luma_pro: false,
      deep_evidence: false,
      history_start_draw: null,
      upload_id: null,
      signal_layers: [],
      quality_controls: {
        qa_audit: false,
        toxic_pair_exclusion: false,
        recent_shadow_sync: false,
      },
    });
  };

  const handleDismissReport = () => {
    if (activeRun?.status === 'COMPLETED') {
      clearCurrentAdvisorRun(window.localStorage, activeRun.id);
      setActiveRun(null);
    }
    setReport(null);
    setReportPdfError(null);
  };

  const handleReset = () => {
    handleDismissReport();
    setPrompt('');
    setHorizonStart(historyMin);
    setHorizonEnd(historyMax);
    setTone('standard');
    setActiveAssets([]);
    setQaAudit(false);
    setToxicPairs(false);
    setRecentShadow(false);
    setDeepEvidence(false);
    setSelectedFile(null);
    setUploadedCsv(null);
    setCsvUploadError(null);
    setError(null);
    setErrorPresentation(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const selectAnalysisScope = (scope: AdvisorAnalysisScope) => {
    if (advisorRunBusy) return;
    const available = scope === 'forecast'
      ? forecastAnalysisAvailable
      : historicalAnalysisAvailable;
    if (!available || scope === analysisScope) return;
    quoteConflictGuardRef.current.clear();
    setAdvisorQuote(null);
    setQuoteError(null);
    setAdvisorAvailability(null);
    if (scope === 'historical') {
      setToxicPairs(false);
      setRecentShadow(false);
    } else {
      setHorizonEnd(historyMax);
      setHorizonStart((current) => Math.min(current, historyMax));
    }
    setAnalysisScope(scope);
  };

  const ConfigurationPanel = () => (
    <div className="flex flex-col gap-8">
      {(capabilityError || advisorAvailability?.warnings.length) ? (
        <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-[10px] leading-relaxed text-amber-200/80">
          {capabilityError ?? advisorAvailability?.warnings
            .map((warning) => advisorCapabilityMessage(warning))
            .join(' · ')}
        </div>
      ) : null}
      <div
        className="grid grid-cols-2 gap-1 rounded-xl border border-border-subtle bg-surface-secondary/40 p-1"
        aria-label="Analysis mode"
      >
        {([
          ['historical', 'Historical Analysis'],
          ['forecast', 'Forecast Analysis'],
        ] as const).map(([scope, label]) => {
          const available = scope === 'forecast'
            ? forecastAnalysisAvailable
            : historicalAnalysisAvailable;
          const selected = analysisScope === scope;
          return (
            <button
              key={scope}
              type="button"
              disabled={advisorRunBusy || !available}
              aria-pressed={selected}
              onClick={() => selectAnalysisScope(scope)}
              className={`rounded-lg px-2 py-2 text-[9px] font-semibold transition-colors ${
                selected
                  ? 'bg-accent-cyan/15 text-accent-cyan ring-1 ring-accent-cyan/40'
                  : available
                    ? 'text-text-secondary hover:bg-white/5 hover:text-text-primary'
                    : 'cursor-not-allowed text-text-muted/40'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-border-subtle bg-surface-secondary/30 px-3 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-medium text-text-muted">Forecast Target</span>
            <span className="text-[9px] text-text-muted/70">Server-controlled active release</span>
          </div>
          <span className="font-mono text-xs font-bold text-accent-cyan">
            {forecastPreparationMessage
              ? `D${advisorConfig?.pending_forecast_draw} PREPARING`
              : advisorConfig?.active_forecast_draw === null
                ? 'UNAVAILABLE'
                : `DRAW ${advisorConfig?.active_forecast_draw ?? '—'}`}
          </span>
        </div>
        {analysisScope === 'historical' && (
          <div className="flex items-center justify-between gap-3 border-t border-border-subtle/70 pt-2">
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-medium text-text-muted">Historical Evidence Boundary</span>
              <span className="text-[9px] text-text-muted/70">Verified closed-draw data only</span>
            </div>
            <span className="font-mono text-xs font-bold text-accent-cyan">THROUGH D{historyMax}</span>
          </div>
        )}
      </div>
      {forecastPreparationMessage && (
        <p className="-mt-6 text-[10px] leading-relaxed text-text-muted" role="status">
          {forecastPreparationMessage}. Historical analysis remains available through D{historyMax};
          forecast analysis unlocks only after its SprintState release is active.
        </p>
      )}

      {/* Sektor A: Horizon Calibration */}
      <div className="flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-1.5">
            <label className="text-[11px] font-sans text-text-muted font-medium">Historical Calibration Horizon</label>
            <Popover open={isHorizonInfoOpen} onOpenChange={setIsHorizonInfoOpen}>
              <PopoverTrigger asChild>
                <button 
                  onMouseEnter={() => setIsHorizonInfoOpen(true)}
                  onMouseLeave={() => setIsHorizonInfoOpen(false)}
                  className="text-text-muted hover:text-accent-cyan transition-colors cursor-help shrink-0 focus:outline-none flex items-center justify-center p-0.5"
                  aria-label="Horizon Calibration Info"
                >
                  <Info className="w-3.5 h-3.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                side="right"
                align="center"
                sideOffset={8}
                className="w-64 p-3 bg-canvas-elevated border border-border-subtle rounded-xl text-[11px] text-text-secondary leading-relaxed font-sans shadow-2xl normal-case pointer-events-none opacity-100 select-none z-[9999]"
              >
                <div className="flex flex-col">
                  <span className="font-semibold text-text-primary mb-1">Horizon Calibration Guide</span>
                  Sets the requested closed-draw calibration boundary. The report uses only factual and signal modules that verifiably cover that range and discloses every gap.
                </div>
              </PopoverContent>
            </Popover>
          </div>
          <div className="flex items-center justify-end text-xs font-mono text-accent-cyan font-bold">
            <EditableNumber
              min={historyMin}
              max={historyMax}
              value={horizonStart}
              disabled={advisorRunBusy || advisorScopeBlocked}
              onChange={(val: number) => {
                setHorizonStart(val);
                if (val > horizonEnd) setHorizonEnd(val);
              }}
              className="bg-transparent border-b border-transparent hover:border-accent-cyan/50 focus:border-accent-cyan outline-none text-right w-11 p-0 text-accent-cyan focus:ring-0 cursor-text transition-colors"
            />
            <span className="px-1">—</span>
            <EditableNumber
              min={historyMin}
              max={historyMax}
              value={horizonEnd}
              disabled={
                advisorRunBusy
                || advisorScopeBlocked
                || analysisScope !== 'historical'
              }
              onChange={(val: number) => {
                setHorizonEnd(val);
                if (val < horizonStart) setHorizonStart(val);
              }}
              className="bg-transparent border-b border-transparent hover:border-accent-cyan/50 focus:border-accent-cyan outline-none text-left w-11 p-0 text-accent-cyan focus:ring-0 cursor-text transition-colors"
            />
          </div>

        </div>
        <div className="mt-2 w-full pt-2 pb-2">
            <Slider 
              min={historyMin} max={historyMax} step={1}
              value={[
                horizonStart,
                analysisScope === 'historical' ? horizonEnd : historyMax,
              ]}
              disabled={advisorRunBusy || advisorScopeBlocked}
              onValueChange={([start, end]) => {
                setHorizonStart(start);
                setHorizonEnd(
                  analysisScope === 'historical' ? end : historyMax,
                );
              }}
            />
        </div>
        {signalHistoryMin > historyMin ? (
          <p className="text-[9px] leading-relaxed text-text-muted/80">
            {advisorAvailability?.historical_facts_available
              ? (
                <>Historical facts: D{historyMin}–D{historyMax}. Signal-layer
                evidence: D{signalHistoryMin}–D{historyMax}; earlier draws use
                deterministic fact aggregates without derived layer claims.</>
              )
              : (
                <>Selectable scope: D{historyMin}–D{historyMax}. Signal-layer
                evidence: D{signalHistoryMin}–D{historyMax}. Missing historical
                facts are disclosed in the report.</>
              )}
          </p>
        ) : null}
      </div>

      {/* Sektor B: Generation Tone */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-1.5">
          <label className="text-[11px] font-sans text-text-muted font-medium">Analysis Mode (Tone)</label>
          <Popover open={isInfoOpen} onOpenChange={setIsInfoOpen}>
            <PopoverTrigger asChild>
              <button 
                onMouseEnter={() => setIsInfoOpen(true)}
                onMouseLeave={() => setIsInfoOpen(false)}
                className="text-text-muted hover:text-accent-cyan transition-colors cursor-help shrink-0 focus:outline-none flex items-center justify-center p-0.5"
                aria-label="Analysis Mode Info"
              >
                <Info className="w-3.5 h-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              side="right"
              align="center"
              sideOffset={8}
              className="w-64 p-3 bg-canvas-elevated border border-border-subtle rounded-xl text-[11px] text-text-secondary leading-relaxed font-sans shadow-2xl normal-case pointer-events-none opacity-100 select-none z-[9999]"
            >
              <div className="flex flex-col">
                <span className="font-semibold text-text-primary mb-1">Analysis Tone Guide</span>
                Configures the analytical model’s tone bias: Standard, Expert (stochastic mapping), Analytical (cold mathematical rigor), or Exploratory (discovers non-linear pattern anomalies).
              </div>
            </PopoverContent>
          </Popover>
        </div>
        <div className="flex bg-surface-secondary/50 rounded-xl p-1 border border-border-subtle">
          {(advisorConfig?.tones ?? []).map((toneOption) => (
            <button 
              key={toneOption.id}
              onClick={() => setTone(toneOption.id)}
              disabled={advisorRunBusy || advisorScopeBlocked || !toneOption.available}
              title={
                toneOption.available
                  ? toneOption.description
                  : advisorCapabilityMessage(
                    toneOption.unavailable_reason,
                    'This analysis tone is temporarily unavailable.',
                  )
              }
              className={"flex-1 py-2 text-[10px] font-sans font-medium rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-accent-cyan disabled:opacity-40 disabled:cursor-not-allowed " + (tone === toneOption.id ? "bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/30 shadow-glow-sm font-bold" : "text-text-secondary hover:text-text-primary")}
            >
              {toneOption.label}
            </button>
          ))}
        </div>
      </div>

      {/* Sektor C: Stochastic Core Assets */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-1.5">
          <label className="text-[11px] font-sans text-text-muted font-medium">Signal Layers (Assets)</label>
          <Popover open={isAssetsInfoOpen} onOpenChange={setIsAssetsInfoOpen}>
            <PopoverTrigger asChild>
              <button 
                onMouseEnter={() => setIsAssetsInfoOpen(true)}
                onMouseLeave={() => setIsAssetsInfoOpen(false)}
                className="text-text-muted hover:text-accent-cyan transition-colors cursor-help shrink-0 focus:outline-none flex items-center justify-center p-0.5"
                aria-label="Signal Layers Info"
              >
                <Info className="w-3.5 h-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              side="right"
              align="center"
              sideOffset={8}
              className="w-64 p-3 bg-canvas-elevated border border-border-subtle rounded-xl text-[11px] text-text-secondary leading-relaxed font-sans shadow-2xl normal-case pointer-events-none opacity-100 select-none z-[9999]"
            >
              <div className="flex flex-col">
                <span className="font-semibold text-text-primary mb-1">Signal Layers Guide</span>
                Select which dimensional signal engines and mathematical layers are processed. Multiple assets can be layered simultaneously to construct more comprehensive correlations.
              </div>
            </PopoverContent>
          </Popover>
        </div>
        <div className="grid grid-cols-2 gap-2 w-full">
          {assetTags.map(tag => {
            const isActive = activeAssets.includes(tag.id);
            const runtimeAvailability = layerAvailability.get(tag.id);
            const isAvailable = tag.available && Boolean(runtimeAvailability?.available);
            const unavailableCode = runtimeAvailability?.reason
              ?? tag.unavailable_reason;
            const coverageStart = runtimeAvailability?.earliest_history_draw;
            const coverageEnd = runtimeAvailability?.latest_history_draw;
            const coverageDescription = (
              isAvailable
              && coverageStart !== null
              && coverageStart !== undefined
              && coverageEnd !== null
              && coverageEnd !== undefined
            )
              ? ` Historical coverage: D${coverageStart}–D${coverageEnd}.`
              : '';
            const description = isAvailable
              ? `${tag.description}${coverageDescription}`
              : advisorCapabilityMessage(
                unavailableCode,
                'This signal layer is not available for the selected analysis mode.',
              );
            let customStyle: React.CSSProperties = {};

            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => toggleTag(tag.id)}
                disabled={advisorRunBusy || advisorScopeBlocked || !isAvailable}
                title={isAvailable ? tag.description : description}
                style={customStyle}
                className={"group w-fit flex items-center px-3 py-1.5 rounded-lg text-[11px] font-sans font-medium transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-accent-cyan disabled:opacity-40 disabled:cursor-not-allowed " + (isActive ? "bg-accent-cyan/15 text-accent-cyan border border-accent-cyan/50 shadow-glow-sm" : "bg-surface-secondary text-text-secondary border border-border-subtle hover:border-border-active hover:text-text-primary")}
              >
                <span className="whitespace-nowrap">{tag.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Sektor Pro: Deep Synthesis */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-1.5">
          <label className="text-[11px] font-sans text-text-muted font-medium">Deep Synthesis (Pro)</label>
          <Popover>
            <PopoverTrigger asChild>
              <button 
                className="text-text-muted hover:text-accent-cyan transition-colors cursor-help shrink-0 focus:outline-none flex items-center justify-center p-0.5"
                aria-label="Deep Synthesis Info"
              >
                <Info className="w-3.5 h-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              side="right"
              align="center"
              sideOffset={8}
              className="w-64 p-3 bg-canvas-elevated border border-border-subtle rounded-xl text-[11px] text-text-secondary leading-relaxed font-sans shadow-2xl normal-case opacity-100 select-none z-[9999]"
            >
              <div className="flex flex-col">
                <span className="font-semibold text-text-primary mb-1">Deep Synthesis Guide</span>
                Enables the full Pro run with cross-correlation across all layers and maximum evidence-synthesis depth. (Cost: ×2)
              </div>
            </PopoverContent>
          </Popover>
        </div>
        <div className="flex items-center gap-3">
          <Switch 
            checked={isProModeActive}
            disabled={advisorRunBusy || advisorScopeBlocked || !effectiveProAvailable}
            aria-label="LUMA Pro mode"
            title={effectiveProAvailable ? 'Enable LUMA Pro' : (effectiveProUnavailableReason || 'LUMA Pro is unavailable')}
            onCheckedChange={(val) => {
              if (val && effectiveProAvailable) {
                setQaAudit(true);
              }
              setIsProModeActive?.(Boolean(val && effectiveProAvailable));
            }}
            className={isProModeActive ? "data-[state=checked]:bg-gradient-to-r data-[state=checked]:from-[#00E6FF] data-[state=checked]:to-[#FF00F3]" : ""}
          />
          <span className={`text-sm ${isProModeActive ? "text-white font-bold" : "text-text-secondary"}`}>
            Pro Mode {isProModeActive ? "Active" : (effectiveProAvailable ? "Disabled" : "Unavailable")}
          </span>
        </div>
        {!effectiveProAvailable && effectiveProUnavailableReason && (
          <p className="max-w-sm text-right text-[10px] leading-relaxed text-amber-300/80">
            {effectiveProUnavailableReason}
          </p>
        )}
      </div>

      {/* Evidence depth: compact by default, expanded only by explicit choice. */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-1.5">
          <label className="text-[11px] font-sans text-text-muted font-medium">
            Evidence Depth
          </label>
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="text-text-muted hover:text-accent-cyan transition-colors cursor-help shrink-0 focus:outline-none flex items-center justify-center p-0.5"
                aria-label="Evidence depth information"
              >
                <Info className="w-3.5 h-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              side="right"
              align="center"
              sideOffset={8}
              className="w-72 p-3 bg-canvas-elevated border border-border-subtle rounded-xl text-[11px] text-text-secondary leading-relaxed font-sans shadow-2xl normal-case opacity-100 select-none z-[9999]"
            >
              <div className="flex flex-col gap-2">
                <div>
                  <span className="block font-semibold text-text-primary">Standard Evidence (1×)</span>
                  Uses compact, precomputed metrics and exact source evidence for fast, regular strategy analysis.
                </div>
                <div>
                  <span className="block font-semibold text-text-primary">Deep Evidence (3×)</span>
                  Expands the approved historical and signal-layer evidence. The complete configured price is multiplied by three.
                </div>
                <div className="text-text-muted">
                  Raw uploaded CSV rows and private storage data are never sent to AI providers.
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
        <div className="flex items-center gap-3">
          <Switch
            checked={effectiveDeepEvidence}
            disabled={advisorRunBusy || advisorScopeBlocked || !deepEvidenceAvailable}
            aria-label="Deep Evidence mode"
            title={
              deepEvidenceAvailable
                ? 'Use expanded approved evidence at 3× the configured price'
                : (deepEvidenceUnavailableReason || 'Deep Evidence is unavailable')
            }
            onCheckedChange={(value) => setDeepEvidence(Boolean(
              value && deepEvidenceAvailable,
            ))}
            className={effectiveDeepEvidence ? 'data-[state=checked]:bg-accent-cyan' : ''}
          />
          <span className={`text-sm ${effectiveDeepEvidence ? 'text-accent-cyan font-bold' : 'text-text-secondary'}`}>
            {effectiveDeepEvidence ? 'Deep Evidence Active · 3×' : 'Standard Evidence · 1×'}
          </span>
        </div>
        {!deepEvidenceAvailable && deepEvidenceUnavailableReason && (
          <p className="max-w-sm text-right text-[10px] leading-relaxed text-amber-300/80">
            {advisorCapabilityMessage(
              deepEvidenceUnavailableReason,
              'Deep Evidence is temporarily unavailable.',
            )}
          </p>
        )}
      </div>

      {/* Sektor D: Hard Rules Enforcement */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-1.5">
          <label className="text-[11px] font-sans text-text-muted font-medium">Quality Controls (Hard Rules)</label>
          <Popover open={isRulesInfoOpen} onOpenChange={setIsRulesInfoOpen}>
            <PopoverTrigger asChild>
              <button 
                onMouseEnter={() => setIsRulesInfoOpen(true)}
                onMouseLeave={() => setIsRulesInfoOpen(false)}
                className="text-text-muted hover:text-accent-cyan transition-colors cursor-help shrink-0 focus:outline-none flex items-center justify-center p-0.5"
                aria-label="Quality Controls Info"
              >
                <Info className="w-3.5 h-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              side="right"
              align="center"
              sideOffset={8}
              className="w-64 p-3 bg-canvas-elevated border border-border-subtle rounded-xl text-[11px] text-text-secondary leading-relaxed font-sans shadow-2xl normal-case pointer-events-none opacity-100 select-none z-[9999]"
            >
              <div className="flex flex-col">
                <span className="font-semibold text-text-primary mb-1">Quality Controls Guide</span>
                Toggles hard limit safeguards and stochastic bounds checks to prune invalid configurations, enforce risk limits, and avoid toxic mathematical pairs during execution.
              </div>
            </PopoverContent>
          </Popover>
        </div>
        <div className="flex flex-col gap-4">
          {[
            {
              id: 'QA_AUDIT',
              label: 'QA Audit Engine',
              state: qaAudit,
              setter: setQaAudit,
              option: advisorConfig?.quality_controls.find((item) => item.id === 'QA_AUDIT'),
              available: advisorConfig?.quality_controls.find((item) => item.id === 'QA_AUDIT')?.available,
            },
            {
              id: 'TOXIC_PAIR_EXCLUSION',
              label: 'Toxic Pair Exclusion',
              state: toxicPairs,
              setter: setToxicPairs,
              option: advisorConfig?.quality_controls.find((item) => item.id === 'TOXIC_PAIR_EXCLUSION'),
              available: advisorConfig?.quality_controls.find((item) => item.id === 'TOXIC_PAIR_EXCLUSION')?.available,
            },
            {
              id: 'RECENT_SHADOW_SYNC',
              label: 'Recent Shadow Sync',
              state: recentShadow,
              setter: setRecentShadow,
              option: advisorConfig?.quality_controls.find((item) => item.id === 'RECENT_SHADOW_SYNC'),
              available: Boolean(
                advisorConfig?.quality_controls.find(
                  (item) => item.id === 'RECENT_SHADOW_SYNC',
                )?.available && advisorAvailability?.recent_shadow_available,
              ),
            }
          ].map(rule => (
            <div key={rule.id} className="flex items-center justify-between">
              <span className={"text-[13px] font-sans font-medium transition-colors " + (rule.state ? "text-text-primary" : "text-text-muted")}>
                {rule.label}
              </span>
              <Switch
                checked={rule.state}
                onCheckedChange={rule.setter}
                disabled={advisorRunBusy || advisorScopeBlocked || !rule.available}
                title={
                  rule.available
                    ? rule.option?.description
                    : advisorCapabilityMessage(
                      rule.option?.unavailable_reason,
                      rule.id === 'RECENT_SHADOW_SYNC'
                        ? 'Recent shadow data are unavailable for this analysis mode.'
                        : 'This quality control is temporarily unavailable.',
                    )
                }
                aria-label={rule.label}
              />
            </div>
          ))}
        </div>
      </div>
      
      {/* Sektor E: Reset */}
      <div className="flex flex-col gap-4 pt-4 border-t border-border-subtle">
         <button 
            onClick={handleReset}
             disabled={advisorRunBusy || advisorScopeBlocked}
            className="w-full relative rounded-xl border border-dashed border-border-subtle hover:border-accent-cyan/45 hover:bg-accent-cyan/5 py-2.5 px-4 flex items-center justify-center gap-2 transition-all duration-300 text-text-secondary hover:text-accent-cyan focus:outline-none focus:ring-2 focus:ring-accent-cyan disabled:opacity-50 disabled:pointer-events-none"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="font-mono text-[10px] tracking-widest uppercase font-bold">
              Reset Parameters
            </span>
          </button>
      </div>

      {/* Sektor F: Direct actions */}
      <div className="flex flex-col gap-4 pt-4 border-t border-border-subtle">
         <div className="flex items-center gap-1.5">
           <label className="text-[11px] font-sans text-text-muted font-medium">Direct Action</label>
           <Popover open={isPresetsInfoOpen} onOpenChange={setIsPresetsInfoOpen}>
             <PopoverTrigger asChild>
               <button 
                 onMouseEnter={() => setIsPresetsInfoOpen(true)}
                 onMouseLeave={() => setIsPresetsInfoOpen(false)}
                 className="text-text-muted hover:text-accent-cyan transition-colors cursor-help shrink-0 focus:outline-none flex items-center justify-center p-0.5"
                 aria-label="Quick Presets Info"
               >
                 <Info className="w-3.5 h-3.5" />
               </button>
             </PopoverTrigger>
             <PopoverContent
               side="right"
               align="center"
               sideOffset={8}
               className="w-64 p-3 bg-canvas-elevated border border-border-subtle rounded-xl text-[11px] text-text-secondary leading-relaxed font-sans shadow-2xl normal-case pointer-events-none opacity-100 select-none z-[9999]"
             >
               <div className="flex flex-col">
                 <span className="font-semibold text-text-primary mb-1">Quick Presets Guide</span>
                 Instantly load pre-configured, optimized parameter templates aligned with standard industry validation guidelines for immediate analytical contract compilation.
               </div>
             </PopoverContent>
           </Popover>
         </div>
           <button 
             type="button"
             aria-label="Run Standard Data Contract V8.1"
             onClick={handlePresetGenerate}
             disabled={
                advisorRunBusy
                || advisorScopeBlocked
                || !standardPresetAvailable
                || runRetryBlocked
              }
              title={
                runRetryCooldownLabel
                ?? (standardPresetAvailable
                  ? 'Run the forecast-bound Standard Data Contract V8.1 preset.'
                  : standardPresetUnavailableMessage
                    ?? 'The Standard Data Contract V8.1 preset is unavailable.')
              }
            className="btn-cyber-gradient w-full relative group overflow-hidden rounded-xl border border-accent-cyan/45 py-3 px-4 flex items-center justify-center gap-2 text-text-primary shadow-[0_8px_24px_rgba(0,0,0,0.2)] transition-all duration-300 hover:border-accent-cyan/70 hover:shadow-glow-cyan focus:outline-none focus:ring-2 focus:ring-accent-cyan disabled:opacity-50 disabled:pointer-events-none"
          >
            <Zap className="w-4 h-4 text-text-primary group-hover:animate-pulse" />
            <span className="font-mono text-[10px] text-text-primary tracking-widest uppercase font-bold">
              Run Standard Data Contract V8.1
             </span>
           </button>
          {!standardPresetAvailable && standardPresetUnavailableMessage && (
            <p className="px-1 text-center text-[9px] leading-relaxed text-amber-300/70">
              {standardPresetUnavailableMessage}
            </p>
          )}
       </div>
    </div>
  );

  return (
    <div
      className="w-full h-full flex flex-col bg-canvas relative overflow-hidden"
      data-advisor-workspace
    >
      {/* Header (Mobile Only for settings trigger) */}
      <div className="lg:hidden flex items-center justify-between p-4 border-b border-border-subtle bg-surface-primary/80 backdrop-blur-md z-20">
        <h1 className="text-xl font-display font-medium text-text-primary">Analysis Studio</h1>
        <button 
          onClick={() => setIsMobileSettingsOpen(true)}
          className="p-2 rounded-lg bg-surface-secondary text-text-secondary hover:text-text-primary border border-border-subtle"
        >
          <Settings2 className="w-5 h-5" />
        </button>
      </div>

      {/* Main Layout */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* 1. LEFT CONTROL RAIL (Desktop) */}
        <div className="hidden lg:flex w-80 flex-col border-r border-border-subtle bg-surface-primary overflow-y-auto">
          <div className="p-6 pb-2 border-b border-border-subtle sticky top-0 bg-surface-primary/90 backdrop-blur-md z-10">
            <h2 className="text-lg font-display font-medium text-text-primary uppercase tracking-wide">Studio Configuration</h2>
          </div>
          <fieldset
            disabled={advisorScopeBlocked}
            aria-disabled={advisorScopeBlocked}
            className={`m-0 min-w-0 border-0 p-6 transition-opacity ${advisorScopeBlocked ? 'opacity-45' : ''}`}
          >
            {ConfigurationPanel()}
          </fieldset>
        </div>

        {/* Mobile Settings Drawer */}
        <AnimatePresence>
          {isMobileSettingsOpen && (
            <>
              <motion.div 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
                onClick={() => setIsMobileSettingsOpen(false)}
              />
              <motion.div 
                initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="fixed top-0 left-0 bottom-0 w-[85vw] max-w-sm bg-surface-primary border-r border-border-subtle z-50 overflow-y-auto lg:hidden shadow-2xl flex flex-col"
              >
                <div className="p-4 border-b border-border-subtle flex justify-between items-center sticky top-0 bg-surface-primary/90 backdrop-blur-md z-10">
                  <h2 className="text-lg font-display font-medium text-text-primary uppercase tracking-wide">Configuration</h2>
                  <button onClick={() => setIsMobileSettingsOpen(false)} className="p-2 text-text-muted hover:text-text-primary">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <fieldset
                  disabled={advisorScopeBlocked}
                  aria-disabled={advisorScopeBlocked}
                  className={`m-0 min-w-0 border-0 p-6 transition-opacity ${advisorScopeBlocked ? 'opacity-45' : ''}`}
                >
                  {ConfigurationPanel()}
                </fieldset>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* 2. CENTRAL ANALYSIS CANVAS */}
        <div className="flex-1 flex flex-col overflow-y-auto relative p-4 md:p-8 lg:p-10 pb-48 bg-content-scrim">
           <div className="max-w-4xl mx-auto w-full flex flex-col gap-8">
             
             {/* Header */}
             <div className="flex flex-col gap-2">
               <h1 className="text-3xl font-display font-medium text-text-primary tracking-tight">Analysis Canvas</h1>
               <p className="text-text-secondary text-sm">Define your query parameters and context. The stochastic engine will evaluate the prompt against the configured historical horizon.</p>
             </div>

             {advisorScopeBlockedMessage && (
               <div
                 className="rounded-xl border border-border-subtle bg-surface-secondary/70 px-5 py-4 text-sm text-text-secondary"
                 role="status"
               >
                 {advisorScopeBlockedMessage}
               </div>
             )}

             <fieldset
               disabled={advisorRunBusy || advisorScopeBlocked}
               aria-disabled={advisorScopeBlocked}
               className={`m-0 flex min-w-0 flex-col gap-8 border-0 p-0 transition-opacity ${advisorScopeBlocked ? 'opacity-45' : ''}`}
             >
             {/* Input Area */}
             <div className="relative group flex flex-col gap-2">
               <label className="text-xs font-sans text-text-muted font-medium ml-1">Analysis Prompt</label>
               <div className="relative">
                 <textarea
                   value={prompt}
                   onChange={e => setPrompt(e.target.value)}
                   disabled={advisorRunBusy || advisorScopeBlocked}
                   placeholder="Enter advanced structural prompt or query parameters here..."
                   className="w-full min-h-[200px] md:min-h-[300px] bg-surface-primary border border-border-subtle text-text-primary text-lg font-sans placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent-cyan focus:border-accent-cyan rounded-2xl resize-none z-10 relative p-6 transition-all shadow-sm disabled:opacity-50"
                 />
                 <div className="absolute inset-0 bg-gradient-to-b from-accent-cyan/5 to-transparent opacity-0 group-focus-within:opacity-100 rounded-2xl pointer-events-none transition-opacity duration-500" />
               </div>
             </div>

             {/* Dataset Upload Tile */}
             <div className="w-full -mt-4">
               <div
                 onDragEnter={handleDrag}
                 onDragOver={handleDrag}
                 onDragLeave={handleDrag}
                 onDrop={handleDrop}
                 className={`h-[68px] bg-surface-secondary border rounded-2xl px-6 flex flex-row items-center justify-between gap-4 w-full shadow-sm transition-colors ${dragActive ? 'border-accent-cyan' : 'border-border-subtle'}`}
               >
                 <div className="flex items-center gap-4">
                   <div className="w-10 h-10 rounded-xl bg-surface-primary border border-border-subtle flex items-center justify-center shrink-0">
                     {isCsvUploading
                       ? <Loader2 className="w-5 h-5 text-accent-cyan animate-spin" strokeWidth={1.5} />
                       : <UploadCloud className="w-5 h-5 text-text-secondary" strokeWidth={1.5} />}
                   </div>
                   <div className="flex flex-col text-left">
                     <h3 className="text-sm font-medium text-text-primary leading-tight">
                       {selectedFile || uploadedCsv
                         ? selectedFile?.name ?? uploadedCsv?.original_filename
                         : 'Upload Custom Dataset'}
                     </h3>
                     <p className={`text-xs mt-0.5 ${csvUploadError ? 'text-red-400' : 'text-text-muted'}`}>
                       {csvUploadError
                         ?? (uploadedCsv?.status === 'READY'
                           ? `${uploadedCsv.row_count_accepted.toLocaleString()} rows validated`
                           : `CSV | Max ${Math.round((advisorConfig?.csv_limits.max_bytes ?? 0) / 1_000_000) || '—'} MB | ${(advisorConfig?.csv_limits.max_rows ?? 0).toLocaleString() || '—'} rows`)}
                     </p>
                   </div>
                 </div>
                 <input
                   ref={fileInputRef}
                   type="file"
                   accept=".csv,text/csv"
                    className="hidden"
                    onChange={handleFileChange}
                     disabled={advisorRunBusy || advisorScopeBlocked}
                 />
                 <button
                   type="button"
                   onClick={() => fileInputRef.current?.click()}
                     disabled={advisorRunBusy || advisorScopeBlocked || !advisorConfig?.csv_upload.available || isCsvUploading}
                   title={
                     advisorConfig?.csv_upload.available
                       ? advisorConfig.csv_upload.description
                       : advisorCapabilityMessage(
                         advisorConfig?.csv_upload.unavailable_reason,
                         'CSV upload is temporarily unavailable.',
                       )
                   }
                   className="px-5 py-2.5 bg-surface-primary border border-border-subtle hover:border-accent-cyan hover:bg-surface-hover text-text-secondary hover:text-accent-cyan active:scale-95 rounded-xl text-xs font-medium transition-all cursor-pointer sm:w-auto w-full disabled:opacity-40 disabled:cursor-not-allowed"
                 >
                   {uploadedCsv?.status === 'READY' ? 'Replace File' : 'Browse Files'}
                 </button>
               </div>
              </div>
             </fieldset>

             {/* Output Area */}
             <AnimatePresence mode="wait">
               {processState === 'run' && (
                 <motion.div 
                   key="running"
                   initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                   className="w-full bg-surface-primary/90 backdrop-blur-xl border border-border-subtle rounded-2xl p-8 flex flex-col gap-6 shadow-sm"
                 >
                   <div className="flex items-center gap-4">
                     <div className="relative">
                       <div className="w-10 h-10 rounded-full border-2 border-accent-cyan/30 border-t-accent-cyan animate-spin" />
                       <Sparkles className="w-4 h-4 text-accent-cyan absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                     </div>
                     <div className="flex flex-col">
                       <h3 className="text-text-primary font-medium font-display">Processing Analysis</h3>
                       <p className="text-sm text-text-secondary">
                         {runProgress.label} · {runProgress.percent}%
                       </p>
                     </div>
                   </div>
                   <div className="space-y-3 mt-4">
                     <div
                       className="h-2 bg-surface-secondary rounded-full overflow-hidden"
                       role="progressbar"
                       aria-label="Advisor analysis progress"
                       aria-valuemin={0}
                       aria-valuemax={100}
                       aria-valuenow={runProgress.percent}
                     >
                       <motion.div 
                         className="h-full bg-gradient-to-r from-[#0A8CFF] to-[#27D8FF]"
                         initial={false}
                         animate={{ width: `${runProgress.percent}%` }}
                         transition={{ duration: 0.45, ease: "easeOut" }}
                       />
                     </div>
                     <div className="flex flex-col gap-2 font-sans text-[11px] text-text-muted font-medium">
                       <div className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-accent-teal" /> Calibrating Horizon [{horizonStart}-{horizonEnd}]</div>
                       <div className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-accent-teal" /> Applying Tone: {tone}</div>
                       <div className="flex items-center gap-2 animate-pulse"><Loader2 className="w-3 h-3 text-accent-cyan animate-spin" /> {runProgress.label}</div>
                     </div>
                   </div>
                 </motion.div>
               )}

               {processState === 'reveal' && report && (
                 <motion.div 
                   key="reveal"
                   initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                   className="w-full bg-surface-primary border border-accent-cyan/30 rounded-2xl p-6 md:p-10 shadow-glow-sm"
                 >
                    <div className="mb-6 flex items-center justify-between gap-4 border-b border-border-subtle pb-4">
                      <div className="flex items-center gap-2">
                        <FileText className="w-5 h-5 text-accent-cyan" />
                        <h3 className="text-lg font-display font-medium text-text-primary">Analysis Report</h3>
                      </div>
                      <button
                        type="button"
                        onClick={handleDismissReport}
                        className="inline-flex items-center gap-2 rounded-lg border border-border-subtle bg-surface-secondary/40 px-3 py-2 text-[10px] font-mono font-bold uppercase tracking-widest text-text-secondary transition-colors hover:border-accent-cyan/40 hover:text-accent-cyan focus:outline-none focus:ring-2 focus:ring-accent-cyan"
                      >
                        <X className="h-3.5 w-3.5" />
                        New analysis
                      </button>
                    </div>
                    {reportPdfError && (
                      <div className="mb-5 rounded-lg border border-status-error/30 bg-status-error/10 px-4 py-3 text-sm text-status-error">
                        {reportPdfError}
                      </div>
                    )}
                    <AdvisorReportView
                      markdown={report}
                      readerSummary={activeRun?.reader_summary}
                      recoveryMode={activeRun?.recovery_mode ?? null}
                      pdfAction={
                        activeRun?.status === 'COMPLETED'
                        && activeRun.pdf_status === 'ready'
                          ? {
                              status: 'ready',
                              isDownloading: isReportPdfDownloading,
                              onDownload: () => void handleDownloadReportPdf(),
                            }
                          : undefined
                      }
                    />
                 </motion.div>
               )}

               {error && (
                 <motion.div 
                   key="error"
                   initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                   className={`w-full rounded-2xl border p-6 flex items-start gap-4 ${
                     isAdvisorCooldownNotice
                       ? 'border-amber-400/30 bg-amber-400/10'
                       : 'border-status-error/30 bg-status-error/10'
                   }`}
                 >
                   {isAdvisorCooldownNotice
                     ? <Clock className="h-6 w-6 shrink-0 text-amber-300" />
                     : <AlertTriangle className="w-6 h-6 text-status-error shrink-0" />}
                   <div className="flex flex-1 flex-col gap-1">
                     <h3 className={`font-medium ${
                       isAdvisorCooldownNotice
                         ? 'text-amber-200'
                         : 'text-status-error'
                     }`}>
                       {isTerminalAdvisorFailure
                         ? 'Analysis Failed'
                         : isAdvisorCooldownNotice
                           ? 'Analysis retry paused'
                           : 'Advisor unavailable'}
                     </h3>
                     <p className={`text-sm ${
                       isAdvisorCooldownNotice
                         ? 'text-amber-200/80'
                         : 'text-status-error/80'
                     }`}>{error}</p>
                     {runRetryCooldownLabel && (
                       <p className="mt-1 text-xs font-mono text-amber-300">
                         {runRetryCooldownLabel}. No analysis will restart automatically.
                       </p>
                     )}
                     {canRecoverFailedSubmission && (
                       <div className="mt-3 flex flex-wrap gap-2">
                         <button
                           type="button"
                           onClick={() => void handleRefreshStatus()}
                           disabled={failureAction !== null}
                           className="inline-flex items-center gap-2 rounded-lg border border-status-error/25 bg-surface-primary/50 px-3 py-2 text-xs font-medium text-text-secondary transition-colors hover:border-accent-cyan/50 hover:text-accent-cyan disabled:cursor-not-allowed disabled:opacity-50"
                         >
                           <RefreshCw className={`h-3.5 w-3.5 ${failureAction === 'refresh' ? 'animate-spin' : ''}`} />
                           Refresh status
                         </button>
                         <button
                           type="button"
                           onClick={handleReviewSettings}
                           disabled={failureAction !== null}
                           className="inline-flex items-center gap-2 rounded-lg border border-status-error/25 bg-surface-primary/50 px-3 py-2 text-xs font-medium text-text-secondary transition-colors hover:border-accent-cyan/50 hover:text-accent-cyan disabled:cursor-not-allowed disabled:opacity-50"
                         >
                           <Settings2 className="h-3.5 w-3.5" />
                           Review settings
                         </button>
                         <button
                           type="button"
                           onClick={handleRetryAnalysis}
                           disabled={failureAction !== null || runRetryBlocked}
                           className="inline-flex items-center gap-2 rounded-lg border border-accent-cyan/40 bg-accent-cyan/10 px-3 py-2 text-xs font-medium text-accent-cyan transition-colors hover:bg-accent-cyan/15 disabled:cursor-not-allowed disabled:opacity-50"
                         >
                            {failureAction === 'retry'
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : runRetryBlocked
                                ? <Clock className="h-3.5 w-3.5" />
                              : <Play className="h-3.5 w-3.5" />}
                            {failureAction === 'retry'
                              ? 'Retrying...'
                              : runRetryCountdown
                                ? `Retry in ${runRetryCountdown}`
                                : 'Retry analysis'}
                         </button>
                       </div>
                     )}
                     {isAdvisorCooldownNotice && !canRecoverFailedSubmission && (
                       <div className="mt-3 flex flex-wrap gap-2">
                         <button
                           type="button"
                           onClick={() => void handleGenerate()}
                           disabled={runRetryBlocked || isGenerating}
                           className="inline-flex items-center gap-2 rounded-lg border border-amber-300/35 bg-amber-300/10 px-3 py-2 text-xs font-medium text-amber-200 transition-colors hover:bg-amber-300/15 disabled:cursor-not-allowed disabled:opacity-50"
                         >
                           {runRetryBlocked
                             ? <Clock className="h-3.5 w-3.5" />
                             : <Play className="h-3.5 w-3.5" />}
                           {runRetryCountdown
                             ? `Retry in ${runRetryCountdown}`
                             : 'Retry analysis'}
                         </button>
                       </div>
                     )}
                     {isTerminalAdvisorFailure && (
                       <div className="mt-3 border-t border-status-error/20 pt-3">
                         {activeIssueReportUi.state === 'reported' ? (
                           <p
                             role="status"
                             className="text-xs font-medium text-emerald-300"
                           >
                             Issue reported. Your reserved credits were returned.
                           </p>
                         ) : (
                           <button
                             type="button"
                             onClick={() => void handleReportAdvisorIssue()}
                             disabled={activeIssueReportUi.state === 'submitting'}
                             className="inline-flex items-center gap-2 rounded-lg border border-status-error/25 bg-surface-primary/50 px-3 py-2 text-xs font-medium text-text-secondary transition-colors hover:border-accent-cyan/50 hover:text-accent-cyan disabled:cursor-not-allowed disabled:opacity-50"
                           >
                             {activeIssueReportUi.state === 'submitting'
                               ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                               : <AlertCircle className="h-3.5 w-3.5" />}
                             {activeIssueReportUi.state === 'submitting'
                               ? 'Reporting issue...'
                               : 'Report this issue'}
                           </button>
                         )}
                         {activeIssueReportUi.error && (
                           <p className="mt-2 text-xs text-status-error">
                             {activeIssueReportUi.error}
                           </p>
                         )}
                       </div>
                     )}
                   </div>
                 </motion.div>
               )}
             </AnimatePresence>

           </div>
        </div>

         {/* 3. RIGHT RUN SUMMARY (Desktop) */}
         <div className="hidden xl:flex w-80 flex-col border-l border-border-subtle bg-surface-primary p-6 overflow-y-auto relative">
            <RunSummaryPanel 
              drawCount={summaryDrawCount}
              analysisScope={summaryAnalysisScope}
              selectedMode={summaryTone}
              activeLayerCount={summaryLayerCount}
              activeRuleCount={summaryRuleCount}
              credits={credits}
              isProModeActive={summaryProMode}
              isDeepEvidenceActive={summaryDeepEvidence}
               isGenerating={advisorRunBusy}
               runCooldownLabel={runRetryCooldownLabel}
               onGenerate={handleGenerate}
              onNavigateToStore={onNavigateToStore || (() => {})}
              quotedCost={summaryQuotedCost}
              quoteCanRun={lockedRun ? true : (advisorQuote?.can_run ?? null)}
              quoteMissingCredits={
                lockedRun ? 0 : (advisorQuote ? Number(advisorQuote.missing_credits) : null)
              }
              quoteBreakdown={lockedRun ? [] : (advisorQuote?.breakdown ?? [])}
               quoteError={advisorScopeBlockedMessage ?? quoteError}
               isQuoteLoading={advisorScopeBlocked ? false : isQuoteLoading}
               onRetryQuote={
                 !advisorScopeBlocked
                 && quoteError === ADVISOR_RELEASE_NOT_READY_MESSAGE
                   ? handleRetryQuote
                   : undefined
              }
            />
         </div>

       </div>

       <div className="xl:hidden w-full max-w-4xl mx-auto px-4 md:px-8 pb-12">
          <RunSummaryPanel 
            drawCount={summaryDrawCount}
            analysisScope={summaryAnalysisScope}
            selectedMode={summaryTone}
            activeLayerCount={summaryLayerCount}
            activeRuleCount={summaryRuleCount}
            credits={credits}
            isProModeActive={summaryProMode}
            isDeepEvidenceActive={summaryDeepEvidence}
             isGenerating={advisorRunBusy}
             runCooldownLabel={runRetryCooldownLabel}
             onGenerate={handleGenerate}
            onNavigateToStore={onNavigateToStore || (() => {})}
            quotedCost={summaryQuotedCost}
            quoteCanRun={lockedRun ? true : (advisorQuote?.can_run ?? null)}
            quoteMissingCredits={
              lockedRun ? 0 : (advisorQuote ? Number(advisorQuote.missing_credits) : null)
            }
            quoteBreakdown={lockedRun ? [] : (advisorQuote?.breakdown ?? [])}
             quoteError={advisorScopeBlockedMessage ?? quoteError}
             isQuoteLoading={advisorScopeBlocked ? false : isQuoteLoading}
             onRetryQuote={
               !advisorScopeBlocked
               && quoteError === ADVISOR_RELEASE_NOT_READY_MESSAGE
                 ? handleRetryQuote
                 : undefined
            }
          />
       </div>
    </div>
  );
};
