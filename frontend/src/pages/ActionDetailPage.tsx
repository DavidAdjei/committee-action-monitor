import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { ActionDetailPanel } from "@/components/ActionDetailPanel";

/** Full-page action view — always a page, never a modal. */
export default function ActionDetailPage() {
  const { actionId } = useParams();
  const navigate = useNavigate();
  const id = Number(actionId);

  if (!Number.isInteger(id) || id <= 0) {
    return (
      <div className="card p-6 text-sm text-slate-500">
        Invalid action link.{" "}
        <Link to="/actions" className="font-semibold text-brand-700 hover:underline">
          Back to actions
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4 pb-12">
      <button
        type="button"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
        onClick={() => {
          if (window.history.length > 1) navigate(-1);
          else navigate("/actions");
        }}
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>
      <ActionDetailPanel actionId={id} />
    </div>
  );
}
