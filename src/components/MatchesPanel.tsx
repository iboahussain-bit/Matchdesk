import React, { useState } from 'react';
import {
  CheckCircle2,
  Plus,
  Trash2,
  Calendar,
  MapPin,
  Trophy,
  Cloud,
} from 'lucide-react';
import { MatchInfo, MatchRecord, TeamConfig } from '../types/match';
import { GoogleSignInButton } from './GoogleSignInButton';
import { formatClockMMSS, PERIOD_LABELS } from '../utils/matchHelpers';

interface MatchesPanelProps {
  isAuthenticated: boolean;
  isLoggingIn: boolean;
  userEmail: string | null;
  matches: MatchRecord[];
  activeMatchId: string | null;
  onLogin: () => void;
  onLogout: () => void;
  onSelectMatch: (matchId: string) => void;
  onCreateMatch: (
    info: MatchInfo,
    homeTeam: TeamConfig,
    awayTeam: TeamConfig
  ) => void;
  onRequestDeleteMatch: (match: MatchRecord) => void;
}

export const MatchesPanel: React.FC<MatchesPanelProps> = ({
  isAuthenticated,
  isLoggingIn,
  userEmail,
  matches,
  activeMatchId,
  onLogin,
  onLogout,
  onSelectMatch,
  onCreateMatch,
  onRequestDeleteMatch,
}) => {
  const today = new Date().toISOString().slice(0, 10);
  const [title, setTitle] = useState('Championship Final');
  const [competition, setCompetition] = useState('Premier Division');
  const [venue, setVenue] = useState('National Stadium');
  const [matchDate, setMatchDate] = useState(today);
  const [halfMinutes, setHalfMinutes] = useState(45);
  const [homeName, setHomeName] = useState('Rasmaadhoo FC');
  const [homeCode, setHomeCode] = useState('RAS');
  const [awayName, setAwayName] = useState('Island United');
  const [awayCode, setAwayCode] = useState('ISL');

  if (!isAuthenticated) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-8">
        <div className="mx-auto max-w-lg text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <Cloud className="h-6 w-6" />
          </div>
          <h2 className="mt-4 font-display text-xl font-bold text-slate-900">
            Sign in for Real-Time Cloud Match Sync
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Sign in with Google to save matches, lineups, live game clocks,
            scorers, and event timelines to your cloud database with instant
            real-time synchronization across sessions.
          </p>
          <div className="mt-6 flex justify-center">
            <GoogleSignInButton
              onClick={onLogin}
              disabled={isLoggingIn}
              label={isLoggingIn ? 'Signing in...' : 'Sign in with Google'}
            />
          </div>
        </div>
      </section>
    );
  }

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    onCreateMatch(
      {
        title: title.trim() || 'Match',
        competition: competition.trim(),
        venue: venue.trim(),
        matchDate,
        halfDurationMinutes: Math.max(1, Math.min(90, halfMinutes || 45)),
      },
      {
        name: homeName.trim() || 'Home Team',
        shortCode: (homeCode.trim() || 'HOM').toUpperCase().slice(0, 4),
        color: '#16A34A',
      },
      {
        name: awayName.trim() || 'Away Team',
        shortCode: (awayCode.trim() || 'AWY').toUpperCase().slice(0, 4),
        color: '#2563EB',
      }
    );
  };

  return (
    <div className="space-y-6">
      {/* Account Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-5 py-3.5">
        <div className="flex items-center gap-3 text-xs text-slate-600">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>
            Cloud sync active for{' '}
            <strong className="font-semibold text-slate-900">
              {userEmail || 'Authenticated User'}
            </strong>
          </span>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap"
        >
          Sign out
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Create New Match Form */}
        <section className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-5">
          <h3 className="font-display text-base font-semibold text-slate-900">
            Create New Match
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Start a fresh match record in your real-time database.
          </p>

          <form onSubmit={handleCreate} className="mt-4 space-y-3.5">
            <div>
              <label className="block text-xs font-medium text-slate-600">
                Match Title
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600">
                  Home Team
                </label>
                <input
                  type="text"
                  required
                  value={homeName}
                  onChange={(e) => setHomeName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600">
                  Home Code
                </label>
                <input
                  type="text"
                  required
                  maxLength={4}
                  value={homeCode}
                  onChange={(e) => setHomeCode(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm uppercase text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600">
                  Away Team
                </label>
                <input
                  type="text"
                  required
                  value={awayName}
                  onChange={(e) => setAwayName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600">
                  Away Code
                </label>
                <input
                  type="text"
                  required
                  maxLength={4}
                  value={awayCode}
                  onChange={(e) => setAwayCode(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm uppercase text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600">
                  Competition
                </label>
                <input
                  type="text"
                  value={competition}
                  onChange={(e) => setCompetition(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600">
                  Venue
                </label>
                <input
                  type="text"
                  value={venue}
                  onChange={(e) => setVenue(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600">
                  Match Date
                </label>
                <input
                  type="date"
                  required
                  value={matchDate}
                  onChange={(e) => setMatchDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm tabular-nums text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600">
                  Half Length (min)
                </label>
                <input
                  type="number"
                  min={1}
                  max={90}
                  value={halfMinutes}
                  onChange={(e) =>
                    setHalfMinutes(parseInt(e.target.value, 10) || 45)
                  }
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm tabular-nums text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              Create &amp; Open Match
            </button>
          </form>
        </section>

        {/* Saved Matches List */}
        <section className="rounded-xl border border-slate-200 bg-white lg:col-span-7">
          <div className="border-b border-slate-200 px-5 py-4">
            <h3 className="font-display text-base font-semibold text-slate-900">
              Saved Matches
            </h3>
            <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
              {matches.length} match{matches.length === 1 ? '' : 'es'} synced in
              real time
            </p>
          </div>

          {matches.length === 0 ? (
            <div className="px-6 py-12 text-center text-xs text-slate-500">
              No matches saved yet. Create your first match on the left to start
              syncing lineups, clock, and events in real time.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {matches.map((m) => {
                const isActive = m.id === activeMatchId;
                return (
                  <li
                    key={m.id}
                    className={`flex flex-wrap items-center justify-between gap-4 px-5 py-4 transition-colors ${
                      isActive ? 'bg-blue-50/40' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-display text-sm font-semibold text-slate-900">
                          {m.homeTeam.name} vs {m.awayTeam.name}
                        </span>
                        <span className="font-mono text-sm font-bold tabular-nums text-slate-900">
                          {m.homeScore} : {m.awayScore}
                        </span>
                        {isActive && (
                          <span className="text-xs font-semibold text-blue-700">
                            · Active
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                        <span className="inline-flex items-center gap-1">
                          <Trophy className="h-3 w-3" />
                          {m.info.title}
                        </span>
                        {m.info.venue && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {m.info.venue}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1 tabular-nums">
                          <Calendar className="h-3 w-3" />
                          {m.info.matchDate}
                        </span>
                        <span className="font-mono tabular-nums">
                          {PERIOD_LABELS[m.clock.period]} ·{' '}
                          {formatClockMMSS(m.clock.elapsedSeconds)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => onSelectMatch(m.id)}
                        className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                          isActive
                            ? 'bg-slate-900 text-white'
                            : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {isActive ? 'Open Console' : 'Switch Match'}
                      </button>
                      <button
                        type="button"
                        onClick={() => onRequestDeleteMatch(m)}
                        aria-label={`Delete ${m.info.title}`}
                        className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-400 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
};
