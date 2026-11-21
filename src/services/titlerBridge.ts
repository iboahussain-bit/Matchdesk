import {
  ClockState,
  MatchEvent,
  MatchInfo,
  Player,
  TeamConfig,
} from '../types/match';
import { computePlayerStats, computeScores } from '../utils/matchHelpers';

const FEED_CONFIG_STORAGE_KEY = 'matchdesk_titler_feed_config_v1';

export interface TitlerFeedConfig {
  feedId: string;
  writeKey: string;
  enabled: boolean;
}

let pushSequence = 0;

function randomToken(len: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  const bytes = new Uint8Array(len);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
    for (let i = 0; i < len; i++) {
      out += chars[bytes[i] % chars.length];
    }
  } else {
    for (let i = 0; i < len; i++) {
      out += chars[Math.floor(Math.random() * chars.length)];
    }
  }
  return out;
}

export function loadOrCreateTitlerConfig(): TitlerFeedConfig {
  try {
    const raw = localStorage.getItem(FEED_CONFIG_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as TitlerFeedConfig;
      if (parsed && parsed.feedId && parsed.writeKey) {
        return parsed;
      }
    }
  } catch {
    // ignore storage errors
  }

  const created: TitlerFeedConfig = {
    feedId: `match_${randomToken(10)}`,
    writeKey: `tk_${randomToken(24)}`,
    enabled: true,
  };
  saveTitlerConfig(created);
  return created;
}

export function saveTitlerConfig(config: TitlerFeedConfig): void {
  try {
    localStorage.setItem(FEED_CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch {
    // ignore
  }
}

export function regenerateTitlerConfig(enabled = true): TitlerFeedConfig {
  const fresh: TitlerFeedConfig = {
    feedId: `match_${randomToken(10)}`,
    writeKey: `tk_${randomToken(24)}`,
    enabled,
  };
  saveTitlerConfig(fresh);
  return fresh;
}

export async function publishTitlerFeed(
  config: TitlerFeedConfig,
  data: {
    info: MatchInfo;
    homeTeam: TeamConfig;
    awayTeam: TeamConfig;
    clock: ClockState;
    players: Player[];
    events: MatchEvent[];
  }
): Promise<{ updatedAt: string; version: number; latencyMs: number }> {
  const startedAt = performance.now();
  pushSequence += 1;
  const seq = pushSequence;

  const scores = computeScores(data.events);

  const enrichedPlayers = data.players.map((p) => {
    const stats = computePlayerStats(p.id, p.name, p.team, data.events);
    return {
      id: p.id,
      team: p.team,
      number: p.number,
      name: p.name,
      position: p.position,
      isStarter: p.isStarter,
      status: p.status,
      goals: stats.goals,
      assists: stats.assists,
      yellowCards: stats.yellowCards,
      redCards: stats.redCards,
    };
  });

  const payload = {
    info: data.info,
    homeTeam: data.homeTeam,
    awayTeam: data.awayTeam,
    clock: data.clock,
    homeScore: scores.home,
    awayScore: scores.away,
    players: enrichedPlayers,
    events: data.events.map((ev) => ({
      id: ev.id,
      type: ev.type,
      team: ev.team,
      minute: ev.minute,
      addedMinute: ev.addedMinute,
      clockDisplay: ev.clockDisplay,
      period: ev.period,
      playerId: ev.playerId,
      playerName: ev.playerName,
      secondaryPlayerId: ev.secondaryPlayerId,
      secondaryPlayerName: ev.secondaryPlayerName,
      goalType: ev.goalType,
      note: ev.note,
      createdAt: ev.createdAt,
    })),
  };

  const res = await fetch(`/api/titler/${encodeURIComponent(config.feedId)}`, {
    method: 'POST',
    keepalive: true,
    headers: {
      'Content-Type': 'application/json',
      'X-Titler-Key': config.writeKey,
      'X-Titler-Seq': String(seq),
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    let msg = `Publish failed (${res.status})`;
    try {
      const errData = (await res.json()) as { error?: string };
      if (errData?.error) msg = errData.error;
    } catch {
      // ignore
    }
    throw new Error(msg);
  }

  const body = (await res.json()) as { updatedAt: string; version?: number };
  return {
    updatedAt: body.updatedAt,
    version: body.version ?? seq,
    latencyMs: Math.round(performance.now() - startedAt),
  };
}
