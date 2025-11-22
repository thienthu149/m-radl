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

const MapClickHandler = ({ onMapClick, mode }) => {
    useMapEvents({
        click: (e) => {
            if (mode) onMapClick(e.latlng);
        },
    });
    return null;
};

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

const LeafletMap = ({ center, zoom, theftZones, bikeRacks, routeCoords, isWellLit, userPos, watchedPos, reportMode, onMapClick }) => {
    
    const rackSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="m9 12 2 2 4-4"></path></svg>';
    const userSvg = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="3"></circle></svg>';

    const isInteractive = reportMode === null;

    return (
        <MapContainer center={[center.lat, center.lng]} zoom={zoom} zoomControl={false} style={{ height: "100%", width: "100%", background: '#111827' }}>
            <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                // Ensure you have CSS to invert colors if you want dark mode tiles
            />
            
            <MapResizer />
            <MapClickHandler onMapClick={onMapClick} mode={reportMode} />
            <RecenterMap center={watchedPos ? [watchedPos.lat, watchedPos.lng] : null} />

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
                            color="#22d3ee" 
                            weight={12} 
                            opacity={0.3} 
                            interactive={false}
                        />
                    )}
                    <Polyline 
                        positions={routeCoords} 
                        color={isWellLit ? "#22d3ee" : "#ef4444"} 
                        weight={5} 
                        opacity={1} 
                        dashArray={isWellLit ? null : '10, 10'} 
                        interactive={false}
                    />
                </>
            )}

            {theftZones.map((zone) => (
                <Circle 
                    key={zone.id} 
                    center={[zone.lat, zone.lng]} 
                    radius={300} 
                    pathOptions={{ color: 'red', fillColor: '#ef4444', fillOpacity: 0.2, stroke: false }}
                    interactive={isInteractive} 
                />
            ))}

            {bikeRacks.map((rack) => (
                <Marker 
                    key={rack.id} 
                    position={[rack.lat, rack.lng]} 
                    icon={createCustomIcon('#22c55e', rackSvg)}
                    interactive={isInteractive} 
                />
            ))}
        </MapContainer>
    );
};

export default LeafletMap;