from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_wrong_password_returns_401():
    response = client.post("/auth/login", json={
        "email": "admin@test.com",
        "password": "wrongpassword"
    })
    assert response.status_code == 401

def test_correct_admin_credentials_return_token():
    response = client.post("/auth/login", json={
        "email": "admin@test.com",
        "password": "test123"
    })
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["role"] == "ADMIN"

def test_correct_instructor_credentials_return_token():
    response = client.post("/auth/login", json={
        "email": "instructor@test.com",
        "password": "test123"
    })
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["role"] == "INSTRUCTOR"

def test_wrong_email_returns_404():
    response = client.post("/auth/login", json={
        "email": "notexist@test.com",
        "password": "test123"
    })
    assert response.status_code == 404