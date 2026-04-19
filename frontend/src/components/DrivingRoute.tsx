import { useState, useEffect } from "react";
import { Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import type { LatLng } from "../types/parking";

interface DrivingRouteProps {
  from: LatLng;
  to: LatLng;
}

export default function DrivingRoute({ from, to }: DrivingRouteProps) {
  const [path, setPath] = useState<[number, number][]>([]);
  const map = useMap();

  useEffect(() => {
    setPath([]);
    fetch(
      `https://router.project-osrm.org/route/v1/driving/` +
      `${from.lng},${from.lat};${to.lng},${to.lat}` +
      `?overview=full&geometries=geojson`
    )
      .then((r) => r.json())
      .then((data) => {
        const coords = data?.routes?.[0]?.geometry?.coordinates as [number, number][] | undefined;
        if (!coords) return;
        const latLngs = coords.map(([lng, lat]) => [lat, lng] as [number, number]);
        setPath(latLngs);
        // Expand map view to show full route
        map.setMaxBounds(undefined as unknown as L.LatLngBoundsExpression);
        map.fitBounds(L.latLngBounds(latLngs), { padding: [60, 60], maxZoom: 18 });
      })
      .catch(() => {});
  }, [from.lat, from.lng, to.lat, to.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!path.length) return null;

  return (
    <Polyline
      positions={path}
      pathOptions={{
        color: "#2563eb",
        weight: 5,
        opacity: 0.88,
        dashArray: "10, 7",
        lineCap: "round",
      }}
    />
  );
}
