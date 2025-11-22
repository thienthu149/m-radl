import React, { useState, useEffect, useCallback } from 'react';
import { Navigation, AlertTriangle, Bike, Share2, Eye, Menu as MenuIcon, X, Sun, Moon, Copy, ChevronUp, ChevronDown, MapPin, ExternalLink } from 'lucide-react';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { collection, addDoc, onSnapshot, doc, updateDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from './config/firebase';
import LeafletMap from './components/LeafletMap';
import OverflowMenu from './components/Menu';


export default function App() {
  const [user, setUser] = useState(null);
  const [viewMode, setViewMode] = useState('rider'); 
  const [isSheetExpanded, setIsSheetExpanded] = useState(false); // Controls bottom sheet height
  const [category, setCategory] = useState('navigation');
  
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

  // ... (Keeping existing trip sharing logic same as before)
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
            setIsDangerAlert(diff > 60000 && isNearDanger);
          }
        }
      });
      return () => unsub();
    }
  }, [viewMode, tripId, user, theftZones]);

  const calculateRoute = async () => {
    if (!destination) return;
    setIsSheetExpanded(false); // Collapse sheet to see map after searching
    try {
      const geoRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${destination}, Munich`);
      const geoData = await geoRes.json();
      if (!geoData.length) { alert("Location not found"); return; }
      
      const dest = { lat: parseFloat(geoData[0].lat), lng: parseFloat(geoData[0].lon) };
      let startLng = currentLocation.lng;
      let startLat = currentLocation.lat;
      
      if (isWellLit) { startLng += 0.0002; startLat += 0.0002; } // Jitter for safe route

      const res = await fetch(`https://router.project-osrm.org/route/v1/bicycle/${startLng},${startLat};${dest.lng},${dest.lat}?overview=full&geometries=geojson&alternatives=true`);
      const data = await res.json();
      
      if (data.routes && data.routes.length > 0) {
        let selectedRoute = data.routes[0];
        if (isWellLit && data.routes.length > 1) {
            const longestRoute = data.routes.reduce((prev, current) => (prev.distance > current.distance) ? prev : current);
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

  const openGoogleMaps = () => {
     if(destination) {
         window.open(`https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=bicycling`, '_blank');
     }
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
    } catch (e) { console.error("Error reporting:", e); }
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

  // Helper to toggle bottom sheet
  const toggleSheet = () => setIsSheetExpanded(!isSheetExpanded);

  return (
    <div className="h-screen w-full bg-gray-900 text-white overflow-hidden font-sans relative flex flex-col">
      
      {/* --- 1. Full Screen Map Layer --- */}
      <div className="absolute inset-0 z-0">
         <LeafletMap 
            center={currentLocation} zoom={zoom} theftZones={theftZones} bikeRacks={bikeRacks}
            routeCoords={routeCoords} isWellLit={isWellLit} userPos={currentLocation}
            watchedPos={watchedLocation} reportMode={reportMode}
            onMapClick={handleMapClick}
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
           
           {/* Empty div to balance the flex layout so the chevron stays centered */}
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
                    setIsSheetExpanded(true); // Expand if they select a menu item
                }} 
                customTrigger={<MenuIcon size={24} className="text-gray-300" />}
              />
           </div>
        </div>

        {/* View Mode Tabs (Visible even when collapsed) */}
        

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
                      viewMode === 'rider'
                        ? 'bg-blue-600 text-white'
                        : 'text-gray-400'
                    }`}
                  >
                    Rider
                </button>

                <button
                  onClick={() => setViewMode('watcher')}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                    viewMode === 'watcher'
                    ? 'bg-purple-600 text-white'
                      : 'text-gray-400'
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
                             <button onClick={calculateRoute} className="flex-1 bg-blue-600 hover:bg-blue-500 py-3 rounded-xl font-bold text-sm transition-colors">Go</button>
                             {routeDistance && (
                                 <button onClick={openGoogleMaps} className="w-12 bg-gray-700 hover:bg-gray-600 rounded-xl flex items-center justify-center text-gray-300">
                                     <ExternalLink size={18}/>
                                 </button>
                             )}
                         </div>
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
                    </div>
                    <p className="text-center text-xs text-gray-500 pt-4">Select an option to close this menu and tap the location on the map.</p>
                  </div>
            )}

            {category === 'racks' && (
                  <div className="text-center space-y-4 py-8">
                    <div className="mx-auto w-16 h-16 bg-gray-700 rounded-full flex items-center justify-center"><Bike size={32} className="text-gray-400"/></div>
                    <h3 className="text-xl font-bold">Add bike rack</h3>
                    <p className="text-gray-400 text-sm">Bike racks are automatically shown on your map.</p>
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
                    <div className="mx-auto w-16 h-16 bg-gray-700 rounded-full flex items-center justify-center"><Bike size={32} className="text-gray-400"/></div>
                    <h3 className="text-xl font-bold">Add repair stations</h3>
                    <p className="text-gray-400 text-sm">Repair stations are automatically shown on your map.</p>
                  </div>
            )}
        </div>
      </div>

      {/* --- 4. Modals / Overlays --- */}
      {modalOpen && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-4">
                <div className="bg-gray-800 p-6 rounded-2xl shadow-2xl w-full max-w-xs border border-gray-700 transform transition-all scale-100">
                    <h3 className="text-lg font-bold mb-2 text-white">Confirm Location</h3>
                    <p className="text-gray-400 text-sm mb-6">
                        {reportMode === 'report_theft' 
                            ? "Report a theft here? This helps create safe routes." 
                            : "Mark a public Bike Rack here?"}
                    </p>
                    <div className="flex gap-3">
                        <button onClick={() => setModalOpen(false)} className="flex-1 py-3 rounded-xl bg-gray-700 font-medium text-gray-300">Cancel</button>
                        <button onClick={submitReport} className="flex-1 py-3 rounded-xl bg-blue-600 font-medium text-white shadow-lg shadow-blue-900/20">Confirm</button>
                    </div>
                </div>
            </div>
        )}
        
        {reportMode && !modalOpen && (
            <div className="absolute top-20 left-1/2 -translate-x-1/2 z-30 bg-yellow-500 text-black px-4 py-2 rounded-full font-bold text-sm shadow-lg animate-bounce">
                Tap map to confirm location
            </div>
        )}
    </div>
  );
}