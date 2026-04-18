import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Gym } from "@/db/schema";

interface GymCardProps {
  gym: Gym;
  onClick?: () => void;
}

export function GymCard({ gym, onClick }: GymCardProps) {
  return (
    <Card
      className="bg-zinc-900 border-zinc-800 cursor-pointer hover:border-zinc-700 transition-colors"
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <CardTitle className="text-white text-base">{gym.nom}</CardTitle>
          {gym.est24h && (
            <Badge variant="outline" className="border-green-600 text-green-500 text-xs">
              24h
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {gym.horairesOuverture && (
          <p className="text-zinc-400 text-sm">{gym.horairesOuverture}</p>
        )}
        {gym.notes && (
          <p className="text-zinc-500 text-xs line-clamp-2">{gym.notes}</p>
        )}
      </CardContent>
    </Card>
  );
}
