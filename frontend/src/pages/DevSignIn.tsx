import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, ShieldCheck } from "lucide-react";
import { endpoints } from "@/api/endpoints";
import { useAuth } from "@/state/authContext";

interface DevUser {
  id: number;
  fullName: string;
  email: string;
  department: string | null;
  isCentralCommittee: boolean;
  isAdmin: boolean;
}

export default function DevSignIn() {
  const [users, setUsers] = useState<DevUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { signIn } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    endpoints
      .devUsers()
      .then(setUsers)
      .catch(() =>
        setError(
          "The developer sign-in list is unavailable. In production this screen is replaced entirely by Microsoft Entra ID sign-in.",
        ),
      );
  }, []);

  const choose = async (id: number) => {
    await signIn(id);
    navigate("/committees");
  };

  return (
    <main className="grid min-h-screen place-items-center bg-gradient-to-br from-brand-700 via-brand-500 to-slate-100 p-7">
      <section className="w-full max-w-2xl rounded-2xl bg-white p-8 shadow-2xl">
        <div className="mb-6 flex items-center gap-3.5">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-navy text-lg font-bold text-white">
            CA
          </div>
          <div>
            <h1 className="text-xl font-bold text-ink">Committee Action Monitor</h1>
            <p className="text-sm text-slate-500">Sign in to continue with your assigned access.</p>
          </div>
        </div>

        {error && <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{error}</p>}

        <div className="max-h-[420px] space-y-2 overflow-y-auto">
          {users.map((u) => (
            <button
              key={u.id}
              onClick={() => choose(u.id)}
              className="flex w-full items-center justify-between rounded-xl border border-slate-200 px-4 py-3.5 text-left transition hover:border-brand-300 hover:bg-brand-50"
            >
              <div>
                <b className="text-sm text-slate-900">{u.fullName}</b>
                <p className="text-xs text-slate-500">
                  {u.department ?? "—"}
                  {u.isAdmin ? " · Central Committee Administrator" : u.isCentralCommittee ? " · Central Committee Member" : ""}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-slate-400" />
            </button>
          ))}
        </div>

        <p className="mt-6 flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          Production access will match the signed-in Microsoft Entra ID user to committee membership and role
          assignments — this picker exists only because this environment has no live Entra tenant configured.
        </p>
      </section>
    </main>
  );
}
