from __future__ import annotations

from pathlib import Path
from typing import Dict

import pandas as pd

from app.config import CATEGORY_ORDER, DATASET_PATH


def load_dataset(path: str | Path = DATASET_PATH) -> pd.DataFrame:
    df = pd.read_csv(path)
    if 'feedback' not in df.columns and 'text' in df.columns:
        df = df.rename(columns={'text': 'feedback'})
    if 'category' not in df.columns:
        raise ValueError('Dataset must include a category column.')
    df = df[['feedback', 'category']].copy()
    df['feedback'] = df['feedback'].fillna('').astype(str)
    df['category'] = df['category'].fillna('').astype(str).str.strip()
    return df
def validate_dataset(df: pd.DataFrame) -> Dict[str, object]:
    result = {
        'total_rows': int(len(df)),
        'empty_feedback_count': int((df['feedback'].str.strip() == '').sum()),
        'missing_label_count': int((df['category'].str.strip() == '').sum()),
        'invalid_categories': sorted(set(df['category']) - set(CATEGORY_ORDER)),
        'duplicate_row_count': int(df.duplicated(subset=['feedback', 'category']).sum()),
        'duplicate_feedback_count': int(df.duplicated(subset=['feedback']).sum()),
        'class_distribution': df['category'].value_counts().to_dict(),
    }
    return result


def dataset_summary(path: str | Path = DATASET_PATH) -> Dict[str, object]:
    df = load_dataset(path)
    validation = validate_dataset(df)
    return {
        'dataset_path': str(path),
        'rows': int(len(df)),
        'valid_categories': sorted(df['category'].unique()),
        'class_distribution': validation['class_distribution'],
        'empty_feedback_count': validation['empty_feedback_count'],
        'missing_label_count': validation['missing_label_count'],
        'duplicate_feedback_count': validation['duplicate_feedback_count'],
        'invalid_categories': validation['invalid_categories'],
        'class_imbalance': {
            key: round(value / max(len(df), 1), 4) for key, value in validation['class_distribution'].items()
        },
    }
