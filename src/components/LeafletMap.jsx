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
    
    const rackSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="m9 12 2 2 4-4"></path></svg>';
    const userSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="3"></circle></svg>';
    const repairSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 1 1.4 0l1.6 1.6a1 1 0 0 1 0 1.4l-9 9-3.6.6.6-3.6 9-9z"></path><path d="m16 5 3 3"></path></svg>';

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
                    <Popup>Reparaturstation</Popup>
                </Marker>
            ))}

        </MapContainer>
    );
};

export default LeafletMap;