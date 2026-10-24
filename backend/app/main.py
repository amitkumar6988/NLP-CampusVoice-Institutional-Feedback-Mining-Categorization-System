from __future__ import annotations

import asyncio
import csv
import io
from contextlib import asynccontextmanager
from datetime import date, datetime, time, timedelta, timezone
from typing import AsyncGenerator, Optional
from uuid import uuid4

import pandas as pd
from fastapi import Depends, FastAPI, File, HTTPException, Query, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, inspect, or_, text
from sqlalchemy.orm import Session

from app.auth import create_access_token, get_current_user, get_db, get_optional_current_user, hash_password, verify_password
from app.config import CATEGORY_ORDER, DEFAULT_REVIEW_THRESHOLD
from app.database import Base, engine
from app.db_models import (
    AuditEvent,
    CollegeUser,
    FeedbackRecord,
    Notification,
    ReviewActivity,
    ReviewAssignment,
    ReviewDecision,
    SurveyCampaign,
    SurveySubmission,
)
from app.inference import infer_single_feedback
from app.models import (
    AuthTokenResponse,
    BatchClassificationResponse,
    FeedbackNoteUpdateRequest,
    FeedbackReviewUpdateRequest,
    FeedbackSubmissionRequest,
    HealthResponse,
    LoginRequest,
    PredictRequest,
    PredictResponse,
    RegisterRequest,
    ReviewAssignmentRequest,
    ReviewDecisionRequest,
    ReviewDecisionResponse,
    SurveyCreateRequest,
)
from app.training import load_model_bundle

MODEL_BUNDLE = None


def get_model_bundle():
    global MODEL_BUNDLE
    if MODEL_BUNDLE is None:
        MODEL_BUNDLE = load_model_bundle()
    return MODEL_BUNDLE


RETENTION_DAYS = 90


def utc_now_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def utc_iso(value: datetime) -> str:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc).isoformat()
    return value.isoformat()


def ensure_additive_schema() -> None:
    migrations = {
        'survey_campaigns': {
            'response_count': 'INTEGER NOT NULL DEFAULT 0',
        },
        'survey_submissions': {
            'consent_given': 'BOOLEAN NOT NULL DEFAULT TRUE',
            'consented_at': 'TIMESTAMP NULL',
        },
    }
    inspector = inspect(engine)
    with engine.begin() as connection:
        for table_name, columns in migrations.items():
            existing_columns = {column['name'] for column in inspector.get_columns(table_name)}
            for column_name, column_type in columns.items():
                if column_name not in existing_columns:
                    connection.execute(text(
                        f'ALTER TABLE {table_name} ADD COLUMN {column_name} {column_type}'
                    ))
        if 'consented_at' not in {column['name'] for column in inspector.get_columns('survey_submissions')}:
            connection.execute(text(
                'UPDATE survey_submissions SET consented_at = created_at WHERE consented_at IS NULL'
            ))


def record_audit(
    db: Session,
    action: str,
    resource_type: str,
    resource_id: Optional[str],
    actor_id: Optional[int] = None,
    details: str = '',
) -> None:
    db.add(AuditEvent(
        actor_id=actor_id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        details=details[:500],
    ))


def queue_notification(
    db: Session,
    user_id: int,
    kind: str,
    title: str,
    message: str,
    dedupe_key: str,
    feedback_id: Optional[int] = None,
) -> None:
    if db.query(Notification.id).filter(Notification.dedupe_key == dedupe_key).first():
        return
    db.add(Notification(
        user_id=user_id,
        feedback_id=feedback_id,
        kind=kind,
        title=title,
        message=message[:500],
        dedupe_key=dedupe_key,
    ))


def cleanup_expired_feedback(db: Session) -> int:
    cutoff = utc_now_naive() - timedelta(days=RETENTION_DAYS)
    expired_ids = [
        row[0]
        for row in db.query(FeedbackRecord.id).filter(FeedbackRecord.created_at < cutoff).all()
    ]
    if not expired_ids:
        return 0
    db.query(Notification).filter(Notification.feedback_id.in_(expired_ids)).delete(synchronize_session=False)
    db.query(ReviewActivity).filter(ReviewActivity.feedback_id.in_(expired_ids)).delete(synchronize_session=False)
    db.query(ReviewAssignment).filter(ReviewAssignment.feedback_id.in_(expired_ids)).delete(synchronize_session=False)
    db.query(SurveySubmission).filter(SurveySubmission.feedback_id.in_(expired_ids)).delete(synchronize_session=False)
    db.query(FeedbackRecord).filter(FeedbackRecord.id.in_(expired_ids)).delete(synchronize_session=False)
    record_audit(db, 'feedback.retention_purge', 'feedback', None, details=f'Deleted {len(expired_ids)} expired record(s).')
    db.commit()
    return len(expired_ids)


def notify_overdue_reviews(db: Session) -> None:
    overdue = (
        db.query(ReviewAssignment, FeedbackRecord)
        .join(FeedbackRecord, FeedbackRecord.id == ReviewAssignment.feedback_id)
        .filter(
            FeedbackRecord.review_status == 'pending',
            ReviewAssignment.due_at.is_not(None),
            ReviewAssignment.due_at <= utc_now_naive(),
        )
        .all()
    )
    for assignment, feedback in overdue:
        due_day = assignment.due_at.date().isoformat()
        queue_notification(
            db,
            assignment.assignee_id,
            'review_due',
            'Review deadline reached',
            f'Feedback #{feedback.id} is awaiting your review.',
            f'review-due-{feedback.id}-{due_day}',
            feedback.id,
        )
    db.commit()


def store_feedback(
    db: Session,
    feedback: str,
    result: dict,
    source: str,
    user_id: Optional[int] = None,
) -> FeedbackRecord:
    record = FeedbackRecord(
        user_id=user_id,
        feedback=feedback,
        predicted_category=result['predicted_category'],
        confidence=result['confidence'],
        human_review=result['human_review'],
        review_status='pending' if result['human_review'] else 'not_required',
        source=source,
    )
    db.add(record)
    db.flush()
    record_audit(
        db,
        'feedback.created',
        'feedback',
        str(record.id),
        actor_id=user_id,
        details=f"source={source}; category={result['predicted_category']}",
    )
    if result['human_review']:
        if user_id is not None:
            recipient_ids = [user_id]
        else:
            recipient_ids = [row[0] for row in db.query(CollegeUser.id).filter(CollegeUser.is_active.is_(True)).all()]
        for recipient_id in recipient_ids:
            queue_notification(
                db,
                recipient_id,
                'review_needed',
                'Feedback needs review',
                f'Feedback #{record.id} has been flagged for human review.',
                f'review-needed-{record.id}-{recipient_id}',
                record.id,
            )
    return record


async def retention_worker() -> None:
    while True:
        with Session(engine) as db:
            cleanup_expired_feedback(db)
            notify_overdue_reviews(db)
        await asyncio.sleep(60 * 60)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncGenerator[None, None]:
    del _app
    Base.metadata.create_all(bind=engine)
    ensure_additive_schema()
    get_model_bundle()
    with Session(engine) as db:
        cleanup_expired_feedback(db)
        notify_overdue_reviews(db)
    worker = asyncio.create_task(retention_worker())
    try:
        yield
    finally:
        worker.cancel()
        try:
            await worker
        except asyncio.CancelledError:
            pass


app = FastAPI(title='EduPulse API', version='1.0.0', lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=['http://localhost:5173', 'http://127.0.0.1:5173'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)


@app.post('/api/auth/register', response_model=AuthTokenResponse)
def register_account(payload: RegisterRequest, db: Session = Depends(get_db)):
    email = payload.email.strip().lower()
    if db.query(CollegeUser).filter(CollegeUser.email == email).first():
        raise HTTPException(status_code=409, detail='A college account with this email already exists.')
    if db.query(CollegeUser).filter(CollegeUser.college_id == payload.college_id.strip()).first():
        raise HTTPException(status_code=409, detail='This college ID is already in use.')

    user = CollegeUser(
        college_id=payload.college_id.strip(),
        full_name=payload.full_name.strip(),
        email=email,
        password_hash=hash_password(payload.password),
        role=payload.role.strip() or 'faculty',
        department=payload.department.strip() or 'Academic Affairs',
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return {
        'access_token': create_access_token(user.email, user.role),
        'token_type': 'bearer',
        'user': {
            'college_id': user.college_id,
            'full_name': user.full_name,
            'email': user.email,
            'role': user.role,
            'department': user.department,
            'is_active': user.is_active,
        },
    }


@app.post('/api/auth/login', response_model=AuthTokenResponse)
def login_account(payload: LoginRequest, db: Session = Depends(get_db)):
    email = payload.email.strip().lower()
    user = db.query(CollegeUser).filter(CollegeUser.email == email).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail='Invalid email or password.')

    return {
        'access_token': create_access_token(user.email, user.role),
        'token_type': 'bearer',
        'user': {
            'college_id': user.college_id,
            'full_name': user.full_name,
            'email': user.email,
            'role': user.role,
            'department': user.department,
            'is_active': user.is_active,
        },
    }


@app.get('/api/auth/me')
def get_me(current_user: CollegeUser = Depends(get_current_user)):
    return {
        'college_id': current_user.college_id,
        'full_name': current_user.full_name,
        'email': current_user.email,
        'role': current_user.role,
        'department': current_user.department,
    }


@app.get('/api/college/overview')
def college_overview(db: Session = Depends(get_db), current_user: CollegeUser = Depends(get_current_user)):
    total_users = db.query(CollegeUser).filter(CollegeUser.is_active.is_(True)).count()
    total_feedback = db.query(FeedbackRecord).count()
    pending_reviews = (
        db.query(FeedbackRecord).filter(FeedbackRecord.review_status == 'pending').count()
        + db.query(ReviewDecision).filter(ReviewDecision.status == 'pending').count()
    )
    resolved_reviews = (
        db.query(FeedbackRecord).filter(FeedbackRecord.review_status == 'resolved').count()
        + db.query(ReviewDecision).filter(ReviewDecision.status == 'resolved').count()
    )
    return {
        'college_name': 'EduPulse Institutional Intelligence Console',
        'user_role': current_user.role,
        'total_users': total_users,
        'total_feedback': total_feedback,
        'total_reviews': pending_reviews + resolved_reviews,
        'pending_reviews': pending_reviews,
        'resolved_reviews': resolved_reviews,
        'active_departments': db.query(CollegeUser.department).distinct().count(),
    }


@app.get('/api/departments')
def list_departments(db: Session = Depends(get_db), current_user: CollegeUser = Depends(get_current_user)):
    del current_user
    return [
        row[0]
        for row in db.query(CollegeUser.department)
        .filter(CollegeUser.is_active.is_(True))
        .distinct()
        .order_by(CollegeUser.department)
        .all()
    ]


def filtered_feedback_query(
    db: Session,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    category: Optional[str] = None,
    source: Optional[str] = None,
    department: Optional[str] = None,
):
    if start_date and end_date and end_date < start_date:
        raise HTTPException(status_code=422, detail='End date must be on or after start date.')
    if start_date and end_date and (end_date - start_date).days > 3650:
        raise HTTPException(status_code=422, detail='Date range cannot exceed 10 years.')
    query = db.query(FeedbackRecord)
    if start_date:
        query = query.filter(FeedbackRecord.created_at >= datetime.combine(start_date, time.min))
    if end_date:
        query = query.filter(FeedbackRecord.created_at < datetime.combine(end_date + timedelta(days=1), time.min))
    if category:
        query = query.filter(FeedbackRecord.predicted_category == category)
    if source:
        query = query.filter(FeedbackRecord.source == source)
    if department:
        department_users = db.query(CollegeUser.id).filter(
            CollegeUser.department == department,
            CollegeUser.is_active.is_(True),
        )
        department_surveys = (
            db.query(SurveySubmission.feedback_id)
            .join(SurveyCampaign, SurveyCampaign.id == SurveySubmission.campaign_id)
            .join(CollegeUser, CollegeUser.id == SurveyCampaign.created_by)
            .filter(CollegeUser.department == department, CollegeUser.is_active.is_(True))
        )
        query = query.filter(or_(
            FeedbackRecord.user_id.in_(department_users),
            FeedbackRecord.id.in_(department_surveys),
        ))
    return query


@app.get('/api/feedback/analytics')
def feedback_analytics(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    category: Optional[str] = None,
    source: Optional[str] = None,
    department: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: CollegeUser = Depends(get_current_user),
):
    del current_user
    today = utc_now_naive().date()
    query = filtered_feedback_query(db, start_date, end_date, category, source, department)
    category_rows = (
        query.with_entities(FeedbackRecord.predicted_category, func.count(FeedbackRecord.id))
        .group_by(FeedbackRecord.predicted_category)
        .all()
    )
    category_counts = {category_name: 0 for category_name in CATEGORY_ORDER}
    category_counts.update({category_name: count for category_name, count in category_rows})
    total_feedback = query.count()
    pending_reviews = query.filter(FeedbackRecord.review_status == 'pending').count()
    resolved_reviews = query.filter(FeedbackRecord.review_status == 'resolved').count()
    if not (category or source):
        decisions_query = db.query(ReviewDecision)
        if department:
            decisions_query = decisions_query.join(CollegeUser, CollegeUser.id == ReviewDecision.user_id).filter(
                CollegeUser.department == department,
                CollegeUser.is_active.is_(True),
            )
        if start_date:
            decisions_query = decisions_query.filter(ReviewDecision.created_at >= datetime.combine(start_date, time.min))
        if end_date:
            decisions_query = decisions_query.filter(ReviewDecision.created_at < datetime.combine(end_date + timedelta(days=1), time.min))
        pending_reviews += decisions_query.filter(ReviewDecision.status == 'pending').count()
        resolved_reviews += decisions_query.filter(ReviewDecision.status == 'resolved').count()
    average_confidence = query.with_entities(func.avg(FeedbackRecord.confidence)).scalar()
    trend_start = start_date or (end_date - timedelta(days=6) if end_date else today - timedelta(days=6))
    trend_end = end_date or today
    if trend_end < trend_start:
        raise HTTPException(status_code=422, detail='End date must be on or after start date.')
    if (trend_end - trend_start).days > 365:
        raise HTTPException(status_code=422, detail='Activity trend range cannot exceed 366 days.')
    trend_rows = (
        query.with_entities(func.date(FeedbackRecord.created_at), func.count(FeedbackRecord.id))
        .filter(FeedbackRecord.created_at >= datetime.combine(trend_start, time.min))
        .filter(FeedbackRecord.created_at < datetime.combine(trend_end + timedelta(days=1), time.min))
        .group_by(func.date(FeedbackRecord.created_at))
        .all()
    )
    trend_by_day = {str(day): count for day, count in trend_rows}
    daily_trend = [
        {
            'date': (trend_start + timedelta(days=offset)).isoformat(),
            'count': trend_by_day.get((trend_start + timedelta(days=offset)).isoformat(), 0),
        }
        for offset in range((trend_end - trend_start).days + 1)
    ]
    recent_feedback = query.order_by(FeedbackRecord.created_at.desc()).limit(10).all()
    return {
        'total_feedback': total_feedback,
        'pending_reviews': pending_reviews,
        'resolved_reviews': resolved_reviews,
        'average_confidence': round(float(average_confidence or 0), 4),
        'category_counts': category_counts,
        'daily_trend': daily_trend,
        'recent_feedback': [
            {
                'id': item.id,
                'feedback': item.feedback,
                'predicted_category': item.predicted_category,
                'confidence': item.confidence,
                'human_review': item.human_review,
                'review_status': item.review_status,
                'review_notes': item.review_notes,
                'source': item.source,
                'created_at': item.created_at.isoformat(),
            }
            for item in recent_feedback
        ],
    }


@app.get('/api/feedback/report.csv')
def export_feedback_report(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    category: Optional[str] = None,
    source: Optional[str] = None,
    department: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: CollegeUser = Depends(get_current_user),
):
    del current_user
    records = filtered_feedback_query(db, start_date, end_date, category, source, department).order_by(FeedbackRecord.created_at.desc()).all()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['id', 'created_at', 'source', 'category', 'confidence', 'review_status', 'feedback'])
    for item in records:
        writer.writerow([
            item.id,
            item.created_at.isoformat(),
            item.source,
            item.predicted_category,
            item.confidence,
            item.review_status,
            item.feedback,
        ])
    return Response(
        content=output.getvalue(),
        media_type='text/csv',
        headers={'Content-Disposition': 'attachment; filename="edupulse-feedback-report.csv"'},
    )


@app.get('/api/feedback')
def list_feedback(
    category: Optional[str] = None,
    status: Optional[str] = None,
    q: Optional[str] = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: CollegeUser = Depends(get_current_user),
):
    del current_user
    query = db.query(FeedbackRecord)
    if category:
        query = query.filter(FeedbackRecord.predicted_category == category)
    if status:
        query = query.filter(FeedbackRecord.review_status == status)
    if q:
        query = query.filter(FeedbackRecord.feedback.ilike(f'%{q.strip()}%'))
    total = query.count()
    records = query.order_by(FeedbackRecord.created_at.desc()).offset(offset).limit(limit).all()
    feedback_ids = [item.id for item in records]
    assignments = {
        assignment.feedback_id: assignment
        for assignment in db.query(ReviewAssignment).filter(ReviewAssignment.feedback_id.in_(feedback_ids)).all()
    } if feedback_ids else {}
    assignee_ids = {assignment.assignee_id for assignment in assignments.values()}
    assignees = {
        user.id: user.full_name
        for user in db.query(CollegeUser).filter(CollegeUser.id.in_(assignee_ids)).all()
    } if assignee_ids else {}
    return {
        'total': total,
        'items': [
            {
                'id': item.id,
                'feedback': item.feedback,
                'predicted_category': item.predicted_category,
                'confidence': item.confidence,
                'human_review': item.human_review,
                'review_status': item.review_status,
                'review_notes': item.review_notes,
                'source': item.source,
                'created_at': item.created_at.isoformat(),
                'assigned_to': assignees.get(assignments[item.id].assignee_id) if item.id in assignments else None,
                'due_at': utc_iso(assignments[item.id].due_at) if item.id in assignments and assignments[item.id].due_at else None,
            }
            for item in records
        ],
    }


@app.patch('/api/feedback/{feedback_id}/review')
def update_feedback_review(
    feedback_id: int,
    payload: FeedbackReviewUpdateRequest,
    db: Session = Depends(get_db),
    current_user: CollegeUser = Depends(get_current_user),
):
    if payload.status not in {'pending', 'resolved', 'dismissed'}:
        raise HTTPException(status_code=422, detail='Review status must be pending, resolved, or dismissed.')
    record = db.query(FeedbackRecord).filter(FeedbackRecord.id == feedback_id).first()
    if record is None:
        raise HTTPException(status_code=404, detail='Feedback record not found.')
    if not record.human_review:
        raise HTTPException(status_code=409, detail='This feedback does not require human review.')
    previous_status = record.review_status
    record.review_status = payload.status
    record.review_notes = payload.notes.strip()
    db.add(ReviewActivity(
        feedback_id=record.id,
        actor_id=current_user.id,
        action='status_changed',
        details=f'{previous_status} -> {record.review_status}' + (f'; {record.review_notes}' if record.review_notes else ''),
    ))
    record_audit(
        db,
        'feedback.review_updated',
        'feedback',
        str(record.id),
        actor_id=current_user.id,
        details=f'{previous_status} -> {record.review_status}',
    )
    assignment = db.query(ReviewAssignment).filter(ReviewAssignment.feedback_id == record.id).first()
    if payload.status == 'resolved' and assignment is not None:
        queue_notification(
            db,
            assignment.assignee_id,
            'review_resolved',
            'Review completed',
            f'Feedback #{record.id} was marked resolved.',
            f'review-resolved-{record.id}-{assignment.updated_at.isoformat()}',
            record.id,
        )
    db.commit()
    db.refresh(record)
    return {
        'id': record.id,
        'review_status': record.review_status,
        'review_notes': record.review_notes,
    }


@app.patch('/api/feedback/{feedback_id}/assignment')
def assign_feedback_to_self(
    feedback_id: int,
    payload: ReviewAssignmentRequest,
    db: Session = Depends(get_db),
    current_user: CollegeUser = Depends(get_current_user),
):
    record = db.query(FeedbackRecord).filter(FeedbackRecord.id == feedback_id).first()
    if record is None:
        raise HTTPException(status_code=404, detail='Feedback record not found.')
    if not record.human_review or record.review_status != 'pending':
        raise HTTPException(status_code=409, detail='Only pending human reviews can be assigned.')
    due_at = payload.due_at
    if due_at is not None and due_at.tzinfo is not None:
        due_at = due_at.astimezone(timezone.utc).replace(tzinfo=None)
    if due_at is not None and due_at <= utc_now_naive():
        raise HTTPException(status_code=422, detail='The due date must be in the future.')

    assignment = db.query(ReviewAssignment).filter(ReviewAssignment.feedback_id == record.id).first()
    action = 'review.assigned'
    if assignment is None:
        assignment = ReviewAssignment(feedback_id=record.id, assignee_id=current_user.id, due_at=due_at)
        db.add(assignment)
    else:
        action = 'review.assignment_updated' if assignment.assignee_id == current_user.id else 'review.reassigned'
        assignment.assignee_id = current_user.id
        assignment.due_at = due_at
        assignment.updated_at = utc_now_naive()
    db.add(ReviewActivity(
        feedback_id=record.id,
        actor_id=current_user.id,
        action=action,
        details=f'due_at={due_at.isoformat() if due_at else "none"}',
    ))
    record_audit(db, action, 'feedback', str(record.id), actor_id=current_user.id)
    queue_notification(
        db,
        current_user.id,
        'review_assigned',
        'Review assigned to you',
        f'Feedback #{record.id} is now in your review queue.',
        f'review-assigned-{record.id}-{current_user.id}',
        record.id,
    )
    db.commit()
    return {'feedback_id': record.id, 'assigned_to': current_user.full_name, 'due_at': utc_iso(due_at) if due_at else None}


@app.patch('/api/feedback/{feedback_id}/notes')
def update_feedback_notes(
    feedback_id: int,
    payload: FeedbackNoteUpdateRequest,
    db: Session = Depends(get_db),
    current_user: CollegeUser = Depends(get_current_user),
):
    record = db.query(FeedbackRecord).filter(FeedbackRecord.id == feedback_id).first()
    if record is None:
        raise HTTPException(status_code=404, detail='Feedback record not found.')
    if not record.human_review:
        raise HTTPException(status_code=409, detail='This feedback does not require human review.')
    record.review_notes = payload.notes.strip()
    db.add(ReviewActivity(
        feedback_id=record.id,
        actor_id=current_user.id,
        action='notes_updated',
        details=record.review_notes,
    ))
    record_audit(db, 'feedback.notes_updated', 'feedback', str(record.id), actor_id=current_user.id)
    db.commit()
    return {'id': record.id, 'review_notes': record.review_notes}


@app.get('/api/feedback/{feedback_id}/activity')
def feedback_activity(
    feedback_id: int,
    db: Session = Depends(get_db),
    current_user: CollegeUser = Depends(get_current_user),
):
    del current_user
    if db.query(FeedbackRecord.id).filter(FeedbackRecord.id == feedback_id).first() is None:
        raise HTTPException(status_code=404, detail='Feedback record not found.')
    rows = (
        db.query(ReviewActivity, CollegeUser.full_name)
        .outerjoin(CollegeUser, CollegeUser.id == ReviewActivity.actor_id)
        .filter(ReviewActivity.feedback_id == feedback_id)
        .order_by(ReviewActivity.created_at.desc())
        .limit(50)
        .all()
    )
    return [
        {
            'action': item.action,
            'details': item.details,
            'actor': actor_name or 'Former user',
            'created_at': item.created_at.isoformat(),
        }
        for item, actor_name in rows
    ]


@app.get('/api/notifications')
def list_notifications(
    db: Session = Depends(get_db),
    current_user: CollegeUser = Depends(get_current_user),
):
    items = (
        db.query(Notification)
        .filter(Notification.user_id == current_user.id)
        .order_by(Notification.created_at.desc())
        .limit(50)
        .all()
    )
    return {
        'unread_count': sum(not item.is_read for item in items),
        'items': [
            {
                'id': item.id,
                'kind': item.kind,
                'title': item.title,
                'message': item.message,
                'feedback_id': item.feedback_id,
                'is_read': item.is_read,
                'created_at': item.created_at.isoformat(),
            }
            for item in items
        ],
    }


@app.patch('/api/notifications/{notification_id}/read')
def mark_notification_read(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: CollegeUser = Depends(get_current_user),
):
    item = (
        db.query(Notification)
        .filter(Notification.id == notification_id, Notification.user_id == current_user.id)
        .first()
    )
    if item is None:
        raise HTTPException(status_code=404, detail='Notification not found.')
    item.is_read = True
    db.commit()
    return {'id': item.id, 'is_read': item.is_read}


@app.get('/api/audit-events')
def list_audit_events(
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: CollegeUser = Depends(get_current_user),
):
    del current_user
    rows = (
        db.query(AuditEvent, CollegeUser.full_name)
        .outerjoin(CollegeUser, CollegeUser.id == AuditEvent.actor_id)
        .order_by(AuditEvent.created_at.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            'action': event.action,
            'resource_type': event.resource_type,
            'resource_id': event.resource_id,
            'details': event.details,
            'actor': actor_name or 'System',
            'created_at': event.created_at.isoformat(),
        }
        for event, actor_name in rows
    ]


@app.get('/api/review-decisions')
def list_review_decisions(db: Session = Depends(get_db), current_user: CollegeUser = Depends(get_current_user)):
    del current_user
    decisions = db.query(ReviewDecision).order_by(ReviewDecision.created_at.desc()).all()
    return [
        {
            'id': item.id,
            'feedback_reference': item.feedback_reference,
            'predicted_category': item.predicted_category,
            'status': item.status,
            'notes': item.notes,
            'created_at': item.created_at.isoformat(),
            'user_id': item.user_id,
        }
        for item in decisions
    ]


@app.post('/api/review-decisions', response_model=ReviewDecisionResponse)
def create_review_decision(payload: ReviewDecisionRequest, db: Session = Depends(get_db), current_user: CollegeUser = Depends(get_current_user)):
    decision = ReviewDecision(
        user_id=current_user.id,
        feedback_reference=payload.feedback_reference,
        predicted_category=payload.predicted_category,
        status=payload.status,
        notes=payload.notes,
    )
    db.add(decision)
    db.commit()
    db.refresh(decision)
    return {
        'id': decision.id,
        'user_id': decision.user_id,
        'feedback_reference': decision.feedback_reference,
        'predicted_category': decision.predicted_category,
        'status': decision.status,
        'notes': decision.notes,
    }


@app.get('/api/health', response_model=HealthResponse)
def health():
    bundle = get_model_bundle()
    return {
        'status': 'ok',
        'model_loaded': bundle is not None,
        'message': 'EduPulse backend is online and ready for classification.',
    }


@app.get('/api/model-info')
def model_info():
    bundle = get_model_bundle()
    metadata = bundle['metadata'] if bundle is not None else {}
    return {
        'model_name': metadata.get('selected_model_name', 'Logistic Regression'),
        'version': metadata.get('model_version', 'v1.0.0'),
        'dataset_path': metadata.get('dataset_path', 'dataset/edupulse_student_feedback_additional_1000_long.csv'),
        'training_timestamp': metadata.get('training_timestamp'),
        'review_threshold': metadata.get('review_threshold', DEFAULT_REVIEW_THRESHOLD),
        'logger': 'EduPulse',
    }


@app.get('/api/model-metrics')
def model_metrics():
    bundle = get_model_bundle()
    if bundle is None:
        raise HTTPException(status_code=503, detail='Model bundle is unavailable.')
    return bundle['metrics']


def survey_summary(campaign: SurveyCampaign) -> dict:
    response_count = campaign.response_count
    now = utc_now_naive()
    is_closed = campaign.closes_at is not None and campaign.closes_at <= now
    is_full = campaign.max_responses is not None and response_count >= campaign.max_responses
    return {
        'id': campaign.public_id,
        'title': campaign.title,
        'prompt': campaign.prompt,
        'template': campaign.template,
        'max_responses': campaign.max_responses,
        'response_count': response_count,
        'closes_at': utc_iso(campaign.closes_at) if campaign.closes_at else None,
        'created_at': utc_iso(campaign.created_at),
        'status': 'closed' if is_closed or is_full else 'open',
    }


@app.post('/api/surveys')
def create_survey(
    payload: SurveyCreateRequest,
    db: Session = Depends(get_db),
    current_user: CollegeUser = Depends(get_current_user),
):
    title = payload.title.strip()
    prompt = payload.prompt.strip()
    if not title or not prompt:
        raise HTTPException(status_code=422, detail='Survey title and prompt cannot be blank.')
    closes_at = payload.closes_at
    if closes_at is not None and closes_at.tzinfo is not None:
        closes_at = closes_at.astimezone(timezone.utc).replace(tzinfo=None)
    if closes_at is not None and closes_at <= utc_now_naive():
        raise HTTPException(status_code=422, detail='Survey close time must be in the future.')
    campaign = SurveyCampaign(
        public_id=str(uuid4()),
        title=title,
        prompt=prompt,
        template=payload.template,
        max_responses=payload.max_responses,
        closes_at=closes_at,
        created_by=current_user.id,
    )
    db.add(campaign)
    db.flush()
    record_audit(db, 'survey.created', 'survey', campaign.public_id, actor_id=current_user.id)
    db.commit()
    db.refresh(campaign)
    return survey_summary(campaign)


@app.get('/api/surveys')
def list_surveys(
    db: Session = Depends(get_db),
    current_user: CollegeUser = Depends(get_current_user),
):
    del current_user
    campaigns = db.query(SurveyCampaign).order_by(SurveyCampaign.created_at.desc()).limit(100).all()
    return [survey_summary(campaign) for campaign in campaigns]


@app.get('/api/public/surveys/{public_id}')
def get_public_survey(public_id: str, db: Session = Depends(get_db)):
    campaign = db.query(SurveyCampaign).filter(SurveyCampaign.public_id == public_id).first()
    if campaign is None:
        raise HTTPException(status_code=404, detail='Survey not found.')
    return survey_summary(campaign)


@app.post('/api/predict', response_model=PredictResponse)
def predict(
    request: PredictRequest,
    db: Session = Depends(get_db),
    current_user: Optional[CollegeUser] = Depends(get_optional_current_user),
):
    bundle = get_model_bundle()
    if bundle is None:
        raise HTTPException(status_code=503, detail='Model bundle is unavailable.')
    if not request.feedback or not request.feedback.strip():
        raise HTTPException(status_code=400, detail='Feedback must not be empty.')
    result = infer_single_feedback(bundle, request.feedback)
    store_feedback(db, request.feedback.strip(), result, 'single', current_user.id if current_user else None)
    db.commit()
    return {
        'original_feedback': request.feedback,
        'predicted_category': result['predicted_category'],
        'confidence': result['confidence'],
        'alternatives': result['alternatives'],
        'influential_features': result['influential_features'],
        'recommendation': result['recommendation'],
        'human_review': result['human_review'],
    }


@app.post('/api/public/feedback', response_model=PredictResponse)
def submit_public_feedback(
    request: FeedbackSubmissionRequest,
    db: Session = Depends(get_db),
):
    feedback = request.feedback.strip()
    if not feedback:
        raise HTTPException(status_code=400, detail='Feedback must not be empty.')
    bundle = get_model_bundle()
    if bundle is None:
        raise HTTPException(status_code=503, detail='Model bundle is unavailable.')
    campaign = None
    if request.survey_id:
        if not request.consent:
            raise HTTPException(status_code=422, detail='Consent is required before submitting this survey.')
        campaign = (
            db.query(SurveyCampaign)
            .filter(SurveyCampaign.public_id == request.survey_id)
            .with_for_update()
            .first()
        )
        if campaign is None:
            raise HTTPException(status_code=404, detail='Survey not found.')
        response_count = campaign.response_count
        if campaign.closes_at is not None and campaign.closes_at <= utc_now_naive():
            raise HTTPException(status_code=409, detail='This survey is closed.')
        if campaign.max_responses is not None and response_count >= campaign.max_responses:
            raise HTTPException(status_code=409, detail='This survey has reached its response limit.')
    result = infer_single_feedback(bundle, feedback)
    record = store_feedback(db, feedback, result, 'survey')
    if campaign is not None:
        db.add(SurveySubmission(campaign_id=campaign.id, feedback_id=record.id, consent_given=True))
        campaign.response_count += 1
        record_audit(db, 'survey.response_submitted', 'survey', campaign.public_id)
    db.commit()
    return {'original_feedback': feedback, **result}


@app.post('/api/batch-classify', response_model=BatchClassificationResponse)
async def batch_classify(
    file: UploadFile = File(...),
    feedback_column: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: Optional[CollegeUser] = Depends(get_optional_current_user),
):
    bundle = get_model_bundle()
    if bundle is None:
        raise HTTPException(status_code=503, detail='Model bundle is unavailable.')
    if not file.filename:
        raise HTTPException(status_code=400, detail='Upload file is required.')
    filename = file.filename.lower()
    if not (filename.endswith('.csv') or filename.endswith('.xlsx') or filename.endswith('.xls')):
        raise HTTPException(status_code=400, detail='Only CSV or Excel files are supported.')

    file_bytes = await file.read()
    try:
        if filename.endswith('.csv'):
            df = pd.read_csv(io.BytesIO(file_bytes))
        else:
            df = pd.read_excel(io.BytesIO(file_bytes))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f'Unable to parse uploaded file: {exc}') from exc

    if df.empty:
        raise HTTPException(status_code=400, detail='Uploaded file contains no rows.')

    preferred_columns = [feedback_column] if feedback_column else []
    preferred_columns.extend(['feedback', 'text', 'response', 'comment'])
    chosen_column = next((col for col in preferred_columns if col in df.columns), None)
    if chosen_column is None:
        raise HTTPException(status_code=400, detail='Could not find a valid feedback column in the uploaded file.')

    records = df[[chosen_column]].copy().rename(columns={chosen_column: 'feedback'})
    records['feedback'] = records['feedback'].fillna('').astype(str)
    results = []
    counts = {category: 0 for category in CATEGORY_ORDER}

    for index, row in records.iterrows():
        feedback = row['feedback'].strip()
        if not feedback:
            continue
        result = infer_single_feedback(bundle, feedback)
        counts[result['predicted_category']] = counts.get(result['predicted_category'], 0) + 1
        store_feedback(db, feedback, result, 'batch', current_user.id if current_user else None)
        results.append({
            'row_index': int(index),
            'original_feedback': feedback,
            'predicted_category': result['predicted_category'],
            'confidence': result['confidence'],
            'recommendation': result['recommendation'],
            'human_review': result['human_review'],
        })

    db.commit()
    return {
        'total_rows': len(results),
        'human_review_count': sum(1 for row in results if row['human_review']),
        'category_counts': counts,
        'results': results,
    }
