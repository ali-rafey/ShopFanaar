import { createContext, useContext, useEffect, useMemo, useState } from "react";

const SavedContext = createContext(null);
const STORAGE_KEY = "fanaar-saved";

export function SavedProvider({ children }) {
  const [ids, setIds] = useState(() => {
    try {
      const v = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  }, [ids]);

  function toggle(id) {
    setIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [id, ...prev]
    );
  }

  const isSaved = useMemo(() => (id) => ids.includes(id), [ids]);

  return (
    <SavedContext.Provider value={{ ids, toggle, isSaved, count: ids.length }}>
      {children}
    </SavedContext.Provider>
  );
}

export const useSaved = () => useContext(SavedContext);
