export type ParkingFilter = "any" | "free" | "paid";

interface ParkingFilterProps {
  value: ParkingFilter;
  onChange: (value: ParkingFilter) => void;
}

const OPTIONS: { value: ParkingFilter; label: string }[] = [
  { value: "any",  label: "Any" },
  { value: "free", label: "Free only" },
  { value: "paid", label: "Metered only" },
];

export default function ParkingFilterBar({ value, onChange }: ParkingFilterProps) {
  return (
    <div className="filter-bar">
      <span className="filter-label">Parking type</span>
      <div className="filter-pills">
        {OPTIONS.map((opt) => (
          <button
            key={opt.value}
            className={`filter-pill ${value === opt.value ? "filter-pill--active" : ""}`}
            onClick={() => onChange(opt.value)}
            type="button"
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
