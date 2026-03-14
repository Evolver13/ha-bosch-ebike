/**
 * Bosch eBike Map Card for Home Assistant
 * Displays GPS tracks from Bosch eBike activities on an interactive map.
 */

const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";

class BoschEBikeMapCard extends HTMLElement {
  constructor() {
    super();
    this._hass = null;
    this._config = {};
    this._activities = [];
    this._currentIndex = 0;
    this._map = null;
    this._trackLayer = null;
    this._loading = false;
    this._leafletLoaded = false;
    this._initialized = false;
  }

  setConfig(config) {
    this._config = {
      height: config.height || 500,
      ...config,
    };
    if (this._initialized) {
      this._render();
    }
  }

  set hass(hass) {
    const firstSet = !this._hass;
    this._hass = hass;
    if (firstSet) {
      this._initialize();
    }
  }

  async _initialize() {
    if (this._initialized) return;
    this._initialized = true;
    this._render();
    await this._loadLeaflet();
    await this._loadActivities();
  }

  _render() {
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
    }

    const height = this._config.height || 500;

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
        }
        .card {
          background: var(--ha-card-background, var(--card-background-color, white));
          border-radius: var(--ha-card-border-radius, 12px);
          box-shadow: var(--ha-card-box-shadow, 0 2px 6px rgba(0,0,0,0.1));
          overflow: hidden;
          font-family: var(--paper-font-body1_-_font-family, 'Roboto', sans-serif);
        }
        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          background: var(--primary-color, #03a9f4);
          color: white;
        }
        .header .title {
          font-size: 16px;
          font-weight: 500;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .header .title svg {
          width: 20px;
          height: 20px;
          fill: white;
        }
        .nav {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 16px;
          background: var(--secondary-background-color, #f5f5f5);
          border-bottom: 1px solid var(--divider-color, #e0e0e0);
        }
        .nav button {
          background: var(--primary-color, #03a9f4);
          color: white;
          border: none;
          border-radius: 6px;
          padding: 6px 14px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          transition: opacity 0.2s;
        }
        .nav button:hover { opacity: 0.85; }
        .nav button:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
        .nav input[type="date"] {
          flex: 1;
          padding: 6px 10px;
          border: 1px solid var(--divider-color, #ccc);
          border-radius: 6px;
          font-size: 14px;
          background: var(--card-background-color, white);
          color: var(--primary-text-color, #333);
        }
        .nav .ride-counter {
          font-size: 12px;
          color: var(--secondary-text-color, #666);
          white-space: nowrap;
        }
        #map {
          width: 100%;
          height: ${height}px;
        }
        .info {
          padding: 12px 16px;
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
          gap: 8px;
        }
        .info-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
        }
        .info-item .value {
          font-size: 18px;
          font-weight: 600;
          color: var(--primary-text-color, #333);
        }
        .info-item .label {
          font-size: 11px;
          color: var(--secondary-text-color, #666);
          margin-top: 2px;
        }
        .ride-title {
          text-align: center;
          padding: 8px 16px 0;
          font-size: 15px;
          font-weight: 500;
          color: var(--primary-text-color, #333);
        }
        .ride-date {
          text-align: center;
          font-size: 12px;
          color: var(--secondary-text-color, #666);
          padding: 2px 16px 4px;
        }
        .loading {
          display: flex;
          align-items: center;
          justify-content: center;
          height: ${height}px;
          color: var(--secondary-text-color, #666);
          font-size: 14px;
        }
        .loading .spinner {
          width: 24px;
          height: 24px;
          border: 3px solid var(--divider-color, #ddd);
          border-top-color: var(--primary-color, #03a9f4);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
          margin-right: 10px;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .no-data {
          display: flex;
          align-items: center;
          justify-content: center;
          height: ${height}px;
          color: var(--secondary-text-color, #999);
          font-size: 14px;
        }
      </style>
      <div class="card">
        <div class="header">
          <span class="title">
            <svg viewBox="0 0 24 24"><path d="M5,11L6.5,6.5H17.5L19,11M17.5,16A1.5,1.5 0 0,1 16,14.5A1.5,1.5 0 0,1 17.5,13A1.5,1.5 0 0,1 19,14.5A1.5,1.5 0 0,1 17.5,16M6.5,16A1.5,1.5 0 0,1 5,14.5A1.5,1.5 0 0,1 6.5,13A1.5,1.5 0 0,1 8,14.5A1.5,1.5 0 0,1 6.5,16M18.92,6C18.72,5.42 18.16,5 17.5,5H6.5C5.84,5 5.28,5.42 5.08,6L3,12V20A1,1 0 0,0 4,21H5A1,1 0 0,0 6,20V19H18V20A1,1 0 0,0 19,21H20A1,1 0 0,0 21,20V12L18.92,6Z"/></svg>
            Bosch eBike Rides
          </span>
        </div>
        <div class="nav">
          <button id="btn-prev" title="Previous ride">◀</button>
          <input type="date" id="date-picker" />
          <button id="btn-next" title="Next ride">▶</button>
          <span class="ride-counter" id="ride-counter"></span>
        </div>
        <div id="map-container">
          <div class="loading" id="loading-indicator">
            <div class="spinner"></div>
            Loading activities...
          </div>
        </div>
        <div class="ride-title" id="ride-title"></div>
        <div class="ride-date" id="ride-date"></div>
        <div class="info" id="info-panel"></div>
      </div>
    `;

    // Bind events
    this.shadowRoot.getElementById("btn-prev").addEventListener("click", () => this._navigate(-1));
    this.shadowRoot.getElementById("btn-next").addEventListener("click", () => this._navigate(1));
    this.shadowRoot.getElementById("date-picker").addEventListener("change", (e) => this._jumpToDate(e.target.value));
  }

  async _loadLeaflet() {
    if (this._leafletLoaded || window.L) {
      this._leafletLoaded = true;
      return;
    }

    // Load CSS
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = LEAFLET_CSS;
    this.shadowRoot.appendChild(link);

    // Also inject into shadow DOM for proper styling
    const style = document.createElement("link");
    style.rel = "stylesheet";
    style.href = LEAFLET_CSS;
    document.head.appendChild(style);

    // Load JS
    await new Promise((resolve, reject) => {
      if (window.L) { resolve(); return; }
      const script = document.createElement("script");
      script.src = LEAFLET_JS;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });

    this._leafletLoaded = true;
  }

  async _loadActivities() {
    if (!this._hass) return;

    try {
      const result = await this._hass.callWS({ type: "bosch_ebike/list_activities" });
      this._activities = (result.activities || []).sort(
        (a, b) => new Date(b.startTime) - new Date(a.startTime)
      );

      const container = this.shadowRoot.getElementById("map-container");
      if (this._activities.length === 0) {
        container.innerHTML = '<div class="no-data">No rides found</div>';
        return;
      }

      // Replace loading with map div
      container.innerHTML = `<div id="map" style="height:${this._config.height || 500}px"></div>`;

      // Initialize map
      await this._initMap();
      this._currentIndex = 0;
      this._showActivity(0);

    } catch (err) {
      console.error("Failed to load activities:", err);
      const container = this.shadowRoot.getElementById("map-container");
      container.innerHTML = `<div class="no-data">Error: ${err.message || err}</div>`;
    }
  }

  async _initMap() {
    await this._loadLeaflet();
    const mapEl = this.shadowRoot.getElementById("map");
    if (!mapEl || this._map) return;

    // Leaflet needs the container to be visible and sized
    this._map = L.map(mapEl, {
      zoomControl: true,
      attributionControl: true,
    }).setView([48.5, 11.5], 10);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://openstreetmap.org">OSM</a>',
      maxZoom: 19,
    }).addTo(this._map);

    this._trackLayer = L.layerGroup().addTo(this._map);

    // Fix tile loading in shadow DOM
    setTimeout(() => this._map.invalidateSize(), 100);
  }

  async _showActivity(index) {
    if (index < 0 || index >= this._activities.length) return;
    this._currentIndex = index;
    const activity = this._activities[index];

    // Update navigation
    this._updateNav(activity);
    this._updateInfo(activity);

    // Load GPS track
    await this._loadTrack(activity.id);
  }

  _updateNav(activity) {
    const datePicker = this.shadowRoot.getElementById("date-picker");
    const counter = this.shadowRoot.getElementById("ride-counter");
    const btnPrev = this.shadowRoot.getElementById("btn-prev");
    const btnNext = this.shadowRoot.getElementById("btn-next");

    if (activity.startTime) {
      datePicker.value = activity.startTime.substring(0, 10);
    }
    counter.textContent = `${this._currentIndex + 1} / ${this._activities.length}`;
    btnPrev.disabled = this._currentIndex <= 0;
    btnNext.disabled = this._currentIndex >= this._activities.length - 1;
  }

  _updateInfo(activity) {
    const titleEl = this.shadowRoot.getElementById("ride-title");
    const dateEl = this.shadowRoot.getElementById("ride-date");
    const infoPanel = this.shadowRoot.getElementById("info-panel");

    titleEl.textContent = activity.title || "Unnamed Ride";

    if (activity.startTime) {
      const d = new Date(activity.startTime);
      dateEl.textContent = d.toLocaleDateString("de-DE", {
        weekday: "long", year: "numeric", month: "long", day: "numeric",
        hour: "2-digit", minute: "2-digit",
      });
    }

    const dist = activity.distance ? (activity.distance / 1000).toFixed(1) : "–";
    const dur = activity.durationWithoutStops
      ? Math.round(activity.durationWithoutStops / 60)
      : "–";
    const avgSpeed = activity.speed?.average?.toFixed(1) || "–";
    const maxSpeed = activity.speed?.maximum?.toFixed(1) || "–";
    const eleGain = activity.elevation?.gain || "–";
    const cal = activity.caloriesBurned ? Math.round(activity.caloriesBurned) : "–";

    infoPanel.innerHTML = `
      <div class="info-item"><span class="value">${dist} km</span><span class="label">Distance</span></div>
      <div class="info-item"><span class="value">${dur} min</span><span class="label">Duration</span></div>
      <div class="info-item"><span class="value">${avgSpeed}</span><span class="label">Ø km/h</span></div>
      <div class="info-item"><span class="value">${maxSpeed}</span><span class="label">Max km/h</span></div>
      <div class="info-item"><span class="value">${eleGain} m</span><span class="label">Elevation ↑</span></div>
      <div class="info-item"><span class="value">${cal} kcal</span><span class="label">Calories</span></div>
    `;
  }

  async _loadTrack(activityId) {
    if (!this._hass || !this._map || this._loading) return;
    this._loading = true;

    try {
      const result = await this._hass.callWS({
        type: "bosch_ebike/get_track",
        activity_id: activityId,
      });

      const track = result.track || [];
      this._trackLayer.clearLayers();

      if (track.length === 0) {
        // No GPS data — show message on map
        this._map.setView([48.5, 11.5], 6);
        return;
      }

      // Build speed-colored segments
      const coords = track.map((p) => [p.lat, p.lon]);

      // Draw colored polyline segments based on speed
      for (let i = 0; i < track.length - 1; i++) {
        const speed = track[i].speed || 0;
        const color = this._speedToColor(speed);
        const segment = L.polyline(
          [[track[i].lat, track[i].lon], [track[i + 1].lat, track[i + 1].lon]],
          { color, weight: 4, opacity: 0.85 }
        );
        this._trackLayer.addLayer(segment);
      }

      // Start marker (green)
      const startIcon = L.divIcon({
        className: "",
        html: '<div style="width:14px;height:14px;background:#4CAF50;border:2px solid white;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>',
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });
      L.marker([track[0].lat, track[0].lon], { icon: startIcon, title: "Start" })
        .addTo(this._trackLayer);

      // End marker (red)
      const last = track[track.length - 1];
      const endIcon = L.divIcon({
        className: "",
        html: '<div style="width:14px;height:14px;background:#f44336;border:2px solid white;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>',
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });
      L.marker([last.lat, last.lon], { icon: endIcon, title: "End" })
        .addTo(this._trackLayer);

      // Fit map to track bounds
      const bounds = L.latLngBounds(coords);
      this._map.fitBounds(bounds, { padding: [30, 30] });

      // Add speed legend
      this._addLegend();

    } catch (err) {
      console.error("Failed to load track:", err);
    } finally {
      this._loading = false;
    }
  }

  _speedToColor(speed) {
    // 0 km/h = blue, 15 = green, 25 = yellow, 35+ = red
    if (speed <= 0) return "#2196F3";
    if (speed <= 10) return "#4CAF50";
    if (speed <= 18) return "#8BC34A";
    if (speed <= 25) return "#FFC107";
    if (speed <= 32) return "#FF9800";
    return "#f44336";
  }

  _addLegend() {
    // Remove existing legend
    const existing = this.shadowRoot.querySelector(".speed-legend");
    if (existing) existing.remove();

    const legend = document.createElement("div");
    legend.className = "speed-legend";
    legend.style.cssText = `
      position: absolute; bottom: 20px; right: 10px; z-index: 1000;
      background: rgba(255,255,255,0.9); padding: 6px 10px; border-radius: 6px;
      font-size: 11px; box-shadow: 0 1px 4px rgba(0,0,0,0.2);
    `;
    legend.innerHTML = `
      <div style="font-weight:600;margin-bottom:3px">Speed</div>
      <div style="display:flex;gap:4px;align-items:center">
        <span style="background:#2196F3;width:16px;height:3px;display:inline-block;border-radius:2px"></span>0
        <span style="background:#4CAF50;width:16px;height:3px;display:inline-block;border-radius:2px"></span>10
        <span style="background:#FFC107;width:16px;height:3px;display:inline-block;border-radius:2px"></span>25
        <span style="background:#f44336;width:16px;height:3px;display:inline-block;border-radius:2px"></span>35+ km/h
      </div>
    `;

    const mapContainer = this.shadowRoot.getElementById("map");
    if (mapContainer) {
      mapContainer.style.position = "relative";
      mapContainer.appendChild(legend);
    }
  }

  _navigate(direction) {
    const newIndex = this._currentIndex + direction;
    if (newIndex >= 0 && newIndex < this._activities.length) {
      this._showActivity(newIndex);
    }
  }

  _jumpToDate(dateStr) {
    if (!dateStr) return;

    // Find the closest activity to the selected date
    let bestIndex = 0;
    let bestDiff = Infinity;
    const target = new Date(dateStr).getTime();

    this._activities.forEach((a, idx) => {
      const diff = Math.abs(new Date(a.startTime).getTime() - target);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestIndex = idx;
      }
    });

    this._showActivity(bestIndex);
  }

  getCardSize() {
    return Math.ceil((this._config.height || 500) / 50) + 3;
  }

  static getConfigElement() {
    return document.createElement("bosch-ebike-map-card-editor");
  }

  static getStubConfig() {
    return { height: 500 };
  }
}

// Simple editor
class BoschEBikeMapCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = config;
    this._render();
  }

  _render() {
    this.innerHTML = `
      <div style="padding: 16px;">
        <label style="display:block;margin-bottom:8px;font-weight:500">Map Height (px)</label>
        <input type="number" value="${this._config.height || 500}" min="200" max="1000" step="50"
          style="width:100%;padding:8px;border:1px solid #ccc;border-radius:4px"
          id="height-input" />
      </div>
    `;
    this.querySelector("#height-input").addEventListener("change", (e) => {
      this._config = { ...this._config, height: parseInt(e.target.value) || 500 };
      this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: this._config } }));
    });
  }
}

customElements.define("bosch-ebike-map-card", BoschEBikeMapCard);
customElements.define("bosch-ebike-map-card-editor", BoschEBikeMapCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "bosch-ebike-map-card",
  name: "Bosch eBike Map",
  description: "Interactive map showing GPS tracks from your Bosch eBike rides",
  preview: true,
});
