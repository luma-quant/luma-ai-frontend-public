import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Activity, Check, Loader2, AlertTriangle, Database, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import {
  fetchEngineStatus,
} from '../api/backendData';
import {
  normalizeStageName,
  isPendingPipelineProjection,
  readEnginePresentationDrawId,
  toPipelineStages,
  type PipelineStage as Stage,
} from '../api/enginePipeline';

const getPresentationLabel = (value: unknown): string => {
  const name = normalizeStageName(value);
  const labels: Record<string, string> = {
    INGESTION: 'Data received',
    NORMALIZATION: 'Data normalized',
    FEATURE_ENGINEERING: 'Features prepared',
    SIGNAL_ANALYSIS: 'Signals analyzed',
    VALIDATION: 'Forecast validated',
    READY_FOR_CUTOFF: 'Ready for cutoff',
    UNKNOWN_STAGE: 'Unknown stage',
  };
  return labels[name] ?? name;
};

const getProcessHierarchy = (stages: Stage[]) => {
  let done: Stage | null = null;
  let now: Stage | null = null;
  let next: Stage | null = null;

  for (let i = 0; i < stages.length; i++) {
    if (stages[i].status === 'active') {
      now = stages[i];
      if (i > 0) {
        for (let j = i - 1; j >= 0; j--) {
           if (stages[j].status === 'completed') {
              done = stages[j];
              break;
           }
        }
      }
      if (i < stages.length - 1) {
        for (let j = i + 1; j < stages.length; j++) {
           if (stages[j].status === 'pending') {
              next = stages[j];
              break;
           }
        }
      }
      break;
    }
  }

  if (!now) {
     const lastCompletedIndex = stages.slice().reverse().findIndex(s => s.status === 'completed');
     if (lastCompletedIndex !== -1) {
        done = stages[stages.length - 1 - lastCompletedIndex];
     }
  }

  return { done, now, next };
};

interface EnginePipelineProps {
  countdown?: string;
}

export const EnginePipeline = ({ countdown }: EnginePipelineProps) => {
  const [stages, setStages] = useState<Stage[]>([]);
  const [engineDrawId, setEngineDrawId] = useState<number | null>(null);
  const [isPendingProjection, setIsPendingProjection] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [apiError, setApiError] = useState(false);
  const [isPreviewData, setIsPreviewData] = useState(false);
  const [isStale, setIsStale] = useState(false);
  const [lastSuccessfulRefresh, setLastSuccessfulRefresh] = useState<Date | null>(null);
  const [hasPipelineTransitioned, setHasPipelineTransitioned] = useState(false);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);
  const stagesSnapshotRef = useRef<string | null>(null);
  
  const getStageSnapshot = (currentStages: Stage[]) => currentStages.map(s => `${s.name}|${s.status}`).join(';');

  const fetchStages = useCallback(async (abortController: AbortController, isInitial: boolean = false) => {
    try {
      if (isInitial) setIsLoading(true);
      
      const data = await fetchEngineStatus(abortController.signal);
      const normalizedStages = toPipelineStages(data);
      const newSnapshot = getStageSnapshot(normalizedStages);
      if (stagesSnapshotRef.current && stagesSnapshotRef.current !== newSnapshot) {
        setHasPipelineTransitioned(true);
      }
      stagesSnapshotRef.current = newSnapshot;

      setStages(normalizedStages);
      setEngineDrawId(readEnginePresentationDrawId(data));
      setIsPendingProjection(isPendingPipelineProjection(data));
      setApiError(false);
      setIsStale(false);
      setIsPreviewData(false);
      setLastSuccessfulRefresh(new Date());
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      console.warn('Failed to fetch pipeline stages', err);
      
      setStages(prevStages => {
        if (prevStages.length > 0) {
          setIsStale(true);
          return prevStages;
        } else {
          setApiError(true);
          setEngineDrawId(null);
          setIsPendingProjection(false);
          setIsPreviewData(false);
          return [];
        }
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleManualRetry = () => {
    const abortController = new AbortController();
    fetchStages(abortController, true);
  };

  useEffect(() => {
    let abortController = new AbortController();
    let intervalId: NodeJS.Timeout | null = null;

    const startInterval = () => {
      if (!intervalId) {
        intervalId = setInterval(() => {
          if (document.visibilityState === 'visible') {
            abortController = new AbortController();
            fetchStages(abortController, false);
          }
        }, 60000);
      }
    };

    const stopInterval = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        abortController = new AbortController();
        fetchStages(abortController, false);
        startInterval();
      } else {
        stopInterval();
      }
    };

    fetchStages(abortController, true);
    startInterval();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      abortController.abort();
      stopInterval();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchStages]);

  const hasStages = stages.length > 0;
  
  const getAggregateState = () => {
    if (isLoading && stages.length === 0) return 'loading';
    if (apiError && !isPreviewData) return 'unavailable';
    if (isStale) return 'stale';
    if (isPreviewData) return 'preview';
    if (stages.length === 0) return 'unknown';
    
    const hasActive = stages.some(s => s.status === 'active');
    const allCompleted = stages.every(s => s.status === 'completed');
    const allPending = stages.every(s => s.status === 'pending');
    
    if (hasActive) return 'active';
    if (allCompleted) return 'completed';
    if (allPending) return 'waiting';
    return 'unknown';
  };
  
  const aggregateState = getAggregateState();
  const { done, now, next } = getProcessHierarchy(stages);

  const currentDrawMetadata = engineDrawId === null
    ? ''
    : `Draw ${engineDrawId}`;

  // Derive presentation values based on aggregate state
  let presentationTitle = currentDrawMetadata ? `Preparing ${currentDrawMetadata}` : 'Preparing Analysis';
  let presentationDesc = 'LUMA is reviewing historical data and preparing the next forecast.';
  let statusText = 'Analysis running';

  if (aggregateState === 'completed') {
    presentationTitle = 'Analysis complete';
    presentationDesc = 'The pipeline has successfully processed all stages.';
    statusText = 'Completed';
  } else if (aggregateState === 'waiting') {
    presentationTitle = 'Waiting for the next analysis step';
    presentationDesc = 'LUMA is waiting to process the next available data.';
    statusText = 'Pending';
  } else if (aggregateState === 'unavailable') {
    presentationTitle = 'Pipeline status is currently unavailable.';
    presentationDesc = 'We could not reach the LUMA orchestration layer.';
    statusText = 'Offline';
  } else if (aggregateState === 'loading') {
    presentationTitle = 'Connecting to LUMA...';
    presentationDesc = 'Please wait while we check the pipeline status.';
    statusText = 'Connecting';
  }

  if (isPendingProjection) {
    presentationTitle = engineDrawId === null
      ? 'Preparing the next draw'
      : `Preparing Draw ${engineDrawId}`;
    presentationDesc = 'This is a server-time projection. The forecast remains locked until the next SprintState release is validated.';
    statusText = 'Awaiting SprintState';
  }

  return (
    <div className="w-full bg-[#0A0E17] rounded-[16px] border border-white/5 overflow-hidden flex flex-col shadow-xl">
      
      {/* Subtle top edge highlight */}
      <div className="h-[1px] w-full bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      <style>
        {`
          @media (prefers-reduced-motion: no-preference) {
            .luma-activity-rail {
              background: linear-gradient(90deg, transparent, rgba(255,21,243,0.8), rgba(0,240,255,0.8), transparent);
              background-size: 200% 100%;
              animation: lumaRailPan 8s linear infinite;
            }
          }
          @media (prefers-reduced-motion: reduce) {
            .luma-activity-rail {
              background: linear-gradient(90deg, transparent, rgba(255,21,243,0.5), rgba(0,240,255,0.5), transparent);
            }
          }
          @keyframes lumaRailPan {
            0% { background-position: 200% 0; }
            100% { background-position: -200% 0; }
          }
        `}
      </style>

      {/* Header */}
      <div className="px-6 md:px-8 py-6 flex flex-col md:flex-row md:items-start justify-between gap-6 bg-[#0B0F19]">
        <div className="flex flex-col gap-2">
          <h2 className="text-xl md:text-2xl font-medium text-text-primary">
            {presentationTitle}
          </h2>
          <p className="text-sm md:text-base text-text-secondary leading-relaxed max-w-xl">
            {presentationDesc}
          </p>
        </div>
        
        <div className="flex items-center gap-3 self-start flex-wrap pt-1">
          {isPreviewData && (
            <span className="text-xs text-accent-violet font-medium px-3 py-1 bg-accent-violet/10 rounded-full border border-accent-violet/20">
              Preview data
            </span>
          )}
          
          <div className="flex items-center gap-2">
            {aggregateState === 'loading' ? (
               <Loader2 className="w-3.5 h-3.5 text-text-muted animate-spin" />
            ) : aggregateState === 'completed' ? (
               <div className="w-2 h-2 rounded-full bg-accent-cyan" />
            ) : aggregateState === 'unavailable' ? (
               <div className="w-2 h-2 rounded-full bg-red-500" />
            ) : aggregateState === 'waiting' ? (
               <div className="w-2 h-2 rounded-full border border-text-muted" />
            ) : (
               <div className={`w-2 h-2 rounded-full ${isStale ? 'bg-text-muted' : 'bg-accent-magenta'}`} />
            )}
            <span className="text-sm text-text-primary font-medium">{statusText}</span>
          </div>
        </div>
      </div>
      
      {/* Subtle Activity Rail */}
      <div className="w-full h-[2px] bg-white/5 relative overflow-hidden">
         {aggregateState === 'active' && !isStale && (
            <div className="absolute inset-0 luma-activity-rail w-full h-full" />
         )}
      </div>

      {isStale && (
         <div className="bg-[#1A1512] border-b border-red-500/20 px-6 py-3 flex items-center gap-3">
            <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <p className="text-sm text-red-200/80 font-medium">
              Connection interrupted. Showing the last confirmed status.
            </p>
         </div>
      )}

      {aggregateState === 'unavailable' ? (
         <div className="flex flex-col items-center justify-center p-12 text-center border-b border-white/5">
            <Database className="w-10 h-10 text-text-muted mb-4 opacity-50" />
            <p className="text-sm text-text-secondary mb-6">
              Pipeline status is currently unavailable.
            </p>
            <button onClick={handleManualRetry} className="text-sm text-surface-primary bg-text-primary hover:bg-text-secondary font-medium px-6 py-2.5 rounded-full transition-colors flex items-center gap-2">
              <RefreshCw className="w-4 h-4" /> Retry Connection
            </button>
         </div>
      ) : aggregateState === 'loading' && !hasStages ? (
         <div className="flex flex-col items-center justify-center p-12 border-b border-white/5">
            <Loader2 className="w-8 h-8 text-text-muted animate-spin mb-4" />
            <p className="text-sm text-text-muted">Connecting to orchestration layer...</p>
         </div>
      ) : hasStages ? (
        <>
          {/* Current Process Summary (Three Columns) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 px-6 md:px-8 py-8 border-b border-white/5 bg-[#0C101A]">
            {/* Completed */}
            <div className="flex flex-col gap-2">
              <span className="text-xs uppercase tracking-wider font-medium text-text-muted">
                {isPendingProjection ? 'Elapsed window' : 'Completed'}
              </span>
              <div className="flex items-center gap-2.5">
                 {done ? (
                   <>
                     <Check className="w-4 h-4 text-accent-cyan flex-shrink-0" strokeWidth={3} />
                     <span className="text-[15px] text-text-primary">{getPresentationLabel(done.name)}</span>
                   </>
                 ) : (
                   <span className="text-[15px] text-text-muted">—</span>
                 )}
              </div>
            </div>

            {/* In Progress */}
            <div className="flex flex-col gap-2">
              <span className="text-xs uppercase tracking-wider font-medium text-text-muted">
                {isPendingProjection ? 'Current window' : 'In progress'}
              </span>
              <div className="flex items-center gap-2.5">
                 {now ? (
                   <>
                     <div className="w-2.5 h-2.5 rounded-full bg-accent-magenta flex-shrink-0 ml-0.5" />
                     <span className="text-[15px] text-text-primary font-medium pl-0.5">{getPresentationLabel(now.name)}</span>
                   </>
                 ) : (
                   <span className="text-[15px] text-text-muted">—</span>
                 )}
              </div>
            </div>

            {/* Up Next */}
            <div className="flex flex-col gap-2 opacity-70">
              <span className="text-xs uppercase tracking-wider font-medium text-text-muted">Up next</span>
              <div className="flex items-center gap-2.5">
                 {next ? (
                   <>
                     <div className="w-2.5 h-2.5 rounded-full border-2 border-text-muted flex-shrink-0 ml-0.5" />
                     <span className="text-[15px] text-text-secondary pl-0.5">{getPresentationLabel(next.name)}</span>
                   </>
                 ) : (
                   <span className="text-[15px] text-text-muted">—</span>
                 )}
              </div>
            </div>
          </div>

          {/* Draw Cutoff */}
          {countdown && (
            <div className="px-6 md:px-8 py-4 border-b border-white/5 flex items-center justify-between bg-[#0C101A]">
              <span className="text-sm text-text-primary">Draw cutoff</span>
              <span className="text-sm font-mono text-text-secondary">
                {countdown}
              </span>
            </div>
          )}

          {/* Full Pipeline */}
          <div className="px-6 md:px-8 py-8 flex flex-col gap-5 border-b border-white/5 bg-[#0A0E17]">
             {stages.map((stage, idx) => {
                const isCompleted = stage.status === 'completed';
                const isActive = stage.status === 'active';
                return (
                  <div key={idx} className="flex items-center justify-between gap-4">
                     <div className="flex items-center gap-4 min-w-0 flex-1">
                        <div className="flex-shrink-0 w-5 flex justify-center">
                           {isCompleted ? (
                              <Check className="w-4 h-4 text-accent-cyan" strokeWidth={3} />
                           ) : isActive ? (
                              <div className="w-2.5 h-2.5 rounded-full bg-accent-magenta" />
                           ) : (
                              <div className="w-2.5 h-2.5 rounded-full border-2 border-text-muted" />
                           )}
                        </div>
                        <div className={`flex flex-col ${isActive ? 'bg-white/[0.03] p-2 rounded-md border-l-2 border-accent-magenta flex-1' : 'flex-1'}`}>
                           <span className={`text-[15px] ${isActive ? 'text-text-primary font-medium' : isCompleted ? 'text-text-primary' : 'text-text-muted'}`}>
                              {getPresentationLabel(stage.name)}
                           </span>
                        </div>
                     </div>
                     <span className={`text-xs font-mono shrink-0 text-right ${
                        isActive ? 'text-accent-magenta font-semibold' : isCompleted ? 'text-text-secondary font-medium' : 'text-text-muted'
                     }`}>
                        {stage.detail}
                     </span>
                  </div>
                );
             })}
          </div>
        </>
      ) : null}

      <div className="mt-auto bg-[#070A10]">
         {/* Technical Details Toggle */}
         <div className="flex items-center justify-start px-6 md:px-8 py-4">
           <button 
             onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
             className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors focus:outline-none py-1"
             aria-expanded={showTechnicalDetails}
             aria-controls="technical-details-panel"
           >
             <span>Technical details</span>
             {showTechnicalDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
           </button>
         </div>

         {/* Collapsed Technical Details Panel */}
         {showTechnicalDetails && (
           <div id="technical-details-panel" className="px-6 md:px-8 pb-8 pt-4 grid grid-cols-1 md:grid-cols-2 gap-10 text-sm border-t border-white/5 bg-[#05070A]">
             
             {/* Connection & Current Process */}
             <div className="flex flex-col gap-8">
                
                <div className="flex flex-col gap-3">
                   <h4 className="text-[11px] uppercase tracking-wider font-medium text-text-muted">Connection</h4>
                   <div className="grid grid-cols-2 gap-y-3">
                     <span className="text-text-secondary">API status</span>
                     <span className={`${aggregateState === 'unavailable' ? 'text-red-500' : 'text-accent-cyan'}`}>
                       {aggregateState === 'unavailable' ? "Disconnected" : isStale ? "Stale" : "Online"}
                     </span>
                     
                     <span className="text-text-secondary">Data source</span>
                     <span className={`${aggregateState === 'unavailable' ? 'text-red-500' : isPreviewData ? 'text-accent-violet' : isStale ? 'text-text-muted' : 'text-text-primary'}`}>
                       {aggregateState === 'unavailable' ? "Not reported" : isPreviewData ? "Preview" : isStale ? "Cached" : "Live"}
                     </span>

                     <span className="text-text-secondary">Last refresh</span>
                     <span className="font-mono text-text-secondary">
                       {lastSuccessfulRefresh ? lastSuccessfulRefresh.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : "Never"}
                     </span>
                   </div>
                </div>

                <div className="flex flex-col gap-3">
                   <h4 className="text-[11px] uppercase tracking-wider font-medium text-text-muted">Current process</h4>
                   <div className="grid grid-cols-2 gap-y-3">
                     <span className="text-text-secondary">Backend stage</span>
                     <span className="font-mono text-text-secondary break-words">
                       {now ? now.name : hasStages ? "None" : "Not reported"}
                     </span>
                     
                     <span className="text-text-secondary flex items-center">Normalized status</span>
                     <div className="flex items-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                           now ? 'bg-accent-magenta/10 text-accent-magenta border border-accent-magenta/20' : 
                           hasStages ? 'bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/20' : 
                           'bg-white/5 text-text-muted'
                        }`}>
                           {isPendingProjection ? "Projected" : now ? "Active" : hasStages ? "Completed" : "Unknown"}
                        </span>
                     </div>
                   </div>
                </div>

             </div>

             {/* Complete Pipeline & Limitations */}
             <div className="flex flex-col gap-8">
                <div className="flex flex-col gap-3">
                   <h4 className="text-[11px] uppercase tracking-wider font-medium text-text-muted">Complete pipeline</h4>
                   
                   {hasStages ? (
                     <div className="flex flex-col gap-3">
                       {stages.map((stage, idx) => (
                          <div key={idx} className="flex flex-col md:flex-row md:items-start gap-2 md:gap-4 border-b border-white/5 pb-3 last:border-0 last:pb-0">
                             <div className="w-24 flex-shrink-0">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-medium ${
                                   stage.status === 'completed' ? 'bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/20' : 
                                   stage.status === 'active' ? 'bg-accent-magenta/10 text-accent-magenta border border-accent-magenta/20' : 
                                   'bg-white/5 text-text-muted border border-white/10'
                                }`}>
                                  {stage.status}
                                </span>
                             </div>
                             <span className={`font-mono text-[13px] ${stage.status === 'active' ? 'text-text-primary' : 'text-text-secondary'} break-words pt-[2px]`}>
                               {stage.name}
                             </span>
                          </div>
                       ))}
                     </div>
                   ) : (
                     <p className="text-sm text-text-muted">No stages loaded</p>
                   )}
                </div>

                <div className="flex flex-col gap-3">
                   <h4 className="text-[11px] uppercase tracking-wider font-medium text-text-muted">Limitations</h4>
                   <p className="text-sm text-text-secondary">
                     Detailed compute metrics are not provided by the current pipeline API.
                   </p>
                </div>
             </div>
           </div>
         )}
      </div>

    </div>
  );
};
