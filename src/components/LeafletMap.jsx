import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default Leaflet marker icons
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

const createCustomIcon = (color, svgString, size=32) => new L.DivIcon({
  className: 'custom-marker',
  html: `<div style="background-color: ${color}; width: ${size}px; height: ${size}px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: 0 3px 8px rgba(0,0,0,0.4);">${svgString}</div>`,
  iconSize: [size, size],
  iconAnchor: [size/2, size],
  popupAnchor: [0, -size]
});

// Stable Click Handler
const MapClickHandler = ({ onMapClick, reportMode }) => {
    useMapEvents({
        click: (e) => {
            if (reportMode) {
                e.originalEvent.stopPropagation();
                onMapClick(e.latlng);
            }
        },
    });
    return null;
};

// Helper to Recenter Map
const RecenterMap = ({ center }) => {
    const map = useMap();
    useEffect(() => {
        if(center) map.flyTo(center, 14, { animate: true, duration: 1.5 });
    }, [center, map]);
    return null;
}

// Force map invalidation when window resizes (important for mobile slide-up)
const MapResizer = () => {
    const map = useMap();
    useEffect(() => {
        setTimeout(() => { map.invalidateSize(); }, 400);
    }, []);
    return null;
};

const LeafletMap = ({ center, zoom, theftZones, bikeRacks, repairStations, routeCoords, isWellLit, userPos, watchedPos, reportMode, onMapClick, tempMarker }) => {
    
    const rackSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-circle-parking-icon lucide-circle-parking"><circle cx="12" cy="12" r="10"/><path d="M9 17V7h4a3 3 0 0 1 0 6H9"/></svg>';
    const userSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-bike-icon lucide-bike"><circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/></svg>';
    const repairSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-wrench-icon lucide-wrench"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z"/></svg>';

    const isInteractive = reportMode === null;

    return (
        <MapContainer center={[center.lat, center.lng]} zoom={zoom} zoomControl={false} style={{ height: "100%", width: "100%", background: '#111827' }}>
            <TileLayer
                attribution='© <a href="https://www.openstreetmap.org/copyright">OSM</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            
            <MapResizer />
            <MapClickHandler onMapClick={onMapClick} reportMode={reportMode} />
            <RecenterMap center={watchedPos ? [watchedPos.lat, watchedPos.lng] : null} />

            {tempMarker && (
                <Marker 
                     position={[tempMarker.lat, tempMarker.lng]} 
                     icon={createCustomIcon('#facc15', '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle></svg>')} 
                     interactive={false}
                >
                    <Popup>Confirm Location</Popup>
                </Marker>
            )}

            {/* Current User - Slightly larger icon */}
            <Marker position={[userPos.lat, userPos.lng]} icon={createCustomIcon('#3b82f6', userSvg, 40)} interactive={isInteractive}>
                <Popup>You</Popup>
            </Marker>

            {watchedPos && (
                <Marker position={[watchedPos.lat, watchedPos.lng]} icon={createCustomIcon('#8b5cf6', userSvg, 40)} interactive={isInteractive}>
                    <Popup>Rider</Popup>
                </Marker>
            )}

            {routeCoords.length > 0 && (
                <>
                    {isWellLit && (
                        <Polyline 
                            positions={routeCoords} 
                            color="#3b82f6" 
                            weight={12} 
                            opacity={0.3} 
                            interactive={false}
                        />
                    )}
                    <Polyline 
                        positions={routeCoords} 
                        color="#3b82f6"
                        weight={5} 
                        opacity={1} 
                        interactive={false}
                    />
                </>
            )}

            {theftZones.map((zone) => (
                <Circle 
                    key={zone.id} 
                    center={[zone.lat, zone.lng]} 
                    radius={300} 
                    pathOptions={{ 
                        color: 'red', 
                        fillColor: '#ef4444', 
                        fillOpacity: 0.2, 
                        stroke: false 
                    }}
                    interactive={isInteractive}
                >
                    <Popup>
                        <div className="text-red-500 font-bold">Danger Zone</div>
                        <div className="text-xs text-gray-600">Theft reported here</div>
                    </Popup>
                </Circle>
            ))}

            {bikeRacks.map((rack) => (
                <Marker 
                    key={rack.id} 
                    position={[rack.lat, rack.lng]} 
                    icon={createCustomIcon('#22c55e', rackSvg)}
                    interactive={isInteractive} 
                />
            ))}

            {repairStations.map((station) => (
                <Marker 
                    key={station.id}
                    position={[station.lat, station.lng]}
                    icon={createCustomIcon('#eab308', repairSvg)} // yellow-ish color
                    interactive={isInteractive}
                >
                </Marker>
            ))}

        </MapContainer>
    );
};

export default LeafletMap;