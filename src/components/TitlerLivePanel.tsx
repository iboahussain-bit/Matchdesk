import React, { useState, useEffect, useCallback } from 'react';
import {
  Check,
  Copy,
  RefreshCw,
  Radio,
  RotateCcw,
  ExternalLink,
  Download,
} from 'lucide-react';
import { TitlerFeedConfig } from '../services/titlerBridge';

interface TitlerLivePanelProps {
  config: TitlerFeedConfig;
  lastPublishedAt: string | null;
  lastVersion: number | null;
  lastLatencyMs: number | null;
  publishError: string | null;
  isPublishing: boolean;
  onToggleEnabled: () => void;
  onPushNow: () => void;
  onRegenerateFeed: () => void;
}

interface EndpointDef {
  id: string;
  label: string;
  category: 'EVENT' | 'LINEUPS' | 'SCOREBOARD';
  format: 'JSON' | 'XML' | 'CSV' | 'SSE';
  path: string;
  description: string;
}

export const TitlerLivePanel: React.FC<TitlerLivePanelProps> = ({
  config,
  lastPublishedAt,
  lastVersion,
  lastLatencyMs,
  publishError,
  isPublishing,
  onToggleEnabled,
  onPushNow,
  onRegenerateFeed,
}) => {
  const origin =
    typeof window !== 'undefined' ? window.location.origin : '';
  const base = `${origin}/api/titler/${config.feedId}`;

  const endpoints: EndpointDef[] = [
    {
      id: 'latest-event-json',
      label: 'Instant Event Alert (Lower Third)',
      category: 'EVENT',
      format: 'JSON',
      path: `${base}/latest-event.json`,
      description:
        'Single-object event trigger with FeedVersion, EventType, Headline, Subheadline, PlayerName, PlayerNumber, Minute, and ScoreLine.',
    },
    {
      id: 'events-json',
      label: 'Full Match Event Feed',
      category: 'EVENT',
      format: 'JSON',
      path: `${base}/events.json`,
      description:
        'Chronological array (newest first) of all goals, yellow/red cards, substitutions, and match notes.',
    },
    {
      id: 'events-csv',
      label: 'Events Table',
      category: 'EVENT',
      format: 'CSV',
      path: `${base}/events.csv`,
      description: 'CSV table of match events for Titler Live Spreadsheet/CSV inputs.',
    },
    {
      id: 'lineups-flat-json',
      label: 'Lineups Slot-Mapped (1–11 Starters & Bench)',
      category: 'LINEUPS',
      format: 'JSON',
      path: `${base}/lineups-flat.json`,
      description:
        'Flat fields HomeStarter1Number..11, HomeStarter1Name..11, AwayStarter1Number..11, plus HomeBench1..9 and AwayBench1..9.',
    },
    {
      id: 'lineups-home-pitch',
      label: 'Home On-Pitch Lineup Array',
      category: 'LINEUPS',
      format: 'JSON',
      path: `${base}/lineups.json?team=HOME&status=ON_PITCH`,
      description: 'Active Home players currently on the pitch.',
    },
    {
      id: 'lineups-away-pitch',
      label: 'Away On-Pitch Lineup Array',
      category: 'LINEUPS',
      format: 'JSON',
      path: `${base}/lineups.json?team=AWAY&status=ON_PITCH`,
      description: 'Active Away players currently on the pitch.',
    },
    {
      id: 'lineups-json',
      label: 'Full Squad Lineups Array',
      category: 'LINEUPS',
      format: 'JSON',
      path: `${base}/lineups.json`,
      description:
        'All Home and Away players with number, position, status, goals, assists, and cards.',
    },
    {
      id: 'lineups-csv',
      label: 'Lineups Table',
      category: 'LINEUPS',
      format: 'CSV',
      path: `${base}/lineups.csv`,
      description: 'CSV table of all Home and Away players and live stats.',
    },
    {
      id: 'scoreboard-json',
      label: 'Scoreboard & Live Clock',
      category: 'SCOREBOARD',
      format: 'JSON',
      path: `${base}/scoreboard.json`,
      description:
        'Live ticking Clock, MatchMinute, Period, Scores, HomeScorers, AwayScorers, and LatestEventText.',
    },
    {
      id: 'scorers-json',
      label: 'Goal Scorers & Minutes',
      category: 'SCOREBOARD',
      format: 'JSON',
      path: `${base}/scorers.json`,
      description: 'Array of goal scorers, assists, time of scoring, and running score.',
    },
    {
      id: 'scoreboard-xml',
      label: 'Complete Match XML',
      category: 'SCOREBOARD',
      format: 'XML',
      path: `${base}/scoreboard.xml`,
      description:
        'Combined XML document with scoreboard, latestEvent, homeLineup, awayLineup, scorers, and events.',
    },
    {
      id: 'stream-sse',
      label: 'Zero-Latency Event Stream (SSE)',
      category: 'EVENT',
      format: 'SSE',
      path: `${base}/stream`,
      description:
        'Real-time Server-Sent Events stream pushing every event and lineup update immediately.',
    },
  ];

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<
    'ALL' | 'EVENT' | 'LINEUPS' | 'SCOREBOARD'
  >('ALL');
  const [selectedPreviewId, setSelectedPreviewId] = useState<string>(
    'latest-event-json'
  );
  const [previewContent, setPreviewContent] = useState<string>('');
  const [isLoadingPreview, setIsLoadingPreview] = useState<boolean>(false);

  const selectedEndpoint =
    endpoints.find((e) => e.id === selectedPreviewId) ?? endpoints[0];

  const fetchPreview = useCallback(async () => {
    if (selectedEndpoint.format === 'SSE') {
      setPreviewContent(
        `SSE Stream Endpoint:\n${selectedEndpoint.path}\n\nConnect via the downloadable local bridge script or any EventSource client to receive instant "matchUpdate" frames whenever an event or lineup change occurs.`
      );
      return;
    }

    setIsLoadingPreview(true);
    try {
      const res = await fetch(selectedEndpoint.path, { cache: 'no-store' });
      const text = await res.text();
      if (selectedEndpoint.format === 'JSON') {
        try {
          setPreviewContent(JSON.stringify(JSON.parse(text), null, 2));
        } catch {
          setPreviewContent(text);
        }
      } else {
        setPreviewContent(text);
      }
    } catch (err) {
      setPreviewContent(
        err instanceof Error ? err.message : 'Unable to load endpoint preview.'
      );
    } finally {
      setIsLoadingPreview(false);
    }
  }, [selectedEndpoint.path, selectedEndpoint.format]);

  useEffect(() => {
    void fetchPreview();
  }, [fetchPreview, lastPublishedAt, lastVersion]);

  const handleCopy = async (id: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedId(id);
      window.setTimeout(() => {
        setCopiedId((prev) => (prev === id ? null : prev));
      }, 1500);
    } catch {
      // ignore clipboard denial
    }
  };

  const visibleEndpoints =
    categoryFilter === 'ALL'
      ? endpoints
      : endpoints.filter((e) => e.category === categoryFilter);

  return (
    <div className="space-y-6">
      {/* Feed Status Header */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div
              className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                config.enabled
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-slate-100 text-slate-500'
              }`}
            >
              <Radio className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-lg font-semibold text-slate-900">
                NewBlue Titler Live Instant Output
              </h2>
              <p className="mt-0.5 text-xs text-slate-600">
                Every event update and lineup change publishes immediately to
                Titler Live HTTP endpoints and the real-time SSE stream with
                zero debounce delay.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                <span>
                  Status:{' '}
                  <strong
                    className={
                      config.enabled ? 'text-emerald-700' : 'text-amber-700'
                    }
                  >
                    {config.enabled ? 'Instant Output Active' : 'Paused'}
                  </strong>
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono">Feed: {config.feedId}</span>
                {lastVersion !== null && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">
                      Version: v{lastVersion}
                    </span>
                  </>
                )}
                {lastLatencyMs !== null && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">
                      Push: {lastLatencyMs}ms
                    </span>
                  </>
                )}
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">
                  Last Push:{' '}
                  {lastPublishedAt
                    ? new Date(lastPublishedAt).toLocaleTimeString()
                    : 'Pending'}
                </span>
              </div>
              {publishError && (
                <p className="mt-2 text-xs font-medium text-red-600">
                  {publishError}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <a
              href={`${base}/bridge.mjs`}
              download="matchdesk-titler-bridge.mjs"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50 whitespace-nowrap"
            >
              <Download className="h-3.5 w-3.5" />
              Download Local Bridge
            </a>
            <button
              type="button"
              onClick={onToggleEnabled}
              className={`rounded-lg border px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                config.enabled
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {config.enabled ? 'Pause Instant Output' : 'Resume Instant Output'}
            </button>
            <button
              type="button"
              onClick={onPushNow}
              disabled={isPublishing}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-60 whitespace-nowrap"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${isPublishing ? 'animate-spin' : ''}`}
              />
              Push Now
            </button>
            <button
              type="button"
              onClick={onRegenerateFeed}
              title="Generate a new private feed URL"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 whitespace-nowrap"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              New Feed ID
            </button>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Copyable Titler Live Feed URLs */}
        <section className="rounded-xl border border-slate-200 bg-white lg:col-span-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3.5">
            <div>
              <h3 className="font-display text-sm font-semibold text-slate-900">
                Event &amp; Lineup Endpoints
              </h3>
              <p className="mt-0.5 text-xs text-slate-500">
                Use 0.25s–0.5s HTTP polling in Titler Live or run the local
                SSE bridge for 0ms file watch triggers.
              </p>
            </div>

            <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
              {(
                [
                  ['ALL', 'All'],
                  ['EVENT', 'Events'],
                  ['LINEUPS', 'Lineups'],
                  ['SCOREBOARD', 'Clock'],
                ] as const
              ).map(([cat, label]) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategoryFilter(cat)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                    categoryFilter === cat
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <ul className="divide-y divide-slate-100">
            {visibleEndpoints.map((ep) => {
              const isSelected = ep.id === selectedPreviewId;
              const isCopied = copiedId === ep.id;
              return (
                <li
                  key={ep.id}
                  className={`px-5 py-3.5 transition-colors ${
                    isSelected ? 'bg-blue-50/40' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-slate-700">
                        {ep.format}
                      </span>
                      <span className="text-xs font-semibold text-slate-900">
                        {ep.label}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setSelectedPreviewId(ep.id)}
                        className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                          isSelected
                            ? 'bg-slate-900 text-white'
                            : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        Preview
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleCopy(ep.id, ep.path)}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100"
                      >
                        {isCopied ? (
                          <>
                            <Check className="h-3 w-3 text-emerald-600" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3" />
                            Copy URL
                          </>
                        )}
                      </button>
                      {ep.format !== 'SSE' && (
                        <a
                          href={ep.path}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Open feed in new tab"
                          className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{ep.description}</p>
                  <div className="mt-1.5 truncate rounded border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono text-[11px] text-slate-700">
                    {ep.path}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Live Payload Preview & Instant Setup Guide */}
        <div className="space-y-6 lg:col-span-6">
          <section className="rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <div>
                <h3 className="font-display text-sm font-semibold text-slate-900">
                  Live Output ({selectedEndpoint.label})
                </h3>
                <p className="mt-0.5 font-mono text-[11px] text-slate-500">
                  {selectedEndpoint.format} · Updates immediately on event or
                  lineup change
                </p>
              </div>
              <button
                type="button"
                onClick={() => void fetchPreview()}
                disabled={isLoadingPreview}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <RefreshCw
                  className={`h-3 w-3 ${isLoadingPreview ? 'animate-spin' : ''}`}
                />
                Refresh
              </button>
            </div>
            <pre className="max-h-[420px] overflow-auto bg-slate-950 p-4 font-mono text-xs leading-relaxed text-emerald-300">
              {previewContent || 'Loading payload...'}
            </pre>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="font-display text-sm font-semibold text-slate-900">
              Instant Event &amp; Lineup Output Setup
            </h3>
            <ol className="mt-3 list-decimal space-y-2 pl-4 text-xs leading-relaxed text-slate-600">
              <li>
                <strong>Option A — Direct URL Polling (Fastest Setup):</strong>{' '}
                Add a <strong>Web Data / JSON</strong> input in Titler Live for{' '}
                <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-slate-800">
                  latest-event.json
                </code>{' '}
                (for goal/card/sub alerts) and{' '}
                <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-slate-800">
                  lineups-flat.json
                </code>{' '}
                or{' '}
                <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-slate-800">
                  lineups.json
                </code>{' '}
                (for Starting XI / live pitch rosters), set refresh to{' '}
                <strong>0.25s – 0.5s</strong>.
              </li>
              <li>
                <strong>Option B — Zero-Delay Local File Bridge:</strong> Click{' '}
                <strong>Download Local Bridge</strong> above and run{' '}
                <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-slate-800">
                  node matchdesk-titler-bridge.mjs
                </code>{' '}
                on your Titler Live PC. It connects to the live SSE stream and
                writes{' '}
                <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-slate-800">
                  titler-live-data/*.json
                </code>{' '}
                and{' '}
                <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-slate-800">
                  *.csv
                </code>{' '}
                locally the millisecond an event or lineup changes.
              </li>
              <li>
                <strong>Auto-Trigger Graphics on Event Update:</strong> Bind
                Titler Live&apos;s data-change animation trigger to{' '}
                <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-slate-800">
                  EventId
                </code>{' '}
                or{' '}
                <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-slate-800">
                  FeedVersion
                </code>{' '}
                so your lower-third graphic animates in automatically whenever a
                goal, card, or substitution is logged.
              </li>
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
};
