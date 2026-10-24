from app.preprocessing import preprocess_text


def test_preprocess_preserves_negation():
    text = 'The facilities are not good and never reliable.'
    result = preprocess_text(text)
    assert 'not' in result
    assert 'never' in result


def test_preprocess_handles_empty_values():
    assert preprocess_text('') == ''
    assert preprocess_text('!!!') == ''


def test_preprocess_removes_urls_and_html():
    text = 'Visit <b>http://example.com</b> and do not ignore this.'
    result = preprocess_text(text)
    assert 'http' not in result
    assert 'ignore' in result
    assert 'not' in result
