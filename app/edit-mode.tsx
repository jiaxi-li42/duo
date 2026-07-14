"use client";

import { createContext, useCallback, useContext, useState } from "react";

// Shelf-wide edit mode + multi-selection. The provider wraps the server-rendered
// shelf; each tile toggles its own membership and the bottom bar's bulk actions
// read the selection. Context crosses the server/client boundary fine — only the
// provider and its consumers are client.
type EditModeCtx = {
  editing: boolean;
  setEditing: (v: boolean) => void;
  selected: Set<string>;
  toggle: (id: string) => void;
  clear: () => void;
};

const EditModeContext = createContext<EditModeCtx>({
  editing: false,
  setEditing: () => {},
  selected: new Set(),
  toggle: () => {},
  clear: () => {},
});

export const useEditMode = () => useContext(EditModeContext);

export function EditModeProvider({ children }: { children: React.ReactNode }) {
  const [editing, setEditingRaw] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const clear = useCallback(() => setSelected(new Set()), []);

  const setEditing = useCallback((v: boolean) => {
    setEditingRaw(v);
    if (!v) setSelected(new Set()); // leaving edit mode drops the selection
  }, []);

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  return (
    <EditModeContext.Provider
      value={{ editing, setEditing, selected, toggle, clear }}
    >
      {children}
    </EditModeContext.Provider>
  );
}
