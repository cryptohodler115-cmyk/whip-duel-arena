import { useEffect, useState } from "react";

/**
 * A deliberately tiny hash router — this app has exactly four views, so a
 * real router dependency isn't worth the extra install surface.
 * Routes: #/            -> landing (splash page, "Enter The Sand Casino")
 *         #/lobby       -> lobby
 *         #/duel/:id    -> commit/reveal waiting room
 *         #/arena/:id   -> fight replay
 */
export type Route =
  | { name: "landing" }
  | { name: "lobby" }
  | { name: "duel"; id: bigint }
  | { name: "arena"; id: bigint };

function parseHash(hash: string): Route {
  const clean = hash.replace(/^#\/?/, "");
  const parts = clean.split("/").filter(Boolean);
  if (parts[0] === "lobby") {
    return { name: "lobby" };
  }
  if (parts[0] === "duel" && parts[1] !== undefined) {
    try {
      return { name: "duel", id: BigInt(parts[1]) };
    } catch {
      return { name: "landing" };
    }
  }
  if (parts[0] === "arena" && parts[1] !== undefined) {
    try {
      return { name: "arena", id: BigInt(parts[1]) };
    } catch {
      return { name: "landing" };
    }
  }
  if (parts.length === 0) {
    return { name: "landing" };
  }
  return { name: "landing" };
}

export function useRoute(): [Route, (r: Route) => void] {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));

  useEffect(() => {
    const onHashChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const navigate = (r: Route) => {
    if (r.name === "landing") window.location.hash = "#/";
    if (r.name === "lobby") window.location.hash = "#/lobby";
    if (r.name === "duel") window.location.hash = `#/duel/${r.id.toString()}`;
    if (r.name === "arena") window.location.hash = `#/arena/${r.id.toString()}`;
  };

  return [route, navigate];
}
