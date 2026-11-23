import { Compass, MapPin, Navigation, Route, X } from 'lucide-react';
import { useMemo, useRef } from 'react';
import { ROAD_CONFIG } from '../game/roadConfig';
import { HudSnapshot, MinimapPoint, MinimapWorldData, RoadType } from '../game/types';

interface FullMapModalProps {
  hud: HudSnapshot;
  minimapWorld: MinimapWorldData;
  waypoint: MinimapPoint | null;
  onSetWaypoint: (pt: MinimapPoint | null) => void;
  onClose: () => void;
}

function pointsToPath(pts: MinimapPoint[], closed = false): string {
  if (pts.length === 0) return '';
  const body = pts
    .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');
  return closed ? `${body} Z` : body;
}

const ROAD_STYLE: Record<RoadType, { stroke: string; width: number; dash?: string }> = {
  highway: {
    stroke: ROAD_CONFIG.highway.minimapStroke,
    width: ROAD_CONFIG.highway.minimapWidth,
    dash: ROAD_CONFIG.highway.minimapDash,
  },
  main: {
    stroke: ROAD_CONFIG.main.minimapStroke,
    width: ROAD_CONFIG.main.minimapWidth,
    dash: ROAD_CONFIG.main.minimapDash,
  },
  coastal: {
    stroke: ROAD_CONFIG.coastal.minimapStroke,
    width: ROAD_CONFIG.coastal.minimapWidth,
    dash: ROAD_CONFIG.coastal.minimapDash,
  },
  mountain: {
    stroke: ROAD_CONFIG.mountain.minimapStroke,
    width: ROAD_CONFIG.mountain.minimapWidth,
    dash: ROAD_CONFIG.mountain.minimapDash,
  },
  city: {
    stroke: ROAD_CONFIG.city.minimapStroke,
    width: ROAD_CONFIG.city.minimapWidth,
    dash: ROAD_CONFIG.city.minimapDash,
  },
  dirt: {
    stroke: ROAD_CONFIG.dirt.minimapStroke,
    width: ROAD_CONFIG.dirt.minimapWidth,
    dash: ROAD_CONFIG.dirt.minimapDash,
  },
};

const SKIP_LABEL_PATTERNS = /Connector|Exit|Ramp/i;

export function FullMapModal({
  hud,
  minimapWorld,
  waypoint,
  onSetWaypoint,
  onClose,
}: FullMapModalProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);

  const fullPath = pointsToPath(minimapWorld.fullPoints, true);
  const tunnelPath = pointsToPath(minimapWorld.tunnelPoints, false);
  const bridgePath = pointsToPath(minimapWorld.bridgePoints, false);
  const railPath = minimapWorld.railPoints ? pointsToPath(minimapWorld.railPoints, false) : '';
  const gpsPath = pointsToPath(hud.gpsRoutePoints, false);
  const startPt = minimapWorld.fullPoints[0];

  const networkPaths = useMemo(
    () =>
      minimapWorld.networkEdges.map((edge) => ({
        edge,
        d: pointsToPath(edge.points, false),
        style: ROAD_STYLE[edge.type],
      })),
    [minimapWorld.networkEdges],
  );

  // Deduplicated road name labels placed cleanly near road midpoints
  const roadLabels = useMemo(() => {
    const seen = new Set<string>();
    const out: Array<{ name: string; x: number; y: number; color: string }> = [];
    for (const edge of minimapWorld.networkEdges) {
      if (!edge.name || seen.has(edge.name) || SKIP_LABEL_PATTERNS.test(edge.name)) continue;
      if (edge.points.length < 3) continue;
      seen.add(edge.name);
      const mid = edge.points[Math.floor(edge.points.length / 2)];
      out.push({
        name: edge.name,
        x: mid.x,
        y: mid.y,
        color: ROAD_STYLE[edge.type].stroke,
      });
    }
    return out;
  }, [minimapWorld.networkEdges]);

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const x = Math.max(4, Math.min(96, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(4, Math.min(96, ((e.clientY - rect.top) / rect.height) * 100));
    onSetWaypoint({ x, y });
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#04070e]/85 pt-[max(0.75rem,env(safe-area-inset-top))] pr-[max(0.75rem,env(safe-area-inset-right))] pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] sm:p-6 pointer-events-auto">
      <div className="w-full max-w-3xl max-h-[calc(100dvh-1.5rem)] overflow-y-auto rounded-2xl bg-[#090f1c] border border-white/15 shadow-2xl p-4 sm:p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Compass className="w-5 h-5 text-cyan-400 shrink-0" />
            <div>
              <h2 className="text-base sm:text-lg font-black italic tracking-wider text-white uppercase">
                Open World GPS Map
              </h2>
              <p className="text-[11px] text-slate-400">
                Tap any road, intersection, or district pin to compute a shortest-path GPS route
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {waypoint && (
              <button
                type="button"
                onClick={() => onSetWaypoint(null)}
                className="px-3 py-1.5 rounded-lg bg-amber-500/15 border border-amber-400/40 text-amber-300 text-xs font-bold hover:bg-amber-500/25 cursor-pointer whitespace-nowrap"
              >
                Clear Pin
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Full Map"
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-slate-100 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-4 items-stretch min-h-0">
          <div className="rounded-xl bg-[#050a14] border border-white/10 p-3 flex items-center justify-center">
            <svg
              ref={svgRef}
              viewBox="0 0 100 100"
              onClick={handleSvgClick}
              className="w-full max-w-[460px] aspect-square overflow-visible cursor-crosshair"
            >
              {/* Coastal Ocean Bay */}
              <circle
                cx={minimapWorld.oceanCenter.x}
                cy={minimapWorld.oceanCenter.y}
                r={minimapWorld.oceanRadius}
                fill="#0ea5e9"
                opacity="0.24"
                stroke="#38bdf8"
                strokeWidth="0.6"
              />

              {/* River & Terminal Lakes */}
              <line
                x1={minimapWorld.riverStart.x}
                y1={minimapWorld.riverStart.y}
                x2={minimapWorld.riverEnd.x}
                y2={minimapWorld.riverEnd.y}
                stroke="#3b82f6"
                strokeWidth="3.2"
                strokeLinecap="round"
                opacity="0.7"
              />
              {minimapWorld.lakeCenters.map((lc, idx) => (
                <circle
                  key={idx}
                  cx={lc.x}
                  cy={lc.y}
                  r={Math.max(3.5, minimapWorld.lakeRadius)}
                  fill="#3b82f6"
                  opacity="0.6"
                />
              ))}

              {/* Circuit Race Route Subtle Underlay */}
              {fullPath && (
                <path
                  d={fullPath}
                  fill="none"
                  stroke="rgba(255,255,255,0.12)"
                  strokeWidth="4.2"
                  strokeLinejoin="round"
                />
              )}

              {/* Full Connected Road Network Edges (Colored & Weighted by RoadType) */}
              {networkPaths.map(({ edge, d, style }) =>
                d ? (
                  <g key={edge.id}>
                    {edge.type === 'highway' && (
                      <path
                        d={d}
                        fill="none"
                        stroke="#1e293b"
                        strokeWidth={style.width + 1.0}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    )}
                    <path
                      d={d}
                      fill="none"
                      stroke={style.stroke}
                      strokeWidth={style.width}
                      strokeDasharray={style.dash}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </g>
                ) : null,
              )}

              {/* Railway Line */}
              {railPath && (
                <>
                  <path d={railPath} fill="none" stroke="#1e293b" strokeWidth="1.7" strokeLinecap="round" />
                  <path
                    d={railPath}
                    fill="none"
                    stroke="#e2e8f0"
                    strokeWidth="0.95"
                    strokeDasharray="1.4 1.4"
                    strokeLinecap="round"
                  />
                </>
              )}

              {/* Tunnel & Bridge Overlays */}
              {tunnelPath && (
                <path d={tunnelPath} fill="none" stroke="#475569" strokeWidth="2.6" strokeLinecap="round" />
              )}
              {bridgePath && (
                <path d={bridgePath} fill="none" stroke="#ffffff" strokeWidth="2.8" strokeLinecap="round" />
              )}

              {/* Network Junctions & Roundabout Ring */}
              {minimapWorld.networkNodes.map((node) =>
                node.kind === 'roundabout' ? (
                  <g key={node.id}>
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={Math.max(1.8, node.radiusNorm * 0.72)}
                      fill="#050a14"
                      stroke="#38bdf8"
                      strokeWidth="1.35"
                    />
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={Math.max(0.8, node.radiusNorm * 0.34)}
                      fill="#22c55e"
                      opacity="0.85"
                    />
                  </g>
                ) : (
                  <circle
                    key={node.id}
                    cx={node.x}
                    cy={node.y}
                    r={node.kind === 'highway_exit' ? 1.25 : 0.95}
                    fill={node.kind === 'highway_exit' ? '#e2e8f0' : '#fbbf24'}
                    opacity="0.78"
                  />
                ),
              )}

              {/* Road & Street Name Labels */}
              {roadLabels.map((lbl) => (
                <text
                  key={lbl.name}
                  x={lbl.x}
                  y={lbl.y - 1.4}
                  textAnchor="middle"
                  fontSize="2.15"
                  fontWeight="700"
                  fill={lbl.color}
                  stroke="#050a14"
                  strokeWidth="0.55"
                  paintOrder="stroke"
                  className="pointer-events-none select-none"
                >
                  {lbl.name}
                </text>
              ))}

              {/* Active GPS Route */}
              {gpsPath && (
                <path
                  d={gpsPath}
                  fill="none"
                  stroke="#22d3ee"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {/* Custom GPS Waypoint Pin */}
              {waypoint && (
                <>
                  <circle
                    cx={waypoint.x}
                    cy={waypoint.y}
                    r="3.8"
                    fill="none"
                    stroke="#22d3ee"
                    strokeWidth="0.65"
                    opacity="0.7"
                  />
                  <circle cx={waypoint.x} cy={waypoint.y} r="2.5" fill="#facc15" stroke="#090f1c" strokeWidth="0.8" />
                </>
              )}

              {/* District Labels */}
              {minimapWorld.zoneMarkers.map((zm) => (
                <g
                  key={zm.label}
                  className="cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSetWaypoint({ x: zm.x, y: zm.y });
                  }}
                >
                  <circle cx={zm.x} cy={zm.y} r="3.9" fill="#090f1c" stroke="rgba(255,255,255,0.28)" strokeWidth="0.5" />
                  <text x={zm.x} y={zm.y} fontSize="4.2" textAnchor="middle" dominantBaseline="central">
                    {zm.icon}
                  </text>
                </g>
              ))}

              {/* Start / Finish */}
              {startPt && (
                <circle cx={startPt.x} cy={startPt.y} r="2.2" fill="#f8fafc" stroke="#ef4444" strokeWidth="0.95" />
              )}

              {/* Ambient Traffic Cars */}
              {hud.trafficDots.map((dot) => (
                <circle
                  key={dot.name}
                  cx={dot.x}
                  cy={dot.y}
                  r="1.15"
                  fill={dot.color}
                  stroke="#050a14"
                  strokeWidth="0.35"
                  opacity="0.9"
                />
              ))}

              {/* AI Racers */}
              {hud.aiDots.map((dot) => (
                <circle
                  key={dot.name}
                  cx={dot.x}
                  cy={dot.y}
                  r="2.3"
                  fill={dot.color}
                  stroke="#ffffff"
                  strokeWidth="0.75"
                />
              ))}

              {/* Player Arrow */}
              <g
                transform={`translate(${hud.playerNormX.toFixed(1)}, ${hud.playerNormY.toFixed(1)}) rotate(${(
                  (-hud.playerHeading * 180) /
                  Math.PI +
                  180
                ).toFixed(1)})`}
              >
                <polygon points="0,-4.4 3.2,3.4 0,1.6 -3.2,3.4" fill="#f97316" stroke="#ffffff" strokeWidth="1.0" />
              </g>
            </svg>
          </div>

          {/* District Legend, Active GPS Route & Road Types */}
          <div className="flex flex-col justify-between gap-3">
            {hud.gpsInstruction && (
              <div className="rounded-xl bg-cyan-500/12 border border-cyan-400/35 p-2.5 flex items-start gap-2">
                <Route className="w-4 h-4 text-cyan-300 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="text-[10px] font-bold tracking-[0.14em] uppercase text-cyan-300">
                    Active GPS Route
                  </div>
                  <div className="text-xs font-bold text-white leading-snug mt-0.5">
                    {hud.gpsInstruction.text}
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <div className="text-[11px] font-bold tracking-[0.16em] uppercase text-slate-400 mb-0.5">
                Districts (Tap to Route)
              </div>
              {minimapWorld.zoneMarkers.map((zm) => (
                <button
                  key={zm.label}
                  type="button"
                  onClick={() => onSetWaypoint({ x: zm.x, y: zm.y })}
                  className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-left text-xs font-semibold text-slate-200 cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <span>{zm.icon}</span>
                    <span>{zm.label}</span>
                  </span>
                  <Navigation className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                </button>
              ))}
            </div>

            <div className="rounded-xl bg-white/5 border border-white/10 p-3 flex flex-col gap-1.5 text-[11px] text-slate-300">
              <div className="flex items-center gap-2">
                <span className="w-3 h-1 rounded-full bg-slate-400 inline-block" />
                <span>4-Lane Highway</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-1 rounded-full bg-amber-500 inline-block" />
                <span>City Streets</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-1 rounded-full bg-[#a8845e] inline-block" />
                <span>Mountain Pass</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-1 rounded-full bg-sky-400 inline-block" />
                <span>Coastal &amp; Roundabout</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-1 rounded-full bg-amber-600 inline-block" />
                <span>Dirt Side Roads</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-0.5 border-t-2 border-dashed border-slate-200 inline-block" />
                <span>Railway Crossing</span>
              </div>
              <div className="flex items-center gap-2 pt-1 border-t border-white/10">
                <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>{waypoint ? 'GPS Pin Active' : 'Tap map to set pin'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
