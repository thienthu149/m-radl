// Mobile Menu Toggle
document.addEventListener('DOMContentLoaded', function() {
    const menuToggle = document.querySelector('.menu-toggle');
    const navMenu = document.querySelector('.nav-menu');

    if (menuToggle) {
        menuToggle.addEventListener('click', function() {
            navMenu.classList.toggle('active');
        });
    }

    // Close menu when clicking on a link
    const navLinks = document.querySelectorAll('.nav-menu a');
    navLinks.forEach(link => {
        link.addEventListener('click', function() {
            navMenu.classList.remove('active');
        });
    });

    // Smooth scrolling for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });

    // Initialize Map
    initMap();

    // Load Weather
    loadWeather();
});

// Map Initialization with Leaflet
function initMap() {
    // Munich coordinates
    const munichCenter = [48.1351, 11.5820];

    // Initialize map
    const map = L.map('munich-map').setView(munichCenter, 12);

    // Add OpenStreetMap tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
    }).addTo(map);

    // Bike repair stations in Munich (sample locations)
    const repairStations = [
        { name: "Marienplatz Reparatur", lat: 48.1374, lng: 11.5755, type: "repair" },
        { name: "Hauptbahnhof Reparatur", lat: 48.1405, lng: 11.5580, type: "repair" },
        { name: "Englischer Garten", lat: 48.1643, lng: 11.6045, type: "repair" },
        { name: "Olympiapark", lat: 48.1740, lng: 11.5520, type: "repair" },
        { name: "Sendlinger Tor", lat: 48.1329, lng: 11.5670, type: "repair" }
    ];

    // Bike parking locations (sample)
    const parkingLocations = [
        { name: "Parkhaus Marienplatz", lat: 48.1372, lng: 11.5761, type: "parking" },
        { name: "Parkhaus Hauptbahnhof", lat: 48.1409, lng: 11.5599, type: "parking" },
        { name: "Parkhaus Ostbahnhof", lat: 48.1281, lng: 11.6046, type: "parking" },
        { name: "Parkhaus Stachus", lat: 48.1392, lng: 11.5654, type: "parking" }
    ];

    // Popular bike lanes/routes (sample coordinates)
    const bikeRoutes = [
        {
            name: "Isar Radweg",
            coordinates: [
                [48.1351, 11.5820],
                [48.1500, 11.5900],
                [48.1650, 11.6000]
            ]
        },
        {
            name: "Ring Road Bike Path",
            coordinates: [
                [48.1500, 11.5400],
                [48.1600, 11.5500],
                [48.1650, 11.5700],
                [48.1550, 11.5900]
            ]
        }
    ];

    // Layer groups for different features
    let repairLayer = L.layerGroup();
    let parkingLayer = L.layerGroup();
    let routesLayer = L.layerGroup();

    // Add repair stations
    repairStations.forEach(station => {
        const marker = L.marker([station.lat, station.lng], {
            icon: L.divIcon({
                className: 'custom-icon',
                html: '🔧',
                iconSize: [30, 30]
            })
        });
        marker.bindPopup(`<b>${station.name}</b><br>Selbstbedienungs-Reparaturstation`);
        marker.addTo(repairLayer);
    });

    // Add parking locations
    parkingLocations.forEach(location => {
        const marker = L.marker([location.lat, location.lng], {
            icon: L.divIcon({
                className: 'custom-icon',
                html: '🅿️',
                iconSize: [30, 30]
            })
        });
        marker.bindPopup(`<b>${location.name}</b><br>Fahrradparkplatz`);
        marker.addTo(parkingLayer);
    });

    // Add bike routes
    bikeRoutes.forEach(route => {
        const polyline = L.polyline(route.coordinates, {
            color: '#00994d',
            weight: 4,
            opacity: 0.7
        });
        polyline.bindPopup(`<b>${route.name}</b><br>Radweg`);
        polyline.addTo(routesLayer);
    });

    // Map control buttons
    let bikeLanesVisible = false;
    let repairStationsVisible = false;
    let parkingVisible = false;

    document.getElementById('show-bike-lanes').addEventListener('click', function() {
        if (bikeLanesVisible) {
            map.removeLayer(routesLayer);
            this.classList.remove('active');
        } else {
            routesLayer.addTo(map);
            this.classList.add('active');
        }
        bikeLanesVisible = !bikeLanesVisible;
    });

    document.getElementById('show-repair-stations').addEventListener('click', function() {
        if (repairStationsVisible) {
            map.removeLayer(repairLayer);
            this.classList.remove('active');
        } else {
            repairLayer.addTo(map);
            this.classList.add('active');
        }
        repairStationsVisible = !repairStationsVisible;
    });

    document.getElementById('show-parking').addEventListener('click', function() {
        if (parkingVisible) {
            map.removeLayer(parkingLayer);
            this.classList.remove('active');
        } else {
            parkingLayer.addTo(map);
            this.classList.add('active');
        }
        parkingVisible = !parkingVisible;
    });

    // Locate user
    document.getElementById('locate-me').addEventListener('click', function() {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                function(position) {
                    const userLat = position.coords.latitude;
                    const userLng = position.coords.longitude;
                    
                    map.setView([userLat, userLng], 15);
                    
                    L.marker([userLat, userLng], {
                        icon: L.divIcon({
                            className: 'custom-icon',
                            html: '📍',
                            iconSize: [30, 30]
                        })
                    }).addTo(map).bindPopup('Dein Standort').openPopup();
                },
                function(error) {
                    alert('Standort konnte nicht ermittelt werden. Bitte erlaube Standortzugriff.');
                }
            );
        } else {
            alert('Geolocation wird von deinem Browser nicht unterstützt.');
        }
    });
}

// Weather API Integration
async function loadWeather() {
    const weatherContainer = document.getElementById('weather-info');
    
    try {
        // Using Open-Meteo API (no API key required)
        // Munich coordinates: 48.1351° N, 11.5820° E
        const response = await fetch(
            'https://api.open-meteo.com/v1/forecast?latitude=48.1351&longitude=11.5820&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,weather_code&timezone=Europe/Berlin&forecast_days=1'
        );
        
        if (!response.ok) {
            throw new Error('Weather data could not be loaded');
        }
        
        const data = await response.json();
        
        displayWeather(data);
    } catch (error) {
        console.error('Error loading weather:', error);
        weatherContainer.innerHTML = `
            <div class="weather-error">
                <p>Wetterdaten konnten nicht geladen werden.</p>
                <p>Bitte prüfe später noch einmal.</p>
            </div>
        `;
    }
}

function displayWeather(data) {
    const weatherContainer = document.getElementById('weather-info');
    const current = data.current;
    
    // Weather code to description and icon mapping
    const weatherDescriptions = {
        0: { description: 'Klarer Himmel', icon: '☀️' },
        1: { description: 'Überwiegend klar', icon: '🌤️' },
        2: { description: 'Teilweise bewölkt', icon: '⛅' },
        3: { description: 'Bewölkt', icon: '☁️' },
        45: { description: 'Neblig', icon: '🌫️' },
        48: { description: 'Neblig', icon: '🌫️' },
        51: { description: 'Leichter Nieselregen', icon: '🌦️' },
        53: { description: 'Nieselregen', icon: '🌦️' },
        55: { description: 'Starker Nieselregen', icon: '🌧️' },
        61: { description: 'Leichter Regen', icon: '🌧️' },
        63: { description: 'Regen', icon: '🌧️' },
        65: { description: 'Starker Regen', icon: '⛈️' },
        71: { description: 'Leichter Schneefall', icon: '🌨️' },
        73: { description: 'Schneefall', icon: '🌨️' },
        75: { description: 'Starker Schneefall', icon: '❄️' },
        80: { description: 'Regenschauer', icon: '🌦️' },
        81: { description: 'Regenschauer', icon: '🌧️' },
        82: { description: 'Starke Regenschauer', icon: '⛈️' },
        95: { description: 'Gewitter', icon: '⛈️' },
        96: { description: 'Gewitter mit Hagel', icon: '⛈️' },
        99: { description: 'Gewitter mit Hagel', icon: '⛈️' }
    };
    
    const weatherInfo = weatherDescriptions[current.weather_code] || { description: 'Unbekannt', icon: '🌡️' };
    
    // Cycling conditions assessment
    let cyclingCondition = '';
    let conditionClass = '';
    
    if (current.precipitation > 5 || current.wind_speed_10m > 40) {
        cyclingCondition = '⚠️ Schlechte Bedingungen';
        conditionClass = 'condition-bad';
    } else if (current.precipitation > 0 || current.wind_speed_10m > 25) {
        cyclingCondition = '⚡ Mäßige Bedingungen';
        conditionClass = 'condition-moderate';
    } else {
        cyclingCondition = '✅ Gute Bedingungen';
        conditionClass = 'condition-good';
    }
    
    weatherContainer.innerHTML = `
        <div class="weather-current">
            <div class="weather-icon">${weatherInfo.icon}</div>
            <div class="weather-main">
                <div class="weather-temp">${Math.round(current.temperature_2m)}°C</div>
                <div class="weather-description">${weatherInfo.description}</div>
                <div class="cycling-condition ${conditionClass}">${cyclingCondition}</div>
            </div>
        </div>
        <div class="weather-details">
            <div class="weather-detail">
                <div class="weather-detail-label">Luftfeuchtigkeit</div>
                <div class="weather-detail-value">${current.relative_humidity_2m}%</div>
            </div>
            <div class="weather-detail">
                <div class="weather-detail-label">Windgeschwindigkeit</div>
                <div class="weather-detail-value">${Math.round(current.wind_speed_10m)} km/h</div>
            </div>
            <div class="weather-detail">
                <div class="weather-detail-label">Niederschlag</div>
                <div class="weather-detail-value">${current.precipitation} mm</div>
            </div>
        </div>
    `;
    
    // Add additional CSS for cycling condition
    const style = document.createElement('style');
    style.textContent = `
        .cycling-condition {
            margin-top: 1rem;
            padding: 0.5rem 1rem;
            border-radius: 5px;
            font-weight: bold;
        }
        .condition-good {
            background-color: #d4edda;
            color: #155724;
        }
        .condition-moderate {
            background-color: #fff3cd;
            color: #856404;
        }
        .condition-bad {
            background-color: #f8d7da;
            color: #721c24;
        }
        .btn.active {
            background-color: #00994d;
        }
        .custom-icon {
            text-align: center;
            font-size: 24px;
            background: none;
            border: none;
        }
    `;
    document.head.appendChild(style);
}
