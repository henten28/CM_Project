from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field

import auth

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=40)
    password: str = Field(min_length=1, max_length=200)


@router.post("/login")
def login(body: LoginRequest):
    result = auth.login(body.username, body.password)
    if result is None:
        raise HTTPException(status_code=401, detail="wrong username or password")
    token, user = result
    # the Next.js server keeps the token in an httpOnly cookie; browser code never sees it
    return {"token": token, "user": user}


@router.post("/logout")
def logout(authorization: Optional[str] = Header(default=None)):
    token = auth._bearer(authorization)
    if token:
        auth.logout(token)
    return {"ok": True}


@router.get("/me")
def me(user: auth.User = Depends(auth.current_user)):
    return user
