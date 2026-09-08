from app.main import app


def test_public_openapi_does_not_treat_runtime_settings_as_request_data() -> None:
    """Settings must be injected, never documented or accepted as a request body."""

    schema = app.openapi()
    onboarding_schema = schema["paths"]["/api/v1/coach/clients"]["post"]["requestBody"][
        "content"
    ]["application/json"]["schema"]
    guidance_schema = schema["paths"]["/api/v1/coach/clients/{client_id}/coaching-context"][
        "patch"
    ]["requestBody"]["content"]["application/json"]["schema"]

    assert onboarding_schema == {"$ref": "#/components/schemas/ClientOnboardingCreate"}
    assert guidance_schema == {"$ref": "#/components/schemas/ClientCoachingContextUpdate"}
    assert "Settings" not in schema["components"]["schemas"]
