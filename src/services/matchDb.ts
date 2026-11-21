import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import {
  ClockState,
  GoalType,
  MatchEvent,
  MatchEventType,
  MatchInfo,
  MatchPeriod,
  MatchRecord,
  Player,
  PlayerPosition,
  PlayerStatus,
  TeamConfig,
  TeamSide,
} from '../types/match';
import { createInitialMatchState } from '../utils/matchHelpers';

function sanitizeStr(val: string | undefined | null, maxLen: number): string {
  return (val ?? '').trim().slice(0, maxLen);
}

function sanitizeDate(val: string | undefined): string {
  const trimmed = (val ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  return new Date().toISOString().slice(0, 10);
}

function sanitizeColor(val: string | undefined, fallback: string): string {
  const trimmed = (val ?? '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed;
  return fallback;
}

function sanitizeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/[^a-zA-Z0-9_-]/g, '');
  }
  return `id_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function sanitizeClock(clock: ClockState) {
  return {
    elapsedSeconds: Math.min(18000, Math.max(0, Math.floor(clock.elapsedSeconds))),
    isRunning: Boolean(clock.isRunning),
    period: clock.period,
    addedMinutes: Math.min(45, Math.max(0, Math.floor(clock.addedMinutes))),
    lastTickAt:
      clock.lastTickAt === null || clock.lastTickAt === undefined
        ? null
        : Math.max(0, Math.floor(clock.lastTickAt)),
  };
}

function sanitizeTeam(team: TeamConfig, fallbackColor: string) {
  return {
    name: sanitizeStr(team.name, 80) || 'Team',
    shortCode: (sanitizeStr(team.shortCode, 6) || 'TM').toUpperCase(),
    color: sanitizeColor(team.color, fallbackColor),
  };
}

export function subscribeToUserMatches(
  uid: string,
  onData: (matches: MatchRecord[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const path = 'matches';
  const q = query(collection(db, path), where('ownerId', '==', uid));

  return onSnapshot(
    q,
    (snapshot) => {
      const records: MatchRecord[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          ownerId: String(data.ownerId ?? uid),
          info: {
            title: String(data.title ?? 'Match'),
            competition: String(data.competition ?? ''),
            venue: String(data.venue ?? ''),
            matchDate: String(data.matchDate ?? new Date().toISOString().slice(0, 10)),
            halfDurationMinutes: Number(data.halfDurationMinutes ?? 45),
          },
          homeTeam: {
            name: String(data.homeTeam?.name ?? 'Home'),
            shortCode: String(data.homeTeam?.shortCode ?? 'HOM'),
            color: String(data.homeTeam?.color ?? '#16A34A'),
          },
          awayTeam: {
            name: String(data.awayTeam?.name ?? 'Away'),
            shortCode: String(data.awayTeam?.shortCode ?? 'AWY'),
            color: String(data.awayTeam?.color ?? '#2563EB'),
          },
          clock: {
            elapsedSeconds: Number(data.clock?.elapsedSeconds ?? 0),
            isRunning: Boolean(data.clock?.isRunning ?? false),
            period: (data.clock?.period as MatchPeriod) ?? MatchPeriod.PRE_MATCH,
            addedMinutes: Number(data.clock?.addedMinutes ?? 0),
            lastTickAt:
              data.clock?.lastTickAt === null || data.clock?.lastTickAt === undefined
                ? null
                : Number(data.clock.lastTickAt),
          },
          homeScore: Number(data.homeScore ?? 0),
          awayScore: Number(data.awayScore ?? 0),
        };
      });

      records.sort((a, b) => b.info.matchDate.localeCompare(a.info.matchDate));
      onData(records);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) onError(wrapped);
      }
    }
  );
}

export function subscribeToMatchPlayers(
  uid: string,
  matchId: string,
  onData: (players: Player[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const path = `matches/${matchId}/players`;
  const q = query(collection(db, path), where('ownerId', '==', uid));

  return onSnapshot(
    q,
    (snapshot) => {
      const list: Player[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          team: (data.team as TeamSide) ?? TeamSide.HOME,
          number: Number(data.number ?? 1),
          name: String(data.name ?? ''),
          position: (data.position as PlayerPosition) ?? PlayerPosition.MID,
          isStarter: Boolean(data.isStarter),
          status: (data.status as PlayerStatus) ?? PlayerStatus.ON_PITCH,
        };
      });
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) onError(wrapped);
      }
    }
  );
}

export function subscribeToMatchEvents(
  uid: string,
  matchId: string,
  onData: (events: MatchEvent[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const path = `matches/${matchId}/events`;
  const q = query(collection(db, path), where('ownerId', '==', uid));

  return onSnapshot(
    q,
    (snapshot) => {
      const list: MatchEvent[] = snapshot.docs.map((d) => {
        const data = d.data();
        const teamRaw = String(data.team ?? 'MATCH');
        const addedRaw = Number(data.addedMinute ?? 0);
        return {
          id: d.id,
          type: (data.type as MatchEventType) ?? MatchEventType.NOTE,
          team:
            teamRaw === TeamSide.HOME || teamRaw === TeamSide.AWAY
              ? (teamRaw as TeamSide)
              : undefined,
          minute: Number(data.minute ?? 0),
          addedMinute: addedRaw > 0 ? addedRaw : undefined,
          clockDisplay: String(data.clockDisplay ?? '00:00'),
          period: (data.period as MatchPeriod) ?? MatchPeriod.PRE_MATCH,
          playerId: data.playerId ? String(data.playerId) : undefined,
          playerName: data.playerName ? String(data.playerName) : undefined,
          secondaryPlayerId: data.secondaryPlayerId
            ? String(data.secondaryPlayerId)
            : undefined,
          secondaryPlayerName: data.secondaryPlayerName
            ? String(data.secondaryPlayerName)
            : undefined,
          goalType: data.goalType ? (String(data.goalType) as GoalType) : undefined,
          note: data.note ? String(data.note) : undefined,
          createdAt: String(data.clientCreatedIso ?? new Date().toISOString()),
        };
      });
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) onError(wrapped);
      }
    }
  );
}

export async function createMatchDocument(
  uid: string,
  initial?: Partial<{
    info: MatchInfo;
    homeTeam: TeamConfig;
    awayTeam: TeamConfig;
  }>
): Promise<string> {
  const base = createInitialMatchState();
  const info = initial?.info ?? base.info;
  const homeTeam = sanitizeTeam(initial?.homeTeam ?? base.homeTeam, '#16A34A');
  const awayTeam = sanitizeTeam(initial?.awayTeam ?? base.awayTeam, '#2563EB');

  const matchId = sanitizeId();
  const path = `matches/${matchId}`;

  try {
    await setDoc(doc(db, 'matches', matchId), {
      ownerId: uid,
      title: sanitizeStr(info.title, 120) || 'Match',
      competition: sanitizeStr(info.competition, 120),
      venue: sanitizeStr(info.venue, 120),
      matchDate: sanitizeDate(info.matchDate),
      halfDurationMinutes: Math.min(90, Math.max(1, Math.floor(info.halfDurationMinutes || 45))),
      homeTeam,
      awayTeam,
      clock: sanitizeClock(base.clock),
      homeScore: 0,
      awayScore: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return matchId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateMatchSettingsDb(
  matchId: string,
  info: MatchInfo,
  homeTeam: TeamConfig,
  awayTeam: TeamConfig
): Promise<void> {
  const path = `matches/${matchId}`;
  try {
    await updateDoc(doc(db, 'matches', matchId), {
      title: sanitizeStr(info.title, 120) || 'Match',
      competition: sanitizeStr(info.competition, 120),
      venue: sanitizeStr(info.venue, 120),
      matchDate: sanitizeDate(info.matchDate),
      halfDurationMinutes: Math.min(90, Math.max(1, Math.floor(info.halfDurationMinutes || 45))),
      homeTeam: sanitizeTeam(homeTeam, '#16A34A'),
      awayTeam: sanitizeTeam(awayTeam, '#2563EB'),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateMatchClockDb(
  matchId: string,
  clock: ClockState
): Promise<void> {
  const path = `matches/${matchId}`;
  try {
    await updateDoc(doc(db, 'matches', matchId), {
      clock: sanitizeClock(clock),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function addMatchEventDb(
  uid: string,
  matchId: string,
  draft: Omit<MatchEvent, 'id' | 'createdAt'>,
  nextScores: { home: number; away: number },
  nextClock?: ClockState
): Promise<void> {
  const eventId = sanitizeId();
  const path = `matches/${matchId}/events/${eventId}`;

  try {
    const batch = writeBatch(db);
    const eventRef = doc(db, 'matches', matchId, 'events', eventId);

    batch.set(eventRef, {
      ownerId: uid,
      type: draft.type,
      team: draft.team ?? 'MATCH',
      minute: Math.min(180, Math.max(0, Math.floor(draft.minute))),
      addedMinute: Math.min(45, Math.max(0, Math.floor(draft.addedMinute ?? 0))),
      clockDisplay: sanitizeStr(draft.clockDisplay, 16) || '00:00',
      period: draft.period,
      playerId: sanitizeStr(draft.playerId, 128),
      playerName: sanitizeStr(draft.playerName, 80),
      secondaryPlayerId: sanitizeStr(draft.secondaryPlayerId, 128),
      secondaryPlayerName: sanitizeStr(draft.secondaryPlayerName, 80),
      goalType: sanitizeStr(draft.goalType, 32),
      note: sanitizeStr(draft.note, 200),
      clientCreatedIso: new Date().toISOString().slice(0, 40),
      createdAt: serverTimestamp(),
    });

    if (draft.type === MatchEventType.SUBSTITUTION) {
      if (draft.playerId) {
        batch.update(doc(db, 'matches', matchId, 'players', draft.playerId), {
          status: PlayerStatus.SUBBED_OFF,
          updatedAt: serverTimestamp(),
        });
      }
      if (draft.secondaryPlayerId) {
        batch.update(
          doc(db, 'matches', matchId, 'players', draft.secondaryPlayerId),
          {
            status: PlayerStatus.ON_PITCH,
            updatedAt: serverTimestamp(),
          }
        );
      }
    }

    const matchUpdates: Record<string, unknown> = {
      homeScore: Math.max(0, Math.floor(nextScores.home)),
      awayScore: Math.max(0, Math.floor(nextScores.away)),
      updatedAt: serverTimestamp(),
    };
    if (nextClock) {
      matchUpdates.clock = sanitizeClock(nextClock);
    }

    batch.update(doc(db, 'matches', matchId), matchUpdates);

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteMatchEventDb(
  matchId: string,
  eventId: string,
  nextScores: { home: number; away: number }
): Promise<void> {
  const path = `matches/${matchId}/events/${eventId}`;
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'matches', matchId, 'events', eventId));
    batch.update(doc(db, 'matches', matchId), {
      homeScore: Math.max(0, Math.floor(nextScores.home)),
      awayScore: Math.max(0, Math.floor(nextScores.away)),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function addPlayerDb(
  uid: string,
  matchId: string,
  player: Omit<Player, 'id'>
): Promise<void> {
  const playerId = sanitizeId();
  const path = `matches/${matchId}/players/${playerId}`;
  try {
    await setDoc(doc(db, 'matches', matchId, 'players', playerId), {
      ownerId: uid,
      team: player.team,
      number: Math.min(99, Math.max(1, Math.floor(player.number || 1))),
      name: sanitizeStr(player.name, 80) || 'Player',
      position: player.position,
      isStarter: Boolean(player.isStarter),
      status: player.status,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function addPlayersBatchDb(
  uid: string,
  matchId: string,
  players: Array<Omit<Player, 'id'>>
): Promise<void> {
  const path = `matches/${matchId}/players`;
  try {
    const batch = writeBatch(db);
    for (const p of players) {
      const playerId = sanitizeId();
      batch.set(doc(db, 'matches', matchId, 'players', playerId), {
        ownerId: uid,
        team: p.team,
        number: Math.min(99, Math.max(1, Math.floor(p.number || 1))),
        name: sanitizeStr(p.name, 80) || 'Player',
        position: p.position,
        isStarter: Boolean(p.isStarter),
        status: p.status,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function updatePlayerStatusDb(
  matchId: string,
  playerId: string,
  status: PlayerStatus
): Promise<void> {
  const path = `matches/${matchId}/players/${playerId}`;
  try {
    await updateDoc(doc(db, 'matches', matchId, 'players', playerId), {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function removePlayerDb(
  matchId: string,
  playerId: string
): Promise<void> {
  const path = `matches/${matchId}/players/${playerId}`;
  try {
    await deleteDoc(doc(db, 'matches', matchId, 'players', playerId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function deleteMatchCascadeDb(
  uid: string,
  matchId: string
): Promise<void> {
  const path = `matches/${matchId}`;
  try {
    const playersSnap = await getDocs(
      query(collection(db, 'matches', matchId, 'players'), where('ownerId', '==', uid))
    );
    const eventsSnap = await getDocs(
      query(collection(db, 'matches', matchId, 'events'), where('ownerId', '==', uid))
    );

    const batch = writeBatch(db);
    playersSnap.docs.forEach((d) => batch.delete(d.ref));
    eventsSnap.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(doc(db, 'matches', matchId));
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
