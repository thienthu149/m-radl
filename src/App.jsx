import React, { useState, useEffect, useCallback } from 'react';
import { MapPin, Navigation, AlertTriangle, Bike, Share2, Eye, Menu, X, Sun, Moon, Copy, ExternalLink, Loader2 } from 'lucide-react';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { collection, addDoc, onSnapshot, doc, updateDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from './config/firebase';
import LeafletMap from './components/LeafletMap';
import { Wrench } from 'lucide-react';

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
  const [user, setUser] = useState(null);
  const [viewMode, setViewMode] = useState('rider'); 
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
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
    const unsubThefts = onSnapshot(collection(db, 'theft_reports'), (s) => {
      //the database has no theft zones yet, so we use hardcoded test zones for now
      const realZones = s.docs.map(d => ({ id: d.id, ...d.data() }));
      // --- HARDCODED TEST ZONES ---
      const testZones = [
          // Zone 1: Very close to default Munich start (Active Danger)
          { id: 'test-zone-1', lat: 48.1351, lng: 11.5820 }, 
          { id: 'test-zone-2', lat: 48.1500, lng: 11.5900 },
          { id: 'test-zone-3', lat: 48.1400, lng: 11.5600 }
      ];
      setTheftZones(s.docs.map(d => ({ id: d.id, ...d.data() })))
    }
    );
    const unsubRacks = onSnapshot(collection(db, 'bike_racks'), (s) => 
      setBikeRacks(s.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    const unsubRepair = onSnapshot(collection(db, 'repair_stations'), (s) =>
      setRepairStations(s.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    return () => { unsubThefts(); unsubRacks(); unsubRepair();};
  }, [user]);

  // --- ROUTING ENGINE (GraphHopper Version) --- AI STUDIOS
const calculateRoute = async () => {
  if (!destination) return;
  setIsCalculating(true);
  setSafetyNote(null);

  
  const GH_API_KEY = import.meta.env.VITE_GH_API_KEY

  try {
    // 1. Geocode (Keeping Nominatim as it's free and works)
    const geoRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${destination}, Munich`);
    const geoData = await geoRes.json();
    if (!geoData.length) { alert("Location not found"); setIsCalculating(false); return; }
    
    const dCoords = { lat: parseFloat(geoData[0].lat), lng: parseFloat(geoData[0].lon) };
    setDestCoords(dCoords);

    // 2. PREPARE GRAPHHOPPER URLS
    const startPt = `${currentLocation.lat},${currentLocation.lng}`;
    const endPt = `${dCoords.lat},${dCoords.lng}`;
    
    // Common params: calculate points, no encoded polyline (easier to read), imperial false
    const commonParams = `&points_encoded=false&elevation=false&key=${GH_API_KEY}`;

    // ROUTE A: THE "WILD" ROUTE (Parks/Woods/Gravel)
    // Use 'foot' because 'mtb' requires a paid plan. 
    // 'foot' successfully finds paths through parks/woods that 'bike' ignores.
    const wildUrl = `https://graphhopper.com/api/1/route?point=${startPt}&point=${endPt}&profile=foot&algorithm=alternative_route${commonParams}`;

    // ROUTE B: THE "CITY" ROUTE (Asphalt/Roads)
    // We use 'bike' (City Bike) which hates unpaved surfaces.
    // We use 'fastest' to stick to main infrastructure.
    const cityUrl = `https://graphhopper.com/api/1/route?point=${startPt}&point=${endPt}&profile=bike${commonParams}`;

    // Fetch both simultaneously
    const [wildRes, cityRes] = await Promise.all([
        fetch(wildUrl).then(r => r.json()).catch(e => console.error(e)),
        fetch(cityUrl).then(r => r.json()).catch(e => console.error(e))
    ]);

    let selectedPath = null;
    let pathType = "";

    // --- SELECTION LOGIC ---

    if (!isWellLit) {
        // === NON-SAFE MODE (Direct/Shortest) ===
        // We use the FOOT path (wildRes) because it finds the geometric shortcut 
        // through parks/woods that standard bike algorithms ignore.
        if (wildRes && wildRes.paths && wildRes.paths.length > 0) {
            selectedPath = wildRes.paths[0];
            // We estimate the duration for a BIKE (not walking speed)
            // A rough estimate is that a bike is ~3-4x faster than walking.
            // GraphHopper 'foot' times are very slow, so we recalculate:
            selectedPath.time = (selectedPath.distance / 5.0) * 1000; // approx 18km/h in ms
            
            pathType = "Most direct path";
        } else {
            // Fallback
            selectedPath = cityRes.paths[0];
            pathType = "Road (No off-road shortcut found)";
        }
    }
    else {
        // === SAFE MODE (Lit/Roads) ===
        // We strictly pick the City Bike path.
        // This path avoids dark alleys and mud, sticking to street-lit infrastructure.
        if (cityRes && cityRes.paths && cityRes.paths.length > 0) {
            selectedPath = cityRes.paths[0];
            pathType = "City Infrastructure (Paved/Roads)";

            // --- OPTIONAL: Run your Lighting Score on this path just for display ---
            const minLat = Math.min(currentLocation.lat, dCoords.lat) - 0.01;
            const maxLat = Math.max(currentLocation.lat, dCoords.lat) + 0.01;
            const minLng = Math.min(currentLocation.lng, dCoords.lng) - 0.01;
            const maxLng = Math.max(currentLocation.lng, dCoords.lng) + 0.01;
            
            // (We do this asynchronously to not block the UI rendering the route immediately)
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
    // GraphHopper returns time in milliseconds
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

useEffect(() => {
  let interval;

  if (isSharing && tripId && user) {
    // 1. Start the interval only if all conditions are met
    interval = setInterval(async () => {
      try {
        const tripRef = doc(db, 'active_trips', tripId);
        
        // 2. The update logic is correct
        await updateDoc(tripRef, {
          lat: currentLocation.lat,
          lng: currentLocation.lng,
          lastUpdate: serverTimestamp(),
          status: 'active'
        });
      } catch (e) {
        console.error("Error updating location:", e);
      }
    }, 5000);
  }

  // 3. Cleanup function to clear the interval when the component unmounts 
  // or when dependencies change (and the effect runs again).
  return () => {
    if (interval) {
      clearInterval(interval);
    }
  };
// 4. Dependency Array: The effect MUST re-run when these values change.
}, [isSharing, tripId, user, currentLocation]);


// WATCHER EFFECT - Listens to location updates
  useEffect(() => {
    if (viewMode === 'watcher' && tripId && user) {
      console.log("Connecting to DB for Trip:", tripId);

      const unsub = onSnapshot(doc(db, 'active_trips', tripId), (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setWatchedLocation({ lat: data.lat, lng: data.lng });
          
          if (data.lastUpdate) {
            setLastUpdate(data.lastUpdate.toMillis());
          }
        } else {
          console.log("Document does not exist!");
        }
      });
      return () => unsub();
    }
  }, [viewMode, tripId, user]);

  // ALARM CHECK EFFECT - Runs on fixed 30-second interval

  useEffect(() => {
    if (viewMode === 'watcher' && tripId && lastUpdate > 0 && watchedLocation) {
      console.log("Starting alarm check interval (every 30s)");
      
      const checkAlarm = () => {
        const now = Date.now();
        const diff = now - lastUpdate;
        
        // Check if rider is in a danger zone
        const isNearDanger = theftZones.some(zone => {
          const dist = Math.sqrt(
            Math.pow(zone.lat - watchedLocation.lat, 2) + 
            Math.pow(zone.lng - watchedLocation.lng, 2)
          );
          
       
            
          console.log(`Distance to Zone ${zone.id || '?'}: ${dist.toFixed(5)} (Threshold: 0.002)`);
          
          
          return dist < 0.002;//ugf 200m
        });
        
        console.log(`Time since last update: ${diff}ms (${(diff/1000).toFixed(0)}s)`);
        console.log(`In Danger Zone? ${isNearDanger ? 'YES' : 'NO'}`);
        
        // Alert if in danger zone AND no update for 60 seconds (1 minute)
        const shouldTriggerAlert = diff > 60000 && isNearDanger;
        
        console.log(`ALERT STATUS: ${shouldTriggerAlert}`);
        setIsDangerAlert(shouldTriggerAlert);
      };
      
      // Check immediately on mount
      checkAlarm();
      
      // Then check every 30 seconds
      const interval = setInterval(checkAlarm, 30000);
      
      return () => clearInterval(interval);
    }
  }, [viewMode, tripId, lastUpdate, watchedLocation, theftZones]);


  const handleMapClick = useCallback((pos) => {      
    setTempMarker(pos);
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
        // Using custom Modal for feedback instead of blocking alert()
    } catch (e) {
        console.error("Error reporting:", e);
    }

    setReportMode(null);
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

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-white overflow-hidden font-sans">
      <header className="bg-gray-800 border-b border-gray-700 p-4 flex items-center justify-between shadow-md z-20">
        <div className="flex items-center gap-2">
          <img src="/kindl-on-bike.png" alt="Bike" className="w-6 h-6" />
          <h1 className="text-xl font-bold tracking-tight">M-<span className="text-blue-400">Radl</span></h1>
        </div>
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="md:hidden p-2 hover:bg-gray-700 rounded-full"><Menu /></button>
      </header>

      <div className="flex flex-1 relative overflow-hidden">
        <aside className={`${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 transition-transform absolute md:relative z-10 w-80 h-full bg-gray-800 border-r border-gray-700 flex flex-col shadow-xl`}>
             <div className="flex p-2 bg-gray-900 m-4 rounded-lg">
                <button onClick={() => setViewMode('rider')} className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${viewMode === 'rider' ? 'bg-blue-600' : 'text-gray-400'}`}>Rider</button>
                <button onClick={() => setViewMode('watcher')} className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${viewMode === 'watcher' ? 'bg-purple-600' : 'text-gray-400'}`}>Watcher</button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-6 no-scrollbar">
                {viewMode === 'rider' ? (
                   <div className="space-y-4">
                      <div className="bg-gray-700/50 p-4 rounded-xl border border-gray-600 space-y-3">
                         <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2"><Navigation size={16}/> Where to?</h3>
                         <input className="w-full bg-gray-800 border border-gray-600 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none" 
                                placeholder="Destination" value={destination} onChange={e => setDestination(e.target.value)} />
                         <div className="flex items-center justify-between bg-gray-800 p-3 rounded-lg border border-gray-600 cursor-pointer" onClick={() => setIsWellLit(!isWellLit)}>
                            <div className="flex items-center gap-2">{isWellLit ? <Sun size={18} className="text-cyan-400"/> : <Moon size={18} className="text-gray-400"/>} <span className="text-sm">Safe Route</span></div>
                            <div className={`w-10 h-5 rounded-full relative ${isWellLit ? 'bg-cyan-500' : 'bg-gray-600'}`}><div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-transform ${isWellLit ? 'left-6' : 'left-1'}`}></div></div>
                         </div>
                         <button onClick={calculateRoute} disabled={isCalculating} className="w-full bg-blue-600 hover:bg-blue-700 py-2 rounded-lg font-medium flex items-center justify-center gap-2">
                             {isCalculating ? <Loader2 className="animate-spin" size={18}/> : "Find Route"}
                         </button>
                         {safetyNote && <div className="text-xs text-cyan-300 text-center px-2">{safetyNote}</div>}
                      </div>

                      <div className="bg-gray-700/50 p-4 rounded-xl border border-gray-600 space-y-3">
                          <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2"><Share2 size={16}/> Safety Share</h3>
                          {!isSharing ? (
                              <button onClick={startSharing} className="w-full bg-green-600 hover:bg-green-700 py-3 rounded-lg font-medium">Start Safe Trip</button>
                          ) : (
                              <div className="bg-green-900/30 border border-green-500/50 p-3 rounded-lg text-center">
                                  <div className="text-2xl font-mono font-bold tracking-widest mb-2">{tripId}</div>
                                  <button onClick={() => navigator.clipboard.writeText(tripId)} className="text-xs bg-gray-800 px-3 py-1 rounded flex items-center justify-center gap-2 mx-auto"><Copy size={12}/> Copy</button>
                              </div>
                          )}
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                          <button onClick={() => setReportMode('report_theft')} className={`p-3 rounded-xl border flex flex-col items-center gap-2 ${reportMode === 'report_theft' ? 'bg-red-500/20 border-red-500 text-red-400' : 'bg-gray-700/50 border-gray-600 text-gray-400'}`}>
                             <AlertTriangle size={20}/> <span className="text-xs">Report Theft</span>
                          </button>
                          <button onClick={() => setReportMode('add_rack')} className={`p-3 rounded-xl border flex flex-col items-center gap-2 ${reportMode === 'add_rack' ? 'bg-green-500/20 border-green-500 text-green-400' : 'bg-gray-700/50 border-gray-600 text-gray-400'}`}>
                             <MapPin size={20}/> <span className="text-xs">Add bike rack</span>
                          </button>
                    
                          <button onClick={() => setReportMode('add_repair')} className={`p-3 rounded-xl border flex flex-col items-center gap-2 ${reportMode === 'add_repair' ? 'bg-yellow-500/20 border-yellow-500 text-yellow-400' : 'bg-gray-700/50 border-gray-600 text-gray-400'}`}>
                             <Wrench size={20}/><span className="text-xs">Add repair station</span>
                          </button>
                      </div>

                      {/* 1. ANWEISUNG: Nur anzeigen, wenn ein Modus aktiv ist, aber noch kein Marker gesetzt wurde. */}
                      {reportMode && !tempMarker && (
                        <div className="text-center text-xs text-yellow-400 animate-pulse mt-4">Tap map to confirm</div>
                      )}
                      
                      {/* 2. ABSENDE-KNOPF: Nur anzeigen, wenn ein Marker UND ein Modus gesetzt sind. */}
                      {tempMarker && reportMode && (
                        <button 
                          onClick={submitReport} 
                          className="w-full bg-yellow-500 hover:bg-yellow-600 py-3 rounded-lg font-medium text-gray-900 mt-4 shadow-lg transition-colors"
                        >
                          ✅ Position Bestätigen & Melden
                        </button>
                      )}
                      {reportMode && <div className="text-center text-xs text-yellow-400 animate-pulse">Tap map to confirm</div>}

                   </div>
                ) : (
                   <div className="bg-gray-700/50 p-4 rounded-xl border border-gray-600 space-y-3">
                      <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2"><Eye size={16}/> Monitor Trip</h3>
                      <input className="w-full bg-gray-800 border border-gray-600 rounded-lg p-3 text-sm focus:ring-2 focus:ring-purple-500 outline-none uppercase tracking-widest"
                             placeholder="TRIP ID" value={tripId} onChange={e => setTripId(e.target.value)} />
                      {watchedLocation && (
                          <div className={`mt-4 p-4 rounded-lg border ${isDangerAlert ? 'bg-red-900/50 border-red-500 animate-pulse' : 'bg-gray-800 border-green-500'}`}>
                              <span className="font-bold text-sm">{isDangerAlert ? 'POTENTIAL DANGER' : 'Rider Active'}</span>
                              <p className="text-xs text-gray-400">{isDangerAlert ? "Rider stationary in high-risk zone!" : "Location updating..."}</p>
                          </div>
                      )}
                   </div>
                )}
            </div>
        </aside>

        <main className="flex-1 relative bg-gray-900">
             <LeafletMap 
                center={currentLocation} zoom={zoom} theftZones={theftZones} bikeRacks={bikeRacks} repairStations={repairStations}
                routeCoords={routeCoords} isWellLit={isWellLit} userPos={currentLocation}
                watchedPos={watchedLocation} tempMarker={tempMarker} reportMode={reportMode}
                onMapClick={handleMapClick}
             />
        </main>

      </div>
    </div>
  );
}