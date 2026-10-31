import { useEffect, useRef, useState, type RefObject } from "react";
import type { FurnitureItem, RenderAgent } from "@/features/retro-office/core/types";

// DevLabs: ambient office chatter. Claw3D's bubbles only showed "..." for idle
// agents; the old DevLabs floor had real lines (Taglish cafeteria chika, boss
// gossip, sucking up to Ramon, a cheer when a task lands). This director reads
// the scene once a second and puts those lines in the speech bubbles. The host
// supplies the words (i18n + per-character pools); this file only decides who
// says what kind of line, and when.

export type ChatterKind =
  | "coffee"
  | "vending"
  | "snack"
  | "table"
  | "gossip"
  | "suckUp"
  | "cheer"
  | "exchange";

/** Returns one line, or for "exchange" the alternating beats of a chat. */
export type PickChatter = (kind: ChatterKind, agentId: string, seed: number) => string[];

const BEAT_MS = 2600;
const LINE_MS = 4200;
const MAX_SPEAKERS = 5;
const NEAR_SPOT = 75;
const NEAR_BOSS = 130;
const NEAR_BUDDY = 85;

const SPOT_BY_TYPE: Record<string, ChatterKind> = {
  coffee_machine: "coffee",
  vending: "vending",
  fridge: "snack",
  round_table: "table",
};

const isJanitor = (agent: RenderAgent) => "role" in agent && agent.role === "janitor";

export function useOfficeChatter(
  agentsRef: RefObject<RenderAgent[]>,
  furnitureRef: RefObject<FurnitureItem[]>,
  pick: PickChatter | undefined,
  bossId: string | null,
): Record<string, string> {
  const [lines, setLines] = useState<Record<string, string>>({});
  const untilRef = useRef<Map<string, number>>(new Map());
  const queueRef = useRef<{ agentId: string; text: string; at: number }[]>([]);
  const prevStatusRef = useRef<Map<string, string>>(new Map());
  const pickRef = useRef(pick);
  pickRef.current = pick;

  useEffect(() => {
    const timer = window.setInterval(() => {
      const choose = pickRef.current;
      if (!choose) return;
      const now = Date.now();
      const agents = (agentsRef.current ?? []).filter((a) => !isJanitor(a));
      const spots = (furnitureRef.current ?? []).filter((f) => f.type in SPOT_BY_TYPE);
      const said: Record<string, string> = {};
      const say = (agentId: string, text: string | undefined, ms = LINE_MS) => {
        if (!text) return;
        said[agentId] = text;
        untilRef.current.set(agentId, now + ms);
      };
      const busy = (id: string) =>
        (untilRef.current.get(id) ?? 0) > now || queueRef.current.some((q) => q.agentId === id);
      const seed = () => Math.floor(Math.random() * 1e6);

      // Scheduled beats of running conversations.
      queueRef.current = queueRef.current.filter((beat) => {
        if (beat.at > now) return true;
        // Beats alternate, so each one clears before the reply appears.
        say(beat.agentId, beat.text, BEAT_MS - 200);
        return false;
      });

      for (const agent of agents) {
        const prev = prevStatusRef.current.get(agent.id);
        prevStatusRef.current.set(agent.id, agent.status);
        // A finished stretch of work earns a cheer, whatever else is going on.
        if (prev === "working" && agent.status === "idle") {
          say(agent.id, choose("cheer", agent.id, seed())[0]);
          continue;
        }
        if (agent.status !== "idle" || agent.state === "walking" || busy(agent.id)) continue;

        // Two idle agents stopped together (the tick's chat freeze): play an exchange.
        if ((agent.bumpTalkUntil ?? 0) > now) {
          const buddy = agents.find(
            (other) =>
              other.id !== agent.id &&
              other.status === "idle" &&
              !busy(other.id) &&
              Math.hypot(other.x - agent.x, other.y - agent.y) < NEAR_BUDDY,
          );
          const beats = choose("exchange", agent.id, seed());
          if (buddy && beats.length > 1) {
            const holdUntil = now + beats.length * BEAT_MS + 1500;
            // Freeze both for the whole chat and turn them toward each other.
            agent.bumpedUntil = holdUntil;
            agent.bumpTalkUntil = holdUntil;
            buddy.bumpedUntil = holdUntil;
            buddy.bumpTalkUntil = holdUntil;
            buddy.path = [];
            buddy.state = "standing";
            buddy.facing = Math.atan2(agent.x - buddy.x, agent.y - buddy.y);
            beats.forEach((text, index) => {
              queueRef.current.push({
                agentId: index % 2 === 0 ? agent.id : buddy.id,
                text,
                at: now + index * BEAT_MS,
              });
            });
          }
          continue;
        }

        if (Object.keys(said).length + countActive(untilRef.current, now) >= MAX_SPEAKERS) continue;
        if (Math.random() > 0.12) continue;

        const spot = spots.find((f) => Math.hypot(f.x + 20 - agent.x, f.y + 20 - agent.y) < NEAR_SPOT);
        if (spot) {
          say(agent.id, choose(SPOT_BY_TYPE[spot.type], agent.id, seed())[0]);
          continue;
        }
        if (!bossId || agent.id === bossId) continue;
        const boss = agents.find((a) => a.id === bossId);
        const nearBoss = boss && Math.hypot(boss.x - agent.x, boss.y - agent.y) < NEAR_BOSS;
        if (nearBoss) say(agent.id, choose("suckUp", agent.id, seed())[0]);
        else if (Math.random() < 0.35) say(agent.id, choose("gossip", agent.id, seed())[0]);
      }

      setLines((current) => {
        const next: Record<string, string> = {};
        let changed = false;
        for (const [id, text] of Object.entries(current)) {
          if ((untilRef.current.get(id) ?? 0) > now && !(id in said)) next[id] = text;
          else changed = true;
        }
        for (const [id, text] of Object.entries(said)) {
          next[id] = text;
          changed = true;
        }
        return changed ? next : current;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [agentsRef, furnitureRef, bossId]);

  return lines;
}

const countActive = (until: Map<string, number>, now: number) => {
  let n = 0;
  for (const t of until.values()) if (t > now) n += 1;
  return n;
};
