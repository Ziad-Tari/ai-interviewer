"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type CreateRoomResponse = {
  interviewer_url: string;
};

export default function StartInterviewRoomButton() {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);

  const startRoom = async () => {
    setIsCreating(true);

    try {
      const response = await fetch("http://localhost:8000/interviews/rooms", {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Could not create room");
      }

      const room = (await response.json()) as CreateRoomResponse;
      router.push(room.interviewer_url);
    } catch {
      const roomId = crypto.randomUUID().replaceAll("-", "");
      router.push(`/interview/${roomId}?role=interviewer&name=Interviewer`);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <button
      onClick={startRoom}
      disabled={isCreating}
      className="rounded-md border border-[#cfc6b8] bg-[#fbfaf8] px-4 py-2 text-sm font-semibold text-[#3d3d3d] transition hover:border-[#2d6a4f] hover:text-[#102820] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {isCreating ? "Creating room..." : "Open unique room"}
    </button>
  );
}
