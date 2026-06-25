"use client";

import { useState, useEffect } from "react";

type SkillDisplayProps = {
  roomId: string;
  onSkillsExtracted?: (skills: string[]) => void;
};

type ExtractedSkillsData = {
  room_id: string;
  skills: Array<{
    skill: string;
    source: string;
    confidence: number;
  }>;
  resume_skills: string[];
  jd_skills: string[];
  combined_skills: string[];
};

export default function SkillDisplay({
  roomId,
  onSkillsExtracted,
}: SkillDisplayProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [skillsData, setSkillsData] = useState<ExtractedSkillsData | null>(null);

  const extractSkills = async () => {
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch(
        `http://localhost:8000/interviews/rooms/${roomId}/extract-skills`,
        {
          method: "POST",
        }
      );

      if (response.ok) {
        const data = await response.json();
        setSkillsData(data);
        onSkillsExtracted?.(data.combined_skills);
      } else {
        const errorData = await response.json();
        setError(errorData.detail || "Failed to extract skills");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to extract skills"
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Auto-extract skills when component mounts (if documents are ready)
    // extractSkills();
  }, [roomId]);

  return (
    <div className="space-y-4 rounded-lg border border-[#ddd6cb] bg-white p-4 shadow-[0_12px_40px_rgba(16,40,32,0.08)]">
      <div>
        <h3 className="font-semibold text-[#171717]">Skill Analysis</h3>
        <p className="mt-1 text-sm text-[#5c554c]">
          Extract and analyze skills from resume and job description
        </p>
      </div>

      <button
        onClick={extractSkills}
        disabled={isLoading}
        className="w-full rounded-md bg-[#102820] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#1f4f3b] disabled:opacity-50"
      >
        {isLoading ? "Extracting Skills..." : "Extract Skills"}
      </button>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {skillsData && (
        <div className="space-y-4">
          {/* Combined Skills */}
          {skillsData.combined_skills.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-[#171717]">
                All Skills ({skillsData.combined_skills.length})
              </h4>
              <div className="mt-2 flex flex-wrap gap-2">
                {skillsData.combined_skills.map((skill) => {
                  const inResume = skillsData.resume_skills.includes(skill);
                  const inJD = skillsData.jd_skills.includes(skill);

                  return (
                    <div
                      key={skill}
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        inResume && inJD
                          ? "bg-green-100 text-green-800"
                          : inResume
                            ? "bg-blue-100 text-blue-800"
                            : "bg-orange-100 text-orange-800"
                      }`}
                      title={`In ${inResume ? "Resume" : ""}${inResume && inJD ? " & " : ""}${inJD ? "JD" : ""}`}
                    >
                      {skill}
                      {inResume && inJD && " ✓✓"}
                      {inResume && !inJD && " ✓"}
                      {!inResume && inJD && " ◆"}
                    </div>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-[#5c554c]">
                <span className="inline-block bg-green-100 text-green-800 rounded-full px-2 py-0.5 mr-2">
                  ✓✓ Both
                </span>
                <span className="inline-block bg-blue-100 text-blue-800 rounded-full px-2 py-0.5 mr-2">
                  ✓ Resume
                </span>
                <span className="inline-block bg-orange-100 text-orange-800 rounded-full px-2 py-0.5">
                  ◆ JD Only
                </span>
              </p>
            </div>
          )}

          {/* Resume Skills */}
          {skillsData.resume_skills.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-[#171717]">
                Resume Skills ({skillsData.resume_skills.length})
              </h4>
              <div className="mt-2 flex flex-wrap gap-2">
                {skillsData.resume_skills.map((skill) => (
                  <span
                    key={skill}
                    className="rounded-md bg-blue-50 px-2 py-1 text-xs text-blue-700"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* JD Skills */}
          {skillsData.jd_skills.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-[#171717]">
                Required Skills ({skillsData.jd_skills.length})
              </h4>
              <div className="mt-2 flex flex-wrap gap-2">
                {skillsData.jd_skills.map((skill) => (
                  <span
                    key={skill}
                    className="rounded-md bg-orange-50 px-2 py-1 text-xs text-orange-700"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
