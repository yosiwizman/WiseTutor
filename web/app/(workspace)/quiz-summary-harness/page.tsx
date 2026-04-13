"use client";
import QuizViewer from "@/components/quiz/QuizViewer";
import type { QuizQuestion } from "@/lib/quiz-types";

const HARNESS_QUESTIONS: QuizQuestion[] = [
  {
    question_id: "q1",
    question: "What is 2 + 2?",
    question_type: "choice",
    options: { A: "3", B: "4", C: "5", D: "6" },
    correct_answer: "B",
    difficulty: "easy",
    explanation: "",
  },
  {
    question_id: "q2",
    question: "What is the capital of France?",
    question_type: "choice",
    options: { A: "London", B: "Berlin", C: "Paris", D: "Madrid" },
    correct_answer: "C",
    difficulty: "easy",
    explanation: "",
  },
  {
    question_id: "q3",
    question: "What is 5 x 6?",
    question_type: "choice",
    options: { A: "25", B: "30", C: "35", D: "40" },
    correct_answer: "B",
    difficulty: "easy",
    explanation: "",
  },
];

export default function QuizSummaryHarnessPage() {
  return (
    <div className="p-6 max-w-xl" data-testid="quiz-harness-ready">
      <h1 className="mb-3 text-sm font-medium">Quiz summary harness</h1>
      <QuizViewer questions={HARNESS_QUESTIONS} sessionId={null} />
    </div>
  );
}
