from pydantic import BaseModel, ConfigDict, Field, field_validator


class DirectPasswordSet(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=8, max_length=128)
    confirm_password: str = Field(min_length=8, max_length=128)

    @field_validator("email")
    @classmethod
    def email_looks_valid(cls, value: str) -> str:
        email = value.lower()
        local, separator, domain = email.partition("@")
        if separator != "@" or not local or "." not in domain or " " in email:
            raise ValueError("Enter a valid email address.")
        return email
