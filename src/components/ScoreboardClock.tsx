import React, { useState } from 'react';
import {
  Pause,
  Play,
  Plus,
  Minus,
  RotateCcw,
  SlidersHorizontal,
  Clock,
} from 'lucide-react';
import {
  ClockState,
  MatchEvent,
  MatchInfo,
  MatchPeriod,
  TeamConfig,
  TeamSide,
} from '../types/match';
import {
  computeScores,
  formatClockMMSS,
  formatEventMinute,
  getGoalEventsSorted,
  getMatchMinuteInfo,
  PERIOD_LABELS,
} from '../utils/matchHelpers';

interface ScoreboardClockProps {
  info: MatchInfo;
  homeTeam: TeamConfig;
  awayTeam: TeamConfig;
  clock: ClockState;
  events: MatchEvent[];
  onToggleClock: () => void;
  onChangePeriod: (period: MatchPeriod) => void;
  onAdjustSeconds: (delta: number) => void;
  onSetExactSeconds: (seconds: number) => void;
  onSetAddedMinutes: (minutes: number) => void;
  onRequestResetClock: () => void;
  onQuickGoal: (team: TeamSide) => void;
  onOpenSettings: () => void;
}

const ORDERED_PERIODS: MatchPeriod[] = [
  MatchPeriod.PRE_MATCH,
  MatchPeriod.FIRST_HALF,
  MatchPeriod.HALF_TIME,
  MatchPeriod.SECOND_HALF,
  MatchPeriod.EXTRA_TIME_1,
  MatchPeriod.EXTRA_TIME_2,
  MatchPeriod.FULL_TIME,
];

export const ScoreboardClock: React.FC<ScoreboardClockProps> = ({
  info,
  homeTeam,
  awayTeam,
  clock,
  events,
  onToggleClock,
  onChangePeriod,
  onAdjustSeconds,
  onSetExactSeconds,
  onSetAddedMinutes,
  onRequestResetClock,
  onQuickGoal,
  onOpenSettings,
}) => {
  const scores = computeScores(events);
  const minuteInfo = getMatchMinuteInfo(
    clock.elapsedSeconds,
    clock.period,
    info.halfDurationMinutes
  );
  const sortedGoals = getGoalEventsSorted(events);
  const homeGoals = sortedGoals.filter((g) => g.team === TeamSide.HOME);
  const awayGoals = sortedGoals.filter((g) => g.team === TeamSide.AWAY);

  const [editingTime, setEditingTime] = useState(false);
  const [timeInput, setTimeInput] = useState('');

  const startEditingTime = () => {
    setTimeInput(formatClockMMSS(clock.elapsedSeconds));
    setEditingTime(true);
  };

  const commitTimeEdit = (e: React.FormEvent) => {
    e.preventDefault();
    const parts = timeInput.trim().split(':');
    if (parts.length === 2) {
      const m = parseInt(parts[0], 10);
      const s = parseInt(parts[1], 10);
      if (!Number.isNaN(m) && !Number.isNaN(s) && m >= 0 && s >= 0 && s < 60) {
        onSetExactSeconds(m * 60 + s);
      }
    } else if (parts.length === 1) {
      const m = parseInt(parts[0], 10);
      if (!Number.isNaN(m) && m >= 0) {
        onSetExactSeconds(m * 60);
      }
    }
    setEditingTime(false);
  };

  return (
    <section
      aria-label="Live Scoreboard and Game Clock"
      className="overflow-hidden rounded-xl border border-slate-200 bg-white"
    >
      {/* Match Metadata Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-slate-50 px-5 py-3">
        <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-600">
          <span className="font-semibold text-slate-900">{info.title}</span>
          {info.competition && (
            <>
              <span aria-hidden="true">·</span>
              <span>{info.competition}</span>
            </>
          )}
          {info.venue && (
            <>
              <span aria-hidden="true">·</span>
              <span>{info.venue}</span>
            </>
          )}
          <span aria-hidden="true">·</span>
          <span className="tabular-nums">{info.matchDate}</span>
        </div>
        <button
          type="button"
          onClick={onOpenSettings}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 whitespace-nowrap shrink-0"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Match Settings
        </button>
      </div>

      {/* Hardware Broadcast Scoreboard Casing */}
      <div className="bg-slate-950 px-6 py-7 text-white">
        <div className="grid grid-cols-1 items-center gap-6 lg:grid-cols-12">
          {/* Home Team Wing */}
          <div className="flex flex-col items-center text-center lg:col-span-4 lg:items-end lg:text-right">
            <div className="flex items-center gap-3">
              <span className="font-mono text-xs font-semibold tracking-wider text-slate-400">
                {homeTeam.shortCode}
              </span>
              <h2 className="font-display text-2xl font-bold tracking-tight text-white">
                {homeTeam.name}
              </h2>
              <span
                className="h-4 w-4 shrink-0 rounded-sm border border-white/20"
                style={{ backgroundColor: homeTeam.color }}
                aria-hidden="true"
              />
            </div>
            <div className="mt-2 min-h-[20px] text-xs text-slate-400 tabular-nums">
              {homeGoals.length > 0 ? (
                homeGoals
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
                  .join(' · ')
              ) : (
                <span className="text-slate-600">No goals recorded</span>
              )}
            </div>
            <button
              type="button"
              onClick={() => onQuickGoal(TeamSide.HOME)}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/10 px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-white/20 whitespace-nowrap shrink-0"
            >
              <Plus className="h-3.5 w-3.5" />
              Log {homeTeam.shortCode} Goal
            </button>
          </div>

          {/* Center Score & Clock Instrument */}
          <div className="flex flex-col items-center justify-center lg:col-span-4">
            <div className="flex items-center gap-2 text-xs font-medium tracking-wide text-slate-300">
              <span>{PERIOD_LABELS[clock.period]}</span>
              <span aria-hidden="true">·</span>
              <span
                className={
                  clock.isRunning ? 'text-emerald-400 font-semibold' : 'text-amber-400'
                }
              >
                {clock.isRunning ? 'Clock Running' : 'Clock Paused'}
              </span>
            </div>

            <div className="mt-2 flex items-center justify-center gap-5">
              <span className="font-mono text-5xl font-bold tracking-tight tabular-nums text-white sm:text-6xl">
                {scores.home}
              </span>
              <span className="font-mono text-3xl font-medium text-slate-600">
                :
              </span>
              <span className="font-mono text-5xl font-bold tracking-tight tabular-nums text-white sm:text-6xl">
                {scores.away}
              </span>
            </div>

            <div className="mt-3 flex items-center gap-3">
              {editingTime ? (
                <form onSubmit={commitTimeEdit} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={timeInput}
                    onChange={(e) => setTimeInput(e.target.value)}
                    placeholder="MM:SS"
                    autoFocus
                    className="w-24 rounded-md border border-slate-600 bg-slate-900 px-2.5 py-1 text-center font-mono text-lg font-bold tabular-nums text-white focus:border-blue-500 focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="rounded-md bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-700"
                  >
                    Set
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingTime(false)}
                    className="rounded-md bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-300 hover:bg-slate-700"
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={startEditingTime}
                  title="Click to jump clock to a specific MM:SS"
                  className="group flex items-baseline gap-2 rounded-lg border border-slate-800 bg-slate-900 px-4 py-1.5 transition-colors hover:border-slate-700"
                >
                  <span className="font-mono text-2xl font-bold tabular-nums text-emerald-400">
                    {formatClockMMSS(clock.elapsedSeconds)}
                  </span>
                  <span className="font-mono text-xs text-slate-400 tabular-nums">
                    ({minuteInfo.display})
                  </span>
                </button>
              )}

              {clock.addedMinutes > 0 && (
                <span className="rounded-md border border-amber-500/40 bg-amber-500/15 px-2.5 py-1 font-mono text-sm font-semibold tabular-nums text-amber-300">
                  +{clock.addedMinutes}&apos;
                </span>
              )}
            </div>
          </div>

          {/* Away Team Wing */}
          <div className="flex flex-col items-center text-center lg:col-span-4 lg:items-start lg:text-left">
            <div className="flex items-center gap-3">
              <span
                className="h-4 w-4 shrink-0 rounded-sm border border-white/20"
                style={{ backgroundColor: awayTeam.color }}
                aria-hidden="true"
              />
              <h2 className="font-display text-2xl font-bold tracking-tight text-white">
                {awayTeam.name}
              </h2>
              <span className="font-mono text-xs font-semibold tracking-wider text-slate-400">
                {awayTeam.shortCode}
              </span>
            </div>
            <div className="mt-2 min-h-[20px] text-xs text-slate-400 tabular-nums">
              {awayGoals.length > 0 ? (
                awayGoals
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
                  .join(' · ')
              ) : (
                <span className="text-slate-600">No goals recorded</span>
              )}
            </div>
            <button
              type="button"
              onClick={() => onQuickGoal(TeamSide.AWAY)}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/10 px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-white/20 whitespace-nowrap shrink-0"
            >
              <Plus className="h-3.5 w-3.5" />
              Log {awayTeam.shortCode} Goal
            </button>
          </div>
        </div>
      </div>

      {/* Time Controller Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 bg-white px-5 py-3.5">
        {/* Primary Clock & Period Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={onToggleClock}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors whitespace-nowrap shrink-0 ${
              clock.isRunning
                ? 'bg-amber-600 hover:bg-amber-700'
                : 'bg-emerald-600 hover:bg-emerald-700'
            }`}
          >
            {clock.isRunning ? (
              <>
                <Pause className="h-4 w-4" />
                Pause Clock
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                Start Clock
              </>
            )}
          </button>

          <div className="flex items-center gap-1.5">
            <label htmlFor="period-select" className="sr-only">
              Match Period
            </label>
            <select
              id="period-select"
              value={clock.period}
              onChange={(e) => onChangePeriod(e.target.value as MatchPeriod)}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 focus:border-blue-600 focus:outline-none"
            >
              {ORDERED_PERIODS.map((p) => (
                <option key={p} value={p}>
                  {PERIOD_LABELS[p]}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={startEditingTime}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            <Clock className="h-3.5 w-3.5" />
            Set MM:SS
          </button>
        </div>

        {/* Fine Time Stepper & Added Time */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
            <button
              type="button"
              onClick={() => onAdjustSeconds(-60)}
              className="rounded-md px-2.5 py-1 font-mono text-xs font-medium text-slate-700 transition-colors hover:bg-white hover:text-slate-900 tabular-nums"
            >
              -1m
            </button>
            <button
              type="button"
              onClick={() => onAdjustSeconds(-10)}
              className="rounded-md px-2.5 py-1 font-mono text-xs font-medium text-slate-700 transition-colors hover:bg-white hover:text-slate-900 tabular-nums"
            >
              -10s
            </button>
            <button
              type="button"
              onClick={() => onAdjustSeconds(10)}
              className="rounded-md px-2.5 py-1 font-mono text-xs font-medium text-slate-700 transition-colors hover:bg-white hover:text-slate-900 tabular-nums"
            >
              +10s
            </button>
            <button
              type="button"
              onClick={() => onAdjustSeconds(60)}
              className="rounded-md px-2.5 py-1 font-mono text-xs font-medium text-slate-700 transition-colors hover:bg-white hover:text-slate-900 tabular-nums"
            >
              +1m
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500 whitespace-nowrap">
              Added Time
            </span>
            <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
              <button
                type="button"
                onClick={() =>
                  onSetAddedMinutes(Math.max(0, clock.addedMinutes - 1))
                }
                aria-label="Decrease added time"
                className="rounded-md p-1 text-slate-600 transition-colors hover:bg-white hover:text-slate-900"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="min-w-[2.25rem] text-center font-mono text-xs font-semibold tabular-nums text-slate-900">
                +{clock.addedMinutes}&apos;
              </span>
              <button
                type="button"
                onClick={() =>
                  onSetAddedMinutes(Math.min(30, clock.addedMinutes + 1))
                }
                aria-label="Increase added time"
                className="rounded-md p-1 text-slate-600 transition-colors hover:bg-white hover:text-slate-900"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={onRequestResetClock}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-700 whitespace-nowrap shrink-0"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset Clock
          </button>
        </div>
      </div>
    </section>
  );
};
