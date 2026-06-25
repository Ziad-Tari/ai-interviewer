"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "../lib/api";

type CreateRoomResponse = {
  interviewer_url: string;
};

export default function StartInterviewRoomButton() {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");

  const startRoom = async () => {
    setIsCreating(true);
    setError("");

    try {
      const response = await apiFetch("/interviews/rooms", {
        method: "POST",
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || "Could not create room");
      }

      const room = (await response.json()) as CreateRoomResponse;
      router.push(room.interviewer_url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create room");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        onClick={startRoom}
        disabled={isCreating}
        className="rounded-md border border-[#cfc6b8] bg-[#fbfaf8] px-4 py-2 text-sm font-semibold text-[#3d3d3d] transition hover:border-[#2d6a4f] hover:text-[#102820] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isCreating ? "Creating room..." : "Open unique room"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
