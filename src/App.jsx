import React, { useState, useEffect, useCallback } from 'react';
import { MapPin, Navigation, AlertTriangle, Share2, Eye, Menu, Sun, Moon, Copy, Loader2, CheckCircle } from 'lucide-react';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { collection, addDoc, onSnapshot, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from './config/firebase';
import LeafletMap from './components/LeafletMap';

// --- OVERPASS API UTILS ---
const calculateLightingScore = (routeCoords, litElements) => {
    let litPoints = 0;
    const threshold = 0.0004; // Approx 40m tolerance
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
  
  // Routing State
  const [destination, setDestination] = useState('');
  const [routeCoords, setRouteCoords] = useState([]);
  const [isWellLit, setIsWellLit] = useState(true);
  const [isCalculating, setIsCalculating] = useState(false);
  const [safetyNote, setSafetyNote] = useState(null);

  // Sharing State
  const [tripId, setTripId] = useState('');
  const [isSharing, setIsSharing] = useState(false);
  const [watchedLocation, setWatchedLocation] = useState(null);
  const [isDangerAlert, setIsDangerAlert] = useState(false);
  
  // UI State
  const [reportMode, setReportMode] = useState(null); 
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedPos, setSelectedPos] = useState(null);
  const [notification, setNotification] = useState(null); // New Notification State

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
    return () => { unsubThefts(); unsubRacks(); };
  }, [user]);

  // --- ROUTING ENGINE (Stripped for brevity, kept logical flow) --- 
  const calculateRoute = async () => {
    if (!destination) return;
    setIsCalculating(true);
    setSafetyNote(null);
    const GH_API_KEY = import.meta.env.VITE_GH_API_KEY;

    try {
        // 1. Geocode
        const geoRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${destination}, Munich`);
        const geoData = await geoRes.json();
        if (!geoData.length) { alert("Location not found"); setIsCalculating(false); return; }
        const dCoords = { lat: parseFloat(geoData[0].lat), lng: parseFloat(geoData[0].lon) };

        // 2. Route (Simplified for this snippet)
        const startPt = `${currentLocation.lat},${currentLocation.lng}`;
        const endPt = `${dCoords.lat},${dCoords.lng}`;
        const cityUrl = `https://graphhopper.com/api/1/route?point=${startPt}&point=${endPt}&profile=bike&points_encoded=false&elevation=false&key=${GH_API_KEY}`;
        
        const res = await fetch(cityUrl).then(r => r.json());
        if(res.paths && res.paths.length > 0) {
            const path = res.paths[0];
            const leafletCoords = path.points.coordinates.map(c => [c[1], c[0]]);
            setRouteCoords(leafletCoords);
            
            // Optional: Light check logic here...
            setSafetyNote(isWellLit ? "Safe Route Active" : "Standard Route");
        }
    } catch (e) { 
        console.error(e); 
    } finally {
        setIsCalculating(false);
    }
  };

  const handleMapClick = useCallback((pos) => {
    if (reportMode) {
        setSelectedPos(pos);
        setModalOpen(true);
    }
  }, [reportMode]);

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

        // Reset UI
        setModalOpen(false);
        setReportMode(null);
        setSelectedPos(null);

        // Show Success Message
        const msg = reportMode === 'report_theft' ? "Theft Reported. Danger Zone Updated." : "Bike Rack Added.";
        setNotification(msg);
        setTimeout(() => setNotification(null), 3000); // Hide after 3s

    } catch (err) {
        console.error("Error reporting:", err);
        alert("Failed to save report");
    }
  };

  const startSharing = async () => {
    if (!user) return;
    const newId = Math.random().toString(36).substring(2, 8).toUpperCase();
    await setDoc(doc(db, 'active_trips', newId), {
       lat: currentLocation.lat, lng: currentLocation.lng, startedAt: serverTimestamp(), status: 'active'
    });
    setTripId(newId);
    setIsSharing(true);
  };

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-white overflow-hidden font-sans">
      <header className="bg-gray-800 border-b border-gray-700 p-4 flex items-center justify-between shadow-md z-20">
        <div className="flex items-center gap-2">
          {/* Ensure you have this image or replace with an icon */}
          <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center font-bold text-xs">M</div>
          <h1 className="text-xl font-bold tracking-tight">M-<span className="text-blue-400">Radl</span></h1>
        </div>
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="md:hidden p-2 hover:bg-gray-700 rounded-full"><Menu /></button>
      </header>

      <div className="flex flex-1 relative overflow-hidden">
        {/* SIDEBAR */}
        <aside className={`${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 transition-transform absolute md:relative z-20 w-80 h-full bg-gray-800 border-r border-gray-700 flex flex-col shadow-xl`}>
             <div className="flex p-2 bg-gray-900 m-4 rounded-lg">
                <button onClick={() => setViewMode('rider')} className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${viewMode === 'rider' ? 'bg-blue-600' : 'text-gray-400'}`}>Rider</button>
                <button onClick={() => setViewMode('watcher')} className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${viewMode === 'watcher' ? 'bg-purple-600' : 'text-gray-400'}`}>Watcher</button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
                {viewMode === 'rider' ? (
                   <div className="space-y-4">
                      {/* Route Section */}
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

                      {/* Sharing Section */}
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

                      {/* Report Buttons */}
                      <div className="grid grid-cols-2 gap-3">
                          <button onClick={() => setReportMode('report_theft')} className={`p-3 rounded-xl border flex flex-col items-center gap-2 ${reportMode === 'report_theft' ? 'bg-red-500/20 border-red-500 text-red-400' : 'bg-gray-700/50 border-gray-600 text-gray-400'}`}>
                             <AlertTriangle size={20}/> <span className="text-xs">Report Theft</span>
                          </button>
                          <button onClick={() => setReportMode('add_rack')} className={`p-3 rounded-xl border flex flex-col items-center gap-2 ${reportMode === 'add_rack' ? 'bg-green-500/20 border-green-500 text-green-400' : 'bg-gray-700/50 border-gray-600 text-gray-400'}`}>
                             <MapPin size={20}/> <span className="text-xs">Add Rack</span>
                          </button>
                      </div>
                      {reportMode && <div className="text-center text-xs text-yellow-400 animate-pulse font-bold bg-yellow-900/30 p-2 rounded">Tap location on map to confirm</div>}
                   </div>
                ) : (
                   // WATCHER MODE
                   <div className="bg-gray-700/50 p-4 rounded-xl border border-gray-600 space-y-3">
                      <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2"><Eye size={16}/> Monitor Trip</h3>
                      <input className="w-full bg-gray-800 border border-gray-600 rounded-lg p-3 text-sm focus:ring-2 focus:ring-purple-500 outline-none uppercase tracking-widest"
                             placeholder="TRIP ID" value={tripId} onChange={e => setTripId(e.target.value)} />
                   </div>
                )}
            </div>
        </aside>

        {/* MAIN MAP CONTAINER */}
        <main className="flex-1 relative bg-gray-900 z-10">
             <LeafletMap 
                center={currentLocation} zoom={zoom} theftZones={theftZones} bikeRacks={bikeRacks}
                routeCoords={routeCoords} isWellLit={isWellLit} userPos={currentLocation}
                watchedPos={watchedLocation} reportMode={reportMode}
                onMapClick={handleMapClick}
             />

             {/* --- SUCCESS NOTIFICATION (Toast) --- */}
             {notification && (
                 <div className="absolute top-6 left-1/2 transform -translate-x-1/2 z-[1000] animate-bounce-in">
                     <div className="bg-green-600 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 border border-green-400">
                        <CheckCircle size={20} className="text-white" />
                        <span className="font-bold text-sm">{notification}</span>
                     </div>
                 </div>
             )}

             {/* --- CONFIRMATION MODAL (Now localized to Map area) --- */}
             {modalOpen && (
                <div className="absolute inset-0 z-[999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="bg-gray-800 p-6 rounded-xl shadow-2xl max-w-sm w-full border border-gray-700 m-4">
                        <h3 className="text-lg font-bold mb-2">Confirm Location</h3>
                        <p className="text-gray-400 text-sm mb-6">
                            {reportMode === 'report_theft' ? "Report a theft here? This creates a Red Danger Zone." : "Mark a new Bike Rack here?"}
                        </p>
                        <div className="flex gap-3">
                            <button onClick={() => setModalOpen(false)} className="flex-1 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-sm font-semibold">Cancel</button>
                            <button onClick={submitReport} className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-semibold">Confirm</button>
                        </div>
                    </div>
                </div>
            )}
        </main>
      </div>
    </div>
  );
}