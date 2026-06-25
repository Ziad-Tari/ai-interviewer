from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

import models
from database import get_db
from auth import get_current_user, get_user_role_and_name


def get_interview_room(
    room_id: str,
    db: Session = Depends(get_db),
) -> models.InterviewRoom:
    room = (
        db.query(models.InterviewRoom)
        .filter(models.InterviewRoom.room_id == room_id)
        .first()
    )
    if not room:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Interview room not found",
        )
    return room


def _user_has_room_access(user: models.User, room: models.InterviewRoom) -> bool:
    if user.id == room.interviewer_id:
        return True
    if room.candidate_id is not None and user.id == room.candidate_id:
        return True
    return False


def require_room_member(
    room: models.InterviewRoom = Depends(get_interview_room),
    current_user: models.User = Depends(get_current_user),
) -> models.InterviewRoom:
    if not _user_has_room_access(current_user, room):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this interview room",
        )
    return room


def require_room_interviewer(
    room: models.InterviewRoom = Depends(get_interview_room),
    current_user: models.User = Depends(get_current_user),
) -> models.InterviewRoom:
    if current_user.id != room.interviewer_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the room interviewer can perform this action",
        )
    return room


def assign_candidate_if_needed(
    room: models.InterviewRoom,
    user: models.User,
    db: Session,
) -> models.InterviewRoom:
    role, _ = get_user_role_and_name(user)
    if role != "candidate":
        return room

    if room.candidate_id is None:
        room.candidate_id = user.id
        db.commit()
        db.refresh(room)
        return room

    if room.candidate_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This interview room is assigned to another candidate",
        )

    return room


def require_room_access_for_join(
    room: models.InterviewRoom = Depends(get_interview_room),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> models.InterviewRoom:
    role, _ = get_user_role_and_name(current_user)

    if role == "interviewer":
        if current_user.id != room.interviewer_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have access to this interview room",
            )
        return room

    return assign_candidate_if_needed(room, current_user, db)
