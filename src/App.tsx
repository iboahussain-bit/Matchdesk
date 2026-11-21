import React, { useState, useEffect, useRef, useMemo } from 'react';
import { User } from 'firebase/auth';
import { AlertCircle, CheckCircle2, Plus } from 'lucide-react';
import {
  ClockState,
  MatchEvent,
  MatchEventType,
  MatchInfo,
  MatchPeriod,
  MatchRecord,
  MatchState,
  Player,
  PlayerStatus,
  TeamConfig,
  TeamSide,
} from './types/match';
import {
  signInWithGoogle,
  signOutGoogle,
  subscribeToAuth,
} from './services/firebase';
import {
  addMatchEventDb,
  addPlayerDb,
  addPlayersBatchDb,
  createMatchDocument,
  deleteMatchCascadeDb,
  deleteMatchEventDb,
  removePlayerDb,
  subscribeToMatchEvents,
  subscribeToMatchPlayers,
  subscribeToUserMatches,
  updateMatchClockDb,
  updateMatchSettingsDb,
  updatePlayerStatusDb,
} from './services/matchDb';
import {
  computeScores,
  createInitialMatchState,
  createSampleSquads,
  formatClockMMSS,
  getMatchMinuteInfo,
} from './utils/matchHelpers';
import { GoogleSignInButton } from './components/GoogleSignInButton';
import { ConfirmModal } from './components/ConfirmModal';
import { ScoreboardClock } from './components/ScoreboardClock';
import { EventLogger } from './components/EventLogger';
import { LineupsManager } from './components/LineupsManager';
import { MatchesPanel } from './components/MatchesPanel';
import { MatchSettingsModal } from './components/MatchSettingsModal';
import { TitlerLivePanel } from './components/TitlerLivePanel';
import {
  loadOrCreateTitlerConfig,
  publishTitlerFeed,
  regenerateTitlerConfig,
  saveTitlerConfig,
  TitlerFeedConfig,
} from './services/titlerBridge';

type AppTab = 'console' | 'lineups' | 'events' | 'matches' | 'titler';

const LOCAL_MATCH_STORAGE_KEY = 'matchdesk_local_match_v2';
const ACTIVE_MATCH_ID_KEY = 'matchdesk_active_match_id_v2';

interface PendingConfirmAction {
  title: string;
  description: string;
  details?: string[];
  confirmLabel: string;
  variant?: 'primary' | 'danger';
  execute: () => Promise<void> | void;
}

function loadLocalMatchState(): MatchState {
  try {
    const raw = localStorage.getItem(LOCAL_MATCH_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as MatchState;
      if (parsed && parsed.info && parsed.clock && Array.isArray(parsed.events)) {
        return parsed;
      }
    }
  } catch {
    // ignore storage parse failure
  }
  return createInitialMatchState();
}

function getEffectiveElapsedSeconds(clock: ClockState, nowMs: number): number {
  if (!clock.isRunning || !clock.lastTickAt) {
    return clock.elapsedSeconds;
  }
  const delta = Math.max(0, Math.floor((nowMs - clock.lastTickAt) / 1000));
  return clock.elapsedSeconds + delta;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('console');

  // Firebase Auth state
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [user, setUser] = useState<User | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);

  // Cloud Firestore matches & active match state
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [matchesLoaded, setMatchesLoaded] = useState<boolean>(false);
  const [activeMatchId, setActiveMatchId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(ACTIVE_MATCH_ID_KEY);
    } catch {
      return null;
    }
  });
  const [cloudPlayers, setCloudPlayers] = useState<Player[]>([]);
  const [cloudEvents, setCloudEvents] = useState<MatchEvent[]>([]);

  // Local fallback state when not signed in
  const [localState, setLocalState] = useState<MatchState>(loadLocalMatchState);

  // Live clock display heartbeat (no Firestore writes per tick)
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  // UI feedback & modals
  const [banner, setBanner] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [titlerConfig, setTitlerConfig] = useState<TitlerFeedConfig>(
    loadOrCreateTitlerConfig
  );
  const [titlerLastPublishedAt, setTitlerLastPublishedAt] = useState<
    string | null
  >(null);
  const [titlerVersion, setTitlerVersion] = useState<number | null>(null);
  const [titlerLatencyMs, setTitlerLatencyMs] = useState<number | null>(null);
  const [titlerPublishError, setTitlerPublishError] = useState<string | null>(
    null
  );
  const [isPublishingTitler, setIsPublishingTitler] = useState<boolean>(false);
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [quickGoalTeam, setQuickGoalTeam] = useState<TeamSide | null>(null);
  const [quickEventType, setQuickEventType] = useState<MatchEventType | null>(
    null
  );
  const [confirmAction, setConfirmAction] =
    useState<PendingConfirmAction | null>(null);
  const [isConfirmBusy, setIsConfirmBusy] = useState<boolean>(false);

  const eventFormSectionRef = useRef<HTMLDivElement | null>(null);
  const autoCreatingInitialRef = useRef<boolean>(false);

  // Subscribe to Firebase Auth
  useEffect(() => {
    const unsub = subscribeToAuth((authedUser) => {
      setUser(authedUser);
      setAuthReady(true);
      if (!authedUser) {
        setMatches([]);
        setMatchesLoaded(false);
        setCloudPlayers([]);
        setCloudEvents([]);
      }
    });
    return unsub;
  }, []);

  // Persist local state when signed out
  useEffect(() => {
    if (!user) {
      try {
        localStorage.setItem(
          LOCAL_MATCH_STORAGE_KEY,
          JSON.stringify(localState)
        );
      } catch {
        // ignore
      }
    }
  }, [localState, user]);

  // Persist selected active match ID
  useEffect(() => {
    try {
      if (activeMatchId) {
        localStorage.setItem(ACTIVE_MATCH_ID_KEY, activeMatchId);
      } else {
        localStorage.removeItem(ACTIVE_MATCH_ID_KEY);
      }
    } catch {
      // ignore
    }
  }, [activeMatchId]);

  // Subscribe to user's Firestore matches only when auth is ready & authenticated
  useEffect(() => {
    if (!authReady || !user) return;

    const unsub = subscribeToUserMatches(
      user.uid,
      (records) => {
        setMatches(records);
        setMatchesLoaded(true);
      },
      (err) => {
        setBanner({ type: 'error', message: err.message });
      }
    );

    return unsub;
  }, [authReady, user]);

  // Ensure an active match exists once matches load for authenticated user
  useEffect(() => {
    if (!authReady || !user || !matchesLoaded) return;

    if (matches.length === 0) {
      if (!autoCreatingInitialRef.current) {
        autoCreatingInitialRef.current = true;
        createMatchDocument(user.uid, {
          info: localState.info,
          homeTeam: localState.homeTeam,
          awayTeam: localState.awayTeam,
        })
          .then((newId) => {
            setActiveMatchId(newId);
          })
          .catch((err) => {
            setBanner({
              type: 'error',
              message:
                err instanceof Error
                  ? err.message
                  : 'Failed to initialize match record.',
            });
          })
          .finally(() => {
            autoCreatingInitialRef.current = false;
          });
      }
      return;
    }

    const exists = activeMatchId && matches.some((m) => m.id === activeMatchId);
    if (!exists) {
      setActiveMatchId(matches[0].id);
    }
  }, [
    authReady,
    user,
    matchesLoaded,
    matches,
    activeMatchId,
    localState.info,
    localState.homeTeam,
    localState.awayTeam,
  ]);

  // Subscribe to active match players and events
  useEffect(() => {
    if (!authReady || !user || !activeMatchId) return;

    const unsubPlayers = subscribeToMatchPlayers(
      user.uid,
      activeMatchId,
      setCloudPlayers,
      (err) => setBanner({ type: 'error', message: err.message })
    );
    const unsubEvents = subscribeToMatchEvents(
      user.uid,
      activeMatchId,
      setCloudEvents,
      (err) => setBanner({ type: 'error', message: err.message })
    );

    return () => {
      unsubPlayers();
      unsubEvents();
    };
  }, [authReady, user, activeMatchId]);

  const activeCloudMatch = useMemo(() => {
    if (!user || !activeMatchId) return null;
    return matches.find((m) => m.id === activeMatchId) ?? null;
  }, [user, activeMatchId, matches]);

  const isCloudMode = Boolean(user && activeCloudMatch);

  const baseClock: ClockState = isCloudMode
    ? activeCloudMatch!.clock
    : localState.clock;

  // Drift-free 250ms display clock refresh while running
  useEffect(() => {
    if (!baseClock.isRunning) return;
    setNowMs(Date.now());
    const id = window.setInterval(() => {
      setNowMs(Date.now());
    }, 250);
    return () => window.clearInterval(id);
  }, [baseClock.isRunning, baseClock.lastTickAt]);

  const effectiveElapsed = getEffectiveElapsedSeconds(baseClock, nowMs);
  const displayClock: ClockState = {
    ...baseClock,
    elapsedSeconds: effectiveElapsed,
  };

  const activeInfo = isCloudMode ? activeCloudMatch!.info : localState.info;
  const activeHomeTeam = isCloudMode
    ? activeCloudMatch!.homeTeam
    : localState.homeTeam;
  const activeAwayTeam = isCloudMode
    ? activeCloudMatch!.awayTeam
    : localState.awayTeam;
  const activePlayers = isCloudMode ? cloudPlayers : localState.players;
  const activeEvents = isCloudMode ? cloudEvents : localState.events;

  const titlerSignature = JSON.stringify({
    feedId: titlerConfig.feedId,
    enabled: titlerConfig.enabled,
    info: activeInfo,
    homeTeam: activeHomeTeam,
    awayTeam: activeAwayTeam,
    clock: baseClock,
    players: activePlayers,
    events: activeEvents,
  });

  const pushTitlerSnapshot = (
    override?: Partial<{
      info: MatchInfo;
      homeTeam: TeamConfig;
      awayTeam: TeamConfig;
      clock: ClockState;
      players: Player[];
      events: MatchEvent[];
    }>,
    force = false
  ) => {
    if (!force && !titlerConfig.enabled) return;
    setIsPublishingTitler(true);
    publishTitlerFeed(titlerConfig, {
      info: override?.info ?? activeInfo,
      homeTeam: override?.homeTeam ?? activeHomeTeam,
      awayTeam: override?.awayTeam ?? activeAwayTeam,
      clock: override?.clock ?? baseClock,
      players: override?.players ?? activePlayers,
      events: override?.events ?? activeEvents,
    })
      .then((res) => {
        setTitlerLastPublishedAt(res.updatedAt);
        setTitlerVersion(res.version);
        setTitlerLatencyMs(res.latencyMs);
        setTitlerPublishError(null);
      })
      .catch((err) => {
        setTitlerPublishError(
          err instanceof Error ? err.message : 'Failed to push Titler feed.'
        );
      })
      .finally(() => {
        setIsPublishingTitler(false);
      });
  };

  // Push immediately (0ms debounce) whenever match state changes
  useEffect(() => {
    if (!titlerConfig.enabled) return;
    pushTitlerSnapshot();
  }, [titlerSignature]);

  const handlePushTitlerNow = async () => {
    pushTitlerSnapshot(undefined, true);
  };

  // Auth handlers
  const handleLogin = async () => {
    setIsLoggingIn(true);
    setBanner(null);
    try {
      const authed = await signInWithGoogle();
      setBanner({
        type: 'success',
        message: `Signed in as ${authed.email || 'Google User'}. Real-time cloud sync enabled.`,
      });
    } catch (err) {
      setBanner({
        type: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'Sign in was cancelled or failed.',
      });
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await signOutGoogle();
    setBanner({
      type: 'success',
      message: 'Signed out. MatchDesk is running in local session mode.',
    });
  };

  // Helper to persist clock updates
  const commitClockUpdate = async (nextClock: ClockState) => {
    pushTitlerSnapshot({ clock: nextClock });
    if (isCloudMode && activeCloudMatch) {
      try {
        await updateMatchClockDb(activeCloudMatch.id, nextClock);
      } catch (err) {
        setBanner({
          type: 'error',
          message:
            err instanceof Error ? err.message : 'Failed to update clock.',
        });
      }
    } else {
      setLocalState((prev) => ({ ...prev, clock: nextClock }));
    }
  };

  // Clock handlers
  const handleToggleClock = async () => {
    const now = Date.now();
    const currentElapsed = getEffectiveElapsedSeconds(baseClock, now);
    const nextRunning = !baseClock.isRunning;
    const nextPeriod =
      nextRunning && baseClock.period === MatchPeriod.PRE_MATCH
        ? MatchPeriod.FIRST_HALF
        : baseClock.period;

    const nextClock: ClockState = {
      ...baseClock,
      elapsedSeconds: currentElapsed,
      isRunning: nextRunning,
      period: nextPeriod,
      lastTickAt: nextRunning ? now : null,
    };

    const shouldAddKickoff =
      nextRunning &&
      baseClock.period === MatchPeriod.PRE_MATCH &&
      !activeEvents.some((e) => e.type === MatchEventType.KICKOFF);

    if (shouldAddKickoff) {
      const scores = computeScores(activeEvents);
      const kickoffDraft: Omit<MatchEvent, 'id' | 'createdAt'> = {
        type: MatchEventType.KICKOFF,
        minute: 1,
        clockDisplay: formatClockMMSS(currentElapsed),
        period: MatchPeriod.FIRST_HALF,
        note: '1st Half Kickoff',
      };
      const optimisticKickoff: MatchEvent = {
        ...kickoffDraft,
        id: `ev-${Date.now()}`,
        createdAt: new Date().toISOString(),
      };
      pushTitlerSnapshot({
        clock: nextClock,
        events: [...activeEvents, optimisticKickoff],
      });
      if (isCloudMode && user && activeCloudMatch) {
        await addMatchEventDb(
          user.uid,
          activeCloudMatch.id,
          kickoffDraft,
          scores,
          nextClock
        );
      } else {
        setLocalState((prev) => ({
          ...prev,
          clock: nextClock,
          events: [...prev.events, optimisticKickoff],
        }));
      }
      return;
    }

    await commitClockUpdate(nextClock);
  };

  const handleChangePeriod = async (period: MatchPeriod) => {
    const now = Date.now();
    const halfSecs = activeInfo.halfDurationMinutes * 60;
    let nextSeconds = getEffectiveElapsedSeconds(baseClock, now);
    let nextRunning = baseClock.isRunning;
    let nextAdded = baseClock.addedMinutes;
    let autoEvent: Omit<MatchEvent, 'id' | 'createdAt'> | null = null;

    if (period === MatchPeriod.HALF_TIME) {
      nextRunning = false;
      const mInfo = getMatchMinuteInfo(
        nextSeconds,
        baseClock.period,
        activeInfo.halfDurationMinutes
      );
      autoEvent = {
        type: MatchEventType.HALF_TIME,
        minute: mInfo.minute,
        addedMinute: mInfo.addedMinute,
        clockDisplay: formatClockMMSS(nextSeconds),
        period,
        note: 'Half-Time Whistle',
      };
    } else if (period === MatchPeriod.SECOND_HALF) {
      if (nextSeconds < halfSecs) {
        nextSeconds = halfSecs;
      }
      nextAdded = 0;
    } else if (period === MatchPeriod.FULL_TIME) {
      nextRunning = false;
      const mInfo = getMatchMinuteInfo(
        nextSeconds,
        baseClock.period,
        activeInfo.halfDurationMinutes
      );
      autoEvent = {
        type: MatchEventType.FULL_TIME,
        minute: mInfo.minute,
        addedMinute: mInfo.addedMinute,
        clockDisplay: formatClockMMSS(nextSeconds),
        period,
        note: 'Full-Time Whistle',
      };
    } else if (period === MatchPeriod.PRE_MATCH) {
      nextRunning = false;
      nextSeconds = 0;
      nextAdded = 0;
    }

    const nextClock: ClockState = {
      elapsedSeconds: nextSeconds,
      isRunning: nextRunning,
      period,
      addedMinutes: nextAdded,
      lastTickAt: nextRunning ? now : null,
    };

    if (autoEvent) {
      const scores = computeScores(activeEvents);
      const optimisticAutoEvent: MatchEvent = {
        ...autoEvent,
        id: `ev-${Date.now()}`,
        createdAt: new Date().toISOString(),
      };
      pushTitlerSnapshot({
        clock: nextClock,
        events: [...activeEvents, optimisticAutoEvent],
      });
      if (isCloudMode && user && activeCloudMatch) {
        await addMatchEventDb(
          user.uid,
          activeCloudMatch.id,
          autoEvent,
          scores,
          nextClock
        );
      } else {
        setLocalState((prev) => ({
          ...prev,
          clock: nextClock,
          events: [...prev.events, optimisticAutoEvent],
        }));
      }
      return;
    }

    await commitClockUpdate(nextClock);
  };

  const handleAdjustSeconds = async (delta: number) => {
    const now = Date.now();
    const current = getEffectiveElapsedSeconds(baseClock, now);
    const nextClock: ClockState = {
      ...baseClock,
      elapsedSeconds: Math.max(0, current + delta),
      lastTickAt: baseClock.isRunning ? now : null,
    };
    await commitClockUpdate(nextClock);
  };

  const handleSetExactSeconds = async (seconds: number) => {
    const now = Date.now();
    const nextClock: ClockState = {
      ...baseClock,
      elapsedSeconds: Math.max(0, seconds),
      lastTickAt: baseClock.isRunning ? now : null,
    };
    await commitClockUpdate(nextClock);
  };

  const handleSetAddedMinutes = async (minutes: number) => {
    const now = Date.now();
    const current = getEffectiveElapsedSeconds(baseClock, now);
    const nextClock: ClockState = {
      ...baseClock,
      elapsedSeconds: current,
      addedMinutes: Math.max(0, minutes),
      lastTickAt: baseClock.isRunning ? now : null,
    };
    await commitClockUpdate(nextClock);
  };

  const handleRequestResetClock = () => {
    setConfirmAction({
      title: 'Reset Match Clock?',
      description:
        'This resets the game clock to 00:00, clears added time, pauses the timer, and returns the period to Pre-Match. Logged goals and events will remain intact.',
      confirmLabel: 'Reset Clock',
      variant: 'danger',
      execute: async () => {
        await commitClockUpdate({
          elapsedSeconds: 0,
          isRunning: false,
          period: MatchPeriod.PRE_MATCH,
          addedMinutes: 0,
          lastTickAt: null,
        });
      },
    });
  };

  // Event handlers (with immediate 0ms optimistic Titler Live output)
  const handleAddEvent = async (
    draft: Omit<MatchEvent, 'id' | 'createdAt'>
  ) => {
    const optimisticEvent: MatchEvent = {
      ...draft,
      id: `ev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: new Date().toISOString(),
    };

    let optimisticPlayers = activePlayers;
    if (optimisticEvent.type === MatchEventType.SUBSTITUTION) {
      optimisticPlayers = activePlayers.map((p) => {
        if (optimisticEvent.playerId && p.id === optimisticEvent.playerId) {
          return { ...p, status: PlayerStatus.SUBBED_OFF };
        }
        if (
          optimisticEvent.secondaryPlayerId &&
          p.id === optimisticEvent.secondaryPlayerId
        ) {
          return { ...p, status: PlayerStatus.ON_PITCH };
        }
        return p;
      });
    }

    const nextEvents = [...activeEvents, optimisticEvent];
    const nextScores = computeScores(nextEvents);

    // Output immediately to Titler Live before waiting on cloud round-trip
    pushTitlerSnapshot({
      players: optimisticPlayers,
      events: nextEvents,
    });

    if (isCloudMode && user && activeCloudMatch) {
      try {
        await addMatchEventDb(
          user.uid,
          activeCloudMatch.id,
          draft,
          nextScores
        );
      } catch (err) {
        setBanner({
          type: 'error',
          message:
            err instanceof Error ? err.message : 'Failed to save match event.',
        });
      }
    } else {
      setLocalState((prev) => ({
        ...prev,
        players: optimisticPlayers,
        events: nextEvents,
      }));
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    const remaining = activeEvents.filter((e) => e.id !== eventId);
    const nextScores = computeScores(remaining);

    pushTitlerSnapshot({ events: remaining });

    if (isCloudMode && activeCloudMatch) {
      try {
        await deleteMatchEventDb(activeCloudMatch.id, eventId, nextScores);
      } catch (err) {
        setBanner({
          type: 'error',
          message:
            err instanceof Error ? err.message : 'Failed to delete event.',
        });
      }
    } else {
      setLocalState((prev) => ({
        ...prev,
        events: remaining,
      }));
    }
  };

  const handleQuickGoal = (team: TeamSide) => {
    setQuickGoalTeam(team);
    setQuickEventType(MatchEventType.GOAL);
    setActiveTab('console');
    window.setTimeout(() => {
      eventFormSectionRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }, 60);
  };

  // Lineup handlers (with immediate 0ms optimistic Titler Live output)
  const handleAddPlayer = async (player: Omit<Player, 'id'>) => {
    const optimisticPlayer: Player = {
      ...player,
      id: `pl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    };
    pushTitlerSnapshot({ players: [...activePlayers, optimisticPlayer] });

    if (isCloudMode && user && activeCloudMatch) {
      try {
        await addPlayerDb(user.uid, activeCloudMatch.id, player);
      } catch (err) {
        setBanner({
          type: 'error',
          message:
            err instanceof Error ? err.message : 'Failed to add player.',
        });
      }
    } else {
      setLocalState((prev) => ({
        ...prev,
        players: [...prev.players, optimisticPlayer],
      }));
    }
  };

  const handleAddPlayersBulk = async (newPlayers: Player[]) => {
    pushTitlerSnapshot({ players: [...activePlayers, ...newPlayers] });

    if (isCloudMode && user && activeCloudMatch) {
      try {
        await addPlayersBatchDb(
          user.uid,
          activeCloudMatch.id,
          newPlayers.map(({ id: _omit, ...rest }) => rest)
        );
      } catch (err) {
        setBanner({
          type: 'error',
          message:
            err instanceof Error ? err.message : 'Failed to import players.',
        });
      }
    } else {
      setLocalState((prev) => ({
        ...prev,
        players: [...prev.players, ...newPlayers],
      }));
    }
  };

  const handleSetPlayerStatus = async (
    playerId: string,
    nextStatus: PlayerStatus
  ) => {
    const target = activePlayers.find((p) => p.id === playerId);
    if (!target || target.status === nextStatus) return;

    const optimisticPlayers = activePlayers.map((p) =>
      p.id === playerId ? { ...p, status: nextStatus } : p
    );
    pushTitlerSnapshot({ players: optimisticPlayers });

    if (isCloudMode && activeCloudMatch) {
      try {
        await updatePlayerStatusDb(activeCloudMatch.id, playerId, nextStatus);
      } catch (err) {
        setBanner({
          type: 'error',
          message:
            err instanceof Error ? err.message : 'Failed to update player.',
        });
      }
    } else {
      setLocalState((prev) => ({
        ...prev,
        players: optimisticPlayers,
      }));
    }
  };

  const handleRemovePlayer = async (playerId: string) => {
    const remainingPlayers = activePlayers.filter((p) => p.id !== playerId);
    pushTitlerSnapshot({ players: remainingPlayers });

    if (isCloudMode && activeCloudMatch) {
      try {
        await removePlayerDb(activeCloudMatch.id, playerId);
      } catch (err) {
        setBanner({
          type: 'error',
          message:
            err instanceof Error ? err.message : 'Failed to remove player.',
        });
      }
    } else {
      setLocalState((prev) => ({
        ...prev,
        players: remainingPlayers,
      }));
    }
  };

  const handleLoadSampleSquads = async () => {
    const sample = createSampleSquads();
    await handleAddPlayersBulk(sample);
  };

  // Match Settings & Multi-Match handlers
  const handleSaveSettings = async (
    info: MatchInfo,
    home: TeamConfig,
    away: TeamConfig
  ) => {
    pushTitlerSnapshot({ info, homeTeam: home, awayTeam: away });
    if (isCloudMode && activeCloudMatch) {
      try {
        await updateMatchSettingsDb(activeCloudMatch.id, info, home, away);
      } catch (err) {
        setBanner({
          type: 'error',
          message:
            err instanceof Error ? err.message : 'Failed to save settings.',
        });
      }
    } else {
      setLocalState((prev) => ({
        ...prev,
        info,
        homeTeam: home,
        awayTeam: away,
      }));
    }
  };

  const handleCreateMatch = async (
    info: MatchInfo,
    homeTeam: TeamConfig,
    awayTeam: TeamConfig
  ) => {
    if (!user) {
      setActiveTab('matches');
      return;
    }
    try {
      const newId = await createMatchDocument(user.uid, {
        info,
        homeTeam,
        awayTeam,
      });
      setActiveMatchId(newId);
      setActiveTab('console');
      setBanner({
        type: 'success',
        message: `Created "${homeTeam.name} vs ${awayTeam.name}".`,
      });
    } catch (err) {
      setBanner({
        type: 'error',
        message:
          err instanceof Error ? err.message : 'Failed to create match.',
      });
    }
  };

  const handleRequestDeleteMatch = (match: MatchRecord) => {
    if (!user) return;
    setConfirmAction({
      title: `Delete "${match.homeTeam.name} vs ${match.awayTeam.name}"?`,
      description:
        'This permanently removes the match record, squad lineups, and all logged events from your database.',
      confirmLabel: 'Delete Match',
      variant: 'danger',
      execute: async () => {
        await deleteMatchCascadeDb(user.uid, match.id);
        if (activeMatchId === match.id) {
          setActiveMatchId(null);
        }
        setBanner({
          type: 'success',
          message: `Deleted "${match.info.title}".`,
        });
      },
    });
  };

  const runConfirmAction = async () => {
    if (!confirmAction) return;
    setIsConfirmBusy(true);
    try {
      await confirmAction.execute();
    } catch (err) {
      setBanner({
        type: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'Operation could not be completed.',
      });
    } finally {
      setIsConfirmBusy(false);
      setConfirmAction(null);
    }
  };

  const scores = computeScores(activeEvents);
  const totalCards = activeEvents.filter(
    (e) =>
      e.type === MatchEventType.YELLOW_CARD ||
      e.type === MatchEventType.RED_CARD
  ).length;
  const totalSubs = activeEvents.filter(
    (e) => e.type === MatchEventType.SUBSTITUTION
  ).length;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Top Bar Contract: 1-row, 3-zone (Brand Wordmark — 4 Nav Links — 1 Primary Action) */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-8 px-4 py-3 sm:px-6">
          {/* Zone 1: Single-element Brand Wordmark */}
          <a
            href="#console"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('console');
            }}
            className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            MatchDesk
          </a>

          {/* Zone 2: Clean Single-Line Navigation Links */}
          <nav
            aria-label="Primary navigation"
            className="flex items-center gap-6 overflow-x-auto text-sm font-medium"
          >
            {(
              [
                ['console', 'Console'],
                ['lineups', 'Lineups'],
                ['events', 'Event Log'],
                ['matches', 'Matches'],
                ['titler', 'Titler Live'],
              ] as const
            ).map(([tabKey, label]) => (
              <button
                key={tabKey}
                type="button"
                onClick={() => setActiveTab(tabKey)}
                className={`border-b-2 py-1 transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === tabKey
                    ? 'border-blue-600 text-slate-900 font-semibold'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </nav>

          {/* Zone 3: 1 Primary Action */}
          <div className="flex items-center shrink-0">
            {!user ? (
              <GoogleSignInButton
                onClick={handleLogin}
                disabled={isLoggingIn}
                label={isLoggingIn ? 'Signing in...' : 'Sign in with Google'}
              />
            ) : (
              <button
                type="button"
                onClick={() => setActiveTab('matches')}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 whitespace-nowrap shrink-0"
              >
                <Plus className="h-3.5 w-3.5" />
                New Match
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
        {banner && (
          <div
            role="status"
            className={`flex items-center justify-between gap-4 rounded-xl border px-4 py-3 text-xs font-medium ${
              banner.type === 'error'
                ? 'border-red-200 bg-red-50 text-red-800'
                : 'border-emerald-200 bg-emerald-50 text-emerald-800'
            }`}
          >
            <div className="flex items-center gap-2">
              {banner.type === 'error' ? (
                <AlertCircle className="h-4 w-4 shrink-0" />
              ) : (
                <CheckCircle2 className="h-4 w-4 shrink-0" />
              )}
              <span>{banner.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setBanner(null)}
              className="text-xs font-semibold underline hover:no-underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {activeTab === 'console' && (
          <>
            <ScoreboardClock
              info={activeInfo}
              homeTeam={activeHomeTeam}
              awayTeam={activeAwayTeam}
              clock={displayClock}
              events={activeEvents}
              onToggleClock={() => void handleToggleClock()}
              onChangePeriod={(p) => void handleChangePeriod(p)}
              onAdjustSeconds={(d) => void handleAdjustSeconds(d)}
              onSetExactSeconds={(s) => void handleSetExactSeconds(s)}
              onSetAddedMinutes={(m) => void handleSetAddedMinutes(m)}
              onRequestResetClock={handleRequestResetClock}
              onQuickGoal={handleQuickGoal}
              onOpenSettings={() => setSettingsOpen(true)}
            />

            {/* Clean 4-column Match Operations Strip */}
            <section
              aria-label="Match Summary"
              className="grid grid-cols-2 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white sm:grid-cols-4 sm:divide-x sm:divide-y-0"
            >
              <div className="px-5 py-4">
                <p className="text-xs font-medium text-slate-500">Total Goals</p>
                <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-slate-900">
                  {scores.home + scores.away}
                </p>
              </div>
              <div className="px-5 py-4">
                <p className="text-xs font-medium text-slate-500">
                  Cards / Subs
                </p>
                <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-slate-900">
                  {totalCards}{' '}
                  <span className="text-base font-normal text-slate-400">
                    / {totalSubs}
                  </span>
                </p>
              </div>
              <div className="px-5 py-4">
                <p className="text-xs font-medium text-slate-500">
                  Squads Loaded
                </p>
                <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-slate-900">
                  {activePlayers.length}
                </p>
              </div>
              <div className="px-5 py-4">
                <p className="text-xs font-medium text-slate-500">
                  Titler Live Output
                </p>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span
                    className={`text-sm font-semibold tabular-nums ${
                      titlerConfig.enabled ? 'text-emerald-700' : 'text-slate-500'
                    }`}
                  >
                    {titlerConfig.enabled
                      ? titlerVersion !== null
                        ? `Live v${titlerVersion}`
                        : 'Instant Ready'
                      : 'Paused'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveTab('titler')}
                    className="text-xs font-semibold text-blue-600 hover:underline whitespace-nowrap"
                  >
                    Feed URLs
                  </button>
                </div>
              </div>
            </section>

            <div ref={eventFormSectionRef}>
              <EventLogger
                info={activeInfo}
                homeTeam={activeHomeTeam}
                awayTeam={activeAwayTeam}
                players={activePlayers}
                events={activeEvents}
                clock={displayClock}
                preselectedTeam={quickGoalTeam}
                preselectedType={quickEventType}
                onAddEvent={(ev) => void handleAddEvent(ev)}
                onDeleteEvent={(id) => void handleDeleteEvent(id)}
                compact
              />
            </div>
          </>
        )}

        {activeTab === 'lineups' && (
          <LineupsManager
            homeTeam={activeHomeTeam}
            awayTeam={activeAwayTeam}
            players={activePlayers}
            events={activeEvents}
            onAddPlayer={(p) => void handleAddPlayer(p)}
            onAddPlayersBulk={(list) => void handleAddPlayersBulk(list)}
            onSetPlayerStatus={(id, status) =>
              void handleSetPlayerStatus(id, status)
            }
            onRemovePlayer={(id) => void handleRemovePlayer(id)}
            onLoadSampleSquads={() => void handleLoadSampleSquads()}
          />
        )}

        {activeTab === 'events' && (
          <EventLogger
            info={activeInfo}
            homeTeam={activeHomeTeam}
            awayTeam={activeAwayTeam}
            players={activePlayers}
            events={activeEvents}
            clock={displayClock}
            onAddEvent={(ev) => void handleAddEvent(ev)}
            onDeleteEvent={(id) => void handleDeleteEvent(id)}
          />
        )}

        {activeTab === 'matches' && (
          <MatchesPanel
            isAuthenticated={Boolean(user)}
            isLoggingIn={isLoggingIn}
            userEmail={user?.email ?? null}
            matches={matches}
            activeMatchId={activeMatchId}
            onLogin={() => void handleLogin()}
            onLogout={() => void handleLogout()}
            onSelectMatch={(id) => {
              setActiveMatchId(id);
              setActiveTab('console');
            }}
            onCreateMatch={(info, home, away) =>
              void handleCreateMatch(info, home, away)
            }
            onRequestDeleteMatch={handleRequestDeleteMatch}
          />
        )}

        {activeTab === 'titler' && (
          <TitlerLivePanel
            config={titlerConfig}
            lastPublishedAt={titlerLastPublishedAt}
            lastVersion={titlerVersion}
            lastLatencyMs={titlerLatencyMs}
            publishError={titlerPublishError}
            isPublishing={isPublishingTitler}
            onToggleEnabled={() => {
              const updated = {
                ...titlerConfig,
                enabled: !titlerConfig.enabled,
              };
              saveTitlerConfig(updated);
              setTitlerConfig(updated);
            }}
            onPushNow={() => void handlePushTitlerNow()}
            onRegenerateFeed={() => {
              const fresh = regenerateTitlerConfig(titlerConfig.enabled);
              setTitlerConfig(fresh);
            }}
          />
        )}
      </main>

      <MatchSettingsModal
        isOpen={settingsOpen}
        info={activeInfo}
        homeTeam={activeHomeTeam}
        awayTeam={activeAwayTeam}
        onSave={(info, home, away) => void handleSaveSettings(info, home, away)}
        onClose={() => setSettingsOpen(false)}
      />

      <ConfirmModal
        isOpen={Boolean(confirmAction)}
        title={confirmAction?.title ?? ''}
        description={confirmAction?.description ?? ''}
        details={confirmAction?.details}
        confirmLabel={confirmAction?.confirmLabel ?? 'Confirm'}
        variant={confirmAction?.variant ?? 'primary'}
        isBusy={isConfirmBusy}
        onConfirm={() => void runConfirmAction()}
        onCancel={() => {
          if (!isConfirmBusy) setConfirmAction(null);
        }}
      />
    </div>
  );
}
