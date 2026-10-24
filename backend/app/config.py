from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = Path(__file__).resolve().parents[1]
DATASET_PATH = PROJECT_ROOT / 'dataset' / 'edupulse_student_feedback_additional_1000_long.csv'
DATASET_PATHS = (
    DATASET_PATH,
    PROJECT_ROOT / 'dataset' / 'edupulse_student_feedback_500_long.csv',
)
ARTIFACT_DIR = BACKEND_DIR / 'artifacts'
MODEL_PATH = ARTIFACT_DIR / 'model_bundle.joblib'
METRICS_PATH = ARTIFACT_DIR / 'evaluation_report.json'

CATEGORY_ORDER = [
    'Teaching Quality',
    'Course Content',
    'Infrastructure',
    'Laboratory',
    'Examination',
    'Placement',
    'Hostel',
    'Administration',
    'Positive Feedback',
    'Negative Feedback',
    'Suggestions',
]

DEFAULT_REVIEW_THRESHOLD = 0.55
