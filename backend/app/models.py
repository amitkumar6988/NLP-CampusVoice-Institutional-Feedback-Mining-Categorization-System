from datetime import datetime
from typing import Dict, List, Optional

from pydantic import BaseModel, Field


class PredictRequest(BaseModel):
    feedback: str = Field(..., min_length=1, description='Student feedback text to classify')


class PredictResponse(BaseModel):
    original_feedback: str
    predicted_category: str
    confidence: float
    alternatives: List[str]
    influential_features: List[str]
    recommendation: str
    human_review: bool


class BatchRowResult(BaseModel):
    row_index: int
    original_feedback: str
    predicted_category: str
    confidence: float
    recommendation: str
    human_review: bool


class BatchClassificationResponse(BaseModel):
    total_rows: int
    human_review_count: int
    category_counts: Dict[str, int]
    results: List[BatchRowResult]


class ModelInfo(BaseModel):
    model_name: str
    version: str
    dataset_path: str
    training_timestamp: Optional[str] = None
    logger: str = 'EduPulse'
    review_threshold: float


class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    message: str


class RegisterRequest(BaseModel):
    college_id: str
    full_name: str
    email: str
    password: str
    role: str = 'faculty'
    department: str = 'Academic Affairs'


class LoginRequest(BaseModel):
    email: str
    password: str


class AuthTokenResponse(BaseModel):
    access_token: str
    token_type: str = 'bearer'
    user: Dict[str, str | bool]


class ReviewDecisionRequest(BaseModel):
    feedback_reference: Optional[str] = None
    predicted_category: str
    status: str = 'pending'
    notes: str = ''


class ReviewDecisionResponse(BaseModel):
    id: int
    user_id: int
    feedback_reference: Optional[str]
    predicted_category: str
    status: str
    notes: str


class FeedbackSubmissionRequest(BaseModel):
    feedback: str = Field(..., min_length=1, max_length=10000)
    consent: bool = False
    survey_id: Optional[str] = None


class FeedbackReviewUpdateRequest(BaseModel):
    status: str
    notes: str = Field(default='', max_length=5000)


class FeedbackNoteUpdateRequest(BaseModel):
    notes: str = Field(default='', max_length=5000)


class ReviewAssignmentRequest(BaseModel):
    due_at: Optional[datetime] = None


class SurveyCreateRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    prompt: str = Field(default='Share your feedback', min_length=1, max_length=500)
    template: str = Field(default='general', pattern='^(general|facilities|teaching|student_services)$')
    max_responses: Optional[int] = Field(default=None, ge=1, le=10000)
    closes_at: Optional[datetime] = None
