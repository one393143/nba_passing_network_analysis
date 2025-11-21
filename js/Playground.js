
(function() {
    const { useState, useEffect, useMemo } = React;
    const Icons = window.Icons;
    const REPO_BASE = window.REPO_BASE;
    const parseCSV = window.parseCSV;
    const getSeasonString = window.getSeasonString;
    const NBA_HEADSHOT_URL = window.NBA_HEADSHOT_URL;
    const FileUploadFallback = window.FileUploadFallback;

    const YEARS_RANGE = Array.from({ length: 10 }, (_, i) => 2015 + i);

    const Playground = () => {
        // Config
        const NBA_TEAM_MAPPING = {
            "Atlanta Hawks": "ATL", "Boston Celtics": "BOS", "Brooklyn Nets": "BKN", "Charlotte Hornets": "CHA", "Chicago Bulls": "CHI", "Cleveland Cavaliers": "CLE", "Dallas Mavericks": "DAL", "Denver Nuggets": "DEN", "Detroit Pistons": "DET", "Golden State Warriors": "GSW", "Houston Rockets": "HOU", "Indiana Pacers": "IND", "Los Angeles Clippers": "LAC", "Los Angeles Lakers": "LAL", "Memphis Grizzlies": "MEM", "Miami Heat": "MIA", "Milwaukee Bucks": "MIL", "Minnesota Timberwolves": "MIN", "New Orleans Pelicans": "NOP", "New York Knicks": "NYK", "Oklahoma City Thunder": "OKC", "Orlando Magic": "ORL", "Philadelphia 76ers": "PHI", "Phoenix Suns": "PHX", "Portland Trail Blazers": "POR", "Sacramento Kings": "SAC", "San Antonio Spurs": "SAS", "Toronto Raptors": "TOR", "Utah Jazz": "UTA", "Washington Wizards": "WAS",
        };

        const [selectedYear, setSelectedYear] = useState(2024);
        const [selectedTeamName, setSelectedTeamName] = useState("Atlanta Hawks");
        const [selectedType, setSelectedType] = useState("Regular Season");
        const [viewMode, setViewMode] = useState("avg"); // avg | total
        
        // Date States
        const [tempDateRange, setTempDateRange] = useState({ start: '', end: '' });
        const [appliedDateRange, setAppliedDateRange] = useState({ start: '', end: '' });
        const [seasonDateBounds, setSeasonDateBounds] = useState({ min: '', max: '' });

        const [csvData, setCsvData] = useState(null);
        const [loading, setLoading] = useState(false);
        const [error, setError] = useState(null);

        const statColumns = [
            { label: "GP", key: "gp", format: (v) => v },
            { label: "MIN", key: "min", format: (v) => v.toFixed(1) },
            { label: "PTS", key: "pts", format: (v) => v.toFixed(1) },
            { label: "FGM", key: "fgm", format: (v) => v.toFixed(1) },
            { label: "FGA", key: "fga", format: (v) => v.toFixed(1) },
            { label: "3PM", key: "fg3m", format: (v) => v.toFixed(1) },
            { label: "3PA", key: "fg3a", format: (v) => v.toFixed(1) },
            { label: "FTM", key: "ftm", format: (v) => v.toFixed(1) },
            { label: "FTA", key: "fta", format: (v) => v.toFixed(1) },
            { label: "OREB", key: "oreb", format: (v) => v.toFixed(1) },
            { label: "DREB", key: "dreb", format: (v) => v.toFixed(1) },
            { label: "REB", key: "reb", format: (v) => v.toFixed(1) },
            { label: "AST", key: "ast", format: (v) => v.toFixed(1) },
            { label: "STL", key: "stl", format: (v) => v.toFixed(1) },
            { label: "BLK", key: "blk", format: (v) => v.toFixed(1) },
            { label: "TOV", key: "tov", format: (v) => v.toFixed(1) },
            { label: "PF", key: "pf", format: (v) => v.toFixed(1) },
            { label: "+/-", key: "plus_minus", format: (v) => v.toFixed(1) },
        ];

        const parseDateStr = (dateStr) => {
            if (!dateStr) return null;
            
            // Clean quotes if present
            dateStr = dateStr.replace(/"/g, '');

            // Try standard ISO or simple format first
            const t = Date.parse(dateStr);
            if (!isNaN(t)) {
                const d = new Date(t);
                // Fix timezone off-by-one: use UTC methods since inputs usually parse to UTC 00:00
                return d.toISOString().split('T')[0];
            }

            // Handle "DD-Mon-YY" e.g. "13-Apr-25"
            const parts = dateStr.split('-');
            if (parts.length === 3) {
                const [day, monthStr, yearStr] = parts;
                const months = { "Jan": 0, "Feb": 1, "Mar": 2, "Apr": 3, "May": 4, "Jun": 5, "Jul": 6, "Aug": 7, "Sep": 8, "Oct": 9, "Nov": 10, "Dec": 11 };
                const year = parseInt(yearStr) + 2000;
                const month = months[monthStr];
                if (month !== undefined) {
                     // Construct UTC date to ensure string consistency
                     const d = new Date(Date.UTC(year, month, parseInt(day)));
                     return d.toISOString().split('T')[0];
                }
            }
            return null;
        };

        const processData = (rawData) => {
            const uniqueGameMap = new Map();
            const processedRows = [];
            
            rawData.forEach(row => {
                 const gameId = row.GAME_ID;
                 const playerId = row.PLAYER_ID;
                 const uniqueKey = `${gameId}_${playerId}`;
                 
                 if (uniqueGameMap.has(uniqueKey)) return; 
                 uniqueGameMap.set(uniqueKey, true);

                 const isoDate = parseDateStr(row.GAME_DATE);

                 // Parse Team from MATCHUP (e.g. "NYK vs. LAL" -> "NYK")
                 let realAbbr = "";
                 if (row.MATCHUP) {
                     const matchParts = row.MATCHUP.split(' ');
                     if (matchParts.length > 0) realAbbr = matchParts[0];
                 }

                 processedRows.push({ ...row, isoDate, realAbbr });
            });
            
            setCsvData(processedRows);
            
            const validDates = processedRows.map(r => r.isoDate).filter(d => d).sort();
            if (validDates.length > 0) {
                const min = validDates[0];
                const max = validDates[validDates.length - 1];
                setSeasonDateBounds({ min, max });
                // Auto apply full season range on load
                setTempDateRange({ start: min, end: max });
                setAppliedDateRange({ start: min, end: max });
            }
        };

        useEffect(() => {
            const load = async () => {
                setLoading(true);
                setError(null);
                try {
                    const filename = `${getSeasonString(selectedYear)}_player_game_data.csv`;
                    const url = `${REPO_BASE}/performance_player_pergame/${filename}`;
                    const res = await fetch(url);
                    if (!res.ok) throw new Error("Network block");
                    const text = await res.text();
                    const parsed = parseCSV(text);
                    processData(parsed.data);
                } catch (e) {
                    console.warn("Fallback needed");
                    setError(true);
                } finally {
                    setLoading(false);
                }
            };
            load();
        }, [selectedYear]);

        const handleFileUpload = (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setLoading(true);
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const parsed = parseCSV(event.target.result);
                    processData(parsed.data);
                    setError(null);
                } catch(err) { alert("Error parsing file"); } 
                finally { setLoading(false); }
            };
            reader.readAsText(file);
        };

        const handleApplyFilter = () => {
            setAppliedDateRange(tempDateRange);
        };

        const aggregatedData = useMemo(() => {
            if (!csvData) return [];
            
            const targetAbbr = NBA_TEAM_MAPPING[selectedTeamName];
            
            const filtered = csvData.filter(row => {
                if (targetAbbr && row.realAbbr !== targetAbbr) return false;
                if (selectedType && row.SEASON_TYPE !== selectedType) return false;
                if (appliedDateRange.start && row.isoDate < appliedDateRange.start) return false;
                if (appliedDateRange.end && row.isoDate > appliedDateRange.end) return false;
                return true;
            });

            const playerMap = new Map();
            filtered.forEach(row => {
                const pid = row.PLAYER_ID;
                if (!playerMap.has(pid)) {
                    playerMap.set(pid, {
                        id: pid,
                        name: row.PLAYER_NAME,
                        gp: 0,
                        min: 0, pts: 0, fgm: 0, fga: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0, oreb: 0, dreb: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0, plus_minus: 0
                    });
                }
                const p = playerMap.get(pid);
                p.gp += 1;
                p.min += parseFloat(row.MIN || 0);
                p.pts += parseFloat(row.PTS || 0);
                p.fgm += parseFloat(row.FGM || 0);
                p.fga += parseFloat(row.FGA || 0);
                p.fg3m += parseFloat(row.FG3M || 0);
                p.fg3a += parseFloat(row.FG3A || 0);
                p.ftm += parseFloat(row.FTM || 0);
                p.fta += parseFloat(row.FTA || 0);
                p.oreb += parseFloat(row.OREB || 0);
                p.dreb += parseFloat(row.DREB || 0);
                p.reb += parseFloat(row.REB || 0);
                p.ast += parseFloat(row.AST || 0);
                p.stl += parseFloat(row.STL || 0);
                p.blk += parseFloat(row.BLK || 0);
                p.tov += parseFloat(row.TOV || 0);
                p.pf += parseFloat(row.PF || 0);
                p.plus_minus += parseFloat(row.PLUS_MINUS || 0);
            });

            const result = Array.from(playerMap.values());

            if (viewMode === 'avg') {
                result.forEach(p => {
                    if (p.gp > 0) {
                         statColumns.forEach(col => {
                             if (col.key !== 'gp') p[col.key] = p[col.key] / p.gp;
                         });
                    }
                });
            }
            
            return result.sort((a, b) => b.pts - a.pts); 
        }, [csvData, selectedTeamName, selectedType, appliedDateRange, viewMode]);

        return (
            <div className="space-y-6 animate-fade-in">
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-4">
                    <div className="flex flex-wrap gap-4 items-end">
                        <div className="w-32">
                            <label className="text-xs font-bold text-slate-500 uppercase mb-1.5 block">Season</label>
                            <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))} className="block w-full border-slate-300 rounded-lg py-2 text-sm bg-slate-50">
                                {YEARS_RANGE.map(y => <option key={y} value={y}>{y} ({getSeasonString(y)})</option>)}
                            </select>
                        </div>
                        <div className="w-48">
                            <label className="text-xs font-bold text-slate-500 uppercase mb-1.5 block">Team</label>
                            <select value={selectedTeamName} onChange={e => setSelectedTeamName(e.target.value)} className="block w-full border-slate-300 rounded-lg py-2 text-sm bg-slate-50">
                                {Object.keys(NBA_TEAM_MAPPING).map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                         <div className="w-40">
                            <label className="text-xs font-bold text-slate-500 uppercase mb-1.5 block">Type</label>
                            <select value={selectedType} onChange={e => setSelectedType(e.target.value)} className="block w-full border-slate-300 rounded-lg py-2 text-sm bg-slate-50">
                                <option value="Regular Season">Regular Season</option>
                                <option value="Playoffs">Playoffs</option>
                                <option value="PlayIn">Play-In</option>
                            </select>
                        </div>
                        
                        <div className="flex items-end gap-2 bg-slate-50 p-1.5 rounded-lg border border-slate-200">
                            <div className="w-36">
                                <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block px-1">From</label>
                                <input type="date" value={tempDateRange.start} min={seasonDateBounds.min} max={seasonDateBounds.max} onChange={e => setTempDateRange({...tempDateRange, start: e.target.value})} className="block w-full border-slate-300 rounded-md text-xs py-1.5" />
                            </div>
                            <div className="w-36">
                                <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block px-1">To</label>
                                <input type="date" value={tempDateRange.end} min={seasonDateBounds.min} max={seasonDateBounds.max} onChange={e => setTempDateRange({...tempDateRange, end: e.target.value})} className="block w-full border-slate-300 rounded-md text-xs py-1.5" />
                            </div>
                            <button onClick={handleApplyFilter} className="bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-md shadow-sm transition-colors" title="Apply Date Filter">
                                <Icons.Filter />
                            </button>
                        </div>

                        <div className="flex-1 flex justify-end">
                            <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
                                <button onClick={() => setViewMode('avg')} className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${viewMode === 'avg' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Per Game</button>
                                <button onClick={() => setViewMode('total')} className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${viewMode === 'total' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Totals</button>
                            </div>
                        </div>
                    </div>
                </div>

                {loading && <div className="text-center py-12 text-slate-500 flex flex-col items-center gap-2"><Icons.Loader /> Processing Stats...</div>}

                {error && (
                     <div className="p-6 bg-red-50 border border-red-100 rounded-xl text-center">
                        <div className="text-red-500 mb-2 flex justify-center"><Icons.AlertCircle /></div>
                        <h3 className="font-bold text-red-800">Data Unavailable</h3>
                        <p className="text-sm text-red-600 mb-4">Network restriction prevented loading data.</p>
                        <div className="inline-block"><FileUploadFallback onUpload={handleFileUpload} /></div>
                    </div>
                )}

                {!loading && !error && (
                    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                        <div className="overflow-x-auto custom-scrollbar">
                            <table className="w-full text-sm text-left whitespace-nowrap">
                                <thead className="bg-slate-50 text-xs uppercase text-slate-500 font-bold sticky top-0">
                                    <tr>
                                        <th className="px-6 py-4 border-b border-slate-200 min-w-[150px]">Player</th>
                                        {statColumns.map(col => (
                                            <th key={col.key} className={`px-4 py-4 border-b border-slate-200 text-right ${col.key === 'pts' ? 'bg-blue-50 text-blue-700' : ''}`}>{col.label} {col.key === 'pts' ? '↓' : ''}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {aggregatedData.map(p => (
                                        <tr key={p.id} className="hover:bg-slate-50 transition-colors group">
                                            <td className="px-6 py-3 flex items-center gap-3">
                                                <img src={NBA_HEADSHOT_URL(p.id)} alt="" className="w-8 h-8 rounded-full bg-slate-100 object-cover" onError={(e) => e.target.style.display = 'none'} />
                                                <span className="font-medium text-slate-700">{p.name}</span>
                                            </td>
                                            {statColumns.map(col => (
                                                <td key={col.key} className={`px-4 py-3 text-right font-mono text-slate-600 ${col.key === 'pts' ? 'font-bold text-slate-800 bg-blue-50/30' : ''}`}>
                                                    {col.format(p[col.key])}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                    {aggregatedData.length === 0 && (
                                        <tr><td colSpan={statColumns.length + 1} className="px-6 py-12 text-center text-slate-400 flex flex-col items-center gap-2"><Icons.Calculator /><span className="block">No player data found for selected filters.</span></td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        <div className="bg-slate-50 px-4 py-2 border-t border-slate-200 text-xs text-slate-500 text-right">
                            Date Filter: {appliedDateRange.start || 'Start'} to {appliedDateRange.end || 'End'}
                            <span className="mx-2">•</span>
                            Showing {aggregatedData.length} players
                        </div>
                    </div>
                )}
            </div>
        );
    };

    window.Playground = Playground;
})();
