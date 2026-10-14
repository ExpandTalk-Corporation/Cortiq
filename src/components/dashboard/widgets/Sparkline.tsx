// src/components/dashboard/widgets/Sparkline.tsx
import { Line, LineChart, ResponsiveContainer } from 'recharts';

export function Sparkline({ data, className }: { data: number[]; className?: string }) {
  if (data.length < 2) return <div className={className} style={{ height: 40 }} aria-hidden="true" />;
  const points = data.map((v, i) => ({ i, v }));
  return (
    <div className={className} style={{ height: 40 }} aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points}>
          <Line type="monotone" dataKey="v" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
