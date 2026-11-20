import { Dialog } from "../../../shared/Dialog";
import { requestPageExit } from "../../../shared/useUnsavedChanges";
import { JustificationsPage } from "../../attendance/JustificationsPage";
import "./workspace.css";

export function JustificationsDrawer({
  groupId,
  onClose,
}: {
  groupId: string;
  onClose: () => void;
}) {
  return (
    <Dialog
      title="Justificaciones del salón"
      onClose={() => requestPageExit(onClose)}
      className="workspace-drawer"
    >
      <div className="workspace-panel">
        <JustificationsPage groupId={groupId} query={new URLSearchParams()} />
      </div>
    </Dialog>
  );
}
