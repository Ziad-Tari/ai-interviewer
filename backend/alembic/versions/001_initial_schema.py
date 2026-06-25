"""Initial schema

Revision ID: 001_initial
Revises:
Create Date: 2026-06-25

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("password_hash", sa.String(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)
    op.create_index(op.f("ix_users_id"), "users", ["id"], unique=False)

    op.create_table(
        "interviews",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("question", sa.Text(), nullable=True),
        sa.Column("answer", sa.Text(), nullable=True),
        sa.Column("score", sa.Integer(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_interviews_id"), "interviews", ["id"], unique=False)

    op.create_table(
        "candidates",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("full_name", sa.String(), nullable=False),
        sa.Column("target_role", sa.String(), nullable=True),
        sa.Column("experience_level", sa.String(), nullable=True),
        sa.Column("resume_text", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id"),
    )
    op.create_index(op.f("ix_candidates_id"), "candidates", ["id"], unique=False)

    op.create_table(
        "interviewers",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("full_name", sa.String(), nullable=False),
        sa.Column("company", sa.String(), nullable=True),
        sa.Column("job_title", sa.String(), nullable=True),
        sa.Column("specialty", sa.String(), nullable=True),
        sa.Column("bio", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id"),
    )
    op.create_index(op.f("ix_interviewers_id"), "interviewers", ["id"], unique=False)

    op.create_table(
        "invites",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("room_id", sa.String(), nullable=False),
        sa.Column("recipient_email", sa.String(), nullable=False),
        sa.Column("invite_url", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_invites_id"), "invites", ["id"], unique=False)
    op.create_index(op.f("ix_invites_recipient_email"), "invites", ["recipient_email"], unique=False)
    op.create_index(op.f("ix_invites_room_id"), "invites", ["room_id"], unique=False)

    op.create_table(
        "interview_rooms",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("room_id", sa.String(), nullable=False),
        sa.Column("interviewer_id", sa.Integer(), nullable=False),
        sa.Column("candidate_id", sa.Integer(), nullable=True),
        sa.Column("resume_filename", sa.String(), nullable=True),
        sa.Column("resume_data", sa.LargeBinary(), nullable=True),
        sa.Column("jd_filename", sa.String(), nullable=True),
        sa.Column("jd_data", sa.LargeBinary(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["candidate_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["interviewer_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_interview_rooms_id"), "interview_rooms", ["id"], unique=False)
    op.create_index(op.f("ix_interview_rooms_room_id"), "interview_rooms", ["room_id"], unique=True)

    op.create_table(
        "extracted_skills",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("room_id", sa.String(), nullable=False),
        sa.Column("skill", sa.String(), nullable=False),
        sa.Column("source", sa.String(), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["room_id"], ["interview_rooms.room_id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_extracted_skills_id"), "extracted_skills", ["id"], unique=False)
    op.create_index(op.f("ix_extracted_skills_room_id"), "extracted_skills", ["room_id"], unique=False)

    op.create_table(
        "interview_questions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("room_id", sa.String(), nullable=False),
        sa.Column("question", sa.Text(), nullable=False),
        sa.Column("skill", sa.String(), nullable=True),
        sa.Column("difficulty", sa.String(), nullable=False),
        sa.Column("category", sa.String(), nullable=False),
        sa.Column("answer", sa.Text(), nullable=True),
        sa.Column("score", sa.Float(), nullable=True),
        sa.Column("feedback", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["room_id"], ["interview_rooms.room_id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_interview_questions_id"), "interview_questions", ["id"], unique=False)
    op.create_index(op.f("ix_interview_questions_room_id"), "interview_questions", ["room_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_interview_questions_room_id"), table_name="interview_questions")
    op.drop_index(op.f("ix_interview_questions_id"), table_name="interview_questions")
    op.drop_table("interview_questions")
    op.drop_index(op.f("ix_extracted_skills_room_id"), table_name="extracted_skills")
    op.drop_index(op.f("ix_extracted_skills_id"), table_name="extracted_skills")
    op.drop_table("extracted_skills")
    op.drop_index(op.f("ix_interview_rooms_room_id"), table_name="interview_rooms")
    op.drop_index(op.f("ix_interview_rooms_id"), table_name="interview_rooms")
    op.drop_table("interview_rooms")
    op.drop_index(op.f("ix_invites_room_id"), table_name="invites")
    op.drop_index(op.f("ix_invites_recipient_email"), table_name="invites")
    op.drop_index(op.f("ix_invites_id"), table_name="invites")
    op.drop_table("invites")
    op.drop_index(op.f("ix_interviewers_id"), table_name="interviewers")
    op.drop_table("interviewers")
    op.drop_index(op.f("ix_candidates_id"), table_name="candidates")
    op.drop_table("candidates")
    op.drop_index(op.f("ix_interviews_id"), table_name="interviews")
    op.drop_table("interviews")
    op.drop_index(op.f("ix_users_id"), table_name="users")
    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.drop_table("users")
