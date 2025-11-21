
(function() {
    const { useState, useEffect, useRef, useMemo } = React;
    const Icons = window.Icons;
    const REPO_BASE = window.REPO_BASE;
    const parseCSV = window.parseCSV;
    const getSeasonString = window.getSeasonString;
    const NBA_HEADSHOT_URL = window.NBA_HEADSHOT_URL;
    const FileUploadFallback = window.FileUploadFallback;

    const YEARS_RANGE = Array.from({ length: 10 }, (_, i) => 2015 + i);

    const NetworkVisualizer = () => {
        const [selectedYear, setSelectedYear] = useState(2024);
        const [loading, setLoading] = useState(false);
        const [fetchError, setFetchError] = useState(false);
        const [csvData, setCsvData] = useState([]);
        const [teams, setTeams] = useState([]);
        const [selectedTeamId, setSelectedTeamId] = useState('');
        const [dateRange, setDateRange] = useState({start: '', end: ''});
        const [minMaxDate, setMinMaxDate] = useState({min: '', max: ''});
        
        // Modes
        const [isPreviewMode, setIsPreviewMode] = useState(false);
        const [rotation, setRotation] = useState({ x: 0, y: 0, z: 0 });
        const [autoRotate, setAutoRotate] = useState(false);

        const svgRef = useRef(null);

        const formatName = (lastFirst) => {
            if (!lastFirst) return "Unknown";
            const parts = lastFirst.split(',');
            if (parts.length === 2) return `${parts[1].trim()} ${parts[0].trim()}`;
            return lastFirst;
        };

        const processData = (parsedData) => {
            setCsvData(parsedData);
            const uniqueTeams = new Map();
            const dates = [];
            parsedData.forEach(row => {
                if (row.TEAM_ID && row.TEAM_NAME) uniqueTeams.set(row.TEAM_ID, row.TEAM_NAME);
                if (row.GAME_DATE) dates.push(row.GAME_DATE);
            });
            
            const teamList = Array.from(uniqueTeams.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
            setTeams(teamList);
            if (teamList.length > 0) {
                setSelectedTeamId(prev => teamList.find(t => t.id === prev)?.id || teamList[0].id);
            }

            dates.sort();
            if (dates.length > 0) {
                const min = dates[0];
                const max = dates[dates.length - 1];
                setMinMaxDate({ min, max });
                setDateRange({ start: min, end: max });
            }
        };

        useEffect(() => {
            const loadSeasonData = async () => {
                setLoading(true);
                setFetchError(false);
                try {
                    const filename = `all_players_pass_data_${selectedYear}.csv`;
                    const finalUrl = `${REPO_BASE}/passes_pergame/${filename}`;
                    const response = await fetch(finalUrl);
                    if (!response.ok) throw new Error('Network block');
                    const text = await response.text();
                    const parsed = parseCSV(text);
                    processData(parsed.data);
                } catch (e) {
                    console.warn("Auto-load failed, waiting for user upload.");
                    setFetchError(true);
                } finally {
                    setLoading(false);
                }
            };
            loadSeasonData();
        }, [selectedYear]);

        const handleFileUpload = (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setLoading(true);
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const text = event.target?.result;
                    const parsed = parseCSV(text);
                    if(parsed.data && parsed.data.length > 0) {
                        processData(parsed.data);
                        setFetchError(false);
                    }
                } catch(err) {
                    console.error(err);
                    alert("Failed to parse file");
                } finally {
                    setLoading(false);
                }
            };
            reader.readAsText(file);
        };

        useEffect(() => {
            if (isPreviewMode) {
                setAutoRotate(true);
                setRotation({x: 15, y: 0, z: 0}); 
            } else {
                setAutoRotate(false);
                setRotation({x: 0, y: 0, z: 0});
            }
        }, [isPreviewMode]);

        const graphData = useMemo(() => {
            if (!selectedTeamId || csvData.length === 0) return { nodes: [], links: [] };
            
            const filtered = csvData.filter(row => {
                if (row.TEAM_ID !== selectedTeamId) return false;
                if (dateRange.start && row.GAME_DATE < dateRange.start) return false;
                if (dateRange.end && row.GAME_DATE > dateRange.end) return false;
                return true;
            });

            const nodeMap = new Map();
            const linkMap = new Map();

            filtered.forEach(row => {
                const sourceId = row.PLAYER_ID;
                const targetId = row.PASS_TEAMMATE_PLAYER_ID;
                const passes = parseInt(row.PASS || '0', 10);
                const assists = parseInt(row.AST || '0', 10);

                if (!nodeMap.has(sourceId)) nodeMap.set(sourceId, { id: sourceId, name: formatName(row.PLAYER_NAME_LAST_FIRST), assists: 0, z: (Math.random() - 0.5) * 400 });
                if (!nodeMap.has(targetId)) nodeMap.set(targetId, { id: targetId, name: formatName(row.PASS_TO), assists: 0, z: (Math.random() - 0.5) * 400 });

                nodeMap.get(sourceId).assists += assists;

                const linkKey = `${sourceId}->${targetId}`;
                if (!linkMap.has(linkKey)) linkMap.set(linkKey, { source: sourceId, target: targetId, weight: 0, assists: 0 });
                linkMap.get(linkKey).weight += passes;
                linkMap.get(linkKey).assists += assists;
            });

            return { nodes: Array.from(nodeMap.values()), links: Array.from(linkMap.values()).filter(l => l.weight > 0) };
        }, [selectedTeamId, dateRange, csvData]);

        const project3D = (x, y, z, angleX, angleY, angleZ, centerX, centerY) => {
            const radX = angleX * Math.PI / 180;
            const radY = angleY * Math.PI / 180;
            const radZ = angleZ * Math.PI / 180;
            let x1 = x * Math.cos(radY) - z * Math.sin(radY);
            let z1 = z * Math.cos(radY) + x * Math.sin(radY);
            let y1 = y * Math.cos(radX) - z1 * Math.sin(radX);
            let z2 = z1 * Math.cos(radX) + y * Math.sin(radX);
            let x2 = x1 * Math.cos(radZ) - y1 * Math.sin(radZ);
            let y2 = y1 * Math.cos(radZ) + x1 * Math.sin(radZ);
            const focalLength = 1000;
            const scale = focalLength / (focalLength + z2);
            return { x: x2 * scale + centerX, y: y2 * scale + centerY, scale: scale, depth: z2 };
        };

        useEffect(() => {
            if (!svgRef.current || graphData.nodes.length === 0) return;
            const width = 1000;
            const height = 800;
            const svg = d3.select(svgRef.current);
            svg.selectAll("*").remove();
            let selectedNodeId = null;

            const defs = svg.append("defs");
            const createMarker = (id, color) => {
                defs.append("marker").attr("id", id).attr("viewBox", "0 -5 10 10").attr("refX", 24).attr("refY", 0).attr("markerWidth", 6).attr("markerHeight", 6).attr("orient", "auto").append("path").attr("d", "M0,-5L10,0L0,5").attr("fill", color);
            };
            createMarker("arrow-normal", "#9ca3af");
            createMarker("arrow-out", "#22c55e");
            createMarker("arrow-in", "#ef4444");
            
            const gradient = defs.append("radialGradient").attr("id", "sphere-shine").attr("cx", "35%").attr("cy", "35%").attr("r", "60%").attr("fx", "30%").attr("fy", "30%");
            gradient.append("stop").attr("offset", "0%").attr("stop-color", "#fff").attr("stop-opacity", 0.4);
            gradient.append("stop").attr("offset", "100%").attr("stop-color", "#000").attr("stop-opacity", 0.4);
            const blurFilter = defs.append("filter").attr("id", "blur-shadow").append("feGaussianBlur").attr("stdDeviation", 8);
            if (isPreviewMode) {
                graphData.nodes.forEach(node => {
                     defs.append("clipPath").attr("id", `clip-${node.id}`).append("circle").attr("r", 35).attr("cx", 0).attr("cy", 0);
                });
            }

            const gridLines = [];
            const gridSize = 1200;
            const gridStep = 150;
            const gridY = 400; 
            for (let i = -gridSize; i <= gridSize; i += gridStep) {
                gridLines.push({ x1: -gridSize, y1: gridY, z1: i, x2: gridSize, y2: gridY, z2: i });
                gridLines.push({ x1: i, y1: gridY, z1: -gridSize, x2: i, y2: gridY, z2: gridSize });
            }

            const zoomGroup = svg.append("g");
            zoomGroup.append("rect").attr("x", -width * 2).attr("y", -height * 2).attr("width", width * 4).attr("height", height * 4).attr("fill", "transparent").on("click", () => { selectedNodeId = null; updateHighlights(); });
            if (!isPreviewMode) {
                const zoom = d3.zoom().scaleExtent([0.5, 3]).on("zoom", (e) => zoomGroup.attr("transform", e.transform));
                svg.call(zoom);
            }

            const container = zoomGroup.append("g").attr("transform", `translate(${width/2}, ${height/2})`);
            const gridSelection = container.append("g").attr("class", "grid-group").selectAll("path").data(gridLines).enter().append("path").attr("stroke", "#94a3b8").attr("stroke-width", 1).attr("fill", "none");
            let shadowSelection = container.append("g").attr("class", "shadow-group").selectAll("ellipse").data(graphData.nodes).enter().append("ellipse").attr("fill", "#000").attr("opacity", 0.2).attr("filter", "url(#blur-shadow)");
            let linkSelection = container.append("g").attr("class", "link-group").selectAll("g").data(graphData.links).enter().append("g");
            const linkPath = linkSelection.append("path").attr("class", "link").attr("fill", "none").attr("stroke", isPreviewMode ? "#ccc" : "#9ca3af").attr("stroke-opacity", isPreviewMode ? 0.1 : 0.2).attr("marker-end", isPreviewMode ? null : "url(#arrow-normal)");
            if (!isPreviewMode) {
                linkSelection.append("text").attr("text-anchor", "middle").style("font-size", "10px").style("fill", "#4b5563").style("font-weight", "bold").style("opacity", 0).text((d) => `${d.weight} P / ${d.assists} A`);
            }

            const updateHighlights = () => {
                if (!selectedNodeId) {
                     d3.selectAll(".node-stat").style("opacity", 0);
                     linkPath.attr("stroke", isPreviewMode ? "#ccc" : "#9ca3af").attr("stroke-opacity", isPreviewMode ? 0.1 : 0.2).attr("stroke-width", 1).attr("marker-end", isPreviewMode ? null : "url(#arrow-normal)");
                     nodeSelection.style("opacity", 1);
                     if(!isPreviewMode) {
                         nodeSelection.select(".node-circle").attr("fill", "#60a5fa").attr("stroke", "#fff");
                         d3.selectAll(".link-group text").style("opacity", 0);
                     }
                     return;
                }
                nodeSelection.style("opacity", (n) => {
                     if (n.id === selectedNodeId) return 1;
                     const isNeighbor = graphData.links.some((l) => (l.source.id === selectedNodeId && l.target.id === n.id) || (l.target.id === selectedNodeId && l.source.id === n.id));
                     return isNeighbor ? 1 : 0.1;
                });
                nodeSelection.filter((d) => d.id === selectedNodeId).select(".node-stat").style("opacity", 1);
                nodeSelection.filter((d) => d.id !== selectedNodeId).select(".node-stat").style("opacity", 0);
                if (!isPreviewMode) {
                    nodeSelection.filter((d) => d.id === selectedNodeId).select(".node-circle").attr("fill", "#fbbf24").attr("stroke", "#000");
                    nodeSelection.filter((d) => d.id !== selectedNodeId).select(".node-circle").attr("fill", "#60a5fa").attr("stroke", "#fff");
                }
                linkPath.each(function(l) {
                    const sel = d3.select(this);
                    const textSel = !isPreviewMode ? d3.select(this.parentNode).select("text") : null;
                    if (l.source.id === selectedNodeId) {
                        sel.attr("stroke", "#22c55e").attr("stroke-opacity", 0.8).attr("stroke-width", 2).attr("marker-end", "url(#arrow-out)");
                        if(textSel) { textSel.style("opacity", 1).style("fill", "#15803d"); }
                    } else if (l.target.id === selectedNodeId) {
                        sel.attr("stroke", "#ef4444").attr("stroke-opacity", 0.8).attr("stroke-width", 2).attr("marker-end", "url(#arrow-in)");
                        if(textSel) { textSel.style("opacity", 1).style("fill", "#b91c1c"); }
                    } else {
                        sel.attr("stroke-opacity", 0.05);
                        if(textSel) { textSel.style("opacity", 0); }
                    }
                });
            };

            let nodeSelection = container.append("g").attr("class", "node-group").selectAll("g").data(graphData.nodes).enter().append("g").attr("class", "node");
            if (isPreviewMode) {
                 nodeSelection.append("circle").attr("r", 35).attr("fill", "#fff");
                 nodeSelection.append("image").attr("xlink:href", (d) => NBA_HEADSHOT_URL(d.id)).attr("x", -35).attr("y", -35).attr("width", 70).attr("height", 70).attr("clip-path", (d) => `url(#clip-${d.id})`).style("cursor", "pointer").on("error", function() { d3.select(this).attr("visibility", "hidden"); });
                 nodeSelection.append("circle").attr("r", 35).attr("fill", "url(#sphere-shine)").style("pointer-events", "none");
                 nodeSelection.append("text").text((d) => d.name).attr("class", "node-label").attr("text-anchor", "middle").attr("dy", 50).style("font-size", "14px").style("font-weight", "bold").style("fill", "#1f2937").style("text-shadow", "2px 0 #fff, -2px 0 #fff, 0 2px #fff, 0 -2px #fff");
                 nodeSelection.append("text").attr("class", "node-stat").text((d) => `Ast: ${d.assists}`).attr("text-anchor", "middle").attr("dy", 65).style("font-size", "12px").style("fill", "#dc2626").style("font-weight", "bold").style("opacity", 0);
                 nodeSelection.on("click", function(e, d) { e.stopPropagation(); selectedNodeId = (selectedNodeId === d.id) ? null : d.id; updateHighlights(); });
            } else {
                nodeSelection.append("circle").attr("class", "node-circle").attr("fill", "#60a5fa").attr("stroke", "#fff").attr("stroke-width", 2).style("cursor", "pointer");
                nodeSelection.append("text").attr("class", "node-label").text((d) => d.name).attr("text-anchor", "middle").attr("dominant-baseline", "middle").style("font-size", "12px").style("font-weight", "600").style("fill", "#1f2937").style("pointer-events", "none").style("text-shadow", "0px 0px 4px rgba(255,255,255,0.9)");
                nodeSelection.append("text").attr("class", "node-stat").text((d) => `Ast: ${d.assists}`).attr("text-anchor", "middle").style("font-size", "11px").style("fill", "#dc2626").style("font-weight", "bold").style("opacity", 0);
                nodeSelection.on("click", function(e, d) { e.stopPropagation(); selectedNodeId = (selectedNodeId === d.id) ? null : d.id; updateHighlights(); });
            }

            let ballSelection = container.append("g").attr("class", "balls-group").selectAll(".ball");
            const maxAssists = d3.max(graphData.nodes, (d) => d.assists) || 1;
            const nodeRadiusScale = d3.scaleLinear().domain([0, maxAssists]).range([15, 45]);
            const linkWidthScale = d3.scaleLinear().domain([1, d3.max(graphData.links, (d) => d.weight) || 1]).range([1, 6]);
            const simulation = d3.forceSimulation(graphData.nodes).force("link", d3.forceLink(graphData.links).id((d) => d.id).distance(400)).force("charge", d3.forceManyBody().strength(-400)).force("center", d3.forceCenter(0, 0)).force("collide", d3.forceCollide().radius(50));

            let activeBalls = [];
            let rotationY = rotation.y;
            let lastTime = 0;

            const renderFrame = (timestamp) => {
                if (autoRotate) {
                    const dt = timestamp - lastTime;
                    if (lastTime > 0) rotationY = (rotationY + 0.05 * dt/16) % 360;
                    lastTime = timestamp;
                } else { rotationY = rotation.y; lastTime = 0; }
                const rX = rotation.x, rZ = rotation.z;

                gridSelection.attr("d", (d) => {
                    const p1 = project3D(d.x1, d.y1, d.z1, rX, rotationY, rZ, 0, 0);
                    const p2 = project3D(d.x2, d.y2, d.z2, rX, rotationY, rZ, 0, 0);
                    return `M${p1.x},${p1.y}L${p2.x},${p2.y}`;
                }).attr("stroke-opacity", (d) => { const p1 = project3D(d.x1, d.y1, d.z1, rX, rotationY, rZ, 0, 0); return Math.max(0.05, p1.scale * 0.2); });

                graphData.nodes.forEach((n) => { const proj = project3D(n.x || 0, n.y || 0, n.z, rX, rotationY, rZ, 0, 0); n.px = proj.x; n.py = proj.y; n.pz = proj.depth; n.scale = proj.scale; });
                shadowSelection.attr("cx", (d) => project3D(d.x || 0, gridY, d.z, rX, rotationY, rZ, 0, 0).x).attr("cy", (d) => project3D(d.x || 0, gridY, d.z, rX, rotationY, rZ, 0, 0).y).attr("rx", (d) => nodeRadiusScale(d.assists) * project3D(d.x, gridY, d.z, rX, rotationY, rZ, 0, 0).scale * 1.2).attr("ry", (d) => nodeRadiusScale(d.assists) * project3D(d.x, gridY, d.z, rX, rotationY, rZ, 0, 0).scale * 0.4);
                nodeSelection.sort((a, b) => b.pz - a.pz);
                linkSelection.sort((a, b) => ((b.source.pz + b.target.pz) / 2) - ((a.source.pz + a.target.pz) / 2));

                nodeSelection.attr("transform", (d) => `translate(${d.px},${d.py}) scale(${d.scale})`).style("filter", (d) => `brightness(${0.7 + (d.scale * 0.4)})`);
                if (!isPreviewMode) {
                    nodeSelection.select("circle").attr("r", (d) => nodeRadiusScale(d.assists));
                    nodeSelection.select(".node-stat").attr("dy", (d) => nodeRadiusScale(d.assists) + 15);
                }

                linkSelection.select("path").attr("d", (d) => {
                    const dx = d.target.px - d.source.px;
                    const dy = d.target.py - d.source.py;
                    const dr = Math.sqrt(dx * dx + dy * dy) * 1.5; 
                    d.pathCache = `M${d.source.px},${d.source.py}A${dr},${dr} 0 0,1 ${d.target.px},${d.target.py}`;
                    return d.pathCache;
                }).attr("stroke-width", (d) => linkWidthScale(d.weight) * ((d.source.scale + d.target.scale)/2));

                if (isPreviewMode) {
                     graphData.links.forEach((link, i) => {
                         if (Math.random() < (link.weight * 0.002)) {
                             const assistRatio = link.weight > 0 ? (link.assists / link.weight) : 0;
                             activeBalls.push({ linkIndex: i, t: 0, speed: 0.01 + Math.random() * 0.005, sourcePz: link.source.pz, targetPz: link.target.pz, isAssist: Math.random() < assistRatio });
                         }
                     });
                     activeBalls.forEach(b => b.t += b.speed);
                     activeBalls = activeBalls.filter(b => b.t < 1);
                     ballSelection = container.select(".balls-group").selectAll(".ball").data(activeBalls);
                     ballSelection.exit().remove();
                     ballSelection.enter().append("circle").attr("class", "ball").attr("r", 5).attr("stroke", "rgba(0,0,0,0.5)").attr("stroke-width", 0.5).merge(ballSelection).attr("fill", (b) => b.isAssist ? "#22c55e" : "#f97316").attr("opacity", (b) => { if (!selectedNodeId) return 1; const link = graphData.links[b.linkIndex]; return (link.source.id === selectedNodeId || link.target.id === selectedNodeId) ? 1 : 0.05; }).attr("transform", (b) => {
                            const link = graphData.links[b.linkIndex];
                            const p0 = {x: link.source.px, y: link.source.py};
                            const p2 = {x: link.target.px, y: link.target.py};
                            const dx = p2.x - p0.x, dy = p2.y - p0.y, dist = Math.sqrt(dx*dx + dy*dy);
                            const mx = (p0.x + p2.x)/2, my = (p0.y + p2.y)/2;
                            const perpX = -dy/dist, perpY = dx/dist, curveMag = dist * 0.3; 
                            const cx = mx + perpX * curveMag, cy = my + perpY * curveMag;
                            const t = b.t, invT = 1 - t;
                            const x = (invT * invT * p0.x) + (2 * invT * t * cx) + (t * t * p2.x);
                            const y = (invT * invT * p0.y) + (2 * invT * t * cy) + (t * t * p2.y);
                            const depth = (b.sourcePz * invT) + (b.targetPz * t);
                            const scale = 1000 / (1000 + depth);
                            return `translate(${x},${y}) scale(${scale})`;
                        });
                }
            };

            const timer = d3.timer((elapsed) => { renderFrame(elapsed); });
            return () => { timer.stop(); simulation.stop(); };
        }, [graphData, rotation, autoRotate, isPreviewMode]);

        const resetRotation = () => { setRotation({ x: 0, y: 0, z: 0 }); setAutoRotate(false); };

        return (
            <div className="space-y-6">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-wrap gap-4 items-end">
                    <div className="w-40">
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Season</label>
                        <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))} className="block w-full border-slate-300 rounded-lg shadow-sm py-2 px-3 border text-sm focus:ring-blue-500 focus:border-blue-500">
                            {YEARS_RANGE.map(y => <option key={y} value={y}>{y} ({getSeasonString(y)})</option>)}
                        </select>
                    </div>
                    <div className="flex-1 min-w-[200px]">
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Team</label>
                        <select value={selectedTeamId} onChange={e => setSelectedTeamId(e.target.value)} disabled={loading || teams.length === 0} className="block w-full border-slate-300 rounded-lg shadow-sm py-2 px-3 border text-sm focus:ring-blue-500 focus:border-blue-500 disabled:bg-slate-100">
                            {teams.length === 0 && <option>Loading teams...</option>}
                            {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                    </div>
                    <div className="w-36">
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Start Date</label>
                        <input type="date" value={dateRange.start} min={minMaxDate.min} max={minMaxDate.max} onChange={e => setDateRange(prev => ({...prev, start: e.target.value}))} className="block w-full border-slate-300 rounded-lg shadow-sm py-2 px-3 border text-sm focus:ring-blue-500 focus:border-blue-500" />
                    </div>
                    <div className="w-36">
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">End Date</label>
                        <input type="date" value={dateRange.end} min={minMaxDate.min} max={minMaxDate.max} onChange={e => setDateRange(prev => ({...prev, end: e.target.value}))} className="block w-full border-slate-300 rounded-lg shadow-sm py-2 px-3 border text-sm focus:ring-blue-500 focus:border-blue-500" />
                    </div>
                    
                    <div className="flex-none">
                        <button onClick={() => setIsPreviewMode(!isPreviewMode)} className={`flex items-center gap-2 px-4 py-2 rounded-lg shadow-sm font-medium text-sm transition-colors ${isPreviewMode ? 'bg-red-100 text-red-700 border border-red-200 hover:bg-red-200' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}>
                            {isPreviewMode ? <><Icons.Stop /> Stop Animation</> : <><Icons.Play /> Preview 3D</>}
                        </button>
                    </div>
                </div>

                <div className="bg-gradient-to-br from-slate-50 via-slate-100 to-slate-200 border border-slate-200 rounded-2xl shadow-inner h-[750px] relative overflow-hidden group">
                     <div className="absolute top-6 left-6 z-10 pointer-events-none bg-white/80 backdrop-blur p-4 rounded-xl border border-slate-100 shadow-sm">
                        <h3 className="text-lg font-bold text-slate-800">Passing Network {isPreviewMode && "(Live Preview)"}</h3>
                        <p className="text-xs text-slate-500 mt-1 font-medium">{teams.find(t => t.id === selectedTeamId)?.name} | {graphData.nodes.length} Players | {graphData.links.length} Connections</p>
                    </div>
                    
                    {!isPreviewMode && (
                    <div className="absolute top-6 right-6 z-10 flex flex-col gap-4 items-end pointer-events-auto">
                        <div className="bg-white/90 backdrop-blur p-4 rounded-xl shadow-sm border border-slate-200 w-64 transition-opacity hover:opacity-100 opacity-90">
                            <div className="flex justify-between items-center mb-3">
                                <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wider"><Icons.Rotate3D /> 3D Controls</div>
                                <button onClick={() => setAutoRotate(!autoRotate)} className={`text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wide transition-colors ${autoRotate ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>{autoRotate ? 'Stop' : 'Auto'}</button>
                            </div>
                            <div className="space-y-4">
                                <div className="flex items-center gap-3 text-xs"><span className="w-3 font-bold text-slate-400">X</span><input type="range" min="-90" max="90" value={rotation.x} onChange={e => setRotation({...rotation, x: Number(e.target.value)})} className="flex-1 h-1.5 bg-slate-200 rounded-lg cursor-pointer accent-blue-600" /><span className="w-8 text-right font-mono text-slate-600">{rotation.x}°</span></div>
                                <div className="flex items-center gap-3 text-xs"><span className="w-3 font-bold text-slate-400">Y</span><input type="range" min="0" max="360" value={rotation.y} onChange={e => setRotation({...rotation, y: Number(e.target.value)})} className="flex-1 h-1.5 bg-slate-200 rounded-lg cursor-pointer accent-blue-600" /><span className="w-8 text-right font-mono text-slate-600">{Math.round(rotation.y)}°</span></div>
                                <div className="flex items-center gap-3 text-xs"><span className="w-3 font-bold text-slate-400">Z</span><input type="range" min="0" max="360" value={rotation.z} onChange={e => setRotation({...rotation, z: Number(e.target.value)})} className="flex-1 h-1.5 bg-slate-200 rounded-lg cursor-pointer accent-blue-600" /><span className="w-8 text-right font-mono text-slate-600">{rotation.z}°</span></div>
                                <button onClick={resetRotation} className="w-full text-xs bg-slate-50 hover:bg-slate-100 py-2 rounded-lg border border-slate-200 text-slate-600 font-medium transition-colors">Reset View</button>
                            </div>
                        </div>
                        <div className="text-xs text-slate-500 space-y-1.5 text-right bg-white/90 backdrop-blur p-3 rounded-xl shadow-sm border border-slate-100 w-fit">
                            <div className="font-bold mb-2 text-slate-700 uppercase tracking-wider text-[10px]">Legend</div>
                            <div className="flex items-center justify-end gap-2">Outgoing Pass <span className="w-2 h-2 rounded-full bg-green-500"></span></div>
                            <div className="flex items-center justify-end gap-2">Incoming Pass <span className="w-2 h-2 rounded-full bg-red-500"></span></div>
                        </div>
                    </div>
                    )}

                    {loading && <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] z-20 flex items-center justify-center"><div className="bg-white p-6 rounded-2xl shadow-xl flex flex-col items-center gap-3"><div className="text-blue-600"><Icons.Loader /></div><span className="font-medium text-slate-700">Processing Data...</span></div></div>}

                    {fetchError && (
                        <div className="absolute inset-0 bg-slate-900/5 backdrop-blur-sm z-30 flex items-center justify-center p-4">
                            <div className="flex flex-col items-center gap-4 p-8 bg-white rounded-2xl shadow-2xl border border-slate-100 max-w-md text-center">
                                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center text-red-500 mb-2"><Icons.AlertCircle /></div>
                                <div><h3 className="text-lg font-bold text-slate-900">Data Connection Blocked</h3><p className="text-sm text-slate-500 mt-1 leading-relaxed">Your network is preventing direct access to the dataset. Please upload the file <code className="mx-1 px-1.5 py-0.5 bg-slate-100 rounded text-slate-700 font-mono text-xs">all_players_pass_data_{selectedYear}.csv</code> manually.</p></div>
                                <div className="w-full pt-4 border-t border-slate-100"><FileUploadFallback onUpload={handleFileUpload} label="Upload CSV File" /></div>
                            </div>
                        </div>
                    )}

                    <div className="w-full h-full cursor-move active:cursor-grabbing">
                        {graphData.nodes.length > 0 ? <svg ref={svgRef} viewBox="0 0 1000 800" className="w-full h-full outline-none"></svg> : !loading && !fetchError && <div className="flex items-center justify-center h-full text-slate-400 flex-col gap-3"><div className="p-4 bg-slate-50 rounded-full"><Icons.Network /></div><p className="font-medium">No data found for current filters.</p></div>}
                    </div>
                </div>
            </div>
        );
    };

    window.NetworkVisualizer = NetworkVisualizer;
})();
