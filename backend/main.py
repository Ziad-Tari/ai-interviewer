import uuid
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import Depends, FastAPI, HTTPException, Request, Response, WebSocket, WebSocketDisconnect, status, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session

import models
from ai_service import AIService, OpenAIService
from auth import (
    create_access_token,
    default_full_name_from_email,
    get_current_user,
    get_user_from_token,
    get_user_role_and_name,
    hash_password,
    normalize_email,
    require_interviewer,
    set_auth_cookie,
    verify_password,
)
from config import settings
from database import SessionLocal, get_db
from deps import (
    assign_candidate_if_needed,
    require_room_interviewer,
    require_room_member,
)

# initialize optional OpenAI service (reads OPENAI_API_KEY env var)
openai_service = OpenAIService(api_key=settings.OPENAI_API_KEY)


class ConnectionManager:
    def __init__(self):
        self.rooms: dict[str, list[dict]] = {}
        self.conversation_history: dict[str, list[dict]] = {}
        self.last_ai_generated_at: dict[str, datetime] = {}

    async def connect(self, room_id: str, websocket: WebSocket):
        await websocket.accept()
        self.rooms.setdefault(room_id, []).append(
            {
                "websocket": websocket,
                "user_id": websocket.state.user_id,
                "role": websocket.state.role,
                "name": websocket.state.name,
            }
        )
        self.conversation_history.setdefault(room_id, [])
        participant_count = len(self.rooms[room_id])

        await self.broadcast(
            room_id,
            {
                "type": "room_state",
                "participant_count": participant_count,
            },
        )

        if participant_count == 2:
            await self.broadcast(
                room_id,
                {
                    "type": "room_ready",
                    "message": "Both participants joined the interview room.",
                },
            )

    def disconnect(self, room_id: str, websocket: WebSocket):
        connections = self.rooms.get(room_id, [])
        self.rooms[room_id] = [
            connection
            for connection in connections
            if connection["websocket"] is not websocket
        ]
        connections = self.rooms.get(room_id, [])
        participant_count = len(connections)
        if not connections and room_id in self.rooms:
            del self.rooms[room_id]
            self.conversation_history.pop(room_id, None)
            self.last_ai_generated_at.pop(room_id, None)
        return participant_count

    def append_chat_message(self, room_id: str, message: dict):
        history = self.conversation_history.setdefault(room_id, [])
        history.append(message)
        self.conversation_history[room_id] = history[-30:]

    def get_conversation_context(self, room_id: str, max_messages: int = 10) -> str:
        history = self.conversation_history.get(room_id, [])[-max_messages:]
        return "\n".join(
            f"{message.get('senderName', 'Unknown')}: {message.get('text', '')}"
            for message in history
        )

    async def broadcast(self, room_id: str, message: dict):
        for connection in self.rooms.get(room_id, []):
            await connection["websocket"].send_json(message)

    async def broadcast_from(self, room_id: str, websocket: WebSocket, message: dict):
        payload = {
            **message,
            "room_id": room_id,
            "senderId": str(websocket.state.user_id),
            "senderName": websocket.state.name,
            "senderRole": websocket.state.role,
        }
        await self.broadcast(room_id, payload)


manager = ConnectionManager()


async def create_and_broadcast_ai_question(
    room_id: str,
    websocket: WebSocket,
    db_ws: Session,
    skill_list: list[str],
    jd_text: str,
    conversation_context: str | None = None,
    difficulty: str = "intermediate",
    generated_from_conversation: bool = False,
):
    if getattr(openai_service, "api_key", None):
        generated = openai_service.generate_interview_questions_advanced(
            skills=skill_list,
            job_description=jd_text,
            role=None,
            experience_level=difficulty,
            num_questions=1,
            conversation_history=conversation_context,
        )
    else:
        generated = AIService.generate_interview_questions(
            skills=skill_list,
            job_description=jd_text,
            role=None,
            experience_level=difficulty,
            num_questions=1,
        )

    if generated:
        q = generated[0]
        question_obj = models.InterviewQuestion(
            room_id=room_id,
            question=q.get("question", ""),
            skill=q.get("skill"),
            difficulty=q.get("difficulty", "intermediate"),
            category=q.get("category", "technical"),
        )
        db_ws.add(question_obj)
        db_ws.commit()
        db_ws.refresh(question_obj)

        await manager.broadcast_from(
            room_id,
            websocket,
            {
                "type": "ai_question",
                "id": question_obj.id,
                "question": question_obj.question,
                "skill": question_obj.skill,
                "difficulty": question_obj.difficulty,
                "category": question_obj.category,
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "generated_from_conversation": generated_from_conversation,
            },
        )
        return True

    await websocket.send_json({"type": "ai_error", "message": "AI failed to generate a question"})
    return False


class AuthRequest(BaseModel):
    email: str
    password: str


class RegisterRequest(AuthRequest):
    role: Literal["candidate", "interviewer"]


class AuthResponse(BaseModel):
    message: str
    token_type: str = "bearer"
    access_token: str | None = None
    role: Literal["candidate", "interviewer"] | None = None
    name: str | None = None


class CurrentUserResponse(BaseModel):
    id: int
    email: str
    role: Literal["candidate", "interviewer"]
    name: str


class InviteRequest(BaseModel):
    room_id: str
    recipient_email: str
    invite_url: str


class InviteResponse(BaseModel):
    id: int
    room_id: str
    recipient_email: str
    invite_url: str
    created_at: str

    class Config:
        from_attributes = True



class InterviewRoomResponse(BaseModel):
    room_id: str
    interviewer_url: str
    candidate_url: str


class DocumentUploadResponse(BaseModel):
    room_id: str
    document_type: str  # "resume" or "jd"
    filename: str
    message: str

    class Config:
        from_attributes = True


class InterviewRoomDocumentsResponse(BaseModel):
    room_id: str
    resume_filename: str | None
    jd_filename: str | None
    has_resume: bool
    has_jd: bool

    class Config:
        from_attributes = True


class SkillResponse(BaseModel):
    skill: str
    source: str  # "resume" or "jd"
    confidence: float = 1.0


class ExtractedSkillsResponse(BaseModel):
    room_id: str
    skills: list[SkillResponse]
    resume_skills: list[str]
    jd_skills: list[str]
    combined_skills: list[str]


class InterviewQuestionResponse(BaseModel):
    id: int | None = None
    question: str
    skill: str | None
    difficulty: str
    category: str
    answer: str | None = None
    score: float | None = None
    feedback: str | None = None


class GeneratedQuestionsResponse(BaseModel):
    room_id: str
    questions: list[InterviewQuestionResponse]
    skill_count: int
    generated_at: str


class AnswerSubmission(BaseModel):
    answer: str
    score: float | None = None


def extract_text_from_file(file_data: bytes, filename: str) -> str:
    """
    Extract text from uploaded file (PDF, DOC, DOCX, or TXT).
    For now, supports TXT files. Can be extended with pdf, python-docx libraries.
    """
    import io

    try:
        lower = filename.lower() if filename else ""

        # Plain text
        if lower.endswith(".txt") or lower.endswith(".md"):
            return file_data.decode("utf-8", errors="ignore")

        # DOCX (Microsoft Word)
        if lower.endswith(".docx"):
            try:
                from docx import Document

                doc = Document(io.BytesIO(file_data))
                paragraphs = [p.text for p in doc.paragraphs if p.text]
                return "\n".join(paragraphs)
            except Exception as e:
                print(f"DOCX extraction failed: {e}")
                # fallthrough to best-effort decode

        # PDF
        if lower.endswith(".pdf"):
            try:
                from pdfminer.high_level import extract_text

                # pdfminer accepts a file path or a file-like object
                return extract_text(io.BytesIO(file_data)) or ""
            except Exception as e:
                print(f"PDF extraction failed: {e}")
                # fallthrough to best-effort decode

        # Fallback: try to decode as text
        try:
            return file_data.decode("utf-8", errors="ignore")
        except Exception:
            return ""
    except Exception as e:
        print(f"Error extracting text from file: {e}")
        return ""


app = FastAPI()

# allow frontend to connect
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def home():
    return {"message": "AI Interviewer Backend Running"}


@app.post("/auth/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def register(
    payload: RegisterRequest,
    response: Response,
    db: Session = Depends(get_db),
):
    email = normalize_email(payload.email)

    if len(payload.password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 6 characters long",
        )

    existing_user = db.query(models.User).filter(models.User.email == email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        )

    user = models.User(email=email, password_hash=hash_password(payload.password))
    db.add(user)
    db.commit()
    db.refresh(user)

    full_name = default_full_name_from_email(email)
    if payload.role == "candidate":
        profile = models.Candidate(user_id=user.id, full_name=full_name)
    else:
        profile = models.Interviewer(user_id=user.id, full_name=full_name)

    db.add(profile)
    db.commit()
    db.refresh(user)

    token = create_access_token(user)
    set_auth_cookie(response, token)

    return {
        "message": f"{payload.role.title()} account created",
        "access_token": token,
        "role": payload.role,
        "name": full_name,
    }

def print_user(user):
    if not user:
        print("User not found")
        return

    print("User:")
    print(f"  id: {user.id}")
    print(f"  email: {user.email}")
    print(f"  password_hash: {user.password_hash}")
    print(f"  has_candidate_profile: {user.candidate_profile is not None}")
    print(f"  has_interviewer_profile: {user.interviewer_profile is not None}")

@app.post("/auth/login", response_model=AuthResponse)
def login(
    payload: AuthRequest,
    response: Response,
    db: Session = Depends(get_db),
):
    email = normalize_email(payload.email)
    user = db.query(models.User).filter(models.User.email == email).first()
    print_user(user)

    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    role, name = get_user_role_and_name(user)
    token = create_access_token(user)
    set_auth_cookie(response, token)

    return {
        "message": "Signed in successfully",
        "access_token": token,
        "role": role,
        "name": name,
    }


@app.get("/auth/me", response_model=CurrentUserResponse)
def me(current_user: models.User = Depends(get_current_user)):
    role, name = get_user_role_and_name(current_user)
    return {
        "id": current_user.id,
        "email": current_user.email,
        "role": role,
        "name": name,
    }


@app.post("/invites", response_model=InviteResponse)
def send_invite(
    payload: InviteRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Save an interview invite to be sent to a candidate email."""
    invite = models.Invite(
        room_id=payload.room_id,
        recipient_email=payload.recipient_email.lower().strip(),
        invite_url=payload.invite_url,
    )
    db.add(invite)
    db.commit()
    db.refresh(invite)
    
    return {
        "id": invite.id,
        "room_id": invite.room_id,
        "recipient_email": invite.recipient_email,
        "invite_url": invite.invite_url,
        "created_at": invite.created_at.isoformat(),
    }


@app.get("/invites/received", response_model=list[InviteResponse])
def get_received_invites(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Get all interview invites received by the current candidate."""
    invites = db.query(models.Invite).filter(
        models.Invite.recipient_email == current_user.email.lower()
    ).order_by(models.Invite.created_at.desc()).all()
    
    return [
        {
            "id": invite.id,
            "room_id": invite.room_id,
            "recipient_email": invite.recipient_email,
            "invite_url": invite.invite_url,
            "created_at": invite.created_at.isoformat(),
        }
        for invite in invites
    ]


@app.post("/chat")
def chat():
    return {"response": "Hello from AI interviewer backend"}


@app.post("/interviews/rooms", response_model=InterviewRoomResponse)
def create_interview_room(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_interviewer),
):
    room_id = uuid.uuid4().hex
    room = models.InterviewRoom(
        room_id=room_id,
        interviewer_id=current_user.id,
    )
    db.add(room)
    db.commit()
    db.refresh(room)

    return {
        "room_id": room_id,
        "interviewer_url": f"/interview/{room_id}",
        "candidate_url": f"/interview/{room_id}",
    }


@app.post("/interviews/rooms/{room_id}/upload/resume", response_model=DocumentUploadResponse)
async def upload_resume(
    room_id: str,
    file: UploadFile = File(...),
    room: models.InterviewRoom = Depends(require_room_interviewer),
    db: Session = Depends(get_db),
):
    """Upload resume for an interview room"""
    try:
        file_content = await file.read()

        room.resume_filename = file.filename
        room.resume_data = file_content
        room.updated_at = datetime.now(timezone.utc)
        db.commit()

        return {
            "room_id": room_id,
            "document_type": "resume",
            "filename": file.filename,
            "message": f"Resume '{file.filename}' uploaded successfully",
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/interviews/rooms/{room_id}/upload/jd", response_model=DocumentUploadResponse)
async def upload_jd(
    room_id: str,
    file: UploadFile = File(...),
    room: models.InterviewRoom = Depends(require_room_interviewer),
    db: Session = Depends(get_db),
):
    """Upload Job Description for an interview room"""
    try:
        file_content = await file.read()

        room.jd_filename = file.filename
        room.jd_data = file_content
        room.updated_at = datetime.now(timezone.utc)
        db.commit()

        return {
            "room_id": room_id,
            "document_type": "jd",
            "filename": file.filename,
            "message": f"Job Description '{file.filename}' uploaded successfully",
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/interviews/rooms/{room_id}/documents", response_model=InterviewRoomDocumentsResponse)
async def get_room_documents(
    room_id: str,
    room: models.InterviewRoom = Depends(require_room_member),
):
    """Get document information for an interview room"""
    return {
        "room_id": room_id,
        "resume_filename": room.resume_filename,
        "jd_filename": room.jd_filename,
        "has_resume": room.resume_data is not None,
        "has_jd": room.jd_data is not None,
    }


@app.get("/interviews/rooms/{room_id}/download/resume")
async def download_resume(
    room_id: str,
    room: models.InterviewRoom = Depends(require_room_interviewer),
):
    """Download resume for an interview room"""
    if not room.resume_data:
        raise HTTPException(status_code=404, detail="Resume not found")

    return Response(
        content=room.resume_data,
        media_type="application/octet-stream",
        headers={"Content-Disposition": f"attachment; filename={room.resume_filename}"},
    )


@app.get("/interviews/rooms/{room_id}/download/jd")
async def download_jd(
    room_id: str,
    room: models.InterviewRoom = Depends(require_room_interviewer),
):
    """Download Job Description for an interview room"""
    if not room.jd_data:
        raise HTTPException(status_code=404, detail="Job Description not found")

    return Response(
        content=room.jd_data,
        media_type="application/octet-stream",
        headers={"Content-Disposition": f"attachment; filename={room.jd_filename}"},
    )


@app.post("/interviews/rooms/{room_id}/extract-skills", response_model=ExtractedSkillsResponse)
async def extract_skills(
    room_id: str,
    room: models.InterviewRoom = Depends(require_room_interviewer),
    db: Session = Depends(get_db),
):
    """Extract skills from resume and job description"""
    try:
        resume_text = ""
        jd_text = ""

        if room.resume_data:
            resume_text = extract_text_from_file(room.resume_data, room.resume_filename or "resume.txt")

        if room.jd_data:
            jd_text = extract_text_from_file(room.jd_data, room.jd_filename or "jd.txt")
        # Extract skills using AI Service
        resume_skills = AIService.extract_skills_from_text(resume_text)
        jd_skills = AIService.extract_skills_from_text(jd_text)
        
        # Combine and deduplicate
        combined_skills = list(set(resume_skills + jd_skills))
        combined_skills.sort()
        
        # Store extracted skills in database
        # First, clear existing skills for this room
        db.query(models.ExtractedSkill).filter(models.ExtractedSkill.room_id == room_id).delete()
        
        # Add new skills
        for skill in resume_skills:
            db.add(models.ExtractedSkill(
                room_id=room_id,
                skill=skill,
                source="resume",
                confidence=1.0
            ))
        
        for skill in jd_skills:
            db.add(models.ExtractedSkill(
                room_id=room_id,
                skill=skill,
                source="jd",
                confidence=1.0
            ))
        
        db.commit()
        
        # Format response
        skills_response = []
        for skill in resume_skills:
            skills_response.append(SkillResponse(skill=skill, source="resume", confidence=1.0))
        for skill in jd_skills:
            skills_response.append(SkillResponse(skill=skill, source="jd", confidence=1.0))
        
        return {
            "room_id": room_id,
            "skills": skills_response,
            "resume_skills": resume_skills,
            "jd_skills": jd_skills,
            "combined_skills": combined_skills
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/interviews/rooms/{room_id}/generate-questions", response_model=GeneratedQuestionsResponse)
async def generate_interview_questions(
    room_id: str,
    num_questions: int = 5,
    difficulty: str = "intermediate",
    room: models.InterviewRoom = Depends(require_room_interviewer),
    db: Session = Depends(get_db),
):
    """Generate personalized interview questions based on extracted skills"""
    try:
        skills = db.query(models.ExtractedSkill.skill).filter(
            models.ExtractedSkill.room_id == room_id
        ).distinct().all()
        
        skill_list = [skill[0] for skill in skills]
        
        if not skill_list:
            raise HTTPException(status_code=400, detail="No skills extracted. Please extract skills first.")
        
        # Get JD text for context
        jd_text = ""
        if room.jd_data:
            jd_text = extract_text_from_file(room.jd_data, room.jd_filename or "jd.txt")
        
        # Generate questions using AI Service
        generated_questions = AIService.generate_interview_questions(
            skills=skill_list,
            job_description=jd_text,
            role=None,
            experience_level=difficulty,
            num_questions=num_questions
        )
        
        # Store generated questions in database
        # Clear existing questions for this room
        db.query(models.InterviewQuestion).filter(models.InterviewQuestion.room_id == room_id).delete()
        
        # Add new questions
        stored_questions = []
        for q in generated_questions:
            question_obj = models.InterviewQuestion(
                room_id=room_id,
                question=q.get("question", ""),
                skill=q.get("skill"),
                difficulty=q.get("difficulty", "intermediate"),
                category=q.get("category", "technical")
            )
            db.add(question_obj)
            db.flush()  # Flush to get the ID
            
            stored_questions.append(InterviewQuestionResponse(
                id=question_obj.id,
                question=question_obj.question,
                skill=question_obj.skill,
                difficulty=question_obj.difficulty,
                category=question_obj.category
            ))
        
        db.commit()
        
        return {
            "room_id": room_id,
            "questions": stored_questions,
            "skill_count": len(skill_list),
            "generated_at": datetime.now(timezone.utc).isoformat()
        }
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/interviews/rooms/{room_id}/questions", response_model=GeneratedQuestionsResponse)
async def get_interview_questions(
    room_id: str,
    room: models.InterviewRoom = Depends(require_room_member),
    db: Session = Depends(get_db),
):
    """Retrieve generated interview questions for a room"""
    try:
        questions = db.query(models.InterviewQuestion).filter(
            models.InterviewQuestion.room_id == room_id
        ).all()

        if not questions:
            raise HTTPException(status_code=404, detail="No questions generated. Please generate questions first.")
        
        # Get skill count
        skills = db.query(models.ExtractedSkill.skill).filter(
            models.ExtractedSkill.room_id == room_id
        ).distinct().count()
        
        questions_response = [
            InterviewQuestionResponse(
                id=q.id,
                question=q.question,
                skill=q.skill,
                difficulty=q.difficulty,
                category=q.category,
                answer=q.answer,
                score=q.score,
                feedback=q.feedback
            )
            for q in questions
        ]
        
        return {
            "room_id": room_id,
            "questions": questions_response,
            "skill_count": skills,
            "generated_at": datetime.now(timezone.utc).isoformat()
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/interviews/rooms/{room_id}/questions/{question_id}/answer")
async def submit_question_answer(
    room_id: str,
    question_id: int,
    payload: AnswerSubmission,
    room: models.InterviewRoom = Depends(require_room_member),
    db: Session = Depends(get_db),
):
    """Submit answer to an interview question"""
    try:
        question = db.query(models.InterviewQuestion).filter(
            models.InterviewQuestion.id == question_id,
            models.InterviewQuestion.room_id == room_id,
        ).first()

        if not question:
            raise HTTPException(status_code=404, detail="Question not found")

        question.answer = payload.answer
        if payload.score is not None:
            question.score = payload.score

        db.commit()

        return {
            "message": "Answer submitted successfully",
            "question_id": question_id,
            "score": question.score,
        }
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@app.websocket("/ws/interviews/{room_id}")
async def interview_room_socket(websocket: WebSocket, room_id: str):
    token = websocket.cookies.get("access_token")
    if not token:
        token = websocket.query_params.get("token")

    if not token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    db = SessionLocal()
    try:
        user = get_user_from_token(token, db)
        role, name = get_user_role_and_name(user)
        websocket.state.user_id = user.id
        websocket.state.role = role
        websocket.state.name = name

        room = (
            db.query(models.InterviewRoom)
            .filter(models.InterviewRoom.room_id == room_id)
            .first()
        )
        if not room:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

        if role == "interviewer":
            if user.id != room.interviewer_id:
                await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
                return
        else:
            try:
                assign_candidate_if_needed(room, user, db)
            except HTTPException:
                await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
                return
    except HTTPException:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    finally:
        db.close()

    await manager.connect(room_id, websocket)
    await manager.broadcast(
        room_id,
        {
            "type": "presence",
            "message": f"{websocket.state.name} joined the interview room.",
        },
    )

    try:
        while True:
            data = await websocket.receive_json()

            # If interviewer requests an AI-generated question, generate it in real time
            try:
                if isinstance(data, dict) and data.get("type") == "ai_generate_question":
                    if websocket.state.role != "interviewer":
                        await websocket.send_json(
                            {
                                "type": "ai_error",
                                "message": "Only the interviewer can generate questions",
                            }
                        )
                        continue

                    difficulty = data.get("difficulty", "intermediate")
                    # Open a DB session for extraction and storing
                    db_ws = SessionLocal()
                    try:
                        # Load existing extracted skills
                        skills_q = db_ws.query(models.ExtractedSkill.skill).filter(
                            models.ExtractedSkill.room_id == room_id
                        ).distinct().all()
                        skill_list = [s[0] for s in skills_q]

                        # If no skills stored, try extracting from uploaded documents
                        jd_text = ""
                        if not skill_list:
                            room = db_ws.query(models.InterviewRoom).filter(models.InterviewRoom.room_id == room_id).first()
                            resume_text = ""
                            if room and room.resume_data:
                                resume_text = extract_text_from_file(room.resume_data, room.resume_filename or "resume.txt")
                            if room and room.jd_data:
                                jd_text = extract_text_from_file(room.jd_data, room.jd_filename or "jd.txt")

                            resume_skills = AIService.extract_skills_from_text(resume_text)
                            jd_skills = AIService.extract_skills_from_text(jd_text)

                            skill_list = list(set(resume_skills + jd_skills))

                            # persist extracted skills
                            db_ws.query(models.ExtractedSkill).filter(models.ExtractedSkill.room_id == room_id).delete()
                            for sk in resume_skills:
                                db_ws.add(models.ExtractedSkill(room_id=room_id, skill=sk, source="resume", confidence=1.0))
                            for sk in jd_skills:
                                db_ws.add(models.ExtractedSkill(room_id=room_id, skill=sk, source="jd", confidence=1.0))
                            db_ws.commit()

                        conversation_context = manager.get_conversation_context(room_id, max_messages=12)
                        await create_and_broadcast_ai_question(
                            room_id,
                            websocket,
                            db_ws,
                            skill_list,
                            jd_text,
                            conversation_context,
                            difficulty,
                            generated_from_conversation=False,
                        )
                    finally:
                        db_ws.close()

                    # do not broadcast the original generate request to other participants
                    continue
            except Exception as e:
                await websocket.send_json({"type": "ai_error", "message": str(e)})

            if isinstance(data, dict) and data.get("type") == "chat":
                manager.append_chat_message(room_id, data)

                # Auto-generate a live question from OpenAI when conversation is active
                if getattr(openai_service, "api_key", None):
                    history = manager.conversation_history.get(room_id, [])
                    last_ai = manager.last_ai_generated_at.get(room_id)
                    now = datetime.now(timezone.utc)
                    if len(history) >= 6 and (
                        not last_ai or now - last_ai > timedelta(seconds=60)
                    ):
                        db_ws = SessionLocal()
                        try:
                            skills_q = db_ws.query(models.ExtractedSkill.skill).filter(
                                models.ExtractedSkill.room_id == room_id
                            ).distinct().all()
                            skill_list = [s[0] for s in skills_q]

                            room = db_ws.query(models.InterviewRoom).filter(models.InterviewRoom.room_id == room_id).first()
                            resume_text = ""
                            jd_text = ""
                            if room and room.resume_data:
                                resume_text = extract_text_from_file(room.resume_data, room.resume_filename or "resume.txt")
                            if room and room.jd_data:
                                jd_text = extract_text_from_file(room.jd_data, room.jd_filename or "jd.txt")

                            if not skill_list:
                                resume_skills = AIService.extract_skills_from_text(resume_text)
                                jd_skills = AIService.extract_skills_from_text(jd_text)
                                skill_list = list(set(resume_skills + jd_skills))
                            
                            conversation_context = manager.get_conversation_context(room_id, max_messages=12)
                            if skill_list or conversation_context:
                                await create_and_broadcast_ai_question(
                                    room_id,
                                    websocket,
                                    db_ws,
                                    skill_list,
                                    jd_text,
                                    conversation_context,
                                    difficulty=data.get("difficulty", "intermediate"),
                                    generated_from_conversation=True,
                                )
                                manager.last_ai_generated_at[room_id] = now
                        finally:
                            db_ws.close()

            await manager.broadcast_from(room_id, websocket, data)
    except WebSocketDisconnect:
        participant_count = manager.disconnect(room_id, websocket)
        await manager.broadcast(
            room_id,
            {
                "type": "presence",
                "message": f"{websocket.state.name} left the interview room.",
            },
        )
        await manager.broadcast(
            room_id,
            {
                "type": "room_state",
                "participant_count": participant_count,
            },
        )
