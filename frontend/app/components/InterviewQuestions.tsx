"use client";

import { useState } from "react";

type LiveQuestion = {
  id: number;
  question: string;
  skill: string | null;
  difficulty: string;
  category: string;
  generated_at: string;
  generated_from_conversation?: boolean;
};

type InterviewQuestionsProps = {
  roomId: string;
  skillCount?: number;
  sendSocketMessage?: (payload: { type: "ai_generate_question"; difficulty?: string }) => boolean;
  liveQuestions?: LiveQuestion[];
};

type Question = {
  id: number | null;
  question: string;
  skill: string | null;
  difficulty: string;
  category: string;
  answer?: string | null;
  score?: number | null;
  feedback?: string | null;
};

type GeneratedQuestionsData = {
  room_id: string;
  questions: Question[];
  skill_count: number;
  generated_at: string;
};

export default function InterviewQuestions({
  roomId,
  skillCount = 0,
  sendSocketMessage,
  liveQuestions,
}: InterviewQuestionsProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [questionsData, setQuestionsData] =
    useState<GeneratedQuestionsData | null>(null);
  const [numQuestions, setNumQuestions] = useState(5);
  const [difficulty, setDifficulty] = useState("intermediate");
  const [expandedQuestion, setExpandedQuestion] = useState<number | null>(null);

  const generateQuestions = async () => {
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch(
        `http://localhost:8000/interviews/rooms/${roomId}/generate-questions?num_questions=${numQuestions}&difficulty=${difficulty}`,
        {
          method: "POST",
        }
      );

      if (response.ok) {
        const data = await response.json();
        setQuestionsData(data);
      } else {
        const errorData = await response.json();
        setError(errorData.detail || "Failed to generate questions");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to generate questions"
      );
    } finally {
      setIsLoading(false);
    }
  };

  const submitAnswer = async (questionId: number | null, answer: string) => {
    if (!questionId) return;

    try {
      const response = await fetch(
        `http://localhost:8000/interviews/rooms/${roomId}/questions/${questionId}/answer`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ answer }),
        }
      );

      if (response.ok) {
        // Update local state
        if (questionsData) {
          const updatedQuestions = questionsData.questions.map((q) =>
            q.id === questionId ? { ...q, answer } : q
          );
          setQuestionsData({
            ...questionsData,
            questions: updatedQuestions,
          });
        }
      } else {
        setError("Failed to save answer");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save answer"
      );
    }
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty.toLowerCase()) {
      case "easy":
        return "bg-green-100 text-green-800";
      case "intermediate":
        return "bg-yellow-100 text-yellow-800";
      case "advanced":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category.toLowerCase()) {
      case "technical":
        return "bg-blue-50 text-blue-700";
      case "behavioral":
        return "bg-purple-50 text-purple-700";
      case "situational":
        return "bg-indigo-50 text-indigo-700";
      default:
        return "bg-gray-50 text-gray-700";
    }
  };

  return (
    <div className="space-y-4 rounded-lg border border-[#ddd6cb] bg-white p-4 shadow-[0_12px_40px_rgba(16,40,32,0.08)]">
      <div>
        <h3 className="font-semibold text-[#171717]">
          Interview Questions
        </h3>
        <p className="mt-1 text-sm text-[#5c554c]">
          Generate personalized questions based on extracted skills
        </p>
      </div>

      {!questionsData && (
        <div className="space-y-3">
          {/* Live generation via WebSocket (if available) */}
          {sendSocketMessage && (
            <div className="space-y-2">
              <button
                onClick={() =>
                  sendSocketMessage({ type: "ai_generate_question", difficulty })
                }
                className="w-full rounded-md bg-[#2d6a4f] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#1f4f3b] disabled:opacity-50"
              >
                Generate Live Question
              </button>

              {liveQuestions && liveQuestions.length > 0 && (
                <div className="mt-2 space-y-2">
                  <h4 className="text-sm font-semibold text-[#171717]">Live Questions</h4>
                  <div className="max-h-60 overflow-y-auto space-y-2">
                    {liveQuestions.map((q, idx) => (
                      <div key={q.id || idx} className="rounded-md bg-[#fbfaf8] p-2 border">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold">{q.question}</p>
                          {q.generated_from_conversation && (
                            <span className="rounded-full bg-[#d1f2d8] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-[#1f4f3b]">
                              From conversation
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex gap-2">
                          {q.skill && <span className="text-xs bg-blue-50 px-2 rounded">{q.skill}</span>}
                          <span className="text-xs bg-yellow-50 px-2 rounded">{q.difficulty}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor="numQuestions"
                className="block text-sm font-medium text-[#171717]"
              >
                Number of Questions
              </label>
              <input
                id="numQuestions"
                type="number"
                min="1"
                max="20"
                value={numQuestions}
                onChange={(e) => setNumQuestions(parseInt(e.target.value))}
                className="mt-1 w-full rounded-md border border-[#cfc6b8] bg-[#fbfaf8] px-3 py-2 text-sm outline-none transition focus:border-[#2d6a4f] focus:bg-white focus:ring-4 focus:ring-[#2d6a4f]/15"
              />
            </div>

            <div>
              <label
                htmlFor="difficulty"
                className="block text-sm font-medium text-[#171717]"
              >
                Difficulty Level
              </label>
              <select
                id="difficulty"
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
                className="mt-1 w-full rounded-md border border-[#cfc6b8] bg-[#fbfaf8] px-3 py-2 text-sm outline-none transition focus:border-[#2d6a4f] focus:bg-white focus:ring-4 focus:ring-[#2d6a4f]/15"
              >
                <option value="easy">Easy</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
            </div>
          </div>

          <button
            onClick={generateQuestions}
            disabled={isLoading || skillCount === 0}
            className="w-full rounded-md bg-[#2d6a4f] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#1f4f3b] disabled:opacity-50"
          >
            {isLoading ? "Generating..." : "Generate Questions"}
          </button>

          {skillCount === 0 && (
            <p className="text-sm text-orange-600">
              Extract skills first before generating questions
            </p>
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {questionsData && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-[#5c554c]">
              {questionsData.questions.length} questions generated
            </p>
            <button
              onClick={() => setQuestionsData(null)}
              className="text-sm text-[#2d6a4f] hover:underline"
            >
              Generate New
            </button>
          </div>

          <div className="space-y-2 max-h-96 overflow-y-auto">
            {questionsData.questions.map((question, index) => (
              <div
                key={question.id || index}
                className="rounded-lg border border-[#eee7dc] p-3 bg-[#fbfaf8]"
              >
                <button
                  onClick={() =>
                    setExpandedQuestion(
                      expandedQuestion === index ? null : index
                    )
                  }
                  className="w-full text-left"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-[#171717]">
                        Q{index + 1}: {question.question}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {question.skill && (
                          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-800">
                            {question.skill}
                          </span>
                        )}
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${getDifficultyColor(question.difficulty)}`}>
                          {question.difficulty}
                        </span>
                        <span className={`rounded-full px-2 py-0.5 text-xs ${getCategoryColor(question.category)}`}>
                          {question.category}
                        </span>
                      </div>
                    </div>
                    <span className="text-lg text-[#5c554c]">
                      {expandedQuestion === index ? "−" : "+"}
                    </span>
                  </div>
                </button>

                {expandedQuestion === index && (
                  <div className="mt-3 space-y-2 border-t border-[#eee7dc] pt-3">
                    {question.answer ? (
                      <div>
                        <p className="text-xs font-semibold text-[#171717]">
                          Your Answer:
                        </p>
                        <p className="mt-1 text-sm text-[#3d3d3d]">
                          {question.answer}
                        </p>
                        {question.score && (
                          <p className="mt-1 text-sm font-semibold text-green-600">
                            Score: {question.score}/10
                          </p>
                        )}
                      </div>
                    ) : (
                      <textarea
                        placeholder="Type your answer here..."
                        defaultValue={question.answer || ""}
                        onBlur={(e) =>
                          submitAnswer(question.id, e.target.value)
                        }
                        className="w-full rounded-md border border-[#cfc6b8] bg-white px-3 py-2 text-sm outline-none transition focus:border-[#2d6a4f] focus:ring-4 focus:ring-[#2d6a4f]/15"
                        rows={3}
                      />
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
