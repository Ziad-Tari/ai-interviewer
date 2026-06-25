import os
import json
from typing import Optional
import re

# For now, using a simple rule-based approach. Can be replaced with OpenAI API
class AIService:
    """
    AI Service for skill extraction and interview generation.
    Can be extended to use OpenAI, Claude, or other LLM providers.
    """
    
    COMMON_SKILLS = {
        "python", "javascript", "java", "csharp", "cpp", "rust", "golang",
        "typescript", "kotlin", "swift", "php", "ruby", "scala",
        "react", "vue", "angular", "nextjs", "svelte", "ember",
        "django", "flask", "fastapi", "spring", "rails", "laravel",
        "sql", "mongodb", "postgresql", "mysql", "redis", "elasticsearch",
        "docker", "kubernetes", "aws", "azure", "gcp", "terraform",
        "git", "ci/cd", "devops", "agile", "scrum", "jira",
        "machine learning", "ai", "nlp", "computer vision", "tensorflow", "pytorch",
        "rest", "graphql", "microservices", "api", "websocket",
        "html", "css", "sass", "webpack", "vite", "babel",
        "testing", "junit", "pytest", "jest", "mocha",
        "leadership", "communication", "problem solving", "teamwork",
        "project management", "requirements gathering", "system design"
    }
    
    @staticmethod
    def extract_skills_from_text(text: str) -> list[str]:
        """
        Extract skills from resume or job description text.
        Uses pattern matching and keyword extraction.
        """
        if not text:
            return []
        
        text_lower = text.lower()
        extracted_skills = set()
        
        # Check for common skills
        for skill in AIService.COMMON_SKILLS:
            # Use word boundaries to match whole words
            pattern = r'\b' + re.escape(skill) + r'\b'
            if re.search(pattern, text_lower):
                extracted_skills.add(skill.title())
        
        return sorted(list(extracted_skills))
    
    @staticmethod
    def generate_interview_questions(
        skills: list[str],
        job_description: Optional[str] = None,
        role: Optional[str] = None,
        experience_level: str = "intermediate",
        num_questions: int = 5
    ) -> list[dict]:
        """
        Generate personalized interview questions based on extracted skills.
        Returns a list of question dictionaries with difficulty levels.
        """
        
        if not skills:
            return []
        
        questions = []
        
        # Technical questions for top skills
        tech_skills = [s for s in skills if s.lower() in [
            'python', 'javascript', 'java', 'csharp', 'cpp', 'rust', 'golang',
            'typescript', 'kotlin', 'swift', 'php', 'ruby', 'scala',
            'react', 'vue', 'angular', 'nextjs', 'svelte', 'ember',
            'django', 'flask', 'fastapi', 'spring', 'rails', 'laravel',
            'sql', 'mongodb', 'postgresql', 'mysql', 'redis',
            'docker', 'kubernetes', 'aws', 'azure', 'gcp',
            'machine learning', 'ai', 'tensorflow', 'pytorch'
        ]]
        
        # Generate technical questions
        for skill in tech_skills[:3]:  # Top 3 technical skills
            difficulty = "intermediate" if experience_level == "intermediate" else "advanced"
            questions.append({
                "question": f"Describe your experience with {skill}. What projects have you used it in?",
                "skill": skill,
                "difficulty": difficulty,
                "category": "technical"
            })
            
            if experience_level == "senior":
                questions.append({
                    "question": f"What are some advanced concepts or best practices in {skill} that you've implemented?",
                    "skill": skill,
                    "difficulty": "advanced",
                    "category": "technical"
                })
        
        # Behavioral questions based on non-technical skills
        behavioral_skills = [s for s in skills if s.lower() in [
            'leadership', 'communication', 'problem solving', 'teamwork',
            'project management', 'agile', 'scrum'
        ]]
        
        if behavioral_skills:
            questions.append({
                "question": f"Tell us about a time when you had to demonstrate {behavioral_skills[0].lower()} in a challenging situation.",
                "skill": behavioral_skills[0],
                "difficulty": "intermediate",
                "category": "behavioral"
            })
        
        # Role-specific questions if job description is provided
        if job_description:
            if 'architecture' in job_description.lower() or 'design' in job_description.lower():
                questions.append({
                    "question": "How would you approach designing a scalable system for the requirements mentioned in the job description?",
                    "skill": "System Design",
                    "difficulty": "advanced",
                    "category": "technical"
                })
            
            if 'lead' in job_description.lower() or 'mentor' in job_description.lower():
                questions.append({
                    "question": "How do you mentor junior developers and ensure code quality in your team?",
                    "skill": "Leadership",
                    "difficulty": "advanced",
                    "category": "behavioral"
                })
        
        # Ensure we have the requested number of questions
        while len(questions) < num_questions and questions:
            questions.append({
                "question": "What are your biggest strengths and how do they contribute to your role?",
                "skill": "General",
                "difficulty": "intermediate",
                "category": "behavioral"
            })
        
        return questions[:num_questions]


class OpenAIService:
    """
    Advanced AI Service using OpenAI API for more sophisticated analysis.
    Optional upgrade for more powerful skill extraction and question generation.
    """
    
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("OPENAI_API_KEY")
        self.model = "gpt-3.5-turbo"
    
    def extract_skills_from_document(self, text: str) -> list[str]:
        """Extract skills using OpenAI API"""
        if not self.api_key:
            # Fallback to basic extraction
            return AIService.extract_skills_from_text(text)
        
        try:
            import openai
            openai.api_key = self.api_key
            
            response = openai.ChatCompletion.create(
                model=self.model,
                messages=[
                    {
                        "role": "system",
                        "content": "You are an expert recruiter. Extract all technical and soft skills from the provided text. Return as a JSON array of skills."
                    },
                    {
                        "role": "user",
                        "content": f"Extract skills from this document:\n\n{text}"
                    }
                ],
                temperature=0.3,
            )
            
            skills_text = response.choices[0].message.content
            # Parse JSON response
            skills = json.loads(skills_text)
            return skills if isinstance(skills, list) else [skills]
        except Exception as e:
            print(f"OpenAI API error: {e}. Falling back to basic extraction.")
            return AIService.extract_skills_from_text(text)
    
    def generate_interview_questions_advanced(
        self,
        skills: list[str],
        job_description: str,
        role: str,
        experience_level: str = "intermediate",
        num_questions: int = 5,
        conversation_history: str | None = None,
    ) -> list[dict]:
        """Generate interview questions using OpenAI API"""
        if not self.api_key:
            # Fallback to basic generation
            return AIService.generate_interview_questions(
                skills, job_description, role, experience_level, num_questions
            )
        
        try:
            import openai
            openai.api_key = self.api_key

            prompt_lines = [
                f"Generate {num_questions} interview questions for the candidate based on the following information:",
                f"- Skills: {', '.join(skills) if skills else 'None'}",
                f"- Job Description: {job_description if job_description else 'None'}",
                f"- Role: {role if role else 'unspecified'}",
                f"- Experience Level: {experience_level}",
            ]

            if conversation_history:
                prompt_lines.append(
                    "- Recent conversation context between interviewer and candidate:")
                prompt_lines.append(conversation_history)

            response = openai.ChatCompletion.create(
                model=self.model,
                messages=[
                    {
                        "role": "system",
                        "content": "You are an expert technical interviewer. Generate personalized interview questions based on the candidate's skills, the job description, and the recent conversation. Return as a JSON array of objects with fields: question, skill, difficulty (easy/medium/hard), category (technical/behavioral). Do not include any extra text outside the JSON array."
                    },
                    {
                        "role": "user",
                        "content": "\n".join(prompt_lines),
                    }
                ],
                temperature=0.7,
            )
            
            questions_text = response.choices[0].message.content
            questions = json.loads(questions_text)
            return questions if isinstance(questions, list) else [questions]
        except Exception as e:
            print(f"OpenAI API error: {e}. Falling back to basic generation.")
            return AIService.generate_interview_questions(
                skills, job_description, role, experience_level, num_questions
            )
