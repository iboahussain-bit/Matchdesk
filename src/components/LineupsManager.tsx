import React, { useState } from 'react';
import {
  UserPlus,
  Trash2,
  Users,
  Upload,
  X,
} from 'lucide-react';
import {
  MatchEvent,
  Player,
  PlayerPosition,
  PlayerStatus,
  TeamConfig,
  TeamSide,
} from '../types/match';
import { computePlayerStats, parseBulkRoster } from '../utils/matchHelpers';

interface LineupsManagerProps {
  homeTeam: TeamConfig;
  awayTeam: TeamConfig;
  players: Player[];
  events: MatchEvent[];
  onAddPlayer: (player: Omit<Player, 'id'>) => void;
  onAddPlayersBulk: (players: Player[]) => void;
  onSetPlayerStatus: (playerId: string, status: PlayerStatus) => void;
  onRemovePlayer: (playerId: string) => void;
  onLoadSampleSquads: () => void;
}

export const LineupsManager: React.FC<LineupsManagerProps> = ({
  homeTeam,
  awayTeam,
  players,
  events,
  onAddPlayer,
  onAddPlayersBulk,
  onSetPlayerStatus,
  onRemovePlayer,
  onLoadSampleSquads,
}) => {
  const [bulkTeam, setBulkTeam] = useState<TeamSide | null>(null);
  const [bulkIsStarter, setBulkIsStarter] = useState(true);
  const [bulkText, setBulkText] = useState('');

  const handleBulkImport = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkTeam || !bulkText.trim()) return;
    const parsed = parseBulkRoster(bulkText, bulkTeam, bulkIsStarter);
    if (parsed.length > 0) {
      onAddPlayersBulk(parsed);
    }
    setBulkText('');
    setBulkTeam(null);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-5 py-4">
        <div>
          <h2 className="font-display text-lg font-semibold text-slate-900">
            Team Lineups &amp; Squad Roster
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Manage starters, substitutes, and live pitch status. Lineup changes
            sync across sessions in real time.
          </p>
        </div>

        {players.length === 0 && (
          <button
            type="button"
            onClick={onLoadSampleSquads}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 whitespace-nowrap shrink-0"
          >
            <Users className="h-3.5 w-3.5" />
            Load Sample Squads
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <TeamRosterColumn
          side={TeamSide.HOME}
          team={homeTeam}
          players={players.filter((p) => p.team === TeamSide.HOME)}
          events={events}
          onAddPlayer={onAddPlayer}
          onSetPlayerStatus={onSetPlayerStatus}
          onRemovePlayer={onRemovePlayer}
          onOpenBulk={() => setBulkTeam(TeamSide.HOME)}
        />
        <TeamRosterColumn
          side={TeamSide.AWAY}
          team={awayTeam}
          players={players.filter((p) => p.team === TeamSide.AWAY)}
          events={events}
          onAddPlayer={onAddPlayer}
          onSetPlayerStatus={onSetPlayerStatus}
          onRemovePlayer={onRemovePlayer}
          onOpenBulk={() => setBulkTeam(TeamSide.AWAY)}
        />
      </div>

      {/* Bulk Roster Paste Modal */}
      {bulkTeam && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-[1px]"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleBulkImport}
            className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3.5">
              <h3 className="font-display text-base font-semibold text-slate-900">
                Bulk Import{' '}
                {bulkTeam === TeamSide.HOME ? homeTeam.name : awayTeam.name}{' '}
                Players
              </h3>
              <button
                type="button"
                onClick={() => setBulkTeam(null)}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <p className="text-xs text-slate-600">
                Paste one player per line in format{' '}
                <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-slate-800">
                  Number Name Position
                </code>{' '}
                (e.g. <code className="font-mono">10 Ashfaq Ali FWD</code>).
              </p>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setBulkIsStarter(true)}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                    bulkIsStarter
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Add as Starters
                </button>
                <button
                  type="button"
                  onClick={() => setBulkIsStarter(false)}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                    !bulkIsStarter
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Add as Substitutes
                </button>
              </div>

              <textarea
                rows={7}
                required
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                placeholder={'1 Ahmed Nizam GK\n4 Ali Fasir DEF\n10 Hamza Mohamed MID\n9 Naiz Hassan FWD'}
                className="w-full rounded-lg border border-slate-200 p-3 font-mono text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setBulkTeam(null)}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Import Players
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

interface TeamRosterColumnProps {
  side: TeamSide;
  team: TeamConfig;
  players: Player[];
  events: MatchEvent[];
  onAddPlayer: (player: Omit<Player, 'id'>) => void;
  onSetPlayerStatus: (playerId: string, status: PlayerStatus) => void;
  onRemovePlayer: (playerId: string) => void;
  onOpenBulk: () => void;
}

const TeamRosterColumn: React.FC<TeamRosterColumnProps> = ({
  side,
  team,
  players,
  events,
  onAddPlayer,
  onSetPlayerStatus,
  onRemovePlayer,
  onOpenBulk,
}) => {
  const [number, setNumber] = useState('');
  const [name, setName] = useState('');
  const [position, setPosition] = useState<PlayerPosition>(PlayerPosition.MID);
  const [isStarter, setIsStarter] = useState(true);

  const sorted = players.slice().sort((a, b) => {
    if (a.isStarter !== b.isStarter) return a.isStarter ? -1 : 1;
    return a.number - b.number;
  });

  const startersCount = players.filter((p) => p.isStarter).length;
  const benchCount = players.filter((p) => !p.isStarter).length;

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onAddPlayer({
      team: side,
      number: parseInt(number, 10) || players.length + 1,
      name: name.trim(),
      position,
      isStarter,
      status: isStarter ? PlayerStatus.ON_PITCH : PlayerStatus.BENCH,
    });
    setNumber('');
    setName('');
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span
            className="h-3.5 w-3.5 rounded-sm"
            style={{ backgroundColor: team.color }}
          />
          <h3 className="font-display text-base font-semibold text-slate-900">
            {team.name}
          </h3>
          <span className="text-xs text-slate-500 tabular-nums">
            {startersCount} Starters · {benchCount} Bench
          </span>
        </div>
        <button
          type="button"
          onClick={onOpenBulk}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
        >
          <Upload className="h-3.5 w-3.5" />
          Bulk Import
        </button>
      </div>

      {/* Add Player Form */}
      <form
        onSubmit={handleAdd}
        className="grid grid-cols-12 gap-2 border-b border-slate-200 bg-slate-50 px-5 py-3"
      >
        <input
          type="number"
          min={1}
          max={99}
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          placeholder="#"
          aria-label="Jersey number"
          className="col-span-2 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs tabular-nums text-slate-900 focus:border-blue-600 focus:outline-none"
        />
        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Player full name"
          aria-label="Player name"
          className="col-span-4 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
        />
        <select
          value={position}
          onChange={(e) => setPosition(e.target.value as PlayerPosition)}
          aria-label="Position"
          className="col-span-2 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
        >
          {Object.values(PlayerPosition).map((pos) => (
            <option key={pos} value={pos}>
              {pos}
            </option>
          ))}
        </select>
        <select
          value={isStarter ? 'STARTER' : 'BENCH'}
          onChange={(e) => setIsStarter(e.target.value === 'STARTER')}
          aria-label="Role"
          className="col-span-2 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
        >
          <option value="STARTER">Starter</option>
          <option value="BENCH">Bench</option>
        </select>
        <button
          type="submit"
          className="col-span-2 inline-flex items-center justify-center gap-1 rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-slate-800 whitespace-nowrap"
        >
          <UserPlus className="h-3.5 w-3.5" />
          Add
        </button>
      </form>

      {/* Roster Table */}
      {sorted.length === 0 ? (
        <div className="px-5 py-10 text-center text-xs text-slate-500">
          No players added for {team.name} yet. Add players above or use Bulk
          Import.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 font-medium text-slate-500">
                <th className="px-4 py-2">#</th>
                <th className="px-4 py-2">Player</th>
                <th className="px-4 py-2">Pos</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2 text-right">G / A / YC</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sorted.map((p) => {
                const stats = computePlayerStats(p.id, p.name, p.team, events);

                return (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-mono font-semibold tabular-nums text-slate-900">
                      {p.number}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-slate-900">
                      {p.name}
                      <span className="ml-1.5 font-normal text-slate-400">
                        {p.isStarter ? 'Starter' : 'Sub'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-slate-600">
                      {p.position}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      <div
                        className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-0.5"
                        role="group"
                        aria-label={`Status for ${p.name}`}
                      >
                        {(
                          [
                            {
                              status: PlayerStatus.ON_PITCH,
                              label: 'Pitch',
                              activeClass:
                                'bg-emerald-600 text-white font-semibold',
                            },
                            {
                              status: PlayerStatus.BENCH,
                              label: 'Bench',
                              activeClass:
                                'bg-slate-700 text-white font-semibold',
                            },
                            {
                              status: PlayerStatus.SUBBED_OFF,
                              label: 'Off',
                              activeClass:
                                'bg-amber-600 text-white font-semibold',
                            },
                          ] as const
                        ).map((opt) => {
                          const isActive = p.status === opt.status;
                          return (
                            <button
                              key={opt.status}
                              type="button"
                              onClick={() =>
                                onSetPlayerStatus(p.id, opt.status)
                              }
                              className={`rounded px-1.5 py-0.5 text-[11px] transition-colors ${
                                isActive
                                  ? opt.activeClass
                                  : 'text-slate-500 hover:text-slate-900'
                              }`}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-700">
                      {stats.goals} / {stats.assists} / {stats.yellowCards}
                      {stats.redCards > 0 ? ` (${stats.redCards}R)` : ''}
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => onRemovePlayer(p.id)}
                        title="Remove player"
                        className="rounded p-1 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
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
  );
};
