from datetime import datetime, timedelta, timezone
from uuid import uuid4


def test_health(client):
    response = client.get('/api/health')
    assert response.status_code == 200
    assert response.json()['status'] == 'ok'


def test_predict(client):
    payload = {'feedback': 'The laboratory computers are slow and the Wi-Fi is very unreliable.'}
    response = client.post('/api/predict', json=payload)
    assert response.status_code == 200
    data = response.json()
    assert 'predicted_category' in data
    assert 'confidence' in data


def test_batch_classification_preserves_existing_response(client):
    response = client.post(
        '/api/batch-classify',
        files={'file': ('feedback.csv', b'feedback\nThe library needs longer opening hours.\n', 'text/csv')},
    )

    assert response.status_code == 200
    data = response.json()
    assert data['total_rows'] == 1
    assert data['results'][0]['original_feedback'] == 'The library needs longer opening hours.'
    assert data['results'][0]['predicted_category']


def test_prediction_is_saved_and_available_in_authenticated_analytics(client):
    suffix = uuid4().hex
    registration = client.post(
        '/api/auth/register',
        json={
            'college_id': f'TEST-{suffix}',
            'full_name': 'Analytics Test',
            'email': f'analytics-{suffix}@example.test',
            'password': 'test-password',
            'role': 'faculty',
            'department': 'Testing',
        },
    )
    assert registration.status_code == 200
    headers = {'Authorization': f"Bearer {registration.json()['access_token']}"}
    feedback = f'Test feedback record {suffix}: the campus library needs longer opening hours.'

    prediction = client.post('/api/predict', json={'feedback': feedback}, headers=headers)
    assert prediction.status_code == 200

    analytics = client.get('/api/feedback/analytics', headers=headers)
    assert analytics.status_code == 200
    data = analytics.json()
    assert data['total_feedback'] >= 1
    assert any(item['feedback'] == feedback for item in data['recent_feedback'])

    listed = client.get('/api/feedback', params={'q': suffix}, headers=headers)
    assert listed.status_code == 200
    assert listed.json()['total'] == 1


def test_public_feedback_can_be_reviewed(client, monkeypatch):
    from app import main

    monkeypatch.setattr(
        main,
        'infer_single_feedback',
        lambda bundle, text: {
            'predicted_category': 'Suggestions',
            'confidence': 0.2,
            'alternatives': [],
            'influential_features': [],
            'recommendation': 'Review the suggestion.',
            'human_review': True,
        },
    )
    feedback = f'Public survey response {uuid4().hex}'
    submission = client.post('/api/public/feedback', json={'feedback': feedback})
    assert submission.status_code == 200

    suffix = uuid4().hex
    registration = client.post(
        '/api/auth/register',
        json={
            'college_id': f'REVIEW-{suffix}',
            'full_name': 'Review Test',
            'email': f'review-{suffix}@example.test',
            'password': 'test-password',
        },
    )
    headers = {'Authorization': f"Bearer {registration.json()['access_token']}"}
    items = client.get('/api/feedback', params={'q': feedback}, headers=headers).json()['items']
    assert len(items) == 1
    assert items[0]['review_status'] == 'pending'

    update = client.patch(
        f"/api/feedback/{items[0]['id']}/review",
        json={'status': 'resolved', 'notes': 'Reviewed by staff.'},
        headers=headers,
    )
    assert update.status_code == 200
    assert update.json()['review_status'] == 'resolved'


def create_test_account(client, prefix='feature'):
    suffix = uuid4().hex
    registration = client.post(
        '/api/auth/register',
        json={
            'college_id': f'{prefix.upper()}-{suffix}',
            'full_name': 'Feature Test',
            'email': f'{prefix}-{suffix}@example.test',
            'password': 'test-password',
            'department': 'Testing',
        },
    )
    assert registration.status_code == 200
    return {'Authorization': 'Bearer ' + registration.json()['access_token']}


def test_review_assignment_notifications_and_audit(client, monkeypatch):
    from app import main

    monkeypatch.setattr(
        main,
        'infer_single_feedback',
        lambda bundle, text: {
            'predicted_category': 'Suggestions',
            'confidence': 0.2,
            'alternatives': [],
            'influential_features': [],
            'recommendation': 'Review the suggestion.',
            'human_review': True,
        },
    )
    headers = create_test_account(client)
    feedback_text = f'Needs review {uuid4().hex}'
    response = client.post('/api/public/feedback', json={'feedback': feedback_text})
    assert response.status_code == 200

    item = client.get('/api/feedback', params={'q': feedback_text}, headers=headers).json()['items'][0]
    assignment = client.patch(
        f"/api/feedback/{item['id']}/assignment",
        json={'due_at': (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()},
        headers=headers,
    )
    assert assignment.status_code == 200
    assert assignment.json()['assigned_to'] == 'Feature Test'

    notifications = client.get('/api/notifications', headers=headers)
    assert notifications.status_code == 200
    assert notifications.json()['unread_count'] >= 1
    notification_id = notifications.json()['items'][0]['id']
    assert client.patch(f'/api/notifications/{notification_id}/read', headers=headers).json()['is_read'] is True

    review = client.patch(
        f"/api/feedback/{item['id']}/review",
        json={'status': 'resolved', 'notes': 'Follow-up completed.'},
        headers=headers,
    )
    assert review.status_code == 200
    activity = client.get(f"/api/feedback/{item['id']}/activity", headers=headers)
    assert activity.status_code == 200
    assert any(event['action'] == 'status_changed' for event in activity.json())
    audit = client.get('/api/audit-events', headers=headers)
    assert audit.status_code == 200
    assert any(event['action'] == 'feedback.review_updated' for event in audit.json())


def test_survey_consent_response_limit_and_reporting(client):
    headers = create_test_account(client, 'survey')
    closes_at = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
    created = client.post(
        '/api/surveys',
        json={
            'title': 'Facilities pulse',
            'prompt': 'How can campus facilities improve?',
            'template': 'facilities',
            'max_responses': 1,
            'closes_at': closes_at,
        },
        headers=headers,
    )
    assert created.status_code == 200
    survey_id = created.json()['id']
    assert created.json()['status'] == 'open'

    public_details = client.get(f'/api/public/surveys/{survey_id}')
    assert public_details.status_code == 200
    assert public_details.json()['response_count'] == 0

    submission = {'feedback': 'The campus needs more shaded seating.', 'survey_id': survey_id}
    assert client.post('/api/public/feedback', json=submission).status_code == 422
    submission['consent'] = True
    assert client.post('/api/public/feedback', json=submission).status_code == 200
    assert client.post('/api/public/feedback', json=submission).status_code == 409
    assert client.get(f'/api/public/surveys/{survey_id}').json()['status'] == 'closed'

    report = client.get('/api/feedback/report.csv', params={'source': 'survey'}, headers=headers)
    assert report.status_code == 200
    assert 'text/csv' in report.headers['content-type']
    assert 'The campus needs more shaded seating.' in report.text
    filtered = client.get(
        '/api/feedback/analytics',
        params={
            'start_date': datetime.now(timezone.utc).date().isoformat(),
            'end_date': datetime.now(timezone.utc).date().isoformat(),
            'source': 'survey',
            'department': 'Testing',
        },
        headers=headers,
    )
    assert filtered.status_code == 200
    assert filtered.json()['total_feedback'] == 1


def test_retention_cleanup_removes_feedback_and_review_metadata():
    from sqlalchemy import create_engine
    from sqlalchemy.orm import Session

    from app import main
    from app.database import Base
    from app.db_models import AuditEvent, FeedbackRecord, SurveyCampaign, SurveySubmission

    test_engine = create_engine('sqlite://')
    Base.metadata.create_all(test_engine)
    with Session(test_engine) as db:
        record = FeedbackRecord(
            feedback='Expired student feedback',
            predicted_category='Suggestions',
            confidence=0.2,
            human_review=True,
            review_status='pending',
            source='survey',
            created_at=datetime.now() - timedelta(days=91),
        )
        db.add(record)
        db.commit()
        campaign = SurveyCampaign(
            public_id=str(uuid4()),
            title='Retention test',
            prompt='Share your campus feedback.',
            template='general',
            response_count=1,
        )
        db.add(campaign)
        db.flush()
        db.add(SurveySubmission(campaign_id=campaign.id, feedback_id=record.id, consent_given=True))
        db.commit()
        assert main.cleanup_expired_feedback(db) == 1
        assert db.query(FeedbackRecord).count() == 0
        assert db.query(SurveySubmission).count() == 0
        assert db.query(SurveyCampaign).one().response_count == 1
        assert db.query(AuditEvent).filter(AuditEvent.action == 'feedback.retention_purge').count() == 1
    test_engine.dispose()


def test_additive_schema_migration_preserves_existing_survey_data(monkeypatch):
    from sqlalchemy import create_engine, inspect, text

    from app import main

    migration_engine = create_engine('sqlite://')
    with migration_engine.begin() as connection:
        connection.execute(text(
            "CREATE TABLE survey_campaigns (id INTEGER PRIMARY KEY, public_id VARCHAR(36), title VARCHAR(200), "
            "prompt VARCHAR(500), template VARCHAR(50), max_responses INTEGER, closes_at TIMESTAMP, "
            "created_by INTEGER, created_at TIMESTAMP)"
        ))
        connection.execute(text(
            "CREATE TABLE survey_submissions (id INTEGER PRIMARY KEY, campaign_id INTEGER, "
            "feedback_id INTEGER, created_at TIMESTAMP)"
        ))
        connection.execute(text(
            "INSERT INTO survey_submissions (id, campaign_id, feedback_id, created_at) "
            "VALUES (1, 3, 7, '2026-01-01 00:00:00')"
        ))
    monkeypatch.setattr(main, 'engine', migration_engine)

    main.ensure_additive_schema()
    campaign_columns = {column['name'] for column in inspect(migration_engine).get_columns('survey_campaigns')}
    submission_columns = {column['name'] for column in inspect(migration_engine).get_columns('survey_submissions')}
    assert 'response_count' in campaign_columns
    assert {'consent_given', 'consented_at'} <= submission_columns
    with migration_engine.connect() as connection:
        row = connection.execute(text('SELECT consent_given, consented_at FROM survey_submissions WHERE id = 1')).one()
    assert row.consent_given in (True, 1)
    assert row.consented_at == '2026-01-01 00:00:00'
    migration_engine.dispose()
