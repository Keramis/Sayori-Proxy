import { StatCard } from "../StatCard";
import { Activity, TrendingUp, Clock, Zap } from "lucide-react";

export default function StatCardExample() {
  return (
    <div className="p-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard label="Total Tokens" value="102.8K" icon={Activity} />
      <StatCard label="Total Requests" value={35} icon={TrendingUp} />
      <StatCard label="Success Rate" value="100.0%" icon={Zap} />
      <StatCard label="Uptime" value="1h" icon={Clock} />
    </div>
  );
}
