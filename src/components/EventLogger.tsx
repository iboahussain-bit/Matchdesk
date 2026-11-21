import React, { useState, useEffect } from 'react';
import { Trash2, Plus, Filter } from 'lucide-react';
import {
  ClockState,
  GoalType,
  MatchEvent,
  MatchEventType,
  MatchInfo,
  Player,
  PlayerStatus,
  TeamConfig,
  TeamSide,
} from '../types/match';
import {
  EVENT_TYPE_LABELS,
  formatClockMMSS,
  formatEventMinute,
  getMatchMinuteInfo,
  PERIOD_LABELS,
} from '../utils/matchHelpers';

interface EventLoggerProps {
  info: MatchInfo;
  homeTeam: TeamConfig;
  awayTeam: TeamConfig;
  players: Player[];
  events: MatchEvent[];
  clock: ClockState;
  preselectedTeam?: TeamSide | null;
  preselectedType?: MatchEventType | null;
  onAddEvent: (event: Omit<MatchEvent, 'id' | 'createdAt'>) => void;
  onDeleteEvent: (eventId: string) => void;
  compact?: boolean;
}

type EventFilter = 'ALL' | 'GOALS' | 'CARDS' | 'SUBS';

export const EventLogger: React.FC<EventLoggerProps> = ({
  info,
  homeTeam,
  awayTeam,
  players,
  events,
  clock,
  preselectedTeam,
  preselectedType,
  onAddEvent,
  onDeleteEvent,
  compact = false,
}) => {
  const minuteInfo = getMatchMinuteInfo(
    clock.elapsedSeconds,
    clock.period,
    info.halfDurationMinutes
  );

  const [eventType, setEventType] = useState<MatchEventType>(
    MatchEventType.GOAL
  );
  const [team, setTeam] = useState<TeamSide>(TeamSide.HOME);
  const [primaryPlayerId, setPrimaryPlayerId] = useState<string>('');
  const [customPlayerName, setCustomPlayerName] = useState<string>('');
  const [secondaryPlayerId, setSecondaryPlayerId] = useState<string>('');
  const [customSecondaryName, setCustomSecondaryName] = useState<string>('');
  const [goalType, setGoalType] = useState<GoalType>(GoalType.OPEN_PLAY);
  const [minuteOverride, setMinuteOverride] = useState<string>('');
  const [addedOverride, setAddedOverride] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [filter, setFilter] = useState<EventFilter>('ALL');

  useEffect(() => {
    if (preselectedTeam) {
      setTeam(preselectedTeam);
      setPrimaryPlayerId('');
      setSecondaryPlayerId('');
    }
    if (preselectedType) {
      setEventType(preselectedType);
    }
  }, [preselectedTeam, preselectedType]);

  const teamPlayers = players
    .filter((p) => p.team === team)
    .sort((a, b) => a.number - b.number);

  const onPitchPlayers = teamPlayers.filter(
    (p) => p.status === PlayerStatus.ON_PITCH
  );
  const benchPlayers = teamPlayers.filter(
    (p) => p.status === PlayerStatus.BENCH
  );

  const primaryOptions =
    eventType === MatchEventType.SUBSTITUTION
      ? onPitchPlayers.length > 0
        ? onPitchPlayers
        : teamPlayers
      : teamPlayers;

  const secondaryOptions =
    eventType === MatchEventType.SUBSTITUTION
      ? benchPlayers.length > 0
        ? benchPlayers
        : teamPlayers
      : teamPlayers.filter((p) => p.id !== primaryPlayerId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const parsedMin =
      minuteOverride.trim() !== ''
        ? Math.max(0, parseInt(minuteOverride, 10) || 0)
        : minuteInfo.minute;
    const parsedAdded =
      addedOverride.trim() !== ''
        ? Math.max(0, parseInt(addedOverride, 10) || 0)
        : minuteInfo.addedMinute;

    const primaryObj = teamPlayers.find((p) => p.id === primaryPlayerId);
    const secondaryObj = teamPlayers.find((p) => p.id === secondaryPlayerId);

    const resolvedPrimaryName = primaryObj
      ? `${primaryObj.number}. ${primaryObj.name}`
      : customPlayerName.trim() || undefined;

    const resolvedSecondaryName = secondaryObj
      ? `${secondaryObj.number}. ${secondaryObj.name}`
      : customSecondaryName.trim() || undefined;

    const isMatchWide =
      eventType === MatchEventType.KICKOFF ||
      eventType === MatchEventType.HALF_TIME ||
      eventType === MatchEventType.FULL_TIME ||
      eventType === MatchEventType.NOTE;

    onAddEvent({
      type: eventType,
      team: isMatchWide ? undefined : team,
      minute: parsedMin,
      addedMinute: parsedAdded && parsedAdded > 0 ? parsedAdded : undefined,
      clockDisplay: formatClockMMSS(clock.elapsedSeconds),
      period: clock.period,
      playerId: primaryObj?.id,
      playerName: primaryObj ? primaryObj.name : resolvedPrimaryName,
      secondaryPlayerId: secondaryObj?.id,
      secondaryPlayerName: secondaryObj
        ? secondaryObj.name
        : resolvedSecondaryName,
      goalType: eventType === MatchEventType.GOAL ? goalType : undefined,
      note: note.trim() || undefined,
    });

    setPrimaryPlayerId('');
    setCustomPlayerName('');
    setSecondaryPlayerId('');
    setCustomSecondaryName('');
    setMinuteOverride('');
    setAddedOverride('');
    setNote('');
  };

  const filteredEvents = events
    .filter((ev) => {
      if (filter === 'GOALS') return ev.type === MatchEventType.GOAL;
      if (filter === 'CARDS')
        return (
          ev.type === MatchEventType.YELLOW_CARD ||
          ev.type === MatchEventType.RED_CARD
        );
      if (filter === 'SUBS') return ev.type === MatchEventType.SUBSTITUTION;
      return true;
    })
    .slice()
    .sort((a, b) => {
      if (b.minute !== a.minute) return b.minute - a.minute;
      if ((b.addedMinute ?? 0) !== (a.addedMinute ?? 0)) {
        return (b.addedMinute ?? 0) - (a.addedMinute ?? 0);
      }
      return b.createdAt.localeCompare(a.createdAt);
    });

  const isTeamEvent =
    eventType === MatchEventType.GOAL ||
    eventType === MatchEventType.YELLOW_CARD ||
    eventType === MatchEventType.RED_CARD ||
    eventType === MatchEventType.SUBSTITUTION;

  return (
    <div className={`grid grid-cols-1 gap-6 ${compact ? 'lg:grid-cols-12' : ''}`}>
      {/* Event Entry Form */}
      <section
        aria-label="Log Match Event"
        className={`rounded-xl border border-slate-200 bg-white p-5 ${
          compact ? 'lg:col-span-5' : ''
        }`}
      >
        <div className="flex items-center justify-between border-b border-slate-200 pb-3.5">
          <div>
            <h3 className="font-display text-base font-semibold text-slate-900">
              Event Logger
            </h3>
            <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
              Captures current match clock ({minuteInfo.display}) automatically
            </p>
          </div>
          <span className="font-mono text-xs font-medium text-slate-500 tabular-nums">
            {formatClockMMSS(clock.elapsedSeconds)}
          </span>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* Event Type Selector */}
          <div>
            <label className="block text-xs font-medium text-slate-600">
              Event Type
            </label>
            <div className="mt-1.5 grid grid-cols-3 gap-1.5 sm:grid-cols-5">
              {(
                [
                  [MatchEventType.GOAL, 'Goal'],
                  [MatchEventType.YELLOW_CARD, 'Yellow'],
                  [MatchEventType.RED_CARD, 'Red'],
                  [MatchEventType.SUBSTITUTION, 'Sub'],
                  [MatchEventType.NOTE, 'Note'],
                ] as const
              ).map(([type, label]) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => {
                    setEventType(type);
                    setPrimaryPlayerId('');
                    setSecondaryPlayerId('');
                  }}
                  className={`rounded-lg border px-2.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                    eventType === type
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {isTeamEvent && (
            <>
              {/* Team Selector */}
              <div>
                <label className="block text-xs font-medium text-slate-600">
                  Team
                </label>
                <div className="mt-1.5 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setTeam(TeamSide.HOME);
                      setPrimaryPlayerId('');
                      setSecondaryPlayerId('');
                    }}
                    className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                      team === TeamSide.HOME
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-sm"
                      style={{ backgroundColor: homeTeam.color }}
                    />
                    <span className="truncate">{homeTeam.name}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTeam(TeamSide.AWAY);
                      setPrimaryPlayerId('');
                      setSecondaryPlayerId('');
                    }}
                    className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                      team === TeamSide.AWAY
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-sm"
                      style={{ backgroundColor: awayTeam.color }}
                    />
                    <span className="truncate">{awayTeam.name}</span>
                  </button>
                </div>
              </div>

              {/* Primary Player */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-600">
                    {eventType === MatchEventType.GOAL
                      ? 'Scorer'
                      : eventType === MatchEventType.SUBSTITUTION
                      ? 'Player Off'
                      : 'Player'}
                  </label>
                  {primaryOptions.length > 0 ? (
                    <select
                      value={primaryPlayerId}
                      onChange={(e) => setPrimaryPlayerId(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                    >
                      <option value="">
                        {eventType === MatchEventType.GOAL
                          ? 'Select scorer or enter below...'
                          : 'Select player...'}
                      </option>
                      {primaryOptions.map((p) => (
                        <option key={p.id} value={p.id}>
                          #{p.number} {p.name} ({p.position})
                        </option>
                      ))}
                    </select>
                  ) : null}
                  {!primaryPlayerId && (
                    <input
                      type="text"
                      value={customPlayerName}
                      onChange={(e) => setCustomPlayerName(e.target.value)}
                      placeholder={
                        primaryOptions.length > 0
                          ? 'Or type custom name'
                          : 'Type player name'
                      }
                      className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                    />
                  )}
                </div>

                {/* Secondary Player (Assist or Sub On) */}
                {(eventType === MatchEventType.GOAL ||
                  eventType === MatchEventType.SUBSTITUTION) && (
                  <div>
                    <label className="block text-xs font-medium text-slate-600">
                      {eventType === MatchEventType.GOAL
                        ? 'Assist (Optional)'
                        : 'Player On'}
                    </label>
                    {secondaryOptions.length > 0 ? (
                      <select
                        value={secondaryPlayerId}
                        onChange={(e) => setSecondaryPlayerId(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                      >
                        <option value="">
                          {eventType === MatchEventType.GOAL
                            ? 'No assist'
                            : 'Select substitute...'}
                        </option>
                        {secondaryOptions.map((p) => (
                          <option key={p.id} value={p.id}>
                            #{p.number} {p.name} ({p.position})
                          </option>
                        ))}
                      </select>
                    ) : null}
                    {!secondaryPlayerId && (
                      <input
                        type="text"
                        value={customSecondaryName}
                        onChange={(e) => setCustomSecondaryName(e.target.value)}
                        placeholder={
                          eventType === MatchEventType.GOAL
                            ? 'Or type assist name'
                            : 'Or type sub-in name'
                        }
                        className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                      />
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Goal Type + Minute Override */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {eventType === MatchEventType.GOAL && (
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-xs font-medium text-slate-600">
                  Goal Type
                </label>
                <select
                  value={goalType}
                  onChange={(e) => setGoalType(e.target.value as GoalType)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                >
                  {Object.values(GoalType).map((gt) => (
                    <option key={gt} value={gt}>
                      {gt}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-600">
                Minute
              </label>
              <input
                type="number"
                min={0}
                max={150}
                value={minuteOverride}
                onChange={(e) => setMinuteOverride(e.target.value)}
                placeholder={String(minuteInfo.minute)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm tabular-nums text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600">
                Added Min (+)
              </label>
              <input
                type="number"
                min={0}
                max={30}
                value={addedOverride}
                onChange={(e) => setAddedOverride(e.target.value)}
                placeholder={String(minuteInfo.addedMinute ?? 0)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm tabular-nums text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>
          </div>

          {/* Note Field */}
          {(eventType === MatchEventType.NOTE ||
            eventType === MatchEventType.YELLOW_CARD ||
            eventType === MatchEventType.RED_CARD) && (
            <div>
              <label className="block text-xs font-medium text-slate-600">
                {eventType === MatchEventType.NOTE
                  ? 'Event Note'
                  : 'Reason / Note (Optional)'}
              </label>
              <input
                type="text"
                required={eventType === MatchEventType.NOTE}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={
                  eventType === MatchEventType.NOTE
                    ? 'e.g. VAR review completed, drinks break...'
                    : 'e.g. Tactical foul, dissent...'
                }
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>
          )}

          <button
            type="submit"
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Record {EVENT_TYPE_LABELS[eventType]}
          </button>
        </form>
      </section>

      {/* Chronological Event Timeline */}
      <section
        aria-label="Match Event Feed"
        className={`rounded-xl border border-slate-200 bg-white ${
          compact ? 'lg:col-span-7' : ''
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3.5">
          <div>
            <h3 className="font-display text-base font-semibold text-slate-900">
              Match Event Timeline
            </h3>
            <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
              {events.length} logged event{events.length === 1 ? '' : 's'}
            </p>
          </div>

          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
            <Filter className="ml-1.5 mr-1 h-3.5 w-3.5 text-slate-400" />
            {(
              [
                ['ALL', 'All'],
                ['GOALS', 'Goals'],
                ['CARDS', 'Cards'],
                ['SUBS', 'Subs'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                  filter === key
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {filteredEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
            <p className="text-sm font-medium text-slate-700">
              No match events recorded yet
            </p>
            <p className="mt-1 max-w-sm text-xs text-slate-500">
              Start the game clock and log goals, cards, or substitutions to
              build the live match timeline and update scorers in real time.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                  <th className="px-4 py-2.5">Min</th>
                  <th className="px-4 py-2.5">Team</th>
                  <th className="px-4 py-2.5">Event</th>
                  <th className="px-4 py-2.5">Player / Details</th>
                  <th className="px-4 py-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredEvents.map((ev) => {
                  const teamCfg =
                    ev.team === TeamSide.HOME
                      ? homeTeam
                      : ev.team === TeamSide.AWAY
                      ? awayTeam
                      : null;

                  const typeTone =
                    ev.type === MatchEventType.GOAL
                      ? 'text-emerald-700 font-semibold'
                      : ev.type === MatchEventType.YELLOW_CARD
                      ? 'text-amber-700 font-semibold'
                      : ev.type === MatchEventType.RED_CARD
                      ? 'text-red-700 font-semibold'
                      : 'text-slate-700 font-medium';

                  return (
                    <tr
                      key={ev.id}
                      className="transition-colors hover:bg-slate-50"
                    >
                      <td className="px-4 py-2.5 font-mono text-xs font-semibold tabular-nums text-slate-900 whitespace-nowrap">
                        {formatEventMinute(ev)}
                        <span className="ml-1.5 font-normal text-slate-400">
                          {PERIOD_LABELS[ev.period]}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs font-medium text-slate-700 whitespace-nowrap">
                        {teamCfg ? (
                          <span className="inline-flex items-center gap-1.5">
                            <span
                              className="h-2.5 w-2.5 rounded-sm"
                              style={{ backgroundColor: teamCfg.color }}
                            />
                            {teamCfg.shortCode}
                          </span>
                        ) : (
                          <span className="text-slate-400">Match</span>
                        )}
                      </td>
                      <td className={`px-4 py-2.5 text-xs whitespace-nowrap ${typeTone}`}>
                        {EVENT_TYPE_LABELS[ev.type]}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-700">
                        {ev.type === MatchEventType.SUBSTITUTION ? (
                          <span>
                            <span className="text-red-600">Out:</span>{' '}
                            {ev.playerName || '—'} ·{' '}
                            <span className="text-emerald-700">In:</span>{' '}
                            {ev.secondaryPlayerName || '—'}
                          </span>
                        ) : (
                          <span>
                            <span className="font-medium text-slate-900">
                              {ev.playerName || ev.note || '—'}
                            </span>
                            {ev.secondaryPlayerName && (
                              <span className="text-slate-500">
                                {' '}
                                (Assist: {ev.secondaryPlayerName})
                              </span>
                            )}
                            {ev.goalType && ev.goalType !== GoalType.OPEN_PLAY && (
                              <span className="text-slate-500">
                                {' '}
                                · {ev.goalType}
                              </span>
                            )}
                            {ev.note && ev.playerName && (
                              <span className="text-slate-500"> · {ev.note}</span>
                            )}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => onDeleteEvent(ev.id)}
                          aria-label="Delete event"
                          className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
