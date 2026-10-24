from app.auth import hash_password, verify_password


def test_password_hash_can_be_verified():
    password = 'AValid-Test-Password-123!'
    password_hash = hash_password(password)

    assert password_hash != password
    assert verify_password(password, password_hash)
    assert not verify_password('wrong-password', password_hash)
