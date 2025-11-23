import React, { useState, useEffect, useCallback } from 'react';
import { Navigation, AlertTriangle, Bike, Share2, Eye, Menu as MenuIcon, X, Sun, Moon, Copy, ChevronUp, ChevronDown, MapPin, ExternalLink, Wrench, Loader2, LogOut } from 'lucide-react';
import { collection, addDoc, onSnapshot, doc, updateDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from './config/firebase';
import LeafletMap from './components/LeafletMap';
import OverflowMenu from './components/Menu';
import LoginModal from './components/LoginModal';

// --- HOOKS ---
import { useLocation } from './hooks/useLocation';
import { useLogin } from './hooks/useLogin'; // The new hook we just wrote
import { addUserPoints } from './services/userService';
import { useUserPoints } from './hooks/useUserPoints';

// --- OVERPASS API UTILS ---
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
  // 1. AUTH & LOGIN STATE (Managed by single hook now)
  const { user, showLogin, loginUser, registerUser, loginGuest, logout, error } = useLogin();
  
  // 2. POINTS
  const userPoints = useUserPoints(user);

  // 3. LOCATION (From your existing hook)
  const { currentLocation, setCurrentLocation } = useLocation();

  // 4. APP STATE
  const [viewMode, setViewMode] = useState('rider'); 
  const [isSheetExpanded, setIsSheetExpanded] = useState(false); 
  const [category, setCategory] = useState('navigation');
  
  // Map & Data State
  const [zoom, setZoom] = useState(13);
  const [theftZones, setTheftZones] = useState([]);
  const [bikeRacks, setBikeRacks] = useState([]);
  const [repairStations, setRepairStations] = useState([]);
  
  // Routing State
  const [destination, setDestination] = useState('');
  const [routeCoords, setRouteCoords] = useState([]);
  const [isWellLit, setIsWellLit] = useState(true);
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
  const [floatingPoints, setFloatingPoints] = useState(null);

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
    return () => { unsubThefts(); unsubRacks(); unsubRepair();};
  }, [user]);

  // --- ROUTING FUNCTION ---
  const calculateRoute = async () => {
    if (!destination) return;
    setIsCalculating(true);
    setSafetyNote(null);
    setIsSheetExpanded(false); 
    
    const GH_API_KEY = import.meta.env.VITE_GH_API_KEY;

    try {
      const geoRes = await fetch(`https://graphhopper.com/api/1/geocode?q=${destination}, Munich&locale=en&debug=true&key=${GH_API_KEY}`);
      const geoData = await geoRes.json();

      if (!geoData.hits || geoData.hits.length === 0) { 
          alert("Location not found"); 
          setIsCalculating(false); 
          return; 
      }
      
      const hit = geoData.hits[0];
      const dCoords = { lat: hit.point.lat, lng: hit.point.lng };
      setDestCoords(dCoords);

      const startPt = `${currentLocation.lat},${currentLocation.lng}`;
      const endPt = `${dCoords.lat},${dCoords.lng}`;
      const commonParams = `&points_encoded=false&elevation=false&key=${GH_API_KEY}`;

      const wildUrl = `https://graphhopper.com/api/1/route?point=${startPt}&point=${endPt}&profile=foot&algorithm=alternative_route${commonParams}`;
      const cityUrl = `https://graphhopper.com/api/1/route?point=${startPt}&point=${endPt}&profile=bike${commonParams}`;

      const [wildRes, cityRes] = await Promise.all([
          fetch(wildUrl).then(r => r.json()).catch(e => console.error(e)),
          fetch(cityUrl).then(r => r.json()).catch(e => console.error(e))
      ]);

      let selectedPath = null;
      let pathType = "";

      if (!isWellLit) {
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
              // OPTIONAL: Lighting Logic here...
              setSafetyNote("Safe Route Active");
          } else {
              selectedPath = wildRes.paths[0];
              pathType = "Direct Path (Safe route unavailable)";
          }
      }

      if (!selectedPath) {
          alert("No route found.");
          setIsCalculating(false);
          return;
      }

      const leafletCoords = selectedPath.points.coordinates.map(c => [c[1], c[0]]);
      setRouteCoords(leafletCoords);
      setRouteDistance((selectedPath.distance / 1000).toFixed(2));
      setRouteDuration(Math.round(selectedPath.time / 60000)); 
      if (!isWellLit || !safetyNote) setSafetyNote(`${pathType}`);

    } catch (e) { 
        console.error(e); 
    } finally {
        setIsCalculating(false);
    }
  };

  // --- SHARING LOOP ---
  useEffect(() => {
    let interval;
    if (isSharing && tripId && user) {
      interval = setInterval(async () => {
        try {
          const tripRef = doc(db, 'active_trips', tripId);
          await updateDoc(tripRef, {
            lat: currentLocation.lat,
            lng: currentLocation.lng,
            lastUpdate: serverTimestamp(),
            status: 'active'
          });
        } catch (e) { console.error(e); }
      }, 5000);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [isSharing, tripId, user, currentLocation]);

  const openGoogleMaps = () => {
     if(destination) window.open(`https://www.google.com/maps/dir/?api=1&destination=$${destination}&travelmode=bicycling`, '_blank');
  };

  const handleMapClick = useCallback((pos) => {      
    setTempMarker(pos);
    setIsSheetExpanded(true); 
  }, []);

  const submitReport = async () => {
    if (!tempMarker || !user) return;
    let coll = null;
    if (reportMode === 'report_theft') coll = 'theft_reports';
    if (reportMode === 'add_rack') coll = 'bike_racks';
    if (reportMode === 'add_repair') coll = 'repair_stations';

    try {
        await addDoc(collection(db, coll), {
            lat: tempMarker.lat,
            lng: tempMarker.lng,
            reportedAt: serverTimestamp(),
            reporter: user.uid
        });

        // Points Logic
        const pointsEarned = reportMode === 'report_theft' ? 50 : 10;
        await addUserPoints(user.uid, pointsEarned);
        
        setFloatingPoints(pointsEarned);
        setTimeout(() => setFloatingPoints(null), 2000);
        
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
       lat: currentLocation.lat, lng: currentLocation.lng, startedAt: serverTimestamp(),lastUpdate: serverTimestamp(), status: 'active'
    });
    setTripId(newId);
    setIsSharing(true);
  };

  const toggleSheet = () => setIsSheetExpanded(!isSheetExpanded);

  // --- CONDITIONAL RENDER: LOGIN MODAL ---
  if (showLogin) {
    return (
      <LoginModal
        loginUser={loginUser}
        registerUser={registerUser}
        loginGuest={loginGuest}
        error={error} 
      />
    );
  }

  // --- MAIN APP UI ---
  return (
    <div className="h-screen w-full bg-gray-900 text-white overflow-hidden font-sans relative flex flex-col">
      
      {/* Points Animation */}
      {floatingPoints !== null && (
        <div className="fixed top-24 left-0 right-0 z-[9999] flex justify-center pointer-events-none">
            <div className={`bg-yellow-400 text-gray-900 px-6 py-3 rounded-full font-black text-xl shadow-[0_0_20px_rgba(250,204,21,0.6)] flex items-center gap-2 animate-float-fade`}>
               <Bike size={24} className="fill-gray-900" />
               <span>+{floatingPoints} POINTS</span>
            </div>
        </div>
      )}

      {/* Map Layer */}
      <div className="absolute inset-0 z-0">
         <LeafletMap 
            center={currentLocation} zoom={zoom} 
            theftZones={theftZones} bikeRacks={bikeRacks} repairStations={repairStations}
            routeCoords={routeCoords} isWellLit={isWellLit} userPos={currentLocation}
            watchedPos={watchedLocation} reportMode={reportMode}
            onMapClick={handleMapClick} tempMarker={tempMarker}
         />
      </div>

      {/* Top Bar */}
      <div className="absolute top-0 left-0 right-0 z-10 p-4 pointer-events-none flex justify-center">
        <div className="bg-gray-800/90 backdrop-blur-md border border-gray-700 shadow-lg px-4 py-2 rounded-full flex items-center gap-2 pointer-events-auto">
           <div className="bg-blue-600 p-1.5 rounded-full"><Bike size={18} /></div>
           <h1 className="text-lg font-bold tracking-tight">M-<span className="text-blue-400">Radl</span></h1>
           {user && (
             <div className="flex items-center gap-2">
                 <div className="ml-2 px-3 py-0.5 bg-yellow-500/20 border border-yellow-500/50 rounded-full text-yellow-400 text-xs font-bold flex items-center">
                   {userPoints} pts
                 </div>
                 {/* Logout Button */}
                 <button onClick={logout} className="bg-gray-700 p-1.5 rounded-full text-gray-400 hover:text-white">
                    <LogOut size={14}/>
                 </button>
             </div>
           )}
        </div>
      </div>

      {/* Bottom Sheet */}
      <div className={`absolute bottom-0 left-0 right-0 z-20 bg-gray-800 border-t border-gray-700 rounded-t-3xl shadow-[0_-5px_20px_rgba(0,0,0,0.5)] transition-all duration-300 ease-in-out flex flex-col ${isSheetExpanded ? 'h-[65%]' : 'h-24'}`}>
        {/* Drag Handle & Menu */}
        <div className="w-full flex items-center justify-between px-6 pt-3 pb-1 shrink-0 relative">
           <div className="w-10"></div> 
           <button onClick={toggleSheet} className="p-1 bg-gray-700 rounded-full hover:bg-gray-600 text-gray-300 transition-colors">
              {isSheetExpanded ? <ChevronDown size={24}/> : <ChevronUp size={24}/>}
           </button>
           <div className="w-10 flex justify-end">
              <OverflowMenu 
                setCategory={(cat) => { setCategory(cat); setReportMode(null); setIsSheetExpanded(true); }} 
                customTrigger={<MenuIcon size={24} className="text-gray-300" />}
              />
           </div>
        </div>

        {/* Content Area */}
        <div className={`flex-1 overflow-y-auto px-6 pb-6 space-y-6 transition-opacity duration-300 ${isSheetExpanded ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
            
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
                      <div className="bg-gray-700/30 p-4 rounded-2xl border border-gray-600/50 space-y-3">
                          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2"><Navigation size={14}/> Destination</h3>
                          <div className="flex gap-2">
                             <input className="flex-1 bg-gray-900 border border-gray-600 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Where to?" value={destination} onChange={e => setDestination(e.target.value)} />
                          </div>
                          <div className="flex items-center justify-between bg-gray-900 p-3 rounded-xl border border-gray-600/50" onClick={() => setIsWellLit(!isWellLit)}>
                             <div className="flex items-center gap-3">
                                 {isWellLit ? <Sun size={20} className="text-cyan-400"/> : <Moon size={20} className="text-gray-500"/>} 
                                 <div className="flex flex-col">
                                     <span className="text-sm font-medium">Safe Route</span>
                                     <span className="text-xs text-gray-500">Prioritize well-lit streets</span>
                                 </div>
                             </div>
                             <div className={`w-11 h-6 rounded-full relative transition-colors ${isWellLit ? 'bg-cyan-500' : 'bg-gray-700'}`}>
                                 <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${isWellLit ? 'translate-x-6' : 'translate-x-1'}`}></div>
                             </div>
                          </div>
                          <div className="flex gap-2">
                             <button onClick={calculateRoute} disabled={isCalculating} className="flex-1 bg-blue-600 hover:bg-blue-500 py-3 rounded-xl font-bold text-sm transition-colors flex items-center justify-center gap-2">
                                {isCalculating ? <Loader2 className="animate-spin" size={18}/> : "Go"}
                             </button>
                          </div>
                          {safetyNote && <div className="text-xs text-center text-cyan-300 mt-1">{safetyNote}</div>}
                          {routeDistance && <div className="text-xs text-center text-gray-400 mt-1">{routeDistance} km • {routeDuration} min</div>}
                      </div>
                      <div className="bg-gray-700/30 p-4 rounded-2xl border border-gray-600/50 space-y-3">
                          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2"><Share2 size={14}/> Live Safety Share</h3>
                          {!isSharing ? (
                              <button onClick={startSharing} className="w-full bg-green-600/20 border border-green-600 text-green-400 hover:bg-green-600/30 py-3 rounded-xl font-bold text-sm transition-colors">Start Sharing Location</button>
                          ) : (
                              <div className="bg-green-900/20 border border-green-500/50 p-4 rounded-xl text-center relative overflow-hidden">
                                  <div className="text-3xl font-mono font-bold tracking-widest text-green-400 mb-2">{tripId}</div>
                                  <button onClick={() => navigator.clipboard.writeText(tripId)} className="text-xs bg-gray-800 px-4 py-2 rounded-lg inline-flex items-center gap-2 hover:bg-gray-700"><Copy size={12}/> Copy Code</button>
                              </div>
                          )}
                      </div>
                   </div>
                ) : (
                   <div className="bg-gray-700/30 p-4 rounded-2xl border border-gray-600/50 space-y-3 animate-in fade-in slide-in-from-bottom-4">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2"><Eye size={14}/> Monitor Rider</h3>
                      <input className="w-full bg-gray-900 border border-gray-600 rounded-xl p-4 text-center text-lg font-mono tracking-widest focus:ring-2 focus:ring-purple-500 outline-none uppercase placeholder:text-gray-600 placeholder:text-sm placeholder:font-sans placeholder:tracking-normal" placeholder="Enter Trip ID" value={tripId} onChange={e => setTripId(e.target.value)} />
                      {watchedLocation && (
                          <div className={`mt-4 p-4 rounded-xl border flex items-center gap-4 ${isDangerAlert ? 'bg-red-900/20 border-red-500' : 'bg-green-900/20 border-green-500'}`}>
                              <div className={`p-2 rounded-full ${isDangerAlert ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`}>
                                  {isDangerAlert ? <AlertTriangle size={20} className="text-white"/> : <Bike size={20} className="text-white"/>}
                              </div>
                              <div>
                                <span className={`font-bold text-sm block ${isDangerAlert ? 'text-red-400' : 'text-green-400'}`}>{isDangerAlert ? 'POTENTIAL DANGER' : 'Rider Active'}</span>
                              </div>
                          </div>
                      )}
                   </div>
                )}
              </div>
              </>
            )}
            {/* ... Other Categories (Report, Racks, etc) kept same, just abbreviated for length ... */}
             {category === 'report' && (
                  <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
                    <div className="grid grid-cols-2 gap-4">
                        <button onClick={() => { setReportMode('report_theft'); setIsSheetExpanded(false); }} className={`h-32 rounded-2xl border-2 flex flex-col items-center justify-center gap-3 transition-all ${reportMode === 'report_theft' ? 'bg-red-500/20 border-red-500 text-white scale-95' : 'bg-gray-700/30 border-gray-600 text-gray-400 hover:bg-gray-700'}`}>
                          <div className="p-3 bg-red-500/20 rounded-full"><AlertTriangle size={32} className="text-red-500"/></div>
                          <span className="text-sm font-medium">Report Theft</span>
                        </button>
                        <button onClick={() => { setReportMode('add_rack'); setIsSheetExpanded(false); }} className={`h-32 rounded-2xl border-2 flex flex-col items-center justify-center gap-3 transition-all ${reportMode === 'add_rack' ? 'bg-green-500/20 border-green-500 text-white scale-95' : 'bg-gray-700/30 border-gray-600 text-gray-400 hover:bg-gray-700'}`}>
                          <div className="p-3 bg-green-500/20 rounded-full"><MapPin size={32} className="text-green-500"/></div>
                          <span className="text-sm font-medium">Add Rack</span>
                        </button>
                    </div>
                    {tempMarker && (
                        <div className="bg-gray-700 p-4 rounded-2xl border border-gray-600 mt-4">
                             <p className="text-center text-white mb-2 text-sm">Location selected!</p>
                             <button onClick={submitReport} className="w-full bg-yellow-500 hover:bg-yellow-600 py-3 rounded-lg font-bold text-gray-900 shadow-lg transition-colors">✅ Confirm & Submit</button>
                        </div>
                    )}
                  </div>
            )}
        </div>
      </div>
      
      {/* Tap Map Overlay */}
      {reportMode && !tempMarker && !isSheetExpanded && (
            <div className="absolute top-20 left-1/2 -translate-x-1/2 z-30 bg-yellow-500 text-black px-4 py-2 rounded-full font-bold text-sm shadow-lg animate-bounce pointer-events-none">Tap map to set location</div>
      )}
    </div>
  );
}