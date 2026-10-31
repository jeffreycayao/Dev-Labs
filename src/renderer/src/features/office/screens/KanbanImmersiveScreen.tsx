// DevLabs: the 3D kanban board opens the app's own hive task board
// (TasksKanban) instead of Claw3D's OpenClaw-backed one.
import { useEffect } from "react";
import { X } from "lucide-react";
import { TasksKanban } from "@/components/TasksKanban";

type StubProps = { [key: `on${string}`]: ((...args: any[]) => unknown) | undefined } & Record<string, unknown>;

export function KanbanImmersiveScreen({ onClose }: StubProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className="relative">
        <button
          type="button"
          onClick={() => onClose?.()}
          aria-label="Close kanban board"
          className="absolute -right-5 -top-5 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-amber-400/20 bg-[var(--color-office-bg-1)]/90 text-amber-200/70 backdrop-blur-sm transition-colors hover:border-amber-400/40 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
        <div
          className="flex h-[min(75vh,800px)] w-[min(80vw,1280px)] flex-col overflow-auto rounded-2xl border border-amber-500/20 shadow-2xl"
          style={{ background: "var(--cth-paper-100)", color: "var(--cth-ink-900)" }}
        >
          <TasksKanban />
        </div>
      </div>
    </div>
  );
}
