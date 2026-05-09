from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # This tells the class to look for the .env file in the parent folder
    model_config = {"env_file": ".env"}

# Create a single instance of settings to be imported elsewhere
settings = Settings()