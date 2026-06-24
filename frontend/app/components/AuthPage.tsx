"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type AuthMode = "signin" | "register";
type AccountRole = "candidate" | "interviewer";

type AuthPageProps = {
  mode: AuthMode;
};

export default function AuthPage({ mode }: AuthPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") ?? "";
  const nextQuery = nextPath ? `?next=${encodeURIComponent(nextPath)}` : "";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<AccountRole>("candidate");
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");

  const isRegister = mode === "register";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setMessage("");

    try {
      const endpoint = isRegister ? "/auth/register" : "/auth/login";
      const body = isRegister ? { email, password, role } : { email, password };
      const res = await fetch(`http://localhost:8000${endpoint}`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      console.log("FULL RESPONSE:", data);
      if (data.access_token) {
        localStorage.setItem("access_token", data.access_token);
        console.log("Access token stored in localStorage:", data.access_token);
      }

      if (!res.ok) {
        throw new Error(data.detail || "Authentication failed.");
      }

      setMessage(data.message);

      if (nextPath) {
        router.replace(nextPath);
        return;
      }

      router.replace("/dashboard");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not reach the backend on http://localhost:8000.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#f6f3ee] text-[#171717]">
      <div className="grid min-h-screen lg:grid-cols-[1fr_480px]">
        <section className="relative hidden overflow-hidden bg-[#102820] text-white lg:block">
          <div className="absolute inset-0 opacity-35">
            <div className="h-full w-full bg-[linear-gradient(135deg,#102820_0%,#2d6a4f_42%,#f2c14e_100%)]" />
          </div>
          <div className="relative flex h-full flex-col justify-between p-12">
            <div className="flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-lg bg-white text-lg font-bold text-[#102820]">
                AI
              </div>
              <span className="text-lg font-semibold tracking-wide">
                AI Interviewer
              </span>
            </div>

            <div className="max-w-xl">
              <p className="mb-5 text-sm font-semibold uppercase tracking-[0.22em] text-[#f2c14e]">
                Practice with purpose
              </p>
              <h1 className="text-5xl font-semibold leading-tight">
                {isRegister
                  ? "Create your interview workspace and start practicing."
                  : "Sign in and continue building your interview workspace."}
              </h1>
              <p className="mt-6 max-w-lg text-lg leading-8 text-white/78">
                Track practice sessions, review answers, and grow the product
                step by step.
              </p>
            </div>

            <div className="grid max-w-xl grid-cols-3 gap-4 text-sm">
              <div className="border-t border-white/30 pt-4">
                <p className="font-semibold">Questions</p>
                <p className="mt-1 text-white/70">Generated practice flow</p>
              </div>
              <div className="border-t border-white/30 pt-4">
                <p className="font-semibold">Answers</p>
                <p className="mt-1 text-white/70">Saved for review</p>
              </div>
              <div className="border-t border-white/30 pt-4">
                <p className="font-semibold">Feedback</p>
                <p className="mt-1 text-white/70">Scores and notes</p>
              </div>
            </div>
          </div>
        </section>

        <section className="flex min-h-screen items-center justify-center px-6 py-10 sm:px-10">
          <div className="w-full max-w-md">
            <div className="mb-10 flex items-center gap-3 lg:hidden">
              <div className="flex size-10 items-center justify-center rounded-lg bg-[#102820] text-base font-bold text-white">
                AI
              </div>
              <span className="text-lg font-semibold">AI Interviewer</span>
            </div>

            <div className="rounded-lg border border-[#ddd6cb] bg-white p-7 shadow-[0_18px_60px_rgba(16,40,32,0.12)] sm:p-9">
              <div>
                <p className="text-sm font-medium text-[#2d6a4f]">
                  {isRegister ? "Start fresh" : "Welcome back"}
                </p>
                <h2 className="mt-3 text-3xl font-semibold tracking-normal text-[#171717]">
                  {isRegister
                    ? "Create your account"
                    : "Sign in to your account"}
                </h2>
              </div>

              <form onSubmit={handleSubmit} className="mt-8 space-y-5">
                <label className="block">
                  <span className="text-sm font-medium text-[#3d3d3d]">
                    Email
                  </span>
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@example.com"
                    required
                    className="mt-2 h-12 w-full rounded-md border border-[#cfc6b8] bg-[#fbfaf8] px-4 text-base text-[#171717] outline-none transition focus:border-[#2d6a4f] focus:bg-white focus:ring-4 focus:ring-[#2d6a4f]/15"
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-[#3d3d3d]">
                    Password
                  </span>
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Enter your password"
                    required
                    minLength={6}
                    className="mt-2 h-12 w-full rounded-md border border-[#cfc6b8] bg-[#fbfaf8] px-4 text-base text-[#171717] outline-none transition focus:border-[#2d6a4f] focus:bg-white focus:ring-4 focus:ring-[#2d6a4f]/15"
                  />
                </label>

                {isRegister && (
                  <fieldset>
                    <legend className="text-sm font-medium text-[#3d3d3d]">
                      I am signing up as
                    </legend>
                    <div className="mt-2 grid grid-cols-2 rounded-md border border-[#cfc6b8] bg-[#fbfaf8] p-1">
                      <button
                        type="button"
                        onClick={() => setRole("candidate")}
                        className={`h-11 rounded px-3 text-sm font-semibold transition ${
                          role === "candidate"
                            ? "bg-[#102820] text-white shadow-sm"
                            : "text-[#4b4b4b] hover:bg-white"
                        }`}
                      >
                        Candidate
                      </button>
                      <button
                        type="button"
                        onClick={() => setRole("interviewer")}
                        className={`h-11 rounded px-3 text-sm font-semibold transition ${
                          role === "interviewer"
                            ? "bg-[#102820] text-white shadow-sm"
                            : "text-[#4b4b4b] hover:bg-white"
                        }`}
                      >
                        Interviewer
                      </button>
                    </div>
                  </fieldset>
                )}

                {!isRegister && (
                  <div className="flex items-center justify-between gap-4 text-sm">
                    <label className="flex items-center gap-2 text-[#4b4b4b]">
                      <input
                        type="checkbox"
                        className="size-4 rounded border-[#cfc6b8] accent-[#2d6a4f]"
                      />
                      Remember me
                    </label>
                    <a
                      href="#"
                      className="font-medium text-[#2d6a4f] hover:text-[#1f4f3b]"
                    >
                      Forgot password?
                    </a>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex h-12 w-full items-center justify-center rounded-md bg-[#102820] px-4 text-base font-semibold text-white transition hover:bg-[#1f4f3b] disabled:cursor-not-allowed disabled:bg-[#789083]"
                >
                  {isLoading
                    ? "Checking..."
                    : isRegister
                      ? "Create account"
                      : "Sign in"}
                </button>
              </form>

              {message && (
                <p className="mt-5 rounded-md border border-[#ddd6cb] bg-[#fbfaf8] px-4 py-3 text-sm text-[#3d3d3d]">
                  {message}
                </p>
              )}

              <p className="mt-7 text-center text-sm text-[#4b4b4b]">
                {isRegister ? "Already have an account?" : "New here?"}{" "}
                <a
                  href={isRegister ? `/signin${nextQuery}` : `/register${nextQuery}`}
                  className="font-semibold text-[#2d6a4f] hover:text-[#1f4f3b]"
                >
                  {isRegister ? "Sign in" : "Create an account"}
                </a>
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
