import express, { Request, Response } from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface TeamPayload {
  name: string;
  shortCode: string;
  color: string;
}

interface ClockPayload {
  elapsedSeconds: number;
  isRunning: boolean;
  period: string;
  addedMinutes: number;
  lastTickAt: number | null;
}

interface PlayerPayload {
  id: string;
  team: 'HOME' | 'AWAY';
  number: number;
  name: string;
  position: string;
  isStarter: boolean;
  status: string;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
}

interface EventPayload {
  id: string;
  type: string;
  team?: 'HOME' | 'AWAY';
  minute: number;
  addedMinute?: number;
  clockDisplay: string;
  period: string;
  playerId?: string;
  playerName?: string;
  secondaryPlayerId?: string;
  secondaryPlayerName?: string;
  goalType?: string;
  note?: string;
  createdAt: string;
}

interface MatchFeedPayload {
  info: {
    title: string;
    competition: string;
    venue: string;
    matchDate: string;
    halfDurationMinutes: number;
  };
  homeTeam: TeamPayload;
  awayTeam: TeamPayload;
  clock: ClockPayload;
  homeScore: number;
  awayScore: number;
  players: PlayerPayload[];
  events: EventPayload[];
}

interface StoredFeed {
  feedId: string;
  writeKey: string;
  version: number;
  seq: number;
  updatedAt: string;
  payload: MatchFeedPayload;
}

const PERIOD_LABELS: Record<string, string> = {
  PRE_MATCH: 'Pre-Match',
  FIRST_HALF: '1st Half',
  HALF_TIME: 'Half-Time',
  SECOND_HALF: '2nd Half',
  EXTRA_TIME_1: 'Extra Time 1',
  EXTRA_TIME_2: 'Extra Time 2',
  FULL_TIME: 'Full-Time',
};

const EVENT_LABELS: Record<string, string> = {
  GOAL: 'Goal',
  YELLOW_CARD: 'Yellow Card',
  RED_CARD: 'Red Card',
  SUBSTITUTION: 'Substitution',
  KICKOFF: 'Kickoff',
  HALF_TIME: 'Half-Time',
  FULL_TIME: 'Full-Time',
  NOTE: 'Match Note',
};

const STORE_FILE = path.join(os.tmpdir(), 'matchdesk-titler-feeds.json');
const feeds = new Map<string, StoredFeed>();
const sseClients = new Map<string, Set<Response>>();

function loadFeedsFromDisk() {
  try {
    if (fs.existsSync(STORE_FILE)) {
      const raw = fs.readFileSync(STORE_FILE, 'utf8');
      const parsed = JSON.parse(raw) as Record<string, StoredFeed>;
      for (const [k, v] of Object.entries(parsed)) {
        if (v && v.feedId && v.payload) {
          feeds.set(k, {
            ...v,
            version: v.version ?? 1,
            seq: v.seq ?? 0,
          });
        }
      }
    }
  } catch {
    // ignore corrupt temp cache
  }
}

function persistFeedsToDisk() {
  try {
    const obj: Record<string, StoredFeed> = {};
    for (const [k, v] of feeds.entries()) {
      obj[k] = v;
    }
    fs.writeFileSync(STORE_FILE, JSON.stringify(obj), 'utf8');
  } catch {
    // ignore disk write failure
  }
}

loadFeedsFromDisk();

function isValidFeedId(id: string): boolean {
  return /^[a-zA-Z0-9_-]{4,64}$/.test(id);
}

function formatMMSS(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function computeLiveClock(clock: ClockPayload, halfDurationMinutes: number) {
  const now = Date.now();
  let liveElapsed = Math.max(0, Math.floor(clock.elapsedSeconds));
  if (clock.isRunning && clock.lastTickAt) {
    liveElapsed += Math.max(0, Math.floor((now - clock.lastTickAt) / 1000));
  }

  const rawMin = Math.floor(liveElapsed / 60) + 1;
  const fullHalf = halfDurationMinutes || 45;
  const fullMatch = fullHalf * 2;
  let minuteDisplay = `${rawMin}'`;

  if (clock.period === 'PRE_MATCH') minuteDisplay = "0'";
  else if (clock.period === 'HALF_TIME') minuteDisplay = 'HT';
  else if (clock.period === 'FULL_TIME') minuteDisplay = 'FT';
  else if (clock.period === 'FIRST_HALF' && rawMin > fullHalf) {
    minuteDisplay = `${fullHalf}+${rawMin - fullHalf}'`;
  } else if (clock.period === 'SECOND_HALF' && rawMin > fullMatch) {
    minuteDisplay = `${fullMatch}+${rawMin - fullMatch}'`;
  }

  return {
    elapsedSeconds: liveElapsed,
    clockMMSS: formatMMSS(liveElapsed),
    minuteDisplay,
    periodLabel: PERIOD_LABELS[clock.period] ?? clock.period,
    addedDisplay: clock.addedMinutes > 0 ? `+${clock.addedMinutes}'` : '',
  };
}

function formatEventMinute(ev: EventPayload): string {
  if (ev.addedMinute && ev.addedMinute > 0) {
    return `${ev.minute}+${ev.addedMinute}'`;
  }
  return `${ev.minute}'`;
}

function getSortedEventsDesc(events: EventPayload[]): EventPayload[] {
  return events.slice().sort((a, b) => {
    if (b.minute !== a.minute) return b.minute - a.minute;
    if ((b.addedMinute ?? 0) !== (a.addedMinute ?? 0)) {
      return (b.addedMinute ?? 0) - (a.addedMinute ?? 0);
    }
    return b.createdAt.localeCompare(a.createdAt);
  });
}

function findPlayerNumber(
  players: PlayerPayload[],
  playerId?: string,
  playerName?: string,
  team?: 'HOME' | 'AWAY'
): string {
  const match = players.find(
    (p) =>
      (playerId && p.id === playerId) ||
      (playerName && p.name === playerName && (!team || p.team === team))
  );
  return match ? String(match.number) : '';
}

function buildLatestEventObject(stored: StoredFeed) {
  const { payload } = stored;
  const sortedDesc = getSortedEventsDesc(payload.events);
  const latest = sortedDesc[0] ?? null;

  if (!latest) {
    return {
      FeedVersion: stored.version,
      HasEvent: false,
      EventId: '',
      EventType: '',
      EventLabel: '',
      Minute: '',
      ExactClock: formatMMSS(payload.clock.elapsedSeconds),
      Period: PERIOD_LABELS[payload.clock.period] ?? payload.clock.period,
      TeamName: '',
      TeamShort: '',
      TeamSide: '',
      TeamColor: '',
      PlayerName: '',
      PlayerNumber: '',
      SecondaryPlayerName: '',
      SecondaryPlayerNumber: '',
      GoalType: '',
      Note: '',
      Headline: '',
      Subheadline: '',
      HomeScore: payload.homeScore,
      AwayScore: payload.awayScore,
      ScoreLine: `${payload.homeScore} - ${payload.awayScore}`,
      UpdatedAt: stored.updatedAt,
    };
  }

  const teamCfg =
    latest.team === 'HOME'
      ? payload.homeTeam
      : latest.team === 'AWAY'
      ? payload.awayTeam
      : null;

  const eventLabel = EVENT_LABELS[latest.type] ?? latest.type;
  const minuteStr = formatEventMinute(latest);
  const primaryNum = findPlayerNumber(
    payload.players,
    latest.playerId,
    latest.playerName,
    latest.team
  );
  const secondaryNum = findPlayerNumber(
    payload.players,
    latest.secondaryPlayerId,
    latest.secondaryPlayerName,
    latest.team
  );

  let headline = `${minuteStr} ${eventLabel.toUpperCase()}`;
  let subheadline = teamCfg ? teamCfg.name : payload.info.title;

  if (latest.type === 'GOAL') {
    headline = `GOAL · ${latest.playerName || teamCfg?.name || 'Goal'} (${minuteStr})`;
    const parts: string[] = [];
    if (teamCfg) parts.push(teamCfg.name);
    if (latest.goalType && latest.goalType !== 'Open Play') {
      parts.push(latest.goalType);
    }
    if (latest.secondaryPlayerName) {
      parts.push(`Assist: ${latest.secondaryPlayerName}`);
    }
    subheadline = parts.join(' · ');
  } else if (latest.type === 'SUBSTITUTION') {
    headline = `SUBSTITUTION · ${teamCfg?.shortCode || ''} (${minuteStr})`.trim();
    subheadline = `OFF: ${latest.playerName || '—'} · ON: ${latest.secondaryPlayerName || '—'}`;
  } else if (latest.type === 'YELLOW_CARD' || latest.type === 'RED_CARD') {
    headline = `${eventLabel.toUpperCase()} · ${latest.playerName || teamCfg?.name || ''} (${minuteStr})`;
    subheadline = [teamCfg?.name, latest.note].filter(Boolean).join(' · ');
  } else if (latest.note) {
    subheadline = latest.note;
  }

  return {
    FeedVersion: stored.version,
    HasEvent: true,
    EventId: latest.id,
    EventType: latest.type,
    EventLabel: eventLabel,
    Minute: minuteStr,
    ExactClock: latest.clockDisplay,
    Period: PERIOD_LABELS[latest.period] ?? latest.period,
    TeamName: teamCfg?.name ?? 'Match',
    TeamShort: teamCfg?.shortCode ?? '',
    TeamSide: latest.team ?? 'MATCH',
    TeamColor: teamCfg?.color ?? '',
    PlayerName: latest.playerName ?? '',
    PlayerNumber: primaryNum,
    SecondaryPlayerName: latest.secondaryPlayerName ?? '',
    SecondaryPlayerNumber: secondaryNum,
    GoalType: latest.goalType ?? '',
    Note: latest.note ?? '',
    Headline: headline,
    Subheadline: subheadline,
    HomeScore: payload.homeScore,
    AwayScore: payload.awayScore,
    ScoreLine: `${payload.homeScore} - ${payload.awayScore}`,
    UpdatedAt: stored.updatedAt,
  };
}

function buildScoreboardObject(stored: StoredFeed) {
  const { payload } = stored;
  const liveClock = computeLiveClock(
    payload.clock,
    payload.info.halfDurationMinutes
  );

  const sortedGoals = payload.events
    .filter((e) => e.type === 'GOAL')
    .slice()
    .sort((a, b) => {
      if (a.minute !== b.minute) return a.minute - b.minute;
      return (a.addedMinute ?? 0) - (b.addedMinute ?? 0);
    });

  const homeScorers = sortedGoals
    .filter((g) => g.team === 'HOME')
    .map(
      (g) =>
        `${g.playerName || 'Goal'} ${formatEventMinute(g)}${
          g.goalType === 'Penalty'
            ? ' (P)'
            : g.goalType === 'Own Goal'
            ? ' (OG)'
            : ''
        }`
    )
    .join(', ');

  const awayScorers = sortedGoals
    .filter((g) => g.team === 'AWAY')
    .map(
      (g) =>
        `${g.playerName || 'Goal'} ${formatEventMinute(g)}${
          g.goalType === 'Penalty'
            ? ' (P)'
            : g.goalType === 'Own Goal'
            ? ' (OG)'
            : ''
        }`
    )
    .join(', ');

  const latestEv = buildLatestEventObject(stored);

  return {
    FeedVersion: stored.version,
    MatchTitle: payload.info.title,
    Competition: payload.info.competition,
    Venue: payload.info.venue,
    MatchDate: payload.info.matchDate,
    Period: liveClock.periodLabel,
    PeriodCode: payload.clock.period,
    Clock: liveClock.clockMMSS,
    MatchMinute: liveClock.minuteDisplay,
    AddedTime: liveClock.addedDisplay,
    AddedMinutes: payload.clock.addedMinutes,
    IsClockRunning: payload.clock.isRunning,
    HomeName: payload.homeTeam.name,
    HomeShort: payload.homeTeam.shortCode,
    HomeColor: payload.homeTeam.color,
    HomeScore: payload.homeScore,
    HomeScorers: homeScorers,
    AwayName: payload.awayTeam.name,
    AwayShort: payload.awayTeam.shortCode,
    AwayColor: payload.awayTeam.color,
    AwayScore: payload.awayScore,
    AwayScorers: awayScorers,
    ScoreLine: `${payload.homeScore} - ${payload.awayScore}`,
    LatestEventType: latestEv.EventLabel,
    LatestEventTeam: latestEv.TeamName,
    LatestEventPlayer: latestEv.PlayerName || latestEv.Note,
    LatestEventMinute: latestEv.Minute,
    LatestEventText: latestEv.Headline,
    LatestEventSubtext: latestEv.Subheadline,
    UpdatedAt: stored.updatedAt,
  };
}

function buildLineupRows(
  stored: StoredFeed,
  teamFilter?: string,
  statusFilter?: string
) {
  const { payload } = stored;
  const statusLabels: Record<string, string> = {
    ON_PITCH: 'On Pitch',
    BENCH: 'Bench',
    SUBBED_OFF: 'Subbed Off',
  };

  return payload.players
    .filter((p) => (!teamFilter ? true : p.team === teamFilter))
    .filter((p) => (!statusFilter ? true : p.status === statusFilter))
    .slice()
    .sort((a, b) => {
      if (a.team !== b.team) return a.team === 'HOME' ? -1 : 1;
      if (a.isStarter !== b.isStarter) return a.isStarter ? -1 : 1;
      return a.number - b.number;
    })
    .map((p) => ({
      Team: p.team === 'HOME' ? payload.homeTeam.name : payload.awayTeam.name,
      TeamShort:
        p.team === 'HOME'
          ? payload.homeTeam.shortCode
          : payload.awayTeam.shortCode,
      TeamSide: p.team,
      Role: p.isStarter ? 'Starter' : 'Substitute',
      Number: p.number,
      Name: p.name,
      Position: p.position,
      Status: statusLabels[p.status] ?? p.status,
      StatusCode: p.status,
      Goals: p.goals,
      Assists: p.assists,
      YellowCards: p.yellowCards,
      RedCards: p.redCards,
    }));
}

function buildLineupsFlatObject(stored: StoredFeed) {
  const { payload } = stored;
  const allRows = buildLineupRows(stored);
  const homeStarters = allRows.filter(
    (p) => p.TeamSide === 'HOME' && p.Role === 'Starter'
  );
  const homeBench = allRows.filter(
    (p) => p.TeamSide === 'HOME' && p.Role !== 'Starter'
  );
  const awayStarters = allRows.filter(
    (p) => p.TeamSide === 'AWAY' && p.Role === 'Starter'
  );
  const awayBench = allRows.filter(
    (p) => p.TeamSide === 'AWAY' && p.Role !== 'Starter'
  );

  const flat: Record<string, string | number> = {
    FeedVersion: stored.version,
    HomeName: payload.homeTeam.name,
    HomeShort: payload.homeTeam.shortCode,
    HomeColor: payload.homeTeam.color,
    AwayName: payload.awayTeam.name,
    AwayShort: payload.awayTeam.shortCode,
    AwayColor: payload.awayTeam.color,
    HomeOnPitchCount: allRows.filter(
      (p) => p.TeamSide === 'HOME' && p.StatusCode === 'ON_PITCH'
    ).length,
    AwayOnPitchCount: allRows.filter(
      (p) => p.TeamSide === 'AWAY' && p.StatusCode === 'ON_PITCH'
    ).length,
    HomeLineupText: allRows
      .filter((p) => p.TeamSide === 'HOME' && p.StatusCode === 'ON_PITCH')
      .map((p) => `${p.Number} ${p.Name}`)
      .join(' · '),
    AwayLineupText: allRows
      .filter((p) => p.TeamSide === 'AWAY' && p.StatusCode === 'ON_PITCH')
      .map((p) => `${p.Number} ${p.Name}`)
      .join(' · '),
    UpdatedAt: stored.updatedAt,
  };

  for (let i = 0; i < 11; i++) {
    const idx = i + 1;
    const hp = homeStarters[i];
    flat[`HomeStarter${idx}Number`] = hp ? hp.Number : '';
    flat[`HomeStarter${idx}Name`] = hp ? hp.Name : '';
    flat[`HomeStarter${idx}Pos`] = hp ? hp.Position : '';
    flat[`HomeStarter${idx}Status`] = hp ? hp.Status : '';

    const ap = awayStarters[i];
    flat[`AwayStarter${idx}Number`] = ap ? ap.Number : '';
    flat[`AwayStarter${idx}Name`] = ap ? ap.Name : '';
    flat[`AwayStarter${idx}Pos`] = ap ? ap.Position : '';
    flat[`AwayStarter${idx}Status`] = ap ? ap.Status : '';
  }

  for (let i = 0; i < 9; i++) {
    const idx = i + 1;
    const hb = homeBench[i];
    flat[`HomeBench${idx}Number`] = hb ? hb.Number : '';
    flat[`HomeBench${idx}Name`] = hb ? hb.Name : '';
    flat[`HomeBench${idx}Pos`] = hb ? hb.Position : '';
    flat[`HomeBench${idx}Status`] = hb ? hb.Status : '';

    const ab = awayBench[i];
    flat[`AwayBench${idx}Number`] = ab ? ab.Number : '';
    flat[`AwayBench${idx}Name`] = ab ? ab.Name : '';
    flat[`AwayBench${idx}Pos`] = ab ? ab.Position : '';
    flat[`AwayBench${idx}Status`] = ab ? ab.Status : '';
  }

  return flat;
}

function buildScorerRows(stored: StoredFeed) {
  const { payload } = stored;
  const sortedGoals = payload.events
    .filter((e) => e.type === 'GOAL')
    .slice()
    .sort((a, b) => {
      if (a.minute !== b.minute) return a.minute - b.minute;
      return (a.addedMinute ?? 0) - (b.addedMinute ?? 0);
    });

  let runHome = 0;
  let runAway = 0;
  return sortedGoals.map((g) => {
    if (g.team === 'HOME') runHome += 1;
    else if (g.team === 'AWAY') runAway += 1;
    return {
      Minute: formatEventMinute(g),
      ExactClock: g.clockDisplay,
      Period: PERIOD_LABELS[g.period] ?? g.period,
      Team: g.team === 'HOME' ? payload.homeTeam.name : payload.awayTeam.name,
      TeamShort:
        g.team === 'HOME'
          ? payload.homeTeam.shortCode
          : payload.awayTeam.shortCode,
      TeamSide: g.team ?? 'HOME',
      Scorer: g.playerName || 'Unassigned',
      Assist: g.secondaryPlayerName || '',
      GoalType: g.goalType || 'Open Play',
      RunningScore: `${runHome} - ${runAway}`,
    };
  });
}

function buildEventRows(stored: StoredFeed, order: 'asc' | 'desc' = 'desc') {
  const { payload } = stored;
  const sorted = payload.events.slice().sort((a, b) => {
    const cmpMin = order === 'asc' ? a.minute - b.minute : b.minute - a.minute;
    if (cmpMin !== 0) return cmpMin;
    const cmpAdd =
      order === 'asc'
        ? (a.addedMinute ?? 0) - (b.addedMinute ?? 0)
        : (b.addedMinute ?? 0) - (a.addedMinute ?? 0);
    if (cmpAdd !== 0) return cmpAdd;
    return order === 'asc'
      ? a.createdAt.localeCompare(b.createdAt)
      : b.createdAt.localeCompare(a.createdAt);
  });

  return sorted.map((ev) => ({
    Minute: formatEventMinute(ev),
    ExactClock: ev.clockDisplay,
    Period: PERIOD_LABELS[ev.period] ?? ev.period,
    Team:
      ev.team === 'HOME'
        ? payload.homeTeam.name
        : ev.team === 'AWAY'
        ? payload.awayTeam.name
        : 'Match',
    TeamShort:
      ev.team === 'HOME'
        ? payload.homeTeam.shortCode
        : ev.team === 'AWAY'
        ? payload.awayTeam.shortCode
        : 'ALL',
    EventType: EVENT_LABELS[ev.type] ?? ev.type,
    Player: ev.playerName || '',
    SecondaryPlayer: ev.secondaryPlayerName || '',
    Details: ev.type === 'GOAL' ? ev.goalType || 'Open Play' : ev.note || '',
  }));
}

function csvCell(val: unknown): string {
  const s = String(val ?? '');
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toCsv(rows: Array<Record<string, unknown>>, headers: string[]): string {
  const lines = [headers.map(csvCell).join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => csvCell(row[h])).join(','));
  }
  return lines.join('\r\n');
}

function escapeXml(val: unknown): string {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildXmlDocument(stored: StoredFeed): string {
  const sb = buildScoreboardObject(stored);
  const latestEv = buildLatestEventObject(stored);
  const lineups = buildLineupRows(stored);
  const scorers = buildScorerRows(stored);
  const events = buildEventRows(stored, 'desc');

  const tagObj = (tag: string, obj: Record<string, unknown>) =>
    `<${tag}>${Object.entries(obj)
      .map(([k, v]) => `<${k}>${escapeXml(v)}</${k}>`)
      .join('')}</${tag}>`;

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<match>',
    tagObj('scoreboard', sb),
    tagObj('latestEvent', latestEv),
    `<homeLineup>${lineups
      .filter((p) => p.TeamSide === 'HOME')
      .map((p) => tagObj('player', p))
      .join('')}</homeLineup>`,
    `<awayLineup>${lineups
      .filter((p) => p.TeamSide === 'AWAY')
      .map((p) => tagObj('player', p))
      .join('')}</awayLineup>`,
    `<scorers>${scorers.map((s) => tagObj('goal', s)).join('')}</scorers>`,
    `<events>${events.map((e) => tagObj('event', e)).join('')}</events>`,
    '</match>',
  ].join('');
}

function broadcastToSse(feedId: string, stored: StoredFeed) {
  const listeners = sseClients.get(feedId);
  if (!listeners || listeners.size === 0) return;

  const bundle = {
    version: stored.version,
    updatedAt: stored.updatedAt,
    scoreboard: buildScoreboardObject(stored),
    latestEvent: buildLatestEventObject(stored),
    lineups: buildLineupRows(stored),
    lineupsFlat: buildLineupsFlatObject(stored),
    scorers: buildScorerRows(stored),
    events: buildEventRows(stored, 'desc'),
  };

  const payload = `event: matchUpdate\nid: ${stored.version}\ndata: ${JSON.stringify(bundle)}\n\n`;
  for (const res of listeners) {
    try {
      res.write(payload);
    } catch {
      listeners.delete(res);
    }
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  // CORS + No-Cache middleware for Titler Live polling endpoints
  app.use('/api/titler', (_req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, X-Titler-Key, X-Titler-Seq'
    );
    res.setHeader(
      'Cache-Control',
      'no-store, no-cache, must-revalidate, proxy-revalidate'
    );
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
  });

  app.options('/api/titler/*splat', (_req, res) => {
    res.status(204).end();
  });

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, activeFeeds: feeds.size });
  });

  // Publish / update live match payload for a Titler Live feed immediately
  app.post('/api/titler/:feedId', (req: Request, res: Response) => {
    const feedId = String(req.params.feedId || '');
    if (!isValidFeedId(feedId)) {
      res.status(400).json({ error: 'Invalid feedId format.' });
      return;
    }

    const writeKey = String(req.header('X-Titler-Key') || '');
    if (!writeKey || writeKey.length < 8) {
      res.status(401).json({ error: 'Missing X-Titler-Key header.' });
      return;
    }

    const existing = feeds.get(feedId);
    if (existing && existing.writeKey !== writeKey) {
      res.status(403).json({ error: 'Invalid feed write key.' });
      return;
    }

    const incomingSeq = Number(req.header('X-Titler-Seq') || 0);
    if (existing && incomingSeq > 0 && incomingSeq < existing.seq) {
      // Ignore stale out-of-order request
      res.json({
        ok: true,
        feedId,
        version: existing.version,
        updatedAt: existing.updatedAt,
        skippedStale: true,
      });
      return;
    }

    const payload = req.body as MatchFeedPayload;
    if (!payload || !payload.info || !payload.homeTeam || !payload.awayTeam || !payload.clock) {
      res.status(400).json({ error: 'Malformed match payload.' });
      return;
    }

    const updatedAt = new Date().toISOString();
    const nextVersion = (existing?.version ?? 0) + 1;
    const nextSeq = incomingSeq > 0 ? incomingSeq : (existing?.seq ?? 0) + 1;

    const stored: StoredFeed = {
      feedId,
      writeKey,
      version: nextVersion,
      seq: nextSeq,
      updatedAt,
      payload,
    };

    feeds.set(feedId, stored);
    broadcastToSse(feedId, stored);
    persistFeedsToDisk();

    res.json({ ok: true, feedId, version: nextVersion, updatedAt });
  });

  const requireFeed = (req: Request, res: Response): StoredFeed | null => {
    const feedId = String(req.params.feedId || '');
    const stored = feeds.get(feedId);
    if (!stored) {
      res.status(404).json({
        error: 'Titler Live feed not found. Open MatchDesk and publish the live feed first.',
      });
      return null;
    }
    res.setHeader('X-Feed-Version', String(stored.version));
    return stored;
  };

  // Real-time Server-Sent Events stream for zero-latency event & lineup output
  app.get('/api/titler/:feedId/stream', (req: Request, res: Response) => {
    const feedId = String(req.params.feedId || '');
    if (!isValidFeedId(feedId)) {
      res.status(400).json({ error: 'Invalid feedId format.' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    let listeners = sseClients.get(feedId);
    if (!listeners) {
      listeners = new Set<Response>();
      sseClients.set(feedId, listeners);
    }
    listeners.add(res);

    const existing = feeds.get(feedId);
    if (existing) {
      broadcastToSse(feedId, existing);
    } else {
      res.write('event: waiting\ndata: {"status":"waiting"}\n\n');
    }

    const keepalive = setInterval(() => {
      try {
        res.write(': keepalive\n\n');
      } catch {
        clearInterval(keepalive);
      }
    }, 15000);

    req.on('close', () => {
      clearInterval(keepalive);
      listeners?.delete(res);
    });
  });

  // Zero-dependency local bridge script for writing instant local files on the Titler Live PC
  app.get('/api/titler/:feedId/bridge.mjs', (req: Request, res: Response) => {
    const feedId = String(req.params.feedId || '');
    if (!isValidFeedId(feedId)) {
      res.status(400).send('// Invalid feedId');
      return;
    }
    const proto = req.header('x-forwarded-proto') || req.protocol || 'https';
    const host = req.header('x-forwarded-host') || req.header('host') || 'localhost:3000';
    const streamUrl = `${proto}://${host}/api/titler/${encodeURIComponent(feedId)}/stream`;

    const script = `// MatchDesk -> NewBlue Titler Live Instant Local Bridge
// Run with Node 18+: node matchdesk-titler-bridge.mjs
import fs from 'node:fs';
import path from 'node:path';

const STREAM_URL = ${JSON.stringify(streamUrl)};
const OUT_DIR = path.resolve(process.cwd(), 'titler-live-data');
fs.mkdirSync(OUT_DIR, { recursive: true });

function csvCell(v) {
  const s = String(v ?? '');
  return /[,\\"\\n\\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function toCsv(rows, headers) {
  return [headers.map(csvCell).join(','), ...rows.map(r => headers.map(h => csvCell(r[h])).join(','))].join('\\r\\n');
}
function writeAtomically(filename, content) {
  const target = path.join(OUT_DIR, filename);
  const tmp = target + '.tmp';
  fs.writeFileSync(tmp, content, 'utf8');
  fs.renameSync(tmp, target);
}

function handleBundle(bundle) {
  writeAtomically('scoreboard.json', JSON.stringify(bundle.scoreboard, null, 2));
  writeAtomically('latest-event.json', JSON.stringify(bundle.latestEvent, null, 2));
  writeAtomically('lineups.json', JSON.stringify(bundle.lineups, null, 2));
  writeAtomically('lineups-flat.json', JSON.stringify(bundle.lineupsFlat, null, 2));
  writeAtomically('lineups-home.json', JSON.stringify(bundle.lineups.filter(p => p.TeamSide === 'HOME'), null, 2));
  writeAtomically('lineups-away.json', JSON.stringify(bundle.lineups.filter(p => p.TeamSide === 'AWAY'), null, 2));
  writeAtomically('events.json', JSON.stringify(bundle.events, null, 2));
  writeAtomically('scorers.json', JSON.stringify(bundle.scorers, null, 2));

  const lineupHeaders = ['Team','TeamShort','TeamSide','Role','Number','Name','Position','Status','StatusCode','Goals','Assists','YellowCards','RedCards'];
  writeAtomically('lineups.csv', toCsv(bundle.lineups, lineupHeaders));

  const eventHeaders = ['Minute','ExactClock','Period','Team','TeamShort','EventType','Player','SecondaryPlayer','Details'];
  writeAtomically('events.csv', toCsv(bundle.events, eventHeaders));

  console.log('[' + new Date().toLocaleTimeString() + '] Synced v' + bundle.version + ' -> ' + bundle.scoreboard.HomeShort + ' ' + bundle.scoreboard.ScoreLine + ' ' + bundle.scoreboard.AwayShort + (bundle.latestEvent.Headline ? ' | ' + bundle.latestEvent.Headline : ''));
}

async function connect() {
  console.log('Connecting to MatchDesk live stream:', STREAM_URL);
  console.log('Writing live Titler files to:', OUT_DIR);
  try {
    const res = await fetch(STREAM_URL);
    if (!res.ok || !res.body) throw new Error('HTTP ' + res.status);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const blocks = buf.split('\\n\\n');
      buf = blocks.pop() || '';
      for (const block of blocks) {
        const dataLine = block.split('\\n').find(l => l.startsWith('data: '));
        if (dataLine && block.includes('event: matchUpdate')) {
          handleBundle(JSON.parse(dataLine.slice(6)));
        }
      }
    }
  } catch (err) {
    console.error('Stream disconnected, reconnecting in 1s...', err.message);
  }
  setTimeout(connect, 1000);
}

connect();
`;

    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="matchdesk-titler-bridge.mjs"'
    );
    res.send(script);
  });

  app.get('/api/titler/:feedId/scoreboard.json', (req, res) => {
    const stored = requireFeed(req, res);
    if (!stored) return;
    res.json(buildScoreboardObject(stored));
  });

  app.get('/api/titler/:feedId/latest-event.json', (req, res) => {
    const stored = requireFeed(req, res);
    if (!stored) return;
    res.json(buildLatestEventObject(stored));
  });

  app.get('/api/titler/:feedId/lineups.json', (req, res) => {
    const stored = requireFeed(req, res);
    if (!stored) return;
    const teamParam =
      typeof req.query.team === 'string'
        ? req.query.team.toUpperCase()
        : undefined;
    const statusParam =
      typeof req.query.status === 'string'
        ? req.query.status.toUpperCase()
        : undefined;
    res.json(buildLineupRows(stored, teamParam, statusParam));
  });

  app.get('/api/titler/:feedId/lineups-flat.json', (req, res) => {
    const stored = requireFeed(req, res);
    if (!stored) return;
    res.json(buildLineupsFlatObject(stored));
  });

  app.get('/api/titler/:feedId/scorers.json', (req, res) => {
    const stored = requireFeed(req, res);
    if (!stored) return;
    res.json(buildScorerRows(stored));
  });

  app.get('/api/titler/:feedId/events.json', (req, res) => {
    const stored = requireFeed(req, res);
    if (!stored) return;
    const order = req.query.order === 'asc' ? 'asc' : 'desc';
    res.json(buildEventRows(stored, order));
  });

  app.get('/api/titler/:feedId/scoreboard.xml', (req, res) => {
    const stored = requireFeed(req, res);
    if (!stored) return;
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.send(buildXmlDocument(stored));
  });

  app.get('/api/titler/:feedId/scoreboard.csv', (req, res) => {
    const stored = requireFeed(req, res);
    if (!stored) return;
    const sb = buildScoreboardObject(stored);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.send(toCsv([sb], Object.keys(sb)));
  });

  app.get('/api/titler/:feedId/lineups.csv', (req, res) => {
    const stored = requireFeed(req, res);
    if (!stored) return;
    const teamParam =
      typeof req.query.team === 'string'
        ? req.query.team.toUpperCase()
        : undefined;
    const statusParam =
      typeof req.query.status === 'string'
        ? req.query.status.toUpperCase()
        : undefined;
    const rows = buildLineupRows(stored, teamParam, statusParam);
    const headers = [
      'Team',
      'TeamShort',
      'TeamSide',
      'Role',
      'Number',
      'Name',
      'Position',
      'Status',
      'StatusCode',
      'Goals',
      'Assists',
      'YellowCards',
      'RedCards',
    ];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.send(toCsv(rows, headers));
  });

  app.get('/api/titler/:feedId/scorers.csv', (req, res) => {
    const stored = requireFeed(req, res);
    if (!stored) return;
    const rows = buildScorerRows(stored);
    const headers = [
      'Minute',
      'ExactClock',
      'Period',
      'Team',
      'TeamShort',
      'TeamSide',
      'Scorer',
      'Assist',
      'GoalType',
      'RunningScore',
    ];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.send(toCsv(rows, headers));
  });

  app.get('/api/titler/:feedId/events.csv', (req, res) => {
    const stored = requireFeed(req, res);
    if (!stored) return;
    const order = req.query.order === 'asc' ? 'asc' : 'desc';
    const rows = buildEventRows(stored, order);
    const headers = [
      'Minute',
      'ExactClock',
      'Period',
      'Team',
      'TeamShort',
      'EventType',
      'Player',
      'SecondaryPlayer',
      'Details',
    ];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.send(toCsv(rows, headers));
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*splat', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const PORT = 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`MatchDesk server listening on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
