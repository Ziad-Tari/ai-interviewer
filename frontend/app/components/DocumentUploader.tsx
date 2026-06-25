"use client";

import { useState, useRef } from "react";
import { authHeaders, apiUrl } from "../lib/api";

type DocumentUploaderProps = {
  roomId: string;
  onUploadSuccess?: () => void;
};

type DocumentStatus = {
  hasResume: boolean;
  hasJD: boolean;
  resumeFilename?: string;
  jdFilename?: string;
};

export default function DocumentUploader({
  roomId,
  onUploadSuccess,
}: DocumentUploaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const [documentStatus, setDocumentStatus] = useState<DocumentStatus>({
    hasResume: false,
    hasJD: false,
  });
  const resumeInputRef = useRef<HTMLInputElement>(null);
  const jdInputRef = useRef<HTMLInputElement>(null);

  const fetchDocumentStatus = async () => {
    try {
      const response = await fetch(apiUrl(`/interviews/rooms/${roomId}/documents`), {
        headers: authHeaders(),
      });
      if (response.ok) {
        const data = await response.json();
        setDocumentStatus({
          hasResume: data.has_resume,
          hasJD: data.has_jd,
          resumeFilename: data.resume_filename,
          jdFilename: data.jd_filename,
        });
      }
    } catch (error) {
      console.error("Failed to fetch document status:", error);
    }
  };

  const uploadFile = async (file: File, documentType: "resume" | "jd") => {
    if (!file) {
      setUploadStatus("Please select a file");
      return;
    }

    setIsUploading(true);
    setUploadStatus(`Uploading ${documentType.toUpperCase()}...`);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(
        apiUrl(`/interviews/rooms/${roomId}/upload/${documentType}`),
        {
          method: "POST",
          headers: authHeaders(),
          body: formData,
        },
      );

      if (response.ok) {
        setUploadStatus(
          `${documentType.toUpperCase()} uploaded successfully!`
        );
        setTimeout(() => setUploadStatus(""), 3000);
        await fetchDocumentStatus();
        onUploadSuccess?.();
      } else {
        const error = await response.json();
        setUploadStatus(`Error uploading ${documentType}: ${error.detail}`);
      }
    } catch (error) {
      setUploadStatus(
        `Error uploading ${documentType}: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    } finally {
      setIsUploading(false);
    }
  };

  const handleResumeSelect = async () => {
    const file = resumeInputRef.current?.files?.[0];
    if (file) {
      await uploadFile(file, "resume");
      if (resumeInputRef.current) {
        resumeInputRef.current.value = "";
      }
    }
  };

  const handleJDSelect = async () => {
    const file = jdInputRef.current?.files?.[0];
    if (file) {
      await uploadFile(file, "jd");
      if (jdInputRef.current) {
        jdInputRef.current.value = "";
      }
    }
  };

  return (
    <div className="space-y-4 rounded-lg border border-[#ddd6cb] bg-white p-4 shadow-[0_12px_40px_rgba(16,40,32,0.08)]">
      <div>
        <h3 className="font-semibold text-[#171717]">Interview Documents</h3>
        <p className="mt-1 text-sm text-[#5c554c]">
          Upload Resume and Job Description for AI interviewer context
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {/* Resume Upload */}
        <div className="space-y-2">
          <div>
            <label
              htmlFor="resume-input"
              className="block text-sm font-medium text-[#171717]"
            >
              Resume
            </label>
            {documentStatus.hasResume && (
              <p className="mt-1 text-xs text-green-600">
                ✓ {documentStatus.resumeFilename || "Resume uploaded"}
              </p>
            )}
          </div>
          <input
            ref={resumeInputRef}
            id="resume-input"
            type="file"
            accept=".pdf,.doc,.docx,.txt"
            onChange={handleResumeSelect}
            disabled={isUploading}
            className="hidden"
          />
          <button
            onClick={() => resumeInputRef.current?.click()}
            disabled={isUploading}
            className="w-full rounded-md border border-[#cfc6b8] bg-[#fbfaf8] px-3 py-2 text-sm font-semibold text-[#3d3d3d] transition hover:border-[#2d6a4f] hover:text-[#102820] disabled:opacity-50"
          >
            {isUploading && resumeInputRef.current?.files?.length === 0
              ? "Uploading..."
              : "Choose Resume"}
          </button>
        </div>

        {/* JD Upload */}
        <div className="space-y-2">
          <div>
            <label
              htmlFor="jd-input"
              className="block text-sm font-medium text-[#171717]"
            >
              Job Description
            </label>
            {documentStatus.hasJD && (
              <p className="mt-1 text-xs text-green-600">
                ✓ {documentStatus.jdFilename || "JD uploaded"}
              </p>
            )}
          </div>
          <input
            ref={jdInputRef}
            id="jd-input"
            type="file"
            accept=".pdf,.doc,.docx,.txt"
            onChange={handleJDSelect}
            disabled={isUploading}
            className="hidden"
          />
          <button
            onClick={() => jdInputRef.current?.click()}
            disabled={isUploading}
            className="w-full rounded-md border border-[#cfc6b8] bg-[#fbfaf8] px-3 py-2 text-sm font-semibold text-[#3d3d3d] transition hover:border-[#2d6a4f] hover:text-[#102820] disabled:opacity-50"
          >
            {isUploading && jdInputRef.current?.files?.length === 0
              ? "Uploading..."
              : "Choose JD"}
          </button>
        </div>
      </div>

      {uploadStatus && (
        <p
          className={`text-sm ${uploadStatus.includes("Error") ? "text-red-600" : "text-green-600"}`}
        >
          {uploadStatus}
        </p>
      )}
    </div>
  );
}
