"use client";

type ReceivedInvite = {
  roomId: string;
  candidateEmail?: string;
  inviteUrl: string;
  createdAt: string;
};

type InterviewSummary = {
  date: string;
  time: string;
  candidate: string;
  role: string;
};

type MyInterviewsPanelProps = {
  receivedInvites: ReceivedInvite[];
  interviews: InterviewSummary[];
};

export default function MyInterviewsPanel({
  receivedInvites,
  interviews,
}: MyInterviewsPanelProps) {
  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-[#ddd6cb] bg-white p-5 shadow-[0_12px_40px_rgba(16,40,32,0.08)]">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">My interviews</h3>
            <p className="mt-1 text-sm text-[#5c554c]">
              Your upcoming interview schedule and invitations.
            </p>
          </div>
          <span className="rounded-full bg-[#eaf3ed] px-3 py-1 text-sm font-semibold text-[#1f4f3b]">
            {interviews.length} upcoming
          </span>
        </div>

        <div className="mt-5 space-y-3">
          {interviews.map((interview) => (
            <div
              key={`${interview.date}-${interview.candidate}`}
              className="rounded-md border border-[#eee7dc] bg-[#fbfaf8] p-4"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold">{interview.candidate}</p>
                  <p className="text-sm text-[#5c554c]">
                    {interview.date} · {interview.time}
                  </p>
                </div>
                <span className="rounded-md bg-[#102820] px-3 py-1 text-sm font-semibold text-white">
                  {interview.role}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-[#ddd6cb] bg-white p-5 shadow-[0_12px_40px_rgba(16,40,32,0.08)]">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">Received invitations</h3>
            <p className="mt-1 text-sm text-[#5c554c]">
              Invitations from interviewers that were saved in your browser.
            </p>
          </div>
          <span className="rounded-full bg-[#eaf3ed] px-3 py-1 text-sm font-semibold text-[#1f4f3b]">
            {receivedInvites.length}
          </span>
        </div>

        {receivedInvites.length === 0 ? (
          <div className="mt-5 rounded-md border border-dashed border-[#cfc6b8] bg-[#fbfaf8] p-6 text-center text-sm text-[#5c554c]">
            No invitation links have been received yet.
          </div>
        ) : (
          <div className="mt-5 space-y-3">
            {receivedInvites.map((invite) => (
              <div
                key={invite.roomId}
                className="rounded-md border border-[#eee7dc] bg-[#fbfaf8] p-4"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold">Room ID: {invite.roomId}</p>
                    {invite.candidateEmail && (
                      <p className="text-sm text-[#5c554c]">Candidate: {invite.candidateEmail}</p>
                    )}
                    <p className="text-sm text-[#5c554c]">
                      Received {new Date(invite.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <a
                    href={invite.inviteUrl}
                    className="text-sm font-semibold text-[#2d6a4f] hover:text-[#102820]"
                  >
                    Open invite
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
