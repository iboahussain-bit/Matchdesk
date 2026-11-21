import {
  GoalType,
  MatchEvent,
  MatchEventType,
  MatchPeriod,
  MatchState,
  Player,
  PlayerPosition,
  PlayerStatus,
  TeamSide,
} from '../types/match';

export const PERIOD_LABELS: Record<MatchPeriod, string> = {
  [MatchPeriod.PRE_MATCH]: 'Pre-Match',
  [MatchPeriod.FIRST_HALF]: '1st Half',
  [MatchPeriod.HALF_TIME]: 'Half-Time',
  [MatchPeriod.SECOND_HALF]: '2nd Half',
  [MatchPeriod.EXTRA_TIME_1]: 'Extra Time 1',
  [MatchPeriod.EXTRA_TIME_2]: 'Extra Time 2',
  [MatchPeriod.FULL_TIME]: 'Full-Time',
};

export const EVENT_TYPE_LABELS: Record<MatchEventType, string> = {
  [MatchEventType.GOAL]: 'Goal',
  [MatchEventType.YELLOW_CARD]: 'Yellow Card',
  [MatchEventType.RED_CARD]: 'Red Card',
  [MatchEventType.SUBSTITUTION]: 'Substitution',
  [MatchEventType.KICKOFF]: 'Kickoff',
  [MatchEventType.HALF_TIME]: 'Half-Time',
  [MatchEventType.FULL_TIME]: 'Full-Time',
  [MatchEventType.NOTE]: 'Match Note',
};

export function formatClockMMSS(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function getMatchMinuteInfo(
  elapsedSeconds: number,
  period: MatchPeriod,
  halfDurationMinutes: number
): { minute: number; addedMinute?: number; display: string } {
  const rawMin = Math.floor(Math.max(0, elapsedSeconds) / 60) + 1;
  const fullHalf = halfDurationMinutes;
  const fullMatch = halfDurationMinutes * 2;

  if (period === MatchPeriod.PRE_MATCH) {
    return { minute: 0, display: "0'" };
  }
  if (period === MatchPeriod.HALF_TIME) {
    return { minute: fullHalf, display: 'HT' };
  }
  if (period === MatchPeriod.FULL_TIME) {
    return { minute: fullMatch, display: 'FT' };
  }
  if (period === MatchPeriod.FIRST_HALF && rawMin > fullHalf) {
    const added = rawMin - fullHalf;
    return { minute: fullHalf, addedMinute: added, display: `${fullHalf}+${added}'` };
  }
  if (period === MatchPeriod.SECOND_HALF && rawMin > fullMatch) {
    const added = rawMin - fullMatch;
    return { minute: fullMatch, addedMinute: added, display: `${fullMatch}+${added}'` };
  }

  return { minute: rawMin, display: `${rawMin}'` };
}

export function formatEventMinute(event: MatchEvent): string {
  if (event.addedMinute && event.addedMinute > 0) {
    return `${event.minute}+${event.addedMinute}'`;
  }
  return `${event.minute}'`;
}

export function computeScores(events: MatchEvent[]): {
  home: number;
  away: number;
} {
  let home = 0;
  let away = 0;
  for (const ev of events) {
    if (ev.type === MatchEventType.GOAL) {
      if (ev.team === TeamSide.HOME) home += 1;
      else if (ev.team === TeamSide.AWAY) away += 1;
    }
  }
  return { home, away };
}

export interface PlayerStats {
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
}

export function computePlayerStats(
  playerId: string,
  playerName: string,
  team: TeamSide,
  events: MatchEvent[]
): PlayerStats {
  let goals = 0;
  let assists = 0;
  let yellowCards = 0;
  let redCards = 0;

  for (const ev of events) {
    const matchesPrimary =
      (ev.playerId && ev.playerId === playerId) ||
      (!ev.playerId && ev.playerName === playerName && ev.team === team);
    const matchesSecondary =
      (ev.secondaryPlayerId && ev.secondaryPlayerId === playerId) ||
      (!ev.secondaryPlayerId &&
        ev.secondaryPlayerName === playerName &&
        ev.team === team);

    if (ev.type === MatchEventType.GOAL) {
      if (matchesPrimary && ev.goalType !== GoalType.OWN_GOAL) goals += 1;
      if (matchesSecondary) assists += 1;
    } else if (ev.type === MatchEventType.YELLOW_CARD && matchesPrimary) {
      yellowCards += 1;
    } else if (ev.type === MatchEventType.RED_CARD && matchesPrimary) {
      redCards += 1;
    }
  }

  return { goals, assists, yellowCards, redCards };
}

export function getGoalEventsSorted(events: MatchEvent[]): MatchEvent[] {
  return events
    .filter((e) => e.type === MatchEventType.GOAL)
    .slice()
    .sort((a, b) => {
      if (a.minute !== b.minute) return a.minute - b.minute;
      return (a.addedMinute ?? 0) - (b.addedMinute ?? 0);
    });
}

export function createInitialMatchState(): MatchState {
  const today = new Date().toISOString().slice(0, 10);
  return {
    info: {
      title: 'Championship Final',
      competition: 'Premier Division',
      venue: 'National Stadium',
      matchDate: today,
      halfDurationMinutes: 45,
    },
    homeTeam: {
      name: 'Rasmaadhoo FC',
      shortCode: 'RAS',
      color: '#16A34A',
    },
    awayTeam: {
      name: 'Island United',
      shortCode: 'ISL',
      color: '#2563EB',
    },
    players: [],
    events: [],
    clock: {
      elapsedSeconds: 0,
      isRunning: false,
      period: MatchPeriod.PRE_MATCH,
      addedMinutes: 0,
      lastTickAt: null,
    },
  };
}

export function createSampleSquads(): Player[] {
  const homeStarters: Array<[number, string, PlayerPosition]> = [
    [1, 'Ahmed Nizam', PlayerPosition.GK],
    [2, 'Hussain Shareef', PlayerPosition.DEF],
    [4, 'Ali Fasir', PlayerPosition.DEF],
    [5, 'Ibrahim Waheed', PlayerPosition.DEF],
    [3, 'Mohamed Samdhooh', PlayerPosition.DEF],
    [6, 'Hassan Raif', PlayerPosition.MID],
    [8, 'Ismail Easa', PlayerPosition.MID],
    [10, 'Hamza Mohamed', PlayerPosition.MID],
    [7, 'Asadhulla Abdulla', PlayerPosition.FWD],
    [9, 'Naiz Hassan', PlayerPosition.FWD],
    [11, 'Aisam Ibrahim', PlayerPosition.FWD],
  ];

  const homeBench: Array<[number, string, PlayerPosition]> = [
    [12, 'Ziyan Naseer', PlayerPosition.GK],
    [14, 'Shifan Hassan', PlayerPosition.DEF],
    [16, 'Yoosuf Rameez', PlayerPosition.MID],
    [19, 'Rishwan Ismail', PlayerPosition.FWD],
  ];

  const awayStarters: Array<[number, string, PlayerPosition]> = [
    [1, 'Imran Mohamed', PlayerPosition.GK],
    [2, 'Samooh Ali', PlayerPosition.DEF],
    [4, 'Akram Abdul', PlayerPosition.DEF],
    [5, 'Numan Ahmed', PlayerPosition.DEF],
    [3, 'Rilwan Waheed', PlayerPosition.DEF],
    [6, 'Mukhthar Naseer', PlayerPosition.MID],
    [8, 'Hussain Nihan', PlayerPosition.MID],
    [10, 'Ashfaq Ali', PlayerPosition.MID],
    [7, 'Ibrahim Mahudhee', PlayerPosition.FWD],
    [9, 'Cornelius Stewart', PlayerPosition.FWD],
    [11, 'Hassan Nazeem', PlayerPosition.FWD],
  ];

  const awayBench: Array<[number, string, PlayerPosition]> = [
    [22, 'Faisal Mohamed', PlayerPosition.GK],
    [15, 'Amdhan Ali', PlayerPosition.DEF],
    [17, 'Shafiu Ahmed', PlayerPosition.MID],
    [20, 'Toriq Ahmed', PlayerPosition.FWD],
  ];

  const players: Player[] = [];
  homeStarters.forEach(([number, name, position], idx) => {
    players.push({
      id: `home-s-${idx}-${number}`,
      team: TeamSide.HOME,
      number,
      name,
      position,
      isStarter: true,
      status: PlayerStatus.ON_PITCH,
    });
  });
  homeBench.forEach(([number, name, position], idx) => {
    players.push({
      id: `home-b-${idx}-${number}`,
      team: TeamSide.HOME,
      number,
      name,
      position,
      isStarter: false,
      status: PlayerStatus.BENCH,
    });
  });
  awayStarters.forEach(([number, name, position], idx) => {
    players.push({
      id: `away-s-${idx}-${number}`,
      team: TeamSide.AWAY,
      number,
      name,
      position,
      isStarter: true,
      status: PlayerStatus.ON_PITCH,
    });
  });
  awayBench.forEach(([number, name, position], idx) => {
    players.push({
      id: `away-b-${idx}-${number}`,
      team: TeamSide.AWAY,
      number,
      name,
      position,
      isStarter: false,
      status: PlayerStatus.BENCH,
    });
  });

  return players;
}

export function parseBulkRoster(
  raw: string,
  team: TeamSide,
  isStarter: boolean
): Player[] {
  const lines = raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const parsed: Player[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Supports formats like: "10 Lionel Messi FWD" or "10, Lionel Messi, MID" or "Lionel Messi"
    const csvParts = line.split(',').map((p) => p.trim());
    let number = i + 1;
    let name = line;
    let position = PlayerPosition.MID;

    if (csvParts.length >= 2 && /^\d+$/.test(csvParts[0])) {
      number = parseInt(csvParts[0], 10);
      name = csvParts[1];
      const maybePos = csvParts[2]?.toUpperCase();
      if (
        maybePos === PlayerPosition.GK ||
        maybePos === PlayerPosition.DEF ||
        maybePos === PlayerPosition.MID ||
        maybePos === PlayerPosition.FWD
      ) {
        position = maybePos as PlayerPosition;
      }
    } else {
      const tokens = line.split(/\s+/);
      if (tokens.length >= 2 && /^\d+$/.test(tokens[0])) {
        number = parseInt(tokens[0], 10);
        const last = tokens[tokens.length - 1].toUpperCase();
        if (
          tokens.length >= 3 &&
          (last === PlayerPosition.GK ||
            last === PlayerPosition.DEF ||
            last === PlayerPosition.MID ||
            last === PlayerPosition.FWD)
        ) {
          position = last as PlayerPosition;
          name = tokens.slice(1, -1).join(' ');
        } else {
          name = tokens.slice(1).join(' ');
        }
      }
    }

    if (name.trim()) {
      parsed.push({
        id: `${team.toLowerCase()}-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
        team,
        number,
        name: name.trim(),
        position,
        isStarter,
        status: isStarter ? PlayerStatus.ON_PITCH : PlayerStatus.BENCH,
      });
    }
  }

  return parsed;
}
