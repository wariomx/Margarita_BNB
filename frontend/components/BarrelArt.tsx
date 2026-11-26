import { barrelSvg } from "@/lib/barrelArt";

export function BarrelArt({
  tier = 0,
  id,
  label,
  size = 240,
  className,
}: {
  tier?: 0 | 1 | 2 | 3 | 4;
  id: string;
  label?: string;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={`block flex-none ${className ?? ""}`}
      style={{ width: size, height: Math.round(size * 1.5) }}
      dangerouslySetInnerHTML={{ __html: barrelSvg(tier, { id, label, size }) }}
    />
  );
}
