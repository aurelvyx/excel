import { Dialog } from "../../../shared/Dialog";
import { requestPageExit } from "../../../shared/useUnsavedChanges";
import { AttendanceClosurePage } from "../../attendance/AttendanceClosurePage";
import "./workspace.css";

export function AttendanceClosureModal({
  groupId,
  onClose,
}: {
  groupId: string;
  onClose: () => void;
}) {
  return (
    <Dialog
      title="Revisión del cierre de asistencia"
      onClose={() => requestPageExit(onClose)}
    >
      <div className="workspace-panel">
        <AttendanceClosurePage groupId={groupId} />
      </div>
    </Dialog>
  );
}
