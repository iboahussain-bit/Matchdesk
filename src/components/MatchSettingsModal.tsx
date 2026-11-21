import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { MatchInfo, TeamConfig } from '../types/match';

interface MatchSettingsModalProps {
  isOpen: boolean;
  info: MatchInfo;
  homeTeam: TeamConfig;
  awayTeam: TeamConfig;
  onSave: (info: MatchInfo, home: TeamConfig, away: TeamConfig) => void;
  onClose: () => void;
}

const PRESET_COLORS = [
  '#16A34A',
  '#2563EB',
  '#DC2626',
  '#D97706',
  '#0F172A',
  '#7C3AED',
  '#0891B2',
  '#EA580C',
];

export const MatchSettingsModal: React.FC<MatchSettingsModalProps> = ({
  isOpen,
  info,
  homeTeam,
  awayTeam,
  onSave,
  onClose,
}) => {
  const [draftInfo, setDraftInfo] = useState<MatchInfo>(info);
  const [draftHome, setDraftHome] = useState<TeamConfig>(homeTeam);
  const [draftAway, setDraftAway] = useState<TeamConfig>(awayTeam);

  useEffect(() => {
    if (isOpen) {
      setDraftInfo(info);
      setDraftHome(homeTeam);
      setDraftAway(awayTeam);
    }
  }, [isOpen, info, homeTeam, awayTeam]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(
      {
        ...draftInfo,
        halfDurationMinutes: Math.max(1, Math.min(90, draftInfo.halfDurationMinutes || 45)),
      },
      {
        ...draftHome,
        shortCode: draftHome.shortCode.toUpperCase().slice(0, 4) || 'HOM',
      },
      {
        ...draftAway,
        shortCode: draftAway.shortCode.toUpperCase().slice(0, 4) || 'AWY',
      }
    );
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="match-settings-title"
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white p-6 shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <h3
            id="match-settings-title"
            className="font-display text-lg font-semibold text-slate-900"
          >
            Match & Team Configuration
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-slate-600">
              Match Title
            </label>
            <input
              type="text"
              required
              value={draftInfo.title}
              onChange={(e) =>
                setDraftInfo({ ...draftInfo, title: e.target.value })
              }
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">
              Competition / League
            </label>
            <input
              type="text"
              value={draftInfo.competition}
              onChange={(e) =>
                setDraftInfo({ ...draftInfo, competition: e.target.value })
              }
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">
              Venue / Stadium
            </label>
            <input
              type="text"
              value={draftInfo.venue}
              onChange={(e) =>
                setDraftInfo({ ...draftInfo, venue: e.target.value })
              }
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600">
                Match Date
              </label>
              <input
                type="date"
                value={draftInfo.matchDate}
                onChange={(e) =>
                  setDraftInfo({ ...draftInfo, matchDate: e.target.value })
                }
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 tabular-nums focus:border-blue-600 focus:outline-none"
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
                value={draftInfo.halfDurationMinutes}
                onChange={(e) =>
                  setDraftInfo({
                    ...draftInfo,
                    halfDurationMinutes: parseInt(e.target.value, 10) || 45,
                  })
                }
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 tabular-nums focus:border-blue-600 focus:outline-none"
              />
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-5 border-t border-slate-200 pt-5 sm:grid-cols-2">
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-slate-900">Home Team</h4>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-600">
                  Team Name
                </label>
                <input
                  type="text"
                  required
                  value={draftHome.name}
                  onChange={(e) =>
                    setDraftHome({ ...draftHome, name: e.target.value })
                  }
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600">
                  Code
                </label>
                <input
                  type="text"
                  maxLength={4}
                  required
                  value={draftHome.shortCode}
                  onChange={(e) =>
                    setDraftHome({ ...draftHome, shortCode: e.target.value })
                  }
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm uppercase text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600">
                Kit Color
              </label>
              <div className="mt-1.5 flex items-center gap-2">
                {PRESET_COLORS.map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    onClick={() => setDraftHome({ ...draftHome, color: hex })}
                    aria-label={`Select color ${hex}`}
                    className={`h-6 w-6 rounded-md transition-transform ${
                      draftHome.color === hex
                        ? 'ring-2 ring-slate-900 ring-offset-2 scale-105'
                        : 'hover:scale-105'
                    }`}
                    style={{ backgroundColor: hex }}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-slate-900">Away Team</h4>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-600">
                  Team Name
                </label>
                <input
                  type="text"
                  required
                  value={draftAway.name}
                  onChange={(e) =>
                    setDraftAway({ ...draftAway, name: e.target.value })
                  }
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600">
                  Code
                </label>
                <input
                  type="text"
                  maxLength={4}
                  required
                  value={draftAway.shortCode}
                  onChange={(e) =>
                    setDraftAway({ ...draftAway, shortCode: e.target.value })
                  }
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm uppercase text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600">
                Kit Color
              </label>
              <div className="mt-1.5 flex items-center gap-2">
                {PRESET_COLORS.map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    onClick={() => setDraftAway({ ...draftAway, color: hex })}
                    aria-label={`Select color ${hex}`}
                    className={`h-6 w-6 rounded-md transition-transform ${
                      draftAway.color === hex
                        ? 'ring-2 ring-slate-900 ring-offset-2 scale-105'
                        : 'hover:scale-105'
                    }`}
                    style={{ backgroundColor: hex }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-200 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 whitespace-nowrap shrink-0"
          >
            Save Settings
          </button>
        </div>
      </form>
    </div>
  );
};
