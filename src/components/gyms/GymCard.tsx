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
      className="bg-carte border-filet cursor-pointer hover:border-filet transition-colors"
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <CardTitle className="text-encre text-base">{gym.nom}</CardTitle>
          {gym.est24h && (
            <Badge variant="outline" className="border-gain text-gain text-xs">
              24h
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {gym.horairesOuverture && (
          <p className="text-encre-2 text-sm">{gym.horairesOuverture}</p>
        )}
        {gym.notes && (
          <p className="text-encre-3 text-xs line-clamp-2">{gym.notes}</p>
        )}
      </CardContent>
    </Card>
  );
}
