"""
Promote an existing user to superuser (or create one if they don't exist).

Usage (from inside the backend container or with venv active):
  python create_superuser.py <email> <password>

Example:
  python create_superuser.py kieran.fitzgerald@eascadesk.ie mypassword123
"""
import asyncio
import sys

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.core.security import hash_password
from app.models.user import User


async def main(email: str, password: str) -> None:
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()

        if user:
            user.is_superuser = True
            user.hashed_password = hash_password(password)
            await db.commit()
            print(f"Updated existing user '{user.username}' ({email}) → is_superuser=True")
        else:
            import uuid
            new_user = User(
                id=str(uuid.uuid4()),
                email=email,
                username=email.split("@")[0],
                hashed_password=hash_password(password),
                is_active=True,
                is_superuser=True,
                plan="free",
            )
            db.add(new_user)
            await db.commit()
            print(f"Created superuser '{new_user.username}' ({email})")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python create_superuser.py <email> <password>")
        sys.exit(1)
    asyncio.run(main(sys.argv[1], sys.argv[2]))
