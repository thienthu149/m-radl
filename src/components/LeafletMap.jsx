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

// Custom Icons helper
const createCustomIcon = (color, svgString) => new L.DivIcon({
  className: 'custom-marker',
  html: `<div style="background-color: ${color}; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.3);">${svgString}</div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -32]
});

// Stable Click Handler
const MapClickHandler = ({ onMapClick, mode }) => {
    useMapEvents({
        click: (e) => {
            if (mode) {
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
        if(center) map.flyTo(center, 13);
    }, [center, map]);
    return null;
}

const LeafletMap = ({ center, zoom, theftZones, bikeRacks, routeCoords, isWellLit, userPos, watchedPos, reportMode, onMapClick }) => {
    
    const rackSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="m9 12 2 2 4-4"></path></svg>';
    const userSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="3"></circle></svg>';

    // When reportMode is active, allow clicks to pass to the map (background)
    const isInteractive = reportMode === null;

    return (
        <MapContainer center={[center.lat, center.lng]} zoom={zoom} style={{ height: "100%", width: "100%", background: '#111827' }}>
            <TileLayer
                attribution='© <a href="https://www.openstreetmap.org/copyright">OSM</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            /> 
            
            <MapClickHandler onMapClick={onMapClick} mode={reportMode} />
            <RecenterMap center={watchedPos ? [watchedPos.lat, watchedPos.lng] : null} />

            {/* Current User */}
            <Marker position={[userPos.lat, userPos.lng]} icon={createCustomIcon('#3b82f6', userSvg)} interactive={isInteractive}>
                <Popup>You</Popup>
            </Marker>

            {/* Watched Rider */}
            {watchedPos && (
                <Marker position={[watchedPos.lat, watchedPos.lng]} icon={createCustomIcon('#8b5cf6', userSvg)} interactive={isInteractive}>
                    <Popup>Rider</Popup>
                </Marker>
            )}

            {/* Route Visualization */}
            {routeCoords.length > 0 && (
                <Polyline 
                    positions={routeCoords} 
                    color="#3b82f6"
                    weight={5} 
                    opacity={0.8} 
                    interactive={false}
                />
            )}

            {/* --- THEFT ZONES (HEATMAP EFFECT) --- */}
            {/* Logic: 
                1. We render a Circle for EVERY report.
                2. We set opacity very low (0.15).
                3. Overlapping circles automatically darken the color (0.15 + 0.15 = 0.3, etc.)
                4. No Stroke (border) ensures it looks like a cloud/overlay.
                5. No Markers are rendered.
            */}
            {theftZones.map((zone) => (
                <Circle 
                    key={zone.id} 
                    center={[zone.lat, zone.lng]} 
                    radius={200} 
                    pathOptions={{ 
                        color: 'red', 
                        fillColor: '#ef4444', // Red-500
                        fillOpacity: 0.15,     // Low opacity for stacking effect
                        stroke: false          // No border = smoother gradient look
                    }}
                    interactive={false} // Danger zones are visual warnings only, don't block clicks
                />
            ))}

            {/* Bike Racks */}
            {bikeRacks.map((rack) => (
                <Marker 
                    key={rack.id} 
                    position={[rack.lat, rack.lng]} 
                    icon={createCustomIcon('#22c55e', rackSvg)}
                    interactive={isInteractive} 
                >
                    <Popup>Bike Rack</Popup>
                </Marker>
            ))}
        </MapContainer>
    );
};

export default LeafletMap;