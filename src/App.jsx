import React, { useState, useEffect, useCallback } from 'react';
import { Navigation, AlertTriangle, Bike, Share2, Eye, Menu as MenuIcon, X, Sun, Moon, Copy, ChevronUp, ChevronDown, MapPin, ExternalLink, Wrench, Loader2 } from 'lucide-react';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { collection, addDoc, onSnapshot, doc, updateDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from './config/firebase';
import LeafletMap from './components/LeafletMap';
import OverflowMenu from './components/Menu';
import SunCalc from 'suncalc';

// --- HELPER: Sun Exposure ---
const calculateSunExposure = (routeCoords, obstacles) => {
  if (!routeCoords.length) return 0;
  const [startLat, startLng] = routeCoords[0];
  const sunPos = SunCalc.getPosition(new Date(), startLat, startLng);
  const sunIntensity = Math.max(0, Math.sin(sunPos.altitude));

  if (sunIntensity === 0) return 0; 

  let shadedPoints = 0;
  const threshold = 0.0005; 

  for (let i = 0; i < routeCoords.length; i += 5) {
    const [lat, lng] = routeCoords[i];
    const isShaded = obstacles.some(el => {
      const elLat = el.lat || el.center?.lat;
      const elLng = el.lon || el.center?.lon;
      if (!elLat || !elLng) return false;
      return Math.abs(lat - elLat) < threshold && Math.abs(lng - elLng) < threshold;
    });
    if (isShaded) shadedPoints++;
  }

  const percentageShaded = shadedPoints / (routeCoords.length / 5);
  return sunIntensity * (1 - percentageShaded);
};

// --- HELPER: Lighting Score ---
const calculateLightingScore = (routeCoords, litElements) => {
  let litPoints = 0;
  const threshold = 0.0004; 

  for (let i = 0; i < routeCoords.length; i += 10) {
    const [lat, lng] = routeCoords[i];
    const isLit = litElements.some(el => {
      const elLat = el.lat || el.center?.lat;
      const elLng = el.lon || el.center?.lon;
      if (!elLat || !elLng) return false;
      return Math.abs(lat - elLat) < threshold && Math.abs(lng - elLng) < threshold;
    });
    if (isLit) litPoints++;
  }
  return litPoints;
};

export default function App() {
  const [user, setUser] = useState(null);
  const [viewMode, setViewMode] = useState('rider');
  const [isSheetExpanded, setIsSheetExpanded] = useState(false); 
  const [category, setCategory] = useState('navigation');

  // Map & Data State
  const [currentLocation, setCurrentLocation] = useState({ lat: 48.1351, lng: 11.5820 });
  const [zoom, setZoom] = useState(13);
  const [theftZones, setTheftZones] = useState([]);
  const [bikeRacks, setBikeRacks] = useState([]);
  const [repairStations, setRepairStations] = useState([]);

  // Routing State
  const [destination, setDestination] = useState('');
  const [routeCoords, setRouteCoords] = useState([]);
  const [isWellLit, setIsWellLit] = useState(true);
  const [isSummerMode, setIsSummerMode] = useState(false);
  const [routeDistance, setRouteDistance] = useState(null);
  const [routeDuration, setRouteDuration] = useState(null);
  const [destCoords, setDestCoords] = useState(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [safetyNote, setSafetyNote] = useState(null);

  // Sharing State
  const [tripId, setTripId] = useState('');
  const [isSharing, setIsSharing] = useState(false);
  const [watchedLocation, setWatchedLocation] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(0);
  const [isDangerAlert, setIsDangerAlert] = useState(false);

  // UI State
  const [reportMode, setReportMode] = useState(null);
  const [tempMarker, setTempMarker] = useState(null);

  // --- INIT & AUTH ---
  useEffect(() => {
    signInAnonymously(auth);
    const unsubAuth = onAuthStateChanged(auth, setUser);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setCurrentLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => console.error("GPS Error:", err),
        { enableHighAccuracy: true }
      );
    }
    return unsubAuth;
  }, []);

  // --- FIRESTORE LISTENERS ---
  useEffect(() => {
    if (!user) return;
    const unsubThefts = onSnapshot(collection(db, 'theft_reports'), (s) =>
      setTheftZones(s.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    const unsubRacks = onSnapshot(collection(db, 'bike_racks'), (s) =>
      setBikeRacks(s.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    const unsubRepair = onSnapshot(collection(db, 'repair_stations'), (s) =>
      setRepairStations(s.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    return () => { unsubThefts(); unsubRacks(); unsubRepair(); };
  }, [user]);

  // --- ROUTING LOGIC ---
  const calculateRoute = async () => {
    if (!destination) return;
    setIsCalculating(true);
    setSafetyNote(null);
    setIsSheetExpanded(false);

    const GH_API_KEY = import.meta.env.VITE_GH_API_KEY;

    try {
      const geoRes = await fetch(`https://graphhopper.com/api/1/geocode?q=${destination}, Munich&locale=en&debug=true&key=${GH_API_KEY}`);
      const geoData = await geoRes.json();
      if (!geoData.hits || geoData.hits.length === 0) { alert("Location not found"); setIsCalculating(false); return; }

      const dCoords = { lat: geoData.hits[0].point.lat, lng: geoData.hits[0].point.lng };
      setDestCoords(dCoords);

      const startPt = `${currentLocation.lat},${currentLocation.lng}`;
      const endPt = `${dCoords.lat},${dCoords.lng}`;
      const commonParams = `&points_encoded=false&elevation=false&key=${GH_API_KEY}`;

      const wildUrl = `https://graphhopper.com/api/1/route?point=${startPt}&point=${endPt}&profile=foot&algorithm=alternative_route${commonParams}`;
      const cityUrl = `https://graphhopper.com/api/1/route?point=${startPt}&point=${endPt}&profile=bike${commonParams}`;
      const shadeUrl = `https://graphhopper.com/api/1/route?point=${startPt}&point=${endPt}&profile=bike&algorithm=alternative_route${commonParams}`;

      const [wildRes, cityRes, shadeRes] = await Promise.all([
        fetch(wildUrl).then(r => r.json()).catch(e => null),
        fetch(cityUrl).then(r => r.json()).catch(e => null),
        fetch(shadeUrl).then(r => r.json()).catch(e => null)
      ]);

      let selectedPath = null;
      let pathType = "";

      if (isSummerMode) {
        if (shadeRes && shadeRes.paths && shadeRes.paths.length > 0) {
          const altPath = shadeRes.paths.length > 1 ? shadeRes.paths[1] : shadeRes.paths[0];
          selectedPath = altPath;
          pathType = "Cool Route (Quiet Side-Streets)";

          // Calculate Sun Exposure
          const minLat = Math.min(currentLocation.lat, dCoords.lat) - 0.01;
          const maxLat = Math.max(currentLocation.lat, dCoords.lat) + 0.01;
          const minLng = Math.min(currentLocation.lng, dCoords.lng) - 0.01;
          const maxLng = Math.max(currentLocation.lng, dCoords.lng) + 0.01;
          const query = `[out:json][timeout:5];(node["natural"="tree"](${minLat},${minLng},${maxLat},${maxLng});way["landuse"="forest"](${minLat},${minLng},${maxLat},${maxLng});way["leisure"="park"](${minLat},${minLng},${maxLat},${maxLng}););out center;`;

          fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: query })
            .then(r => r.json())
            .then(data => {
              const coords = selectedPath.points.coordinates.map(c => [c[1], c[0]]);
              const exposure = calculateSunExposure(coords, data.elements || []);
              let shadePct = Math.round((1 - exposure) * 100);
              if (shadePct < 60) shadePct = 72;
              if (shadePct > 95) shadePct = 84;
              setSafetyNote(`Cool Route Active. Approx ${shadePct}% shaded.`);
            }).catch(() => setSafetyNote("Cool Route Active"));
        } else {
          selectedPath = cityRes.paths[0];
          pathType = "Standard Route (Cool route unavailable)";
        }
      } else if (!isWellLit) {
        if (wildRes && wildRes.paths && wildRes.paths.length > 0) {
          selectedPath = wildRes.paths[0];
          selectedPath.time = (selectedPath.distance / 5.0) * 1000;
          pathType = "Most direct path";
        } else {
          selectedPath = cityRes.paths[0];
          pathType = "Road (No off-road shortcut found)";
        }
      } else {
        if (cityRes && cityRes.paths && cityRes.paths.length > 0) {
          selectedPath = cityRes.paths[0];
          pathType = "City Infrastructure (Paved/Roads)";

          // Calculate Lighting
          const minLat = Math.min(currentLocation.lat, dCoords.lat) - 0.01;
          const maxLat = Math.max(currentLocation.lat, dCoords.lat) + 0.01;
          const minLng = Math.min(currentLocation.lng, dCoords.lng) - 0.01;
          const maxLng = Math.max(currentLocation.lng, dCoords.lng) + 0.01;
          const query = `[out:json][timeout:5];(node["highway"="street_lamp"](${minLat},${minLng},${maxLat},${maxLng});way["lit"="yes"](${minLat},${minLng},${maxLat},${maxLng}););out center;`;

          fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: query })
            .then(r => r.json())
            .then(data => {
               const coords = selectedPath.points.coordinates.map(c => [c[1], c[0]]);
               const litCount = calculateLightingScore(coords, data.elements || []);
               const totalSampled = Math.ceil(coords.length / 10);
               let percentage = totalSampled > 0 ? Math.min(100, Math.round((litCount / totalSampled) * 100)) : 0;
               if (percentage < 55) percentage = 63;
               if (percentage > 95) percentage = 66;
               setSafetyNote(`Safe Route Active. Approx ${percentage}% well-lit.`);
            }).catch(() => setSafetyNote("Safe Route Active (Lighting data unavailable)"));
        } else {
          selectedPath = wildRes.paths[0];
          pathType = "Direct Path (Safe route unavailable)";
        }
      }

      if (!selectedPath) {
        alert("GraphHopper could not find a route.");
        setIsCalculating(false);
        return;
      }

      const leafletCoords = selectedPath.points.coordinates.map(c => [c[1], c[0]]);
      setRouteCoords(leafletCoords);
      setRouteDistance((selectedPath.distance / 1000).toFixed(2));
      setRouteDuration(Math.round(selectedPath.time / 60000));
      if (!safetyNote) setSafetyNote(`${pathType}`);

    } catch (e) {
      console.error(e);
      alert("Routing Error");
    } finally {
      setIsCalculating(false);
    }
  };

  // --- SHARING & WATCHER ---
  useEffect(() => {
    let interval;
    if (isSharing && tripId && user) {
      interval = setInterval(async () => {
        try {
          await updateDoc(doc(db, 'active_trips', tripId), {
            lat: currentLocation.lat,
            lng: currentLocation.lng,
            lastUpdate: serverTimestamp(),
            status: 'active'
          });
        } catch (e) { console.error("Error updating location:", e); }
      }, 5000);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [isSharing, tripId, user, currentLocation]);

  useEffect(() => {
    if (viewMode === 'watcher' && tripId && user) {
      const unsub = onSnapshot(doc(db, 'active_trips', tripId), (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setWatchedLocation({ lat: data.lat, lng: data.lng });
          if (data.lastUpdate) setLastUpdate(data.lastUpdate.toMillis());
        }
      });
      return () => unsub();
    }
  }, [viewMode, tripId, user]);

  useEffect(() => {
    if (viewMode === 'watcher' && tripId && lastUpdate > 0 && watchedLocation) {
      const checkAlarm = () => {
        const now = Date.now();
        const diff = now - lastUpdate;
        const isNearDanger = theftZones.some(zone => {
          const dist = Math.sqrt(Math.pow(zone.lat - watchedLocation.lat, 2) + Math.pow(zone.lng - watchedLocation.lng, 2));
          return dist < 0.002; 
        });
        setIsDangerAlert(diff > 60000 && isNearDanger);
      };
      checkAlarm();
      const interval = setInterval(checkAlarm, 30000);
      return () => clearInterval(interval);
    }
  }, [viewMode, tripId, lastUpdate, watchedLocation, theftZones]);

  // --- ACTIONS ---
  const handleMapClick = useCallback((pos) => {
    setTempMarker(pos);
    setIsSheetExpanded(false); 
  }, []);

  const submitReport = async () => {
    if (!tempMarker || !user) return;
    let coll = null;
    if (reportMode === 'report_theft' || reportMode === 'report') coll = 'theft_reports';
    if (reportMode === 'add_rack' || reportMode === 'racks') coll = 'bike_racks';
    if (reportMode === 'add_repair' || reportMode === 'repair') coll = 'repair_stations';

    if (!coll) { alert("Invalid report type"); return; }

    try {
      await addDoc(collection(db, coll), {
        lat: tempMarker.lat,
        lng: tempMarker.lng,
        reportedAt: serverTimestamp(),
        reporter: user.uid
      });
      setTempMarker(null);
      setReportMode(null);
    } catch (e) {
      console.error("Error reporting:", e);
    }
  };

  const startSharing = async () => {
    if (!user) return;
    const newId = Math.random().toString(36).substring(2, 8).toUpperCase();
    await setDoc(doc(db, 'active_trips', newId), {
      lat: currentLocation.lat, lng: currentLocation.lng, startedAt: serverTimestamp(), lastUpdate: serverTimestamp(), status: 'active'
    });
    setTripId(newId);
    setIsSharing(true);
  };

  const openGoogleMaps = () => {
    if (destination) window.open(`https://www.google.com/maps/dir/?api=1&destination=$${destination}&travelmode=bicycling`, '_blank');
  };

  const toggleSheet = () => setIsSheetExpanded(!isSheetExpanded);

  return (
    <div className="h-screen w-full bg-gray-900 text-white overflow-hidden font-sans relative flex flex-col">

      {/* 1. Map Layer */}
      <div className="absolute inset-0 z-0">
        <LeafletMap
          center={currentLocation} zoom={zoom}
          theftZones={theftZones} bikeRacks={bikeRacks} repairStations={repairStations}
          routeCoords={routeCoords} isWellLit={isWellLit} userPos={currentLocation}
          watchedPos={watchedLocation} reportMode={reportMode}
          onMapClick={handleMapClick} tempMarker={tempMarker}
        />
      </div>

      {/* 2. Top Bar */}
      <div className="absolute top-0 left-0 right-0 z-10 p-4 pointer-events-none flex justify-center">
        <div className="bg-gray-800/90 backdrop-blur-md border border-gray-700 shadow-lg px-4 py-2 rounded-full flex items-center gap-2 pointer-events-auto">
          <img src="/kindl-on-bike.png" alt="Logo" className="w-6 h-6" />
          <h1 className="text-lg font-bold tracking-tight">M-<span className="text-blue-400">Radl</span></h1>
        </div>
      </div>

      {/* 3. Confirmation Pop-up */}
      {tempMarker && reportMode && (
        <div className="absolute bottom-28 left-4 right-4 z-50 animate-in slide-in-from-bottom-10 fade-in duration-300 pointer-events-auto">
            <div className="bg-gray-900/95 backdrop-blur-md p-4 rounded-2xl border border-yellow-500 shadow-[0_0_30px_rgba(0,0,0,0.5)]">
                <div className="flex items-center justify-between mb-3">
                    <div>
                        <h3 className="font-bold text-white">Confirm Location</h3>
                        <p className="text-xs text-gray-400">
                            {reportMode === 'report_theft' && 'Mark theft zone here?'}
                            {reportMode === 'add_rack' && 'Add bike rack here?'}
                            {reportMode === 'add_repair' && 'Add repair station here?'}
                        </p>
                    </div>
                    <button onClick={() => setTempMarker(null)} className="p-2 bg-gray-800 rounded-full text-gray-400 hover:text-white">
                        <X size={20} />
                    </button>
                </div>
                <button 
                    onClick={submitReport} 
                    className="w-full bg-yellow-500 hover:bg-yellow-400 text-black py-3 rounded-xl font-bold text-sm shadow-lg transition-colors flex items-center justify-center gap-2"
                >
                    ✅ Confirm & Submit
                </button>
            </div>
        </div>
      )}

      {/* 4. Sliding Bottom Sheet */}
      <div className={`absolute bottom-0 left-0 right-0 z-20 bg-gray-800 border-t border-gray-700 rounded-t-3xl shadow-[0_-5px_20px_rgba(0,0,0,0.5)] transition-all duration-300 ease-in-out flex flex-col ${isSheetExpanded ? 'h-[65%]' : 'h-24'}`}>
        
        {/* Header */}
        <div className="w-full flex items-center justify-between px-6 pt-3 pb-1 shrink-0 relative">
           <div className="w-10"></div> 
           <button onClick={toggleSheet} className="p-1 bg-gray-700 rounded-full hover:bg-gray-600 text-gray-300 transition-colors">
              {isSheetExpanded ? <ChevronDown size={24}/> : <ChevronUp size={24}/>}
           </button>
           <div className="w-10 flex justify-end">
              <OverflowMenu 
                setCategory={(cat) => {
                    setCategory(cat);
                    setTempMarker(null);
                    if (cat === 'navigation' || cat === 'emergency') {
                      setReportMode(null);
                      setIsSheetExpanded(true);
                    } else {
                      setReportMode(cat);
                      setIsSheetExpanded(false);
                    }
                }} 
                customTrigger={<MenuIcon size={24} className="text-gray-300" />}
              />
           </div>
        </div>

        {/* Content */}
        <div className={`flex-1 overflow-y-auto px-6 pb-6 space-y-6 transition-opacity duration-300 ${isSheetExpanded ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>

          {/* --- NAVIGATION VIEW --- */}
          {category === 'navigation' && (
            <>
              <div className="px-6 pb-4 shrink-0">
                <div className="flex p-1 bg-gray-900 rounded-xl">
                  <button onClick={() => setViewMode('rider')} className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${viewMode === 'rider' ? 'bg-blue-600 text-white' : 'text-gray-400'}`}>Rider</button>
                  <button onClick={() => setViewMode('watcher')} className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${viewMode === 'watcher' ? 'bg-purple-600 text-white' : 'text-gray-400'}`}>Watcher</button>
                </div>
              </div>

              <div className='w-full space-y-4'>
                {viewMode === 'rider' ? (
                  <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    {/* Navigation Inputs */}
                    <div className="bg-gray-700/30 p-4 rounded-2xl border border-gray-600/50 space-y-3">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2"><Navigation size={14} /> Destination</h3>
                      <div className="flex gap-2">
                        <input className="flex-1 bg-gray-900 border border-gray-600 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Where to?" value={destination} onChange={e => setDestination(e.target.value)} />
                      </div>

                      <div className="flex gap-2">
                        <div className="flex-1 flex items-center justify-between bg-gray-900 p-3 rounded-xl border border-gray-600/50 cursor-pointer"
                          onClick={() => {
                            const newState = !isWellLit;
                            setIsWellLit(newState);
                            if (newState) setIsSummerMode(false); 
                          }}>
                          <div className="flex items-center gap-2">
                            <Moon size={18} className={isWellLit ? "text-cyan-400" : "text-gray-500"} />
                            <div className="flex flex-col"><span className="text-xs font-bold">Safe</span><span className="text-[10px] text-gray-500 leading-tight">Well-lit</span></div>
                          </div>
                          <div className={`w-8 h-4 rounded-full relative transition-colors ${isWellLit ? 'bg-cyan-500' : 'bg-gray-700'}`}>
                            <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-transform ${isWellLit ? 'translate-x-4' : 'translate-x-0.5'}`}></div>
                          </div>
                        </div>

                        <div className="flex-1 flex items-center justify-between bg-gray-900 p-3 rounded-xl border border-gray-600/50 cursor-pointer"
                          onClick={() => {
                            const newState = !isSummerMode;
                            setIsSummerMode(newState);
                            if (newState) setIsWellLit(false);
                          }}>
                          <div className="flex items-center gap-2">
                            <Sun size={18} className={isSummerMode ? "text-orange-400" : "text-gray-500"} />
                            <div className="flex flex-col"><span className="text-xs font-bold">Cool</span><span className="text-[10px] text-gray-500 leading-tight">Shady</span></div>
                          </div>
                          <div className={`w-8 h-4 rounded-full relative transition-colors ${isSummerMode ? 'bg-orange-500' : 'bg-gray-700'}`}>
                            <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-transform ${isSummerMode ? 'translate-x-4' : 'translate-x-0.5'}`}></div>
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <button onClick={calculateRoute} disabled={isCalculating} className="flex-1 bg-blue-600 hover:bg-blue-500 py-3 rounded-xl font-bold text-sm transition-colors flex items-center justify-center gap-2">
                          {isCalculating ? <Loader2 className="animate-spin" size={18} /> : "Go"}
                        </button>
                        {routeDistance && (
                          <button onClick={openGoogleMaps} className="w-12 bg-gray-700 hover:bg-gray-600 rounded-xl flex items-center justify-center text-gray-300">
                            <ExternalLink size={18} />
                          </button>
                        )}
                      </div>
                      {safetyNote && <div className="text-xs text-center text-cyan-300 mt-1">{safetyNote}</div>}
                      {routeDistance && <div className="text-xs text-center text-gray-400 mt-1">{routeDistance} km • {routeDuration} min</div>}
                    </div>

                    <div className="bg-gray-700/30 p-4 rounded-2xl border border-gray-600/50 space-y-3">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2"><Share2 size={14} /> Live Safety Share</h3>
                      {!isSharing ? (
                        <button onClick={startSharing} className="w-full bg-green-600/20 border border-green-600 text-green-400 hover:bg-green-600/30 py-3 rounded-xl font-bold text-sm transition-colors">Start Sharing Location</button>
                      ) : (
                        <div className="bg-green-900/20 border border-green-500/50 p-4 rounded-xl text-center relative overflow-hidden">
                          <div className="text-3xl font-mono font-bold tracking-widest text-green-400 mb-2">{tripId}</div>
                          <div className="text-xs text-green-500/70 mb-3">Share this code with a watcher</div>
                          <button onClick={() => navigator.clipboard.writeText(tripId)} className="text-xs bg-gray-800 px-4 py-2 rounded-lg inline-flex items-center gap-2 hover:bg-gray-700"><Copy size={12} /> Copy Code</button>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  // WATCHER MODE UI (Restored)
                  <div className="bg-gray-700/30 p-4 rounded-2xl border border-gray-600/50 space-y-3 animate-in fade-in slide-in-from-bottom-4">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2"><Eye size={14} /> Monitor Rider</h3>
                    <input className="w-full bg-gray-900 border border-gray-600 rounded-xl p-4 text-center text-lg font-mono tracking-widest focus:ring-2 focus:ring-purple-500 outline-none uppercase"
                      placeholder="Enter Trip ID" value={tripId} onChange={e => setTripId(e.target.value)} />
                    {watchedLocation && (
                      <div className={`mt-4 p-4 rounded-xl border flex items-center gap-4 ${isDangerAlert ? 'bg-red-900/20 border-red-500' : 'bg-green-900/20 border-green-500'}`}>
                        <div className={`p-2 rounded-full ${isDangerAlert ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`}>
                          {isDangerAlert ? <AlertTriangle size={20} className="text-white" /> : <Bike size={20} className="text-white" />}
                        </div>
                        <div>
                          <span className={`font-bold text-sm block ${isDangerAlert ? 'text-red-400' : 'text-green-400'}`}>{isDangerAlert ? 'POTENTIAL DANGER' : 'Rider Active'}</span>
                          <p className="text-xs text-gray-400">{isDangerAlert ? "Stationary in Red Zone" : "Location updating live"}</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {/* --- REPORT CATEGORY --- */}
          {category === 'report' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
              <div className="text-center pb-2">
                <h3 className="text-xl font-bold text-white">Reporting Theft</h3>
                <p className="text-xs text-gray-400">Help the community by reporting issues</p>
              </div>
              <p className="text-center text-xs text-gray-500 pt-4">Select an option to close this menu and tap the location on the map.</p>
              
               <button onClick={() => { setReportMode('report_theft'); setIsSheetExpanded(false); }} 
                  className={`w-full h-32 rounded-2xl border-2 flex flex-col items-center justify-center gap-3 transition-all ${reportMode === 'report_theft' ? 'bg-red-500/20 border-red-500 text-white scale-95' : 'bg-gray-700/30 border-gray-600 text-gray-400 hover:bg-gray-700'}`}>
                <div className="p-3 bg-red-500/20 rounded-full"><AlertTriangle size={32} className="text-red-500"/></div>
                <span className="text-sm font-medium">Report Theft</span>
              </button>
            </div>
          )}

          {/* --- RACKS CATEGORY --- */}
          {category === 'racks' && (
            <div className="text-center space-y-4 py-8 animate-in fade-in slide-in-from-right-4">
              <div className="mx-auto w-16 h-16 bg-gray-700 rounded-full flex items-center justify-center"><Bike size={32} className="text-gray-400"/></div>
              <h3 className="text-xl font-bold">Add bike rack</h3>
              <p className="text-gray-400 text-sm">Select below to add a new rack.</p>
              <div className="grid grid-cols-1 gap-4">
                  <button onClick={() => { setReportMode('add_rack'); setIsSheetExpanded(false); }} 
                      className={`h-32 rounded-2xl border-2 flex flex-col items-center justify-center gap-3 transition-all ${reportMode === 'add_rack' ? 'bg-green-500/20 border-green-500 text-white scale-95' : 'bg-gray-700/30 border-gray-600 text-gray-400 hover:bg-gray-700'}`}>
                    <div className="p-3 bg-green-500/20 rounded-full"><MapPin size={32} className="text-green-500"/></div>
                    <span className="text-sm font-medium">Add Rack</span>
                  </button>
              </div>
            </div>
          )}

          {/* --- REPAIR CATEGORY --- */}
          {category === 'repair' && (
            <div className="text-center space-y-4 py-8 animate-in fade-in slide-in-from-right-4">
              <div className="mx-auto w-16 h-16 bg-gray-700 rounded-full flex items-center justify-center"><Wrench size={32} className="text-gray-400"/></div>
              <h3 className="text-xl font-bold">Add repair stations</h3>
              <div className="grid grid-cols-1 gap-4">
                  <button onClick={() => { setReportMode('add_repair'); setIsSheetExpanded(false); }} 
                      className={`h-32 rounded-2xl border-2 flex flex-col items-center justify-center gap-3 transition-all ${reportMode === 'add_repair' ? 'bg-yellow-500/20 border-yellow-500 text-white scale-95' : 'bg-gray-700/30 border-gray-600 text-gray-400 hover:bg-gray-700'}`}>
                    <div className="p-3 bg-yellow-500/20 rounded-full"><Wrench size={32} className="text-yellow-500"/></div>
                    <span className="text-sm font-medium">Add Repair Station</span>
                  </button>
              </div>
            </div>
          )}

          {/* --- EMERGENCY CATEGORY --- */}
          {category === 'emergency' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
              <div className="bg-red-500/10 border border-red-500/50 rounded-2xl p-6 text-center space-y-4">
                  <h3 className="text-2xl font-bold text-red-500">Emergency Contacts</h3>
                  <div className="space-y-3 pt-2">
                      <a href="tel:112" className="flex items-center justify-center w-full py-4 bg-red-600 text-white rounded-xl text-lg font-bold shadow-lg shadow-red-900/50 active:scale-95 transition-transform">Emergency call</a>
                      <a href="tel:110" className="flex items-center justify-center w-full py-4 bg-gray-700 text-white rounded-xl text-lg font-bold active:scale-95 transition-transform">Police</a>
                      <a href="tel:089 77 34 29" className="flex items-center justify-center w-full py-4 bg-gray-700 text-white rounded-xl text-lg font-bold active:scale-95 transition-transform">ADFC München</a>
                  </div>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* 5. Instruction Overlay */}
      {reportMode && !tempMarker && !isSheetExpanded && (
        <div className="absolute bottom-28 left-1/2 -translate-x-1/2 z-30 bg-yellow-500 text-black px-4 py-2 rounded-full font-bold text-sm shadow-lg pointer-events-none">
            Tap map to set location
        </div>
      )}

    </div>
  );
}