"use client";
import { useEffect, useState } from "react";
import { messageErreur } from "@/lib/messages";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CourbaturesModal, type Courbature } from "./CourbaturesModal";
import { SymptomesModal } from "./SymptomesModal";
import { prudenceSymptomes } from "@/lib/engine/symptome-general";
import type { SymptomeDeclare } from "@/lib/referentiels/symptomes";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Moon,
  Zap,
  MapPin,
  ChevronDown,
  ArrowRight,
  HeartPulse,
  Backpack,
} from "lucide-react";
import { toast } from "sonner";
import {
  MATERIEL_PORTABLE,
  LIBELLES_PORTABLE,
} from "@/lib/referentiels/capacites";

interface DailyStateFormProps {
  initialDate: string;
  preselectedGymId?: string;
}

export function DailyStateForm({
  initialDate,
  preselectedGymId,
}: DailyStateFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [courbatures, setCourbatures] = useState<Courbature[]>([]);
  const [symptomes, setSymptomes] = useState<SymptomeDeclare[]>([]);
  const [gyms, setGyms] = useState<{ id: string; nom: string }[]>([]);
  const [defaultGymId, setDefaultGymId] = useState<string>(
    preselectedGymId || "",
  );
  const [sommeil, setSommeil] = useState(7);
  const [energie, setEnergie] = useState(5);
  const [jeune, setJeune] = useState(false);
  const [shiftRecent, setShiftRecent] = useState(false);
  const [shiftType, setShiftType] = useState<"jour" | "nuit" | "aucun">(
    "aucun",
  );
  const [dernierRepas, setDernierRepas] = useState<string | null>(null);
  const [horairePrevu, setHorairePrevu] = useState<string | null>(null);

  // Matériel emporté aujourd'hui. Pré-coché sur les habitudes : quelqu'un qui a
  // toujours ses élastiques dans son sac ne doit pas le redire chaque fois.
  const [materielApporte, setMaterielApporte] = useState<string[]>([]);
  useEffect(() => {
    fetch("/api/user")
      .then((r) => r.json())
      .then((d) => {
        const habituel = d?.user?.materielPersonnelHabituel;
        if (Array.isArray(habituel) && habituel.length > 0)
          setMaterielApporte(habituel);
      })
      .catch(() => {});
  }, []);

  // Le chargement des salles ignorait tout ce qui n'etait pas un tableau : une
  // API en erreur laissait la liste vide, sans le moindre message. L'ecran
  // devenait un cul-de-sac — pas de salle selectionnable, donc pas de seance —
  // et rien ne distinguait « la requete a echoue » de « tu n'as aucune salle ».
  const [chargementSalles, setChargementSalles] = useState(true);
  const [erreurSalles, setErreurSalles] = useState<string | null>(null);
  useEffect(() => {
    let annule = false;
    (async () => {
      try {
        const reponse = await fetch("/api/gyms");
        const corps = await reponse.json().catch(() => null);
        if (annule) return;
        if (!reponse.ok || !Array.isArray(corps)) {
          setErreurSalles(
            messageErreur("charger tes lieux", corps?.error, reponse.status),
          );
          return;
        }
        setGyms(corps);
      } catch (cause) {
        if (!annule)
          setErreurSalles(
            cause instanceof Error ? cause.message : "Requête impossible",
          );
      } finally {
        if (!annule) setChargementSalles(false);
      }
    })();
    return () => {
      annule = true;
    };
  }, []);

  // Load existing daily state
  useEffect(() => {
    fetch(`/api/daily-state?date=${initialDate}`)
      .then((r) => r.json())
      .then((data) => {
        if (data && data.id) {
          setSommeil(data.sommeilHeures ?? 7);
          setJeune(data.jeuneBool ?? false);
          setShiftRecent(data.shiftRecentBool ?? false);
          setShiftType(
            (data.shiftType as "jour" | "nuit" | "aucun") ?? "aucun",
          );
          setEnergie(data.energieDepart ?? 5);
          setDernierRepas(data.dernierRepasHeure ?? null);
          setHorairePrevu(data.horaireSeancePrevu ?? null);
          if (data.courbatures) setCourbatures(data.courbatures);
          // `null` sur toutes les lignes antérieures au lot 16 : la question
          // n'avait jamais été posée. On le lit comme « aucun symptôme ».
          if (Array.isArray(data.symptomesGeneraux))
            setSymptomes(data.symptomesGeneraux);
          if (data.gymId) setDefaultGymId(data.gymId);
          // Un état déjà saisi aujourd'hui l'emporte sur les habitudes.
          if (Array.isArray(data.materielApporte))
            setMaterielApporte(data.materielApporte);
        }
      });
  }, [initialDate]);

  /*
   * La même règle que pendant la séance, appelée ici pour AFFICHER, pas pour
   * décider à la place de l'utilisateur.
   *
   * Deux barèmes — un pour l'état du jour, un pour la barre SOS — auraient
   * divergé au premier ajustement, et l'application aurait dit « allège » le
   * matin puis « rien à signaler » une heure plus tard, sur la même
   * déclaration.
   */
  const prudence = prudenceSymptomes(symptomes);

  const onSubmit = async () => {
    if (!gyms.some((gym) => gym.id === defaultGymId)) {
      toast.error("Sélectionne une salle");
      return;
    }
    setLoading(true);
    try {
      const payload = {
        date: initialDate,
        gymId: defaultGymId,
        sommeilHeures: sommeil,
        jeuneBool: jeune,
        shiftRecentBool: shiftRecent,
        shiftType: shiftRecent ? shiftType : "aucun",
        energieDepart: energie,
        courbatures,
        symptomesGeneraux: symptomes,
        materielApporte,
        dernierRepasHeure: dernierRepas,
        horaireSeancePrevu: horairePrevu,
      };

      const res = await fetch("/api/daily-state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Erreur");
      }

      const state = await res.json();
      // Ce qu'on emporte change rarement : on le retient pour la fois suivante.
      fetch("/api/user", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ materielPersonnelHabituel: materielApporte }),
      }).catch(() => {});
      toast.success("État du jour enregistré");
      router.push(
        `/session/start?date=${initialDate}&dailyStateId=${state.id}&gymId=${defaultGymId}`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  };

  const salleValide = gyms.some((gym) => gym.id === defaultGymId);
  const horaires = (debut: number) =>
    Array.from(
      { length: 24 - debut },
      (_, i) => `${String(i + debut).padStart(2, "0")}:00`,
    );

  return (
    <form
      className="daily-checkin"
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit();
      }}
    >
      <section className="checkin-place">
        <MapPin size={22} aria-hidden />
        <div>
          <label htmlFor="daily-gym">Ton lieu aujourd’hui</label>
          <select
            id="daily-gym"
            value={salleValide ? defaultGymId : ""}
            onChange={(event) => setDefaultGymId(event.target.value)}
            disabled={chargementSalles}
            required
          >
            <option value="" disabled>
              {chargementSalles
                ? "Chargement des salles…"
                : "Choisir une salle"}
            </option>
            {gyms.map((gym) => (
              <option key={gym.id} value={gym.id}>
                {gym.nom}
              </option>
            ))}
          </select>
        </div>
        {erreurSalles && (
          <p role="alert" className="checkin-error">
            Salles non chargées — {erreurSalles}
          </p>
        )}
        {!chargementSalles && !erreurSalles && gyms.length === 0 && (
          <p className="checkin-error">
            Aucune salle enregistrée. <Link href="/gyms">En créer une</Link>{" "}
            pour démarrer.
          </p>
        )}
      </section>

      <section aria-labelledby="daily-feeling" className="checkin-section">
        <div className="checkin-section-heading">
          <span>01</span>
          <h2 id="daily-feeling">Comment tu te sens ?</h2>
        </div>
        <div className="checkin-metrics">
          <div className="checkin-metric">
            <div className="checkin-metric-label">
              <Moon size={20} aria-hidden />
              <label htmlFor="daily-sleep">Ta nuit</label>
            </div>
            <output htmlFor="daily-sleep">
              {sommeil.toLocaleString("fr-FR")}
              <small>h de sommeil</small>
            </output>
            <input
              id="daily-sleep"
              type="range"
              min="0"
              max="12"
              step="0.5"
              value={sommeil}
              onChange={(event) => setSommeil(Number(event.target.value))}
            />
            <div className="checkin-scale">
              <span>0 h</span>
              <span>12 h</span>
            </div>
          </div>
          <div className="checkin-metric checkin-energy">
            <div className="checkin-metric-label">
              <Zap size={20} aria-hidden />
              <label htmlFor="daily-energy">Énergie au réveil</label>
            </div>
            <output htmlFor="daily-energy">
              {energie}
              <small>/ 10</small>
            </output>
            <input
              id="daily-energy"
              type="range"
              min="1"
              max="10"
              step="1"
              value={energie}
              onChange={(event) => setEnergie(Number(event.target.value))}
            />
            <div className="checkin-scale">
              <span>À plat</span>
              <span>En pleine forme</span>
            </div>
          </div>
        </div>
        <div className="checkin-toggles">
          <div className="checkin-toggle">
            <div>
              <Label htmlFor="daily-fast">Je suis à jeun</Label>
              <p>Pour adapter l’effort aujourd’hui.</p>
            </div>
            <Switch
              id="daily-fast"
              checked={jeune}
              onCheckedChange={setJeune}
            />
          </div>
          <div className="checkin-toggle">
            <div>
              <Label htmlFor="daily-shift">Travail en horaires décalés</Label>
              <p>Un shift dans les dernières 48 h.</p>
            </div>
            <Switch
              id="daily-shift"
              checked={shiftRecent}
              onCheckedChange={setShiftRecent}
            />
          </div>
          {shiftRecent && (
            <fieldset className="checkin-shifts">
              <legend>Quel horaire ?</legend>
              {(["jour", "nuit"] as const).map((type) => (
                <label key={type}>
                  <input
                    type="radio"
                    name="shiftType"
                    value={type}
                    checked={shiftType === type}
                    onChange={() => setShiftType(type)}
                  />
                  {type === "jour" ? "De jour" : "De nuit"}
                </label>
              ))}
            </fieldset>
          )}
        </div>
      </section>

      <section className="checkin-section" aria-labelledby="daily-body">
        <div className="checkin-section-heading">
          <span>02</span>
          <h2 id="daily-body">Ton corps aujourd’hui</h2>
          <HeartPulse size={20} aria-hidden />
        </div>
        <p className="checkin-help">
          Ajoute ce qui mérite d’être pris en compte.
        </p>
        <div className="checkin-body">
          <div>
            <h3>Courbatures</h3>
            <CourbaturesModal value={courbatures} onChange={setCourbatures} />
          </div>
          <div>
            <h3>Symptômes généraux</h3>
            <SymptomesModal value={symptomes} onChange={setSymptomes} />
            {prudence.conduite !== "continuer" && (
              <p className="text-feu-orange text-sm mt-2">{prudence.motif}</p>
            )}
          </div>
        </div>
      </section>

      <section className="checkin-section" aria-labelledby="daily-practical">
        <div className="checkin-section-heading">
          <span>03</span>
          <h2 id="daily-practical">Les détails pratiques</h2>
        </div>
        <details className="checkin-details">
          <summary>
            <Backpack size={20} aria-hidden />
            <span>
              Dans ton sac
              <small>
                {materielApporte.length
                  ? `${materielApporte.length} équipement(s) sélectionné(s)`
                  : "Aucun matériel personnel sélectionné"}
              </small>
            </span>
            <ChevronDown size={18} aria-hidden />
          </summary>
          <div className="checkin-equipment">
            {MATERIEL_PORTABLE.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={materielApporte.includes(m)}
                onClick={() =>
                  setMaterielApporte((liste) =>
                    liste.includes(m)
                      ? liste.filter((x) => x !== m)
                      : [...liste, m],
                  )
                }
              >
                {LIBELLES_PORTABLE[m]}
              </button>
            ))}
          </div>
        </details>
        <details className="checkin-details">
          <summary>
            <span>
              Repas et horaire de séance
              <small>
                {dernierRepas || horairePrevu
                  ? [
                      dernierRepas && `Repas ${dernierRepas}`,
                      horairePrevu && `Séance ${horairePrevu}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  : "Facultatif · à préciser si tu le sais"}
              </small>
            </span>
            <ChevronDown size={18} aria-hidden />
          </summary>
          <div className="checkin-times">
            <label>
              Dernier repas
              <select
                value={dernierRepas || ""}
                onChange={(event) =>
                  setDernierRepas(event.target.value || null)
                }
              >
                <option value="">Non renseigné</option>
                {horaires(6).map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Séance prévue à
              <select
                value={horairePrevu || ""}
                onChange={(event) =>
                  setHorairePrevu(event.target.value || null)
                }
              >
                <option value="">Non renseigné</option>
                {horaires(5).map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </details>
      </section>
      <div className="checkin-submit">
        <Button
          type="submit"
          disabled={loading || !salleValide}
          className="w-full h-14 text-base"
        >
          {loading ? "Enregistrement…" : "Voir ma séance adaptée"}
          <ArrowRight size={19} aria-hidden />
        </Button>
      </div>
    </form>
  );
}
