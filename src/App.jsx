import React, { useState, useEffect, useCallback } from 'react';
import { Navigation, AlertTriangle, Bike, Share2, Eye, Menu as MenuIcon, X, Sun, Moon, Copy, ChevronUp, ChevronDown, MapPin, ExternalLink, Wrench, Loader2 } from 'lucide-react';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { collection, addDoc, onSnapshot, doc, updateDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from './config/firebase';
import LeafletMap from './components/LeafletMap';
import OverflowMenu from './components/Menu';
//LoginModal
import LoginModal from './components/LoginModal';
//hooks:
//import { useAuth } from './hooks/useAuth';
import { useLocation } from './hooks/useLocation';
import { useLogin } from './hooks/useLogin.js';

// --- OVERPASS API UTILS ---
const calculateLightingScore = (routeCoords, litElements) => {
    let litPoints = 0;
    const threshold = 0.0004; // Approx 40m tolerance

    // Check every 10th point for performance
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
  //const { user } = useAuth();
  const [viewMode, setViewMode] = useState('rider'); 
  const [isSheetExpanded, setIsSheetExpanded] = useState(false); // Controls bottom sheet height
  const [category, setCategory] = useState('navigation');
  
  // Map & Data State
  const { currentLocation, setCurrentLocation } = useLocation();
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
  const {user, showLogin, loginUser, registerUser, loginGuest, error } = useLogin();


  // --- INIT & AUTH ---
  /*useEffect(() => {
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
  }, []);*/

  // --- FIRESTORE LISTENERS ---
  useEffect(() => {
    if (!user) return;
    const unsubThefts = onSnapshot(collection(db, 'theft_reports'), (s) => {
      //the database has no theft zones yet, so we use hardcoded test zones for now
      const realZones = s.docs.map(d => ({ id: d.id, ...d.data() }));
      setTheftZones(s.docs.map(d => ({ id: d.id, ...d.data() })))
    });
    const unsubRacks = onSnapshot(collection(db, 'bike_racks'), (s) => 
      setBikeRacks(s.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    const unsubRepair = onSnapshot(collection(db, 'repair_stations'), (s) =>
      setRepairStations(s.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    return () => { unsubThefts(); unsubRacks(); unsubRepair();};
  }, [user]);

  // --- ROUTING ENGINE (GraphHopper Version) ---
  // --- ROUTING ENGINE (GraphHopper Version) ---
  const calculateRoute = async () => {
    if (!destination) return;
    setIsCalculating(true);
    setSafetyNote(null);
    setIsSheetExpanded(false); 
    
    const GH_API_KEY = import.meta.env.VITE_GH_API_KEY

    try {
      // 1. Geocode (SWITCHED TO GRAPHHOPPER TO FIX CORS/403 ERROR)
      const geoRes = await fetch(`https://graphhopper.com/api/1/geocode?q=${destination}, Munich&locale=en&debug=true&key=${GH_API_KEY}`);
      const geoData = await geoRes.json();

      // GraphHopper returns results in a "hits" array
      if (!geoData.hits || geoData.hits.length === 0) { 
          alert("Location not found"); 
          setIsCalculating(false); 
          return; 
      }
      
      // GraphHopper structure is slightly different than Nominatim
      const hit = geoData.hits[0];
      const dCoords = { lat: hit.point.lat, lng: hit.point.lng };
      
      setDestCoords(dCoords);

      // 2. PREPARE GRAPHHOPPER URLS (Rest of your code remains the same...)
      const startPt = `${currentLocation.lat},${currentLocation.lng}`;
      const endPt = `${dCoords.lat},${dCoords.lng}`
      const commonParams = `&points_encoded=false&elevation=false&key=${GH_API_KEY}`;

      // ROUTE A: THE "WILD" ROUTE (Parks/Woods/Gravel)
      const wildUrl = `https://graphhopper.com/api/1/route?point=${startPt}&point=${endPt}&profile=foot&algorithm=alternative_route${commonParams}`;

      // ROUTE B: THE "CITY" ROUTE (Asphalt/Roads)
      const cityUrl = `https://graphhopper.com/api/1/route?point=${startPt}&point=${endPt}&profile=bike${commonParams}`;

      // Fetch both simultaneously
      const [wildRes, cityRes] = await Promise.all([
          fetch(wildUrl).then(r => r.json()).catch(e => console.error(e)),
          fetch(cityUrl).then(r => r.json()).catch(e => console.error(e))
      ]);

      let selectedPath = null;
      let pathType = "";

      if (!isWellLit) {
          // === NON-SAFE MODE (Direct/Shortest) ===
          if (wildRes && wildRes.paths && wildRes.paths.length > 0) {
              selectedPath = wildRes.paths[0];
              // Recalculate time for bike speed approx
              selectedPath.time = (selectedPath.distance / 5.0) * 1000; 
              pathType = "Most direct path";
          } else {
              selectedPath = cityRes.paths[0];
              pathType = "Road (No off-road shortcut found)";
          }
      } else {
          // === SAFE MODE (Lit/Roads) ===
          if (cityRes && cityRes.paths && cityRes.paths.length > 0) {
              selectedPath = cityRes.paths[0];
              pathType = "City Infrastructure (Paved/Roads)";

              // OPTIONAL: Run Lighting Score
              const minLat = Math.min(currentLocation.lat, dCoords.lat) - 0.01;
              const maxLat = Math.max(currentLocation.lat, dCoords.lat) + 0.01;
              const minLng = Math.min(currentLocation.lng, dCoords.lng) - 0.01;
              const maxLng = Math.max(currentLocation.lng, dCoords.lng) + 0.01;
              
              const query = `[out:json][timeout:5];(way["lit"="yes"](${minLat},${minLng},${maxLat},${maxLng});node["highway"="street_lamp"](${minLat},${minLng},${maxLat},${maxLng}););out center;`;
              
              fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: query })
                .then(r => r.json())
                .then(data => {
                   const coords = selectedPath.points.coordinates.map(c => [c[1], c[0]]);
                   const score = calculateLightingScore(coords, data.elements || []);
                   const normalized = score / (selectedPath.distance / 1000);
                   setSafetyNote(`Safe Route Active. Lighting Score: ${normalized.toFixed(1)}`);
                })
                .catch(() => setSafetyNote("Safe Route Active (Lighting data unavailable)"));

          } else {
              selectedPath = wildRes.paths[0];
              pathType = "Direct Path (Safe route unavailable)";
          }
      }

      if (!selectedPath) {
          alert("GraphHopper could not find a route. Check API Key.");
          setIsCalculating(false);
          return;
      }

      // 3. Update State
      // GraphHopper GeoJSON is [lng, lat], Leaflet needs [lat, lng]
      const leafletCoords = selectedPath.points.coordinates.map(c => [c[1], c[0]]);
      setRouteCoords(leafletCoords);
      
      setRouteDistance((selectedPath.distance / 1000).toFixed(2));
      setRouteDuration(Math.round(selectedPath.time / 60000)); 
      
      if (!isWellLit || !safetyNote) {
          setSafetyNote(`${pathType}`);
      }

    } catch (e) { 
        console.error(e); 
        alert("Error fetching route. Did you add the API Key?");
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
        } catch (e) { console.error("Error updating location:", e); }
      }, 5000);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [isSharing, tripId, user, currentLocation]);

  // --- WATCHER: LOCATION UPDATES ---
  useEffect(() => {
    if (viewMode === 'watcher' && tripId && user) {
      console.log("Connecting to DB for Trip:", tripId);
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

  // --- WATCHER: ALARM CHECK (30s Interval) ---
  useEffect(() => {
    if (viewMode === 'watcher' && tripId && lastUpdate > 0 && watchedLocation) {
      const checkAlarm = () => {
        const now = Date.now();
        const diff = now - lastUpdate;
        
        const isNearDanger = theftZones.some(zone => {
          const dist = Math.sqrt(
            Math.pow(zone.lat - watchedLocation.lat, 2) + 
            Math.pow(zone.lng - watchedLocation.lng, 2)
          );
          return dist < 0.002; // approx 200m
        });
        
        const shouldTriggerAlert = diff > 60000 && isNearDanger;
        setIsDangerAlert(shouldTriggerAlert);
      };
      
      checkAlarm();
      const interval = setInterval(checkAlarm, 30000);
      return () => clearInterval(interval);
    }
  }, [viewMode, tripId, lastUpdate, watchedLocation, theftZones]);

  const openGoogleMaps = () => {
     if(destination) {
         window.open(`https://www.google.com/maps/dir/?api=1&destination=$${destination}&travelmode=bicycling`, '_blank');
     }
  };

  const handleMapClick = useCallback((pos) => {      
    setTempMarker(pos);
    setIsSheetExpanded(true); // Expand sheet so they can see the "Confirm" button
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
        setTempMarker(null);
        setReportMode(null);
        // Reset view to navigation or just close report mode
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

  //LogIn
  if (showLogin) {
    return (
      <LoginModal
        loginUser={loginUser}
        registerUser={registerUser}
        loginGuest={loginGuest}
        error={null} // oder Error-Handling hier
      />
    );
  }

  return (
    <div className="h-screen w-full bg-gray-900 text-white overflow-hidden font-sans relative flex flex-col">
      
      {/* --- 1. Full Screen Map Layer --- */}
      <div className="absolute inset-0 z-0">
         <LeafletMap 
            center={currentLocation} zoom={zoom} 
            theftZones={theftZones} bikeRacks={bikeRacks} repairStations={repairStations}
            routeCoords={routeCoords} isWellLit={isWellLit} userPos={currentLocation}
            watchedPos={watchedLocation} reportMode={reportMode}
            onMapClick={handleMapClick} tempMarker={tempMarker}
         />
      </div>

      {/* --- 2. Floating Top Bar (Branding Only) --- */}
      <div className="absolute top-0 left-0 right-0 z-10 p-4 pointer-events-none flex justify-center">
        <div className="bg-gray-800/90 backdrop-blur-md border border-gray-700 shadow-lg px-4 py-2 rounded-full flex items-center gap-2 pointer-events-auto">
           <div className="bg-blue-600 p-1.5 rounded-full"><Bike size={18} /></div>
           <h1 className="text-lg font-bold tracking-tight">M-<span className="text-blue-400">Radl</span></h1>
        </div>
      </div>

      {/* --- 3. Sliding Bottom Sheet --- */}
      <div 
        className={`absolute bottom-0 left-0 right-0 z-20 bg-gray-800 border-t border-gray-700 rounded-t-3xl shadow-[0_-5px_20px_rgba(0,0,0,0.5)] transition-all duration-300 ease-in-out flex flex-col
        ${isSheetExpanded ? 'h-[65%]' : 'h-24'}`}
      >
        {/* Sheet Header: Drag Handle & Menu */}
        <div className="w-full flex items-center justify-between px-6 pt-3 pb-1 shrink-0 relative">
           
           {/* Empty div to balance the flex layout */}
           <div className="w-10"></div> 

           {/* Toggle Button (Handle) */}
           <button 
              onClick={toggleSheet} 
              className="p-1 bg-gray-700 rounded-full hover:bg-gray-600 text-gray-300 transition-colors"
           >
              {isSheetExpanded ? <ChevronDown size={24}/> : <ChevronUp size={24}/>}
           </button>

           {/* Hamburger Menu (Top Right) */}
           <div className="w-10 flex justify-end">
              <OverflowMenu 
                setCategory={(cat) => {
                    setCategory(cat);
                    setReportMode(null);
                    setIsSheetExpanded(true); 
                }} 
                customTrigger={<MenuIcon size={24} className="text-gray-300" />}
              />
           </div>
        </div>
        

        {/* Scrollable Content Area (Only visible when expanded) */}
        <div className={`flex-1 overflow-y-auto px-6 pb-6 space-y-6 transition-opacity duration-300 ${isSheetExpanded ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
            
            {/* --- DYNAMIC CONTENT BASED ON CATEGORY --- */}
            {category === 'navigation' && (
              <>
              <div className="px-6 pb-4 shrink-0">
                <div className="flex p-1 bg-gray-900 rounded-xl">
                  <button
                    onClick={() => setViewMode('rider')}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                      viewMode === 'rider' ? 'bg-blue-600 text-white' : 'text-gray-400'
                    }`}
                  >
                    Rider
                  </button>

                  <button
                    onClick={() => setViewMode('watcher')}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                      viewMode === 'watcher' ? 'bg-purple-600 text-white' : 'text-gray-400'
                    }`}
                  >
                    Watcher
                  </button>
              </div>
            </div>
                  <div className='w-full space-y-4'>
                    {viewMode === 'rider' ? (
                   <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                      {/* Navigation Inputs */}
                      <div className="bg-gray-700/30 p-4 rounded-2xl border border-gray-600/50 space-y-3">
                          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2"><Navigation size={14}/> Destination</h3>
                          <div className="flex gap-2">
                             <input className="flex-1 bg-gray-900 border border-gray-600 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none" 
                                    placeholder="Where to?" value={destination} onChange={e => setDestination(e.target.value)} />
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
                             {routeDistance && (
                                 <button onClick={openGoogleMaps} className="w-12 bg-gray-700 hover:bg-gray-600 rounded-xl flex items-center justify-center text-gray-300">
                                     <ExternalLink size={18}/>
                                 </button>
                             )}
                          </div>
                          {safetyNote && <div className="text-xs text-center text-cyan-300 mt-1">{safetyNote}</div>}
                          {routeDistance && <div className="text-xs text-center text-gray-400 mt-1">{routeDistance} km • {routeDuration} min</div>}
                      </div>

                      {/* Share Trip */}
                      <div className="bg-gray-700/30 p-4 rounded-2xl border border-gray-600/50 space-y-3">
                          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2"><Share2 size={14}/> Live Safety Share</h3>
                          {!isSharing ? (
                              <button onClick={startSharing} className="w-full bg-green-600/20 border border-green-600 text-green-400 hover:bg-green-600/30 py-3 rounded-xl font-bold text-sm transition-colors">Start Sharing Location</button>
                          ) : (
                              <div className="bg-green-900/20 border border-green-500/50 p-4 rounded-xl text-center relative overflow-hidden">
                                  <div className="text-3xl font-mono font-bold tracking-widest text-green-400 mb-2">{tripId}</div>
                                  <div className="text-xs text-green-500/70 mb-3">Share this code with a watcher</div>
                                  <button onClick={() => navigator.clipboard.writeText(tripId)} className="text-xs bg-gray-800 px-4 py-2 rounded-lg inline-flex items-center gap-2 hover:bg-gray-700"><Copy size={12}/> Copy Code</button>
                              </div>
                          )}
                      </div>

                   </div>
                ) : (
                   /* Watcher Mode */
                   <div className="bg-gray-700/30 p-4 rounded-2xl border border-gray-600/50 space-y-3 animate-in fade-in slide-in-from-bottom-4">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2"><Eye size={14}/> Monitor Rider</h3>
                      <input className="w-full bg-gray-900 border border-gray-600 rounded-xl p-4 text-center text-lg font-mono tracking-widest focus:ring-2 focus:ring-purple-500 outline-none uppercase placeholder:text-gray-600 placeholder:text-sm placeholder:font-sans placeholder:tracking-normal"
                             placeholder="Enter Trip ID" value={tripId} onChange={e => setTripId(e.target.value)} />
                      {watchedLocation && (
                          <div className={`mt-4 p-4 rounded-xl border flex items-center gap-4 ${isDangerAlert ? 'bg-red-900/20 border-red-500' : 'bg-green-900/20 border-green-500'}`}>
                              <div className={`p-2 rounded-full ${isDangerAlert ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`}>
                                  {isDangerAlert ? <AlertTriangle size={20} className="text-white"/> : <Bike size={20} className="text-white"/>}
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

            {/* Report Category */}
            {category === 'report' && (
                  <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
                    <div className="text-center pb-2">
                        <h3 className="text-xl font-bold text-white">Reporting Tools</h3>
                        <p className="text-xs text-gray-400">Help the community by reporting issues</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <button onClick={() => { setReportMode('report_theft'); setIsSheetExpanded(false); }} 
                            className={`h-32 rounded-2xl border-2 flex flex-col items-center justify-center gap-3 transition-all ${reportMode === 'report_theft' ? 'bg-red-500/20 border-red-500 text-white scale-95' : 'bg-gray-700/30 border-gray-600 text-gray-400 hover:bg-gray-700'}`}>
                          <div className="p-3 bg-red-500/20 rounded-full"><AlertTriangle size={32} className="text-red-500"/></div>
                          <span className="text-sm font-medium">Report Theft</span>
                        </button>
                        <button onClick={() => { setReportMode('add_rack'); setIsSheetExpanded(false); }} 
                            className={`h-32 rounded-2xl border-2 flex flex-col items-center justify-center gap-3 transition-all ${reportMode === 'add_rack' ? 'bg-green-500/20 border-green-500 text-white scale-95' : 'bg-gray-700/30 border-gray-600 text-gray-400 hover:bg-gray-700'}`}>
                          <div className="p-3 bg-green-500/20 rounded-full"><MapPin size={32} className="text-green-500"/></div>
                          <span className="text-sm font-medium">Add Rack</span>
                        </button>
                        <button onClick={() => { setReportMode('add_repair'); setIsSheetExpanded(false); }} 
                            className={`h-32 rounded-2xl border-2 flex flex-col items-center justify-center gap-3 transition-all ${reportMode === 'add_repair' ? 'bg-yellow-500/20 border-yellow-500 text-white scale-95' : 'bg-gray-700/30 border-gray-600 text-gray-400 hover:bg-gray-700'}`}>
                          <div className="p-3 bg-yellow-500/20 rounded-full"><Wrench size={32} className="text-yellow-500"/></div>
                          <span className="text-sm font-medium">Add Repair Station</span>
                        </button>
                    </div>
                    <p className="text-center text-xs text-gray-500 pt-4">Select an option to close this menu and tap the location on the map.</p>
                    
                    {/* CONFIRMATION BUTTON APPEARS HERE IF MARKER SET */}
                    {tempMarker && (
                        <div className="bg-gray-700 p-4 rounded-2xl border border-gray-600 mt-4">
                             <p className="text-center text-white mb-2 text-sm">Location selected!</p>
                             <button 
                               onClick={submitReport} 
                               className="w-full bg-yellow-500 hover:bg-yellow-600 py-3 rounded-lg font-bold text-gray-900 shadow-lg transition-colors"
                             >
                               ✅ Confirm & Submit
                             </button>
                             <button onClick={() => setTempMarker(null)} className="w-full text-xs text-gray-400 mt-2 underline">Cancel selection</button>
                        </div>
                    )}
                  </div>
            )}

            {category === 'racks' && (
                  <div className="text-center space-y-4 py-8">
                    <div className="mx-auto w-16 h-16 bg-gray-700 rounded-full flex items-center justify-center"><Bike size={32} className="text-gray-400"/></div>
                    <h3 className="text-xl font-bold">Add bike rack</h3>
                    <p className="text-gray-400 text-sm">Go to the "Report" menu to add a new rack.</p>
                  </div>
            )}

            {category === 'emergency' && (
                  <div className="space-y-4">
                    <div className="bg-red-500/10 border border-red-500/50 rounded-2xl p-6 text-center space-y-4">
                        <h3 className="text-2xl font-bold text-red-500">Emergency Contacts</h3>
                        <div className="space-y-3 pt-2">
                            <a href="tel:112" className="flex items-center justify-center w-full py-4 bg-red-600 text-white rounded-xl text-lg font-bold shadow-lg shadow-red-900/50 active:scale-95 transition-transform">
                                Emergency call
                            </a>
                            <a href="tel:110" className="flex items-center justify-center w-full py-4 bg-gray-700 text-white rounded-xl text-lg font-bold active:scale-95 transition-transform">
                                Police
                            </a>
                            <a href="tel:089 77 34 29" className="flex items-center justify-center w-full py-4 bg-gray-700 text-white rounded-xl text-lg font-bold active:scale-95 transition-transform">
                                ADFC München
                            </a>
                        </div>
                    </div>
                  </div>
            )}

            {category === 'repair' && (
                  <div className="text-center space-y-4 py-8">
                    <div className="mx-auto w-16 h-16 bg-gray-700 rounded-full flex items-center justify-center"><Wrench size={32} className="text-gray-400"/></div>
                    <h3 className="text-xl font-bold">Add repair stations</h3>
                    <p className="text-gray-400 text-sm">Go to the "Report" menu to add a new station.</p>
                  </div>
            )}
        </div>
      </div>
      
      {/* Overlay for "Tap map" instruction */}
      {reportMode && !tempMarker && !isSheetExpanded && (
            <div className="absolute top-20 left-1/2 -translate-x-1/2 z-30 bg-yellow-500 text-black px-4 py-2 rounded-full font-bold text-sm shadow-lg animate-bounce pointer-events-none">
                Tap map to set location
            </div>
      )}

    </div>
  );
}