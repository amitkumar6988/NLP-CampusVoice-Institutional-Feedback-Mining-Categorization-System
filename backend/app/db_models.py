from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text

from app.database import Base


def utc_now_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class CollegeUser(Base):
    __tablename__ = 'college_users'

    id = Column(Integer, primary_key=True, index=True)
    college_id = Column(String(100), unique=True, index=True, nullable=False)
    full_name = Column(String(200), nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(50), default='faculty')
    department = Column(String(120), default='Academic Affairs')
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=utc_now_naive, nullable=False)


class ReviewDecision(Base):
    __tablename__ = 'review_decisions'

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False)
    feedback_reference = Column(String(255), nullable=True)
    predicted_category = Column(String(120), nullable=False)
    status = Column(String(50), default='pending')
    notes = Column(Text, default='')
    created_at = Column(DateTime, default=utc_now_naive, nullable=False)


class FeedbackRecord(Base):
    __tablename__ = 'feedback_records'

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=True, index=True)
    feedback = Column(Text, nullable=False)
    predicted_category = Column(String(120), nullable=False, index=True)
    confidence = Column(Float, nullable=False)
    human_review = Column(Boolean, default=False, nullable=False)
    review_status = Column(String(50), default='not_required', nullable=False)
    review_notes = Column(Text, default='', nullable=False)
    source = Column(String(50), default='single', nullable=False)
    created_at = Column(DateTime, default=utc_now_naive, nullable=False, index=True)


class ReviewAssignment(Base):
    __tablename__ = 'review_assignments'

    id = Column(Integer, primary_key=True, index=True)
    feedback_id = Column(Integer, ForeignKey('feedback_records.id', ondelete='CASCADE'), unique=True, nullable=False)
    assignee_id = Column(Integer, ForeignKey('college_users.id', ondelete='CASCADE'), nullable=False, index=True)
    due_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utc_now_naive, nullable=False)
    updated_at = Column(DateTime, default=utc_now_naive, onupdate=utc_now_naive, nullable=False)


class ReviewActivity(Base):
    __tablename__ = 'review_activity'

    id = Column(Integer, primary_key=True, index=True)
    feedback_id = Column(Integer, ForeignKey('feedback_records.id', ondelete='CASCADE'), nullable=False, index=True)
    actor_id = Column(Integer, ForeignKey('college_users.id', ondelete='SET NULL'), nullable=True)
    action = Column(String(80), nullable=False)
    details = Column(Text, default='', nullable=False)
    created_at = Column(DateTime, default=utc_now_naive, nullable=False, index=True)


class Notification(Base):
    __tablename__ = 'notifications'

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey('college_users.id', ondelete='CASCADE'), nullable=False, index=True)
    feedback_id = Column(Integer, ForeignKey('feedback_records.id', ondelete='CASCADE'), nullable=True, index=True)
    kind = Column(String(80), nullable=False)
    title = Column(String(200), nullable=False)
    message = Column(String(500), nullable=False)
    dedupe_key = Column(String(255), unique=True, nullable=False)
    is_read = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=utc_now_naive, nullable=False, index=True)


class SurveyCampaign(Base):
    __tablename__ = 'survey_campaigns'

    id = Column(Integer, primary_key=True, index=True)
    public_id = Column(String(36), unique=True, nullable=False, index=True)
    title = Column(String(200), nullable=False)
    prompt = Column(String(500), nullable=False)
    template = Column(String(50), nullable=False)
    max_responses = Column(Integer, nullable=True)
    response_count = Column(Integer, default=0, nullable=False)
    closes_at = Column(DateTime, nullable=True)
    created_by = Column(Integer, ForeignKey('college_users.id', ondelete='SET NULL'), nullable=True)
    created_at = Column(DateTime, default=utc_now_naive, nullable=False)


class SurveySubmission(Base):
    __tablename__ = 'survey_submissions'

    id = Column(Integer, primary_key=True, index=True)
    campaign_id = Column(Integer, ForeignKey('survey_campaigns.id', ondelete='CASCADE'), nullable=False, index=True)
    feedback_id = Column(Integer, ForeignKey('feedback_records.id', ondelete='CASCADE'), unique=True, nullable=False)
    consent_given = Column(Boolean, default=True, nullable=False)
    consented_at = Column(DateTime, default=utc_now_naive, nullable=False)
    created_at = Column(DateTime, default=utc_now_naive, nullable=False)


class AuditEvent(Base):
    __tablename__ = 'audit_events'

    id = Column(Integer, primary_key=True, index=True)
    actor_id = Column(Integer, ForeignKey('college_users.id', ondelete='SET NULL'), nullable=True, index=True)
    action = Column(String(100), nullable=False)
    resource_type = Column(String(80), nullable=False)
    resource_id = Column(String(100), nullable=True)
    details = Column(String(500), default='', nullable=False)
    created_at = Column(DateTime, default=utc_now_naive, nullable=False, index=True)
