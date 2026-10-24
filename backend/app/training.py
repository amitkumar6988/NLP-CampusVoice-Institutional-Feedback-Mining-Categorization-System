from __future__ import annotations

import json
from datetime import datetime, timezone

import joblib
import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, f1_score
from sklearn.model_selection import train_test_split
from sklearn.naive_bayes import MultinomialNB
from sklearn.pipeline import Pipeline
from sklearn.svm import LinearSVC

from app.config import ARTIFACT_DIR, CATEGORY_ORDER, DATASET_PATHS, METRICS_PATH, MODEL_PATH
from app.data_loader import load_dataset
from app.preprocessing import preprocess_text


def build_model_specs():
    return {
        'Naive Bayes': Pipeline([
            ('tfidf', TfidfVectorizer(ngram_range=(1, 2), min_df=2, max_df=0.95, sublinear_tf=True, strip_accents='unicode', lowercase=True)),
            ('classifier', MultinomialNB(alpha=0.4)),
        ]),
        'Logistic Regression': Pipeline([
            ('tfidf', TfidfVectorizer(ngram_range=(1, 2), min_df=2, max_df=0.95, sublinear_tf=True, strip_accents='unicode', lowercase=True)),
            ('classifier', LogisticRegression(max_iter=2000, class_weight='balanced')),
        ]),
        'Linear SVM': Pipeline([
            ('tfidf', TfidfVectorizer(ngram_range=(1, 2), min_df=2, max_df=0.95, sublinear_tf=True, strip_accents='unicode', lowercase=True)),
            ('classifier', LinearSVC(C=1.2, class_weight='balanced')),
        ]),
    }


def compute_metrics(y_true, y_pred, labels):
    report = classification_report(y_true, y_pred, labels=labels, output_dict=True, zero_division=0)
    acc = accuracy_score(y_true, y_pred)
    macro_f1 = f1_score(y_true, y_pred, labels=labels, average='macro', zero_division=0)
    weighted_f1 = f1_score(y_true, y_pred, labels=labels, average='weighted', zero_division=0)
    cm = confusion_matrix(y_true, y_pred, labels=labels)
    per_class = {}
    for idx, label in enumerate(labels):
        per_class[label] = {
            'precision': float(report[label]['precision']),
            'recall': float(report[label]['recall']),
            'f1': float(report[label]['f1-score']),
            'support': int(report[label]['support']),
        }
    return {
        'accuracy': float(acc),
        'macro_f1': float(macro_f1),
        'weighted_f1': float(weighted_f1),
        'confusion_matrix': cm.tolist(),
        'labels': labels,
        'per_class': per_class,
    }


def train_and_evaluate(force_retrain: bool = False):
    ARTIFACT_DIR.mkdir(exist_ok=True)
    if MODEL_PATH.exists() and not force_retrain:
        return joblib.load(MODEL_PATH)

    source_frames = [load_dataset(path) for path in DATASET_PATHS]
    df = pd.concat(source_frames, ignore_index=True)
    df = df.drop_duplicates(subset=['feedback']).copy()
    df['feedback'] = df['feedback'].apply(preprocess_text)
    df = df[df['feedback'].str.strip() != ''].copy()

    X = df['feedback']
    y = df['category']
    labels = CATEGORY_ORDER

    external_validation = {}
    if len(source_frames) > 1:
        development_df = pd.concat(source_frames[:-1], ignore_index=True).drop_duplicates(subset=['feedback'])
        validation_df = source_frames[-1].loc[
            ~source_frames[-1]['feedback'].isin(development_df['feedback'])
        ].copy()
        X_development = development_df['feedback'].map(preprocess_text)
        X_validation = validation_df['feedback'].map(preprocess_text)
        for name, model in build_model_specs().items():
            model.fit(X_development, development_df['category'])
            predictions = model.predict(X_validation)
            external_validation[name] = compute_metrics(
                validation_df['category'],
                predictions,
                labels,
            )

    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=0.2,
        random_state=42,
        stratify=y,
    )

    model_specs = build_model_specs()
    results = {}
    trained_models = {}
    for name, model in model_specs.items():
        model.fit(X_train, y_train)
        predictions = model.predict(X_test)
        results[name] = compute_metrics(y_test, predictions, labels)
        trained_models[name] = model

    selection_metrics = external_validation or results
    best_model_name = max(selection_metrics, key=lambda name: selection_metrics[name]['macro_f1'])
    best_model = trained_models[best_model_name]
    best_model.fit(X, y)
    evaluation_metrics = selection_metrics[best_model_name]
    source_dataset_fingerprints = {
        str(path.name): {
            'size': path.stat().st_size,
            'modified_ns': path.stat().st_mtime_ns,
        }
        for path in DATASET_PATHS
    }
    evaluation_report = {
        'dataset_path': ', '.join(path.name for path in DATASET_PATHS),
        'source_dataset_paths': [str(path) for path in DATASET_PATHS],
        'training_timestamp': datetime.now(timezone.utc).isoformat(),
        'class_order': labels,
        'train_size': int(len(development_df)) if external_validation else int(len(X_train)),
        'test_size': int(len(source_frames[-1])) if external_validation else int(len(X_test)),
        'final_training_rows': int(len(X)),
        'split_strategy': 'source_holdout_before_combined_training' if external_validation else 'stratified_80_20',
        'metrics': evaluation_metrics,
        'comparison': selection_metrics,
        'combined_split_comparison': results,
    }

    model_bundle = {
        'selected_model_name': best_model_name,
        'selected_model': best_model,
        'model_comparison': results,
        'metadata': {
            'dataset_path': ', '.join(path.name for path in DATASET_PATHS),
            'dataset_fingerprints': source_dataset_fingerprints,
            'model_version': 'v2.0.0',
            'training_timestamp': evaluation_report['training_timestamp'],
            'class_order': labels,
            'review_threshold': 0.55,
            'selected_model_name': best_model_name,
            'dataset_version': f'combined_{len(X)}_rows',
        },
        'metrics': evaluation_report,
    }

    joblib.dump(model_bundle, MODEL_PATH)
    with METRICS_PATH.open('w', encoding='utf-8') as fh:
        json.dump(model_bundle['metrics'], fh, indent=2)

    return model_bundle


def load_model_bundle():
    if not MODEL_PATH.exists():
        return train_and_evaluate()
    bundle = joblib.load(MODEL_PATH)
    if 'selected_model' not in bundle:
        return train_and_evaluate(force_retrain=True)
    metadata = bundle.get('metadata', {})
    if metadata.get('dataset_fingerprints') != {
        str(path.name): {
            'size': path.stat().st_size,
            'modified_ns': path.stat().st_mtime_ns,
        }
        for path in DATASET_PATHS
    }:
        return train_and_evaluate(force_retrain=True)
    return bundle
