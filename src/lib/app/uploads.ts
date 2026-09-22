/**
 * Upload de arquivos (T08) no navegador: finalidades, tipos e limites
 * espelhados de `services/post-service/src/uploads.js` (há teste que compara),
 * validação antes do envio e endereços de leitura.
 *
 * O servidor é quem decide: confere de novo tipo, tamanho e o conteúdo na
 * confirmação.
 */
import type { UploadPurpose } from "./types";

const MB = 1024 * 1024;

const IMAGE_TYPES: Record<string, string[]> = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
  "image/heic": ["heic"],
  "image/heif": ["heif"],
};

const VIDEO_TYPES: Record<string, string[]> = {
  "video/mp4": ["mp4"],
  "video/quicktime": ["mov"],
};

const DOCUMENT_TYPES: Record<string, string[]> = {
  "application/pdf": ["pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["docx"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ["xlsx"],
  "application/vnd.oasis.opendocument.text": ["odt"],
  "application/vnd.oasis.opendocument.spreadsheet": ["ods"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
};

export interface UploadPurposeRule {
  label: string;
  service: "posts" | "users";
  types: Record<string, string[]>;
  maxBytes: number;
}

export const UPLOAD_PURPOSES: Record<UploadPurpose, UploadPurposeRule> = {
  demand_photo: { label: "Fotografia da demanda", service: "posts", types: IMAGE_TYPES, maxBytes: 15 * MB },
  demand_evidence_photo: { label: "Foto do antes/depois", service: "posts", types: IMAGE_TYPES, maxBytes: 15 * MB },
  demand_evidence_video: { label: "Vídeo do antes/depois", service: "posts", types: VIDEO_TYPES, maxBytes: 500 * MB },
  demand_document: { label: "Documento comprobatório da demanda", service: "posts", types: DOCUMENT_TYPES, maxBytes: 25 * MB },
  institution_proof: { label: "Comprovação da representação", service: "users", types: DOCUMENT_TYPES, maxBytes: 25 * MB },
};

/** Arquivos até este tamanho levam sha256 (o S3 confere a integridade). */
export const SHA256_MAX_BYTES = 25 * MB;

const unique = <T,>(list: T[]): T[] => [...new Set(list)];

/** Extensões aceitas, em maiúsculas, para textos de ajuda ("PDF, DOCX..."). */
export function acceptedExtensions(purpose: UploadPurpose): string[] {
  return unique(Object.values(UPLOAD_PURPOSES[purpose].types).map((exts) => exts[0].toUpperCase()));
}

/**
 * Valor do atributo `accept`: tipos MIME e extensões. O seletor de arquivos
 * do Android (WebView do app) filtra pelos tipos MIME; os navegadores de
 * desktop, pelas extensões. HEIC entra também como `image/heif`.
 */
export function acceptAttribute(purpose: UploadPurpose): string {
  const types = UPLOAD_PURPOSES[purpose].types;
  const exts = unique(Object.values(types).flat()).map((ext) => `.${ext}`);
  return [...Object.keys(types), ...exts].join(",");
}

export function formatBytes(bytes: number): string {
  if (bytes >= MB) return `${(bytes / MB).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} bytes`;
}

function extensionOf(name: string): string | null {
  const match = /\.([a-z0-9]{1,8})$/i.exec(name);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Tipo MIME do arquivo para a finalidade. Usa a extensão quando o navegador
 * não informa (comum com HEIC) ou informa um sinônimo (`image/jpg`).
 */
export function contentTypeFor(purpose: UploadPurpose, file: { name: string; type: string }): string | null {
  const types = UPLOAD_PURPOSES[purpose].types;
  const declared = file.type.split(";")[0].trim().toLowerCase().replace(/^image\/jpg$/, "image/jpeg");
  const ext = extensionOf(file.name);
  if (declared && types[declared] && (!ext || types[declared].includes(ext))) return declared;
  if (ext) {
    const byExt = Object.entries(types).find(([, exts]) => exts.includes(ext));
    if (byExt) return byExt[0];
  }
  return null;
}

export type UploadCheck = { ok: true; contentType: string } | { ok: false; error: string };

/** Confere tipo e tamanho antes de pedir a autorização de envio. */
export function checkUploadFile(purpose: UploadPurpose, file: { name: string; type: string; size: number }): UploadCheck {
  const rule = UPLOAD_PURPOSES[purpose];
  const contentType = contentTypeFor(purpose, file);
  if (!contentType) {
    return { ok: false, error: `Tipo de arquivo não aceito. Envie ${acceptedExtensions(purpose).join(", ")}.` };
  }
  if (file.size <= 0) return { ok: false, error: "O arquivo está vazio." };
  if (file.size > rule.maxBytes) {
    return { ok: false, error: `O arquivo tem ${formatBytes(file.size)} e passa do limite de ${formatBytes(rule.maxBytes)}.` };
  }
  return { ok: true, contentType };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Id do upload em `upload:<id>` (ou id puro); `null` para links e textos. */
export function parseUploadRef(value: string | null | undefined): string | null {
  if (!value) return null;
  const raw = value.trim();
  const id = raw.toLowerCase().startsWith("upload:") ? raw.slice(7) : raw;
  return UUID_RE.test(id) ? id.toLowerCase() : null;
}

/**
 * Endereço de mídia para o navegador. Caminhos `/api/...` (ex.: foto por
 * upload no feed) ganham a base da API quando ela não é o próprio domínio
 * (desenvolvimento local); links absolutos ficam como estão.
 */
export function resolveMediaUrl(url: string, apiBase: string): string {
  if (url.startsWith("/api/") && apiBase) return `${apiBase.replace(/\/$/, "")}${url}`;
  return url;
}
