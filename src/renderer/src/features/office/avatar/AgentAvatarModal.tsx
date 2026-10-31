import { X } from "lucide-react";
import { useStore, type Agent } from "@/store/store";
import { AgentAvatarEditorPanel } from "@/features/office/avatar/AgentAvatarEditorPanel";
import "@/features/retro-office/retro-office.css";

// DevLabs: Claw3D's avatar editor in a modal. Saving writes the profile onto
// the agent in the store (persisted with the roster), and the 3D office
// avatar picks it up straight away.
export function AgentAvatarModal({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  return (
    <div
      className="devlabs-office fixed inset-0 z-[60] flex items-center justify-center bg-black/55"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative h-[min(86vh,760px)] w-[min(92vw,1100px)] overflow-hidden rounded-2xl border border-amber-500/25 bg-[var(--color-office-bg-1)] text-foreground shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close avatar editor"
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-amber-400/20 bg-[var(--color-office-bg-1)]/90 text-amber-200/70 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
        <AgentAvatarEditorPanel
          agentId={agent.id}
          agentName={agent.name}
          initialProfile={agent.avatarProfile}
          onSave={(profile) => useStore.getState().updateAgent(agent.id, { avatarProfile: profile })}
          onSaved={onClose}
          onCancel={onClose}
        />
      </div>
    </div>
  );
}
