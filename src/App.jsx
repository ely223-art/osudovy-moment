import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import html2canvas from "html2canvas";
import { toBlob as htmlToImageToBlob, toCanvas as htmlToImageToCanvas } from "html-to-image";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import logo from "./assets/logo.png";
import "./App.css";
import { buildServerDownloadUrl } from "./utils/downloadUrls";
import { getMomentStableId } from "./utils/momentIdentity";
import { buildSelectionCluster } from "./utils/selectionClusters";
import { getMomentReactionKey, loadMomentReactions, resolveMomentReactionState, saveMomentReactions, toggleMomentReaction } from "./utils/momentReactions";

const mapPoints = [
  { id: 1, x: 56, y: 40 },
  { id: 2, x: 58, y: 67 },
  { id: 3, x: 74, y: 30 },
  { id: 4, x: 39, y: 46 },
  { id: 5, x: 28, y: 28 },
];

const mapIcons = [
  { id: "heart", type: "heart", x: 14, y: 30 },
  { id: "ring", type: "ring", x: 34, y: 48 },
  { id: "house", type: "house", x: 48, y: 71 },
  { id: "plane", type: "plane", x: 69, y: 28 },
  { id: "cap", type: "cap", x: 76, y: 51 },
  { id: "paw", type: "paw", x: 56, y: 84 },
  { id: "star", type: "star", x: 83, y: 18 },
];

const normalizeText = (text = "") =>
  text
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const parseCoordinate = (value) => {
  const numberValue = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(numberValue) ? numberValue : null;
};

const MAX_RESULTS = 12;
const STORAGE_KEY = "osudovy-moment-items";
const CLIENT_ID_KEY = "osudovy-moment-client-id";
const PUBLIC_MOMENTS_ENDPOINT = "/.netlify/functions/public-moments";
const EXPORT_JPEG_QUALITY = 0.96;
const EXPORT_CAPTURE_SCALE = 2;
const EXPORT_SHARE_WIDTH = 1200;
const EXPORT_SHARE_HEIGHT = 630;
const EXPORT_MOBILE_WIDTH = 1080;
const EXPORT_MOBILE_HEIGHT = 1920;
const SYMBOL_IMAGE_BY_TYPE = {
  wedding: "/svatba.png",
  engagement: "/zasnuby.png",
  love: "/laska.png",
  birth: "/dite.png",
  home: "/dum.png",
  beginning: "/zacatek.png",
  school: "/skola.png",
  pet: "/mazlicek.png",
  memory: "/vzpominka.png",
  other: "/ostatni.png",
};
const SYMBOL_IMAGE_BY_LABEL = {
  svatba: "/svatba.png",
  zasnuby: "/zasnuby.png",
  laska: "/laska.png",
  "narozeni dite": "/dite.png",
  "novy domov": "/dum.png",
  "novy zacatek": "/zacatek.png",
  skola: "/skola.png",
  "novy mazlicek": "/mazlicek.png",
  vzpominka: "/vzpominka.png",
  ostatni: "/ostatni.png",
};
const isMobileUserAgent = (userAgent = "") => /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent);

const getMarkerScaleFromZoom = (zoomValue = 3) => {
  const safeZoom = Number.isFinite(Number(zoomValue)) ? Number(zoomValue) : 3;
  const clampedZoom = Math.max(3, Math.min(15, safeZoom));
  const normalizedZoom = (clampedZoom - 3) / 8;
  return Number(Math.max(0.86, Math.min(1, 0.86 + normalizedZoom * 0.14)).toFixed(3));
};

const normalizeMomentId = (value = "") => String(value || "").trim().replace(/[^a-zA-Z0-9-]/g, "");

const normalizeReactionPayload = (reactions = {}) => {
  if (!reactions || typeof reactions !== "object" || Array.isArray(reactions)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(reactions)
      .filter(([key, value]) => Boolean(key) && value && typeof value === "object" && !Array.isArray(value))
      .map(([key, value]) => [String(key).trim(), {
        count: Math.max(0, Number(value?.count) || 0),
        liked: Boolean(value?.liked),
      }])
  );
};

const buildMomentReactionPayload = (moment = {}, reactions = {}) => ({
  ...moment,
  reactions: normalizeReactionPayload(reactions),
});

const getOrCreateClientId = () => {
  if (typeof window === "undefined") {
    return "";
  }

  try {
    const existing = normalizeMomentId(window.localStorage.getItem(CLIENT_ID_KEY) || "");
    if (existing) {
      return existing;
    }

    const generated =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
    const normalized = normalizeMomentId(generated);
    if (normalized) {
      window.localStorage.setItem(CLIENT_ID_KEY, normalized);
    }
    return normalized;
  } catch {
    return "";
  }
};

const spreadOverlappingMoments = (moments = [], focusMomentId = "") => {
  const grouped = new Map();

  moments.forEach((moment) => {
    const latitude = parseCoordinate(moment?.latitude);
    const longitude = parseCoordinate(moment?.longitude);
    if (latitude === null || longitude === null) {
      return;
    }

    const key = `${latitude.toFixed(5)}:${longitude.toFixed(5)}`;
    const bucket = grouped.get(key) || [];
    bucket.push(moment);
    grouped.set(key, bucket);
  });

  const spread = [];

  grouped.forEach((bucket) => {
    const count = bucket.length;
    const normalizedFocusId = normalizeMomentId(focusMomentId || "");
    const anchorIndex = normalizedFocusId
      ? bucket.findIndex((moment) => normalizeMomentId(moment.id || "") === normalizedFocusId)
      : 0;
    const resolvedAnchorIndex = anchorIndex >= 0 ? anchorIndex : 0;
    const spreadBucket = bucket.filter((_, index) => index !== resolvedAnchorIndex);

    bucket.forEach((moment, index) => {
      if (count === 1) {
        spread.push({
          ...moment,
          displayLatitude: moment.latitude,
          displayLongitude: moment.longitude,
          overlapCount: 1,
          overlapIndex: 0,
        });
        return;
      }

      if (index === resolvedAnchorIndex) {
        spread.push({
          ...moment,
          displayLatitude: Number(moment.latitude),
          displayLongitude: Number(moment.longitude),
          overlapCount: count,
          overlapIndex: index,
        });
        return;
      }

      const spreadIndex = spreadBucket.findIndex((candidate) => candidate.id === moment.id);
      const angle = (2 * Math.PI * spreadIndex) / Math.max(1, spreadBucket.length);
      const ring = Math.floor(spreadIndex / 8);
      const radiusMeters = 42 + ring * 24;
      const latitude = Number(moment.latitude);
      const metersPerDegreeLat = 111320;
      const metersPerDegreeLng = Math.max(1, 111320 * Math.cos((latitude * Math.PI) / 180));
      const latitudeOffset = (Math.sin(angle) * radiusMeters) / metersPerDegreeLat;
      const longitudeOffset = (Math.cos(angle) * radiusMeters) / metersPerDegreeLng;

      spread.push({
        ...moment,
        displayLatitude: Number(moment.latitude) + latitudeOffset,
        displayLongitude: Number(moment.longitude) + longitudeOffset,
        overlapCount: count,
        overlapIndex: index,
      });
    });
  });

  return spread;
};

const normalizePublicMoment = (moment = {}) => {
  const latitude = parseCoordinate(moment?.latitude);
  const longitude = parseCoordinate(moment?.longitude);
  const id = normalizeMomentId(moment?.id || "") || getMomentReactionKey(moment);

  if (!id || latitude === null || longitude === null) {
    return null;
  }

  const normalized = {
    id,
    ownerId: normalizeMomentId(moment?.ownerId || getMomentStableId(moment)),
    obec: String(moment?.obec || "").slice(0, 120),
    okres: String(moment?.okres || "").slice(0, 120),
    kraj: String(moment?.kraj || "").slice(0, 120),
    stat: String(moment?.stat || "").slice(0, 120),
    latitude,
    longitude,
    symbolType: String(moment?.symbolType || "").slice(0, 60),
    symbolImage: String(moment?.symbolImage || "").slice(0, 400),
    symbolLabel: String(moment?.symbolLabel || "").slice(0, 100),
    nazev: String(moment?.nazev || "").slice(0, 180),
    prikaz: String(moment?.prikaz || "").slice(0, 500),
    datum: String(moment?.datum || "").slice(0, 30),
    createdAt: String(moment?.createdAt || new Date().toISOString()).slice(0, 64),
    reactions: normalizeReactionPayload(moment?.reactions),
  };

  return normalized;
};

const mergeMomentsById = (localMoments = [], remoteMoments = []) => {
  const merged = new Map();

  [...remoteMoments, ...localMoments].forEach((moment) => {
    const normalized = normalizePublicMoment(moment);
    if (!normalized) {
      return;
    }

    const existing = merged.get(normalized.id);
    if (!existing) {
      merged.set(normalized.id, normalized);
      return;
    }

    const existingTime = Date.parse(existing.createdAt || "") || 0;
    const candidateTime = Date.parse(normalized.createdAt || "") || 0;
    if (candidateTime >= existingTime) {
      merged.set(normalized.id, normalized);
    }
  });

  return Array.from(merged.values()).sort((left, right) => {
    const leftTime = Date.parse(left.createdAt || "") || 0;
    const rightTime = Date.parse(right.createdAt || "") || 0;
    return rightTime - leftTime;
  });
};

const ensureMomentOwnerId = (moment = {}, ownerId = "") => {
  const normalizedOwnerId = normalizeMomentId(ownerId || "");
  if (!normalizedOwnerId) {
    return moment;
  }

  return {
    ...moment,
    ownerId: normalizedOwnerId,
  };
};

const blobToDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("Nepodařilo se převést obrázek na data URL."));
    reader.readAsDataURL(blob);
  });

const canvasToJpegBlob = async (canvas, quality = EXPORT_JPEG_QUALITY) => {
  const dataUrl = canvas.toDataURL("image/jpeg", quality);
  const response = await fetch(dataUrl);
  const jpegBlob = await response.blob();
  if (jpegBlob.type !== "image/jpeg") {
    throw new Error("Nepodařilo se vytvořit JPEG výstup.");
  }
  return jpegBlob;
};

const computeAspectRatio = (width, height) => {
  if (!Number.isFinite(width) || !Number.isFinite(height) || height <= 0) {
    return null;
  }

  return Number((width / height).toFixed(6));
};

const readBlobImageDimensions = async (blob) => {
  if (!blob) {
    return null;
  }

  const objectUrl = URL.createObjectURL(blob);

  try {
    const image = await new Promise((resolve, reject) => {
      const loadedImage = new Image();
      loadedImage.onload = () => resolve(loadedImage);
      loadedImage.onerror = () => reject(new Error("Nepodařilo se načíst blob pro diagnostiku exportu."));
      loadedImage.src = objectUrl;
    });

    const width = image.naturalWidth || image.width || 0;
    const height = image.naturalHeight || image.height || 0;

    return {
      width,
      height,
      aspectRatio: computeAspectRatio(width, height),
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

const normalizeShareBlobToJpeg = async (blob, quality = EXPORT_JPEG_QUALITY) => {
  if (!blob || blob.type === "image/jpeg") {
    return blob;
  }

  const objectUrl = URL.createObjectURL(blob);

  try {
    const image = await new Promise((resolve, reject) => {
      const loadedImage = new Image();
      loadedImage.onload = () => resolve(loadedImage);
      loadedImage.onerror = () => reject(new Error("Nepodařilo se načíst exportovaný obrázek."));
      loadedImage.src = objectUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Nepodařilo se připravit JPEG konverzi.");
    }

    context.fillStyle = "#07111f";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0);

    return canvasToJpegBlob(canvas, quality);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

const buildPublicAssetUrl = (assetPath = "") => {
  const base = import.meta.env.BASE_URL || "/";
  const normalizedBase = base.endsWith("/") ? base : `${base}/`;
  const normalizedPath = assetPath.replace(/^\/+/, "");
  return `${normalizedBase}${normalizedPath}`;
};

const resolveImageUrl = (source = "", fallback = "") => {
  const input = (source || fallback || "").trim();
  if (!input) {
    return "";
  }

  if (/^(data:|blob:|https?:)/i.test(input)) {
    return input;
  }

  const normalized = input.startsWith("/") ? input.slice(1) : input;
  const relativeUrl = buildPublicAssetUrl(normalized);

  if (typeof window === "undefined") {
    return relativeUrl;
  }

  try {
    return new URL(relativeUrl, window.location.origin).toString();
  } catch {
    return relativeUrl;
  }
};

const formatMomentLocation = (moment = {}) => {
  const locationParts = [moment.obec, moment.okres, moment.kraj].filter(Boolean);
  const locationText = locationParts.join(" · ");

  if (moment.stat) {
    return locationText ? `${locationText} · ${moment.stat}` : moment.stat;
  }

  return locationText;
};

const resolveMomentSymbolImage = (moment = {}, selectedSymbolImage = "") => {
  const normalizedType = normalizeText(moment?.symbolType || "");
  const typeBasedSource = SYMBOL_IMAGE_BY_TYPE[normalizedType] || "";
  const normalizedLabel = normalizeText(moment?.symbolLabel || "");
  const labelBasedSource = SYMBOL_IMAGE_BY_LABEL[normalizedLabel] || "";
  const sourceName = (moment?.symbolImage || "").split("/").pop() || "";
  const normalizedSourceName = normalizeText(sourceName).replace(/[^a-z0-9.]/g, "");
  const fileBasedSource =
    normalizedSourceName && /^(svatba|zasnuby|laska|dite|dum|zacatek|skola|mazlicek|vzpominka|ostatni)\.png$/.test(normalizedSourceName)
      ? `/${normalizedSourceName}`
      : "";

  if (typeBasedSource) {
    return resolveImageUrl(typeBasedSource, "ostatni.png");
  }

  if (labelBasedSource) {
    return resolveImageUrl(labelBasedSource, "ostatni.png");
  }

  if (fileBasedSource) {
    return resolveImageUrl(fileBasedSource, "ostatni.png");
  }

  if (moment?.symbolImage) {
    return resolveImageUrl(moment.symbolImage, "ostatni.png");
  }

  return resolveImageUrl(selectedSymbolImage || "", "ostatni.png");
};

function renderMomentMarkerBody(symbolImage) {
  const safeSymbolSource = String(symbolImage || "/ostatni.png").replace(/\"/g, "&quot;");

  return `
    <span class="completion-map-marker__glow" style="transform: translate(-50%, -50%) scale(0.7);"></span>
    <span class="completion-map-marker__dot" style="transform: translate(-50%, -50%) scale(0.7);"></span>
    <span class="completion-map-marker__line" style="transform: translate(-50%, -100%) scaleY(1);"></span>
    <span class="completion-map-marker__icon" style="transform: translate(-50%, -100%) scale(0.8);">
      <img class="completion-map-marker__image" src="${safeSymbolSource}" alt="Symbol" loading="eager" decoding="sync" onerror="this.onerror=null;this.src='/ostatni.png';" />
    </span>
  `;
}

function renderMomentMarkerMarkup(symbolImage, classNames = []) {
  const classes = ["completion-map-marker", ...classNames].filter(Boolean).join(" ");

  return `
    <div class="${classes}" role="button" tabindex="0" aria-label="Osudový moment">
      ${renderMomentMarkerBody(symbolImage)}
    </div>
  `;
}

function IconSymbol({ type, x, y }) {
  return (
    <g className="map-icon" transform={`translate(${x} ${y})`}>
      {type === "heart" && (
        <path d="M0 2.3c0-1.3 1.1-2.3 2.4-2.3 1 0 1.8.5 2.3 1.2.5-.7 1.3-1.2 2.3-1.2 1.3 0 2.4 1 2.4 2.3 0 1.3-1.2 2.7-3.3 4.6-1.2 1.1-2.1 2-2.4 2.3-.3-.3-1.3-1.2-2.4-2.3C1.2 5 0 3.6 0 2.3Z" />
      )}
      {type === "ring" && (
        <>
          <circle cx="2.6" cy="2.6" r="2.2" />
          <circle cx="2.6" cy="2.6" r="0.9" />
        </>
      )}
      {type === "house" && (
        <path d="M0 3.2L2.6 1 5.2 3.2v3.8H0zM1.1 6.7h2.8v1.8H1.1z" />
      )}
      {type === "plane" && (
        <path d="M0 2.2L5.8 2 4 0l1.1 2.2L4 4.4l1.9 1.1L0 2.2Z" />
      )}
      {type === "cap" && (
        <>
          <path d="M0 2.5L2.6.8 5.2 2.5" />
          <path d="M1.3 2.5h2.6v2.2H1.3z" />
          <path d="M1.2 4.8h2.8" />
        </>
      )}
      {type === "paw" && (
        <path d="M0 4.4c0-.8.6-1.4 1.3-1.4.7 0 1.2.3 1.4.8.2.5.8.8 1.4.8.7 0 1.3-.3 1.4-.8.2-.5.7-.8 1.4-.8.7 0 1.3.6 1.3 1.4 0 1.6-1.3 2.8-2 3.6-.5.5-1.1.8-1.5 1-.4-.2-1-.5-1.5-1-.7-.8-2-2-2-3.6Z" />
      )}
      {type === "star" && (
        <path d="M2.5 0l.8 1.8 2 .2-1.5 1.3.5 2-1.8-1.1-1.8 1.1.5-2-1.5-1.3 2-.2L2.5 0Z" />
      )}
    </g>
  );
}

function MobileMomentExportCard({
  completeMoment,
  exportMomentUrl,
  exportMapContainerRef,
  selectedSymbolLabel,
}) {
  return (
    <>
      <header className="mobile-export-header">
        <img className="mobile-export-logo" src={logo} alt="Logo Osudový moment" />
      </header>

      <div className="mobile-export-map-shell">
        <div className="map-animated-surface is-ready">
          {typeof completeMoment.latitude === "number" && typeof completeMoment.longitude === "number" ? (
            <div className="completion-map-wrapper completion-map-wrapper--export" ref={exportMapContainerRef} />
          ) : (
            <div className="completion-map-error">Pro vybrané místo chybí souřadnice.</div>
          )}
        </div>
      </div>

      <div className="mobile-export-heading">
        <h2 className="mobile-export-title">Váš osudový moment právě zazářil</h2>
        <p className="mobile-export-place">
          {[completeMoment.obec, completeMoment.okres, completeMoment.kraj, completeMoment.stat].filter(Boolean).join(" · ") || "—"}
        </p>
      </div>

      <section className="mobile-export-details" aria-label="Detaily osudového momentu">
        <div className="mobile-export-detail-row">
          <span className="mobile-export-label">Místo</span>
          <span className="mobile-export-value">
            {[completeMoment.obec, completeMoment.okres, completeMoment.kraj, completeMoment.stat].filter(Boolean).join(" · ") || "—"}
          </span>
        </div>

        <div className="mobile-export-detail-row mobile-export-detail-row--symbol">
          <span className="mobile-export-label">Typ symbolu</span>
          <span className="mobile-export-value mobile-export-value--symbol">
            {completeMoment.symbolImage ? (
              <img
                className="mobile-export-symbol-image"
                src={completeMoment.symbolImage}
                alt={completeMoment.symbolLabel || selectedSymbolLabel || "Symbol"}
              />
            ) : null}
            <span>{completeMoment.symbolLabel || selectedSymbolLabel || "—"}</span>
          </span>
        </div>

        <div className="mobile-export-detail-row">
          <span className="mobile-export-label">Název momentu</span>
          <span className="mobile-export-value">{completeMoment.nazev || "—"}</span>
        </div>

        {completeMoment.prikaz ? (
          <div className="mobile-export-detail-row">
            <span className="mobile-export-label">Příběh / poznámka</span>
            <span className="mobile-export-value mobile-export-value--story">{completeMoment.prikaz}</span>
          </div>
        ) : null}

        {completeMoment.datum ? (
          <div className="mobile-export-detail-row">
            <span className="mobile-export-label">Datum</span>
            <span className="mobile-export-value">{completeMoment.datum}</span>
          </div>
        ) : null}

        <div className="mobile-export-detail-row">
          <span className="mobile-export-label">Web</span>
          <span className="mobile-export-value mobile-export-value--web">{exportMomentUrl}</span>
        </div>
      </section>

      <footer className="mobile-export-footer">
        <span className="mobile-export-url">{exportMomentUrl}</span>
        <p className="line-by-mine-credit">© Line By Mine</p>
      </footer>
    </>
  );
}

function App() {
  const mapContainerRef = useRef(null);
  const completionMapRef = useRef(null);
  const markerRef = useRef(null);
  const publicMapContainerRef = useRef(null);
  const publicMapRef = useRef(null);
  const publicMarkerElementsRef = useRef(new Map());
  const selectedPublicMomentIdRef = useRef("");
  const publicMarkerLayoutSyncRef = useRef(null);
  const completionScreenRef = useRef(null);
  const completionCardRef = useRef(null);
  const exportCardRef = useRef(null);
  const exportMobileCardRef = useRef(null);
  const exportMapContainerRef = useRef(null);
  const exportMapRef = useRef(null);
  const shareImageBlobRef = useRef(null);
  const shareImageObjectUrlRef = useRef("");
  const directDownloadRef = useRef({ url: "", isObjectUrl: false });
  const animationStartedRef = useRef(false);
  const animationTimersRef = useRef([]);
  const [screen, setScreen] = useState("home");
  const [clientId, setClientId] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedTown, setSelectedTown] = useState(null);
  const [selectedSymbol, setSelectedSymbol] = useState(null);
  const [momentTitle, setMomentTitle] = useState("");
  const [momentStory, setMomentStory] = useState("");
  const [momentDate, setMomentDate] = useState("");
  const [completeMoment, setCompleteMoment] = useState(null);
  const [animationComplete, setAnimationComplete] = useState(false);
  const [animationStage, setAnimationStage] = useState("idle");
  const [mapReady, setMapReady] = useState(false);
  const [savedMoments, setSavedMoments] = useState([]);
  const [remotePublicMoments, setRemotePublicMoments] = useState([]);
  const [activeMapMoment, setActiveMapMoment] = useState(null);
  const [selectedPublicMoment, setSelectedPublicMoment] = useState(null);
  const [selectedPublicMomentGroup, setSelectedPublicMomentGroup] = useState([]);
  const [selectedPublicMomentGroupIndex, setSelectedPublicMomentGroupIndex] = useState(0);
  const [momentReactions, setMomentReactions] = useState({});
  const [towns, setTowns] = useState([]);
  const [townsLoaded, setTownsLoaded] = useState(false);
  const [townsLoading, setTownsLoading] = useState(false);
  const [townsError, setTownsError] = useState("");
  const [shareStatus, setShareStatus] = useState("");
  const [shareLinkUrl, setShareLinkUrl] = useState("");
  const [exportShareId, setExportShareId] = useState("");
  const [directDownloadUrl, setDirectDownloadUrl] = useState("");
  const [directDownloadFilename, setDirectDownloadFilename] = useState("");
  const [isPreparingShareImage, setIsPreparingShareImage] = useState(false);
  const [shareImageReady, setShareImageReady] = useState(false);
  const [sharedMomentId, setSharedMomentId] = useState("");
  const [sharedMomentImageError, setSharedMomentImageError] = useState(false);

  useEffect(() => {
    selectedPublicMomentIdRef.current = normalizeMomentId(selectedPublicMoment?.id || "");
  }, [selectedPublicMoment?.id]);
  const websiteUrl = "https://osudovymoment.cz";
  const publicMapMoments = useMemo(
    () => mergeMomentsById([], remotePublicMoments),
    [remotePublicMoments]
  );

  useEffect(() => {
    if (!selectedPublicMoment?.id) {
      return;
    }

    const matchingMoment = publicMapMoments.find((moment) => normalizeMomentId(moment?.id || "") === normalizeMomentId(selectedPublicMoment.id));
    if (!matchingMoment) {
      return;
    }

    const currentSerialized = JSON.stringify(selectedPublicMoment?.reactions || {});
    const nextSerialized = JSON.stringify(matchingMoment?.reactions || {});
    if (currentSerialized !== nextSerialized) {
      setSelectedPublicMoment(matchingMoment);
    }
  }, [publicMapMoments, selectedPublicMoment?.id, selectedPublicMoment?.reactions]);
  const isMobileClient = useMemo(() => {
    if (typeof navigator === "undefined") {
      return false;
    }

    return isMobileUserAgent(navigator.userAgent || "");
  }, []);

  useEffect(() => {
    setClientId(getOrCreateClientId());
  }, []);

  useEffect(() => {
    const syncMomentReactions = () => {
      setMomentReactions(loadMomentReactions());
    };

    syncMomentReactions();

    if (typeof window === "undefined") {
      return undefined;
    }

    window.addEventListener("moment-reactions-updated", syncMomentReactions);
    window.addEventListener("storage", syncMomentReactions);
    window.addEventListener("focus", syncMomentReactions);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        syncMomentReactions();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("moment-reactions-updated", syncMomentReactions);
      window.removeEventListener("storage", syncMomentReactions);
      window.removeEventListener("focus", syncMomentReactions);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const rawShareId = (params.get("share") || params.get("id") || "").trim();
    const safeShareId = rawShareId.replace(/[^a-zA-Z0-9-]/g, "");

    if (safeShareId) {
      setSharedMomentId(safeShareId);
      setSharedMomentImageError(false);
    }
  }, []);

  useEffect(() => {
    let isCancelled = false;
    const controller = new AbortController();

    setTownsLoading(true);
    setTownsError("");
    setTownsLoaded(false);

    Promise.all([
      fetch("/data/obce.json", { signal: controller.signal }),
      fetch("/data/countries.json", { signal: controller.signal }),
      fetch("/data/global-places.json", { signal: controller.signal }),
      fetch("/data/foreign-places.json", { signal: controller.signal }),
      fetch("/data/world-places.json", { signal: controller.signal }),
    ])
      .then(async ([czechResponse, foreignResponse, globalResponse, foreignPlacesResponse, worldPlacesResponse]) => {
        if (!czechResponse.ok) {
          throw new Error(`HTTP ${czechResponse.status}`);
        }

        if (!foreignResponse.ok) {
          throw new Error(`HTTP ${foreignResponse.status}`);
        }

        if (!globalResponse.ok) {
          throw new Error(`HTTP ${globalResponse.status}`);
        }

        if (!foreignPlacesResponse.ok) {
          throw new Error(`HTTP ${foreignPlacesResponse.status}`);
        }

        if (!worldPlacesResponse.ok) {
          throw new Error(`HTTP ${worldPlacesResponse.status}`);
        }

        const czechData = await czechResponse.json();
        const foreignData = await foreignResponse.json();
        const globalData = await globalResponse.json();
        const foreignPlacesData = await foreignPlacesResponse.json();
        const worldPlacesData = await worldPlacesResponse.json();

        if (!Array.isArray(czechData) || !Array.isArray(foreignData) || !Array.isArray(globalData) || !Array.isArray(foreignPlacesData) || !Array.isArray(worldPlacesData)) {
          throw new Error("JSON má neočekávaný formát.");
        }

        const combinedData = [...czechData, ...foreignData, ...globalData, ...foreignPlacesData, ...worldPlacesData];

        if (!isCancelled) {
          setTowns(combinedData);
          setTownsLoaded(true);
          setTownsLoading(false);
          console.log("Počet položek:", combinedData.length);
        }
      })
      .catch((error) => {
        if (!isCancelled) {
          setTowns([]);
          setTownsLoaded(true);
          setTownsLoading(false);
          const errorMessage =
            error instanceof Error
              ? `Nepodařilo se načíst data. ${error.message}`
              : "Nepodařilo se načíst data.";
          setTownsError(errorMessage);
          console.error("Chyba načítání dat:", error);
        }
      });

    return () => {
      isCancelled = true;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        setSavedMoments([]);
        return undefined;
      }

      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        const currentClientId = getOrCreateClientId();
        const normalizedMoments = parsed.map((moment) => ensureMomentOwnerId(moment, currentClientId));
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizedMoments));
        setSavedMoments(normalizedMoments);
      } else {
        setSavedMoments([]);
        window.localStorage.setItem(STORAGE_KEY, "[]");
      }
    } catch (error) {
      console.error("Nepodařilo se načíst uložené momenty:", error);
      setSavedMoments([]);
    }

    return undefined;
  }, []);

  const loadRemotePublicMoments = useCallback(async () => {
    try {
      const response = await fetch(PUBLIC_MOMENTS_ENDPOINT, {
        method: "GET",
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload = await response.json();
      const moments = Array.isArray(payload?.moments)
        ? payload.moments.map((moment) => normalizePublicMoment(moment)).filter(Boolean)
        : [];

      setRemotePublicMoments(moments);
    } catch (error) {
      console.error("Nepodařilo se načíst veřejné momenty:", error);
      setRemotePublicMoments([]);
    }
  }, []);

  const publishMomentToPublicMap = useCallback(async (moment) => {
    const normalized = normalizePublicMoment(moment);
    if (!normalized) {
      return false;
    }

    try {
      const response = await fetch(PUBLIC_MOMENTS_ENDPOINT, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(normalized),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload = await response.json();
      const moments = Array.isArray(payload?.moments)
        ? payload.moments.map((item) => normalizePublicMoment(item)).filter(Boolean)
        : null;

      if (moments) {
        setRemotePublicMoments(moments);
      }

      return true;
    } catch (error) {
      console.error("Nepodařilo se publikovat moment na veřejnou mapu:", error);
      return false;
    }
  }, []);

  const deleteMomentFromPublicMap = useCallback(async (momentId, ownerId) => {
    const safeMomentId = normalizeMomentId(momentId || "");
    const safeOwnerId = normalizeMomentId(ownerId || "");

    if (!safeMomentId || !safeOwnerId) {
      return false;
    }

    try {
      const response = await fetch(PUBLIC_MOMENTS_ENDPOINT, {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          id: safeMomentId,
          ownerId: safeOwnerId,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload = await response.json();
      const moments = Array.isArray(payload?.moments)
        ? payload.moments.map((item) => normalizePublicMoment(item)).filter(Boolean)
        : [];
      setRemotePublicMoments(moments);
      return true;
    } catch (error) {
      console.error("Nepodařilo se smazat veřejný moment:", error);
      return false;
    }
  }, []);

  const canDeleteMoment = useCallback((moment) => {
    if (!moment?.id) {
      return false;
    }

    const safeId = normalizeMomentId(moment.id);
    const safeOwnerId = normalizeMomentId(moment.ownerId || "");
    const hasLocalCopy = savedMoments.some((localMoment) => normalizeMomentId(localMoment?.id || "") === safeId);

    if (safeOwnerId && clientId && safeOwnerId === clientId) {
      return true;
    }

    if (safeOwnerId && clientId && !safeOwnerId) {
      return true;
    }

    // Backward compatibility for legacy local-only moments created before ownerId existed.
    if (!safeOwnerId && hasLocalCopy) {
      return true;
    }

    return false;
  }, [clientId, savedMoments]);

  useEffect(() => {
    loadRemotePublicMoments();
  }, [loadRemotePublicMoments]);

  useEffect(() => {
    if (!clientId || !savedMoments.length) {
      return;
    }

    const legacyMoments = savedMoments.filter((moment) => !normalizeMomentId(moment?.ownerId || ""));
    if (!legacyMoments.length) {
      return;
    }

    const updatedSavedMoments = savedMoments.map((moment) => ensureMomentOwnerId(moment, clientId));

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedSavedMoments));
      setSavedMoments(updatedSavedMoments);
    } catch (error) {
      console.error("Nepodařilo se uložit migraci starších momentů:", error);
      return;
    }

    // Backfill ownership in public storage so legacy own moments can be deleted.
    Promise.all(
      legacyMoments.map((moment) => publishMomentToPublicMap(ensureMomentOwnerId(moment, clientId)))
    ).catch((error) => {
      console.error("Migrace starších momentů do veřejné mapy selhala:", error);
    });
  }, [clientId, savedMoments, publishMomentToPublicMap]);

  useEffect(() => {
    if (screen !== "town") {
      setDebouncedSearch("");
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 300);

    return () => window.clearTimeout(timer);
  }, [screen, search]);

  const normalizedTowns = useMemo(
    () =>
      towns.map((town) => ({
        ...town,
        normalizedName: normalizeText(town.nazev || ""),
        normalizedOkres: normalizeText(town.okres || ""),
        normalizedKraj: normalizeText(town.kraj || ""),
      })),
    [towns]
  );

  const filteredTowns = useMemo(() => {
    const normalizedQuery = normalizeText(debouncedSearch);

    if (!normalizedQuery || normalizedQuery.length < 2) {
      return [];
    }

    const queryParts = normalizedQuery.split(/\s+/).filter(Boolean);
    const queryWithoutSpaces = normalizedQuery.replace(/\s+/g, "");

    const scored = normalizedTowns
      .map((town) => {
        const haystackFields = [
          town.normalizedName,
          town.normalizedName.replace(/\s+/g, ""),
          town.normalizedOkres,
          town.normalizedKraj,
        ];

        const matchesAllParts = queryParts.every((part) =>
          haystackFields.some((field) => field.includes(part))
        );

        if (!matchesAllParts) {
          return null;
        }

        let score = 0;
        const displayName = town.normalizedName || "";

        if (displayName === normalizedQuery || displayName.replace(/\s+/g, "") === queryWithoutSpaces) {
          score += 120;
        } else if (displayName.startsWith(normalizedQuery)) {
          score += 90;
        } else if (displayName.includes(normalizedQuery)) {
          score += 70;
        }

        if (displayName.startsWith(normalizedQuery.slice(0, 2))) {
          score += 20;
        }

        if (town.normalizedOkres.startsWith(normalizedQuery)) {
          score += 18;
        } else if (town.normalizedOkres.includes(normalizedQuery)) {
          score += 10;
        }

        if (town.normalizedKraj.startsWith(normalizedQuery)) {
          score += 12;
        } else if (town.normalizedKraj.includes(normalizedQuery)) {
          score += 6;
        }

        const sameNameScore = displayName === normalizedQuery ? 40 : 0;

        return { ...town, score: score + sameNameScore };
      })
      .filter(Boolean)
      .sort((left, right) => {
        const sameNameGroup =
          normalizeText(left.nazev) === normalizeText(right.nazev)
            ? 0
            : normalizeText(left.nazev).startsWith(normalizedQuery) &&
              normalizeText(right.nazev).startsWith(normalizedQuery)
            ? 0
            : 0;

        if (left.score !== right.score) {
          return right.score - left.score;
        }

        const leftName = normalizeText(left.nazev);
        const rightName = normalizeText(right.nazev);
        const leftStarts = leftName.startsWith(normalizedQuery);
        const rightStarts = rightName.startsWith(normalizedQuery);

        if (leftStarts !== rightStarts) {
          return leftStarts ? -1 : 1;
        }

        if (leftName === rightName) {
          return 0;
        }

        const leftGroup = leftName === normalizedQuery ? 0 : 1;
        const rightGroup = rightName === normalizedQuery ? 0 : 1;
        if (leftGroup !== rightGroup) {
          return leftGroup - rightGroup;
        }

        if (leftName < rightName) {
          return -1;
        }
        if (leftName > rightName) {
          return 1;
        }

        return 0;
      });

    const grouped = scored.reduce((result, town) => {
      const nameKey = normalizeText(town.nazev);
      const existing = result.find((entry) => normalizeText(entry.nazev) === nameKey);

      if (existing) {
        existing.items.push(town);
      } else {
        result.push({ nameKey, items: [town] });
      }

      return result;
    }, []);

    const orderedGroups = grouped.sort((left, right) => {
      const leftNames = left.items.map((item) => normalizeText(item.nazev));
      const rightNames = right.items.map((item) => normalizeText(item.nazev));
      const leftExact = leftNames.some((name) => name === normalizedQuery);
      const rightExact = rightNames.some((name) => name === normalizedQuery);
      if (leftExact !== rightExact) {
        return leftExact ? -1 : 1;
      }

      const leftStarts = leftNames.some((name) => name.startsWith(normalizedQuery));
      const rightStarts = rightNames.some((name) => name.startsWith(normalizedQuery));
      if (leftStarts !== rightStarts) {
        return leftStarts ? -1 : 1;
      }

      return left.nameKey.localeCompare(right.nameKey);
    });

    const flattened = orderedGroups.flatMap((group) => group.items);
    return flattened.slice(0, MAX_RESULTS);
  }, [debouncedSearch, normalizedTowns]);

  const handleTownSelect = (town) => {
    setSelectedTown(town);
  };

  const openTownScreen = () => {
    setScreen("town");
    setSearch("");
    setSelectedTown(null);
    setSelectedSymbol(null);
    setTownsError("");
  };

  const goHome = () => {
    setScreen("home");
    setSearch("");
    setSelectedTown(null);
    setSelectedSymbol(null);
    setSelectedPublicMoment(null);
    setTownsError("");
  };

  const goToSymbolStep = () => {
    if (selectedTown) {
      setScreen("symbol");
    }
  };

  const handleSymbolSelect = (symbol) => {
    setSelectedSymbol(symbol);
  };

  const goToNextStep = () => {
    if (selectedSymbol) {
      setScreen("next");
    }
  };

  const slugify = (value) =>
    value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "osudovy-moment";

  const uploadShareImageForFacebook = async (blob, title, forcedShareId = "", options = {}) => {
    const maxAttempts = 3;
    let lastError = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const headers = {
          "content-type": options.renderMode === "template" ? "application/octet-stream" : "image/jpeg",
          "x-share-title": encodeURIComponent(title || "Osudovy moment"),
        };

        headers["x-share-client"] = options.client || "desktop";

        if (options.renderMode === "template") {
          headers["x-share-render"] = "template";
          headers["x-share-place"] = encodeURIComponent(options.place || "");
          headers["x-share-symbol"] = encodeURIComponent(options.symbol || "");
          headers["x-share-url"] = encodeURIComponent(options.shareUrl || "");
        }

        if (forcedShareId) {
          headers["x-share-id"] = encodeURIComponent(forcedShareId);
        }

        const response = await fetch("/.netlify/functions/create-share-link", {
          method: "POST",
          headers,
          body: blob || new Blob(["template"], { type: "application/octet-stream" }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Upload failed: ${response.status} ${errorText}`);
        }

        const payload = await response.json();
        if (!payload?.shareUrl) {
          throw new Error("Upload response is missing shareUrl");
        }

        return payload;
      } catch (error) {
        lastError = error;
        if (attempt < maxAttempts) {
          await new Promise((resolve) => window.setTimeout(resolve, 260 * attempt));
        }
      }
    }

    console.error("Facebook image upload failed", {
      message: lastError?.message || String(lastError),
      name: lastError?.name || null,
    });

    return null;
  };

  const waitForShareImageAvailability = async (imageUrl, timeoutMs = 9000) => {
    if (!imageUrl) {
      return false;
    }

    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      try {
        const probeUrl = `${imageUrl}${imageUrl.includes("?") ? "&" : "?"}cb=${Date.now()}`;
        const response = await fetch(probeUrl, {
          method: "GET",
          cache: "no-store",
        });

        if (response.ok) {
          return true;
        }
      } catch (probeError) {
        console.error("Share image probe failed", {
          message: probeError?.message || String(probeError),
          name: probeError?.name || null,
        });
      }

      await new Promise((resolve) => window.setTimeout(resolve, 250));
    }

    return false;
  };

  const waitForSharePageAvailability = async (shareUrl, timeoutMs = 9000) => {
    if (!shareUrl) {
      return false;
    }

    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      try {
        const probeUrl = `${shareUrl}${shareUrl.includes("?") ? "&" : "?"}cb=${Date.now()}`;
        const response = await fetch(probeUrl, {
          method: "GET",
          cache: "no-store",
        });

        if (response.ok) {
          return true;
        }
      } catch (probeError) {
        console.error("Share page probe failed", {
          message: probeError?.message || String(probeError),
          name: probeError?.name || null,
        });
      }

      await new Promise((resolve) => window.setTimeout(resolve, 250));
    }

    return false;
  };

  const setDirectDownloadLink = (url, filename, isObjectUrl = false) => {
    const previous = directDownloadRef.current;
    if (previous.isObjectUrl && previous.url && previous.url !== url) {
      URL.revokeObjectURL(previous.url);
    }

    directDownloadRef.current = { url: url || "", isObjectUrl };
    setDirectDownloadUrl(url || "");
    setDirectDownloadFilename(filename || "");
  };

  const clearDirectDownloadLink = () => {
    const previous = directDownloadRef.current;
    if (previous.isObjectUrl && previous.url) {
      URL.revokeObjectURL(previous.url);
    }

    directDownloadRef.current = { url: "", isObjectUrl: false };
    setDirectDownloadUrl("");
    setDirectDownloadFilename("");
  };

  const appendVersionQuery = (url, token) => {
    if (!url) {
      return "";
    }

    try {
      const parsed = new URL(url, websiteUrl);
      parsed.searchParams.set("v", String(token || Date.now()));
      return parsed.toString();
    } catch {
      const separator = url.includes("?") ? "&" : "?";
      return `${url}${separator}v=${encodeURIComponent(String(token || Date.now()))}`;
    }
  };

  const triggerServerDownload = (downloadUrl, options = {}) => {
    const { sameTab = false } = options;

    if (!downloadUrl) {
      return false;
    }

    try {
      if (sameTab) {
        window.location.assign(downloadUrl);
        return true;
      }

      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = "";
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
      return true;
    } catch (error) {
      console.error("Server download trigger failed", {
        message: error?.message || String(error),
        name: error?.name || null,
      });
      return false;
    }
  };

  const waitForCompletionMapTiles = async (mapNode = completionCardRef.current?.querySelector(".completion-map-wrapper"), timeoutMs = 3200) => {
    if (!mapNode) {
      return false;
    }

    const hasLoadedTiles = () => {
      const tiles = mapNode.querySelectorAll("img.leaflet-tile");
      if (!tiles.length) {
        return false;
      }

      return Array.from(tiles).every((tile) => tile.complete && tile.naturalWidth > 0);
    };

    if (hasLoadedTiles()) {
      return true;
    }

    await new Promise((resolve) => {
      const startedAt = Date.now();
      const poll = () => {
        if (hasLoadedTiles() || Date.now() - startedAt >= timeoutMs) {
          resolve();
          return;
        }

        window.setTimeout(poll, 80);
      };

      poll();
    });

    return hasLoadedTiles();
  };

  const waitForNodeImages = async (node, timeoutMs = 6000) => {
    if (!node) {
      return;
    }

    const images = Array.from(node.querySelectorAll("img"));
    if (!images.length) {
      return;
    }

    const waitForSingleImage = (image) =>
      new Promise((resolve) => {
        if (image.complete && image.naturalWidth > 0) {
          resolve();
          return;
        }

        let settled = false;
        const finish = () => {
          if (settled) {
            return;
          }
          settled = true;
          image.removeEventListener("load", finish);
          image.removeEventListener("error", finish);
          resolve();
        };

        image.addEventListener("load", finish, { once: true });
        image.addEventListener("error", finish, { once: true });
        window.setTimeout(finish, timeoutMs);

        if (typeof image.decode === "function") {
          image.decode().then(finish).catch(finish);
        }
      });

    await Promise.all(images.map((image) => waitForSingleImage(image)));
  };

  const preloadImageSources = async (sources, timeoutMs = 9000) => {
    const uniqueSources = Array.from(new Set((sources || []).filter(Boolean)));
    if (!uniqueSources.length) {
      return true;
    }

    const results = await Promise.all(
      uniqueSources.map(
        (source) =>
          new Promise((resolve) => {
            const image = new Image();
            let settled = false;

            const finish = (loaded) => {
              if (settled) {
                return;
              }
              settled = true;
              resolve(loaded);
            };

            image.onload = () => finish(true);
            image.onerror = () => finish(false);
            image.decoding = "sync";
            image.src = source;

            if (image.complete) {
              finish(image.naturalWidth > 0);
              return;
            }

            window.setTimeout(() => finish(image.complete && image.naturalWidth > 0), timeoutMs);
          })
      )
    );

    return results.every(Boolean);
  };

  const lockSymbolAspectRatio = async (imageElement, maxSizePx) => {
    if (!imageElement) {
      return;
    }

    if (!(imageElement.complete && imageElement.naturalWidth > 0 && imageElement.naturalHeight > 0)) {
      await new Promise((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) {
            return;
          }
          settled = true;
          resolve();
        };

        imageElement.addEventListener("load", finish, { once: true });
        imageElement.addEventListener("error", finish, { once: true });
        window.setTimeout(finish, 2000);
      });
    }

    const naturalWidth = imageElement.naturalWidth || 0;
    const naturalHeight = imageElement.naturalHeight || 0;
    if (!naturalWidth || !naturalHeight) {
      return;
    }

    imageElement.style.width = "auto";
    imageElement.style.height = "auto";
    imageElement.style.maxWidth = `${maxSizePx}px`;
    imageElement.style.maxHeight = `${maxSizePx}px`;
    imageElement.style.objectFit = "contain";
    imageElement.style.aspectRatio = `${naturalWidth} / ${naturalHeight}`;
  };

  const prepareShareImage = async (shareId = "") => {
    console.log("Export started", {
      screen,
      completeMomentId: completeMoment?.id || null,
    });

    const userAgent = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
    const isMobileDevice = isMobileUserAgent(userAgent);
    const baseCaptureNode = isMobileDevice ? exportMobileCardRef.current : exportCardRef.current;

    if (!baseCaptureNode || !completeMoment || isPreparingShareImage) {
      console.error("Export failed", {
        reason: "Missing export/completion card area or moment, or preparation already running",
        hasExportCard: !!exportCardRef.current,
        hasCompletionCard: !!completionCardRef.current,
        hasCompleteMoment: !!completeMoment,
        isPreparingShareImage,
      });
      return null;
    }

    setIsPreparingShareImage(true);
    let captureNode = null;
    let captureSurface = null;
    let previousNodeInlineStyles = null;

    try {
      const node = baseCaptureNode;
      if (!node) {
        throw new Error("Nepodařilo se najít kartu pro export.");
      }

      captureNode = node;
      captureSurface = node.closest(".export-render-surface");
      node.classList.add("is-capturing");
      captureSurface?.classList.add("is-capturing");

      const exportCardImageElements = Array.from(node.querySelectorAll("img"));
      const exportCardImageSources = exportCardImageElements
        .map((image) => image.currentSrc || image.src)
        .filter(Boolean);
      const preloadOk = await preloadImageSources(exportCardImageSources, 9000);
      if (!preloadOk) {
        console.warn("Some share-card images did not preload before capture", {
          sources: exportCardImageSources,
        });
      }

      if (typeof document !== "undefined" && document.fonts?.ready) {
        try {
          await document.fonts.ready;
        } catch (fontError) {
          console.error("Font readiness wait failed", {
            message: fontError?.message || String(fontError),
            name: fontError?.name || null,
          });
        }
      }

      const exportSymbolImage = node.querySelector(".completion-map-marker__image");
      if (exportSymbolImage) {
        const exportSymbolImageUrl = exportSymbolImage.currentSrc || exportSymbolImage.src || "";
        if (exportSymbolImageUrl && !exportSymbolImageUrl.startsWith("data:")) {
          try {
            const exportSymbolResponse = await fetch(exportSymbolImageUrl, { cache: "force-cache" });
            if (exportSymbolResponse.ok) {
              const exportSymbolBlob = await exportSymbolResponse.blob();
              const exportSymbolDataUrl = await blobToDataUrl(exportSymbolBlob);
              exportSymbolImage.src = exportSymbolDataUrl;
              exportSymbolImage.removeAttribute("srcset");
            }
          } catch (symbolImageError) {
            console.warn("Failed to inline export symbol image", {
              message: symbolImageError?.message || String(symbolImageError),
              name: symbolImageError?.name || null,
            });
          }
        }

        await lockSymbolAspectRatio(exportSymbolImage, 118);
      }

      const exportSummarySymbolImage = node.querySelector(".mobile-export-symbol-image");
      if (exportSummarySymbolImage) {
        await lockSymbolAspectRatio(exportSummarySymbolImage, 30);
      }

      const missingImages = Array.from(node.querySelectorAll("img")).filter(
        (image) => !(image.complete && image.naturalWidth > 0)
      );
      if (missingImages.length > 0) {
        console.warn("Share-card images are still pending, continuing export", {
          count: missingImages.length,
          images: missingImages.map((image) => image.currentSrc || image.src || "unknown"),
        });
        await waitForNodeImages(node, 1400);
      }

      const exportMarkerImage = node.querySelector(".completion-map-marker__image");
      if (exportMarkerImage && !(exportMarkerImage.complete && exportMarkerImage.naturalWidth > 0)) {
        await waitForNodeImages(node, 4200);
      }

      await new Promise((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(resolve);
        });
      });

      const captureRect = node.getBoundingClientRect();
      const captureWidth = Math.max(
        1,
        Math.round(captureRect.width || (isMobileDevice ? EXPORT_MOBILE_WIDTH : EXPORT_SHARE_WIDTH))
      );
      const captureHeight = Math.max(
        1,
        Math.round(captureRect.height || (isMobileDevice ? EXPORT_MOBILE_HEIGHT : EXPORT_SHARE_HEIGHT))
      );
      const captureScale = isMobileDevice ? 1 : EXPORT_CAPTURE_SCALE;
      const captureJpegQuality = isMobileDevice ? 1 : EXPORT_JPEG_QUALITY;
      const domAspectRatio = computeAspectRatio(captureRect.width, captureRect.height);

      console.log("[export-diagnostics] dom", {
        rectWidth: captureRect.width,
        rectHeight: captureRect.height,
        roundedWidth: captureWidth,
        roundedHeight: captureHeight,
        aspectRatio: domAspectRatio,
        targetWidth: isMobileDevice ? EXPORT_MOBILE_WIDTH : EXPORT_SHARE_WIDTH,
        targetHeight: isMobileDevice ? EXPORT_MOBILE_HEIGHT : EXPORT_SHARE_HEIGHT,
        targetAspectRatio: computeAspectRatio(
          isMobileDevice ? EXPORT_MOBILE_WIDTH : EXPORT_SHARE_WIDTH,
          isMobileDevice ? EXPORT_MOBILE_HEIGHT : EXPORT_SHARE_HEIGHT
        ),
        captureScale,
        isMobileDevice,
      });

      previousNodeInlineStyles = {
        position: node.style.position,
        left: node.style.left,
        top: node.style.top,
        margin: node.style.margin,
        transform: node.style.transform,
        zIndex: node.style.zIndex,
      };

      node.style.position = "fixed";
      node.style.left = "0";
      node.style.top = "0";
      node.style.margin = "0";
      node.style.transform = "none";
      node.style.zIndex = "2147483646";

      if (exportMapRef.current && typeof exportMapRef.current.invalidateSize === "function") {
        try {
          exportMapRef.current.invalidateSize();
        } catch (mapSizeError) {
          console.error("Export map invalidateSize failed", {
            message: mapSizeError?.message || String(mapSizeError),
            name: mapSizeError?.name || null,
          });
        }
      }

      await new Promise((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(resolve);
        });
      });

      const exportMapNode = node.querySelector(".completion-map-wrapper--export") || node.querySelector(".completion-map-wrapper");
      let mapTilesReady = await waitForCompletionMapTiles(exportMapNode, 7000);

      if (!mapTilesReady && exportMapRef.current && typeof exportMapRef.current.invalidateSize === "function") {
        try {
          exportMapRef.current.invalidateSize();
        } catch (mapSizeRetryError) {
          console.error("Export map second invalidateSize failed", {
            message: mapSizeRetryError?.message || String(mapSizeRetryError),
            name: mapSizeRetryError?.name || null,
          });
        }

        await new Promise((resolve) => window.setTimeout(resolve, 260));
        mapTilesReady = await waitForCompletionMapTiles(exportMapNode, 3200);
      }

      if (!mapTilesReady) {
        await new Promise((resolve) => window.setTimeout(resolve, isMobileDevice ? 900 : 450));
        mapTilesReady = await waitForCompletionMapTiles(exportMapNode, isMobileDevice ? 5200 : 2800);
      }

      await waitForNodeImages(node, 9000);

      if (isMobileDevice) {
        await new Promise((resolve) => window.setTimeout(resolve, 320));
      }

      node.classList.add("capture-freeze");

      const captureWithHtml2Canvas = async (foreignObjectRendering) => {
        const mobileCaptureDimensions = isMobileDevice
          ? {
              width: EXPORT_MOBILE_WIDTH,
              height: EXPORT_MOBILE_HEIGHT,
              windowWidth: EXPORT_MOBILE_WIDTH,
              windowHeight: EXPORT_MOBILE_HEIGHT,
            }
          : {};

        const canvas = await html2canvas(node, {
          backgroundColor: "#07111f",
          useCORS: true,
          allowTaint: false,
          scrollX: 0,
          scrollY: 0,
          imageTimeout: 15000,
          removeContainer: true,
          logging: false,
          foreignObjectRendering,
          scale: captureScale,
          ...mobileCaptureDimensions,
        });

        console.log("[export-diagnostics] html2canvas-canvas", {
          foreignObjectRendering,
          canvasWidth: canvas.width,
          canvasHeight: canvas.height,
          canvasAspectRatio: computeAspectRatio(canvas.width, canvas.height),
        });

        const html2CanvasBlob = await new Promise((resolve, reject) => {
          canvasToJpegBlob(canvas, captureJpegQuality).then(resolve).catch(reject);
        });

        const html2CanvasBlobMetrics = await readBlobImageDimensions(html2CanvasBlob);
        console.log("[export-diagnostics] html2canvas-blob", {
          foreignObjectRendering,
          type: html2CanvasBlob?.type || null,
          size: html2CanvasBlob?.size || null,
          width: html2CanvasBlobMetrics?.width || null,
          height: html2CanvasBlobMetrics?.height || null,
          aspectRatio: html2CanvasBlobMetrics?.aspectRatio || null,
        });

        return html2CanvasBlob;
      };

      let blob = null;

      if (isMobileDevice) {
        try {
          blob = await captureWithHtml2Canvas(false);
        } catch (mobileCanvasError) {
          console.error("Mobile html2canvas primary capture failed", {
            message: mobileCanvasError?.message || String(mobileCanvasError),
            name: mobileCanvasError?.name || null,
          });
        }
      }

      if (!blob) {
        try {
          const htmlToImageCanvas = await htmlToImageToCanvas(node, {
            cacheBust: true,
            pixelRatio: captureScale,
            backgroundColor: "#07111f",
            canvasWidth: isMobileDevice ? EXPORT_MOBILE_WIDTH : undefined,
            canvasHeight: isMobileDevice ? EXPORT_MOBILE_HEIGHT : undefined,
          });

          console.log("[export-diagnostics] html-to-image-canvas", {
            canvasWidth: htmlToImageCanvas.width,
            canvasHeight: htmlToImageCanvas.height,
            canvasAspectRatio: computeAspectRatio(htmlToImageCanvas.width, htmlToImageCanvas.height),
          });

          blob = await htmlToImageToBlob(node, {
            cacheBust: true,
            pixelRatio: captureScale,
            quality: captureJpegQuality,
            type: "image/jpeg",
            backgroundColor: "#07111f",
            canvasWidth: isMobileDevice ? EXPORT_MOBILE_WIDTH : undefined,
            canvasHeight: isMobileDevice ? EXPORT_MOBILE_HEIGHT : undefined,
          });

          if (blob) {
            const htmlToImageBlobMetrics = await readBlobImageDimensions(blob);
            console.log("[export-diagnostics] html-to-image-blob", {
              type: blob.type,
              size: blob.size,
              width: htmlToImageBlobMetrics?.width || null,
              height: htmlToImageBlobMetrics?.height || null,
              aspectRatio: htmlToImageBlobMetrics?.aspectRatio || null,
            });
          }
        } catch (primaryCaptureError) {
          console.error("html-to-image capture failed, falling back to html2canvas", {
            message: primaryCaptureError?.message || String(primaryCaptureError),
            name: primaryCaptureError?.name || null,
          });
        }
      }

      try {
        if (!blob) {
          blob = await captureWithHtml2Canvas(false);
        }
      } catch (shareCanvasError) {
        console.error("Share-card html2canvas failed, trying foreignObject", {
          message: shareCanvasError?.message || String(shareCanvasError),
          name: shareCanvasError?.name || null,
        });
      }

      if (!blob) {
        try {
          blob = await captureWithHtml2Canvas(true);
        } catch (foreignObjectError) {
          console.error("Share-card html2canvas (foreignObject) failed, trying html-to-image", {
            message: foreignObjectError?.message || String(foreignObjectError),
            name: foreignObjectError?.name || null,
          });
        }
      }

      if (!blob) {
        throw new Error("Nepodařilo se připravit JPG.");
      }

      blob = await normalizeShareBlobToJpeg(blob, captureJpegQuality);

      const finalBlobMetrics = await readBlobImageDimensions(blob);
      console.log("[export-diagnostics] final-jpg", {
        type: blob?.type || null,
        size: blob?.size || null,
        width: finalBlobMetrics?.width || null,
        height: finalBlobMetrics?.height || null,
        aspectRatio: finalBlobMetrics?.aspectRatio || null,
        domAspectRatio,
        aspectDelta:
          finalBlobMetrics?.aspectRatio !== null && domAspectRatio !== null
            ? Number((finalBlobMetrics.aspectRatio - domAspectRatio).toFixed(6))
            : null,
      });

      console.log("JPG generated", {
        width: Math.round(captureWidth * captureScale),
        height: Math.round(captureHeight * captureScale),
        type: blob.type,
      });

      shareImageBlobRef.current = blob;
      setShareImageReady(true);

      if (shareImageObjectUrlRef.current) {
        URL.revokeObjectURL(shareImageObjectUrlRef.current);
      }

      shareImageObjectUrlRef.current = URL.createObjectURL(blob);
      return blob;
    } catch (error) {
      console.error("Nepodařilo se připravit kartičku pro sdílení:", error);
      console.error("Export step error", {
        message: error?.message || String(error),
        name: error?.name || null,
        stack: error?.stack || null,
      });
      setShareImageReady(false);
      return null;
    } finally {
      if (captureNode) {
        captureNode.classList.remove("is-capturing");
      }

      if (captureNode && previousNodeInlineStyles) {
        captureNode.style.position = previousNodeInlineStyles.position;
        captureNode.style.left = previousNodeInlineStyles.left;
        captureNode.style.top = previousNodeInlineStyles.top;
        captureNode.style.margin = previousNodeInlineStyles.margin;
        captureNode.style.transform = previousNodeInlineStyles.transform;
        captureNode.style.zIndex = previousNodeInlineStyles.zIndex;
      }

      captureSurface?.classList.remove("is-capturing");
      exportCardRef.current?.classList.remove("capture-freeze");
      exportMobileCardRef.current?.classList.remove("capture-freeze");
      completionCardRef.current?.classList.remove("capture-freeze");
      completionScreenRef.current?.classList.remove("capture-freeze");
      setIsPreparingShareImage(false);
    }
  };

  const saveMomentToStorage = (moment) => {
    if (typeof window === "undefined") {
      return [];
    }

    const existing = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
    const updated = [...existing, moment];
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    setSavedMoments(updated);
    return updated;
  };

  const removeMomentFromStorage = (momentId) => {
    if (typeof window === "undefined") {
      return [];
    }

    const existing = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
    const updated = existing.filter((moment) => moment.id !== momentId);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    setSavedMoments(updated);
    return updated;
  };

  const handleToggleMomentReaction = useCallback((momentOrId = "") => {
    const safeId = typeof momentOrId === "object" && momentOrId !== null
      ? getMomentReactionKey(momentOrId)
      : normalizeMomentId(momentOrId || "");

    if (!safeId) {
      return;
    }

    setMomentReactions((current) => {
      const next = toggleMomentReaction(current, momentOrId);
      saveMomentReactions(next);

      const sourceMoment = typeof momentOrId === "object" && momentOrId !== null
        ? momentOrId
        : selectedPublicMoment;

      if (sourceMoment?.id) {
        const nextMomentPayload = buildMomentReactionPayload(sourceMoment, next);
        setSelectedPublicMoment((currentMoment) => currentMoment?.id === sourceMoment.id ? nextMomentPayload : currentMoment);
        publishMomentToPublicMap(nextMomentPayload).catch((error) => {
          console.error("Nepodařilo se uložit reakce do veřejného momentu:", error);
        });
      }

      return next;
    });
  }, [publishMomentToPublicMap, selectedPublicMoment]);

  const getCurrentMomentReactionState = useCallback((moment = {}) => {
    const resolvedState = resolveMomentReactionState(momentReactions, moment);
    return resolvedState.state || { count: 0, liked: false };
  }, [momentReactions]);

  const handleDeleteSelectedPublicMoment = async () => {
    if (!selectedPublicMoment?.id) {
      return;
    }

    if (!canDeleteMoment(selectedPublicMoment)) {
      window.alert("Tento moment nelze z tohoto zařízení smazat.");
      return;
    }

    removeMomentFromStorage(selectedPublicMoment.id);
    const safeOwnerId = normalizeMomentId(selectedPublicMoment.ownerId || "");
    if (safeOwnerId) {
      const deletedRemote = await deleteMomentFromPublicMap(selectedPublicMoment.id, safeOwnerId);
      if (!deletedRemote) {
        window.alert("Mazání veřejného momentu se nepodařilo. Zkuste to prosím znovu.");
      }
    }

    loadRemotePublicMoments().catch((error) => {
      console.error("Obnova veřejných momentů po smazání selhala:", error);
    });
    setSelectedPublicMoment(null);
    setSelectedPublicMomentGroup([]);
    setSelectedPublicMomentGroupIndex(0);
  };

  const showPublicMomentAtGroupIndex = useCallback((index) => {
    if (!selectedPublicMomentGroup.length) {
      return;
    }

    const size = selectedPublicMomentGroup.length;
    const normalizedIndex = ((index % size) + size) % size;
    setSelectedPublicMomentGroupIndex(normalizedIndex);
    setSelectedPublicMoment(selectedPublicMomentGroup[normalizedIndex] || null);
  }, [selectedPublicMomentGroup]);

  useEffect(() => {
    if (!selectedPublicMoment) {
      return;
    }

    const latestReactions = loadMomentReactions();
    const payloadReactions = normalizeReactionPayload(selectedPublicMoment?.reactions);
    const mergedReactions = { ...payloadReactions, ...latestReactions };

    if (Object.keys(mergedReactions).length) {
      setMomentReactions(mergedReactions);
    }
  }, [selectedPublicMoment?.id, selectedPublicMoment?.latitude, selectedPublicMoment?.longitude, selectedPublicMoment?.createdAt, selectedPublicMoment?.nazev, selectedPublicMoment?.reactions]);

  const showNextPublicMoment = useCallback(() => {
    showPublicMomentAtGroupIndex(selectedPublicMomentGroupIndex + 1);
  }, [selectedPublicMomentGroupIndex, showPublicMomentAtGroupIndex]);

  const showPreviousPublicMoment = useCallback(() => {
    showPublicMomentAtGroupIndex(selectedPublicMomentGroupIndex - 1);
  }, [selectedPublicMomentGroupIndex, showPublicMomentAtGroupIndex]);

  const selectClusteredPublicMoment = useCallback((moment, clusterItems = []) => {
    const clusterSelection = buildSelectionCluster(
      clusterItems,
      moment,
      86,
      (candidate) => {
        const x = Number(candidate?.screenX ?? candidate?.x ?? 0);
        const y = Number(candidate?.screenY ?? candidate?.y ?? 0);
        return { x, y };
      }
    );

    if (!clusterSelection.cluster.length) {
      setSelectedPublicMomentGroup([moment]);
      setSelectedPublicMomentGroupIndex(0);
      setSelectedPublicMoment(moment);
      return;
    }

    const orderedCluster = [...clusterSelection.cluster].sort((left, right) => {
      const leftTime = Date.parse(left.createdAt || "") || 0;
      const rightTime = Date.parse(right.createdAt || "") || 0;
      return rightTime - leftTime;
    });

    const activeIndex = Math.max(0, orderedCluster.findIndex((item) => item.id === moment.id));
    setSelectedPublicMomentGroup(orderedCluster);
    setSelectedPublicMomentGroupIndex(activeIndex);
    setSelectedPublicMoment(orderedCluster[activeIndex] || moment);
  }, []);

  const syncSelectedPublicMarker = useCallback(() => {
    const selectedId = normalizeMomentId(selectedPublicMoment?.id || "");
    const markerMap = publicMarkerElementsRef.current;

    markerMap.forEach((element, markerId) => {
      if (!element) {
        return;
      }

      const isActive = !!selectedId && markerId === selectedId;
      element.classList.toggle("is-selected", isActive);
      element.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  }, [selectedPublicMoment?.id]);

  const goToCompletionStep = (event) => {
    event.preventDefault();

    if (!momentTitle.trim()) {
      return;
    }

    const latitude = parseCoordinate(selectedTown?.latitude);
    const longitude = parseCoordinate(selectedTown?.longitude);
    const effectiveOwnerId = clientId || getOrCreateClientId();
    if (!clientId && effectiveOwnerId) {
      setClientId(effectiveOwnerId);
    }

    const createdMoment = {
      id: `${Date.now()}`,
      ownerId: effectiveOwnerId,
      obec: selectedTown?.nazev || "",
      okres: selectedTown?.okres || "",
      kraj: selectedTown?.kraj || "",
      stat: selectedTown?.stat || selectedTown?.stát || selectedTown?.country || "",
      latitude,
      longitude,
      symbolType: selectedSymbol?.id || "",
      symbolImage: resolveImageUrl(selectedSymbol?.image || "", "ostatni.png"),
      symbolLabel: selectedSymbol?.label || "",
      nazev: momentTitle.trim(),
      prikaz: momentStory.trim(),
      datum: momentDate || "",
      createdAt: new Date().toISOString(),
    };

    saveMomentToStorage(createdMoment);
    publishMomentToPublicMap(createdMoment).catch((error) => {
      console.error("Publikace momentu selhala:", error);
    });
    setCompleteMoment(createdMoment);
    setAnimationComplete(false);
    setScreen("complete");
    setActiveMapMoment(createdMoment);
  };

  const exportCompletionCard = async (mode) => {
    if (!completionCardRef.current || !completeMoment) {
      return;
    }

    if (isPreparingShareImage) {
      return;
    }

    setShareStatus("");
    setShareLinkUrl("");
    clearDirectDownloadLink();

    const buildFacebookShareUrl = (targetUrl = websiteUrl) =>
      isMobileClient
        ? `https://m.facebook.com/sharer.php?u=${encodeURIComponent(targetUrl)}`
        : `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(targetUrl)}`;

    const openFacebookShare = (targetUrl = websiteUrl) => {
      const facebookShareUrl = buildFacebookShareUrl(targetUrl);

      if (isMobileClient) {
        window.location.assign(facebookShareUrl);
        return;
      }

      const facebookWindow = window.open(
        facebookShareUrl,
        "_blank",
        "noopener,noreferrer"
      );
      if (!facebookWindow) {
        window.location.assign(facebookShareUrl);
      }
    };

    const openNativeMobileShare = async (targetUrl = websiteUrl) => {
      if (!isMobileClient || typeof navigator === "undefined" || typeof navigator.share !== "function") {
        return false;
      }

      try {
        await navigator.share({
          title: "Osudovy moment",
          text: "Muj osudovy moment",
          url: targetUrl,
        });
        return true;
      } catch (shareError) {
        console.error("Native mobile share failed", {
          message: shareError?.message || String(shareError),
          name: shareError?.name || null,
        });
        return false;
      }
    };

    let activeShareId = exportShareId;
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      activeShareId = crypto.randomUUID();
      setExportShareId(activeShareId);
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }

    try {
      if (isMobileClient) {
        // Mobile devices are sensitive to stale hidden-canvas snapshots; force fresh capture on action.
        shareImageBlobRef.current = null;
        setShareImageReady(false);
        if (shareImageObjectUrlRef.current) {
          URL.revokeObjectURL(shareImageObjectUrlRef.current);
          shareImageObjectUrlRef.current = "";
        }
      }

      const filename = `${slugify(completeMoment.obec || completeMoment.nazev || "osudovy-moment")}.jpg`;
      const blob = shareImageBlobRef.current || (await prepareShareImage(activeShareId));
      const attemptToken = `${Date.now()}`;
      const debugCode = activeShareId ? activeShareId.slice(0, 8) : attemptToken.slice(-8);

      if (!blob) {
        setShareStatus("JPG se nepodařilo připravit. Zkuste to znovu.");
        return;
      }

      if (mode === "share") {
        setShareStatus(`Připravuji odkaz s náhledem vašeho momentu pro Facebook… (${debugCode})`);
        const uploadedShare = await uploadShareImageForFacebook(
          blob,
          completeMoment.nazev,
          activeShareId,
          { client: "desktop" }
        );
        if (!uploadedShare?.shareUrl) {
          const fallbackMomentUrl = `${websiteUrl}/s/${encodeURIComponent(activeShareId || exportShareId || "")}`;
          if (activeShareId || exportShareId) {
            setShareLinkUrl(fallbackMomentUrl);
            setShareStatus(`Nepodařilo se připravit Facebook náhled. Zkuste sdílení znovu za pár sekund. (${debugCode})`);
          } else {
            setShareStatus(`Nepodařilo se připravit odkaz pro Facebook. Zkuste to prosím znovu. (${debugCode})`);
          }
          return;
        }
        if (uploadedShare?.imageUrl) {
          // Warm up the endpoints without blocking the user flow on mobile browsers.
          await Promise.all([
            waitForShareImageAvailability(uploadedShare.imageUrl, 4000),
            waitForSharePageAvailability(uploadedShare.shareUrl, 4000),
          ]).catch(() => null);
        }
        const facebookTargetUrl = uploadedShare.shareUrl;
        setShareLinkUrl(facebookTargetUrl);

        if (isMobileClient) {
          const sharedViaNativeSheet = await openNativeMobileShare(facebookTargetUrl);
          if (sharedViaNativeSheet) {
            setShareStatus(`Odkaz je pripraven a otevren v mobilnim sdileni. Pokud Facebook nevidite, pouzijte tlacitko krok 2. (${debugCode})`);
          } else {
            setShareStatus(`Odkaz je pripraven. Klepnete na tlacitko "Otevrit sdileni na Facebooku" niz. (${debugCode})`);
          }
        } else {
          openFacebookShare(facebookTargetUrl);
        }

        if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
          try {
            await navigator.clipboard.writeText(facebookTargetUrl);
          } catch (clipboardError) {
            console.error("Clipboard write failed", {
              message: clipboardError?.message || String(clipboardError),
              name: clipboardError?.name || null,
            });
          }
        }

        if (!isMobileClient) {
          setShareStatus(
            `Facebook sdílení je připravené jako odkaz s náhledem vašeho momentu. (${debugCode})`
          );
        }
      } else {
        if (isMobileClient) {
          if (typeof navigator !== "undefined" && typeof navigator.share === "function" && typeof File !== "undefined") {
            try {
              const sharedFile = new File([blob], filename, { type: "image/jpeg" });
              const canShareFiles = typeof navigator.canShare !== "function" || navigator.canShare({ files: [sharedFile] });

              if (canShareFiles) {
                await navigator.share({
                  title: "Osudovy moment",
                  text: "Muj osudovy moment #osudovymoment",
                  files: [sharedFile],
                });
                setShareStatus("JPG je pripraveno a otevreno v mobilnim sdileni.");
                return;
              }
            } catch (nativeShareError) {
              console.error("Native JPG share failed", {
                message: nativeShareError?.message || String(nativeShareError),
                name: nativeShareError?.name || null,
              });
            }
          }

          const uploadedDownload = await uploadShareImageForFacebook(
            blob,
            completeMoment.nazev,
            activeShareId,
            { client: "mobile" }
          );
          if (uploadedDownload?.imageUrl) {
            await waitForShareImageAvailability(uploadedDownload.imageUrl, 6000);

            const mobileDownloadUrl = appendVersionQuery(
              buildServerDownloadUrl(uploadedDownload.imageUrl, filename) || uploadedDownload.imageUrl,
              attemptToken
            );
            setDirectDownloadLink(mobileDownloadUrl, filename, false);
            window.location.assign(mobileDownloadUrl);
            setShareStatus("JPG otevřeno pro stažení. V mobilním Chrome případně použijte menu a zvolte Stáhnout.");
            return;
          }

          const mobileBlobUrl = shareImageObjectUrlRef.current || URL.createObjectURL(blob);
          setDirectDownloadLink(mobileBlobUrl, filename, mobileBlobUrl.startsWith("blob:"));
          window.location.assign(mobileBlobUrl);
          setShareStatus("JPG otevřeno. Pokud se nestáhne samo, použijte nabídku prohlížeče nebo podržte obrázek.");
          return;
        }

        if (!isMobileClient) {
          const desktopBlobUrl = URL.createObjectURL(blob);
          setDirectDownloadLink(desktopBlobUrl, filename, true);

          const link = document.createElement("a");
          link.href = desktopBlobUrl;
          link.download = filename;
          link.rel = "noopener";
          document.body.appendChild(link);
          link.click();
          link.remove();

          setShareStatus("Stahuji JPG v plne kvalite.");
          return;
        }
      }
    } catch (error) {
      console.error("Nepodařilo se vytvořit JPG kartičku:", error);
      console.error("Export/share flow error", {
        mode,
        message: error?.message || String(error),
        name: error?.name || null,
        stack: error?.stack || null,
      });

      if (mode === "share") {
        const hasCachedBlob = !!shareImageBlobRef.current;
        const uploadedShare = hasCachedBlob
          ? await uploadShareImageForFacebook(
            shareImageBlobRef.current,
            completeMoment.nazev,
            activeShareId,
            { client: "desktop" }
          )
          : null;
        const attemptToken = `${Date.now()}`;
        const debugCode = activeShareId ? activeShareId.slice(0, 8) : attemptToken.slice(-8);
        if (!uploadedShare?.shareUrl) {
          const fallbackMomentUrl = `${websiteUrl}/s/${encodeURIComponent(activeShareId || exportShareId || "")}`;
          if (activeShareId || exportShareId) {
            setShareLinkUrl(fallbackMomentUrl);
            setShareStatus(`Nepodařilo se připravit Facebook náhled. Zkuste sdílení znovu za pár sekund. (${debugCode})`);
          } else {
            setShareStatus(`Nepodařilo se připravit odkaz pro Facebook. Zkuste to prosím znovu. (${debugCode})`);
          }
          return;
        }
        if (uploadedShare?.imageUrl) {
          await Promise.all([
            waitForShareImageAvailability(uploadedShare.imageUrl, 4000),
            waitForSharePageAvailability(uploadedShare.shareUrl, 4000),
          ]).catch(() => null);
        }
        const facebookTargetUrl = uploadedShare.shareUrl;
        setShareLinkUrl(facebookTargetUrl);

        if (isMobileClient) {
          const sharedViaNativeSheet = await openNativeMobileShare(facebookTargetUrl);
          if (sharedViaNativeSheet) {
            setShareStatus(`Odkaz je pripraven a otevren v mobilnim sdileni. Pokud Facebook nevidite, pouzijte tlacitko krok 2. (${debugCode})`);
          } else {
            setShareStatus(`Odkaz je pripraven. Klepnete na tlacitko "Otevrit sdileni na Facebooku" niz. (${debugCode})`);
          }
        } else {
          openFacebookShare(facebookTargetUrl);
        }

        if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
          try {
            await navigator.clipboard.writeText(facebookTargetUrl);
          } catch (clipboardError) {
            console.error("Clipboard write failed", {
              message: clipboardError?.message || String(clipboardError),
              name: clipboardError?.name || null,
            });
          }
        }

        if (!isMobileClient) {
          setShareStatus(
            `Facebook sdílení je připravené jako odkaz s náhledem vašeho momentu. (${debugCode})`
          );
        }
      } else {
        setShareStatus("Nepodařilo se vytvořit kartičku. Zkuste to znovu.");
      }
    }
  };

  useEffect(() => {
    shareImageBlobRef.current = null;
    setShareImageReady(false);
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      setExportShareId(crypto.randomUUID());
    } else {
      setExportShareId("");
    }
    clearDirectDownloadLink();

    if (shareImageObjectUrlRef.current) {
      URL.revokeObjectURL(shareImageObjectUrlRef.current);
      shareImageObjectUrlRef.current = "";
    }
  }, [completeMoment?.id]);

  useEffect(() => {
    if (screen !== "complete" || !completeMoment || !animationComplete || isPreparingShareImage || shareImageReady) {
      return;
    }

    const userAgent = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
    if (isMobileUserAgent(userAgent)) {
      return;
    }

    if (!exportShareId) {
      return;
    }

    prepareShareImage().catch((error) => {
      console.error("Background JPG pre-generation failed", {
        message: error?.message || String(error),
        name: error?.name || null,
      });
    });
  }, [screen, completeMoment?.id, animationComplete, isPreparingShareImage, shareImageReady, exportShareId]);

  const exportMomentUrl = useMemo(() => {
    if (!exportShareId) {
      return websiteUrl;
    }

    return `${websiteUrl}/s/${encodeURIComponent(exportShareId)}`;
  }, [exportShareId]);

  const sharedMomentUrl = useMemo(() => {
    if (!sharedMomentId) {
      return "";
    }

    return `${websiteUrl}/s/${encodeURIComponent(sharedMomentId)}`;
  }, [sharedMomentId]);

  const sharedMomentImageUrl = useMemo(() => {
    if (!sharedMomentId) {
      return "";
    }

    return `${websiteUrl}/.netlify/functions/share-image?id=${encodeURIComponent(sharedMomentId)}`;
  }, [sharedMomentId]);

  const renderMomentSummary = () => (
    <div className="completion-summary">
      <div className="completion-summary__row">
        <span className="completion-label">Symbol</span>
        <span className="completion-value">{completeMoment.symbolLabel || selectedSymbol?.label || "—"}</span>
      </div>
      <div className="completion-summary__row">
        <span className="completion-label">Název</span>
        <span className="completion-value">{completeMoment.nazev}</span>
      </div>
      {completeMoment.datum ? (
        <div className="completion-summary__row">
          <span className="completion-label">Datum</span>
          <span className="completion-value">{completeMoment.datum}</span>
        </div>
      ) : null}
      {completeMoment.prikaz ? (
        <div className="completion-summary__row">
          <span className="completion-label">Příběh</span>
          <span className="completion-value">{completeMoment.prikaz}</span>
        </div>
      ) : null}
      <div className="completion-summary__row">
        <span className="completion-label">Web</span>
        <span className="completion-value">{exportMomentUrl}</span>
      </div>
    </div>
  );

  const renderExportCardContent = () => (
    <>
      <div className="completion-map-shell completion-map-shell--export">
        <div className="map-animated-surface is-ready">
          {typeof completeMoment.latitude === "number" && typeof completeMoment.longitude === "number" ? (
            <div className="completion-map-wrapper completion-map-wrapper--export" ref={exportMapContainerRef} />
          ) : (
            <div className="completion-map-error">Pro vybrané místo chybí souřadnice.</div>
          )}
        </div>
      </div>

      <div className="completion-content completion-content--export">
        <h2 className="wizard-title">Váš osudový moment právě zazářil</h2>
        <p className="completion-subtitle">
          {formatMomentLocation(completeMoment)}
        </p>

        {renderMomentSummary()}
        <p className="line-by-mine-credit">© Line By Mine</p>
      </div>
    </>
  );

  const renderCompletionCardContent = ({ showActions = false, mapRef = mapContainerRef } = {}) => (
    <>
      <div className="completion-map-shell">
        <div className={`map-animated-surface ${animationComplete ? "is-ready" : ""}`}>
          {typeof completeMoment.latitude === "number" && typeof completeMoment.longitude === "number" ? (
            <div className="completion-map-wrapper" ref={mapRef} />
          ) : (
            <div className="completion-map-error">Pro vybrané místo chybí souřadnice.</div>
          )}
        </div>
      </div>

      <div className="completion-content">
        <h2 className="wizard-title">Váš osudový moment právě zazářil</h2>
        <p className="completion-subtitle">
          {formatMomentLocation(completeMoment)}
        </p>

        {renderMomentSummary()}
        <p className="line-by-mine-credit">© Line By Mine</p>

        {showActions ? (
          <div className="completion-actions">
            <button className="wizard-continue" type="button" onClick={handleAddAnotherMoment}>
              Přidat další symbol
            </button>
            <button className="wizard-continue" type="button" onClick={handleOpenPublicMap}>
              Prohlédnout mapu osudových momentů
            </button>
            {!isMobileClient ? (
              <button className="wizard-continue" type="button" onClick={() => exportCompletionCard("share")}>
                Sdílet na Facebook
              </button>
            ) : null}
            <button className="wizard-continue" type="button" onClick={() => exportCompletionCard("download")}>
              {isMobileClient ? "Stahnout / Sdilet JPG" : "Stáhnout JPG"}
            </button>
          </div>
        ) : null}

        {showActions && shareStatus ? <p className="completion-share-status">{shareStatus}</p> : null}
        {showActions && shareLinkUrl && !isMobileClient ? (
          <p className="completion-share-status">
            <a
              className="wizard-continue"
              href={
                isMobileClient
                  ? `https://m.facebook.com/sharer.php?u=${encodeURIComponent(shareLinkUrl)}`
                  : `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareLinkUrl)}`
              }
              target="_blank"
              rel="noopener noreferrer"
            >
              Otevrit sdileni na Facebooku (krok 2)
            </a>
          </p>
        ) : null}
      </div>
    </>
  );

  useEffect(() => {
    if (screen !== "complete") {
      setMapReady(false);
      setAnimationStage("idle");
      return undefined;
    }

    console.log("Completion screen mounted");

    const selectedPlace = completeMoment || selectedTown;
    if (!selectedPlace) {
      return undefined;
    }

    const latitude = Number(selectedPlace.latitude);
    const longitude = Number(selectedPlace.longitude);

    console.log("Coordinates:", latitude, longitude);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      console.error("Invalid coordinates:", selectedPlace);
      return undefined;
    }

    const container = mapContainerRef.current;
    if (!container) {
      return undefined;
    }

    console.log("Creating main map");

    const clearAnimationTimers = () => {
      animationTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      animationTimersRef.current = [];
    };

    clearAnimationTimers();
    setMapReady(false);
    setAnimationComplete(false);
    setAnimationStage("idle");
    animationStartedRef.current = false;

    if (container.firstChild) {
      container.replaceChildren();
    }

    const map = L.map(container, {
      zoomControl: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      dragging: true,
      attributionControl: false,
      worldCopyJump: true,
      zoomSnap: 1,
      zoomDelta: 1,
      inertia: true,
      inertiaDeceleration: 3000,
      inertiaMaxSpeed: 1500,
      fadeAnimation: false,
      zoomAnimation: false,
      markerZoomAnimation: false,
    }).setView([latitude, longitude], 11, { animate: false });

    completionMapRef.current = map;

    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png", {
      maxZoom: 19,
      minZoom: 3,
      subdomains: ["a", "b", "c", "d"],
      detectRetina: false,
      crossOrigin: true,
    }).addTo(map);

    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png", {
      maxZoom: 19,
      minZoom: 3,
      subdomains: ["a", "b", "c", "d"],
      detectRetina: false,
      pane: "overlayPane",
      zIndex: 650,
      crossOrigin: true,
    }).addTo(map);

    const zoomControl = document.createElement("div");
    zoomControl.className = "completion-map-zoom";
    zoomControl.innerHTML = `
      <button type="button" class="completion-map-zoom__button" data-zoom="in">+</button>
      <button type="button" class="completion-map-zoom__button" data-zoom="out">−</button>
    `;
    container.appendChild(zoomControl);

    zoomControl.querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", () => {
        const delta = button.dataset.zoom === "in" ? 1 : -1;
        const currentZoom = map.getZoom();
        map.setZoom(Math.max(4, Math.min(15, currentZoom + delta)));
      });
    });

    const markerLayer = L.DomUtil.create("div", "completion-map-overlay");
    map.getPane("overlayPane").appendChild(markerLayer);
    markerLayer.style.zIndex = "560";

    const markerElement = L.DomUtil.create("div", "completion-map-marker is-fade");
    markerElement.setAttribute("data-stage", "fade");
    markerElement.innerHTML = renderMomentMarkerBody(
      resolveMomentSymbolImage(selectedPlace, selectedSymbol?.image || "")
    );
    markerLayer.appendChild(markerElement);

    const placeLabelText = (selectedPlace.obec || selectedPlace.nazev || "").trim();
    const placeLabelElement = placeLabelText
      ? L.DomUtil.create("div", "completion-map-place-label")
      : null;
    if (placeLabelElement) {
      placeLabelElement.textContent = placeLabelText;
      markerLayer.appendChild(placeLabelElement);
    }

    markerRef.current = markerElement;

    const updateMarkerPosition = () => {
      const point = map.latLngToContainerPoint([latitude, longitude]);
      const markerSize = 210;
      const scaleValue = String(getMarkerScaleFromZoom(map.getZoom()));
      markerElement.style.left = `${point.x - markerSize / 2}px`;
      markerElement.style.top = `${point.y - markerSize / 2}px`;
      markerElement.style.setProperty("--marker-scale", scaleValue);

      if (placeLabelElement) {
        const labelX = point.x;
        const labelY = point.y + 68 > container.clientHeight - 18 ? point.y - 84 : point.y + 68;

        placeLabelElement.style.left = `${labelX}px`;
        placeLabelElement.style.top = `${labelY}px`;
      }
    };

    const handleMapResize = () => {
      requestAnimationFrame(() => {
        map.invalidateSize();
        updateMarkerPosition();
      });
    };

    const applyAnimationStage = (stage) => {
      if (!markerElement) {
        return;
      }

      markerElement.setAttribute("data-stage", stage || "idle");
      markerElement.classList.remove("is-fade", "is-dot", "is-line", "is-icon", "is-pulse", "is-ready");
      if (!stage || stage === "idle") {
        return;
      }

      markerElement.classList.add(`is-${stage}`);
      if (stage === "ready" || stage === "pulse") {
        markerElement.classList.add("is-ready");
      }
    };

    const scheduleStage = (stage, delay) => {
      const timer = window.setTimeout(() => {
        setAnimationStage(stage);
        applyAnimationStage(stage);
        if (stage === "ready") {
          setAnimationComplete(true);
          console.log("Animation finished");
        }
      }, delay);
      animationTimersRef.current.push(timer);
    };

    requestAnimationFrame(() => {
      map.invalidateSize();
      updateMarkerPosition();
      map.on("move zoom viewreset resize", updateMarkerPosition);
      window.addEventListener("resize", handleMapResize);

      setMapReady(true);
      animationStartedRef.current = true;
      setAnimationStage("fade");
      applyAnimationStage("fade");
    });

    applyAnimationStage("fade");
    scheduleStage("fade", 80);
    scheduleStage("dot", 520);
    scheduleStage("line", 920);
    scheduleStage("icon", 1520);
    scheduleStage("pulse", 2200);
    scheduleStage("ready", 2900);

    return () => {
      clearAnimationTimers();
      map.off("move zoom viewreset resize", updateMarkerPosition);
      window.removeEventListener("resize", handleMapResize);
      if (container.firstChild) {
        container.replaceChildren();
      }
      map.remove();
      if (completionMapRef.current === map) {
        completionMapRef.current = null;
      }
      markerRef.current = null;
      animationStartedRef.current = false;
    };
  }, [screen, completeMoment?.latitude, completeMoment?.longitude, completeMoment?.symbolImage, selectedTown?.latitude, selectedTown?.longitude, selectedSymbol?.id]);

  useEffect(() => {
    const place = completeMoment;
    const container = exportMapContainerRef.current;

    if (!place || !container) {
      if (exportMapRef.current) {
        exportMapRef.current.remove();
        exportMapRef.current = null;
      }
      return undefined;
    }

    const latitude = parseCoordinate(place.latitude);
    const longitude = parseCoordinate(place.longitude);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return undefined;
    }

    if (container.firstChild) {
      container.replaceChildren();
    }

    const map = L.map(container, {
      zoomControl: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      dragging: false,
      attributionControl: false,
      worldCopyJump: true,
      zoomSnap: 1,
      zoomDelta: 1,
      preferCanvas: true,
      fadeAnimation: false,
      zoomAnimation: false,
      markerZoomAnimation: false,
      inertia: false,
    }).setView([latitude, longitude], 11, { animate: false });

    exportMapRef.current = map;

    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png", {
      maxZoom: 19,
      minZoom: 3,
      subdomains: ["a", "b", "c", "d"],
      detectRetina: false,
      crossOrigin: true,
    }).addTo(map);

    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png", {
      maxZoom: 19,
      minZoom: 3,
      subdomains: ["a", "b", "c", "d"],
      detectRetina: false,
      pane: "overlayPane",
      zIndex: 650,
      crossOrigin: true,
    }).addTo(map);

    const markerLayer = L.DomUtil.create("div", "completion-map-overlay");
    map.getPane("overlayPane").appendChild(markerLayer);
    markerLayer.style.zIndex = "560";

    const markerElement = L.DomUtil.create("div", "completion-map-marker is-final");
    markerElement.setAttribute("data-stage", "ready");
    markerElement.innerHTML = renderMomentMarkerBody(resolveMomentSymbolImage(place));
    markerLayer.appendChild(markerElement);

    const exportPlaceLabelText = (place.obec || place.nazev || "").trim();
    const exportPlaceLabelElement = exportPlaceLabelText
      ? L.DomUtil.create("div", "completion-map-place-label")
      : null;
    if (exportPlaceLabelElement) {
      exportPlaceLabelElement.textContent = exportPlaceLabelText;
      markerLayer.appendChild(exportPlaceLabelElement);
    }

    const updateMarkerPosition = () => {
      const point = map.latLngToContainerPoint([latitude, longitude]);
      const markerSize = 210;
      const scaleValue = String(getMarkerScaleFromZoom(map.getZoom()));
      markerElement.style.left = `${point.x - markerSize / 2}px`;
      markerElement.style.top = `${point.y - markerSize / 2}px`;
      markerElement.style.setProperty("--marker-scale", scaleValue);

      if (exportPlaceLabelElement) {
        const labelX = point.x;
        const labelY = point.y + 68 > container.clientHeight - 18 ? point.y - 84 : point.y + 68;

        exportPlaceLabelElement.style.left = `${labelX}px`;
        exportPlaceLabelElement.style.top = `${labelY}px`;
      }
    };

    const handleExportMapResize = () => {
      requestAnimationFrame(() => {
        map.invalidateSize();
        updateMarkerPosition();
      });
    };

    map.whenReady(() => {
      requestAnimationFrame(() => {
        map.invalidateSize();
        updateMarkerPosition();
      });
    });

    map.on("move zoom viewreset resize", updateMarkerPosition);
    window.addEventListener("resize", handleExportMapResize);

    setTimeout(() => {
      handleExportMapResize();
    }, 80);

    requestAnimationFrame(() => {
      handleExportMapResize();
    });

    return () => {
      map.off("move zoom viewreset resize", updateMarkerPosition);
      window.removeEventListener("resize", handleExportMapResize);
      map.remove();
      if (exportMapRef.current === map) {
        exportMapRef.current = null;
      }
      if (container.firstChild) {
        container.replaceChildren();
      }
    };
  }, [completeMoment?.id, completeMoment?.latitude, completeMoment?.longitude, completeMoment?.symbolImage]);

  useEffect(() => {
    const selectedPlace = completeMoment || selectedTown;
    if (!selectedPlace) {
      return undefined;
    }

    console.log("Completion place:", selectedPlace);
    console.log("Map coordinates:", selectedPlace.latitude, selectedPlace.longitude);
    return undefined;
  }, [completeMoment, selectedTown]);

  useEffect(() => {
    if (screen !== "public-map") {
      publicMarkerElementsRef.current.clear();
      if (publicMapRef.current) {
        publicMapRef.current.remove();
        publicMapRef.current = null;
      }
      return undefined;
    }

    const container = publicMapContainerRef.current;
    if (!container) {
      return undefined;
    }

    if (container.firstChild) {
      container.replaceChildren();
    }

    const map = L.map(container, {
      zoomControl: true,
      scrollWheelZoom: true,
      doubleClickZoom: true,
      dragging: true,
      attributionControl: false,
      worldCopyJump: true,
      zoomSnap: 1,
      zoomDelta: 1,
      minZoom: 3,
      maxZoom: 15,
      preferCanvas: true,
      fadeAnimation: false,
      zoomAnimation: false,
      markerZoomAnimation: false,
    }).setView([49.8, 15.3], 6, { animate: false });

    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png", {
      maxZoom: 19,
      minZoom: 3,
      subdomains: ["a", "b", "c", "d"],
      detectRetina: true,
    }).addTo(map);

    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png", {
      maxZoom: 19,
      minZoom: 3,
      subdomains: ["a", "b", "c", "d"],
      detectRetina: true,
      pane: "overlayPane",
      zIndex: 650,
    }).addTo(map);

    if (!map.getPane("momentsPane")) {
      const momentsPane = map.createPane("momentsPane");
      momentsPane.style.zIndex = "700";
    }

    const validMoments = publicMapMoments.filter((moment) => {
      const latitude = parseCoordinate(moment?.latitude);
      const longitude = parseCoordinate(moment?.longitude);
      return latitude !== null && longitude !== null;
    });

    const getSpreadMoments = (focusMomentId = selectedPublicMomentIdRef.current) =>
      spreadOverlappingMoments(validMoments, focusMomentId);

    const spreadMoments = getSpreadMoments();
    publicMarkerElementsRef.current.clear();

    const openMomentGroup = (moment) => {
      const spreadForCurrentFocus = getSpreadMoments();
      const selectedLat = Number(moment.displayLatitude ?? moment.latitude);
      const selectedLng = Number(moment.displayLongitude ?? moment.longitude);
      const selectedPoint = map.latLngToContainerPoint([selectedLat, selectedLng]);

      const nearby = spreadForCurrentFocus.filter((candidate) => {
        const candidateLat = Number(candidate.displayLatitude ?? candidate.latitude);
        const candidateLng = Number(candidate.displayLongitude ?? candidate.longitude);
        const candidatePoint = map.latLngToContainerPoint([candidateLat, candidateLng]);
        const distance = Math.hypot(candidatePoint.x - selectedPoint.x, candidatePoint.y - selectedPoint.y);
        return distance <= 86;
      });

      const uniqueNearby = nearby.filter(
        (candidate, index, array) => array.findIndex((item) => item.id === candidate.id) === index
      );

      const clusterItems = uniqueNearby.map((candidate) => {
        const candidateLat = Number(candidate.displayLatitude ?? candidate.latitude);
        const candidateLng = Number(candidate.displayLongitude ?? candidate.longitude);
        const candidatePoint = map.latLngToContainerPoint([candidateLat, candidateLng]);
        return {
          ...candidate,
          screenX: candidatePoint.x,
          screenY: candidatePoint.y,
        };
      });

      const clusteredMoment = {
        ...moment,
        screenX: selectedPoint.x,
        screenY: selectedPoint.y,
      };

      selectClusteredPublicMoment(clusteredMoment, clusterItems);
    };

    const markerTouchCleanup = [];
    const markerLayer = L.DomUtil.create("div", "completion-map-overlay");
    map.getPane("overlayPane").appendChild(markerLayer);
    markerLayer.style.zIndex = "560";

    const syncPublicMarkerPositions = (focusMomentId = selectedPublicMomentIdRef.current) => {
      const laidOutMoments = getSpreadMoments(focusMomentId);
      const scaleValue = String(getMarkerScaleFromZoom(map.getZoom()));

      laidOutMoments.forEach((laidOutMoment) => {
        const markerElement = publicMarkerElementsRef.current.get(normalizeMomentId(laidOutMoment.id || ""));
        if (!markerElement) {
          return;
        }

        const latitude = parseCoordinate(laidOutMoment?.displayLatitude ?? laidOutMoment?.latitude);
        const longitude = parseCoordinate(laidOutMoment?.displayLongitude ?? laidOutMoment?.longitude);
        if (latitude === null || longitude === null) {
          return;
        }

        const point = map.latLngToContainerPoint([latitude, longitude]);
        const markerSize = 210;
        markerElement.style.left = `${point.x - markerSize / 2}px`;
        markerElement.style.top = `${point.y - markerSize / 2}px`;
        markerElement.style.setProperty("--marker-scale", scaleValue);

        const markerIcon = markerElement.querySelector?.(".completion-map-marker");
        if (markerIcon) {
          markerIcon.style.setProperty("--marker-scale", scaleValue);
        }
      });
    };

    publicMarkerLayoutSyncRef.current = syncPublicMarkerPositions;

    spreadMoments.forEach((moment) => {
      const markerElement = L.DomUtil.create("div", "public-map-marker-shell");
      markerElement.innerHTML = renderMomentMarkerMarkup(resolveMomentSymbolImage(moment), ["is-final", "public-map-marker"]);
      markerLayer.appendChild(markerElement);

      const markerKey = normalizeMomentId(moment.id || "");
      if (markerKey) {
        publicMarkerElementsRef.current.set(markerKey, markerElement);
      }

      let suppressNextClick = false;

      if (markerElement) {
        let longPressTimer = 0;
        let startX = 0;
        let startY = 0;
        let longPressTriggered = false;

        const clearLongPressTimer = () => {
          if (longPressTimer) {
            window.clearTimeout(longPressTimer);
            longPressTimer = 0;
          }
        };

        const handleTouchStart = (event) => {
          const touch = event.touches?.[0];
          if (!touch) {
            return;
          }

          longPressTriggered = false;
          startX = touch.clientX;
          startY = touch.clientY;
          clearLongPressTimer();
          longPressTimer = window.setTimeout(() => {
            longPressTriggered = true;
            suppressNextClick = true;
            openMomentGroup(moment);
            if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
              navigator.vibrate(12);
            }
          }, 380);
        };

        const handleTouchMove = (event) => {
          const touch = event.touches?.[0];
          if (!touch) {
            return;
          }

          const moveDistance = Math.hypot(touch.clientX - startX, touch.clientY - startY);
          if (moveDistance > 10) {
            clearLongPressTimer();
          }
        };

        const handleTouchEnd = (event) => {
          clearLongPressTimer();
          if (longPressTriggered) {
            event.preventDefault();
          }
        };

        const handleTouchCancel = () => {
          clearLongPressTimer();
        };

        markerElement.addEventListener("touchstart", handleTouchStart, { passive: true });
        markerElement.addEventListener("touchmove", handleTouchMove, { passive: true });
        markerElement.addEventListener("touchend", handleTouchEnd, { passive: false });
        markerElement.addEventListener("touchcancel", handleTouchCancel, { passive: true });

        markerTouchCleanup.push(() => {
          markerElement.removeEventListener("touchstart", handleTouchStart);
          markerElement.removeEventListener("touchmove", handleTouchMove);
          markerElement.removeEventListener("touchend", handleTouchEnd);
          markerElement.removeEventListener("touchcancel", handleTouchCancel);
        });
      }

      const tooltipText = (moment.obec || moment.nazev || "").trim();
      if (tooltipText) {
        markerElement.setAttribute("title", tooltipText);
      }

      markerElement.addEventListener("click", () => {
        if (suppressNextClick) {
          suppressNextClick = false;
          return;
        }
        openMomentGroup(moment);
      });
    });

    syncPublicMarkerPositions();
    map.on("zoom zoomend viewreset move resize", syncPublicMarkerPositions);
    markerTouchCleanup.push(() => {
      map.off("zoom zoomend viewreset move resize", syncPublicMarkerPositions);
      if (publicMarkerLayoutSyncRef.current === syncPublicMarkerPositions) {
        publicMarkerLayoutSyncRef.current = null;
      }
    });

    if (validMoments.length === 0) {
      map.setView([49.8, 15.3], 6);
    } else {
      const bounds = L.latLngBounds(spreadMoments.map((moment) => [moment.displayLatitude, moment.displayLongitude]));
      map.fitBounds(bounds.pad(0.2), { animate: false, maxZoom: 8 });
    }

    const handlePublicMapResize = () => {
      requestAnimationFrame(() => {
        if (map && map.invalidateSize) {
          map.invalidateSize();
        }
      });
    };

    publicMapRef.current = map;
    window.addEventListener("resize", handlePublicMapResize);

    setTimeout(() => {
      handlePublicMapResize();
    }, 120);

    requestAnimationFrame(() => {
      handlePublicMapResize();
      syncSelectedPublicMarker();
    });

    return () => {
      markerTouchCleanup.forEach((cleanup) => cleanup());
      publicMarkerElementsRef.current.clear();
      window.removeEventListener("resize", handlePublicMapResize);
      if (publicMapRef.current) {
        publicMapRef.current.remove();
        publicMapRef.current = null;
      }
    };
  }, [screen, publicMapMoments, syncSelectedPublicMarker]);

  useEffect(() => {
    if (screen !== "public-map") {
      return;
    }

    syncSelectedPublicMarker();
  }, [screen, selectedPublicMoment?.id, syncSelectedPublicMarker]);

  useEffect(() => {
    if (screen !== "public-map") {
      return;
    }

    publicMarkerLayoutSyncRef.current?.(selectedPublicMomentIdRef.current);
  }, [screen, selectedPublicMoment?.id]);

  const handleShowOnMap = () => {
    setScreen("home");
    setSelectedTown(null);
    setSelectedSymbol(null);
    setMomentTitle("");
    setMomentStory("");
    setMomentDate("");
    setCompleteMoment(null);
    setAnimationComplete(false);
  };

  const handleOpenPublicMap = () => {
    setSelectedPublicMoment(null);
    setSelectedPublicMomentGroup([]);
    setSelectedPublicMomentGroupIndex(0);
    loadRemotePublicMoments().catch((error) => {
      console.error("Obnova veřejných momentů selhala:", error);
    });
    setScreen("public-map");
  };

  const handleAddAnotherMoment = () => {
    setSelectedPublicMoment(null);
    setCompleteMoment(null);
    setAnimationComplete(false);
    setAnimationStage("idle");
    setMomentTitle("");
    setMomentStory("");
    setMomentDate("");
    setSelectedSymbol(null);
    setSelectedTown(null);
    setSearch("");
    setDebouncedSearch("");
    setScreen("town");
  };

  const symbolOptions = [
    { id: "wedding", image: "/svatba.png", label: "Svatba" },
    { id: "engagement", image: "/zasnuby.png", label: "Zásnuby" },
    { id: "love", image: "/laska.png", label: "Láska" },
    { id: "birth", image: "/dite.png", label: "Narození dítěte" },
    { id: "home", image: "/dum.png", label: "Nový domov" },
    { id: "beginning", image: "/zacatek.png", label: "Nový začátek" },
    { id: "school", image: "/skola.png", label: "Škola" },
    { id: "pet", image: "/mazlicek.png", label: "Nový mazlíček" },
    { id: "memory", image: "/vzpominka.png", label: "Vzpomínka" },
    { id: "other", image: "/ostatni.png", label: "Ostatní" },
  ];

  return (
    <div className="page-shell">
      <div className="hero-surface">
        <div className="landscape" />

        {screen === "home" && (
          <>
            <header className="top-left" aria-label="Logo aplikace">
              <img className="brand-logo" src={logo} alt="Logo Osudový moment" />
            </header>

            <main className="hero-layout">
              <section className="hero-copy">
                <h1 className="hero-title">Osudový moment</h1>
                <p className="hero-subtitle">Každý život má své důležité okamžiky.</p>
                <p className="hero-description">
                  Přidejte ten svůj a nechte ho zazářit na mapě.
                  <br />
                  Malý bod s velkým příběhem.
                </p>

                {sharedMomentId ? (
                  <section className="shared-moment-card" aria-label="Sdílený moment">
                    <p className="shared-moment-card__title">Otevřeli jste sdílený moment</p>
                    <p className="shared-moment-card__subtitle">Pokud jste přišli z Facebooku, tady je jeho náhled.</p>
                    {sharedMomentImageError ? (
                      <a className="shared-moment-card__link" href={sharedMomentUrl}>
                        Otevřít sdílený odkaz
                      </a>
                    ) : (
                      <a className="shared-moment-card__preview" href={sharedMomentUrl}>
                        <img
                          className="shared-moment-card__image"
                          src={sharedMomentImageUrl}
                          alt="Náhled sdíleného momentu"
                          loading="eager"
                          onError={() => setSharedMomentImageError(true)}
                        />
                      </a>
                    )}
                  </section>
                ) : null}

                <div className="hero-actions">
                  <button
                    className="hero-button"
                    type="button"
                    onClick={openTownScreen}
                  >
                    Přidat osudový moment
                  </button>
                  <button
                    className="hero-button hero-button--secondary"
                    type="button"
                    onClick={() => setScreen("public-map")}
                  >
                    Mapa osudových momentů
                  </button>
                </div>
              </section>

              <div className="hero-visual" aria-label="Mapa reference">
                <img className="reference-map" src="/mapa.png" alt="Mapa z reference" />
              </div>
            </main>
          </>
        )}

        {screen === "public-map" && (
          <>
            <header className="top-left" aria-label="Logo aplikace">
              <img className="brand-logo" src={logo} alt="Logo Osudový moment" />
            </header>

            <button
              className="wizard-back"
              type="button"
              onClick={goHome}
              aria-label="Zpět na úvod"
            >
              <span aria-hidden="true">←</span>
            </button>

            <main className="wizard-layout public-map-layout">
              <section className="wizard-card public-map-card">
                <div className="public-map-card__header">
                  <h2 className="wizard-title">Mapa osudových momentů</h2>
                  <p className="wizard-text">
                    Vyberte symbol na mapě a zobrazte detail vybraného osudového momentu.
                  </p>
                  <p className="wizard-text public-map-help-text">
                    Když je momentů víc blízko sebe, podržte symbol (mobil) nebo klikněte a v detailu použijte Předchozí/Další.
                  </p>
                </div>

                <div className="public-map-shell">
                  <div className="public-map-container" ref={publicMapContainerRef} />
                </div>
              </section>
            </main>

            {selectedPublicMoment ? (
              <div className="public-map-detail" role="dialog" aria-modal="true" aria-label="Detail osudového momentu">
                <div className="public-map-detail__card">
                  <button
                    className="public-map-detail__close"
                    type="button"
                    onClick={() => {
                      setSelectedPublicMoment(null);
                      setSelectedPublicMomentGroup([]);
                      setSelectedPublicMomentGroupIndex(0);
                    }}
                    aria-label="Zavřít detail"
                  >
                    ×
                  </button>

                  {selectedPublicMomentGroup.length > 1 ? (
                    <div className="public-map-detail__pager" aria-label="Přepínání blízkých momentů">
                      <button
                        className="public-map-detail__pager-button"
                        type="button"
                        onClick={showPreviousPublicMoment}
                      >
                        ← Předchozí
                      </button>
                      <span className="public-map-detail__pager-count">
                        {selectedPublicMomentGroupIndex + 1} / {selectedPublicMomentGroup.length}
                      </span>
                      <button
                        className="public-map-detail__pager-button"
                        type="button"
                        onClick={showNextPublicMoment}
                      >
                        Další →
                      </button>
                    </div>
                  ) : null}

                  <div className="public-map-detail__symbol">
                    <img
                      src={resolveMomentSymbolImage(selectedPublicMoment)}
                      alt={selectedPublicMoment.symbolLabel || "Symbol"}
                    />
                  </div>

                  <div className="public-map-detail__body">
                    <div className="public-map-detail__place">{selectedPublicMoment.obec || "Neznámé místo"}</div>
                    <h3 className="public-map-detail__name">{selectedPublicMoment.nazev || "Osudový moment"}</h3>
                    {selectedPublicMoment.datum ? (
                      <div className="public-map-detail__row">
                        <span className="public-map-detail__label">Datum</span>
                        <span className="public-map-detail__value">{selectedPublicMoment.datum}</span>
                      </div>
                    ) : null}
                    {selectedPublicMoment.prikaz ? (
                      <div className="public-map-detail__row">
                        <span className="public-map-detail__label">Poznámka</span>
                        <span className="public-map-detail__value">{selectedPublicMoment.prikaz}</span>
                      </div>
                    ) : null}

                    <div className="public-map-detail__actions">
                      <button
                        className={`public-map-detail__reaction${getCurrentMomentReactionState(selectedPublicMoment).liked ? " is-active" : ""}`}
                        type="button"
                        onClick={() => handleToggleMomentReaction(selectedPublicMoment)}
                        aria-label="Přidat reakci"
                      >
                        <span aria-hidden="true">❤️</span>
                        <span>{getCurrentMomentReactionState(selectedPublicMoment).count || 0}</span>
                      </button>
                      <button
                        className="public-map-detail__delete"
                        type="button"
                        onClick={handleDeleteSelectedPublicMoment}
                        disabled={!canDeleteMoment(selectedPublicMoment)}
                      >
                        {canDeleteMoment(selectedPublicMoment) ? "Smazat můj moment" : "Nelze smazat cizí moment"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </>
        )}

        {screen === "town" && (
          <>
            <header className="top-left" aria-label="Logo aplikace">
              <img className="brand-logo" src={logo} alt="Logo Osudový moment" />
            </header>

            <button
              className="wizard-back"
              type="button"
              onClick={goHome}
              aria-label="Zpět na úvod"
            >
              <span aria-hidden="true">←</span>
            </button>

            <main className="wizard-layout">
              <section className="wizard-card">
                <h2 className="wizard-title">Vyberte obec</h2>
                <p className="wizard-text">
                  Zadejte obec nebo místo v ČR i v cizině, kde se váš osudový moment odehrál.
                </p>

                <label className="wizard-search" htmlFor="town-search">
                  <span className="sr-only">Vyhledat místo</span>
                  <input
                    id="town-search"
                    className="wizard-input"
                    type="text"
                    placeholder="Např. Praha nebo Berlín"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </label>

                <ul className="wizard-list" role="listbox" aria-label="Seznam obcí">
                  {townsLoading ? (
                    <li className="wizard-empty">Načítám obce…</li>
                  ) : townsError ? (
                    <li className="wizard-empty">{townsError}</li>
                  ) : filteredTowns.length > 0 ? (
                    filteredTowns.map((town) => (
                      <li key={town.kod || `${town.nazev}-${town.okres}`}>
                        <button
                          className={`wizard-list-item${
                            selectedTown?.kod === town.kod ? " is-selected" : ""
                          }`}
                          type="button"
                          onClick={() => handleTownSelect(town)}
                        >
                          <span className="wizard-result-name">{town.nazev}</span>
                          <span className="wizard-result-meta">
                            {town.okres} · {town.kraj}
                          </span>
                        </button>
                      </li>
                    ))
                  ) : debouncedSearch.length >= 2 ? (
                    <li className="wizard-empty">Žádná obec nenalezena.</li>
                  ) : (
                    <li className="wizard-empty">Zadejte alespoň 2 znaky.</li>
                  )}
                </ul>

                <button
                  className="wizard-continue"
                  type="button"
                  onClick={goToSymbolStep}
                  disabled={!selectedTown}
                >
                  Pokračovat
                </button>
              </section>
            </main>
          </>
        )}

        {screen === "symbol" && (
          <>
            <header className="top-left" aria-label="Logo aplikace">
              <img className="brand-logo" src={logo} alt="Logo Osudový moment" />
            </header>

            <button
              className="wizard-back"
              type="button"
              onClick={() => setScreen("town")}
              aria-label="Zpět na výběr obce"
            >
              <span aria-hidden="true">←</span>
            </button>

            <main className="wizard-layout symbol-layout">
              <section className="wizard-card symbol-card">
                <div className="symbol-card__header">
                  <h2 className="wizard-title">Vyberte symbol</h2>
                  <p className="wizard-text">
                    Vyberte symbol, který nejlépe vystihuje váš osudový moment.
                  </p>
                </div>

                <div className="symbol-grid" role="list" aria-label="Seznam symbolů">
                  {symbolOptions.map((symbol) => (
                    <div key={symbol.id} className="symbol-item">
                      <button
                        className={`symbol-button${selectedSymbol?.id === symbol.id ? " is-selected" : ""}`}
                        type="button"
                        onClick={() => handleSymbolSelect(symbol)}
                        aria-pressed={selectedSymbol?.id === symbol.id}
                        aria-label={symbol.label}
                        title={symbol.label}
                      >
                        <img className="symbol-button__image" src={symbol.image} alt={symbol.label} />
                      </button>
                      <span className="symbol-button__label">{symbol.label}</span>
                    </div>
                  ))}
                </div>

                <button
                  className="wizard-continue"
                  type="button"
                  onClick={goToNextStep}
                  disabled={!selectedSymbol}
                >
                  Pokračovat
                </button>
              </section>
            </main>
          </>
        )}

        {screen === "next" && (
          <>
            <header className="top-left" aria-label="Logo aplikace">
              <img className="brand-logo" src={logo} alt="Logo Osudový moment" />
            </header>

            <button
              className="wizard-back"
              type="button"
              onClick={() => setScreen("symbol")}
              aria-label="Zpět na výběr symbolu"
            >
              <span aria-hidden="true">←</span>
            </button>

            <main className="wizard-layout details-layout">
              <section className="wizard-card details-card">
                <div className="details-heading">
                  <h2 className="wizard-title">Váš osudový moment</h2>
                  <p className="wizard-text">
                    Přidejte krátký název a případně několik slov o vašem okamžiku.
                  </p>
                </div>

                <div className="summary-box" aria-label="Shrnutí vybraných údajů">
                  <div className="summary-item">
                    <span className="summary-icon" aria-hidden="true">📍</span>
                    <div>
                      <div className="summary-label">Vybraná obec</div>
                      <div className="summary-value">{selectedTown?.nazev || "—"}</div>
                    </div>
                  </div>

                  <div className="summary-item">
                    <span className="summary-icon" aria-hidden="true">❤️</span>
                    <div>
                      <div className="summary-label">Vybraný symbol</div>
                      <div className="summary-value summary-value--symbol">
                        {selectedSymbol?.image ? (
                          <img className="summary-symbol-image" src={selectedSymbol.image} alt={selectedSymbol.label} />
                        ) : null}
                        <span>{selectedSymbol?.label || "—"}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <form className="moment-form" onSubmit={goToCompletionStep}>
                  <div className="field-group">
                    <label className="field-label" htmlFor="moment-title">
                      Název okamžiku
                    </label>
                    <input
                      id="moment-title"
                      className="wizard-input"
                      type="text"
                      value={momentTitle}
                      onChange={(event) => setMomentTitle(event.target.value)}
                      placeholder="Například: Naše svatba"
                      required
                    />
                  </div>

                  <div className="field-group">
                    <label className="field-label" htmlFor="moment-story">
                      Krátký příběh
                    </label>
                    <textarea
                      id="moment-story"
                      className="field-textarea"
                      value={momentStory}
                      onChange={(event) => setMomentStory(event.target.value)}
                      placeholder="Napište několik vět o svém osudovém okamžiku..."
                      maxLength={500}
                      rows={6}
                    />
                    <div className="field-hint">
                      <span>Maximálně 500 znaků.</span>
                      <span className="char-counter">{momentStory.length} / 500</span>
                    </div>
                  </div>

                  <div className="field-group">
                    <label className="field-label" htmlFor="moment-date">
                      Datum
                    </label>
                    <input
                      id="moment-date"
                      className="wizard-input"
                      type="date"
                      value={momentDate}
                      onChange={(event) => setMomentDate(event.target.value)}
                    />
                  </div>

                  <button
                    className="wizard-continue"
                    type="submit"
                    disabled={!momentTitle.trim()}
                  >
                    Pokračovat
                  </button>
                </form>
              </section>
            </main>
          </>
        )}

        {screen === "complete" && completeMoment && (
          <>
            <div className="completion-screen" ref={completionScreenRef}>
              <header className="top-left" aria-label="Logo aplikace">
                <img className="brand-logo" src={logo} alt="Logo Osudový moment" />
              </header>

              <button
                className="wizard-back"
                type="button"
                onClick={() => setScreen("next")}
                aria-label="Zpět na detaily okamžiku"
              >
                <span aria-hidden="true">←</span>
              </button>

              <main className="wizard-layout completion-layout">
                <section className="wizard-card completion-card" ref={completionCardRef}>
                  {renderCompletionCardContent({ showActions: true, mapRef: mapContainerRef })}
                </section>
              </main>
            </div>

            {isMobileClient ? (
              <div className="export-render-surface export-render-surface--mobile" aria-hidden="true">
                <section className="wizard-card completion-card is-exporting-mobile" ref={exportMobileCardRef}>
                  <MobileMomentExportCard
                    completeMoment={completeMoment}
                    exportMomentUrl={exportMomentUrl}
                    exportMapContainerRef={exportMapContainerRef}
                    selectedSymbolLabel={selectedSymbol?.label}
                  />
                </section>
              </div>
            ) : (
              <div className="export-render-surface" aria-hidden="true">
                <section className="wizard-card completion-card is-exporting" ref={exportCardRef}>
                  {renderExportCardContent()}
                </section>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default App;
