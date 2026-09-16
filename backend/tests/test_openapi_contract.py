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


def test_openapi_includes_strict_workout_program_contract() -> None:
    schema = app.openapi()
    paths = schema["paths"]
    workspace_path = "/api/v1/coach/clients/{client_id}/workout-program"
    draft_path = f"{workspace_path}/draft"
    publish_path = f"{workspace_path}/publish"

    assert "get" in paths[workspace_path]
    assert paths[draft_path]["put"]["requestBody"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/WorkoutProgramSnapshot"
    }
    assert paths[publish_path]["post"]["requestBody"]["content"]["application/json"][
        "schema"
    ] == {"$ref": "#/components/schemas/WorkoutProgramPublishRequest"}
    assert paths[workspace_path]["get"]["responses"]["200"]["content"]["application/json"][
        "schema"
    ] == {"$ref": "#/components/schemas/WorkoutProgramWorkspaceResponse"}
    assert paths[draft_path]["put"]["responses"]["200"]["content"]["application/json"][
        "schema"
    ] == {"$ref": "#/components/schemas/WorkoutProgramResponse"}
    assert paths[publish_path]["post"]["responses"]["200"]["content"]["application/json"][
        "schema"
    ] == {"$ref": "#/components/schemas/WorkoutProgramPublishResponse"}
