"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import DocumentUploader from "./DocumentUploader";
import SkillDisplay from "./SkillDisplay";
import InterviewQuestions from "./InterviewQuestions";

type ChatMessage = {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  sentAt: string;
};

type SocketMessage =
  | {
      type: "chat";
      id: string;
      senderId: string;
      senderName: string;
      text: string;
      sentAt: string;
    }
  | {
      type: "presence";
      message: string;
    }
  | {
      type: "room_state";
      participant_count: number;
    }
  | {
      type: "room_ready";
      message: string;
    }
  | {
      type: "ready";
      senderId?: string;
    }
  | {
      type: "ai_question";
      id: number;
      question: string;
      skill: string | null;
      difficulty: string;
      category: string;
      generated_at: string;
      generated_from_conversation?: boolean;
    }
  | {
      type: "ai_error";
      message: string;
    }
  | {
      type: "signal";
      senderId?: string;
      senderName?: string;
      senderRole?: AccountRole;
      signal:
        | { kind: "offer"; offer: RTCSessionDescriptionInit }
        | { kind: "answer"; answer: RTCSessionDescriptionInit }
        | { kind: "ice"; candidate: RTCIceCandidateInit };
    }
  | {
      type: "ai_generate_question";
      difficulty?: string;
    };

type InterviewRoomProps = {
  roomId: string;
};

type AccountRole = "candidate" | "interviewer";

type CurrentUser = {
  id: number;
  email: string;
  role: AccountRole;
  name: string;
};

export default function InterviewRoom({ roomId }: InterviewRoomProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const socketRef = useRef<WebSocket | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageText, setMessageText] = useState("");
  const [connectionStatus, setConnectionStatus] = useState("Connecting");
  const [callStatus, setCallStatus] = useState("Not in call");
  const [isAudioEnabled, setIsAudioEnabled] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(false);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [origin] = useState(() =>
    typeof window !== "undefined" ? window.location.origin : "",
  );
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteStatus, setInviteStatus] = useState("");
  const [extractedSkills, setExtractedSkills] = useState<string[]>([]);
  const [aiQuestions, setAiQuestions] = useState<{
    id: number;
    question: string;
    skill: string | null;
    difficulty: string;
    category: string;
    generated_at: string;
  }[]>([]);
  const candidateInviteUrl = `/interview/${roomId}`;
  const inviteUrl = origin ? `${origin}${candidateInviteUrl}` : candidateInviteUrl;
  const roleLabel =
    currentUser?.role === "candidate" ? "Candidate" : "Interviewer";
  const otherParticipantLabel =
    currentUser?.role === "candidate" ? "Interviewer" : "Candidate";

  const saveUpcomingInterview = async (recipientEmail?: string) => {
    try {
      const storageKey = "ai-interviewer-upcoming-interviews";
      const saved = localStorage.getItem(storageKey);
      const upcoming = saved ? (JSON.parse(saved) as Array<{
        roomId: string;
        candidateEmail?: string;
        inviteUrl: string;
        createdAt: string;
      }>) : [];

      const nextEntry = {
        roomId,
        candidateEmail: recipientEmail?.trim() || undefined,
        inviteUrl,
        createdAt: new Date().toISOString(),
      };

      const existingIndex = upcoming.findIndex((item) => item.roomId === roomId);
      if (existingIndex >= 0) {
        upcoming[existingIndex] = nextEntry;
      } else {
        upcoming.unshift(nextEntry);
      }

      localStorage.setItem(storageKey, JSON.stringify(upcoming.slice(0, 10)));

      // If sending to a specific email, save to backend so candidate can see it
      if (recipientEmail?.trim()) {
        const token = localStorage.getItem("access_token");
        if (token) {
          try {
            await fetch("http://localhost:8000/invites", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                room_id: roomId,
                recipient_email: recipientEmail.trim(),
                invite_url: inviteUrl,
              }),
            });
          } catch {
            // silently fail if backend save doesn't work
          }
        }
      }
    } catch {
      // ignore storage failures
    }
  };

  useEffect(() => {
    let isActive = true;

    const loadCurrentUser = async () => {
      const token = localStorage.getItem("access_token");
      if (!token) {
        const query = searchParams.toString();
        const nextPath = query ? `${pathname}?${query}` : pathname;
        router.replace(`/signin?next=${encodeURIComponent(nextPath)}`);
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

        const user = (await response.json()) as CurrentUser;
        if (isActive) {
          setCurrentUser(user);
        }
      } catch {
        const query = searchParams.toString();
        const nextPath = query ? `${pathname}?${query}` : pathname;
        router.replace(`/signin?next=${encodeURIComponent(nextPath)}`);
      } finally {
        if (isActive) {
          setIsCheckingAuth(false);
        }
      }
    };

    loadCurrentUser();

    return () => {
      isActive = false;
    };
  }, [pathname, router, searchParams]);

  const waitForSocketConnection = useCallback(() => {
    return new Promise<void>((resolve, reject) => {
      const socket = socketRef.current;

      if (!socket) {
        reject(new Error("Room connection is not ready yet."));
        return;
      }

      if (socket.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }

      if (
        socket.readyState === WebSocket.CLOSING ||
        socket.readyState === WebSocket.CLOSED
      ) {
        reject(new Error("Room connection is closed."));
        return;
      }

      socket.addEventListener("open", () => resolve(), { once: true });
      socket.addEventListener(
        "error",
        () => reject(new Error("Room connection failed.")),
        { once: true },
      );
    });
  }, []);

  const sendSocketMessage = useCallback((payload: SocketMessage) => {
    const socket = socketRef.current;

    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(payload));
      return true;
    }

    return false;
  }, []);

  const addLocalTracksToPeer = useCallback((peer: RTCPeerConnection) => {
    localStreamRef.current?.getTracks().forEach((track) => {
      const alreadyAdded = peer
        .getSenders()
        .some((sender) => sender.track?.id === track.id);

      if (!alreadyAdded && localStreamRef.current) {
        peer.addTrack(track, localStreamRef.current);
      }
    });
  }, []);

  const createPeerConnection = useCallback(() => {
    if (peerRef.current) {
      return peerRef.current;
    }

    const peer = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    peer.onicecandidate = (event) => {
      if (event.candidate) {
        sendSocketMessage({
          type: "signal",
          signal: { kind: "ice", candidate: event.candidate.toJSON() },
        });
      }
    };

    peer.ontrack = (event) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
        remoteVideoRef.current.play().catch(() => {
          setCallStatus("Remote video ready");
        });
      }
    };

    peer.onconnectionstatechange = () => {
      if (peer.connectionState === "connected") {
        setCallStatus("Call connected");
      }

      if (
        peer.connectionState === "failed" ||
        peer.connectionState === "disconnected"
      ) {
        setCallStatus(`Call ${peer.connectionState}`);
      }
    };

    addLocalTracksToPeer(peer);

    peerRef.current = peer;
    return peer;
  }, [addLocalTracksToPeer, sendSocketMessage]);

  const createAndSendOffer = useCallback(async () => {
    await waitForSocketConnection();

    const peer = createPeerConnection();
    addLocalTracksToPeer(peer);

    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);

    sendSocketMessage({
      type: "signal",
      signal: { kind: "offer", offer },
    });
  }, [
    addLocalTracksToPeer,
    createPeerConnection,
    sendSocketMessage,
    waitForSocketConnection,
  ]);

  const handleSignal = useCallback(async (data: Extract<SocketMessage, { type: "signal" }>) => {
    if (data.senderId === String(currentUser?.id)) {
      return;
    }

    const peer = createPeerConnection();

    if (data.signal.kind === "offer") {
      await peer.setRemoteDescription(data.signal.offer);
      for (const candidate of pendingIceCandidatesRef.current.splice(0)) {
        await peer.addIceCandidate(candidate);
      }
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      setCallStatus("Incoming call connected");

      sendSocketMessage({
        type: "signal",
        signal: { kind: "answer", answer },
      });
    }

    if (data.signal.kind === "answer") {
      await peer.setRemoteDescription(data.signal.answer);
      for (const candidate of pendingIceCandidatesRef.current.splice(0)) {
        await peer.addIceCandidate(candidate);
      }
      setCallStatus("Call connected");
    }

    if (data.signal.kind === "ice") {
      if (!peer.remoteDescription) {
        pendingIceCandidatesRef.current.push(data.signal.candidate);
        return;
      }

      await peer.addIceCandidate(data.signal.candidate);
    }
  }, [createPeerConnection, currentUser?.id, sendSocketMessage]);

  const endCall = useCallback(() => {
    peerRef.current?.close();
    peerRef.current = null;
    pendingIceCandidatesRef.current = [];
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }

    setIsAudioEnabled(false);
    setIsVideoEnabled(false);
    setCallStatus("Not in call");
  }, []);

  useEffect(() => {
    if (!currentUser) {
      return;
    }

    const token = localStorage.getItem("access_token");
    const socketUrl = token
      ? `ws://localhost:8000/ws/interviews/${roomId}?token=${encodeURIComponent(token)}`
      : `ws://localhost:8000/ws/interviews/${roomId}`;
    const socket = new WebSocket(socketUrl);
    socketRef.current = socket;

    socket.onopen = () => {
      setConnectionStatus("Connected");
      sendSocketMessage({
        type: "ready",
      });
    };
    socket.onclose = () => setConnectionStatus("Disconnected");
    socket.onerror = () => setConnectionStatus("Connection issue");
    socket.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data) as SocketMessage;

        if (data.type === "chat") {
          setMessages((current) => [...current, data]);
        }

        if (data.type === "presence") {
          setMessages((current) => [
            ...current,
            {
              id: crypto.randomUUID(),
              senderId: "system",
              senderName: "Room",
              text: data.message,
              sentAt: new Date().toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              }),
            },
          ]);
        }

        if (data.type === "ready" && data.senderId !== String(currentUser.id)) {
          if (localStreamRef.current) {
            await createAndSendOffer();
          }
        }

        if (data.type === "room_ready") {
          setMessages((current) => [
            ...current,
            {
              id: crypto.randomUUID(),
              senderId: "system",
              senderName: "Room",
              text: data.message,
              sentAt: new Date().toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              }),
            },
          ]);

          if (localStreamRef.current) {
            await createAndSendOffer();
          }
        }

        if (data.type === "room_state") {
          setConnectionStatus(
            data.participant_count > 1
              ? "Connected with participant"
              : "Waiting for participant",
          );
        }

        if (data.type === "ai_question") {
          // append live AI-generated question to local state
          setAiQuestions((current) => [
            ...current,
            {
              id: data.id,
              question: data.question,
              skill: data.skill,
              difficulty: data.difficulty,
              category: data.category,
              generated_at: data.generated_at,
            },
          ]);
        }

        if (data.type === "signal") {
          await handleSignal(data);
        }
      } catch (error) {
        setCallStatus(
          error instanceof Error ? `Call error: ${error.message}` : "Call error",
        );
      }
    };

    return () => {
      socket.close();
      endCall();
    };
  }, [createAndSendOffer, currentUser, endCall, handleSignal, roomId, sendSocketMessage]);

  const sendMessage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = messageText.trim();

    if (!text || !currentUser) {
      return;
    }

    sendSocketMessage({
      type: "chat",
      id: crypto.randomUUID(),
      senderId: String(currentUser.id),
      senderName: currentUser.name,
      text,
      sentAt: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    });
    setMessageText("");
  };

  const copyInviteToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      await saveUpcomingInterview();
      setInviteStatus("Copied invite link to clipboard.");
    } catch {
      setInviteStatus("Unable to copy invite link. Please copy manually.");
    }
  };

  const sendInviteEmail = async (recipientEmail: string) => {
    if (!recipientEmail.trim()) {
      setInviteStatus("Please enter a valid email address.");
      return;
    }

    try {
      const mailtoLink = `mailto:${encodeURIComponent(recipientEmail)}?subject=${encodeURIComponent(
        "Interview invitation",
      )}&body=${encodeURIComponent(`Join the interview room: ${inviteUrl}`)}`;
      window.location.href = mailtoLink;
      await saveUpcomingInterview(recipientEmail);
      setInviteStatus("Email draft opened in your mail app.");
    } catch {
      setInviteStatus("Unable to open email client.");
    }
  };

  const startCall = async (withVideo: boolean) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: withVideo,
      });

      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      setIsAudioEnabled(true);
      setIsVideoEnabled(withVideo);
      setCallStatus(withVideo ? "Video call started" : "Voice call started");

      await createAndSendOffer();
    } catch (error) {
      setCallStatus(
        error instanceof Error ? `Call error: ${error.message}` : "Call error",
      );
    }
  };

  if (isCheckingAuth || !currentUser) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f3ee] px-6 text-[#171717]">
        <div className="rounded-lg border border-[#ddd6cb] bg-white p-6 text-center shadow-[0_18px_60px_rgba(16,40,32,0.12)]">
          <p className="text-sm font-medium text-[#2d6a4f]">
            Checking your session
          </p>
          <h1 className="mt-2 text-xl font-semibold">
            Redirecting to sign in...
          </h1>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f6f3ee] text-[#171717]">
      <header className="border-b border-[#ddd6cb] bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-[#2d6a4f]">
              Live interview room
            </p>
            <h1 className="text-2xl font-semibold">Room {roomId}</h1>
            {currentUser.role === "interviewer" && candidateInviteUrl && (
              <div className="mt-2 max-w-3xl space-y-3 text-sm text-[#5c554c]">
                <p className="break-all">Candidate invite link:</p>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <code className="break-all rounded-md border border-[#ddd6cb] bg-[#f6f3ee] px-3 py-2 text-sm text-[#1f4f3b]">
                    {inviteUrl}
                  </code>
                  <button
                    type="button"
                    onClick={copyInviteToClipboard}
                    className="rounded-md border border-[#cfc6b8] bg-[#fbfaf8] px-4 py-2 text-sm font-semibold text-[#3d3d3d] transition hover:border-[#2d6a4f] hover:text-[#102820]"
                  >
                    Copy link
                  </button>
                </div>
                <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                  <input
                    id="inviteEmail"
                    type="email"
                    placeholder="Candidate email"
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                    className="h-11 rounded-md border border-[#cfc6b8] bg-[#fbfaf8] px-4 text-sm text-[#171717] outline-none transition focus:border-[#2d6a4f] focus:bg-white focus:ring-4 focus:ring-[#2d6a4f]/15"
                  />
                  <button
                    type="button"
                    onClick={() => sendInviteEmail(inviteEmail)}
                    className="h-11 rounded-md border border-[#cfc6b8] bg-[#fbfaf8] px-4 py-2 text-sm font-semibold text-[#3d3d3d] transition hover:border-[#2d6a4f] hover:text-[#102820]"
                  >
                    Email invite
                  </button>
                </div>
                {inviteStatus && (
                  <p className="text-sm text-[#2d6a4f]">{inviteStatus}</p>
                )}
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[#eaf3ed] px-3 py-1 text-sm font-semibold text-[#1f4f3b]">
              {connectionStatus}
            </span>
            <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-[#5c554c]">
              {currentUser.name} - {roleLabel}
            </span>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 px-6 py-6 lg:grid-cols-[1fr_380px]">
        <section className="space-y-6">
          {currentUser.role === "interviewer" && (
            <>
              <DocumentUploader roomId={roomId} />
              <SkillDisplay
                roomId={roomId}
                onSkillsExtracted={setExtractedSkills}
              />
              <InterviewQuestions
                roomId={roomId}
                skillCount={extractedSkills.length}
                sendSocketMessage={sendSocketMessage}
                liveQuestions={aiQuestions}
              />
            </>
          )}
          <div className="grid gap-4 xl:grid-cols-2">
            <div className="overflow-hidden rounded-lg border border-[#ddd6cb] bg-[#102820] shadow-[0_12px_40px_rgba(16,40,32,0.08)]">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 text-white">
                <h2 className="font-semibold">{otherParticipantLabel}</h2>
                <span className="text-sm text-white/70">{callStatus}</span>
              </div>
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="aspect-video w-full bg-[#0b1f19] object-cover"
              />
            </div>

            <div className="overflow-hidden rounded-lg border border-[#ddd6cb] bg-white shadow-[0_12px_40px_rgba(16,40,32,0.08)]">
              <div className="flex items-center justify-between border-b border-[#eee7dc] px-4 py-3">
                <h2 className="font-semibold">You - {roleLabel}</h2>
                <span className="text-sm text-[#5c554c]">
                  {isVideoEnabled ? "Camera on" : "Camera off"}
                </span>
              </div>
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className="aspect-video w-full bg-[#fbfaf8] object-cover"
              />
            </div>
          </div>

          <div className="rounded-lg border border-[#ddd6cb] bg-white p-4 shadow-[0_12px_40px_rgba(16,40,32,0.08)]">
            <div className="grid gap-3 sm:grid-cols-3">
              <button
                onClick={() => startCall(false)}
                className="rounded-md bg-[#102820] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#1f4f3b]"
              >
                Start voice call
              </button>
              <button
                onClick={() => startCall(true)}
                className="rounded-md bg-[#2d6a4f] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#1f4f3b]"
              >
                Start video call
              </button>
              <button
                onClick={endCall}
                className="rounded-md border border-[#cfc6b8] bg-[#fbfaf8] px-4 py-3 text-sm font-semibold text-[#3d3d3d] transition hover:border-[#2d6a4f] hover:text-[#102820]"
              >
                End call
              </button>
            </div>
            <p className="mt-3 text-sm text-[#5c554c]">
              Audio: {isAudioEnabled ? "on" : "off"} - Video:{" "}
              {isVideoEnabled ? "on" : "off"}
            </p>
          </div>
        </section>

        <aside className="flex min-h-155 flex-col rounded-lg border border-[#ddd6cb] bg-white shadow-[0_12px_40px_rgba(16,40,32,0.08)]">
          <div className="border-b border-[#eee7dc] px-5 py-4">
            <h2 className="text-lg font-semibold">Chat</h2>
            <p className="mt-1 text-sm text-[#5c554c]">
              Candidate and interviewer messages appear here in real time.
            </p>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
            {messages.map((message) => {
              const isMine = message.senderId === String(currentUser.id);

              return (
                <div
                  key={message.id}
                  className={`rounded-lg px-4 py-3 ${
                    isMine
                      ? "ml-8 bg-[#102820] text-white"
                      : "mr-8 bg-[#fbfaf8] text-[#171717]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-4 text-xs font-semibold opacity-75">
                    <span>{message.senderName}</span>
                    <span>{message.sentAt}</span>
                  </div>
                  <p className="mt-2 text-sm leading-6">{message.text}</p>
                </div>
              );
            })}
          </div>

          <form
            onSubmit={sendMessage}
            className="border-t border-[#eee7dc] p-4"
          >
            <label className="sr-only" htmlFor="message">
              Message
            </label>
            <textarea
              id="message"
              value={messageText}
              onChange={(event) => setMessageText(event.target.value)}
              placeholder="Type a message..."
              rows={3}
              className="w-full resize-none rounded-md border border-[#cfc6b8] bg-[#fbfaf8] px-4 py-3 text-sm outline-none transition focus:border-[#2d6a4f] focus:bg-white focus:ring-4 focus:ring-[#2d6a4f]/15"
            />
            <button className="mt-3 w-full rounded-md bg-[#102820] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#1f4f3b]">
              Send message
            </button>
          </form>
        </aside>
      </div>
    </main>
  );
}
