/**
 * Geolocation Map Component
 * Interactive Leaflet map for geographic visualization
 */

import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface MapCluster {
  label: string;
  latitude: number;
  longitude: number;
  sessions: number;
  page_views: number;
  conversions: number;
}

export interface HeatmapPoint {
  latitude: number;
  longitude: number;
  intensity: number;
}

interface GeolocationMapProps {
  data: MapCluster[];
  heatmapData: HeatmapPoint[];
  onLocationSelect?: (location: any) => void;
}

// Custom icon for clusters
const createClusterIcon = (intensity: number) => {
  const size = Math.min(40 + intensity * 0.2, 60);
  const color = `hsl(${intensity > 70 ? 0 : intensity > 40 ? 30 : 120}, 100%, 50%)`;

  return L.divIcon({
    html: `
      <div style="
        width: ${size}px;
        height: ${size}px;
        background-color: ${color};
        border-radius: 50%;
        border: 2px solid white;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-weight: bold;
        font-size: ${size / 3}px;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
        cursor: pointer;
      ">
        ${intensity}
      </div>
    `,
    className: 'cluster-icon',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
};

export default function GeolocationMap({
  data,
  heatmapData,
  onLocationSelect,
}: GeolocationMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const heatmapLayerRef = useRef<L.FeatureGroup | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  useEffect(() => {
    if (!containerRef.current || mapLoaded) return;

    // Initialize map
    const map = L.map(containerRef.current).setView([20, 0], 2);

    // Add tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 18,
      maxNativeZoom: 19,
    }).addTo(map);

    mapRef.current = map;
    setMapLoaded(true);

    // Fix Leaflet default icon issue
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
      iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
    });

    return () => {
      map.remove();
    };
  }, []);

  // Update markers when data changes
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;

    // Clear existing markers
    markersRef.current.forEach((marker) => {
      mapRef.current?.removeLayer(marker);
    });
    markersRef.current = [];

    // Calculate intensity for color coding
    const maxSessions = Math.max(...data.map((d) => d.sessions), 1);

    // Add new markers
    data.forEach((cluster) => {
      const intensity = Math.round((cluster.sessions / maxSessions) * 100);
      const marker = L.marker([cluster.latitude, cluster.longitude], {
        icon: createClusterIcon(intensity),
      });

      const popup = L.popup().setContent(`
        <div style="padding: 8px; font-size: 12px;">
          <strong>${cluster.label}</strong><br/>
          <strong>Sessions:</strong> ${cluster.sessions.toLocaleString()}<br/>
          <strong>Page views:</strong> ${cluster.page_views.toLocaleString()}<br/>
          <strong>Conversions:</strong> ${cluster.conversions.toLocaleString()}
        </div>
      `);

      marker.bindPopup(popup);

      marker.on('click', () => {
        if (onLocationSelect) {
          onLocationSelect(cluster);
        }
      });

      marker.addTo(mapRef.current!);
      markersRef.current.push(marker);
    });

    // Auto-fit bounds if markers exist
    if (markersRef.current.length > 0) {
      const group = new L.FeatureGroup(markersRef.current);
      mapRef.current?.fitBounds(group.getBounds().pad(0.1));
    }
  }, [data, mapLoaded]);

  // Add heatmap layer
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;

    // Remove existing heatmap layer
    if (heatmapLayerRef.current) {
      mapRef.current.removeLayer(heatmapLayerRef.current);
      heatmapLayerRef.current = null;
    }
    if (heatmapData.length === 0) return;

    // Create heatmap layer using circles
    const heatmapGroup = new L.FeatureGroup();

    heatmapData.forEach((point) => {
      const opacity = point.intensity / 100;
      const color = `rgba(255, ${100 - point.intensity}, 0, ${opacity})`;

      L.circleMarker([point.latitude, point.longitude], {
        radius: 8 + (point.intensity / 100) * 30,
        fillColor: color,
        color: color,
        weight: 0,
        opacity: opacity,
        fillOpacity: opacity * 0.7,
      }).addTo(heatmapGroup);
    });

    heatmapGroup.addTo(mapRef.current);
    heatmapLayerRef.current = heatmapGroup;
  }, [heatmapData, mapLoaded]);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        minHeight: '400px',
      }}
    />
  );
}
