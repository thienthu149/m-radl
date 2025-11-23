// src/hooks/useLocation.js
import { useState, useEffect } from 'react';

export const useLocation = () => {
  // Default to Munich
  const [currentLocation, setCurrentLocation] = useState({ lat: 48.1351, lng: 11.5820 });
  const [gpsError, setGpsError] = useState(null);

  useEffect(() => {
    if (!navigator.geolocation) {
      setGpsError("Geolocation not supported");
      return;
    }

    // Start watching the position (fires repeatedly as you move)
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setCurrentLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude
        });
      },
      (err) => {
        console.error("GPS Error:", err);
        setGpsError(err.message);
      },
      { 
        enableHighAccuracy: true, 
        distanceFilter: 5, // Update every 5 meters
        timeout: 20000 
      }
    );

    // Stop watching when the component unmounts
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  return { currentLocation, setCurrentLocation, gpsError };
};