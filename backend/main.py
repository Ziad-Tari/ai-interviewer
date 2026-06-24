import hashlib
import os
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Literal

import jwt
from fastapi import Depends, FastAPI, HTTPException, Request, Response, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import engine, Base
import models
from database import SessionLocal


class ConnectionManager:
    def __init__(self):
        self.rooms: dict[str, list[dict]] = {}

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
        return participant_count

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


JWT_SECRET_KEY = os.getenv(
    "JWT_SECRET_KEY",
    "dev-only-change-this-secret-with-a-longer-key-1234567890",
)
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "false").lower() == "true"


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    password_hash = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        100_000,
    ).hex()
    return f"{salt}:{password_hash}"


def verify_password(password: str, stored_password: str) -> bool:
    salt, password_hash = stored_password.split(":", 1)
    candidate_hash = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        100_000,
    ).hex()
    return secrets.compare_digest(candidate_hash, password_hash)


def normalize_email(email: str) -> str:
    return email.strip().lower()


def default_full_name_from_email(email: str) -> str:
    return email.split("@", 1)[0].replace(".", " ").replace("_", " ").title()


def get_user_role_and_name(user: models.User) -> tuple[Literal["candidate", "interviewer"], str]:
    if user.interviewer_profile:
        return "interviewer", user.interviewer_profile.full_name

    if user.candidate_profile:
        return "candidate", user.candidate_profile.full_name

    return "candidate", default_full_name_from_email(user.email)


def create_access_token(user: models.User) -> str:
    role, name = get_user_role_and_name(user)
    expires_at = datetime.now(timezone.utc) + timedelta(
        
        minutes=ACCESS_TOKEN_EXPIRE_MINUTES
    )
    payload = {
        "sub": str(user.id),
        "email": user.email,
        "role": role,
        "name": name,
        "exp": expires_at,
    }
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token",
        ) from exc


def set_auth_cookie(response: Response, token: str):
    response.set_cookie(
        key="access_token",
        value=token,
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="none" if COOKIE_SECURE else "lax",
        path="/",
    )


def get_user_from_token(token: str, db: Session) -> models.User:
    payload = decode_access_token(token)
    user_id = payload.get("sub")

    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
        )

    user = db.query(models.User).filter(models.User.id == int(user_id)).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authenticated user no longer exists",
        )

    return user


def get_current_user(request: Request, db: Session = Depends(get_db)) -> models.User:
    token = request.cookies.get("access_token")

    if not token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.lower().startswith("bearer "):
            token = auth_header.split(" ", 1)[1].strip()

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )

    return get_user_from_token(token, db)


app = FastAPI()

# allow frontend to connect
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
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
def create_interview_room():
    room_id = uuid.uuid4().hex

    return {
        "room_id": room_id,
        "interviewer_url": f"/interview/{room_id}",
        "candidate_url": f"/interview/{room_id}",
    }

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

Base.metadata.create_all(bind=engine)
