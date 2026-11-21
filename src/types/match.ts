export enum MatchPeriod {
  PRE_MATCH = 'PRE_MATCH',
  FIRST_HALF = 'FIRST_HALF',
  HALF_TIME = 'HALF_TIME',
  SECOND_HALF = 'SECOND_HALF',
  EXTRA_TIME_1 = 'EXTRA_TIME_1',
  EXTRA_TIME_2 = 'EXTRA_TIME_2',
  FULL_TIME = 'FULL_TIME',
}

export enum TeamSide {
  HOME = 'HOME',
  AWAY = 'AWAY',
}

export enum PlayerPosition {
  GK = 'GK',
  DEF = 'DEF',
  MID = 'MID',
  FWD = 'FWD',
}

export enum PlayerStatus {
  ON_PITCH = 'ON_PITCH',
  BENCH = 'BENCH',
  SUBBED_OFF = 'SUBBED_OFF',
}

export enum MatchEventType {
  GOAL = 'GOAL',
  YELLOW_CARD = 'YELLOW_CARD',
  RED_CARD = 'RED_CARD',
  SUBSTITUTION = 'SUBSTITUTION',
  KICKOFF = 'KICKOFF',
  HALF_TIME = 'HALF_TIME',
  FULL_TIME = 'FULL_TIME',
  NOTE = 'NOTE',
}

export enum GoalType {
  OPEN_PLAY = 'Open Play',
  PENALTY = 'Penalty',
  FREE_KICK = 'Free Kick',
  HEADER = 'Header',
  OWN_GOAL = 'Own Goal',
}

export interface TeamConfig {
  name: string;
  shortCode: string;
  color: string;
}

export interface Player {
  id: string;
  team: TeamSide;
  number: number;
  name: string;
  position: PlayerPosition;
  isStarter: boolean;
  status: PlayerStatus;
}

export interface MatchEvent {
  id: string;
  type: MatchEventType;
  team?: TeamSide;
  minute: number;
  addedMinute?: number;
  clockDisplay: string;
  period: MatchPeriod;
  playerId?: string;
  playerName?: string;
  secondaryPlayerId?: string;
  secondaryPlayerName?: string;
  goalType?: GoalType;
  note?: string;
  createdAt: string;
}

export interface MatchInfo {
  title: string;
  competition: string;
  venue: string;
  matchDate: string;
  halfDurationMinutes: number;
}

export interface ClockState {
  elapsedSeconds: number;
  isRunning: boolean;
  period: MatchPeriod;
  addedMinutes: number;
  lastTickAt: number | null;
}

export interface MatchRecord {
  id: string;
  ownerId: string;
  info: MatchInfo;
  homeTeam: TeamConfig;
  awayTeam: TeamConfig;
  clock: ClockState;
  homeScore: number;
  awayScore: number;
}

export interface MatchState {
  info: MatchInfo;
  homeTeam: TeamConfig;
  awayTeam: TeamConfig;
  players: Player[];
  events: MatchEvent[];
  clock: ClockState;
}
