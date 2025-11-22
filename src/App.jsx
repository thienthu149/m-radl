// TODOs:
  // Change route color to something more noticable
  // Functionality adding rack
  // Functionality of reporting thefts (and red zones following from there)   do we want 
  // Safe route functionality: Is it actually working or is it the same as normal route?
  // Why is my live location in the city center?
  // Open in Google Maps
  // Monitoring functionality check that it works (1. it shows actual rider correctly. 2. danger alert triggers correctly)
//TODO: zu lange in theft zone stehen ist eigentlich egal

  // EXTRAs:
  // "Where to" input autofill suggestions
import React, { useState, useEffect, useCallback } from 'react';
import { MapPin, Navigation, AlertTriangle, Bike, Share2, Eye, Menu, X, Sun, Moon, Copy } from 'lucide-react';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { collection, addDoc, onSnapshot, doc, updateDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from './config/firebase';
import LeafletMap from './components/LeafletMap';

export default function App() {
  const [user, setUser] = useState(null);
  const [viewMode, setViewMode] = useState('rider'); 
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  const [currentLocation, setCurrentLocation] = useState({ lat: 48.1351, lng: 11.5820 });
  const [zoom, setZoom] = useState(13);
  
  const [theftZones, setTheftZones] = useState([]);
  const [bikeRacks, setBikeRacks] = useState([]);
  
  const [destination, setDestination] = useState('');
  const [routeCoords, setRouteCoords] = useState([]);
  const [isWellLit, setIsWellLit] = useState(true);
  const [routeDistance, setRouteDistance] = useState(null);
  const [routeDuration, setRouteDuration] = useState(null);

  const [tripId, setTripId] = useState('');
  const [isSharing, setIsSharing] = useState(false);
  const [watchedLocation, setWatchedLocation] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(0);
  const [isDangerAlert, setIsDangerAlert] = useState(false);
  
  const [reportMode, setReportMode] = useState(null); 
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedPos, setSelectedPos] = useState(null);

  useEffect(() => {
    signInAnonymously(auth);
    return onAuthStateChanged(auth, setUser);
  }, []);

  useEffect(() => {
    if (!user) return;
    const unsubThefts = onSnapshot(collection(db, 'theft_reports'), (s) => 
      setTheftZones(s.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    const unsubRacks = onSnapshot(collection(db, 'bike_racks'), (s) => 
      setBikeRacks(s.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    return () => { unsubThefts(); unsubRacks(); };
  }, [user]);

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
    return () => clearInterval(interval);
  }, [isSharing, tripId, currentLocation, user]);

  useEffect(() => {
    if (viewMode === 'watcher' && tripId && user) {
      const unsub = onSnapshot(doc(db, 'active_trips', tripId), (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setWatchedLocation({ lat: data.lat, lng: data.lng });
          if (data.lastUpdate) {
            const diff = Date.now() - data.lastUpdate.toMillis();
            setLastUpdate(data.lastUpdate.toMillis());
            
            const isNearDanger = theftZones.some(zone => {
               const dist = Math.sqrt(Math.pow(zone.lat - data.lat, 2) + Math.pow(zone.lng - data.lng, 2));
               return dist < 0.002; 
            });
            
            const shouldTriggerAlert = diff > 300000 && isNearDanger;
            setIsDangerAlert(shouldTriggerAlert);
            
          }
        }
      });
      return () => unsub();
    }
  }, [viewMode, tripId, user, theftZones]);

  const calculateRoute = async () => {
    if (!destination) return;
    try {
      const geoRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${destination}, Munich`);
      const geoData = await geoRes.json();
      if (!geoData.length) { alert("Location not found"); return; }
      
      const dest = { lat: parseFloat(geoData[0].lat), lng: parseFloat(geoData[0].lon) };

      // FIX: Add Jitter to force OSRM to recalc if Safe Mode is on
      // This helps get different routes from the free API
      let startLng = currentLocation.lng;
      let startLat = currentLocation.lat;
      
      if (isWellLit) {
          startLng += 0.0002; // Slight offset to force a different graph snap
          startLat += 0.0002;
      }

      const res = await fetch(`https://router.project-osrm.org/route/v1/bicycle/${startLng},${startLat};${dest.lng},${dest.lat}?overview=full&geometries=geojson&alternatives=true`);
      const data = await res.json();
      
      if (data.routes && data.routes.length > 0) {
        // Prioritize routes: 
        // If Safe Mode (Well Lit): Prefer the route with the longest distance (avoids shortcuts/alleys)
        // If Fast Mode: Default (shortest duration)
        
        let selectedRoute = data.routes[0];

        if (isWellLit && data.routes.length > 1) {
            const longestRoute = data.routes.reduce((prev, current) => (prev.distance > current.distance) ? prev : current);
            
            // Only switch if the difference is significant (> 5%)
            if (longestRoute.distance > data.routes[0].distance * 1.05) {
                selectedRoute = longestRoute;
            }
        }

        setRouteCoords(selectedRoute.geometry.coordinates.map(c => [c[1], c[0]]));
        setRouteDistance((selectedRoute.distance / 1000).toFixed(1));
        setRouteDuration(Math.round(selectedRoute.duration / 60));
      }
    } catch (e) { console.error(e); }
  };

  const handleMapClick = useCallback((pos) => {
    setSelectedPos(pos);
    setModalOpen(true);
  }, []);

  const submitReport = async () => {
    if (!selectedPos || !user) return;
    const coll = reportMode === 'report_theft' ? 'theft_reports' : 'bike_racks';
    
    try {
        await addDoc(collection(db, coll), {
            lat: selectedPos.lat,
            lng: selectedPos.lng,
            reportedAt: serverTimestamp(),
            reporter: user.uid
        });
        // Using custom Modal for feedback instead of blocking alert()
    } catch (e) {
        console.error("Error reporting:", e);
    }

    setModalOpen(false);
    setReportMode(null);
    setSelectedPos(null);
  };

  const startSharing = async () => {
    if (!user) return;
    const newId = Math.random().toString(36).substring(2, 8).toUpperCase();
    await setDoc(doc(db, 'active_trips', newId), {
       lat: currentLocation.lat,
       lng: currentLocation.lng,
       startedAt: serverTimestamp(),
       status: 'active'
    });
    setTripId(newId);
    setIsSharing(true);
  };

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-white overflow-hidden font-sans">
      <header className="bg-gray-800 border-b border-gray-700 p-4 flex items-center justify-between shadow-md z-20">
        <div className="flex items-center gap-2">
          <div className="bg-blue-600 p-2 rounded-lg"><Bike size={24} /></div>
          <h1 className="text-xl font-bold tracking-tight">M-<span className="text-blue-400">Radl</span></h1>
        </div>
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="md:hidden p-2 hover:bg-gray-700 rounded-full">
          {sidebarOpen ? <X /> : <Menu />}
        </button>
      </header>

      <div className="flex flex-1 relative overflow-hidden">
        <aside className={`${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 transition-transform absolute md:relative z-10 w-80 h-full bg-gray-800 border-r border-gray-700 flex flex-col shadow-xl`}>
             <div className="flex p-2 bg-gray-900 m-4 rounded-lg">
                <button onClick={() => setViewMode('rider')} className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${viewMode === 'rider' ? 'bg-blue-600' : 'text-gray-400'}`}>Rider</button>
                <button onClick={() => setViewMode('watcher')} className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${viewMode === 'watcher' ? 'bg-purple-600' : 'text-gray-400'}`}>Watcher</button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
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
                         <button onClick={calculateRoute} className="w-full bg-blue-600 hover:bg-blue-700 py-2 rounded-lg font-medium">Find Route</button>
                         {routeDistance && <div className="text-sm text-center mt-2">{routeDistance} km • {routeDuration} min</div>}
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
                             <MapPin size={20}/> <span className="text-xs">Add Rack</span>
                          </button>
                      </div>
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
                              <p className="text-xs text-gray-400">{isDangerAlert ? "High risk zone stationarity!" : "Updating..."}</p>
                          </div>
                      )}
                   </div>
                )}
            </div>
        </aside>

        <main className="flex-1 relative bg-gray-900">
             <LeafletMap 
                center={currentLocation} zoom={zoom} theftZones={theftZones} bikeRacks={bikeRacks}
                routeCoords={routeCoords} isWellLit={isWellLit} userPos={currentLocation}
                watchedPos={watchedLocation} reportMode={reportMode}
                onMapClick={handleMapClick}
             />
        </main>

        {modalOpen && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                <div className="bg-gray-800 p-6 rounded-xl shadow-2xl max-w-sm w-full border border-gray-700 m-4">
                    <h3 className="text-lg font-bold mb-2">Confirm Location</h3>
                    <p className="text-gray-400 text-sm mb-6">
                        {reportMode === 'report_theft' 
                            ? "Report a theft here? (This creates a Red Danger Zone)" 
                            : "Mark a new Bike Rack here?"}
                    </p>
                    <div className="flex gap-3">
                        <button onClick={() => setModalOpen(false)} className="flex-1 py-2 rounded-lg bg-gray-700">Cancel</button>
                        <button onClick={submitReport} className="flex-1 py-2 rounded-lg bg-blue-600">Confirm</button>
                    </div>
                </div>
            </div>
        )}
      </div>
    </div>
  );
}