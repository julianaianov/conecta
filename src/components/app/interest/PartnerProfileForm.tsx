"use client";

import { useEffect, useState } from "react";
import { api, DemandRequestError } from "@/lib/app/api";
import { DEMAND_CATEGORIES, RESOURCE_TYPE_LABELS } from "@/lib/app/demand";
import { UFS, interestErrorMessage, splitList } from "@/lib/app/interest";
import {
  DEMAND_CATEGORY_LABELS,
  DEMAND_RESOURCE_TYPES,
  type DemandCategory,
  type DemandNeededResourceType,
  type PartnerProfile,
} from "@/lib/app/types";
import { Button } from "../Button";
import { Checkbox, FormAlert, TextArea, TextInput } from "../demand/fields";

const NEEDED = DEMAND_RESOURCE_TYPES.necessario as DemandNeededResourceType[];

/**
 * Perfil de apoio (T15): onde a conta atua, as categorias de interesse e os
 * recursos que oferece. É a base da compatibilidade calculada no post-service
 * (território 40, categoria 30, recursos 30), sem IA.
 */
export function PartnerProfileForm({ onSaved }: { onSaved: (profile: PartnerProfile) => void }) {
  const [profile, setProfile] = useState<PartnerProfile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [nationwide, setNationwide] = useState(false);
  const [ufs, setUfs] = useState("");
  const [municipalities, setMunicipalities] = useState("");
  const [territories, setTerritories] = useState("");
  const [categories, setCategories] = useState<DemandCategory[]>([]);
  const [resources, setResources] = useState<DemandNeededResourceType[]>([]);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  function fill(p: PartnerProfile) {
    setProfile(p);
    setNationwide(p.nationwide);
    setUfs(p.ufs.join(", "));
    setMunicipalities(p.municipalities.join("\n"));
    setTerritories(p.territories.join("\n"));
    setCategories(p.interestCategories);
    setResources(p.offeredResources);
  }

  useEffect(() => {
    let alive = true;
    api.getPartnerProfile()
      .then((p) => { if (alive) fill(p); })
      .catch((err) => { if (alive) setLoadError(interestErrorMessage(err, "Não foi possível carregar o perfil de apoio.")); });
    return () => { alive = false; };
  }, []);

  async function save() {
    setBusy(true);
    setFields({});
    setMessage(null);
    const ufList = ufs.split(/[,;\s]+/).map((u) => u.trim().toUpperCase()).filter(Boolean);
    const invalidUf = ufList.find((u) => !UFS.includes(u));
    if (invalidUf) {
      setFields({ ufs: `UF inválida: ${invalidUf}` });
      setBusy(false);
      return;
    }
    try {
      const saved = await api.savePartnerProfile({
        nationwide,
        ufs: ufList,
        municipalities: splitList(municipalities),
        territories: splitList(territories),
        interestCategories: categories,
        offeredResources: resources,
      });
      fill(saved);
      setMessage({ tone: "success", text: "Perfil de apoio salvo. A compatibilidade já considera as novas informações." });
      onSaved(saved);
    } catch (err) {
      if (err instanceof DemandRequestError && Object.keys(err.fields).length) setFields(err.fields as Record<string, string>);
      setMessage({ tone: "error", text: interestErrorMessage(err, "Não foi possível salvar o perfil de apoio.") });
    } finally {
      setBusy(false);
    }
  }

  if (loadError) return <FormAlert message={loadError} />;
  if (!profile) return <div className="flex justify-center py-6"><span className="app-spinner" aria-label="Carregando o perfil de apoio" /></div>;

  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <fieldset className="space-y-3">
        <legend className="text-sm font-bold" style={{ color: "var(--th-text)" }}>Onde você atua</legend>
        <Checkbox name="pa-nacional" label="Atuo em todo o país" checked={nationwide} onChecked={setNationwide} hint="Vale 10 dos 40 pontos de território quando a demanda não está nas áreas abaixo." />
        <TextInput name="ufs" label="Estados (UF)" value={ufs} onValue={setUfs} placeholder="RJ, SP" error={fields.ufs} hint="Separe por vírgula. Encontro no estado: 20 pontos." />
        <TextArea name="municipalities" label="Municípios" value={municipalities} onValue={setMunicipalities} rows={3} placeholder={"Rio de Janeiro/RJ\nNiterói/RJ"} error={fields.municipalities} hint="Um por linha, no formato Município/UF. Encontro no município: 30 pontos." />
        <TextArea name="territories" label="Bairros e territórios" value={territories} onValue={setTerritories} rows={3} placeholder={"Recreio dos Bandeirantes\nMaré"} error={fields.territories} hint="Um por linha. Encontro no território: 40 pontos." />
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-bold" style={{ color: "var(--th-text)" }}>Categorias de demanda que interessam (30 pontos)</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {DEMAND_CATEGORIES.map((category) => (
            <Checkbox
              key={category}
              name={`pa-cat-${category}`}
              label={DEMAND_CATEGORY_LABELS[category]}
              checked={categories.includes(category)}
              onChecked={(on) => setCategories((list) => (on ? [...list, category] : list.filter((c) => c !== category)))}
            />
          ))}
        </div>
        {fields.interestCategories && <FormAlert message={fields.interestCategories} />}
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-bold" style={{ color: "var(--th-text)" }}>Recursos que você oferece (até 30 pontos, pela parte do que a demanda precisa)</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {NEEDED.map((type) => (
            <Checkbox
              key={type}
              name={`pa-rec-${type}`}
              label={RESOURCE_TYPE_LABELS[type]}
              checked={resources.includes(type)}
              onChecked={(on) => setResources((list) => (on ? [...list, type] : list.filter((r) => r !== type)))}
            />
          ))}
        </div>
        {fields.offeredResources && <FormAlert message={fields.offeredResources} />}
      </fieldset>

      {message && <FormAlert tone={message.tone} message={message.text} />}
      <Button type="submit" icon="check" loading={busy} disabled={!profile.editable}>Salvar perfil de apoio</Button>
    </form>
  );
}
