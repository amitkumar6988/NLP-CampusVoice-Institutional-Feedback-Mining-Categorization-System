# EduPulse � Intelligent Student Feedback Categorization System

EduPulse is a full-stack academic demo application for classifying institutional student feedback into eleven predefined categories using classical NLP and machine learning. The platform combines a FastAPI backend, spaCy preprocessing, TF-IDF feature extraction, and a React dashboard for prediction, analytics, and batch review.

## What it includes

- 11-category classification taxonomy for student concerns and feedback
- spaCy-based preprocessing with tokenization and lemmatization
- TF-IDF feature engineering and three classical models:
  - Multinomial Naive Bayes
  - Logistic Regression
  - Linear SVM
- Model evaluation metrics saved as JSON for dashboard display
- REST API for single and batch classification
- PostgreSQL-backed feedback history, live category analytics, and review workflow
- Shareable, template-based public surveys with consent, response limits, closing dates, and response tracking
- Review ownership, due dates, internal notes, activity history, and in-app notifications
- Date/category/source-filtered analytics and authenticated CSV reporting
- Audit history for feedback, review, and survey actions
- Automatic deletion of feedback, survey submissions, and review notes after 90 days
- React dashboard with live overview, analytics, batch export, review queue, notifications, settings, and model metrics
- Administrative review threshold logic for low-confidence predictions

## Category taxonomy

1. Teaching Quality
2. Course Content
3. Infrastructure
4. Laboratory
5. Examination
6. Placement
7. Hostel
8. Administration
9. Positive Feedback
10. Negative Feedback
11. Suggestions

## Project structure

- `backend/` � FastAPI application, model training, inference, evaluation, and recommendations
- `dataset/` � labeled student feedback CSV files
- `frontend/` � React + Vite dashboard
- `requirement.txt` � Python dependency list for backend execution

## Local setup

### 1) Python environment

From the project root:

```bash
python -m venv nlpvenv
nlpvenv\Scripts\activate
pip install -r requirement.txt
python -m spacy download en_core_web_sm
```

### 2) Run backend

```bash
cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### 3) Run frontend

```bash
cd frontend
npm install
npm run dev -- --host 0.0.0.0
```

The frontend default API target is `http://localhost:8000`.

## Dataset

Training combines `dataset/edupulse_student_feedback_additional_1000_long.csv` and `dataset/edupulse_student_feedback_500_long.csv`. The latter is first held out as an independent validation set for model selection; the selected model is then retrained on all 1,500 rows.

## Model strategy

- TF-IDF vectorizer with unigrams and bigrams
- deterministic preprocessing and split seed
- model comparison for Naive Bayes, Logistic Regression, and Linear SVM on the independent validation dataset
- evaluation saved to `backend/artifacts/evaluation_report.json`

## API endpoints

- `GET /api/health`
- `GET /api/model-info`
- `GET /api/model-metrics`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/departments` (authenticated; departments available for analytics filters)
- `GET /api/feedback/analytics` (authenticated; accepts optional `start_date`, `end_date`, `category`, `source`, and `department` filters)
- `GET /api/feedback/report.csv` (authenticated; same filters; includes feedback text)
- `GET /api/feedback` (authenticated; supports `category`, `status`, `q`, `limit`, and `offset`)
- `PATCH /api/feedback/{feedback_id}/review` (authenticated)
- `PATCH /api/feedback/{feedback_id}/assignment` (assign a pending review to yourself and set an optional due date)
- `PATCH /api/feedback/{feedback_id}/notes` and `GET /api/feedback/{feedback_id}/activity` (authenticated)
- `GET /api/notifications` and `PATCH /api/notifications/{notification_id}/read` (authenticated)
- `GET /api/audit-events` (authenticated; action metadata only)
- `POST /api/surveys` and `GET /api/surveys` (authenticated campaign management)
- `GET /api/public/surveys/{public_id}` and `POST /api/public/feedback` (public survey details/submission)
- `POST /api/predict`
- `POST /api/batch-classify`

Dashboard totals and category/activity charts are calculated from saved predictions and survey submissions. Campaign limits and closing dates are checked at submission time, and each campaign response requires consent. Feedback text, linked survey submissions, assignments, and review activity are purged hourly by the running API and again at startup if they are older than 90 days. Audit events exclude feedback text and are retained separately. CSV reports contain feedback text and must be handled under the institution's privacy policy. Model evaluation scores remain based on the held-out training dataset and are presented separately from live campus feedback analytics.

New workflow tables and additive survey columns are created or upgraded automatically on API startup; existing feedback and user tables are not dropped or rebuilt.

## Academic notes

This project follows a classical ML approach without transformer or external LLM APIs. It is designed for educational deployment, demonstrable model evaluation, and institutional analytics, while not claiming real-world deployment performance beyond the available labeled dataset.

## Validation

Run:

```bash
cd backend
python -m pytest tests -q
```

Then build the frontend:

```bash
cd frontend
npm run build
```
