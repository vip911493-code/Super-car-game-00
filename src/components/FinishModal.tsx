import { Coins, Flag, Home, RotateCcw, Trophy } from 'lucide-react';
import { formatRaceTime } from '../game/format';
import { RaceSummary } from '../game/types';

interface FinishModalProps {
  summary: RaceSummary;
  onPlayAgain: () => void;
  onTitle: () => void;
}

export function FinishModal({ summary, onPlayAgain, onTitle }: FinishModalProps) {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-[#04070e]/75 pt-[max(0.75rem,env(safe-area-inset-top))] pr-[max(0.75rem,env(safe-area-inset-right))] pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))]">
      <div className="w-full max-w-md max-h-[calc(100dvh-1.5rem)] overflow-y-auto rounded-2xl bg-[#0a101d] border border-white/15 p-5 sm:p-7 shadow-2xl">
        <div className="flex items-center gap-3.5">
          <div
            className={`w-12 h-12 rounded-xl border flex items-center justify-center shrink-0 ${
              summary.didWin
                ? 'bg-amber-500/15 border-amber-400/40 text-amber-400'
                : 'bg-rose-500/15 border-rose-400/40 text-rose-400'
            }`}
          >
            {summary.didWin ? <Trophy className="w-6 h-6" /> : <Flag className="w-6 h-6" />}
          </div>
          <div>
            <p
              className={`text-[11px] font-bold tracking-[0.22em] uppercase ${
                summary.didWin ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {summary.didWin ? '1st Place Finish' : `Finished Pos ${summary.position} / 4`}
            </p>
            <h2 className="text-xl sm:text-2xl font-black italic tracking-wide text-white leading-tight">
              {summary.resultHeadline}
            </h2>
          </div>
        </div>

        {/* Coins Earned Banner */}
        <div className="mt-4 flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-amber-500/12 border border-amber-400/35">
          <div className="flex items-center gap-2.5">
            <Coins className="w-5 h-5 text-amber-400 shrink-0" />
            <div>
              <div className="text-[10px] font-bold tracking-wider uppercase text-amber-300">
                Coins Earned
              </div>
              <div className="text-[11px] text-slate-300">
                Race +{summary.racePrizeCoins} · Drift +{summary.driftBonusCoins}
              </div>
            </div>
          </div>
          <div className="text-xl font-black tabular-nums text-amber-300">
            +{summary.coinsEarned}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="p-3.5 rounded-xl bg-white/5 border border-white/10">
            <div className="text-[11px] font-bold tracking-wider uppercase text-slate-400">Race Time</div>
            <div className="mt-1 text-xl font-black tabular-nums text-white">
              {formatRaceTime(summary.totalTimeSec)}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-white/5 border border-white/10">
            <div className="text-[11px] font-bold tracking-wider uppercase text-slate-400">Best Lap</div>
            <div className="mt-1 text-xl font-black tabular-nums text-amber-400">
              {formatRaceTime(summary.bestLapSec)}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-white/5 border border-white/10">
            <div className="text-[11px] font-bold tracking-wider uppercase text-slate-400">Top Speed</div>
            <div className="mt-1 text-xl font-black tabular-nums text-white">
              {summary.topSpeedKmh} <span className="text-xs font-semibold text-slate-400">km/h</span>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-white/5 border border-white/10">
            <div className="text-[11px] font-bold tracking-wider uppercase text-slate-400">Drift Score</div>
            <div className="mt-1 text-xl font-black tabular-nums text-sky-300">
              {summary.driftScore.toLocaleString()}
            </div>
          </div>
        </div>

        {summary.lapTimesSec.length > 0 && (
          <div className="mt-4 rounded-xl bg-white/5 border border-white/10 px-4 py-3">
            <div className="text-[11px] font-bold tracking-wider uppercase text-slate-400 mb-2">
              Completed Laps
            </div>
            <div className="flex flex-col gap-1.5">
              {summary.lapTimesSec.map((lapSec, i) => {
                const isBest =
                  summary.bestLapSec !== null && Math.abs(lapSec - summary.bestLapSec) < 0.005;
                return (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-slate-300 font-semibold">Lap {i + 1}</span>
                    <span className={`font-bold tabular-nums ${isBest ? 'text-amber-400' : 'text-white'}`}>
                      {formatRaceTime(lapSec)}
                      {isBest && <span className="ml-2 text-[10px] uppercase tracking-wider">Best</span>}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-6 flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={onPlayAgain}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-rose-600 to-orange-500 hover:from-rose-500 hover:to-orange-400 text-white font-extrabold tracking-wider uppercase text-sm cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            Restart (R)
          </button>
          <button
            type="button"
            onClick={onTitle}
            className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-slate-200 font-bold tracking-wider uppercase text-sm cursor-pointer"
          >
            <Home className="w-4 h-4" />
            Garage
          </button>
        </div>
      </div>
    </div>
  );
}
