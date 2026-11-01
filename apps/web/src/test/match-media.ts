/**
 * Test double for `window.matchMedia`: jsdom's native implementation never
 * matches and never fires change events. This stub lets tests pin a query
 * to mobile/desktop and flip it live (BottomSheet responsive behavior).
 */
type ChangeListener = (event: MediaQueryListEvent) => void;

interface QueryState {
  matches: boolean;
  listeners: Set<ChangeListener>;
}

export function createMatchMediaStub(initial = false) {
  const states = new Map<string, QueryState>();

  const stateFor = (query: string): QueryState => {
    let state = states.get(query);
    if (!state) {
      state = { matches: initial, listeners: new Set() };
      states.set(query, state);
    }
    return state;
  };

  function matchMedia(query: string): MediaQueryList {
    stateFor(query);
    return {
      get matches() {
        return stateFor(query).matches;
      },
      get media() {
        return query;
      },
      get onchange() {
        return null;
      },
      set onchange(_: unknown) {
        /* captured via addEventListener */
      },
      addEventListener: (_type: unknown, listener: ChangeListener) => {
        stateFor(query).listeners.add(listener);
      },
      removeEventListener: (_type: unknown, listener: ChangeListener) => {
        stateFor(query).listeners.delete(listener);
      },
      addListener: (listener: ChangeListener) => stateFor(query).listeners.add(listener),
      removeListener: (listener: ChangeListener) => stateFor(query).listeners.delete(listener),
      dispatchEvent: () => true,
    } as MediaQueryList;
  }

  return Object.assign(matchMedia, {
    /** Flip a query and notify its listeners (fires `change`). */
    setMatches(query: string, matches: boolean) {
      const state = stateFor(query);
      state.matches = matches;
      const event = { matches, media: query } as MediaQueryListEvent;
      state.listeners.forEach((listener) => listener(event));
    },
  });
}
