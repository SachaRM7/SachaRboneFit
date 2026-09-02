/**
 * Ce que le serveur a confirmé, par opposition à ce qu'on a tapé.
 *
 * Une feuille de saisie qui enregistre toute seule doit répondre à une question
 * au moment de se fermer : « reste-t-il quelque chose à sauver ? ». La réponse
 * ne peut pas se lire dans le champ, ni dans ce qu'on a envoyé — seulement dans
 * ce que le serveur a ACCUSÉ.
 *
 * Le défaut que cette classe supprime tenait en une ligne : la valeur était
 * marquée comme enregistrée au moment de l'envoi, pas de la réponse.
 *
 *     1. je modifie la note
 *     2. je ferme aussitôt          -> l'envoi part, la valeur est marquée sue
 *     3. le composant se démonte    -> le filet compare, trouve égal, ne fait rien
 *     4. la requête échoue          -> la note est perdue
 *
 * Trois états distincts, donc, et jamais confondus :
 *
 *     confirmée   ce que le serveur a répondu avoir enregistré
 *     en vol      ce qui est parti et n'a pas encore de réponse
 *     saisie      ce qui est dans le champ
 *
 * Un échec n'avance rien. Un démontage pendant un envoi laisse la valeur non
 * confirmée, donc le filet de sortie se déclenche — c'est exactement son rôle.
 *
 * Les réponses portent un jeton de séquence : une réponse ancienne qui arrive
 * après une plus récente est ignorée, sans quoi elle ferait reculer la valeur
 * confirmée et rendrait « à sauver » quelque chose qui vient de l'être — ou
 * pire, marquerait comme sue une valeur que l'utilisateur a déjà remplacée.
 */
export class MemoireDeSaisie {
  private confirmee: string;
  /** Numéro du dernier envoi parti. Sert de jeton de séquence. */
  private dernierEnvoi = 0;
  /** Numéro du dernier envoi dont la réponse a été appliquée. */
  private dernierApplique = 0;

  constructor(valeurInitiale: string) {
    this.confirmee = valeurInitiale;
  }

  /** Ce que le serveur a confirmé, et rien d'autre. */
  get valeurConfirmee(): string {
    return this.confirmee;
  }

  /** Un envoi attend-il encore sa réponse ? */
  get enVol(): boolean {
    return this.dernierEnvoi > this.dernierApplique;
  }

  /**
   * Déclare un envoi. Le jeton rendu doit être présenté à la réponse.
   *
   * Rien n'avance ici : partir n'est pas arriver.
   */
  commencer(): number {
    this.dernierEnvoi += 1;
    return this.dernierEnvoi;
  }

  /**
   * Le serveur a confirmé. La valeur avance — si cette réponse est bien la
   * plus récente.
   *
   * Renvoie `false` quand la réponse est périmée : l'appelant sait alors qu'il
   * ne doit pas non plus mettre son affichage à jour avec elle.
   */
  reussite(jeton: number, valeurEnregistree: string): boolean {
    if (jeton < this.dernierApplique) return false;
    this.dernierApplique = jeton;
    this.confirmee = valeurEnregistree;
    return true;
  }

  /**
   * Le serveur n'a pas confirmé. Rien n'avance.
   *
   * On note seulement que cet envoi n'est plus en vol, pour ne pas croire
   * indéfiniment qu'une réponse va venir. La valeur confirmée, elle, reste
   * celle d'avant — un échec réseau ne s'interprète jamais comme un succès.
   */
  echec(jeton: number): void {
    if (jeton > this.dernierApplique) this.dernierApplique = jeton;
  }

  /**
   * Reste-t-il quelque chose à sauver avant de fermer ?
   *
   * La comparaison porte sur la valeur CONFIRMÉE. Si un envoi est encore en
   * vol, sa valeur n'est pas confirmée : la réponse est `true`, et le filet de
   * sortie part avec `keepalive`.
   *
   * C'est un doublon possible — la première requête peut aboutir après coup —
   * et c'est assumé : l'écriture est idempotente (un upsert sur la note), donc
   * le coût maximal est une requête inutile, quand le coût de l'inverse est
   * une note perdue. On préfère écrire deux fois que zéro.
   */
  aSauvegarder(valeurSaisie: string): boolean {
    return valeurSaisie !== this.confirmee;
  }
}
