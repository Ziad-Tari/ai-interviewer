from sqlalchemy import Column, ForeignKey, Integer, String, Text, DateTime, LargeBinary, JSON, Float
from sqlalchemy.orm import relationship
from database import Base
from datetime import datetime, timezone


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)

    candidate_profile = relationship(
        "Candidate",
        back_populates="user",
        uselist=False,
        cascade="all, delete-orphan",
    )
    interviewer_profile = relationship(
        "Interviewer",
        back_populates="user",
        uselist=False,
        cascade="all, delete-orphan",
    )


class Candidate(Base):
    __tablename__ = "candidates"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    full_name = Column(String, nullable=False)
    target_role = Column(String)
    experience_level = Column(String)
    resume_text = Column(Text)

    user = relationship("User", back_populates="candidate_profile")


class Interviewer(Base):
    __tablename__ = "interviewers"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    full_name = Column(String, nullable=False)
    company = Column(String)
    job_title = Column(String)
    specialty = Column(String)
    bio = Column(Text)

    user = relationship("User", back_populates="interviewer_profile")


class Invite(Base):
    __tablename__ = "invites"

    id = Column(Integer, primary_key=True, index=True)
    room_id = Column(String, nullable=False, index=True)
    recipient_email = Column(String, nullable=False, index=True)
    invite_url = Column(String, nullable=False)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))


class Interview(Base):
    __tablename__ = "interviews"

    id = Column(Integer, primary_key=True, index=True)
    question = Column(Text)
    answer = Column(Text)
    score = Column(Integer)


class InterviewRoom(Base):
    __tablename__ = "interview_rooms"

    id = Column(Integer, primary_key=True, index=True)
    room_id = Column(String, unique=True, index=True, nullable=False)
    interviewer_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    candidate_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    resume_filename = Column(String, nullable=True)
    resume_data = Column(LargeBinary, nullable=True)
    jd_filename = Column(String, nullable=True)
    jd_data = Column(LargeBinary, nullable=True)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class ExtractedSkill(Base):
    __tablename__ = "extracted_skills"

    id = Column(Integer, primary_key=True, index=True)
    room_id = Column(String, ForeignKey("interview_rooms.room_id"), nullable=False, index=True)
    skill = Column(String, nullable=False)
    source = Column(String, nullable=False)  # "resume" or "jd"
    confidence = Column(Float, default=1.0)  # Confidence score 0-1
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))


class InterviewQuestion(Base):
    __tablename__ = "interview_questions"

    id = Column(Integer, primary_key=True, index=True)
    room_id = Column(String, ForeignKey("interview_rooms.room_id"), nullable=False, index=True)
    question = Column(Text, nullable=False)
    skill = Column(String, nullable=True)
    difficulty = Column(String, nullable=False)  # "easy", "intermediate", "advanced"
    category = Column(String, nullable=False)  # "technical", "behavioral", "situational"
    answer = Column(Text, nullable=True)
    score = Column(Float, nullable=True)
    feedback = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
