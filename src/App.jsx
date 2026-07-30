import { useEffect, useMemo, useRef, useState } from "react";
import { toJpeg } from "html-to-image";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import logo from "./assets/logo.png";
import "./App.css";

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

function renderMomentMarkerBody(symbolImage) {
  return `
    <span class="completion-map-marker__glow"></span>
    <span class="completion-map-marker__dot"></span>
    <span class="completion-map-marker__line"></span>
    <span class="completion-map-marker__icon">
      <img class="completion-map-marker__image" src="${symbolImage || "/ostatni.png"}" alt="Symbol" />
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

function App() {
  const mapContainerRef = useRef(null);
  const markerRef = useRef(null);
  const publicMapContainerRef = useRef(null);
  const publicMapRef = useRef(null);
  const completionCardRef = useRef(null);
  const animationStartedRef = useRef(false);
  const animationTimersRef = useRef([]);
  const [screen, setScreen] = useState("home");
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
  const [publicMapMoments, setPublicMapMoments] = useState([]);
  const [publicMapVersion, setPublicMapVersion] = useState(0);
  const [activeMapMoment, setActiveMapMoment] = useState(null);
  const [selectedPublicMoment, setSelectedPublicMoment] = useState(null);
  const [towns, setTowns] = useState([]);
  const [townsLoaded, setTownsLoaded] = useState(false);
  const [townsLoading, setTownsLoading] = useState(false);
  const [townsError, setTownsError] = useState("");
  const [shareStatus, setShareStatus] = useState("");
  const [isExporting, setIsExporting] = useState(false);

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
        setSavedMoments(parsed);
        setPublicMapMoments(parsed);
      } else {
        setSavedMoments([]);
        setPublicMapMoments([]);
        window.localStorage.setItem(STORAGE_KEY, "[]");
      }
    } catch (error) {
      console.error("Nepodařilo se načíst uložené momenty:", error);
      setSavedMoments([]);
    }

    return undefined;
  }, []);

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

  const saveMomentToStorage = (moment) => {
    if (typeof window === "undefined") {
      return [];
    }

    const existing = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
    const updated = [...existing, moment];
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    setSavedMoments(updated);
    setPublicMapMoments(updated);
    setPublicMapVersion((value) => value + 1);
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
    setPublicMapMoments(updated);
    setPublicMapVersion((value) => value + 1);
    return updated;
  };

  const handleDeleteSelectedPublicMoment = () => {
    if (!selectedPublicMoment?.id) {
      return;
    }

    removeMomentFromStorage(selectedPublicMoment.id);
    setSelectedPublicMoment(null);
  };

  const goToCompletionStep = (event) => {
    event.preventDefault();

    if (!momentTitle.trim()) {
      return;
    }

    const latitude = parseCoordinate(selectedTown?.latitude);
    const longitude = parseCoordinate(selectedTown?.longitude);

    const createdMoment = {
      id: `${Date.now()}`,
      obec: selectedTown?.nazev || "",
      okres: selectedTown?.okres || "",
      kraj: selectedTown?.kraj || "",
      stat: selectedTown?.stat || selectedTown?.stát || selectedTown?.country || "",
      latitude,
      longitude,
      symbolType: selectedSymbol?.id || "",
      symbolImage: selectedSymbol?.image || "",
      symbolLabel: selectedSymbol?.label || "",
      nazev: momentTitle.trim(),
      prikaz: momentStory.trim(),
      datum: momentDate || "",
      createdAt: new Date().toISOString(),
    };

    saveMomentToStorage(createdMoment);
    setCompleteMoment(createdMoment);
    setAnimationComplete(false);
    setScreen("complete");
    setActiveMapMoment(createdMoment);
  };

  const exportCompletionCard = async (mode) => {
    if (!completionCardRef.current || !completeMoment) {
      return;
    }

    setIsExporting(true);
    setShareStatus("");
    completionCardRef.current.classList.add("is-exporting");

    await new Promise((resolve) => window.setTimeout(resolve, 400));

    try {
      const node = completionCardRef.current;
      const shareUrl = `${window.location.origin}/moment/${completeMoment.id}`;
      const websiteUrl = window.location.origin;
      const filename = `${slugify(completeMoment.obec || completeMoment.nazev || "osudovy-moment")}.jpg`;

      const dataUrl = await toJpeg(node, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: "#07111f",
        quality: 0.95,
      });

      const response = await fetch(dataUrl);
      const blob = await response.blob();
      const file = new File([blob], filename, { type: "image/jpeg" });

      const triggerDownload = () => {
        try {
          const objectUrl = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = objectUrl;
          link.download = filename;
          link.rel = "noopener";
          document.body.appendChild(link);
          link.click();
          link.remove();
          window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
          return true;
        } catch (downloadError) {
          console.error("Nepodařilo se spustit stažení:", downloadError);
          return false;
        }
      };

      const canShareFiles =
        typeof navigator !== "undefined" &&
        typeof navigator.share === "function" &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [file] });

      const isAppleMobile =
        typeof navigator !== "undefined" &&
        /iPhone|iPad|iPod/i.test(navigator.userAgent || "");

      if (mode === "facebook") {
        const downloaded = triggerDownload();
        const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(websiteUrl)}&quote=${encodeURIComponent(`${completeMoment.nazev} · ${shareUrl}`)}`;
        window.open(facebookUrl, "_blank", "noopener,noreferrer");

        if (downloaded) {
          setShareStatus("JPG byl stažen a otevřelo se sdílení na Facebook s odkazem na web.");
        } else {
          setShareStatus("Otevřelo se sdílení na Facebook s odkazem na web.");
        }
        return;
      }

      if (mode === "share") {
        if (canShareFiles) {
          await navigator.share({
            files: [file],
            title: "Osudový moment",
            text: `${completeMoment.nazev}\n${websiteUrl}`,
            url: websiteUrl,
          });
          setShareStatus("Kartička byla sdílená.");
        } else {
          const downloaded = triggerDownload();
          if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(websiteUrl);
            setShareStatus(
              downloaded
                ? "Obrázek byl stažen a odkaz byl zkopírován do schránky."
                : "Odkaz na web byl zkopírován do schránky."
            );
          } else {
            setShareStatus(`Odkaz pro sdílení: ${websiteUrl}`);
          }
        }
      } else {
        const downloaded = triggerDownload();

        if (!downloaded && canShareFiles) {
          await navigator.share({
            files: [file],
            title: "Osudový moment",
            text: "Vyberte Uložit do souborů nebo Fotek.",
          });
          setShareStatus("Otevřelo se sdílení. Pro uložení vyberte Uložit do souborů/Fotek.");
        } else if (isAppleMobile && canShareFiles) {
          setShareStatus("Pokud Safari neuloží JPG přímo, použijte tlačítko Sdílet a uložte obrázek přes systémové menu.");
        } else {
          setShareStatus("Kartička byla stažena jako JPG.");
        }
      }
    } catch (error) {
      console.error("Nepodařilo se vytvořit JPG kartičku:", error);
      setShareStatus("Nepodařilo se vytvořit kartičku. Zkuste to znovu.");
    } finally {
      completionCardRef.current?.classList.remove("is-exporting");
      setIsExporting(false);
    }
  };

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
    }).setView([latitude, longitude], 9);

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
    markerElement.innerHTML = renderMomentMarkerBody(selectedPlace.symbolImage);
    markerLayer.appendChild(markerElement);

    markerRef.current = markerElement;

    const updateMarkerPosition = () => {
      const point = map.latLngToContainerPoint([latitude, longitude]);
      const boundedX = Math.max(24, Math.min(container.clientWidth - 24, point.x));
      const boundedY = Math.max(24, Math.min(container.clientHeight - 24, point.y));

      markerElement.style.left = `${boundedX}px`;
      markerElement.style.top = `${boundedY}px`;
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
      markerRef.current = null;
      animationStartedRef.current = false;
    };
  }, [screen, completeMoment?.latitude, completeMoment?.longitude, completeMoment?.symbolImage, selectedTown?.latitude, selectedTown?.longitude, selectedSymbol?.id]);

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
    }).setView([49.8, 15.3], 6);

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

    const validMoments = publicMapMoments.filter((moment) => {
      const latitude = parseCoordinate(moment?.latitude);
      const longitude = parseCoordinate(moment?.longitude);
      return latitude !== null && longitude !== null;
    });

    validMoments.forEach((moment) => {
      const markerIcon = L.divIcon({
        html: renderMomentMarkerMarkup(moment.symbolImage, ["is-final", "public-map-marker"]),
        className: "",
        iconSize: [210, 210],
        iconAnchor: [105, 105],
      });

      const marker = L.marker([moment.latitude, moment.longitude], { icon: markerIcon }).addTo(map);
      marker.on("click", () => {
        setSelectedPublicMoment(moment);
      });
    });

    if (validMoments.length === 0) {
      map.setView([49.8, 15.3], 6);
    } else {
      const bounds = L.latLngBounds(validMoments.map((moment) => [moment.latitude, moment.longitude]));
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
    });

    return () => {
      window.removeEventListener("resize", handlePublicMapResize);
      if (publicMapRef.current) {
        publicMapRef.current.remove();
        publicMapRef.current = null;
      }
    };
  }, [screen, publicMapMoments, publicMapVersion]);

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
                    onClick={() => setSelectedPublicMoment(null)}
                    aria-label="Zavřít detail"
                  >
                    ×
                  </button>

                  <div className="public-map-detail__symbol">
                    {selectedPublicMoment.symbolImage ? (
                      <img src={selectedPublicMoment.symbolImage} alt={selectedPublicMoment.symbolLabel || "Symbol"} />
                    ) : (
                      <span>✦</span>
                    )}
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

                    <button
                      className="public-map-detail__delete"
                      type="button"
                      onClick={handleDeleteSelectedPublicMoment}
                    >
                      Smazat z mapy
                    </button>
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
                <div className="completion-map-shell">
                  <div className={`map-animated-surface ${animationComplete ? "is-ready" : ""}`}>
                    {typeof completeMoment.latitude === "number" && typeof completeMoment.longitude === "number" ? (
                      <div className="completion-map-wrapper" ref={mapContainerRef} />
                    ) : (
                      <div className="completion-map-error">Pro vybrané místo chybí souřadnice.</div>
                    )}
                  </div>
                </div>

                {animationComplete && (
                  <div className="completion-content">
                    <h2 className="wizard-title">Váš osudový moment právě zazářil</h2>
                    <p className="completion-subtitle">
                      {completeMoment.obec}{completeMoment.stat ? ` · ${completeMoment.stat}` : ""}
                    </p>

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
                          <span className="completion-label">Poznámka</span>
                          <span className="completion-value">{completeMoment.prikaz}</span>
                        </div>
                      ) : null}
                    </div>

                    <div className="completion-actions">
                      <button className="wizard-continue" type="button" onClick={handleAddAnotherMoment}>
                        Přidat další symbol
                      </button>
                      <button className="wizard-continue" type="button" onClick={handleOpenPublicMap}>
                        Prohlédnout mapu osudových momentů
                      </button>
                      <button className="wizard-continue" type="button" onClick={() => exportCompletionCard("share")} disabled={isExporting}>
                        {isExporting ? "Probíhá…" : "Sdílet"}
                      </button>
                      <button className="wizard-continue" type="button" onClick={() => exportCompletionCard("download")} disabled={isExporting}>
                        {isExporting ? "Probíhá…" : "Stáhnout JPG"}
                      </button>
                      <button className="wizard-continue" type="button" onClick={() => exportCompletionCard("facebook")} disabled={isExporting}>
                        {isExporting ? "Probíhá…" : "Sdílet na Facebook"}
                      </button>
                    </div>
                    {shareStatus ? <p className="completion-share-status">{shareStatus}</p> : null}
                  </div>
                )}
              </section>
            </main>
          </>
        )}
      </div>
    </div>
  );
}

export default App;
