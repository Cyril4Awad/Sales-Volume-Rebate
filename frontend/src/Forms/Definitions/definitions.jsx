import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Calculator,
  Clock,
  FileText,
  Layers,
  Search,
  Settings,
  Star,
  Tags,
} from "lucide-react";
import "./definitions.css";
const SECTION = {
  DEFINITIONS: "Definitions",
};

const FAV_KEY = "svr-definitions:favorites";
const RECENT_KEY = "svr-definitions:recent";

const buttonClass =
  "position-relative d-flex align-items-center justify-content-center gap-2 w-100 rounded-4 bg-white text-secondary border shadow-sm";

export default function DefinitionsPage() {
  const navigate = useNavigate();
  const searchRef = useRef(null);

  const [query, setQuery] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  const [favorites, setFavorites] = useState(() => {
    try {
      const raw = localStorage.getItem(FAV_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const [recent, setRecent] = useState(() => {
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(FAV_KEY, JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
  }, [recent]);

  useEffect(() => {
    const handler = (e) => {
      const target = e.target;
      const isTyping =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;

      if (isTyping) return;

      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const actions = useMemo(
    () => [
      {
        id: "volume-rebate-type",
        label: "Volume Rebate Type",
        description: "Define rebate type behavior and setup.",
        Icon: Tags,
        route: "/sales-volume-rebate-type",
        section: SECTION.DEFINITIONS,
      },
      {
        id: "computation-type",
        label: "Computation Type",
        description: "Define monthly, quarterly, yearly, or custom computation cycles.",
        Icon: Calculator,
        route: "/computation-type",
        section: SECTION.DEFINITIONS,
      },
      {
        id: "settlement-type",
        label: "Settlement Type",
        description: "Define how and when rebate settlements are handled.",
        Icon: FileText,
        route: "/settlement-type",
        section: SECTION.DEFINITIONS,
      },
    ],
    []
  );

  const actionsById = useMemo(() => {
    const map = new Map();
    actions.forEach((item) => map.set(item.id, item));
    return map;
  }, [actions]);

  const toggleFavorite = (id) => {
    setFavorites((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleActionClick = (id) => {
    const action = actionsById.get(id);
    if (!action) return;

    setRecent((prev) => {
      const withoutCurrent = prev.filter((item) => item.id !== id);
      return [{ id, ts: Date.now() }, ...withoutCurrent].slice(0, 5);
    });

    navigate(action.route);
  };

  const filteredItems = useMemo(() => {
    const search = query.trim().toLowerCase();

    return actions
      .filter((item) =>
        search
          ? item.label.toLowerCase().includes(search) ||
          item.description.toLowerCase().includes(search)
          : true
      )
      .filter((item) => (favoritesOnly ? favorites.includes(item.id) : true));
  }, [actions, query, favoritesOnly, favorites]);

  const recentItems = useMemo(() => {
    return recent
      .map((item) => actionsById.get(item.id))
      .filter(Boolean)
      .filter((item) => (favoritesOnly ? favorites.includes(item.id) : true));
  }, [recent, actionsById, favoritesOnly, favorites]);

  return (
    <div
      className="definitions-page p-2 p-md-4"
      style={{
        minHeight: "calc(100vh - 80px)",
        background: "#f7f9fc",
      }}
    >
      <div className="d-flex align-items-center justify-content-between mb-4">
        <div>
          <div className="d-flex align-items-center gap-2 mb-1">
            <div
              className="d-flex align-items-center justify-content-center rounded-4"
              style={{
                width: 44,
                height: 44,
                background: "#eaf2ff",
                color: "#2563eb",
              }}
            >
              <Settings size={22} />
            </div>

            <div>
              <h4 className="mb-0">Definitions</h4>
              <small className="text-muted">
                Manage Sales Volume Rebate definition tables
              </small>
            </div>
          </div>
        </div>

        <span className="badge bg-primary-subtle text-primary px-3 py-2">
          {actions.length} Definitions
        </span>
      </div>

      <div className="card border-0 shadow-sm mb-4">
        <div className="card-body">
          <div className="row g-3 align-items-center">
            <div className="col-md-8">
              <div className="position-relative">
                <Search
                  size={18}
                  className="position-absolute text-muted"
                  style={{
                    left: 12,
                    top: "50%",
                    transform: "translateY(-50%)",
                  }}
                />

                <input
                  ref={searchRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search definitions..."
                  className="form-control"
                  style={{ paddingLeft: 38 }}
                />
              </div>
            </div>

            <div className="col-md-4">
              <label className="d-flex align-items-center justify-content-md-end gap-2 mb-0 text-muted">
                <input
                  type="checkbox"
                  checked={favoritesOnly}
                  onChange={(e) => setFavoritesOnly(e.target.checked)}
                />
                <Star
                  size={16}
                  className={
                    favoritesOnly ? "text-warning fill-warning" : "text-muted"
                  }
                />
                Favorites only
              </label>
            </div>
          </div>
        </div>
      </div>

      {recentItems.length > 0 && (
        <section className="mb-4">
          <div className="d-flex align-items-center gap-2 mb-3">
            <Clock size={20} className="text-primary" />
            <h5 className="mb-0">Recently Used</h5>
          </div>

          <DefinitionGrid
            items={recentItems}
            favorites={favorites}
            onFavorite={toggleFavorite}
            onActionClick={handleActionClick}
          />
        </section>
      )}

      <section>
        <div className="d-flex align-items-center gap-2 mb-3">
          <Layers size={20} className="text-primary" />
          <h5 className="mb-0">Sales Volume Rebate Definitions</h5>
        </div>

        <DefinitionGrid
          items={filteredItems}
          favorites={favorites}
          onFavorite={toggleFavorite}
          onActionClick={handleActionClick}
        />
      </section>

      {filteredItems.length === 0 && (
        <div className="card border-0 shadow-sm mt-4">
          <div className="card-body text-center py-5 text-muted">
            No definitions match your search.
          </div>
        </div>
      )}
    </div>
  );
}

function DefinitionGrid({ items, favorites, onFavorite, onActionClick }) {
  if (!items?.length) return null;

  return (
    <div className="row g-3">
      {items.map(({ id, label, description, Icon }) => (
        <div className="col-xl-3 col-lg-4 col-md-6 col-sm-12" key={id}>
          <div className="position-relative h-100">
            <button
              type="button"
              onClick={() => onActionClick(id)}
              className={buttonClass}
              style={{
                minHeight: 115,
                padding: "18px 14px",
                transition: "all 0.2s ease",
              }}
            >
              <div className="text-center">
                <div
                  className="mx-auto mb-2 d-flex align-items-center justify-content-center rounded-4"
                  style={{
                    width: 42,
                    height: 42,
                    background: "#eaf2ff",
                    color: "#2563eb",
                  }}
                >
                  <Icon size={20} />
                </div>

                <h6 className="mb-1 text-dark">{label}</h6>
                <small className="text-muted d-block">{description}</small>
              </div>
            </button>

            <button
              type="button"
              title={favorites.includes(id) ? "Remove favorite" : "Add favorite"}
              onClick={(e) => {
                e.stopPropagation();
                onFavorite(id);
              }}
              className="btn btn-light btn-sm rounded-circle position-absolute shadow-sm d-flex align-items-center justify-content-center p-0"
              style={{
                top: -8,
                right: -8,
                width: 32,
                height: 32,
                lineHeight: 1,
              }}
            >
              <Star
                size={15}
                className={
                  favorites.includes(id)
                    ? "text-warning fill-warning"
                    : "text-muted"
                }
              />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}