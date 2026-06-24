"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import StartInterviewRoomButton from "../components/StartInterviewRoomButton";
import MyInterviewsPanel from "../components/MyInterviewsPanel";

const interviews = [
  {
    time: "09:30",
    candidate: "Maya Chen",
    role: "Frontend Developer",
    stage: "Technical screen",
    status: "Ready",
  },
  {
    time: "11:00",
    candidate: "Omar Haddad",
    role: "Backend Developer",
    stage: "System design",
    status: "Needs rubric",
  },
  {
    time: "14:15",
    candidate: "Leah Smith",
    role: "Data Analyst",
    stage: "Behavioral",
    status: "Ready",
  },
];

const futureInterviews = [
  {
    date: "Tomorrow",
    time: "10:00",
    candidate: "Ava Martin",
    role: "Product Designer",
  },
  {
    date: "Fri, Jun 19",
    time: "13:30",
    candidate: "Noah Reed",
    role: "DevOps Engineer",
  },
  {
    date: "Mon, Jun 22",
    time: "09:00",
    candidate: "Sara Kim",
    role: "ML Engineer",
  },
];

const completedInterviews = [
  { candidate: "Nadia Patel", role: "QA Engineer", score: "84", date: "Jun 14" },
  { candidate: "Ethan Brooks", role: "Backend Developer", score: "78", date: "Jun 13" },
  { candidate: "Iris Lopez", role: "Frontend Developer", score: "91", date: "Jun 12" },
];

const signals = [
  { label: "Interviews today", value: "3", detail: "2 ready to start" },
  { label: "Future interviews", value: "9", detail: "Next 7 days" },
  { label: "Pending feedback", value: "7", detail: "Oldest: 2 days" },
  { label: "AI credits", value: "42", detail: "18 used this month" },
];

const questionSets = [
  "React state and rendering",
  "API design and tradeoffs",
  "Debugging production issues",
  "Teamwork and ownership",
];

const feedback = [
  {
    candidate: "Nadia Patel",
    note: "Strong debugging process, needs clearer explanation of tradeoffs.",
    score: "84",
  },
  {
    candidate: "Ethan Brooks",
    note: "Good fundamentals. Add follow-up on database indexing.",
    score: "78",
  },
];

type CurrentUser = {
  id: number;
  email: string;
  role: "candidate" | "interviewer";
  name: string;
};

type UpcomingInterview = {
  roomId: string;
  candidateEmail?: string;
  inviteUrl: string;
  createdAt: string;
};

export default function DashboardPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [upcomingInterviews, setUpcomingInterviews] = useState<UpcomingInterview[]>([]);
  const [activeSection, setActiveSection] = useState("Overview");
  const [receivedInvites, setReceivedInvites] = useState<UpcomingInterview[]>([]);

  const sidebarItemsByRole = {
    interviewer: [
      { label: "Overview", marker: "O", active: true },
      { label: "Live chat & calls", marker: "LC", active: false },
      { label: "Schedule interview", marker: "S", active: false },
      { label: "Future interviews", marker: "F", active: false },
      { label: "Done interviews", marker: "D", active: false },
      { label: "AI features & billing", marker: "AI", active: false },
      { label: "Question bank", marker: "Q", active: false },
      { label: "Candidates", marker: "C", active: false },
      { label: "Settings", marker: "G", active: false },
    ],
    candidate: [
      { label: "Overview", marker: "O", active: true },
      { label: "My interviews", marker: "MI", active: false },
      { label: "Preparation", marker: "P", active: false },
      { label: "Resources", marker: "R", active: false },
      { label: "Feedback", marker: "F", active: false },
      { label: "Settings", marker: "G", active: false },
    ],
  };

  useEffect(() => {
    const fetchCurrentUser = async () => {
      const token = localStorage.getItem("access_token");
      if (!token) {
        router.replace("/signin?next=/dashboard");
        return;
      }

      try {
        const response = await fetch("http://localhost:8000/auth/me", {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          throw new Error("Authentication required");
        }

        const data = (await response.json()) as CurrentUser;
        setCurrentUser(data);
      } catch {
        localStorage.removeItem("access_token");
        router.replace("/signin?next=/dashboard");
      } finally {
        setIsLoading(false);
      }
    };

    fetchCurrentUser();
  }, [router]);

  useEffect(() => {
    const storageKey = "ai-interviewer-upcoming-interviews";
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as UpcomingInterview[];
        setUpcomingInterviews(parsed);
      } catch {
        setUpcomingInterviews([]);
      }
    }
  }, []);

  // For candidates, fetch received invites from backend
  useEffect(() => {
    if (currentUser?.role === "candidate") {
      const fetchReceivedInvites = async () => {
        const token = localStorage.getItem("access_token");
        if (!token) return;

        try {
          const response = await fetch("http://localhost:8000/invites/received", {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          });

          if (response.ok) {
            const data = (await response.json()) as Array<{
              id: number;
              room_id: string;
              recipient_email: string;
              invite_url: string;
              created_at: string;
            }>;
            setReceivedInvites(
              data.map((invite) => ({
                roomId: invite.room_id,
                candidateEmail: invite.recipient_email,
                inviteUrl: invite.invite_url,
                createdAt: invite.created_at,
              }))
            );
          }
        } catch {
          // silently fail if backend doesn't have invites
        }
      };

      fetchReceivedInvites();
    }
  }, [currentUser?.role]);

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f3ee] px-6 text-[#171717]">
        <div className="rounded-lg border border-[#ddd6cb] bg-white p-6 text-center shadow-[0_18px_60px_rgba(16,40,32,0.12)]">
          <p className="text-sm font-medium text-[#2d6a4f]">Checking your session</p>
          <h1 className="mt-2 text-xl font-semibold">Loading dashboard...</h1>
        </div>
      </main>
    );
  }

  if (!currentUser) {
    return null;
  }

  const sidebarItems = sidebarItemsByRole[currentUser.role].map((item) => ({
    ...item,
    active: item.label === activeSection,
  }));
  const isInterviewer = currentUser.role === "interviewer";

  return (
    <main className="min-h-screen bg-[#f6f3ee] text-[#171717]">
      <div className="grid min-h-screen lg:grid-cols-[280px_1fr]">
        <aside className="border-b border-[#ddd6cb] bg-white lg:border-b-0 lg:border-r">
          <div className="flex h-full flex-col px-4 py-5">
            <div className="flex items-center gap-3 px-2">
              <div className="flex size-10 items-center justify-center rounded-lg bg-[#102820] text-base font-bold text-white">
                AI
              </div>
              <div>
                <p className="text-sm font-medium text-[#2d6a4f]">
                  {isInterviewer ? "Interviewer" : "Candidate"}
                </p>
                <h1 className="text-lg font-semibold">AI Interviewer</h1>
              </div>
            </div>

            <nav className="mt-8 space-y-1">
              {sidebarItems.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => setActiveSection(item.label)}
                  className={`flex w-full items-center gap-3 rounded-md px-3 py-3 text-left text-sm font-semibold transition ${
                    item.active
                      ? "bg-[#102820] text-white"
                      : "text-[#4b4b4b] hover:bg-[#f6f3ee] hover:text-[#102820]"
                  }`}
                >
                  <span
                    className={`flex size-8 shrink-0 items-center justify-center rounded-md text-xs font-bold ${
                      item.active
                        ? "bg-white text-[#102820]"
                        : "bg-[#fbfaf8] text-[#2d6a4f]"
                    }`}
                  >
                    {item.marker}
                  </span>
                  {item.label}
                </button>
              ))}
            </nav>

            <div className="mt-8 rounded-lg border border-[#ddd6cb] bg-[#fbfaf8] p-4">
              <p className="text-sm font-semibold text-[#102820]">
                AI interview tools
              </p>
              <p className="mt-2 text-sm leading-6 text-[#5c554c]">
                Upgrade to unlock AI question generation, automatic scoring,
                answer summaries, and interview insights.
              </p>
              <button className="mt-4 w-full rounded-md bg-[#2d6a4f] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#1f4f3b]">
                View plans
              </button>
            </div>

            <a
              href="/signin"
              className="mt-auto rounded-md border border-[#cfc6b8] bg-white px-4 py-2 text-center text-sm font-semibold text-[#3d3d3d] transition hover:border-[#2d6a4f] hover:text-[#102820]"
            >
              Sign out
            </a>
          </div>
        </aside>

        <div>
          <header className="border-b border-[#ddd6cb] bg-white">
            <div className="flex items-center justify-between px-6 py-4">
              <div>
                <p className="text-sm font-medium text-[#2d6a4f]">
                  Welcome back, {currentUser.name}
                </p>
                <h2 className="text-xl font-semibold">
                  {isInterviewer ? "Interviewer dashboard" : "Candidate dashboard"}
                </h2>
              </div>
              <div className="flex flex-wrap gap-2">
                {isInterviewer ? (
                  <StartInterviewRoomButton />
                ) : (
                  <button className="rounded-md bg-[#102820] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#1f4f3b]">
                    Start practice
                  </button>
                )}
              </div>
            </div>
          </header>

          <div className="grid gap-6 px-6 py-6 xl:grid-cols-[1fr_340px]">
            {isInterviewer ? (
              <>
                <section className="space-y-6">
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    {signals.map((signal) => (
                      <div
                        key={signal.label}
                        className="rounded-lg border border-[#ddd6cb] bg-white p-5 shadow-[0_12px_40px_rgba(16,40,32,0.08)]"
                      >
                        <p className="text-sm font-medium text-[#4b4b4b]">
                          {signal.label}
                        </p>
                        <p className="mt-3 text-3xl font-semibold">
                          {signal.value}
                        </p>
                        <p className="mt-2 text-sm text-[#6b6258]">
                          {signal.detail}
                        </p>
                      </div>
                    ))}
                  </div>

                  {upcomingInterviews.length > 0 && (
                    <div className="rounded-lg border border-[#ddd6cb] bg-white shadow-[0_12px_40px_rgba(16,40,32,0.08)]">
                      <div className="flex items-center justify-between border-b border-[#eee7dc] px-5 py-4">
                        <h3 className="text-lg font-semibold">Upcoming interviews</h3>
                        <span className="text-sm text-[#2d6a4f]">
                          {upcomingInterviews.length} saved
                        </span>
                      </div>
                      <div className="space-y-3 p-5">
                        {upcomingInterviews.map((interview) => (
                          <div
                            key={interview.roomId}
                            className="rounded-md border border-[#eee7dc] bg-[#fbfaf8] p-4"
                          >
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <p className="font-semibold">Room ID: {interview.roomId}</p>
                                {interview.candidateEmail && (
                                  <p className="text-sm text-[#5c554c]">
                                    Candidate: {interview.candidateEmail}
                                  </p>
                                )}
                                <p className="text-sm text-[#5c554c]">
                                  Created {new Date(interview.createdAt).toLocaleString()}
                                </p>
                              </div>
                              <a
                                href={interview.inviteUrl}
                                className="text-sm font-semibold text-[#2d6a4f] hover:text-[#102820]"
                              >
                                View invite
                              </a>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="rounded-lg border border-[#ddd6cb] bg-white shadow-[0_12px_40px_rgba(16,40,32,0.08)]">
                    <div className="flex items-center justify-between border-b border-[#eee7dc] px-5 py-4">
                      <h3 className="text-lg font-semibold">Interview queue</h3>
                      <button className="rounded-md bg-[#102820] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#1f4f3b]">
                        New interview
                      </button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[680px] text-left text-sm">
                        <thead className="bg-[#fbfaf8] text-[#5c554c]">
                          <tr>
                            <th className="px-5 py-3 font-semibold">Time</th>
                            <th className="px-5 py-3 font-semibold">Candidate</th>
                            <th className="px-5 py-3 font-semibold">Role</th>
                            <th className="px-5 py-3 font-semibold">Stage</th>
                            <th className="px-5 py-3 font-semibold">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {interviews.map((interview) => (
                            <tr
                              key={`${interview.time}-${interview.candidate}`}
                              className="border-t border-[#eee7dc]"
                            >
                              <td className="px-5 py-4 font-semibold">
                                {interview.time}
                              </td>
                              <td className="px-5 py-4">{interview.candidate}</td>
                              <td className="px-5 py-4">{interview.role}</td>
                              <td className="px-5 py-4">{interview.stage}</td>
                              <td className="px-5 py-4">
                                <span className="rounded-full bg-[#eaf3ed] px-3 py-1 text-xs font-semibold text-[#1f4f3b]">
                                  {interview.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="grid gap-6 2xl:grid-cols-2">
                    <section className="rounded-lg border border-[#ddd6cb] bg-white p-5 shadow-[0_12px_40px_rgba(16,40,32,0.08)]">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-semibold">Future interviews</h3>
                        <a
                          href="#"
                          className="text-sm font-semibold text-[#2d6a4f] hover:text-[#102820]"
                        >
                          View all
                        </a>
                      </div>
                      <div className="mt-4 space-y-3">
                        {futureInterviews.map((interview) => (
                          <div
                            key={`${interview.date}-${interview.candidate}`}
                            className="rounded-md border border-[#eee7dc] bg-[#fbfaf8] p-4"
                          >
                            <div className="flex items-center justify-between gap-4">
                              <p className="font-semibold">
                                {interview.candidate}
                              </p>
                              <p className="text-sm font-semibold text-[#2d6a4f]">
                                {interview.time}
                              </p>
                            </div>
                            <p className="mt-1 text-sm text-[#5c554c]">
                              {interview.date} - {interview.role}
                            </p>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section className="rounded-lg border border-[#ddd6cb] bg-white p-5 shadow-[0_12px_40px_rgba(16,40,32,0.08)]">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-semibold">Done interviews</h3>
                        <a
                          href="#"
                          className="text-sm font-semibold text-[#2d6a4f] hover:text-[#102820]"
                        >
                          Export
                        </a>
                      </div>
                      <div className="mt-4 space-y-3">
                        {completedInterviews.map((interview) => (
                          <div
                            key={`${interview.date}-${interview.candidate}`}
                            className="flex items-center justify-between gap-4 rounded-md border border-[#eee7dc] bg-[#fbfaf8] p-4"
                          >
                            <div>
                              <p className="font-semibold">
                                {interview.candidate}
                              </p>
                              <p className="mt-1 text-sm text-[#5c554c]">
                                {interview.date} - {interview.role}
                              </p>
                            </div>
                            <span className="rounded-md bg-[#102820] px-3 py-2 text-sm font-semibold text-white">
                              {interview.score}
                            </span>
                          </div>
                        ))}
                      </div>
                    </section>
                  </div>

                  <div className="grid gap-6 2xl:grid-cols-2">
                    {feedback.map((item) => (
                      <article
                        key={item.candidate}
                        className="rounded-lg border border-[#ddd6cb] bg-white p-5 shadow-[0_12px_40px_rgba(16,40,32,0.08)]"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-sm font-medium text-[#2d6a4f]">
                              Recent feedback
                            </p>
                            <h3 className="mt-1 text-lg font-semibold">
                              {item.candidate}
                            </h3>
                          </div>
                          <span className="rounded-md bg-[#102820] px-3 py-2 text-sm font-semibold text-white">
                            {item.score}
                          </span>
                        </div>
                        <p className="mt-4 text-sm leading-6 text-[#4b4b4b]">
                          {item.note}
                        </p>
                      </article>
                    ))}
                  </div>
                </section>

                <aside className="space-y-6">
                  <section className="rounded-lg border border-[#ddd6cb] bg-white p-5 shadow-[0_12px_40px_rgba(16,40,32,0.08)]">
                    <h3 className="text-lg font-semibold">Preparation</h3>
                    <div className="mt-4 space-y-3">
                      {questionSets.map((set) => (
                        <button
                          key={set}
                          className="flex w-full items-center justify-between rounded-md border border-[#eee7dc] bg-[#fbfaf8] px-4 py-3 text-left text-sm font-medium transition hover:border-[#2d6a4f] hover:bg-white"
                        >
                          <span>{set}</span>
                          <span className="text-[#2d6a4f]">Open</span>
                        </button>
                      ))}
                    </div>
                  </section>

                  <section className="rounded-lg border border-[#ddd6cb] bg-white p-5 shadow-[0_12px_40px_rgba(16,40,32,0.08)]">
                    <p className="text-sm font-semibold text-[#2d6a4f]">
                      Monetization
                    </p>
                    <h3 className="mt-2 text-xl font-semibold">
                      AI Pro interview pack
                    </h3>
                    <p className="mt-3 text-sm leading-6 text-[#5c554c]">
                      Use AI scoring, transcript summaries, generated follow-up
                      questions, and candidate comparison reports.
                    </p>
                    <button className="mt-4 w-full rounded-md bg-[#102820] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#1f4f3b]">
                      Manage subscription
                    </button>
                  </section>

                  <section className="rounded-lg border border-[#ddd6cb] bg-[#102820] p-5 text-white shadow-[0_12px_40px_rgba(16,40,32,0.12)]">
                    <p className="text-sm font-semibold text-[#f2c14e]">
                      Next action
                    </p>
                    <h3 className="mt-2 text-xl font-semibold">
                      Review Omar&apos;s system design rubric before 11:00.
                    </h3>
                    <p className="mt-3 text-sm leading-6 text-white/75">
                      Add evaluation criteria for scalability, data modeling, and
                      API boundaries before the interview starts.
                    </p>
                  </section>
                </aside>
              </>
            ) : (
              <>
                <section className="space-y-6">
                  {activeSection === "My interviews" ? (
                    <MyInterviewsPanel
                      receivedInvites={receivedInvites}
                      interviews={futureInterviews}
                    />
                  ) : (
                    <>
                      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                        {signals.map((signal) => (
                          <div
                            key={signal.label}
                            className="rounded-lg border border-[#ddd6cb] bg-white p-5 shadow-[0_12px_40px_rgba(16,40,32,0.08)]"
                          >
                            <p className="text-sm font-medium text-[#4b4b4b]">
                              {signal.label}
                            </p>
                            <p className="mt-3 text-3xl font-semibold">
                              {signal.value}
                            </p>
                            <p className="mt-2 text-sm text-[#6b6258]">
                              {signal.detail}
                            </p>
                          </div>
                        ))}
                      </div>

                      <div className="rounded-lg border border-[#ddd6cb] bg-white shadow-[0_12px_40px_rgba(16,40,32,0.08)]">
                        <div className="flex items-center justify-between border-b border-[#eee7dc] px-5 py-4">
                          <h3 className="text-lg font-semibold">Upcoming interviews</h3>
                          <span className="text-sm text-[#2d6a4f]">{futureInterviews.length} upcoming</span>
                        </div>
                        <div className="space-y-3 p-5">
                          {futureInterviews.map((interview) => (
                            <div
                              key={`${interview.date}-${interview.candidate}`}
                              className="rounded-md border border-[#eee7dc] bg-[#fbfaf8] p-4"
                            >
                              <div className="flex items-center justify-between gap-4">
                                <p className="font-semibold">{interview.candidate}</p>
                                <p className="text-sm font-semibold text-[#2d6a4f]">
                                  {interview.time}
                                </p>
                              </div>
                              <p className="mt-1 text-sm text-[#5c554c]">
                                {interview.date} • {interview.role}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>

                      <section className="rounded-lg border border-[#ddd6cb] bg-white p-5 shadow-[0_12px_40px_rgba(16,40,32,0.08)]">
                        <div className="flex items-center justify-between">
                          <h3 className="text-lg font-semibold">Practice topics</h3>
                          <a
                            href="#"
                            className="text-sm font-semibold text-[#2d6a4f] hover:text-[#102820]"
                          >
                            Browse all
                          </a>
                        </div>
                        <div className="mt-4 space-y-3">
                          {questionSets.map((set) => (
                            <button
                              key={set}
                              className="flex w-full items-center justify-between rounded-md border border-[#eee7dc] bg-[#fbfaf8] px-4 py-3 text-left text-sm font-medium transition hover:border-[#2d6a4f] hover:bg-white"
                            >
                              <span>{set}</span>
                              <span className="text-[#2d6a4f]">Start</span>
                            </button>
                          ))}
                        </div>
                      </section>

                      <div className="grid gap-6 2xl:grid-cols-2">
                        {feedback.map((item) => (
                          <article
                            key={item.candidate}
                            className="rounded-lg border border-[#ddd6cb] bg-white p-5 shadow-[0_12px_40px_rgba(16,40,32,0.08)]"
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div>
                                <p className="text-sm font-medium text-[#2d6a4f]">
                                  Suggested feedback
                                </p>
                                <h3 className="mt-1 text-lg font-semibold">
                                  {item.candidate}
                                </h3>
                              </div>
                              <span className="rounded-md bg-[#102820] px-3 py-2 text-sm font-semibold text-white">
                                {item.score}
                              </span>
                            </div>
                            <p className="mt-4 text-sm leading-6 text-[#4b4b4b]">
                              {item.note}
                            </p>
                          </article>
                        ))}
                      </div>
                    </>
                  )}
                </section>

                <aside className="space-y-6">
                  <section className="rounded-lg border border-[#ddd6cb] bg-white p-5 shadow-[0_12px_40px_rgba(16,40,32,0.08)]">
                    <h3 className="text-lg font-semibold">Your actions</h3>
                    <p className="mt-3 text-sm leading-6 text-[#5c554c]">
                      Complete the practice drills below, then review the feedback
                      to improve your next interview.
                    </p>
                    <button className="mt-4 w-full rounded-md bg-[#102820] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#1f4f3b]">
                      Review goals
                    </button>
                  </section>

                  <section className="rounded-lg border border-[#ddd6cb] bg-white p-5 shadow-[0_12px_40px_rgba(16,40,32,0.08)]">
                    <p className="text-sm font-semibold text-[#2d6a4f]">
                      Latest tips
                    </p>
                    <ul className="mt-4 space-y-3 text-sm text-[#5c554c]">
                      <li>Practice concise answers for system design questions.</li>
                      <li>Review expected APIs for integration tasks.</li>
                      <li>Highlight collaboration and ownership in your examples.</li>
                    </ul>
                  </section>

                  <section className="rounded-lg border border-[#ddd6cb] bg-[#102820] p-5 text-white shadow-[0_12px_40px_rgba(16,40,32,0.12)]">
                    <p className="text-sm font-semibold text-[#f2c14e]">
                      Next step
                    </p>
                    <h3 className="mt-2 text-xl font-semibold">
                      Prepare your answers for the next coding interview.
                    </h3>
                    <p className="mt-3 text-sm leading-6 text-white/75">
                      Use the practice topics above to sharpen your technical
                      reasoning and communication.
                    </p>
                  </section>
                </aside>
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
