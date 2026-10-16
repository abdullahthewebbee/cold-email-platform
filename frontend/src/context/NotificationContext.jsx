import { createContext, useContext, useState, useCallback } from 'react';

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const [notes, setNotes] = useState([]);
  const add = useCallback((note) => {
    const id = Date.now();
    setNotes(n => [...n, { id, ...note }]);
    setTimeout(() => setNotes(n => n.filter(x => x.id !== id)), note.duration || 4000);
  }, []);
  // Callable AND has .success/.error, because the app uses both styles:
  //   notify({ type: 'error', message: '...' })   and   notify.success('...')
  const notify = (arg, message) => {
    if (arg && typeof arg === 'object') return add({ type: 'success', ...arg });
    return add({ type: message === undefined ? 'success' : arg, message: message === undefined ? arg : message });
  };
  notify.success = (message) => add({ type: 'success', message });
  notify.error = (message) => add({ type: 'error', message });
  return (
    <NotificationContext.Provider value={notify}>
      {children}
      <div className="fixed top-4 right-4 space-y-2 z-50">
        {notes.map(n => (
          <div key={n.id} className={`px-4 py-2 rounded shadow ${n.type === 'error' ? 'bg-red-500 text-white' : 'bg-green-500 text-white'}`}>
            {n.message}
          </div>
        ))}
      </div>
    </NotificationContext.Provider>
  );
}

export function useNotify() {
  const ctx = useContext(NotificationContext);
  if (ctx) return ctx;
  const noop = () => {};
  noop.success = noop;
  noop.error = noop;
  return noop;
}
